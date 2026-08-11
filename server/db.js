import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DB_DIR, 'approvals.db');

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS post_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id TEXT NOT NULL,
    calendar_id TEXT NOT NULL,
    approved INTEGER NOT NULL,
    feedback TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    goalfy_sync_status TEXT NOT NULL DEFAULT 'pending',
    goalfy_sync_error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_post_decisions_post_id ON post_decisions (post_id);
  CREATE INDEX IF NOT EXISTS idx_post_decisions_calendar_id ON post_decisions (calendar_id);

  CREATE TABLE IF NOT EXISTS post_adjustment_resolutions (
    post_id TEXT PRIMARY KEY,
    resolved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const insertDecisionStmt = db.prepare(`
  INSERT INTO post_decisions (post_id, calendar_id, approved, feedback, goalfy_sync_status, goalfy_sync_error)
  VALUES (@postId, @calendarId, @approved, @feedback, @goalfySyncStatus, @goalfySyncError)
`);

const updateSyncStatusStmt = db.prepare(`
  UPDATE post_decisions SET goalfy_sync_status = ?, goalfy_sync_error = ? WHERE id = ?
`);

const latestDecisionsByCalendarStmt = db.prepare(`
  SELECT pd.*
  FROM post_decisions pd
  INNER JOIN (
    SELECT post_id, MAX(id) AS max_id
    FROM post_decisions
    WHERE calendar_id = ?
    GROUP BY post_id
  ) latest ON latest.post_id = pd.post_id AND latest.max_id = pd.id
  ORDER BY pd.created_at DESC
`);

const historyByPostStmt = db.prepare(`
  SELECT * FROM post_decisions WHERE post_id = ? ORDER BY created_at DESC
`);

const upsertAdjustmentResolutionStmt = db.prepare(`
  INSERT INTO post_adjustment_resolutions (post_id, resolved_at)
  VALUES (@postId, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  ON CONFLICT (post_id) DO UPDATE SET resolved_at = excluded.resolved_at
`);

const adjustmentResolutionByPostStmt = db.prepare(`
  SELECT * FROM post_adjustment_resolutions WHERE post_id = ?
`);

function rowToDecision(row) {
  if (!row) return null;
  return {
    id: row.id,
    postId: row.post_id,
    calendarId: row.calendar_id,
    approved: Boolean(row.approved),
    feedback: row.feedback,
    createdAt: row.created_at,
    goalfySyncStatus: row.goalfy_sync_status,
    goalfySyncError: row.goalfy_sync_error,
  };
}

export function insertPostDecision({ postId, calendarId, approved, feedback }) {
  const result = insertDecisionStmt.run({
    postId,
    calendarId,
    approved: approved ? 1 : 0,
    feedback: feedback ?? null,
    goalfySyncStatus: 'pending',
    goalfySyncError: null,
  });
  return result.lastInsertRowid;
}

export function markDecisionSyncStatus(decisionId, status, error = null) {
  updateSyncStatusStmt.run(status, error, decisionId);
}

export function getLatestDecisionsForCalendar(calendarId) {
  return latestDecisionsByCalendarStmt.all(calendarId).map(rowToDecision);
}

export function getDecisionHistoryForPost(postId) {
  return historyByPostStmt.all(postId).map(rowToDecision);
}

export function markAdjustmentsResolvedForPost(postId) {
  upsertAdjustmentResolutionStmt.run({ postId });
}

export function getAdjustmentResolvedAtForPost(postId) {
  const row = adjustmentResolutionByPostStmt.get(postId);
  return row?.resolved_at ?? null;
}

export default db;
