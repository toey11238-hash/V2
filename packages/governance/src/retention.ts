import { createHash } from 'node:crypto';

export type DataClass = 'OPERATIONAL' | 'AUDIT' | 'ANALYTICS' | 'USER_CONTENT' | 'SECRET';
export type RetentionDataClass = Exclude<DataClass, 'SECRET'>;
export type RetentionHoldClass = RetentionDataClass | 'ALL';

export interface RetentionRule {
  dataClass: RetentionDataClass;
  days: number;
  /** Legacy caller-side guard only. Durable legal holds are authoritative. */
  legalHold?: boolean;
}

export interface RetentionDecision {
  deletable: boolean;
  reason: string;
  cutoff?: Date;
}

export interface RetentionPlanItem {
  dataClass: RetentionDataClass;
  table: string;
  cutoff: string;
  candidateCount: number;
}

export interface RetentionPolicyDescriptor {
  dataClass: RetentionDataClass;
  table: string;
  timestamp: string;
  predicate?: string;
}

const retentionClasses = new Set<RetentionDataClass>(['OPERATIONAL', 'AUDIT', 'ANALYTICS', 'USER_CONTENT']);


export function validateRetentionHoldClass(value: string): RetentionHoldClass {
  const normalized = value.trim().toUpperCase() as RetentionHoldClass;
  if (normalized !== 'ALL' && !retentionClasses.has(normalized as RetentionDataClass)) throw new Error('RETENTION_HOLD_DATA_CLASS_INVALID');
  return normalized;
}

export function evaluateRetention(rule: RetentionRule, now = new Date()): RetentionDecision {
  if (rule.legalHold) return { deletable: false, reason: 'LEGAL_HOLD' };
  if (!retentionClasses.has(rule.dataClass)) return { deletable: false, reason: 'INVALID_DATA_CLASS' };
  if (!Number.isInteger(rule.days) || rule.days < 1 || rule.days > 3650) return { deletable: false, reason: 'INVALID_RETENTION' };
  return { deletable: true, reason: 'RETENTION_EXPIRED_WHEN_OLDER_THAN_CUTOFF', cutoff: new Date(now.getTime() - rule.days * 86_400_000) };
}

export function normalizeRetentionPlan(plan: readonly RetentionPlanItem[]): RetentionPlanItem[] {
  const seen = new Set<string>();
  return plan.map((item) => {
    if (!retentionClasses.has(item.dataClass)) throw new Error('RETENTION_PLAN_DATA_CLASS_INVALID');
    if (!/^[a-z][a-z0-9_]*$/.test(item.table)) throw new Error('RETENTION_PLAN_TABLE_INVALID');
    const targetKey = `${item.dataClass}:${item.table}`;
    if (seen.has(targetKey)) throw new Error('RETENTION_PLAN_DUPLICATE_TARGET');
    seen.add(targetKey);
    const cutoff = new Date(item.cutoff);
    if (!Number.isFinite(cutoff.getTime())) throw new Error('RETENTION_PLAN_CUTOFF_INVALID');
    if (!Number.isSafeInteger(item.candidateCount) || item.candidateCount < 0) throw new Error('RETENTION_PLAN_COUNT_INVALID');
    return { dataClass: item.dataClass, table: item.table, cutoff: cutoff.toISOString(), candidateCount: item.candidateCount };
  }).sort((a, b) => a.dataClass.localeCompare(b.dataClass) || a.table.localeCompare(b.table) || a.cutoff.localeCompare(b.cutoff));
}

export function retentionPlanHash(plan: readonly RetentionPlanItem[]): string {
  return createHash('sha256').update(JSON.stringify(normalizeRetentionPlan(plan))).digest('hex');
}

export function retentionPolicyHash(targets: readonly RetentionPolicyDescriptor[]): string {
  const normalized = targets.map((target) => ({ dataClass: target.dataClass, table: target.table, timestamp: target.timestamp, predicate: target.predicate ?? '' }))
    .sort((a, b) => a.dataClass.localeCompare(b.dataClass) || a.table.localeCompare(b.table));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function heldRetentionClasses(plan: readonly RetentionPlanItem[], activeHolds: readonly RetentionHoldClass[]): RetentionDataClass[] {
  const held = new Set(activeHolds);
  const classes = new Set(normalizeRetentionPlan(plan).map((item) => item.dataClass));
  if (held.has('ALL')) return [...classes].sort();
  return [...classes].filter((dataClass) => held.has(dataClass)).sort();
}
