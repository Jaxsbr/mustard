# Mustard — Product Requirements

## Vision

Mustard is a personal knowledge store accessed by AI agents via MCP. It tracks todos, people notes, ideas, daily logs, projects, and learnings as records in a single SQLite database. A knowledge graph (links table) connects records to each other, enabling context-aware retrieval. Agents read and write records through 11 MCP tools; a terminal UI provides direct browsing.

The system is designed to be self-hosted: clone the repo, point your MCP clients at it, and start capturing.

## Current state

**Stack:** TypeScript MCP server (STDIO transport), SQLite with FTS5 search, Node.js terminal UI.

**Record types:** `todo`, `people_note`, `idea`, `daily_log`, `project`, `learning`.

**MCP tools (11):** `search_records`, `list_records`, `get_record`, `create_record`, `update_record`, `delete_record`, `link_records`, `unlink_records`, `get_context`, `project_summary`, `daily_summary`.

**Modules:**
- **mcp** — TypeScript MCP server, all 11 tools, schema migrations
- **tui** — Node.js terminal UI for browsing records
- **data** — SQLite database, backup script, data documentation

## Design decisions (locked)

1. **Knowledge graph over simple field.** A `links` table for any-to-any connections, not a `project` column on records.
2. **Intelligence lives in agents, not mustard.** The MCP server is a structured store with smart retrieval. Agents follow conventions to capture context.
3. **`project` reuses the `records` table.** No separate projects table. Projects are records like everything else.
4. **Existing `person` field stays as-is.** Links are additive.
5. **Relationship types are freeform strings.** Not an enum.
6. **SQLite-only.** No external databases or services. No LLM calls in the server.

## Constraints (all phases)

- Preserve existing data. Schema migrations are additive only.
- SQLite-only. No external databases or services.
- No LLM calls in the MCP server. Deterministic, fast, zero-cost.
- MCP client compatibility. Must work with Claude Desktop, Cursor, and Claude Code.
- Fast. Graph queries must use proper indexing.
- Reliable. Existing tools must not break. All changes are backward-compatible.
- Generic. No person-specific references in code or documentation.

## Implementation Phases

| Phase | Status | Stories | Spec |
|---|---|---|---|
| monorepo-foundation | Shipped | US-M1, US-M2, US-M3, US-M4, US-M5 | [phases/monorepo-foundation.md](phases/monorepo-foundation.md) |
| core-extraction | Shipped | US-C1, US-C2, US-C3, US-C4 | [phases/core-extraction.md](phases/core-extraction.md) |
| consumer-integration | Shipped | US-I1, US-I2, US-I3, US-I4 | [phases/consumer-integration.md](phases/consumer-integration.md) |
| relay-foundation | Draft | US-R1, US-R2, US-R3, US-R4, US-R5 | [phases/relay-foundation.md](phases/relay-foundation.md) |
