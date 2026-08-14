import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildReleaseTruth } from '../packages/release-truth/src/index.ts';
import { evaluateToolchainPolicy } from '../packages/toolchain-policy/src/index.ts';

const root = process.cwd();
const sha = (value) => createHash('sha256').update(value).digest('hex');
const fileHash = (path) => sha(readFileSync(resolve(root, path)));
const run = (script) => spawnSync('npm', ['run', '--silent', script], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TERM: process.env.TERM || 'dumb' },
  maxBuffer: 32 * 1024 * 1024,
});

const preflight = run('test:offline-preflight');
if ((preflight.status ?? 1) !== 0) {
  process.stdout.write(preflight.stdout ?? '');
  process.stderr.write(preflight.stderr ?? '');
  console.error(`final-source-attestation FAIL · offline preflight exited ${preflight.status ?? 1}`);
  process.exit(preflight.status ?? 1);
}

const npm = spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 5000 });
const npmVersion = npm.status === 0 ? npm.stdout.trim() : null;
const toolchain = evaluateToolchainPolicy(root, { nodeVersion: process.versions.node, npmVersion });
const releaseTruth = buildReleaseTruth(root);
const features = readFileSync(resolve(root, 'FEATURE_REGISTRY.md'), 'utf8');
const featureRows = [...features.matchAll(/^\|\s*([A-Z]+-\d+)\s*\|.*\|\s*(PLANNED|DESIGNED|IN_PROGRESS|IMPLEMENTED|INTEGRATED|TESTING|VERIFIED|BLOCKED|DEPRECATED)\s*\|/gm)]
  .map((match) => ({ id: match[1], status: match[2] }));
const coveredStatuses = new Set(['IMPLEMENTED', 'INTEGRATED', 'TESTING', 'VERIFIED']);
const covered = featureRows.filter((row) => coveredStatuses.has(row.status)).length;
const nonCovered = featureRows.filter((row) => !coveredStatuses.has(row.status));
const migrations = readdirSync(resolve(root, 'packages/database/migrations')).filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();
const migrationChain = migrations.map((name) => `${name}:${fileHash(`packages/database/migrations/${name}`)}`).join('\n');
const sourceMaterial = {
  canon: fileHash('CANON.md'),
  masterSpec: fileHash('MASTER_SPEC.md'),
  featureRegistry: fileHash('FEATURE_REGISTRY.md'),
  projectStatus: fileHash('PROJECT_STATUS.md'),
  package: fileHash('package.json'),
  toolchainPolicy: fileHash('config/toolchain-policy.json'),
  migrationChain: sha(migrationChain),
};
const sourceRootHash = sha(JSON.stringify(sourceMaterial));
const sourceAttested = toolchain.ready && (preflight.status ?? 1) === 0;
const status = sourceAttested
  ? (releaseTruth.ready ? 'SOURCE_ATTESTED_RELEASE_READY' : 'SOURCE_ATTESTED_RELEASE_BLOCKED')
  : 'SOURCE_ATTESTATION_FAILED';
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status,
  sourceAttested,
  releaseReady: releaseTruth.ready,
  sourceRootHash,
  sourceMaterial,
  toolchain,
  featureCoverage: {
    total: featureRows.length,
    covered,
    percent: featureRows.length ? Number(((covered / featureRows.length) * 100).toFixed(3)) : 0,
    nonCovered,
  },
  migrations: { count: migrations.length, latest: migrations.at(-1) ?? null },
  releaseBlockers: releaseTruth.findings,
  limitations: [
    'Source attestation is workspace/source evidence, not production verification.',
    'Live DB/Discord/deployment evidence remains separate and must not be inferred from this artifact.',
    'A missing reviewed package-lock.json keeps dependency-backed QA and release readiness blocked.',
  ],
};
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
writeFileSync(resolve(root, 'artifacts/final-source-attestation.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ status, sourceRootHash, coverage: output.featureCoverage, migrations: output.migrations, releaseBlockers: output.releaseBlockers }, null, 2));
if (!sourceAttested) process.exit(1);
