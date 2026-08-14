# SECURITY CHECKLIST

Checked items mean the control exists in current source. They do not mean release verification has passed.

## Implemented controls
- [x] `/setup` requires live guild-management authority; self-service actions are scoped to member-safe resources.
- [x] Discord OAuth2 dashboard session, guild scoping, CSRF checks and live permission recheck on guarded mutations.
- [x] Stable guild/resource identity and ownership (`SYSTEM_OWNED`, `TEMPLATE_OWNED`, `USER_OWNED`, `LOCKED`).
- [x] Guild mutation lock, plan hash, idempotency and conditional rollback journal.
- [x] Staff/privileged roles are excluded from self-role assignment; hierarchy/capability checks exist on role/moderation/temporary-role paths.
- [x] Ticket/report/privacy paths minimize public disclosure; error responses use safe IDs/correlation rather than stack traces.
- [x] Permission drift repair and backup restore use preview/approval; high-risk operations are not silent.
- [x] Persistent anti-abuse observations and tiered alerts exist; no automatic ban is used as the default detector response.
- [x] No gambling/wagering mechanics. Competitive Gaming is non-wagering; community reward flow is free-entry only with explicit paid-entry/wager/casino rejection.
- [x] AI hook blocks secret-like input/data classes and stores hash/metadata instead of raw prompt content by default.
- [x] Plugin manifest rejects Discord Administrator by default; untrusted third-party execution is denied without verified OS/container isolation.
- [x] Integration boundaries use capability/secret-reference/replay-health policy rather than exposing arbitrary secrets.
- [x] Supabase-oriented migration hardening enables RLS/defense-in-depth posture for exposed tables where applicable.
- [x] Environment secrets are not committed; `.env.example` contains placeholders only.
- [x] Maintenance mode is policy-scoped and does not bypass existing authorization/approval checks.
- [x] Gaming recruitment is free community matching only; no paid entry/wager/payment mechanic is accepted by its validation/UI path.

## Verification/hardening still required
- [ ] Execute Supabase security advisors and verify grants/RLS against the real target project.
- [ ] Dependency/SBOM/vulnerability audit after npm access returns; direct ranges are already exact-pinned, but the reviewed transitive lock and dependency-backed audit/SBOM are still missing.
- [ ] Multi-guild/BOLA integration tests for every dashboard and realtime/inbox surface.
- [ ] Discord hierarchy/rate-limit/abuse simulations in a test guild.
- [ ] Distributed multi-instance rate-limit/abuse counters and load evidence.
- [ ] External provider secret rotation/encryption/reference operational drill.
- [ ] Retention/legal-hold/privacy deletion/export integration tests.
- [ ] OS/container isolation profile before enabling untrusted third-party plugins.
- [ ] Full release security review.

## Phase 5 additions
- [x] Feature rollout observations avoid raw user IDs and role lists; evidence uses guild-scoped hashes.
- [x] Portable config import records hashes/schema/plan evidence instead of raw imported payload.
- [x] Integration health details are secret-like-value redacted before persistence/display.
- [x] Integration enable is denied when no registered runtime adapter exists.
- [x] Staff/scheduler/integration mutations require guild scope, CSRF and live Discord permission checks for dashboard users.
- [ ] Dependency audit/SBOM and selected-target RLS/advisor evidence remain blocked/pending.


## Phase 6 additions
- [x] Mutation rate-limit identity is SHA-256 scoped by Guild/route/actor-or-IP; raw actor/IP is not stored in rate-limit windows.
- [x] Durable rate-limit rows include guild scope so one Guild cannot observe another Guild's aggregate windows through Operations.
- [x] API response headers deny framing and disable camera/microphone/geolocation/payment/USB capability by default.
- [x] Vertical Dashboard mutations remain OAuth guild-scoped, CSRF-protected and live Manage Server rechecked.
- [x] Business support still rejects payment credential-like input; SLA alerts do not include raw external reference.
- [x] External integration circuit breaker uses one HALF_OPEN probe to avoid recovery thundering-herd.
- [ ] Real multi-instance rate-limit bypass/load tests and reverse-proxy/client-IP policy validation remain pending.

