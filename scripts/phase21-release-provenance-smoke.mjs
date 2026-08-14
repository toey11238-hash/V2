import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let assertions = 0;
const ok = (value, message) => { assertions += 1; if (!value) throw new Error(message); };
const sha = (value) => createHash('sha256').update(value).digest('hex');
const root = process.cwd();
const tmp = mkdtempSync(join(tmpdir(), 'phase21-provenance-'));
const runGit = (args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8' }).trim();
const runNode = (args) => spawnSync(process.execPath, args, { cwd: tmp, encoding: 'utf8' });

try {
  mkdirSync(join(tmp, 'scripts', 'lib'), { recursive: true });
  mkdirSync(join(tmp, 'packages', 'database', 'migrations'), { recursive: true });
  mkdirSync(join(tmp, 'apps', 'dashboard', 'public', 'assets', 'panels'), { recursive: true });
  copyFileSync(join(root, 'scripts', 'release-manifest.mjs'), join(tmp, 'scripts', 'release-manifest.mjs'));
  copyFileSync(join(root, 'scripts', 'release-provenance.mjs'), join(tmp, 'scripts', 'release-provenance.mjs'));
  copyFileSync(join(root, 'scripts', 'lib', 'git-committed-tree.mjs'), join(tmp, 'scripts', 'lib', 'git-committed-tree.mjs'));

  runGit(['init', '-q']);
  runGit(['config', 'user.email', 'phase21@example.invalid']);
  runGit(['config', 'user.name', 'phase21']);

  const committed = {
    package: '{"name":"phase21-repro","version":"1.0.0","engines":{"node":">=22"}}\n',
    canon: '# canon committed\n',
    masterSpec: '# master spec committed\n',
    featureRegistry: '# feature registry committed\n',
    projectStatus: '# project status committed\n',
    migration: 'select 1;\n',
    tracked: 'committed tracked bytes\n',
    asset: 'committed asset bytes\n',
  };
  writeFileSync(join(tmp, 'package.json'), committed.package);
  writeFileSync(join(tmp, 'CANON.md'), committed.canon);
  writeFileSync(join(tmp, 'MASTER_SPEC.md'), committed.masterSpec);
  writeFileSync(join(tmp, 'FEATURE_REGISTRY.md'), committed.featureRegistry);
  writeFileSync(join(tmp, 'PROJECT_STATUS.md'), committed.projectStatus);
  writeFileSync(join(tmp, 'packages', 'database', 'migrations', '001_init.sql'), committed.migration);
  writeFileSync(join(tmp, 'tracked.txt'), committed.tracked);
  writeFileSync(join(tmp, 'apps', 'dashboard', 'public', 'assets', 'panels', 'asset.bin'), committed.asset);
  writeFileSync(
    join(tmp, 'apps', 'dashboard', 'public', 'assets', 'panels', 'manifest.json'),
    `${JSON.stringify({ assets: [{ file: 'asset.bin', sha256: sha(committed.asset) }] })}\n`,
  );
  runGit(['add', '.']);
  runGit(['commit', '-qm', 'committed evidence source']);
  const commit = runGit(['rev-parse', 'HEAD']);
  const tree = runGit(['rev-parse', 'HEAD^{tree}']);

  writeFileSync(join(tmp, 'tracked.txt'), 'DIRTY tracked bytes\n');
  writeFileSync(join(tmp, 'CANON.md'), '# DIRTY canon\n');
  writeFileSync(join(tmp, 'package.json'), '{"name":"phase21-repro","version":"9.9.9"}\n');
  writeFileSync(join(tmp, 'packages', 'database', 'migrations', '001_init.sql'), 'select 999;\n');
  writeFileSync(join(tmp, 'apps', 'dashboard', 'public', 'assets', 'panels', 'asset.bin'), 'DIRTY asset bytes\n');
  writeFileSync(join(tmp, 'untracked.txt'), 'must not enter committed evidence\n');
  writeFileSync(join(tmp, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n');

  const manifestRun = runNode(['scripts/release-manifest.mjs', '--allow-dirty', '--out', 'artifacts/manifest.json']);
  const provenanceRun = runNode(['scripts/release-provenance.mjs', '--allow-dirty', '--out', 'artifacts/provenance.json']);
  ok(manifestRun.status === 0, `manifest inspection succeeds: ${manifestRun.stderr}`);
  ok(provenanceRun.status === 0, `provenance inspection succeeds: ${provenanceRun.stderr}`);
  const manifest = JSON.parse(readFileSync(join(tmp, 'artifacts', 'manifest.json'), 'utf8'));
  const provenance = JSON.parse(readFileSync(join(tmp, 'artifacts', 'provenance.json'), 'utf8'));
  const trackedEntry = manifest.files.find((entry) => entry.path === 'tracked.txt');
  const migrationEntry = provenance.migrations.entries.find((entry) => entry.name === '001_init.sql');

  ok(manifest.schemaVersion === 2, 'manifest schema is v2 committed-tree evidence');
  ok(manifest.source?.commit === commit && manifest.source?.gitTree === tree, 'manifest binds exact commit/tree');
  ok(manifest.dirty === true && manifest.releasable === false, 'dirty inspection is never releasable');
  ok(trackedEntry?.sha256 === sha(committed.tracked), 'manifest hashes committed tracked bytes');
  ok(trackedEntry?.sha256 !== sha('DIRTY tracked bytes\n'), 'manifest ignores dirty tracked bytes');
  ok(manifest.canonSha256 === sha(committed.canon), 'manifest Canon hash comes from committed blob');
  ok(manifest.package.version === '1.0.0', 'manifest package metadata comes from committed package.json');
  ok(!manifest.files.some((entry) => entry.path === 'untracked.txt'), 'untracked files never enter committed manifest');
  ok(!manifest.files.some((entry) => entry.path === 'package-lock.json'), 'untracked lockfile never enters committed manifest');
  ok(manifest.files.every((entry) => entry.mode && entry.gitObject && entry.sha256), 'manifest records mode/object/content digest per committed blob');

  ok(provenance.schemaVersion === 2, 'provenance schema is v2 committed-tree evidence');
  ok(provenance.source?.commit === commit && provenance.source?.gitTree === tree, 'provenance binds exact commit/tree');
  ok(provenance.sources.canon.sha256 === sha(committed.canon), 'provenance source hashes use committed blobs');
  ok(migrationEntry?.sha256 === sha(committed.migration), 'migration chain hashes committed migration bytes');
  ok(provenance.panelAssets.hashFailures === 0, 'dirty asset bytes cannot corrupt committed asset verification');
  ok(provenance.dependencyEvidence.lockfile.present === false, 'untracked lockfile cannot satisfy committed dependency evidence');
  ok(provenance.blockers.includes('working-tree-dirty'), 'dirty inspection remains explicitly blocked');
  ok(provenance.blockers.includes('lockfile-missing'), 'uncommitted lockfile remains missing release evidence');

  const manifestBlocked = runNode(['scripts/release-manifest.mjs', '--out', 'artifacts/blocked-manifest.json']);
  const provenanceBlocked = runNode(['scripts/release-provenance.mjs', '--out', 'artifacts/blocked-provenance.json']);
  ok(manifestBlocked.status === 2, 'manifest fails closed on dirty tree without inspection override');
  ok(provenanceBlocked.status === 2, 'provenance fails closed on dirty tree without inspection override');

  const helperSource = readFileSync(join(root, 'scripts', 'lib', 'git-committed-tree.mjs'), 'utf8');
  ok(helperSource.includes("['cat-file', '--batch']"), 'committed tree helper reads Git blobs in batch');
  ok(helperSource.includes("['ls-tree', '-r', '-z', '--full-tree', commit]"), 'committed tree helper enumerates HEAD tree rather than filesystem');

  console.log(`phase21-release-provenance-smoke PASS · ${assertions} assertions`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
