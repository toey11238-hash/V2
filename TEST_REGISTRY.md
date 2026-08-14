# TEST REGISTRY

No product feature is VERIFIED. Authored tests and dependency-free checks are evidence below the full verification gate.

## Authored suites
| Suite | File(s) | Coverage | Normal execution |
|---|---|---|---|
| Core/config/command | core/config/command tests | hashing/events/config/slash ceiling | BLOCKED by npm |
| Setup/control | control-center/blueprints/change-control tests | setup draft, blueprint identity, safe changes/custom validation | BLOCKED by npm |
| Panels/assets | assets tests | render/storage contracts | BLOCKED by npm |
| Domains | domains/forums/scheduler-notifications tests | support/security/forums/notifications/temp role/scheduler | BLOCKED by npm |
| Recovery | recovery tests | permission drift, backup integrity/restore plan, approval hash | BLOCKED by npm |
| Gaming | gaming tests | non-wagering, LFG/tournament/XP/state logic | BLOCKED by npm |
| Phase 4 scale contracts | `tests/phase4-platform.test.ts` | cache, compatibility, growth, maintenance, event ordering, recruitment, blueprint reports | BLOCKED by npm; smoke subset executed |
| Plugins/recommendations/flags/AI/rewards | corresponding suites | trust/advisor/canary/secret/free-entry policies | BLOCKED by npm; smoke subsets executed |

## Executed checks in current Phase 4 working tree
| Check | Result | Evidence |
|---|---|---|
| Canon structural audit | PASS | 1 slash root, 8 blueprints, 31 contiguous migrations, 39 managed media refs |
| Domain smoke | PASS - 18 assertions | `node --experimental-transform-types scripts/domain-smoke.mjs` |
| Static global `tsc` differential | PARTIAL PASS | 0 project-local candidates after filtering absent Node/React/external declarations |
| Recruitment debug repro | PASS after root fix | pure validator extracted; production Gaming package boundaries preserved |
| npm registry repro | BLOCKED | deterministic `EAI_AGAIN getaddrinfo registry.npmjs.org` |

## Domain smoke coverage
Canary determinism; AI secret/data-class guards; free-entry anti-paid/wager invariants; monotonic event ordering; growth mode/recommendation scoring; maintenance policy; human-readable blueprint report; TTL cache behavior; recruitment validation.

## Required before VERIFIED
Full dependency-backed typecheck/Vitest/build; disposable DB migration/RLS/concurrency/cache/ordering tests; Discord mock/test-guild E2E; setup race/restart/rollback; panel lifecycle; inbox/outbox/queue/scheduler/recovery; backup/restore drill; multi-guild security; load/chaos; accessibility/mobile/localization and deployed smoke evidence.

## Phase 5 dependency-free evidence
- `npm run test:domain-smoke`: PASS - 25 assertions covering Phase 3/4 contracts plus rollout hashing, portable config migration/tamper rejection, workflow/scheduler controls and integration health redaction.
- `npm run test:fault-model`: PASS - 17 assertions covering stale/duplicate event rejection, invalid state transitions, future config rejection, HMAC/replay guards and scheduler semantics. This is contract/fault-model evidence, **not** real load/chaos evidence.
- TypeScript transform-types syntax sweep: PASS for current `.ts` source.
- Dashboard TSX parse: PASS for 10 `.tsx` files using the available global TypeScript parser.
- Full `tsc`: blocked at missing `@types/node` because npm registry is unavailable; no dependency-backed compiler claim is made.
- `npm run release:readiness`: correctly BLOCKED by missing `package-lock.json` and remaining `latest` dependency ranges.
- `tests/phase5-operator-control.test.ts` is authored for Vitest but cannot be executed until dependencies are available.


## Phase 6 dependency-free evidence
- `tests/phase6-security-verticals.test.ts` authored for Vitest: bounded schedule parsing, creator transitions, rate limiting/security headers and circuit breaker behavior. Normal Vitest execution remains blocked by npm DNS.
- `npm run test:domain-smoke`: PASS - 37 assertions.
- `npm run test:fault-model`: PASS - 23 assertions.
- `npm run test:stress-model`: PASS - 9 deterministic model assertions across 5,000 ordered events, 100-way cache single-flight, 500 modeled rate-limit subjects and half-open circuit behavior. **This is not real load/chaos evidence.**
- Phase 6 changed `.ts` transform-types syntax checks PASS; `OperationalDeck.tsx` parse PASS with global TypeScript parser.
- Full dependency-backed `tsc`/Vitest/build remains blocked by missing npm-installed declarations.