## Phase 7 security additions
- [x] Audit before/after state is recursively redacted before Dashboard/API display; secret-like keys and common token shapes are not rendered.
- [x] Webhook config stores only a derived env secret reference; raw webhook secrets are never accepted by the control-plane request body.
- [x] Inbound webhooks require a runtime-registered adapter, enabled guild row, raw-body signature, bounded timestamp and durable delivery-ID replay guard.
- [x] Generic inbound adapter namespaces all events under `integration.generic.*` to prevent internal event spoofing.
- [x] Webhook payload capture is size bounded; invalid 4xx requests do not become fake 500 success/failure evidence.
- [ ] Real concurrent replay/signature/RLS tests remain pending on an approved disposable database/runtime.

## Phase 8-9 security additions
- [x] Provider sync is limited to registered adapters and allowlisted HTTPS/DNS destinations with bounded timeout/body size/circuit behavior; ordinary guild config carries no privileged provider secret for the public adapters.
- [x] Direct dependency ranges are exact-pinned; a reviewed transitive lockfile/audit remains blocked by npm DNS.
- [x] Docker runtime drops to a non-root user and readiness healthcheck targets `/ready`.
- [x] Canary outcome review cannot automatically promote or rollback a rollout; destructive rollout change remains operator-governed.
- [x] Realtime slow-client policy disconnects instead of permitting unbounded buffered memory.
- [x] Plugin isolation probe records evidence instead of inferring sandbox safety; network namespace alone is explicitly insufficient.
- [ ] Generate/review `package-lock.json`, dependency audit/SBOM and verify package compatibility in a network-capable environment.
- [ ] Verify public-provider DNS/redirect/rate-limit behavior under real network faults and run selected-target DB/RLS tests.
- [ ] Verify an OS/container filesystem/process/syscall isolation profile before third-party plugin execution is enabled.


## Server Fabric V2 security additions
- [x] Managed role visuals default to `mentionable=false`; hoist is explicit for leadership/operator roles instead of globally enabled.
- [x] Role visual drift is applied through setup desired-state planning and never adds Discord permissions implicitly.
- [x] Managed panel legacy-to-V2 updates clear incompatible legacy message fields before V2 edit rather than mixing legacy embed/content with Components V2.
- [x] Voice control panel targets a text control channel (`CH_VOICE_CENTER`) rather than attempting to deploy a message into a voice channel.
- [x] Platform-owned Discord interaction/status/background-delivery runtime is guarded against legacy `EmbedBuilder`, direct legacy interaction reply payloads and deprecated ephemeral defer syntax; this is source/static evidence, not live-guild evidence.
- [ ] Live Discord hierarchy/Components V2 migration and permission tests remain required on an approved test guild.

## Server Fabric V3 security additions
- [x] Member Care submissions default `PRIVATE`; public listing rejects the MEMBER_CARE domain outright.
- [x] Community Fabric metadata rejects secret/payment/session/token-like keys and complex unbounded values.
- [x] Dashboard Fabric review is guild-scoped, CSRF protected and live Manage Server rechecked before mutation.
- [x] Fabric state changes use a finite state machine plus durable work-event/general audit records.
- [x] New desired roles remain privilege-neutral identities; no Fabric V3 role gains Discord permissions merely from its visual/title profile.
- [ ] Execute migration 041/RLS and concurrent transition/privacy tests on an explicitly approved disposable DB before verification.
## Incident/recovery evidence controls
- [x] Incident and recovery-drill records are guild-scoped, staff-operated, bounded and RLS-enabled in authored migrations.
- [x] Incident resolution/closure requires a substantive note; recovery drill PASSED requires explicit check/artifact evidence.
- [x] Capacity guard is advisory and cannot become an implicit destructive bypass.
- [ ] Execute migrations 042-044 and authorization/concurrency tests on an approved disposable target before verification.

