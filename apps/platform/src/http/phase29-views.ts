import type { Database } from '@autoserver/database';
import type { RealtimeHub } from '@autoserver/realtime';
import { evaluateErrorBudget } from '@autoserver/analytics';
import { buildOperationsIntelligence, type OperationsErrorBudgetEvidence, type OperationsQueueEvidence } from '@autoserver/operations-intelligence';
import { buildEventReplay, type ReplaySourceEvent } from '@autoserver/event-replay';
import { buildRecoveryEvidenceReport } from '@autoserver/recovery-evidence';

const number=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;
const nullableNumber=(value:unknown):number|null=>value==null||!Number.isFinite(Number(value))?null:Number(value);

export async function readOperationsIntelligence(input:{
  database:Database;
  realtime:RealtimeHub;
  guildId:string;
  discord:{enabled:boolean;ready:boolean;guildAvailable:boolean};
}){
  const databaseHealth=await input.database.health();
  const realtimeStats=input.realtime.stats();
  const recentGuildEvents=input.realtime.getRecent(200,(event)=>event.guildId===input.guildId).length;
  const queues:OperationsQueueEvidence[]=[];
  let components:Array<{name:string;label?:string;state:string;lastSeenAgeSeconds:number|null;detail?:string}>=[];
  let incidents={open:0,critical:0};
  const errorBudgets:OperationsErrorBudgetEvidence[]=[];
  if(input.database.configured){
    const pool=input.database.requirePool();
    const [jobs,outbox,inbox,heartbeatRows,incidentRows,jobSlo,notificationSlo,automationSlo]=await Promise.all([
      pool.query<any>(`select count(*) filter(where status='QUEUED')::int as queued,count(*) filter(where status='RUNNING')::int as running,count(*) filter(where status='RETRYING')::int as retrying,count(*) filter(where status='FAILED' and updated_at>=now()-interval '24 hours')::int as failed_24h,count(*) filter(where status='DEAD_LETTER')::int as dead_letter,extract(epoch from (now()-(min(created_at) filter(where status in ('QUEUED','RETRYING'))))) as oldest_pending_age_seconds,max(retry_count)::int as max_attempts from jobs where guild_id=$1`,[input.guildId]),
      pool.query<any>(`select count(*) filter(where published_at is null and coalesce(last_error_code,'')='')::int as queued,count(*) filter(where published_at is null and last_error_code is not null)::int as retrying,count(*) filter(where published_at is null and last_error_code is not null and attempts>=5)::int as failed,extract(epoch from (now()-(min(created_at) filter(where published_at is null)))) as oldest_pending_age_seconds,max(attempts)::int as max_attempts from event_outbox where guild_id=$1`,[input.guildId]),
      pool.query<any>(`select count(*) filter(where processed_at is null and state='RECEIVED')::int as queued,count(*) filter(where processed_at is null and state='PROCESSING')::int as running,count(*) filter(where processed_at is null and state='RETRYING')::int as retrying,count(*) filter(where processed_at is null and last_error_code is not null and attempts>=5)::int as failed,extract(epoch from (now()-(min(received_at) filter(where processed_at is null)))) as oldest_pending_age_seconds,max(attempts)::int as max_attempts from event_inbox where guild_id=$1`,[input.guildId]),
      pool.query<any>(`select component_key,state,extract(epoch from (now()-last_seen_at)) as last_seen_age_seconds,process_role from service_heartbeats order by component_key,last_seen_at desc limit 120`),
      pool.query<any>(`select count(*) filter(where status<>'CLOSED')::int as open,count(*) filter(where status<>'CLOSED' and severity='CRITICAL')::int as critical from operational_incidents where guild_id=$1`,[input.guildId]),
      pool.query<any>(`select count(*) filter(where status='SUCCEEDED')::int as good,count(*)::int as total from jobs where guild_id=$1 and status in ('SUCCEEDED','FAILED','DEAD_LETTER') and coalesce(finished_at,updated_at)>=now()-interval '24 hours'`,[input.guildId]),
      pool.query<any>(`select count(*) filter(where state='DELIVERED')::int as good,count(*)::int as total from notification_deliveries where guild_id=$1 and state in ('DELIVERED','FAILED') and updated_at>=now()-interval '24 hours'`,[input.guildId]),
      pool.query<any>(`select count(*) filter(where state='SUCCEEDED')::int as good,count(*)::int as total from automation_event_receipts where guild_id=$1 and state in ('SUCCEEDED','FAILED') and updated_at>=now()-interval '24 hours'`,[input.guildId]),
    ]);
    const j=jobs.rows[0]??{};queues.push({name:'งานระบบ',queued:number(j.queued),running:number(j.running),retrying:number(j.retrying),failed:number(j.failed_24h),deadLetter:number(j.dead_letter),oldestPendingAgeSeconds:nullableNumber(j.oldest_pending_age_seconds),maxAttempts:nullableNumber(j.max_attempts)});
    const o=outbox.rows[0]??{};queues.push({name:'ขาออกเหตุการณ์',queued:number(o.queued),retrying:number(o.retrying),failed:number(o.failed),oldestPendingAgeSeconds:nullableNumber(o.oldest_pending_age_seconds),maxAttempts:nullableNumber(o.max_attempts)});
    const i=inbox.rows[0]??{};queues.push({name:'ขาเข้าเหตุการณ์',queued:number(i.queued),running:number(i.running),retrying:number(i.retrying),failed:number(i.failed),oldestPendingAgeSeconds:nullableNumber(i.oldest_pending_age_seconds),maxAttempts:nullableNumber(i.max_attempts)});
    const latestByComponent=new Map<string,any>();for(const row of heartbeatRows.rows)if(!latestByComponent.has(String(row.component_key)))latestByComponent.set(String(row.component_key),row);
    const processRoleLabel=(value:unknown)=>({all:'ทุกบทบาท',api:'API',bot:'บอต',worker:'ตัวทำงาน'}[String(value)]??'ไม่ระบุ');
    const componentLabel=(value:unknown)=>({platform:'แพลตฟอร์ม',discord:'Discord','job-worker':'ตัวทำงานคิว',scheduler:'ตัวกำหนดเวลา',outbox:'ขาออกเหตุการณ์',inbox:'ขาเข้าเหตุการณ์','living-panels':'แผงข้อมูลสด',automation:'ระบบอัตโนมัติ'}[String(value)]??'องค์ประกอบระบบ');
    components=[...latestByComponent.values()].map((row)=>({name:String(row.component_key),label:componentLabel(row.component_key),state:String(row.state),lastSeenAgeSeconds:nullableNumber(row.last_seen_age_seconds),detail:`บทบาทโปรเซส ${processRoleLabel(row.process_role)}`}));
    incidents={open:number(incidentRows.rows[0]?.open),critical:number(incidentRows.rows[0]?.critical)};
    const sloInputs=[['งานระบบ',jobSlo.rows[0],0.99],['การแจ้งเตือน',notificationSlo.rows[0],0.98],['ระบบอัตโนมัติ',automationSlo.rows[0],0.99]] as const;
    for(const [name,row,target] of sloInputs){const result=evaluateErrorBudget({good:number(row?.good),total:number(row?.total),targetRatio:target,minimumSamples:20});errorBudgets.push({name,health:result.health,remainingFraction:result.remainingFraction,burnMultiple:result.burnMultiple,total:result.total});}
  }
  return buildOperationsIntelligence({database:{configured:input.database.configured,healthy:databaseHealth.healthy},discord:input.discord,realtime:{clients:realtimeStats.clients,recentGuildEvents,backpressureDisconnects:realtimeStats.backpressureDisconnects,sendFailures:realtimeStats.sendFailures,deduplicatedEvents:realtimeStats.deduplicatedEvents},queues,components,incidents,errorBudgets});
}

