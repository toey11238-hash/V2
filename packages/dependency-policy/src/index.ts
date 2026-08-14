import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface DependencyPolicyFinding {
  code: string;
  message: string;
  blocking: boolean;
}

export interface DependencyPolicyReport {
  schemaVersion: 1;
  sourcePolicyReady: boolean;
  ready: boolean;
  lockfilePresent: boolean;
  lockfileVersion: number | null;
  directDependencyCount: number;
  unpinnedDependencies: Array<{ name: string; spec: string }>;
  unsupportedDirectSpecs: Array<{ name: string; spec: string }>;
  packageCount: number;
  registryHosts: string[];
  installScriptPackages: string[];
  missingIntegrityPackages: string[];
  missingResolvedPackages: string[];
  untrustedResolvedPackages: Array<{ path: string; resolved: string }>;
  installSurfaces: Array<{ name: string; path: string; mode: 'npm-ci' | 'npm-install' | 'missing' }>;
  findings: DependencyPolicyFinding[];
}

type PackageJson = {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type LockPackage = {
  name?: string;
  version?: string;
  resolved?: string;
  integrity?: string;
  link?: boolean;
  hasInstallScript?: boolean;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type PackageLock = {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, LockPackage>;
};

const EXACT_SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const TRUSTED_REGISTRY_HOSTS = new Set(['registry.npmjs.org']);

function sortedRecord(value: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));
}

function recordsEqual(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
  return JSON.stringify(sortedRecord(a)) === JSON.stringify(sortedRecord(b));
}

function packageLabel(path: string, entry: LockPackage): string {
  return entry.name ? `${entry.name}@${entry.version ?? 'unknown'}` : path;
}

