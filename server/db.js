import pg from 'pg';

const { Pool } = pg;

// Persistência de decisões de clientes (aprovação/ajuste em posts) em Postgres
// gerenciado (Supabase) — precisa sobreviver a deploys que refazem o checkout
// do app do zero (a pasta local data/ nunca é versionada e se perde a cada
// deploy). Migrado de MySQL/Hostinger porque o plano da Hostinger tem um
// limite baixo de conexões/hora (500) que estourava com o tráfego normal do
// app; o Supabase usa o Supavisor (transaction pooler) para esse padrão de
// uso (conexões breves e frequentes).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Sem timeout, uma conexão/query presa (ex: instabilidade de rede até o
  // Supavisor) travaria a Promise indefinidamente, prendendo o payload
  // inteiro de /detail ou /portal/:token em "Carregando...".
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});

// Lazy: as tabelas só são criadas na primeira chamada real, nunca no import
// do módulo — uma falha de conexão aqui não pode derrubar o boot do server
// inteiro (ex: instabilidade momentânea de rede até o banco gerenciado).
let schemaReadyPromise = null;
function ensureSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS post_decisions (
          id SERIAL PRIMARY KEY,
          post_id VARCHAR(255) NOT NULL,
          calendar_id VARCHAR(255) NOT NULL,
          approved BOOLEAN NOT NULL,
          feedback TEXT,
          media_file_id VARCHAR(255),
          pin_x DOUBLE PRECISION,
          pin_y DOUBLE PRECISION,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          goalfy_sync_status VARCHAR(32) NOT NULL DEFAULT 'pending',
          goalfy_sync_error TEXT
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_post_decisions_post_id ON post_decisions (post_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_post_decisions_calendar_id ON post_decisions (calendar_id)`);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS post_adjustment_resolutions (
          post_id VARCHAR(255) PRIMARY KEY,
          resolved_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Variantes otimizadas (thumb/preview) de imagens do Drive, geradas sob
      // demanda e guardadas no Supabase Storage. Existem só enquanto o
      // calendário correspondente está "Em Andamento" -- ver
      // deleteMediaVariantsByCalendar, chamada ao concluir o calendário, para
      // manter o uso de storage limitado ao volume de trabalho ativo.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS media_variants (
          id SERIAL PRIMARY KEY,
          file_id VARCHAR(255) NOT NULL,
          calendar_id VARCHAR(255) NOT NULL,
          variant VARCHAR(16) NOT NULL,
          storage_path VARCHAR(512) NOT NULL,
          mime_type VARCHAR(64) NOT NULL,
          width INTEGER,
          height INTEGER,
          size_bytes INTEGER,
          source_modified_time TIMESTAMPTZ,
          generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (file_id, variant)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_media_variants_file_id ON media_variants (file_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_media_variants_calendar_id ON media_variants (calendar_id)`);

      // Copy sugerida pela IA para um item do calendário editorial (aba
      // "Calendário Editorial") — item_key é o "oQue" da planilha (ex:
      // "POST 1"), único dentro de um calendário. Guarda só a última
      // sugestão por item (o designer pode gerar de novo e sobrescrever).
      await pool.query(`
        CREATE TABLE IF NOT EXISTS editorial_copy_suggestions (
          calendar_id VARCHAR(255) NOT NULL,
          item_key VARCHAR(255) NOT NULL,
          copy TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (calendar_id, item_key)
        )
      `);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }
  return schemaReadyPromise;
}

function toIsoString(value) {
  if (!value) return value;
  return value instanceof Date ? value.toISOString() : value;
}

function rowToDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    calendarId: row.calendar_id,
    approved: Boolean(row.approved),
    feedback: row.feedback,
    mediaFileId: row.media_file_id,
    x: row.pin_x,
    y: row.pin_y,
    createdAt: toIsoString(row.created_at),
    goalfySyncStatus: row.goalfy_sync_status,
    goalfySyncError: row.goalfy_sync_error,
  };
}

export async function insertPostDecision({ postId, calendarId, approved, feedback, mediaFileId, x, y }) {
  await ensureSchema();
  const { rows } = await pool.query(
    `INSERT INTO post_decisions (post_id, calendar_id, approved, feedback, media_file_id, pin_x, pin_y, goalfy_sync_status, goalfy_sync_error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [postId, calendarId, Boolean(approved), feedback ?? null, mediaFileId ?? null, x ?? null, y ?? null, 'pending', null],
  );
  return rows[0].id;
}

export async function markDecisionSyncStatus(decisionId, status, error = null) {
  await ensureSchema();
  await pool.query(`UPDATE post_decisions SET goalfy_sync_status = $1, goalfy_sync_error = $2 WHERE id = $3`, [
    status,
    error,
    decisionId,
  ]);
}

export async function getLatestDecisionsForCalendar(calendarId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT pd.*
     FROM post_decisions pd
     INNER JOIN (
       SELECT post_id, MAX(id) AS max_id
       FROM post_decisions
       WHERE calendar_id = $1
       GROUP BY post_id
     ) latest ON latest.post_id = pd.post_id AND latest.max_id = pd.id
     ORDER BY pd.created_at DESC`,
    [calendarId],
  );
  return rows.map(rowToDecision);
}