export async function readEventReplay(input:{database:Database;realtime:RealtimeHub;guildId:string;limit:number}){
  const limit=Math.max(1,Math.min(500,Math.floor(input.limit)));
  const sourceEvents:ReplaySourceEvent[]=[];
  if(input.database.configured){
    const rows=(await input.database.requirePool().query<any>(`select event_id::text,event_type,payload,correlation_id::text,source,aggregate_key,sequence_no,created_at from event_outbox where guild_id=$1 order by created_at desc limit $2`,[input.guildId,limit])).rows.reverse();
    for(const row of rows)sourceEvents.push({origin:'DURABLE',eventId:String(row.event_id),type:String(row.event_type),guildId:input.guildId,correlationId:String(row.correlation_id),source:row.source?String(row.source):undefined,aggregateKey:row.aggregate_key?String(row.aggregate_key):undefined,sequence:row.sequence_no==null?undefined:Number(row.sequence_no),occurredAt:new Date(row.created_at).toISOString(),payload:row.payload??{}});
  }
  for(const event of input.realtime.getRecent(limit,(item)=>item.guildId===input.guildId))sourceEvents.push({origin:'LIVE',eventId:event.eventId,type:event.type,guildId:event.guildId,correlationId:event.correlationId,source:event.source,aggregateKey:event.aggregateKey,sequence:event.sequence,occurredAt:event.occurredAt,payload:event.payload});
  return buildEventReplay(sourceEvents,limit);
}

