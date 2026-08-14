import { buildReleaseTruth } from '../packages/release-truth/src/index.ts';

const enforce=process.argv.includes('--enforce');
const report=buildReleaseTruth(process.cwd());
console.log(JSON.stringify(report,null,2));
console.log(`release-readiness ${report.ready?'PASS':'BLOCKED'} · ${report.findings.length} finding(s)`);
if(enforce&&!report.ready)process.exit(2);
