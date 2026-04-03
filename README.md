# Mustard

A personal knowledge store accessed by AI agents via MCP (Model Context Protocol). Track todos, people notes, ideas, daily logs, projects, and learnings in a single SQLite database. A knowledge graph connects records to each other, enabling context-aware retrieval.

## Modules

| Module | Description |
|---|---|
| `core/` | Shared data-access library — db, schema, CRUD, search, links, context, summaries |
| `cli/` | CLI binary (`mustard` command) — thin wrapper over core for humans and scheduled agents |
| `data/` | SQLite database, backup script, data documentation |
| `mcp/` | TypeScript MCP server — 11 tools via STDIO, imports core for data operations |
| `tui/` | Node.js terminal UI (`mtui` command) — read-only browser with tabs per record type |

## Quick start for external users

```bash
# 1. Clone and install
git clone https://github.com/Jaxsbr/mustard.git
cd mustard
npm install

# 2. Build all packages
cd core && npm run build && cd ..
cd cli && npm run build && cd ..
cd mcp && npm run build && cd ..

# 3. Install the CLI
cd cli && npm link && cd ..

# 4. Verify
mustard --help
```

The database is created automatically at `data/mustard.db` on first use. Override with `MUSTARD_DB=/path/to/db`.

## CLI installation

The CLI provides direct read/write access to the mustard knowledge store from any terminal.

```bash
cd mustard/cli
npm install
npm run build
npm link
```

Example commands:

```bash
# Create a record
mustard create --type todo --text "Review PR #42" --title "PR Review"

# Search records
mustard search "coaching insights" --type people_note

# List open todos
mustard list --type todo --status open

# Daily summary
mustard daily

# Get a record by ID
mustard get <uuid>

# Link two records
mustard link <source-id> <target-id> --relation assigned_to
```

Run `mustard <command> --help` for command-specific options.

## MCP server setup

The MCP server uses STDIO transport. Tell your MCP client the **absolute path** to `server.js`:

```bash
echo "$(pwd)/mcp/dist/server.js"
```

Replace `/absolute/path/to/mustard` in the configs below.

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
Then **quit and relaunch** Claude Desktop (Cmd+Q, not just close the window).

**Claude Code** — edit `.mcp.json` in your project root:
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
Then restart Claude Code. Run `/mcp` to verify.

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
Then restart Cursor.

> **Troubleshooting:** If the server shows as "failed", verify with `node /absolute/path/to/mustard/mcp/dist/server.js` — it should print "Mustard MCP server running on stdio". If you get a module error, run `cd mcp && npm install && npm run build`.

## TUI installation (optional)

The terminal UI lets you browse records in an arrow-key interface.

```bash
cd mustard/tui
npm link
```

This installs the `mtui` command globally:

```bash
mtui
```

> **Note:** If you had the old `mustard` TUI command, run `npm unlink -g mustard-tui` first to remove it.

## Database

The MCP server and CLI create `data/mustard.db` automatically on first use. If you have an existing database, place it at `data/mustard.db` or set `MUSTARD_DB`.

## Architecture

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for the full system architecture, data model, MCP tool inventory, and backup setup guide.

See [docs/architecture/mustard.flow.yaml](docs/architecture/mustard.flow.yaml) for the visual system diagram.

<!-- build-loop -->
---
*Built with [build-loop](docs/plan/) — init v12 | builds v12*
