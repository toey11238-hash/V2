# PROJECT MEMORY - AUTHORITATIVE CURRENT STATE

Last updated: 2026-08-15
Read order: `CANON.md` -> this file -> `DECISIONS.md` -> `FEATURE_REGISTRY.md` -> `PROJECT_STATUS.md` -> `TODO.md` / `BLOCKED.md` -> relevant registries/code.

## Canonical product direction
- Production-grade Discord Auto Server Platform; Master V2 is baseline minimum scope.
- At most two top-level slash commands. Current source registers only `/setup`; second slot reserved.
- `/setup` configures every domain including Gaming and integrations; Gaming is first-class and non-Gaming breadth is equally mandatory.
- Gambling/betting/casino/wagering mechanics are prohibited; community rewards remain free-entry only.
- Real-time/progress must be state/event backed; Discord writes remain rate-limit aware.
- Premium media/motion assets live in repository and use supported Discord/web capabilities.
- GitHub + Render Free-compatible + Supabase-compatible zero-mandatory-cost profile is canonical with limitations stated honestly.


## Phase 29 current checkpoint
- Recovery Evidence V2 extends the existing recovery subsystem only: fail-closed cross-proof requires linked SUCCEEDED restore run plus matching RESTORE_VERIFY/PASS backup hash evidence; the Dashboard evidence timeline is read-only and does not create a second recovery engine.
- Digital Twin: canonical `/setup` plan -> read-only topology/mutation/conflict/API-pressure evidence -> existing approval/apply path. No second planner and no preview execution edge.
- Operations Intelligence: existing jobs/outbox/inbox/service-heartbeat/incident/SLO evidence + Discord/realtime status -> pure bounded health/signals -> Thai Dashboard console. It is observational and does not auto-remediate.
- Event Replay: guild-scoped `event_outbox` + bounded RealtimeHub recent history -> chronological de-dup/order diagnostics -> bounded recursive secret redaction -> read-only Thai inspector. No republish/Discord/DB mutation path.
- Visual runtime: actual events -> visual directive -> priority orchestrator -> bounded Canvas/CSS-3D stage. Security/critical evidence may preempt decorative work; compatible bursts merge; low-priority work may be suppressed; governor changes tier only after sustained FPS evidence.
- Migration frontier remains 054; Phase 29 intentionally reuses existing durable evidence rather than adding duplicate tables.
- Source evidence: Phase 29 production-intelligence PASS 51; chaos/replay PASS 4,016; parser PASS 188. Dependency/live evidence boundaries remain unchanged.

## Current runtime topology
`/setup -> durable draft -> scan -> deterministic plan/hash -> preview/approval -> durable job -> guild lock -> idempotent mutation journal -> verify -> managed panels/assets -> config/audit/realtime`.

Dashboard: `Discord OAuth2 -> guild-scoped session -> CSRF + live permission -> setup/operator/audit/structure/diagnostics/recovery/change/governance/release/provider APIs -> React Command Bridge`.

Async: durable jobs + inbox/stream ordering + outbox + scheduler leases/reconciliation + process heartbeats. Cache is performance-only, bounded, never authoritative. Realtime disconnects slow clients rather than permitting unbounded process buffering.

Provider sync: `/setup provider config -> registered adapter -> allowlisted HTTPS -> bounded fetch/circuit policy -> content snapshot hash/version -> integration health/audit -> durable reschedule`. Built-in public adapters: Riot Data Dragon, GitHub Releases, Discord Status and Steam News; `generic-inbound` remains signed webhook ingress. No provider secret is stored in ordinary guild config.

## Current data / assets
- Authored migrations, NOT RUN here: `001_core.sql` through `054_visual_experience.sql`.
- 87 managed panel definitions.
- 103 managed panel PNG/GIF media references plus 230 theme media assets with hash/dimension/frame/byte manifests.
- Hybrid Standard: 208 logical resources (40 roles / 22 categories / 125 text / 8 forum / 13 voice). Omni Premium: 415 logical resources (94 roles / 37 categories / 246 text / 12 forum / 26 voice).
- Managed panels plus platform-owned Discord interaction responses, operational/status messages and scheduled/background delivery use Components V2 containers/text/media/actions in current source; native Discord modals remain native and live-guild V2 behavior still requires evidence.

