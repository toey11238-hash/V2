import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type BudgetMode='OBSERVE'|'ENFORCE';
export type BudgetDecisionKind='ALLOW'|'OBSERVE_OVER'|'DEFER';
export const RESOURCE_BUDGET_KEYS=['provider.sync','background.analytics','background.backup','notification.fanout','bulk.automation'] as const;
export type ResourceBudgetKey=typeof RESOURCE_BUDGET_KEYS[number];
const RESOURCE_BUDGET_KEY_SET=new Set<string>(RESOURCE_BUDGET_KEYS);
export interface ResourceBudgetPolicy{
  guildId:string;
  budgetKey:ResourceBudgetKey;
  enabled:boolean;
  mode:BudgetMode;
  windowSeconds:number;
  maxUnits:number;
  updatedBy?:string;
  updatedAt?:string;
}
export interface BudgetDecision{
  decision:BudgetDecisionKind;
  budgetKey:ResourceBudgetKey;
  units:number;
  usedBefore:number;
  usedAfter:number;
  maxUnits:number;
  windowStartedAt:string;
  retryAt?:string;
  mode:BudgetMode;
  enabled:boolean;
}

export const DEFAULT_RESOURCE_BUDGETS:Readonly<Record<ResourceBudgetKey,{windowSeconds:number;maxUnits:number;mode:BudgetMode}>>={
  'provider.sync':{windowSeconds:3600,maxUnits:24,mode:'ENFORCE'},
  'background.analytics':{windowSeconds:3600,maxUnits:24,mode:'ENFORCE'},
  'background.backup':{windowSeconds:86400,maxUnits:8,mode:'ENFORCE'},
  'notification.fanout':{windowSeconds:600,maxUnits:2000,mode:'OBSERVE'},
  'bulk.automation':{windowSeconds:600,maxUnits:120,mode:'ENFORCE'},
};

function clampInteger(value:number,min:number,max:number,code:string):number{
  if(!Number.isFinite(value))throw new Error(code);
  const normalized=Math.trunc(value);
  if(normalized<min||normalized>max)throw new Error(code);
  return normalized;
}
export function isRegisteredBudgetKey(value:string):value is ResourceBudgetKey{return RESOURCE_BUDGET_KEY_SET.has(value);}
export function validateBudgetKey(value:string):ResourceBudgetKey{
  const key=value.trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9._:-]{1,79}$/.test(key))throw new Error('BUDGET_KEY_INVALID');
  if(!isRegisteredBudgetKey(key))throw new Error('BUDGET_KEY_UNREGISTERED');
  return key;
}
export function normalizeBudgetPolicy(input:{guildId:string;budgetKey:string;enabled?:boolean;mode?:string;windowSeconds:number;maxUnits:number;updatedBy?:string}):ResourceBudgetPolicy{
  const mode=String(input.mode??'ENFORCE').toUpperCase();if(mode!=='OBSERVE'&&mode!=='ENFORCE')throw new Error('BUDGET_MODE_INVALID');
  return {guildId:input.guildId,budgetKey:validateBudgetKey(input.budgetKey),enabled:input.enabled!==false,mode,windowSeconds:clampInteger(input.windowSeconds,60,86400,'BUDGET_WINDOW_INVALID'),maxUnits:clampInteger(input.maxUnits,1,1_000_000,'BUDGET_MAX_UNITS_INVALID'),updatedBy:input.updatedBy};
}
export function defaultBudgetPolicy(guildId:string,budgetKey:string):ResourceBudgetPolicy{
  const key=validateBudgetKey(budgetKey);const preset=DEFAULT_RESOURCE_BUDGETS[key];
  return {guildId,budgetKey:key,enabled:true,mode:preset.mode,windowSeconds:preset.windowSeconds,maxUnits:preset.maxUnits};
}
export function budgetWindowStart(now:Date,windowSeconds:number):Date{
  const seconds=clampInteger(windowSeconds,60,86400,'BUDGET_WINDOW_INVALID');
  const size=seconds*1000;return new Date(Math.floor(now.getTime()/size)*size);
}
export function previewBudgetDecision(input:{policy:ResourceBudgetPolicy;usedBefore:number;units:number;now?:Date}):BudgetDecision{
  const usedBefore=clampInteger(input.usedBefore,0,1_000_000_000,'BUDGET_USED_INVALID');const units=clampInteger(input.units,1,1_000_000,'BUDGET_UNITS_INVALID');const now=input.now??new Date();const start=budgetWindowStart(now,input.policy.windowSeconds);const projected=usedBefore+units;const over=projected>input.policy.maxUnits;
  const decision:BudgetDecisionKind=!input.policy.enabled?'ALLOW':over?(input.policy.mode==='ENFORCE'?'DEFER':'OBSERVE_OVER'):'ALLOW';
  const accepted=decision!=='DEFER';const retryAt=decision==='DEFER'?new Date(start.getTime()+input.policy.windowSeconds*1000).toISOString():undefined;
  return {decision,budgetKey:input.policy.budgetKey,units,usedBefore,usedAfter:accepted?projected:usedBefore,maxUnits:input.policy.maxUnits,windowStartedAt:start.toISOString(),retryAt,mode:input.policy.mode,enabled:input.policy.enabled};
}

