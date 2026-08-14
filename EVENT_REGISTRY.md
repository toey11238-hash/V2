# EVENT REGISTRY

Events carry correlation ID and guild scope where applicable. Important outbound delivery persists through the outbox. Important inbound delivery persists through the inbox before raw bus dispatch. Raw replay is separated from durable publishing so replay does not re-enqueue itself.

## Wired families
- Discord gateway: ready, guild/member, role/channel, Forum/Thread, voice/member lifecycle and security observations.
- Setup/change: preview/job/resource/panel progress, structural completion, cancellation/failure/rollback/recovery-required.
- Recovery: backup/restore, permission drift/repair, panel repair/history/rollback and safe-change runs.
- Scheduler: claim/start/succeed/fail/stale-recovered plus notification/temp-role/voice/analytics/reward/recruitment/maintenance events.
- Community/support: verification, roles, tickets/applications/reports/suggestions/announcements/events/free-entry rewards.
- Gaming: profile/LFG/team/clan/recruitment/scrim/tournament/event/progression hooks.
- Security/moderation: observations, alert aggregation and human actions; no automatic ban path from detector confidence alone.
- Operations: `maintenance.activated`, `maintenance.completed`, growth/analytics completion and service heartbeat evidence.
- Dashboard: guild-scoped WebSocket feed, recent event API and service heartbeat diagnostics.

## Ordering/dedup invariants
- Generic events must not assume global ordering.
- Streams that provide `source + aggregateKey + sequence` use a durable `event_stream_heads` row to accept monotonic sequence only.
- Same event ID is duplicate; older/equal sequence from another event is stale and safely consumed without rewinding downstream state.
- Inbound event record is durable before dispatch; retry/lease state survives process restart.
- Persisted effects still require idempotency even when sequence metadata exists.

## Delivery invariants
- revalidate live Discord/current durable state before mutations;
- tenant isolation by guild ID;
- rate-limit-aware Discord/external calls;
- important mutations emit audit/correlation evidence;
- unknown/stale health remains UNKNOWN/OFFLINE rather than manufactured green state.

## Still pending verification
Dependency-backed/restart/E2E tests for concurrent stream heads, duplicate Gateway events, inbox/outbox replay, WebSocket reconnect, external webhook replay and high-load fanout.

## Phase 5 evidence events
- Feature rollout revisions and observations are durable records; identity/role context is represented by guild-scoped hashes rather than raw IDs.
- Integration ENABLE/DISABLE/HEALTH_CHECK events persist sanitized before/after evidence.
- Staff workflow transitions, scheduler cancellation, feature rollout changes, integration state/health and portable-import preview also emit generic audit/correlation evidence.
- Portable config preview remains non-mutating; its evidence records schema migration/checksum/plan metadata only.


## Phase 6 runtime evidence
- `creator.content.published` fires from scheduled publish after re-reading durable APPROVED/scheduled state.
- `education.mentor.reminder` re-reads SCHEDULED mentor state before DM delivery.
- `business.support.sla_alerted` re-reads OPEN/CLAIMED support state and excludes raw external/payment references.
- `scheduler.vertical.reconciled` reports only count of missing durable vertical tasks restored from domain state; reconciliation never treats cache/memory as authority.
- `scheduler.privacy_export_expiry.reconciled` reports only the count of missing/terminal privacy-export expiry tasks restored from durable SUCCEEDED artifact state; it carries no exported subject payload.
- `scheduler.retention_runs.reconciled` reports only a count of stale RUNNING retention runs closed as FAILED while the scheduler holds the same per-guild retention governance advisory lock; it carries no retention plan or subject payload.

## Phase 7 signed inbound events
- Built-in generic inbound events are forced under `integration.generic.<type>` and cannot claim internal `discord.*`, `setup.*`, `security.*` event names.
- Accepted webhook events are first persisted to `event_inbox` with correlation/dedup/source metadata; inbox ordering rules apply before raw bus dispatch.
- Delivery receipts and integration events record only body/signature fingerprints/status/count/error metadata; raw secret values are never event payloads.

## Phase 8-9 provider/realtime evidence
- `integration.content.synced` is emitted only after a registered adapter sync result is stored as a durable hashed/versioned snapshot and next durable run is scheduled.
- Realtime hub deduplicates recent event IDs and disconnects clients that exceed buffered-byte limits with retryable close semantics rather than accumulating unbounded process memory.
- Canary metric outcomes are durable evidence linked to rollout observation IDs; review recommendations are computed from persisted cohorts and do not emit automatic promote/rollback mutations.

