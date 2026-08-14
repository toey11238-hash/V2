# PROJECT STATUS

Date: 2026-08-15
Maturity: LEVEL 0 - broad integrated source; dependency-backed and live integration verification blocked
Canonical chain: CANON -> SPEC -> REGISTRY -> CODE -> TEST -> INTEGRATION
Phase 29 production reality / operations intelligence is the current source checkpoint, layered on Phase 28 extreme visual/system overhaul and Phase 27 total visual experience and Phase 26 final stabilization / configuration truth, layered on Phase 25 reproducible toolchain / final source closure, layered on Phase 24 Gaming session reliability / SLO expansion, layered on Phase 23 experience/orchestration expansion and Phase 22 GitHub workflow supply-chain integrity, layered on Phase 21 committed-tree release provenance integrity, Phase 20 source syntax integrity/offline preflight, Phase 19 dependency admission, Phase 18 fail-closed plugin sandbox/executable live-QA, Phase 17 source completion, Phase 16 backup/restore evidence hardening, Phase 15 audit integrity, Phase 14 durable data governance, Phase 13 external-AI hardening and earlier Canon layers. The imported ZIP does not contain `.git`, so no new immutable commit hash is claimed here; Phase 10 checkpoint `1e55273` remains historical context from the prior repository state.

## Current milestone
Phase 29 turns the Phase 28 presentation/runtime foundation into stronger operator truth without adding a second control plane. `/setup` preview now includes a read-only Server Digital Twin derived from the same deterministic planner; Dashboard Operations Intelligence synthesizes existing durable jobs/outbox/inbox/heartbeats/incidents/SLO evidence plus Discord/realtime state; Event Replay merges guild-scoped durable outbox and bounded live history with ordering diagnostics, recursive secret redaction and no mutation path. Realtime visuals now pass through one priority-aware orchestrator with PREEMPT/SUPPRESS/MERGE/DUPLICATE semantics and a hysteresis performance governor. No migration was added: frontier remains 054. Phase 29 source gates pass, but QA-003 remains BLOCKED until a real reviewed lockfile and project-pinned typecheck/Vitest/build/audit/SBOM run; live DB/Discord/WebSocket/browser/mobile/GPU/chaos evidence remains separately unverified.

## Integrated source state
- Slash roots: one registered root, `/setup`; Canon second slot remains reserved.
- Blueprints: 8 built-ins plus guild-scoped custom blueprints and visual composer.
- Database: authored migrations `001` through `054`; none executed against a selected real DB here.
- Server Fabric: Hybrid Standard now authors 208 logical resources (40 roles, 22 categories, 125 text, 8 forum, 13 voice); Omni Premium authors 415 (94 roles, 37 categories, 246 text, 12 forum, 26 voice).
- Managed panels/media: 87 panel definitions, 103 managed panel PNG/GIF media references and 230 theme media assets with hashes/dimensions/frame metadata. Managed panels plus platform-owned Discord interaction, operational/status and scheduled/background delivery surfaces use Discord Components V2 in current source; native Discord modals remain native. Live-guild V2 create/edit/repair/rollback evidence is still pending.
- Setup/integrations: `/setup` owns Riot Data Dragon, GitHub Releases, Discord Status and Steam News public provider configuration, enable state and durable sync cadence; it also owns the per-guild AI provider preference. `local-rules` is default; external OpenAI egress remains dual-opt-in and capability/data-class gated.
- Runtime: executable bootstrap now wires Discord login/events, SETUP/RESTORE/PERMISSION_REPAIR job handlers, scheduler, inbox/outbox, durable automation, HTTP health/readiness, heartbeats and bounded shutdown. Jobs use priority-lane tenant fairness; optional/background work uses durable per-guild budgets.
- Probes: `/live` is process liveness, `/ready` is dependency/worker readiness with 503 on required failures, `/health` is diagnostic detail; Render uses `/ready`.
- Governance: canary observations now accept durable metric outcomes and produce review-only expand/hold/rollback recommendations; no automatic promotion or rollback path was added.
- Deployment evidence: non-root Docker runtime, source-contract CI lane, reviewed-lock `npm ci` verification lane, manual review-only dependency bootstrap, manual DB/Discord/HTTP/browser verification workflow and schema-v2 release manifest/provenance tooling that binds Git-labelled source evidence to committed blobs and refuses dirty release artifacts by default.
- Plugin security: explicit `LINUX_NS_SECCOMP_V1` combines user/mount/network/PID namespaces, private read-only/noexec plugin filesystem, hidden host FS/proc, capability drop, raw-BPF seccomp and Node permissions. The current host hostile probe passes all checks; third-party still defaults OFF and every deployment target must independently pass startup verification plus reviewed RSS/PID controls.

