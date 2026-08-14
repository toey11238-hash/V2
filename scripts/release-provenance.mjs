import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { committedTreeHash, loadCommittedGitTree } from './lib/git-committed-tree.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
let outputArg = 'artifacts/release-provenance.json';
let allowDirty = false;
for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--allow-dirty') { allowDirty = true; continue; }
  if (arg === '--out') { const value = args[++i]; if (!value) throw new Error('--out requires a path'); outputArg = value; continue; }
  if (arg.startsWith('--out=')) { outputArg = arg.slice(6); continue; }
  throw new Error(`Unknown argument: ${arg}`);
}

const sha = (value) => createHash('sha256').update(value).digest('hex');
const snapshot = loadCommittedGitTree(root);
if (snapshot.dirty && !allowDirty) {
  console.error('release-provenance BLOCKED: working tree is dirty. Commit/stash changes or use --allow-dirty for inspection only.');
  process.exit(2);
}

const committedOptional = (path) => {
  const entry = snapshot.findEntry(path);
  return entry ? { present: true, sha256: entry.sha256, bytes: entry.bytes, source: 'git-commit' } : { present: false, sha256: null, bytes: 0, source: 'git-commit' };
};
const generatedOptional = (path) => existsSync(resolve(root, path))
  ? { present: true, sha256: sha(readFileSync(resolve(root, path))), bytes: statSync(resolve(root, path)).size, source: 'generated-working-artifact' }
  : { present: false, sha256: null, bytes: 0, source: 'generated-working-artifact' };
const source = (path) => {
  const entry = snapshot.findEntry(path);
  if (!entry) throw new Error(`Required committed source is missing: ${path}`);
  return { path, sha256: entry.sha256 };
};

const migrationEntries = snapshot.entries
  .filter((entry) => entry.path.startsWith('packages/database/migrations/') && /^packages\/database\/migrations\/\d+.*\.sql$/.test(entry.path))
  .map((entry) => ({ name: entry.path.slice('packages/database/migrations/'.length), sha256: entry.sha256 }));
const migrationNumbers = migrationEntries.map((item) => Number(item.name.match(/^(\d+)/)?.[1] ?? Number.NaN));
const migrationsContinuous = migrationNumbers.every((value, index) => value === index + 1);

const assetManifestPath = 'apps/dashboard/public/assets/panels/manifest.json';
const assetManifest = JSON.parse(snapshot.getText(assetManifestPath));
const assetEntries = Array.isArray(assetManifest.assets) ? assetManifest.assets : [];
let assetHashFailures = 0;
for (const item of assetEntries) {
  if (!item?.file || !item?.sha256) { assetHashFailures += 1; continue; }
  const entry = snapshot.findEntry(`apps/dashboard/public/assets/panels/${item.file}`);
  if (!entry || entry.sha256 !== item.sha256) assetHashFailures += 1;
}

const evidence = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: { kind: 'git-commit', ref: 'HEAD', commit: snapshot.commit, gitTree: snapshot.gitTree, treeHash: committedTreeHash(snapshot.entries) },
  dirty: snapshot.dirty,
  inspectionOnly: snapshot.dirty,
  sources: {
    canon: source('CANON.md'),
    masterSpec: source('MASTER_SPEC.md'),
    featureRegistry: source('FEATURE_REGISTRY.md'),
    projectStatus: source('PROJECT_STATUS.md'),
    package: source('package.json'),
  },
  migrations: {
    count: migrationEntries.length,
    latest: migrationEntries.at(-1)?.name ?? null,
    continuous: migrationsContinuous,
    chainHash: sha(Buffer.from(migrationEntries.map((item) => `${item.name}:${item.sha256}`).join('\n'))),
    entries: migrationEntries,
  },
  panelAssets: { manifestPath: assetManifestPath, manifestSha256: source(assetManifestPath).sha256, count: assetEntries.length, hashFailures: assetHashFailures },
  dependencyEvidence: { lockfile: committedOptional('package-lock.json'), sbom: generatedOptional('artifacts/sbom.cdx.json') },
};
const rootMaterial = JSON.stringify({
  source: evidence.source,
  sources: evidence.sources,
  migrations: { count: evidence.migrations.count, latest: evidence.migrations.latest, chainHash: evidence.migrations.chainHash },
  panelAssets: evidence.panelAssets,
  lockfile: evidence.dependencyEvidence.lockfile.sha256,
  sbom: evidence.dependencyEvidence.sbom.sha256,
});
const blockers = [];
if (snapshot.dirty) blockers.push('working-tree-dirty');
if (!migrationsContinuous) blockers.push('migration-chain-non-contiguous');
if (assetHashFailures) blockers.push(`asset-hash-failures:${assetHashFailures}`);
if (!evidence.dependencyEvidence.lockfile.present) blockers.push('lockfile-missing');
if (!evidence.dependencyEvidence.sbom.present) blockers.push('sbom-missing');
const output = { ...evidence, provenanceRootHash: sha(Buffer.from(rootMaterial)), releasable: blockers.length === 0, blockers };
const outputPath = resolve(root, outputArg);
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ output: outputPath, commit: snapshot.commit, gitTree: snapshot.gitTree, dirty: snapshot.dirty, provenanceRootHash: output.provenanceRootHash, migrations: migrationEntries.length, panelAssets: assetEntries.length, releasable: output.releasable, blockers }, null, 2));
