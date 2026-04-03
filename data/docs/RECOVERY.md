# Mustard Database Recovery Runbook

Reference: [INC-2026-04-02](./INCIDENT-2026-04-02-db-corruption.md)

## Key principles

1. **Dump BEFORE attempting any fix.** Once you modify the DB, the original state is gone.
2. **`.dump` carries FTS corruption.** A dump/restore cycle does NOT fix FTS problems.
3. **NEVER create recovery files in `/tmp`.** macOS Sequoia adds `com.apple.provenance` xattr that blocks writes and cannot be removed.
4. **Create fresh DB at the original path.** Use `sqlite3` directly at `data/mustard.db`.
5. **FTS is derived data.** It can always be rebuilt from the `records` table.
6. **`PRAGMA integrity_check` does NOT check FTS5.** A passing integrity check means nothing for FTS health.

## Before you start

```bash
# Check the DB path
echo $MUSTARD_DB   # if set, use this; otherwise data/mustard.db

# Preserve the current state (copy, don't move)
cp data/mustard.db data/mustard.db.incident-backup
cp data/mustard.db-wal data/mustard.db-wal.incident-backup 2>/dev/null
cp data/mustard.db-shm data/mustard.db-shm.incident-backup 2>/dev/null
```

## Scenario 1: FTS corruption (writes fail, records intact)

This is the most common failure mode. Symptoms: `database disk image is malformed` on writes, but `SELECT * FROM records` works fine.

### Diagnose

```bash
# Check if main data is readable
sqlite3 data/mustard.db "SELECT count(*) FROM records;"

# Test FTS specifically — this is what PRAGMA integrity_check misses
sqlite3 data/mustard.db "SELECT rowid FROM records_fts LIMIT 1;"
# If this errors, FTS is corrupt
```

### Fix: Rebuild FTS in place

```bash
sqlite3 data/mustard.db <<'SQL'
-- Drop corrupt FTS and its triggers
DROP TRIGGER IF EXISTS records_ai;
DROP TRIGGER IF EXISTS records_ad;
DROP TRIGGER IF EXISTS records_au;
DROP TABLE IF EXISTS records_fts;

-- Recreate FTS table
CREATE VIRTUAL TABLE records_fts USING fts5(
  title, text, person, tags, source_url,
  content='records', content_rowid='rowid'
);

-- Rebuild index from records data
INSERT INTO records_fts(records_fts) VALUES('rebuild');

-- Recreate sync triggers
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
SQL
```

### Verify

```bash
sqlite3 data/mustard.db "SELECT count(*) FROM records;"
sqlite3 data/mustard.db "SELECT rowid FROM records_fts LIMIT 1;"
sqlite3 data/mustard.db "PRAGMA integrity_check;"
```

## Scenario 2: Full corruption (records table damaged)

If `SELECT * FROM records` fails, the B-tree is damaged. Use the most recent backup.

### Restore from backup

```bash
# List available backups (newest first)
ls -lt data/backups/

# Pick the most recent valid backup
BACKUP=data/backups/mustard-YYYYMMDD-HHMMSS.db

# Verify the backup is healthy
sqlite3 "$BACKUP" "SELECT count(*) FROM records;"
sqlite3 "$BACKUP" "PRAGMA integrity_check;"

# Stop all MCP server instances first
pkill -f "mustard.*server"

# Swap in the backup
mv data/mustard.db data/mustard.db.corrupt
cp "$BACKUP" data/mustard.db

# Rebuild FTS (backup may have stale index)
sqlite3 data/mustard.db "INSERT INTO records_fts(records_fts) VALUES('rebuild');"

# Remove WAL files from the corrupt DB (they belong to the old file)
rm -f data/mustard.db-wal data/mustard.db-shm
```

## Scenario 3: No backup available — rebuild from dump

**Warning:** `.dump` carries corrupt FTS data. You must import selectively.

```bash
# Export only record data (not FTS tables)
sqlite3 data/mustard.db ".mode insert records" ".output records-export.sql" "SELECT * FROM records;"
sqlite3 data/mustard.db ".mode insert links" ".output links-export.sql" "SELECT * FROM links;"

# Kill all MCP instances
pkill -f "mustard.*server"

# Remove corrupt DB
rm data/mustard.db data/mustard.db-wal data/mustard.db-shm 2>/dev/null

# Create fresh DB — the MCP server will create schema on next startup
# Or create manually with node:
# cd mcp && node -e "import('./dist/db.js').then(m => { const db = m.getDb(); m.initSchema(db); m.closeDb(); })"

# Import record data
sqlite3 data/mustard.db < records-export.sql
sqlite3 data/mustard.db < links-export.sql

# Rebuild FTS from imported data
sqlite3 data/mustard.db "INSERT INTO records_fts(records_fts) VALUES('rebuild');"

# Verify
sqlite3 data/mustard.db "SELECT count(*) FROM records;"
sqlite3 data/mustard.db "SELECT rowid FROM records_fts LIMIT 1;"

# Cleanup export files
rm records-export.sql links-export.sql
```

## Post-recovery checklist

- [ ] Verify record count matches expected (currently ~253)
- [ ] Verify FTS search works: `sqlite3 data/mustard.db "SELECT id FROM records_fts WHERE records_fts MATCH 'test' LIMIT 1;"`
- [ ] Verify writes work: create a test record via MCP, then delete it
- [ ] Verify mustard TUI starts: `cd tui && node src/index.js`
- [ ] Check no stale MCP instances: `lsof data/mustard.db`
- [ ] Check WAL file size is reasonable: `ls -lh data/mustard.db*`

## Known gotchas

### macOS `/tmp` provenance xattr
Files created in `/tmp` and moved elsewhere acquire `com.apple.provenance` extended attribute (macOS Sequoia). This xattr blocks writes from some processes and **cannot be removed** — not even with `xattr -c` or `xattr -d`. Always create recovery files in the mustard `data/` directory, never in `/tmp`.

### PRAGMA integrity_check false confidence
`PRAGMA integrity_check` validates B-tree pages only. FTS5 virtual tables store data in their own internal tables (`records_fts_data`, `records_fts_idx`, etc.) which are not covered. A passing integrity check does not mean FTS is healthy.

### Concurrent MCP writers
Each Claude Code session spawns a separate MCP server instance. All open the same SQLite file. Use `lsof data/mustard.db` to check how many processes have the file open. If recovering, kill all instances first with `pkill -f "mustard.*server"`.

### WAL checkpoint
Before backing up or copying the DB, checkpoint the WAL to ensure all writes are flushed:
```bash
sqlite3 data/mustard.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

## Automated protections

- **Daily backup:** launchd runs `data/backup.sh` at 06:00, keeps 7 days
- **FTS health check:** MCP server runs `checkFtsHealth()` on every startup — auto-rebuilds FTS if corrupt (added 2026-04-03)
