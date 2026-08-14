# JOB REGISTRY

Durable job states: `QUEUED -> RUNNING -> RETRYING -> SUCCEEDED / FAILED / CANCELLED / EXPIRED / DEAD_LETTER`.

## Durable jobs
| Type | Status | Notes |
|---|---|---|
| `SETUP_APPLY` | INTEGRATED | setup + safe migration/rebuild share the same idempotent executor/journal |
| `PERMISSION_REPAIR` | INTEGRATED | drift-hash/approval bound, guild lock, verify, exact-state compensation |
| `RESTORE_APPLY` | INTEGRATED | checksum backup, approval, pre-restore snapshot, journal, detailed verify |

Job runtime: priority, availability time, `FOR UPDATE SKIP LOCKED`, lease ownership/heartbeat, bounded retry/dead-letter, cooperative cancellation, guild lock, correlation ID and actual progress units.

## Scheduled task types
| Type | Status | Behavior |
|---|---|---|
| `ANNOUNCEMENT_PUBLISH` | INTEGRATED | governed publish + delivery record + fanout |
| `EVENT_REMINDER` | INTEGRATED | event-backed reminder + notification fanout |
| `TEMP_ROLE_WARN` / `TEMP_ROLE_EXPIRE` | INTEGRATED | durable warning/event audit/expiry |
| `TEMP_VOICE_CLEANUP` | INTEGRATED | occupied-room guard + grace cleanup |
| `NOTIFICATION_FANOUT` / `NOTIFICATION_DELIVER` | INTEGRATED | opt-in/quiet-hours/dedup/receipts |
| `BACKUP_SCHEDULED` | INTEGRATED | snapshot/prune/reschedule from guild policy |
| `TICKET_SLA_CHECK` / `TICKET_ARCHIVE` | INTEGRATED | staff alert/transcript/archive |
| `PRIVACY_EXPORT_EXPIRE` | INTEGRATED | delete expired artifact reference/state |
| `ANALYTICS_DAILY` | INTEGRATED | timezone aggregation + advisor/growth refresh + cache pruning |
| `GIVEAWAY_CLOSE` | INTEGRATED | closes free-entry period; never auto-draws |
| `MAINTENANCE_START` / `MAINTENANCE_END` | INTEGRATED | durable maintenance state transitions + notification evidence |
| `GAMING_RECRUITMENT_EXPIRE` | INTEGRATED | idempotent expiry of open recruitment posts |
| `INTEGRATION_SYNC` | TESTING | registered-adapter public-provider sync -> snapshot/hash/health -> bounded prune -> new dedup-key reschedule |

Scheduled tasks use lease/heartbeat/stale recovery and bounded retry. Timing tasks do not replace gateway/event listeners.

## Durable event workers
- Inbound: `event_inbox` claim/lease/retry -> optional monotonic stream-head decision -> raw event bus.
- Outbound: `event_outbox` claim/lease/retry -> raw event bus/WebSocket.
- Both persist critical delivery state outside process memory.

## Phase 10 worker policy
- Durable job claim now orders by critical/high/normal priority lane first, then same-guild in-flight/recent-start fairness, then ordinary priority/age. Lease + `FOR UPDATE SKIP LOCKED` semantics remain authoritative.
- Durable generic automation is a separate event-receipt worker, not a fake scheduled command loop. It consumes `bulk.automation`, respects maintenance policy, and only schedules allowlisted notification/audit actions.

## Phase 11 admission policy
- `SETUP_APPLY` is evaluated before queue creation in Discord/Dashboard and re-evaluated by Setup Worker before acquiring the mutation lock. A deferred decision becomes a retryable job error only if an alternate enqueue path bypassed the pre-queue guard.
- Optional scheduled/provider/bulk work defers by creating durable retry tasks/receipts; protected safety/support/diagnostic paths are not load-shed.
