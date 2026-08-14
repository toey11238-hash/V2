# Supabase security profile

This project uses Supabase only as an optional zero-cost PostgreSQL/Storage provider. The dashboard does **not** need direct Data API access to platform tables.

## Database boundary

- Server-side code connects through `DATABASE_URL`.
- Migration `010_supabase_api_hardening.sql` enables RLS on application tables and revokes direct table/sequence access from Supabase `anon` and `authenticated` roles when those roles exist.
- No permissive browser RLS policies are created. Tenant authorization stays in the platform API and Discord OAuth session.
- Prefer a current `SUPABASE_SECRET_KEY` for server-side Storage/API access; legacy `SUPABASE_SERVICE_ROLE_KEY` remains compatibility-only. Do not expose either elevated key in dashboard environment variables or browser bundles.
- If a future browser-facing table is intentionally exposed, add a narrowly scoped GRANT and RLS policy in its own reviewed migration; do not relax the global boundary.

## Realtime boundary

The platform currently uses its own authenticated WebSocket event hub. If Supabase Realtime is enabled later, use private channels and topic-scoped RLS. Prefer Broadcast for high-frequency operator state rather than mirroring every PostgreSQL row change.

## Storage boundary

Generated panel assets are uploaded by server-side code. A future direct-upload flow must add explicit Storage RLS for the exact bucket/path and account for insert/select/update requirements when upsert is used.

## Authorization data

Do not use user-editable metadata for authorization. Discord guild access is resolved server-side through Discord OAuth and stored in an expiring server session. Any future Supabase Auth authorization must use trusted app metadata or server-owned membership tables.
