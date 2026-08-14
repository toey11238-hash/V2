import { readdir } from 'node:fs/promises';
import { AuditRepository, BackupSnapshotRepository, Database, PanelLiveStateRepository, PluginExecutionRunRepository, ensureGuild, runMigrations } from '../packages/database/src/index.ts';
import { AuditLogService } from '../packages/audit-log/src/index.ts';
import { BACKUP_HASH_ALGORITHM, createBackupEnvelope, validateBackupEnvelope } from '../packages/backups/src/index.ts';
import { createHash, randomUUID } from 'node:crypto';
import { GamingRepository } from '../packages/gaming/src/index.ts';
import type { AppConfig } from '../packages/config/src/index.ts';

const url=process.env.TEST_DATABASE_URL?.trim();
if(!url)throw new Error('TEST_DATABASE_URL_REQUIRED');
if(process.env.ALLOW_TEST_DATABASE!=='1')throw new Error('ALLOW_TEST_DATABASE=1_REQUIRED');
if(process.env.TEST_DATABASE_LABEL!=='DISPOSABLE')throw new Error('TEST_DATABASE_LABEL=DISPOSABLE_REQUIRED');
const parsed=new URL(url);const databaseName=parsed.pathname.replace(/^\//,'');
if(!databaseName||['postgres','template0','template1'].includes(databaseName.toLowerCase()))throw new Error('REFUSE_NON_DISPOSABLE_DATABASE_NAME');

const config={DATABASE_URL:url,DATABASE_SSL:process.env.TEST_DATABASE_SSL==='1',DATABASE_SSL_REJECT_UNAUTHORIZED:process.env.TEST_DATABASE_SSL_REJECT_UNAUTHORIZED!=='0'} as AppConfig;
const database=new Database(config);const pool=database.requirePool();
const evidence:{target:{host:string;database:string};migrations?:unknown;transactionRollback?:boolean;advisoryLock?:boolean;rls?:unknown;indexes?:number;dataGovernance?:unknown;auditIntegrity?:unknown;backupRestoreEvidence?:unknown;pluginSandboxEvidence?:unknown;phase23Gaming?:unknown;phase24Gaming?:unknown;phase27Visual?:unknown}={target:{host:parsed.hostname,database:databaseName}};
try{
  const expected=(await readdir('packages/database/migrations')).filter((name)=>/^\d+.*\.sql$/.test(name)).sort();
  const appliedNow=await runMigrations(database);
  const applied=await pool.query<{version:string}>('select version from schema_migrations order by version');
  if(applied.rows.length!==expected.length||applied.rows.some((row,index)=>row.version!==expected[index]))throw new Error('MIGRATION_SET_MISMATCH');
  evidence.migrations={expected:expected.length,appliedNow:appliedNow.length,latest:expected.at(-1)};

  const client=await pool.connect();
  try{await client.query('begin');await client.query('create table autoserver_gate_rollback_probe(id integer primary key)');await client.query('insert into autoserver_gate_rollback_probe values(1)');await client.query('rollback');const probe=await client.query<{exists:string|null}>("select to_regclass('public.autoserver_gate_rollback_probe')::text as exists");evidence.transactionRollback=probe.rows[0]?.exists==null;}
  finally{client.release();}
  if(!evidence.transactionRollback)throw new Error('TRANSACTION_ROLLBACK_FAILED');

  const lockA=await pool.connect();const lockB=await pool.connect();
  try{const a=await lockA.query<{ok:boolean}>("select pg_try_advisory_lock(hashtext('autoserver-live-gate')) as ok");const b=await lockB.query<{ok:boolean}>("select pg_try_advisory_lock(hashtext('autoserver-live-gate')) as ok");evidence.advisoryLock=Boolean(a.rows[0]?.ok)&&!Boolean(b.rows[0]?.ok);await lockA.query("select pg_advisory_unlock(hashtext('autoserver-live-gate'))");}
  finally{lockA.release();lockB.release();}
  if(!evidence.advisoryLock)throw new Error('ADVISORY_LOCK_EXCLUSION_FAILED');

  const rls=await pool.query<{total:number;without_rls:number}>(`select count(*)::int as total,count(*) filter(where not c.relrowsecurity)::int as without_rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname<>'schema_migrations'`);
  evidence.rls=rls.rows[0];if(Number(rls.rows[0]?.without_rls??0)>0)throw new Error(`RLS_MISSING_ON_${rls.rows[0]?.without_rls}_PUBLIC_TABLES`);
  const governanceTables=await pool.query<{governance_state:string|null;legal_holds:string|null}>(`select to_regclass('public.data_governance_state')::text as governance_state,to_regclass('public.retention_legal_holds')::text as legal_holds`);
  const governanceColumns=await pool.query<{column_name:string}>(`select column_name from information_schema.columns where table_schema='public' and table_name='retention_runs' and column_name in ('approval_id','plan_hash','policy_hash','error_code') order by column_name`);
  evidence.dataGovernance={tables:governanceTables.rows[0],retentionRunColumns:governanceColumns.rows.map((row)=>row.column_name)};
  if(!governanceTables.rows[0]?.governance_state||!governanceTables.rows[0]?.legal_holds||governanceColumns.rows.length!==4)throw new Error('DATA_GOVERNANCE_SCHEMA_INCOMPLETE');

  const auditGuild=`live-gate-audit-${randomUUID()}`;await ensureGuild(database,{id:auditGuild,name:'Live Gate Audit Integrity'});
  try{
    const auditId=randomUUID();const repository=new AuditRepository(database);const write=await repository.record({auditId,guildId:auditGuild,actorId:'live-gate',action:'AUDIT_INTEGRITY_PROBE',resourceType:'LIVE_GATE',resourceId:'probe',beforeState:{b:2,a:1},afterState:{ok:true},result:'SUCCEEDED',correlationId:randomUUID()});
    const first=await new AuditLogService(database).verifyIntegrityTail(auditGuild,50);if(first.state!=='HEALTHY'||first.recomputedEntries!==1||first.headSequence!=='1')throw new Error('AUDIT_INTEGRITY_INITIAL_VERIFY_FAILED');
    let immutableUpdateBlocked=false;try{await pool.query(`update audit_events set action='TAMPERED' where audit_id=$1`,[auditId]);}catch{immutableUpdateBlocked=true;}if(!immutableUpdateBlocked)throw new Error('AUDIT_EVENT_UPDATE_NOT_BLOCKED');
    await pool.query(`delete from audit_events where audit_id=$1`,[auditId]);const retained=await pool.query<{count:string}>(`select count(*)::text as count from audit_integrity_entries where audit_id=$1`,[auditId]);if(Number(retained.rows[0]?.count??0)!==1)throw new Error('AUDIT_INTEGRITY_ENTRY_DID_NOT_SURVIVE_RETENTION_DELETE');
    const hashOnly=await new AuditLogService(database).verifyIntegrityTail(auditGuild,50);if(hashOnly.state!=='HEALTHY'||hashOnly.hashOnlyEntries!==1)throw new Error('AUDIT_HASH_ONLY_VERIFY_FAILED');
    const bypassId=randomUUID();await pool.query(`insert into audit_events(audit_id,guild_id,actor_id,action,result,correlation_id) values($1,$2,'live-gate','BYPASS_PROBE','SUCCEEDED',$3)`,[bypassId,auditGuild,randomUUID()]);
    const bypass=await new AuditLogService(database).verifyIntegrityTail(auditGuild,50);if(bypass.state!=='DEGRADED'||bypass.unchainedAfterStart<1)throw new Error('AUDIT_UNCHAINED_BYPASS_NOT_DETECTED');
    await pool.query(`delete from audit_events where audit_id=$1`,[bypassId]);
    const recovered=await new AuditLogService(database).verifyIntegrityTail(auditGuild,50);if(recovered.state!=='HEALTHY')throw new Error('AUDIT_INTEGRITY_RECOVERY_VERIFY_FAILED');
    evidence.auditIntegrity={sequence:write.sequence,initial:first.state,updateImmutable:immutableUpdateBlocked,retentionHashOnly:hashOnly.hashOnlyEntries,bypassDetected:bypass.unchainedAfterStart,recovered:recovered.state};
  } finally {
    await pool.query(`delete from audit_events where guild_id=$1`,[auditGuild]);
    await pool.query(`delete from guilds where guild_id=$1`,[auditGuild]);
  }


  const backupGuild=`live-gate-backup-${randomUUID()}`;await ensureGuild(database,{id:backupGuild,name:'Live Gate Backup Evidence'});
  try{
    const backupId=randomUUID();const backups=new BackupSnapshotRepository(database);const correlationId=randomUUID();
    const envelope=createBackupEnvelope({schemaVersion:3,guildId:backupGuild,kind:'MANUAL',createdAt:new Date().toISOString(),payload:{config:{},resources:[],panels:[],metadata:{capturedAt:new Date().toISOString()}}});
    await backups.create({backupId,guildId:backupGuild,kind:'MANUAL',schemaVersion:3,contentHash:envelope.checksum,hashAlgorithm:BACKUP_HASH_ALGORITHM,status:'CAPTURED',payload:envelope as unknown as Record<string,unknown>,metadata:{liveGate:true},createdBy:'live-gate'});
    const stored=await backups.get(backupGuild,backupId);if(!stored?.payload||!validateBackupEnvelope(stored.payload as any))throw new Error('BACKUP_CANONICAL_ROUNDTRIP_FAILED');
    const integrity=await backups.recordIntegrityCheck({guildId:backupGuild,backupId,outcome:'PASS',contentHash:envelope.checksum,hashAlgorithm:BACKUP_HASH_ALGORITHM,correlationId,report:{liveGate:true}});if(!integrity)throw new Error('BACKUP_INTEGRITY_PROMOTION_FAILED');
    const restoreRunId=randomUUID();await pool.query(`insert into restore_runs(restore_run_id,guild_id,backup_id,state,plan,result,requested_by,correlation_id) values($1,$2,$3,'SUCCEEDED','{}'::jsonb,'{}'::jsonb,'live-gate',$4)`,[restoreRunId,backupGuild,backupId,correlationId]);
    await backups.markRestoreVerified({guildId:backupGuild,backupId,restoreRunId,contentHash:envelope.checksum,hashAlgorithm:BACKUP_HASH_ALGORITHM,correlationId,report:{liveGate:true}});
    const verified=await backups.get(backupGuild,backupId);if(verified?.status!=='RESTORE_VERIFIED'||!verified.restoreVerifiedAt)throw new Error('BACKUP_RESTORE_VERIFICATION_PROMOTION_FAILED');
    const evidenceRows=await pool.query<{count:string}>(`select count(*)::text as count from backup_verification_evidence where guild_id=$1 and backup_id=$2`,[backupGuild,backupId]);if(Number(evidenceRows.rows[0]?.count??0)<2)throw new Error('BACKUP_VERIFICATION_EVIDENCE_MISSING');
    let immutable=false;try{await pool.query(`update backup_verification_evidence set outcome='FAIL' where backup_id=$1`,[backupId]);}catch{immutable=true;}if(!immutable)throw new Error('BACKUP_VERIFICATION_EVIDENCE_NOT_APPEND_ONLY');
    evidence.backupRestoreEvidence={status:verified.status,integrityCheckedAt:verified.integrityCheckedAt,restoreVerifiedAt:verified.restoreVerifiedAt,evidenceCount:Number(evidenceRows.rows[0]?.count??0),appendOnly:immutable};
  } finally { await pool.query(`delete from guilds where guild_id=$1`,[backupGuild]); }

  const pluginGuild=`live-gate-plugin-${randomUUID()}`;await ensureGuild(database,{id:pluginGuild,name:'Live Gate Plugin Sandbox Evidence'});
  try{
    const pluginKey='live-gate-third-party';
    await pool.query(`insert into plugin_installations(guild_id,plugin_key,version,state,manifest,config,installed_by,execution_mode,trust_level,entrypoint_path,enabled) values($1,$2,'1.0.0','INSTALLED','{}'::jsonb,'{}'::jsonb,'live-gate','EXTERNAL_PROCESS','THIRD_PARTY','/plugin/index.mjs',true)`,[pluginGuild,pluginKey]);
    const runs=new PluginExecutionRunRepository(database);const runId=randomUUID();
    await runs.start({runId,guildId:pluginGuild,pluginKey,action:'sandbox-probe',requestId:`req-${randomUUID()}`,correlationId:randomUUID()});
    await runs.finish({runId,status:'SUCCEEDED',durationMs:1,isolationProfile:'LINUX_NS_SECCOMP_V1'});
    const persisted=await pool.query<{isolation_profile:string|null}>(`select isolation_profile from plugin_execution_runs where run_id=$1`,[runId]);
    if(persisted.rows[0]?.isolation_profile!=='LINUX_NS_SECCOMP_V1')throw new Error('PLUGIN_SANDBOX_ISOLATION_EVIDENCE_NOT_PERSISTED');
    let invalidBlocked=false;try{await pool.query(`update plugin_execution_runs set isolation_profile='INVALID_PROFILE' where run_id=$1`,[runId]);}catch{invalidBlocked=true;}
    if(!invalidBlocked)throw new Error('PLUGIN_SANDBOX_ISOLATION_CONSTRAINT_NOT_ENFORCED');
    const index=await pool.query<{exists:string|null}>(`select to_regclass('public.idx_plugin_execution_runs_isolation_created')::text as exists`);
    if(!index.rows[0]?.exists)throw new Error('PLUGIN_SANDBOX_ISOLATION_INDEX_MISSING');
    evidence.pluginSandboxEvidence={profile:persisted.rows[0].isolation_profile,constraintRejectsInvalid:invalidBlocked,index:index.rows[0].exists};
  } finally { await pool.query(`delete from guilds where guild_id=$1`,[pluginGuild]); }

  const gamingGuild=`live-gate-gaming-${randomUUID()}`;await ensureGuild(database,{id:gamingGuild,name:'Live Gate Gaming Sessions'});
  try{
    const gaming=new GamingRepository(database);
    await gaming.enableGame(gamingGuild,{gameKey:'livegate',displayName:'Live Gate Game',featureFlags:{sessions:true,availability:true}});
    const saved=await gaming.replaceAvailabilityWindows(gamingGuild,'100000000000000001','livegate','UTC',[{weekday:1,startMinute:1080,endMinute:1200}]);
    if(saved.length!==1)throw new Error('PHASE23_AVAILABILITY_ROUNDTRIP_FAILED');
    const record=await gaming.createSession({guildId:gamingGuild,gameKey:'livegate',hostUserId:'100000000000000001',title:'Live Gate Session',startsAt:new Date(Date.now()+10*60_000),durationMinutes:60,capacity:2,waitlistCapacity:5});
    const joins=await Promise.all([gaming.joinSession(gamingGuild,record.sessionId,'100000000000000002'),gaming.joinSession(gamingGuild,record.sessionId,'100000000000000003')]);
    const joined=joins.filter((item)=>item.joined).length;const waitlisted=joins.filter((item)=>item.waitlisted).length;
    if(joined!==1||waitlisted!==1)throw new Error('PHASE24_SESSION_ADMISSION_RACE_FAILED');
    const joinedUser=joins.find((item)=>item.joined)?.record.participantIds.find((id)=>id!=='100000000000000001');if(!joinedUser)throw new Error('PHASE24_JOINED_USER_MISSING');
    const left=await gaming.leaveSession(gamingGuild,record.sessionId,joinedUser);if(left.promotedUserIds.length!==1||left.record.participantIds.length!==2||left.record.waitlistedUserIds.length!==0)throw new Error('PHASE24_WAITLIST_PROMOTION_FAILED');
    const checked=await gaming.checkInSession(gamingGuild,record.sessionId,'100000000000000001');if(!checked.checkedInUserIds.includes('100000000000000001'))throw new Error('PHASE24_SESSION_CHECKIN_FAILED');
    const ready=await gaming.transitionSession(gamingGuild,record.sessionId,'100000000000000001','MARK_READY');
    if(ready.status!=='READY'||ready.participantIds.length!==2)throw new Error('PHASE23_SESSION_STATE_FAILED');
    const tables=await pool.query<{availability:string|null;sessions:string|null;participants:string|null}>(`select to_regclass('public.gaming_availability_windows')::text as availability,to_regclass('public.gaming_sessions')::text as sessions,to_regclass('public.gaming_session_participants')::text as participants`);
    if(!tables.rows[0]?.availability||!tables.rows[0]?.sessions||!tables.rows[0]?.participants)throw new Error('PHASE23_GAMING_SCHEMA_INCOMPLETE');
    evidence.phase23Gaming={tables:tables.rows[0],availabilityWindows:saved.length,status:ready.status,participantCount:ready.participantIds.length};evidence.phase24Gaming={admissionRace:{joined,waitlisted},promoted:left.promotedUserIds.length,checkedIn:checked.checkedInUserIds.length,waitlistRemaining:left.record.waitlistedUserIds.length};
  } finally { await pool.query(`delete from guilds where guild_id=$1`,[gamingGuild]); }


  const visualGuild=`live-gate-visual-${randomUUID()}`;await ensureGuild(database,{id:visualGuild,name:'Live Gate Visual Experience'});
  try{
    const states=new PanelLiveStateRepository(database);const eventId=randomUUID();const stateHash=createHash('sha256').update(`PANEL_SERVER_PULSE:LIVE:${eventId}`).digest('hex');
    const first=await states.applyTransition({guildId:visualGuild,panelId:'PANEL_SERVER_PULSE',eventId,eventType:'gaming.session.started',correlationId:randomUUID(),state:'LIVE',stateHash,reason:'Live gate visual event',expiresAt:new Date(Date.now()-1000),metadata:{liveGate:true}});
    const duplicate=await states.applyTransition({guildId:visualGuild,panelId:'PANEL_SERVER_PULSE',eventId,eventType:'gaming.session.started',state:'LIVE',stateHash,reason:'Live gate visual event',expiresAt:new Date(Date.now()-1000),metadata:{liveGate:true}});
    if(!first.applied||duplicate.applied||duplicate.record.revision!==first.record.revision)throw new Error('PHASE27_LIVING_PANEL_EVENT_DEDUP_FAILED');
    await states.markRendered(visualGuild,'PANEL_SERVER_PULSE',new Date(),15_000);const rendered=await states.get(visualGuild,'PANEL_SERVER_PULSE');if(!rendered?.lastRenderedAt||!rendered.minUpdateAfter)throw new Error('PHASE27_LIVING_PANEL_RENDER_EVIDENCE_FAILED');
    const idleHash=createHash('sha256').update('IDLE:event-state-expired').digest('hex');const expired=await states.expire(visualGuild,'PANEL_SERVER_PULSE',idleHash,new Date());if(expired?.state!=='IDLE'||expired.expiresAt)throw new Error('PHASE27_LIVING_PANEL_EXPIRY_FAILED');
    const tables=await pool.query<{states:string|null;events:string|null}>(`select to_regclass('public.panel_live_states')::text as states,to_regclass('public.panel_live_state_events')::text as events`);if(!tables.rows[0]?.states||!tables.rows[0]?.events)throw new Error('PHASE27_VISUAL_SCHEMA_INCOMPLETE');
    const events=await pool.query<{count:string}>(`select count(*)::text as count from panel_live_state_events where guild_id=$1 and panel_id='PANEL_SERVER_PULSE'`,[visualGuild]);if(Number(events.rows[0]?.count??0)!==1)throw new Error('PHASE27_LIVING_PANEL_EVENT_EVIDENCE_COUNT_FAILED');
    evidence.phase27Visual={tables:tables.rows[0],eventDedup:true,revision:expired.revision,state:expired.state,renderEvidence:true,eventRows:Number(events.rows[0]?.count??0)};
  } finally { await pool.query(`delete from guilds where guild_id=$1`,[visualGuild]); }

  const indexes=await pool.query<{count:number}>(`select count(*)::int as count from pg_indexes where schemaname='public'`);evidence.indexes=Number(indexes.rows[0]?.count??0);
  console.log(JSON.stringify({ok:true,evidence},null,2));
} finally { await database.close(); }
