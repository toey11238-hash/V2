# Phase 19 - Dependency Admission and Reproducible Lock Bootstrap

Status: SOURCE / STATIC TESTING. QA-003 remains BLOCKED until a reviewed lockfile exists and dependency-backed verification executes successfully.

## Problem closed at source level
The project already exact-pinned direct dependencies, but the remaining QA-003 path depended on a future operator remembering the correct sequence for lock generation, review, CI promotion and deployment install changes. Phase 19 turns that sequence into executable policy without fabricating a lockfile in an offline environment.

## Dependency policy
`packages/dependency-policy` and `scripts/dependency-lock-gate.mjs` enforce:
- exact direct semver pins;
- no direct file/link/git/http/npm-alias/workspace dependency source;
- npm lockfileVersion 3;
- root package/dependency parity with `package.json`;
- HTTPS `registry.npmjs.org` resolved artifacts only;
- integrity digest presence for locked external packages;
- explicit inventory of packages carrying install scripts;
- post-lock `npm ci` requirement across CI, Docker and Render install surfaces.

Install-script inventory is evidence, not automatic execution permission. A package may legitimately require a lifecycle script, but the graph must be reviewed before such scripts are allowed to run.

## Review-only bootstrap
`npm run dependency:bootstrap-lock` invokes npm with package-lock-only and ignore-scripts semantics. It also disables retry loops, bounds execution time, rejects any package.json mutation and removes partial lock output after failure. On success it writes `artifacts/dependency-lock-bootstrap.json` containing hashes, package counts, registry origins and install-script inventory. The evidence explicitly records that lifecycle scripts were not executed and review is still required.

`.github/workflows/dependency-bootstrap.yml` exposes the same process as a manual workflow and uploads only the review artifact (`package-lock.json` plus bootstrap evidence). It does not install or execute the generated dependency graph.

## Promotion boundary
After the generated lock has been reviewed and committed:
1. `npm run release:dependency-lock-gate` must pass.
2. CI installs only with `npm ci`.
3. Typecheck, Vitest, production builds, `npm audit --audit-level=high` and SBOM generation must pass.
4. Docker and Render install surfaces must be switched to `npm ci`.
5. `npm run release:readiness` must then show no dependency-policy blocker.

The evaluator intentionally adds `install_surface.unlocked` findings only after a real lockfile exists. This preserves the current no-fabrication boundary while guaranteeing that a future lockfile cannot silently coexist with deployment-time `npm install` drift.

## Current evidence
- `npm run test:dependency-policy`: PASS 28 source/pure assertions.
- `npm run test:phase19-dependency-admission`: PASS 35 source-contract assertions.
- `npm run dependency:lock-policy`: source policy PASS; release dependency policy BLOCKED only by `lockfile.missing`.
- Current network bootstrap attempt is expected to fail in this workspace because npm registry DNS is unavailable. The bounded bootstrap exits without leaving a partial `package-lock.json`.

This phase does not claim a dependency graph, package installation, advisory result, SBOM, compiler result, Vitest result or production build result.
