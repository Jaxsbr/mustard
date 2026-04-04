# Phase: relay-foundation

Status: draft

## Phase goal

Build the **relay** module — a typed message bridge inside the mustard monorepo that connects mobile devices (and eventually other machines/agents) to mustard through an AWS-hosted cloud queue. The relay introduces an extensible contract system so new message types can be added over time without infrastructure changes. The first contract implemented is `research-request`, replacing the current email-to-pulse workflow with a one-gesture mobile capture.

### Design decisions

1. **Module name: `relay/`** — reflects a general communication bridge, not a single-purpose capture tool. Research is the first contract, not the only one.
2. **Message envelope pattern** — every message is a typed `RelayMessage` with `type`, `version`, `payload`, and `metadata`. The dispatcher routes by `type` to registered handlers. Adding a new message type = define contract + write handler.
3. **AWS services are transport, not storage** — SQS + API Gateway HTTP API form the cloud relay. Mustard's core data path remains SQLite-only per PRD locked design decisions. The relay feeds *into* core, not around it.
4. **Android app for mobile capture** — native share sheet integration (reliable across all apps/browsers), no HTTPS hosting dependency, sideloaded via `adb install`. Eliminates S3/CloudFront from the infra entirely.
5. **Poll, don't push** — sync daemon polls SQS on an interval. Simpler than WebSockets/push, tolerant of Mac being off, no persistent connections.
6. **API key authentication** — simple `x-api-key` header on the API Gateway POST route. Prevents casual abuse of a personal endpoint. Key stored in Android `local.properties` → `BuildConfig`, never hardcoded in source.
7. **Docker-based Android builds** — no Android Studio. Docker image with Android SDK compiles the APK. Agent scaffolds the full project, human sideloads the APK.
8. **Terraform for infrastructure** — Terraform HCL over CloudFormation. Produces `.tf` files that define all AWS resources. No hardcoded account IDs — AWS provider uses the default CLI profile.
9. **Infrastructure deployment is manual** — build-loop scaffolds the Terraform configs, operator runs `terraform apply`. The agent never deploys live AWS resources.

## Stories

### US-R1 — Relay message envelope and contract registry

As a developer, I want a typed message envelope with a versioned contract registry and dispatcher, so that new communication types can be added by defining a contract and handler without changing infrastructure or transport code.

**Acceptance criteria:**
- `RelayMessage` envelope type is defined with `type`, `version`, `payload`, and `metadata` fields
- Contract registry maps message type strings to payload schemas (JSON Schema or TypeScript validators)
- Dispatcher routes messages by `type` to handler functions, rejects unknown types
- Adding a new message type requires only: (1) define payload type + schema in `contracts/`, (2) register handler in dispatcher — no infra changes
- Unknown message types produce a clear error log, not a silent failure

**User guidance:** N/A — internal developer infrastructure

**Design rationale:** The envelope pattern separates transport (SQS, API Gateway) from semantics (what the message means). This is the core abstraction that makes relay a general communication bridge rather than a single-purpose research tool. Version field enables backward-compatible contract evolution.

---

### US-R2 — AWS relay queue infrastructure

As a system operator, I want Terraform-defined relay infrastructure (API Gateway HTTP API → SQS direct integration, no Lambda), so that any device can POST messages to a cloud queue at near-zero cost.

**Acceptance criteria:**
- Terraform configs define: SQS standard queue, dead-letter queue, API Gateway HTTP API, POST `/message` → SQS integration, IAM role, API key
- No Lambda — POST route uses SQS `SendMessage` direct integration
- API key authentication on the POST route
- Dead-letter queue catches messages that fail processing after 3 attempts
- AWS provider uses default CLI profile — no hardcoded account IDs or regions in source
- Build-loop scaffolds the `.tf` files; operator runs `terraform apply` manually

**User guidance:**
- Discovery: `relay/infra/README.md`
- Manual section: new "Relay infrastructure" section in ARCHITECTURE.md
- Key steps: 1. Configure AWS CLI profile (`aws configure`). 2. `cd mustard/relay/infra && terraform init && terraform plan`. 3. Review the plan, then `terraform apply`. 4. Note the output URL, API key, and queue URL — you'll need them for `local.properties` in the Android app and env vars for the sync daemon.
- Post-deploy smoke tests: (a) `curl -X POST <endpoint>/message` without API key → expect 403. (b) POST with valid `x-api-key` and payload → expect 200. (c) Send 4+ unprocessable messages → verify DLQ receives overflow.

