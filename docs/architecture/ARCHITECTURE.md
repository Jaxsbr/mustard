# Mustard — Architecture

> This document is the structural intent for the monorepo. Sections marked "(planned for `monorepo-foundation` phase)" describe the target state after the first build phase ships.

## System overview

Mustard is a personal knowledge store backed by SQLite, accessed via MCP (Model Context Protocol) and a terminal UI.

```
MCP Clients (Claude Desktop / Cursor / Claude Code)
  ↓ MCP (STDIO)
Mustard MCP Server (TypeScript)          Mustard TUI (Node.js)
  ↓ better-sqlite3 (read/write)           ↓ better-sqlite3 (read-only)
SQLite Database (data/mustard.db)
  ├── records table (6 types, unified)
  ├── links table (knowledge graph)
  └── records_fts (FTS5 full-text search)
```

See `mustard.flow.yaml` in this directory for the visual flow-mo diagram. **Update `mustard.flow.yaml` when adding modules, tools, or data flows.**

## Monorepo structure (planned for `monorepo-foundation` phase)

```
mustard/
├── data/               — SQLite database, backup script, data docs
│   ├── mustard.db      — (gitignored) live database
│   ├── backups/        — (gitignored) timestamped snapshots
│   ├── backup.sh       — daily backup script
│   └── docs/           — data-layer documentation, incident reports
├── mcp/                — TypeScript MCP server
│   ├── src/
│   │   ├── server.ts   — MCP server setup, tool registration, STDIO transport
│   │   ├── db.ts       — SQLite connection, schema init, FTS triggers, migrations
│   │   └── tools/      — Tool implementations (crud, search, links, context, summary)
│   ├── tests/          — Vitest test suite
│   ├── dist/           — (gitignored) compiled output
│   ├── package.json
│   └── AGENTS.md
├── tui/                — Node.js terminal UI
│   ├── src/
│   │   ├── index.js    — Main entry, keyboard handling, state management
│   │   ├── db.js       — SQLite read-only connection
│   │   └── render.js   — Terminal rendering, tab bar, list/detail/expand views
│   └── package.json
├── docs/
│   ├── architecture/   — This file + flow-mo diagram
│   └── product/        — PRD + per-phase specs
├── .gitignore
├── package.json        — Root convenience scripts (test orchestration)
├── AGENTS.md           — Project-level agent rules
└── README.md           — Public-facing quickstart
```

## Module responsibilities

| Module | Role | DB access | Language |
|--------|------|-----------|----------|
| **data** | Persistence layer — hosts the SQLite database and backup infrastructure | N/A (is the database) | Bash (backup script) |
| **mcp** | MCP server — exposes 11 tools for CRUD, search, linking, context retrieval, and summaries | Read/write | TypeScript |
| **tui** | Terminal browser — arrow-key TUI with tabs per record type, detail views, text expansion | Read-only | JavaScript (Node.js) |

## Data model

### Records table

All record types share a single `records` table. The `log_type` column discriminates.

| Type | Purpose | Status lifecycle | Key fields |
|------|---------|-----------------|------------|
| `todo` | Tasks with tracking | open → done | due_date, category, delegate |
| `people_note` | Person-specific context | logged | person (slug) |
| `idea` | Concepts and patterns | open → exploring → captured | source_url |
| `daily_log` | Session/day reflections | logged | theme, period |
| `project` | Project containers | open → done | — |
| `learning` | Processed external sources | captured → processed → applied | source_url |

### Links table

Any-to-any connections between records forming the knowledge graph. Freeform relation types (not an enum). UNIQUE(source_id, target_id, relation). Self-links rejected. ON DELETE CASCADE.

### Recommended relation types

| Relation | From → To | Meaning |
|----------|-----------|---------|
| `member_of` | person → project | Person is on the team |
| `assigned_to` | todo → project | Task belongs to a project |
| `related_to` | any → any | Generic connection |
| `inspired_by` | idea → source | Idea origin |
| `blocked_by` | todo → blocker | Blocking relationship |
| `extracted_from` | idea → learning | Concept from a source |
| `experiment_for` | todo → idea | Task to try a concept |

### Full-text search

