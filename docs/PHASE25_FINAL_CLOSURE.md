# Phase 25 - Reproducible Toolchain and Final Source Attestation

Status: SOURCE/STATIC TESTING. This phase closes source-delivery ambiguity; it does not replace dependency-backed or live integration verification.

## Reproducible toolchain contract

The source workspace declares one exact release-development toolchain contract:

- Node.js `22.16.0`
- npm `10.9.2`
- project TypeScript dependency `7.0.2`
- Docker base `node:22.16.0-bookworm-slim`

The contract is represented in `config/toolchain-policy.json` and enforced across `package.json`, `.nvmrc`, `.node-version`, `.npmrc`, Docker stages, GitHub `setup-node` steps and Render build guards. `engine-strict=true` prevents installs under a mismatched declared Node/npm runtime. Exact toolchain declarations do not create a dependency lock and do not satisfy QA-003.

`packages/toolchain-policy` is the shared evaluator consumed by `scripts/toolchain-policy-gate.mjs` and Release Truth. CI and deployment surfaces must fail closed when the runtime/toolchain drifts from the reviewed policy rather than silently accepting a different Node/npm minor or patch.

## Final source attestation

`npm run final:attest` runs the consolidated dependency-free/source preflight and writes `artifacts/final-source-attestation.json`.

The attestation binds SHA-256 evidence for:

- `CANON.md`
- `MASTER_SPEC.md`
- `FEATURE_REGISTRY.md`
- `PROJECT_STATUS.md`
- `package.json`
- `config/toolchain-policy.json`
- the ordered migration filename/content hash chain

It also records current feature coverage, migration frontier, toolchain evaluation and Release Truth blockers.

Attestation statuses are deliberately narrow:

- `SOURCE_ATTESTED_RELEASE_READY` only when the source preflight passes and Release Truth is ready;
- `SOURCE_ATTESTED_RELEASE_BLOCKED` when source preflight passes but an explicit release blocker remains;
- `SOURCE_ATTESTATION_FAILED` when the source preflight/toolchain evidence fails.

A source attestation is workspace/source evidence only. It is not a Git commit attestation when `.git` is absent, not a production deployment attestation, and not proof that PostgreSQL/Supabase/Discord/browser/live provider gates ran. Phase 21 committed-tree provenance remains the release identity mechanism when the repository Git objects are available.

## Current boundary

This checkpoint still has no reviewed `package-lock.json`. QA-003 dependency-backed typecheck/Vitest/build/audit/SBOM remains BLOCKED by BLK-001. Docker/Render therefore intentionally remain on `npm install`; after an approved lock is committed, existing Release Truth requires promotion to `npm ci` before release readiness can become true.

## CI closure

The GitHub `source-contracts` job now invokes `npm run test:offline-preflight` as the canonical source gate instead of carrying a second hand-maintained list of individual source tests. This prevents later phases from being accidentally omitted from CI while still leaving the dependency-backed `verify` job separate behind the reviewed-lock gate.