## Phase 10
- [x] Unknown resource-budget keys fail closed in application validation and migration CHECK constraint.
- [x] Generic automation has no arbitrary HTTP action and no generic destructive role/channel mutation action.
- [x] Generic notification automation cannot impersonate SECURITY/MAINTENANCE safety topics.
- [x] Automation rule mutation is guild-scoped, CSRF guarded and rechecks live Discord Manage Server permission.
- [x] Platform bootstrap defaults allowed mentions to none and requests Guild Members intent only when explicitly configured.
- [ ] Verify Gateway intents, slash registration, worker split-role behavior and API auth on approved Discord test environment.

## Phase 11 admission security
- [x] Safety/support/diagnostic classes are protected from admission load shedding.
- [x] Admission does not weaken RBAC/approval/maintenance/permission guards.
- [x] Structural setup/change has pre-queue plus worker-side admission re-check.
- [x] No admission path deletes/shrinks Discord resources or performs punitive moderation.
- [ ] Execute migration 047 RLS/grant/advisor review on approved disposable target.
- [ ] Run concurrent stale/fresh pressure and operator-bypass tests with real DB/Discord target.


## Phase 14 durable data-governance security
- [x] Active legal holds are durable guild/data-class state; release requires CRITICAL two-operator approval and explicit execution.
- [x] Retention approvals bind plan hash, selector-policy hash, governance revision and candidate ceilings; duplicate/unsafe targets fail closed.
- [x] Destructive retention uses one guild-serialized DB transaction and re-checks hold/revision/policy/approval state before deletes.
- [x] Released-hold and retention-run approval provenance uses deletion-restricted foreign keys in migration 048.
- [x] Privacy export excludes staff-only decision/review fields, uses repeatable read-only bounded snapshots, canonical integrity hash + scope verification and recoverable expiry tasks.
- [ ] Execute migration 048 on approved disposable DB and verify RLS/grants/constraints plus concurrent/fault-injected destructive paths before VERIFIED.

## Phase 15 audit-integrity security
- [x] AuditRepository binds canonical payload, scope, sequence, previous hash, algorithm and timestamp into deterministic SHA-256 chain evidence.
- [x] Audit event + integrity entry + chain-head advance share one transaction and same-scope head lock.
- [x] Ordinary detailed-audit UPDATE and ordinary integrity-entry UPDATE/DELETE are rejected after migration 049.
- [x] Approved audit-content retention can delete detailed rows while minimal integrity hashes remain; verifier reports `HASH_ONLY` rather than full-content verification.
- [x] Direct post-chain audit-event writes that bypass the repository are surfaced as degraded evidence.
- [x] Operator surfaces state the boundary: database tamper-evident, not WORM/external notarization.
- [ ] Execute migration 049 on approved PostgreSQL and verify RLS/grants/triggers/cascade/concurrent-writer contention/tamper behavior.
- [ ] If stronger privileged-DB-administrator tamper resistance is required later, design an independently approved external checkpoint/notarization store; do not infer it from the current chain.

## Phase 16 backup/restore integrity
- PASS (source): backup capture no longer self-labels `VERIFIED`; canonical storage round-trip is required for `INTEGRITY_CHECKED`.
- PASS (source): restore approvals bind backup content hash, hash algorithm and deterministic plan hash.
- PASS (source): worker re-checks run/approval/backup identities and plan/hash after acquiring restore lock.
- PASS (source): `RESTORE_VERIFIED` repository promotion requires the linked restore run to be `SUCCEEDED`.
- PASS (source): verification evidence is append-only under ordinary application mutation.
- NOT VERIFIED: migration 050 RLS/grants/trigger behavior and real DB/Discord restore tamper/race scenarios.

