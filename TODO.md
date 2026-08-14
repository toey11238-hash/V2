# TODO

Everything below remains Canon scope unless explicitly deprecated by approved decision. Source presence does not mean VERIFIED.

## Completed in Server Fabric / UI V2 source (not VERIFIED)
- [x] Expand non-Gaming server fabric across Community Programs, Knowledge, Member Services, Partnerships, Trust & Safety, Automation Lab, Data Observatory, Release & Change plus Creator/Education/Business verticals.
- [x] Expand role taxonomy and make role color/hoist/mentionable visual state part of desired-state scan/plan/apply.
- [x] Expand managed panel catalog to 62 definitions with 72 repo-managed PNG/GIF media assets and stable target channels.
- [x] Upgrade managed panel renderer plus platform-owned Discord interaction/status/background-delivery surfaces to Components V2; retain native modals and static regression guards.
- [x] Upgrade Command Bridge Dashboard to UI V2 with blueprint-derived Category/Room/Role/Panel counts and expanded module/panel surfaces.
- [x] Preserve `/setup` as universal configuration surface and keep top-level slash root count at one.


## Completed in Phase 8-9 source (not VERIFIED)
- [x] Public/no-secret provider adapters for Riot Data Dragon game catalog/assets, GitHub public Releases and Discord public Status.
- [x] Provider configuration/sync under `/setup` and Dashboard using the same durable draft/config model.
- [x] Durable integration snapshot hash/version/item-count storage, bounded history pruning and scheduler resync.
- [x] Realtime buffered-amount backpressure, duplicate event-ID suppression and retryable slow-client disconnect.
- [x] Bounded L1 TTL cache and bounded single-flight loader cardinality; cache remains non-authoritative.
- [x] Discord shard modes `single`, `auto`, `manual` with validation; default remains single.
- [x] PostgreSQL pool/connect/statement/query timeout configuration and pool-pressure diagnostics.
- [x] Separate `/live`, `/ready`, `/health`; Render readiness uses current durable-worker/dependency snapshots.
- [x] Bounded graceful shutdown with failure exit truth.
- [x] Exact direct dependency pins; no direct `latest` ranges remain.
- [x] Non-root Docker runtime + readiness healthcheck and source-contract CI lane.
- [x] Manual-only disposable DB/Discord verification workflow with mutation opt-in and disposable-prefix cleanup.
- [x] Canary metric outcomes + cohort comparison + review-only expand/hold/rollback recommendation; no automatic destructive action.
- [x] Plugin isolation evolved to target-probed `LINUX_NS_SECCOMP_V1`; current-host hostile filesystem/process/syscall/network probe passes, while deployment-target enablement remains fail-closed pending its own probe/RSS-PID controls.
- [x] Release manifest refuses dirty release artifacts by default and labels dirty inspection output non-releasable.

## P0 - verification blockers / release truth
- [ ] Restore npm registry/network access, generate and review `package-lock.json`, commit it, then run `npm ci`. Direct dependency pins are already exact.
- [ ] Run full `npm run typecheck`, Vitest, production build, dependency/security audit and SBOM after dependency installation.
- [ ] Switch CI/Render/Docker installs from `npm install` to `npm ci` only after the real reviewed lockfile exists.
- [ ] Apply migrations 001-054 on a disposable user-approved PostgreSQL/Supabase target; verify schema/indexes/constraints/RLS/grants/rollback/concurrency/failure recovery.
- [ ] Run Supabase security/performance advisors on that selected target and record remediation/evidence.
- [ ] Execute setup/panels/notifications/Gaming/workflows/provider sync/repair/restore against a selected Discord test guild with restart, concurrent-admin, hierarchy and rate-limit scenarios.
- [ ] Execute Components V2 create/edit legacy-migration/update/repair/rollback for managed panels and `/setup` on an approved Discord test guild; record message flags/component payload evidence.
- [ ] Run browser Dashboard UI V2 responsive/mobile/reduced-motion/keyboard E2E against live API data; static parser/a11y checks are insufficient.
- [ ] Run one checksum backup -> restore preview -> independent approval -> apply -> attribute verify drill and preserve report.