FTS5 virtual table indexes: title, text, person, tags, source_url. Triggers auto-sync on INSERT, UPDATE, DELETE.

## MCP tools

| Tool | Purpose |
|------|---------|
| search_records | FTS5 full-text search with type/person/status filters |
| list_records | Browse by type, person, status, delegate with sort/limit |
| get_record | Fetch single record by UUID |
| create_record | Create any record type |
| update_record | Partial field update |
| delete_record | Delete record (cascade-deletes links) |
| link_records | Create typed connection (idempotent) |
| unlink_records | Remove a connection |
| get_context | Record + linked records (depth 1-2, date filter, limit) |
| project_summary | Structured project overview (team, todos, activity, ideas) |
| daily_summary | Daily overview (overdue, due today, open, logs, recent) |

## Backup infrastructure

Daily automated backups via launchd (macOS) or cron.

1. **WAL checkpoint** — flushes write-ahead log for consistent snapshot
2. **Copy** — timestamped backup to `data/backups/`
3. **Verify** — integrity check + non-zero record count
4. **Prune** — delete backups older than 7 days

See the setup guide below for configuration.

## Setup guide

### Prerequisites

- Node.js >= 20
- npm

### 1. Install and build

```bash
cd mustard
cd mcp && npm install && npm run build && cd ..
```

Verify: `node mcp/dist/server.js` should print "Mustard MCP server running on stdio" (Ctrl+C to exit).

### 2. MCP client configuration

Every MCP client needs the **absolute path** to `mcp/dist/server.js`. Find yours with:

```bash
echo "$(cd mustard && pwd)/mcp/dist/server.js"
```

Replace `/absolute/path/to/mustard` in the examples below with your actual path.

**Claude Desktop** — edit `~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mustard": {
      "command": "node",
      "args": ["/absolute/path/to/mustard/mcp/dist/server.js"]
    }
  }
}
```
Quit and relaunch Claude Desktop (Cmd+Q — closing the window is not enough).

**Claude Code** — edit `.mcp.json` in your project root (the directory you run `claude` from):
```json
{
  "mcpServers": {
    "mustard": {
      "command": "node",
      "args": ["/absolute/path/to/mustard/mcp/dist/server.js"]
    }
  }
}
```
Restart Claude Code. Run `/mcp` to verify mustard shows as connected.

**Cursor** — edit `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "mustard": {
      "command": "node",
      "args": ["/absolute/path/to/mustard/mcp/dist/server.js"]
    }
  }
}
```
Restart Cursor.

> **Troubleshooting:** If the server shows as "failed" in your client, run `node /absolute/path/to/mustard/mcp/dist/server.js` in a terminal. If you see a module error, run `cd mcp && npm install && npm run build`. If the path is wrong, the client will silently fail to connect.

> **No MUSTARD_DB needed.** The server auto-resolves the database path to `data/mustard.db` relative to the monorepo root. Override with `MUSTARD_DB=/path/to/db` env var only if you need a custom location.

### 3. TUI installation (optional)

The terminal UI lets you browse records with an arrow-key interface.

```bash
cd mustard/tui
npm link
```

This installs the `mustard` command globally. Run from any terminal:

```bash
mustard
```

> **Note:** `npm link` creates a symlink. If you move the mustard directory, run `npm link` again from `tui/`. The TUI depends on `better-sqlite3` from `mcp/node_modules` — install MCP dependencies first.

### 4. Database

The MCP server creates `data/mustard.db` automatically on first connection. If you have an existing mustard database, copy it to `data/mustard.db`.

### 5. Automated backups (optional)

**macOS (launchd)** — create `~/Library/LaunchAgents/com.mustard.backup.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.mustard.backup</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/absolute/path/to/mustard/data/backup.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>6</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
</dict>
</plist>
```

Replace `/absolute/path/to/mustard` with your actual path, then load:
```bash
launchctl load ~/Library/LaunchAgents/com.mustard.backup.plist
```

**Linux (cron):**
```bash
crontab -e
# Add (replace path):
0 6 * * * /absolute/path/to/mustard/data/backup.sh
```

The backup script uses script-relative paths — it finds the database automatically. It checkpoints WAL, copies a timestamped snapshot to `data/backups/`, verifies integrity, and prunes backups older than 7 days.