## Phase 7 dependency-free/static evidence
- `tests/phase7-audit-webhooks-release.test.ts` authored for Vitest: audit redaction/cursors, webhook secret/timestamp/delivery rules, locale parity and truthful release blocker evidence. Vitest execution remains blocked by npm DNS.
- `npm run test:domain-smoke`: PASS - 47 assertions including audit redaction/cursor, webhook env binding/hash, built-in generic inbound HMAC/namespacing and release truth.
- `npm run test:fault-model`: PASS - 30 assertions including malformed cursors, stale webhook timestamps, adapter-secret namespace escape and internal-event spoof prevention.
- `npm run test:a11y-i18n`: PASS - 11 static contract assertions for document language, focus-visible, reduced motion, mobile breakpoints, image alt text and TH/EN key parity. **Not browser accessibility E2E evidence.**
- `npm run test:stress-model`: remains PASS - 9 deterministic model assertions; **not real load/chaos evidence**.
- Changed `.ts` syntax and changed Dashboard TSX parsing PASS with available runtime/global parser; full dependency-backed typecheck/build remains blocked.

## Phase 8-9 dependency-free / authored-live evidence
- `tests/phase8-provider-integrations.test.ts` authored for provider config/adapter/snapshot contracts; normal Vitest remains blocked by npm DNS.
- `tests/phase9-realtime-release-gates.test.ts` authored for realtime/release/canary contracts; normal Vitest remains blocked by npm DNS.
- `npm run canon:audit`: PASS - 1 slash root, 8 built-in blueprints, 40 contiguous migrations, 56 managed media refs.
- `npm run test:domain-smoke`: PASS - 56 assertions.
- `npm run test:fault-model`: PASS - 35 assertions.
- `npm run test:stress-model`: PASS - 13 deterministic model assertions including bounded cache/in-flight behavior; NOT throughput/load evidence.
- `npm run test:a11y-i18n`: PASS - 11 static assertions; NOT browser E2E evidence.
- Whole-tree `.ts` syntax sweep and 12-file TSX parser sweep: PASS in current environment.
- Render/CI/live-verification YAML, package JSON, migration 001-040 continuity and `git diff --check`: PASS.
- `npm run release:readiness`: correctly BLOCKED by one finding: missing reviewed `package-lock.json`; direct dependency ranges are exact-pinned.
- Global `tsc`: BLOCKED at missing `@types/node` because npm registry DNS is unavailable.
- `scripts/live-db-gate.ts` and `scripts/live-discord-gate.ts` are authored with explicit disposable/opt-in guards but have NOT been executed against selected real targets.
- Plugin isolation probe proves user/network namespace availability and outbound denial in this host, but read-only filesystem boundary fails; untrusted third-party execution remains fail-closed.


## Server Fabric / UI V2 dependency-free evidence
- `tests/ui-v2-server-fabric.test.ts` authored for Vitest: Standard/Omni topology, no duplicate logical keys, managed role visual defaults and panel target integrity. Normal Vitest remains blocked by npm DNS.
- `npm run test:ui-v2`: PASS - 8 built-in blueprints, 316 Omni resources, 62 managed panel definitions/source contracts and 72 media assets; validates Components V2 markers, `/setup` module breadth, voice-panel target safety, role visual defaults and rejects legacy EmbedBuilder/direct legacy interaction responses across the guarded platform message runtime.
- `npm run canon:audit`: PASS - 1 slash root, 8 built-in blueprints, 40 contiguous migrations, 72 managed media refs.
- `npm run test:domain-smoke`: PASS - 56 assertions.
- `npm run test:fault-model`: PASS - 35 assertions.
- `npm run test:stress-model`: PASS - 13 deterministic model assertions; not live throughput/chaos evidence.
- `npm run test:a11y-i18n`: PASS - 11 static assertions; not browser E2E evidence.
- Changed setup/blueprint/panel/control/API TypeScript syntax checks and Dashboard TSX parser checks pass in the available global parser.
- Live Discord Components V2 create/edit/repair/rollback and browser Dashboard E2E remain required before VERIFIED.

