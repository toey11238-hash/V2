# Phase 2 Expansion - Setup Control Center, Panel Fabric and Broad Platform Workflows

Status: source implementation present; dependency-backed verification incomplete.

## What this phase adds

### Universal setup control
`/setup` still owns configuration. A durable setup draft now carries blueprint, theme, locale/timezone, module preset, Gaming preset, security preset, automation preset, motion preset and panel density into the queued setup job. This keeps the project inside the two-command Canon while allowing many systems to be configured.

### Managed Panel Fabric
The project now defines 23 stable panels. Each panel declares:
- logical panel identity;
- family;
- schema/content version;
- stable target channel key;
- static/optional animated asset;
- repair policy;
- interaction actions.

The deployment service can CREATE, UPDATE, KEEP and repair a missing managed message, and writes content hashes/version records. Orphan reconciliation and previous-version rollback remain pending.

### Generated media
Generated panel media is committed under `apps/dashboard/public/assets/panels/`. The current pack contains 32 PNG/GIF files and a hash/dimension/frame manifest. The two Command Bridge assets remain under `apps/dashboard/public/assets/`.

### Community/support workflows
Integrated Discord flows now include verification, safe self roles, notification roles, private ticket create/close, application submission, private reports and public suggestions with mutually-exclusive voting.

### Scheduled operations
A durable scheduled executor claims due tasks using PostgreSQL `FOR UPDATE SKIP LOCKED`. Current typed task handlers publish announcements, send event reminders, expire temporary roles and clean up empty temporary voice rooms. Failures are bounded/retryable and emit realtime events.

### Governance and plugins
Governance primitives now cover retention/legal holds, change-risk classification, checksummed portable configuration and secret-excluded data-export requests. Plugin manifests declare capabilities/dependencies and are rejected if they request the Discord `Administrator` permission under the default validator.

## Safety boundaries
- No new top-level slash command was added.
- No gambling/betting/wagering system exists.
- No high-risk destructive repair is silently executed.
- Scheduled work does not replace event-driven Discord Gateway handling.
- Bundled animation is optional; reduced-motion/no-GIF use remains functional.
- No feature is marked VERIFIED without executable evidence.
