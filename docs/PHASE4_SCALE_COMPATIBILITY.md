# Phase 4 - Scale, Compatibility and Completeness Hardening

Status: implemented/integrated source with dependency-free contract evidence; not production-verified.

## Scope
Phase 4 strengthens platform behavior that becomes important when multiple workers, larger guilds, long-running upgrades and richer Gaming/community workflows are present. It does not reduce any earlier Canon scope.

## Delivered
- Shared cache: bounded in-process L1 + PostgreSQL L2 TTL, prefix invalidation and single-flight. Durable repositories remain authoritative.
- Inbound event durability: inbox persistence before dispatch, leases/retry, optional source/aggregate/sequence stream heads and stale/duplicate suppression.
- Maintenance runtime: durable windows/events, scheduler activation/completion, notification evidence and mutation-policy guards.
- Growth modes: SMALL/STANDARD/LARGE/ENTERPRISE scoring from live Discord structure plus durable activity; recommendations are advisory only.
- Compatibility layer: reports Node/discord.js/PostgreSQL/schema/panel compatibility and generates an upgrade plan without self-mutating dependencies.
- Documentation: generated repository reference and human-readable server-blueprint report/tree/content hash with authorized durable snapshots.
- Custom blueprint UX: visual Category/Text/Forum/Voice/Role composer with logical keys, hierarchy/visibility/ownership and advanced JSON fallback.
- Gaming Recruitment Center: guild-scoped free community matching posts, filters, duplicate-safe applications, owner/manager private application review, close, expiry scheduler and operational view.

## Safety boundaries
- Cache loss may reduce performance but must never corrupt canonical state.
- Event sequence enforcement is opt-in per ordered stream; the platform does not fabricate a global order.
- Maintenance is not authorization bypass and cannot weaken approval/security rules.
- Growth recommendations never mutate Discord until routed through normal preview/approval flows.
- Compatibility endpoint is diagnostic; dependency upgrades remain explicit reviewed work.
- Recruitment contains no payment, wager, casino or paid-entry mechanic.

## Authored database changes
Migrations 027-031: cache, event ordering, maintenance events, generated docs/growth assessments and Gaming recruitment.

## Evidence
- Canon structural audit: PASS (1 slash root, 8 blueprints, 31 migrations, 39 managed media refs).
- Domain smoke: PASS 18 assertions.
- Static TypeScript differential: no project-local candidate after separating unavailable external declarations.
- Full npm/Vitest/build, DB migration/RLS/concurrency and Discord E2E remain blocked/unexecuted and are required before VERIFIED/production maturity.
