# KNOWN ISSUES / LIMITATIONS

1. **Dependency verification blocker.** npm registry DNS in the current execution environment returns `EAI_AGAIN`, so dependencies cannot be installed and a reviewed `package-lock.json` cannot be generated here. Direct dependency ranges are exact-pinned, but the transitive graph is unverified.
2. **No full dependency-backed build gate yet.** Normal project `tsc`, Vitest, Vite/tsup production builds and dependency/SBOM audits have not run; source is not VERIFIED.
3. **Database migrations are authored, not executed here.** Migrations 001-054 require disposable PostgreSQL/Supabase execution, RLS/grant verification, concurrency tests and failure-recovery evidence.
4. **Discord E2E remains unexecuted.** Setup, hierarchy/rate-limit behavior, concurrent admins, Forums/Threads, temporary roles/voice, provider sync interactions, panel rollback, permission repair and restore need a real test guild.
5. **Restore/repair require a real drill.** Code paths exist, but Canon does not permit a disaster-recovery claim until backup -> preview -> independent approval -> apply -> verify has run successfully against real state.
6. **Third-party plugins remain disabled by default.** The current host now passes the full `LINUX_NS_SECCOMP_V1` hostile filesystem/process/syscall/network probe, but that evidence is host-specific and V8 heap budgeting is not a hard RSS/cgroup limit. Any deployment target must independently pass the gate and add/review deployment RSS/PID controls before enabling untrusted execution.
7. **Public provider adapters are not provider-SLA evidence.** Riot Data Dragon, GitHub Releases, Discord Status and Steam News adapters exist and are bounded/registered, but live rate-limit/outage/redirect/schema-change behavior still needs execution evidence.
8. **Custom Blueprint visual editing is implemented but not E2E verified.** Category/Text/Forum/Voice/Role composition and hierarchy preview exist; dependency-backed browser/Discord integration and migration compatibility testing remain pending.
9. **Free hosting is not a production SLA.** The canonical zero-cost Render/Supabase profile has sleep/quota/retention limits and cannot truthfully promise always-on availability.
10. **Lockfile/release graph still pending.** Exact direct pins do not replace a reviewed lockfile. CI/Render/Docker remain on `npm install` until `package-lock.json` exists; then they must switch to `npm ci`.
11. **Load/chaos/accessibility evidence is incomplete.** Phase 18 adds executable HTTP load/soak/abort and Chromium desktop/mobile/AX/runtime harnesses with passing synthetic self-tests, but large-guild Discord REST rate limits, WebSocket slow-client/soak, queue/scheduler throughput, cache stampede, shard/multi-instance behavior, DB pool saturation and deployed product browser/load evidence still require approved live targets.
12. **Free-entry reward draws are auditable, not a cryptographic fairness protocol.** Stored seed/snapshot hashes permit audit of the selected result, but the design does not claim external randomness beacons or precommitted unmanipulable randomness.
13. **Canary outcome guidance is advisory.** Cohort comparison exists, but telemetry ingestion/live sample quality and DB concurrency are not verified; the platform intentionally has no metric-driven automatic promote/rollback path.
14. **Manual live gates are authored, not product-executed.** DB/Discord gates require explicitly selected disposable/test targets and credentials; HTTP/browser gates require explicit deployed target opt-in. Synthetic HTTP/CDP self-tests validate the harnesses only. No unrelated connected project is mutated by assumption.


## Server Fabric / UI V2 verification gaps
- **Components V2 live migration is not yet test-guild verified.** Source/static/smoke checks cover managed panel V2 rendering, legacy-to-V2 edit payload shape, `/setup` interaction messages and asset targeting, but real Discord create/edit/repair/rollback must still be executed against an approved test guild.
- **Components V2 source coverage is broader than live evidence.** Current platform-owned Discord interaction/status/background-delivery source has no legacy `EmbedBuilder` or direct legacy reply pattern in the guarded runtime scope, but this remains static/source evidence until exercised on an approved Discord test guild.
- **Large Omni topology has not been REST/rate-limit exercised live.** Omni currently authors 407 logical resources; actual Discord rate-limit, hierarchy and partial-failure behavior remains an integration gate.

## Phase 15 audit-integrity limitations
- The Phase 15 chain is database-local tamper-evidence. A sufficiently privileged database actor that can coherently rewrite integrity entries and chain head is not prevented by an external trust anchor because none exists yet.
- Pre-migration-049 audit rows are intentionally `LEGACY_UNCHAINED`; no historical cryptographic evidence is fabricated.
- After governed retention deletes detailed audit content, the chain can prove stored hash/sequence continuity but cannot recompute or reconstruct the deleted payload; the verifier reports this as hash-only coverage.
- Migration 049 trigger/RLS/cascade behavior and same-guild concurrent writer contention have not been executed on an approved PostgreSQL target.

