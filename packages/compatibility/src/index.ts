export interface RuntimeCompatibilityInput {
  nodeVersion: string;
  discordJsVersion?: string;
  postgresMajor?: number;
  schemaVersion?: number;
  templateVersion?: number;
  panelSchemaVersion?: number;
}
export interface CompatibilityRule {
  key: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  message: string;
  matches(input: RuntimeCompatibilityInput): boolean;
}
export interface CompatibilityReport { compatible: boolean; findings: Array<{ key: string; severity: CompatibilityRule['severity']; message: string }>; }

function major(version: string | undefined): number | undefined { if (!version) return undefined; const value = Number(version.replace(/^v/, '').split('.')[0]); return Number.isFinite(value) ? value : undefined; }
export const defaultCompatibilityRules: readonly CompatibilityRule[] = [
  { key: 'node.minimum', severity: 'BLOCKING', message: 'Node.js 22 or newer is required.', matches: (input) => (major(input.nodeVersion) ?? 0) < 22 },
  { key: 'discordjs.major', severity: 'BLOCKING', message: 'discord.js major 14 is the supported command/runtime contract.', matches: (input) => input.discordJsVersion !== undefined && major(input.discordJsVersion) !== 14 },
  { key: 'postgres.minimum', severity: 'BLOCKING', message: 'PostgreSQL 15 or newer is required for the supported security/runtime profile.', matches: (input) => input.postgresMajor !== undefined && input.postgresMajor < 15 },
  { key: 'schema.future', severity: 'WARNING', message: 'Database schema is newer than this runtime understands; stop automatic mutation until compatibility is reviewed.', matches: (input) => (input.schemaVersion ?? 0) > 4 },
  { key: 'panel.future', severity: 'WARNING', message: 'Panel schema is newer than this runtime understands; preserve existing messages and require review.', matches: (input) => (input.panelSchemaVersion ?? 0) > 2 },
];
export function evaluateCompatibility(input: RuntimeCompatibilityInput, rules: readonly CompatibilityRule[] = defaultCompatibilityRules): CompatibilityReport {
  const findings = rules.filter((rule) => rule.matches(input)).map(({ key, severity, message }) => ({ key, severity, message }));
  return { compatible: !findings.some((finding) => finding.severity === 'BLOCKING'), findings };
}
export interface UpgradePlan { from: string; to: string; risk: 'LOW' | 'MEDIUM' | 'HIGH'; steps: string[]; requiresStaging: boolean; requiresBackup: boolean; }
export function planLibraryUpgrade(input: { packageName: string; from: string; to: string }): UpgradePlan {
  const fromMajor = major(input.from) ?? 0; const toMajor = major(input.to) ?? 0; const delta = Math.abs(toMajor - fromMajor);
  const risk: UpgradePlan['risk'] = delta >= 1 ? 'HIGH' : input.from === input.to ? 'LOW' : 'MEDIUM';
  return { from: input.from, to: input.to, risk, requiresStaging: risk !== 'LOW', requiresBackup: risk === 'HIGH', steps: [`Pin ${input.packageName} to an exact version`, 'Run typecheck and unit/integration tests', 'Run Discord API contract tests in a test guild', 'Run migration/backup/restore regression gates when shared contracts change', 'Record compatibility evidence before production rollout'] };
}
