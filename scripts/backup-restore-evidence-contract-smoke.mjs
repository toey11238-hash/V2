import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BACKUP_HASH_ALGORITHM,
  LEGACY_BACKUP_HASH_ALGORITHM,
  RESTORE_POLICY_REVISION,
  backupEnvelopeChecksum,
  canonicalBackupJson,
  restorePlanEvidenceHash,
} from '../packages/backups/src/pure.ts';

let assertions=0;
const ok=(value,message)=>{assert.ok(value,message);assertions+=1;};
const equal=(a,b,message)=>{assert.equal(a,b,message);assertions+=1;};

const bodyA={schemaVersion:3,guildId:'g1',kind:'MANUAL',createdAt:'2026-08-14T00:00:00.000Z',payload:{z:1,a:{y:2,x:3}}};
const bodyB={...bodyA,payload:{a:{x:3,y:2},z:1}};
equal(canonicalBackupJson(bodyA),canonicalBackupJson(bodyB),'canonical backup JSON must ignore object key order');
equal(backupEnvelopeChecksum({...bodyA,hashAlgorithm:BACKUP_HASH_ALGORITHM}),backupEnvelopeChecksum({...bodyB,hashAlgorithm:BACKUP_HASH_ALGORITHM}),'canonical backup hash must survive JSONB key reordering');
ok(backupEnvelopeChecksum({...bodyA,hashAlgorithm:LEGACY_BACKUP_HASH_ALGORITHM})!==backupEnvelopeChecksum({...bodyB,hashAlgorithm:LEGACY_BACKUP_HASH_ALGORITHM}),'legacy stringify hash documents key-order sensitivity');
const changes=[{kind:'UPDATE',logicalKey:'CH_TEST',risk:'MEDIUM',reason:'test'}];
const planHash=restorePlanEvidenceHash({guildId:'g1',backupId:'11111111-1111-4111-8111-111111111111',backupContentHash:'a'.repeat(64),hashAlgorithm:BACKUP_HASH_ALGORITHM,changes});
ok(/^[0-9a-f]{64}$/.test(planHash),'restore plan hash must be sha256');
ok(planHash!==restorePlanEvidenceHash({guildId:'g1',backupId:'11111111-1111-4111-8111-111111111111',backupContentHash:'b'.repeat(64),hashAlgorithm:BACKUP_HASH_ALGORITHM,changes}),'backup content hash must bind restore plan');
ok(planHash!==restorePlanEvidenceHash({guildId:'g1',backupId:'11111111-1111-4111-8111-111111111111',backupContentHash:'a'.repeat(64),hashAlgorithm:BACKUP_HASH_ALGORITHM,changes:[...changes,{kind:'CREATE',logicalKey:'ROLE_X'}]}),'restore changes must bind approval evidence');
ok(RESTORE_POLICY_REVISION.includes('backup-bound'),'restore policy revision must be explicit and versioned');

const [migration,backups,database,server,worker,discordRecovery,dashboard,panels,packageJson]=await Promise.all([
  readFile('packages/database/migrations/050_backup_restore_evidence.sql','utf8'),
  readFile('packages/backups/src/index.ts','utf8'),
  readFile('packages/database/src/index.ts','utf8'),
  readFile('apps/platform/src/http/server.ts','utf8'),
  readFile('apps/platform/src/runtime/restore-worker.ts','utf8'),
  readFile('apps/platform/src/discord/recovery-actions.ts','utf8'),
  readFile('apps/dashboard/src/components/RecoveryConsole.tsx','utf8'),
  readFile('packages/panels/src/index.ts','utf8'),
  readFile('package.json','utf8'),
]);

for(const token of ['CAPTURED','INTEGRITY_CHECKED','RESTORE_VERIFIED','INVALID','LEGACY_UNPROVEN']) ok(migration.includes(token),`migration must encode ${token} lifecycle`);
ok(migration.includes("status = 'LEGACY_UNPROVEN'")&&migration.includes('legacyChecksumMarkedAt'),'legacy checksum-only VERIFIED rows must be downgraded honestly');
ok(migration.includes('CREATE TABLE IF NOT EXISTS backup_verification_evidence'),'verification evidence table must be durable');
ok(migration.includes('BACKUP_VERIFICATION_EVIDENCE_APPEND_ONLY'),'verification evidence must reject ordinary mutation');
ok(migration.includes('pg_trigger_depth() > 1'),'tenant teardown cascade must remain possible');
ok(migration.includes('restore_verified_at')&&migration.includes('integrity_checked_at'),'integrity and restore verification timestamps must be distinct');
ok(migration.includes('sha256-canonical-json-v1')&&migration.includes('sha256-json-stringify-v0'),'hash algorithm provenance must be explicit');

