# Thesis Review: Mustard — Architectural Road Map

**Date:** 2026-04-03
**Personas:** Skeptic, Pragmatist, Visionary
**Depth:** Standard
**Verdict:** refine

---

## Abstract

Mustard is a personal knowledge store holding 253+ records across 6 types, backed by a single SQLite file with FTS5 search and a typed knowledge graph. Two consumers exist today: a TypeScript MCP server (read/write, STDIO transport) and a JavaScript TUI (read-only, direct SQLite). The architecture has served well for local-first capture but is now hitting walls: scheduled agents can't reach data because MCP servers load lazily (deferred tool registration), the TUI borrows `better-sqlite3` from the MCP's `node_modules`, and there is no shared validation layer between consumers. The user is evaluating three paths forward — direct SQL, CLI wrapper, or API layer — while also eyeing online persistence, multi-AI integration, and treating mustard as a portfolio-grade project. This review evaluates the current architecture and recommends a path.

---

## Analysis

**The deferred-MCP problem is the immediate blocker.** Claude Code's deferred tool loading means scheduled/background agents can't invoke MCP tools until a human session activates them. This is a Claude Code platform constraint, not a mustard bug. Any solution that keeps MCP as the *only* write path will remain fragile under automation.

**Both consumers duplicate database access code.** MCP's `db.ts` and TUI's `db.js` both open `better-sqlite3` connections independently, resolve the same `MUSTARD_DB` env var, and understand the same schema — but share no code. The TUI even requires `better-sqlite3` from `mcp/node_modules`, creating a hidden build-order dependency.

**Validation lives only in MCP tool handlers.** Record creation enforces UUID generation, required fields, JSON-encoded tags, default statuses, and capture-date formatting — all inside `mcp/src/tools/crud.ts`. Any direct SQL writer (scheduled job, CLI, future integration) would bypass all of this.

**The concurrent-writer problem is documented but unsolved.** INC-2026-04-02 showed 12 MCP instances can corrupt FTS5. WAL mode handles concurrent *reads* well but doesn't prevent write contention at the FTS trigger level.

**Data sensitivity is real but protections are minimal.** Daily local backups with 7-day retention. No encryption at rest. No off-machine backup. The recovery runbook exists but was written reactively after the incident.

---

## Strengths

1. **Schema design is solid.** Single `records` table with `log_type` discriminator + typed `links` table is simple, flexible, and queryable. FTS5 as derived data (rebuildable from source) is the right call.

2. **MCP tool coverage is complete.** 11 tools cover CRUD, search, linking, context retrieval, and summaries. Validation in `crud.ts` is thorough (Zod schemas, UUID generation, timestamp management).

3. **Incident response matured the reliability story.** FTS health check on startup, documented recovery runbook, daily backups — all born from INC-2026-04-02. This is genuine operational learning.

4. **Read-only TUI is a correct boundary.** Preventing accidental writes from a keyboard-driven UI is a good safety decision.

5. **Monorepo consolidation was the right structural move.** Shared docs, unified test runner, single git history.

---

## Risks

1. **MCP as sole write path is a single point of failure for automation.** Deferred loading, STDIO transport quirks, and per-session process spawning make MCP unreliable for unattended workloads.

2. **No shared data-access library means validation drift.** Any new consumer (CLI, API, web) will need to re-implement or bypass the validation that currently lives in MCP tool handlers.

3. **`better-sqlite3` cross-package dependency is fragile.** TUI requiring MCP's `node_modules` means TUI breaks if MCP isn't built, and native module version mismatches cause segfaults.

4. **No off-machine backup.** "Priceless and sensitive" data exists only on one disk. A drive failure or theft loses everything.

5. **Portfolio presentation gap.** No CI pipeline, no published npm package, no demo mode, no architecture decision records beyond incident docs. A GitHub visitor sees a README but can't assess quality without cloning.

---

## Conclusion

Mustard's data model and MCP tool design are strong. The immediate pain (deferred MCP blocking scheduled jobs) and the medium-term ambition (online persistence, multi-AI integration) both point to the same structural need: **a shared data-access layer that MCP, TUI, CLI, and future consumers all route through**, with validation enforced at that layer rather than in individual consumers.

---

## Persona Critiques

### Skeptic

