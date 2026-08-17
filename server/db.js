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

export async function getDecisionHistoryForPost(postId) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT * FROM post_decisions WHERE post_id = $1 ORDER BY created_at DESC`, [
    postId,
  ]);
  return rows.map(rowToDecision);
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

export default pool;
