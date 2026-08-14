# DEPLOYMENT CHECKLIST

## Repository/deployment artifacts
- [x] `.env.example` contains no real secrets.
- [x] Dockerfile exists.
- [x] Render Blueprint exists and parses as YAML in structural checks.
- [x] Free Render web service and static dashboard profiles are authored.
- [x] GitHub Actions Canon/typecheck/test/build workflow is authored.
- [x] `/live`, `/ready`, `/health` are separated; Render uses `/ready` for dependency/runtime readiness.
- [x] Graceful shutdown/resource close paths exist.
- [x] Free-tier sleep/quota/ephemeral filesystem limits are documented; no keepalive circumvention.
- [x] Supabase Free PostgreSQL/Storage profile and security notes are documented.
- [x] Discord OAuth dashboard target and guild-scoped auth model are implemented in source.
- [x] Panel static assets live in publish tree with hash manifest.
- [x] Migrations 001-052 are present and contiguous in Canon audit.

## Required before release maturity
- [ ] Network-backed dependency install/audit and reviewed `package-lock.json`.
- [x] Direct dependency `latest` ranges were replaced with exact reviewed pins.
- [ ] Generate/review `package-lock.json`, then switch main CI/Render/Docker install paths to `npm ci`; the manual dependency-backed live DB/Discord workflow already fails closed on `npm ci`.
- [ ] Full typecheck/Vitest/platform/dashboard production build.
- [ ] Render Blueprint live validation/deployment smoke.
- [ ] Supabase/PostgreSQL migrations, RLS/grants and security advisors on disposable/target project.
- [ ] Discord test-guild setup/repair/restore/panel/Forum/voice/moderation smoke.
- [ ] Dashboard OAuth callback/cookie/CSRF/cross-origin verification on live URLs.
- [ ] Restart/cold-start/free-tier behavior measurements.
- [ ] Backup/restore drill report.
- [ ] Observability/alerting integration and runbook.
- [ ] Security/performance/accessibility/load/chaos/Canon release audits.

Free Render is a hobby/development profile, not a production availability SLA.

## Phase 8-9 deployment hardening
- [x] Docker runtime is non-root, creates writable `.tmp`, and has a `/ready` healthcheck.
- [x] CI has a dependency-free `source-contracts` lane before install-backed verification.
- [x] Manual-only `live-verification.yml` can run guarded disposable DB and Discord gates; Discord mutation is opt-in and disposable-prefix cleanup is in `finally`.
- [x] Release manifest describes the committed Git tree, blocks dirty release output by default and labels `--allow-dirty` inspection output non-releasable.
- [ ] Live Render/GitHub/Supabase/Discord deployment evidence remains pending explicit destinations/credentials.

## Phase 10 executable runtime
- [x] Build/start entrypoint is an executable composition root, not a duplicate HTTP module.
- [x] Process-role bootstrap wires Discord Client/shards/intents, command/event bindings, durable job handlers, scheduler, inbox/outbox, automation, HTTP probes and bounded shutdown.
- [x] `/ready` requires the automation loop for database-backed `all`/`worker` roles.
- [ ] Run the compiled bootstrap with reviewed dependencies on a live disposable deployment and record Gateway/worker/shutdown evidence.
- [ ] Migrations 045-046 require disposable DB execution/concurrency evidence before release maturity.


## Phase 18 deployment/live-gate additions
- [x] Third-party plugin enablement has an explicit target-probed Linux namespace/seccomp profile and remains disabled by default.
- [x] Startup rejects third-party enablement when the actual host hostile probe fails.
- [x] Manual live-verification workflow has independent DB, Discord, HTTP and browser opt-ins.
- [x] Dependency-backed DB/Discord workflow branch uses `npm ci` rather than resolving a fresh graph.
- [x] Dependency-free HTTP/browser harnesses have deterministic synthetic self-tests.
- [ ] Verify `LINUX_NS_SECCOMP_V1` plus deployment-level RSS/PID limits on the chosen deployment target.
- [ ] Run migration 051 and complete DB gate on the approved disposable target.
- [ ] Run deployed HTTPS/browser and approved Discord test-guild gates; archive evidence with release provenance.