## Phase 10 budget / automation evidence
- Budget decisions persist in `resource_budget_events`; worker-specific deferred events include real retry-at evidence instead of silently dropping optional work.
- Generic automation consumes already-published durable outbox evidence through `automation_event_receipts`, preserving restart/retry state independently from process memory.
- Automation execution audit is source-event/rule idempotent and does not introduce arbitrary external HTTP or destructive Discord event actions.

## Phase 11 admission evidence
- Admission decisions persist before optional work proceeds; defer events include real pressure/retry evidence rather than fake progress.
- Runtime deferred families include `integration.sync.admission_deferred`, `notification.fanout.admission_deferred`, `backup.scheduled.admission_deferred` and `analytics.daily.admission_deferred`.
- Security/Maintenance notification paths are protected and do not emit admission-deferred events.
- Admission decision evidence is guild/correlation scoped and does not mutate desired server scope.

## Phase 15 audit-integrity event boundary
- No new public/domain event type is emitted solely for integrity verification. The hash chain is persistence evidence attached atomically to existing audit writes.
- Verifier reads do not emit synthetic success events or alter chain state; operator evidence is a read-only diagnostic surface.

## Phase 16 backup/restore evidence events
- `restore.job.completed` includes `backupVerification: RESTORE_VERIFIED` only after post-apply verification and durable backup verification evidence succeed.
- Scheduled/manual capture completion must be interpreted as integrity-checked snapshot creation, not a restore-verification event.


## Phase 24 gaming reliability / SLO evidence boundary
- `GAMING_SESSION_WAITLIST`, session leave/promotion, check-in and host attendance corrections are recorded through the existing audit path; promotion evidence is derived from the committed session transaction rather than process-memory prediction.
- Waitlisted membership is coordination state only and does not emit progression completion/XP evidence until a member is actually promoted/joined.
- Common-time recommendation is a read-only aggregate query. It does not emit member-availability events and does not expose raw availability rows.
- Automation lint and SLO/error-budget evaluation are read-only derived evidence. They do not emit synthetic success/domain events or mutate automation/runtime health state.

## Phase 27 living visual event projection
`LivingPanelWorker` subscribes to already-emitted in-process event evidence and projects selected events into durable managed-panel visual state. Mapped families include security alerts; maintenance activation/completion; restore start/success/failure; setup start/structural/config/recovery/rollback; scheduled backup outcome; integration synchronization; scheduler start/failure; and Gaming session lifecycle.

The projection persists `(guild_id,panel_id,event_id)` before accepting a transition. Duplicate event delivery is a no-op for revision advancement. The projection does not publish synthetic domain success events, does not manufacture progress, and does not make generic event ordering assumptions. State expiry and last-rendered/min-update timestamps are persistence evidence for the visual layer only.

## Phase 28 realtime visual publishers
The visual runtime now maps only event families that have a real publisher/runtime path. Newly audited source publishers include:

| Event | Source transition | Visual intent |
|---|---|---|
| `member.join` | Discord member join after platform event/audit path | arrival particle/emoji burst |
| `ticket.created` | durable ticket create success | opening ripple |
| `ticket.claimed` | durable claim success | claim pulse |
| `ticket.closed` | durable close success | closure wave |
| `ticket.reopened` | durable reopen success | reopen ripple |
| `community.event.created` | durable community-event create success | event energy/ripple |
| `community.event.registered` | registration success | registration pulse |
| `community.event.cancelled` | cancellation success | terminal fade/wave |
| `community.event.checkin` | check-in success | check-in burst |
| `gaming.xp.awarded` | XP actually awarded | progression orbit |
| `gaming.level.up` | persisted level transition | level-up burst/orbit |

Security/setup/job/maintenance/backup/recovery/integration/scheduler events continue through their existing event-backed paths. Visual consumers do not publish synthetic success events and duplicate/reconnect handling must not advance durable visual state twice.

## Phase 29 event evidence consumption
- Event Replay introduces **no new domain event type** and MUST NOT republish replayed evidence. It consumes the existing guild-scoped durable `event_outbox` plus bounded RealtimeHub recent history.
- Visual Orchestrator introduces **no new authority event**. It schedules presentation for existing emitted event types and cannot create job/ticket/security/progression success state.
- Operations Intelligence reads event-transport counters/evidence but emits no automatic remediation event in Phase 29.
- Recovery Evidence V2 reads existing recovery tables/evidence directly and emits no new event type; the evidence view must never republish restore history as a live event.