## Server Fabric V3 dependency-free evidence
- `tests/community-fabric.test.ts` authored: Member Care privacy default, safe metadata, state transitions, publication gate. Normal Vitest remains blocked by npm DNS.
- `tests/ui-v2-server-fabric.test.ts` expanded: Fabric V3 keys, resource headroom and default `/setup` no-silent-resource-drop contract.
- `npm run canon:audit`: PASS - 1 slash root, 8 built-in blueprints, 41 contiguous migrations, 97 managed media refs.
- `npm run test:ui-v2`: PASS - 8 blueprints, 407 Omni resources, 82 managed panels, 97 media assets.
- `npm run test:domain-smoke`: PASS - 61 assertions including Community Fabric privacy/validation/state/publication contracts.
- `npm run test:fault-model`: PASS - 35 assertions.
- `npm run test:stress-model`: PASS - 13 deterministic model assertions; NOT throughput/load evidence.
- `npm run test:a11y-i18n`: PASS - 11 static assertions; NOT browser E2E evidence.
- Full dependency-backed Vitest/typecheck/build, migration 041 execution/concurrency/RLS and Discord/browser live E2E remain pending.
## Phase 9 incident / capacity / recovery evidence
- `tests/incidents-capacity.test.ts` authored: incident declaration/state evidence and non-destructive capacity pressure contracts. Vitest remains blocked by npm DNS.
- `tests/recovery-drills.test.ts` authored: expected-check validation, blocker requirements and PASSED evidence gate. Vitest remains blocked by npm DNS.
- `npm run test:domain-smoke`: PASS - 69 assertions including incident/capacity/recovery drill contracts.
- `npm run canon:audit`: PASS - 1 slash root, 8 blueprints, 44 contiguous migrations, 97 managed media refs.
- `npm run test:ui-v2`: PASS - 407 Omni resources, 82 managed panels, 97 media assets.
- Whole-tree TypeScript syntax 129 files and Dashboard TSX parse 12 files PASS; full `tsc` stops only at missing `@types/node` due unavailable npm install.
- `release:readiness` remains BLOCKED only by missing reviewed `package-lock.json`; provenance inspection additionally reports missing SBOM and dirty working tree until commit.


## Phase 10 fairness / budgets / automation / bootstrap evidence
- `tests/phase10-fairness-budgets.test.ts` authored for registered budget bounds/fail-closed keys, deterministic windows, observe/enforce semantics, safe automation allowlist, tenant fairness, readiness and executable-entrypoint source contract. Vitest remains blocked by npm DNS.
- `npm run canon:audit`: PASS - 1 slash root, 8 blueprints, 46 contiguous migrations, 97 managed media refs.
- `npm run test:ui-v2`: PASS - 407 Omni resources, 82 managed panels, 97 media assets plus Phase 10 `/setup` budgets, automation panel/API and executable bootstrap source guards.
- `npm run test:domain-smoke`: PASS - 83 assertions.
- `npm run test:fault-model`: PASS - 36 assertions including automation-worker readiness failure.
- `npm run test:stress-model`: PASS - 13 deterministic model assertions; not real load/chaos evidence.
- `npm run test:a11y-i18n`: PASS - 11 static assertions; not browser E2E evidence.
- Whole-tree TypeScript syntax: 135 files PASS. Dashboard TSX parser: 12 files PASS.
- `release:readiness`: compatibility/migration/pinning PASS and correctly BLOCKED only by missing reviewed `package-lock.json`.