## Phase 18 untrusted-plugin / live-QA hardening
- [x] Third-party execution defaults OFF and requires explicit `LINUX_NS_SECCOMP_V1` configuration.
- [x] Actual runtime host is probed before startup accepts third-party enablement; failed probe aborts startup/fails closed.
- [x] Current-host hostile probe covers PID namespace, read-only plugin filesystem, hidden host filesystem/proc, child/Worker denial, kernel-level process-spawn denial, kernel socket denial and secret-env stripping.
- [x] Sandbox drops Linux capability sets and applies raw-BPF seccomp in addition to Node permissions.
- [x] Plugin execution evidence persists the actual isolation profile; migration 051 rejects unknown profile labels.
- [x] Live HTTP gate checks security headers, unauthenticated mutation rejection and malformed-request 5xx behavior.
- [x] Live browser gate checks mixed-content/runtime/AX failures in addition to responsive/reduced-motion behavior.
- [ ] Re-run the plugin hostile gate on the actual deployment target and enforce reviewed RSS/PID quotas before untrusted production enablement.
- [ ] Execute the DB/Discord/HTTP/browser live gates against explicitly approved targets; synthetic self-tests do not satisfy production evidence.


## Phase 19 supply-chain admission hardening
- [x] Direct package specs must be exact semver and may not use file/link/git/http/npm-alias/workspace sources.
- [x] Reviewed lock policy requires npm lockfile v3, root package/dependency parity, HTTPS approved registry origins and integrity digests.
- [x] Initial lock bootstrap runs with lifecycle scripts disabled and inventories `hasInstallScript` packages for review.
- [x] Bootstrap is bounded/no-retry, rejects package.json mutation and deletes partial lock output after failure.
- [x] Dependency-backed CI requires the lock gate and installs with `npm ci`; audit/SBOM are part of that lane.
- [x] Release Truth blocks post-lock deployment drift when CI/Docker/Render are not all on `npm ci`.
- [ ] Review a real generated lock/transitive graph and execute dependency-backed vulnerability/SBOM verification.

## Phase 21 release provenance integrity
- [x] Git-labelled release evidence hashes committed Git blobs rather than dirty working-tree bytes.
- [x] Dirty inspection remains explicitly non-releasable and cannot admit untracked lockfiles as committed dependency evidence.
- [x] Committed migration, Canon/Spec/Registry/Status and panel-asset evidence use the same immutable Git tree identity.
- [x] Generated SBOM evidence is labelled separately from committed source evidence.
- [ ] QA-003 reviewed dependency graph/audit/SBOM and live deployment provenance remain pending BLK-001/002.

## Phase 22 GitHub workflow supply-chain integrity
- [x] External GitHub Actions are admitted by an explicit allowlist and pinned to reviewed 40-character commit SHAs.
- [x] Mutable tags/branches, dynamic action refs, unapproved actions and Docker actions fail closed.
- [x] Every checkout step sets `persist-credentials: false` so the workflow token is not retained in Git configuration.
- [x] Workflows require explicit permissions; `write-all` and `pull_request_target` are rejected by policy.
- [x] Shared Release Truth consumes the same workflow-policy evaluator used by the CLI gate.
- [ ] Re-review action upstream releases/commits before any future pin upgrade; do not auto-track mutable major tags.

## Phase 23 privacy / orchestration controls
- [x] Raw Gaming availability windows are excluded from audit and operational item payloads; only bounded counts/timezone metadata are recorded outside the member-owned scheduling flow.
- [x] Gaming session capacity/join/control paths are guild-scoped and use row locks for mutation races.
- [x] Automation simulation is read-only and returns action intent summaries rather than executing actions.
- [x] Setup impact evidence does not override stale-plan, permission or approval enforcement.
- [ ] Verify migration 052 RLS/grants and concurrent capacity joins on an approved disposable DB.

## Phase 25 toolchain supply-chain boundary
- [x] Node/npm runtime drift is machine-checked and part of Release Truth.
- [x] Docker and CI runtime versions no longer float across Node 22 minor/patch releases.
- [x] npm engine strictness rejects mismatched declared Node/npm during install.
- [x] Final source attestation carries blockers and cannot silently convert source evidence into production verification.
- [ ] Reviewed dependency lock, audit/SBOM and deployment/live security evidence remain required separately.

