# Mustard CLI

## Purpose

Shell interface for the Mustard personal knowledge store. Provides direct read/write access to records and the knowledge graph without depending on MCP server availability. Used by humans and scheduled agents.

All data operations go through `mustard-core` — the CLI is a thin arg-parsing layer with no business logic.

## Commands

### CRUD

| Command | Usage | Description |
|---|---|---|
| `create` | `mustard create --type <type> --text <text> [options]` | Create a record. Returns the full record. |
| `get` | `mustard get <id>` | Fetch a single record by full UUID. |
| `update` | `mustard update <id> [--field value ...]` | Update fields on an existing record. Only pass fields to change. |
| `delete` | `mustard delete <id>` | Delete a record by UUID. Cascade-deletes all links. |

### Search and list

| Command | Usage | Description |
|---|---|---|
| `search` | `mustard search <query> [--type] [--person] [--status] [--limit]` | FTS5 full-text search. Max 50 results. |
| `list` | `mustard list [--type] [--person] [--status] [--delegate] [--sort] [--limit]` | Browse records with filters. Default: newest first, limit 25. |

### Knowledge graph

| Command | Usage | Description |
|---|---|---|
| `link` | `mustard link <source-id> <target-id> --relation <rel>` | Create a typed connection. Idempotent. Self-links rejected. |
| `unlink` | `mustard unlink <source-id> <target-id> --relation <rel>` | Remove a connection. |
| `context` | `mustard context <id> [--depth 1|2] [--since YYYY-MM-DD] [--limit N]` | Record + linked records. Depth 2 follows links-of-links. |

### Summaries

| Command | Usage | Description |
|---|---|---|
| `daily` | `mustard daily [--date YYYY-MM-DD]` | Overdue todos, due today, open todos, today's logs, recent notes. |
| `project` | `mustard project <id-or-title>` | Team, open todos, recent activity (7 days), linked ideas. Accepts UUID or partial title match. |

### Create flags

| Flag | Type | Required | Notes |
|---|---|---|---|
| `--type` | string | Yes | `todo`, `people_note`, `idea`, `daily_log`, `project`, `learning` |
| `--text` | string | Yes | Main content body |
| `--title` | string | No | Short title |
| `--person` | string | No | Person slug (e.g. `tatai`, `sway`) |
| `--status` | string | No | Defaults by type (see below) |
| `--due-date` | string | No | `YYYY-MM-DD`, todo only |
| `--category` | string | No | Todo only |
| `--theme` | string | No | Daily log only |
| `--period` | string | No | Daily log only |
| `--tags` | string | No | Comma-separated (e.g. `ai,coaching`) |
| `--source-url` | string | No | URL of external content |
| `--delegate` | string | No | `agent` or `assisted` |

### Update flags

Same as create (except `--type`), plus the positional `<id>` argument. Only pass fields you want to change.

## Record types and status lifecycle

| Type | Default status | Status values | Key fields |
|---|---|---|---|
| `todo` | `open` | `open` → `done` | `due_date`, `category`, `delegate` |
| `people_note` | `logged` | `logged` | `person` (slug) |
| `idea` | `captured` | `captured` → `exploring` → `open` | `source_url` |
| `daily_log` | `logged` | `logged` | `theme`, `period` |
| `project` | `open` | `open` → `done` | — |
| `learning` | `captured` | `captured` → `processed` → `applied` | `source_url` |

## Recommended link relations

| Relation | From → To | When |
|---|---|---|
| `member_of` | person → project | Person is on the team |
| `assigned_to` | todo → project | Task belongs to a project |
| `related_to` | any → any | Generic connection |
| `inspired_by` | idea → source | Idea origin |
| `blocked_by` | todo → blocker | Blocking relationship |
| `extracted_from` | idea → learning | Concept extracted from a source |
| `experiment_for` | todo → idea | Task to try a concept |

## Conventions

- **source_origin:** CLI always passes `mustard-cli`. Do not override.
- **IDs:** Full UUIDs required for `get`, `update`, `delete`, `link`, `unlink`, `context`. Partial IDs are not supported.
- **Tags:** Comma-separated on input (`--tags "ai,coaching"`), stored as JSON array.
- **Dates:** `YYYY-MM-DD` format for `--due-date`, `--date`, `--since`.
- **Exit codes:** 0 on success, 1 on error (invalid args, record not found, validation failure).
- **Unknown flags:** Rejected with an error message. The CLI uses strict argument parsing.
- **Output:** Human-readable terminal text, not markdown. For machine-parseable output, use `mustard-core` directly.

## Database path

Resolved in order:
1. `MUSTARD_DB` environment variable
2. `data/mustard.db` relative to the monorepo root

The database is created automatically on first use.

## Agent usage patterns

```bash
# Create a todo for a scheduled check
mustard create --type todo --text "Review weekly metrics" --delegate agent --due-date 2026-04-10

# Search for context before starting work
mustard search "authentication" --type learning

# Link a new todo to its project
mustard create --type todo --text "Add rate limiting" --title "Rate Limiting"
mustard link <new-todo-id> <project-id> --relation assigned_to

# Daily standup prep
mustard daily

# Check project status
mustard project "Mustard"
```
