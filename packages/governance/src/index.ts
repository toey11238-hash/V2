import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { evaluateRetention, heldRetentionClasses, normalizeRetentionPlan, retentionPlanHash, retentionPolicyHash, validateRetentionHoldClass, type DataClass, type RetentionDataClass, type RetentionHoldClass, type RetentionPlanItem, type RetentionRule } from './retention.js';
import { canonicalJson, privacyExportHash } from './privacy.js';

export type ChangeRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ChangeAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE' | 'MIGRATE' | 'MASS_PERMISSION_CHANGE';

export * from './retention.js';
export * from './privacy.js';

export function classifyChangeRisk(action: ChangeAction, count = 1): ChangeRisk {
  if (action === 'DELETE' || action === 'RESTORE' || action === 'MASS_PERMISSION_CHANGE') return count > 10 ? 'CRITICAL' : 'HIGH';
  if (action === 'MIGRATE') return 'HIGH';
  if (action === 'UPDATE' && count > 25) return 'HIGH';
  if (action === 'UPDATE') return 'MEDIUM';
  return count > 50 ? 'MEDIUM' : 'LOW';
}

export function requiresApproval(risk: ChangeRisk): boolean { return risk === 'HIGH' || risk === 'CRITICAL'; }

export * from './portable-config.js';

export interface PortableConfigImportEvidence {
  importId:string;
  guildId:string;
  sourceGuildId:string;
  sourceSchemaVersion:number;
  targetSchemaVersion:number;
  sourceChecksum:string;
  migratedChecksum:string;
  appliedMigrations:string[];
  planHash:string;
  actionableCount:number;
  conflicts:number;
  actorId?:string;
  createdAt:string;
}

export interface DataExportRequest { requestId: string; guildId: string; userId?: string; requestedBy: string; scope: DataClass[]; createdAt: string; }
export function createDataExportRequest(input: Omit<DataExportRequest,'requestId'|'createdAt'>): DataExportRequest {
  if (input.scope.includes('SECRET')) throw new Error('Secrets cannot be included in user/operator data exports');
  return { ...input, requestId: randomUUID(), createdAt: new Date().toISOString() };
}

import type { Database } from '@autoserver/database';
import { ApprovalRepository } from '@autoserver/database';
import { newCorrelationId } from '@autoserver/core';

const RETENTION_TARGETS: ReadonlyArray<{ dataClass: RetentionDataClass; table:string; timestamp:string; predicate?:string }> = [
  { dataClass:'OPERATIONAL', table:'event_inbox', timestamp:'received_at', predicate:'processed_at is not null' },
  { dataClass:'OPERATIONAL', table:'event_outbox', timestamp:'created_at', predicate:'published_at is not null' },
  { dataClass:'OPERATIONAL', table:'jobs', timestamp:'updated_at', predicate:"status in ('SUCCEEDED','FAILED','CANCELLED','EXPIRED','DEAD_LETTER')" },
  { dataClass:'OPERATIONAL', table:'scheduled_tasks', timestamp:'updated_at', predicate:"state in ('SUCCEEDED','FAILED','CANCELLED')" },
  { dataClass:'ANALYTICS', table:'panel_interaction_events', timestamp:'created_at' },
  { dataClass:'ANALYTICS', table:'analytics_daily', timestamp:'metric_date' },
  { dataClass:'AUDIT', table:'audit_events', timestamp:'created_at' },
  { dataClass:'USER_CONTENT', table:'ticket_transcripts', timestamp:'created_at' },
];

