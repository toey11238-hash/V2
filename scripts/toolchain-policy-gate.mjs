import { spawnSync } from 'node:child_process';
import { evaluateToolchainPolicy } from '../packages/toolchain-policy/src/index.ts';

const enforce = process.argv.includes('--enforce') || process.argv.includes('--enforce-runtime');
const npm = spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 5000 });
const npmVersion = npm.status === 0 ? npm.stdout.trim() : null;
const report = evaluateToolchainPolicy(process.cwd(), { nodeVersion: process.versions.node, npmVersion });
console.log(JSON.stringify(report, null, 2));
console.log(`toolchain-policy ${report.ready ? 'PASS' : 'BLOCKED'} · node=${report.runtime.node} npm=${report.runtime.npm ?? 'UNKNOWN'} · ${report.findings.length} finding(s)`);
if (enforce && !report.ready) process.exit(2);
