export type ScheduleState = 'SCHEDULED' | 'CLAIMED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export interface ScheduledTask { taskId: string; guildId: string; runAt: Date; state: ScheduleState; dedupKey: string; }
export const USER_CANCELLABLE_TASK_TYPES = ['ANNOUNCEMENT_PUBLISH','EVENT_REMINDER','MAINTENANCE_START'] as const;
export function isUserCancellableTask(taskType:string,state:ScheduleState):boolean{
  return state==='SCHEDULED' && (USER_CANCELLABLE_TASK_TYPES as readonly string[]).includes(taskType);
}

export function isTaskDue(task: ScheduledTask, now = new Date()): boolean {
  return task.state === 'SCHEDULED' && task.runAt.getTime() <= now.getTime();
}

export function computeReminderInstants(eventAt: Date, offsetsMinutes: readonly number[]): Date[] {
  return [...new Set(offsetsMinutes)]
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0)
    .sort((a, b) => b - a)
    .map((minutes) => new Date(eventAt.getTime() - minutes * 60_000));
}

export function parseScheduleInstant(value:string,now=new Date(),maxDays=365):Date{
  const trimmed=value.trim(); let timestamp:number;
  if(/^\d{10,13}$/.test(trimmed)){const numeric=Number(trimmed);timestamp=trimmed.length===10?numeric*1000:numeric;}
  else timestamp=Date.parse(trimmed);
  if(!Number.isFinite(timestamp))throw new Error('SCHEDULE_INSTANT_INVALID');
  const at=new Date(timestamp);const min=now.getTime()+30_000;const max=now.getTime()+Math.max(1,maxDays)*24*60*60_000;
  if(at.getTime()<min)throw new Error('SCHEDULE_INSTANT_MUST_BE_FUTURE');
  if(at.getTime()>max)throw new Error('SCHEDULE_INSTANT_TOO_FAR');
  return at;
}