## Phase 26 setup/configuration hardening
- [x] Existing `/setup` sessions hydrate persisted desired state instead of defaults.
- [x] Unknown module override keys fail closed on Discord/HTTP/worker paths.
- [x] Invalid IANA timezone and enabled GitHub Releases without owner/repo fail semantic validation.
- [x] Setup approval binds full draft, managed panels and approved base config version/fingerprint.
- [x] Setup approval identity uses a 96-bit SHA-256 prefix; Change Control does not truncate it further.
- [x] Worker rejects stale approval after setup lock acquisition and before mutation.
- [x] Resource unlocks / provider disables / game disables / stale analytics or backup schedules are reconciled rather than left active.
- [x] Worker rechecks cancellation and lease before configuration reconciliation/commit.
- [x] Post-commit desired-state fingerprint mismatch fails closed with recovery evidence.
- [x] Environment and setup field-surface audits are machine-checkable.
- [ ] Dependency-backed semantic typecheck/test/build/audit/SBOM remains blocked by QA-003 / missing reviewed lockfile.
- [ ] Live DB/Discord/deployment setup reconciliation still requires approved target evidence.

## Phase 27 visual-experience security
- [x] Visual controls remain under `/setup`; no visual/theme top-level slash root added.
- [x] Visual evidence API uses existing guild-scoped operator/OAuth access checks and exposes no secret configuration.
- [x] Role visual capability changes never imply permission changes; hierarchy/ownership/eligibility guards remain separate.
- [x] Unsupported enhanced role colors/icons normalize to stable fallback instead of repeated mutation attempts.
- [x] Living-panel event IDs are durable de-dup identities; duplicate delivery cannot advance visual revision twice.
- [x] Living visual reason text is bounded before panel rendering; raw domain payloads are not copied into visual state.
- [x] Server Pulse motion never substitutes for incident/recovery/health truth and does not create automatic punitive action.
- [ ] Execute migration 054/RLS and visual API against an approved disposable/live target before VERIFIED.

## Phase 28 presentation and visual security
- [x] Discord user-facing action errors pass through a Thai safe-error boundary rather than returning arbitrary backend exception messages.
- [x] HTTP/Dashboard failures log raw exception detail server-side and return a bounded Thai fallback plus only a safe code/reference when available.
- [x] Thai presentation maps do not rename DB/API/event enums; operational identifiers remain stable and are displayed only with Thai context where required.
- [x] Realtime visual event mappings are constrained to real source publishers; visual feedback does not create authority, permission, security outcome or fake job completion.
- [x] Phase 28 does not add a new slash-command root or bypass existing guild/auth/permission checks.
- [x] Absolute no-gambling/free-entry-only policies remain unchanged by reward visuals or event effects.
- [ ] Exercise error sanitization, WebSocket authorization and visual-event tenant isolation against an approved deployed target before VERIFIED.

## Phase 29 evidence/replay security
- [x] Operations Intelligence and Event Replay are authenticated guild-scoped reads using the existing operator/OAuth access boundary.
- [x] Replay limit is clamped and payload traversal is bounded to prevent an unbounded diagnostic response surface.
- [x] Replay recursively redacts keys associated with tokens, secrets, passwords, authorization, cookies, API/private keys and signatures before UI delivery.
- [x] Replay is structurally side-effect free: no EventBus republish, Discord action or database mutation dependency exists in the replay module/path.
- [x] Phase 29 HTTP failures reuse safe Thai error presentation instead of echoing raw backend exceptions.
- [x] Digital Twin cannot bypass approval or execute Discord changes; it is derived evidence from the existing canonical setup plan.
- [ ] Verify OAuth/operator tenant isolation with representative live replay/operations data and fault injection on an approved deployment.
- [ ] Treat replay redaction as secret-protection defense in depth, not a substitute for event-payload minimization or a full DLP product.

- [x] Recovery Evidence V2 is authenticated/guild-scoped/read-only and fails closed: RESTORE_VERIFIED status alone, mismatched proof hash or non-SUCCEEDED restore run cannot produce a verified-restore claim.
