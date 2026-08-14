import fs from 'node:fs';
import process from 'node:process';
import { analyzeSetupConfigurationImpact } from '../packages/control-center/src/setup-config-impact-pure.ts';

let assertions=0;
const assert=(condition,message)=>{assertions+=1;if(!condition)throw new Error(`ASSERTION_${assertions}_FAILED: ${message}`);};
const text=(file)=>fs.readFileSync(file,'utf8');
const control=text('packages/control-center/src/index.ts');
const setupState=text('apps/platform/src/runtime/setup-state.ts');
const setupWorker=text('apps/platform/src/runtime/setup-worker.ts');
const setupDiscord=text('apps/platform/src/discord/setup.ts');
const server=text('apps/platform/src/http/server.ts');
const dashboard=text('apps/dashboard/src/App.tsx');
const panels=text('packages/panels/src/index.ts');
const gaming=text('packages/gaming/src/index.ts');
const scheduled=text('apps/platform/src/runtime/scheduled-worker.ts');
const packageJson=JSON.parse(text('package.json'));

const base={
  blueprintKey:'hybrid-standard',themeKey:'command-bridge',locale:'th',timezone:'Asia/Bangkok',modulePreset:'FULL_PLATFORM',gamingPreset:'OFF',securityPreset:'ENTERPRISE',automationPreset:'SMART',motionPreset:'BALANCED',panelDensity:'COMFORTABLE',moduleOverrides:{},games:[],retentionProfile:'EXTENDED_AUDIT',approvalMode:'ENTERPRISE',backupSchedule:'DAILY',backupHourLocal:4,backupWeekday:0,resourceLocks:['CHANNEL_RULES'],admissionPreset:'CONSERVATIVE',aiProvider:'local-rules',
  integrations:{riotDataDragon:{enabled:false,locale:'th_TH',syncCadence:'WEEKLY'},githubReleases:{enabled:false,owner:'',repo:'',includePrereleases:false,syncCadence:'WEEKLY'},discordStatus:{enabled:false,syncCadence:'DAILY'},steamNews:{enabled:false,appId:570,count:10,maxLength:1200,syncCadence:'DAILY'}},
  budgets:{providerSync:{enabled:true,mode:'ENFORCE',windowSeconds:3600,maxUnits:24},analytics:{enabled:true,mode:'ENFORCE',windowSeconds:3600,maxUnits:24},backup:{enabled:true,mode:'ENFORCE',windowSeconds:86400,maxUnits:8},notificationFanout:{enabled:true,mode:'ENFORCE',windowSeconds:600,maxUnits:1000},bulkAutomation:{enabled:true,mode:'ENFORCE',windowSeconds:600,maxUnits:120}},
};
const clone=(patch={})=>structuredClone({...base,...patch});
let report=analyzeSetupConfigurationImpact(base,clone());
assert(report.level==='LOW'&&report.score===0,'no-op config change is LOW/0');
report=analyzeSetupConfigurationImpact(base,clone({securityPreset:'STANDARD'}));
assert(report.level==='CRITICAL'&&report.score>=40,'security downgrade is critical');
report=analyzeSetupConfigurationImpact(base,clone({approvalMode:'SAFE_DEFAULTS'}));
assert(report.level==='HIGH'||report.level==='CRITICAL','approval relaxation raises config risk');
report=analyzeSetupConfigurationImpact(base,clone({aiProvider:'openai-responses'}));
assert(report.score>=30&&report.approvalRecommended,'external AI opt-in is approval-recommended');
report=analyzeSetupConfigurationImpact(base,clone({backupSchedule:'OFF'}));
assert(report.score>=22,'backup disablement is material');
report=analyzeSetupConfigurationImpact(base,clone({resourceLocks:[]}));
assert(report.changedFields.includes('resourceLocks.unlock'),'resource unlock is surfaced');
const relaxed=clone();relaxed.budgets.bulkAutomation={...relaxed.budgets.bulkAutomation,mode:'OBSERVE',maxUnits:1000};
report=analyzeSetupConfigurationImpact(base,relaxed);
assert(report.changedFields.includes('budgets.bulkAutomation')&&report.score>=16,'budget relaxation is surfaced');
const cosmetic=clone({themeKey:'aurora-grid',motionPreset:'STATIC'});
report=analyzeSetupConfigurationImpact(base,cosmetic);
assert(report.level==='LOW','cosmetic-only change remains low');