**Stance:** *"You're about to add architectural layers to a personal SQLite file. Prove this isn't over-engineering."*

#### The deferred-MCP problem doesn't need an architecture change
The scheduled-job failure is a Claude Code platform limitation. A simpler fix: write a small CLI script that opens SQLite directly and runs the specific operations scheduled jobs need. You don't need a full API layer to unblock a cron job. Option (b) — a thin CLI — solves the immediate problem without architectural upheaval.

#### An API layer for a single-user local tool is premature
An HTTP API adds a process to manage, a port to secure, startup latency, and a new failure mode (server down = no data). For a personal tool with one user and one machine, the SQLite file *is* the API. WAL mode already handles concurrent reads. The concurrent-write problem (INC-2026-04-02) is better solved by write serialization (a simple mutex or single-writer pattern) than by adding an HTTP layer.

#### "Online persistence" is a different product
Cloud sync, multi-device access, and web capture are features of a SaaS product, not a personal CLI tool. Adding them changes the threat model (authentication, encryption in transit, hosting costs) and the maintenance burden (uptime, migrations, API versioning). Be honest about whether mustard is a personal tool or a product — the architecture differs fundamentally.

**Verdict:** Solve the immediate CLI problem with a thin script. Don't let future ambitions drive today's architecture. The strongest portfolio move is a well-built simple tool, not a half-built complex one.

---

### Pragmatist

**Stance:** *"The architecture needs one structural change, not a rewrite. Let's scope it right."*

#### Extract a shared `core` library (Option B+)
The pragmatic path between the three options: create a `core/` module in the monorepo that owns database connection, schema, validation, and typed CRUD operations. MCP tools become thin wrappers that call `core`. TUI imports `core` for reads. A CLI binary imports `core` for scripted writes. This is Option (b) done properly — it's not a CLI bolted on the side, it's a shared library that any consumer (CLI, MCP, TUI, future API) can use.

```
mustard/
├── core/       <- NEW: shared data-access + validation
│   ├── src/
│   │   ├── db.ts         (connection, schema init, migrations)
│   │   ├── records.ts    (CRUD with validation, FTS management)
│   │   ├── links.ts      (link/unlink with validation)
│   │   ├── search.ts     (FTS queries, filtering)
│   │   └── summary.ts    (daily_summary, project_summary)
│   └── package.json
├── mcp/        <- imports core, thin tool wrappers
├── tui/        <- imports core (read functions only)
├── cli/        <- NEW: imports core, exposes as CLI commands
├── data/
└── docs/
```

#### Fix the TUI dependency chain now
TUI requiring MCP's `node_modules` is a ticking time bomb. The shared `core` library solves this naturally — both MCP and TUI depend on `core`, which owns `better-sqlite3`.

#### Encrypt and replicate the database
For "priceless" data: (1) add an encrypted off-machine backup — even a daily `rsync` to iCloud Drive or a private GitHub repo with the `.db` file git-crypt'd. (2) Extend `backup.sh` to push one copy off-disk. This doesn't need an architecture change — it's an ops task.

#### Portfolio quality requires CI
Add a GitHub Actions workflow that runs `npm test` across all packages. This is table stakes for a portfolio project. Badge in README. Takes 30 minutes to set up.

**Verdict:** Extract `core/`, add a CLI consumer, fix the TUI dependency, set up CI, and add off-machine backup. This unblocks scheduled jobs, cleans up the architecture, and makes the portfolio credible — all without an API server or cloud persistence.

---

### Visionary

**Stance:** *"Mustard could be the personal knowledge layer that every AI engineer wishes they had. Build the foundation for that."*

#### The `core` library is actually a portable data engine
If `core` is well-designed — clean TypeScript interfaces, no transport assumptions, pure data operations — it becomes something much more valuable than a shared library. It's the foundation for:
- **A REST/WebSocket API** when you want remote access (mobile capture, web dashboard)
- **A sync engine** when you want multi-device (CRDTs on the records table, or operational transforms on the knowledge graph)
- **Plugin integrations** for other AI platforms (OpenAI Agents SDK, LangChain tools, custom MCP servers for other providers)

Design `core` with this in mind: typed interfaces, no side effects in the data layer, connection management abstracted behind an interface (so SQLite can be swapped for Turso/libSQL for cloud deployment).