## Phase 11 admission-control evidence
- `tests/phase11-admission-control.test.ts`: authored Vitest coverage for protected paths, balanced defer, observe-only behavior and setup preset persistence; NOT EXECUTED while npm dependency install is blocked.
- `npm run test:domain-smoke`: PASS - 89 assertions including admission pressure/preset/stale-evidence semantics.
- `npm run test:fault-model`: PASS - 39 assertions including critical-incident bulk defer, support-path protection and OBSERVE non-enforcement.
- `npm run test:ui-v2`: PASS - 407 Omni resources / 82 panels / 97 assets plus setup/API/worker admission source guards.
- Whole-tree Node TypeScript syntax: PASS 138 files; Dashboard TSX parser: PASS 12 files.
- Live migration 047, concurrent admission decision locking, overload retry timing and Discord/DB integration remain pending.


## Phase 12 truth / traceability evidence
- `npm run test:project-truth`: current-state migration frontier/checkpoint/registry drift guard; expected current frontier = migration 053.
- `npm run generate:requirement-traceability`: deterministic Canon + Master Spec Markdown bullet-leaf map generation.
- `npm run test:traceability`: rejects missing/stale generated leaf map and validates referenced feature IDs.
- These are source-quality gates only; they do not replace dependency-backed tests or live integration evidence.


## Phase 13 external AI source/pure evidence
- `npm run test:domain-smoke`: PASS 93 assertions, including external provider allowlist/secret/store-false and setup AI-provider normalization contracts.
- `npm run test:external-ai`: PASS 12 assertions covering disabled defaults, required allowlists, local default/fallback, setup persistence/surfaces, guild opt-in + live permission source guards, fixed Responses endpoint, `store:false`, fixed model and external/non-free provider identity.
- `tests/ai-hooks.test.ts`: dependency-backed coverage authored for external allowlists, secret/data-class rejection and mocked provider response; execution remains blocked until dependencies are installed.
- Live external provider E2E is NOT RUN and remains a separate completion gate.


## Phase 14 data-governance evidence
- `npm run test:data-governance`: PASS - 52 dependency-free assertions for durable hold classes, deterministic plan/policy hashes, safe candidate/revision/hold guards, CRITICAL two-operator release source contract, repeatable/bounded privacy snapshots, privacy approval/artifact scoping, canonical export hashing, durable expiry-task reconciliation/revival, and advisory-lock-safe stale retention-run convergence. This is not live DB evidence.
- `tests/phase14-data-governance.test.ts`: AUTHORED - dependency-backed Vitest for pure retention/hold/canonical-hash contracts; normal Vitest is blocked by BLK-001 in this environment.
- `scripts/live-db-gate.ts`: expanded to require migration-048 governance tables and retention-run evidence columns after the complete migration set is applied. It remains manual/opt-in and has NOT been executed here.

## Phase 15 audit-integrity evidence
- `npm run test:audit-integrity` - PASS 45 dependency-free assertions covering canonical hashing, sequence/previous-hash binding, migration append/immutability/RLS contracts, atomic repository source path, bounded verifier, bypass/hash-only semantics, HTTP/Discord/Dashboard/operator wiring and retention boundary.
- `tests/phase15-audit-integrity.test.ts` - AUTHORED / NOT EXECUTED HERE because dependency install remains blocked.
- `scripts/live-db-gate.ts` Phase 15 expansion - AUTHORED / NOT EXECUTED HERE; intended to verify chained write, detailed-audit UPDATE rejection, hash-only continuity after approved content deletion, bypass detection and tenant cleanup on an approved disposable DB.
- Phase 15 source contracts are `TESTING`, not live database/security verification.

## Phase 16 backup/restore evidence gates
- `npm run test:backup-restore-evidence`: PASS 39 dependency-free source/pure assertions in this checkpoint.
- `tests/phase16-backup-restore-evidence.test.ts`: authored Vitest coverage; NOT executed because dependency installation remains blocked.
- `scripts/live-db-gate.ts`: authored Phase 16 probe for canonical JSONB round-trip, CAPTURED -> INTEGRITY_CHECKED -> RESTORE_VERIFIED transitions, append-only verification evidence and guild cleanup; NOT executed without an approved disposable DB.
- A real Discord backup -> governed restore -> post-apply verification drill remains required before disaster-recovery or restore-verification maturity claims.

## Phase 17 source completion
- `npm run test:phase17-completion` - dependency-free Steam provider + `/setup` wiring + Supabase deployment-profile contract. SOURCE/STATIC only.
- Live Steam/provider behavior and Supabase DB/Storage remain NOT RUN until approved network/targets exist.