// Mesma consulta de getLatestDecisionsForCalendar, mas para vários
// calendários numa única ida ao banco — usado por /api/feedback, que
// precisava de N queries (uma por calendário) para descobrir quais têm
// algum ajuste pendente, tornando a primeira carga da tela lenta com muitos
// calendários. Retorna um Map<calendarId, decisions[]> para lookup O(1).
export async function getLatestDecisionsForCalendars(calendarIds) {
  await ensureSchema();
  if (!calendarIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT pd.*
     FROM post_decisions pd
     INNER JOIN (
       SELECT post_id, MAX(id) AS max_id
       FROM post_decisions
       WHERE calendar_id = ANY($1)
       GROUP BY post_id
     ) latest ON latest.post_id = pd.post_id AND latest.max_id = pd.id
     ORDER BY pd.created_at DESC`,
    [calendarIds],
  );
  const decisionsByCalendarId = new Map();
  rows.forEach((row) => {
    const decision = rowToDecision(row);
    const list = decisionsByCalendarId.get(decision.calendarId) || [];
    list.push(decision);
    decisionsByCalendarId.set(decision.calendarId, list);
  });
  return decisionsByCalendarId;
}

export async function deletePostDecision(decisionId, postId) {
  await ensureSchema();
  const { rowCount } = await pool.query(`DELETE FROM post_decisions WHERE id = $1 AND post_id = $2`, [
    decisionId,
    postId,
  ]);
  return rowCount > 0;
}

export async function getDecisionHistoryForPost(postId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM post_decisions WHERE post_id = $1 ORDER BY created_at DESC`, [
    postId,
  ]);
  return rows.map(rowToDecision);
}

// Mesma consulta de getDecisionHistoryForPost, mas para varios posts numa
// unica ida ao banco — usado por resolveCalendarPosts, que precisava de 2
// queries por post (2N no total) para montar o detalhe de um calendario,
// deixando a tela lenta para calendarios com muitos posts. Retorna um
// Map<postId, decisions[]> para lookup O(1).
export async function getDecisionHistoryForPosts(postIds) {
  await ensureSchema();
  if (!postIds.length) return new Map();
  const { rows } = await pool.query(
    `SELECT * FROM post_decisions WHERE post_id = ANY($1) ORDER BY created_at DESC`,
    [postIds],
  );
  const decisionsByPostId = new Map();
  rows.forEach((row) => {
    const decision = rowToDecision(row);
    const list = decisionsByPostId.get(decision.postId) || [];
    list.push(decision);
    decisionsByPostId.set(decision.postId, list);
  });
  return decisionsByPostId;
}

// Histórico geral do cliente para contexto de geração de copy: últimos
// posts aprovados (referência de tom/estilo já validado) e últimos
// feedbacks de ajuste (para a IA evitar repetir problemas já apontados).
// post_decisions não tem client_id — recebe a lista de calendar_id do
// cliente (resolvida a partir do Goalfy em server.js) em vez de fazer join.
export async function getClientPostHistoryForCopy(calendarIds, { limit = 10 } = {}) {
  await ensureSchema();
  if (!calendarIds.length) {
    return { approved: [], feedback: [] };
  }

  const { rows: approvedRows } = await pool.query(
    `SELECT DISTINCT ON (post_id) *
       FROM post_decisions
      WHERE calendar_id = ANY($1) AND approved = true
      ORDER BY post_id, created_at DESC
      LIMIT $2`,
    [calendarIds, limit],
  );

  const { rows: feedbackRows } = await pool.query(
    `SELECT DISTINCT ON (post_id) *
       FROM post_decisions
      WHERE calendar_id = ANY($1) AND approved = false AND feedback IS NOT NULL AND feedback <> ''
      ORDER BY post_id, created_at DESC
      LIMIT $2`,
    [calendarIds, limit],
  );

  return {
    approved: approvedRows.map(rowToDecision),
    feedback: feedbackRows.map(rowToDecision),
  };
}