## Verification evidence available now
- `npm run canon:audit`: PASS - 1 slash root, 8 built-in blueprints, 54 contiguous migrations, 103 managed media refs.
- `npm run test:ui-v2`: PASS - 8 blueprints, 415 Omni resources, 87 managed panels, 103 panel media assets, platform-runtime legacy-response guard, `/setup` module breadth and voice-panel target safety.

- Operations evidence: durable operational incidents (migration 042), advisory capacity snapshots (043), recovery-drill evidence lifecycle (044), and release provenance hashing are now authored/integrated. None of these converts static source into live production evidence.
- `npm run test:domain-smoke`: PASS - 93 dependency-free assertions.
- `npm run test:fault-model`: PASS - 39 dependency-free fault/contract assertions; not real chaos/load evidence.
- `npm run test:stress-model`: PASS - 13 deterministic model assertions; explicitly not throughput/load/chaos evidence.
- `npm run test:a11y-i18n`: PASS - 14 static accessibility/localization assertions; explicitly not browser E2E evidence.
- `npm run test:external-ai`: PASS - 12 source/pure assertions covering disabled-by-default flags, guild setup opt-in, fixed egress, `store:false` and permission contracts; this is not a live provider call.
- `npm run test:data-governance`: PASS - 52 source/pure assertions; migration 048/live DB evidence remains pending.
- `npm run test:audit-integrity`: PASS - 45 source/pure assertions; migration 049/live DB tamper/concurrency evidence remains pending.
- `npm run test:backup-restore-evidence`: PASS - 39 source/pure assertions; migration 050/live DB/Discord restore drill evidence remains pending.
- TypeScript compiler-parser sweep: PASS 187 TypeScript-family source files with current-host TypeScript 5.8.3 fallback and malformed-source sentinel; this is syntax evidence, not project-pinned semantic typecheck.
- Generated repository reference: 62 packages / 54 migrations / 87 panels; final workspace manifest is regenerated after source attestation (see `FILE_MANIFEST.md`).
- Render/CI/live-verification YAML parse, package JSON, migration continuity and source whitespace checks: PASS. The imported ZIP has no `.git`, so no current `git diff --check` evidence is claimed.
- `npm run test:dependency-policy`: PASS - 28 source/pure assertions. `npm run test:phase19-dependency-admission`: PASS - 35 source-contract assertions.
- `npm run dependency:lock-policy`: source policy PASS; overall dependency policy and `npm run release:readiness` remain correctly BLOCKED only by absent `package-lock.json`.
- Plugin isolation probe: current host `LINUX_NS_SECCOMP_V1` hostile gate PASS for filesystem/process/syscall/network/secret checks; deployment-target re-probe and hard RSS/PID evidence remain pending.

