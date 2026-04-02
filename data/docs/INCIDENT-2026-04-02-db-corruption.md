> **Note:** Paths in this report reference the pre-monorepo layout (`mustard-data/`). The database now lives at `data/mustard.db` within the mustard monorepo.

# INC-2026-04-02: Mustard database corruption — data inaccessible for ~15 minutes

**Severity:** High (data access loss, write path broken)
**Status:** Resolved
**Date:** 2026-04-02 ~07:30–07:44 NZST
**Affected system:** mustard SQLite database (`~/dev/mustard-data/mustard.db`)
**Impact:** All mustard consumers (MCP, TUI, any direct reader) unable to write. TUI unable to start. 253 records at risk.

---

## Timeline

| Time (NZST) | Event |
|---|---|
| ~07:31 | Agent attempts `UPDATE` via mustard MCP to close a todo. MCP returns `database disk image is malformed`. |
| ~07:33 | Direct `sqlite3 UPDATE` also fails with same error. `PRAGMA integrity_check` returns `ok` — misleading, as the corruption was in the FTS5 virtual table, not the main B-tree. |
| ~07:34 | `lsof` reveals 12 concurrent node processes (MCP server instances) holding the database file open. |
| ~07:35 | Agent runs `.dump` to SQL file (321 lines, 253 records). Dump completes successfully but **silently includes corrupt FTS internal table data**. |
| ~07:36 | Agent rebuilds database from dump at `mustard-rebuilt.db`. Rebuild appears healthy (`integrity_check` ok, 253 records). Swaps into place via `mv`. |
| ~07:37 | Writes still fail. The corrupt FTS data was carried through the dump. A second rebuild in `/tmp` with explicit FTS reconstruction succeeds — but the file created in `/tmp` acquires macOS `com.apple.provenance` extended attribute. |
| ~07:40 | File moved from `/tmp` to `mustard-data/`. `mustard` TUI now fails with `attempt to write a readonly database` — the provenance xattr from the `/tmp` origin blocks writes. `xattr -c` and `xattr -d` cannot remove `com.apple.provenance` (macOS Sequoia restriction). |
| ~07:43 | Agent deletes the tainted file, creates a fresh database **at the original path** using `sqlite3` directly (no `/tmp` intermediary). Schema created manually, record data imported from clean export, FTS table rebuilt from record data. |
| ~07:44 | Writes succeed. `PRAGMA integrity_check` passes. `mustard` TUI confirmed working by operator. |

---

## Root cause

**Primary:** FTS5 full-text search index corruption, likely caused by concurrent WAL writes from 12+ mustard MCP server instances (one per Claude Code session) without connection pooling or write serialisation.

**Secondary (recovery prolonged by):**
1. `.dump` preserves corrupt FTS internal tables — a dump/restore cycle does not fix FTS corruption.
2. Files created in `/tmp` and moved to the workspace acquire `com.apple.provenance` (macOS Sequoia sandbox marker) which cannot be removed and blocks writes from some processes.

---

## What went well

- Record data (253 records) was never lost. The main B-tree was intact throughout; only the FTS virtual table was corrupt.
- SQL dump was taken early, providing a recovery baseline.
- Multiple backup copies preserved at each stage (`.corrupt`, `.corrupt2`).

## What went poorly

- **No backups existed before this incident.** Recovery depended entirely on being able to read the corrupt database. If the main B-tree had been damaged, data would have been lost permanently.
- **`PRAGMA integrity_check` gave false confidence.** It reported `ok` despite FTS corruption — it does not check FTS5 virtual table internals.
- **The first two recovery attempts made things worse.** Dump-and-restore carried the corruption forward. The `/tmp` workaround introduced a macOS sandbox permission problem.
- **No monitoring or alerting** for database health, concurrent access, or WAL file growth (WAL was 4MB vs 672KB main DB).
- **12 concurrent writers with no coordination.** Each Claude Code session spawns its own MCP server, each opening the same SQLite file. No connection pooling, no write lock strategy, no WAL checkpoint management.

## What was lucky

- The corruption was confined to the FTS index (a derived data structure), not the primary record data. FTS can be fully rebuilt from the records table.

---

## Open questions for post-incident review

1. **Backup strategy:** What backup mechanism should protect mustard data? (Git-tracked snapshots? Scheduled copies? Cloud sync?)
2. **Concurrent access:** How should multiple MCP server instances coordinate writes to a single SQLite file? (Single writer process? Advisory locking? Separate DB per session with merge?)
3. **FTS integrity:** Should mustard include an FTS health check on startup and auto-rebuild if corrupt?
4. **Monitoring:** Should WAL file size or write error rates be monitored?
5. **Recovery runbook:** Should a documented recovery procedure exist for future incidents?
6. **macOS `/tmp` gotcha:** Document the provenance xattr issue so future recovery avoids the `/tmp` round-trip.

---

## Cleanup

Corrupt backup files can be removed once this review is complete:
- `~/dev/mustard-data/mustard.db.corrupt`
- `~/dev/mustard-data/mustard.db.corrupt2`
- `/tmp/mustard-dump.sql`
- `/tmp/mustard-fresh.db`
- `/tmp/mustard-records-only.sql`
- `/tmp/mustard-records-data.sql`
- `/tmp/mustard-hold.db`
