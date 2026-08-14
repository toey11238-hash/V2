# MODULE REGISTRY

Status describes source/runtime wiring only. No module is VERIFIED until dependency-backed tests, real database/Discord integration and applicable release gates pass.

## Foundation and control plane
- `packages/core`, `packages/config`, `packages/database` - IDs/config/PostgreSQL repositories, migrations 001-054, transactions, audit, mappings, setup sessions, events/recovery/governance/living-panel state. IMPLEMENTED/TESTING.
- `apps/platform` - Discord Gateway, universal `/setup`, interactions, HTTP/OAuth, jobs/scheduler/inbox/outbox/watchdog. INTEGRATED.
- `packages/setup`, `packages/blueprints`, `packages/control-center` - scan/plan/apply, eight built-in blueprints, guild custom blueprints, Server Fabric V3 non-Gaming topology and setup-managed leaf controls. INTEGRATED/TESTING.
- `packages/change-control`, `packages/feature-flags`, `packages/ai-hooks` - safe migration/rebuild, revisioned canary rollout/evidence/manual rollback and permissioned provider hooks. INTEGRATED/TESTING.

## Phase 4 scale / compatibility / documentation
- `packages/cache` - bounded L1 TTL + PostgreSQL L2 cache, prefix invalidation/single-flight; never authoritative. TESTING.
- `packages/compatibility` - Node/discord.js/PostgreSQL/schema/panel compatibility evaluation and upgrade planning. TESTING.
- `packages/growth` - deterministic SMALL/STANDARD/LARGE/ENTERPRISE assessment and channel/role recommendation scores. TESTING.
- `packages/documentation` - repository/operator reference primitives plus human-readable server-blueprint report/tree/hash. TESTING.
- `apps/platform/src/runtime/event-ingress.ts`, `inbox-worker.ts` - durable inbound event persistence, retry, monotonic stream ordering/dedup before raw bus dispatch. TESTING.

## State, safety and recovery
- `packages/jobs`, `packages/realtime`, `packages/scheduler` - durable jobs/events/scheduled leases/recovery. INTEGRATED.
- `packages/permissions`, `packages/repair`, `packages/recovery`, `packages/backups` - explain/drift/approval repair, mutation journal, detailed snapshots and restore worker. INTEGRATED; real drill pending.
- `packages/moderation`, `packages/security`, `packages/governance`, `packages/operations` - guarded moderation, anti-abuse observations, approvals, retention/privacy and controlled maintenance. INTEGRATED/TESTING.
- `packages/plugins` - manifest/dependency/trust validation plus target-probed `LINUX_NS_SECCOMP_V1` execution policy. Third-party execution TESTING, defaults OFF, and remains denied unless the actual target hostile probe passes plus deployment RSS/PID containment is reviewed.

## Discord/community domains
- `packages/panels`, `packages/assets`, `packages/visual-system`, `packages/visual-experience` - 87 managed Components V2 panels, 103 panel media references, 230 theme media assets, 10 token-driven themes, 5 scenes and durable Server Pulse projection/reconciliation. INTEGRATED/TESTING; live Discord/browser evidence pending.
- onboarding/roles/localization/notifications/forums - onboarding, verify, self/temp roles, quiet hours/fanout, Forum/Thread state. INTEGRATED.
- tickets/workflows/events/giveaways/voice - support/staff/event/free-entry reward/temporary voice flows. INTEGRATED.

## Gaming and verticals
- `packages/gaming` - profile, registry, LFG/party, teams/clans, recruitment, scrims/tournaments/matches, XP/quests/achievements/seasons and capability adapters. INTEGRATED; provider-specific APIs pending.
- `packages/creator`, `packages/education`, `packages/business` - persistent creator publishing/collaboration, learning/mentor and safe business catalog/support. INTEGRATED.
- `packages/integrations`, `packages/analytics`, `packages/recommendations`, `packages/diagnostics` - registered-adapter-only state control, redacted integration health/history, privacy-conscious aggregates, non-destructive advisor and health diagnostics. INTEGRATED foundations.

## Dashboard
`apps/dashboard` contains Omni Command Nexus UI V2 plus Setup, Theme Studio, Server Pulse, Live Server Map, live Server Fabric topology, Structure, Operations, Recovery, Diagnostics, Change Control and Governance. Visual state reconciles durable guild-scoped evidence while WebSocket events provide immediate feedback; reduced-motion remains supported. Mutations remain guild/session/CSRF/live-permission scoped.

