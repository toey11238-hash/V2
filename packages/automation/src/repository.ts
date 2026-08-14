import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
import { validateAutomationRuleDefinition, type AutomationRule } from './index.ts';

export interface AutomationSourceEvent{eventId:string;guildId:string;eventType:string;payload:Record<string,unknown>;correlationId:string;createdAt:Date;attempts:number;}

export class AutomationRuleRepository{
  constructor(private readonly database:Database){}
  async listForEvent(guildId:string,eventType:string):Promise<AutomationRule[]>{
    const {rows}=await this.database.requirePool().query<any>(`select rule_id,event_type,conditions,actions,enabled,version from automation_rules where guild_id=$1 and event_type=$2 and enabled=true order by rule_key limit 50`,[guildId,eventType]);
    return rows.map((row:any)=>{const valid=validateAutomationRuleDefinition({eventType:String(row.event_type),conditions:row.conditions,actions:row.actions,enabled:Boolean(row.enabled)});return {ruleId:String(row.rule_id),...valid,version:Number(row.version??1)};});
  }
  async getByKey(guildId:string,ruleKey:string):Promise<AutomationRule|null>{
    const normalized=ruleKey.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._:-]{1,79}$/.test(normalized))throw new Error('AUTOMATION_RULE_KEY_INVALID');
    const row=(await this.database.requirePool().query<any>(`select rule_id,event_type,conditions,actions,enabled,version from automation_rules where guild_id=$1 and rule_key=$2`,[guildId,normalized])).rows[0];
    if(!row)return null;const valid=validateAutomationRuleDefinition({eventType:String(row.event_type),conditions:row.conditions,actions:row.actions,enabled:Boolean(row.enabled)});return {ruleId:String(row.rule_id),...valid,version:Number(row.version??1)};
  }
  async upsert(input:{guildId:string;ruleKey:string;eventType:string;conditions?:unknown;actions?:unknown;enabled?:boolean}):Promise<{ruleId:string;version:number}>{
    const ruleKey=input.ruleKey.trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._:-]{1,79}$/.test(ruleKey))throw new Error('AUTOMATION_RULE_KEY_INVALID');const valid=validateAutomationRuleDefinition(input);
    const {rows}=await this.database.requirePool().query<{rule_id:string;version:number}>(`insert into automation_rules(rule_id,guild_id,rule_key,event_type,conditions,actions,enabled,version) values($1,$2,$3,$4,$5,$6,$7,1) on conflict(guild_id,rule_key) do update set event_type=excluded.event_type,conditions=excluded.conditions,actions=excluded.actions,enabled=excluded.enabled,version=automation_rules.version+1,updated_at=now() returning rule_id,version`,[randomUUID(),input.guildId,ruleKey,valid.eventType,valid.conditions,valid.actions,valid.enabled]);return {ruleId:rows[0]!.rule_id,version:Number(rows[0]!.version)};
  }
}

