# MIGRATION LOG

No migration has been executed against a real database in this workspace session. All entries below are AUTHORED / NOT RUN.

| Migration | Scope | Status |
|---|---|---|
| 001_core.sql | guild config, resources, setup sessions, jobs, locks, audit/events | AUTHORED |
| 002_gaming.sql | Gaming core persistence | AUTHORED |
| 003_panels_assets.sql | panel/asset registries | AUTHORED |
| 004_domains.sql | tickets, moderation, automation, events, notifications, integrations, analytics | AUTHORED |
| 005_gaming_expansion.sql | party/scrim/XP/seasons/guides/media/coaching/game adapters | AUTHORED |
| 006_control_center.sql | setup control/session expansion | AUTHORED |
| 007_workflows.sql | application/report/suggestion/announcement workflows | AUTHORED |
| 008_governance_plugins.sql | governance/plugin foundations | AUTHORED |
| 009_dashboard_recovery.sql | OAuth dashboard/recovery records and mutation journal support | AUTHORED |
| 010_supabase_api_hardening.sql | RLS/default API exposure hardening | AUTHORED |
| 011_security_observations.sql | anti-abuse/security observation persistence | AUTHORED |
| 012_ticket_lifecycle.sql | claim/SLA/transcript/archive ticket lifecycle | AUTHORED |
| 013_privacy_retention.sql | retention/legal hold/privacy export artifacts | AUTHORED |
| 014_domain_workflows.sql | creator/education/business workflow persistence | AUTHORED |
| 015_progression_periods.sql | period-aware quests/progression receipts/achievements | AUTHORED |
| 016_plugin_execution.sql | plugin trust/execution policy state | AUTHORED |
| 017_setup_profiles.sql | advanced setup profiles/locks/games/backup policy | AUTHORED |
| 018_temp_roles_notifications.sql | temporary role events and notification delivery state | AUTHORED |
| 019_forum_threads.sql | managed Forum/Thread lifecycle | AUTHORED |
| 020_backup_schedules.sql | scheduled backup state | AUTHORED |
| 021_scheduled_task_leases.sql | scheduler ownership/lease/recovery | AUTHORED |
| 022_change_control_blueprints.sql | custom blueprints and safe change runs | AUTHORED |
| 023_feature_rollouts.sql | global/guild/role/environment feature rollout state | AUTHORED |
| 024_ai_hook_audit.sql | AI hook metadata/hash audit, no raw prompt persistence | AUTHORED |
| 025_service_heartbeats.sql | process/worker/gateway heartbeat evidence | AUTHORED |
| 026_free_entry_giveaways.sql | free-entry rewards, entries and auditable draws | AUTHORED |
| 027_shared_cache.sql | disposable shared TTL cache rows/index | AUTHORED |
| 028_event_ordering.sql | inbox/outbox stream metadata + monotonic stream heads | AUTHORED |
| 029_maintenance_runtime.sql | maintenance event history/runtime indexing | AUTHORED |
| 030_generated_docs_growth.sql | generated document snapshots + growth assessments | AUTHORED |
| 031_gaming_recruitment.sql | recruitment posts/applications/expiry queues | AUTHORED |

Verification gate: apply 001-031 in order to a disposable DB, run application queries and RLS/grant checks, test failure/recovery and capture evidence before any migration-related feature is VERIFIED.

## 032-034 - Phase 5 operator governance evidence
Status: AUTHORED / NOT EXECUTED IN THIS ENVIRONMENT
- `032_feature_rollout_evidence.sql` - rollout revisions/history and privacy-aware evaluation observations.
- `033_integration_control.sql` - integration enabled/config version/health state plus immutable integration events.
- `034_portable_config_import_audit.sql` - durable import-preview schema/checksum/migration/plan evidence without raw imported payload.| 042_operational_incidents.sql | operational incident state/timeline | AUTHORED |
| 043_capacity_evidence.sql | capacity evidence snapshots | AUTHORED |
| 044_recovery_drills.sql | recovery drill plans/evidence/blockers | AUTHORED |

Verification required: execute 001-034 in order on a disposable approved target, inspect RLS/grants/indexes/constraints and run rollback/concurrency tests.

- `035_http_rate_limit_windows.sql` - guild-scoped privacy-hashed mutation fixed-window evidence. AUTHORED / NOT EXECUTED HERE.
- `036_vertical_scheduling_sla.sql` - Creator/Mentor scheduling and Business support priority/SLA lifecycle fields/indexes. AUTHORED / NOT EXECUTED HERE.

## 037-038 - Phase 7 inbound integration and audit query evidence
Status: AUTHORED / NOT EXECUTED IN THIS ENVIRONMENT
- `037_webhook_replay_security.sql` - tenant-scoped webhook receipt uniqueness, body/signature fingerprints, processing state/expiry and integration webhook event actions.
- `038_audit_query_indexes.sql` - guild/action/result/resource/correlation indexes supporting bounded Audit Explorer queries.
Verification required: execute 001-038 on a disposable approved target; prove constraints/RLS/index plans/replay races/rollback before any DB-backed Phase 7 feature is VERIFIED.

## 039-040 - Phase 8-9 provider sync and canary outcome evidence
Status: AUTHORED / NOT EXECUTED IN THIS ENVIRONMENT
- `039_integration_sync_snapshots.sql` - tenant-scoped provider content snapshots with external version/hash/item-count metadata, bounded-history indexes and RLS defense-in-depth.
- `040_feature_rollout_outcomes.sql` - observation-bound canary metric outcomes with cohort comparison indexes, RLS and finite-value bounds rejecting NaN/Infinity.
Verification required: execute 001-040 on an explicitly approved disposable target; inspect RLS/grants/indexes/constraints, provider snapshot retention, outcome uniqueness/conflict behavior and rollback before DB-backed Phase 8-9 features are VERIFIED.

