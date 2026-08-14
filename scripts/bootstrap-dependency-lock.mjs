import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateDependencyPolicy } from '../packages/dependency-policy/src/index.ts';

const root = process.cwd();
const replace = process.argv.includes('--replace');
const lockPath = resolve(root, 'package-lock.json');
const evidencePath = resolve(root, 'artifacts/dependency-lock-bootstrap.json');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const packagePath = resolve(root, 'package.json');
const packageBefore = readFileSync(packagePath);
const timeoutRaw = Number(process.env.DEPENDENCY_BOOTSTRAP_TIMEOUT_MS ?? '60000');
if (!Number.isInteger(timeoutRaw) || timeoutRaw < 5000 || timeoutRaw > 300000) {
  console.error('dependency-lock-bootstrap BLOCKED: DEPENDENCY_BOOTSTRAP_TIMEOUT_MS must be an integer between 5000 and 300000.');
  process.exit(2);
}
const bootstrapTimeoutMs = timeoutRaw;

if (existsSync(lockPath) && !replace) {
  console.error('dependency-lock-bootstrap BLOCKED: package-lock.json already exists; review it with the lock gate or pass --replace intentionally.');
  process.exit(2);
}
if (replace && existsSync(lockPath)) rmSync(lockPath);

const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
const result = spawnSync('npm', [
  'install',
  '--package-lock-only',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
  '--save-exact',
  '--registry=https://registry.npmjs.org/',
  '--fetch-retries=0',
  '--fetch-timeout=5000',
], { cwd: root, stdio: 'inherit', timeout: bootstrapTimeoutMs, killSignal: 'SIGTERM', env: { ...process.env, npm_config_update_notifier: 'false' } });
if (result.status !== 0 || result.error) {
  if (existsSync(lockPath)) rmSync(lockPath);
  const detail = result.error ? `${result.error.name}:${result.error.message}` : `exit ${String(result.status)}`;
  console.error(`dependency-lock-bootstrap BLOCKED: npm package-lock-only failed (${detail}); partial lock output was removed and no dependency-backed claim is created.`);
  process.exit(result.status && result.status > 0 ? result.status : 2);
}

const packageAfter = readFileSync(packagePath);
if (!packageBefore.equals(packageAfter)) {
  console.error('dependency-lock-bootstrap BLOCKED: package.json changed while generating the lockfile; inspect the diff instead of accepting it automatically.');
  process.exit(2);
}
if (!existsSync(lockPath)) {
  console.error('dependency-lock-bootstrap BLOCKED: npm returned success without producing package-lock.json.');
  process.exit(2);
}

const report = evaluateDependencyPolicy(root);
const lockBytes = readFileSync(lockPath);
const evidence = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  node: process.version,
  npm: npmVersion,
  bootstrapTimeoutMs,
  packageJsonSha256: sha(packageAfter),
  packageLockSha256: sha(lockBytes),
  policyReady: report.ready,
  lockfileVersion: report.lockfileVersion,
  directDependencyCount: report.directDependencyCount,
  packageCount: report.packageCount,
  registryHosts: report.registryHosts,
  installScriptPackages: report.installScriptPackages,
  findings: report.findings,
  lifecycleScriptsExecuted: false,
  reviewRequiredBeforeCommitOrLifecycleExecution: true,
};
mkdirSync(resolve(root, 'artifacts'), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify({ evidencePath, ...evidence }, null, 2));
if (!report.ready) process.exit(2);
