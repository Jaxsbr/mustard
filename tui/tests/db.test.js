import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { getDb, initSchema } from 'mustard-core';

const testDbPath = path.join(os.tmpdir(), `mustard-tui-test-${Date.now()}.db`);

// Create temp database with mustard schema using core
const db = getDb(testDbPath);
initSchema(db);

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
