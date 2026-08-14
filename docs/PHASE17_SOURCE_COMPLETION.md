# Phase 17 - Source Completion / Public Provider + Durable Profile

Status: SOURCE/STATIC TESTING. This phase does not claim live provider, Supabase, Discord, browser, or dependency-backed verification.

## Gaming public news provider

- Adds registered `steam-news` adapter using the documented public Steamworks `ISteamNews/GetNewsForApp/v2` endpoint.
- `/setup` owns per-guild enablement, Steam App ID and durable sync cadence.
- Egress is fixed to `api.steampowered.com`; redirects, private-network targets and arbitrary URLs remain denied by the shared safe HTTP client.
- Sync output is bounded to at most 20 items with bounded summaries; invalid App IDs and malformed provider responses fail closed.
- No publisher key or user credential is accepted by this adapter.

## Supabase durable deployment profile

- `evaluateDurableDeploymentProfile()` reports durable DB configuration, provider hint, Supabase Storage configuration, preferred key type and incomplete configuration without returning secrets.
- New `SUPABASE_SECRET_KEY` is preferred for server-side Storage; legacy `SUPABASE_SERVICE_ROLE_KEY` remains supported for compatibility.
- Dashboard/browser configuration still receives no elevated Supabase key.
- Capabilities expose configuration truth only; they do not claim live project reachability or SLA.

## Evidence

- `npm run test:phase17-completion` is dependency-free and covers Steam normalization/setup wiring plus Supabase profile truth.
- Existing Canon/UI/domain/fault/stress/a11y/external-AI/data-governance/audit-integrity/backup-restore gates must remain green.

## Remaining integration evidence

- Execute provider sync against real external networks and record rate-limit/outage/schema-change behavior.
- Select an explicit disposable Supabase/PostgreSQL target before migrations/advisors/storage upload tests.
- Dependency-backed typecheck/Vitest/build still requires the reviewed npm lockfile.
