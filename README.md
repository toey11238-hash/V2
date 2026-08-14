# Discord Auto Server Platform

Canon-driven Discord automation/control platform. `CANON.md` is the highest project-level source of truth.

## Current maturity
**LEVEL 0 - broad implementation/integration present, release verification incomplete.** Current source through Phase 29 includes the universal setup/control plane, durable recovery primitives, broad community/Gaming/creator/education/business workflows, scale/event-ordering/cache controls, governance, compatibility/growth tooling, Omni Command Nexus visual experience, event-backed living panels, adaptive realtime Canvas/CSS-3D/emoji motion, Thai source-of-truth presentation, setup-derived Digital Twin, evidence-backed Operations Intelligence, read-only Event Replay and priority-aware visual orchestration. It is not production-ready or VERIFIED because dependency-backed build/tests and real database/Discord deployment evidence are incomplete.
- Recovery Evidence V2 cross-checks the existing backup → integrity → approval → restore → verification → drill chain read-only; status alone cannot claim a verified restore.

## Canon protocol
Before material work read: `CANON.md`, `MASTER_SPEC.md`, `PROJECT_MEMORY.md`, `FEATURE_REGISTRY.md`, `DECISIONS.md`, `PROJECT_STATUS.md`, `TODO.md`, `BLOCKED.md`, `CHANGELOG.md`.

Authority: `CANON -> SPEC -> REGISTRY -> CODE -> TEST -> INTEGRATION`.

## Command surface
Canon allows at most two top-level slash commands. The repository currently registers only `/setup`; the second slot is reserved. `/setup` configures all modules, including Gaming, security/governance, backup, budgets, admission, integrations, AI preference, managed locks and custom blueprint choices. Existing guilds reopen from persisted desired state; apply reconciles enable/disable state rather than behaving add-only.

## Current implementation highlights
- deterministic scan/plan/dry-run plus durable setup apply, locks, leases and mutation journal;
- eight built-in blueprints plus guild custom blueprints;
- 87 managed Components V2 panels, 103 generated panel media assets and 230 theme/Server Pulse PNG/GIF assets;
- Server Fabric authors Hybrid 208 / Omni 415 logical resources across Community, Discovery, Visual Experience, Member Care, Project/Event/Content/Knowledge/Member/Reliability Ops, Trust & Safety, Automation/Data/Release, Creator/Education/Business and first-class Gaming;
- managed Discord panels plus platform-owned interaction, operational/status and scheduled/background delivery messages use Discord Components V2 containers/text/media/action rows; native modals remain native and live-guild evidence is still required;
- capability-aware role visual profiles participate in desired-state scan/plan/apply/repair, including enhanced colors/icons when guild features support them and deterministic single-color/no-icon fallback otherwise;
- OAuth guild-scoped dashboard with Setup/Theme Studio/Server Pulse/Live Server Map/Structure/Digital Twin/Operations Intelligence/Event Replay/Operations/Recovery/Diagnostics/Change/Governance consoles;
- permission drift/approval repair, detailed backup/restore and non-destructive migration/rebuild;
- onboarding/roles/temp roles/notifications/Forums/Threads/tickets/workflows/events/free-entry rewards/temp voice;
- first-class non-wagering Gaming profile/LFG/team/clan/recruitment/scrim/tournament/progression systems;
- Creator/Education/Business persistent workflows;
- retention/privacy, canary feature flags, permissioned AI hooks, plugin trust policy, analytics/advisor;
- durable inbound event ordering/dedup, non-authoritative shared cache, maintenance runtime and growth/capacity assessment;
- runtime compatibility/upgrade planning plus generated human-readable blueprint reports;
- migrations 001-054 (authored here; live execution remains pending);
- public/no-secret Riot Data Dragon, GitHub Releases, Discord Status and Steam News adapters with durable hashed snapshots;
- bounded realtime/cache, current-loop readiness, shard modes and PostgreSQL pool/timeouts;
- manual disposable DB/Discord live gates and review-only canary outcome metrics.

## Local development
```bash
cp .env.example .env
npm install
npm run migrate
npm run generate:assets
npm run dev
```
Dashboard:
```bash
npm run dev:dashboard
```

Set Discord credentials only through environment configuration. Use a test guild for development command registration.

### Current dependency blocker
This execution environment cannot resolve `registry.npmjs.org` (`EAI_AGAIN`), so the repository deliberately does not fabricate a lockfile. Phase 19 provides a review-only `npm run dependency:bootstrap-lock` path plus a dependency admission gate. The first network-capable verification must generate/review/commit the real `package-lock.json`, promote Docker/Render to `npm ci`, then execute the dependency-backed typecheck/Vitest/build/audit/SBOM lane.

Source/offline evidence commands available now (a TypeScript parser must be available for the syntax gate):
```bash
npm run test:source-syntax
npm run test:offline-preflight
npm run canon:audit
npm run test:domain-smoke
```
These do not replace full typecheck/Vitest/build/integration gates.

## Free deployment profile
`render.yaml` provides the canonical zero-mandatory-cost Render web/static profile; Supabase Free PostgreSQL/Storage is the recommended durable free profile where available. Free tiers have sleep/quota/retention limits. This project does not include keepalive circumvention and does not claim a free 24/7 production SLA.

See `docs/DEPLOY_RENDER_FREE.md`, `docs/SUPABASE_SECURITY.md`, `docs/PLUGIN_SECURITY.md`, `docs/PHASE3_HARDENING.md` and `docs/PHASE4_SCALE_COMPATIBILITY.md`.


