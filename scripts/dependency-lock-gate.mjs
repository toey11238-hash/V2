import { evaluateDependencyPolicy } from '../packages/dependency-policy/src/index.ts';

const enforce = process.argv.includes('--enforce');
const report = evaluateDependencyPolicy(process.cwd());
console.log(JSON.stringify(report, null, 2));
console.log(`dependency-lock-gate ${report.ready ? 'PASS' : 'BLOCKED'} · sourcePolicy=${report.sourcePolicyReady ? 'PASS' : 'BLOCKED'} · ${report.findings.length} finding(s)`);
if (enforce && !report.ready) process.exit(2);
