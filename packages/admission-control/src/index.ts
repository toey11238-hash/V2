import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
import { assessCapacity, DEFAULT_CAPACITY_POLICY, type CapacityPressure } from '@autoserver/capacity';

export * from './pure.js';
import { defaultAdmissionPolicy, evaluateAdmission, normalizeAdmissionPolicy, type AdmissionContext, type AdmissionOperation, type AdmissionPolicy, type AdmissionPressure, type AdmissionResult } from './pure.js';

export class AdmissionControlRepository{
  constructor(private readonly database:Database){}
  async upsert(input:{guildId:string;preset:string;mode:string;failClosedWhenUnknown?:boolean;updatedBy?:string}):Promise<AdmissionPolicy>{
    const policy=normalizeAdmissionPolicy(input);
    const {rows}=await this.database.requirePool().query<any>(`insert into admission_control_policies(guild_id,preset,mode,fail_closed_when_unknown,updated_by) values($1,$2,$3,$4,$5) on conflict(guild_id) do update set preset=excluded.preset,mode=excluded.mode,fail_closed_when_unknown=excluded.fail_closed_when_unknown,updated_by=excluded.updated_by,updated_at=now() returning *`,[policy.guildId,policy.preset,policy.mode,policy.failClosedWhenUnknown,policy.updatedBy??null]);
    return this.mapPolicy(rows[0]);
  }
  async get(guildId:string):Promise<AdmissionPolicy>{
    const {rows}=await this.database.requirePool().query<any>('select * from admission_control_policies where guild_id=$1',[guildId]);
    return rows[0]?this.mapPolicy(rows[0]):defaultAdmissionPolicy(guildId);
  }
  async context(guildId:string,operation:AdmissionOperation):Promise<AdmissionContext>{
    const pool=this.database.requirePool();
    const [capacity,incident,maintenance]=await Promise.all([
      pool.query<any>(`select pressure,created_at from capacity_assessments where guild_id=$1 order by created_at desc limit 1`,[guildId]),
      pool.query<any>(`select exists(select 1 from operational_incidents where guild_id=$1 and severity='CRITICAL' and status not in ('RESOLVED','CLOSED')) as open`,[guildId]),
      pool.query<any>(`select exists(select 1 from maintenance_windows where guild_id=$1 and state='ACTIVE' and starts_at<=now() and (ends_at is null or ends_at>now())) as active`,[guildId]),
    ]);
    const row=capacity.rows[0];
    const fresh=row&&new Date(row.created_at).getTime()>=Date.now()-15*60_000;
    let pressure:AdmissionPressure=fresh?String(row.pressure) as CapacityPressure:'UNKNOWN';
    if(!fresh){
      const evidence=(await pool.query<any>(`select
        (select count(*)::int from resource_mappings where guild_id=$1) as resource_count,
        (select count(*)::int from jobs where guild_id=$1 and status='QUEUED') as queued_jobs,
        (select count(*)::int from jobs where guild_id=$1 and status='RETRYING') as retrying_jobs,
        (select count(*)::int from jobs where guild_id=$1 and status='DEAD_LETTER') as dead_letter_jobs,
        (select count(*)::int from scheduled_tasks where guild_id=$1 and state='SCHEDULED' and run_at<=now()) as due_tasks,
        (select count(*)::int from notification_deliveries where guild_id=$1 and state in ('QUEUED','DEFERRED')) as notification_backlog`,[guildId])).rows[0]??{};
      pressure=assessCapacity({resourceCount:Number(evidence.resource_count??0),queuedJobs:Number(evidence.queued_jobs??0),retryingJobs:Number(evidence.retrying_jobs??0),deadLetterJobs:Number(evidence.dead_letter_jobs??0),dueScheduledTasks:Number(evidence.due_tasks??0),notificationBacklog:Number(evidence.notification_backlog??0),realtimeBackpressureDisconnects:0,realtimeSendFailures:0,criticalOpenIncidents:Boolean(incident.rows[0]?.open)?1:0},DEFAULT_CAPACITY_POLICY).pressure;
    }
    return {operation,pressure,criticalIncidentOpen:Boolean(incident.rows[0]?.open),maintenanceActive:Boolean(maintenance.rows[0]?.active)};
  }
  async evaluate(input:{guildId:string;operation:AdmissionOperation;actorId?:string;correlationId:string;detail?:string}):Promise<AdmissionResult>{
    const [policy,context]=await Promise.all([this.get(input.guildId),this.context(input.guildId,input.operation)]);
    const result=evaluateAdmission(policy,context);
    await this.database.requirePool().query(`insert into admission_decisions(decision_id,guild_id,operation_class,pressure,decision,would_decision,enforced,reason,retry_after_seconds,actor_id,correlation_id,detail) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[randomUUID(),input.guildId,input.operation,result.pressure,result.decision,result.wouldDecision,result.enforced,result.reason,result.retryAfterSeconds??null,input.actorId??null,input.correlationId,input.detail?.slice(0,300)??null]);
    return result;
  }
  private mapPolicy(row:any):AdmissionPolicy{return {guildId:String(row.guild_id),preset:row.preset,mode:row.mode,failClosedWhenUnknown:row.fail_closed_when_unknown!==false,updatedBy:row.updated_by??undefined};}
}