## Phase 8-9 additions in source
- public/no-secret Riot Data Dragon, GitHub Releases, Discord Status and Steam News adapters with runtime capability truth, snapshots, hashes and scheduled sync;
- `/setup` and Dashboard use one durable provider-config schema so one control surface does not silently reset the other;
- WebSocket buffered-amount backpressure, duplicate event suppression and reconnect-friendly 1013 close policy;
- bounded L1 TTL cache + bounded single-flight loaders while PostgreSQL/shared cache remains L2 and non-authoritative;
- Discord shard modes `single / auto / manual` with configuration validation;
- PostgreSQL pool/connect/statement/query timeout controls plus pool-pressure health evidence;
- separate `/live`, `/ready`, `/health` probes; readiness uses actual job/scheduler/inbox/outbox snapshots;
- bounded graceful shutdown with non-zero failure truth;
- manual disposable DB and Discord live gates; non-root Docker + readiness healthcheck; source-contract CI lane;
- exact direct dependency pins plus Phase 19 machine-checkable dependency admission/review-only lock bootstrap while the real lock remains blocked by network isolation;
- Phase 20 TypeScript compiler-parser source integrity gate plus consolidated offline source preflight;
- Phase 21 committed-tree release provenance integrity: Git-labelled source evidence now hashes committed HEAD blobs instead of mutable working-tree bytes;
- Phase 22 GitHub workflow supply-chain integrity: external Actions are allowlisted immutable commit SHAs, checkout credentials are non-persistent, workflow permissions are explicit and shared Release Truth enforces the same policy;
- Phase 23 experience/orchestration expansion: `/setup` impact preview, private Gaming availability + scheduled sessions/reminders, read-only automation dry-run/explain and sample-aware analytics trends are source-integrated; migration 052 is authored/not run;
- Phase 24 session reliability/SLO expansion: bounded FIFO session waitlists, atomic promotion, real-window check-in/attendance, timezone-cohort common-time recommendations, automation safety lint and 24h runtime error-budget evidence are source-integrated; migration 053 is authored/not run;
- Phase 25 final closure: exact Node 22.16.0 / npm 10.9.2 / TypeScript 7.0.2 toolchain policy is shared by source gates and Release Truth; final source attestation binds canonical source/migration hashes while explicitly preserving release/live blockers;
- Phase 26 final stabilization: `/setup` now hydrates persisted desired state, reconciles managed runtime state bidirectionally, binds approval to full desired config + base version/fingerprint, evaluates configuration-only risk, validates configuration semantics and verifies post-commit convergence; Dashboard/portable config share the same state projection;
- canary outcome metrics linked to evaluation observations with review-only recommendations and no automatic promote/rollback;
- third-party plugins remain disabled by default; `LINUX_NS_SECCOMP_V1` now provides target-probed user/mount/network/PID namespaces, private read-only/noexec plugin filesystem, capability drop, raw-BPF seccomp and Node permission defense in depth. The current host hostile probe passes, but target-specific re-probe and hard RSS/PID controls remain required.

