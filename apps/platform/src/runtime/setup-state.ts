import { GuildConfigRepository, ResourceMappingRepository, type Database } from '@autoserver/database';
import { SETUP_MODULE_KEYS, defaultSetupDraft, enabledModulesForDraft, normalizeSetupDraft, type SetupDraft, type SetupIntegrationDraft, type SetupBudgetDraft } from '@autoserver/control-center';
import { GamingRepository } from '@autoserver/gaming';
import { IntegrationControlRepository } from '@autoserver/integrations';
import { ResourceBudgetRepository, type ResourceBudgetPolicy } from '@autoserver/budgets';
import { AdmissionControlRepository } from '@autoserver/admission-control';
import { hashSetupApproval, type ExecutionPlan, type ServerBlueprint } from '@autoserver/setup';
import { sha256 } from '@autoserver/core';
import { panelsForBlueprint, type PanelRenderInput } from '@autoserver/panels';
import { resolveGuildBlueprint } from './blueprint-resolver.js';

const MANAGED_INTEGRATION_KEYS = ['riot-data-dragon','github-releases','discord-status','steam-news'] as const;
export const SETUP_MANAGED_INTEGRATION_KEYS: readonly string[] = MANAGED_INTEGRATION_KEYS;

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' && value.length ? value : fallback; }
function numberValue(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
function booleanValue(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }

function panelEvidence(blueprint: ServerBlueprint) {
  return panelsForBlueprint(blueprint).map((panel) => ({
    panelId: panel.panelId,
    schemaVersion: panel.schemaVersion,
    contentVersion: panel.contentVersion,
    targetChannelKey: panel.targetChannelKey,
    repairPolicy: panel.repairPolicy,
  }));
}

export interface SetupApprovalBaseContext { configVersion: number; draftFingerprint: string; }
export const SETUP_APPROVAL_HASH_HEX_LENGTH = 24;

export function setupApprovalHash(plan: ExecutionPlan, draft: SetupDraft, blueprint: ServerBlueprint, base?: SetupApprovalBaseContext): string {
  return hashSetupApproval(plan, { draft, panels: panelEvidence(blueprint), base: base ?? null }).slice(0, SETUP_APPROVAL_HASH_HEX_LENGTH);
}

export function setupConfigurationWorkUnits(): number { return 1; }

export function panelRenderProfileFromGuildConfig(config:{language?:string;themeKey?:string;setupProfile?:Record<string,unknown>}):PanelRenderInput{
  const setup=record(config.setupProfile);
  return {
    locale:config.language,
    themeKey:config.themeKey,
    motionPreset:typeof setup.motionPreset==='string'?setup.motionPreset as PanelRenderInput['motionPreset']:undefined,
    mediaDensity:typeof setup.mediaDensity==='string'?setup.mediaDensity as PanelRenderInput['mediaDensity']:undefined,
    panelDensity:typeof setup.panelDensity==='string'?setup.panelDensity as PanelRenderInput['panelDensity']:undefined,
  };
}


export function allowedSetupModuleKeys(blueprint: ServerBlueprint): ReadonlySet<string> {
  return new Set([...SETUP_MODULE_KEYS, ...blueprint.enabledModules, ...blueprint.resources.map((resource) => resource.module)]);
}

export function assertSetupModuleOverridesAllowed(draft: SetupDraft, blueprint: ServerBlueprint): void {
  const allowed = allowedSetupModuleKeys(blueprint);
  const unknown = Object.keys(draft.moduleOverrides).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`SETUP_MODULE_OVERRIDE_UNKNOWN:${unknown}`);
}

export function assertSetupDraftSemantics(draft: SetupDraft): void {
  try { new Intl.DateTimeFormat('en', { timeZone: draft.timezone }).format(new Date()); }
  catch { throw new Error(`SETUP_TIMEZONE_INVALID:${draft.timezone}`); }
  if (draft.integrations.githubReleases.enabled && (!draft.integrations.githubReleases.owner || !draft.integrations.githubReleases.repo)) {
    throw new Error('SETUP_GITHUB_REPOSITORY_REQUIRED');
  }
}

