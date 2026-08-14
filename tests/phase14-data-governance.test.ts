import { describe, expect, it } from 'vitest';
import { canonicalJson, privacyExportHash } from '../packages/governance/src/privacy.js';
import { evaluateRetention, heldRetentionClasses, normalizeRetentionPlan, retentionPlanHash, retentionPolicyHash, validateRetentionHoldClass } from '../packages/governance/src/retention.js';

describe('Phase 14 data governance contracts', () => {
  it('normalizes and hashes retention plans deterministically', () => {
    const plan = [
      { dataClass: 'AUDIT' as const, table: 'audit_events', cutoff: '2026-07-01T00:00:00Z', candidateCount: 2 },
      { dataClass: 'ANALYTICS' as const, table: 'analytics_daily', cutoff: '2026-06-01T00:00:00Z', candidateCount: 1 },
    ];
    expect(normalizeRetentionPlan(plan).map((item) => item.dataClass)).toEqual(['ANALYTICS', 'AUDIT']);
    expect(retentionPlanHash(plan)).toBe(retentionPlanHash([...plan].reverse()));
    expect(retentionPlanHash(plan)).not.toBe(retentionPlanHash([{ ...plan[0], candidateCount: 3 }, plan[1]]));
    expect(() => retentionPlanHash([{ ...plan[0], candidateCount: Number.MAX_SAFE_INTEGER + 1 }])).toThrow('RETENTION_PLAN_COUNT_INVALID');
    expect(() => retentionPlanHash([plan[0], { ...plan[0], cutoff: '2026-05-01T00:00:00Z' }])).toThrow('RETENTION_PLAN_DUPLICATE_TARGET');
  });

  it('fails closed for illegal hold classes and excessive retention', () => {
    expect(validateRetentionHoldClass(' user_content ')).toBe('USER_CONTENT');
    expect(() => validateRetentionHoldClass('SECRET')).toThrow('RETENTION_HOLD_DATA_CLASS_INVALID');
    expect(evaluateRetention({ dataClass: 'AUDIT', days: 3651 }).deletable).toBe(false);
    expect(evaluateRetention({ dataClass: 'AUDIT', days: 30, legalHold: true }).reason).toBe('LEGAL_HOLD');
  });

  it('maps durable legal holds onto the classes present in a plan', () => {
    const plan = [
      { dataClass: 'AUDIT' as const, table: 'audit_events', cutoff: '2026-07-01T00:00:00Z', candidateCount: 2 },
      { dataClass: 'ANALYTICS' as const, table: 'analytics_daily', cutoff: '2026-06-01T00:00:00Z', candidateCount: 1 },
    ];
    expect(heldRetentionClasses(plan, ['AUDIT'])).toEqual(['AUDIT']);
    expect(heldRetentionClasses(plan, ['ALL'])).toEqual(['ANALYTICS', 'AUDIT']);
  });


  it('invalidates approvals when retention selector policy changes', () => {
    const policy = [{ dataClass: 'AUDIT' as const, table: 'audit_events', timestamp: 'created_at' }];
    expect(retentionPolicyHash(policy)).toBe(retentionPolicyHash([...policy].reverse()));
    expect(retentionPolicyHash(policy)).not.toBe(retentionPolicyHash([{ ...policy[0], predicate: "result='OK'" }])); // predicate change invalidates policy hash
  });

  it('uses canonical JSON for privacy export integrity evidence', () => {
    const first = { z: 2, nested: { b: true, a: 1 }, createdAt: new Date('2026-08-14T01:02:03Z') };
    const second = { createdAt: '2026-08-14T01:02:03.000Z', nested: { a: 1, b: true }, z: 2 };
    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(privacyExportHash(first)).toBe(privacyExportHash(second));
  });
});
