import { describe, expect, it } from 'vitest';
import { transitionTicket, canViewTicket } from '@autoserver/tickets';
import { classifyModerationAction, securityResponseForScore } from '@autoserver/moderation';
import { matchAutomationRule } from '@autoserver/automation';
import { computeReminderInstants, isTaskDue } from '@autoserver/scheduler';
import { registerForEvent, cancelEventRegistration } from '@autoserver/events';
import { createBackupEnvelope, validateBackupEnvelope } from '@autoserver/backups';
import { overallHealth } from '@autoserver/diagnostics';
import { ReplayGuard } from '@autoserver/integrations';
import { aggregateMetric } from '@autoserver/analytics';
import { mayAutoApplyRecommendation } from '@autoserver/recommendations';
import { shouldDeleteTemporaryVoice, updateTemporaryVoiceOccupancy } from '@autoserver/voice';
import { buildVisibilityOverwrites } from '@autoserver/permissions';
import { validateModuleSelection } from '@autoserver/catalog';

describe('support and security domains', () => {
  it('enforces ticket transitions and privacy', () => {
    const claimed = transitionTicket({ status: 'OPEN', participantIds: [], priority: 'NORMAL' }, 'CLAIMED', 'staff-1');
    expect(claimed.claimedBy).toBe('staff-1');
    expect(() => transitionTicket(claimed, 'ARCHIVED', 'staff-1')).toThrow();
    expect(canViewTicket('reporter', { openerId: 'reporter', participantIds: [], staffRole: false })).toBe(true);
    expect(canViewTicket('stranger', { openerId: 'reporter', participantIds: [], staffRole: false })).toBe(false);
  });

  it('does not silently auto-ban by default', () => {
    const decision = classifyModerationAction('BAN', true, 0.99);
    expect(decision.requiresHumanApproval).toBe(true);
    expect(securityResponseForScore(0.7)).toBe('TEMPORARY_LOCK');
  });
});

describe('automation, scheduler and events', () => {
  it('evaluates typed event conditions', () => {
    expect(matchAutomationRule({ ruleId: 'x', eventType: 'member.join', enabled: true, conditions: [{ path: 'newMember', operator: 'EQUALS', value: true }], actions: [] }, 'member.join', { newMember: true })).toBe(true);
  });

  it('computes deterministic reminder times and due state', () => {
    const eventAt = new Date('2026-08-20T12:00:00Z');
    const reminders = computeReminderInstants(eventAt, [60, 10, 60]);
    expect(reminders).toHaveLength(2);
    expect(isTaskDue({ taskId: '1', guildId: 'g', runAt: new Date('2026-08-20T10:00:00Z'), state: 'SCHEDULED', dedupKey: 'a' }, new Date('2026-08-20T11:00:00Z'))).toBe(true);
  });

  it('promotes waitlisted member when a slot opens', () => {
    const first = registerForEvent({ capacity: 1, registered: [], waitlisted: [] }, 'a');
    const second = registerForEvent(first.book, 'b');
    expect(second.status).toBe('WAITLISTED');
    expect(cancelEventRegistration(second.book, 'a').registered).toEqual(['b']);
  });
});

describe('recovery, observability and advisor primitives', () => {
  it('validates backup checksums', () => {
    const backup = createBackupEnvelope({ schemaVersion: 1, guildId: 'g', kind: 'MANUAL', createdAt: '2026-08-14T00:00:00Z', payload: { roles: 2 } });
    expect(validateBackupEnvelope(backup)).toBe(true);
    expect(validateBackupEnvelope({ ...backup, payload: { roles: 3 } })).toBe(false);
  });

  it('aggregates health and metrics without fake values', () => {
    expect(overallHealth([{ key: 'db', state: 'HEALTHY' }, { key: 'gateway', state: 'DEGRADED' }])).toBe('DEGRADED');
    expect(aggregateMetric('latency', [{ metric: 'latency', value: 10, at: new Date() }, { metric: 'latency', value: 30, at: new Date() }]).average).toBe(20);
  });

  it('rejects duplicate webhook deliveries and destructive auto-recommendations', () => {
    const guard = new ReplayGuard(1_000);
    expect(guard.accept('delivery-1', 100)).toBe(true);
    expect(guard.accept('delivery-1', 200)).toBe(false);
    expect(mayAutoApplyRecommendation({ key: 'x', title: 'Delete', reason: 'test', risk: 'LOW', destructive: true, evidence: {} }, 'LOW_RISK_AUTO')).toBe(false);
  });
});

describe('voice, permissions and module dependency checks', () => {
  it('uses an empty grace state before deleting temp voice', () => {
    const room = updateTemporaryVoiceOccupancy({ channelId: 'c', ownerId: 'u', state: 'ACTIVE', memberCount: 1 }, 0, new Date(1_000));
    expect(room.state).toBe('EMPTY_GRACE');
    expect(shouldDeleteTemporaryVoice(room, 5_000, new Date(7_000))).toBe(true);
  });

  it('denies @everyone for staff-only resources', () => {
    const overwrites = buildVisibilityOverwrites({ everyoneId: 'guild', profile: 'STAFF_ONLY', roles: { serverManager: 'manager' } });
    expect(overwrites[0]).toMatchObject({ id: 'guild' });
    expect(overwrites.some((item) => 'id' in item && item.id === 'manager')).toBe(true);
  });

  it('reports missing module dependencies instead of silently enabling broken graphs', () => {
    const result = validateModuleSelection(['gaming']);
    expect(result.missingDependencies.length).toBeGreaterThan(0);
  });
});
