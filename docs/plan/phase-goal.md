## Phase goal

Extract a shared `core/` TypeScript package from the existing MCP server, containing the database layer, all data operations (CRUD, search, links, context, summaries), and shared types. Migrate the TUI to consume `core/` instead of reaching into `mcp/node_modules`. This decouples consumers from the MCP server and makes the TUI independently installable.

### Stories in scope
- US-C1 — Create core package with database and schema layer
- US-C2 — Extract data operations and shared types into core
- US-C3 — Core test suite
- US-C4 — Migrate TUI to import core for reads

### Done-when (observable)

#### US-C1 — Core package scaffold
- [x] `core/package.json` exists with `name: "mustard-core"`, `type: "module"`, `better-sqlite3` in dependencies, and a `build` script [US-C1]
- [x] `core/tsconfig.json` exists targeting ES2022+ with ESM module output to `core/dist/` [US-C1]
- [x] `core/src/db.ts` exports `getDb`, `initSchema`, `checkFtsHealth`, `rebuildFts`, `closeDb` [US-C1]
- [x] `core/src/db.ts` `initSchema` creates identical tables, indexes, triggers, and runs identical migrations as `mcp/src/db.ts` (same CREATE TABLE, same CHECK constraints, same FTS5 config) [US-C1]
- [x] Root `package.json` has `"workspaces": ["core", "mcp", "tui"]` (or equivalent) [US-C1]
- [x] `npm run build` in `core/` succeeds and produces `core/dist/db.js` [US-C1]
- [x] `cd mcp && npm install && npm run build` still succeeds after workspace configuration [US-C1]

#### US-C2 — Data operations
- [x] `core/src/types.ts` exports `RecordRow`, `CreateParams`, `UpdateParams`, `SearchParams`, `ListParams`, `LinkParams`, `GetContextParams`, `ProjectSummaryParams` interfaces [US-C2]
- [x] `core/src/records.ts` exports `getRecord` returning `RecordRow | null` and `createRecord` returning `RecordRow` [US-C2]
- [x] `core/src/records.ts` exports `updateRecord` returning `RecordRow` and `deleteRecord` returning `{ id, log_type, title }` [US-C2]
- [x] `core/src/records.ts` rejects invalid `log_type` values and empty `text` with thrown errors [US-C2]
- [x] `core/src/search.ts` exports `searchRecords` returning `RecordRow[]` and `listRecords` returning `{ records: RecordRow[], total: number }` [US-C2]
- [x] `core/src/links.ts` exports `linkRecords` returning `{ id, source_id, target_id, relation }` and `unlinkRecords` returning `{ changes: number }` [US-C2]
- [x] `core/src/links.ts` rejects self-links (source_id === target_id) with a thrown error [US-C2]
- [x] `core/src/context.ts` exports `getContext` returning `{ anchors: RecordRow[], linked: LinkedRecord[] }` [US-C2]
- [x] `core/src/summary.ts` exports `dailySummary` and `projectSummary` returning structured data objects (not strings) [US-C2]
- [x] `core/src/index.ts` re-exports all public functions and types [US-C2]
- [x] `VALID_LOG_TYPES` and default status map are exported from core [US-C2]
- [x] `npm run build` in `core/` succeeds with all modules compiled [US-C2]

#### US-C3 — Core tests
- [x] `core/tests/db.test.ts` exists and tests schema creation on a fresh temp database (tables, indexes, FTS triggers all created) [US-C3]
- [x] `core/tests/records.test.ts` exists and tests create, get, update, delete with assertions on returned data shapes [US-C3]
- [x] `core/tests/search.test.ts` exists and tests FTS search and list with filter/sort params [US-C3]
- [x] `core/tests/links.test.ts` exists and tests link, unlink, self-link rejection, and idempotent link creation [US-C3]
- [x] `core/tests/context.test.ts` exists and tests getContext at depth 1 and depth 2 [US-C3]
- [x] `core/tests/summary.test.ts` exists and tests dailySummary and projectSummary with deterministic dates [US-C3]
- [x] `npm test` in `core/` runs all tests and all pass [US-C3]
- [x] Root `package.json` `test` script includes `core` package tests [US-C3]

#### US-C4 — TUI migration
- [x] `tui/src/db.js` imports `getDb` and `initSchema` (or equivalent read functions) from `mustard-core`, not from `mcp/node_modules` [US-C4]
- [x] `tui/package.json` has `"mustard-core": "*"` (or workspace protocol) in dependencies [US-C4]
- [x] `grep -r "mcp/node_modules" tui/` returns no matches [US-C4]
- [x] TUI opens database with `{ readonly: true }` (read-only safety boundary preserved) [US-C4]
- [x] TUI's per-type ordering (ORDER_BY map) and filtering (FILTER map) produce the same query results as before migration [US-C4]
- [x] `node tui/tests/db.test.js` passes (existing TUI verification test) [US-C4]
- [x] `cd tui && npm link` succeeds and `mustard` command launches without `mcp/` being built [US-C4]
- [x] README.md TUI setup section no longer mentions needing MCP installed first [US-C4]

#### Phase-level documentation
- [ ] `docs/architecture/ARCHITECTURE.md` system overview diagram includes `core/` between consumers (MCP, TUI) and SQLite [phase]
- [ ] `docs/architecture/ARCHITECTURE.md` directory layout includes `core/` with description [phase]
- [ ] `docs/architecture/ARCHITECTURE.md` module responsibilities table includes core (Role: shared data-access library, DB access: read/write, Language: TypeScript) [phase]
- [ ] `docs/architecture/mustard.flow.yaml` updated with core layer in the data flow [phase]
- [ ] `AGENTS.md` directory layout includes `core/` entry [phase]
- [ ] `AGENTS.md` module responsibilities table includes core [phase]
- [ ] Recommendations 1 and 4 in `docs/architecture/THESIS-2026-04-03-architectural-roadmap.md` are struck through with `~~strikethrough~~` [phase]

### Golden principles (phase-relevant)
- no-silent-pass — core tests must make real assertions on return values, not just "doesn't throw"
- no-bare-except — no empty catch blocks in core; errors propagate or are handled with specific recovery
- error-path-coverage — validation errors (invalid log_type, empty text, self-link) have explicit test coverage
- agents-consistency — AGENTS.md updated to reflect core/ addition
