## Phase goal

Build the **relay** module — a typed message bridge inside the mustard monorepo that connects mobile devices (and eventually other machines/agents) to mustard through an AWS-hosted cloud queue. The relay introduces an extensible contract system so new message types can be added over time without infrastructure changes. The first contract implemented is `research-request`, replacing the current email-to-pulse workflow with a one-gesture mobile capture.

### Stories in scope
- US-R1 — Relay message envelope and contract registry
- US-R2 — AWS relay queue infrastructure
- US-R3 — Sync daemon with SQS polling and dispatch
- US-R4 — Android capture app with share sheet
- US-R5 — Research-request contract implementation

### Done-when (observable)

#### US-R1 — Relay message envelope and contract registry
- [x] `relay/contracts/types.ts` exports `RelayMessage` interface with fields: `type` (string), `version` (number), `payload` (generic), `metadata` (object with `id`, `source`, `timestamp`) [US-R1]
- [x] `relay/contracts/research-request.ts` exports `ResearchRequestPayload` interface with fields: `url` (string), `relevance_note` (string), `tags` (optional string array) [US-R1]
- [x] `relay/contracts/` includes a JSON Schema file per message type (e.g., `research-request.schema.json`) as the language-neutral source of truth — TypeScript types and Android JSON construction both reference this schema [US-R1]
- [x] `relay/contracts/index.ts` exports a `CONTRACT_REGISTRY` map from message type string to JSON schema validator, with `research-request` as the first entry [US-R1]
- [x] `relay/sync/src/dispatcher.ts` exports a `dispatch` function that routes `RelayMessage.type` to registered handler functions and rejects unknown types with a logged error [US-R1]
- [x] Test: dispatcher routes a `research-request` message to the correct handler and throws/logs on unknown type (vitest, `relay/sync/tests/dispatcher.test.ts`) [US-R1]

#### US-R2 — AWS relay queue infrastructure
- [x] `relay/infra/main.tf` defines: AWS provider (no hardcoded account/region — uses default CLI profile), SQS standard queue, dead-letter queue (maxReceiveCount: 3), API Gateway REST API (v1 — HTTP API v2 lacks API key support), POST `/message` route with SQS `SendMessage` direct integration (no Lambda), API key via usage plan, IAM execution role [US-R2]
- [x] `relay/infra/variables.tf` declares configurable inputs: `region` (optional, defaults to CLI profile), `queue_name`, `api_name` — no hardcoded account IDs [US-R2]
- [x] `relay/infra/outputs.tf` exports: `api_endpoint_url`, `api_key_value`, `sqs_queue_url`, `sqs_dlq_url` [US-R2]
- [x] `relay/infra/README.md` documents manual deploy steps: prerequisites (AWS CLI profile configured, Terraform installed), `terraform init`, `terraform plan`, `terraform apply`, and post-deploy smoke tests [US-R2]
- [x] Test: `terraform validate` passes on `relay/infra/` (syntax and provider schema check, no AWS credentials required) [US-R2]
- [x] Terraform config enforces API key requirement on the POST `/message` route (verified by `terraform validate` + config inspection, live 403 test is a post-deploy smoke test) [US-R2]

#### US-R3 — Sync daemon with SQS polling and dispatch
- [x] `relay/sync/src/index.ts` implements a polling loop: receive messages from SQS, validate against contract schema, dispatch to handler, delete from queue on success [US-R3]
- [x] Polling interval is configurable via environment variable `RELAY_POLL_INTERVAL_MS` (default: 60000) [US-R3]
- [x] Invalid messages (unknown type, schema validation failure) are logged with full message body and deleted from the queue (not retried) [US-R3]
- [x] `relay/sync/com.mustard.relay-sync.plist` is a launchd service template that runs the daemon with `RunAtLoad: true` and `KeepAlive: true` [US-R3]
- [x] Daemon reads AWS credentials from standard AWS credential chain (env vars or `~/.aws/credentials`) and SQS queue URL + region from env vars [US-R3]
- [x] Daemon logs and continues polling when SQS is unreachable (network error, auth failure, invalid queue URL) — does not crash or exit [US-R3]
- [x] Messages that fail handler processing (handler throws) are NOT deleted from SQS — they remain for retry on the next poll, moving to the dead-letter queue after max receives [US-R3]
- [x] Test: sync daemon processes a mock SQS message end-to-end through dispatcher to handler (vitest, `relay/sync/tests/sync.test.ts`) [US-R3]
- [x] Sync daemon validates incoming message `type` field against the contract registry before dispatch — unknown types are rejected, not passed to handlers [US-R3]
- [x] Sync daemon deserializes SQS message body with try/catch — malformed JSON is logged and deleted, not retried [US-R3]

