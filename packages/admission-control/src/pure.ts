export type AdmissionPreset='BALANCED'|'CONSERVATIVE'|'MAX_AVAILABILITY';
export type AdmissionMode='OBSERVE'|'ENFORCE';
export type AdmissionOperation='SAFETY'|'SUPPORT'|'DIAGNOSTIC'|'INTERACTIVE'|'STRUCTURAL'|'BACKGROUND'|'PROVIDER'|'BULK';
export type AdmissionDecision='ALLOW'|'DEFER'|'REJECT';
export type AdmissionPressure='NORMAL'|'WATCH'|'THROTTLE'|'EMERGENCY'|'UNKNOWN';

export interface AdmissionPolicy{
  guildId:string;
  preset:AdmissionPreset;
  mode:AdmissionMode;
  failClosedWhenUnknown:boolean;
  updatedBy?:string;
}
export interface AdmissionContext{
  pressure:AdmissionPressure;
  criticalIncidentOpen:boolean;
  maintenanceActive:boolean;
  operation:AdmissionOperation;
}
export interface AdmissionResult{
  decision:AdmissionDecision;
  wouldDecision:AdmissionDecision;
  enforced:boolean;
  pressure:AdmissionPressure;
  operation:AdmissionOperation;
  reason:string;
  retryAfterSeconds?:number;
}
const admissionLabel:Record<string,string>={SAFETY:'ความปลอดภัย',SUPPORT:'การช่วยเหลือ',DIAGNOSTIC:'การวินิจฉัย',INTERACTIVE:'งานโต้ตอบ',STRUCTURAL:'งานโครงสร้าง',BACKGROUND:'งานเบื้องหลัง',PROVIDER:'งานผู้ให้บริการ',BULK:'งานแบบชุด',NORMAL:'ปกติ',WATCH:'เฝ้าระวัง',THROTTLE:'จำกัดงาน',EMERGENCY:'ฉุกเฉิน',UNKNOWN:'ไม่ทราบ',BALANCED:'สมดุล',CONSERVATIVE:'ระมัดระวัง',MAX_AVAILABILITY:'พร้อมใช้งานสูงสุด'};
const admissionUi=(value:unknown)=>admissionLabel[String(value??'')]??String(value??'');
const pressureRank:Record<Exclude<AdmissionPressure,'UNKNOWN'>,number>={NORMAL:0,WATCH:1,THROTTLE:2,EMERGENCY:3};
const maxByPreset:Record<AdmissionPreset,Record<Exclude<AdmissionOperation,'SAFETY'|'SUPPORT'|'DIAGNOSTIC'>,Exclude<AdmissionPressure,'UNKNOWN'>>>={
  BALANCED:{INTERACTIVE:'EMERGENCY',STRUCTURAL:'WATCH',BACKGROUND:'WATCH',PROVIDER:'WATCH',BULK:'NORMAL'},
  CONSERVATIVE:{INTERACTIVE:'THROTTLE',STRUCTURAL:'NORMAL',BACKGROUND:'NORMAL',PROVIDER:'NORMAL',BULK:'NORMAL'},
  MAX_AVAILABILITY:{INTERACTIVE:'EMERGENCY',STRUCTURAL:'THROTTLE',BACKGROUND:'THROTTLE',PROVIDER:'THROTTLE',BULK:'WATCH'},
};
export function defaultAdmissionPolicy(guildId:string,preset:AdmissionPreset='BALANCED'):AdmissionPolicy{return {guildId,preset,mode:'ENFORCE',failClosedWhenUnknown:true};}
export function normalizeAdmissionPolicy(input:{guildId:string;preset?:string;mode?:string;failClosedWhenUnknown?:boolean;updatedBy?:string}):AdmissionPolicy{
  const preset=String(input.preset??'BALANCED').toUpperCase();const mode=String(input.mode??'ENFORCE').toUpperCase();
  if(!['BALANCED','CONSERVATIVE','MAX_AVAILABILITY'].includes(preset))throw new Error('ADMISSION_PRESET_INVALID');
  if(!['OBSERVE','ENFORCE'].includes(mode))throw new Error('ADMISSION_MODE_INVALID');
  return {guildId:input.guildId,preset:preset as AdmissionPreset,mode:mode as AdmissionMode,failClosedWhenUnknown:input.failClosedWhenUnknown!==false,updatedBy:input.updatedBy};
}
function rawAdmissionDecision(policy:AdmissionPolicy,context:AdmissionContext):{decision:AdmissionDecision;reason:string;retryAfterSeconds?:number}{
  if(['SAFETY','SUPPORT','DIAGNOSTIC'].includes(context.operation))return {decision:'ALLOW',reason:'เส้นทางความปลอดภัย การช่วยเหลือ และการวินิจฉัยได้รับการสงวนความจุ'};
  if(context.criticalIncidentOpen&&['STRUCTURAL','BACKGROUND','PROVIDER','BULK'].includes(context.operation))return {decision:'DEFER',reason:'มีเหตุผิดปกติระดับวิกฤต จึงสงวนความจุสำหรับการกู้คืนและการช่วยเหลือ',retryAfterSeconds:300};
  if(context.maintenanceActive&&['STRUCTURAL','BACKGROUND','PROVIDER','BULK'].includes(context.operation))return {decision:'DEFER',reason:'นโยบายบำรุงรักษากำลังทำงาน จึงเลื่อนการเปลี่ยนแปลงที่ไม่จำเป็น',retryAfterSeconds:300};
  if(context.pressure==='UNKNOWN'){
    if(policy.failClosedWhenUnknown&&['STRUCTURAL','PROVIDER','BULK'].includes(context.operation))return {decision:'DEFER',reason:'ไม่มีหลักฐานความจุ งานผลกระทบสูงจึงปิดแบบปลอดภัย',retryAfterSeconds:120};
    return {decision:'ALLOW',reason:'ไม่มีหลักฐานความจุ แต่งานผลกระทบต่ำยังใช้งานได้'};
  }
  const max=maxByPreset[policy.preset][context.operation as Exclude<AdmissionOperation,'SAFETY'|'SUPPORT'|'DIAGNOSTIC'>];
  if(pressureRank[context.pressure]<=pressureRank[max])return {decision:'ALLOW',reason:`อนุญาต${admissionUi(context.operation)}ที่แรงกดดันระดับ${admissionUi(context.pressure)} ภายใต้นโยบาย${admissionUi(policy.preset)}`};
  return {decision:'DEFER',reason:`${admissionUi(context.operation)}เกินระดับแรงกดดันที่นโยบาย${admissionUi(policy.preset)}อนุญาตไว้ที่ระดับ${admissionUi(max)}`,retryAfterSeconds:context.pressure==='EMERGENCY'?300:120};
}
export function evaluateAdmission(policy:AdmissionPolicy,context:AdmissionContext):AdmissionResult{
  const raw=rawAdmissionDecision(policy,context);const enforced=policy.mode==='ENFORCE';
  return {decision:enforced?raw.decision:'ALLOW',wouldDecision:raw.decision,enforced,pressure:context.pressure,operation:context.operation,reason:raw.reason,retryAfterSeconds:raw.retryAfterSeconds};
}