## P1 - production hardening
- [x] Complete deterministic leaf-level Requirement Traceability for every Markdown bullet in Canon + Master Spec, with feature-state/evidence/test mapping and stale-map CI gate. This is tracking coverage, not VERIFIED evidence.
- [ ] Run dependency-backed OAuth/CSRF/guild-isolation, inbox/outbox/cache/scheduler/watchdog/canary/import/integration/recovery/provider tests.
- [ ] Run load/race/real-chaos tests for setup locks, inbox/outbox, WebSocket backpressure/reconnect, cache stampede, notification fanout, Gaming joins/recruitment and concurrent workflow actions.
- [ ] Run accessibility/mobile/reduced-motion/i18n browser E2E for Dashboard and Discord component/copy constraints.
- [ ] Run retention/legal-hold/privacy deletion/export and generated-document lifecycle integration tests.
- [ ] Capture live free-tier cold-start/sleep/quota evidence before making any availability claim.
- [ ] Run an approved external-AI sandbox E2E with non-sensitive test data; verify guild opt-in, permission denial, timeout/error audit, provider data handling and disable/rollback behavior before any maturity claim.

## P2 - remaining breadth
- [x] Add provider-specific public game/news/status adapters only from real runtime adapters; unsupported capabilities stay unavailable.
- [x] Add safe integration configuration surfaces only for adapters registered at runtime; never arbitrary URL/secret execution.
- [x] Add canary outcome metrics and operator-reviewed promotion/hold/rollback guidance without automatic destructive action.
- [x] Add fail-closed Linux filesystem/process/syscall/network isolation profile with hostile current-host probe before third-party plugin execution.
- [ ] Re-run the sandbox gate on the actual deployment target and add/review deployment RSS/PID quotas before enabling untrusted plugins there.
- [x] Add optional external AI providers only through explicit allowlist/data-class/secret/permission gates; preserve zero-cost `local-rules` default. Source contract is complete; live external-provider evidence remains pending.
- [x] Extend Gaming provider adapters beyond public catalog data with a documented zero-secret Steam public-news adapter; additional providers remain capability/terms gated.
- [ ] Extend Recruitment Center verification/search only when provider capabilities are documented and available.

## Deployment
- [ ] Replace the local bundle `origin` with a real GitHub repository remote only when destination/credentials are explicitly selected; do not push by assumption.
- [ ] Configure Render/Supabase environments using secrets outside source and run live smoke checks on selected targets.
- [ ] Document accepted free-tier availability/quotas from observed deployment evidence before claiming any SLA.

Do not mark the project complete or any feature VERIFIED until Canon -> Spec -> Registry -> Code -> Test -> Integration evidence agrees.

## Server Fabric V3 remaining evidence
- [x] Expand non-Gaming topology and role/panel/media catalog.
- [x] Enforce blueprint module completeness/default `/setup` no-drop behavior.
- [x] Add durable Community Fabric work-item source and Discord/Dashboard review integration.
- [x] Add dependency-free Fabric V3 regression evidence.
- [ ] Execute migrations 041-044 on an explicitly approved disposable DB and test RLS/concurrent state transitions.
- [ ] Run Discord test-guild Omni/Hybrid create-update-repair measurement, including Components V2 panel deployment and REST rate limits.
- [ ] Run dependency-backed Vitest/typecheck/build/browser E2E once npm registry access is available.
- [ ] Review whether additional Fabric leaf automations merit new workflow types only after real usage/evidence; do not add unbounded structures merely to increase counts.
## Phase 9 operations evidence source completed (not VERIFIED)
- [x] Add durable staff-only incident declaration/timeline/status control with Discord V2 + Dashboard/API paths.
- [x] Add advisory capacity pressure snapshots using durable/realtime evidence and configurable internal soft ceilings; no auto-delete/auto-shrink.
- [x] Add recovery drill lifecycle where PASSED requires explicit verification checks + artifact reference.
- [x] Add release provenance root hash over Git/source/migration/panel-asset evidence with lockfile/SBOM blockers preserved.
- [ ] Execute incident/capacity/recovery-drill migrations and workflows on approved disposable DB/test guild; record real evidence.
- [ ] Generate dependency-backed SBOM after npm registry/lockfile becomes available, then include its hash in releasable provenance.

