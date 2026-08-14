import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');
const control=read('packages/control-center/src/index.ts');
const state=read('apps/platform/src/runtime/setup-state.ts');
const worker=read('apps/platform/src/runtime/setup-worker.ts');
const discord=read('apps/platform/src/discord/setup.ts');
const server=read('apps/platform/src/http/server.ts');
const dashboard=read('apps/dashboard/src/App.tsx');

const topLevel=[
  'blueprintKey','themeKey','locale','timezone','modulePreset','gamingPreset','securityPreset','automationPreset','motionPreset','panelDensity',
  'moduleOverrides','games','retentionProfile','approvalMode','backupSchedule','backupHourLocal','backupWeekday','resourceLocks','integrations','budgets','admissionPreset','aiProvider',
];
const integrations=['riotDataDragon','githubReleases','discordStatus','steamNews'];
const budgets=['providerSync','analytics','backup','notificationFanout','bulkAutomation'];
const findings=[];
const expect=(condition,code,detail)=>{if(!condition)findings.push({code,detail});};

for(const field of topLevel){
  expect(new RegExp(`\\b${field}\\b`).test(control),'setup.control.missing',field);
  expect(new RegExp(`\\b${field}\\b`).test(state),'setup.reload.missing',field);
  expect(new RegExp(`setupDraft\\.${field}\\b`).test(worker)||['blueprintKey'].includes(field),'setup.persist.missing',field);
  expect(new RegExp(`\\b${field}\\b`).test(dashboard),'setup.dashboard.missing',field);
}
for(const key of integrations){
  expect(control.includes(key),'setup.integration.control.missing',key);
  expect(state.includes(key),'setup.integration.reload.missing',key);
  expect(worker.includes(`integrations.${key}`),'setup.integration.worker.missing',key);
  expect(dashboard.includes(key),'setup.integration.dashboard.missing',key);
}
for(const key of budgets){
  expect(control.includes(key),'setup.budget.control.missing',key);
  expect(state.includes(key),'setup.budget.reload.missing',key);
  expect(worker.includes(`budgets.${key}`),'setup.budget.worker.missing',key);
  expect(dashboard.includes(key),'setup.budget.dashboard.missing',key);
}
expect(server.includes("/api/guilds/:guildId/setup/current"),'setup.current.endpoint.missing','persisted setup endpoint');
expect(server.includes('baseConfigVersion')&&server.includes('baseDraftFingerprint'),'setup.http.base-binding.missing','HTTP preview/apply base evidence');
expect(discord.includes('baseConfigVersion')&&discord.includes('baseDraftFingerprint'),'setup.discord.base-binding.missing','Discord preview/apply base evidence');
expect(worker.includes('SETUP_CONFIG_VERIFY_DRIFT'),'setup.worker.convergence.missing','post-apply convergence verification');
expect(worker.includes("PLAN_CHANGED"),'setup.worker.stale-approval.missing','stale base rejection');
expect(state.includes('assertSetupDraftSemantics'),'setup.semantic-validator.missing','shared semantic validator');

if(findings.length){
  console.error(`setup-surface-audit FAIL · findings=${findings.length}`);
  for(const finding of findings) console.error(`${finding.code}: ${finding.detail}`);
  process.exit(1);
}
console.log(`setup-surface-audit PASS · topLevel=${topLevel.length} · integrations=${integrations.length} · budgets=${budgets.length} · surfaces=control/reload/worker/dashboard`);
