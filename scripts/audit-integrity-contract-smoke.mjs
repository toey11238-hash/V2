import { readFile, readdir } from 'node:fs/promises';
import {
  AUDIT_INTEGRITY_ALGORITHM,
  AUDIT_INTEGRITY_ZERO_HASH,
  auditIntegrityEventHash,
  auditIntegrityPayloadHash,
  auditIntegrityScopeKey,
  canonicalAuditJson,
} from '../packages/audit-log/src/pure.ts';

let assertions=0;
function ok(condition,message){assertions+=1;if(!condition)throw new Error(`audit-integrity-contract: ${message}`);}
function includes(source,needle,message){ok(source.includes(needle),message);}

const [migration,database,auditLog,server,operator,panels,dashboard,retention,packageJson]=await Promise.all([
  readFile('packages/database/migrations/049_audit_integrity_chain.sql','utf8'),
  readFile('packages/database/src/index.ts','utf8'),
  readFile('packages/audit-log/src/index.ts','utf8'),
  readFile('apps/platform/src/http/server.ts','utf8'),
  readFile('apps/platform/src/discord/operator-actions.ts','utf8'),
  readFile('packages/panels/src/index.ts','utf8'),
  readFile('apps/dashboard/src/components/AuditExplorer.tsx','utf8'),
  readFile('packages/governance/src/index.ts','utf8'),
  readFile('package.json','utf8'),
]);

ok(canonicalAuditJson({b:2,a:{z:1,y:2}})===canonicalAuditJson({a:{y:2,z:1},b:2}),'canonical JSON must ignore object key order');
ok(auditIntegrityScopeKey('123')==='guild:123','guild scope key must be explicit');
ok(auditIntegrityScopeKey()==='global','global audit scope must remain explicit');
const base={auditId:'11111111-1111-4111-8111-111111111111',guildId:'123',actorId:'42',action:'TEST',resourceType:'PROBE',resourceId:'p1',beforeState:{b:2,a:1},afterState:{ok:true},result:'SUCCEEDED',correlationId:'22222222-2222-4222-8222-222222222222',createdAt:'2026-08-14T08:00:00.000Z'};
const reordered={...base,beforeState:{a:1,b:2}};
const payloadHash=auditIntegrityPayloadHash(base);
ok(payloadHash===auditIntegrityPayloadHash(reordered),'payload hash must be JSONB key-order stable');
ok(/^[0-9a-f]{64}$/.test(payloadHash),'payload hash must be SHA-256 hex');
const eventHash=auditIntegrityEventHash({scopeKey:'guild:123',sequence:1,previousHash:AUDIT_INTEGRITY_ZERO_HASH,payloadHash});
ok(/^[0-9a-f]{64}$/.test(eventHash),'event hash must be SHA-256 hex');
ok(eventHash!==auditIntegrityEventHash({scopeKey:'guild:123',sequence:2,previousHash:AUDIT_INTEGRITY_ZERO_HASH,payloadHash}),'sequence must bind event hash');
ok(eventHash!==auditIntegrityEventHash({scopeKey:'guild:123',sequence:1,previousHash:'1'.repeat(64),payloadHash}),'previous hash must bind event hash');
ok(eventHash!==auditIntegrityEventHash({scopeKey:'guild:123',sequence:1,previousHash:AUDIT_INTEGRITY_ZERO_HASH,payloadHash:'2'.repeat(64)}),'payload hash must bind event hash');
let rejected=false;try{auditIntegrityEventHash({scopeKey:'guild:123',sequence:0,previousHash:AUDIT_INTEGRITY_ZERO_HASH,payloadHash});}catch{rejected=true;}ok(rejected,'invalid sequence must fail closed');

