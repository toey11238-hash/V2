import { spawnSync } from 'node:child_process';

const steps = [
  'test:toolchain-policy',
  'test:workflow-supply-chain',
  'test:phase22-workflow-supply-chain',
  'test:phase23-experience-expansion',
  'test:phase24-session-reliability-slo',
  'test:phase25-final-closure',
  'test:config-surface',
  'test:setup-surface',
  'test:phase26-final-stabilization',
  'test:phase27-visual-experience',
  'test:phase28-extreme-overhaul',
  'test:phase29-production-intelligence',
  'test:phase29-chaos-replay',
  'test:thai-presentation',
  'test:source-syntax',
  'canon:audit',
  'test:project-truth',
  'test:traceability',
  'test:external-ai',
  'test:domain-smoke',
  'test:fault-model',
  'test:stress-model',
  'test:a11y-i18n',
  'test:ui-v2',
  'test:data-governance',
  'test:audit-integrity',
  'test:backup-restore-evidence',
  'test:phase17-completion',
  'test:dependency-policy',
  'test:phase19-dependency-admission',
  'test:phase20-source-integrity',
  'test:phase21-release-provenance',
  'release:readiness',
];

const results = [];
for (const script of steps) {
  const started = Date.now();
  const run = spawnSync('npm', ['run', '--silent', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TERM: process.env.TERM || 'dumb' },
    maxBuffer: 16 * 1024 * 1024,
  });
  const durationMs = Date.now() - started;
  const stdout = run.stdout?.trim() ?? '';
  const stderr = run.stderr?.trim() ?? '';
  if (stdout) process.stdout.write(`${stdout}\n`);
  if (stderr) process.stderr.write(`${stderr}\n`);
  results.push({ script, code: run.status ?? 1, durationMs });
  if ((run.status ?? 1) !== 0) {
    console.error(`offline-release-preflight FAIL · ${script} exited ${run.status ?? 1}`);
    process.exit(run.status ?? 1);
  }
}

const totalMs = results.reduce((sum, item) => sum + item.durationMs, 0);
console.log(`offline-release-preflight SOURCE PASS · ${results.length} gate(s) · ${totalMs}ms · release truth may still be BLOCKED by external/dependency evidence`);
