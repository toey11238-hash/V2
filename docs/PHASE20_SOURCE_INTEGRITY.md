# Phase 20 - Source Syntax Integrity / Offline Release Preflight

Status: TESTING / source evidence only
Date: 2026-08-14

## Problem reproduced
A real syntax defect survived the earlier dependency-free source smokes in `apps/platform/src/discord/operator-actions.ts`. The legal-hold list joined rows with a single-quoted string containing two literal line breaks. TypeScript reported `TS1002`/`TS1005`, while `node --experimental-strip-types --check` returned success.

The minimal temporary correction changed only the separator to an escaped `\n\n`; TypeScript parser diagnostics disappeared, proving the fail path before the source was changed.

## Current implementation
- `scripts/source-syntax-gate.mjs` walks TypeScript-family source under `apps/`, `packages/`, `scripts/` and `tests/` and uses the TypeScript compiler API `createSourceFile(...).parseDiagnostics`.
- A deliberately malformed in-memory sentinel must produce parser diagnostics, preventing a silently non-functional parser path.
- The gate prefers the project-local `typescript` package. For offline diagnostics only, it can fall back to a global TypeScript installation discovered from the Node installation/global npm root.
- `--require-typescript` fails closed if no parser is available.
- Dependency-backed CI runs the parser gate after reviewed `npm ci` and before semantic `typecheck`.
- `release:gate` also executes the strict parser gate before Release Truth enforcement.
- `scripts/offline-release-preflight.mjs` composes the current source/pure gates and the non-enforcing readiness report into one deterministic preflight command.

## Evidence boundary
Current-host parsing uses global TypeScript 5.8.3 because the reviewed dependency graph is still unavailable. The project declares TypeScript 7.0.2 as its pinned dev dependency. Therefore this phase proves current syntax parses under the available compiler API, but it does not satisfy QA-003 or claim the project-pinned semantic compiler/build/test lane ran.

## Remaining blocker
The only non-covered feature row remains QA-003. A reviewed `package-lock.json`, project dependency install, full TypeScript typecheck, Vitest, production builds, audit and SBOM remain required before that row can advance.