## Verification evidence
- Canon audit PASS: 1 slash root / 8 built-in blueprints / 54 migrations / 103 managed media refs.
- UI V2 smoke PASS: 8 blueprints / 415 Omni resources / 87 managed panels / 103 panel media assets, plus Components V2, runtime legacy-response guard and safe-target source contracts.
- Domain smoke PASS: 93 assertions.
- Fault-model smoke PASS: 39 assertions.
- Stress-model smoke PASS: 13 assertions; deterministic model only.
- A11y/i18n smoke PASS: 14 assertions; static contract only.
- External-AI contract smoke PASS: 12 assertions; source/pure contract only, not a live provider call.
- Phase 17 completion smoke PASS: 21 assertions; Steam public-news + Supabase durable-profile source contract only.
- Phase 18 plugin sandbox smoke PASS: 45 assertions; current-host hostile isolation gate PASS.
- Phase 18 live-QA smoke PASS: 49 assertions including synthetic HTTP and Chromium CDP harness self-tests; not deployed product evidence.
- Phase 19 dependency-policy smoke PASS: 28 assertions; Phase 19 source-contract smoke PASS: 35 assertions. Current source dependency policy passes, but release dependency policy remains blocked by the absent lockfile.
- Requirement traceability PASS: 1,894 deterministic leaves (227 Canon + 1,667 Master Spec) after Phase 29 + Recovery Evidence V2.
- Feature source/static coverage: 252/253 = 99.605%; QA-003 dependency-backed verification remains the only non-covered row.
- Current TypeScript parser gate PASS: 187 `.ts`/`.tsx` family source files parsed with current-host TypeScript 5.8.3 fallback; parser sentinel PASS. YAML/JSON/migration continuity/whitespace checks PASS.
- Phase 21 committed-tree provenance gate PASS: 24 isolated-Git assertions; dirty inspection hashes committed blobs, not dirty filesystem bytes, and untracked lockfiles cannot satisfy committed dependency evidence.
- Phase 22 workflow supply-chain gate PASS: 3 workflows / 9 external action uses / 3 reviewed actions / 0 findings; adversarial contract PASS 24 assertions; Release Truth consumes the same evaluator.
- Phase 23 experience expansion smoke PASS: 60 assertions; setup-impact/Gaming session/automation simulation/analytics trend source contracts only, not live integration evidence.
- Phase 26 config surface audit PASS: 53 schema keys / 53 `.env.example` keys / 20 Render env entries / 9 protected secrets.
- Phase 26 setup surface audit PASS: 22 top-level SetupDraft fields / 4 managed integration groups / 5 budget groups across control/reload/worker/Dashboard.
- Phase 26 stabilization smoke PASS: 70 assertions; source/configuration contract only, not dependency-backed or live target evidence.
- Generated repository reference: 62 packages / 54 migrations / 87 panels; final workspace manifest is regenerated after source attestation (see `FILE_MANIFEST.md`).
- `npm run final:attest` is the final source/workspace evidence command; it must preserve release blockers and never substitute for Git/live evidence.
- Release-readiness remains correctly BLOCKED only by absent `package-lock.json`; no direct dependency uses `latest`, ranges or alternate direct sources. Release Truth now also checks lock root parity, registry/integrity evidence, post-lock install-surface mode and immutable GitHub workflow action policy.
- After the Phase 20 syntax fix, global full `tsc` advances to the expected missing `@types/node` dependency blocker. Project-pinned TypeScript 7.0.2 semantic typecheck remains NOT RUN because dependencies are unavailable.

## Never infer from this file
- Migrations have NOT been executed on a selected DB.
- Discord/deployed HTTP/browser E2E has NOT been run on selected targets; Phase 18 HTTP/CDP self-tests are synthetic harness evidence only.
- Render/GitHub/Supabase deployment has NOT been proven live.
- Public provider source integration is not equivalent to provider availability/SLA evidence.
- Static/synthetic stress/accessibility checks are NOT real deployed load/chaos/accessibility E2E evidence.
- Current-host plugin sandboxing is verified for the authored profile, but that evidence MUST NOT be treated as verification for another deployment target or as a hard RSS/cgroup guarantee.
- No product feature is VERIFIED solely from source presence.

## Next continuation order
1. Read Canon + this memory + Registry/TODO/Blocked and inspect the actual source/migration/registry workspace; inspect Git HEAD/worktree only if `.git` is present, otherwise do not invent commit evidence.
2. Do not modify unrelated Supabase `koksaiapp` unless user explicitly selects it.
3. When npm network works: run the review-only lock bootstrap, inspect/commit the approved lock, run `release:dependency-lock-gate`, promote Docker/Render to `npm ci`, then run full compiler/Vitest/build/audit/SBOM gates.
4. Run disposable DB/RLS/concurrency/recovery/provider evidence, then the guarded Discord/HTTP/browser E2E gates and restore drill.
5. Re-run the plugin hostile gate plus reviewed RSS/PID containment on the actual target before any untrusted plugin enablement; continue scale/security breadth without weakening Canon or fabricating capabilities.