## Phase 5 operator governance / compatibility
- `packages/governance/src/portable-config.ts` - portable config v2 checksum/version migration contract. TESTING.
- `packages/feature-flags` - revision history, privacy-aware observations and manual rollback. TESTING.
- `packages/integrations` - existing-record control plus runtime-adapter truthfulness and redacted health evidence. INTEGRATED foundation.
- `scripts/fault-model-smoke.mjs` / `scripts/release-readiness.mjs` - dependency-free failure contracts and promotion truth gate. TESTING.


## Phase 6 security / vertical resiliency
- `packages/http-security` - privacy-hashed fixed-window mutation limits, durable PostgreSQL backend, bounded process fallback and API security headers. TESTING.
- `packages/vertical-ops` - shared Creator/Mentor/Business orchestration, schedule compensation and durable scheduler coordination reused by HTTP/Discord paths. INTEGRATED/TESTING.
- `apps/platform/src/http/vertical-routes.ts` - OAuth/guild/CSRF/live-permission guarded vertical operator routes. INTEGRATED source.
- `packages/integrations` circuit breaker - OPEN/HALF_OPEN single-probe/CLOSED recovery behavior around safe external HTTP. TESTING; provider adapters still unavailable unless explicitly registered.
- `apps/platform/src/runtime/scheduled-worker.ts` - bounded vertical schedule reconciliation plus Creator publish, Mentor reminders and Business SLA execution. INTEGRATED source.

## Phase 7 audit / signed ingress / release evidence
- `packages/audit-log` - bounded guild audit query/cursor/redaction plus Phase 15 per-scope integrity verification and pure canonical hash primitives. TESTING; DB-local tamper evidence only.
- `packages/release-truth` - shared static release evaluator used by CLI and Dashboard. TESTING; current result BLOCKED by design.
- `packages/integrations` - built-in `generic-inbound`, env-reference secret policy, durable webhook receipt repository and registered-adapter-only signed ingress. INTEGRATED/TESTING.
- `apps/platform/src/http/webhook-routes.ts` - raw-body capture, signature/timestamp/replay validation, durable inbox handoff and guarded env-reference config. INTEGRATED source.
- `apps/dashboard/src/components/AuditExplorer.tsx` / `ReleaseTruthConsole.tsx` - redacted audit evidence and release blocker surfaces. TESTING.

## Phase 8-9 provider / scale hardening
- `packages/integrations/src/providers/*` + `sync.ts` - Riot Data Dragon, GitHub Releases and Discord Status public adapters, bounded allowlisted fetch and durable content snapshots. TESTING.
- `packages/realtime` + runtime `readiness.ts` - WebSocket backpressure/dedup and current-loop readiness truth. TESTING.
- `packages/cache`, `packages/database`, `packages/config` - bounded cache/in-flight loaders, DB pool/timeouts and Discord shard-mode configuration. TESTING.
- `packages/feature-flags` - observation-bound canary outcomes and review-only cohort recommendation. TESTING.
- `scripts/live-db-gate.ts`, `live-discord-gate.ts`, `release-manifest.mjs`, plugin isolation probe + manual live workflow - authored evidence tooling; real targets/lockfile remain pending. TESTING/BLOCKED by environment.

## Server Fabric V3 modules
- `packages/community-fabric` - bounded PROJECT/MEMBER_CARE/CONTENT/EVENT submissions, privacy defaults, explicit transitions, durable repository/event history and public-list publication gate. INTEGRATED source; live DB pending.
- Blueprint modules `discovery`, `member-care`, `project-lab`, `event-studio`, `content-studio`, `knowledge-ops`, `member-ops`, `reliability-ops` - desired roles/categories/text/forums/voice plus setup preset coverage. TESTING.
- `apps/platform/src/discord/fabric-actions.ts` - Components V2 member intake/public directory and Manage Server review queue. INTEGRATED source.
- Dashboard Operations Workflows now includes `fabric_work` records and uses the same transition contract; no separate arbitrary mutation surface was introduced.
## Phase 9 operations evidence modules
- `packages/incidents` - durable staff-only incident declaration/status/timeline with correlation evidence. INTEGRATED.
- `packages/capacity` - advisory capacity pressure scoring and durable evidence snapshots; no destructive automation. TESTING.
- `packages/recovery-drills` - planned/running/blocked/passed/failed drill lifecycle with hard evidence gate for PASSED. INTEGRATED/TESTING.
- `scripts/release-provenance.mjs` - release provenance root hash over committed/source evidence; current release remains blocked without lockfile/SBOM. TESTING.

