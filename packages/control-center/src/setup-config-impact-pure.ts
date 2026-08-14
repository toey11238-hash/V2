import type { SetupBudgetPolicy, SetupDraft } from './index.ts';

export type SetupConfigurationImpactLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export interface SetupConfigurationImpactChange { field: string; score: number; reason: string; }
export interface SetupConfigurationImpactReport {
  level: SetupConfigurationImpactLevel;
  score: number;
  approvalRecommended: boolean;
  changedFields: string[];
  changes: SetupConfigurationImpactChange[];
  reasons: string[];
}

const severity: Record<SetupConfigurationImpactLevel, number> = { LOW:0, MEDIUM:1, HIGH:2, CRITICAL:3 };
function rankSecurity(value: SetupDraft['securityPreset']): number { return value === 'STANDARD' ? 0 : value === 'STRICT' ? 1 : 2; }
function rankApproval(value: SetupDraft['approvalMode']): number { return value === 'SAFE_DEFAULTS' ? 0 : value === 'STRICT' ? 1 : 2; }
function rankAdmission(value: SetupDraft['admissionPreset']): number { return value === 'MAX_AVAILABILITY' ? 0 : value === 'BALANCED' ? 1 : 2; }
function rankRetention(value: SetupDraft['retentionProfile']): number { return value === 'MINIMAL' ? 0 : value === 'BALANCED' ? 1 : 2; }

function budgetRelaxed(before: SetupBudgetPolicy, after: SetupBudgetPolicy): boolean {
  return (before.enabled && !after.enabled)
    || (before.mode === 'ENFORCE' && after.mode === 'OBSERVE')
    || after.maxUnits > before.maxUnits
    || after.windowSeconds < before.windowSeconds;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = [...new Set(a)].sort(); const right = [...new Set(b)].sort();
  return left.length === right.length && left.every((value,index)=>value===right[index]);
}

