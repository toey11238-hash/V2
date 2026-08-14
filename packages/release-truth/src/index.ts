import { readFileSync, readdirSync } from 'node:fs';
import { evaluateCompatibility } from '../../compatibility/src/index.ts';
import { evaluateDependencyPolicy } from '../../dependency-policy/src/index.ts';
import { evaluateWorkflowSupplyChain } from '../../workflow-policy/src/index.ts';
import { evaluateToolchainPolicy } from '../../toolchain-policy/src/index.ts';

export interface ReleaseTruthReport {
  ready: boolean;
  node: string;
  packageVersion: string;
  compatibility: ReturnType<typeof evaluateCompatibility>;
  dependencyPolicy: ReturnType<typeof evaluateDependencyPolicy>;
  workflowPolicy: ReturnType<typeof evaluateWorkflowSupplyChain>;
  toolchainPolicy: ReturnType<typeof evaluateToolchainPolicy>;
  migrations: { count: number; latest: string | null; continuous: boolean };
  lockfile: boolean;
  unpinnedDependencies: Array<{ name: string; version: unknown }>;
  findings: string[];
}

export function buildReleaseTruth(root = process.cwd()): ReleaseTruthReport {
  const pkg = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as {version:string;dependencies?:Record<string,string>;devDependencies?:Record<string,string>};
  const migrations = readdirSync(`${root}/packages/database/migrations`).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
  const nums = migrations.map((name) => Number(name.match(/^(\d+)/)?.[1] ?? Number.NaN));
  const continuous = nums.every((value, index) => value === index + 1);
  const compatibility = evaluateCompatibility({nodeVersion:process.versions.node,discordJsVersion:pkg.dependencies?.['discord.js'],schemaVersion:4,panelSchemaVersion:1});
  const dependencyPolicy = evaluateDependencyPolicy(root);
  const workflowPolicy = evaluateWorkflowSupplyChain(root, `${root}/config/github-actions-policy.json`);
  const npmUserAgent = process.env.npm_config_user_agent ?? "";
  const npmVersion = npmUserAgent.match(/npm\/([^\s]+)/)?.[1] ?? null;
  const toolchainPolicy = evaluateToolchainPolicy(root, { nodeVersion: process.versions.node, npmVersion });
  const findings: string[] = [];
  if (!compatibility.compatible) findings.push(...compatibility.findings.filter((item) => item.severity === 'BLOCKING').map((item) => `${item.key}: ${item.message}`));
  findings.push(...dependencyPolicy.findings.filter((item) => item.blocking).map((item) => `${item.code}: ${item.message}`));
  findings.push(...workflowPolicy.findings.filter((item) => item.blocking).map((item) => `${item.code}: ${item.message}`));
  findings.push(...toolchainPolicy.findings.filter((item) => item.blocking).map((item) => `${item.code}: ${item.message}`));
  if (!continuous) findings.push('migrations.non_contiguous: database migration numbering is not contiguous');
  if (!migrations.length) findings.push('migrations.missing: no database migrations found');
  return {
    ready: findings.length === 0,
    node: process.versions.node,
    packageVersion: pkg.version,
    compatibility,
    dependencyPolicy,
    workflowPolicy,
    toolchainPolicy,
    migrations:{count:migrations.length,latest:migrations.at(-1)??null,continuous},
    lockfile:dependencyPolicy.lockfilePresent,
    unpinnedDependencies:dependencyPolicy.unpinnedDependencies.map(({name,spec})=>({name,version:spec})),
    findings,
  };
}
