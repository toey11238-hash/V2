# DATABASE SCHEMA

Status: migrations `001` through `054` AUTHORED; none executed against a selected real DB in this environment.

## Principles
PostgreSQL is durable source for config/mappings/jobs/locks/audit/domain state. Guild data is tenant-scoped. Stable unique keys, transactions, row locks, leases and idempotency protect retries/concurrency. Cache entries are explicitly disposable. Secrets/tokens are not stored in ordinary guild config. Exposed-schema tables use RLS defense-in-depth; Supabase Data API exposure must be verified on the actual selected project.

## Migration groups
- 001 core: guild/config/resources/setup/jobs/locks/idempotency/inbox/outbox/audit.
- 002-005 Gaming + general domains: profiles/LFG/teams/clans/tournaments/matches/quests/achievements, tickets/moderation/automation/events/notifications/integrations/analytics, parties/scrims/XP/seasons/guides/media/coaching.
- 006-008 control/workflows/governance: setup sessions/panel ops, announcement workflows, plugin/retention/export/change foundations.
- 009 dashboard/recovery: OAuth session/recovery/mutation-journal support.
- 010 Supabase hardening: RLS/default exposure protections where roles exist.
- 011 security observations.
- 012 ticket lifecycle/SLA/transcript/archive.
- 013 privacy/retention/legal hold/export artifacts.
- 014 creator/education/business workflows.
- 015 period-aware progression/dedup receipts.
- 016 plugin execution trust state.
- 017 advanced setup profiles/games/locks/backup policy.
- 018 temporary-role events + notification deliveries.
- 019 Forum/Thread lifecycle.
- 020 scheduled backup state.
- 021 scheduled-task leases.
- 022 custom blueprints + safe change runs.
- 023 feature rollout/canary state.
- 024 AI hook hash/metadata audit.
- 025 process/worker service heartbeats.
- 026 free-entry reward/entry/draw audit tables with `free_entry = true` check.
- 027 shared cache: disposable TTL cache rows and expiry index.
- 028 event ordering: inbox/outbox stream metadata plus durable `event_stream_heads`.
- 029 maintenance runtime: maintenance event history/index support.
- 030 generated docs/growth: immutable-ish report snapshots and growth assessments.
- 031 Gaming recruitment: posts/applications, open/search queue indexes and duplicate-application guard.

## Concurrency/integrity mechanisms in source
- `FOR UPDATE SKIP LOCKED` jobs/scheduler/inbox claims;
- guild mutation locks + lease renewal;
- setup session optimistic versioning;
- drift/change plan-hash binding;
- durable event stream head transaction for sequence decisions;
- suggestion/domain/recruitment unique constraints and row locking;
- period/dedup progression receipts;
- unique free-entry reward identities;
- checksummed backup/custom-blueprint/import envelopes;
- panel content hash/version history;
- cache TTL/invalidation is never used as correctness authority.

## Verification gate
Apply 001-054 to disposable PostgreSQL/Supabase, inspect constraints/indexes/RLS/grants, exercise repositories/concurrency/cache expiry/event ordering/recruitment/session waitlist/living-panel de-dup and expiry, test failed migration transaction behavior and record recovery evidence before DB-related features become VERIFIED.

- 032 feature rollout evidence: revision history + privacy-aware rollout observations.
- 033 integration control: enabled/config version, redacted health/error state and immutable integration events.
- 034 portable config import audit: source/target schema/checksum/migration/plan evidence without raw imported payload.

- 035 HTTP mutation rate limits: guild-scoped hashed subjects, fixed windows, route class/request limit evidence and RLS defense-in-depth.
- 036 vertical scheduling/SLA: Creator scheduled publish metadata, Mentor schedule/timezone/completion and Business priority/SLA/claim/resolve evidence.

## Phase 7 schema additions
- Migration 037 hardens `webhook_deliveries`: guild-scoped external-delivery uniqueness, correlation/body/signature hashes, processing state, event count, error and expiry indexes; RLS remains enabled.
- Migration 038 adds bounded audit query indexes by guild/action/result/resource/correlation.
- Migrations 001-051 remain authored only in this environment and require execution/advisor evidence on a disposable approved target.

## Phase 8-9 schema additions
- Migration 039 adds `integration_sync_snapshots`: Guild/integration/content-type/version/hash/item-count/payload evidence for registered public-provider sync, with retention pruning and RLS defense-in-depth.
- Migration 040 adds `feature_rollout_outcomes`: each metric is bound to a real rollout observation; unique observation+metric prevents duplicate evidence and finite-value constraints reject NaN/Infinity.
- At the Phase 8-9 checkpoint the frontier was 040; all subsequently authored migrations through current 054 remain unexecuted here. Run the disposable DB gate plus target-specific RLS/grant/advisor review before any schema-backed feature becomes VERIFIED.

## Migration 041 - Community Fabric workflows
`041_community_fabric_workflows.sql` AUTHORS (not executed here):
- `community_fabric_work_items` - guild-scoped PROJECT/MEMBER_CARE/CONTENT/EVENT state, visibility, assignee, bounded metadata, correlation/timestamps and queue/public indexes.
- `community_fabric_work_events` - actor/action/before/after/note/correlation audit history.
- RLS enabled with no public client policies; server-side control plane remains the intended access path.
- Verification required on an explicitly approved disposable DB before DB- or Fabric-backed claims may become VERIFIED.
## Migrations 042-044
- `042_operational_incidents.sql` - guild-scoped incident records + ordered staff timeline events, RLS enabled.
- `043_capacity_evidence.sql` - advisory capacity assessment snapshots with bounded JSON evidence, RLS enabled.
- `044_recovery_drills.sql` - recovery drill plans/evidence/blockers/timeline; PASSED semantics enforced by domain layer and durable evidence shape.

