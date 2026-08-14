import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';

export type CapacityPressure='NORMAL'|'WATCH'|'THROTTLE'|'EMERGENCY';
export interface CapacitySignals{
  resourceCount:number;
  queuedJobs:number;
  retryingJobs:number;
  deadLetterJobs:number;
  dueScheduledTasks:number;
  notificationBacklog:number;
  realtimeBackpressureDisconnects:number;
  realtimeSendFailures:number;
  criticalOpenIncidents:number;
}
export interface CapacityPolicy{
  resourceSoftCeiling:number;
  jobBacklogSoftCeiling:number;
  dueTaskSoftCeiling:number;
  notificationBacklogSoftCeiling:number;
  realtimeFailureSoftCeiling:number;
}
export interface CapacityAssessment{
  pressure:CapacityPressure;
  score:number;
  reasons:string[];
  actions:string[];
  signals:CapacitySignals;
  policy:CapacityPolicy;
}

export const DEFAULT_CAPACITY_POLICY:CapacityPolicy={resourceSoftCeiling:450,jobBacklogSoftCeiling:50,dueTaskSoftCeiling:40,notificationBacklogSoftCeiling:250,realtimeFailureSoftCeiling:10};

function nonNegative(value:number,key:string):number{if(!Number.isFinite(value)||value<0)throw new Error(`CAPACITY_SIGNAL_INVALID:${key}`);return value;}
function positive(value:number,key:string):number{if(!Number.isFinite(value)||value<=0)throw new Error(`CAPACITY_POLICY_INVALID:${key}`);return value;}
function ratio(value:number,ceiling:number){return Math.min(2,value/ceiling);}