## Server Fabric V3 continuation state
- New non-Gaming domains in desired state: `discovery`, `member-care`, `project-lab`, `event-studio`, `content-studio`, `knowledge-ops`, `member-ops`, `reliability-ops`.
- Built-in blueprint module lists are completed from actual resource modules, preventing default `/setup` from silently dropping desired resources. A regression smoke caught and corrected community progression roles that were incorrectly bound to the Gaming `progression` toggle.
- Durable `community_fabric_work_items` + event history are authored in migration 041. Public discovery never exposes MEMBER_CARE records; staff transitions use the same state machine from Discord and Dashboard.
- Current dependency-free evidence: Canon PASS 1/8/47/97; UI V2 PASS 407/82/97; domain 89; fault 39; stress-model 13; a11y/i18n 11. This remains below live integration verification.
## Phase 9 operations evidence additions
- `packages/incidents` + migration 042 provide staff-only operational incident declaration, durable timeline, explicit states and correlation IDs. Resolution/closure requires a substantive note.
- `packages/capacity` + migration 043 record advisory NORMAL/WATCH/THROTTLE/EMERGENCY pressure from current durable/realtime evidence and configurable internal soft ceilings; no automatic structural deletion occurs.
- `packages/recovery-drills` + migration 044 separate recovery-plan source from recovery proof. PASSED requires >=2 passing checks, zero failed checks and at least one evidence artifact reference.
- `scripts/release-provenance.mjs` binds the Git tree, Canon/Spec, migration hash chain, panel asset hashes and optional lockfile/SBOM into a provenance root hash. Missing lockfile/SBOM remains a blocker.

## Phase 10 fairness / budgets / automation / bootstrap additions
- `packages/jobs` now uses critical/high/normal priority lanes followed by durable tenant-fair signals before ordinary priority/age.
- `packages/budgets` + migration 045 provide registered per-guild budget windows/evidence for provider sync, analytics, backup, notification fanout and bulk automation. Unknown keys fail closed.
- `/setup` stores the same five policies in durable setup state and setup apply persists them to the budget repository.
- `packages/automation` + migration 046 + `DurableAutomationWorker` provide durable event receipts/executions, maintenance deferral, `bulk.automation` budget consumption and a safe allowlist only.
- The built runtime entrypoint now actually composes Discord Gateway/event bindings, durable jobs/scheduler/inbox/outbox/automation, HTTP health/readiness, process heartbeats and bounded shutdown.
- Current static/dependency-free evidence is not live DB/Discord proof; BLK-001 and BLK-002 remain release gates.

## Phase 11 admission-control continuation
- Base checkpoint entering Phase 11: `1e55273`.
- New package: `packages/admission-control` with pure deterministic policy plus durable repository/evidence.
- Migration 047: `admission_control_policies` + `admission_decisions`; AUTHORED / NOT EXECUTED HERE.
- Protected invariant: SAFETY / SUPPORT / DIAGNOSTIC paths are never load-shed by Admission Control. No pressure state auto-deletes channels/roles or shrinks the configured Server Fabric.
- Pressure-aware defer is integrated into structural setup/change, providers, analytics, scheduled backup, ordinary notification fanout and bulk automation. Security/Maintenance fanout remains protected.
- Current dependency-free evidence: Canon PASS 1/8/47/97; UI V2 PASS 407/82/97; domain 89; fault 39; stress-model 13; a11y/i18n 11; TS syntax 138; TSX parse 12. Live overload/DB/Discord tests remain pending.


## Phase 12 truth / traceability continuation
- Imported admission-v6 ZIP has no `.git` directory; do not invent a new commit hash for this continuation artifact.
- Current migration frontier remains 047; Phase 12 adds no migration.
- `QA-014` project-truth audit rejects stale current-state migration/checkpoint references.
- `QA-015` generates deterministic leaf-level tracking for every Markdown bullet in Canon + Master Spec into `docs/generated/REQUIREMENT_LEAF_TRACEABILITY.md`.
- Leaf mapping is tracking coverage only; feature states still come from `FEATURE_REGISTRY.md` and no live verification blocker is waived.


