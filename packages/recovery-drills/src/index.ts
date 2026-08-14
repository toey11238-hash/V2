import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type RecoveryDrillType='RESTORE'|'PANEL_REPAIR'|'PERMISSION_REPAIR'|'STARTUP_RECOVERY'|'OUTBOX_RECOVERY';
export type RecoveryDrillStatus='PLANNED'|'RUNNING'|'BLOCKED'|'PASSED'|'FAILED'|'CANCELLED';
export interface RecoveryDrillEvidence{
  checksPassed?:number;
  checksFailed?:number;
  artifactRefs?:string[];
  notes?:string[];
  startedFromBackupId?:string;
  verificationHash?:string;
}

const drillTypes=new Set<RecoveryDrillType>(['RESTORE','PANEL_REPAIR','PERMISSION_REPAIR','STARTUP_RECOVERY','OUTBOX_RECOVERY']);
const transitions:Record<RecoveryDrillStatus,readonly RecoveryDrillStatus[]>={PLANNED:['RUNNING','CANCELLED'],RUNNING:['BLOCKED','PASSED','FAILED','CANCELLED'],BLOCKED:['RUNNING','FAILED','CANCELLED'],PASSED:[],FAILED:[],CANCELLED:[]};

export function validateRecoveryDrillPlan(input:{drillType:RecoveryDrillType;objective:string;expectedChecks:string[]}){
  if(!drillTypes.has(input.drillType))throw new Error('RECOVERY_DRILL_TYPE_INVALID');const objective=input.objective.trim();if(objective.length<8||objective.length>500)throw new Error('RECOVERY_DRILL_OBJECTIVE_INVALID');
  const checks=[...new Set(input.expectedChecks.map((item)=>item.trim()).filter(Boolean))];if(checks.length<2||checks.length>30||checks.some((item)=>item.length>240))throw new Error('RECOVERY_DRILL_CHECKS_INVALID');
  return {drillType:input.drillType,objective,expectedChecks:checks};
}

export function transitionRecoveryDrill(current:RecoveryDrillStatus,next:RecoveryDrillStatus,input:{evidence?:RecoveryDrillEvidence;blockers?:string[];note?:string}={}):RecoveryDrillStatus{
  if(current===next)return current;if(!transitions[current].includes(next))throw new Error(`RECOVERY_DRILL_TRANSITION_INVALID:${current}->${next}`);
  const blockers=(input.blockers??[]).map((item)=>item.trim()).filter(Boolean);
  if(next==='PASSED'){
    const passed=input.evidence?.checksPassed??0;const failed=input.evidence?.checksFailed??0;const refs=input.evidence?.artifactRefs?.filter(Boolean)??[];
    if(passed<2||failed>0||refs.length<1)throw new Error('RECOVERY_DRILL_PASS_EVIDENCE_REQUIRED');
  }
  if((next==='BLOCKED'||next==='FAILED')&&blockers.length<1)throw new Error('RECOVERY_DRILL_BLOCKER_REQUIRED');
  return next;
}

function cleanEvidence(value:RecoveryDrillEvidence|undefined):RecoveryDrillEvidence{
  const refs=[...new Set((value?.artifactRefs??[]).map((item)=>item.trim()).filter(Boolean))].slice(0,30);const notes=(value?.notes??[]).map((item)=>item.trim()).filter(Boolean).map((item)=>item.slice(0,500)).slice(0,30);
  return {checksPassed:Math.max(0,Math.floor(value?.checksPassed??0)),checksFailed:Math.max(0,Math.floor(value?.checksFailed??0)),artifactRefs:refs,notes,startedFromBackupId:value?.startedFromBackupId?.slice(0,120),verificationHash:value?.verificationHash?.slice(0,128)};
}

export class RecoveryDrillRepository{
  constructor(private readonly database:Database){}
  async create(input:{guildId:string;drillType:RecoveryDrillType;objective:string;expectedChecks:string[];actorId:string;correlationId:string}){
    const clean=validateRecoveryDrillPlan(input);const drillId=randomUUID();
    await this.database.transaction(async(client)=>{
      await client.query(`insert into recovery_drill_runs(drill_id,guild_id,drill_type,status,objective,expected_checks,created_by,correlation_id) values($1,$2,$3,'PLANNED',$4,$5,$6,$7)`,[drillId,input.guildId,clean.drillType,clean.objective,clean.expectedChecks,input.actorId,input.correlationId]);
      await client.query(`insert into recovery_drill_events(event_id,guild_id,drill_id,actor_id,event_type,after_state,note,correlation_id) values($1,$2,$3,$4,'CREATED',$5,$6,$7)`,[randomUUID(),input.guildId,drillId,input.actorId,{status:'PLANNED',drillType:clean.drillType,expectedChecks:clean.expectedChecks},clean.objective,input.correlationId]);
    });
    return {drillId,status:'PLANNED' as const,...clean};
  }
  async list(guildId:string,limit=30){const safe=Math.max(1,Math.min(100,Math.floor(limit)));return (await this.database.requirePool().query<any>(`select drill_id::text as id,drill_type,status,objective,expected_checks,evidence,blockers,created_by,started_at,finished_at,created_at,updated_at from recovery_drill_runs where guild_id=$1 order by created_at desc limit $2`,[guildId,safe])).rows;}
  async transition(input:{guildId:string;drillId:string;actorId:string;next:RecoveryDrillStatus;evidence?:RecoveryDrillEvidence;blockers?:string[];note?:string;correlationId:string}){
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select status from recovery_drill_runs where guild_id=$1 and drill_id=$2 for update`,[input.guildId,input.drillId])).rows[0];if(!row)throw new Error('RECOVERY_DRILL_NOT_FOUND');const current=row.status as RecoveryDrillStatus;
      const evidence=cleanEvidence(input.evidence);const blockers=[...new Set((input.blockers??[]).map((item)=>item.trim()).filter(Boolean))].map((item)=>item.slice(0,500)).slice(0,30);const next=transitionRecoveryDrill(current,input.next,{evidence,blockers,note:input.note});
      const {rows}=await client.query<any>(`update recovery_drill_runs set status=$3,evidence=case when $4::jsonb='{}'::jsonb then evidence else $4::jsonb end,blockers=$5,started_at=case when $3='RUNNING' then coalesce(started_at,now()) else started_at end,finished_at=case when $3 in ('PASSED','FAILED','CANCELLED') then now() else null end,updated_at=now() where guild_id=$1 and drill_id=$2 returning *`,[input.guildId,input.drillId,next,evidence,blockers]);
      await client.query(`insert into recovery_drill_events(event_id,guild_id,drill_id,actor_id,event_type,before_state,after_state,note,correlation_id) values($1,$2,$3,$4,'STATUS_CHANGE',$5,$6,$7,$8)`,[randomUUID(),input.guildId,input.drillId,input.actorId,{status:current},{status:next,evidence,blockers},input.note?.trim().slice(0,1000)??null,input.correlationId]);
      return rows[0];
    });
  }
}
