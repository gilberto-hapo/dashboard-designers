import { google } from 'googleapis';
import mammoth from 'mammoth';
import { Readable } from 'node:stream';

// 5 min, alinhado ao cache do Goalfy (GOALFY_CACHE_TTL_MS em server.js) — as
// pastas/arquivos de posts no Drive não mudam a cada poucos segundos, e o
// botão "Atualizar dados" já limpa esse cache explicitamente via
// clearDriveFolderCache() quando o usuário precisa refletir uma mudança
// recente sem esperar o TTL expirar.
const DRIVE_FOLDER_TTL_MS = 1000 * 60 * 5;
const cache = new Map();

// Limpa o cache de pastas de post do Drive — chamado quando o usuário força
// um refresh manual (botão "Atualizar dados"), para o link do cliente também
// refletir correções feitas no Drive sem precisar esperar o TTL expirar.
export function clearDriveFolderCache() {
  cache.clear();
}

function parseServiceAccountJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    // Alguns paineis de hospedagem nao preservam bem aspas/quebras de linha em
    // variaveis de ambiente coladas manualmente; aceitar Base64 evita esse problema.
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch (base64Error) {
      return null;
    }
  }
}

function getAuth() {
  const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (credentialsJson) {
    const credentials = parseServiceAccountJson(credentialsJson);
    if (!credentials) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON (nem em texto puro, nem em Base64)');
    }
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyFile) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_SERVICE_ACCOUNT_KEY_FILE must be configured');
  }
  return new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

let authClient = null;
function getCachedAuth() {
  if (!authClient) {
    authClient = getAuth();
  }
  return authClient;
}

// Timeout aplicado a toda chamada à API do Drive — sem isso, uma falha de
// rede parcial (não um erro claro, apenas silêncio) deixa a Promise nunca
// resolver, travando a tela em "Carregando..." indefinidamente.
const DRIVE_REQUEST_TIMEOUT_MS = 20000;

let driveClient = null;
function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: 'v3', auth: getCachedAuth(), timeout: DRIVE_REQUEST_TIMEOUT_MS });
  }
  return driveClient;
}

export function extractFolderIdFromDriveLink(link) {
  const match = String(link || '').match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

async function listChildren(folderId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, modifiedTime)',
    orderBy: 'name',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    pageSize: 200,
  });
  return res.data.files || [];
}

function isImage(mimeType) {
  return mimeType.startsWith('image/');
}

function isVideo(mimeType) {
  return mimeType.startsWith('video/');
}

function isCaptionDoc(mimeType) {
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.google-apps.document'
  );
}

// mammoth.extractRawText gera uma linha por parágrafo do docx, inclusive
// parágrafos vazios (espaçamento visual entre blocos no Word) — sem isso o
// texto renderizado (com whitespace-pre-wrap) fica com espaçamento excessivo
// entre linhas que no documento original eram só uma quebra simples.
function normalizeCaptionWhitespace(text) {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Aceita tanto "Legenda:" quanto variações como "LEGENDA EXCLUSIVA
// INSTAGRAM" — o marcador é a palavra "legenda" em uma linha própria,
// cortando tudo a partir do fim dessa linha (ignora o resto do texto nela,
// ex.: "EXCLUSIVA INSTAGRAM" ou ":"). Usa a ÚLTIMA ocorrência, não a
// primeira: documentos com instruções administrativas no topo (ex.: "Tema a
// ser trabalhado na legenda:") também contêm a palavra "legenda" antes do
// marcador real, e pegar a primeira ocorrência incluiria essas instruções
// dentro da legenda extraída.
//
// Documentos sem nenhum marcador de legenda (ex.: posts de story com só um
// aviso/instrução, sem legenda de fato) não têm legenda nenhuma para
// publicar — retorna null em vez de cair no texto inteiro do documento
// (que são só instruções internas, não conteúdo para o cliente ver).
function extractCaptionSection(rawText) {
  const marker = /^.*\blegenda\b.*$/gim;
  const matches = [...rawText.matchAll(marker)];
  const lastMatch = matches[matches.length - 1];
  if (!lastMatch) return null;

  const section = rawText.slice(lastMatch.index + lastMatch[0].length);
  return normalizeCaptionWhitespace(section);
}

// Cache de legenda por arquivo, chaveado por modifiedTime — evita rebaixar
// e reprocessar (mammoth ou export do Google Docs) o mesmo documento toda
// vez que o cache de listagem de pastas expira, já que a legenda de um post
// raramente muda depois de escrita.
const captionCache = new Map();

async function extractCaptionFromDocx(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  );
  const buffer = Buffer.from(res.data);
  const result = await mammoth.extractRawText({ buffer });
  return extractCaptionSection(result.value);
}

async function extractCaptionFromGoogleDoc(fileId) {
  const drive = getDrive();
  const res = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' },
  );
  return extractCaptionSection(String(res.data || ''));
}