## Phase 16 backup/restore evidence limitations
- Migration 050 is authored but not executed on a selected PostgreSQL/Supabase target.
- `INTEGRITY_CHECKED` proves durable canonical digest round-trip only; it is intentionally not called restore verification.
- Historical checksum-only rows are `LEGACY_UNPROVEN` and are not silently made restore-eligible.
- `RESTORE_VERIFIED` source semantics exist, but a real Discord restore drill with failure/restart evidence has not been executed here.


## Phase 18 plugin sandbox / live-QA limitations
- `LINUX_NS_SECCOMP_V1` is currently Linux x86_64-specific. Missing namespace/mount/seccomp tooling or a failed hostile probe keeps third-party execution disabled.
- Current-host sandbox PASS is not portable evidence for another deployment host. Startup re-probes the actual target when third-party plugins are enabled.
- V8 `--max-old-space-size` bounds managed heap but is not a hard resident-memory limit; deployment cgroup/container RSS and PID quotas remain recommended before untrusted production execution.
- Migration 051 is authored but not executed on a selected PostgreSQL/Supabase target.
- HTTP/browser self-tests are synthetic harness proof, not product E2E, accessibility certification, production load capacity or SLA evidence.
- Chromium on this execution host has an administrator navigation policy that blocks localhost/data navigation; the synthetic browser self-test therefore uses CDP document injection. Real live-gate navigation still fails closed on target navigation errors.

- Phase 23 migration 052 plus Phase 24 migration 053 and Gaming session/availability/waitlist/check-in flows are source-integrated only; concurrency/RLS/Discord reminder behavior has not been exercised on an approved live target.

- Phase 25 exact toolchain and final source attestation are source/workspace evidence. Docker image pull, Render runtime selection and dependency-backed build remain unverified until BLK-001/deployment gates are resolved.


## Phase 27 visual live evidence
- Migration 054 is authored but not executed on an approved database target.
- 230 theme assets and 103 panel media assets are byte/hash checked in source; the canonical Sharp build generator remains dependency-blocked in this workspace and the Pillow output is an offline fallback artifact path.
- Living panel source/harness evidence does not prove deployed Discord edit buckets, CDN animation behavior, enhanced role colors/icons or real browser GPU/CPU cost.
- Server Pulse state is event-backed; the UI must not be interpreted as an availability/SLA guarantee.

## Phase 28 visual/runtime limitations
- Dashboard Canvas/CSS-3D/FPS governor behavior is source/static tested but has not been profiled on representative deployed desktop/mobile GPUs; no production FPS/battery claim is made.
- WebSocket event-to-FX contracts are source-integrated, but reconnect/burst/network conditions still require deployed HTTP/browser evidence.
- Native Discord cannot render arbitrary Canvas/WebGL/3D; Discord receives supported Components V2/media/state updates only. The richer 3D runtime exists on Dashboard/web surfaces.
- Phase 28 asset manifests prove repository bytes/hash/dimensions/frame metadata, not CDN decode latency or remote-storage behavior.
- Thai presentation is source-audited, but live Discord truncation, font/platform rendering and end-user language QA remain approved-target/manual evidence.
- Dependency-backed semantic build/test/security evidence remains blocked by the missing reviewed `package-lock.json`; Phase 28 did not fabricate or bootstrap one offline.

## Phase 29 production-intelligence limitations
- Digital Twin is source-tested against deterministic setup actions but has not yet been compared with a live Discord scan/apply/rollback cycle on an approved guild.
- Operations Intelligence SQL is schema-traced and regression-guarded, but query plans, table cardinality cost and real PostgreSQL latency are not measured until BLK-002 is resolved.
- Event Replay intentionally reads only durable outbox + bounded in-process realtime history; it is not a complete historical event warehouse and process-local recent events disappear on restart unless already durable.
- Replay redaction targets secret-bearing keys and bounds payload shape; it does not claim to be a general-purpose DLP system.
- Visual Orchestrator source stress proves scheduling/budget bounds, not deployed frame-time, GPU/battery impact, WebSocket jitter or Discord delivery behavior.
- Phase 29 adds no migration; migration frontier remains 054 and live migration verification remains pending.

- Phase 29 Recovery Evidence V2 has source/fault-model proof only; its fail-closed cross-proof logic is not yet verified against an approved live restore drill or deployed database target.
