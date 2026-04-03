# Mustard Data — Architecture

## Overview

This repository holds the mustard SQLite database and its supporting infrastructure. The database is the single source of truth for all mustard records (todos, ideas, learnings, daily logs, people notes, projects).

## Database

- **File:** `mustard.db` (SQLite, WAL mode)
- **Schema owner:** `mustard-mcp` (migrations run there)
- **Consumers:** mustard-mcp (read/write via MCP tools), mustard-tui (read-only TUI)

The `.db`, `.db-shm`, and `.db-wal` files are gitignored. Record data is only in SQLite — there is no secondary export.

## Daily backup

Implemented after [INC-2026-04-02](INCIDENT-2026-04-02-db-corruption.md), where FTS5 index corruption made the database unwritable and no prior backups existed.

### Components

| Component | Path |
|---|---|
| Backup script | `data/backup.sh` |
| launchd plist | `~/Library/LaunchAgents/com.jaco.mustard-backup.plist` |
| Backup directory | `data/backups/` (gitignored) |
| Log file | `data/backups/backup.log` |

### How it works

1. **WAL checkpoint** — `PRAGMA wal_checkpoint(TRUNCATE)` flushes the write-ahead log into the main database file. This ensures a single-file `cp` produces a consistent snapshot. The checkpoint is best-effort (failures are tolerated — the copy is still usable if WAL is small).
2. **Copy** — `cp mustard.db backups/mustard-YYYYMMDD-HHMMSS.db`.
3. **Verify** — runs `PRAGMA integrity_check` on the backup copy and confirms the record count is non-zero. If either check fails, the backup file is deleted and the script exits with an error.
4. **Prune** — deletes backup files older than 7 days (`find -mtime +7`).

### Schedule

The launchd agent (`com.jaco.mustard-backup`) runs the backup script daily at **06:00**. If the machine is asleep at the scheduled time, launchd runs it at the next wake.

### Managing the agent

```bash
# Check status
launchctl list | grep mustard

# Unload (stop scheduling)
launchctl unload ~/Library/LaunchAgents/com.jaco.mustard-backup.plist

# Reload after editing the plist
launchctl unload ~/Library/LaunchAgents/com.jaco.mustard-backup.plist
launchctl load ~/Library/LaunchAgents/com.jaco.mustard-backup.plist

# Run manually
mustard/data/backup.sh
```

### Restoring from backup

```bash
# 1. Stop all mustard consumers (MCP servers, TUI)
# 2. Replace the database
cp backups/mustard-YYYYMMDD-HHMMSS.db mustard.db
# 3. Verify
sqlite3 mustard.db "PRAGMA integrity_check;"
sqlite3 mustard.db "SELECT count(*) FROM records;"
# 4. Restart consumers
```

### Known limitations

- **Not crash-safe during copy.** If a writer is active and WAL checkpoint fails, the backup may include a stale WAL state. In practice this is low-risk at 06:00 with no active sessions.
- **`integrity_check` does not cover FTS5.** The same false-positive from INC-2026-04-02 applies. A corrupted FTS index will pass `integrity_check`. The MCP server now runs an FTS-specific health check on startup (see below) but the backup script does not.
- **Local only.** Backups live on the same disk as the database. A disk failure loses both. Consider cloud sync or off-machine copy as a future enhancement.

## FTS5 health check

Added after INC-2026-04-02. The MCP server runs `checkFtsHealth()` on every startup as the final step of `initSchema()`.

1. Attempts a `SELECT rowid FROM records_fts LIMIT 1` query against the FTS index
2. If it succeeds — FTS is healthy, no action
3. If it fails — drops the FTS table, recreates it with the current schema, rebuilds triggers, and repopulates from the `records` table
4. If the rebuild also fails — logs the error to stderr, server continues with search unavailable

FTS is a derived index. It can always be rebuilt from the `records` table without data loss.

## Recovery runbook

See [RECOVERY.md](./RECOVERY.md) for step-by-step procedures covering:
1. **FTS corruption** (most common) — rebuild FTS in place
2. **Full B-tree corruption** — restore from daily backup
3. **No backup available** — selective export/import avoiding FTS carry-through
