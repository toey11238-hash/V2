# Phase 3 - Recovery, Governance and Domain Hardening

This phase extends the Phase-2 Panel Fabric into durable operator and member workflows while preserving the Canon command boundary (`/setup` configures everything; no command sprawl).

## Cross-cutting runtime
- Discord OAuth2 dashboard sessions scoped to manageable guilds, CSRF on mutations and live Manage Guild re-checks.
- durable mutation journal, conditional compensators, guild locks and recovery events;
- durable outbox, scheduled-task leases/recovery and service heartbeats;
- diagnostics preserve UNKNOWN/OFFLINE instead of inventing healthy state.

## Recovery and change control
- detailed Discord backup snapshots include logical identity, hierarchy, attributes and overwrites;
- restore is preview -> approval -> durable job -> pre-restore backup -> apply -> verify;
- permission repair is drift-hash-bound to an independent approval and rejects stale approvals;
- safe migration/rebuild never auto-deletes extras: managed extras become retirement review records; user-owned/locked resources are preserved;
- custom blueprints are guild-scoped, versioned, checksummed and validated before use.

## Member and operations domains
- notification fanout respects topic opt-in, quiet hours, deduplication and delivery state;
- temporary roles warn/expire durably and remove a role only after all active grants expire;
- native Discord Forums/Threads are part of desired state and backup/restore policy;
- tickets include claim, SLA, transcript, close/reopen/archive;
- creator, education and business workflows use persistence and panel actions;
- free-entry community rewards prohibit paid entry/wager/casino mechanics and store auditable draw evidence.

## Gaming
- persistent profile/LFG/team/clan/tournament/scrim/progression paths;
- period-aware quests, dedup progression receipts, achievements and seasons;
- temporary voice lifecycle and event integration;
- competition remains non-wagering by Canon and validators.

## Governance
- feature flags support global/guild/role/environment scopes with deterministic canary buckets;
- AI hooks use capability/data-class/secret gates and a bundled free deterministic `local-rules` provider; no paid provider is required or enabled by default;
- third-party plugin execution remains denied without independently verified OS/container isolation;
- privacy export/expiry and retention/legal-hold policies are explicit and auditable.

## Verification status
Structural Canon audit and dependency-free smoke checks pass in the current workspace. Full project verification is blocked because this execution environment cannot resolve the npm registry. Nothing in this phase is promoted to VERIFIED solely from source presence.
