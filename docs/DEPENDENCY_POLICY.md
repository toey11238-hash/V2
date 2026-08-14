# Dependency Reproducibility and Admission Policy

Status: SOURCE POLICY PASS / RELEASE BLOCKED until a reviewed `package-lock.json` exists and QA-003 runs.

## Current state
Direct dependency versions are exact-pinned. The current execution environment still cannot resolve `registry.npmjs.org`, so no real transitive lock has been generated or reviewed here. The project must not fabricate one.

Phase 19 adds executable admission controls so the remaining path is deterministic rather than operator-memory dependent.

## Admission rules
A release dependency graph must satisfy all of the following:
1. Direct dependency specs are exact semver; file/link/git/http/npm-alias/workspace direct sources are rejected.
2. `package-lock.json` uses lockfileVersion 3.
3. Lock root name/version and dependency/devDependency maps exactly match `package.json`.
4. External locked packages resolve via HTTPS `registry.npmjs.org` and include integrity digests.
5. Packages marked `hasInstallScript` are inventoried for review before lifecycle execution.
6. After the reviewed lock exists, CI, Docker and Render installation surfaces all use `npm ci`.

## First network-capable bootstrap
Use either:

```bash
npm run dependency:bootstrap-lock
```

or the manual `dependency-lock-bootstrap` GitHub workflow.

The bootstrap uses package-lock-only + ignore-scripts semantics, disables fetch retries, has a bounded process timeout, requires `package.json` to remain byte-identical and removes partial lock output on failure. On success it writes `artifacts/dependency-lock-bootstrap.json` with package/lock hashes, package counts, registry hosts and install-script inventory.

The generated lock is **review-only**. Do not run lifecycle scripts or treat it as approved until the transitive graph and evidence are reviewed.

## Review and promotion sequence
1. Review `package-lock.json` plus `artifacts/dependency-lock-bootstrap.json`.
2. Commit the approved `package-lock.json`.
3. Run `npm run release:dependency-lock-gate`.
4. Promote Docker and Render installation surfaces to `npm ci`.
5. Run `npm ci`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high` and `npm run release:sbom`.
6. Re-run `npm run release:readiness` and record the evidence in `TEST_REGISTRY.md` / `CHANGELOG.md`.

## Policy boundaries
- Never fabricate or hand-author a transitive lockfile.
- Exact top-level pins do not prove transitive reproducibility.
- A package having an install script is review evidence, not automatic rejection or automatic trust.
- Secrets/tokens must never appear in package metadata, lockfiles, npm config committed to Git or build logs.
- Major dependency upgrades require changelog review, staging/test-guild verification and applicable regression tests.