## Phase 10 tables / extensions
- `resource_budget_policies`: guild + registered budget key policy, enabled/mode/window/max units.
- `resource_budget_windows`: deterministic durable consumption window state.
- `resource_budget_events`: immutable decision/evidence records without raw sensitive payloads.
- `automation_event_receipts`: durable published-event claim/lease/retry/processed state for generic automation.
- `automation_executions` Phase 10 extensions: source-event idempotency, rule version, action count, budget decision and bounded error evidence.
- Migrations 045-046 are authored only until applied to an approved disposable target.

## Migration 047 - Admission Control
`admission_control_policies` stores one validated Guild policy. `admission_decisions` stores immutable operation/pressure/decision/would-decision/enforcement/retry/correlation evidence. Both tables enable RLS defense-in-depth; live target grants/advisors and contention behavior remain unverified.

## Migration 048 - durable data governance
- `data_governance_state`: one guild row with monotonic `retention_revision`; retention approvals bind this revision.
- `retention_legal_holds`: durable `ACTIVE`/`RELEASED` guild/data-class preservation state with explicit release-approval linkage and RLS enabled.
- `retention_runs`: adds approval ID, plan hash, retention-policy hash and bounded error-code evidence for destructive run traceability; approval links are deletion-restricted so provenance cannot be silently nulled.
- Migration 048 is AUTHORED / NOT EXECUTED HERE; live RLS/grant/index/concurrency/rollback evidence is still required.

### 049 audit integrity chain
- `audit_integrity_heads` stores one versioned SHA-256 chain head and next sequence per `global` or `guild:<id>` scope; RLS is enabled and guild rows cascade with tenant teardown.
- `audit_integrity_entries` stores minimal audit ID/scope/sequence/previous hash/payload hash/event hash/algorithm/timestamp continuity evidence with unique `(scope_key, sequence)` and RLS.
- Integrity entries intentionally do not reference `audit_events`, allowing approved detailed audit retention deletion to leave hash-only continuity evidence.
- Ordinary UPDATE/DELETE of integrity entries is rejected by trigger; FK-driven guild teardown remains permitted. UPDATE of detailed `audit_events` is rejected while retention DELETE remains available through governance-controlled paths.
- Migration 049 is AUTHORED / NOT EXECUTED HERE. Trigger/RLS/cascade/concurrent-writer behavior must be proven on an approved disposable database before VERIFIED.

## Phase 16 backup verification schema
Migration `050_backup_restore_evidence.sql` extends `backup_snapshots` with `hash_algorithm`, `integrity_checked_at`, `restore_verified_at`, and `last_restore_run_id`; adds explicit lifecycle constraints; extends `backup_payloads` with hash-algorithm provenance; and adds append-only `backup_verification_evidence` rows. Migration 050 is authored only in this checkpoint.

## Phase 18 plugin sandbox evidence
Migration `051_plugin_sandbox_evidence.sql` extends `plugin_execution_runs` with nullable `isolation_profile`, constrains persisted evidence to `TRUSTED_NODE_PERMISSION` or `LINUX_NS_SECCOMP_V1`, and adds a partial recent-evidence index. This column records the isolation profile actually reported by the execution runtime; it does not by itself prove that a different deployment host can satisfy the profile.

At the Phase 18 checkpoint the frontier was `001` through `051`. Migration 051 remains part of the authored chain; the current frontier is 054. The manual disposable DB gate verifies valid isolation evidence persistence plus invalid-label rejection after the complete migration set is applied.

## Phase 23 Gaming availability/session schema
Migration `052_gaming_sessions_orchestration.sql` authors three tenant-scoped tables: `gaming_availability_windows`, `gaming_sessions`, and `gaming_session_participants`. Availability rows store private weekly scheduling windows by guild/user/game with IANA timezone labels; operational APIs expose only aggregates by default. Session rows enforce bounded duration/capacity and explicit lifecycle values, while participant rows preserve host/player membership state. All three tables enable RLS defense-in-depth and bind game scope through existing `guild_games`. Current migration frontier is `001` through `052`; migration 052 is AUTHORED / NOT EXECUTED HERE.

## Phase 24 Gaming session reliability schema
Migration `053_gaming_session_reliability.sql` extends the migration-052 session model with bounded `waitlist_capacity`, check-in window configuration, WAITLISTED participant state, FIFO waitlist positions, and explicit attendance state/timestamps. A partial unique index prevents duplicate active waitlist positions within a session. Existing tenant RLS remains inherited from the migration-052 tables. Current migration frontier is `001` through `053`; migration 053 is AUTHORED / NOT EXECUTED HERE and requires live concurrency/RLS/grant/index evidence before VERIFIED.

## Migration 054 — Visual Experience / Living Panels
`054_visual_experience.sql` adds durable `panel_live_states` and `panel_live_state_events`. State is guild/panel scoped, revisions advance only from newly accepted event IDs, expiry returns state to IDLE through repository logic, and render timestamps/minimum-update evidence support product-side edit coalescing. Both tables have RLS enabled. Apply migrations 001-054 on an approved disposable target before treating this schema path as live-verified.
