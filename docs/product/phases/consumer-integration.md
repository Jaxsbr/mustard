# Phase: consumer-integration

Status: shipped

## Stories

### US-I1 — Create CLI package with core dependency

As a user or scheduled agent, I want a `mustard` shell command that provides direct read/write access to the mustard knowledge store, so that I can create, search, update, and delete records without depending on MCP server availability.

**Acceptance criteria:**
- `cli/` exists as a TypeScript ESM package with `mustard-core` as a workspace dependency
- CLI binary is named `mustard` (installable via `npm link`)
- Subcommands cover all core operations: create, get, update, delete, search, list, link, unlink, context, daily, project
- Each subcommand accepts flags matching the core function parameters
- CLI passes `source_origin: 'mustard-cli'` to distinguish records created via CLI
- Output is human-readable terminal text (not markdown for AI consumption)
- `--help` available at top level and per subcommand
- Exits with code 0 on success, code 1 on error

**User guidance:**
- Discovery: Run `mustard --help` from any terminal after installation
- Manual section: README.md "CLI installation" section (new)
- Key steps: 1. `cd mustard/cli && npm install && npm run build && npm link`. 2. Run `mustard list --type todo` to see open todos. 3. Run `mustard create --type todo --text "My task"` to create a record.

**Design rationale:** The CLI is a thin arg-parsing wrapper over core — no business logic lives in the CLI itself. This keeps the CLI simple and ensures all validation runs through the same core path as MCP and TUI. `source_origin: 'mustard-cli'` is the consumer-specific value that distinguishes CLI-created records in queries and auditing.