export function assessCapacity(raw:CapacitySignals,policy:CapacityPolicy=DEFAULT_CAPACITY_POLICY):CapacityAssessment{
  const signals:CapacitySignals={
    resourceCount:nonNegative(raw.resourceCount,'resourceCount'),queuedJobs:nonNegative(raw.queuedJobs,'queuedJobs'),retryingJobs:nonNegative(raw.retryingJobs,'retryingJobs'),deadLetterJobs:nonNegative(raw.deadLetterJobs,'deadLetterJobs'),dueScheduledTasks:nonNegative(raw.dueScheduledTasks,'dueScheduledTasks'),notificationBacklog:nonNegative(raw.notificationBacklog,'notificationBacklog'),realtimeBackpressureDisconnects:nonNegative(raw.realtimeBackpressureDisconnects,'realtimeBackpressureDisconnects'),realtimeSendFailures:nonNegative(raw.realtimeSendFailures,'realtimeSendFailures'),criticalOpenIncidents:nonNegative(raw.criticalOpenIncidents,'criticalOpenIncidents'),
  };
  const safePolicy:CapacityPolicy={resourceSoftCeiling:positive(policy.resourceSoftCeiling,'resourceSoftCeiling'),jobBacklogSoftCeiling:positive(policy.jobBacklogSoftCeiling,'jobBacklogSoftCeiling'),dueTaskSoftCeiling:positive(policy.dueTaskSoftCeiling,'dueTaskSoftCeiling'),notificationBacklogSoftCeiling:positive(policy.notificationBacklogSoftCeiling,'notificationBacklogSoftCeiling'),realtimeFailureSoftCeiling:positive(policy.realtimeFailureSoftCeiling,'realtimeFailureSoftCeiling')};
  const jobWeighted=signals.queuedJobs+signals.retryingJobs*2+signals.deadLetterJobs*10;
  const realtimeWeighted=signals.realtimeBackpressureDisconnects+signals.realtimeSendFailures*2;
  const components=[ratio(signals.resourceCount,safePolicy.resourceSoftCeiling),ratio(jobWeighted,safePolicy.jobBacklogSoftCeiling),ratio(signals.dueScheduledTasks,safePolicy.dueTaskSoftCeiling),ratio(signals.notificationBacklog,safePolicy.notificationBacklogSoftCeiling),ratio(realtimeWeighted,safePolicy.realtimeFailureSoftCeiling)];
  let score=Math.round(Math.min(100,components.reduce((sum,value)=>sum+Math.min(1,value)*20,0)));
  if(signals.deadLetterJobs>0)score=Math.max(score,65);
  if(signals.criticalOpenIncidents>0)score=Math.max(score,80);
  const pressure:CapacityPressure=score>=85?'EMERGENCY':score>=65?'THROTTLE':score>=40?'WATCH':'NORMAL';
  const reasons:string[]=[];const actions:string[]=[];
  if(signals.resourceCount>=safePolicy.resourceSoftCeiling)reasons.push(`ทรัพยากรที่ระบบดูแล ${signals.resourceCount}/${safePolicy.resourceSoftCeiling} ถึงเพดานอ่อนภายใน`);
  if(jobWeighted>=safePolicy.jobBacklogSoftCeiling)reasons.push(`คิวงานคงทนแบบถ่วงน้ำหนัก ${jobWeighted}/${safePolicy.jobBacklogSoftCeiling}`);
  if(signals.deadLetterJobs>0)reasons.push(`มีงานค้างที่ส่งต่อไม่ได้ ${signals.deadLetterJobs} งาน ต้องให้ผู้ปฏิบัติการตรวจสอบ`);
  if(signals.dueScheduledTasks>=safePolicy.dueTaskSoftCeiling)reasons.push(`คิวงานตามกำหนดที่ถึงเวลาแล้ว ${signals.dueScheduledTasks}/${safePolicy.dueTaskSoftCeiling}`);
  if(signals.notificationBacklog>=safePolicy.notificationBacklogSoftCeiling)reasons.push(`คิวการแจ้งเตือน ${signals.notificationBacklog}/${safePolicy.notificationBacklogSoftCeiling}`);
  if(realtimeWeighted>=safePolicy.realtimeFailureSoftCeiling)reasons.push(`แรงกดดันจากความล้มเหลวแบบเรียลไทม์ ${realtimeWeighted}/${safePolicy.realtimeFailureSoftCeiling}`);
  if(signals.criticalOpenIncidents>0)reasons.push(`ยังมีเหตุผิดปกติระดับวิกฤตเปิดอยู่ ${signals.criticalOpenIncidents} เหตุ`);
  if(pressure==='WATCH')actions.push('ตรวจแนวโน้มคิว ตัวกำหนดเวลา และผู้ให้บริการก่อนขยายโครงสร้างเซิร์ฟเวอร์เพิ่ม');
  if(pressure==='THROTTLE')actions.push('พักระบบอัตโนมัติแบบชุดที่ไม่จำเป็น รักษาเส้นทางความปลอดภัยและช่วยเหลือสมาชิก แล้วระบายคิวงานคงทน');
  if(pressure==='EMERGENCY')actions.push('ใช้นโยบายบำรุงรักษาและควบคุมการเปลี่ยนแปลง ให้ความสำคัญกับการกู้คืนเหตุผิดปกติ และงดขยายโครงสร้างจนหลักฐานกลับสู่ภาวะปกติ');
  if(pressure==='NORMAL')actions.push('จากหลักฐานปัจจุบันยังไม่จำเป็นต้องแทรกแซงด้านความจุ');
  return {pressure,score,reasons,actions,signals,policy:safePolicy};
}

export class CapacityAssessmentRepository{
  constructor(private readonly database:Database){}
  async record(input:{guildId:string;actorId:string;assessment:CapacityAssessment;correlationId:string}){
    const assessmentId=randomUUID();
    const {rows}=await this.database.requirePool().query<any>(`insert into capacity_assessments(assessment_id,guild_id,pressure,score,signals,policy,reasons,actions,actor_id,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning assessment_id,created_at`,[assessmentId,input.guildId,input.assessment.pressure,input.assessment.score,input.assessment.signals,input.assessment.policy,input.assessment.reasons,input.assessment.actions,input.actorId,input.correlationId]);
    return {assessmentId:String(rows[0].assessment_id),createdAt:rows[0].created_at instanceof Date?rows[0].created_at.toISOString():String(rows[0].created_at),...input.assessment};
  }
}
