import { VISUAL_THEME_OPTIONS, type VisualThemeKey, type MotionPreset as VisualMotionPreset, type PanelDensity, type ChannelDecorationPreset, type RoleVisualStyle, type MediaDensity, decorateResourceName, roleVisualProfile } from '../../visual-system/src/index.ts';
export type SetupTheme = VisualThemeKey;
export type SetupLocale = 'th';
export type ModulePreset = 'FULL_PLATFORM' | 'COMMUNITY' | 'GAMING_MAX' | 'CREATOR' | 'EDUCATION' | 'OPERATIONS';
export type GamingPreset = 'OFF' | 'COMMUNITY' | 'COMPETITIVE' | 'MMO_GUILD' | 'FULL';
export type SecurityPreset = 'STANDARD' | 'STRICT' | 'ENTERPRISE';
export type AutomationPreset = 'ESSENTIAL' | 'SMART' | 'FULL';
export type MotionPreset = VisualMotionPreset;
export type RetentionProfile = 'MINIMAL' | 'BALANCED' | 'EXTENDED_AUDIT';
export type ApprovalMode = 'SAFE_DEFAULTS' | 'STRICT' | 'ENTERPRISE';
export type BackupSchedule = 'OFF' | 'DAILY' | 'WEEKLY';
export type IntegrationSyncCadence = 'OFF' | 'DAILY' | 'WEEKLY';
export type SetupBudgetMode = 'OBSERVE' | 'ENFORCE';
export type AdmissionPreset = 'BALANCED' | 'CONSERVATIVE' | 'MAX_AVAILABILITY';
export type AiProviderPreference = 'local-rules' | 'openai-responses';
export interface SetupBudgetPolicy { enabled: boolean; mode: SetupBudgetMode; windowSeconds: number; maxUnits: number; }
export interface SetupBudgetDraft {
  providerSync: SetupBudgetPolicy;
  analytics: SetupBudgetPolicy;
  backup: SetupBudgetPolicy;
  notificationFanout: SetupBudgetPolicy;
  bulkAutomation: SetupBudgetPolicy;
}

export interface SetupIntegrationDraft {
  riotDataDragon: { enabled: boolean; locale: string; syncCadence: IntegrationSyncCadence };
  githubReleases: { enabled: boolean; owner: string; repo: string; includePrereleases: boolean; syncCadence: IntegrationSyncCadence };
  discordStatus: { enabled: boolean; syncCadence: IntegrationSyncCadence };
  steamNews: { enabled: boolean; appId: number; count: number; maxLength: number; syncCadence: IntegrationSyncCadence };
}

export interface SetupDraft {
  blueprintKey: string;
  themeKey: SetupTheme;
  locale: SetupLocale;
  timezone: string;
  modulePreset: ModulePreset;
  gamingPreset: GamingPreset;
  securityPreset: SecurityPreset;
  automationPreset: AutomationPreset;
  motionPreset: MotionPreset;
  panelDensity: PanelDensity;
  channelDecoration: ChannelDecorationPreset;
  roleVisualStyle: RoleVisualStyle;
  mediaDensity: MediaDensity;
  moduleOverrides: Record<string, boolean>;
  games: string[];
  retentionProfile: RetentionProfile;
  approvalMode: ApprovalMode;
  backupSchedule: BackupSchedule;
  backupHourLocal: number;
  backupWeekday: number;
  resourceLocks: string[];
  integrations: SetupIntegrationDraft;
  budgets: SetupBudgetDraft;
  admissionPreset: AdmissionPreset;
  aiProvider: AiProviderPreference;
}

export const THEME_OPTIONS: ReadonlyArray<{ key: SetupTheme; label: string; note: string }> = VISUAL_THEME_OPTIONS;

