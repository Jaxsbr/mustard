# Phase: core-extraction

Status: shipped

## Stories

### US-C1 — Create core package with database and schema layer [Shipped]

As the maintainer, I want the database connection, schema initialization, migrations, and FTS management extracted into a standalone `core/` TypeScript package, so that any consumer (TUI, CLI, future API) can access mustard data without depending on the MCP server.

**Acceptance criteria:**
- `core/` exists as a TypeScript ESM package with its own `package.json`, `tsconfig.json`, and `better-sqlite3` as a direct dependency
- `core/src/db.ts` exports `getDb`, `initSchema`, `checkFtsHealth`, `rebuildFts`, `closeDb` with identical schema and migration logic to `mcp/src/db.ts`
- Root `package.json` configures npm workspaces including `core/`, `mcp/`, and `tui/`
- `npm run build` in `core/` produces `core/dist/` with compiled ESM output
- Existing `npm install && npm run build` in `mcp/` still works after workspace configuration

**User guidance:** N/A — internal structural change

**Design rationale:** Core owns `better-sqlite3` directly — this eliminates TUI's fragile `createRequire` hack into `mcp/node_modules` and gives every consumer a clean dependency path. npm workspaces is chosen over `file:` references because it handles hoisting and deduplication automatically.

### US-C2 — Extract data operations and shared types into core [Shipped]

As the maintainer, I want all record operations (CRUD, search, links, context, summaries) and shared types extracted into `core/`, returning typed data objects rather than formatted strings, so that consumers can query mustard data and handle presentation independently.

**Acceptance criteria:**
- `core/src/types.ts` exports shared interfaces: `RecordRow`, `CreateParams`, `UpdateParams`, `SearchParams`, `ListParams`, `LinkParams`, `GetContextParams`, `ProjectSummaryParams`
- `core/src/records.ts` exports `getRecord` (returns `RecordRow | null`), `createRecord` (returns `RecordRow`), `updateRecord` (returns `RecordRow`), `deleteRecord` (returns `{ id, log_type, title }`)
- `core/src/search.ts` exports `searchRecords` (returns `RecordRow[]`), `listRecords` (returns `{ records: RecordRow[], total: number }`)
- `core/src/links.ts` exports `linkRecords` (returns `{ id, source_id, target_id, relation }`), `unlinkRecords` (returns `{ changes: number }`)
- `core/src/context.ts` exports `getContext` (returns `{ anchors: RecordRow[], linked: LinkedRecord[] }`)
- `core/src/summary.ts` exports `dailySummary`, `projectSummary` (return structured data objects, not markdown strings)
- `core/src/index.ts` re-exports the full public API
- Validation constants (`VALID_LOG_TYPES`, default status map) live in core and are exported
- All functions accept a `db: Database.Database` parameter (same pattern as current MCP tools)

**User guidance:** N/A — internal extraction

**Design rationale:** Returning typed data objects instead of formatted markdown strings is the key design choice. MCP tools format for AI consumption, TUI formats for terminal rendering — presentation is consumer-specific. Keeping `db` as an explicit parameter (not hidden in a singleton) makes functions testable and allows consumers to control connection lifecycle (e.g., TUI opens read-only).

### US-C3 — Core test suite [Shipped]

As the maintainer, I want a comprehensive test suite for the core package verifying all extracted functionality against temp databases, so that core can be developed and released independently of MCP.

**Acceptance criteria:**
- `core/tests/` contains test files covering: db init (schema creation, migrations, FTS triggers), CRUD (create, read, update, delete with validation), search (FTS match, filters), links (link, unlink, self-link rejection, idempotent link), context retrieval (depth 1 and 2), summaries (daily, project)
- All tests use temporary in-memory or temp-file databases, not live data
- `npm test` in `core/` passes with all tests green
- Root `package.json` test script includes core tests
- Tests make real assertions on return values (no silent pass)

**User guidance:** N/A — internal testing

**Design rationale:** Core is the foundation for all consumers — it needs its own test suite independent of MCP's tests. Testing against temp databases ensures tests are fast, isolated, and safe to run in CI.

### US-C4 — Migrate TUI to import core for reads [Shipped]

As a user running the TUI, I want `mustard` to work without needing MCP installed first, so that the TUI is independently installable.

**Acceptance criteria:**
- `tui/src/db.js` imports database and query functions from `mustard-core` (workspace package) instead of using `createRequire` into `mcp/node_modules`
- `tui/package.json` lists `mustard-core` as a dependency (workspace reference)
- No reference to `mcp/node_modules` exists anywhere in `tui/`
- TUI opens database in read-only mode (existing safety boundary preserved)
- TUI's per-type ordering and filtering logic (FILTER, ORDER_BY maps) is preserved
- `npm link` from `tui/` works and `mustard` command runs without `mcp/` being built
- Existing TUI verification tests pass