export async function readRecoveryEvidence(input:{database:Database;guildId:string;limit?:number}){
  if(!input.database.configured)return buildRecoveryEvidenceReport({limit:input.limit});
  const pool=input.database.requirePool();
  const [backupRows,restoreRows,approvalRows,verificationRows,drillRows]=await Promise.all([
    pool.query<any>(`select backup_id::text,kind,status,content_hash,hash_algorithm,created_at,integrity_checked_at,restore_verified_at,last_restore_run_id::text from backup_snapshots where guild_id=$1 order by created_at desc limit 50`,[input.guildId]),
    pool.query<any>(`select restore_run_id::text,backup_id::text,state,approval_request_id::text,correlation_id::text,created_at,updated_at from restore_runs where guild_id=$1 order by created_at desc limit 80`,[input.guildId]),
    pool.query<any>(`select approval_id::text,state,risk,required_approvals,cardinality(approved_by)::int as approved_count,created_at,updated_at from approval_requests where guild_id=$1 and operation_key='RESTORE_APPLY' order by created_at desc limit 80`,[input.guildId]),
    pool.query<any>(`select evidence_id::text,backup_id::text,evidence_type,outcome,restore_run_id::text,content_hash,hash_algorithm,created_at from backup_verification_evidence where guild_id=$1 order by created_at desc limit 120`,[input.guildId]),
    pool.query<any>(`select drill_id::text,drill_type,status,objective,created_at,started_at,finished_at from recovery_drill_runs where guild_id=$1 order by created_at desc limit 60`,[input.guildId]),
  ]);
  const iso=(value:unknown)=>value instanceof Date?value.toISOString():value?new Date(String(value)).toISOString():undefined;
  return buildRecoveryEvidenceReport({
    backups:backupRows.rows.map((row)=>({backupId:String(row.backup_id),kind:String(row.kind),status:String(row.status),contentHash:String(row.content_hash),hashAlgorithm:String(row.hash_algorithm),createdAt:iso(row.created_at)!,integrityCheckedAt:iso(row.integrity_checked_at),restoreVerifiedAt:iso(row.restore_verified_at),lastRestoreRunId:row.last_restore_run_id?String(row.last_restore_run_id):undefined})),
    restoreRuns:restoreRows.rows.map((row)=>({restoreRunId:String(row.restore_run_id),backupId:String(row.backup_id),state:String(row.state),approvalRequestId:row.approval_request_id?String(row.approval_request_id):undefined,correlationId:row.correlation_id?String(row.correlation_id):undefined,createdAt:iso(row.created_at)!,updatedAt:iso(row.updated_at)})),
    approvals:approvalRows.rows.map((row)=>({approvalId:String(row.approval_id),state:String(row.state),risk:row.risk?String(row.risk):undefined,requiredApprovals:number(row.required_approvals),approvedCount:number(row.approved_count),createdAt:iso(row.created_at)!,updatedAt:iso(row.updated_at)})),
    verification:verificationRows.rows.map((row)=>({evidenceId:String(row.evidence_id),backupId:String(row.backup_id),evidenceType:String(row.evidence_type),outcome:String(row.outcome),restoreRunId:row.restore_run_id?String(row.restore_run_id):undefined,contentHash:String(row.content_hash),hashAlgorithm:String(row.hash_algorithm),createdAt:iso(row.created_at)!})),
    drills:drillRows.rows.map((row)=>({drillId:String(row.drill_id),drillType:String(row.drill_type),status:String(row.status),objective:row.objective?String(row.objective):undefined,createdAt:iso(row.created_at)!,startedAt:iso(row.started_at),finishedAt:iso(row.finished_at)})),
    limit:input.limit,
  });
}

