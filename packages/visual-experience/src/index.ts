import { createHash } from 'node:crypto';
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
import type { ServerPulseState } from '../../visual-system/src/index.ts';

export interface LivingPanelTransition {
  panelId:string;
  state:ServerPulseState;
  reason:string;
  ttlSeconds:number;
  priority:number;
}

const transition = (panelId:string,state:ServerPulseState,reason:string,ttlSeconds:number,priority:number):LivingPanelTransition => ({panelId,state,reason,ttlSeconds,priority});

function unique(items:LivingPanelTransition[]):LivingPanelTransition[]{
  const byPanel=new Map<string,LivingPanelTransition>();
  for(const item of items){
    const current=byPanel.get(item.panelId);
    if(!current||item.priority>current.priority)byPanel.set(item.panelId,item);
  }
  return [...byPanel.values()];
}

export function deriveLivingPanelTransitions(event:{type:string;payload:unknown}):LivingPanelTransition[]{
  const type=event.type;
  const payload=(event.payload&&typeof event.payload==='object'?event.payload:{}) as Record<string,unknown>;
  const out:LivingPanelTransition[]=[];
  const pulse=(state:ServerPulseState,reason:string,ttl:number,priority:number)=>out.push(transition('PANEL_SERVER_PULSE',state,reason,ttl,priority));
  const paired=(panelId:string,state:ServerPulseState,reason:string,ttl:number,priority:number)=>{pulse(state,reason,ttl,priority);out.push(transition(panelId,state,reason,ttl,priority));};
  if(type==='security.alert'){
    const severity=String(payload.severity??'MEDIUM').toUpperCase();
    const state:ServerPulseState=['CRITICAL','HIGH'].includes(severity)?'INCIDENT':'WATCH';
    paired('PANEL_SECURITY',state,`สัญญาณความปลอดภัย · ${severity}`,900,state==='INCIDENT'?100:60);
  } else if(type==='member.join'){
    paired('PANEL_WELCOME','ACTIVE','มีสมาชิกใหม่เข้าร่วมเซิร์ฟเวอร์',150,28);
  } else if(type.startsWith('ticket.')){
    const state:ServerPulseState=type==='ticket.closed'?'SUCCESS':type==='ticket.reopened'?'ACTIVE':type==='ticket.created'?'ACTIVE':'READY';
    const reason=type==='ticket.closed'?'ปิดคำขอช่วยเหลือแล้ว':type==='ticket.reopened'?'เปิดคำขอช่วยเหลืออีกครั้ง':type==='ticket.created'?'มีคำขอช่วยเหลือใหม่':'มีการดำเนินการกับคำขอช่วยเหลือ';
    paired('PANEL_TICKET',state,reason,state==='SUCCESS'?180:300,state==='SUCCESS'?38:48);
  } else if(type==='gaming.level.up'){
    paired('PANEL_GAMING_HUB','SUCCESS',`เลเวลเพิ่มเป็น ${String(payload.level??'ระดับใหม่')}`,240,58);
  } else if(type==='gaming.xp.awarded'){
    paired('PANEL_GAMING_HUB','ACTIVE','ได้รับค่าประสบการณ์จากกิจกรรมจริง',120,30);
  } else if(type.startsWith('community.event.')){
    const state:ServerPulseState=type==='community.event.created'?'READY':type==='community.event.checkin'?'LIVE':'ACTIVE';
    const reason=type==='community.event.created'?'สร้างกิจกรรมใหม่แล้ว':type==='community.event.checkin'?'มีการเช็กอินกิจกรรมแบบสด':type==='community.event.cancelled'?'มีการยกเลิกการเข้าร่วมกิจกรรม':'มีการลงทะเบียนกิจกรรม';
    paired('PANEL_EVENT',state,reason,state==='LIVE'?600:180,state==='LIVE'?55:35);
  } else if(type==='maintenance.activated'){
    paired('PANEL_STATUS','MAINTENANCE','อยู่ในช่วงบำรุงรักษา',900,80);
  } else if(type==='maintenance.completed'){
    paired('PANEL_STATUS','SUCCESS','บำรุงรักษาเสร็จสมบูรณ์',180,50);
  } else if(type==='restore.job.started'){
    paired('PANEL_RECOVERY_DRILLS','RECOVERY','กำลังตรวจสอบการกู้คืน',900,90);
  } else if(type==='restore.job.completed'){
    paired('PANEL_RECOVERY_DRILLS','SUCCESS','กู้คืนและตรวจสอบเสร็จแล้ว',240,55);
  } else if(type==='restore.job.failed'){
    paired('PANEL_RECOVERY_DRILLS','INCIDENT','การกู้คืนล้มเหลวอย่างปลอดภัย',900,100);
  } else if(type==='setup.recovery.required'){
    paired('PANEL_STATUS','RECOVERY','ต้องดำเนินการกู้คืนการตั้งค่า',900,90);
  } else if(type==='setup.job.started'||type==='setup.resource.started'){
    paired('PANEL_STATUS','SYNCING','กำลังซิงก์การตั้งค่าเซิร์ฟเวอร์',240,45);
  } else if(type==='setup.job.structural_complete'||type==='setup.config.reconciled'){
    paired('PANEL_STATUS','READY','การตั้งค่าสอดคล้องกับสถานะจริงแล้ว',150,40);
  } else if(type==='setup.rollback.completed'){
    paired('PANEL_STATUS','RECOVERY','ย้อนคืนการตั้งค่าเสร็จแล้ว',240,75);
  } else if(type==='backup.scheduled.completed'){
    paired('PANEL_RECOVERY_DRILLS','SUCCESS','ตรวจสอบความสมบูรณ์ของข้อมูลสำรองแล้ว',150,35);
  } else if(type.startsWith('backup.scheduled.')&&(type.includes('deferred')||type.includes('failed'))){
    paired('PANEL_RECOVERY_DRILLS','WATCH','งานสำรองข้อมูลถูกเลื่อนหรือล้มเหลว',240,55);
  } else if(type==='integration.content.synced'){
    paired('PANEL_PROVIDER_HEALTH','SUCCESS','ซิงก์ข้อมูลจากผู้ให้บริการแล้ว',180,35);
  } else if(type.startsWith('integration.sync.')&&(type.includes('deferred')||type.includes('failed'))){
    paired('PANEL_PROVIDER_HEALTH','WATCH','การซิงก์ผู้ให้บริการถูกเลื่อนหรือล้มเหลว',240,50);
  } else if(type==='scheduler.task.failed'){
    paired('PANEL_STATUS','DEGRADED','งานเบื้องหลังล้มเหลว',240,70);
  } else if(type==='scheduler.task.started'){
    pulse('ACTIVE','มีงานเบื้องหลังกำลังทำงาน',90,20);
  } else if(/(?:^|\.)job\.started$/.test(type)){
    pulse('SYNCING','มีงานคงทนกำลังประมวลผล',180,35);
  } else if(/(?:^|\.)job\.completed$/.test(type)){
    pulse('SUCCESS','งานคงทนเสร็จสมบูรณ์',120,30);
  } else if(/(?:^|\.)job\.failed$/.test(type)){
    pulse('DEGRADED','งานคงทนล้มเหลวอย่างปลอดภัย',300,68);
  } else if(type.startsWith('gaming.session.')){
    const action=type.slice('gaming.session.'.length);
    const state:ServerPulseState=action==='started'?'LIVE':action==='ready'?'READY':action==='completed'?'SUCCESS':action==='cancelled'?'WATCH':'ACTIVE';
    const reason=action==='started'?'เซสชันเกมกำลังถ่ายทอดสถานะสด':action==='ready'?'เซสชันเกมพร้อมเริ่ม':action==='completed'?'เซสชันเกมเสร็จสิ้น':action==='cancelled'?'เซสชันเกมถูกยกเลิก':'มีความเคลื่อนไหวในเซสชันเกม';
    const ttl=state==='LIVE'?7200:state==='SUCCESS'?180:240;
    const priority=state==='LIVE'?65:state==='READY'?50:30;
    paired('PANEL_GAMING_HUB',state,reason,ttl,priority);
  }
  return unique(out);
}

export function livingPanelStateHash(input:{panelId:string;state:ServerPulseState;reason:string;eventId:string}):string{
  return sha256(JSON.stringify([input.panelId,input.state,input.reason,input.eventId]));
}

export function livingPanelRenderDelayMs(state:ServerPulseState):number{
  if(state==='INCIDENT'||state==='RECOVERY')return 3_000;
  if(state==='LIVE'||state==='READY'||state==='MAINTENANCE')return 5_000;
  return 15_000;
}

export function livingPanelExpiry(occurredAt:string,ttlSeconds:number):Date{
  const base=new Date(occurredAt);
  if(!Number.isFinite(base.getTime()))throw new Error('LIVING_PANEL_EVENT_TIME_INVALID');
  return new Date(base.getTime()+Math.max(30,Math.min(86_400,Math.round(ttlSeconds)))*1000);
}
