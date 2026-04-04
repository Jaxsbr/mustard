# Mustard — CI & Branch Protection

> How PRs are gated, what gets checked, and what doesn't.

## Design decisions

### Conditional per-domain checks

Mustard is a monorepo with six domains spanning four tech stacks (TypeScript, JavaScript, Kotlin/Android, Terraform/HCL). Running every check on every PR is wasteful — most work touches a single domain at a time.

The CI workflow uses [dorny/paths-filter](https://github.com/dorny/paths-filter) to detect which directories changed, then runs only the relevant jobs. A single **ci** gate job aggregates results — it's the only required GitHub status check, passing when all triggered jobs succeed and all skipped jobs are ignored.

### Core dependency chain

`core` is the shared data-access library imported by `cli`, `mcp`, `tui`, and `relay` (backend). A change to `core` could break any downstream consumer. Rather than trust that core's own tests are sufficient, we re-run dependent domain checks when `core/` changes.

| If changed… | Also checks… |
|-------------|-------------|
| `core/` | cli, mcp, tui, relay-backend |
| `cli/` | cli only |
| `mcp/` | mcp only |
| `tui/` | tui only |
| `relay/contracts/`, `relay/sync/` | relay-backend only |
| `relay/infra/` | relay-infra only |
| `relay/app/` | relay-app only |

### Android builds in CI

The Android/Kotlin build is slow compared to TypeScript checks. We accepted this trade-off: slow CI is better than no CI. The `relay-app` job only triggers when `relay/app/` changes, so most PRs won't hit it. The build uses `setup-java` + `setup-android` GitHub Actions rather than Docker (the local `build.sh` uses Docker because it targets macOS without Android Studio installed).

### Terraform validation without cloud access

Relay infrastructure is defined in Terraform. CI runs `terraform init -backend=false` (no state access needed), `terraform fmt -check`, and `terraform validate`. This catches syntax errors, formatting drift, and invalid resource configs without needing AWS credentials. The `.terraform.lock.hcl` lock file ensures provider versions are pinned.

## Branch protection rules

Applied to `main` via GitHub API:

| Rule | Setting |
|------|---------|
| Required status checks | `ci` (aggregate gate), `retro-gate` (phase retro) |
| Strict status checks | Yes (branch must be up to date before merge) |
| Required PR reviews | 0 (solo contributor — author cannot approve own PRs) |
| Enforce for admins | Yes (no bypass) |
| Direct pushes | Blocked |
| Force pushes | Blocked |
| Branch deletion | Blocked |

### Why 0 required reviews?

GitHub does not allow a PR author to approve their own pull request. With a single contributor, requiring reviews would make every PR unmergeable. The CI checks and retro-gate are the real quality gates.

## Coverage map

| Domain | Typecheck | Build | Test | Other | Notes |
|--------|:---------:|:-----:|:----:|:-----:|-------|
| **core** | `tsc --noEmit` | `tsc` | vitest | — | Native dep (better-sqlite3) |
| **cli** | `tsc --noEmit` | `tsc` | — | — | No tests yet |
| **mcp** | `tsc --noEmit` | `tsc` | vitest | — | Depends on core |
| **tui** | — | — | `node tests/db.test.js` | — | Plain JS, no typecheck or build |
| **relay** (backend) | `tsc --noEmit` | `tsc` | vitest | — | contracts + sync daemon |
| **relay** (infra) | — | — | — | `terraform fmt -check`, `terraform validate` | HCL, no cloud access in CI |
| **relay** (app) | — | `gradlew assembleDebug` | — | — | Kotlin/Android, no tests yet |
| **data** | — | — | — | — | Data directory — no code, excluded from CI |

### Gaps

These are known areas without CI coverage. Not all need fixing — some are intentional.

| Gap | Domain | Severity | Rationale |
|-----|--------|----------|-----------|
| No tests | cli | Low | Thin wrapper over core; core tests cover the logic |
| No tests | relay-app | Medium | Android app is minimal but has share-sheet integration logic untested |
| No linting | All | Low | No ESLint/Prettier configured project-wide; TypeScript strict mode provides baseline safety |
| No integration tests | relay-backend | Low | Handler tests exist but no end-to-end SQS flow test (would need localstack or mocking) |
| No Terraform plan | relay-infra | Low | `validate` catches config errors; `plan` would need AWS credentials |

## Workflow file

`.github/workflows/ci.yml` — the full conditional CI pipeline.

`.github/workflows/phase-retro-check.yml` — phase retrospective gate (separate workflow, separate required check).