## Phase 18 plugin sandbox / executable live-QA evidence
- `npm run security:plugin-isolation-gate` - current-host hostile `LINUX_NS_SECCOMP_V1` probe; PASS requires every filesystem/process/syscall/network/secret check true. Host-specific evidence only.
- `npm run test:phase18-plugin-sandbox` - PASS 45 dependency-free assertions covering fail-closed config/runtime wiring, namespace/read-only/capability/seccomp/Node layers, migration/repository evidence and actual hostile current-host probe.
- `npm run test:phase18-live-qa` - PASS 49 dependency-free assertions plus HTTP and Chromium CDP synthetic self-tests.
- `npm run test:live-http-self` - synthetic harness PASS for health/security headers, unauthenticated mutation, malformed request, bounded load, one-second soak and client-abort logic; NOT deployed-product evidence.
- `npm run test:live-browser-self` - synthetic Chromium/CDP harness PASS for desktop/mobile overflow, reduced motion, landmarks/names/AX tree, mixed content and runtime/console failures; NOT deployed-product evidence.
- `scripts/live-db-gate.ts` - AUTHORED / NOT EXECUTED against a selected DB; exact migration set, rollback/advisory lock/RLS, Phase14-16 evidence plus migration-051 isolation-profile persistence/constraint/index probe.
- `scripts/live-discord-gate.ts` - AUTHORED / NOT EXECUTED against a selected guild; explicit opt-in and separately gated disposable mutations with cleanup.
- `.github/workflows/live-verification.yml` - manual-only DB/Discord/HTTP/browser orchestration. DB/Discord dependency path uses `npm ci` and remains blocked until a reviewed lockfile exists.

## Phase 19 dependency-admission evidence
- `npm run test:dependency-policy` - PASS 28 dependency-free assertions covering exact pins, direct-source rejection, lock v3/root parity, registry/integrity enforcement, install-script inventory and post-lock install-surface promotion.
- `npm run test:phase19-dependency-admission` - PASS 35 source-contract assertions covering bootstrap fail-closed behavior, review-only workflow, CI `npm ci`/audit/SBOM lane, Release Truth integration and Dashboard evidence.
- `npm run dependency:lock-policy` - current source policy PASS; overall dependency policy BLOCKED only by missing `package-lock.json`.
- `npm run dependency:bootstrap-lock` - authored and bounded; current workspace network attempt fails closed and leaves no partial lockfile. A successful run requires a network-capable environment and still produces review-only evidence, not release verification.
- Full QA-003 typecheck/Vitest/build/audit/SBOM execution remains NOT RUN until the reviewed lockfile exists.

## Phase 20 source-integrity evidence
- `npm run test:source-syntax` - PASS on the current host: 161 TypeScript-family source files parsed with TypeScript compiler API 5.8.3 from the explicit global fallback. This is syntax evidence only; the project-pinned TypeScript 7.0.2 dependency has not been installed here.
- Reproduction fixed: `apps/platform/src/discord/operator-actions.ts` previously contained a literal newline inside the single-quoted `.join(...)` separator for legal-hold output. Global `tsc` reported TS1002/TS1005 parser failures while Node strip-types `--check` returned success.
- Temporary one-line fix removed all TS1xxx parser diagnostics; after the real fix, full global `tsc -p tsconfig.json --noEmit` advances to the expected missing `@types/node` dependency blocker rather than a source parse failure.
- `npm run test:phase20-source-integrity` covers parser registration, sentinel, the fixed separator, CI ordering and release-gate ordering.
- `npm run test:offline-preflight` composes the dependency-free/source gates plus non-enforcing Release Truth; it is source preflight evidence, not production/release verification.
- QA-003 remains BLOCKED until the reviewed lockfile and project-pinned dependency-backed typecheck/Vitest/build/audit/SBOM lane execute.
- Final Phase 20 regression: `npm run test:phase20-source-integrity` PASS 18 assertions; `npm run test:offline-preflight` PASS 18 composed gates.
- `npm run release:gate` demonstrates ordering: strict source parser PASS first, Release Truth then exits 2 only for `lockfile.missing`.

