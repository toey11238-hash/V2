# Phase 7 - Audit, Signed Inbound Integrations, Accessibility and Release Truth

Status: source integrated / dependency-backed and live verification pending.

## Audit evidence
- Guild-scoped audit query with bounded filters, cursor pagination and correlation IDs.
- Recursive redaction removes secret-bearing keys and common token shapes before dashboard display.
- Dashboard Audit Explorer exposes only redacted before/after state and remains read-only.

## Signed inbound integration
- `generic-inbound` is a built-in zero-cost adapter; it does not call an external provider.
- It requires `x-autoserver-signature`, `x-autoserver-delivery` and `x-autoserver-timestamp`.
- HMAC covers `timestamp + '.' + raw request body`; stale timestamps and replayed delivery IDs are rejected.
- Secret values remain in environment variables. Database configuration stores only the expected env reference.
- Accepted event types are namespaced as `integration.generic.*` so inbound payloads cannot impersonate internal Discord/setup/security events.
- Validated events persist to the durable event inbox before dispatch.

## Dashboard quality
- TH/EN shell locale selector updates the document language.
- Visible keyboard focus is preserved, reduced-motion remains supported, and mobile fallbacks are present.
- `test:a11y-i18n` is a static contract check, not browser accessibility E2E evidence.

## Release truth
- Script and Dashboard use the same static release evaluator.
- Missing lockfile/unreviewed `latest` dependencies continue to block promotion.
- A green source/static report would still not replace DB, Discord, restore, deployment, load, security or accessibility integration evidence.