async function extractCaptionCached(captionFile) {
  const cached = captionCache.get(captionFile.id);
  if (cached && cached.modifiedTime === captionFile.modifiedTime) {
    return cached.caption;
  }

  const caption =
    captionFile.mimeType === 'application/vnd.google-apps.document'
      ? await extractCaptionFromGoogleDoc(captionFile.id)
      : await extractCaptionFromDocx(captionFile.id);

  captionCache.set(captionFile.id, { modifiedTime: captionFile.modifiedTime, caption });
  return caption;
}

// Resolve o conteúdo (mídia + legenda) de uma subpasta de post. Quando há
// mais de uma subpasta candidata com o mesmo prefixo (pastas duplicadas de
// rascunho no Drive), usa a que tiver mídia de fato — a vazia é ignorada.
async function resolvePostFolderContent(folder) {
  const children = await listChildren(folder.id);
  const mediaFiles = children.filter((f) => isImage(f.mimeType) || isVideo(f.mimeType));
  const captionFile = children.find((f) => isCaptionDoc(f.mimeType));

  let caption = null;
  if (captionFile) {
    try {
      caption = await extractCaptionCached(captionFile);
    } catch (error) {
      caption = null;
    }
  }

  const video = mediaFiles.find((f) => isVideo(f.mimeType));
  const images = mediaFiles
    .filter((f) => isImage(f.mimeType))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  // Com só uma imagem na pasta do vídeo, ela é a capa mesmo sem "capa" no
  // nome — evita depender do designer lembrar de nomear certo. Com mais de
  // uma imagem, o nome ainda é necessário para saber qual delas é a capa.
  const coverImage = images.length === 1 ? images[0] : images.find((f) => /capa/i.test(f.name)) || null;

  return {
    folderId: folder.id,
    folderName: folder.name,
    hasMedia: mediaFiles.length > 0,
    caption,
    media: video
      ? {
          type: 'video',
          files: [{ id: video.id, mimeType: video.mimeType }],
          coverImageId: coverImage?.id || null,
        }
      : { type: 'image', files: images.map((f) => ({ id: f.id, mimeType: f.mimeType })) },
  };
}

// Limita quantas chamadas concorrentes à API do Drive um único calendário
// pode disparar de uma vez — sem isso, um calendário com muitos posts
// dispara dezenas de chamadas simultâneas pela mesma service account,
// acionando rate-limit/backoff do Google que atrasa a resposta em segundos
// de forma silenciosa (sem erro visível). Mesmo padrão usado para o fan-out
// de cards da Goalfy em server.js (lá com limite 8).
async function mapWithConcurrency(items, limit, mapFn) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapFn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Lista as subpastas de post dentro da pasta de artes do calendário, em
// ordem (Post 01, Post 02, ...), resolvendo duplicatas ao preferir a
// subpasta com mídia de fato quando o mesmo nome aparece mais de uma vez.
export async function listCalendarPostFolders(calendarFolderLink, { forceRefresh = false } = {}) {
  const folderId = extractFolderIdFromDriveLink(calendarFolderLink);
  if (!folderId) return [];

  const cacheKey = folderId;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.at < DRIVE_FOLDER_TTL_MS) {
    return cached.value;
  }

  const children = await listChildren(folderId);
  const subfolders = children.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');

  const contents = await mapWithConcurrency(subfolders, 6, (folder) => resolvePostFolderContent(folder));

  const resolvedByName = new Map();
  subfolders.forEach((folder, index) => {
    const content = contents[index];
    const existing = resolvedByName.get(folder.name);
    if (!existing || (!existing.hasMedia && content.hasMedia)) {
      resolvedByName.set(folder.name, content);
    }
  });

  const result = [...resolvedByName.values()].sort((a, b) =>
    a.folderName.localeCompare(b.folderName, 'pt-BR', { numeric: true }),
  );

  cache.set(cacheKey, { value: result, at: Date.now() });
  return result;
}

// Usa fetch direto (em vez de drive.files.get com responseType: 'stream')
// porque o cliente googleapis/gaxios não expõe de forma confiável o status
// e os headers (Content-Range, Content-Length) da resposta em modo stream —
// e são justamente esses headers que o navegador precisa para fazer seek em
// vídeos grandes sem baixar o arquivo inteiro.
export async function getDriveFileStream(fileId, { range } = {}) {
  const accessToken = await getCachedAuth().getAccessToken();
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(range ? { Range: range } : {}),
    },
  });

  if (!response.ok && response.status !== 206) {
    throw new Error(`Drive media request failed with status ${response.status}`);
  }

  return {
    stream: Readable.fromWeb(response.body),
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

export async function getDriveFileMetadata(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, modifiedTime',
    supportsAllDrives: true,
  });
  return res.data;
}

// Baixa o arquivo completo em memória (sem range) -- usado só para gerar
// variantes otimizadas de imagem, onde é preciso o buffer inteiro para
// processar com sharp (diferente de getDriveFileStream, que faz proxy
// incremental para o navegador sem bufferizar).
export async function getDriveFileBuffer(fileId) {
  const { stream } = await getDriveFileStream(fileId);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
