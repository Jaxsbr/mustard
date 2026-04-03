# Phase: monorepo-foundation

Status: shipped

## Stories

### US-M1 — Port modules into monorepo [Shipped]

As the maintainer, I want mustard-data, mustard-mcp, and mustard-tui consolidated as `data/`, `mcp/`, and `tui/` subdirectories in the mustard monorepo, so that all mustard code lives in a single repository with unified history.

**Acceptance criteria:**
- `data/`, `mcp/`, `tui/` directories exist in monorepo root with correct contents
- No `.git` directories exist inside any module subdirectory
- Original satellite repos are moved to `~/dev/archived/` with their git history preserved

**User guidance:** N/A — internal structural change

**Design rationale:** Moving (not copying) to `archived/` makes the transition clean — originals are preserved but clearly marked as superseded. No ambiguity about which is the active codebase.

### US-M2 — Update database path resolution [Shipped]

As a user running the MCP server or TUI from the monorepo, I want database paths to resolve to `data/mustard.db` within the monorepo, so that modules work without external path dependencies.

**Acceptance criteria:**
- `mcp/src/db.ts` default path resolves to `<monorepo-root>/data/mustard.db` using module-relative navigation
- `tui/src/db.js` default path resolves to `<monorepo-root>/data/mustard.db` using module-relative navigation
- `MUSTARD_DB` env var override still works for both modules
- `data/backup.sh` uses script-relative paths (not hardcoded absolute)

**User guidance:** N/A — internal path change, transparent to end users

**Design rationale:** Using `import.meta.url`-relative resolution makes paths work regardless of where the monorepo is cloned. Keeping the `MUSTARD_DB` env var override preserves flexibility for custom setups.

### US-M3 — Protect sensitive data with gitignore [Shipped]

As the maintainer, I want database files, WAL files, corrupt files, and backups excluded from git, so that private data is never pushed to GitHub.

**Acceptance criteria:**
- Root `.gitignore` excludes all database and backup files in `data/`
- Build artifacts (`node_modules/`, `dist/`) for mcp and tui are excluded
- `git status` confirms no sensitive files appear as untracked

**User guidance:** N/A — internal change

**Design rationale:** Patterns are scoped to `data/` subdirectory to avoid accidentally ignoring `.db` files elsewhere in the repo. Combined with existing mustard-data `.gitignore` patterns.

### US-M4 — Documentation, flow-mo diagram, and public readiness [Shipped]

As a developer cloning mustard for the first time, I want comprehensive architecture documentation, a visual system diagram, and a clear setup guide, so that I can understand and run the system without prior context.

**Acceptance criteria:**
- Architecture doc covers monorepo structure, module responsibilities, data model, MCP tools, and backup infrastructure
- Flow-mo system diagram visualizes the full data flow (clients → MCP → SQLite, TUI → SQLite, backup system)
- Architecture doc and AGENTS.md reference the flow diagram with an explicit update rule
- Setup guide documents backup automation (launchd/cron) and MCP client configuration with example snippets
- All documentation uses generic language — no person-specific names, slugs, or paths
- README.md is a public-facing quickstart (clone, install, configure, run)
- mcp/AGENTS.md is genericized

**User guidance:**
- Discovery: README.md at repo root is the entry point; it links to architecture docs
- Manual section: docs/architecture/ARCHITECTURE.md (new)
- Key steps: 1. Read README for quickstart. 2. Follow setup guide for MCP client and backup config. 3. Refer to architecture doc for system understanding.

**Design rationale:** Consolidating scattered docs from three repos into one architecture doc eliminates the need to cross-reference. The flow-mo diagram provides a visual overview that evolves with the system. Making everything generic transforms mustard from a personal tool into a reusable project.

### US-M5 — Monorepo verification tests [Shipped]

As the maintainer, I want integration tests that verify mcp and tui can operate from the monorepo structure, so that the migration is validated and future structural changes are caught.

**Acceptance criteria:**
- MCP server builds and its test suite passes with updated paths
- TUI db module can open and query a test database from the monorepo structure
- A root-level test script orchestrates all module tests
- Tests use temporary databases, not live data

**User guidance:** N/A — internal testing

**Design rationale:** Per-module tests plus a root orchestrator ensures each component works independently and together. Using temp DBs prevents tests from corrupting live data.

## Done-when (observable)

