# Mustard

## Purpose
Monorepo that consolidates the existing mustard-{function} projects (mustard-data, mustard-mcp, mustard-tui) into a single codebase.

## Directory layout

```
mustard/
├── cli/                — CLI binary (`mustard` command, TypeScript)
│   ├── src/            — index.ts (entry point, subcommand dispatcher)
│   ├── dist/           — (gitignored) compiled output
│   └── package.json    — mustard-cli package
├── core/               — Shared data-access library (TypeScript)
│   ├── src/            — db, types, records, search, links, context, summary
│   ├── tests/          — Vitest test suite (53 tests)
│   ├── dist/           — (gitignored) compiled output
│   └── package.json    — mustard-core package
├── data/               — SQLite database, backup script, data docs
│   ├── backup.sh       — Daily backup (WAL checkpoint, copy, verify, prune)
│   └── docs/           — Data-layer architecture and incident reports
├── mcp/                — TypeScript MCP server (11 tools)
│   ├── src/            — server.ts, format.ts, migrate.ts
│   ├── tests/          — Vitest test suite
│   ├── dist/           — (gitignored) compiled output
│   └── AGENTS.md       — MCP-specific agent rules
├── tui/                — Node.js terminal UI (read-only)
│   ├── src/            — index.js, db.js, render.js
│   └── tests/          — Verification tests
├── docs/
│   ├── architecture/   — ARCHITECTURE.md + flow-mo diagram
│   ├── product/        — PRD + per-phase specs
│   └── plan/           — Build loop state, logs, baselines
├── .gitignore
├── package.json        — Root test orchestrator
├── AGENTS.md           — This file
└── README.md           — Public-facing quickstart
```

## Module responsibilities

| Module | Role | DB access | Language |
|---|---|---|---|
| **cli** | Shell interface — subcommands for all mustard operations, used by humans and scheduled agents | Read/write (via core) | TypeScript |
| **core** | Shared data-access library — db, schema, CRUD, search, links, context, summaries | Read/write | TypeScript |
| **data** | Persistence layer — SQLite database and backup infrastructure | N/A (is the database) | Bash |
| **mcp** | MCP server — 11 tools via STDIO, imports core for data operations | Read/write (via core) | TypeScript |
| **tui** | Terminal browser — `mtui` command, tabs per record type, detail views | Read-only (via core) | JavaScript (Node.js) |

## Documentation

- `docs/architecture/ARCHITECTURE.md` — System architecture, monorepo structure, data model, MCP tools, backup infrastructure, setup guide
- `docs/architecture/mustard.flow.yaml` — Flow-mo visual data flow diagram

**Rule:** Update architecture docs and flow diagram when adding or changing modules, tools, or data flows.

## Quality checks

- no-silent-pass
- no-bare-except
- error-path-coverage
- agents-consistency
