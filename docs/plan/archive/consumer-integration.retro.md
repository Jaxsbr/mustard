## Phase retrospective — consumer-integration

**Metrics:** 6 build tasks, 2 investigate, 4 implement, 0 fail, 0 rework. Rework rate: 0%. Investigate ratio: 33%. Health: warning (investigate ratio below 40% threshold; phase mixed new code + server migration + config changes — ratio is reasonable for the task mix).

**Build-log failure classes:**
(none — zero failures during build execution)

**Review-sourced failure classes:**
- `edit-policy-drift` — pattern (2 findings: flow-mo diagram removed `core` node and omitted `cli` node, misrepresenting architecture; phase spec `consumer-integration.md` status not updated from `draft` to `shipped`. + core-extraction retro first-seen: ARCHITECTURE.md "planned" marker not removed when phase started). Fix proposed.

**Compounding fixes proposed:**
- [quality check] Add to LEARNINGS.md: architecture visual diagrams (flow-mo YAML) drift independently from text documentation. The `agents-consistency` quality check covers AGENTS.md text but not visual diagrams or spec metadata. The Phase Completion Gate should verify flow diagrams include all modules added/modified in the phase, and the review stage should confirm phase spec status matches completion state. Reason: `edit-policy-drift` in consumer-integration (flow diagram + spec status) and core-extraction (ARCHITECTURE.md planned marker) — three instances of doc/metadata lagging behind implementation across two phases.

**Notes:**
- Zero build-loop failures — third consecutive clean phase (monorepo-foundation, core-extraction, consumer-integration).
- Investigate ratio (33%) is below threshold but justified: 2 of 4 stories were straightforward (US-I3 TUI rename = 1 line config change, US-I4 documentation = no investigation needed). The two complex stories (US-I1 CLI, US-I2 MCP migration) each had an investigate task.
- The racy link idempotent detection concern (server.ts pre-check pattern) was challenged and is not a failure class — single-user SQLite with no concurrent writers makes the race theoretical.
- Phase completed in 11 tasks total (including setup, 2 gates, 2 review tasks) with no circuit breaker hits.
- Net code reduction: -1,307 lines in MCP (deleted tools/, db.ts) offset by +430 CLI and +213 format.ts.
