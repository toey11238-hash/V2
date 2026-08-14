import { createHash } from 'node:crypto';

export const BACKUP_HASH_ALGORITHM = 'sha256-canonical-json-v1' as const;
export const LEGACY_BACKUP_HASH_ALGORITHM = 'sha256-json-stringify-v0' as const;
export const RESTORE_POLICY_REVISION = 'restore-policy-v2-backup-bound' as const;
export type BackupHashAlgorithm = typeof BACKUP_HASH_ALGORITHM | typeof LEGACY_BACKUP_HASH_ALGORITHM;

function jsonRoundTrip(value: unknown): unknown {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return null;
  return JSON.parse(serialized) as unknown;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, sortJson(record[key])]));
  }
  return value;
}

export function canonicalBackupJson(value: unknown): string {
  return JSON.stringify(sortJson(jsonRoundTrip(value)));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function backupEnvelopeChecksum(input: {
  schemaVersion: number;
  guildId: string;
  kind: string;
  createdAt: string;
  payload: unknown;
  hashAlgorithm?: BackupHashAlgorithm;
}): string {
  const hashAlgorithm = input.hashAlgorithm ?? BACKUP_HASH_ALGORITHM;
  const body = { schemaVersion: input.schemaVersion, guildId: input.guildId, kind: input.kind, createdAt: input.createdAt, payload: input.payload };
  if (hashAlgorithm === BACKUP_HASH_ALGORITHM) return sha256(canonicalBackupJson(body));
  if (hashAlgorithm === LEGACY_BACKUP_HASH_ALGORITHM) return sha256(JSON.stringify(body));
  throw new Error('BACKUP_HASH_ALGORITHM_UNSUPPORTED');
}

export function restorePlanEvidenceHash(input: {
  guildId: string;
  backupId: string;
  backupContentHash: string;
  hashAlgorithm: string;
  changes: readonly unknown[];
}): string {
  if (!/^[0-9a-f]{64}$/.test(input.backupContentHash)) throw new Error('BACKUP_CONTENT_HASH_INVALID');
  return sha256(canonicalBackupJson({
    domain: 'autoserver.restore-plan.v2',
    policyRevision: RESTORE_POLICY_REVISION,
    guildId: input.guildId,
    backupId: input.backupId,
    backupContentHash: input.backupContentHash,
    hashAlgorithm: input.hashAlgorithm,
    changes: input.changes,
  }));
}
