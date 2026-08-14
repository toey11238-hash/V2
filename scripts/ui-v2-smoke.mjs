import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { blueprintCatalog } from '../packages/blueprints/src/index.ts';
import { blueprintForSetupDraft, defaultSetupDraft } from '../packages/control-center/src/index.ts';

const root = process.cwd();

function readTsTree(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...readTsTree(full));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(full);
  }
  return files;
}

const panelSource = fs.readFileSync(path.join(root, 'packages/panels/src/index.ts'), 'utf8');
const dashboardSource = fs.readFileSync(path.join(root, 'apps/dashboard/src/App.tsx'), 'utf8');
const controlSource = fs.readFileSync(path.join(root, 'packages/control-center/src/index.ts'), 'utf8');
const setupInteractionSource = fs.readFileSync(path.join(root, 'apps/platform/src/discord/setup.ts'), 'utf8');
const memberPanelActionSource = fs.readFileSync(path.join(root, 'apps/platform/src/discord/panel-actions.ts'), 'utf8');

const runtimeIndexSource = fs.readFileSync(path.join(root, 'apps/platform/src/index.ts'), 'utf8');
const automationWorkerSource = fs.readFileSync(path.join(root, 'apps/platform/src/runtime/automation-worker.ts'), 'utf8');
const automationSource = fs.readFileSync(path.join(root, 'packages/automation/src/index.ts'), 'utf8');
const budgetSource = fs.readFileSync(path.join(root, 'packages/budgets/src/index.ts'), 'utf8');
const admissionSource = fs.readFileSync(path.join(root, 'packages/admission-control/src/index.ts'), 'utf8');
const admissionPureSource = fs.readFileSync(path.join(root, 'packages/admission-control/src/pure.ts'), 'utf8');
const serverSource = fs.readFileSync(path.join(root, 'apps/platform/src/http/server.ts'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'apps/dashboard/public/assets/panels/manifest.json'), 'utf8'));

const requiredFabricKeys = [
  'CAT_COMMUNITY_PROGRAMS','CAT_KNOWLEDGE','CAT_MEMBER_SERVICES','CAT_PARTNERSHIPS','CAT_DISCOVERY','CAT_MEMBER_CARE','CAT_PROJECT_LAB','CAT_EVENT_STUDIO','CAT_CONTENT_STUDIO','CAT_TRUST_CENTER','CAT_AUTOMATION_LAB','CAT_DATA_OBSERVATORY','CAT_RELEASE_OPS','CAT_KNOWLEDGE_OPS','CAT_MEMBER_OPS','CAT_RELIABILITY_OPS','CAT_VISUAL_EXPERIENCE','CH_THEME_STUDIO','CH_ASSET_GALLERY','CH_ROLE_GALLERY','CH_SERVER_PULSE','CH_SCENE_PRESETS','VC_VISUAL_PREVIEW','ROLE_VISUAL_CURATOR','CH_VOICE_CENTER',
];
const hybrid = blueprintCatalog.get('hybrid-standard');
const omni = blueprintCatalog.get('omni-premium');
assert(hybrid && omni, 'hybrid-standard and omni-premium blueprints must exist');
for (const blueprint of blueprintCatalog.values()) {
  const keys = blueprint.resources.map((resource) => resource.logicalKey);
  assert.equal(new Set(keys).size, keys.length, `${blueprint.key} contains duplicate logical resource keys`);
}
for (const key of requiredFabricKeys) assert(omni.resources.some((resource) => resource.logicalKey === key), `omni-premium missing ${key}`);
assert(hybrid.resources.some((resource) => resource.logicalKey === 'CAT_KNOWLEDGE'), 'hybrid-standard must include non-gaming knowledge fabric');
assert(hybrid.resources.some((resource) => resource.logicalKey === 'CAT_MEMBER_SERVICES'), 'hybrid-standard must include member services');
assert(omni.resources.filter((resource) => resource.kind === 'ROLE').length >= 70, 'omni-premium role taxonomy unexpectedly shrank');
for (const resource of omni.resources.filter((resource) => resource.kind === 'ROLE')) {
  assert(resource.role && Number.isInteger(resource.role.color), `role visual color missing for ${resource.logicalKey}`);
  assert.equal(resource.role.mentionable, false, `managed role must be non-mentionable by default: ${resource.logicalKey}`);
}
assert(omni.resources.filter((resource) => resource.kind === 'CATEGORY').length >= 35, 'omni-premium category topology unexpectedly shrank');
for (const blueprint of blueprintCatalog.values()) {
  const missingModules = [...new Set(blueprint.resources.map((resource) => resource.module).filter((module) => !blueprint.enabledModules.includes(module)))];
  assert.deepEqual(missingModules, [], `${blueprint.key} has resources whose module is absent from enabledModules: ${missingModules.join(', ')}`);
  const channelCount = blueprint.resources.filter((resource) => resource.kind !== 'ROLE').length;
  const roleCount = blueprint.resources.filter((resource) => resource.kind === 'ROLE').length;
  assert(channelCount <= 450, `${blueprint.key} exceeds safe channel/category headroom: ${channelCount}`);
  assert(roleCount <= 200, `${blueprint.key} exceeds safe managed-role headroom: ${roleCount}`);
}
const defaultHybrid = blueprintForSetupDraft(hybrid, defaultSetupDraft('hybrid-standard'));
assert.equal(defaultHybrid.resources.length, hybrid.resources.length, 'default /setup draft must not silently filter blueprint resources');
for (const resource of hybrid.resources) assert(defaultHybrid.resources.some((candidate) => candidate.logicalKey === resource.logicalKey), `default /setup draft dropped ${resource.logicalKey}`);

