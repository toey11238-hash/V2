import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const gate = join(root, 'scripts', 'workflow-supply-chain-gate.mjs');
const approved = JSON.parse(readFileSync(join(root, 'config', 'github-actions-policy.json'), 'utf8'));
let assertions = 0;
const ok = (value, message) => { assertions += 1; if (!value) throw new Error(message); };

function fixture(workflow, mutatePolicy) {
  const dir = mkdtempSync(join(tmpdir(), 'phase22-workflow-'));
  mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
  mkdirSync(join(dir, 'config'), { recursive: true });
  const policy = structuredClone(approved);
  mutatePolicy?.(policy);
  writeFileSync(join(dir, 'config', 'github-actions-policy.json'), `${JSON.stringify(policy, null, 2)}\n`);
  writeFileSync(join(dir, '.github', 'workflows', 'test.yml'), workflow);
  return dir;
}

function run(dir) {
  const result = spawnSync(process.execPath, ['--experimental-transform-types', gate, '--root', dir, '--json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`gate process failed unexpectedly: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

const checkout = approved.actions['actions/checkout'];
const setup = approved.actions['actions/setup-node'];
const upload = approved.actions['actions/upload-artifact'];
const safe = `name: safe\non: [push]\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@${checkout.sha} # ${checkout.version}\n        with:\n          persist-credentials: false\n      - uses: actions/setup-node@${setup.sha} # ${setup.version}\n        with:\n          node-version: 22\n      - uses: actions/upload-artifact@${upload.sha} # ${upload.version}\n        with:\n          name: x\n          path: x\n`;
const dirs = [];
try {
  let dir = fixture(safe); dirs.push(dir); let report = run(dir);
  ok(report.ready === true, 'approved full-SHA workflow passes');
  ok(report.externalUseCount === 3, 'external action count is reported');
  ok(report.findings.length === 0, 'safe fixture has no findings');

  dir = fixture(safe.replace(checkout.sha, 'v4')); dirs.push(dir); report = run(dir);
  ok(report.ready === false, 'tag-based checkout blocks');
  ok(report.findings.some((x) => x.code === 'action.unpinned'), 'tag ref emits action.unpinned');

  dir = fixture(safe.replace(setup.sha, '0'.repeat(40))); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'action.digest-drift'), 'wrong approved action SHA blocks');

  dir = fixture(safe.replace(`actions/setup-node@${setup.sha} # ${setup.version}`, `evil/example@${setup.sha} # v1.0.0`)); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'action.unapproved'), 'unknown external action blocks even when SHA-pinned');

  dir = fixture(safe.replace(` # ${upload.version}`, '')); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'action.version-comment'), 'missing human review version annotation blocks');

  dir = fixture(safe.replace('          persist-credentials: false\n', '')); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'checkout.credentials-persist'), 'checkout token persistence blocks');

  dir = fixture(safe.replace('permissions:\n  contents: read\n', '')); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'workflow.permissions-missing'), 'missing explicit permissions blocks');

  dir = fixture(safe.replace('permissions:\n  contents: read', 'permissions: write-all')); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'workflow.write-all'), 'write-all permissions block');

  dir = fixture(safe.replace('on: [push]', 'on:\n  pull_request_target:')); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'workflow.pull-request-target'), 'pull_request_target blocks by default');

  dir = fixture(safe.replace(`actions/upload-artifact@${upload.sha} # ${upload.version}`, 'docker://alpine:3.20')); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'action.docker-unapproved'), 'unreviewed docker action blocks');

  const local = safe.replace(`      - uses: actions/upload-artifact@${upload.sha} # ${upload.version}\n        with:\n          name: x\n          path: x\n`, '      - uses: ./actions/local\n');
  dir = fixture(local); dirs.push(dir); report = run(dir);
  ok(report.ready === true, 'repository-local action is allowed');
  ok(report.localUseCount === 1, 'local action count is reported');

  dir = fixture(safe, (policy) => { policy.actions['actions/checkout'].sha = 'abc'; }); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'policy.sha-invalid'), 'invalid policy SHA blocks');

  dir = fixture(safe, (policy) => { policy.actions['actions/setup-node'].version = 'latest'; }); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'policy.version-invalid'), 'invalid policy version annotation blocks');

  dir = fixture(safe.replace(setup.sha, '${{ github.sha }}')); dirs.push(dir); report = run(dir);
  ok(report.findings.some((x) => x.code === 'action.dynamic-ref'), 'expression action ref blocks explicitly');

  const actual = spawnSync(process.execPath, ['--experimental-transform-types', gate, '--root', root, '--json'], { encoding: 'utf8' });
  ok(actual.status === 0, 'actual repository gate executes');
  const actualReport = JSON.parse(actual.stdout);
  ok(actualReport.ready === true, 'actual workflows satisfy Phase 22 policy');
  ok(actualReport.workflowCount === 3, 'actual workflow inventory is three files');
  ok(actualReport.externalUseCount === 9, 'actual workflow inventory has nine external uses');
  ok(actualReport.approvedActions.length === 3, 'approved action allowlist has three actions');
  ok(actualReport.findings.length === 0, 'actual workflow policy has zero findings');

  console.log(`phase22-workflow-supply-chain-smoke PASS · ${assertions} assertions`);
} finally {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}
