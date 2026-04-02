## Phase goal

Consolidate the existing mustard-data, mustard-mcp, and mustard-tui satellite repositories into a single monorepo structure. Port all modules as subdirectories, update internal path resolution, protect sensitive data with gitignore, add comprehensive documentation with a flow-mo diagram, and verify the migration with integration tests.

### Stories in scope
- US-M1 — Port modules into monorepo
- US-M2 — Update database path resolution
- US-M3 — Protect sensitive data with gitignore
- US-M4 — Documentation, flow-mo diagram, and public readiness
- US-M5 — Monorepo verification tests

### Done-when (observable)
- [x] `data/` directory exists in monorepo root containing backup.sh, docs/ (database files are gitignored but present on disk) [US-M1]
- [x] `mcp/` directory exists in monorepo root with full TypeScript MCP server source, package.json, tsconfig.json, vitest.config.ts, tests/ [US-M1]
- [x] `tui/` directory exists in monorepo root with TUI source (src/index.js, src/db.js, src/render.js) and package.json [US-M1]
- [x] No `.git` directory exists inside `data/`, `mcp/`, or `tui/` (verified: `find data mcp tui -name .git -type d` returns empty) [US-M1]
- [x] `~/dev/archived/mustard-data`, `~/dev/archived/mustard-mcp`, `~/dev/archived/mustard-tui` exist with original contents including .git directories [US-M1]
- [ ] `mcp/src/db.ts` DEFAULT_DB_PATH resolves to `<monorepo-root>/data/mustard.db` using `import.meta.url` or `path.resolve(__dirname)` relative navigation [US-M2]
- [ ] `tui/src/db.js` DB_PATH resolves to `<monorepo-root>/data/mustard.db` using relative path from module location [US-M2]
- [ ] `MUSTARD_DB` environment variable override still works in both mcp/src/db.ts and tui/src/db.js (existing code path preserved) [US-M2]
- [ ] `data/backup.sh` DB_PATH and BACKUP_DIR variables reference the monorepo data directory using script-relative paths (not hardcoded absolute) [US-M2]
- [ ] Root `.gitignore` contains patterns: `data/*.db`, `data/*.db-shm`, `data/*.db-wal`, `data/*.db.corrupt*`, `data/backups/` [US-M3]
- [ ] Root `.gitignore` contains patterns: `mcp/node_modules/`, `mcp/dist/`, `tui/node_modules/` [US-M3]
- [ ] Running `git status` in the monorepo after file copy shows no .db files, no .db-shm/.db-wal files, no backup files as untracked (test: `git status --porcelain | grep -c '\.db'` returns 0) [US-M3]
- [ ] `docs/architecture/ARCHITECTURE.md` exists documenting: monorepo directory layout, module responsibilities (data, mcp, tui), data model (records + links tables), MCP tool inventory (11 tools), backup infrastructure [US-M4]
- [ ] `docs/architecture/mustard.flow.yaml` exists as a valid flow-mo v1 diagram covering: MCP clients (Claude Desktop, Cursor, Claude Code), MCP server, TUI, SQLite data layer (records, links, FTS5), backup system [US-M4]
- [ ] Architecture doc contains a section referencing the flow-mo diagram with an explicit update rule: "Update mustard.flow.yaml when adding modules, tools, or data flows" [US-M4]
- [ ] `docs/architecture/ARCHITECTURE.md` includes a "Setup guide" section documenting: how to configure automated backups (launchd/cron with example plist), how to configure MCP clients (Claude Desktop, Cursor, Claude Code — with example config snippets pointing to `mcp/dist/server.js`) [US-M4]
- [ ] All documentation uses generic language — no person-specific names, slugs, or paths; examples use placeholders like "alice", "project-x" instead of real people; paths use `<mustard-root>` notation [US-M4]
- [ ] `README.md` at monorepo root is a public-facing README with: project description, module overview, quickstart (clone, install, configure MCP, run TUI), and links to architecture docs [US-M4]
- [ ] `mcp/AGENTS.md` purpose statement and documentation use generic language (not person-specific) [US-M4]
- [ ] AGENTS.md at monorepo root contains a documentation section referencing `docs/architecture/ARCHITECTURE.md` and `docs/architecture/mustard.flow.yaml` with a rule: "Update architecture docs and flow diagram when adding or changing modules, tools, or data flows" [US-M4]
- [ ] `npm run build` succeeds in `mcp/` producing `mcp/dist/server.js` [US-M5]
- [ ] `npm test` in `mcp/` passes all existing tests (tests use temp database, not live data) [US-M5]
- [ ] A TUI verification test exists (script or test file) that opens a temp test database via tui/src/db.js and successfully queries records [US-M5]
- [ ] A root-level `package.json` exists with a `test` script that orchestrates running mcp tests and tui verification [US-M5]
- [ ] AGENTS.md directory layout section reflects the new monorepo structure (data/, mcp/, tui/) and module responsibilities [phase]

### Golden principles (phase-relevant)
- no-silent-pass: Test files must not have early returns before assertions
- no-bare-except: No exception swallowing without logging
- error-path-coverage: New or modified endpoints must have at least one error-path test
- agents-consistency: AGENTS.md must accurately reflect the current project structure and rules
