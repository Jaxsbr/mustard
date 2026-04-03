import Database from 'better-sqlite3'

export function getDb(dbPath: string, options?: { readonly?: boolean }): Database.Database {
  const db = new Database(dbPath, { readonly: options?.readonly ?? false })
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  return db
}

function migrateLogTypeConstraint(db: Database.Database): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='records'",
    )
    .get() as { sql: string } | undefined
  if (!row || row.sql.includes("'project'")) return

  db.exec(`
    DROP TRIGGER IF EXISTS records_ai;
    DROP TRIGGER IF EXISTS records_ad;
    DROP TRIGGER IF EXISTS records_au;
    DROP TABLE IF EXISTS records_fts;

    CREATE TABLE records_new (
      id              TEXT PRIMARY KEY,
      log_type        TEXT NOT NULL CHECK(log_type IN ('todo','people_note','idea','daily_log','project')),
      title           TEXT,
      text            TEXT NOT NULL,
      capture_date    TEXT NOT NULL,
      person          TEXT,
      status          TEXT,
      due_date        TEXT,
      category        TEXT,
      theme           TEXT,
      period          TEXT,
      source_origin   TEXT NOT NULL DEFAULT 'mustard-app',
      source_date     TEXT,
      tags            TEXT NOT NULL DEFAULT '[]',
      confidence      TEXT,
      created_by      TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO records_new SELECT * FROM records;
    DROP TABLE records;
    ALTER TABLE records_new RENAME TO records;
  `)
}

function migrateLearningType(db: Database.Database): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='records'",
    )
    .get() as { sql: string } | undefined
  if (!row || row.sql.includes("'learning'")) return

  db.exec(`
    DROP TRIGGER IF EXISTS records_ai;
    DROP TRIGGER IF EXISTS records_ad;
    DROP TRIGGER IF EXISTS records_au;
    DROP TABLE IF EXISTS records_fts;

    CREATE TABLE records_new (
      id              TEXT PRIMARY KEY,
      log_type        TEXT NOT NULL CHECK(log_type IN ('todo','people_note','idea','daily_log','project','learning')),
      title           TEXT,
      text            TEXT NOT NULL,
      capture_date    TEXT NOT NULL,
      person          TEXT,
      status          TEXT,
      due_date        TEXT,
      category        TEXT,
      theme           TEXT,
      period          TEXT,
      source_origin   TEXT NOT NULL DEFAULT 'mustard-app',
      source_date     TEXT,
      tags            TEXT NOT NULL DEFAULT '[]',
      confidence      TEXT,
      created_by      TEXT,
      source_url      TEXT,
      delegate        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO records_new (
      id, log_type, title, text, capture_date,
      person, status, due_date, category, theme, period,
      source_origin, source_date, tags, confidence, created_by,
      created_at, updated_at
    ) SELECT
      id, log_type, title, text, capture_date,
      person, status, due_date, category, theme, period,
      source_origin, source_date, tags, confidence, created_by,
      created_at, updated_at
    FROM records;
    DROP TABLE records;
    ALTER TABLE records_new RENAME TO records;
  `)
}

function migrateNewColumns(db: Database.Database): void {
  const tableExists = db
    .prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='records'",
    )
    .get()
  if (!tableExists) return

  const columns = db.prepare('PRAGMA table_info(records)').all() as { name: string }[]
  const columnNames = new Set(columns.map((c) => c.name))

  if (!columnNames.has('source_url')) {
    db.exec('ALTER TABLE records ADD COLUMN source_url TEXT')
  }
  if (!columnNames.has('delegate')) {
    db.exec('ALTER TABLE records ADD COLUMN delegate TEXT')
  }

  const ftsRow = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='records_fts'",
    )
    .get() as { sql: string } | undefined
  if (ftsRow && !ftsRow.sql.includes('source_url')) {
    db.exec('DROP TABLE IF EXISTS records_fts')
  }
}

function migrateStatusNotNull(db: Database.Database): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='records'",
    )
    .get() as { sql: string } | undefined
  if (!row || row.sql.includes("status          TEXT NOT NULL")) return

  db.exec(`
    UPDATE records SET status = 'open'     WHERE status IS NULL AND log_type IN ('todo', 'project');
    UPDATE records SET status = 'captured' WHERE status IS NULL AND log_type IN ('idea', 'learning');
    UPDATE records SET status = 'logged'   WHERE status IS NULL AND log_type IN ('daily_log', 'people_note');
  `)

  db.exec(`
    DROP TRIGGER IF EXISTS records_ai;
    DROP TRIGGER IF EXISTS records_ad;
    DROP TRIGGER IF EXISTS records_au;
    DROP TABLE IF EXISTS records_fts;

    CREATE TABLE records_new (
      id              TEXT PRIMARY KEY,
      log_type        TEXT NOT NULL CHECK(log_type IN ('todo','people_note','idea','daily_log','project','learning')),
      title           TEXT,
      text            TEXT NOT NULL,
      capture_date    TEXT NOT NULL,
      person          TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      due_date        TEXT,
      category        TEXT,
      theme           TEXT,
      period          TEXT,
      source_origin   TEXT NOT NULL DEFAULT 'mustard-app',
      source_date     TEXT,
      tags            TEXT NOT NULL DEFAULT '[]',
      confidence      TEXT,
      created_by      TEXT,
      source_url      TEXT,
      delegate        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO records_new SELECT * FROM records;
    DROP TABLE records;
    ALTER TABLE records_new RENAME TO records;
  `)
}