const modulePresets: Record<ModulePreset, readonly string[]> = {
  FULL_PLATFORM: ['welcome','verification','roles','notifications','tickets','applications','suggestions','reports','moderation','security','events','giveaways','scheduler','automation','voice','backup','repair','diagnostics','analytics','recommendations','integrations','localization','approvals','maintenance','retention','gaming','lfg','game-sessions','teams','clans','scrims','tournaments','matches','progression','quests','achievements','game-integrations','creator','education','business','plugins','feature-flags','ai-hooks','import-export','forums','cache','compatibility','growth-mode','documentation','community-programs','knowledge','member-services','partnerships','accessibility','trust-safety','data-observatory','release-ops','asset-fabric','visual-experience','discovery','member-care','project-lab','event-studio','content-studio','knowledge-ops','member-ops','reliability-ops'],
  COMMUNITY: ['welcome','verification','roles','notifications','tickets','suggestions','reports','moderation','security','events','giveaways','scheduler','automation','voice','backup','repair','diagnostics','analytics','recommendations','localization','forums','community-programs','knowledge','member-services','partnerships','accessibility','discovery','member-care','project-lab','event-studio','content-studio','visual-experience'],
  GAMING_MAX: ['welcome','verification','roles','notifications','tickets','moderation','security','events','giveaways','scheduler','automation','voice','backup','repair','diagnostics','analytics','recommendations','integrations','gaming','lfg','game-sessions','teams','clans','scrims','tournaments','matches','progression','quests','achievements','game-integrations','forums','community-programs','knowledge','member-services','accessibility','discovery','member-care','project-lab','event-studio','content-studio','visual-experience'],
  CREATOR: ['welcome','verification','roles','notifications','tickets','moderation','security','events','giveaways','scheduler','automation','voice','backup','repair','diagnostics','analytics','integrations','creator','content-workflows','live-integrations','forums','community-programs','knowledge','member-services','partnerships','accessibility','discovery','member-care','project-lab','event-studio','content-studio','visual-experience'],
  EDUCATION: ['welcome','verification','roles','notifications','tickets','moderation','security','events','giveaways','scheduler','automation','voice','backup','repair','diagnostics','analytics','education','reminders','mentor','localization','forums','community-programs','knowledge','member-services','accessibility','discovery','member-care','project-lab','event-studio','content-studio','visual-experience'],
  OPERATIONS: ['tickets','applications','reports','moderation','security','scheduler','automation','backup','repair','diagnostics','analytics','recommendations','integrations','approvals','maintenance','change-control','retention','localization','privacy','plugins','feature-flags','ai-hooks','import-export','forums','cache','compatibility','growth-mode','documentation','community-programs','knowledge','member-services','partnerships','accessibility','trust-safety','data-observatory','release-ops','asset-fabric','visual-experience','content-studio','event-studio','knowledge-ops','member-ops','reliability-ops'],
};

export const SETUP_MODULE_KEYS: readonly string[] = [...new Set(Object.values(modulePresets).flat())].sort();

export function setupModuleKeys(baseModules: readonly string[] = []): string[] {
  return [...new Set([...baseModules, ...SETUP_MODULE_KEYS])].sort();
}

export function defaultSetupDraft(blueprintKey = 'hybrid-standard'): SetupDraft {
  const gaming = blueprintKey.includes('gaming') ? 'FULL' : 'OFF';
  return {
    blueprintKey,
    themeKey: gaming === 'FULL' ? 'arena-core' : 'command-bridge',
    locale: 'th',
    timezone: 'Asia/Bangkok',
    modulePreset: gaming === 'FULL' ? 'GAMING_MAX' : 'FULL_PLATFORM',
    gamingPreset: gaming,
    securityPreset: 'STRICT',
    automationPreset: 'SMART',
    motionPreset: 'BALANCED',
    panelDensity: 'COMFORTABLE',
    channelDecoration: 'SIGNAL',
    roleVisualStyle: 'THEMED',
    mediaDensity: 'BALANCED',
    moduleOverrides: {},
    games: [],
    retentionProfile: 'BALANCED',
    approvalMode: 'STRICT',
    backupSchedule: 'WEEKLY',
    backupHourLocal: 4,
    backupWeekday: 0,
    resourceLocks: [],
    integrations: {
      riotDataDragon: { enabled: false, locale: 'th_TH', syncCadence: 'WEEKLY' },
      githubReleases: { enabled: false, owner: '', repo: '', includePrereleases: false, syncCadence: 'WEEKLY' },
      discordStatus: { enabled: false, syncCadence: 'DAILY' },
      steamNews: { enabled: false, appId: 570, count: 10, maxLength: 1200, syncCadence: 'DAILY' },
    },
    admissionPreset: 'BALANCED',
    aiProvider: 'local-rules',
    budgets: {
      providerSync: { enabled: true, mode: 'ENFORCE', windowSeconds: 3600, maxUnits: 24 },
      analytics: { enabled: true, mode: 'ENFORCE', windowSeconds: 3600, maxUnits: 24 },
      backup: { enabled: true, mode: 'ENFORCE', windowSeconds: 86400, maxUnits: 8 },
      notificationFanout: { enabled: true, mode: 'OBSERVE', windowSeconds: 600, maxUnits: 2000 },
      bulkAutomation: { enabled: true, mode: 'ENFORCE', windowSeconds: 600, maxUnits: 120 },
    },
  };
}

