import { BACKUP_HASH_ALGORITHM, LEGACY_BACKUP_HASH_ALGORITHM, backupEnvelopeChecksum, restorePlanEvidenceHash, type BackupHashAlgorithm } from './pure.js';
export type BackupKind = 'MANUAL' | 'SCHEDULED' | 'PRE_MIGRATION' | 'PRE_RESTORE';
export interface BackupEnvelope<T = unknown> { schemaVersion: number; guildId: string; kind: BackupKind; createdAt: string; payload: T; checksum: string; hashAlgorithm?: BackupHashAlgorithm; }

export function createBackupEnvelope<T>(input: Omit<BackupEnvelope<T>, 'checksum' | 'hashAlgorithm'> & { hashAlgorithm?: BackupHashAlgorithm }): BackupEnvelope<T> {
  const hashAlgorithm = input.hashAlgorithm ?? BACKUP_HASH_ALGORITHM;
  const checksum = backupEnvelopeChecksum({ schemaVersion: input.schemaVersion, guildId: input.guildId, kind: input.kind, createdAt: input.createdAt, payload: input.payload, hashAlgorithm });
  return { ...input, hashAlgorithm, checksum };
}

export function validateBackupEnvelope(envelope: BackupEnvelope): boolean {
  const hashAlgorithm = envelope.hashAlgorithm ?? (envelope.schemaVersion >= 3 ? BACKUP_HASH_ALGORITHM : LEGACY_BACKUP_HASH_ALGORITHM);
  try {
    const expected = backupEnvelopeChecksum({ schemaVersion: envelope.schemaVersion, guildId: envelope.guildId, kind: envelope.kind, createdAt: envelope.createdAt, payload: envelope.payload, hashAlgorithm });
    return expected === envelope.checksum;
  } catch {
    return false;
  }
}

export { BACKUP_HASH_ALGORITHM, LEGACY_BACKUP_HASH_ALGORITHM, restorePlanEvidenceHash };

export interface BackupPermissionOverwriteState {
  target: string;
  targetKind: 'ROLE' | 'MEMBER' | 'EVERYONE';
  allow: string;
  deny: string;
}
export interface BackupResourceState {
  logicalKey: string;
  kind: string;
  discordId?: string;
  name: string;
  ownership: string;
  locked?: boolean;
  parentLogicalKey?: string;
  channelType?: string;
  topic?: string;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
  forumDefaultAutoArchiveDuration?: number;
  forumDefaultThreadRateLimitPerUser?: number;
  forumAvailableTags?: Array<{ name: string; moderated: boolean }>;
  rolePermissions?: string;
  roleColor?: number;
  roleHoist?: boolean;
  roleMentionable?: boolean;
  rolePosition?: number;
  permissionOverwrites?: BackupPermissionOverwriteState[];
}

export interface GuildBackupPayload {
  config: Record<string, unknown>;
  resources: BackupResourceState[];
  panels: Array<{ panelId: string; contentVersion: number; contentHash: string; targetChannelId?: string; messageId?: string; lifecycleState: string }>;
  metadata: { sourceGuildName?: string; sourceConfigVersion?: number; capturedAt: string };
}

export type RestoreChangeKind = 'CREATE' | 'UPDATE' | 'KEEP' | 'CONFLICT' | 'REMOVE_MAPPING';
export interface RestoreChange {
  kind: RestoreChangeKind;
  logicalKey: string;
  before?: BackupResourceState;
  desired?: BackupResourceState;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
}

export function planRestore(current: readonly BackupResourceState[], desired: readonly BackupResourceState[]): RestoreChange[] {
  const currentMap = new Map(current.map((item) => [item.logicalKey, item]));
  const desiredMap = new Map(desired.map((item) => [item.logicalKey, item]));
  const changes: RestoreChange[] = [];
  for (const target of desired) {
    const actual = currentMap.get(target.logicalKey);
    if (!actual) {
      changes.push({ kind: 'CREATE', logicalKey: target.logicalKey, desired: target, risk: target.kind === 'ROLE' ? 'MEDIUM' : 'LOW', reason: 'Backup requires a logical resource that is absent.' });
      continue;
    }
    if (actual.locked || actual.ownership === 'USER_OWNED' || actual.ownership === 'LOCKED') {
      if (actual.name !== target.name) changes.push({ kind: 'CONFLICT', logicalKey: target.logicalKey, before: actual, desired: target, risk: 'HIGH', reason: 'Current resource is user-owned/locked and differs from backup.' });
      else changes.push({ kind: 'KEEP', logicalKey: target.logicalKey, before: actual, desired: target, risk: 'LOW', reason: 'Protected resource already matches backup.' });
      continue;
    }
    if (actual.name === target.name) changes.push({ kind: 'KEEP', logicalKey: target.logicalKey, before: actual, desired: target, risk: 'LOW', reason: 'Managed resource already matches backup.' });
    else changes.push({ kind: 'UPDATE', logicalKey: target.logicalKey, before: actual, desired: target, risk: 'MEDIUM', reason: 'Managed resource name differs from backup snapshot.' });
  }
  for (const actual of current) {
    if (desiredMap.has(actual.logicalKey) || actual.ownership === 'USER_OWNED' || actual.ownership === 'LOCKED') continue;
    changes.push({ kind: 'REMOVE_MAPPING', logicalKey: actual.logicalKey, before: actual, risk: 'HIGH', reason: 'Current managed resource is absent from backup; destructive deletion is intentionally not implied.' });
  }
  return changes;
}