## Phase 21 - committed-tree release provenance integrity
- `npm run test:phase21-release-provenance` — PASS in current workspace, 24 assertions.
- Deterministic temp-repository repro confirms the pre-fix failure class: a dirty tracked file could previously be hashed into evidence while the manifest still named the earlier commit.
- Regression confirms `--allow-dirty` remains inspection-only, committed tracked bytes win over dirty filesystem bytes, untracked files/lockfiles cannot enter committed evidence, migration/Canon/package/panel-asset hashes come from `HEAD`, and default dirty-tree release mode exits fail-closed.
- This gate is dependency-free Git/source evidence only. It does not satisfy QA-003, produce a reviewed lockfile, run project-pinned typecheck/Vitest/build/audit/SBOM, or prove a deployed release.

## Phase 22 workflow supply-chain evidence
- `npm run test:workflow-supply-chain` - PASS in current workspace; 3 workflow files, 9 external action uses, 3 approved actions, zero findings.
- `npm run test:phase22-workflow-supply-chain` - PASS 24 dependency-free fixture assertions covering mutable tags, digest drift, unapproved/dynamic/Docker actions, missing version annotations, checkout credential persistence, permission failures and the actual repository inventory.
- `release:readiness` consumes the same pure workflow-policy evaluator; current workflow policy is ready while release remains blocked only by `lockfile.missing`.
- This is source/workflow supply-chain evidence. It does not prove upstream GitHub availability, branch protection, QA-003 dependency execution or a deployed release.

## Phase 23 experience/orchestration evidence
- `npm run test:phase23-experience-expansion`: dependency-free contract covering setup impact, Gaming availability/session state, automation simulation, analytics trends, migration 052/RLS and end-to-end source wiring. Current checkpoint: PASS 59 assertions.
- `packages/database/migrations/052_gaming_sessions_orchestration.sql`: AUTHORED / NOT EXECUTED HERE. Live DB must verify RLS/grants/FKs/capacity race/session transition contention/tenant isolation.
- Discord/Dashboard session and automation-simulation paths are source-integrated; live interaction/browser evidence remains pending.

## Phase 24 source / live gates
- `npm run test:phase24-session-reliability-slo`: dependency-free contract for admission/waitlist/check-in/common-time ranking, operational error budgets, automation lint, migration 053 and Discord/Dashboard wiring. Current checkpoint: PASS 66 assertions.
- `packages/database/migrations/053_gaming_session_reliability.sql`: AUTHORED / NOT EXECUTED HERE. The manual DB gate must verify concurrent JOINED/WAITLISTED admission, FIFO promotion, unique waitlist positions, check-in constraints/RLS and tenant isolation.
- `scripts/live-db-gate.ts`: Phase 24 extension expects one concurrent join to become JOINED and one WAITLISTED at capacity, then verifies atomic promotion after a leave and host check-in inside the configured window. NOT RUN against a selected target here.

## Phase 25 reproducible toolchain / final closure evidence
- `npm run test:toolchain-policy` - dependency-free exact-toolchain policy enforcement for package metadata, local version files, npm engine strictness, Docker, GitHub setup-node, Render pre-install guards and current runtime Node/npm.
- `npm run test:phase25-final-closure` - adversarial drift fixtures plus wiring/source assertions for toolchain policy, Release Truth and final attestation semantics.
- `npm run final:attest` - runs consolidated source/offline preflight and writes `artifacts/final-source-attestation.json`; successful source evidence remains explicitly separate from release/live verification.
- QA-003 dependency-backed semantic typecheck/Vitest/build/audit/SBOM remains BLOCKED until the reviewed lockfile exists.

## Phase 26 final stabilization evidence
- `npm run test:phase26-final-stabilization` — regression contract for persisted setup hydration, full configuration impact, bidirectional reconciliation, base-bound approvals, cancellation/lease boundaries, post-commit convergence, Gaming metadata preservation and confirmed setup compile/runtime defects.
- `npm run test:setup-surface` — machine audit that all 22 top-level `SetupDraft` fields, 4 managed integration groups and 5 budget groups have control/reload/worker/Dashboard ownership plus stale-approval/convergence guards.
- `npm run test:config-surface` — environment/deployment configuration audit covering validated schema keys, `.env.example`, Render environment keys and server-secret handling.
- Global TypeScript semantic diagnostic preflight with dependency types intentionally removed now reports only expected missing Node/Vite ambient effects (`ImportMeta.env`, timer `.unref`) in the targeted local-error classes; full semantic typecheck is still QA-003 and remains unexecuted.
- Phase 26 source evidence MUST NOT be represented as live setup execution, migration execution or dependency-backed project verification.