// Salva/atualiza a copy sugerida pela IA para um item do calendário
// editorial — o designer pode gerar de novo, sobrescrevendo a anterior.
export async function upsertEditorialCopySuggestion(calendarId, itemKey, copy) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO editorial_copy_suggestions (calendar_id, item_key, copy, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (calendar_id, item_key) DO UPDATE SET copy = EXCLUDED.copy, updated_at = EXCLUDED.updated_at`,
    [calendarId, itemKey, copy],
  );
}

// Todas as copies já geradas para os itens de um calendário — usado para
// pré-carregar a aba "Calendário Editorial" com o que já foi sugerido
// antes, sem precisar gerar de novo.
export async function getEditorialCopySuggestionsForCalendar(calendarId) {
  await ensureSchema();
  const { rows } = await pool.query(
    `SELECT item_key, copy FROM editorial_copy_suggestions WHERE calendar_id = $1`,
    [calendarId],
  );
  return Object.fromEntries(rows.map((row) => [row.item_key, row.copy]));
}

export async function markAdjustmentsResolvedForPost(postId) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO post_adjustment_resolutions (post_id, resolved_at)
     VALUES ($1, now())
     ON CONFLICT (post_id) DO UPDATE SET resolved_at = EXCLUDED.resolved_at`,
    [postId],
  );
}

export async function getAdjustmentResolvedAtForPost(postId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM post_adjustment_resolutions WHERE post_id = $1`, [postId]);
  return rows[0] ? toIsoString(rows[0].resolved_at) : null;
}

// Mesma consulta de getAdjustmentResolvedAtForPost, mas para varios posts
// numa unica ida ao banco — ver getDecisionHistoryForPosts acima.
export async function getAdjustmentResolvedAtForPosts(postIds) {
  await ensureSchema();
  if (!postIds.length) return new Map();
  const { rows } = await pool.query(`SELECT * FROM post_adjustment_resolutions WHERE post_id = ANY($1)`, [
    postIds,
  ]);
  const resolvedAtByPostId = new Map();
  rows.forEach((row) => resolvedAtByPostId.set(row.post_id, toIsoString(row.resolved_at)));
  return resolvedAtByPostId;
}

function rowToMediaVariant(row) {
  if (!row) return null;
  return {
    id: row.id,
    fileId: row.file_id,
    calendarId: row.calendar_id,
    variant: row.variant,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    width: row.width,
    height: row.height,
    sizeBytes: row.size_bytes,
    sourceModifiedTime: toIsoString(row.source_modified_time),
    generatedAt: toIsoString(row.generated_at),
  };
}

export async function getMediaVariant(fileId, variant) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM media_variants WHERE file_id = $1 AND variant = $2`, [
    fileId,
    variant,
  ]);
  return rowToMediaVariant(rows[0]);
}

export async function upsertMediaVariant({
  fileId,
  calendarId,
  variant,
  storagePath,
  mimeType,
  width,
  height,
  sizeBytes,
  sourceModifiedTime,
}) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO media_variants (file_id, calendar_id, variant, storage_path, mime_type, width, height, size_bytes, source_modified_time, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     ON CONFLICT (file_id, variant) DO UPDATE SET
       calendar_id = EXCLUDED.calendar_id,
       storage_path = EXCLUDED.storage_path,
       mime_type = EXCLUDED.mime_type,
       width = EXCLUDED.width,
       height = EXCLUDED.height,
       size_bytes = EXCLUDED.size_bytes,
       source_modified_time = EXCLUDED.source_modified_time,
       generated_at = now()`,
    [
      fileId,
      calendarId,
      variant,
      storagePath,
      mimeType,
      width ?? null,
      height ?? null,
      sizeBytes ?? null,
      sourceModifiedTime ?? null,
    ],
  );
}

export async function listFileIdsMissingVariant(fileIds, variant) {
  await ensureSchema();
  if (!fileIds || fileIds.length === 0) return [];
  const { rows } = await pool.query(`SELECT file_id FROM media_variants WHERE variant = $1 AND file_id = ANY($2)`, [
    variant,
    fileIds,
  ]);
  const existing = new Set(rows.map((row) => row.file_id));
  return fileIds.filter((fileId) => !existing.has(fileId));
}

export async function listMediaVariantsByCalendar(calendarId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM media_variants WHERE calendar_id = $1`, [calendarId]);
  return rows.map(rowToMediaVariant);
}

export async function deleteMediaVariantsByCalendar(calendarId) {
  await ensureSchema();
  await pool.query(`DELETE FROM media_variants WHERE calendar_id = $1`, [calendarId]);
}

export default pool;