assert(control.includes('SETUP_MODULE_KEYS'),'canonical setup module catalog exists');
assert(setupState.includes('loadCurrentSetupDraft'),'shared current setup reconstruction exists');
assert(setupState.includes('assertSetupModuleOverridesAllowed'),'module override validation is shared');
assert(setupState.includes('setupDraftFingerprint'),'full desired-state convergence fingerprint exists');
assert(setupState.includes('panels: panelEvidence(blueprint)'),'approval evidence binds managed panels');
assert(setupDiscord.includes('loadCurrentSetupDraft(deps.database, interaction.guild!.id, blueprintKey)'),'Discord setup session hydrates persisted state');
assert(!/openSetupSession[\s\S]{0,900}defaultSetupDraft\(blueprintKey/.test(setupDiscord),'Discord durable session does not reset from defaults');
assert(setupDiscord.includes("const { plan, blueprint, impact, configurationImpact, lockPlan } = await buildPlan"),'legacy setup scan consumes both impact reports and lock plan');
assert(setupDiscord.includes("if (action === 'preferences')")&&setupDiscord.includes('setup:preferences-modal:'),'Discord preferences button action opens and consumes its modal');
assert(setupDiscord.includes("if (action === 'review')"),'Discord full review control has consumer');
assert(setupDiscord.includes('MODULE_OVERRIDE_UNKNOWN'),'unknown Discord module override fails closed');
assert(setupDiscord.includes('steamCount')&&setupDiscord.includes('steamMaxLength'),'Steam setup preserves bounded item/length settings');
assert(setupDiscord.includes('configurationImpact'),'Discord setup preview exposes config-only risk');

assert(gaming.includes('reconcileEnabledGames'),'Gaming repository supports desired-state enable/disable reconciliation');
assert(setupWorker.includes('reconcileEnabledGames(guild.id,desiredGames)'),'setup worker reconciles games rather than add-only upsert');
assert(setupWorker.includes('for (const integrationKey of SETUP_MANAGED_INTEGRATION_KEYS)'),'enabled integrations only reconcile setup-managed providers');
assert(setupWorker.includes('for (const integration of BUILTIN_INTEGRATIONS)'),'disabling integrations module disables built-in runtime providers');
assert(setupWorker.includes("cancelPendingByType(guild.id,'ANALYTICS_DAILY')"),'setup always clears stale analytics schedule before desired scheduling');
assert(scheduled.includes("config?.enabledModules.analytics!==true"),'claimed stale analytics work rechecks module enablement');
assert(setupWorker.includes('setLocked(guild.id,mapping.logicalKey,desired)'),'resource locks reconcile both lock and unlock');
assert(setupWorker.includes('SETUP_CONFIG_VERIFY_DRIFT'),'setup fails closed if persisted subsystems do not converge');
assert(setupWorker.indexOf('const configVersion = await configs.applyBlueprint')>setupWorker.indexOf("taskType:'BACKUP_SCHEDULED'"),'guild config is committed after subsystem reconciliation, not before');
assert(setupWorker.indexOf('const persistedSetup=await loadCurrentSetupDraft')>setupWorker.indexOf('const configVersion = await configs.applyBlueprint'),'post-commit persisted-state verification runs after config commit');
assert(setupWorker.includes('assertSetupModuleOverridesAllowed(setupDraft, blueprint)'),'worker revalidates module override catalog');

assert(server.includes("app.get('/api/guilds/:guildId/setup/current'"),'Dashboard has current persisted setup endpoint');
assert(server.includes('assertSetupModuleOverridesAllowed(draft, blueprint)'),'HTTP setup preview rejects unknown module overrides');
assert(server.includes('analyzeSetupConfigurationImpact(currentSetup.draft,draft)'),'HTTP setup preview computes config-only impact');
assert(server.includes('configurationImpactLevel:preview.configurationImpact.level'),'Change Control approval evidence includes config impact');
assert(server.includes('risk=maxRisk(change.risk,impactRisk(configurationImpact.level))'),'Change Control risk takes the higher structural/config risk');
assert(server.includes('const current=await loadCurrentSetupDraft(deps.database,guildId)'),'portable/current setup uses shared reconstruction');
assert(server.includes('payload:{ setupDraft:current.draft'),'portable export includes the full reconstructed setup draft');
assert(server.includes('configurationImpact:preview.configurationImpact'),'portable preview returns config impact evidence');

assert(dashboard.includes('/setup/current'),'Dashboard hydrates current persisted setup state per selected guild');
for(const field of ['panelDensity','admissionPreset','budgets','steamNews'])assert(dashboard.includes(field),`Dashboard exposes ${field}`);
assert(dashboard.includes('configurationImpact'),'Dashboard displays configuration-impact evidence');
assert(panels.includes('ผลกระทบการตั้งค่า'),'Discord preview renders configuration-impact evidence');
assert(panels.includes('setup:preferences:'),'setup panel emits Preferences control');
assert(panels.includes('setup:review:'),'setup panel emits Review control');

assert(packageJson.scripts['test:config-surface']==='node scripts/config-surface-audit.mjs','config surface audit is script-addressable');
assert(text('scripts/config-surface-audit.mjs').includes('env-example.missing'),'config audit checks schema/example completeness');
assert(text('scripts/config-surface-audit.mjs').includes('render.secret-not-protected'),'config audit checks deployment secret handling');
assert(text('packages/config/src/index.ts').includes('optionalSecret32'),'sensitive dashboard/admin secrets have minimum-length validation');

assert(setupState.includes('SETUP_TIMEZONE_INVALID'),'shared setup semantics reject invalid IANA timezone');
assert(setupState.includes('SETUP_GITHUB_REPOSITORY_REQUIRED'),'shared setup semantics require GitHub owner/repo when enabled');
assert(setupState.includes('base: base ?? null'),'approval hash binds explicit base configuration evidence');
assert(setupState.includes('SETUP_APPROVAL_HASH_HEX_LENGTH = 24'),'setup approval identity uses a 96-bit SHA-256 prefix');
assert(!server.includes('preview.change.planHash.slice(0,16)'),'Change Control does not truncate the setup approval identity back to 64 bits');
assert(setupDiscord.includes('baseConfigVersion, baseDraftFingerprint'),'Discord setup jobs carry approval base evidence');
assert(server.includes('baseConfigVersion:preview.baseConfigVersion')&&server.includes('baseDraftFingerprint:preview.baseDraftFingerprint'),'HTTP/change-control jobs carry approval base evidence');
assert(setupWorker.includes("config version changed after approval','PLAN_CHANGED'")&&setupWorker.includes("desired state changed after approval','PLAN_CHANGED'"),'worker rejects stale approved config base before mutation');
assert(setupWorker.includes('if (await deps.jobs.isCancelled(job.jobId)) throw new JobCancelledError()')&&setupWorker.includes("locks.renew(guild.id, 'setup', lockOwner, 180)"),'worker rechecks cancellation and renews setup lease during reconciliation');
assert(setupWorker.indexOf('const configVersion = await configs.applyBlueprint')>setupWorker.indexOf('gaming.reconcileEnabledGames'),'guild config commit follows gaming desired-state reconciliation');
assert(setupWorker.indexOf('const configVersion = await configs.applyBlueprint')>setupWorker.indexOf('setLocked(guild.id,mapping.logicalKey,desired)'),'guild config commit follows resource-lock reconciliation');
assert(gaming.includes('config=guild_games.config || excluded.config'),'gaming desired-state reconcile preserves existing provider config metadata');
assert(gaming.includes('adapter_capabilities=guild_games.adapter_capabilities || excluded.adapter_capabilities'),'gaming desired-state reconcile preserves adapter capabilities');
assert(text('packages/admission-control/src/index.ts').includes('type AdmissionResult'),'admission repository imports its semantic result type');
assert(setupDiscord.includes('const { plan, blueprint, impact, configurationImpact, lockPlan } = await buildPlan'),'dry-run path explicitly binds config impact and lock plan');
assert(!/\{ plan, blueprint, impact \} = await buildPlan/.test(setupDiscord),'no legacy setup preview destructuring drops required impact/lock variables');
assert(setupWorker.includes('assertSetupDraftSemantics(setupDraft)'),'worker defense-in-depth repeats setup semantic validation');

console.log(`phase26-final-stabilization PASS · ${assertions} assertions`);
