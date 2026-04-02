#!/bin/bash
# Daily backup of mustard.db
# Checkpoints WAL, copies to timestamped file, verifies, prunes old backups.

set -euo pipefail

DB_PATH="$HOME/dev/mustard-data/mustard.db"
BACKUP_DIR="$HOME/dev/mustard-data/backups"
KEEP_DAYS=7
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mustard-$TIMESTAMP.db"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Checkpoint WAL to flush pending writes into the main database file
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || true

# Copy database (WAL is flushed, so a single-file copy is consistent)
cp "$DB_PATH" "$BACKUP_FILE"

# Verify the backup is valid SQLite
INTEGRITY=$(sqlite3 "$BACKUP_FILE" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" != "ok" ]; then
    echo "BACKUP FAILED: integrity_check returned: $INTEGRITY" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Verify record count is non-zero
COUNT=$(sqlite3 "$BACKUP_FILE" "SELECT count(*) FROM records;" 2>&1)
if [ "$COUNT" -eq 0 ] 2>/dev/null; then
    echo "BACKUP WARNING: backup contains 0 records" >&2
    rm -f "$BACKUP_FILE"
    exit 1
fi

# Prune backups older than KEEP_DAYS
find "$BACKUP_DIR" -name "mustard-*.db" -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

echo "Backup OK: $BACKUP_FILE ($COUNT records)"
