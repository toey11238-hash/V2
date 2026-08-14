import { readFileSync } from 'node:fs';

let assertions = 0;
const ok = (value, message) => { assertions += 1; if (!value) throw new Error(message); };
const text = (path) => readFileSync(path, 'utf8');
const pkg = JSON.parse(text('package.json'));
const operatorActions = text('apps/platform/src/discord/operator-actions.ts');
const gate = text('scripts/source-syntax-gate.mjs');
const ci = text('.github/workflows/ci.yml');
const registry = text('FEATURE_REGISTRY.md');

ok(pkg.scripts['test:source-syntax'] === 'node scripts/source-syntax-gate.mjs --require-typescript', 'strict TypeScript parser gate registered');
ok(pkg.scripts['test:phase20-source-integrity'] === 'node scripts/phase20-source-integrity-smoke.mjs', 'Phase 20 smoke registered');
ok(pkg.scripts['test:offline-preflight'] === 'node scripts/offline-release-preflight.mjs', 'offline preflight registered');
const releaseGate = pkg.scripts['release:gate'];
ok(releaseGate.includes('npm run test:source-syntax') && releaseGate.indexOf('npm run test:source-syntax') < releaseGate.indexOf('scripts/release-readiness.mjs --enforce'), 'release gate parses source before Release Truth enforcement');
ok(operatorActions.includes(".join('\\n\\n')"), 'legal-hold output uses escaped newline separator');
ok(!operatorActions.includes(".join('\n\n')"), 'raw newline inside single-quoted join literal is absent');
ok(gate.includes("parseDiagnostics"), 'gate checks TypeScript parser diagnostics');
ok(gate.includes("__syntax_sentinel.ts"), 'gate self-tests parser behavior');
ok(gate.includes("unterminated string"), 'gate sentinel specifically covers the escaped-newline failure class');
ok(gate.includes("await import('typescript')"), 'gate prefers project-pinned TypeScript when installed');
ok(gate.includes("npm', ['root', '-g']"), 'gate can use an explicit global TypeScript fallback for offline diagnostics');
ok(gate.includes("--require-typescript"), 'gate supports fail-closed parser availability');
ok(gate.includes("SOURCE_EXTENSIONS"), 'gate scopes TypeScript-family source extensions');
ok(gate.includes("SKIP_DIRS"), 'gate excludes generated/dependency trees');
ok(ci.includes('Parse every TypeScript source file'), 'dependency-backed CI executes parser gate');
ok(ci.indexOf('Parse every TypeScript source file') < ci.indexOf('npm run typecheck'), 'parser gate runs before semantic typecheck');
ok(text('scripts/offline-release-preflight.mjs').includes("'test:source-syntax'"), 'offline preflight includes parser gate');
ok(registry.includes('| QA-022 | TypeScript parser source-integrity gate | TESTING |'), 'Phase 20 registry row exists');

console.log(`phase20-source-integrity-smoke PASS · ${assertions} assertions`);