- `npm run test:phase17-completion`: PASS - 21 dependency-free assertions for Steam public news and Supabase durable deployment-profile truth; live provider/Supabase evidence pending.
- `npm run security:plugin-isolation-gate`: PASS on the current host - hostile `LINUX_NS_SECCOMP_V1` probe with all checks true; host-specific evidence only.
- `npm run test:phase18-plugin-sandbox`: PASS - 45 dependency-free assertions.
- `npm run test:phase18-live-qa`: PASS - 49 dependency-free assertions including synthetic HTTP and Chromium CDP harness runs; not product live evidence.
- `npm run test:phase21-release-provenance`: PASS - 24 isolated-Git assertions proving dirty tracked source/package/migration/assets and untracked lockfiles cannot substitute into committed Git-labelled evidence.
- `npm run test:workflow-supply-chain`: PASS - 3 workflows / 9 external uses / 3 reviewed actions / 0 findings; `npm run test:phase22-workflow-supply-chain`: PASS 24 adversarial/actual-repository assertions.
- `npm run test:phase23-experience-expansion`: PASS - 60 source/pure/wiring assertions covering setup impact, Gaming session/availability, automation simulation and analytics trends; migration/live interaction evidence remains pending.
- `npm run test:phase24-session-reliability-slo`: PASS - 66 source/pure/wiring assertions covering session waitlist/check-in/common-time recommendations, SLO error budgets, automation lint and migration 053 contracts; live evidence remains pending.
- `npm run test:toolchain-policy`: PASS - exact Node/npm/TypeScript local/CI/container/deploy source policy with current runtime match.
- `npm run test:phase25-final-closure`: PASS - adversarial toolchain drift and final-attestation wiring contracts.


- `npm run test:phase29-production-intelligence`: PASS - 51 source/pure/wiring assertions covering Digital Twin semantics, Operations Intelligence evidence, Event Replay safety/order/redaction, visual orchestration/governor behavior, SQL aggregate-filter contract and Thai Dashboard wiring.
- Recovery Evidence V2: PASS source/fault-model integration - read-only backup/integrity/approval/restore/verification/drill timeline; verified restore claims require matching linked proof and contradictions fail closed. Live restore-drill evidence remains pending.
- `npm run test:phase29-chaos-replay`: PASS - 4,016 deterministic source-model assertions covering realtime dedup/backpressure bounds, replay/twin stress, critical overload synthesis, visual priority/budget stress and governor anti-flap behavior; not deployed load/chaos evidence.
- `npm run test:config-surface`: PASS - schema/example/deploy surface audit (53 schema keys / 53 env-example keys / 20 Render env entries / 9 protected secrets).
- `npm run test:setup-surface`: PASS - all 22 top-level SetupDraft fields, 4 integration groups and 5 budget groups are owned by control/reload/worker/Dashboard surfaces.
- `npm run test:phase26-final-stabilization`: PASS - 70 regression assertions covering confirmed setup defects, desired-state reconciliation, base-bound approval, configuration impact and convergence guards.
- `npm run test:phase27-visual-experience`: PASS - 1,069 source/pure/media/hash assertions covering 10 themes, 5 scenes, 230 theme media files, capability-aware role visuals, durable living-panel state and visual API/setup/Dashboard wiring; migration/live Discord evidence remains pending.
- `npm run test:offline-preflight`: PASS - 33 composed source/offline gates through Phase 29, including visual/media, Thai presentation, production-intelligence and chaos/replay contracts; Release Truth inside the preflight remains BLOCKED only by `lockfile.missing`.
- `npm run final:attest`: emits machine-readable source/workspace attestation only after offline preflight; current expected status remains SOURCE_ATTESTED_RELEASE_BLOCKED until the reviewed lock exists.
- Requirement traceability: PASS - 1,894 deterministic leaves (227 Canon + 1,667 Master Spec). Feature source/static coverage: 252/253 = 99.605% at IMPLEMENTED/INTEGRATED/TESTING or higher; the only non-covered row is QA-003 dependency-backed verification, still BLOCKED by BLK-001.

