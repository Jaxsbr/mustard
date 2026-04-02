## Phase retrospective — monorepo-foundation

**Metrics:** 15 tasks, 5 investigate, 8 implement, 0 fail, 0 rework. Rework rate: 0%. Investigate ratio: 42%. Health: healthy.

**Review-sourced failure classes:**
- `spec-ambiguity` — first-seen (1 finding: TUI cross-module dependency on `mcp/node_modules` not addressed in spec; setup guide used `<mustard-root>` placeholders instead of concrete absolute-path instructions, causing MCP connection failures and broken TUI CLI post-migration). Fixed during review cycle (try/catch error message) and post-merge (setup guide rewrite with numbered steps, `echo $(pwd)` path discovery, troubleshooting section, `npm link` TUI instructions).

**Compounding fixes proposed:**
None — all failure classes are first-seen. If `spec-ambiguity` recurs in the next phase, propose a spec-author gate requiring setup/migration steps for any story that changes module boundaries or install paths.

**Notes:**
- Zero build-loop failures — clean execution with investigate-first discipline.
- The spec-ambiguity gap was caught by PR review and operator testing, not by the build loop itself. The done-when criteria were technically met (paths resolved correctly in code) but the user experience of configuring clients was not covered by any criterion. Future phases with user-facing setup changes should include a "setup verified from scratch" criterion.
- Three MCP config files needed updating post-migration (`~/dev/.mcp.json`, `~/Library/Application Support/Claude/claude_desktop_config.json`, `~/.cursor/mcp.json`) — none were in scope for the build loop but all broke. A migration checklist in the spec could have caught this.
