# Phase 8-9 - Provider Integration and Scale Hardening

Status: source integrated / dependency-free contracts executed / live verification pending.

## Scope delivered
- Registered public/no-secret providers: Riot Data Dragon, GitHub Releases, Discord Status.
- Shared provider sync pipeline: sanitized config, allowlisted bounded HTTPS, capability truth, circuit handling, durable snapshot hash/version/item count, health/audit and scheduled resync.
- `/setup` remains the owner of provider configuration; Dashboard uses the same durable draft/config schema.
- Realtime WebSocket backpressure/dedup, bounded cache/in-flight loaders, shard modes and PostgreSQL pool/timeouts.
- Separate liveness/readiness/diagnostic probes; Render uses `/ready`.
- Bounded graceful shutdown and non-root Docker runtime.
- Manual-only disposable DB/Discord live-verification workflow.
- Exact direct dependency pins; lockfile remains a hard release gate.
- Observation-bound canary outcome metrics and review-only cohort recommendations.
- Plugin isolation probe records actual host capability and keeps untrusted plugins denied where full isolation is absent.

## Data changes
- 039 `integration_sync_snapshots`: provider content evidence, hash/version/count, tenant scope, RLS.
- 040 `feature_rollout_outcomes`: observation-bound metric outcomes, duplicate guard, finite-value bounds, comparison indexes, RLS.

## Executed evidence in this environment
- Canon structural audit: PASS - 1 slash root / 8 built-in blueprints / 40 migrations / 56 media refs.
- Domain smoke: PASS 56 assertions.
- Fault-model smoke: PASS 35 assertions.
- Stress-model smoke: PASS 13 deterministic assertions; not throughput evidence.
- A11y/i18n smoke: PASS 11 static assertions; not browser E2E evidence.
- Whole-tree TypeScript syntax and Dashboard TSX parse: PASS.
- Render/CI/live workflow YAML, package JSON, migration continuity and whitespace checks: PASS.
- Release readiness: BLOCKED only by missing reviewed `package-lock.json`.
- Plugin isolation probe: network namespace evidence works; full third-party isolation remains BLOCKED.

## Verification still required
- `npm ci`, full TypeScript/Vitest/build/audit/SBOM after lockfile generation.
- Disposable PostgreSQL/Supabase migration/RLS/concurrency/provider/canary outcome tests.
- Discord test-guild E2E and restart/rate-limit/hierarchy/recovery drills.
- Browser accessibility/mobile/i18n E2E and real load/race/chaos/soak.
- Live Render/GitHub/Supabase smoke and free-tier behavior measurements.

No item in this document is promoted to VERIFIED solely from source/static evidence.
