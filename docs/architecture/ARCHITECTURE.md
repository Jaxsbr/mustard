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

## Setup guide (planned for `monorepo-foundation` phase)

### MCP client configuration

Configure your MCP client to point to the mustard server:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "mustard": {
      "command": "node",
      "args": ["<mustard-root>/mcp/dist/server.js"]
    }
  }
}
```

**Cursor** (MCP settings):
```json
{
  "mustard": {
    "command": "node",
    "args": ["<mustard-root>/mcp/dist/server.js"]
  }
}
```

**Claude Code** (`.claude/settings.json` or project MCP config):
```json
{
  "mcpServers": {
    "mustard": {
      "command": "node",
      "args": ["<mustard-root>/mcp/dist/server.js"]
    }
  }
}
```

### Automated backups (macOS launchd)

Create `~/Library/LaunchAgents/com.mustard.backup.plist`:
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
    <string><!-- replace with absolute path -->/mustard/data/backup.sh</string>
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

Load with:
```bash
launchctl load ~/Library/LaunchAgents/com.mustard.backup.plist
```

### Automated backups (Linux cron)

```bash
crontab -e
# Add:
0 6 * * * /path/to/mustard/data/backup.sh
```