## Phase 13 external AI current state
- Optional `openai-responses` provider source exists, but both global external-AI and provider-specific enable flags default OFF. `local-rules` remains the zero-cost default.
- Provider creation requires server-side API key/model plus explicit capability and data-class allowlists; `SECRET` is forbidden and secret-like input keys are rejected before provider execution.
- OpenAI egress is fixed to the Responses API endpoint and sends `store:false`; no arbitrary external URL/tool/action execution is exposed by this adapter.
- Guild setup now carries `aiProvider`, defaults to `local-rules`, and persists through the same `/setup` durable draft used by Dashboard/Discord. External Dashboard runs require both matching guild setup preference and live guild management permission.
- `npm run test:external-ai` passes 12 dependency-free source/pure contracts; live external-provider E2E remains pending and no feature is VERIFIED from this alone.


## Phase 14 durable data-governance current state
- Migration 048 authors guild-scoped `data_governance_state` revision evidence and durable `retention_legal_holds`; it is AUTHORED / NOT EXECUTED HERE.
- Retention approval payloads bind a normalized plan hash, retention-policy selector hash and governance revision. Execution serializes per guild, re-checks active durable holds, rejects expanded candidate scope, and performs destructive deletes + approval/run evidence in one transaction.
- Crash convergence: stale retention runs older than 30 minutes are reconciled to FAILED only while holding the same guild governance advisory-lock namespace; an executor re-checks its own RUNNING row after acquiring that lock before any delete.
- Legal holds are protective and do not auto-expire. Creating a hold increments the governance revision immediately. Release remains ACTIVE until a CRITICAL approval requiring two distinct non-requester operators is approved and explicitly executed.
- Privacy exports now use bounded field projections from one repeatable read-only snapshot, exclude staff-only decision/review notes, fail on source-row overflow instead of truncating, transition failed requests to durable FAILED state, cap payload size/TTL, verify guild/subject scope plus canonical JSON hashes stable across JSONB key reordering, and scheduler reconciliation recreates/revives expiry tasks after worker recovery.
- `npm run test:data-governance` passes 52 dependency-free contracts. `tests/phase14-data-governance.test.ts` and migration-048 live-DB checks are authored but dependency/live execution remains blocked by BLK-001/BLK-002.
- Current checkpoint evidence remains source/static only; no retention/legal-hold/privacy feature is promoted to VERIFIED without disposable-DB concurrency/RLS/failure-recovery and operator-flow evidence.

## Phase 15 audit-integrity current state
- Migration 049 authors per-scope `audit_integrity_heads` / `audit_integrity_entries`, audit UPDATE immutability and ordinary integrity-entry mutation guards; it is AUTHORED / NOT EXECUTED HERE.
- New audit writes through `AuditRepository` bind canonical payload hash + scope + sequence + previous hash + versioned algorithm + event timestamp and atomically commit detailed event, integrity entry and head advance.
- Bounded verifier checks the selected tail, recomputes content when retained, reports hash-only continuity after detailed-content retention, identifies legacy pre-chain events and degrades on direct post-start bypass writes.
- Dashboard and Discord operator status expose chain evidence. The guarantee is database tamper-evidence only; there is no WORM/external notarization or privileged-DB rewrite protection claim.
- `npm run test:audit-integrity` passes 45 dependency-free contracts; authored Phase15 Vitest/live-DB checks remain unexecuted under BLK-001/BLK-002.

## Phase 16 backup/restore evidence current state
- Current migration frontier: 050 (`050_backup_restore_evidence.sql`), AUTHORED / NOT EXECUTED HERE.
- New schema-v3 backups use canonical SHA-256 and durable read-back before `INTEGRITY_CHECKED`; capture never self-claims restore verification.
- Legacy checksum-only `VERIFIED` rows are migration-normalized to `LEGACY_UNPROVEN` and are not restore-eligible by default.
- Restore approval binds backup ID/content hash/hash algorithm/canonical plan hash; worker re-checks run + approval + backup + plan after acquiring the restore lock.
- `RESTORE_VERIFIED` requires a linked `SUCCEEDED` restore run and append-only verification evidence.
- `npm run test:backup-restore-evidence` PASS 39 source/pure assertions. Vitest/live DB/Discord restore drill remain unexecuted.
- Overall project remains LEVEL 0 / NOT production-ready because dependency-backed and live integration gates are still blocked.