export function setupDraftFingerprint(draft: SetupDraft): string {
  const stable = {
    ...draft,
    games: [...draft.games].sort(),
    resourceLocks: [...draft.resourceLocks].sort(),
    moduleOverrides: Object.fromEntries(Object.entries(draft.moduleOverrides).sort(([a],[b])=>a.localeCompare(b))),
  };
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
    return JSON.stringify(value);
  };
  return sha256(canonical(stable));
}


export async function loadCurrentSetupDraft(database: Database, guildId: string, requestedBlueprintKey?: string): Promise<{ draft: SetupDraft; configured: boolean; configVersion?: number }> {
  const configs = new GuildConfigRepository(database);
  const config = await configs.get(guildId);
  const blueprintKey = requestedBlueprintKey ?? config?.templateKey ?? 'hybrid-standard';
  if (!config) return { draft: defaultSetupDraft(blueprintKey), configured: false };

  const setup = record(config.setupProfile);
  const gaming = record(config.gamingConfig);
  const retention = record(config.retentionPolicy);
  const approval = record(config.approvalPolicy);
  const integrationProfile = record(setup.integrations);

  let draft = normalizeSetupDraft({
    blueprintKey,
    themeKey: config.themeKey,
    locale: config.language,
    timezone: config.timezone,
    modulePreset: setup.modulePreset,
    gamingPreset: setup.gamingPreset ?? gaming.preset,
    securityPreset: setup.securityPreset,
    automationPreset: setup.automationPreset,
    motionPreset: setup.motionPreset,
    panelDensity: setup.panelDensity,
    channelDecoration: setup.channelDecoration,
    roleVisualStyle: setup.roleVisualStyle,
    mediaDensity: setup.mediaDensity,
    moduleOverrides: setup.moduleOverrides ?? {},
    games: gaming.games ?? [],
    retentionProfile: retention.profile,
    approvalMode: approval.mode,
    backupSchedule: setup.backupSchedule,
    backupHourLocal: setup.backupHourLocal,
    backupWeekday: setup.backupWeekday,
    resourceLocks: setup.resourceLocks ?? [],
    integrations: setup.integrations,
    budgets: setup.budgets,
    admissionPreset: setup.admissionPreset,
    aiProvider: setup.aiProvider,
  }, blueprintKey);

  const [mappings, enabledGames, budgets, admission, backupState, riot, github, discordStatus, steam] = await Promise.all([
    new ResourceMappingRepository(database).list(guildId),
    new GamingRepository(database).listEnabledGames(guildId),
    new ResourceBudgetRepository(database).list(guildId),
    new AdmissionControlRepository(database).get(guildId),
    database.requirePool().query<any>(`select cadence,local_hour,backup_weekday,timezone from backup_schedule_state where guild_id=$1`,[guildId]).then((result)=>result.rows[0] ?? null),
    new IntegrationControlRepository(database).get(guildId,'riot-data-dragon'),
    new IntegrationControlRepository(database).get(guildId,'github-releases'),
    new IntegrationControlRepository(database).get(guildId,'discord-status'),
    new IntegrationControlRepository(database).get(guildId,'steam-news'),
  ]);

  let moduleOverrides = draft.moduleOverrides;
  if (blueprintKey === config.templateKey) {
    const base = await resolveGuildBlueprint(database,guildId,blueprintKey);
    const baselineDraft = { ...draft, moduleOverrides: {} };
    const baseline = new Set(enabledModulesForDraft(base.enabledModules, baselineDraft));
    const actual = new Set(Object.entries(config.enabledModules).filter(([,enabled])=>Boolean(enabled)).map(([key])=>key));
    const keys = new Set([...baseline, ...actual]);
    moduleOverrides = {};
    for (const key of keys) if (baseline.has(key) !== actual.has(key)) moduleOverrides[key] = actual.has(key);
  }

  const moduleEnabled = (key:string) => config.enabledModules[key] === true;
  const integrationsEnabled = moduleEnabled('integrations');
  const gamingEnabled = moduleEnabled('gaming');
  const backupEnabled = moduleEnabled('backup');

  const currentIntegrations: SetupIntegrationDraft = {
    riotDataDragon: {
      enabled: integrationsEnabled ? (riot?.enabled ?? draft.integrations.riotDataDragon.enabled) : draft.integrations.riotDataDragon.enabled,
      locale: stringValue(riot?.config.locale,draft.integrations.riotDataDragon.locale),
      syncCadence: (record(integrationProfile.riotDataDragon).syncCadence as SetupIntegrationDraft['riotDataDragon']['syncCadence']) ?? draft.integrations.riotDataDragon.syncCadence,
    },
    githubReleases: {
      enabled: integrationsEnabled ? (github?.enabled ?? draft.integrations.githubReleases.enabled) : draft.integrations.githubReleases.enabled,
      owner: stringValue(github?.config.owner,draft.integrations.githubReleases.owner),
      repo: stringValue(github?.config.repo,draft.integrations.githubReleases.repo),
      includePrereleases: booleanValue(github?.config.includePrereleases,draft.integrations.githubReleases.includePrereleases),
      syncCadence: (record(integrationProfile.githubReleases).syncCadence as SetupIntegrationDraft['githubReleases']['syncCadence']) ?? draft.integrations.githubReleases.syncCadence,
    },
    discordStatus: {
      enabled: integrationsEnabled ? (discordStatus?.enabled ?? draft.integrations.discordStatus.enabled) : draft.integrations.discordStatus.enabled,
      syncCadence: (record(integrationProfile.discordStatus).syncCadence as SetupIntegrationDraft['discordStatus']['syncCadence']) ?? draft.integrations.discordStatus.syncCadence,
    },
    steamNews: {
      enabled: integrationsEnabled ? (steam?.enabled ?? draft.integrations.steamNews.enabled) : draft.integrations.steamNews.enabled,
      appId: numberValue(steam?.config.appId,draft.integrations.steamNews.appId),
      count: numberValue(steam?.config.count,draft.integrations.steamNews.count),
      maxLength: numberValue(steam?.config.maxLength,draft.integrations.steamNews.maxLength),
      syncCadence: (record(integrationProfile.steamNews).syncCadence as SetupIntegrationDraft['steamNews']['syncCadence']) ?? draft.integrations.steamNews.syncCadence,
    },
  };

  const budgetMap = new Map<string,ResourceBudgetPolicy>(budgets.map((item)=>[item.budgetKey,item]));
  const fromBudget = (key:string, fallback: SetupBudgetDraft['providerSync']) => {
    const item=budgetMap.get(key); return item ? { enabled:item.enabled, mode:item.mode, windowSeconds:item.windowSeconds, maxUnits:item.maxUnits } : fallback;
  };
  const currentBudgets: SetupBudgetDraft = {
    providerSync: fromBudget('provider.sync',draft.budgets.providerSync),
    analytics: fromBudget('background.analytics',draft.budgets.analytics),
    backup: fromBudget('background.backup',draft.budgets.backup),
    notificationFanout: fromBudget('notification.fanout',draft.budgets.notificationFanout),
    bulkAutomation: fromBudget('bulk.automation',draft.budgets.bulkAutomation),
  };

  draft = normalizeSetupDraft({
    ...draft,
    moduleOverrides,
    games: gamingEnabled ? enabledGames.map((game)=>game.gameKey) : draft.games,
    resourceLocks: mappings.filter((mapping)=>mapping.locked).map((mapping)=>mapping.logicalKey),
    integrations: currentIntegrations,
    budgets: currentBudgets,
    admissionPreset: admission.preset,
    backupSchedule: backupEnabled ? (backupState?.cadence ?? draft.backupSchedule) : draft.backupSchedule,
    backupHourLocal: backupEnabled ? (backupState?.local_hour ?? draft.backupHourLocal) : draft.backupHourLocal,
    backupWeekday: backupEnabled ? (backupState?.backup_weekday ?? draft.backupWeekday) : draft.backupWeekday,
    timezone: config.timezone,
  }, blueprintKey);

  return { draft, configured: true, configVersion: config.version };
}