export function restoreRequiresApproval(changes: readonly RestoreChange[]): boolean {
  return changes.some((change) => change.risk === 'HIGH' || change.kind === 'UPDATE' || change.kind === 'CREATE');
}

import { randomUUID } from 'node:crypto';
import { BackupSnapshotRepository, GuildConfigRepository, PanelRegistryRepository, ResourceMappingRepository, type Database } from '@autoserver/database';

export class GuildBackupService {
  constructor(private readonly database: Database) {}

  async captureWithId(input: { guildId: string; kind: BackupKind; createdBy?: string; sourceGuildName?: string; resourceDetails?: Record<string, Partial<BackupResourceState>> }): Promise<{ backupId: string; envelope: BackupEnvelope<GuildBackupPayload> }> {
    const [config, mappings, panels] = await Promise.all([
      new GuildConfigRepository(this.database).get(input.guildId),
      new ResourceMappingRepository(this.database).list(input.guildId),
      new PanelRegistryRepository(this.database).list(input.guildId),
    ]);
    const payload: GuildBackupPayload = {
      config: config ? { ...config } : {},
      resources: mappings.map((mapping) => ({ logicalKey: mapping.logicalKey, kind: mapping.resourceKind, discordId: mapping.discordId, name: mapping.nameSnapshot ?? mapping.logicalKey, ownership: mapping.ownership, locked: mapping.locked, ...(input.resourceDetails?.[mapping.logicalKey] ?? {}) })),
      panels: panels.map((panel) => ({ panelId: panel.panelId, contentVersion: panel.contentVersion, contentHash: panel.contentHash, targetChannelId: panel.targetChannelId, messageId: panel.messageId, lifecycleState: panel.lifecycleState })),
      metadata: { sourceGuildName: input.sourceGuildName, sourceConfigVersion: config?.version, capturedAt: new Date().toISOString() },
    };
    const envelope = createBackupEnvelope({ schemaVersion: 3, guildId: input.guildId, kind: input.kind, createdAt: new Date().toISOString(), payload });
    const backupId = randomUUID();
    const backups = new BackupSnapshotRepository(this.database);
    await backups.create({
      backupId, guildId: input.guildId, kind: input.kind, schemaVersion: envelope.schemaVersion, contentHash: envelope.checksum,
      hashAlgorithm: envelope.hashAlgorithm ?? BACKUP_HASH_ALGORITHM, status: 'CAPTURED', payload: envelope as unknown as Record<string, unknown>, metadata: payload.metadata, createdBy: input.createdBy,
    });
    const stored = await backups.get(input.guildId, backupId);
    const storedEnvelope = stored?.payload as unknown as BackupEnvelope<GuildBackupPayload> | undefined;
    const integrityOk = Boolean(storedEnvelope && stored?.contentHash === envelope.checksum && stored.hashAlgorithm === (envelope.hashAlgorithm ?? BACKUP_HASH_ALGORITHM) && validateBackupEnvelope(storedEnvelope));
    const integrityRecorded = await backups.recordIntegrityCheck({
      guildId: input.guildId, backupId, outcome: integrityOk ? 'PASS' : 'FAIL', contentHash: envelope.checksum,
      hashAlgorithm: envelope.hashAlgorithm ?? BACKUP_HASH_ALGORITHM, report: { schemaVersion: envelope.schemaVersion, storageProvider: 'database', roundTripValidated: integrityOk },
    });
    if (!integrityOk || !integrityRecorded) throw new Error('BACKUP_STORAGE_INTEGRITY_CHECK_FAILED');
    return { backupId, envelope };
  }

  async capture(input: { guildId: string; kind: BackupKind; createdBy?: string; sourceGuildName?: string }): Promise<BackupEnvelope<GuildBackupPayload>> {
    return (await this.captureWithId(input)).envelope;
  }

  async plan(guildId: string, envelope: BackupEnvelope<GuildBackupPayload>): Promise<RestoreChange[]> {
    if (!validateBackupEnvelope(envelope) || envelope.guildId !== guildId) throw new Error('Backup checksum or guild scope validation failed');
    const mappings = await new ResourceMappingRepository(this.database).list(guildId);
    const current: BackupResourceState[] = mappings.map((mapping) => ({ logicalKey: mapping.logicalKey, kind: mapping.resourceKind, discordId: mapping.discordId, name: mapping.nameSnapshot ?? mapping.logicalKey, ownership: mapping.ownership, locked: mapping.locked }));
    return planRestore(current, envelope.payload.resources);
  }
}