## Phase 27 — Total Visual Experience
- `npm run test:phase27-visual-experience` — dependency-free pure/source/media contract gate. Current checkpoint: PASS 1069 assertions across 10 themes, 5 scenes, 11 Server Pulse states, 230 theme media files with byte/hash verification, 103 panel media entries, role-capability fallback, `/setup` wiring, migration 054, durable living panels, Dashboard visual surfaces and guild-scoped visual evidence API.
- `npm run test:ui-v2` — current visual checkpoint: PASS 8 blueprints / 415 Omni resources / 87 managed panels / 103 panel media assets.
- `scripts/live-db-gate.ts` — extended with AUTHORED Phase 27 probe for migration 054 tables, durable event de-dup, rendered/min-update evidence and expiry to IDLE. NOT EXECUTED against an approved DB in this workspace.
- Live Discord Components V2 rendering, role enhanced-color/icon capability behavior and event edit/rate-limit behavior remain NOT RUN against an approved test guild.

## Phase 28 — Extreme visual/system overhaul
- `npm run test:phase28-extreme-overhaul` — PASS **5,762 assertions** across 8 blueprints, 2,136 generated resources, 87 managed panels and 333 governed assets; covers event-to-FX contracts, source event publishers, Dashboard realtime stage, asset bytes/hashes/frames, visual-experience wiring and Thai panel source expectations.
- `npm run test:thai-presentation` — PASS **5,818 assertions** across 87 panel titles, 119 action labels, 87 asset titles, 136 Discord setters, 135 helper labels, 57 modal placeholders, 20 Dashboard placeholders and 2,136 generated resources; this is source/static presentation evidence, not a live linguistic/usability study.
- `node scripts/source-syntax-gate.mjs --require-typescript` — PASS **180 TypeScript-family source files** with TypeScript parser 5.8.3 in the current host.
- `npm run test:offline-preflight` — PASS **31 dependency-free/source gates** after Phase 28 was added to the consolidated preflight. Release Truth still returns BLOCKED only for `lockfile.missing`.
- `npm run test:ui-v2` — PASS 8 blueprints / 415 Omni resources / 87 panels / 103 panel media references after the overhaul.
- `npm run test:a11y-i18n` — PASS 14 static assertions including Thai locale, realtime stage `aria-live`/reduced-motion contract and responsive presentation guards.
- No Phase 28 source PASS is a substitute for approved live Discord/WebSocket/browser/mobile/GPU/FPS/database evidence or dependency-backed semantic typecheck/Vitest/build/audit/SBOM.

## Phase 29 production reality / operations intelligence evidence
- `npm run test:phase29-production-intelligence` - PASS 51 assertions: Digital Twin semantics; Operations Intelligence evidence/SQL contracts; replay safety/order/redaction; Recovery Evidence V2 cross-proof and fault cases; visual orchestration/governor behavior; HTTP/Dashboard wiring, Thai copy and accessibility hooks. Source/pure/static evidence only.
- `npm run test:phase29-chaos-replay` - PASS 4016 assertions: RealtimeHub duplicate/backpressure/recent bounds, 700-event replay bound/order/redaction, 1200-action Digital Twin fail-closed pressure, critical overload synthesis, deterministic visual branch proof plus 2000-event particle/duration/dedup stress, governor anti-flap/hidden-page behavior. Deterministic source-model stress only; not deployed load/chaos evidence.
- Phase 29 gates are mandatory members of `npm run test:offline-preflight`; current consolidated source preflight is 33 gates before source attestation.
- Live PostgreSQL/Discord/WebSocket/browser/mobile/GPU/restore/load evidence and dependency-backed QA-003 remain separate and are not upgraded by these gates.