**Design rationale:** API Gateway HTTP API → SQS direct integration is the simplest AWS queue pattern. Zero compute, zero Lambda, zero cold starts. At personal scale (~10 msgs/day), well within free tier. Dead-letter queue prevents poison messages from blocking the main queue. Terraform over CloudFormation for portability and plan-before-apply workflow. Infrastructure deployment is a manual operator step — the build-loop never touches live AWS.

---

### US-R3 — Sync daemon with SQS polling and dispatch

As a system operator, I want a local Mac daemon that polls SQS and dispatches messages through the contract system, so that messages captured on mobile are processed automatically when my Mac is running.

**Acceptance criteria:**
- Node.js daemon polls SQS at configurable interval (default 60s)
- Messages are validated against contract schema before dispatch
- Valid messages are dispatched to the correct handler via the dispatcher
- Successfully processed messages are deleted from SQS
- Invalid messages (bad JSON, unknown type, schema failure) are logged and deleted (not retried forever)
- Daemon runs as a launchd service with auto-start and keep-alive
- AWS credentials read from standard credential chain, queue URL from environment

**User guidance:**
- Discovery: `relay/sync/` directory, launchd plist in same directory
- Manual section: new "Relay sync daemon" section in ARCHITECTURE.md
- Key steps: 1. Set env vars (SQS queue URL, AWS region) in the plist or `.env` file. 2. `cd mustard/relay/sync && npm install && npm run build`. 3. Copy plist to `~/Library/LaunchAgents/` and `launchctl load` it.

**Design rationale:** Polling is simpler than push (no WebSocket, no persistent connection, works when Mac wakes from sleep). LaunchD is the standard macOS daemon manager, already used by pulse and mustard backup. The daemon is a thin orchestrator — all business logic lives in handlers.

---

### US-R4 — Android capture app with share sheet

As a mobile user, I want an Android app installed on my phone that appears in the share sheet and lets me send a URL with a relevance note, so that I can capture articles for research in one gesture from any app.

**Acceptance criteria:**
- Complete Android project scaffold following `~/dev/.docs/learning/android-app-build-guide-agent.md`
- Kotlin, OkHttp, XML layouts, minSdk 26, single `app` module
- Intent filter registers the app in the Android share sheet for `text/plain` content
- Share from Chrome → app opens → URL pre-filled from shared intent
- Capture form has URL field, relevance note field, and Send button
- Send POSTs a `RelayMessage` JSON to API Gateway with API key from `BuildConfig`
- API endpoint and key read from `local.properties`, exposed via `BuildConfig`
- Success/error feedback shown to user (toast or inline message)
- Docker-based build produces debug APK (no Android Studio required)
- Input validation prevents empty URL submission

**User guidance:**
- Discovery: After sideloading, app appears in app drawer and share sheet
- Manual section: new "Mobile capture" section in ARCHITECTURE.md, references `~/dev/.docs/learning/android-app-install-guide-human.md`
- Key steps: 1. Run `cd mustard/relay/app && ./build.sh` to produce APK. 2. `adb install app/build/outputs/apk/debug/app-debug.apk`. 3. Browse an article → tap Share → select "Mustard Relay" → add a note → tap Send.

**Design rationale:** Native Android app over PWA because: share sheet integration is reliable across all apps and browsers (not just Chrome), no HTTPS hosting dependency (eliminates S3/CloudFront from infra), and sideloading via `adb install` is a one-command deploy. Docker-based build per Jaco's build guide avoids Android Studio dependency — the agent scaffolds the project, Docker compiles it.

**Interaction model:** User reads an article in any app (Chrome, Twitter, Reddit, etc.) → taps the system share button → selects "Mustard Relay" from the share sheet → app opens with URL pre-filled → user types 1-2 sentences in the "Why" field → taps "Send" → sees success toast → closes app or presses back. Alternatively, user opens the app directly from the app drawer and manually enters a URL. Entire capture takes <10 seconds. No sent-message history or undo — intentional for v1 (fire-and-forget capture). The sync daemon logs all processed messages for debugging.

**Design direction:** Minimal Material Design — clean single-screen form, system default colors, no branding beyond app name. Utility aesthetic — the app should feel invisible, like a system dialog. No splash screen, no onboarding, no settings screen.

---

### US-R5 — Research-request contract implementation

As a learner, I want research-request messages to create mustard learning records and queue for deep research, so that articles I capture on mobile are automatically stored and researched when my Mac processes the queue.

**Acceptance criteria:**
- Handler creates a mustard learning record via core's `createRecord` with appropriate fields
- Handler writes a pending entry to pulse's `research-queue.json` for existing research-processor
- Handler returns the created record ID for logging
- End-to-end: mobile capture → SQS → daemon → mustard record + research queue entry