## Phase 19 dependency-lock promotion
- [x] Manual review-only lock bootstrap workflow exists and does not execute lifecycle scripts.
- [x] CI dependency-backed verify lane requires `release:dependency-lock-gate` and `npm ci`.
- [x] Release Truth detects a real lockfile coexisting with unlocked CI/Docker/Render install surfaces and blocks promotion.
- [ ] Generate/review/commit the real `package-lock.json` in a network-capable environment.
- [ ] After review, change Docker build/runtime and both Render build commands from `npm install` to `npm ci`.
- [ ] Run typecheck, Vitest, platform/dashboard builds, `npm audit --audit-level=high`, SBOM and release gate using the committed lock.


## Phase 20 source parser promotion
- [x] TypeScript compiler-API source parser gate authored with malformed-source sentinel.
- [x] Dependency-backed CI runs strict source parsing before semantic typecheck.
- [x] `release:gate` runs strict source parsing before Release Truth enforcement.
- [ ] Re-run strict parser with project-pinned TypeScript after reviewed `npm ci`; retain with QA-003 evidence.

## Phase 22 workflow promotion controls
- [x] External GitHub Actions use reviewed immutable commit SHAs with human version annotations.
- [x] Workflow source policy is enforced by `test:workflow-supply-chain` and shared Release Truth.
- [x] Checkout credentials are non-persistent and workflow permissions are explicit/minimal.
- [ ] Preserve the reviewed pin policy during future action upgrades and retain the corresponding review evidence.

## Phase 25 exact toolchain / final attestation
- [x] Pin Node 22.16.0 and npm 10.9.2 in package/local toolchain declarations.
- [x] Pin GitHub setup-node and Docker stages to Node 22.16.0.
- [x] Enforce npm engine-strict + exact-save policy.
- [x] Require Render build surfaces to execute the runtime toolchain guard before install/build.
- [x] Add Release Truth toolchain-policy evaluation.
- [x] Add final source attestation that preserves release/live blockers.
- [ ] After reviewed `package-lock.json` exists, promote Docker/Render from `npm install` to `npm ci` and execute dependency-backed CI.
- [ ] Execute deployment-target toolchain/image smoke and live DB/Discord/browser/provider gates before Production Ready/VERIFIED claims.

## Phase 28 visual/realtime deployment evidence
- [x] Offline source gate covers real event publishers/mappings, Thai presentation, asset hashes and adaptive visual-stage guards.
- [ ] After reviewed `package-lock.json`, run project-pinned Dashboard/platform builds and dependency security evidence.
- [ ] On deployed HTTPS target, measure WebSocket reconnect/burst behavior, Canvas/CSS-3D frame time, CPU/GPU/memory and reduced-motion on representative desktop/mobile devices.
- [ ] On approved Discord guild, validate Components V2 living-panel edit coalescing/rate limits and Phase 28 event bursts without duplicate messages.
- [ ] On approved DB, execute migration 054/RLS and restart/de-dup/expiry visual-state evidence.

## Phase 29 live verification additions
- [x] Phase 29 source preflight covers Digital Twin, Operations Intelligence, Event Replay, visual orchestration/governor and deterministic chaos/replay bounds.
- [ ] On approved migrated DB, execute Operations Intelligence aggregate queries, inspect query plans/cardinality latency and verify heartbeat/incident/SLO evidence.
- [ ] On approved Discord test guild, compare Digital Twin actual/desired/conflict evidence with real scan/preview/apply/repair/rollback behavior.
- [ ] On approved deployed HTTPS target, verify Event Replay OAuth/operator tenant isolation, secret redaction and bounded response behavior with representative event data.
- [ ] Run deployed WebSocket burst/reconnect and representative desktop/mobile GPU/frame-time/memory/reduced-motion profiling for Visual Orchestrator behavior.
- [ ] Archive real load/chaos/restart/recovery evidence separately; deterministic Phase 29 source stress is not a substitute.

- [ ] Execute Recovery Evidence V2 against an approved disposable PostgreSQL/Discord restore drill and capture proof that the timeline matches the real backup -> approval -> restore -> post-restore verification -> drill chain.