export class ResourceBudgetRepository{
  constructor(private readonly database:Database){}
  async ensureDefaults(guildId:string,actorId='system'):Promise<number>{
    let created=0;for(const [budgetKey,preset] of Object.entries(DEFAULT_RESOURCE_BUDGETS)){
      const result=await this.database.requirePool().query(`insert into resource_budget_policies(guild_id,budget_key,enabled,mode,window_seconds,max_units,updated_by) values($1,$2,true,$3,$4,$5,$6) on conflict(guild_id,budget_key) do nothing`,[guildId,budgetKey,preset.mode,preset.windowSeconds,preset.maxUnits,actorId]);created+=result.rowCount??0;
    }return created;
  }
  async list(guildId:string):Promise<ResourceBudgetPolicy[]>{
    await this.ensureDefaults(guildId);
    const {rows}=await this.database.requirePool().query<any>(`select * from resource_budget_policies where guild_id=$1 order by budget_key`,[guildId]);
    return rows.map((row:any)=>this.policy(row));
  }
  async get(guildId:string,budgetKey:string):Promise<ResourceBudgetPolicy>{
    const key=validateBudgetKey(budgetKey);await this.ensureDefaults(guildId);
    const {rows}=await this.database.requirePool().query<any>(`select * from resource_budget_policies where guild_id=$1 and budget_key=$2`,[guildId,key]);
    if(rows[0])return this.policy(rows[0]);
    const fallback=defaultBudgetPolicy(guildId,key);
    return this.upsert({guildId,budgetKey:key,enabled:fallback.enabled,mode:fallback.mode,windowSeconds:fallback.windowSeconds,maxUnits:fallback.maxUnits,updatedBy:'system-default'});
  }
  async upsert(input:{guildId:string;budgetKey:string;enabled?:boolean;mode?:string;windowSeconds:number;maxUnits:number;updatedBy?:string}):Promise<ResourceBudgetPolicy>{
    const policy=normalizeBudgetPolicy(input);const {rows}=await this.database.requirePool().query<any>(`insert into resource_budget_policies(guild_id,budget_key,enabled,mode,window_seconds,max_units,updated_by,updated_at) values($1,$2,$3,$4,$5,$6,$7,now()) on conflict(guild_id,budget_key) do update set enabled=excluded.enabled,mode=excluded.mode,window_seconds=excluded.window_seconds,max_units=excluded.max_units,updated_by=excluded.updated_by,updated_at=now() returning *`,[policy.guildId,policy.budgetKey,policy.enabled,policy.mode,policy.windowSeconds,policy.maxUnits,policy.updatedBy??null]);return this.policy(rows[0]);
  }
  async consume(input:{guildId:string;budgetKey:string;units?:number;actorId?:string;correlationId:string;detail?:string;now?:Date}):Promise<BudgetDecision>{
    const budgetKey=validateBudgetKey(input.budgetKey);const units=clampInteger(input.units??1,1,1_000_000,'BUDGET_UNITS_INVALID');const policy=await this.get(input.guildId,budgetKey);const now=input.now??new Date();const windowStart=budgetWindowStart(now,policy.windowSeconds);const client=await this.database.requirePool().connect();
    try{
      await client.query('begin');
      await client.query(`insert into resource_budget_windows(guild_id,budget_key,window_started_at,window_seconds,units_used,event_count) values($1,$2,$3,$4,0,0) on conflict(guild_id,budget_key,window_started_at) do nothing`,[input.guildId,budgetKey,windowStart,policy.windowSeconds]);
      const {rows}=await client.query<{units_used:number}>(`select units_used from resource_budget_windows where guild_id=$1 and budget_key=$2 and window_started_at=$3 for update`,[input.guildId,budgetKey,windowStart]);
      const usedBefore=Number(rows[0]?.units_used??0);const decision=previewBudgetDecision({policy,usedBefore,units,now});
      if(decision.decision!=='DEFER')await client.query(`update resource_budget_windows set units_used=$4,event_count=event_count+1,updated_at=now() where guild_id=$1 and budget_key=$2 and window_started_at=$3`,[input.guildId,budgetKey,windowStart,decision.usedAfter]);
      else await client.query(`update resource_budget_windows set event_count=event_count+1,updated_at=now() where guild_id=$1 and budget_key=$2 and window_started_at=$3`,[input.guildId,budgetKey,windowStart]);
      await client.query(`insert into resource_budget_events(event_id,guild_id,budget_key,decision,units,used_before,used_after,max_units,retry_at,actor_id,correlation_id,detail) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[randomUUID(),input.guildId,budgetKey,decision.decision,units,decision.usedBefore,decision.usedAfter,decision.maxUnits,decision.retryAt?new Date(decision.retryAt):null,input.actorId??null,input.correlationId,(input.detail??'').slice(0,500)||null]);
      await client.query('commit');return decision;
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }
  async recentEvents(guildId:string,limit=100):Promise<Array<Record<string,unknown>>>{
    const {rows}=await this.database.requirePool().query<any>(`select event_id::text as id,budget_key,decision as status,units,used_before,used_after,max_units,retry_at,actor_id,correlation_id,detail,created_at from resource_budget_events where guild_id=$1 order by created_at desc limit $2`,[guildId,Math.max(1,Math.min(250,Math.trunc(limit)))]);return rows;
  }
  private policy(row:any):ResourceBudgetPolicy{return {guildId:String(row.guild_id),budgetKey:String(row.budget_key),enabled:Boolean(row.enabled),mode:String(row.mode) as BudgetMode,windowSeconds:Number(row.window_seconds),maxUnits:Number(row.max_units),updatedBy:row.updated_by??undefined,updatedAt:row.updated_at?new Date(row.updated_at).toISOString():undefined};}
}