## Phase 6 security/resilience
Source now includes guild-scoped mutation throttling, API security headers, shared Creator/Mentor/Business scheduling orchestration, vertical schedule self-healing and single-probe integration circuit breakers. These are not production-verified until dependency, database and Discord integration gates pass.

### Phase 7 operator evidence
The dashboard includes a redacted Audit Explorer and Release Truth surface. A built-in `generic-inbound` HMAC adapter provides zero-cost signed inbound events when the `integrations` module is enabled and an environment secret reference is configured.

### Phase 8-9 provider / scale hardening
Registered public providers now include Riot Data Dragon, GitHub Releases and Discord Status. They are configured under `/setup`, store bounded hash/version snapshots and use durable scheduled sync. Realtime/cache/database/sharding/readiness are bounded/configurable, Docker runs non-root, and manual live-verification gates are authored. Direct dependencies are exact-pinned, but a reviewed `package-lock.json` and dependency-backed build/test/audit remain mandatory before release. See `docs/PHASE8_9_PROVIDER_SCALE_HARDENING.md`.

Runtime probes: `/live` = process liveness, `/ready` = dependency readiness (503 when critical dependencies are unavailable), `/health` = diagnostic component report. Render uses `/ready`.

## Runtime composition
`apps/platform/src/index.ts` is the executable composition root used by dev/build/start. HTTP route implementation lives in `apps/platform/src/http/server.ts`. The bootstrap owns configuration/migrations, Discord Gateway lifecycle, interaction/event bindings, durable job/scheduler/inbox/outbox/automation loops, readiness/health heartbeats and bounded shutdown according to `PROCESS_ROLE`.

### Phase 11 overload control
Admission Control is Guild-scoped and evidence-backed. `/setup` configures BALANCED/CONSERVATIVE/MAX_AVAILABILITY; optional structural/provider/background/bulk work may defer, while safety/support/diagnostics remain protected. This is source-integrated but not live-verified.

## Phase 18 verification commands

Dependency-free/current-host evidence:

```bash
npm run security:plugin-isolation-gate
npm run test:phase18-plugin-sandbox
npm run test:phase18-live-qa
npm run test:live-http-self
npm run test:live-browser-self
```

Live target gates are opt-in and fail closed. Use `ALLOW_TEST_DATABASE=1` + `TEST_DATABASE_LABEL=DISPOSABLE` for the DB gate, `ALLOW_DISCORD_TEST_GUILD=1` for an approved Discord test guild, `ALLOW_HTTP_LIVE_GATE=1` with `TEST_API_BASE_URL`, and `ALLOW_BROWSER_LIVE_GATE=1` with `TEST_DASHBOARD_URL`. Synthetic self-tests do not count as product live verification.


## Phase 19 dependency admission commands

Dependency-free policy evidence:

```bash
npm run test:dependency-policy
npm run test:phase19-dependency-admission
npm run dependency:lock-policy
```

First network-capable lock generation is review-only:

```bash
npm run dependency:bootstrap-lock
```

The bootstrap does not run dependency lifecycle scripts. Review the generated lock/evidence before commit. After review, `npm run release:dependency-lock-gate` plus the full `npm ci` typecheck/Vitest/build/audit/SBOM lane are mandatory.


## Phase 20 source syntax integrity
`npm run test:source-syntax` uses the TypeScript compiler parser across all repository TypeScript-family sources and includes an intentionally malformed sentinel. This gate was added after a real raw-newline string defect was caught by TypeScript but missed by Node experimental strip-types checking. Current-host fallback parsing is source syntax evidence only; the reviewed dependency-backed TypeScript 7.0.2 semantic lane remains part of QA-003.


## Phase 24 — session reliability and operational SLOs
Gaming scheduled sessions now support bounded FIFO waitlists, atomic promotion, real check-in/attendance state and privacy-preserving common-time recommendations within a timezone cohort. Automation dry-run surfaces bounded safety lint alongside simulation evidence, and operator analytics exposes sample-aware 24-hour error-budget health for jobs, notifications and automation receipts. Migration 053 is authored but remains unverified until the approved disposable-DB gate runs.

## Final source closure

Use `npm run test:toolchain-policy` to verify the exact reviewed Node/npm/TypeScript source toolchain. Use `npm run final:attest` for the consolidated source attestation. A successful source attestation does **not** override Release Truth; the current checkpoint remains release-blocked until the reviewed dependency lock and required live evidence exist.

## Phase 26 final stabilization
`/setup`/Dashboard/portable configuration now share one persisted desired-state projection. Setup approvals bind the full draft, managed-panel evidence and the approved base config version/fingerprint; configuration-only risk is evaluated separately from Discord structural impact. Locks, Gaming enablement, provider schedules, analytics and backup are reconciled in both directions, and successful setup requires post-commit fingerprint convergence. Use `npm run test:setup-surface`, `npm run test:config-surface` and `npm run test:phase26-final-stabilization` for source contract evidence.

## Phase 28 extreme visual/system overhaul
The current source now includes the Phase 28 premium realtime visual runtime and Thai presentation overhaul. Dashboard/web can render event-backed Canvas particles/ripples/orbits, CSS 3D crystal/hologram depth, parallax and animated emoji feedback with reduced-motion/visibility/FPS/device safeguards. Native Discord continues to use supported Components V2/media/state updates only.

Useful dependency-free checks:

```bash
npm run test:phase28-extreme-overhaul
npm run test:thai-presentation
node scripts/source-syntax-gate.mjs --require-typescript
npm run test:offline-preflight
npm run final:attest
```

Current offline/source evidence is green, but release readiness remains blocked by the absent reviewed `package-lock.json`; live DB/Discord/WebSocket/browser/mobile/GPU evidence is not implied by these checks.
