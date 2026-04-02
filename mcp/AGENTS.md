# Mustard MCP

## Purpose

MCP server for the Mustard personal knowledge store. Exposes todos, people notes, daily logs, ideas, and **projects** via the Model Context Protocol so Claude Desktop, Cursor, and Claude Code can read and write records through a single SQLite database. A **knowledge graph** (links table) connects records to each other, enabling context-aware retrieval.

## Directory layout

```
mcp/                    -- (subdirectory of mustard monorepo)
├── src/
│   ├── server.ts       -- MCP server setup, tool registration, STDIO transport
│   ├── db.ts           -- SQLite connection, schema init, FTS triggers, links table
│   ├── tools/
│   │   ├── search.ts   -- search_records (FTS5), list_records (browse)
│   │   ├── crud.ts     -- get_record, create_record, update_record, delete_record
│   │   ├── links.ts    -- link_records, unlink_records
│   │   ├── context.ts  -- get_context (graph traversal)
│   │   └── summary.ts  -- daily_summary (open todos, today's logs, recent notes)
│   └── migrate.ts      -- One-time YAML → SQLite migration script
├── tests/
│   └── tools.test.ts   -- Tool logic tests
├── package.json
├── tsconfig.json
└── AGENTS.md
```

## Data model

### Records table

`records` table with FTS5 virtual table for full-text search.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| log_type | TEXT NOT NULL | todo, people_note, idea, daily_log, project, learning |
| title | TEXT | Optional |
| text | TEXT NOT NULL | Main content body |
| capture_date | TEXT NOT NULL | YYYY-MM-DD |
| person | TEXT | people_note only |
| status | TEXT | todo (open/done), idea (open/captured/exploring), project (open/done), learning (captured/processed/applied) |
| due_date | TEXT | todo only |
| category | TEXT | todo only |
| theme | TEXT | daily_log only |
| period | TEXT | daily_log only |
| source_origin | TEXT NOT NULL | mustard-app, manual-extract, cursor-skill, mustard-mcp |
| source_date | TEXT | ISO timestamp from structured sources |
| tags | TEXT | JSON array of strings |
| confidence | TEXT | From meta.confidence |
| created_by | TEXT | From meta.created_by |
| source_url | TEXT | URL of external content (articles, videos, references) |
| delegate | TEXT | Delegation mode: null (human), "agent" (automated), "assisted" (agent prep, human review) |
| created_at | TEXT NOT NULL | ISO datetime |
| updated_at | TEXT NOT NULL | ISO datetime |

### Links table

Any-to-any connections between records forming the knowledge graph.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| source_id | TEXT FK → records.id | ON DELETE CASCADE |
| target_id | TEXT FK → records.id | ON DELETE CASCADE |
| relation | TEXT NOT NULL | Freeform (e.g. member_of, assigned_to, related_to) |
| created_at | TEXT NOT NULL | ISO datetime |

Constraints: UNIQUE(source_id, target_id, relation). Indexes on source_id, target_id. Self-links rejected.

## MCP tools

| Tool | Purpose |
|------|---------|
| search_records | FTS5 full-text search with optional type/person/status filters. source_url is FTS-indexed. |
| list_records | Browse records by type, person, status, **delegate** with sort and limit |
| get_record | Fetch a single record by UUID |
| create_record | Create a new record (todo, people_note, idea, daily_log, project, **learning**). Supports `source_url` and `delegate` params. |
| update_record | Update fields on an existing record |
| delete_record | Delete a record by UUID (cascade-deletes all links) |
| **link_records** | Create a typed connection between two records. Params: `source_id`, `target_id`, `relation`. Idempotent — safe to call if link exists. Self-links rejected. Recommended relations: `member_of`, `assigned_to`, `related_to`, `inspired_by`, `blocked_by`, `extracted_from`, `experiment_for` |
| **unlink_records** | Remove a connection. Params: `source_id`, `target_id`, `relation`. Returns "not found" for non-existent links. |
| **get_context** | Retrieve a record and linked records. Params: `record_id` (UUID), `person` (slug), `project` (title, partial match). Optional: `since` (date filter on linked only), `depth` (1 or 2 hops), `limit` (cap total records, anchors always included). Results grouped by relationship type. |
| **project_summary** | Structured project overview: team, open todos, recent activity (7 days), linked ideas. Params: `record_id` or `title`. |
| daily_summary | Open todos + today's logs + recent notes for daily review |

## Capture conventions

Agents should organically capture project context as a side-effect of work. Summary:

| Convention | When | Action |
|------------|------|--------|
| **Project creation** | Named project encountered, not in mustard | Check via `get_context`, create with `log_type: "project"` |
| **Person-project link** | Person involved with a project | `link_records` with `relation: "member_of"` |
| **Todo/idea-project link** | Todo/idea created in project context | `link_records` with `"assigned_to"` (todo) or `"related_to"` (idea) |
| **Session close** | End of meaningful work session | Create `daily_log` with `period: "session"`, link to project |
| **Learning capture** | URL shared or external content discussed | Create `learning` with `source_url`, extract concepts as `idea` records linked via `"extracted_from"` |
| **Agent-delegated todos** | Todo is automatable (periodic checks, audits) | Set `delegate: "agent"` or `"assisted"`, ensure `text` has clear instructions |

## Documentation

See the monorepo-level docs:
- `docs/architecture/ARCHITECTURE.md` — System architecture, data model, setup guide
- `docs/architecture/mustard.flow.yaml` — Flow-mo visual data flow diagram

## Quality checks

- no-silent-pass
- no-bare-except
- error-path-coverage
