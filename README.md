# Mustard

A personal knowledge store accessed by AI agents via MCP (Model Context Protocol). Track todos, people notes, ideas, daily logs, projects, and learnings in a single SQLite database. A knowledge graph connects records to each other, enabling context-aware retrieval.

## Modules

| Module | Description |
|---|---|
| `data/` | SQLite database, backup script, data documentation |
| `mcp/` | TypeScript MCP server — 11 tools for CRUD, search, linking, context, and summaries |
| `tui/` | Node.js terminal UI for browsing records |

## Quickstart

```bash
# Clone
git clone https://github.com/Jaxsbr/mustard.git
cd mustard

# Install and build MCP server
cd mcp
npm install
npm run build
cd ..

# Run MCP server (STDIO transport)
node mcp/dist/server.js

# Run TUI (requires mcp/node_modules for better-sqlite3)
cd tui
node src/index.js
```

## Configure MCP clients

Point your MCP client at `mcp/dist/server.js`:

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

**Cursor** / **Claude Code**: Same format — set command to `node` and args to the path to `mcp/dist/server.js`.

## Architecture

See [docs/architecture/ARCHITECTURE.md](docs/architecture/ARCHITECTURE.md) for the full system architecture, data model, MCP tool inventory, and setup guide.

See [docs/architecture/mustard.flow.yaml](docs/architecture/mustard.flow.yaml) for the visual system diagram.

<!-- build-loop -->
---
*Built with [build-loop](docs/plan/) — init v12 | builds v12*