#### The knowledge graph is the real asset
253 records aren't impressive. But 253 records *with typed relationships, temporal context, and full-text search* — that's a personal knowledge graph. The future features should emphasize graph intelligence: traversal queries, temporal analysis ("what was I working on when I had this idea?"), and semantic search (embedding vectors alongside FTS5).

#### Build the "portfolio story" explicitly
A portfolio project needs: (1) a clear README with architecture diagram, (2) CI badges, (3) a demo mode with sample data, (4) documented design decisions. Mustard already has the substance — it needs the presentation. Consider: a `mustard demo` command that creates a temporary database with curated sample records, so a GitHub visitor can clone and experience the tool in 60 seconds.

#### Data guardianship as a first-class feature
"Priceless and sensitive" data deserves more than daily local backups. Build toward: encryption at rest (SQLCipher or application-level), encrypted off-site backup (S3/R2 with client-side encryption), audit log (who/what/when accessed the database), and data export (structured JSON/YAML for portability). These aren't features — they're trust infrastructure for a tool that holds personal knowledge.

**Verdict:** Extract `core` as a portable data engine with clean interfaces. Use it to power CLI, MCP, and TUI today — and API, sync, and integrations tomorrow. Invest in graph intelligence and data guardianship as differentiators. The portfolio story writes itself if the foundation is right.

---

## Synthesis

### Convergence (high confidence)

All three personas agree on these points:

1. **Extract a shared `core/` data-access library.** This is the single highest-impact change. It solves the validation duplication, the TUI dependency chain, and provides the foundation for any new consumer (CLI, API, or otherwise). Every persona arrives at this independently.

2. **A CLI consumer unblocks scheduled jobs immediately.** The deferred-MCP problem is solved by giving scheduled agents a non-MCP write path. A CLI that imports `core` is the minimal viable fix.

3. **Off-machine backup is overdue.** For data described as "priceless," single-disk local backups are insufficient. This is an ops task, not an architecture task.

4. **CI is required for portfolio credibility.** GitHub Actions running tests across all packages. Non-negotiable for a project presented publicly.

### Divergence (needs judgment)

1. **API layer now vs. later.** The Skeptic says don't build it — it's over-engineering for a single-user tool. The Visionary says design `core` so an API is trivial to add later. The Pragmatist says skip the API now but keep the door open. **Assessment:** design `core` with clean interfaces (the Visionary's point costs nothing extra), but don't build an HTTP server until remote access is actually needed.

2. **Online persistence scope.** The Skeptic warns this changes the product category entirely. The Visionary sees it as the natural evolution. **Assessment:** treat cloud/sync as a future phase with its own PRD. Don't let it influence `core` design beyond keeping interfaces abstract (e.g., a `DataStore` interface that SQLite implements today and Turso could implement later).

3. **Encryption at rest.** The Visionary wants SQLCipher; the Pragmatist says encrypted off-site backup is sufficient for now. **Assessment:** encrypted backup first (low effort, high value), encryption at rest as a future phase.

### Ranked recommendations

| # | Recommendation | Impact | Effort |
|---|---|---|---|
| 1 | ~~Extract `core/` library — db connection, schema, validation, CRUD, search, summary~~ | ~~Unblocks everything else~~ | ~~Medium (refactor, no new features)~~ |
| 2 | Add `cli/` package that imports `core` — `mustard-cli create`, `update`, `search`, etc. | Unblocks scheduled jobs | Low (thin wrapper over core) |
| 3 | Migrate MCP tools to import `core` instead of inline SQL | Eliminates validation duplication | Medium (11 tools to rewire) |
| 4 | ~~Migrate TUI to import `core` for reads~~ | ~~Fixes `node_modules` dependency hack~~ | ~~Low~~ |
| 5 | Add GitHub Actions CI (test all packages) | Portfolio credibility | Low |
| 6 | Add encrypted off-machine backup (iCloud, S3, or git-crypt'd private repo) | Data safety | Low |
| 7 | Add demo mode (`mustard demo`) with sample data | Portfolio presentation | Low |
| 8 | Design `DataStore` interface in `core` for future backend swappability | Future-proofing (near zero cost if done during #1) | Negligible |