function createFtsTriggers(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS records_ai;
    DROP TRIGGER IF EXISTS records_ad;
    DROP TRIGGER IF EXISTS records_au;

    CREATE TRIGGER records_ai AFTER INSERT ON records BEGIN
      INSERT INTO records_fts(rowid, title, text, person, tags, source_url)
      VALUES (new.rowid, new.title, new.text, new.person, new.tags, new.source_url);
    END;

    CREATE TRIGGER records_ad AFTER DELETE ON records BEGIN
      INSERT INTO records_fts(records_fts, rowid, title, text, person, tags, source_url)
      VALUES ('delete', old.rowid, old.title, old.text, old.person, old.tags, old.source_url);
    END;

    CREATE TRIGGER records_au AFTER UPDATE ON records BEGIN
      INSERT INTO records_fts(records_fts, rowid, title, text, person, tags, source_url)
      VALUES ('delete', old.rowid, old.title, old.text, old.person, old.tags, old.source_url);
      INSERT INTO records_fts(rowid, title, text, person, tags, source_url)
      VALUES (new.rowid, new.title, new.text, new.person, new.tags, new.source_url);
    END;
  `)
}

export function initSchema(db: Database.Database): void {
  migrateLogTypeConstraint(db)
  migrateLearningType(db)
  migrateNewColumns(db)
  migrateStatusNotNull(db)

  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id              TEXT PRIMARY KEY,
      log_type        TEXT NOT NULL CHECK(log_type IN ('todo','people_note','idea','daily_log','project','learning')),
      title           TEXT,
      text            TEXT NOT NULL,
      capture_date    TEXT NOT NULL,
      person          TEXT,
      status          TEXT NOT NULL DEFAULT 'open',
      due_date        TEXT,
      category        TEXT,
      theme           TEXT,
      period          TEXT,
      source_origin   TEXT NOT NULL DEFAULT 'mustard-app',
      source_date     TEXT,
      tags            TEXT NOT NULL DEFAULT '[]',
      confidence      TEXT,
      created_by      TEXT,
      source_url      TEXT,
      delegate        TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_records_log_type ON records(log_type);
    CREATE INDEX IF NOT EXISTS idx_records_person ON records(person) WHERE person IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_records_status ON records(status) WHERE status IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_records_capture_date ON records(capture_date);
    CREATE INDEX IF NOT EXISTS idx_records_delegate ON records(delegate) WHERE delegate IS NOT NULL;

    CREATE TABLE IF NOT EXISTS links (
      id          TEXT PRIMARY KEY,
      source_id   TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      target_id   TEXT NOT NULL REFERENCES records(id) ON DELETE CASCADE,
      relation    TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(source_id, target_id, relation)
    );

    CREATE INDEX IF NOT EXISTS idx_links_source ON links(source_id);
    CREATE INDEX IF NOT EXISTS idx_links_target ON links(target_id);
  `)

  const ftsExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='records_fts'",
    )
    .get()

  if (!ftsExists) {
    db.exec(`
      CREATE VIRTUAL TABLE records_fts USING fts5(
        title, text, person, tags, source_url,
        content='records', content_rowid='rowid'
      );
    `)
  }

  createFtsTriggers(db)
  checkFtsHealth(db)
}

export function rebuildFts(db: Database.Database): void {
  db.exec("INSERT INTO records_fts(records_fts) VALUES('rebuild')")
}

export function checkFtsHealth(db: Database.Database): void {
  try {
    db.prepare("SELECT rowid FROM records_fts LIMIT 1").get()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[mustard] FTS5 health check failed: ${message}`)
    console.error('[mustard] Rebuilding FTS5 index from records table...')

    try {
      db.exec('DROP TABLE IF EXISTS records_fts')
      db.exec(`
        CREATE VIRTUAL TABLE records_fts USING fts5(
          title, text, person, tags, source_url,
          content='records', content_rowid='rowid'
        );
      `)
      createFtsTriggers(db)
      rebuildFts(db)

      const count = db.prepare("SELECT count(*) as n FROM records").get() as { n: number }
      console.error(`[mustard] FTS5 index rebuilt successfully (${count.n} records indexed)`)
    } catch (rebuildErr) {
      const rebuildMessage = rebuildErr instanceof Error ? rebuildErr.message : String(rebuildErr)
      console.error(`[mustard] FTS5 rebuild failed: ${rebuildMessage}`)
      console.error('[mustard] Search will be unavailable. See data/docs/RECOVERY.md for manual recovery.')
    }
  }
}

export function closeDb(db: Database.Database): void {
  db.close()
}

export type { Database }
