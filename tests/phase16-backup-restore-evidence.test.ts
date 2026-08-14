import { describe, expect, it } from 'vitest';
import { BACKUP_HASH_ALGORITHM, backupEnvelopeChecksum, canonicalBackupJson, restorePlanEvidenceHash } from '../packages/backups/src/pure.js';

describe('Phase 16 backup/restore evidence primitives',()=>{
  it('canonicalizes JSON object key order',()=>{
    expect(canonicalBackupJson({b:2,a:{z:1,y:2}})).toBe(canonicalBackupJson({a:{y:2,z:1},b:2}));
  });
  it('binds restore plan to backup content hash',()=>{
    const base={guildId:'g1',backupId:'11111111-1111-4111-8111-111111111111',hashAlgorithm:BACKUP_HASH_ALGORITHM,changes:[{kind:'UPDATE',logicalKey:'x'}]};
    expect(restorePlanEvidenceHash({...base,backupContentHash:'a'.repeat(64)})).not.toBe(restorePlanEvidenceHash({...base,backupContentHash:'b'.repeat(64)}));
  });
  it('survives JSONB object reordering',()=>{
    const one={schemaVersion:3,guildId:'g1',kind:'MANUAL',createdAt:'2026-08-14T00:00:00.000Z',payload:{b:2,a:1},hashAlgorithm:BACKUP_HASH_ALGORITHM};
    const two={...one,payload:{a:1,b:2}};
    expect(backupEnvelopeChecksum(one)).toBe(backupEnvelopeChecksum(two));
  });
});
