import sharp from 'sharp';
import { getDriveFileBuffer, getDriveFileMetadata } from './drive.js';
import {
  deleteMediaVariantsByCalendar,
  getMediaVariant,
  listFileIdsMissingVariant,
  listMediaVariantsByCalendar,
  upsertMediaVariant,
} from './db.js';
import { getSignedUrl, mediaVariantStoragePath, removeVariants, uploadVariant } from './supabaseStorage.js';

const PREGENERATE_CONCURRENCY = 4;

const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const VARIANT_SPECS = {
  thumb: { maxSize: 600, quality: 70 },
  preview: { maxSize: 1600, quality: 80 },
};

export function isVariantSupportedMimeType(mimeType) {
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType);
}

async function processImage(buffer, variant) {
  const spec = VARIANT_SPECS[variant];
  const image = sharp(buffer).rotate(); // aplica orientação EXIF antes do resize
  const resized = image.resize({ width: spec.maxSize, height: spec.maxSize, fit: 'inside', withoutEnlargement: true });
  const output = await resized.webp({ quality: spec.quality }).toBuffer({ resolveWithObject: true });
  return { buffer: output.data, width: output.info.width, height: output.info.height };
}

// Baixa o arquivo original, processa e sobe a variante para o Storage,
// registrando em media_variants. Reaproveitado tanto pela rota HTTP
// (serveOptimizedMedia) quanto pela pré-geração em background — quem chama
// já deve ter confirmado que modifiedTime não bate com o cache existente
// (ou que não há variante ainda).
async function generateAndStoreVariant({ fileId, calendarId, variant, modifiedTime }) {
  const originalBuffer = await getDriveFileBuffer(fileId);
  const { buffer, width, height } = await processImage(originalBuffer, variant);
  const storagePath = mediaVariantStoragePath(fileId, variant);

  await uploadVariant(storagePath, buffer, 'image/webp');
  await upsertMediaVariant({
    fileId,
    calendarId,
    variant,
    storagePath,
    mimeType: 'image/webp',
    width,
    height,
    sizeBytes: buffer.length,
    sourceModifiedTime: modifiedTime,
  });

  return { buffer, storagePath };
}

// Serve a variante otimizada (thumb/preview) de uma imagem, gerando na hora
// se ainda não existir ou se o arquivo original tiver mudado no Drive
// (modifiedTime divergente). Em cache hit, redireciona para uma signed URL
// do Supabase Storage; em cache miss, responde direto com os bytes
// processados e sobe pro Storage em segundo plano. Quem chamar já deve ter
// validado autorização (o mesmo padrão das rotas que usam streamDriveMedia).
export async function serveOptimizedMedia({ res, fileId, calendarId, variant, logLabel, fallback, logServerEvent }) {
  try {
    const metadata = await getDriveFileMetadata(fileId);
    if (!isVariantSupportedMimeType(metadata.mimeType)) {
      await fallback();
      return;
    }

    const modifiedTime = metadata.modifiedTime || null;
    const existing = await getMediaVariant(fileId, variant);

    if (existing && existing.sourceModifiedTime === modifiedTime) {
      const signedUrl = await getSignedUrl(existing.storagePath);
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.redirect(302, signedUrl);
      return;
    }

    const originalBuffer = await getDriveFileBuffer(fileId);
    const { buffer, width, height } = await processImage(originalBuffer, variant);
    const storagePath = mediaVariantStoragePath(fileId, variant);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).send(buffer);

    uploadVariant(storagePath, buffer, 'image/webp')
      .then(() =>
        upsertMediaVariant({
          fileId,
          calendarId,
          variant,
          storagePath,
          mimeType: 'image/webp',
          width,
          height,
          sizeBytes: buffer.length,
          sourceModifiedTime: modifiedTime,
        }),
      )
      .catch((error) => {
        logServerEvent(`${logLabel}: falha ao salvar variante otimizada`, { fileId, variant, error: error.message });
      });
  } catch (error) {
    logServerEvent(`${logLabel}: falha ao gerar variante otimizada, usando original`, {
      fileId,
      variant,
      error: error.message,
    });
    if (!res.headersSent) await fallback();
  }
}

// Roda um lote de tarefas assíncronas com concorrência limitada, sem
// depender de bibliotecas externas (ex: p-limit) — usado para não saturar a
// API do Drive nem a CPU do Node ao pré-gerar muitas variantes de uma vez.
async function runWithConcurrencyLimit(items, limit, worker) {
  let cursor = 0;
  async function runNext() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runNext));
}

// Pré-gera as variantes (thumb + preview) que ainda faltam para os arquivos
// de imagem informados, para que a primeira visita de um post já encontre
// cache hit. Best-effort: erros de um arquivo não interrompem os demais.
export async function pregenerateMissingVariants(imageFiles, logServerEvent) {
  if (!imageFiles || imageFiles.length === 0) return { generated: 0, skipped: 0 };

  const fileIdToCalendarId = new Map(imageFiles.map((f) => [f.fileId, f.calendarId]));
  const allFileIds = imageFiles.map((f) => f.fileId);

  const [missingThumb, missingPreview] = await Promise.all([
    listFileIdsMissingVariant(allFileIds, 'thumb'),
    listFileIdsMissingVariant(allFileIds, 'preview'),
  ]);

  const tasks = [
    ...missingThumb.map((fileId) => ({ fileId, variant: 'thumb' })),
    ...missingPreview.map((fileId) => ({ fileId, variant: 'preview' })),
  ];

  let generated = 0;
  await runWithConcurrencyLimit(tasks, PREGENERATE_CONCURRENCY, async ({ fileId, variant }) => {
    try {
      const metadata = await getDriveFileMetadata(fileId);
      if (!isVariantSupportedMimeType(metadata.mimeType)) return;

      await generateAndStoreVariant({
        fileId,
        calendarId: fileIdToCalendarId.get(fileId),
        variant,
        modifiedTime: metadata.modifiedTime || null,
      });
      generated += 1;
    } catch (error) {
      logServerEvent('Pré-geração de variante de mídia falhou', { fileId, variant, error: error.message });
    }
  });

  return { generated, skipped: tasks.length - generated };
}

// Apaga todas as variantes geradas para os posts de um calendário —
// chamado ao concluir o calendário (sai da fase "Em Andamento"), para que
// o storage não acumule indefinidamente: só calendários ativos mantêm
// variantes otimizadas geradas.
export async function cleanupCalendarMediaVariants(calendarId, logServerEvent) {
  try {
    const variants = await listMediaVariantsByCalendar(calendarId);
    if (variants.length === 0) return;
    await removeVariants(variants.map((v) => v.storagePath));
    await deleteMediaVariantsByCalendar(calendarId);
  } catch (error) {
    logServerEvent('Limpeza de variantes de mídia do calendário falhou', {
      calendarId,
      error: error.message,
    });
  }
}
