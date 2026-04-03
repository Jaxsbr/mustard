# Mustard

A personal knowledge store accessed by AI agents via MCP (Model Context Protocol). Track todos, people notes, ideas, daily logs, projects, and learnings in a single SQLite database. A knowledge graph connects records to each other, enabling context-aware retrieval.

## Modules

| Module | Description |
|---|---|
| `data/` | SQLite database, backup script, data documentation |
| `mcp/` | TypeScript MCP server — 11 tools for CRUD, search, linking, context, and summaries |
| `tui/` | Node.js terminal UI for browsing records |

## Quickstart

### 1. Clone and build

```bash
git clone https://github.com/Jaxsbr/mustard.git
cd mustard

# Install and build MCP server
cd mcp
npm install
npm run build
cd ..
```

### 2. Connect an MCP client

The MCP server uses STDIO transport. You need to tell your MCP client where `server.js` lives using the **absolute path** on your machine. Find it with:

```bash
echo "$(pwd)/mcp/dist/server.js"
```

Then add the mustard server to your MCP client config. Replace `/absolute/path/to/mustard` with your actual path in the examples below.

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
Then restart Claude Code. Run `/mcp` to verify the mustard server shows as connected.

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

> **Troubleshooting:** If the server shows as "failed", verify the path is correct with `node /absolute/path/to/mustard/mcp/dist/server.js` — it should print "Mustard MCP server running on stdio". If you get a module error, run `cd mcp && npm install && npm run build`.

### 3. Install the TUI (optional)

The terminal UI lets you browse records directly.

```bash
# From the mustard root directory:
cd tui
npm link
```

This installs the `mustard` command globally. Run it from any terminal:

```bash
mustard
```

> **Note:** `npm link` creates a global symlink. If you move the mustard directory, run `npm link` again from `tui/`.

### 4. Database

The MCP server creates `data/mustard.db` automatically on first use. If you have an existing database, place it at `data/mustard.db` or set the `MUSTARD_DB` environment variable to point to it.

## Architecture

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for the full system architecture, data model, MCP tool inventory, and backup setup guide.

See [docs/architecture/mustard.flow.yaml](docs/architecture/mustard.flow.yaml) for the visual system diagram.

<!-- build-loop -->
---
*Built with [build-loop](docs/plan/) — init v12 | builds v12*
