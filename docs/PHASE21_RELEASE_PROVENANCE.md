# Phase 21 - Committed-Tree Release Provenance Integrity

## Purpose
Phase 21 closes an integrity defect in release evidence. Earlier `release-manifest.mjs` and `release-provenance.mjs` identified `HEAD`, but read tracked source bytes from the current filesystem. Under `--allow-dirty`, a modified tracked file could therefore change evidence hashes while the JSON still named the previous commit.

## Reproduction
A temporary Git repository was committed with `tracked.txt = committed`. The file was then changed without committing and the old manifest was executed with `--allow-dirty`. The emitted SHA-256 matched the dirty filesystem bytes, not `git show HEAD:tracked.txt`, confirming a deterministic commit/material mismatch.

## Fix
`scripts/lib/git-committed-tree.mjs` now:
- resolves the exact `HEAD` commit and tree;
- enumerates committed entries with `git ls-tree -r -z --full-tree`;
- reads blob contents from Git object storage using batched `git cat-file --batch`;
- records Git mode, blob object ID, byte count and SHA-256 for each committed blob;
- exposes committed text/buffer lookup without filesystem fallback.

`release-manifest.mjs` schema v2 binds package metadata, Canon hash, migration frontier and file inventory to those committed blobs. `release-provenance.mjs` schema v2 does the same for Canon/Spec/Registry/Status, migration chain and managed panel assets. A lockfile counts as dependency evidence only when it exists in the committed tree. Generated SBOM evidence remains separately labelled `generated-working-artifact`.

## Dirty inspection semantics
`--allow-dirty` does not make an artifact releasable. It only permits diagnostic generation while:
- `dirty=true` / `inspectionOnly=true` remains visible;
- `releasable=false` remains enforced;
- committed source hashes remain identical to `HEAD`;
- untracked files cannot enter the committed inventory.

Without `--allow-dirty`, both release scripts fail closed on a dirty tree.

## Evidence
`npm run test:phase21-release-provenance` creates an isolated repository, mutates tracked source/package/migration/panel asset files and adds an untracked lockfile, then proves the emitted evidence still binds committed bytes. Current source contract: 24 assertions PASS.

## Boundary
This is source/provenance integrity evidence only. It does not create a reviewed `package-lock.json`, satisfy QA-003, validate dependency compatibility, execute migrations, run Discord/browser E2E, or prove a production deployment.
