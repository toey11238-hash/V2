export type OperationsHealth='HEALTHY'|'WATCH'|'DEGRADED'|'CRITICAL'|'UNKNOWN';

export interface OperationsQueueEvidence{
  name:string;
  queued:number;
  running?:number;
  retrying?:number;
  failed?:number;
  deadLetter?:number;
  oldestPendingAgeSeconds?:number|null;
  maxAttempts?:number|null;
}
export interface OperationsComponentEvidence{name:string;label?:string;state:string;lastSeenAgeSeconds?:number|null;detail?:string}
export interface OperationsErrorBudgetEvidence{name:string;health:'HEALTHY'|'WATCH'|'EXHAUSTED'|'UNKNOWN';remainingFraction?:number|null;burnMultiple?:number|null;total:number}
export interface OperationsIntelligenceInput{
  database:{configured:boolean;healthy:boolean};
  discord:{enabled:boolean;ready:boolean;guildAvailable:boolean};
  realtime:{clients:number;recentGuildEvents:number;backpressureDisconnects:number;sendFailures:number;deduplicatedEvents:number};
  queues:readonly OperationsQueueEvidence[];
  components:readonly OperationsComponentEvidence[];
  incidents:{open:number;critical:number};
  errorBudgets?:readonly OperationsErrorBudgetEvidence[];
}
export interface OperationsSignal{severity:Exclude<OperationsHealth,'UNKNOWN'>;key:string;label:string;detail:string;weight:number}
export interface OperationsIntelligenceReport{
  schemaVersion:1;
  health:OperationsHealth;
  riskScore:number;
  signals:OperationsSignal[];
  queues:OperationsQueueEvidence[];
  components:OperationsComponentEvidence[];
  errorBudgets:OperationsErrorBudgetEvidence[];
  realtime:OperationsIntelligenceInput['realtime'];
  summary:{criticalSignals:number;degradedSignals:number;watchSignals:number;openIncidents:number;criticalIncidents:number};
  evidenceOnly:true;
  note:string;
}

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function buildOperationsIntelligence(input:OperationsIntelligenceInput):OperationsIntelligenceReport{
  const signals:OperationsSignal[]=[];
  const add=(severity:OperationsSignal['severity'],key:string,label:string,detail:string,weight:number)=>signals.push({severity,key,label,detail,weight});
  if(!input.database.configured)add('DEGRADED','database.unconfigured','ฐานข้อมูลยังไม่พร้อม','ไม่มีฐานข้อมูลถาวรสำหรับสถานะการทำงาน',25);
  else if(!input.database.healthy)add('CRITICAL','database.unhealthy','ฐานข้อมูลผิดปกติ','การตรวจสุขภาพฐานข้อมูลไม่ผ่าน',45);
  if(input.discord.enabled&&!input.discord.ready)add('CRITICAL','discord.not_ready','Discord ยังไม่พร้อม','ไคลเอนต์ Discord เปิดใช้งานแต่ยังไม่พร้อมรับงาน',40);
  if(input.discord.ready&&!input.discord.guildAvailable)add('DEGRADED','discord.guild_unavailable','เซิร์ฟเวอร์เป้าหมายไม่พร้อม','บอตเชื่อมต่อ Discord แล้วแต่ยังไม่พบเซิร์ฟเวอร์เป้าหมายในข้อมูลแคช',22);
  if(input.incidents.critical>0)add('CRITICAL','incidents.critical','มีเหตุผิดปกติวิกฤต',`${input.incidents.critical} เหตุการณ์`,50);
  else if(input.incidents.open>0)add('WATCH','incidents.open','มีเหตุผิดปกติที่ยังเปิดอยู่',`${input.incidents.open} เหตุการณ์`,12);
  if(input.realtime.backpressureDisconnects>0)add('DEGRADED','realtime.backpressure','มีการตัดการเชื่อมต่อจากแรงดันย้อนกลับ',`${input.realtime.backpressureDisconnects} ครั้งในโปรเซสปัจจุบัน`,18);
  if(input.realtime.sendFailures>0)add('DEGRADED','realtime.send_failures','พบการส่งข้อมูลสดล้มเหลว',`${input.realtime.sendFailures} ครั้งในโปรเซสปัจจุบัน`,18);
  for(const queue of input.queues){
    const pending=Math.max(0,queue.queued)+Math.max(0,queue.retrying??0);
    const age=queue.oldestPendingAgeSeconds??0;
    if((queue.deadLetter??0)>0)add('CRITICAL',`queue.${queue.name}.dead_letter`,`คิว ${queue.name} มีงานหยุดถาวร`,`${queue.deadLetter} งาน`,35);
    if((queue.failed??0)>=5)add('DEGRADED',`queue.${queue.name}.failed`,`คิว ${queue.name} มีงานล้มเหลว`,`${queue.failed} งาน`,18);
    if(pending>=100||age>=900)add('DEGRADED',`queue.${queue.name}.pressure`, `คิว ${queue.name} มีแรงกดดันสูง`, `${pending} งานค้าง · งานเก่าสุด ${Math.round(age)} วินาที`,22);
    else if(pending>=25||age>=300)add('WATCH',`queue.${queue.name}.watch`,`คิว ${queue.name} เริ่มสะสม`,`${pending} งานค้าง · งานเก่าสุด ${Math.round(age)} วินาที`,10);
  }
  for(const component of input.components){
    const state=component.state.toUpperCase();
    const label=component.label??component.name;
    if(state==='OFFLINE')add('CRITICAL',`component.${component.name}.offline`,`องค์ประกอบ ${label} ออฟไลน์`,component.detail??'ไม่พบสัญญาณชีพที่ใช้งานได้',30);
    else if(state==='DEGRADED')add('DEGRADED',`component.${component.name}.degraded`,`องค์ประกอบ ${label} ทำงานลดลง`,component.detail??'สัญญาณชีพระบุสถานะลดลง',16);
    else if((component.lastSeenAgeSeconds??0)>180)add('WATCH',`component.${component.name}.stale`,`สัญญาณชีพ ${label} เก่า`,`${Math.round(component.lastSeenAgeSeconds??0)} วินาที`,10);
  }
  const budgets=[...(input.errorBudgets??[])];
  for(const budget of budgets){
    if(budget.health==='EXHAUSTED')add('CRITICAL',`slo.${budget.name}.exhausted`,`งบความผิดพลาด ${budget.name} หมด`,`${budget.total} ตัวอย่าง`,32);
    else if(budget.health==='WATCH')add('WATCH',`slo.${budget.name}.watch`,`งบความผิดพลาด ${budget.name} ใกล้เกณฑ์`,`เหลือ ${budget.remainingFraction==null?'ไม่ทราบ':Math.round(budget.remainingFraction*100)+'%'}`,12);
  }
  const riskScore=clamp(signals.reduce((sum,item)=>sum+item.weight,0),0,100);
  const critical=signals.filter((item)=>item.severity==='CRITICAL').length;
  const degraded=signals.filter((item)=>item.severity==='DEGRADED').length;
  const watch=signals.filter((item)=>item.severity==='WATCH').length;
  const health:OperationsHealth=critical?'CRITICAL':degraded?'DEGRADED':watch?'WATCH':(!input.database.configured&&input.realtime.clients===0?'UNKNOWN':'HEALTHY');
  return{schemaVersion:1,health,riskScore,signals:signals.sort((a,b)=>b.weight-a.weight||a.key.localeCompare(b.key)),queues:[...input.queues],components:[...input.components],errorBudgets:budgets,realtime:input.realtime,summary:{criticalSignals:critical,degradedSignals:degraded,watchSignals:watch,openIncidents:input.incidents.open,criticalIncidents:input.incidents.critical},evidenceOnly:true,note:'รายงานนี้คำนวณจากหลักฐานขณะทำงานและฐานข้อมูลที่มีอยู่จริง สถานะ “ไม่ทราบ” หมายถึงหลักฐานไม่พอและจะไม่ถูกตีความเป็นสถานะปกติ'};
}
