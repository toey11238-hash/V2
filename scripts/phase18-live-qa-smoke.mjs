import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

let assertions=0;
function ok(condition,message){assertions+=1;if(!condition)throw new Error(`PHASE18_LIVE_QA_ASSERTION_FAILED:${message}`);}

const [httpGate,browserGate,dbGate,discordGate,workflow,packageJson]=await Promise.all([
  readFile('scripts/live-http-gate.mjs','utf8'),
  readFile('scripts/live-browser-gate.mjs','utf8'),
  readFile('scripts/live-db-gate.ts','utf8'),
  readFile('scripts/live-discord-gate.ts','utf8'),
  readFile('.github/workflows/live-verification.yml','utf8'),
  readFile('package.json','utf8').then(JSON.parse),
]);

ok(httpGate.includes("ALLOW_HTTP_LIVE_GATE==='1'"),'HTTP live gate must require explicit opt-in');
ok(httpGate.includes('LIVE_HTTP_GATE_REQUIRES_HTTPS_OR_LOCALHOST'),'HTTP target must be HTTPS or localhost');
ok(httpGate.includes("['/live','/ready','/health']"),'HTTP liveness/readiness/health probes missing');
ok(httpGate.includes('SECURITY_HEADER_MISSING_OR_INVALID'),'security-header enforcement missing');
ok(httpGate.includes('UNAUTHENTICATED_MUTATION_NOT_REJECTED'),'unauthenticated mutation rejection missing');
ok(httpGate.includes('MALFORMED_REQUEST_TRIGGERED_SERVER_ERROR'),'malformed request 5xx guard missing');
ok(httpGate.includes('HTTP_LOAD_REQUESTS'),'bounded load configuration missing');
ok(httpGate.includes('HTTP_LOAD_MAX_ERROR_RATE'),'load error-rate threshold missing');
ok(httpGate.includes('HTTP_LOAD_MAX_P95_MS'),'load latency threshold missing');
ok(httpGate.includes('HTTP_SOAK_SECONDS'),'bounded soak configuration missing');
ok(httpGate.includes('CLIENT_ABORT_PROBE_DID_NOT_ABORT'),'client-abort fault probe missing');

ok(browserGate.includes("ALLOW_BROWSER_LIVE_GATE!=='1'"),'browser live gate must require explicit opt-in');
ok(browserGate.includes('LIVE_BROWSER_GATE_REQUIRES_HTTPS_OR_LOCALHOST'),'browser target must be HTTPS or localhost');
ok(browserGate.includes("'--remote-debugging-port=0'"),'Chromium CDP launch missing');
ok(browserGate.includes('prefers-reduced-motion'),'reduced-motion emulation missing');
ok(browserGate.includes('BROWSER_DESKTOP_HORIZONTAL_OVERFLOW'),'desktop overflow guard missing');
ok(browserGate.includes('BROWSER_MOBILE_HORIZONTAL_OVERFLOW'),'mobile overflow guard missing');
ok(browserGate.includes('Accessibility.getFullAXTree'),'AX-tree check missing');
ok(browserGate.includes('BROWSER_AX_UNNAMED_INTERACTIVE'),'unnamed interactive AX guard missing');
ok(browserGate.includes('BROWSER_MIXED_CONTENT'),'mixed-content guard missing');
ok(browserGate.includes('BROWSER_RUNTIME_EXCEPTIONS'),'runtime exception guard missing');
ok(browserGate.includes('Page.setDocumentContent'),'policy-independent CDP self-test path missing');

ok(dbGate.includes("ALLOW_TEST_DATABASE!=='1'"),'DB gate must require explicit opt-in');
ok(dbGate.includes("TEST_DATABASE_LABEL!=='DISPOSABLE'"),'DB gate must require DISPOSABLE label');
ok(dbGate.includes('MIGRATION_SET_MISMATCH'),'DB gate must require exact migration set');
ok(dbGate.includes('RLS_MISSING_ON_'),'DB RLS gate missing');
ok(dbGate.includes('PLUGIN_SANDBOX_ISOLATION_EVIDENCE_NOT_PERSISTED'),'DB plugin isolation evidence probe missing');
ok(dbGate.includes('PLUGIN_SANDBOX_ISOLATION_CONSTRAINT_NOT_ENFORCED'),'DB plugin isolation constraint probe missing');
ok(discordGate.includes("ALLOW_DISCORD_TEST_GUILD!=='1'"),'Discord gate must require explicit opt-in');
ok(discordGate.includes('DISCORD_TEST_MUTATIONS'),'Discord mutations must require separate opt-in');
ok(discordGate.includes('Auto Server integration gate cleanup'),'Discord mutation cleanup path missing');

ok(workflow.includes('workflow_dispatch:'),'live verification must remain manual dispatch');
ok(workflow.includes('run_http_gate:'),'HTTP gate workflow input missing');
ok(workflow.includes('run_browser_gate:'),'browser gate workflow input missing');
ok(workflow.includes('npm ci --ignore-scripts --no-audit --no-fund'),'dependency-backed live gates must use npm ci');
ok(!workflow.includes('run: npm install '),'live workflow must not resolve a fresh dependency graph');
ok(packageJson.scripts['test:live-http-self']==='node scripts/live-http-gate.mjs --self-test','HTTP self-test script missing');
ok(packageJson.scripts['test:live-browser-self']==='node scripts/live-browser-gate.mjs --self-test','browser self-test script missing');

const http=spawnSync(process.execPath,['scripts/live-http-gate.mjs','--self-test'],{encoding:'utf8',timeout:20_000});
ok(http.status===0,`HTTP harness self-test failed: ${http.stderr.slice(-500)}`);
const httpEvidence=JSON.parse(http.stdout);
ok(httpEvidence.ok===true,'HTTP self-test evidence not ok');
ok(httpEvidence.evidence.load.errors===0,'HTTP self-test load errors');
ok(httpEvidence.evidence.aborts.clientAbortObserved===true,'HTTP self-test abort not observed');
ok(httpEvidence.evidence.soak?.seconds===1,'HTTP self-test soak path not exercised');

const browser=spawnSync(process.execPath,['scripts/live-browser-gate.mjs','--self-test'],{encoding:'utf8',timeout:20_000});
ok(browser.status===0,`browser harness self-test failed: ${browser.stderr.slice(-500)}`);
const browserEvidence=JSON.parse(browser.stdout);
ok(browserEvidence.ok===true,'browser self-test evidence not ok');
ok(browserEvidence.evidence.desktop.h1===1&&browserEvidence.evidence.desktop.main===1,'browser landmark evidence invalid');
ok(browserEvidence.evidence.mobile.horizontalOverflow===false,'browser mobile self-test overflow');
ok(browserEvidence.evidence.accessibility.unnamedInteractive===0,'browser AX self-test unnamed interactive');
ok(browserEvidence.evidence.runtime.exceptions===0&&browserEvidence.evidence.runtime.logErrors===0,'browser runtime self-test errors');

console.log(`phase18-live-qa-smoke PASS · ${assertions} assertions · HTTP/CDP self-tests executed`);