export class AutomationEventRepository{
  constructor(private readonly database:Database){}
  async seed(limit=100,maxAgeHours=24):Promise<number>{
    const result=await this.database.requirePool().query(`insert into automation_event_receipts(guild_id,event_id,state,next_attempt_at) select e.guild_id,e.event_id,'PENDING',now() from event_outbox e where e.guild_id is not null and e.published_at is not null and e.created_at>=now()-make_interval(hours=>$2) and not exists(select 1 from automation_event_receipts r where r.guild_id=e.guild_id and r.event_id=e.event_id) order by e.created_at asc limit $1 on conflict do nothing`,[Math.max(1,Math.min(500,Math.trunc(limit))),Math.max(1,Math.min(168,Math.trunc(maxAgeHours)))]);return result.rowCount??0;
  }
  async claim(workerId:string,leaseSeconds=60):Promise<AutomationSourceEvent|null>{
    return this.database.transaction(async(client)=>{const {rows}=await client.query<any>(`select r.guild_id,r.event_id,r.attempts,e.event_type,e.payload,e.correlation_id,e.created_at from automation_event_receipts r join event_outbox e on e.event_id=r.event_id and e.guild_id=r.guild_id where r.state in ('PENDING','DEFERRED','RETRYING') and r.next_attempt_at<=now() and (r.lease_expires_at is null or r.lease_expires_at<now()) order by e.created_at asc for update of r skip locked limit 1`);const row=rows[0];if(!row)return null;await client.query(`update automation_event_receipts set state='RUNNING',attempts=attempts+1,lease_owner=$3,lease_expires_at=now()+make_interval(secs=>$4),updated_at=now() where guild_id=$1 and event_id=$2`,[row.guild_id,row.event_id,workerId,Math.max(30,Math.min(300,Math.trunc(leaseSeconds)))]);return {eventId:String(row.event_id),guildId:String(row.guild_id),eventType:String(row.event_type),payload:row.payload??{},correlationId:String(row.correlation_id),createdAt:new Date(row.created_at),attempts:Number(row.attempts??0)+1};});
  }
  async complete(guildId:string,eventId:string,workerId:string):Promise<void>{await this.database.requirePool().query(`update automation_event_receipts set state='SUCCEEDED',processed_at=now(),lease_owner=null,lease_expires_at=null,updated_at=now() where guild_id=$1 and event_id=$2 and lease_owner=$3`,[guildId,eventId,workerId]);}
  async defer(guildId:string,eventId:string,workerId:string,retryAt:Date,reason:string):Promise<void>{await this.database.requirePool().query(`update automation_event_receipts set state='DEFERRED',next_attempt_at=$4,last_error_code=$5,lease_owner=null,lease_expires_at=null,updated_at=now() where guild_id=$1 and event_id=$2 and lease_owner=$3`,[guildId,eventId,workerId,retryAt,reason.slice(0,120)]);}
  async retry(guildId:string,eventId:string,workerId:string,errorCode:string,delaySeconds:number,maxAttempts=6):Promise<void>{await this.database.requirePool().query(`update automation_event_receipts set state=case when attempts>=$6 then 'FAILED' else 'RETRYING' end,next_attempt_at=case when attempts>=$6 then next_attempt_at else now()+make_interval(secs=>$5) end,last_error_code=$4,lease_owner=null,lease_expires_at=null,updated_at=now() where guild_id=$1 and event_id=$2 and lease_owner=$3`,[guildId,eventId,workerId,errorCode.slice(0,120),Math.max(5,Math.min(3600,Math.trunc(delaySeconds))),Math.max(1,Math.min(20,Math.trunc(maxAttempts)))]);}
}

export class AutomationExecutionRepository{
  constructor(private readonly database:Database){}
  async begin(input:{guildId:string;ruleId:string;sourceEventId:string;correlationId:string;ruleVersion:number;actionCount:number;budgetDecision:string}):Promise<{executionId:string;alreadySucceeded:boolean}>{
    return this.database.transaction(async(client)=>{const existing=(await client.query<any>(`select execution_id,status from automation_executions where guild_id=$1 and rule_id=$2 and source_event_id=$3 for update`,[input.guildId,input.ruleId,input.sourceEventId])).rows[0];if(existing?.status==='SUCCEEDED')return {executionId:String(existing.execution_id),alreadySucceeded:true};if(existing){await client.query(`update automation_executions set status='RUNNING',rule_version=$4,action_count=$5,budget_decision=$6,last_error_code=null,started_at=now(),finished_at=null where execution_id=$1 and guild_id=$2 and rule_id=$3`,[existing.execution_id,input.guildId,input.ruleId,input.ruleVersion,input.actionCount,input.budgetDecision]);return {executionId:String(existing.execution_id),alreadySucceeded:false};}const executionId=randomUUID();await client.query(`insert into automation_executions(execution_id,guild_id,rule_id,source_event_id,status,result,correlation_id,rule_version,action_count,budget_decision,started_at) values($1,$2,$3,$4,'RUNNING','{}'::jsonb,$5,$6,$7,$8,now())`,[executionId,input.guildId,input.ruleId,input.sourceEventId,input.correlationId,input.ruleVersion,input.actionCount,input.budgetDecision]);return {executionId,alreadySucceeded:false};});
  }
  async finish(executionId:string,status:'SUCCEEDED'|'FAILED'|'DEFERRED',result:Record<string,unknown>,errorCode?:string):Promise<void>{await this.database.requirePool().query(`update automation_executions set status=$2,result=$3,last_error_code=$4,finished_at=case when $2='DEFERRED' then null else now() end where execution_id=$1`,[executionId,status,result,errorCode??null]);}
}