## Phase 10 remaining evidence
- [x] Add priority-lane tenant-fair durable job claiming.
- [x] Add registered durable resource budgets and `/setup`/Dashboard/Discord control surfaces.
- [x] Integrate budgets into provider sync, analytics, backup, notification fanout and bulk automation.
- [x] Add bounded durable generic automation worker with safe action allowlist, maintenance guard and execution evidence.
- [x] Replace duplicate HTTP entrypoint with executable platform bootstrap and readiness/heartbeat lifecycle wiring.
- [ ] Execute migrations 045-046 on an explicitly approved disposable DB; test row-lock contention, fair claiming, budget windows and automation receipt retries.
- [ ] Run real Discord bootstrap test: command registration, Gateway ready/shards/intents, interaction routing, member/forum/voice/security events and graceful shutdown.
- [ ] Run dependency-backed Vitest/typecheck/build once npm registry and reviewed lockfile are available.

## Phase 11 remaining evidence
- [x] Add durable Admission Control policy/decision source and migration 047.
- [x] Configure admission preset through `/setup` and Dashboard.
- [x] Guard setup/change queueing and re-check in Setup Worker.
- [x] Integrate provider/analytics/backup/ordinary fanout/bulk automation with admission before optional budgets.
- [x] Preserve Safety/Support/Diagnostic and Security/Maintenance notification paths from load shedding.
- [ ] Execute migration 047 on approved disposable DB; verify RLS/grants/indexes and concurrent decision evidence.
- [ ] Run overload drill with queued jobs/due tasks/critical incident and prove optional work defers while support/safety/recovery remains available.
- [ ] Run dependency-backed Phase 11 Vitest/typecheck/build after npm registry and reviewed lockfile are available.


## Phase 14 remaining evidence
- [x] Author durable legal holds and governance revision migration 048.
- [x] Bind retention approval to plan hash/revision/candidate ceilings and execute deletes atomically with durable run evidence.
- [x] Add CRITICAL two-operator legal-hold release workflow and privacy operator surfaces.
- [x] Canonicalize privacy export hashing and exclude staff-only decision/review note fields.
- [x] Add dependency-free data-governance contract smoke and authored Vitest/live-DB checks.
- [ ] Execute migration 048 on an explicitly approved disposable DB; verify RLS/grants/indexes and migration rollback.
- [ ] Inject mid-plan DB failure and prove no partial retention deletion commits.
- [ ] Race hold creation/release against approved retention execution and prove governance revision/lock fail-closed behavior.
- [ ] Exercise privacy export/hold/approval/execute surfaces on an approved Discord test guild with independent operators and audit evidence.

## Phase 15 remaining evidence
- [x] Author migration 049 per-scope audit-integrity heads/entries and mutation guards.
- [x] Chain `AuditRepository` writes atomically and bind canonical content + sequence + prior hash + algorithm + timestamp.
- [x] Add bounded verifier with retained-content recomputation, hash-only continuity, legacy and post-start bypass evidence.
- [x] Add Dashboard/Discord guild-scoped audit-integrity evidence and dependency-free contract gate.
- [x] Author Phase 15 Vitest and live-DB gate coverage without claiming execution.
- [ ] Execute migration 049 on an explicitly approved disposable DB; verify RLS/grants/triggers/indexes/guild cascade and migration rollback.
- [ ] Run same-guild concurrent audit writers and prove sequence uniqueness/head serialization under contention and process failure.
- [ ] Exercise governed audit-content retention then verify hash-only continuity, and inject direct bypass/tamper attempts against the live schema.
- [ ] Measure verifier/write latency under representative retained audit volume.
- [ ] Add external/WORM checkpointing only if a future approved requirement/provider exists; do not claim it from the current database chain.