## Phase 10 modules
- `packages/budgets` - registered, durable guild resource-budget policy/window/evidence engine. TESTING.
- `packages/jobs/src/fairness.ts` - pure priority-lane tenant fairness comparator shared by runtime/tests. TESTING.
- `packages/automation` + `apps/platform/src/runtime/automation-worker.ts` - validated safe rule model, durable receipt/execution repositories and budget/maintenance-aware worker. TESTING.
- `apps/platform/src/index.ts` - executable runtime bootstrap; owns process-role wiring rather than duplicating HTTP server implementation. TESTING.

## Phase 11 modules
- `packages/admission-control` - pure admission decision contract plus durable Guild policy/context/decision repository. TESTING; migration/live overload execution pending.
- `apps/platform/src/runtime/setup-worker.ts` - worker-side structural admission re-check immediately before mutation. INTEGRATED source; live Gateway/DB execution pending.
- `apps/platform/src/runtime/scheduled-worker.ts` / `automation-worker.ts` - optional background/provider/bulk admission defer with durable rescheduling/evidence. INTEGRATED source; live timing/retry tests pending.


## Phase 19 dependency admission module
- `packages/dependency-policy` - pure exact-pin/lockfile/root-parity/registry/integrity/install-script/install-surface evaluator consumed by Release Truth. TESTING; current graph remains BLOCKED because no reviewed lockfile exists.
- `scripts/bootstrap-dependency-lock.mjs` / `dependency-lock-gate.mjs` - bounded review-only lock generation and release enforcement. TESTING; network bootstrap cannot succeed in the current environment.
- `.github/workflows/dependency-bootstrap.yml` - manual artifact-only bootstrap path; dependency lifecycle scripts are intentionally not executed before review.
- `game-sessions` - `/setup`-managed Gaming availability + scheduled session orchestration, notifications, progression hooks and aggregate operational evidence. TESTING; migration/live Discord evidence pending.

## Phase 28 realtime visual/presentation modules
- `apps/dashboard/src/components/RealtimeVisualStage.tsx` - bounded event-backed Canvas/CSS-3D/emoji renderer with parallax, ResizeObserver, reduced-motion, visibility and FPS/device-tier degradation. TESTING; deployed GPU/mobile profiling pending.
- `packages/visual-system` - shared event-to-FX visual directive contract and theme/scene tokens. INTEGRATED/TESTING.
- `packages/visual-experience` - durable living visual transition/de-dup/coalescing policy. INTEGRATED/TESTING; migration 054 live evidence pending.
- `packages/localization` + `packages/panels` + `packages/assets` - Thai source presentation for managed product surfaces and generated visual metadata while keeping technical action/API keys stable. TESTING through Thai presentation audit.
- `apps/platform/src/discord/presentation.ts` + HTTP `safeHttpFailure` - safe Thai user error boundary; full exceptions remain diagnostic logs. INTEGRATED/TESTING.

## Phase 29 production-intelligence modules
- `packages/digital-twin` - read-only topology/impact projection derived from the canonical setup plan; distinguishes Discord mutation from mapping-only adoption and fails closed on required conflicts. TESTING.
- `packages/operations-intelligence` - pure evidence synthesis across database/Discord/realtime/queue/component/incident/SLO health; no automatic mutation policy. TESTING.
- `packages/event-replay` - bounded read-only durable+live event timeline with de-duplication, aggregate ordering diagnostics and recursive redaction. TESTING.
- `apps/platform/src/http/phase29-views.ts` - tenant-scoped evidence adapters from existing durable runtime tables/hub into Phase 29 pure modules. INTEGRATED/TESTING.
- Dashboard `DigitalTwinConsole`, `OperationsIntelligenceConsole`, and `EventReplayConsole` - Thai operator surfaces connected to actual preview/evidence endpoints; no mock metric source. TESTING; deployed browser evidence pending.
- `packages/recovery-evidence` - pure read-only recovery proof synthesizer over backup/restore/approval/verification/drill evidence; status alone can never establish a verified restore. TESTING.
- `packages/visual-system` Phase 29 orchestrator/governor - priority-aware event FX scheduling plus hysteresis-based performance adaptation consumed by the existing realtime visual stage. TESTING.
