import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

export interface ToolchainPolicyConfig {
  schemaVersion: number;
  nodeVersion: string;
  npmVersion: string;
  typescriptVersion: string;
  dockerImage: string;
  requiredNpmrc: Record<string, string>;
}

export interface ToolchainFinding {
  code: string;
  message: string;
  blocking: boolean;
}

export interface ToolchainPolicyReport {
  ready: boolean;
  policy: ToolchainPolicyConfig;
  runtime: { node: string; npm: string | null };
  surfaces: {
    packageManager: string | null;
    enginesNode: string | null;
    enginesNpm: string | null;
    nvmrc: string | null;
    nodeVersionFile: string | null;
    dockerMatches: number;
    workflowSetupNodeMatches: number;
    renderToolchainGuards: number;
  };
  findings: ToolchainFinding[];
}

function text(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function parseNpmrc(raw: string | null): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of (raw ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...rest] = trimmed.split('=');
    result.set(key.trim(), rest.join('=').trim());
  }
  return result;
}

function workflowFiles(root: string): string[] {
  const dir = resolve(root, '.github/workflows');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => resolve(dir, name));
}

export function evaluateToolchainPolicy(
  root = process.cwd(),
  runtime: { nodeVersion?: string; npmVersion?: string | null } = {},
): ToolchainPolicyReport {
  const policy = JSON.parse(readFileSync(resolve(root, 'config/toolchain-policy.json'), 'utf8')) as ToolchainPolicyConfig;
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
    packageManager?: string;
    engines?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const findings: ToolchainFinding[] = [];
  const fail = (code: string, message: string) => findings.push({ code, message, blocking: true });

  if (policy.schemaVersion !== 1) fail('toolchain.policy_schema', `Unsupported policy schema ${policy.schemaVersion}`);
  if (pkg.packageManager !== `npm@${policy.npmVersion}`) fail('toolchain.package_manager', `packageManager must be npm@${policy.npmVersion}`);
  if (pkg.engines?.node !== policy.nodeVersion) fail('toolchain.engines_node', `engines.node must be exactly ${policy.nodeVersion}`);
  if (pkg.engines?.npm !== policy.npmVersion) fail('toolchain.engines_npm', `engines.npm must be exactly ${policy.npmVersion}`);
  if (pkg.devDependencies?.typescript !== policy.typescriptVersion) fail('toolchain.typescript', `devDependency typescript must be exactly ${policy.typescriptVersion}`);

  const nvmrc = text(resolve(root, '.nvmrc'))?.trim() ?? null;
  const nodeVersionFile = text(resolve(root, '.node-version'))?.trim() ?? null;
  if (nvmrc !== policy.nodeVersion) fail('toolchain.nvmrc', `.nvmrc must be ${policy.nodeVersion}`);
  if (nodeVersionFile !== policy.nodeVersion) fail('toolchain.node_version_file', `.node-version must be ${policy.nodeVersion}`);

  const npmrc = parseNpmrc(text(resolve(root, '.npmrc')));
  for (const [key, expected] of Object.entries(policy.requiredNpmrc)) {
    if (npmrc.get(key) !== expected) fail('toolchain.npmrc', `.npmrc ${key} must equal ${expected}`);
  }

  const docker = text(resolve(root, 'Dockerfile')) ?? '';
  const fromLines = docker.split(/\r?\n/).filter((line) => /^\s*FROM\s+/i.test(line));
  const dockerMatches = fromLines.filter((line) => line.includes(policy.dockerImage)).length;
  if (!fromLines.length || dockerMatches !== fromLines.length) fail('toolchain.docker_image', `Every Docker stage must use ${policy.dockerImage}`);

  let workflowSetupNodeMatches = 0;
  for (const path of workflowFiles(root)) {
    const raw = text(path) ?? '';
    const lines = raw.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (!/uses:\s*actions\/setup-node@/.test(lines[index])) continue;
      const nearby = lines.slice(index + 1, index + 7).join('\n');
      const match = nearby.match(/node-version:\s*["']?([^\s"']+)/);
      if (!match) {
        fail('toolchain.workflow_node_missing', `${basename(path)} setup-node is missing node-version`);
        continue;
      }
      if (match[1] !== policy.nodeVersion) fail('toolchain.workflow_node', `${basename(path)} setup-node must use ${policy.nodeVersion}, found ${match[1]}`);
      else workflowSetupNodeMatches += 1;
    }
  }
  if (!workflowSetupNodeMatches) fail('toolchain.workflow_node_missing', 'No setup-node toolchain pin was found');

  const render = text(resolve(root, 'render.yaml')) ?? '';
  const renderBuildCommands = [...render.matchAll(/buildCommand:\s*(.+)$/gm)].map((match) => match[1].trim());
  const renderToolchainGuards = renderBuildCommands.filter((command) => command.startsWith('node scripts/toolchain-policy-gate.mjs --enforce-runtime &&')).length;
  if (!renderBuildCommands.length || renderToolchainGuards !== renderBuildCommands.length) {
    fail('toolchain.render_guard', 'Every Render buildCommand must enforce the runtime toolchain before dependency installation');
  }

  const runtimeNode = runtime.nodeVersion ?? process.versions.node;
  const runtimeNpm = runtime.npmVersion ?? null;
  if (runtimeNode !== policy.nodeVersion) fail('toolchain.runtime_node', `Runtime Node must be ${policy.nodeVersion}, found ${runtimeNode}`);
  if (runtimeNpm !== null && runtimeNpm !== policy.npmVersion) fail('toolchain.runtime_npm', `Runtime npm must be ${policy.npmVersion}, found ${runtimeNpm}`);

  return {
    ready: findings.every((item) => !item.blocking),
    policy,
    runtime: { node: runtimeNode, npm: runtimeNpm },
    surfaces: {
      packageManager: pkg.packageManager ?? null,
      enginesNode: pkg.engines?.node ?? null,
      enginesNpm: pkg.engines?.npm ?? null,
      nvmrc,
      nodeVersionFile,
      dockerMatches,
      workflowSetupNodeMatches,
      renderToolchainGuards,
    },
    findings,
  };
}
