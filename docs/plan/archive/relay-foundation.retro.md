## Phase retrospective — relay-foundation

**Metrics:** 13 working tasks, 7 investigate, 6 implement, 0 fail, 0 rework. Rework rate: 0%. Investigate ratio: 54%. Health: healthy.

**Build-log failure classes:**
(none — zero failures during build execution)

**Review-sourced failure classes:**
- `spec-ambiguity` — recurring pattern (1 concern: research-request handler was spec'd to create a mustard learning record directly via `createRecord`, but the relay should only queue to `research-queue.json` — record creation is the responsibility of the existing research-processor schedule. The spec defined handler responsibility without clarifying the boundary between relay ingestion and downstream processing. + monorepo-foundation first-seen + core-extraction pattern). Fix proposed.

**Compounding fixes proposed:**
- [spec-author gate] When a spec introduces a **handler or adapter that bridges two systems** (e.g., relay → mustard, webhook → queue), the spec must include a **"Processing model"** section per handler that states: (1) what the handler does on receipt, (2) where the data goes next (queue file, API, direct write), (3) which system is responsible for the final record creation. Without this, the builder defaults to doing everything in the handler. Reason: `spec-ambiguity` in relay-foundation (handler created records directly instead of queuing), core-extraction (consumer adaptation unclear), and monorepo-foundation (setup paths undefined). Previous compounding fix (LEARNINGS #2 "Design rationale" + core-extraction "Consumer adaptation" section) addressed *what values change per consumer* but not *where the processing boundary sits between systems*.

**Notes:**
- Zero build-loop failures — fourth consecutive clean phase. Investigate-first discipline continues to prevent rework (54% investigate ratio, highest yet).
- The spec-ambiguity was caught post-build by the operator during review, not by the build loop or automated review. The done-when criteria were technically met ("handler creates a mustard learning record") — the criteria were *wrong*, not unmet. This is a spec-level problem, not a build-level problem.
- The `spec-ambiguity` class has now appeared in 4 of 7 mustard phases (monorepo-foundation, core-extraction, relay-foundation, plus MLP-1 in LEARNINGS). Previous fixes addressed rationale (#2), investigation (#4), and consumer adaptation (core-extraction retro). This occurrence reveals a new facet: *system boundary responsibility* — who creates the record, who just queues it.
- REST API v1 decision (over HTTP API v2) was driven by API key/usage plan requirement. HTTP API v2 doesn't support API keys — this was caught during investigation, not in the spec. A "Terraform resource compatibility" check could prevent similar surprises, but this is a one-off rather than a pattern.
- Phase completed in 14 total tasks (including setup, gate, 2 review tasks) with no circuit breaker hits.