export function enabledModulesForDraft(baseModules: readonly string[], draft: SetupDraft): string[] {
  const selected = new Set([...baseModules, ...modulePresets[draft.modulePreset]]);
  if (draft.gamingPreset === 'OFF') {
    for (const module of ['gaming','lfg','game-sessions','teams','clans','scrims','tournaments','matches','progression','quests','achievements','game-integrations']) selected.delete(module);
  } else {
    selected.add('gaming'); selected.add('lfg'); selected.add('game-sessions'); selected.add('voice');
    if (['COMPETITIVE','FULL'].includes(draft.gamingPreset)) ['teams','scrims','tournaments','matches'].forEach((key) => selected.add(key));
    if (['MMO_GUILD','FULL'].includes(draft.gamingPreset)) ['clans','teams','progression','quests','achievements'].forEach((key) => selected.add(key));
  }
  for (const [key, enabled] of Object.entries(draft.moduleOverrides ?? {})) { if (enabled) selected.add(key); else selected.delete(key); }
  return [...selected].sort();
}

export function patchSetupDraft(draft: SetupDraft, patch: Partial<SetupDraft>): SetupDraft {
  return { ...draft, ...patch };
}

const setupThemes = new Set<SetupTheme>(THEME_OPTIONS.map((item) => item.key));
const modulePresetValues = new Set<ModulePreset>(['FULL_PLATFORM','COMMUNITY','GAMING_MAX','CREATOR','EDUCATION','OPERATIONS']);
const gamingPresetValues = new Set<GamingPreset>(['OFF','COMMUNITY','COMPETITIVE','MMO_GUILD','FULL']);
const securityPresetValues = new Set<SecurityPreset>(['STANDARD','STRICT','ENTERPRISE']);
const automationPresetValues = new Set<AutomationPreset>(['ESSENTIAL','SMART','FULL']);
const motionPresetValues = new Set<MotionPreset>(['STATIC','BALANCED','ANIMATED','CINEMATIC']);
const panelDensityValues = new Set<PanelDensity>(['COMPACT','COMFORTABLE','SPACIOUS']);
const channelDecorationValues = new Set<ChannelDecorationPreset>(['CLEAN','SIGNAL','ICONIC']);
const roleVisualStyleValues = new Set<RoleVisualStyle>(['CLASSIC','THEMED','ENHANCED']);
const mediaDensityValues = new Set<MediaDensity>(['MINIMAL','BALANCED','RICH']);
const retentionValues = new Set<RetentionProfile>(['MINIMAL','BALANCED','EXTENDED_AUDIT']);
const approvalValues = new Set<ApprovalMode>(['SAFE_DEFAULTS','STRICT','ENTERPRISE']);
const backupScheduleValues = new Set<BackupSchedule>(['OFF','DAILY','WEEKLY']);
const admissionPresetValues = new Set<AdmissionPreset>(['BALANCED','CONSERVATIVE','MAX_AVAILABILITY']);
const aiProviderValues = new Set<AiProviderPreference>(['local-rules','openai-responses']);

function normalizeModuleOverrides(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key,v]) => /^[a-z][a-z0-9-]{1,63}$/.test(key) && typeof v === 'boolean').slice(0,100) as Array<[string,boolean]>);
}
function normalizeStringKeys(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(item)).slice(0,max))];
}