## Verification blockers
- npm registry DNS reproduces `EAI_AGAIN getaddrinfo registry.npmjs.org`; the bounded Phase 19 bootstrap also fails closed and leaves no partial lockfile. No `npm ci`, dependency-backed full typecheck/Vitest/build/audit/SBOM is claimed in this environment.
- `npm run test:source-syntax`: PASS - 188 TypeScript-family source files parsed with current-host global TypeScript 5.8.3 plus malformed-source sentinel. Global full semantic `tsc` remains dependency-blocked; no project-pinned dependency-backed compiler claim is made.
- Migrations 001-054 have not been run on a user-selected disposable PostgreSQL/Supabase target.
- No user-selected Discord test guild exists for hierarchy/rate-limit/restart/recovery/E2E evidence.
- Connected Supabase project `koksaiapp` is not assumed to belong to this product and remains untouched.
- Current-host third-party kernel isolation is proven, but deployment-target sandbox capability plus hard RSS/PID quota evidence is not yet verified.

## Next evidence gates
1. In a network-capable environment run the review-only lock bootstrap, inspect and commit the approved `package-lock.json`, run `release:dependency-lock-gate`, promote Docker/Render to `npm ci`, then run `npm ci`, full typecheck/Vitest/build/audit/SBOM.
2. Use the manual live-verification workflow or local gates against an explicitly approved disposable DB and Discord test guild; capture migrations/RLS/concurrency/recovery/provider/realtime evidence.
3. Run Supabase security/performance advisors only on the selected project after migrations are applied.
4. Run the authored Discord/HTTP/browser gates plus sustained load/race/chaos/soak and restore/deployment drills against explicitly approved targets.
5. Keep third-party plugins disabled on any deployment target until that host passes `security:plugin-isolation-gate` and reviewed RSS/PID containment is in place.

## Completion truth
NOT production-ready. No product feature is VERIFIED merely because source exists. LEVEL 0 remains correct until applicable Canon TEST + INTEGRATION gates have recorded evidence.

## Server Fabric V3 checkpoint additions
- Fabric module completeness is now an invariant: every desired resource module must exist in its blueprint enabled-module set, and default `/setup` for Hybrid must preserve the full blueprint instead of silently filtering resources.
- Non-Gaming Fabric V3 adds Discovery & Connection, Member Care, Project Lab, Event Studio, Content Studio, Knowledge Ops, Member Ops and Reliability Ops with managed roles/categories/text/forum/voice surfaces.
- Durable Community Fabric workflows cover PROJECT / MEMBER_CARE / CONTENT / EVENT. Member Care defaults PRIVATE; public lists exclude Member Care; review transitions are explicit and audited.
- Community Fabric is reachable from Components V2 panels and the guild-scoped Dashboard Workflows workspace with CSRF/live-permission mutation guards.
- Migration `041_community_fabric_workflows.sql` is AUTHORED / NOT EXECUTED HERE. No DB-backed Fabric feature is VERIFIED.

## Phase 10 source additions
- Migrations 045-046 add registered guild resource budgets and durable automation receipt/execution evidence; they are AUTHORED / NOT EXECUTED HERE.
- Job claim ordering preserves critical/high/normal priority lanes, then applies same-guild in-flight/recent-start fairness to reduce noisy-neighbor starvation.
- `/setup` configures provider/analytics/backup/notification/bulk-automation budgets in its versioned durable draft; Dashboard and Discord operator views use the same policy store.
- Generic automation is fail-closed to `NOTIFY_TOPIC`, `SCHEDULE_NOTIFICATION`, and `AUDIT_NOTE`; arbitrary HTTP, SECURITY/MAINTENANCE spoofing and destructive generic mutations are not exposed.
- `apps/platform/src/index.ts` is now the executable composition root and delegates HTTP routes to `apps/platform/src/http/server.ts`; the prior duplicate-HTTP entrypoint defect is removed in current source.

## Phase 11 source additions
- Migration 047 authors guild admission policies and immutable decision evidence with RLS defense-in-depth.
- `/setup` Advanced governance persists `BALANCED / CONSERVATIVE / MAX_AVAILABILITY` admission preset and Setup Worker applies it with the same config flow.
- Discord `/setup`, Dashboard Setup and approved Change Execute evaluate `STRUCTURAL` admission before queueing; Setup Worker re-checks immediately before mutation.
- Scheduled provider sync, analytics, scheduled backups, non-safety notification fanout and bulk automation evaluate admission before resource budgets. Security/Maintenance notification topics bypass optional-work admission/budgets by design.
- Admission falls back to current durable backlog/resource evidence when the latest recorded capacity assessment is stale; it does not require fabricated pressure data.
- Operator Deck and Capacity panel expose policy/decision evidence. OBSERVE records would-defer without blocking; ENFORCE can defer with retry hints.
- Source/static evidence only; migration 047, concurrent overload behavior and live Discord/DB recovery remain unverified.