export function evaluateDependencyDocuments(pkg: PackageJson, lock: PackageLock | null): DependencyPolicyReport {
  const findings: DependencyPolicyFinding[] = [];
  const direct = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const unpinnedDependencies = Object.entries(direct)
    .filter(([, spec]) => typeof spec !== 'string' || !EXACT_SEMVER.test(spec))
    .map(([name, spec]) => ({ name, spec: String(spec) }));
  const unsupportedDirectSpecs = Object.entries(direct)
    .filter(([, spec]) => /^(?:file:|link:|git(?:\+|:)|https?:|npm:|workspace:)/i.test(String(spec)))
    .map(([name, spec]) => ({ name, spec: String(spec) }));

  for (const item of unpinnedDependencies) {
    findings.push({ code: 'dependencies.unpinned', message: `${item.name}@${item.spec} is not an exact semver pin`, blocking: true });
  }
  for (const item of unsupportedDirectSpecs) {
    findings.push({ code: 'dependencies.unsupported_source', message: `${item.name}@${item.spec} uses a non-registry direct source`, blocking: true });
  }

  const sourcePolicyReady = !findings.some((item) => item.blocking);
  if (!lock) {
    findings.push({ code: 'lockfile.missing', message: 'package-lock.json is required before dependency-backed release verification', blocking: true });
    return {
      schemaVersion: 1,
      sourcePolicyReady,
      ready: false,
      lockfilePresent: false,
      lockfileVersion: null,
      directDependencyCount: Object.keys(direct).length,
      unpinnedDependencies,
      unsupportedDirectSpecs,
      packageCount: 0,
      registryHosts: [],
      installScriptPackages: [],
      missingIntegrityPackages: [],
      missingResolvedPackages: [],
      untrustedResolvedPackages: [],
      installSurfaces: [],
      findings,
    };
  }

  if (lock.lockfileVersion !== 3) {
    findings.push({ code: 'lockfile.version', message: `lockfileVersion must be 3 for the npm 10 release profile; received ${String(lock.lockfileVersion)}`, blocking: true });
  }
  if (lock.name !== pkg.name || lock.version !== pkg.version) {
    findings.push({ code: 'lockfile.package_metadata_mismatch', message: 'package-lock root name/version does not match package.json', blocking: true });
  }

  const packages = lock.packages ?? {};
  const root = packages[''];
  if (!root) {
    findings.push({ code: 'lockfile.root_missing', message: 'package-lock packages[""] root entry is required', blocking: true });
  } else {
    if (!recordsEqual(root.dependencies, pkg.dependencies)) {
      findings.push({ code: 'lockfile.root_dependencies_mismatch', message: 'package-lock root dependencies do not exactly match package.json', blocking: true });
    }
    if (!recordsEqual(root.devDependencies, pkg.devDependencies)) {
      findings.push({ code: 'lockfile.root_dev_dependencies_mismatch', message: 'package-lock root devDependencies do not exactly match package.json', blocking: true });
    }
  }

  const registryHosts = new Set<string>();
  const installScriptPackages: string[] = [];
  const missingIntegrityPackages: string[] = [];
  const missingResolvedPackages: string[] = [];
  const untrustedResolvedPackages: Array<{ path: string; resolved: string }> = [];

  for (const [path, entry] of Object.entries(packages)) {
    if (!path || entry.link || !path.includes('node_modules/')) continue;
    const label = packageLabel(path, entry);
    if (entry.hasInstallScript) installScriptPackages.push(label);
    if (!entry.resolved) {
      missingResolvedPackages.push(label);
      continue;
    }
    let url: URL;
    try {
      url = new URL(entry.resolved);
    } catch {
      untrustedResolvedPackages.push({ path, resolved: entry.resolved });
      continue;
    }
    registryHosts.add(url.host);
    if (url.protocol !== 'https:' || !TRUSTED_REGISTRY_HOSTS.has(url.host)) {
      untrustedResolvedPackages.push({ path, resolved: entry.resolved });
    }
    if (!entry.integrity) missingIntegrityPackages.push(label);
  }

  for (const item of missingResolvedPackages) {
    findings.push({ code: 'lockfile.resolved_missing', message: `${item} has no immutable resolved artifact URL`, blocking: true });
  }
  for (const item of missingIntegrityPackages) {
    findings.push({ code: 'lockfile.integrity_missing', message: `${item} has no integrity digest`, blocking: true });
  }
  for (const item of untrustedResolvedPackages) {
    findings.push({ code: 'lockfile.registry_untrusted', message: `${item.path} resolves outside the approved HTTPS npm registry`, blocking: true });
  }

  return {
    schemaVersion: 1,
    sourcePolicyReady,
    ready: !findings.some((item) => item.blocking),
    lockfilePresent: true,
    lockfileVersion: lock.lockfileVersion ?? null,
    directDependencyCount: Object.keys(direct).length,
    unpinnedDependencies,
    unsupportedDirectSpecs,
    packageCount: Math.max(0, Object.keys(packages).length - (root ? 1 : 0)),
    registryHosts: [...registryHosts].sort(),
    installScriptPackages: [...new Set(installScriptPackages)].sort(),
    missingIntegrityPackages: [...new Set(missingIntegrityPackages)].sort(),
    missingResolvedPackages: [...new Set(missingResolvedPackages)].sort(),
    untrustedResolvedPackages,
    installSurfaces: [],
    findings,
  };
}

function installMode(text: string): 'npm-ci' | 'npm-install' | 'missing' {
  // Any unlocked install remaining on a surface wins over npm ci; mixed surfaces must not pass.
  if (/\bnpm\s+install\b/.test(text)) return 'npm-install';
  if (/\bnpm\s+ci\b/.test(text)) return 'npm-ci';
  return 'missing';
}

export function evaluateDependencyPolicy(root = process.cwd()): DependencyPolicyReport {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as PackageJson;
  const lockPath = resolve(root, 'package-lock.json');
  const lock = existsSync(lockPath) ? JSON.parse(readFileSync(lockPath, 'utf8')) as PackageLock : null;
  const report = evaluateDependencyDocuments(pkg, lock);
  const surfaces = [
    { name: 'ci.verify', path: '.github/workflows/ci.yml' },
    { name: 'docker.build-runtime', path: 'Dockerfile' },
    { name: 'render.deploy', path: 'render.yaml' },
  ].map(({ name, path }) => {
    const full = resolve(root, path);
    return { name, path, mode: existsSync(full) ? installMode(readFileSync(full, 'utf8')) : 'missing' as const };
  });
  report.installSurfaces = surfaces;
  if (report.lockfilePresent) {
    for (const surface of surfaces) {
      if (surface.mode !== 'npm-ci') {
        report.findings.push({
          code: 'install_surface.unlocked',
          message: `${surface.name} (${surface.path}) must use npm ci after the reviewed lockfile exists`,
          blocking: true,
        });
      }
    }
    report.ready = !report.findings.some((item) => item.blocking);
  }
  return report;
}
