import { resolve } from 'node:path';
import { evaluateWorkflowSupplyChain } from '../packages/workflow-policy/src/index.ts';

function parseArgs(argv) {
  const out = { root: process.cwd(), policy: 'config/github-actions-policy.json', enforce: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--enforce') { out.enforce = true; continue; }
    if (arg === '--json') { out.json = true; continue; }
    if (arg === '--root') { out.root = argv[++i]; if (!out.root) throw new Error('--root requires a path'); continue; }
    if (arg.startsWith('--root=')) { out.root = arg.slice(7); continue; }
    if (arg === '--policy') { out.policy = argv[++i]; if (!out.policy) throw new Error('--policy requires a path'); continue; }
    if (arg.startsWith('--policy=')) { out.policy = arg.slice(9); continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }
  out.root = resolve(out.root);
  out.policy = resolve(out.root, out.policy);
  return out;
}

const options = parseArgs(process.argv.slice(2));
const report = evaluateWorkflowSupplyChain(options.root, options.policy);
if (options.json) console.log(JSON.stringify(report, null, 2));
else {
  for (const finding of report.findings) console.error(`${finding.code} ${finding.path}${finding.line ? `:${finding.line}` : ''} · ${finding.message}`);
  console.log(`workflow-supply-chain-gate ${report.ready ? 'PASS' : 'BLOCKED'} · workflows=${report.workflowCount} · externalUses=${report.externalUseCount} · approved=${report.approvedActions.length} · findings=${report.findings.length}`);
}
if (options.enforce && !report.ready) process.exit(2);