## Phase 12 source-quality additions
- `scripts/project-truth-audit.mjs` rejects stale current-state migration references and missing Phase 12 registry evidence.
- `scripts/requirement-traceability.mjs` deterministically maps every Markdown bullet leaf in `CANON.md` and `MASTER_SPEC.md` to current feature states, implementation/evidence areas and test gates.
- `docs/generated/REQUIREMENT_LEAF_TRACEABILITY.md` is generated evidence of tracking coverage only; it does not convert source presence into VERIFIED status.
- npm/DB/Discord/browser/load/recovery blockers are unchanged and remain authoritative.


## Phase 13 external AI additions
- `packages/ai-hooks` now includes an optional OpenAI Responses adapter with a fixed endpoint, explicit capability/data-class allowlists, secret-like-field rejection, bounded input, timeout handling and hashed run evidence; raw prompts are not persisted by the platform AI run ledger.
- `AI_EXTERNAL_PROVIDERS_ENABLED=false` and `OPENAI_AI_ENABLED=false` remain defaults. Enabling OpenAI requires server-side API key/model plus explicit capability/data-class allowlists.
- `/setup` now stores `aiProvider` per guild with fail-safe default `local-rules`; Discord Advanced Setup and Dashboard Leaf Controls use the same durable draft.
- External Dashboard calls additionally require the guild to have selected the provider and a current live Manage Server/Administrator permission recheck. Arbitrary provider URLs/keys are not exposed.
- `scripts/external-ai-contract-smoke.mjs` is a fail-closed source/pure regression gate. Live provider behavior, billing/quota and deployment evidence remain unverified.


## Phase 14 data-governance additions
- Durable legal holds: guild/data-class scoped `ACTIVE`/`RELEASED` evidence with no automatic expiry; creation is immediately protective.
- Hold release: CRITICAL approval, two distinct non-requester approvers, explicit execute step, and per-guild governance revision bump.
- Retention: normalized preview, plan SHA-256, candidate-count ceiling, governance-revision binding, transaction-scoped advisory lock, hold recheck, and atomic delete/evidence commit.
- Retention crash convergence: stale RUNNING evidence can be failed only under the same guild advisory-lock namespace; resumed executors re-check their own run row after lock acquisition before deletion.
- Privacy export: repeatable read-only bounded projections, canonical JSON hashing, source-row + 2 MiB payload ceilings, bounded 1-168 hour TTL, terminal FAILED evidence on source/query failure, guild/subject scope verification and durable expiry-task reconciliation.
- Source contract: `npm run test:data-governance` PASS 52. Migration 048, dependency-backed Vitest and live concurrency/RLS/operator workflows remain unexecuted.

## Phase 15 audit-integrity source additions
- Migration 049 authors `audit_integrity_heads` and `audit_integrity_entries` plus mutation guards; it is AUTHORED / NOT EXECUTED HERE.
- `AuditRepository.record` appends detailed audit content and chain evidence atomically under a per-scope head-row lock.
- `AuditLogService.verifyIntegrityTail` is bounded and validates chain/link/head evidence, recomputes retained content, labels retained-hash-only segments honestly and detects direct post-start unchained audit writes.
- Dashboard Audit Explorer and Discord `status:audit-integrity` expose guild-scoped evidence without presenting the mechanism as WORM/external notarization.
- `npm run test:audit-integrity` passes 45 dependency-free source/pure contracts. Dependency-backed Vitest and migration-049 live DB checks are authored but blocked by BLK-001/BLK-002.

