# Phase 5 - Operator Governance and Release Truth

Status: source integrated / dependency-backed verification blocked.

## Goals
Phase 5 turns several prior foundations into auditable operator controls without creating generic database mutation endpoints or fabricated external integrations.

## Canary evidence
Feature rollout changes increment a revision and write immutable history. Evaluation observations persist decision evidence while hashing user/role context instead of storing raw identity lists. Rollback is manual, authorized and itself creates a new revision.

## Portable config compatibility
Current portable config schema is v2. v1 imports validate their legacy checksum, migrate deterministically to v2, then use the v2 checksum that also binds `exportedAt`. Unsupported future versions and checksum tampering fail closed. Import-preview stores only schema/checksum/migration/plan evidence and never changes Discord directly.

## Staff and scheduler controls
The dashboard exposes explicit workflow transitions supported by each domain state machine. Scheduler cancellation is limited to user-cancellable task classes that are still `SCHEDULED`; safety expiry and running tasks cannot be cancelled through the generic operator surface.

## Integration truthfulness
A database row marked configured does not prove a provider exists. Enabling requires a matching runtime adapter. Missing adapters return `ADAPTER_NOT_REGISTERED/UNAVAILABLE`. Health details are sanitized before durable storage and operator display.

## Verification
Dependency-free gates currently pass Canon structural audit, 25 domain assertions, 17 fault-model assertions, TypeScript syntax and TSX parsing. The release-readiness script correctly blocks promotion because a reviewed lockfile does not exist and several dependencies remain unpinned.

## Explicit non-claims
This phase is not a production-readiness claim. No database migration in this phase has been executed on a selected real target here. No Discord test-guild E2E, real load/chaos test or dependency-backed Vitest/build has been completed in this environment.
