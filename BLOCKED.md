# BLOCKED / CONFLICTS

## BLK-001 - npm registry DNS unavailable in current execution environment
Status: BLOCKED (environment)
Observed: 2026-08-14
Repro: `npm ping --fetch-timeout=5000 --fetch-retries=0` -> `EAI_AGAIN getaddrinfo registry.npmjs.org`.
Impact: direct dependency ranges are exact-pinned, but dependencies cannot be installed here; no reviewed `package-lock.json`, `npm ci`, project-pinned semantic typecheck/Vitest/build/audit/SBOM can run. Phase 20 can parse current source with an available global TypeScript compiler API, Phase 21 can verify committed-tree provenance semantics with isolated Git repositories, Phase 22 can verify immutable workflow-action policy, Phase 25 can verify exact runtime/toolchain source policy plus bounded source attestation, and Phase 26 can verify setup/configuration surfaces and reconciliation contracts, but none of these source-only gates satisfies QA-003.
Current release gate: `npm run release:readiness` is BLOCKED only by `lockfile.missing`; workflow supply-chain and exact toolchain policies are independently PASS and are part of Release Truth.
Mitigation authored in Phase 19: `packages/dependency-policy`, `npm run dependency:bootstrap-lock`, `npm run release:dependency-lock-gate` and `.github/workflows/dependency-bootstrap.yml` now make the lock-generation/review path explicit and fail closed. Bootstrap is package-lock-only + ignore-scripts, bounded/no-retry, rejects package.json drift, removes partial lock output, and emits review evidence. CI dependency-backed verification now requires the reviewed lock and uses `npm ci` + typecheck/Vitest/build/audit/SBOM. Docker/Render intentionally remain on `npm install` until the reviewed lock actually exists; after it exists, Release Truth blocks until those surfaces are promoted to `npm ci`.
Resolution: in a network-capable environment run the review-only lock bootstrap, inspect the transitive graph/registry origins/install-script inventory, commit the approved `package-lock.json`, promote Docker/Render to `npm ci`, then run dependency/security gates.
This blocks VERIFIED/release maturity but does not invalidate authored source.

## BLK-002 - Real service integration evidence unavailable in this workspace
Status: BLOCKED (credentials/target approval)
No approved product Discord test guild or disposable product PostgreSQL/Supabase database has been selected. Connected Supabase project `koksaiapp` is not assumed to belong to this product and remains untouched.
Impact: migrations 001-054, RLS/grants/advisors, migration-052/053 Gaming session/availability admission/waitlist/check-in/state/RLS/reminder behavior, migration-049 audit-integrity triggers/concurrent writers/retention/cascade behavior, migration-050 backup lifecycle/canonical round-trip/append-only verification evidence, migration-051 plugin-isolation evidence constraints/indexes, OAuth callback, Discord rate limits/hierarchy, provider sync under real network conditions, approved external-AI sandbox E2E, incident/capacity/recovery-drill live evidence, restore drill and deployed Render smoke remain unverified.
Mitigation authored: `.github/workflows/live-verification.yml`, `scripts/live-db-gate.ts`, `scripts/live-discord-gate.ts`, `scripts/live-http-gate.mjs` and `scripts/live-browser-gate.mjs` are manual/opt-in. DB and Discord require explicit disposable/test-guild labels; HTTP/browser target gates require explicit live-gate opt-in and HTTPS/localhost targets. Phase 14 data-governance live evidence (migration 048, concurrent legal-hold/retention races, rollback injection and multi-operator privacy flow) and Phase 15 audit-integrity live evidence (migration 049, triggers/RLS/cascade, concurrent chain writers, retention hash-only continuity and bypass/tamper probes) and Phase 16 backup/restore live evidence (migration 050, canonical round-trip, legacy downgrade, append-only verification evidence and real restore drill) remain included in this blocker until such targets are explicitly selected.

## BLK-003 - Free hosting is not an always-on production SLA
Status: CONSTRAINT
The canonical Render/Supabase zero-mandatory-cost profile has sleep/quota/retention limits. Canon forbids keepalive abuse and false 24/7 claims. Production maturity requires explicit acceptance/measurement of those limits or an approved infrastructure change.

## BLK-004 - Untrusted third-party plugin deployment proof
Status: BLOCKED (deployment-target verification), SOURCE BOUNDARY TESTING
The project now has an explicit `LINUX_NS_SECCOMP_V1` backend and the current execution host passes the hostile probe for user/mount/network/PID namespaces, read-only/noexec plugin filesystem, hidden host filesystem/proc, capability drop, kernel socket denial, process/worker denial and secret stripping. Third-party enablement still defaults OFF.
Impact: this host-specific result does not prove that Render or another target kernel/runtime supports the same namespace/mount/seccomp behavior, and V8 heap budgeting is not a hard RSS/cgroup memory guarantee.
Resolution: on the actual approved deployment target, run `npm run security:plugin-isolation-gate` and require startup probe success; add/review deployment-level RSS/PID quotas for untrusted plugins. If any required layer is unavailable, keep third-party execution disabled/fail-closed.

## API constraints, not Canon conflicts
- Discord messages/components are not arbitrary web-canvas animation surfaces; motion uses supported message state/media and rate-limit-aware updates.
- Per-second clocks/countdowns belong in client/dashboard rendering where possible.
- External game/content capabilities depend on provider APIs, terms, credentials and rate limits; unavailable capability remains unavailable.

No unresolved Canon-vs-user requirement conflict is currently recorded.

## Phase 28 evidence boundary
Phase 28 adds no new Canon conflict. Its remaining verification is covered by existing blockers:
- **BLK-001** blocks dependency-backed semantic typecheck/Vitest/build/audit/SBOM and canonical dependency renderer execution because no reviewed `package-lock.json` exists.
- **BLK-002** blocks live migration 054, Discord Components V2/rate-limit behavior, deployed WebSocket/browser/mobile/FPS and real provider/storage evidence because no approved product target/credentials are selected.
Source/offline PASS evidence MUST NOT be relabelled as live or VERIFIED while either boundary applies.

## Phase 29 evidence boundary
Phase 29 source implementation introduces no new external blocker and does not resolve existing external evidence requirements:
- **BLK-001** still blocks project-pinned dependency installation/typecheck/Vitest/build/audit/SBOM because no reviewed `package-lock.json` exists.
- **BLK-002** still blocks live validation of the Phase 29 Operations Intelligence SQL/evidence queries, authenticated replay data, Digital Twin preview against a real Discord scan, WebSocket burst/reconnect behavior and representative browser/mobile/GPU measurements because no approved product DB/guild/deployed target is selected.
- Deterministic Phase 29 chaos/replay tests are source-model stress evidence only and MUST NOT be relabelled as real network/database/Discord load or chaos testing.