## Phase 16 backup/restore evidence source additions
- Migration 050 authors explicit backup verification lifecycle/provenance and append-only verification evidence; it is AUTHORED / NOT EXECUTED HERE.
- New backup capture is `CAPTURED` first, then promoted to `INTEGRITY_CHECKED` only after durable read-back and canonical digest verification.
- Historical checksum-only `VERIFIED` rows are downgraded to `LEGACY_UNPROVEN`; no historical restore proof is fabricated.
- Restore approvals bind backup content hash/hash algorithm/current canonical plan hash, and the worker re-checks these after the guild restore lock is acquired.
- `RESTORE_VERIFIED` promotion requires the linked restore run to already be `SUCCEEDED` and stores append-only verification evidence.
- Discord/Dashboard copy distinguishes integrity-check evidence from demonstrated restore proof.


## Phase 18 source additions
- Migration 051 records plugin execution isolation profiles with strict allowlist/index evidence; AUTHORED / NOT EXECUTED HERE.
- `LINUX_NS_SECCOMP_V1` is Linux x86_64-specific and fail-closed. Current-host hostile probe passes, but deployment-target proof remains separate.
- Manual live-verification now has explicit DB, Discord, HTTP and browser switches. DB/Discord use locked `npm ci`; HTTP/browser are dependency-free.
- HTTP harness covers health/security/bounded load/optional soak/client-abort. Chromium CDP harness covers desktop/mobile/reduced-motion/accessibility/mixed-content/runtime evidence.
- Synthetic live-harness self-tests are evidence that the QA tools work; they are not evidence that a deployed product target passes them.


## Phase 19 source additions
- `packages/dependency-policy` evaluates exact pins, lockfile v3/root parity, trusted registry origins, integrity digests, install-script inventory and install-surface mode.
- `scripts/bootstrap-dependency-lock.mjs` is bounded/no-retry, package-lock-only, ignore-scripts, package.json-immutable and partial-output-cleaning. A successful run emits review evidence but does not authorize lifecycle execution.
- `.github/workflows/dependency-bootstrap.yml` is manual and uploads lock/evidence only; it does not install the generated graph.
- CI verify now requires the reviewed dependency lock and uses `npm ci`, typecheck, Vitest, production builds, high-severity audit and SBOM.
- Docker/Render are intentionally not switched until the real reviewed lock exists; after it exists Release Truth blocks any remaining unlocked install surface.
- QA-003 remains BLOCKED and no production-ready claim is created by this source hardening alone.


## Phase 20 source syntax integrity additions
- Fixed the legal-hold Discord operator output separator from an invalid raw multiline single-quoted string to escaped `\n\n`.
- Added `scripts/source-syntax-gate.mjs` using TypeScript compiler parser diagnostics and a deliberately malformed sentinel. Node strip-types `--check` is explicitly not accepted as the sole TypeScript syntax gate.
- Dependency-backed CI executes the parser after reviewed `npm ci` and before semantic typecheck; `release:gate` executes the parser before Release Truth enforcement.
- Added `scripts/offline-release-preflight.mjs` and `QA-022`; current-host parser evidence is source syntax only and does not advance QA-003.

## Phase 28 current milestone
- **Source milestone:** Extreme Visual + System Overhaul integrated and offline-preflight green.
- **Presentation:** Thai is source-of-truth for managed panel/resource/UI presentation; technical API/provider/enum keys remain stable with Thai context when users must see them.
- **Realtime:** Dashboard visual stage consumes real runtime/WebSocket event evidence; living Discord panels remain durable/de-duplicated/coalesced managed-message edits.
- **Visual assets:** 333 governed assets with byte/hash/dimension/frame evidence and reduced-motion/static fallback policy.
- **Evidence:** Phase 28 5,762 PASS; Thai presentation 5,818 PASS; parser 180 PASS; offline preflight 31 gates PASS.
- **Release state:** not VERIFIED; Release Truth remains BLOCKED only by missing reviewed `package-lock.json`, with live target evidence also pending under BLK-002.