## Phase 18 plugin sandbox / executable live-QA current state
- Migration 051 (`plugin_sandbox_evidence`) is AUTHORED / NOT EXECUTED HERE and records allowlisted execution isolation-profile evidence.
- Third-party JavaScript remains disabled by default. Enabling it requires explicit `LINUX_NS_SECCOMP_V1`; startup runs the hostile probe on that runtime host and aborts on failure.
- `LINUX_NS_SECCOMP_V1` is Linux x86_64-specific and layers user/mount/network/PID namespaces, a private read-only filesystem view, plugin `ro,nosuid,nodev,noexec`, no host `/proc`, empty capability sets, raw-BPF seccomp, stripped env and Node permissions.
- Current execution host hostile probe passes all checks. V8 heap budgeting is not a hard RSS boundary; deployment cgroup/container memory/PID controls remain a target-specific prerequisite for untrusted production use.
- Manual live QA now includes exact/disposable DB, guarded Discord mutations, dependency-free HTTP security/load/soak/abort and Chromium CDP desktop/mobile/reduced-motion/AX/runtime gates.
- HTTP/browser synthetic self-tests PASS and validate the harnesses only. No approved product DB, Discord guild or deployed HTTP/browser target was exercised in this checkpoint.


## Phase 19 dependency admission current state
- QA-003 remains the only non-covered Registry row; source hardening does not convert it to TESTING because the actual dependency-backed lane has not run.
- `packages/dependency-policy` validates exact direct specs, npm lock v3/root parity, approved HTTPS registry origins, integrity digests, install-script inventory and post-lock install-surface promotion.
- `dependency:bootstrap-lock` is review-only and runs no dependency lifecycle scripts. It is bounded/no-retry, rejects package.json mutation, deletes partial lock output on failure and emits SHA-256 review evidence on success.
- Manual GitHub bootstrap uploads only lock/evidence. CI dependency-backed verify requires the reviewed lock and `npm ci`, then typecheck/Vitest/build/audit/SBOM.
- Docker/Render intentionally remain on `npm install` until a real reviewed lock exists. Once it exists, Release Truth fails until those surfaces move to `npm ci`.
- Current workspace bootstrap cannot complete because registry DNS remains unavailable; no lockfile was created and no dependency-backed claim is made.


## Phase 20 source syntax integrity current state
- A real TypeScript parser defect was found in `apps/platform/src/discord/operator-actions.ts`: the legal-hold list used a raw multiline single-quoted join separator. TypeScript reported TS1002/TS1005 while Node experimental strip-types `--check` incorrectly returned success.
- A temporary escaped-newline correction removed all parser diagnostics before the real source was changed, proving the fail path. Current source uses `.join('\n\n')`.
- `scripts/source-syntax-gate.mjs` now parses every TypeScript-family source with the TypeScript compiler API and includes an intentionally malformed sentinel. Current-host evidence is 160 files under global TypeScript 5.8.3; project-local TypeScript is preferred when dependencies exist.
- CI verify and `release:gate` now run the strict parser before semantic typecheck/release enforcement. `test:offline-preflight` composes source/pure gates without pretending to satisfy QA-003.
- QA-003 remains the only non-covered Registry row. No project-pinned compiler/Vitest/build/audit/SBOM claim is made.

- Historical Phase 25 final source attestation: SOURCE_ATTESTED_RELEASE_BLOCKED; sourceRootHash `d4a66431a5272abf98e39bcd3ae0ab7320d8c4c21c2a77070ea5d761c335900c`; 232/233 = 99.571%; sole release blocker remains `lockfile.missing`.

- Historical Phase 25 workspace manifest: 446 files; generated repository reference: 60 packages / 53 migrations / 82 panels.