**Consumer adaptation:**
- `source_origin`: CLI passes `'mustard-cli'` (vs MCP's `'mustard-mcp'`, core default `'mustard-core'`)
- Output formatting: CLI formats for human terminal consumption (plain text with alignment), not markdown
- Database path: CLI uses core's `getDb()` which resolves `MUSTARD_DB` env var or defaults to `data/mustard.db` relative to monorepo root

### US-I2 — Migrate MCP tools to import core

As the maintainer, I want the MCP server's 11 tools to call `mustard-core` functions instead of using inline SQL, so that validation, types, and data operations are not duplicated across consumers.

**Acceptance criteria:**
- `mcp/package.json` lists `mustard-core` as a workspace dependency
- `server.ts` imports db functions and data operations from `mustard-core`
- All 11 tool handlers call core functions and format results for MCP responses
- A `format.ts` module handles typed-object-to-markdown conversion
- `mcp/src/tools/` directory and `mcp/src/db.ts` are deleted (no more duplicate code)
- `better-sqlite3` removed from MCP's direct dependencies (owned by core)
- MCP `create_record` passes `source_origin: 'mustard-mcp'` to core
- All 11 tools produce the same output format as before (backward-compatible)
- Existing MCP tests pass or are updated for new import paths

**User guidance:** N/A — internal refactor. MCP clients see no change in tool behavior.

**Design rationale:** The MCP server becomes a thin transport layer: Zod schema validation on input (MCP SDK), core for data operations, format.ts for presentation. The `tools/` directory is removed entirely rather than leaving thin wrapper files — `server.ts` is already the natural place for tool registration and the handlers are one-liners after the migration. Removing `better-sqlite3` from MCP's package.json is safe because core owns it and npm workspaces hoist it.

**Consumer adaptation:**
- `source_origin`: MCP passes `'mustard-mcp'` to `core.createRecord` (preserving existing behavior)
- Formatting: `format.ts` converts core's typed objects to the same markdown format MCP tools produce today
- Error handling: Core throws on validation errors; MCP tool handlers catch and return error text in MCP response format (same user-facing behavior as current string-return pattern)

### US-I3 — Rename TUI command from mustard to mtui

As a user, I want the TUI browser accessible via `mtui` command, so that the shorter `mustard` command is available for the read/write CLI which is more frequently used.

**Acceptance criteria:**
- `tui/package.json` bin field changed from `"mustard"` to `"mtui"`
- `npm link` from `tui/` installs `mtui` command
- `mtui` launches the terminal browser with identical behavior

**User guidance:**
- Discovery: Run `mtui` from any terminal (was `mustard`)
- Manual section: README.md TUI section (update existing)
- Key steps: 1. `cd mustard/tui && npm link`. 2. Run `mtui` from any terminal. Note: if you had the old `mustard` command linked, run `npm unlink -g mustard-tui` first.

**Design rationale:** The read/write CLI is the more natural owner of the `mustard` name — it's used more frequently (by both humans and agents) and covers the full operation set. The TUI is a specialized read-only browser that gets a shorter alias `mtui` (mustard TUI).

### US-I4 — CLI and MCP documentation and install guide

As an external user cloning the repo, I want clear installation instructions for the CLI and MCP server, so that I can set up mustard without reading source code.

**Acceptance criteria:**
- README.md has CLI installation section with build + link instructions and example commands
- README.md TUI section references `mtui` command
- README.md has a quick-start section covering clone → install → build → configure for external users
- ARCHITECTURE.md includes CLI in system overview, directory layout, and module table
- AGENTS.md directory layout and module table include CLI
- Thesis recommendations 2 and 3 struck through

**User guidance:**
- Discovery: README.md at repository root
- Manual section: README.md (update existing sections + add new CLI section)
- Key steps: 1. Read README.md "Quick start" section. 2. Follow CLI install instructions. 3. Configure MCP client if using AI agents.

**Design rationale:** The README is the entry point for external users. Separating CLI and MCP setup instructions (rather than a single "install everything" block) lets users install only what they need — a scheduled agent only needs CLI, an AI client only needs MCP.

## Done-when (observable)

### US-I1 — CLI package

- [ ] `cli/package.json` exists with `name: "mustard-cli"`, `type: "module"`, `mustard-core` as workspace dependency, and `bin: { "mustard": "dist/index.js" }` [US-I1]
- [ ] `cli/tsconfig.json` exists targeting ES2022+ with ESM module output to `cli/dist/` [US-I1]
- [ ] `cli/src/index.ts` is the entry point with `#!/usr/bin/env node` shebang and a subcommand dispatcher [US-I1]
- [ ] `mustard create --type todo --text "test"` creates a record via `core.createRecord` with `source_origin: 'mustard-cli'` and prints the created record [US-I1]
- [ ] `mustard get <id>` fetches and displays a single record via `core.getRecord` [US-I1]
- [ ] `mustard update <id> --status done` updates a record via `core.updateRecord` and prints the result [US-I1]
- [ ] `mustard delete <id>` deletes a record via `core.deleteRecord` and prints confirmation [US-I1]
- [ ] `mustard search "query"` runs FTS search via `core.searchRecords` with optional `--type`, `--person`, `--status`, `--limit` flags [US-I1]
- [ ] `mustard list` lists records via `core.listRecords` with optional `--type`, `--person`, `--status`, `--delegate`, `--sort`, `--limit` flags [US-I1]
- [ ] `mustard link <source> <target> --relation <rel>` creates a link via `core.linkRecords` [US-I1]
- [ ] `mustard unlink <source> <target> --relation <rel>` removes a link via `core.unlinkRecords` [US-I1]
- [ ] `mustard context <id>` retrieves context via `core.getContext` with optional `--depth`, `--since`, `--limit` flags [US-I1]
- [ ] `mustard daily` runs daily summary via `core.dailySummary` with optional `--date` flag [US-I1]
- [ ] `mustard project <id-or-title>` runs project summary via `core.projectSummary` [US-I1]
- [ ] `mustard --help` prints usage with all subcommands listed [US-I1]
- [ ] Each subcommand supports `--help` showing its flags [US-I1]
- [ ] CLI exits with code 0 on success and code 1 on errors (invalid args, record not found, validation failure) [US-I1]
- [ ] Root `package.json` workspaces array includes `cli` [US-I1]
- [ ] `npm run build` in `cli/` succeeds and produces `cli/dist/index.js` [US-I1]
- [ ] `cd cli && npm link` installs `mustard` command globally and it runs without error [US-I1]

### US-I2 — MCP migration to core

- [ ] `mcp/package.json` lists `mustard-core` as a workspace dependency [US-I2]
- [ ] `mcp/src/server.ts` imports `getDb`, `initSchema` from `mustard-core` instead of `./db.js` [US-I2]
- [ ] `mcp/src/server.ts` imports data functions (`getRecord`, `createRecord`, `updateRecord`, `deleteRecord`, `searchRecords`, `listRecords`, `linkRecords`, `unlinkRecords`, `getContext`, `dailySummary`, `projectSummary`) from `mustard-core` [US-I2]
- [ ] `mcp/src/server.ts` imports types (`RecordRow`, `CreateParams`, `SearchParams`, `ListParams`, `LinkParams`, `GetContextParams`, `ProjectSummaryParams`) from `mustard-core` [US-I2]
- [ ] MCP tool handlers call core functions (which return typed objects) and format results into markdown text for MCP responses [US-I2]
- [ ] `mcp/src/format.ts` exists with formatting functions (`formatRecordFull`, `formatRecordSummary`, `formatSearchResults`, `formatListResults`, `formatDailySummary`, `formatProjectSummary`, `formatContext`) that convert core typed objects to markdown strings [US-I2]
- [ ] MCP `create_record` tool passes `source_origin: 'mustard-mcp'` to `core.createRecord` (consumer-specific value preserved) [US-I2]
- [ ] `mcp/src/tools/` directory is deleted — all tool logic consolidated into `server.ts` calling core + format [US-I2]
- [ ] `mcp/src/db.ts` is deleted — database access fully delegated to `mustard-core` [US-I2]
- [ ] `better-sqlite3` removed from `mcp/package.json` dependencies (owned by core, not MCP) [US-I2]
- [ ] `npm run build` in `mcp/` succeeds [US-I2]
- [ ] Existing MCP test suite passes (or is updated to reflect new import paths) [US-I2]
- [ ] All 11 MCP tools produce the same output format as before migration (backward-compatible) [US-I2]

### US-I3 — TUI command rename

- [ ] `tui/package.json` bin field changed from `"mustard"` to `"mtui"` [US-I3]
- [ ] `cd tui && npm link` installs `mtui` command globally and it launches correctly [US-I3]
- [ ] Running `mtui` opens the terminal browser with the same behavior as before [US-I3]

### US-I4 — Documentation and install guide

- [ ] README.md has a "CLI installation" section with `cd cli && npm install && npm run build && npm link` instructions and example usage of at least 3 commands (create, search, list) [US-I4]
- [ ] README.md TUI section updated to reference `mtui` command instead of `mustard` [US-I4]
- [ ] README.md has a "Quick start for external users" section covering: clone, install, build, and configure MCP client + CLI [US-I4]
- [ ] `docs/architecture/ARCHITECTURE.md` system overview diagram includes `cli/` as a consumer of core alongside MCP and TUI [US-I4]
- [ ] `docs/architecture/ARCHITECTURE.md` directory layout includes `cli/` entry [US-I4]
- [ ] `docs/architecture/ARCHITECTURE.md` module responsibilities table includes CLI row (Role: shell interface, DB access: read/write via core, Language: TypeScript) [US-I4]
- [ ] `AGENTS.md` directory layout includes `cli/` entry [US-I4]
- [ ] `AGENTS.md` module responsibilities table includes CLI row [US-I4]
- [ ] Recommendations 2 and 3 in `docs/architecture/THESIS-2026-04-03-architectural-roadmap.md` are struck through with `~~strikethrough~~` [US-I4]

### Auto-added safety criteria

- [ ] CLI argument parsing rejects unknown flags with a helpful error message rather than silently ignoring them [US-I1]
- [ ] CLI `--text` and `--title` values are passed through to core as-is — no shell interpolation or eval on user input [US-I1]

## AGENTS.md sections affected
- Directory layout (new `cli/` entry)
- Module responsibilities table (new CLI row)
- TUI references (command name `mustard` → `mtui`)

## User documentation impact
- README.md: New CLI installation section, updated TUI section (`mtui`), new quick-start section
- ARCHITECTURE.md: System overview, directory layout, module table — add CLI
- Thesis: Strike through recommendations 2 and 3

## Golden principles (phase-relevant)
- no-silent-pass — CLI and MCP tests must assert on actual output, not just "doesn't throw"
- error-path-coverage — validation errors (invalid type, missing text, record not found) have test coverage in CLI
- agents-consistency — AGENTS.md updated to reflect cli/ addition and TUI rename