## 041 - Server Fabric V3 durable workflows
Status: AUTHORED / NOT EXECUTED IN THIS ENVIRONMENT
- `041_community_fabric_workflows.sql` - tenant-scoped Community Fabric work items/event history, privacy visibility, state constraints, indexes and RLS defense-in-depth.
Verification required: run migrations 001-044 on an approved disposable target; inspect constraints/indexes/RLS and test concurrent review/state transitions before promotion.
| 045_tenant_fairness_budgets.sql | registered per-guild budget policies/windows/events, existing-guild defaults and fair-claim supporting indexes | AUTHORED / NOT EXECUTED HERE |
| 046_automation_runtime.sql | durable automation event receipts and execution evidence/version/budget fields | AUTHORED / NOT EXECUTED HERE |

## 047_admission_control.sql
Status: AUTHORED / NOT EXECUTED HERE
Adds `admission_control_policies` and `admission_decisions`, Guild-scoped constraints/indexes/RLS, and seeds existing configured Guilds with BALANCED/ENFORCE policy. Requires disposable DB execution, RLS/grant/advisor review and concurrent pressure/defer verification before VERIFIED.


## 048_data_governance_holds.sql
Status: AUTHORED / NOT EXECUTED HERE
Adds guild-scoped `data_governance_state` retention revision evidence, durable `retention_legal_holds`, and retention-run approval/plan/policy/error evidence with deletion-restricted approval provenance and hash/error format bounds. Legal-hold and governance-state tables enable RLS defense-in-depth. Verification requires disposable DB execution, grant/advisor review, concurrent hold-vs-retention races, rollback injection and operator approval-flow evidence before VERIFIED.

## 049 - audit integrity chain
- File: `packages/database/migrations/049_audit_integrity_chain.sql`
- Status: AUTHORED / NOT EXECUTED HERE.
- Adds per-scope audit-integrity heads/entries, RLS, append-only ordinary-mutation guards and detailed-audit UPDATE immutability while retaining governance-controlled DELETE semantics.
- Authored live DB gate covers chained write, UPDATE rejection, retention hash-only continuity, bypass detection and tenant cleanup; no live execution is claimed in this workspace.

## 050_backup_restore_evidence.sql
Status: AUTHORED / NOT EXECUTED HERE
- Adds backup hash-algorithm provenance, integrity-check and restore-verification timestamps, and last successful restore-run linkage.
- Downgrades historical checksum-only `VERIFIED` rows to `LEGACY_UNPROVEN` rather than fabricating restore proof.
- Adds append-only `backup_verification_evidence` with integrity/restore evidence classes.
- Adds lifecycle/hash-format constraints and verification indexes.

## 051_plugin_sandbox_evidence.sql
Status: AUTHORED / NOT EXECUTED HERE
- Adds `plugin_execution_runs.isolation_profile` with a strict allowlist for `TRUSTED_NODE_PERMISSION` and `LINUX_NS_SECCOMP_V1`.
- Adds a partial recent-evidence index for non-null isolation profiles.
- Disposable live-DB gate persists `LINUX_NS_SECCOMP_V1` through `PluginExecutionRunRepository` and requires the database constraint to reject invalid profile labels.
- Requires migration execution/RLS/grant/index review on an explicitly approved disposable target before database-backed sandbox evidence is considered live-verified.

## 052_gaming_sessions_orchestration.sql
Status: AUTHORED / NOT EXECUTED HERE
- Adds guild/game/member-scoped private `gaming_availability_windows` with bounded recurring weekday/minute/timezone records and RLS defense-in-depth.
- Adds durable `gaming_sessions` with explicit lifecycle/timestamp/duration/capacity constraints and guild-game foreign-key ownership.
- Adds `gaming_session_participants` with host/player roles, joined/left state, tenant indexes and RLS defense-in-depth.
- Requires execution of migrations 001-052 on an approved disposable target, RLS/grant/index inspection and concurrent join/capacity/state-transition tests before VERIFIED.

## 053_gaming_session_reliability.sql
Status: AUTHORED / NOT EXECUTED HERE
- Extends `gaming_sessions` with bounded waitlist capacity and check-in open/close windows.
- Extends `gaming_session_participants` with WAITLISTED state, deterministic waitlist position, PENDING/CHECKED_IN/NO_SHOW/EXCUSED attendance evidence, promotion timestamp and update timestamp.
- Adds unique active waitlist-position and check-in lookup indexes.
- Existing RLS remains enabled on the participant/session tables from migration 052; target-specific policies/grants still require live review.
- Requires execution of migrations 001-053 plus concurrent admission/promotion/check-in tests on an approved disposable target before VERIFIED.

## 054_visual_experience.sql
- Adds `panel_live_states` for current guild/panel Server Pulse/living-panel state, state hash, revision, expiry and render-coalescing evidence.
- Adds append-by-event identity table `panel_live_state_events` with `(guild_id,panel_id,event_id)` primary key so duplicate event delivery cannot advance the visual revision twice.
- Adds guild/change and expiry indexes and enables RLS on both new tables.
- Source/live-DB harness is authored for de-dup/render-evidence/expiry behavior; migration 054 is NOT EXECUTED HERE.