export function analyzeSetupConfigurationImpact(before: SetupDraft, after: SetupDraft): SetupConfigurationImpactReport {
  const changes: SetupConfigurationImpactChange[] = [];
  const add = (field:string, score:number, reason:string) => { if (score > 0) changes.push({field,score,reason}); };

  if (before.blueprintKey !== after.blueprintKey) add('blueprintKey', 25, `blueprint ${before.blueprintKey} -> ${after.blueprintKey}`);
  if (before.modulePreset !== after.modulePreset) add('modulePreset', 14, `system profile ${before.modulePreset} -> ${after.modulePreset}`);
  if (before.gamingPreset !== after.gamingPreset) add('gamingPreset', 8, `gaming profile ${before.gamingPreset} -> ${after.gamingPreset}`);
  if (before.securityPreset !== after.securityPreset) add('securityPreset', rankSecurity(after.securityPreset) < rankSecurity(before.securityPreset) ? 40 : 10, `security ${before.securityPreset} -> ${after.securityPreset}`);
  if (before.approvalMode !== after.approvalMode) add('approvalMode', rankApproval(after.approvalMode) < rankApproval(before.approvalMode) ? 35 : 9, `approval ${before.approvalMode} -> ${after.approvalMode}`);
  if (before.admissionPreset !== after.admissionPreset) add('admissionPreset', rankAdmission(after.admissionPreset) < rankAdmission(before.admissionPreset) ? 18 : 6, `admission ${before.admissionPreset} -> ${after.admissionPreset}`);
  if (before.retentionProfile !== after.retentionProfile) add('retentionProfile', rankRetention(after.retentionProfile) < rankRetention(before.retentionProfile) ? 24 : 8, `retention ${before.retentionProfile} -> ${after.retentionProfile}`);
  if (before.aiProvider !== after.aiProvider) add('aiProvider', after.aiProvider === 'openai-responses' ? 30 : 5, `AI provider ${before.aiProvider} -> ${after.aiProvider}`);
  if (before.backupSchedule !== after.backupSchedule) add('backupSchedule', after.backupSchedule === 'OFF' ? 22 : 7, `backup ${before.backupSchedule} -> ${after.backupSchedule}`);
  if (before.backupHourLocal !== after.backupHourLocal || before.backupWeekday !== after.backupWeekday) add('backupTiming', 3, 'backup execution time changed');
  if (before.automationPreset !== after.automationPreset) add('automationPreset', 7, `automation ${before.automationPreset} -> ${after.automationPreset}`);

  const beforeOverrides = before.moduleOverrides; const afterOverrides = after.moduleOverrides;
  const overrideKeys = new Set([...Object.keys(beforeOverrides), ...Object.keys(afterOverrides)]);
  for (const key of overrideKeys) {
    if (beforeOverrides[key] === afterOverrides[key]) continue;
    const disabling = afterOverrides[key] === false;
    const sensitive = ['security','backup','retention','approvals','moderation','verification','analytics','integrations'].includes(key);
    add(`moduleOverrides.${key}`, disabling && sensitive ? 22 : disabling ? 8 : 5, `${key} override ${String(beforeOverrides[key] ?? 'inherit')} -> ${String(afterOverrides[key] ?? 'inherit')}`);
  }

  const beforeLocks = new Set(before.resourceLocks); const afterLocks = new Set(after.resourceLocks);
  const unlocked = [...beforeLocks].filter((key)=>!afterLocks.has(key)); const locked = [...afterLocks].filter((key)=>!beforeLocks.has(key));
  if (unlocked.length) add('resourceLocks.unlock', Math.min(30, 12 + unlocked.length * 2), `${unlocked.length} managed resource lock${unlocked.length===1?'':'s'} removed`);
  if (locked.length) add('resourceLocks.lock', Math.min(12, 3 + locked.length), `${locked.length} managed resource lock${locked.length===1?'':'s'} added`);

  if (!sameSet(before.games, after.games)) add('games', 4, 'enabled game registry changed');

  const integrations = [
    ['riotDataDragon', before.integrations.riotDataDragon.enabled, after.integrations.riotDataDragon.enabled],
    ['githubReleases', before.integrations.githubReleases.enabled, after.integrations.githubReleases.enabled],
    ['discordStatus', before.integrations.discordStatus.enabled, after.integrations.discordStatus.enabled],
    ['steamNews', before.integrations.steamNews.enabled, after.integrations.steamNews.enabled],
  ] as const;
  for (const [key,was,now] of integrations) if (was !== now) add(`integrations.${key}`, now ? 10 : 5, `${key} integration ${now?'enabled':'disabled'}`);

  for (const key of ['providerSync','analytics','backup','notificationFanout','bulkAutomation'] as const) {
    const beforeBudget=before.budgets[key]; const afterBudget=after.budgets[key];
    if (JSON.stringify(beforeBudget) === JSON.stringify(afterBudget)) continue;
    add(`budgets.${key}`, budgetRelaxed(beforeBudget,afterBudget) ? 16 : 5, `${key} resource budget changed${budgetRelaxed(beforeBudget,afterBudget)?' with relaxed enforcement':''}`);
  }

  for (const field of ['themeKey','locale','timezone','motionPreset','panelDensity','channelDecoration','roleVisualStyle','mediaDensity'] as const) if (before[field] !== after[field]) add(field, field === 'timezone' ? 4 : 2, `${field} changed`);

  const score = Math.min(100, changes.reduce((sum,item)=>sum+item.score,0));
  const level: SetupConfigurationImpactLevel = score >= 60 || changes.some((item)=>item.score>=40) ? 'CRITICAL' : score >= 35 || changes.some((item)=>item.score>=30) ? 'HIGH' : score >= 15 ? 'MEDIUM' : 'LOW';
  const reasons = changes.length ? changes.sort((a,b)=>b.score-a.score||a.field.localeCompare(b.field)).slice(0,8).map((item)=>item.reason) : ['no material configuration change'];
  return { level, score, approvalRecommended: severity[level] >= severity.HIGH, changedFields:[...new Set(changes.map((item)=>item.field))].sort(), changes, reasons };
}
