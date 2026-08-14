import { createHash } from 'node:crypto';

export const AUDIT_INTEGRITY_ALGORITHM = 'sha256-canonical-json-v1' as const;
export const AUDIT_INTEGRITY_ZERO_HASH = '0'.repeat(64);

function sha256(value:string):string{return createHash('sha256').update(value).digest('hex');}
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
export function canonicalAuditJson(value: unknown): string { return JSON.stringify(sortJson(jsonRoundTrip(value))); }

export interface AuditIntegrityPayloadInput {
  auditId: string; guildId?: string; actorId?: string; action: string; resourceType?: string; resourceId?: string;
  beforeState?: unknown; afterState?: unknown; result: string; errorCode?: string; correlationId: string; createdAt: string;
}
export function auditIntegrityScopeKey(guildId?: string): string { return guildId ? `guild:${guildId}` : 'global'; }
export function auditIntegrityPayloadHash(input: AuditIntegrityPayloadInput): string {
  return sha256(canonicalAuditJson({version:1,auditId:input.auditId,guildId:input.guildId??null,actorId:input.actorId??null,action:input.action,resourceType:input.resourceType??null,resourceId:input.resourceId??null,beforeState:input.beforeState??null,afterState:input.afterState??null,result:input.result,errorCode:input.errorCode??null,correlationId:input.correlationId,createdAt:new Date(input.createdAt).toISOString()}));
}
export function auditIntegrityEventHash(input:{scopeKey:string;sequence:bigint|number|string;previousHash:string;payloadHash:string;algorithm?:string}):string{
  const sequence=typeof input.sequence==='bigint'?input.sequence.toString():String(input.sequence);
  if(!/^[1-9][0-9]*$/.test(sequence))throw new Error('AUDIT_INTEGRITY_SEQUENCE_INVALID');
  if(!/^[0-9a-f]{64}$/.test(input.previousHash)||!/^[0-9a-f]{64}$/.test(input.payloadHash))throw new Error('AUDIT_INTEGRITY_HASH_INVALID');
  return sha256(canonicalAuditJson({domain:'autoserver.audit-integrity.v1',algorithm:input.algorithm??AUDIT_INTEGRITY_ALGORITHM,scopeKey:input.scopeKey,sequence,previousHash:input.previousHash,payloadHash:input.payloadHash}));
}
