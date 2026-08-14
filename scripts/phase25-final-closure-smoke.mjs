import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateToolchainPolicy } from '../packages/toolchain-policy/src/index.ts';

let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };
const root = process.cwd();
const actual = evaluateToolchainPolicy(root, { nodeVersion: '22.16.0', npmVersion: '10.9.2' });
check(() => assert.equal(actual.ready, true));
check(() => assert.equal(actual.findings.length, 0));
check(() => assert.equal(actual.policy.nodeVersion, '22.16.0'));
check(() => assert.equal(actual.policy.npmVersion, '10.9.2'));
check(() => assert.equal(actual.policy.typescriptVersion, '7.0.2'));
check(() => assert.equal(actual.surfaces.dockerMatches, 2));
check(() => assert.equal(actual.surfaces.workflowSetupNodeMatches, 4));
check(() => assert.equal(actual.surfaces.renderToolchainGuards, 2));

const fixture = mkdtempSync(join(tmpdir(), 'autoserver-phase25-'));
for (const path of ['package.json','.nvmrc','.node-version','.npmrc','Dockerfile','render.yaml']) cpSync(join(root, path), join(fixture, path));
cpSync(join(root, 'config'), join(fixture, 'config'), { recursive: true });
cpSync(join(root, '.github'), join(fixture, '.github'), { recursive: true });
const evaluateFixture = (runtime = { nodeVersion: '22.16.0', npmVersion: '10.9.2' }) => evaluateToolchainPolicy(fixture, runtime);
const mutate = (path, fn) => {
  const full = join(fixture, path);
  const original = readFileSync(full, 'utf8');
  writeFileSync(full, fn(original));
  const report = evaluateFixture();
  writeFileSync(full, original);
  return report;
};
try {
  check(() => assert.ok(mutate('.nvmrc', () => '22\n').findings.some((item) => item.code === 'toolchain.nvmrc')));
  check(() => assert.ok(mutate('.node-version', () => '22.17.0\n').findings.some((item) => item.code === 'toolchain.node_version_file')));
  check(() => assert.ok(mutate('.npmrc', (value) => value.replace('engine-strict=true', 'engine-strict=false')).findings.some((item) => item.code === 'toolchain.npmrc')));
  check(() => assert.ok(mutate('Dockerfile', (value) => value.replace('node:22.16.0-bookworm-slim', 'node:22-bookworm-slim')).findings.some((item) => item.code === 'toolchain.docker_image')));
  check(() => assert.ok(mutate('render.yaml', (value) => value.replace('node scripts/toolchain-policy-gate.mjs --enforce-runtime && ', '')).findings.some((item) => item.code === 'toolchain.render_guard')));
  check(() => assert.ok(mutate('.github/workflows/ci.yml', (value) => value.replace('node-version: 22.16.0', 'node-version: 22')).findings.some((item) => item.code === 'toolchain.workflow_node')));
  check(() => assert.ok(mutate('package.json', (value) => value.replace('"packageManager": "npm@10.9.2"', '"packageManager": "npm@11.0.0"')).findings.some((item) => item.code === 'toolchain.package_manager')));
  check(() => assert.ok(mutate('package.json', (value) => value.replace('"node": "22.16.0"', '"node": ">=22"')).findings.some((item) => item.code === 'toolchain.engines_node')));
  check(() => assert.ok(mutate('package.json', (value) => value.replace('"npm": "10.9.2"', '"npm": ">=10"')).findings.some((item) => item.code === 'toolchain.engines_npm')));
  check(() => assert.ok(evaluateFixture({ nodeVersion: '22.17.0', npmVersion: '10.9.2' }).findings.some((item) => item.code === 'toolchain.runtime_node')));
  check(() => assert.ok(evaluateFixture({ nodeVersion: '22.16.0', npmVersion: '11.0.0' }).findings.some((item) => item.code === 'toolchain.runtime_npm')));
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
check(() => assert.equal(pkg.packageManager, 'npm@10.9.2'));
check(() => assert.equal(pkg.engines.node, '22.16.0'));
check(() => assert.equal(pkg.engines.npm, '10.9.2'));
check(() => assert.ok(pkg.scripts['release:gate'].startsWith('npm run test:toolchain-policy &&')));
check(() => assert.equal(pkg.scripts['final:attest'], 'node --experimental-transform-types scripts/final-source-attestation.mjs'));
const truth = readFileSync('packages/release-truth/src/index.ts', 'utf8');
check(() => assert.match(truth, /evaluateToolchainPolicy/));
check(() => assert.match(truth, /toolchainPolicy:/));
const preflight = readFileSync('scripts/offline-release-preflight.mjs', 'utf8');
check(() => assert.match(preflight, /test:toolchain-policy/));
check(() => assert.match(preflight, /test:phase25-final-closure/));
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
check(() => assert.match(ci, /node-version: 22\.16\.0/));
check(() => assert.match(ci, /npm run test:offline-preflight/));
check(() => assert.match(ci, /Verify exact runtime\/toolchain policy/));
const attestation = readFileSync('scripts/final-source-attestation.mjs', 'utf8');
check(() => assert.match(attestation, /SOURCE_ATTESTED_RELEASE_BLOCKED/));
check(() => assert.match(attestation, /not production verification/i));
check(() => assert.match(attestation, /package-lock\.json/));

console.log(`phase25-final-closure-smoke PASS · ${assertions} assertions`);
