import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { committedTreeHash, loadCommittedGitTree } from './lib/git-committed-tree.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
let outputArg = 'artifacts/release-manifest.json';
let allowDirty = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--allow-dirty') {
    allowDirty = true;
    continue;
  }
  if (arg === '--out') {
    const value = args[i + 1];
    if (!value || value.startsWith('--')) throw new Error('--out requires a file path');
    outputArg = value;
    i += 1;
    continue;
  }
  if (arg.startsWith('--out=')) {
    outputArg = arg.slice('--out='.length);
    continue;
  }
  throw new Error(`Unknown argument: ${arg}`);
}

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const snapshot = loadCommittedGitTree(root);
if (snapshot.dirty && !allowDirty) {
  console.error('release-manifest BLOCKED: working tree is dirty; commit/stash changes or pass --allow-dirty for non-release inspection only.');
  process.exit(2);
}

// Evidence is always derived from committed HEAD blobs, never working-tree bytes.
// --allow-dirty only permits inspection and keeps releasable=false; it does not
// change the source material bound into the manifest.
const entries = snapshot.entries.filter((entry) => !/(^|\/)\.env($|\.)/.test(entry.path));
const packageJson = JSON.parse(snapshot.getText('package.json'));
const canonEntry = snapshot.findEntry('CANON.md');
const packageEntry = snapshot.findEntry('package.json');
if (!canonEntry || !packageEntry) throw new Error('Committed CANON.md/package.json are required');
const migrations = entries.filter(
  (entry) => entry.path.startsWith('packages/database/migrations/') && /\/\d+.*\.sql$/.test(entry.path),
);
const manifest = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  source: { kind: 'git-commit', ref: 'HEAD', commit: snapshot.commit, gitTree: snapshot.gitTree },
  dirty: snapshot.dirty,
  releasable: !snapshot.dirty,
  package: { name: packageJson.name, version: packageJson.version, node: packageJson.engines?.node ?? null },
  treeHash: committedTreeHash(entries),
  trackedFileCount: entries.length,
  migrations: { count: migrations.length, latest: migrations.at(-1)?.path ?? null },
  canonSha256: canonEntry.sha256,
  packageSha256: packageEntry.sha256,
  files: entries,
};
const output = resolve(outputArg);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  output,
  commit: snapshot.commit,
  gitTree: snapshot.gitTree,
  dirty: snapshot.dirty,
  releasable: !snapshot.dirty,
  treeHash: manifest.treeHash,
  trackedFileCount: entries.length,
  migrations: migrations.length,
}, null, 2));