ok(backups.includes('schemaVersion: 3'),'new backups must use v3 canonical envelope');
ok(backups.includes("status: 'CAPTURED'")&&!backups.includes("status: 'VERIFIED'"),'capture must never self-claim VERIFIED');
ok(backups.includes('roundTripValidated'),'capture must read stored payload back before integrity promotion');
ok(backups.includes('BACKUP_STORAGE_INTEGRITY_CHECK_FAILED'),'failed storage round-trip must fail closed');
ok(database.includes("status='RESTORE_VERIFIED'")&&database.includes('last_restore_run_id'),'repository must promote restore verification only with restore evidence');
ok(database.includes("r.state as restore_state")&&database.includes("row.restore_state!=='SUCCEEDED'"),'repository must require a SUCCEEDED restore run before promotion');
ok(database.includes("evidence_type,outcome,restore_run_id")&&database.includes("'RESTORE_VERIFY','PASS'"),'successful restore evidence must be appended');
ok(database.includes("case when $3 then 'INTEGRITY_CHECKED' else 'INVALID' end"),'integrity result must drive lifecycle state');

ok(server.includes('restorePlanEvidenceHash'),'HTTP restore approval must compute evidence hash');
ok(server.includes('backupContentHash:backup.contentHash')&&server.includes('hashAlgorithm:backup.hashAlgorithm'),'approval must bind backup content + algorithm');
ok(server.includes("BACKUP_NOT_RESTORE_ELIGIBLE"),'HTTP path must reject unproven/invalid backups');
ok(worker.includes('RESTORE_PLAN_HASH_MISMATCH'),'worker must recompute and reject stale plan approvals');
ok(worker.includes('RESTORE_BACKUP_HASH_MISMATCH'),'worker must reject backup content change after approval');
ok(worker.includes('run.backupId!==payload.backupId||run.approvalRequestId!==payload.approvalId'),'worker must bind job, run, backup and approval identities');
ok(worker.includes('backupRepo.markRestoreVerified'),'post-apply verification must create backup restore evidence');
ok(worker.includes("backupVerification:'RESTORE_VERIFIED'"),'completion event must expose honest restore verification class');

ok(discordRecovery.includes('ตรวจสอบและจัดเก็บหลักฐานความสมบูรณ์ของข้อมูลสำรองแล้ว')&&discordRecovery.includes('รอการยืนยันการกู้คืน'),'Discord copy must not overclaim restore verification at capture time');
ok(dashboard.includes('สถานะตรวจความสมบูรณ์หมายถึงสแนปช็อตผ่านการตรวจเช็กซัมแบบไป-กลับเท่านั้น')&&dashboard.includes('สถานะยืนยันการกู้คืนจะบันทึกหลังงานกู้คืนภายใต้การควบคุมผ่านการตรวจหลังใช้งานจริงเท่านั้น'),'Dashboard must distinguish checksum integrity from restore proof');
ok(panels.includes('สร้างสแนปช็อตที่ตรวจความสมบูรณ์แล้ว')&&panels.includes('แยกหลักฐานความสมบูรณ์ออกจากหลักฐานยืนยันการกู้คืน')&&panels.includes('ไม่อ้างว่ากู้คืนสำเร็จก่อนผ่านงานกู้คืน'),'managed panel copy must preserve evidence semantics');
const pkg=JSON.parse(packageJson);ok(pkg.scripts?.['test:backup-restore-evidence']!==undefined,'package script must register Phase 16 gate');

equal(BACKUP_HASH_ALGORITHM,'sha256-canonical-json-v1','canonical hash algorithm id must remain versioned');
console.log(`backup-restore-evidence-contract-smoke PASS ${assertions} assertions`);
