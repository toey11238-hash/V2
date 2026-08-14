# Phase 22 - GitHub Workflow Supply-Chain Integrity

## Purpose
Phase 22 closes mutable GitHub Actions references as a release supply-chain gap. It does not promote the project to VERIFIED and does not change the remaining QA-003 blocker.

## Admission model
`config/github-actions-policy.json` is the reviewed allowlist for external workflow actions. Each action has an exact 40-character commit SHA plus a human-readable upstream version annotation. Workflow YAML must reference the exact SHA; tags, branches, expressions, unapproved actions and Docker actions fail closed.

Current reviewed action identities:
- `actions/checkout` - v4.4.0 - `11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node` - v4.4.0 - `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `actions/upload-artifact` - v4.6.2 - `ea165f8d65b6e75b540449e92b4886f43607fa02`

## Token and trigger boundary
All workflows declare explicit top-level permissions. `write-all` and `pull_request_target` are rejected by policy. Every `actions/checkout` step sets `persist-credentials: false` so the workflow token is not left in Git configuration for later dependency/test code.

## Enforcement
- `npm run test:workflow-supply-chain` checks the current repository and fails closed.
- `npm run test:phase22-workflow-supply-chain` exercises adversarial fixtures plus the real workflows.
- `packages/workflow-policy` is pure/shared policy logic consumed by both the CLI gate and `packages/release-truth`.
- `release:gate` runs workflow supply-chain enforcement before source parsing and Release Truth.
- CI/manual workflows run the source policy check as regression evidence; immutable SHAs remain the runtime control even before the check step executes.

## Evidence boundary
Action pinning proves repository workflow references are immutable and reviewed at this checkpoint. It does not prove GitHub service availability, upstream repository governance, branch protection settings, npm transitive dependencies, QA-003, or deployed DB/Discord/browser behavior.