includes(migration,'CREATE TABLE IF NOT EXISTS audit_integrity_heads','migration must create chain head');
includes(migration,'CREATE TABLE IF NOT EXISTS audit_integrity_entries','migration must create append evidence');
includes(migration,'UNIQUE(scope_key, sequence)','sequence must be unique within scope');
includes(migration,"algorithm = 'sha256-canonical-json-v1'",'algorithm must be schema-bound');
includes(migration,'ENABLE ROW LEVEL SECURITY','integrity tables must enable RLS');
includes(migration,'AUDIT_INTEGRITY_APPEND_ONLY','integrity entry mutation must fail closed');
includes(migration,'AUDIT_EVENT_IMMUTABLE_UPDATE','audit content update must fail closed');
includes(migration,'pg_trigger_depth() > 1','guild teardown cascade must remain possible');
ok(!migration.includes('REFERENCES audit_events'),'integrity entries must survive audit-content retention deletion');

includes(database,'return this.db.transaction(async(client)=>','audit write and chain advance must share one transaction');
includes(database,'for update','chain head must be row-locked per scope');
includes(database,'insert into audit_events','audit content write must remain durable');
includes(database,'insert into audit_integrity_entries','chain entry must be durable');
includes(database,'update audit_integrity_heads set next_sequence','chain head must advance atomically');
includes(database,'AUDIT_INTEGRITY_ALGORITHM_MISMATCH','unknown chain algorithm must fail closed');

includes(auditLog,'verifyIntegrityTail','bounded integrity verifier must exist');
includes(auditLog,'ANCHOR_MISMATCH','tail verifier must validate prior anchor');
includes(auditLog,'PAYLOAD_HASH_MISMATCH','retained content must be recomputed');
includes(auditLog,'CHAIN_LINK_MISMATCH','chain continuity must be checked');
includes(auditLog,'HEAD_HASH_MISMATCH','head must match latest checked entry');
includes(auditLog,'UNCHAINED_EVENTS_AFTER_START','direct bypass writes after chain start must be surfaced');
includes(auditLog,'hashOnlyEntries','retention-deleted content must be represented honestly');
includes(auditLog,'eventHashPayload=String(entry.payload_hash)','hash-only entries must still recompute event-hash self-consistency from retained payload hash');
includes(auditLog,'where scope_key=$1 and sequence=1','chain-start lookup must use the indexed genesis sequence rather than an unbounded min scan');
includes(auditLog,'mismatchCount+=1','mismatch count must track all observed mismatches even when samples are capped');
includes(auditLog,"database-tamper-evident-not-external-notarization",'evidence class must not overclaim immutability');

includes(server,"/api/guilds/:guildId/audit/integrity",'guild-scoped HTTP verification route must exist');
includes(operator,"status:audit-integrity",'Discord operator verification action must exist');
includes(panels,"actionKey: 'status:audit-integrity'",'managed status panel must expose audit verification');
includes(dashboard,'ตรวจปลายสายหลักฐาน','Dashboard must expose explicit chain verification');
includes(dashboard,'ไม่ใช่พื้นที่จัดเก็บแบบแก้ไม่ได้หรือการรับรองเข้ารหัสภายนอก','Dashboard must state evidence limitation');
ok(!retention.includes("table:'audit_integrity_entries'"),'ordinary AUDIT retention must not erase integrity metadata');
const productSourceFiles=[];
for(const root of ['apps','packages']){
  for(const relative of await readdir(root,{recursive:true})){
    if(!/\.(?:ts|tsx)$/.test(relative))continue;
    const path=`${root}/${relative}`;
    productSourceFiles.push([path,await readFile(path,'utf8')]);
  }
}
const directAuditWriters=productSourceFiles.filter(([path,source])=>source.includes('insert into audit_events')&&path!=='packages/database/src/index.ts').map(([path])=>path);
ok(directAuditWriters.length===0,`product source must not bypass AuditRepository audit chaining: ${directAuditWriters.join(', ')}`);
const pkg=JSON.parse(packageJson);ok(pkg.scripts?.['test:audit-integrity']!==undefined,'package script must register audit-integrity gate');

ok(AUDIT_INTEGRITY_ALGORITHM==='sha256-canonical-json-v1','algorithm constant must remain versioned');
console.log(`audit-integrity-contract-smoke PASS ${assertions} assertions`);
