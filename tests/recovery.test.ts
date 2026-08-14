import { describe, expect, it } from 'vitest';
import { diffPermissionOverwrites, normalizePermissionOverwrites } from '@autoserver/permissions';
import { createBackupEnvelope, planRestore, restoreRequiresApproval, validateBackupEnvelope, type BackupResourceState, type GuildBackupPayload } from '@autoserver/backups';

function resource(logicalKey: string, name: string, ownership = 'TEMPLATE_OWNED'): BackupResourceState {
  return { logicalKey, kind: 'TEXT_CHANNEL', name, ownership };
}

describe('permission drift', () => {
  it('normalizes bitfields deterministically and reports missing/changed principals', () => {
    const before = normalizePermissionOverwrites([
      { id: 'a', allow: 1n, deny: 2n },
      { id: 'extra', allow: 4n, deny: 0n },
    ]);
    const desired = normalizePermissionOverwrites([
      { id: 'a', allow: 1n, deny: 8n },
      { id: 'missing', allow: [16n, 32n], deny: 0n },
    ]);
    expect(diffPermissionOverwrites(before, desired)).toEqual([
      expect.objectContaining({ principalId: 'a', changed: ['DENY'] }),
      expect.objectContaining({ principalId: 'extra', changed: ['EXTRA'] }),
      expect.objectContaining({ principalId: 'missing', changed: ['MISSING'] }),
    ]);
  });
});

describe('backup and restore planning', () => {
  it('checks envelope integrity', () => {
    const payload: GuildBackupPayload = { config: {}, resources: [], panels: [], metadata: { capturedAt: '2026-08-14T00:00:00.000Z' } };
    const envelope = createBackupEnvelope({ schemaVersion: 1, guildId: 'g1', kind: 'MANUAL', createdAt: '2026-08-14T00:00:00.000Z', payload });
    expect(validateBackupEnvelope(envelope)).toBe(true);
    expect(validateBackupEnvelope({ ...envelope, guildId: 'g2' })).toBe(false);
  });

  it('never infers deletion for resources absent from a backup', () => {
    const changes = planRestore([resource('CHANNEL_RULES', 'rules'), resource('CHANNEL_EXTRA', 'manual-ish')], [resource('CHANNEL_RULES', 'server-rules')]);
    expect(changes).toContainEqual(expect.objectContaining({ logicalKey: 'CHANNEL_RULES', kind: 'UPDATE', risk: 'MEDIUM' }));
    expect(changes).toContainEqual(expect.objectContaining({ logicalKey: 'CHANNEL_EXTRA', kind: 'REMOVE_MAPPING', risk: 'HIGH' }));
    expect(restoreRequiresApproval(changes)).toBe(true);
  });

  it('preserves user-owned conflicts', () => {
    const changes = planRestore([resource('CHANNEL_RULES', 'custom-rules', 'USER_OWNED')], [resource('CHANNEL_RULES', 'rules')]);
    expect(changes[0]).toEqual(expect.objectContaining({ kind: 'CONFLICT', risk: 'HIGH' }));
  });
});

describe('permission repair approval binding', () => {
  it('hashes drift deterministically regardless of scan ordering', async () => {
    const { permissionRepairDriftHash } = await import('@autoserver/repair');
    const a = { logicalKey: 'CH_RULES', ownership: 'TEMPLATE_OWNED' as const, before: [{id:'x',allow:'0'}], desired: [{id:'x',allow:'1'}] };
    const b = { logicalKey: 'CH_STAFF', ownership: 'SYSTEM_OWNED' as const, before: [], desired: [{id:'staff',allow:'1'}] };
    expect(permissionRepairDriftHash([a,b])).toBe(permissionRepairDriftHash([b,a]));
    expect(permissionRepairDriftHash([a])).not.toBe(permissionRepairDriftHash([{...a,desired:[{id:'x',allow:'2'}]}]));
  });
});
