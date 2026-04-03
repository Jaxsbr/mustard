import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema, checkFtsHealth, rebuildFts } from '../src/db.js'

function createTempDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

describe('initSchema', () => {
  let db: Database.Database

  afterEach(() => {
    if (db) db.close()
  })

  it('creates records table with correct columns and constraints', () => {
    db = createTempDb()
    initSchema(db)

    const columns = db.prepare('PRAGMA table_info(records)').all() as { name: string; notnull: number }[]
    const columnNames = columns.map((c) => c.name)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('log_type')
    expect(columnNames).toContain('title')
    expect(columnNames).toContain('text')
    expect(columnNames).toContain('capture_date')
    expect(columnNames).toContain('person')
    expect(columnNames).toContain('status')
    expect(columnNames).toContain('due_date')
    expect(columnNames).toContain('source_url')
    expect(columnNames).toContain('delegate')
    expect(columnNames).toContain('created_at')
    expect(columnNames).toContain('updated_at')

    // Verify CHECK constraint includes all log types
    const tableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='records'").get() as { sql: string }).sql
    expect(tableSql).toContain("'todo'")
    expect(tableSql).toContain("'people_note'")
    expect(tableSql).toContain("'idea'")
    expect(tableSql).toContain("'daily_log'")
    expect(tableSql).toContain("'project'")
    expect(tableSql).toContain("'learning'")
  })

  it('creates links table with foreign keys and unique constraint', () => {
    db = createTempDb()
    initSchema(db)

    const columns = db.prepare('PRAGMA table_info(links)').all() as { name: string }[]
    const columnNames = columns.map((c) => c.name)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('source_id')
    expect(columnNames).toContain('target_id')
    expect(columnNames).toContain('relation')
    expect(columnNames).toContain('created_at')

    const tableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='links'").get() as { sql: string }).sql
    expect(tableSql).toContain('UNIQUE(source_id, target_id, relation)')
  })

  it('creates indexes on records and links', () => {
    db = createTempDb()
    initSchema(db)

    const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[]
    const indexNames = indexes.map((i) => i.name)

    expect(indexNames).toContain('idx_records_log_type')
    expect(indexNames).toContain('idx_records_person')
    expect(indexNames).toContain('idx_records_status')
    expect(indexNames).toContain('idx_records_capture_date')
    expect(indexNames).toContain('idx_records_delegate')
    expect(indexNames).toContain('idx_links_source')
    expect(indexNames).toContain('idx_links_target')
  })

  it('creates FTS5 virtual table', () => {
    db = createTempDb()
    initSchema(db)

    const fts = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='records_fts'").get()
    expect(fts).toBeTruthy()
  })

  it('creates FTS triggers (ai, ad, au)', () => {
    db = createTempDb()
    initSchema(db)

    const triggers = db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as { name: string }[]
    const triggerNames = triggers.map((t) => t.name)

    expect(triggerNames).toContain('records_ai')
    expect(triggerNames).toContain('records_ad')
    expect(triggerNames).toContain('records_au')
  })

  it('is idempotent — running twice does not error', () => {
    db = createTempDb()
    initSchema(db)
    expect(() => initSchema(db)).not.toThrow()
  })
})

describe('checkFtsHealth', () => {
  it('does not throw on a healthy FTS index', () => {
    const db = createTempDb()
    initSchema(db)
    expect(() => checkFtsHealth(db)).not.toThrow()
    db.close()
  })
})

describe('rebuildFts', () => {
  it('rebuilds FTS index without error', () => {
    const db = createTempDb()
    initSchema(db)
    expect(() => rebuildFts(db)).not.toThrow()
    db.close()
  })
})