const integrationSyncCadences = new Set<IntegrationSyncCadence>(['OFF','DAILY','WEEKLY']);
const riotLocales = new Set(['cs_CZ','el_GR','pl_PL','ro_RO','hu_HU','en_GB','de_DE','es_ES','it_IT','fr_FR','ja_JP','ko_KR','es_MX','es_AR','pt_BR','en_US','en_AU','ru_RU','tr_TR','ms_MY','en_PH','en_SG','th_TH','vi_VN','id_ID','zh_MY','zh_CN','zh_TW']);
function normalizeIntegrationDraft(value: unknown, base: SetupIntegrationDraft): SetupIntegrationDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const root=value as Record<string,unknown>;
  const riot=(root.riotDataDragon&&typeof root.riotDataDragon==='object'&&!Array.isArray(root.riotDataDragon)?root.riotDataDragon:{} ) as Record<string,unknown>;
  const github=(root.githubReleases&&typeof root.githubReleases==='object'&&!Array.isArray(root.githubReleases)?root.githubReleases:{} ) as Record<string,unknown>;
  const discord=(root.discordStatus&&typeof root.discordStatus==='object'&&!Array.isArray(root.discordStatus)?root.discordStatus:{} ) as Record<string,unknown>;
  const steam=(root.steamNews&&typeof root.steamNews==='object'&&!Array.isArray(root.steamNews)?root.steamNews:{} ) as Record<string,unknown>;
  const slug=(input:unknown)=>typeof input==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(input.trim())?input.trim():'';
  return {
    riotDataDragon:{ enabled:Boolean(riot.enabled), locale:riotLocales.has(String(riot.locale??''))?String(riot.locale):base.riotDataDragon.locale, syncCadence:integrationSyncCadences.has(riot.syncCadence as IntegrationSyncCadence)?riot.syncCadence as IntegrationSyncCadence:base.riotDataDragon.syncCadence },
    githubReleases:{ enabled:Boolean(github.enabled), owner:slug(github.owner), repo:slug(github.repo), includePrereleases:Boolean(github.includePrereleases), syncCadence:integrationSyncCadences.has(github.syncCadence as IntegrationSyncCadence)?github.syncCadence as IntegrationSyncCadence:base.githubReleases.syncCadence },
    discordStatus:{ enabled:Boolean(discord.enabled), syncCadence:integrationSyncCadences.has(discord.syncCadence as IntegrationSyncCadence)?discord.syncCadence as IntegrationSyncCadence:base.discordStatus.syncCadence },
    steamNews:{ enabled:Boolean(steam.enabled), appId:Number.isSafeInteger(Number(steam.appId))&&Number(steam.appId)>0&&Number(steam.appId)<=4294967295?Number(steam.appId):base.steamNews.appId, count:[5,10,20].includes(Number(steam.count))?Number(steam.count):base.steamNews.count, maxLength:[600,1200,2000,4000].includes(Number(steam.maxLength))?Number(steam.maxLength):base.steamNews.maxLength, syncCadence:integrationSyncCadences.has(steam.syncCadence as IntegrationSyncCadence)?steam.syncCadence as IntegrationSyncCadence:base.steamNews.syncCadence },
  };
}

function normalizeBudgetPolicy(value:unknown,base:SetupBudgetPolicy):SetupBudgetPolicy{
  if(!value||typeof value!=='object'||Array.isArray(value))return base;
  const raw=value as Record<string,unknown>;const mode=String(raw.mode??base.mode).toUpperCase();const windowSeconds=Number(raw.windowSeconds??base.windowSeconds);const maxUnits=Number(raw.maxUnits??base.maxUnits);
  return {enabled:raw.enabled===undefined?base.enabled:Boolean(raw.enabled),mode:mode==='OBSERVE'?'OBSERVE':'ENFORCE',windowSeconds:Number.isInteger(windowSeconds)&&windowSeconds>=60&&windowSeconds<=86400?windowSeconds:base.windowSeconds,maxUnits:Number.isInteger(maxUnits)&&maxUnits>=1&&maxUnits<=1_000_000?maxUnits:base.maxUnits};
}
function normalizeBudgetDraft(value:unknown,base:SetupBudgetDraft):SetupBudgetDraft{
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
  return {providerSync:normalizeBudgetPolicy(raw.providerSync,base.providerSync),analytics:normalizeBudgetPolicy(raw.analytics,base.analytics),backup:normalizeBudgetPolicy(raw.backup,base.backup),notificationFanout:normalizeBudgetPolicy(raw.notificationFanout,base.notificationFanout),bulkAutomation:normalizeBudgetPolicy(raw.bulkAutomation,base.bulkAutomation)};
}