## Phase 16 remaining evidence
- [x] Replace capture-time VERIFIED overclaim with CAPTURED -> INTEGRITY_CHECKED -> RESTORE_VERIFIED evidence lifecycle.
- [x] Add schema-v3 canonical hashing and legacy checksum provenance/downgrade migration 050.
- [x] Bind restore approval to backup content hash/hash algorithm/current restore plan hash and re-check after restore lock acquisition.
- [x] Add append-only backup verification evidence and require a SUCCEEDED restore run before RESTORE_VERIFIED promotion.
- [x] Add dependency-free Phase 16 contract gate plus authored Vitest/live-DB coverage.
- [ ] Execute migration 050 on an explicitly approved disposable DB; verify constraints/RLS/grants/triggers/indexes and legacy-row downgrade behavior.
- [ ] Run real Discord backup -> preview -> independent approval -> apply -> verify and confirm durable RESTORE_VERIFIED evidence.
- [ ] Inject backup payload/hash tamper, stale plan, process restart and mid-restore failure; confirm fail-closed/compensation behavior.
- [ ] Measure canonical capture and post-restore verification latency/storage at representative Hybrid/Omni scale.


## Phase 18 - plugin sandbox / executable live QA
- [x] Add `LINUX_NS_SECCOMP_V1` with user/mount/network/PID namespaces, read-only/noexec plugin root, hidden host FS/proc, capability drop, seccomp and Node permission defense in depth.
- [x] Fail startup closed when third-party plugins are enabled but the actual host hostile sandbox probe is not verified.
- [x] Persist plugin execution isolation profile with migration 051 and add disposable-DB constraint evidence probe.
- [x] Add dependency-free live HTTP security/load/soak/client-abort gate and synthetic self-test.
- [x] Add Chromium CDP desktop/mobile/reduced-motion/accessibility/runtime gate and policy-independent synthetic self-test.
- [x] Extend manual live-verification workflow with HTTP/browser switches and `npm ci` for dependency-backed DB/Discord gates.
- [ ] Execute migration 051 and full DB gate on an approved disposable product database.
- [ ] Execute Discord/HTTP/browser gates against explicitly approved deployed/test targets and retain evidence.
- [ ] Run sustained load/chaos/restart/rate-limit tests sized to actual deployment constraints before production maturity claims.


## Phase 19 dependency admission / reproducible lock bootstrap
- [x] Add exact-pin/direct-source/lock-v3/root-parity/registry/integrity/install-script dependency policy.
- [x] Add bounded review-only lock bootstrap that runs no lifecycle scripts and deletes partial output on failure.
- [x] Add manual GitHub lock-bootstrap workflow that uploads review evidence without installing the generated graph.
- [x] Make dependency-backed CI fail closed on the reviewed lock policy and use `npm ci`, advisory audit and SBOM generation.
- [x] Integrate dependency-policy evidence into shared Release Truth and Dashboard.
- [ ] Restore npm registry access, generate/review/commit the real `package-lock.json`, then promote Docker/Render installs to `npm ci`.
- [ ] Execute the full dependency-backed QA-003 lane and retain typecheck/Vitest/build/audit/SBOM evidence.


## Phase 20 source syntax integrity / offline preflight
- [x] Reproduce and fix the TypeScript raw-newline syntax defect in legal-hold operator output.
- [x] Add a TypeScript compiler-API parser gate over all TypeScript-family source with a malformed-source sentinel.
- [x] Run the strict parser before dependency-backed CI semantic typecheck and before `release:gate` enforcement.
- [x] Add consolidated offline source preflight and Phase 20 regression evidence.
- [ ] After reviewed dependency installation, rerun the parser with project-pinned TypeScript 7.0.2 and execute full QA-003 semantic typecheck/Vitest/build/audit/SBOM.