export function localDateKey(timeZone: string, at = new Date()): string {
  let formatter:Intl.DateTimeFormat;
  try { formatter=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}); }
  catch { throw new Error('INVALID_TIMEZONE'); }
  const parts=Object.fromEntries(formatter.formatToParts(at).map((part)=>[part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nextLocalTime(timeZone: string, hour: number, minute: number, after = new Date()): Date {
  if(!Number.isInteger(hour)||hour<0||hour>23||!Number.isInteger(minute)||minute<0||minute>59) throw new Error('INVALID_LOCAL_TIME');
  let formatter:Intl.DateTimeFormat;
  try { formatter=new Intl.DateTimeFormat('en-GB',{timeZone,hour12:false,hour:'2-digit',minute:'2-digit'}); }
  catch { throw new Error('INVALID_TIMEZONE'); }
  const start=Math.floor((after.getTime()+60_000)/60_000)*60_000;
  for(let offset=0;offset<=48*60;offset+=1) {
    const candidate=new Date(start+offset*60_000);
    const parts=Object.fromEntries(formatter.formatToParts(candidate).map((part)=>[part.type,part.value]));
    if(Number(parts.hour)===hour&&Number(parts.minute)===minute) return candidate;
  }
  throw new Error('LOCAL_TIME_NOT_FOUND_WITHIN_48H');
}

import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export interface PersistedScheduledTask extends ScheduledTask {
  taskType: string;
  timezone: string;
  payload: Record<string, unknown>;
  attempts: number;
}

export class ScheduledTaskRepository {
  constructor(private readonly database: Database) {}

  async schedule(input: { guildId: string; taskType: string; runAt: Date; timezone: string; dedupKey: string; payload?: Record<string, unknown> }): Promise<string> {
    const taskId = randomUUID();
    const row = await this.database.requirePool().query<{task_id:string}>(
      `insert into scheduled_tasks(task_id,guild_id,task_type,state,run_at,timezone,dedup_key,payload)
       values($1,$2,$3,'SCHEDULED',$4,$5,$6,$7)
       on conflict (guild_id,task_type,dedup_key) do update set run_at=excluded.run_at, timezone=excluded.timezone, payload=excluded.payload, state='SCHEDULED', updated_at=now()
       returning task_id`,
      [taskId,input.guildId,input.taskType,input.runAt,input.timezone,input.dedupKey,input.payload ?? {}],
    );
    return row.rows[0]!.task_id;
  }

  async ensureScheduled(input:{guildId:string;taskType:string;runAt:Date;timezone:string;dedupKey:string;payload?:Record<string,unknown>}):Promise<{taskId:string;created:boolean}> {
    const taskId=randomUUID();
    const inserted=await this.database.requirePool().query<{task_id:string}>(
      `insert into scheduled_tasks(task_id,guild_id,task_type,state,run_at,timezone,dedup_key,payload)
       values($1,$2,$3,'SCHEDULED',$4,$5,$6,$7)
       on conflict(guild_id,task_type,dedup_key) do nothing returning task_id`,
      [taskId,input.guildId,input.taskType,input.runAt,input.timezone,input.dedupKey,input.payload??{}],
    );
    if(inserted.rows[0])return {taskId:inserted.rows[0].task_id,created:true};
    const existing=await this.database.requirePool().query<{task_id:string}>(`select task_id from scheduled_tasks where guild_id=$1 and task_type=$2 and dedup_key=$3`,[input.guildId,input.taskType,input.dedupKey]);
    if(!existing.rows[0])throw new Error('SCHEDULED_TASK_ENSURE_RACE');
    return {taskId:existing.rows[0].task_id,created:false};
  }

  async ensureScheduledRecoverable(input:{guildId:string;taskType:string;runAt:Date;timezone:string;dedupKey:string;payload?:Record<string,unknown>}):Promise<{taskId:string;created:boolean;revived:boolean}> {
    const ensured=await this.ensureScheduled(input);
    if(ensured.created)return {...ensured,revived:false};
    const revived=await this.database.requirePool().query<{task_id:string}>(
      `update scheduled_tasks set state='SCHEDULED',run_at=$4,timezone=$5,payload=$6,attempts=0,lease_owner=null,lease_expires_at=null,updated_at=now() where guild_id=$1 and task_type=$2 and dedup_key=$3 and state in ('FAILED','CANCELLED') returning task_id`,
      [input.guildId,input.taskType,input.dedupKey,input.runAt,input.timezone,input.payload??{}],
    );
    return {taskId:revived.rows[0]?.task_id??ensured.taskId,created:false,revived:Boolean(revived.rows[0])};
  }

  async claimDue(limit = 10, ownerId = 'scheduler', leaseSeconds = 120): Promise<PersistedScheduledTask[]> {
    const safeLease=Math.max(30,Math.min(900,Math.trunc(leaseSeconds)));
    const result = await this.database.requirePool().query<any>(
      `with due as (
         select task_id from scheduled_tasks where state='SCHEDULED' and run_at<=now() order by run_at asc for update skip locked limit $1
       )
       update scheduled_tasks s set state='CLAIMED', attempts=s.attempts+1, claimed_at=now(), lease_owner=$2, lease_expires_at=now()+make_interval(secs=>$3), updated_at=now()
       from due where s.task_id=due.task_id
       returning s.task_id,s.guild_id,s.task_type,s.state,s.run_at,s.timezone,s.dedup_key,s.payload,s.attempts`,
      [limit,ownerId,safeLease],
    );
    return result.rows.map((row:any) => ({
      taskId: row.task_id, guildId: row.guild_id, taskType: row.task_type, state: row.state, runAt: new Date(row.run_at), timezone: row.timezone,
      dedupKey: row.dedup_key, payload: row.payload ?? {}, attempts: row.attempts,
    }));
  }

  async cancelByDedup(guildId: string, taskType: string, dedupKey: string): Promise<void> {
    await this.database.requirePool().query(`update scheduled_tasks set state='CANCELLED',updated_at=now() where guild_id=$1 and task_type=$2 and dedup_key=$3 and state in ('SCHEDULED','CLAIMED')`, [guildId,taskType,dedupKey]);
  }
  async cancelScheduledByDedup(guildId:string,taskType:string,dedupKey:string):Promise<boolean>{
    const result=await this.database.requirePool().query(`update scheduled_tasks set state='CANCELLED',updated_at=now() where guild_id=$1 and task_type=$2 and dedup_key=$3 and state='SCHEDULED'`,[guildId,taskType,dedupKey]);
    return (result.rowCount??0)>0;
  }

  async cancelPendingByType(guildId: string, taskType: string): Promise<number> {
    const result = await this.database.requirePool().query(
      `update scheduled_tasks set state='CANCELLED',updated_at=now() where guild_id=$1 and task_type=$2 and state='SCHEDULED'`,
      [guildId, taskType],
    );
    return result.rowCount ?? 0;
  }

  async getForGuild(guildId:string,taskId:string):Promise<PersistedScheduledTask|undefined>{
    const {rows}=await this.database.requirePool().query<any>(
      `select task_id,guild_id,task_type,state,run_at,timezone,dedup_key,payload,attempts from scheduled_tasks where guild_id=$1 and task_id=$2`,
      [guildId,taskId],
    );
    const row=rows[0]; if(!row)return undefined;
    return {taskId:row.task_id,guildId:row.guild_id,taskType:row.task_type,state:row.state,runAt:new Date(row.run_at),timezone:row.timezone,dedupKey:row.dedup_key,payload:row.payload??{},attempts:Number(row.attempts??0)};
  }

  async cancelForGuild(guildId:string,taskId:string):Promise<boolean>{
    const result=await this.database.requirePool().query(
      `update scheduled_tasks set state='CANCELLED',lease_owner=null,lease_expires_at=null,updated_at=now() where guild_id=$1 and task_id=$2 and state='SCHEDULED'`,
      [guildId,taskId],
    );
    return (result.rowCount??0)>0;
  }

  async markRunning(taskId: string, ownerId?: string): Promise<void> {
    const values=ownerId?[taskId,ownerId]:[taskId]; const ownerClause=ownerId?' and lease_owner=$2':'';
    await this.database.requirePool().query(`update scheduled_tasks set state='RUNNING',updated_at=now() where task_id=$1${ownerClause} and state='CLAIMED'`,values);
  }
  async renewLease(taskId:string,ownerId:string,leaseSeconds=120):Promise<boolean>{
    const result=await this.database.requirePool().query(`update scheduled_tasks set lease_expires_at=now()+make_interval(secs=>$3),updated_at=now() where task_id=$1 and lease_owner=$2 and state in ('CLAIMED','RUNNING')`,[taskId,ownerId,Math.max(30,Math.min(900,Math.trunc(leaseSeconds)))]);
    return (result.rowCount??0)>0;
  }
  async markSucceeded(taskId: string, ownerId?:string): Promise<void> { await this.setState(taskId,'SUCCEEDED',ownerId); }
  async cancel(taskId: string): Promise<void> { await this.setState(taskId,'CANCELLED'); }
  async markFailed(taskId: string, retryAt?: Date, ownerId?:string): Promise<void> {
    const ownerClause=ownerId?' and lease_owner=$3':'';
    if (retryAt) {
      const values=ownerId?[taskId,retryAt,ownerId]:[taskId,retryAt];
      await this.database.requirePool().query(`update scheduled_tasks set state='SCHEDULED',run_at=$2,lease_owner=null,lease_expires_at=null,updated_at=now() where task_id=$1 and state in ('CLAIMED','RUNNING')${ownerClause}`, values);
      return;
    }
    await this.setState(taskId,'FAILED',ownerId);
  }
  async recoverStale(maxAttempts=5):Promise<{requeued:number;failed:number}>{
    const result=await this.database.requirePool().query<{state:string}>(
      `update scheduled_tasks set state=case when attempts<$1 then 'SCHEDULED' else 'FAILED' end,run_at=case when attempts<$1 then now() else run_at end,lease_owner=null,lease_expires_at=null,updated_at=now()
       where state in ('CLAIMED','RUNNING') and lease_expires_at is not null and lease_expires_at<=now() returning state`,
      [Math.max(1,Math.min(20,Math.trunc(maxAttempts)))],
    );
    return {requeued:result.rows.filter((row)=>row.state==='SCHEDULED').length,failed:result.rows.filter((row)=>row.state==='FAILED').length};
  }
  private async setState(taskId: string, state: ScheduleState, ownerId?:string): Promise<void> {
    const values=ownerId?[taskId,state,ownerId]:[taskId,state];
    const ownerClause=ownerId?' and lease_owner=$3':'';
    await this.database.requirePool().query(`update scheduled_tasks set state=$2,lease_owner=null,lease_expires_at=null,updated_at=now() where task_id=$1${ownerClause}`, values);
  }
}

export function localWeekday(timeZone: string, at = new Date()): number {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }); }
  catch { throw new Error('INVALID_TIMEZONE'); }
  const key = formatter.format(at).slice(0,3).toLowerCase();
  const map: Record<string, number> = { sun:0, mon:1, tue:2, wed:3, thu:4, fri:5, sat:6 };
  const value = map[key];
  if (value === undefined) throw new Error('INVALID_LOCAL_WEEKDAY');
  return value;
}

export function nextLocalWeekdayTime(timeZone: string, weekday: number, hour: number, minute: number, after = new Date()): Date {
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new Error('INVALID_WEEKDAY');
  let candidate = nextLocalTime(timeZone, hour, minute, after);
  for (let day = 0; day < 8; day += 1) {
    if (localWeekday(timeZone, candidate) === weekday) return candidate;
    candidate = nextLocalTime(timeZone, hour, minute, new Date(candidate.getTime() + 60_000));
  }
  throw new Error('LOCAL_WEEKDAY_TIME_NOT_FOUND');
}
