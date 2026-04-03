## Phase goal

Integrate consumers with the shared core library. Create a new CLI package (`mustard` command) as a thin wrapper over core. Migrate the MCP server from inline SQL to core imports. Rename the TUI command from `mustard` to `mtui`. Update all documentation to reflect the new CLI, MCP migration, and TUI rename.

### Stories in scope
- US-I1 — Create CLI package with core dependency
- US-I2 — Migrate MCP tools to import core
- US-I3 — Rename TUI command from mustard to mtui
- US-I4 — CLI and MCP documentation and install guide

### Done-when (observable)

#### US-I1 — CLI package
- [x] `cli/package.json` exists with `name: "mustard-cli"`, `type: "module"`, `mustard-core` as workspace dependency, and `bin: { "mustard": "dist/index.js" }` [US-I1]
- [x] `cli/tsconfig.json` exists targeting ES2022+ with ESM module output to `cli/dist/` [US-I1]
- [x] `cli/src/index.ts` is the entry point with `#!/usr/bin/env node` shebang and a subcommand dispatcher [US-I1]
- [x] `mustard create --type todo --text "test"` creates a record via `core.createRecord` with `source_origin: 'mustard-cli'` and prints the created record [US-I1]
- [x] `mustard get <id>` fetches and displays a single record via `core.getRecord` [US-I1]
- [x] `mustard update <id> --status done` updates a record via `core.updateRecord` and prints the result [US-I1]
- [x] `mustard delete <id>` deletes a record via `core.deleteRecord` and prints confirmation [US-I1]
- [x] `mustard search "query"` runs FTS search via `core.searchRecords` with optional `--type`, `--person`, `--status`, `--limit` flags [US-I1]
- [x] `mustard list` lists records via `core.listRecords` with optional `--type`, `--person`, `--status`, `--delegate`, `--sort`, `--limit` flags [US-I1]
- [x] `mustard link <source> <target> --relation <rel>` creates a link via `core.linkRecords` [US-I1]
- [x] `mustard unlink <source> <target> --relation <rel>` removes a link via `core.unlinkRecords` [US-I1]
- [x] `mustard context <id>` retrieves context via `core.getContext` with optional `--depth`, `--since`, `--limit` flags [US-I1]
- [x] `mustard daily` runs daily summary via `core.dailySummary` with optional `--date` flag [US-I1]
- [x] `mustard project <id-or-title>` runs project summary via `core.projectSummary` [US-I1]
- [x] `mustard --help` prints usage with all subcommands listed [US-I1]
- [x] Each subcommand supports `--help` showing its flags [US-I1]
- [x] CLI exits with code 0 on success and code 1 on errors (invalid args, record not found, validation failure) [US-I1]
- [x] Root `package.json` workspaces array includes `cli` [US-I1]
- [x] `npm run build` in `cli/` succeeds and produces `cli/dist/index.js` [US-I1]
- [x] `cd cli && npm link` installs `mustard` command globally and it runs without error [US-I1]
- [x] CLI argument parsing rejects unknown flags with a helpful error message rather than silently ignoring them [US-I1]
- [x] CLI `--text` and `--title` values are passed through to core as-is — no shell interpolation or eval on user input [US-I1]

#### US-I2 — MCP migration to core
- [x] `mcp/package.json` lists `mustard-core` as a workspace dependency [US-I2]
- [x] `mcp/src/server.ts` imports `getDb`, `initSchema` from `mustard-core` instead of `./db.js` [US-I2]
- [x] `mcp/src/server.ts` imports data functions (`getRecord`, `createRecord`, `updateRecord`, `deleteRecord`, `searchRecords`, `listRecords`, `linkRecords`, `unlinkRecords`, `getContext`, `dailySummary`, `projectSummary`) from `mustard-core` [US-I2]
- [x] `mcp/src/server.ts` imports types (`RecordRow`, `CreateParams`, `SearchParams`, `ListParams`, `LinkParams`, `GetContextParams`, `ProjectSummaryParams`) from `mustard-core` [US-I2]
- [x] MCP tool handlers call core functions (which return typed objects) and format results into markdown text for MCP responses [US-I2]
- [x] `mcp/src/format.ts` exists with formatting functions (`formatRecordFull`, `formatRecordSummary`, `formatSearchResults`, `formatListResults`, `formatDailySummary`, `formatProjectSummary`, `formatContext`) that convert core typed objects to markdown strings [US-I2]
- [x] MCP `create_record` tool passes `source_origin: 'mustard-mcp'` to `core.createRecord` (consumer-specific value preserved) [US-I2]
- [x] `mcp/src/tools/` directory is deleted — all tool logic consolidated into `server.ts` calling core + format [US-I2]
- [x] `mcp/src/db.ts` is deleted — database access fully delegated to `mustard-core` [US-I2]
- [x] `better-sqlite3` removed from `mcp/package.json` dependencies (owned by core, not MCP) [US-I2]
- [x] `npm run build` in `mcp/` succeeds [US-I2]
- [x] Existing MCP test suite passes (or is updated to reflect new import paths) [US-I2]
- [x] All 11 MCP tools produce the same output format as before migration (backward-compatible) [US-I2]

#### US-I3 — TUI command rename
- [x] `tui/package.json` bin field changed from `"mustard"` to `"mtui"` [US-I3]
- [x] `cd tui && npm link` installs `mtui` command globally and it launches correctly [US-I3]
- [x] Running `mtui` opens the terminal browser with the same behavior as before [US-I3]

#### US-I4 — Documentation and install guide
- [ ] README.md has a "CLI installation" section with `cd cli && npm install && npm run build && npm link` instructions and example usage of at least 3 commands (create, search, list) [US-I4]
- [ ] README.md TUI section updated to reference `mtui` command instead of `mustard` [US-I4]
- [ ] README.md has a "Quick start for external users" section covering: clone, install, build, and configure MCP client + CLI [US-I4]
- [ ] `docs/architecture/ARCHITECTURE.md` system overview diagram includes `cli/` as a consumer of core alongside MCP and TUI [US-I4]
- [ ] `docs/architecture/ARCHITECTURE.md` directory layout includes `cli/` entry [US-I4]
- [ ] `docs/architecture/ARCHITECTURE.md` module responsibilities table includes CLI row (Role: shell interface, DB access: read/write via core, Language: TypeScript) [US-I4]
- [ ] `AGENTS.md` directory layout includes `cli/` entry [US-I4]
- [ ] `AGENTS.md` module responsibilities table includes CLI row [US-I4]
- [ ] Recommendations 2 and 3 in `docs/architecture/THESIS-2026-04-03-architectural-roadmap.md` are struck through with `~~strikethrough~~` [US-I4]

### Golden principles (phase-relevant)
- no-silent-pass — CLI and MCP tests must assert on actual output, not just "doesn't throw"
- error-path-coverage — validation errors (invalid type, missing text, record not found) have test coverage in CLI
- agents-consistency — AGENTS.md updated to reflect cli/ addition and TUI rename