## Phase 21 committed-tree release provenance integrity
- [x] Reproduce commit-labelled manifest hashing dirty tracked filesystem bytes under `--allow-dirty`.
- [x] Add shared committed-tree reader using `git ls-tree` + batched `git cat-file`.
- [x] Upgrade release manifest/provenance to schema v2 committed-tree evidence.
- [x] Prevent untracked/dirty lockfiles from satisfying committed dependency evidence.
- [x] Add isolated-Git regression contract and wire it into offline preflight/CI source contracts.
- [ ] After QA-003 is unblocked, generate reviewed lock/SBOM and produce clean-tree manifest/provenance from an actual release commit.

## Phase 22 GitHub workflow supply-chain integrity
- [x] Pin every external GitHub Action reference to a reviewed immutable full commit SHA.
- [x] Add an explicit action allowlist with adjacent human version annotations.
- [x] Disable checkout credential persistence and require explicit workflow permissions.
- [x] Reject mutable/dynamic refs, unapproved/Docker actions, `write-all` and `pull_request_target`.
- [x] Reuse the workflow-policy evaluator inside Release Truth and release enforcement.
- [x] Add adversarial Phase 22 fixture regression plus actual-repository inventory checks.
- [ ] Re-review upstream action commits before any future pin upgrade; never replace reviewed SHAs with mutable major tags.


## Phase 23 experience/orchestration expansion
- [x] Add shared bounded Setup Impact Analyzer to `/setup` preview and Change Control.
- [x] Add `/setup`-managed `game-sessions` module with private member availability and durable session lifecycle.
- [x] Add session join/leave/control, event fanout, bounded reminder scheduling and progression/analytics hooks.
- [x] Add read-only automation rule simulation/explain API + Dashboard dry-run.
- [x] Add sample-aware analytics trend/health primitives and operational evidence.
- [x] Add dependency-free Phase 23 regression contract.
- [ ] Execute migration 052 and concurrent session-capacity/RLS tests on an approved disposable DB.
- [ ] Run real Discord session create/join/leave/reminder/state transitions and Dashboard automation dry-run against approved targets.

## Phase 25 final closure
- [x] Pin exact reviewed Node/npm/TypeScript toolchain across local/CI/container source surfaces.
- [x] Add Render pre-install runtime toolchain guards and Release Truth integration.
- [x] Add adversarial toolchain drift gate and final source attestation.
- [ ] Resolve BLK-001 in a network-capable environment, review/commit `package-lock.json`, promote Docker/Render to `npm ci`, then execute QA-003.
- [ ] Run approved live DB/Discord/deployed browser/provider/plugin-target verification before Production Ready/VERIFIED claims.

## Phase 26 final stabilization
- [x] Hydrate `/setup` and Dashboard from persisted desired state.
- [x] Reconcile managed locks, integrations/schedules, Gaming enablement, analytics and backup in both directions.
- [x] Bind approvals to full desired config + managed panels + base config version/fingerprint and increase approval identity to 96 bits.
- [x] Add configuration-only impact/risk analysis and Change Control max-risk behavior.
- [x] Add semantic setup validation, cancellation/lease boundaries and post-commit convergence fingerprint.
- [x] Add environment/config surface audit, SetupDraft surface audit and Phase 26 regression contract.
- [ ] QA-003: create/review `package-lock.json`, run `npm ci`, project-pinned semantic typecheck, Vitest, production builds, audit and SBOM in a network-capable reviewed environment.
- [ ] Run migrations 001-054 and setup reconciliation/E2E against approved disposable DB + Discord/deployed targets.

