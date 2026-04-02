import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(__dirname, '..', '..', 'mcp', 'node_modules', '_'),
);
let Database;
try {
  Database = require('better-sqlite3');
} catch {
  console.error('Error: better-sqlite3 not found. Run "cd mcp && npm install" first.');
  process.exit(1);
}

const DB_PATH =
  process.env.MUSTARD_DB ??
  path.resolve(__dirname, '..', '..', 'data', 'mustard.db');

let db;

export function openDb() {
  db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');
}

export function closeDb() {
  if (db) db.close();
}

const FILTER = {
  todo: "AND status = 'open'",
};

const ORDER_BY = {
  todo: `CASE
           WHEN due_date = date('now','localtime') THEN 0
           WHEN due_date IS NOT NULL AND due_date != '' AND due_date < date('now','localtime') THEN 1
           ELSE 2
         END,
         due_date ASC`,
  people_note: 'person ASC, capture_date DESC',
  idea: 'capture_date DESC',
  daily_log: 'capture_date DESC',
  project: 'title ASC, capture_date DESC',
  learning: 'capture_date DESC',
};

export function getRecords(logType, limit = 200) {
  const orderBy = ORDER_BY[logType] || 'capture_date DESC';
  const filter = FILTER[logType] || '';
  return db
    .prepare(
      `SELECT id, log_type, title, text, capture_date,
              person, status, due_date, category, theme,
              period, tags, delegate, source_url, confidence
       FROM records
       WHERE log_type = ? ${filter}
       ORDER BY ${orderBy}
       LIMIT ?`,
    )
    .all(logType, limit);
}