export function normalizeSetupDraft(candidate: unknown, fallbackBlueprint = 'hybrid-standard'): SetupDraft {
  const base = defaultSetupDraft(fallbackBlueprint);
  if (!candidate || typeof candidate !== 'object') return base;
  const value = candidate as Partial<Record<keyof SetupDraft, unknown>>;
  const blueprintKey = typeof value.blueprintKey === 'string' && value.blueprintKey.length <= 80 ? value.blueprintKey : base.blueprintKey;
  return {
    blueprintKey,
    themeKey: setupThemes.has(value.themeKey as SetupTheme) ? value.themeKey as SetupTheme : base.themeKey,
    locale: 'th',
    timezone: typeof value.timezone === 'string' && value.timezone.length > 0 && value.timezone.length <= 80 ? value.timezone : base.timezone,
    modulePreset: modulePresetValues.has(value.modulePreset as ModulePreset) ? value.modulePreset as ModulePreset : base.modulePreset,
    gamingPreset: gamingPresetValues.has(value.gamingPreset as GamingPreset) ? value.gamingPreset as GamingPreset : base.gamingPreset,
    securityPreset: securityPresetValues.has(value.securityPreset as SecurityPreset) ? value.securityPreset as SecurityPreset : base.securityPreset,
    automationPreset: automationPresetValues.has(value.automationPreset as AutomationPreset) ? value.automationPreset as AutomationPreset : base.automationPreset,
    motionPreset: motionPresetValues.has(value.motionPreset as MotionPreset) ? value.motionPreset as MotionPreset : base.motionPreset,
    panelDensity: panelDensityValues.has(value.panelDensity as PanelDensity) ? value.panelDensity as PanelDensity : base.panelDensity,
    channelDecoration: channelDecorationValues.has(value.channelDecoration as ChannelDecorationPreset) ? value.channelDecoration as ChannelDecorationPreset : base.channelDecoration,
    roleVisualStyle: roleVisualStyleValues.has(value.roleVisualStyle as RoleVisualStyle) ? value.roleVisualStyle as RoleVisualStyle : base.roleVisualStyle,
    mediaDensity: mediaDensityValues.has(value.mediaDensity as MediaDensity) ? value.mediaDensity as MediaDensity : base.mediaDensity,
    moduleOverrides: normalizeModuleOverrides(value.moduleOverrides),
    games: normalizeStringKeys(value.games, 24),
    retentionProfile: retentionValues.has(value.retentionProfile as RetentionProfile) ? value.retentionProfile as RetentionProfile : base.retentionProfile,
    approvalMode: approvalValues.has(value.approvalMode as ApprovalMode) ? value.approvalMode as ApprovalMode : base.approvalMode,
    backupSchedule: backupScheduleValues.has(value.backupSchedule as BackupSchedule) ? value.backupSchedule as BackupSchedule : base.backupSchedule,
    backupHourLocal: Number.isInteger(value.backupHourLocal) && Number(value.backupHourLocal) >= 0 && Number(value.backupHourLocal) <= 23 ? Number(value.backupHourLocal) : base.backupHourLocal,
    backupWeekday: Number.isInteger(value.backupWeekday) && Number(value.backupWeekday) >= 0 && Number(value.backupWeekday) <= 6 ? Number(value.backupWeekday) : base.backupWeekday,
    resourceLocks: normalizeStringKeys(value.resourceLocks, 100),
    integrations: normalizeIntegrationDraft(value.integrations, base.integrations),
    budgets: normalizeBudgetDraft(value.budgets, base.budgets),
    admissionPreset: admissionPresetValues.has(value.admissionPreset as AdmissionPreset) ? value.admissionPreset as AdmissionPreset : base.admissionPreset,
    aiProvider: aiProviderValues.has(value.aiProvider as AiProviderPreference) ? value.aiProvider as AiProviderPreference : base.aiProvider,
  };
}

import type { ServerBlueprint } from '@autoserver/setup';

export function blueprintForEnabledModules(base: ServerBlueprint, enabledModules: readonly string[]): ServerBlueprint {
  const normalizedModules = [...new Set(enabledModules)].sort();
  const enabled = new Set(normalizedModules);
  return {
    ...base,
    enabledModules: normalizedModules,
    resources: base.resources.filter((resource) => enabled.has(resource.module)),
  };
}

export function blueprintForSetupDraft(base: ServerBlueprint, draft: SetupDraft): ServerBlueprint {
  const selected=blueprintForEnabledModules(base, enabledModulesForDraft(base.enabledModules, draft));
  return { ...selected, resources:selected.resources.map((resource)=>{
    const name=decorateResourceName({kind:resource.kind,name:resource.name,module:resource.module,preset:draft.channelDecoration});
    if(resource.kind!=='ROLE') return { ...resource, name };
    const visual=roleVisualProfile({themeKey:draft.themeKey,style:draft.roleVisualStyle,logicalKey:resource.logicalKey,module:resource.module,enhancedColors:true,roleIcons:true});
    return { ...resource, name, role:{...(resource.role??{}),...visual} };
  }) };
}

export { analyzeSetupConfigurationImpact } from './setup-config-impact-pure.ts';
export type { SetupConfigurationImpactChange, SetupConfigurationImpactLevel, SetupConfigurationImpactReport } from './setup-config-impact-pure.ts';
