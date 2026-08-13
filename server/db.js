import mysql from 'mysql2/promise';

// Persistência de decisões de clientes (aprovação/ajuste em posts) em MySQL
// gerenciado — precisa sobreviver a deploys que refazem o checkout do app
// do zero (a pasta local data/ nunca é versionada e se perde a cada deploy).
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
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
          id INT AUTO_INCREMENT PRIMARY KEY,
          post_id VARCHAR(255) NOT NULL,
          calendar_id VARCHAR(255) NOT NULL,
          approved TINYINT(1) NOT NULL,
          feedback TEXT,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          goalfy_sync_status VARCHAR(32) NOT NULL DEFAULT 'pending',
          goalfy_sync_error TEXT,
          INDEX idx_post_decisions_post_id (post_id),
          INDEX idx_post_decisions_calendar_id (calendar_id)
        )
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS post_adjustment_resolutions (
          post_id VARCHAR(255) PRIMARY KEY,
          resolved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
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
  return value.replace(' ', 'T') + 'Z';
}

function rowToDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    calendarId: row.calendar_id,
    approved: Boolean(row.approved),
    feedback: row.feedback,
    createdAt: toIsoString(row.created_at),
    goalfySyncStatus: row.goalfy_sync_status,
    goalfySyncError: row.goalfy_sync_error,
  };
}

export async function insertPostDecision({ postId, calendarId, approved, feedback }) {
  await ensureSchema();
  const [result] = await pool.query(
    `INSERT INTO post_decisions (post_id, calendar_id, approved, feedback, goalfy_sync_status, goalfy_sync_error)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [postId, calendarId, approved ? 1 : 0, feedback ?? null, 'pending', null],
  );
  return result.insertId;
}

export async function markDecisionSyncStatus(decisionId, status, error = null) {
  await ensureSchema();
  await pool.query(`UPDATE post_decisions SET goalfy_sync_status = ?, goalfy_sync_error = ? WHERE id = ?`, [
    status,
    error,
    decisionId,
  ]);
}

export async function getLatestDecisionsForCalendar(calendarId) {
  await ensureSchema();
  const [rows] = await pool.query(
    `SELECT pd.*
     FROM post_decisions pd
     INNER JOIN (
       SELECT post_id, MAX(id) AS max_id
       FROM post_decisions
       WHERE calendar_id = ?
       GROUP BY post_id
     ) latest ON latest.post_id = pd.post_id AND latest.max_id = pd.id
     ORDER BY pd.created_at DESC`,
    [calendarId],
  );
  return rows.map(rowToDecision);
}

export async function getDecisionHistoryForPost(postId) {
  await ensureSchema();
  const [rows] = await pool.query(`SELECT * FROM post_decisions WHERE post_id = ? ORDER BY created_at DESC`, [
    postId,
  ]);
  return rows.map(rowToDecision);
}

export async function markAdjustmentsResolvedForPost(postId) {
  await ensureSchema();
  await pool.query(
    `INSERT INTO post_adjustment_resolutions (post_id, resolved_at)
     VALUES (?, CURRENT_TIMESTAMP(3))
     ON DUPLICATE KEY UPDATE resolved_at = VALUES(resolved_at)`,
    [postId],
  );
}

export async function getAdjustmentResolvedAtForPost(postId) {
  await ensureSchema();
  const [rows] = await pool.query(`SELECT * FROM post_adjustment_resolutions WHERE post_id = ?`, [postId]);
  return rows[0] ? toIsoString(rows[0].resolved_at) : null;
}

export default pool;
