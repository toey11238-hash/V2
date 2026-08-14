import { describe, expect, it } from 'vitest';
import {
  AUDIT_INTEGRITY_ZERO_HASH,
  auditIntegrityEventHash,
  auditIntegrityPayloadHash,
  canonicalAuditJson,
} from '@autoserver/audit-log/pure';

describe('phase 15 audit integrity primitives',()=>{
  it('canonicalizes object key order before hashing',()=>{
    expect(canonicalAuditJson({b:2,a:{d:4,c:3}})).toBe(canonicalAuditJson({a:{c:3,d:4},b:2}));
  });
  it('binds payload, sequence and prior hash',()=>{
    const payload=auditIntegrityPayloadHash({auditId:'11111111-1111-4111-8111-111111111111',guildId:'g1',action:'TEST',result:'SUCCEEDED',correlationId:'22222222-2222-4222-8222-222222222222',createdAt:'2026-08-14T08:00:00.000Z'});
    const first=auditIntegrityEventHash({scopeKey:'guild:g1',sequence:1,previousHash:AUDIT_INTEGRITY_ZERO_HASH,payloadHash:payload});
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(auditIntegrityEventHash({scopeKey:'guild:g1',sequence:2,previousHash:first,payloadHash:payload})).not.toBe(first);
  });
  it('rejects invalid chain material',()=>{
    expect(()=>auditIntegrityEventHash({scopeKey:'guild:g1',sequence:0,previousHash:AUDIT_INTEGRITY_ZERO_HASH,payloadHash:'1'.repeat(64)})).toThrow('AUDIT_INTEGRITY_SEQUENCE_INVALID');
    expect(()=>auditIntegrityEventHash({scopeKey:'guild:g1',sequence:1,previousHash:'bad',payloadHash:'1'.repeat(64)})).toThrow('AUDIT_INTEGRITY_HASH_INVALID');
  });
});
