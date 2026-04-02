import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(__dirname, '..', '..', 'mcp', 'node_modules', '_'),
);
const Database = require('better-sqlite3');

const testDbPath = path.join(os.tmpdir(), `mustard-tui-test-${Date.now()}.db`);

// Create temp database with mustard schema
const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE records (
    id TEXT PRIMARY KEY,
    log_type TEXT NOT NULL CHECK(log_type IN ('todo','people_note','idea','daily_log','project','learning')),
    title TEXT,
    text TEXT NOT NULL,
    capture_date TEXT NOT NULL,
    person TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    due_date TEXT,
    category TEXT,
    theme TEXT,
    period TEXT,
    source_origin TEXT NOT NULL DEFAULT 'mustard-app',
    source_date TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    confidence TEXT,
    created_by TEXT,
    source_url TEXT,
    delegate TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.prepare(`
  INSERT INTO records (id, log_type, title, text, capture_date, status)
  VALUES (?, ?, ?, ?, ?, ?)
`).run('test-1', 'todo', 'Test todo', 'Test content', '2026-01-01', 'open');

db.prepare(`
  INSERT INTO records (id, log_type, title, text, capture_date, person, status)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run('test-2', 'people_note', null, 'Note about alice', '2026-01-01', 'alice', 'logged');

db.close();

// Set MUSTARD_DB before importing tui/src/db.js so the module picks it up
process.env.MUSTARD_DB = testDbPath;

const { openDb, getRecords, closeDb } = await import('../src/db.js');

let exitCode = 0;

try {
  openDb();

  const todos = getRecords('todo');
  if (!Array.isArray(todos) || todos.length !== 1 || todos[0].title !== 'Test todo') {
    console.error(`FAIL: todo query — expected 1 record with title "Test todo", got ${JSON.stringify(todos)}`);
    exitCode = 1;
  } else {
    console.log('PASS: getRecords("todo") returns 1 record');
  }

  const notes = getRecords('people_note');
  if (!Array.isArray(notes) || notes.length !== 1 || notes[0].person !== 'alice') {
    console.error(`FAIL: people_note query — expected 1 record with person "alice", got ${JSON.stringify(notes)}`);
    exitCode = 1;
  } else {
    console.log('PASS: getRecords("people_note") returns 1 record');
  }

  closeDb();
  console.log(exitCode === 0 ? 'TUI verification: ALL PASSED' : 'TUI verification: FAILED');
} finally {
  try { fs.unlinkSync(testDbPath); } catch {}
  try { fs.unlinkSync(testDbPath + '-wal'); } catch {}
  try { fs.unlinkSync(testDbPath + '-shm'); } catch {}
}

process.exit(exitCode);