#### US-R4 — Android capture app with share sheet
- [x] `relay/app/` contains a complete Android project scaffold per `~/dev/.docs/learning/android-app-build-guide-agent.md`: root `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`, and `app/` module with `build.gradle.kts`, `AndroidManifest.xml`, Kotlin source, and XML layout [US-R4]
- [x] `AndroidManifest.xml` declares an intent filter for `android.intent.action.SEND` with `mimeType="text/plain"` so the app appears in the Android share sheet [US-R4]
- [x] `MainActivity.kt` handles the `SEND` intent: extracts shared text, parses URLs from it, pre-fills the URL field — when shared text contains no recognizable URL, the full text is shown in the URL field for manual editing [US-R4]
- [x] Capture form (XML layout) has: URL input field, "Why it's relevant" text area, Send button [US-R4]
- [x] Send button POSTs a valid `RelayMessage` JSON (type: `research-request`, version: 1) to the API Gateway endpoint using OkHttp, with `x-api-key` header from `BuildConfig` [US-R4]
- [x] API endpoint URL and API key are read from `local.properties` and exposed via `BuildConfig` fields in `build.gradle.kts` — `local.properties` is gitignored [US-R4]
- [x] App shows success toast/feedback on 200 response and error message on failure (non-200 or network error) [US-R4]
- [x] `relay/app/build.sh` builds a debug APK using Docker (android-sdk image), outputting `app/build/outputs/apk/debug/app-debug.apk` [US-R4]
- [x] Input validation: URL field rejects empty values, both fields enforce max length 2000 characters, Send button is disabled until URL is non-empty [US-R4]
- [x] Android app: API key stored in `local.properties` → `BuildConfig`, not hardcoded in Kotlin source. `local.properties` is in `.gitignore` [US-R4]

#### US-R5 — Research-request contract implementation
- [ ] `relay/sync/src/handlers/research-request.ts` creates a mustard learning record via `mustard-core` `createRecord` with: `log_type: 'learning'`, `source_origin: 'mustard-relay'`, `source_url` from payload URL, `text` from payload relevance_note, `status: 'captured'`, tags from payload [US-R5]
- [ ] Handler appends an entry to pulse `research-queue.json` with `status: 'pending'`, `source: 'relay'`, `link` from payload URL, `summary` from relevance_note, enabling the existing research-processor to pick it up [US-R5]
- [ ] If mustard record creation succeeds but pulse queue write fails, handler logs a warning with the mustard record ID — record is preserved, research can be triggered manually [US-R5]
- [ ] Research queue path is configurable via `PULSE_DATA_PATH` environment variable (default: `~/dev/pulse/data`) [US-R5]
- [ ] Handler returns the created mustard record ID for logging/confirmation [US-R5]
- [ ] Test: research-request handler creates a mustard learning record (verified via `getRecord`) and writes a pending entry to a test research-queue file (vitest, `relay/sync/tests/handlers/research-request.test.ts`) [US-R5]

#### Phase-level criteria
- [ ] `relay/` directory structure, module responsibility, and relay data flow are documented in ARCHITECTURE.md (updated at phase completion by reconciliation, not at spec time) [phase]
- [ ] `AGENTS.md` module table includes `relay` with role description and DB access column [phase]

### Golden principles (phase-relevant)
- **Clarity over complexity** — SQS direct integration (no Lambda), Terraform with plan-before-apply (no one-click deploys), flat contract files, Docker build (no Android Studio), minimal dependencies
- **Faithful stewardship** — AWS free tier (SQS: 1M requests/mo free, API Gateway HTTP API: 1M requests/mo free for 12 months), near-zero ongoing cost at personal scale
- **Safety and ethics** — API key auth, input validation, schema validation on ingest, secrets in gitignored files
- **Continuous improvement** — extensible contract pattern enables future message types without infrastructure changes
- no-silent-pass — tests must assert on actual output, not just "doesn't throw"
- error-path-coverage — error paths (unknown types, malformed JSON, network failures) have test coverage
- agents-consistency — AGENTS.md updated to reflect relay/ addition
