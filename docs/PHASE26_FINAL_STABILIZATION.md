# Phase 26 — Final Stabilization & Configuration Truth

Status: **SOURCE / STATIC TESTING**. This phase hardens configuration ownership and closes confirmed setup/runtime defects. It does not upgrade dependency-backed or live deployment evidence.

## Goals
- Make `/setup` a true desired-state control plane rather than an add-only configurator.
- Reopen setup from persisted truth so an operator edits the current configuration instead of silently starting from defaults.
- Bind approvals to the full desired configuration and the exact base state that was previewed.
- Reconcile module-dependent runtime state in both directions: enable and disable.
- Make configuration risk visible even when Discord resource structure does not change.
- Audit every SetupDraft field and deployment environment variable for an owned validation/persistence surface.

## Confirmed defects fixed
1. Legacy setup scan referenced `impact` without binding it from the preview builder.
2. Dry-run preview referenced `lockPlan` without binding it; TypeScript semantic preflight reproduced `TS2304`.
3. New setup sessions started from defaults instead of persisted guild desired state, risking accidental reset on apply.
4. Resource locks were add-only and removed locks stayed locked.
5. Disabling integrations could leave previously enabled providers or sync tasks active.
6. Disabling/removing games could leave prior `guild_games.enabled=true` state active.
7. Gaming reconciliation could overwrite existing provider config / adapter capability metadata.
8. Disabling analytics could leave an old daily analytics task scheduled; claimed stale work did not previously re-check module state.
9. Dashboard setup began from hard-coded defaults instead of persisted guild setup state.
10. Portable setup export omitted parts of the actual durable desired state.
11. Setup approvals were previously dominated by structural resource diff and did not bind every configuration-only change.
12. Approval evidence did not bind the base config version/fingerprint, allowing a stale config-only preview to race another operator.
13. GitHub Releases could be enabled without owner/repository semantic requirements; timezone accepted strings that were not valid IANA zones.
14. Setup worker did not re-check cancellation / mutation lease at all configuration reconciliation boundaries.
15. Guild config was committed before every dependent subsystem had converged, making partial reconciliation easier to misrepresent as current desired state.
16. `AdmissionControlRepository.evaluate()` referenced `AdmissionResult` without importing its type.
17. Scheduler operational-view inference was too narrow for later item variants.
18. Workflow-policy entry typing was not explicit enough under semantic compilation without installed dependency types.

## Desired-state reconstruction
`apps/platform/src/runtime/setup-state.ts` is the shared reconstruction seam for Discord setup, Dashboard current-state loading and portable configuration export.

The reconstructed draft includes:
- blueprint, theme, locale and IANA timezone;
- module / Gaming / security / automation / motion presets;
- panel density and module overrides;
- dormant desired Gaming selections when Gaming is disabled;
- retention and approval policy;
- backup cadence/hour/weekday;
- current managed resource locks;
- Riot Data Dragon, GitHub Releases, Discord Status and Steam News public configuration;
- provider/analytics/backup/notification/bulk-automation budgets;
- admission preset and AI provider preference.

## Bidirectional reconciliation
Setup application now reconciles desired state instead of only adding state:
- managed provider enablement and integration sync schedules;
- Gaming enabled-game records;
- resource locks and unlocks;
- analytics scheduled work;
- backup scheduled work/state;
- budgets and admission policy.

Provider-specific Gaming metadata is merged rather than erased by setup-managed enablement.

## Approval and concurrency integrity
Approval identity binds:
- deterministic structural plan;
- normalized full SetupDraft;
- managed panel schema/content evidence;
- base guild config version;
- base desired-state fingerprint.

The setup approval hash uses a 24-hex-character (96-bit) SHA-256 prefix. Discord and Change Control use the same identity without re-truncating it.

After acquiring the setup mutation lock, the worker re-reads the base configuration and fails `PLAN_CHANGED` before mutation when version/fingerprint no longer match the approved preview.

## Configuration impact
Configuration-only changes are scored independently from structural Discord mutations. Examples with elevated risk include:
- security / approval / admission relaxation;
- retention reduction or backup disablement;
- external AI opt-in;
- disabling safety-relevant modules;
- resource unlocks;
- integration enable/disable;
- budget enforcement relaxation.

Change Control uses the higher of structural and configuration risk. This is approval evidence, not automatic mutation authorization.

## Convergence and worker commit marker
The worker reconciles dependent subsystems first, rechecks cancellation and setup lease, then commits `guild_configs` as the desired-state marker. It reloads the current setup state and compares a deterministic fingerprint to the approved draft. Drift fails closed with `SETUP_CONFIG_VERIFY_DRIFT` and recovery evidence.

## Configuration audits
- `npm run test:config-surface` verifies environment schema, `.env.example`, Render configuration and secret treatment.
- `npm run test:setup-surface` verifies every SetupDraft field plus integration/budget groups appear on control, reload, worker and Dashboard surfaces.
- `npm run test:phase26-final-stabilization` contains regression contracts for the confirmed defects and approval/reconciliation invariants.

## Evidence boundary
Source/parser/contracts can be proven in this workspace. QA-003 remains blocked because a reviewed `package-lock.json` and dependency-backed semantic typecheck/Vitest/build/audit/SBOM evidence do not exist. Migrations 001–053 and live Discord/DB/deployment behavior remain subject to their explicit live gates.