const panelDefinitionCount = (panelSource.match(/panelId: 'PANEL_/g) ?? []).length;
assert.equal(panelDefinitionCount, 87, `managed panel catalog count drifted: ${panelDefinitionCount}`);
assert(panelSource.includes('MessageFlags.IsComponentsV2'), 'managed panel renderer must set Components V2 flag');
assert(panelSource.includes('new ContainerBuilder()'), 'managed panel renderer must use ContainerBuilder');
assert(panelSource.includes('new TextDisplayBuilder()'), 'managed panel renderer must use TextDisplayBuilder');
assert(panelSource.includes('new MediaGalleryBuilder('), 'managed panel renderer must use MediaGalleryBuilder');
assert(panelSource.includes("targetChannelKey: 'CH_VOICE_CENTER', title: 'เลานจ์เสียง'"), 'voice panel must target a text control channel');
assert(!panelSource.includes("targetChannelKey: 'VC_GENERAL', title: 'เลานจ์เสียง'"), 'voice panel must not target a voice channel');
const allBlueprintKeys = new Set([...blueprintCatalog.values()].flatMap((blueprint) => blueprint.resources.map((resource) => resource.logicalKey)));
const panelTargets = [...panelSource.matchAll(/targetChannelKey:\s*'([^']+)'/g)].map((match) => match[1]);
assert.equal(panelTargets.length, panelDefinitionCount, 'every managed panel must declare exactly one target channel');
for (const target of panelTargets) assert(allBlueprintKeys.has(target), `managed panel target is absent from blueprint catalog: ${target}`);
assert(panelSource.includes('หน้าจอรุ่น 2 · /setup ตั้งค่าทุกระบบ'), '/setup control surface must advertise the Thai V2 contract');
assert(!setupInteractionSource.includes('new EmbedBuilder'), '/setup interaction responses must not regress to legacy embeds');
assert(!/interaction\.(reply|editReply)\(\{[^\n]*embeds:/.test(setupInteractionSource), '/setup reply/edit paths must remain Components V2');
assert(!memberPanelActionSource.includes('new EmbedBuilder'), 'member panel interaction responses must not regress to legacy embeds');
const platformMessageSources = [
  ...readTsTree(path.join(root, 'apps/platform/src/discord')),
  path.join(root, 'apps/platform/src/runtime/scheduled-worker.ts'),
].map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
for (const { file, source } of platformMessageSources) {
  const relative = path.relative(root, file);
  assert(!source.includes('EmbedBuilder'), `legacy EmbedBuilder remains in platform message runtime: ${relative}`);
  assert(!/interaction\.(reply|editReply)\(\{\s*(content|embeds):/.test(source), `legacy interaction response remains: ${relative}`);
  assert(!/deferReply\(\{[^}]*ephemeral/.test(source), `deprecated ephemeral defer remains: ${relative}`);
}

const requiredAssets = ['server-guide.png','community-programs.png','knowledge.png','member-services.png','partnerships.png','media-lab.png','voice-lounge.png','automation-lab.png','trust-center.png','trust-center-motion.gif','data-observatory.png','change-control.png','asset-fabric.png','game-knowledge.png','creator-network.png','learning-paths.png','service-operations.png','accessibility-center.png','language-center.png','volunteer-center.png','ambassador-center.png','tutorial-library.png','resource-directory.png','permission-review.png','incident-timeline.png','recommendation-review.png','deployment-log.png','partner-review.png','creator-analytics.png','learning-analytics.png','business-analytics.png','customer-success.png','known-issues.png','member-directory.png','interest-hub.png','community-calendar.png','member-care.png','member-care-motion.gif','accessibility-requests.png','project-lab.png','project-lab-motion.gif','help-wanted.png','project-showcase.png','event-studio.png','event-studio-motion.gif','event-registration.png','event-recaps.png','content-studio.png','content-studio-motion.gif','media-review.png','brand-assets.png','knowledge-ops.png','member-ops.png','reliability-ops.png','reliability-ops-motion.gif','capacity-planning.png','provider-health.png','recovery-drills.png','theme-studio.png','asset-gallery.png','role-gallery.png','server-pulse.png','server-pulse-motion.gif','scene-presets.png'];
const manifestNames = new Set(manifest.assets.map((asset) => asset.file));
for (const file of requiredAssets) {
  assert(manifestNames.has(file), `asset manifest missing ${file}`);
  assert(fs.existsSync(path.join(root, 'apps/dashboard/public/assets/panels', file)), `panel asset missing ${file}`);
}
assert(manifest.assets.length >= 103, `asset manifest unexpectedly small: ${manifest.assets.length}`);

for (const moduleKey of ['community-programs','knowledge','member-services','partnerships','accessibility','trust-safety','data-observatory','release-ops','asset-fabric','discovery','member-care','project-lab','event-studio','content-studio','knowledge-ops','member-ops','reliability-ops','visual-experience']) {
  assert(controlSource.includes(`'${moduleKey}'`), `/setup module presets missing ${moduleKey}`);
}
assert(dashboardSource.includes('RealtimeVisualStage'), 'dashboard missing realtime visual stage');
assert(dashboardSource.includes('คอมโพเนนต์รุ่น 2'), 'dashboard missing Thai Components V2 evidence label');
assert(dashboardSource.includes("document.documentElement.lang='th'"), 'dashboard presentation language must be locked to Thai');
for (const blueprint of blueprintCatalog.values()) {
  for (const resource of blueprint.resources) {
    assert(!/[A-Za-z]/.test(resource.name), `user-facing resource name must be Thai-only: ${blueprint.key}/${resource.logicalKey} -> ${resource.name}`);
    assert(!/[A-Za-z]/.test(resource.reason ?? ''), `user-facing Discord reason must be Thai-only: ${blueprint.key}/${resource.logicalKey}`);
    if (resource.kind === 'FORUM_CHANNEL') for (const tag of resource.forum?.tags ?? []) assert(!/[A-Za-z]/.test(tag), `forum tag must be Thai-only: ${blueprint.key}/${resource.logicalKey}/${tag}`);
  }
}
const panelCatalogBlock=/export const panelCatalog: readonly PanelDefinition\[\] = \[(.*?)\n\] as const;/s.exec(panelSource)?.[1]??'';
for (const match of panelCatalogBlock.matchAll(/(?:title|description|label):\s*'([^']+)'/g)) assert(!/[A-Za-z]/.test(match[1]), `managed panel presentation must be Thai at source: ${match[1]}`);

assert(setupInteractionSource.includes('setup:budgets-modal:'), '/setup must expose durable resource-budget configuration');
assert(setupInteractionSource.includes("action === 'budgets'"), '/setup must route the resource-budget button');
assert(panelSource.includes("actionKey: 'status:automation'"), 'Automation Lab panel must expose automation runtime evidence');
assert(panelSource.includes("actionKey: 'status:budgets'"), 'operator panels must expose resource-budget evidence');
assert(runtimeIndexSource.includes('DurableAutomationWorker'), 'platform runtime must start the durable automation worker');
assert(automationWorkerSource.includes("budgetKey:'bulk.automation'"), 'automation worker must consume the registered bulk-automation budget');
for (const actionType of ['NOTIFY_TOPIC','SCHEDULE_NOTIFICATION','AUDIT_NOTE']) assert(automationSource.includes(`'${actionType}'`), `safe automation action missing: ${actionType}`);
assert(!automationSource.includes("'HTTP_REQUEST'"), 'generic automation must not expose arbitrary HTTP actions');
for (const key of ['provider.sync','background.analytics','background.backup','notification.fanout','bulk.automation']) assert(budgetSource.includes(`'${key}'`), `registered budget key missing: ${key}`);
assert(budgetSource.includes('BUDGET_KEY_UNREGISTERED'), 'resource budgets must fail closed for unknown keys');
assert(serverSource.includes("/api/guilds/:guildId/budgets/:budgetKey"), 'Dashboard API must expose guild-scoped budget control');
assert(serverSource.includes("/api/guilds/:guildId/automation/rules/:ruleKey"), 'Dashboard API must expose guarded automation rule control');

assert(runtimeIndexSource.includes("from './http/server.js'"), 'platform entrypoint must delegate HTTP implementation to http/server');
assert(runtimeIndexSource.includes('new Client('), 'platform entrypoint must construct a Discord Client when the process role requires it');
assert(runtimeIndexSource.includes('client.login(token)'), 'platform entrypoint must establish the Discord Gateway connection');
assert(runtimeIndexSource.includes('bindDiscordInteractions('), 'platform entrypoint must bind /setup and managed panel interactions');
for (const jobType of ['SETUP_APPLY','RESTORE_APPLY','PERMISSION_REPAIR']) assert(runtimeIndexSource.includes(`jobWorker.register('${jobType}'`), `bootstrap missing durable job handler: ${jobType}`);
for (const runtime of ['outbox?.start()','inbox?.start()','automation?.start()','scheduler?.start()']) assert(runtimeIndexSource.includes(runtime), `bootstrap missing runtime start: ${runtime}`);
assert(!runtimeIndexSource.includes('export async function createHttpServer'), 'platform entrypoint must not regress into a duplicate HTTP server implementation');
for (const assetKey of ['server-guide','community-programs','knowledge','trust-center','data-observatory','service-operations','member-directory','member-care','project-lab','event-studio','content-studio','reliability-ops','theme-studio','asset-gallery','role-gallery','server-pulse','scene-presets']) {
  assert(dashboardSource.includes(`['${assetKey}'`), `dashboard gallery missing ${assetKey}`);
}


assert(setupInteractionSource.includes('admissionPreset'), '/setup advanced governance must persist admission preset');
assert(serverSource.includes("operation:'STRUCTURAL'"), 'Dashboard structural apply must evaluate admission control');
assert(automationWorkerSource.includes("operation:'BULK'"), 'bulk automation must evaluate admission control');
assert(admissionPureSource.includes("'SAFETY','SUPPORT','DIAGNOSTIC'"), 'admission control must protect safety/support/diagnostic paths');
assert(admissionPureSource.includes('failClosedWhenUnknown'), 'admission control must carry explicit stale-evidence policy');
assert(panelSource.includes("actionKey: 'status:admission'"), 'capacity planning panel must expose admission evidence');
console.log(`UI V2 smoke passed: ${blueprintCatalog.size} blueprints, ${omni.resources.length} omni resources, ${panelDefinitionCount} managed panels, ${manifest.assets.length} media assets.`);
