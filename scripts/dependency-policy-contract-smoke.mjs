import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evaluateDependencyDocuments, evaluateDependencyPolicy } from '../packages/dependency-policy/src/index.ts';

let assertions = 0;
const ok = (value, message) => { assertions += 1; if (!value) throw new Error(message); };
const finding = (report, code) => report.findings.some((item) => item.code === code);
const pkg = {
  name: 'fixture',
  version: '1.0.0',
  dependencies: { alpha: '1.2.3' },
  devDependencies: { beta: '4.5.6' },
};
const goodLock = {
  name: 'fixture',
  version: '1.0.0',
  lockfileVersion: 3,
  packages: {
    '': { name: 'fixture', version: '1.0.0', dependencies: { alpha: '1.2.3' }, devDependencies: { beta: '4.5.6' } },
    'node_modules/alpha': { name: 'alpha', version: '1.2.3', resolved: 'https://registry.npmjs.org/alpha/-/alpha-1.2.3.tgz', integrity: 'sha512-AAA=' },
    'node_modules/beta': { name: 'beta', version: '4.5.6', resolved: 'https://registry.npmjs.org/beta/-/beta-4.5.6.tgz', integrity: 'sha512-BBB=', hasInstallScript: true },
  },
};

const missing = evaluateDependencyDocuments(pkg, null);
ok(missing.sourcePolicyReady, 'exact direct pins satisfy source policy');
ok(!missing.ready, 'missing lock is not release-ready');
ok(finding(missing, 'lockfile.missing'), 'missing lock is explicit');
ok(missing.directDependencyCount === 2, 'direct dependency count is deterministic');

const good = evaluateDependencyDocuments(pkg, goodLock);
ok(good.ready, 'valid npm v3 lock passes');
ok(good.packageCount === 2, 'lock package count excludes root');
ok(good.registryHosts.length === 1 && good.registryHosts[0] === 'registry.npmjs.org', 'approved registry host recorded');
ok(good.installScriptPackages.length === 1 && good.installScriptPackages[0].startsWith('beta@'), 'install scripts are inventory evidence, not silently executed');
ok(good.missingIntegrityPackages.length === 0, 'integrity complete');
ok(good.untrustedResolvedPackages.length === 0, 'trusted registry only');

const ranged = evaluateDependencyDocuments({ ...pkg, dependencies: { alpha: '^1.2.3' } }, null);
ok(!ranged.sourcePolicyReady, 'semver ranges are blocked');
ok(finding(ranged, 'dependencies.unpinned'), 'unpinned finding emitted');

const directUrl = evaluateDependencyDocuments({ ...pkg, dependencies: { alpha: 'https://example.com/alpha.tgz' } }, null);
ok(finding(directUrl, 'dependencies.unsupported_source'), 'direct URL specs are blocked');

const stale = structuredClone(goodLock);
stale.packages[''].dependencies.alpha = '1.2.2';
const staleReport = evaluateDependencyDocuments(pkg, stale);
ok(!staleReport.ready, 'stale root lock is blocked');
ok(finding(staleReport, 'lockfile.root_dependencies_mismatch'), 'root dependency drift identified');

const oldVersion = structuredClone(goodLock);
oldVersion.lockfileVersion = 2;
const oldVersionReport = evaluateDependencyDocuments(pkg, oldVersion);
ok(finding(oldVersionReport, 'lockfile.version'), 'unexpected lockfile version blocked');

const badRegistry = structuredClone(goodLock);
badRegistry.packages['node_modules/alpha'].resolved = 'https://example.com/alpha-1.2.3.tgz';
const badRegistryReport = evaluateDependencyDocuments(pkg, badRegistry);
ok(finding(badRegistryReport, 'lockfile.registry_untrusted'), 'unapproved registry blocked');

const noIntegrity = structuredClone(goodLock);
delete noIntegrity.packages['node_modules/alpha'].integrity;
const noIntegrityReport = evaluateDependencyDocuments(pkg, noIntegrity);
ok(finding(noIntegrityReport, 'lockfile.integrity_missing'), 'missing integrity blocked');

const noResolved = structuredClone(goodLock);
delete noResolved.packages['node_modules/alpha'].resolved;
const noResolvedReport = evaluateDependencyDocuments(pkg, noResolved);
ok(finding(noResolvedReport, 'lockfile.resolved_missing'), 'missing resolved URL blocked');

const metadataDrift = structuredClone(goodLock);
metadataDrift.version = '2.0.0';
const metadataReport = evaluateDependencyDocuments(pkg, metadataDrift);
ok(finding(metadataReport, 'lockfile.package_metadata_mismatch'), 'lock metadata drift blocked');

const missingRoot = structuredClone(goodLock);
delete missingRoot.packages[''];
const missingRootReport = evaluateDependencyDocuments(pkg, missingRoot);
ok(finding(missingRootReport, 'lockfile.root_missing'), 'missing lock root blocked');


const temp = mkdtempSync(join(tmpdir(), 'dependency-policy-'));
try {
  mkdirSync(join(temp, '.github/workflows'), { recursive: true });
  writeFileSync(join(temp, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(temp, 'package-lock.json'), JSON.stringify(goodLock));
  writeFileSync(join(temp, '.github/workflows/ci.yml'), 'run: npm ci\n');
  writeFileSync(join(temp, 'Dockerfile'), 'RUN npm install --no-audit\n');
  writeFileSync(join(temp, 'render.yaml'), 'buildCommand: npm install --no-audit && npm run build\n');
  const unlocked = evaluateDependencyPolicy(temp);
  ok(!unlocked.ready, 'reviewed lock still requires locked deployment install surfaces');
  ok(unlocked.installSurfaces.filter((item) => item.mode === 'npm-install').length === 2, 'unlocked deployment surfaces are inventoried');
  ok(unlocked.findings.filter((item) => item.code === 'install_surface.unlocked').length === 2, 'unlocked install surfaces become release blockers after lock exists');
  writeFileSync(join(temp, 'Dockerfile'), 'RUN npm ci --no-audit\n');
  writeFileSync(join(temp, 'render.yaml'), 'buildCommand: npm ci --no-audit && npm run build\n');
  const locked = evaluateDependencyPolicy(temp);
  ok(locked.ready, 'all locked install surfaces pass after reviewed lock exists');
  ok(locked.installSurfaces.every((item) => item.mode === 'npm-ci'), 'all install surfaces report npm-ci');
  writeFileSync(join(temp, 'Dockerfile'), 'RUN npm ci --no-audit\n# stale fallback must still block\nRUN npm install --omit=dev\n');
  const mixed = evaluateDependencyPolicy(temp);
  ok(!mixed.ready, 'mixed npm-ci/npm-install surface fails closed');
  ok(mixed.installSurfaces.find((item) => item.name === 'docker.build-runtime')?.mode === 'npm-install', 'unlocked install takes precedence on mixed surface');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

console.log(`dependency-policy-contract-smoke PASS · ${assertions} assertions`);
