import { describe, expect, it } from 'vitest';
import { ProgressTracker } from '@autoserver/core';
import { SetupPlanner, type GuildSnapshot, type ServerBlueprint } from '@autoserver/setup';

const blueprint: ServerBlueprint = {
  key: 'test', version: 1, displayName: 'Test', description: 'test', complexity: 'compact', enabledModules: ['core'],
  resources: [
    { logicalKey: 'ROLE_MEMBER', kind: 'ROLE', name: 'Member', ownership: 'TEMPLATE_OWNED', module: 'core', reason: 'test' },
    { logicalKey: 'CAT_START', kind: 'CATEGORY', name: 'START', ownership: 'TEMPLATE_OWNED', module: 'core', reason: 'test' },
  ],
};

describe('real progress', () => {
  it('derives percent only from actual work units', () => {
    const tracker = new ProgressTracker(4, 'execute');
    expect(tracker.advance().percent).toBe(25);
    expect(tracker.advance(2).percent).toBe(75);
    expect(tracker.advance(10).percent).toBe(100);
  });
  it('uses phase mode when total work is unknown', () => {
    const tracker = new ProgressTracker(null, 'scan');
    expect(tracker.snapshot()).toEqual({ mode: 'phase', phase: 'scan' });
  });
});

describe('desired-state planner', () => {
  it('adopts exactly one matching unmanaged resource instead of duplicating it', () => {
    const snapshot: GuildSnapshot = {
      guildId: '1', name: 'Guild', mappings: [], scannedAt: new Date().toISOString(),
      roles: [{ discordId: 'r1', kind: 'ROLE', name: 'Member' }], channels: [],
    };
    const plan = new SetupPlanner().plan(snapshot, blueprint);
    expect(plan.summary.ADOPT).toBe(1);
    expect(plan.summary.CREATE).toBe(1);
  });

  it('reports duplicate-name ambiguity as conflict', () => {
    const snapshot: GuildSnapshot = {
      guildId: '1', name: 'Guild', mappings: [], scannedAt: new Date().toISOString(), channels: [],
      roles: [{ discordId: 'r1', kind: 'ROLE', name: 'Member' }, { discordId: 'r2', kind: 'ROLE', name: 'Member' }],
    };
    const plan = new SetupPlanner().plan(snapshot, blueprint);
    expect(plan.summary.CONFLICT).toBe(1);
  });

  it('preserves user-owned name drift', () => {
    const snapshot: GuildSnapshot = {
      guildId: '1', name: 'Guild', mappings: [], scannedAt: new Date().toISOString(), channels: [],
      roles: [{ discordId: 'r1', kind: 'ROLE', name: 'Renamed by user', logicalKey: 'ROLE_MEMBER', ownership: 'USER_OWNED' }],
    };
    const plan = new SetupPlanner().plan(snapshot, blueprint);
    expect(plan.actions.find((x) => x.desired.logicalKey === 'ROLE_MEMBER')?.type).toBe('SKIP');
  });
});