export class PortableConfigAuditRepository {
  constructor(private readonly database:Database){}
  async recordPreview(input:Omit<PortableConfigImportEvidence,'importId'|'createdAt'>):Promise<string>{
    const importId=randomUUID();
    await this.database.requirePool().query(
      `insert into portable_config_import_previews(import_id,guild_id,source_guild_id,source_schema_version,target_schema_version,source_checksum,migrated_checksum,applied_migrations,plan_hash,actionable_count,conflicts,actor_id)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [importId,input.guildId,input.sourceGuildId,input.sourceSchemaVersion,input.targetSchemaVersion,input.sourceChecksum,input.migratedChecksum,input.appliedMigrations,input.planHash,input.actionableCount,input.conflicts,input.actorId??null],
    );
    return importId;
  }
  async list(guildId:string,limit=50):Promise<PortableConfigImportEvidence[]>{
    const safe=Math.max(1,Math.min(200,Math.trunc(limit)));
    const {rows}=await this.database.requirePool().query<any>(`select * from portable_config_import_previews where guild_id=$1 order by created_at desc limit $2`,[guildId,safe]);
    return rows.map((row)=>({importId:String(row.import_id),guildId:String(row.guild_id),sourceGuildId:String(row.source_guild_id),sourceSchemaVersion:Number(row.source_schema_version),targetSchemaVersion:Number(row.target_schema_version),sourceChecksum:String(row.source_checksum),migratedChecksum:String(row.migrated_checksum),appliedMigrations:row.applied_migrations??[],planHash:String(row.plan_hash),actionableCount:Number(row.actionable_count),conflicts:Number(row.conflicts),actorId:row.actor_id??undefined,createdAt:new Date(row.created_at).toISOString()}));
  }
}

export interface RetentionLegalHold {
  holdId:string;
  guildId:string;
  dataClass:RetentionHoldClass;
  state:'ACTIVE'|'RELEASED';
  reason:string;
  createdBy:string;
  releasedBy?:string;
  releaseApprovalId?:string;
  correlationId:string;
  createdAt:string;
  releasedAt?:string;
}

function legalHoldReason(value:string):string{
  const reason=value.trim();
  if(reason.length<10||reason.length>2000) throw new Error('RETENTION_HOLD_REASON_INVALID');
  return reason;
}

function mapLegalHold(row:any):RetentionLegalHold{
  return {holdId:String(row.hold_id),guildId:String(row.guild_id),dataClass:validateRetentionHoldClass(String(row.data_class)),state:row.state,reason:String(row.reason),createdBy:String(row.created_by),releasedBy:row.released_by??undefined,releaseApprovalId:row.release_approval_id??undefined,correlationId:String(row.correlation_id),createdAt:new Date(row.created_at).toISOString(),releasedAt:row.released_at?new Date(row.released_at).toISOString():undefined};
}

async function lockRetentionGovernance(client:PoolClient,guildId:string):Promise<void>{
  await client.query(`select pg_advisory_xact_lock(hashtext($1))`,[`autoserver:retention:${guildId}`]);
}

async function getRetentionRevision(client:PoolClient,guildId:string):Promise<number>{
  await client.query(`insert into data_governance_state(guild_id) values($1) on conflict(guild_id) do nothing`,[guildId]);
  const row=(await client.query<{retention_revision:string|number}>(`select retention_revision from data_governance_state where guild_id=$1`,[guildId])).rows[0];
  const revision=Number(row?.retention_revision??0); if(!Number.isSafeInteger(revision)||revision<1) throw new Error('RETENTION_GOVERNANCE_REVISION_INVALID'); return revision;
}

async function bumpRetentionRevision(client:PoolClient,guildId:string):Promise<number>{
  await getRetentionRevision(client,guildId);
  const row=(await client.query<{retention_revision:string|number}>(`update data_governance_state set retention_revision=retention_revision+1,updated_at=now() where guild_id=$1 returning retention_revision`,[guildId])).rows[0];
  const revision=Number(row?.retention_revision??0); if(!Number.isSafeInteger(revision)||revision<2) throw new Error('RETENTION_GOVERNANCE_REVISION_INVALID'); return revision;
}

export class RetentionLegalHoldRepository {
  constructor(private readonly database:Database){}

  async listActive(guildId:string):Promise<RetentionLegalHold[]>{
    const {rows}=await this.database.requirePool().query<any>(`select * from retention_legal_holds where guild_id=$1 and state='ACTIVE' order by created_at desc`,[guildId]);
    return rows.map(mapLegalHold);
  }

  async activeClasses(guildId:string):Promise<RetentionHoldClass[]>{
    return (await this.listActive(guildId)).map((hold)=>hold.dataClass);
  }

  async create(input:{guildId:string;dataClass:RetentionHoldClass|string;reason:string;createdBy:string;correlationId?:string}):Promise<RetentionLegalHold>{
    const holdId=randomUUID(); const dataClass=validateRetentionHoldClass(input.dataClass); const reason=legalHoldReason(input.reason); const correlationId=input.correlationId??newCorrelationId();
    return this.database.transaction(async(client)=>{await lockRetentionGovernance(client,input.guildId);const row=(await client.query<any>(`insert into retention_legal_holds(hold_id,guild_id,data_class,state,reason,created_by,correlation_id) values($1,$2,$3,'ACTIVE',$4,$5,$6) returning *`,[holdId,input.guildId,dataClass,reason,input.createdBy,correlationId])).rows[0];await bumpRetentionRevision(client,input.guildId);return mapLegalHold(row);});
  }

  async requestRelease(input:{guildId:string;holdId:string;requestedBy:string;reason:string}):Promise<{approvalId:string;hold:RetentionLegalHold}>{
    const approvalId=randomUUID(); const reason=legalHoldReason(input.reason); const correlationId=newCorrelationId(); const expiresAt=new Date(Date.now()+24*60*60_000);
    return this.database.transaction(async(client)=>{
      const hold=(await client.query<any>(`select * from retention_legal_holds where guild_id=$1 and hold_id=$2 for update`,[input.guildId,input.holdId])).rows[0];
      if(!hold||hold.state!=='ACTIVE') throw new Error('RETENTION_HOLD_NOT_ACTIVE');
      if(hold.release_approval_id){
        const existing=(await client.query<any>(`select state,expires_at from approval_requests where guild_id=$1 and approval_id=$2`,[input.guildId,hold.release_approval_id])).rows[0];
        if(existing&&['DRAFT','PENDING','APPROVED'].includes(existing.state)&&(!existing.expires_at||new Date(existing.expires_at).getTime()>Date.now())) throw new Error('RETENTION_HOLD_RELEASE_ALREADY_PENDING');
      }
      await client.query(`insert into approval_requests(approval_id,guild_id,operation_key,risk,state,requested_by,required_approvals,approved_by,payload,correlation_id,expires_at) values($1,$2,'LEGAL_HOLD_RELEASE','CRITICAL','PENDING',$3,2,'{}',$4,$5,$6)`,[approvalId,input.guildId,input.requestedBy,{holdId:input.holdId,dataClass:String(hold.data_class),reason},correlationId,expiresAt]);
      const updated=(await client.query<any>(`update retention_legal_holds set release_approval_id=$3,updated_at=now() where guild_id=$1 and hold_id=$2 and state='ACTIVE' returning *`,[input.guildId,input.holdId,approvalId])).rows[0];
      if(!updated) throw new Error('RETENTION_HOLD_NOT_ACTIVE');
      return {approvalId,hold:mapLegalHold(updated)};
    });
  }

  async executeApprovedRelease(input:{guildId:string;approvalId:string;actorId:string}):Promise<RetentionLegalHold>{
    return this.database.transaction(async(client)=>{
      await lockRetentionGovernance(client,input.guildId);
      const approval=(await client.query<any>(`select * from approval_requests where guild_id=$1 and approval_id=$2 for update`,[input.guildId,input.approvalId])).rows[0];
      if(!approval||approval.operation_key!=='LEGAL_HOLD_RELEASE'||approval.state!=='APPROVED') throw new Error('RETENTION_HOLD_RELEASE_APPROVAL_REQUIRED');
      if(approval.expires_at&&new Date(approval.expires_at).getTime()<=Date.now()) throw new Error('RETENTION_HOLD_RELEASE_APPROVAL_EXPIRED');
      const holdId=String(approval.payload?.holdId??'');
      const hold=(await client.query<any>(`select * from retention_legal_holds where guild_id=$1 and hold_id=$2 for update`,[input.guildId,holdId])).rows[0];
      if(!hold||hold.state!=='ACTIVE'||hold.release_approval_id!==input.approvalId) throw new Error('RETENTION_HOLD_NOT_ACTIVE');
      const released=(await client.query<any>(`update retention_legal_holds set state='RELEASED',released_by=$3,released_at=now(),updated_at=now() where guild_id=$1 and hold_id=$2 and state='ACTIVE' returning *`,[input.guildId,holdId,input.actorId])).rows[0];
      const executed=await client.query(`update approval_requests set state='EXECUTED',updated_at=now() where guild_id=$1 and approval_id=$2 and state='APPROVED'`,[input.guildId,input.approvalId]);
      if(!executed.rowCount) throw new Error('RETENTION_HOLD_RELEASE_APPROVAL_NOT_EXECUTABLE');
      await bumpRetentionRevision(client,input.guildId);
      return mapLegalHold(released);
    });
  }
}

export class RetentionService {
  constructor(private readonly database: Database) {}

  private async assertNoDurableHolds(guildId:string,plan:readonly RetentionPlanItem[]):Promise<void>{
    const held=heldRetentionClasses(plan,await new RetentionLegalHoldRepository(this.database).activeClasses(guildId));
    if(held.length) throw new Error(`RETENTION_LEGAL_HOLD_ACTIVE:${held.join(',')}`);
  }

  async preview(guildId:string,rules:readonly RetentionRule[]):Promise<RetentionPlanItem[]> {
    const plan:RetentionPlanItem[]=[];
    for(const rule of rules){
      const decision=evaluateRetention(rule); if(!decision.deletable || !decision.cutoff) continue;
      for(const target of RETENTION_TARGETS.filter((item)=>item.dataClass===rule.dataClass)){
        const extra=target.predicate ? ` and ${target.predicate}`:'';
        const row=await this.database.requirePool().query<{count:string}>(`select count(*)::text as count from ${target.table} where guild_id=$1 and ${target.timestamp}<$2${extra}`,[guildId,decision.cutoff]);
        plan.push({dataClass:rule.dataClass,table:target.table,cutoff:decision.cutoff.toISOString(),candidateCount:Number(row.rows[0]?.count ?? 0)});
      }
    }
    return normalizeRetentionPlan(plan);
  }

  async requestExecution(input:{guildId:string;requestedBy:string;rules:readonly RetentionRule[]}):Promise<{approvalId:string;plan:RetentionPlanItem[];planHash:string;policyHash:string;governanceRevision:number}> {
    if(input.rules.some((rule)=>rule.legalHold)) throw new Error('RETENTION_LEGAL_HOLD_ACTIVE:CALLER_GUARD');
    const plan=await this.preview(input.guildId,input.rules); const approvalId=randomUUID(); const correlationId=newCorrelationId(); const planHash=retentionPlanHash(plan); const policyHash=retentionPolicyHash(RETENTION_TARGETS);
    const destructive=plan.reduce((sum,item)=>sum+item.candidateCount,0); if(!Number.isSafeInteger(destructive)) throw new Error('RETENTION_PLAN_COUNT_INVALID'); if(destructive===0) throw new Error('RETENTION_NOTHING_TO_DELETE');
    const includesAudit=plan.some((item)=>item.dataClass==='AUDIT' || item.dataClass==='USER_CONTENT'); const risk: 'HIGH'|'CRITICAL' = includesAudit || destructive>10000 ? 'CRITICAL':'HIGH'; const expiresAt=new Date(Date.now()+24*60*60_000);
    return this.database.transaction(async(client)=>{
      await lockRetentionGovernance(client,input.guildId);
      const holdRows=(await client.query<{data_class:string}>(`select data_class from retention_legal_holds where guild_id=$1 and state='ACTIVE'`,[input.guildId])).rows.map((row)=>validateRetentionHoldClass(row.data_class)); const held=heldRetentionClasses(plan,holdRows); if(held.length) throw new Error(`RETENTION_LEGAL_HOLD_ACTIVE:${held.join(',')}`);
      const governanceRevision=await getRetentionRevision(client,input.guildId);
      await client.query(`insert into approval_requests(approval_id,guild_id,operation_key,risk,state,requested_by,required_approvals,approved_by,payload,correlation_id,expires_at) values($1,$2,'RETENTION_DELETE',$3,'PENDING',$4,$5,'{}',$6,$7,$8)`,[approvalId,input.guildId,risk,input.requestedBy,risk==='CRITICAL'?2:1,{plan,planHash,policyHash,governanceRevision},correlationId,expiresAt]);
      return {approvalId,plan,planHash,policyHash,governanceRevision};
    });
  }

  async executeApproved(input:{guildId:string;approvalId:string;actorId:string}):Promise<{deleted:number;examined:number;results:Array<{table:string;examined:number;deleted:number}>;retentionRunId:string}> {
    const approval=await new ApprovalRepository(this.database).get(input.guildId,input.approvalId);
    if(!approval||approval.operationKey!=='RETENTION_DELETE'||approval.state!=='APPROVED') throw new Error('RETENTION_APPROVAL_REQUIRED');
    if(approval.expiresAt&&approval.expiresAt.getTime()<=Date.now()) throw new Error('RETENTION_APPROVAL_EXPIRED');
    const plan=normalizeRetentionPlan(Array.isArray((approval.payload as any).plan)?(approval.payload as any).plan as RetentionPlanItem[]:[]);
    if(!plan.length) throw new Error('RETENTION_PLAN_EMPTY');
    const planHash=retentionPlanHash(plan); if((approval.payload as any).planHash!==planHash) throw new Error('RETENTION_PLAN_HASH_MISMATCH');
    const policyHash=retentionPolicyHash(RETENTION_TARGETS); if((approval.payload as any).policyHash!==policyHash) throw new Error('RETENTION_POLICY_CHANGED');
    const governanceRevision=Number((approval.payload as any).governanceRevision); if(!Number.isSafeInteger(governanceRevision)||governanceRevision<1) throw new Error('RETENTION_GOVERNANCE_REVISION_MISSING');
    await this.assertNoDurableHolds(input.guildId,plan);
    const allowed=new Map(RETENTION_TARGETS.map((target)=>[target.table,target])); const retentionRunId=randomUUID(); const correlationId=approval.correlationId;
    const cutoffAt=new Date(Math.min(...plan.map((item)=>new Date(item.cutoff).getTime())));
    await this.database.requirePool().query(`insert into retention_runs(retention_run_id,guild_id,data_class,cutoff_at,status,correlation_id,approval_id,plan_hash,policy_hash) values($1,$2,'MIXED',$3,'RUNNING',$4,$5,$6,$7)`,[retentionRunId,input.guildId,cutoffAt,correlationId,input.approvalId,planHash,policyHash]);
    try{
      return await this.database.transaction(async(client)=>{
        await lockRetentionGovernance(client,input.guildId);
        const run=(await client.query<any>(`select status,approval_id from retention_runs where guild_id=$1 and retention_run_id=$2 for update`,[input.guildId,retentionRunId])).rows[0];
        if(!run||run.status!=='RUNNING'||String(run.approval_id??'')!==input.approvalId) throw new Error('RETENTION_RUN_NOT_EXECUTABLE');
        const locked=(await client.query<any>(`select * from approval_requests where guild_id=$1 and approval_id=$2 for update`,[input.guildId,input.approvalId])).rows[0];
        if(!locked||locked.operation_key!=='RETENTION_DELETE'||locked.state!=='APPROVED') throw new Error('RETENTION_APPROVAL_REQUIRED');
        if(locked.expires_at&&new Date(locked.expires_at).getTime()<=Date.now()) throw new Error('RETENTION_APPROVAL_EXPIRED');
        const lockedPlan=normalizeRetentionPlan(Array.isArray(locked.payload?.plan)?locked.payload.plan:[]); const lockedHash=retentionPlanHash(lockedPlan);
        if(locked.payload?.planHash!==planHash||lockedHash!==planHash) throw new Error('RETENTION_PLAN_HASH_MISMATCH');
        if(locked.payload?.policyHash!==policyHash||retentionPolicyHash(RETENTION_TARGETS)!==policyHash) throw new Error('RETENTION_POLICY_CHANGED');
        const currentGovernanceRevision=await getRetentionRevision(client,input.guildId); if(Number(locked.payload?.governanceRevision)!==governanceRevision||currentGovernanceRevision!==governanceRevision) throw new Error('RETENTION_GOVERNANCE_REVISION_CHANGED');
        const holdRows=(await client.query<{data_class:string}>(`select data_class from retention_legal_holds where guild_id=$1 and state='ACTIVE' for share`,[input.guildId])).rows.map((row)=>validateRetentionHoldClass(row.data_class));
        const held=heldRetentionClasses(lockedPlan,holdRows); if(held.length) throw new Error(`RETENTION_LEGAL_HOLD_ACTIVE:${held.join(',')}`);
        const results:Array<{table:string;examined:number;deleted:number}>=[];
        for(const item of lockedPlan){
          const target=allowed.get(item.table); if(!target||target.dataClass!==item.dataClass) throw new Error('RETENTION_PLAN_TARGET_INVALID');
          const extra=target.predicate?` and ${target.predicate}`:'';
          const countRow=await client.query<{count:string}>(`select count(*)::text as count from ${target.table} where guild_id=$1 and ${target.timestamp}<$2${extra}`,[input.guildId,new Date(item.cutoff)]); const examined=Number(countRow.rows[0]?.count??0);
          if(!Number.isSafeInteger(examined)||examined<0) throw new Error('RETENTION_PLAN_COUNT_INVALID');
          if(examined>item.candidateCount) throw new Error(`RETENTION_PLAN_EXPANDED:${item.table}`);
          const deletedResult=await client.query(`delete from ${target.table} where guild_id=$1 and ${target.timestamp}<$2${extra}`,[input.guildId,new Date(item.cutoff)]); results.push({table:item.table,examined,deleted:deletedResult.rowCount??0});
        }
        const examined=results.reduce((sum,item)=>sum+item.examined,0); const deleted=results.reduce((sum,item)=>sum+item.deleted,0);
        const executed=await client.query(`update approval_requests set state='EXECUTED',updated_at=now() where guild_id=$1 and approval_id=$2 and state='APPROVED'`,[input.guildId,input.approvalId]); if(!executed.rowCount) throw new Error('RETENTION_APPROVAL_NOT_EXECUTABLE');
        await client.query(`update retention_runs set status='SUCCEEDED',records_examined=$2,records_deleted=$3,finished_at=now(),error_code=null where retention_run_id=$1`,[retentionRunId,examined,deleted]);
        return {deleted,examined,results,retentionRunId};
      });
    }catch(error){
      const code=error instanceof Error?error.message.slice(0,200):'UNKNOWN'; await this.database.requirePool().query(`update retention_runs set status='FAILED',error_code=$2,finished_at=now() where retention_run_id=$1 and status='RUNNING'`,[retentionRunId,code]).catch(()=>undefined); throw error;
    }
  }
}

export interface PrivacyExportArtifact {
  artifactId:string;
  requestId:string;
  guildId:string;
  subjectUserId:string;
  payload:Record<string,unknown>;
  hash:string;
  expiresAt:string;
}

const MAX_PRIVACY_EXPORT_BYTES=2*1024*1024;

export class PrivacyExportService {
  constructor(private readonly database: Database) {}

  async createUserExport(input:{guildId:string;subjectUserId:string;requestedBy:string;ttlHours?:number}):Promise<{requestId:string;artifactId:string;hash:string;expiresAt:string;bytes:number}> {
    if(!/^\d{15,22}$/.test(input.subjectUserId)) throw new Error('PRIVACY_EXPORT_SUBJECT_ID_INVALID');
    const ttlHours=input.ttlHours??24; if(!Number.isInteger(ttlHours)||ttlHours<1||ttlHours>168) throw new Error('PRIVACY_EXPORT_TTL_INVALID');
    const request=createDataExportRequest({guildId:input.guildId,userId:input.subjectUserId,requestedBy:input.requestedBy,scope:['OPERATIONAL','ANALYTICS','USER_CONTENT']}); const pool=this.database.requirePool();
    await pool.query(`insert into data_export_requests(request_id,guild_id,subject_user_id,requested_by,scope,status) values($1,$2,$3,$4,$5,'RUNNING')`,[request.requestId,input.guildId,input.subjectUserId,input.requestedBy,request.scope]);
    try{
      const rowLimits=[1,500,1000,500,1000,1000,250,1000] as const;
      const queries=await this.database.transaction(async(client)=>{
        await client.query('set transaction isolation level repeatable read read only');
        return Promise.all([
          client.query<any>(`select stage,state,joined_at,welcomed_at,verified_at,activated_at from member_onboarding where guild_id=$1 and user_id=$2 limit 2`,[input.guildId,input.subjectUserId]),
          client.query<any>(`select role_key,state,assigned_at,removed_at from self_role_assignments where guild_id=$1 and user_id=$2 order by assigned_at desc limit 501`,[input.guildId,input.subjectUserId]),
          client.query<any>(`select ticket_id,ticket_number,ticket_type,priority,status,subject,created_at,closed_at from tickets where guild_id=$1 and opener_user_id=$2 order by created_at desc limit 1001`,[input.guildId,input.subjectUserId]),
          client.query<any>(`select application_id,application_type,status,answers,created_at from applications where guild_id=$1 and applicant_user_id=$2 order by created_at desc limit 501`,[input.guildId,input.subjectUserId]),
          client.query<any>(`select suggestion_id,status,content,created_at from suggestions where guild_id=$1 and author_user_id=$2 order by created_at desc limit 1001`,[input.guildId,input.subjectUserId]),
          client.query<any>(`select report_id,report_type,priority,status,detail,created_at from reports where guild_id=$1 and reporter_user_id=$2 order by created_at desc limit 1001`,[input.guildId,input.subjectUserId]),
          client.query<any>(`select game_key,platform,region,preferred_roles,rank_label,availability,preferences,updated_at from player_game_profiles where guild_id=$1 and user_id=$2 order by updated_at desc limit 251`,[input.guildId,input.subjectUserId]),
          client.query<any>(`select event_id,status,registered_at,checked_in_at from event_registrations where guild_id=$1 and user_id=$2 order by registered_at desc limit 1001`,[input.guildId,input.subjectUserId]),
        ]);
      });
      if(queries.some((result,index)=>result.rows.length>rowLimits[index]!)) throw new Error('PRIVACY_EXPORT_ROW_LIMIT');
      const payload={schemaVersion:2,guildId:input.guildId,subjectUserId:input.subjectUserId,generatedAt:new Date().toISOString(),onboarding:queries[0].rows,roles:queries[1].rows,tickets:queries[2].rows,applications:queries[3].rows,suggestions:queries[4].rows,reportsAuthored:queries[5].rows,gamingProfiles:queries[6].rows,eventRegistrations:queries[7].rows,excluded:['secrets','staff-only reports about the subject','staff decision/review notes','moderation/security internal evidence','OAuth tokens']};
      const serialized=canonicalJson(payload); const bytes=Buffer.byteLength(serialized,'utf8'); if(bytes>MAX_PRIVACY_EXPORT_BYTES) throw new Error('PRIVACY_EXPORT_TOO_LARGE');
      const hash=privacyExportHash(payload); const artifactId=randomUUID(); const expiresAt=new Date(Date.now()+ttlHours*60*60_000);
      await this.database.transaction(async(client)=>{await client.query(`insert into data_export_artifacts(artifact_id,request_id,guild_id,subject_user_id,payload,content_hash,expires_at) values($1,$2,$3,$4,$5,$6,$7)`,[artifactId,request.requestId,input.guildId,input.subjectUserId,payload,hash,expiresAt]);const updated=await client.query(`update data_export_requests set status='SUCCEEDED',artifact_ref=$2,expires_at=$3,finished_at=now() where request_id=$1 and guild_id=$4 and status='RUNNING'`,[request.requestId,`db://${artifactId}`,expiresAt,input.guildId]);if(!updated.rowCount)throw new Error('PRIVACY_EXPORT_REQUEST_STATE_CHANGED');});
      return {requestId:request.requestId,artifactId,hash,expiresAt:expiresAt.toISOString(),bytes};
    }catch(error){await pool.query(`update data_export_requests set status='FAILED',artifact_ref=null,finished_at=now() where request_id=$1 and guild_id=$2 and status='RUNNING'`,[request.requestId,input.guildId]).catch(()=>undefined);throw error;}
  }

  async getArtifact(input:{guildId:string;artifactId:string}):Promise<PrivacyExportArtifact>{
    const row=(await this.database.requirePool().query<any>(`select artifact_id,request_id,guild_id,subject_user_id,payload,content_hash,expires_at from data_export_artifacts where guild_id=$1 and artifact_id=$2 and expires_at>now()`,[input.guildId,input.artifactId])).rows[0];
    if(!row) throw new Error('PRIVACY_EXPORT_ARTIFACT_NOT_AVAILABLE');
    const payload=(row.payload??{}) as Record<string,unknown>; if(String(payload.guildId??'')!==String(row.guild_id)||String(payload.subjectUserId??'')!==String(row.subject_user_id)) throw new Error('PRIVACY_EXPORT_SCOPE_MISMATCH'); const hash=privacyExportHash(payload); if(hash!==row.content_hash) throw new Error('PRIVACY_EXPORT_HASH_MISMATCH');
    return {artifactId:String(row.artifact_id),requestId:String(row.request_id),guildId:String(row.guild_id),subjectUserId:String(row.subject_user_id),payload,hash,expiresAt:new Date(row.expires_at).toISOString()};
  }
}
