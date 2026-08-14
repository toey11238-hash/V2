# Foundation Security Model

## Current controls

- Least-privilege Discord role creation: new roles receive no global permissions by default.
- Staff/System/Archive channel blueprints carry explicit visibility profiles; new channels are not intentionally created public.
- Guild setup requires Manage Guild authorization or guild ownership.
- Stable resource ownership differentiates template/system/user/locked state.
- User-owned/locked mapped resources are not silently overwritten.
- Setup requires preview hash confirmation and aborts when state changed after approval.
- High-risk deletes are not implemented in the Phase-1 executor.
- Durable guild locks protect structural mutations and are renewed during work.
- Worker leases heartbeat and expired work can recover.
- Secrets are environment variables and `.env` is ignored.
- Privileged dashboard event streaming requires `ADMIN_API_KEY`; unauthenticated clients receive platform-only events.
- Moderator automation requires explicit policy; automatic ban is not enabled by default.
- Security response helpers use ALERT -> THROTTLE -> TEMPORARY_LOCK -> ESCALATE tiers.
- Webhook replay guard primitive exists for integration adapters.
- Competition kernels reject wagering/stake flags.

## Required hardening before higher maturity

- Discord OAuth2 dashboard session model with guild permission scopes.
- CSRF/session rotation and session revocation.
- Permission drift calculation and preview for existing channels.
- distributed rate-limit / abuse counters for multi-instance deployments.
- encryption/key-management policy for integration secret references.
- security test guild and abuse/raid simulation.
- database RLS/role strategy if database exposure model changes.
- dependency/SBOM/vulnerability scan after the package registry is reachable.

## Phase 15 database-local audit tamper evidence
- New repository audit writes are chained per guild/global scope with canonical SHA-256 payload hashes and sequence/previous-hash binding.
- Detailed `audit_events` rows reject UPDATE; approved governance retention may DELETE details while independent minimal integrity metadata remains for hash-only continuity.
- Integrity entries reject ordinary mutation and verifier reports legacy/bypass/mismatch evidence with bounded scans.
- This mechanism detects ordinary/source-path tampering and bypass; it is **not** an external trust anchor, WORM store or defense against a privileged database administrator that can coherently rewrite chain history and head.