**User guidance:**
- Discovery: Automatic — captures from the Android app are processed by this handler
- Manual section: covered by "Mobile capture" section (US-R4)
- Key steps: 1. Capture an article from mobile via the app. 2. Within 60 seconds (next daemon poll), a mustard learning record appears. 3. At the next research-processor run (10am/2pm/8pm), the article is deeply researched.

**Design rationale:** This handler bridges the relay to two existing systems: mustard (record creation) and pulse (research processing). Rather than duplicating pulse's research logic, we queue into its existing `research-queue.json` format. If pulse is retired later, only this handler needs updating — the relay infrastructure is unaffected. `source_origin: 'mustard-relay'` distinguishes relay-created records from CLI and MCP origins.

**Consumer adaptation:**
- `source_origin`: relay passes `'mustard-relay'` (vs CLI's `'mustard-cli'`, MCP's `'mustard-mcp'`)
- Pulse integration: handler writes pulse's `research-queue.json` format (not mustard's schema) for the queue entry

## Done-when (observable)

- [ ] `relay/contracts/types.ts` exports `RelayMessage` interface with fields: `type` (string), `version` (number), `payload` (generic), `metadata` (object with `id`, `source`, `timestamp`) [US-R1]
- [ ] `relay/contracts/research-request.ts` exports `ResearchRequestPayload` interface with fields: `url` (string), `relevance_note` (string), `tags` (optional string array) [US-R1]
- [ ] `relay/contracts/` includes a JSON Schema file per message type (e.g., `research-request.schema.json`) as the language-neutral source of truth — TypeScript types and Android JSON construction both reference this schema [US-R1]
- [ ] `relay/contracts/index.ts` exports a `CONTRACT_REGISTRY` map from message type string to JSON schema validator, with `research-request` as the first entry [US-R1]
- [ ] `relay/sync/src/dispatcher.ts` exports a `dispatch` function that routes `RelayMessage.type` to registered handler functions and rejects unknown types with a logged error [US-R1]
- [ ] Test: dispatcher routes a `research-request` message to the correct handler and throws/logs on unknown type (vitest, `relay/sync/tests/dispatcher.test.ts`) [US-R1]
- [ ] `relay/infra/main.tf` defines: AWS provider (no hardcoded account/region — uses default CLI profile), SQS standard queue, dead-letter queue (maxReceiveCount: 3), API Gateway HTTP API, POST `/message` route with SQS `SendMessage` direct integration (no Lambda), API key via usage plan, IAM execution role [US-R2]
- [ ] `relay/infra/variables.tf` declares configurable inputs: `region` (optional, defaults to CLI profile), `queue_name`, `api_name` — no hardcoded account IDs [US-R2]
- [ ] `relay/infra/outputs.tf` exports: `api_endpoint_url`, `api_key_value`, `sqs_queue_url`, `sqs_dlq_url` [US-R2]
- [ ] `relay/infra/README.md` documents manual deploy steps: prerequisites (AWS CLI profile configured, Terraform installed), `terraform init`, `terraform plan`, `terraform apply`, and post-deploy smoke tests [US-R2]
- [ ] Test: `terraform validate` passes on `relay/infra/` (syntax and provider schema check, no AWS credentials required) [US-R2]
- [ ] `relay/sync/src/index.ts` implements a polling loop: receive messages from SQS, validate against contract schema, dispatch to handler, delete from queue on success [US-R3]
- [ ] Polling interval is configurable via environment variable `RELAY_POLL_INTERVAL_MS` (default: 60000) [US-R3]
- [ ] Invalid messages (unknown type, schema validation failure) are logged with full message body and deleted from the queue (not retried) [US-R3]
- [ ] `relay/sync/com.mustard.relay-sync.plist` is a launchd service template that runs the daemon with `RunAtLoad: true` and `KeepAlive: true` [US-R3]
- [ ] Daemon reads AWS credentials from standard AWS credential chain (env vars or `~/.aws/credentials`) and SQS queue URL + region from env vars [US-R3]
- [ ] Daemon logs and continues polling when SQS is unreachable (network error, auth failure, invalid queue URL) — does not crash or exit [US-R3]
- [ ] Messages that fail handler processing (handler throws) are NOT deleted from SQS — they remain for retry on the next poll, moving to the dead-letter queue after max receives [US-R3]
- [ ] Test: sync daemon processes a mock SQS message end-to-end through dispatcher to handler (vitest, `relay/sync/tests/sync.test.ts`) [US-R3]
- [ ] `relay/app/` contains a complete Android project scaffold per `~/.docs/learning/android-app-build-guide-agent.md`: root `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, and `app/` module with `build.gradle.kts`, `AndroidManifest.xml`, Kotlin source, and XML layout [US-R4]
- [ ] `AndroidManifest.xml` declares an intent filter for `android.intent.action.SEND` with `mimeType="text/plain"` so the app appears in the Android share sheet [US-R4]
- [ ] `MainActivity.kt` handles the `SEND` intent: extracts shared text, parses URLs from it, pre-fills the URL field — when shared text contains no recognizable URL, the full text is shown in the URL field for manual editing [US-R4]
- [ ] Capture form (XML layout) has: URL input field, "Why it's relevant" text area, Send button [US-R4]
- [ ] Send button POSTs a valid `RelayMessage` JSON (type: `research-request`, version: 1) to the API Gateway endpoint using OkHttp, with `x-api-key` header from `BuildConfig` [US-R4]
- [ ] API endpoint URL and API key are read from `local.properties` and exposed via `BuildConfig` fields in `build.gradle.kts` — `local.properties` is gitignored [US-R4]
- [ ] App shows success toast/feedback on 200 response and error message on failure (non-200 or network error) [US-R4]
- [ ] `relay/app/build.sh` builds a debug APK using Docker (android-sdk image), outputting `app/build/outputs/apk/debug/app-debug.apk` [US-R4]
- [ ] Input validation: URL field rejects empty values, both fields enforce max length 2000 characters, Send button is disabled until URL is non-empty [US-R4]
- [ ] `relay/sync/src/handlers/research-request.ts` creates a mustard learning record via `mustard-core` `createRecord` with: `log_type: 'learning'`, `source_origin: 'mustard-relay'`, `source_url` from payload URL, `text` from payload relevance_note, `status: 'captured'`, tags from payload [US-R5]
- [ ] Handler appends an entry to pulse `research-queue.json` with `status: 'pending'`, `source: 'relay'`, `link` from payload URL, `summary` from relevance_note, enabling the existing research-processor to pick it up [US-R5]
- [ ] If mustard record creation succeeds but pulse queue write fails, handler logs a warning with the mustard record ID — record is preserved, research can be triggered manually [US-R5]
- [ ] Research queue path is configurable via `PULSE_DATA_PATH` environment variable (default: `~/dev/pulse/data`) [US-R5]
- [ ] Handler returns the created mustard record ID for logging/confirmation [US-R5]
- [ ] Test: research-request handler creates a mustard learning record (verified via `getRecord`) and writes a pending entry to a test research-queue file (vitest, `relay/sync/tests/handlers/research-request.test.ts`) [US-R5]
- [ ] `relay/` directory structure, module responsibility, and relay data flow are documented in ARCHITECTURE.md (updated at phase completion by reconciliation, not at spec time) [phase]
- [ ] `AGENTS.md` module table includes `relay` with role description and DB access column [phase]

### Auto-added safety criteria

- [ ] Terraform config enforces API key requirement on the POST `/message` route (verified by `terraform validate` + config inspection, live 403 test is a post-deploy smoke test) [US-R2]
- [ ] Android app: URL field validates non-empty before enabling Send, both fields enforce max length 2000 characters [US-R4]
- [ ] Android app: API key stored in `local.properties` → `BuildConfig`, not hardcoded in Kotlin source. `local.properties` is in `.gitignore` [US-R4]
- [ ] Sync daemon validates incoming message `type` field against the contract registry before dispatch — unknown types are rejected, not passed to handlers [US-R3]
- [ ] Sync daemon deserializes SQS message body with try/catch — malformed JSON is logged and deleted, not retried [US-R3]

## Golden principles (phase-relevant)
- **Clarity over complexity** — SQS direct integration (no Lambda), Terraform with plan-before-apply (no one-click deploys), flat contract files, Docker build (no Android Studio), minimal dependencies
- **Faithful stewardship** — AWS free tier (SQS: 1M requests/mo free, API Gateway HTTP API: 1M requests/mo free for 12 months), near-zero ongoing cost at personal scale
- **Safety and ethics** — API key auth, input validation, schema validation on ingest, secrets in gitignored files
- **Continuous improvement** — extensible contract pattern enables future message types without infrastructure changes

## AGENTS.md sections affected by this phase
- Directory layout (new `relay/` module with sub-directories)
- Module responsibilities table (new `relay` row)
- Quality checks (may need relay-specific checks)

## User documentation impact
- ARCHITECTURE.md needs relay data flow diagram and module description (at phase completion)
- Relay infra README.md created as part of US-R2
- Android install guide already exists at `~/dev/.docs/learning/android-app-install-guide-human.md`
