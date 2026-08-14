# Phase 14 - Durable Data Governance

Status: **TESTING / source-contract evidence only**. Migration 048 and live operator workflows have not been executed in this workspace.

## Protection model
- Legal holds are durable per guild and data class (`ALL`, `OPERATIONAL`, `AUDIT`, `ANALYTICS`, `USER_CONTENT`).
- Hold creation is immediately protective and increments `retention_revision`.
- Holds do not auto-expire. Release is a CRITICAL approval requiring two distinct non-requester operators, then an explicit execute action.

## Destructive retention model
1. Preview only allowlisted targets and normalize the plan.
2. Hash the normalized plan including cutoff/candidate counts.
3. Compute the retention selector `policyHash`; under a guild governance lock, reject active holds and capture `retention_revision`.
4. Approval stores the plan, plan hash, selector-policy hash and revision.
5. Execute re-locks approval/governance, re-checks expiry/plan hash/policy hash/revision/holds and rejects candidate expansion or unsafe counts.
6. Deletes, approval EXECUTED state and SUCCEEDED run evidence commit in the same transaction. Failure rolls back deletes; FAILED run evidence is recorded outside the rolled-back transaction.
7. Scheduler reconciliation may close a RUNNING retention run older than 30 minutes only after acquiring the same per-guild governance advisory lock. Execution re-checks its own run row after acquiring that lock, so a stale/resumed process cannot continue deleting after reconciliation.

## Privacy export model
- Field allowlists omit staff decision/review notes and internal evidence not appropriate for the subject export. Reads use one `REPEATABLE READ READ ONLY` snapshot with explicit per-dataset row ceilings; overflow fails instead of truncating.
- Payload is capped at 2 MiB; TTL must be an integer from 1-168 hours or the request is rejected.
- Export query/build failures move the request from RUNNING to FAILED.
- Artifact SHA-256 uses canonical JSON key ordering and Date normalization, then is verified on retrieval together with guild/subject scope.
- Scheduler reconciliation recreates missing/failed `PRIVACY_EXPORT_EXPIRE` tasks for SUCCEEDED artifacts and marks stale RUNNING export requests without artifacts as FAILED, reducing orphan-retention and stuck-request risk after a scheduling failure/restart.

## Evidence
- `npm run test:data-governance`: PASS 52 dependency-free assertions.
- `tests/phase14-data-governance.test.ts`: authored; dependency-backed execution blocked here.
- `scripts/live-db-gate.ts`: migration-048 schema assertions authored; not executed here.
- Required before VERIFIED: disposable DB migrations/RLS/grants, concurrent hold-retention races, transaction rollback fault injection, and approved Discord operator-flow evidence.
