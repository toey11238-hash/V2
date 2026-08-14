# Phase 10 - Tenant Fairness, Resource Budgets, Durable Automation and Runtime Bootstrap

Status: SOURCE IMPLEMENTED / STATIC-CONTRACT TESTING / LIVE VERIFICATION PENDING
Date: 2026-08-14

## Scope

Phase 10 hardens the platform for multi-guild operation without shrinking Canon scope:

- tenant-fair durable job claiming with priority lanes;
- per-guild resource budgets for optional/background work;
- `/setup` budget configuration as part of the same versioned durable draft;
- bounded generic automation driven by durable event evidence;
- production bootstrap that actually starts Discord, HTTP, jobs, scheduler, inbox/outbox and automation runtime;
- readiness/heartbeat evidence for those loops.

## Tenant fairness

`JobRepository.claimNext` keeps safety/critical priority semantics first, then considers same-guild in-flight jobs and recent starts before ordinary priority/age. The query remains lease-based and uses `FOR UPDATE ... SKIP LOCKED` for multi-worker safety.

Fairness is not authorization and does not change job payloads. It is only a claim-order policy intended to reduce noisy-neighbor starvation across guilds.

## Resource budgets

Registered keys are fail-closed:

- `provider.sync`
- `background.analytics`
- `background.backup`
- `notification.fanout`
- `bulk.automation`

Modes:

- `OBSERVE`: record overage evidence but do not block;
- `ENFORCE`: defer optional/background work to a deterministic retry window.

Security and maintenance notification paths are not routed through optional-work budgets. Budget decisions are persisted; they are not in-memory counters.

## `/setup`

The universal `/setup` surface now stores the five budget policies inside the versioned setup draft. Setup apply upserts the same policies used by workers, so Dashboard and Discord configuration do not diverge.

## Durable safe automation

Generic automation supports only:

- `NOTIFY_TOPIC`
- `SCHEDULE_NOTIFICATION`
- `AUDIT_NOTE`

It intentionally does not expose arbitrary HTTP, generic role/channel mutation, or destructive Discord operations. Rules are validated before storage. Event receipts, execution records, budget decisions, leases, retries and audit evidence are durable.

Maintenance policy can defer member automation. Automation consumes `bulk.automation` before action execution and uses idempotent source-event/rule execution identity.

## Executable platform bootstrap

`apps/platform/src/index.ts` is the executable runtime entrypoint. It now:

1. loads validated configuration;
2. opens PostgreSQL and optionally applies authored migrations;
3. creates raw + durable event buses and Realtime Hub;
4. creates the Discord Client using configured shard mode/intents;
5. binds `/setup`, managed panel interactions, member/forum/voice/security gateway handlers on bot-owning roles;
6. registers the single top-level `/setup` command;
7. registers durable `SETUP_APPLY`, `RESTORE_APPLY`, and `PERMISSION_REPAIR` job handlers;
8. starts inbox/outbox, job worker, scheduler and automation worker according to process role;
9. starts the HTTP API and readiness/health surfaces;
10. emits durable service heartbeats and performs bounded shutdown.

The HTTP implementation remains in `apps/platform/src/http/server.ts`; the executable entrypoint no longer duplicates that server source.

## Verification truth

Dependency-free/static gates can prove source structure and deterministic contracts. They cannot prove Discord Gateway behavior, PostgreSQL concurrency, Render behavior, or external provider behavior. Full dependency-backed build/Vitest and approved disposable DB/test-guild integration remain required before VERIFIED or Production Ready.