## Phase 27 Total Visual Experience
- [x] Add 10 shared token-driven visual themes and 5 scene presets under `/setup`.
- [x] Add Visual Experience blueprint category/role/channels/preview voice room and five managed visual panels.
- [x] Add capability-aware role enhanced-color/icon fallback through scan/plan/apply.
- [x] Add 230 theme media files with static+motion coverage for all 11 Server Pulse states and byte/hash/frame manifests.
- [x] Add Dashboard Theme Studio, Server Pulse, Live Server Map, capability rail and reduced-motion behavior.
- [x] Add migration 054 + durable living-panel event de-dup, restart recovery, expiry and coalesced managed-message edits.
- [x] Add guild-scoped visual evidence API and Phase 27 1069-assertion source/media contract gate.
- [ ] Execute migration 054 live-DB probe on an approved disposable target.
- [ ] Execute Components V2 living edits, role enhanced colors/icons, repair/rollback and actual rate-limit behavior on an approved Discord test guild.
- [ ] Run deployed Dashboard visual regression/mobile/reduced-motion/performance checks with the project dependency graph installed.

## Phase 28 remaining verification
- [x] Implement event-backed realtime Canvas/3D/particle/emoji visual runtime and adaptive performance governor.
- [x] Publish/match real ticket, community-event and progression events and cover event-to-FX names with regression assertions.
- [x] Move managed panel/asset/UI presentation to Thai source-of-truth and add a dedicated Thai presentation audit.
- [x] Replace direct Discord/HTTP backend-error echo with safe Thai presentation boundaries while preserving diagnostic logs.
- [x] Regenerate governed visual assets/manifests with the Phase 28 visual grammar and verify byte/hash/frame evidence.
- [x] Add Phase 28 + Thai gates to consolidated offline preflight; current preflight passes 31 gates.
- [ ] Resolve BLK-001, review/commit the real dependency lock, then run project-pinned typecheck/Vitest/build/audit/SBOM.
- [ ] Run migration 054 + visual state/event evidence against an approved disposable DB.
- [ ] Run approved Discord burst/edit/rate-limit tests for living panels and Phase 28 event families.
- [ ] Run deployed browser/mobile/WebSocket profiling for FPS, CPU/GPU, memory, reduced-motion, reconnect and accessibility behavior.

## Phase 29 production reality / operations intelligence
- [x] Derive a read-only Server Digital Twin from the canonical setup plan rather than create a second planner.
- [x] Add evidence-backed Operations Intelligence from durable queues/outbox/inbox/heartbeats/incidents/SLO plus Discord/realtime runtime evidence.
- [x] Add guild-scoped Event Replay over durable + live evidence with de-dup, ordering diagnostics, recursive secret redaction and an explicit no-side-effect UI.
- [x] Add priority-aware Visual Orchestrator with deterministic preemption/suppression/merge/duplicate semantics and bounded particle/duration budgets.
- [x] Add sustained-FPS hysteresis to the visual performance governor and immediate reduced-motion/hidden overrides.
- [x] Add Phase 29 production-intelligence and chaos/replay gates and include them in consolidated offline preflight.
- [x] Trace Operations Intelligence SQL against current migrations and guard aggregate `FILTER` syntax in Phase 29 regression.
- [ ] Resolve BLK-001 and run dependency-backed semantic typecheck/Vitest/build/audit/SBOM with a reviewed lockfile.
- [ ] Execute Digital Twin preview/apply/rollback comparison against an approved Discord test guild.
- [ ] Execute Operations Intelligence queries and measure query plans/latency on an approved migrated PostgreSQL/Supabase target.
- [ ] Exercise Event Replay auth/tenant isolation/redaction with representative approved durable event data.
- [ ] Run deployed WebSocket burst/reconnect + desktop/mobile/GPU profiling and real chaos/load/recovery drills before VERIFIED/Production Ready claims.

- [x] Recovery Evidence V2 read-only cross-proof timeline + fault harness; [ ] approved live restore-drill/database proof remains pending.