**User guidance:**
- Discovery: Run `mustard` command from any terminal (unchanged)
- Manual section: README.md setup guide (TUI installation section — update to remove "install MCP dependencies first" note)
- Key steps: 1. `cd mustard/tui && npm link`. 2. Run `mustard` from any terminal. MCP no longer needs to be built first.

**Design rationale:** This is the concrete proof that the core extraction works — TUI goes from a fragile cross-package hack to a clean workspace dependency. The read-only boundary is preserved by having TUI open the db connection with `{ readonly: true }` at the TUI layer, not in core (core supports both read and write).

## Done-when (observable)

### US-C1 — Core package scaffold
- [x] `core/package.json` exists with `name: "mustard-core"`, `type: "module"`, `better-sqlite3` in dependencies, and a `build` script [US-C1]
- [x] `core/tsconfig.json` exists targeting ES2022+ with ESM module output to `core/dist/` [US-C1]
- [x] `core/src/db.ts` exports `getDb`, `initSchema`, `checkFtsHealth`, `rebuildFts`, `closeDb` [US-C1]
- [x] `core/src/db.ts` `initSchema` creates identical tables, indexes, triggers, and runs identical migrations as `mcp/src/db.ts` (same CREATE TABLE, same CHECK constraints, same FTS5 config) [US-C1]
- [x] Root `package.json` has `"workspaces": ["core", "mcp", "tui"]` (or equivalent) [US-C1]
- [x] `npm run build` in `core/` succeeds and produces `core/dist/db.js` [US-C1]
- [x] `cd mcp && npm install && npm run build` still succeeds after workspace configuration [US-C1]

### US-C2 — Data operations
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

### US-C3 — Core tests
- [x] `core/tests/db.test.ts` exists and tests schema creation on a fresh temp database (tables, indexes, FTS triggers all created) [US-C3]
- [x] `core/tests/records.test.ts` exists and tests create, get, update, delete with assertions on returned data shapes [US-C3]
- [x] `core/tests/search.test.ts` exists and tests FTS search and list with filter/sort params [US-C3]
- [x] `core/tests/links.test.ts` exists and tests link, unlink, self-link rejection, and idempotent link creation [US-C3]
- [x] `core/tests/context.test.ts` exists and tests getContext at depth 1 and depth 2 [US-C3]
- [x] `core/tests/summary.test.ts` exists and tests dailySummary and projectSummary with deterministic dates [US-C3]
- [x] `npm test` in `core/` runs all tests and all pass [US-C3]
- [x] Root `package.json` `test` script includes `core` package tests [US-C3]

### US-C4 — TUI migration
- [x] `tui/src/db.js` imports `getDb` and `initSchema` (or equivalent read functions) from `mustard-core`, not from `mcp/node_modules` [US-C4]
- [x] `tui/package.json` has `"mustard-core": "*"` (or workspace protocol) in dependencies [US-C4]
- [x] `grep -r "mcp/node_modules" tui/` returns no matches [US-C4]
- [x] TUI opens database with `{ readonly: true }` (read-only safety boundary preserved) [US-C4]
- [x] TUI's per-type ordering (ORDER_BY map) and filtering (FILTER map) produce the same query results as before migration [US-C4]
- [x] `node tui/tests/db.test.js` passes (existing TUI verification test) [US-C4]
- [x] `cd tui && npm link` succeeds and `mustard` command launches without `mcp/` being built [US-C4]
- [x] README.md TUI setup section no longer mentions needing MCP installed first [US-C4]

### Phase-level documentation
- [x] `docs/architecture/ARCHITECTURE.md` system overview diagram includes `core/` between consumers (MCP, TUI) and SQLite [phase]
- [x] `docs/architecture/ARCHITECTURE.md` directory layout includes `core/` with description [phase]
- [x] `docs/architecture/ARCHITECTURE.md` module responsibilities table includes core (Role: shared data-access library, DB access: read/write, Language: TypeScript) [phase]
- [x] `docs/architecture/mustard.flow.yaml` updated with core layer in the data flow [phase]
- [x] `AGENTS.md` directory layout includes `core/` entry [phase]
- [x] `AGENTS.md` module responsibilities table includes core [phase]
- [x] Recommendations 1 and 4 in `docs/architecture/THESIS-2026-04-03-architectural-roadmap.md` are struck through with `~~strikethrough~~` [phase]

## AGENTS.md sections affected
- Directory layout (new `core/` entry)
- Module responsibilities table (new core row)
- Quality checks (core tests added to root test script)

## User documentation impact
- README.md: TUI installation section — remove "install MCP dependencies first" note
- ARCHITECTURE.md: system overview, directory layout, module table — add core

## Golden principles (phase-relevant)
- no-silent-pass — core tests must make real assertions on return values, not just "doesn't throw"
- no-bare-except — no empty catch blocks in core; errors propagate or are handled with specific recovery
- error-path-coverage — validation errors (invalid log_type, empty text, self-link) have explicit test coverage
- agents-consistency — AGENTS.md updated to reflect core/ addition
