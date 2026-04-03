## Phase retrospective — core-extraction

**Metrics:** 7 build tasks, 3 investigate, 4 implement, 0 fail, 0 rework. Rework rate: 0%. Investigate ratio: 43%. Health: healthy.

**Build-log failure classes:**
(none — zero failures during build execution)

**Review-sourced failure classes:**
- `spec-ambiguity` — pattern (1 concern: `source_origin` hardcoded to `'mustard-mcp'` in `core/src/records.ts` — core is a shared library serving MCP, TUI, and future CLI, but the spec didn't identify which MCP-specific defaults need parameterization for multi-consumer use. + monorepo-foundation retro + LEARNINGS #2, #4, #49, #51). Fix proposed.
- `edit-policy-drift` — first-seen (1 concern: ARCHITECTURE.md line 70 still said "planned for core-extraction phase" after code shipped — doc lagged behind implementation).

**Compounding fixes proposed:**
- [spec-author gate] When a phase extracts code into a shared library or module consumed by multiple consumers, the spec must include a **"Consumer adaptation"** section listing hardcoded values that become parameters (e.g., `source_origin`, default paths, transport-specific formatting). Each parameterized value gets a done-when criterion: "consumer X passes its own value for Y". Reason: `spec-ambiguity` in core-extraction (source_origin default) and monorepo-foundation (setup paths) — both times the spec described the extraction target but not how consumers diverge.

**Notes:**
- Zero build-loop failures — investigate-first discipline confirmed again (0% rework when applied).
- The spec-ambiguity was a minor concern (one hardcoded default), not a structural problem — the review cycle caught and fixed it in one iteration. The existing investigate-first mandate (#4) likely prevented this from becoming a build-loop failure.
- The `edit-policy-drift` was a doc cleanliness issue, not a functional problem. The "planned" markers were inserted by spec-author during thesis-driven planning and should have been removed when the build-loop started the phase. First-seen — monitor for recurrence.
- Phase executed in 11 tasks total (including setup, gate, review) with no circuit breaker hits.