- [x] `data/` directory exists in monorepo root containing backup.sh, docs/ (database files are gitignored but present on disk) [US-M1]
- [x] `mcp/` directory exists in monorepo root with full TypeScript MCP server source, package.json, tsconfig.json, vitest.config.ts, tests/ [US-M1]
- [x] `tui/` directory exists in monorepo root with TUI source (src/index.js, src/db.js, src/render.js) and package.json [US-M1]
- [x] No `.git` directory exists inside `data/`, `mcp/`, or `tui/` (verified: `find data mcp tui -name .git -type d` returns empty) [US-M1]
- [x] `~/dev/archived/mustard-data`, `~/dev/archived/mustard-mcp`, `~/dev/archived/mustard-tui` exist with original contents including .git directories [US-M1]
- [x] `mcp/src/db.ts` DEFAULT_DB_PATH resolves to `<monorepo-root>/data/mustard.db` using `import.meta.url` or `path.resolve(__dirname)` relative navigation [US-M2]
- [x] `tui/src/db.js` DB_PATH resolves to `<monorepo-root>/data/mustard.db` using relative path from module location [US-M2]
- [x] `MUSTARD_DB` environment variable override still works in both mcp/src/db.ts and tui/src/db.js (existing code path preserved) [US-M2]
- [x] `data/backup.sh` DB_PATH and BACKUP_DIR variables reference the monorepo data directory using script-relative paths (not hardcoded absolute) [US-M2]
- [x] Root `.gitignore` contains patterns: `data/*.db`, `data/*.db-shm`, `data/*.db-wal`, `data/*.db.corrupt*`, `data/backups/` [US-M3]
- [x] Root `.gitignore` contains patterns: `mcp/node_modules/`, `mcp/dist/`, `tui/node_modules/` [US-M3]
- [x] Running `git status` in the monorepo after file copy shows no .db files, no .db-shm/.db-wal files, no backup files as untracked (test: `git status --porcelain | grep -c '\.db'` returns 0) [US-M3]
- [x] `docs/architecture/ARCHITECTURE.md` exists documenting: monorepo directory layout, module responsibilities (data, mcp, tui), data model (records + links tables), MCP tool inventory (11 tools), backup infrastructure [US-M4]
- [x] `docs/architecture/mustard.flow.yaml` exists as a valid flow-mo v1 diagram covering: MCP clients (Claude Desktop, Cursor, Claude Code), MCP server, TUI, SQLite data layer (records, links, FTS5), backup system [US-M4]
- [x] Architecture doc contains a section referencing the flow-mo diagram with an explicit update rule: "Update mustard.flow.yaml when adding modules, tools, or data flows" [US-M4]
- [x] `docs/architecture/ARCHITECTURE.md` includes a "Setup guide" section documenting: how to configure automated backups (launchd/cron with example plist), how to configure MCP clients (Claude Desktop, Cursor, Claude Code — with example config snippets pointing to `mcp/dist/server.js`) [US-M4]
- [x] All documentation uses generic language — no person-specific names, slugs, or paths; examples use placeholders like "alice", "project-x" instead of real people; paths use `<mustard-root>` notation [US-M4]
- [x] `README.md` at monorepo root is a public-facing README with: project description, module overview, quickstart (clone, install, configure MCP, run TUI), and links to architecture docs [US-M4]
- [x] `mcp/AGENTS.md` purpose statement and documentation use generic language (not person-specific) [US-M4]
- [x] AGENTS.md at monorepo root contains a documentation section referencing `docs/architecture/ARCHITECTURE.md` and `docs/architecture/mustard.flow.yaml` with a rule: "Update architecture docs and flow diagram when adding or changing modules, tools, or data flows" [US-M4]
- [x] `npm run build` succeeds in `mcp/` producing `mcp/dist/server.js` [US-M5]
- [x] `npm test` in `mcp/` passes all existing tests (tests use temp database, not live data) [US-M5]
- [x] A TUI verification test exists (script or test file) that opens a temp test database via tui/src/db.js and successfully queries records [US-M5]
- [x] A root-level `package.json` exists with a `test` script that orchestrates running mcp tests and tui verification [US-M5]
- [x] AGENTS.md directory layout section reflects the new monorepo structure (data/, mcp/, tui/) and module responsibilities [phase]

## Golden principles (phase-relevant)
- no-silent-pass
- no-bare-except
- error-path-coverage
- agents-consistency
