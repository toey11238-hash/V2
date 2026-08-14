# Phase 6 - HTTP Security and Vertical Resiliency

Status: source implemented/integrated/testing; not VERIFIED.

## Scope
- Guild-scoped mutation fixed-window limiting with privacy-hashed subjects.
- API security headers.
- Shared Creator/Mentor/Business orchestration for Dashboard + Discord.
- Creator scheduled publish/cancel; Mentor schedule/reminders/complete; Business priority/SLA/claim/resolve.
- Compensation and periodic ensure-only schedule reconciliation.
- OPEN/HALF_OPEN single-probe integration circuit breaker.
- Operator Deck vertical controls and privacy-safe rate-limit evidence.

## Migrations
- 035 HTTP rate-limit windows.
- 036 vertical scheduling/SLA lifecycle.

## Verification available here
- Canon structural audit.
- dependency-free domain/fault/stress-model smoke.
- transform-types TypeScript syntax checks and dashboard TSX parse.

## Verification explicitly missing
- `npm ci`, full TypeScript/Vitest/build/audit/SBOM.
- real migration/RLS/concurrency tests.
- real Discord/dashboard E2E and scheduler restart/rate-limit/load evidence.