## Phase 26 final stabilization checkpoint
- `/setup`/Dashboard/portable config share persisted desired-state reconstruction; managed locks, integrations/schedules, Gaming enablement, analytics and backup reconcile in both directions.
- Setup approval binds full normalized draft + managed panels + base config version/fingerprint and uses a 96-bit SHA-256 prefix; stale approved base fails before mutation.
- Configuration-only risk is separated from structural impact and Change Control uses the higher risk. Worker commits guild config after dependent reconciliation and verifies post-commit desired-state fingerprint.
- `test:config-surface` PASS (53 schema / 53 env example / 20 Render entries / 9 protected secrets); `test:setup-surface` PASS (22 top-level fields / 4 integrations / 5 budget groups); `test:phase26-final-stabilization` PASS 70.
- Historical Phase 26 consolidated offline preflight PASS 28 gates; hostile current-host plugin isolation and synthetic HTTP/Chromium harness self-tests PASS.
- Historical Phase 26 source attestation: `SOURCE_ATTESTED_RELEASE_BLOCKED`; sourceRootHash `31b8fb80eb59cd4731c73973f564014692ebec096f4043f3f18272965ef06868`; coverage 235/236 = 99.576%.

- Historical Phase 26 generated repository reference: 60 packages / 53 migrations / 82 panels; workspace manifest: 452 files.

## Phase 27 Total Visual Experience checkpoint
- Omni Command Nexus: 10 themes / 5 scene presets / 11 Server Pulse states with event-backed living-panel projection; no one-second Discord animation loop.
- Visual server fabric: Hybrid Standard 208 resources; Omni Premium 415 resources; managed panels 87; panel media 103; theme media 230.
- Durable visual schema migration 054 is AUTHORED / NOT EXECUTED HERE; live DB/Discord/browser evidence remains separate.
- `test:phase27-visual-experience` PASS 1,069 assertions; `test:ui-v2` PASS 415/87/103; source parser PASS 177; offline preflight PASS 29 gates.
- Current source/static coverage is 241/242 = 99.587%; traceability is 1,826 leaves; QA-003 / `lockfile.missing` remains the only non-covered/release-blocking row.
- Generated repository reference: 62 packages / 54 migrations / 87 panels. Final Phase 27 attestation: `SOURCE_ATTESTED_RELEASE_BLOCKED`, sourceRootHash `681371e712ebc8db0f3a2c403e52120aea10e0e862a5454299a96945fef2495d`, coverage 241/242 = 99.587%; only `QA-003` / `lockfile.missing` remains non-covered/release-blocking. Final workspace manifest: 699 files.

## Phase 28 Extreme Visual + System Overhaul checkpoint
- Phase 28 is source-integrated: realtime Canvas/CSS-3D/emoji visual stage, adaptive motion governor, real event-to-FX bridge, Thai source-of-truth presentation, safe user-error boundary and regenerated prismatic-depth media are in the workspace.
- Current governed visual assets: 333 total (103 panel + 230 theme). Managed panel catalog remains 87 definitions with 119 action labels, now Thai at source.
- Source event coverage newly includes ticket create/claim/close/reopen, community-event create/register/cancel/check-in and Gaming XP/level-up; visual state is event-backed and duplicate/fake progress remains prohibited.
- Phase 28 contract PASS 5,762; Thai presentation PASS 5,818; parser PASS 180 TypeScript-family files; UI V2 PASS 8 blueprints / 415 Omni resources / 87 panels / 103 panel media; a11y/i18n PASS 14; consolidated offline preflight PASS 31 gates.
- `release:readiness` remains correctly BLOCKED only by `lockfile.missing`. Dependency-backed QA and live DB/Discord/WebSocket/browser/mobile/GPU evidence are not claimed.
- Final Phase 28 source attestation: `SOURCE_ATTESTED_RELEASE_BLOCKED`, source root `ceee919ea6731a3d0246d5463d6f1cf56514858448f53c99854bdbeb4dd988f5`, feature coverage 246/247 = 99.595%, sole Release Truth blocker `lockfile.missing`. This is source/workspace evidence only.
- Final Phase 29 source attestation: `SOURCE_ATTESTED_RELEASE_BLOCKED`, source root `7214a173c201d098541e180984dc3482cd18ff6cfba7eb113c7497808b43a8a6`, feature coverage 252/253 = 99.605%, migration frontier 054, sole Release Truth blocker `lockfile.missing`. Recovery/live/dependency evidence limitations remain explicit.
