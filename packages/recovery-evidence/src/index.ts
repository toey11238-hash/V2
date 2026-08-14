export type RecoveryEvidenceStage='BACKUP'|'INTEGRITY'|'APPROVAL'|'RESTORE'|'VERIFY'|'DRILL';
export type RecoveryEvidenceState='PASS'|'ACTIVE'|'WAITING'|'FAIL'|'UNKNOWN';
export type RecoveryReadiness='VERIFIED'|'IN_PROGRESS'|'ATTENTION'|'UNPROVEN'|'NO_EVIDENCE';

export interface RecoveryBackupEvidence{
  backupId:string;
  kind:string;
  status:string;
  contentHash:string;
  hashAlgorithm:string;
  createdAt:string;
  integrityCheckedAt?:string|null;
  restoreVerifiedAt?:string|null;
  lastRestoreRunId?:string|null;
}
export interface RecoveryRestoreRunEvidence{
  restoreRunId:string;
  backupId:string;
  state:string;
  approvalRequestId?:string|null;
  correlationId?:string|null;
  createdAt:string;
  updatedAt?:string|null;
}
export interface RecoveryApprovalEvidence{
  approvalId:string;
  state:string;
  risk?:string|null;
  requiredApprovals?:number|null;
  approvedCount?:number|null;
  createdAt:string;
  updatedAt?:string|null;
}
export interface RecoveryVerificationEvidence{
  evidenceId:string;
  backupId:string;
  evidenceType:'INTEGRITY_CHECK'|'RESTORE_VERIFY'|string;
  outcome:'PASS'|'FAIL'|string;
  restoreRunId?:string|null;
  contentHash:string;
  hashAlgorithm:string;
  createdAt:string;
}
export interface RecoveryDrillEvidence{
  drillId:string;
  drillType:string;
  status:string;
  objective?:string|null;
  createdAt:string;
  startedAt?:string|null;
  finishedAt?:string|null;
}
export interface RecoveryTimelineItem{
  id:string;
  stage:RecoveryEvidenceStage;
  state:RecoveryEvidenceState;
  at:string;
  title:string;
  detail:string;
  backupId?:string;
  restoreRunId?:string;
  evidenceId?:string;
  drillId?:string;
}
export interface RecoveryEvidenceReport{
  mode:'READ_ONLY_EVIDENCE';
  readiness:RecoveryReadiness;
  restoreVerified:boolean;
  integrityProven:boolean;
  approvalProven:boolean;
  latestBackupId?:string;
  latestRestoreRunId?:string;
  contradictions:string[];
  summary:{backups:number;restoreRuns:number;verificationRecords:number;drills:number;timelineItems:number};
  timeline:RecoveryTimelineItem[];
  note:string;
}

const time=(value:string|undefined|null)=>{const parsed=value?Date.parse(value):NaN;return Number.isFinite(parsed)?parsed:0;};
const newest=<T>(values:T[],read:(value:T)=>string|undefined|null)=>[...values].sort((a,b)=>time(read(b))-time(read(a)))[0];
const at=(...values:Array<string|undefined|null>)=>values.find((value)=>Boolean(value))??new Date(0).toISOString();
const runState=(state:string):RecoveryEvidenceState=>state==='SUCCEEDED'?'PASS':['FAILED','ROLLED_BACK','CANCELLED'].includes(state)?'FAIL':['RUNNING','VERIFYING'].includes(state)?'ACTIVE':['PLANNED','WAITING_APPROVAL'].includes(state)?'WAITING':'UNKNOWN';
const approvalState=(state:string):RecoveryEvidenceState=>['APPROVED','EXECUTED'].includes(state)?'PASS':['REJECTED','EXPIRED','CANCELLED'].includes(state)?'FAIL':['DRAFT','PENDING'].includes(state)?'WAITING':'UNKNOWN';
const drillState=(state:string):RecoveryEvidenceState=>state==='PASSED'?'PASS':['FAILED','CANCELLED','BLOCKED'].includes(state)?'FAIL':state==='RUNNING'?'ACTIVE':state==='PLANNED'?'WAITING':'UNKNOWN';
const backupKindLabel=(value:string)=>({MANUAL:'สร้างด้วยผู้ดูแล',SCHEDULED:'สร้างตามกำหนด',PRE_MIGRATION:'ก่อนย้ายข้อมูล',PRE_RESTORE:'ก่อนกู้คืน'}[value]??'ชนิดทางเทคนิค');
const backupStatusLabel=(value:string)=>({CAPTURED:'บันทึกแล้ว',INTEGRITY_CHECKED:'ตรวจความสมบูรณ์แล้ว',RESTORE_VERIFIED:'ยืนยันการกู้คืนแล้ว',INVALID:'ไม่ผ่านการตรวจ',LEGACY_UNPROVEN:'ข้อมูลเดิมยังพิสูจน์ไม่ได้'}[value]??'ไม่ทราบสถานะ');
const approvalStatusLabel=(value:string)=>({DRAFT:'ฉบับร่าง',PENDING:'รออนุมัติ',APPROVED:'อนุมัติแล้ว',REJECTED:'ถูกปฏิเสธ',EXPIRED:'หมดอายุ',EXECUTED:'นำไปใช้แล้ว',CANCELLED:'ยกเลิกแล้ว'}[value]??'ไม่ทราบสถานะ');
const restoreStatusLabel=(value:string)=>({PLANNED:'วางแผนแล้ว',WAITING_APPROVAL:'รออนุมัติ',RUNNING:'กำลังกู้คืน',VERIFYING:'กำลังตรวจหลังการกู้คืน',SUCCEEDED:'กู้คืนและตรวจสำเร็จ',FAILED:'กู้คืนล้มเหลว',CANCELLED:'ยกเลิกแล้ว',ROLLED_BACK:'ย้อนคืนแล้ว'}[value]??'ไม่ทราบสถานะ');
const drillTypeLabel=(value:string)=>({RESTORE:'กู้คืน',PANEL_REPAIR:'ซ่อมแผง',PERMISSION_REPAIR:'ซ่อมสิทธิ์',STARTUP_RECOVERY:'กู้คืนตอนเริ่มระบบ',OUTBOX_RECOVERY:'กู้คืนขาออกเหตุการณ์'}[value]??'การซ้อมระบบ');
const drillStatusLabel=(value:string)=>({PLANNED:'วางแผนแล้ว',RUNNING:'กำลังซ้อม',BLOCKED:'ติดตัวขัดขวาง',PASSED:'ผ่าน',FAILED:'ล้มเหลว',CANCELLED:'ยกเลิกแล้ว'}[value]??'ไม่ทราบสถานะ');

export function buildRecoveryEvidenceReport(input:{
  backups?:RecoveryBackupEvidence[];
  restoreRuns?:RecoveryRestoreRunEvidence[];
  approvals?:RecoveryApprovalEvidence[];
  verification?:RecoveryVerificationEvidence[];
  drills?:RecoveryDrillEvidence[];
  limit?:number;
}):RecoveryEvidenceReport{
  const backups=input.backups??[];
  const restoreRuns=input.restoreRuns??[];
  const approvals=input.approvals??[];
  const verification=input.verification??[];
  const drills=input.drills??[];
  const limit=Math.max(10,Math.min(160,Math.trunc(input.limit??80)));
  const latestBackup=newest(backups,(item)=>item.createdAt);
  const latestRun=newest(restoreRuns,(item)=>item.updatedAt??item.createdAt);
  const contradictions:string[]=[];

  const integrityPasses=new Map<string,RecoveryVerificationEvidence>();
  const restorePasses=new Map<string,RecoveryVerificationEvidence>();
  for(const evidence of verification){
    if(evidence.outcome!=='PASS')continue;
    if(evidence.evidenceType==='INTEGRITY_CHECK')integrityPasses.set(evidence.backupId,evidence);
    if(evidence.evidenceType==='RESTORE_VERIFY'&&evidence.restoreRunId)restorePasses.set(`${evidence.backupId}:${evidence.restoreRunId}`,evidence);
  }

  const verifiedBackups=backups.filter((backup)=>{
    if(backup.status!=='RESTORE_VERIFIED')return false;
    const runId=backup.lastRestoreRunId;
    const run=runId?restoreRuns.find((candidate)=>candidate.restoreRunId===runId&&candidate.backupId===backup.backupId):undefined;
    const proof=runId?restorePasses.get(`${backup.backupId}:${runId}`):undefined;
    const valid=Boolean(
      backup.restoreVerifiedAt&&run&&run.state==='SUCCEEDED'&&proof&&
      proof.contentHash===backup.contentHash&&proof.hashAlgorithm===backup.hashAlgorithm,
    );
    if(!valid)contradictions.push(`ชุดสำรอง ${backup.backupId} ระบุว่ายืนยันการกู้คืนแล้ว แต่หลักฐานเชื่อมโยงไม่ครบหรือไม่ตรงกัน`);
    return valid;
  });
  const latestVerified=newest(verifiedBackups,(item)=>item.restoreVerifiedAt??item.createdAt);

  const integrityBackups=backups.filter((backup)=>{
    if(!['INTEGRITY_CHECKED','RESTORE_VERIFIED'].includes(backup.status))return false;
    const proof=integrityPasses.get(backup.backupId);
    const valid=Boolean(backup.integrityCheckedAt&&proof&&proof.contentHash===backup.contentHash&&proof.hashAlgorithm===backup.hashAlgorithm);
    if(!valid&&backup.status==='INTEGRITY_CHECKED')contradictions.push(`ชุดสำรอง ${backup.backupId} ระบุว่าตรวจความสมบูรณ์แล้ว แต่ไม่พบหลักฐาน PASS ที่ตรงกับแฮชและอัลกอริทึม`);
    return valid;
  });

  const approvalById=new Map(approvals.map((item)=>[item.approvalId,item] as const));
  const approvalProven=restoreRuns.some((run)=>Boolean(run.approvalRequestId&&['APPROVED','EXECUTED'].includes(approvalById.get(run.approvalRequestId)?.state??'')));
  for(const run of restoreRuns){
    if(['RUNNING','VERIFYING','SUCCEEDED'].includes(run.state)&&run.approvalRequestId){
      const approval=approvalById.get(run.approvalRequestId);
      if(!approval||!['APPROVED','EXECUTED'].includes(approval.state))contradictions.push(`รอบการกู้คืน ${run.restoreRunId} เดินหน้าแล้ว แต่หลักฐานอนุมัติไม่อยู่ในสถานะที่ยืนยันได้`);
    }
  }

  const timeline:RecoveryTimelineItem[]=[];
  for(const backup of backups){
    timeline.push({id:`backup:${backup.backupId}`,stage:'BACKUP',state:backup.status==='INVALID'?'FAIL':'PASS',at:backup.createdAt,title:'สร้างชุดสำรอง',detail:`${backupKindLabel(backup.kind)} · ${backupStatusLabel(backup.status)}`,backupId:backup.backupId});
  }
  for(const evidence of verification){
    if(evidence.evidenceType==='INTEGRITY_CHECK')timeline.push({id:`verify:${evidence.evidenceId}`,stage:'INTEGRITY',state:evidence.outcome==='PASS'?'PASS':'FAIL',at:evidence.createdAt,title:'ตรวจความสมบูรณ์ชุดสำรอง',detail:evidence.outcome==='PASS'?'หลักฐานแฮชตรงกัน':'การตรวจความสมบูรณ์ไม่ผ่าน',backupId:evidence.backupId,evidenceId:evidence.evidenceId});
  }
  for(const approval of approvals){
    timeline.push({id:`approval:${approval.approvalId}`,stage:'APPROVAL',state:approvalState(approval.state),at:approval.updatedAt??approval.createdAt,title:'การอนุมัติกู้คืน',detail:`${approvalStatusLabel(approval.state)} · ต้องการ ${approval.requiredApprovals??1} ผู้อนุมัติ`,restoreRunId:restoreRuns.find((run)=>run.approvalRequestId===approval.approvalId)?.restoreRunId});
  }
  for(const run of restoreRuns){
    timeline.push({id:`restore:${run.restoreRunId}`,stage:'RESTORE',state:runState(run.state),at:run.updatedAt??run.createdAt,title:'รอบการกู้คืน',detail:restoreStatusLabel(run.state),backupId:run.backupId,restoreRunId:run.restoreRunId});
  }
  for(const evidence of verification){
    if(evidence.evidenceType==='RESTORE_VERIFY')timeline.push({id:`restore-verify:${evidence.evidenceId}`,stage:'VERIFY',state:evidence.outcome==='PASS'?'PASS':'FAIL',at:evidence.createdAt,title:'ตรวจหลังการกู้คืน',detail:evidence.outcome==='PASS'?'หลักฐานหลังการกู้คืนผ่าน':'หลักฐานหลังการกู้คืนไม่ผ่าน',backupId:evidence.backupId,restoreRunId:evidence.restoreRunId??undefined,evidenceId:evidence.evidenceId});
  }
  for(const drill of drills){
    timeline.push({id:`drill:${drill.drillId}`,stage:'DRILL',state:drillState(drill.status),at:at(drill.finishedAt,drill.startedAt,drill.createdAt),title:'การซ้อมกู้คืน',detail:`${drillTypeLabel(drill.drillType)} · ${drillStatusLabel(drill.status)}`,drillId:drill.drillId});
  }
  timeline.sort((a,b)=>time(b.at)-time(a.at));

  const hasFailure=contradictions.length>0||restoreRuns.some((run)=>['FAILED','ROLLED_BACK'].includes(run.state))||verification.some((item)=>item.outcome==='FAIL')||drills.some((item)=>['FAILED','BLOCKED'].includes(item.status));
  const hasActive=restoreRuns.some((run)=>['PLANNED','WAITING_APPROVAL','RUNNING','VERIFYING'].includes(run.state))||approvals.some((item)=>['DRAFT','PENDING','APPROVED'].includes(item.state))||drills.some((item)=>['PLANNED','RUNNING'].includes(item.status));
  const readiness:RecoveryReadiness=latestVerified?'VERIFIED':hasFailure?'ATTENTION':hasActive?'IN_PROGRESS':backups.length||verification.length||drills.length?'UNPROVEN':'NO_EVIDENCE';

  return {
    mode:'READ_ONLY_EVIDENCE',readiness,restoreVerified:Boolean(latestVerified),integrityProven:integrityBackups.length>0,approvalProven,
    latestBackupId:latestBackup?.backupId,latestRestoreRunId:latestRun?.restoreRunId,contradictions:[...new Set(contradictions)].slice(0,30),
    summary:{backups:backups.length,restoreRuns:restoreRuns.length,verificationRecords:verification.length,drills:drills.length,timelineItems:timeline.length},
    timeline:timeline.slice(0,limit),
    note:'สถานะยืนยันการกู้คืนต้องอาศัยชุดสำรอง แฮช รอบการกู้คืนที่สำเร็จ และหลักฐานตรวจหลังการกู้คืนที่เชื่อมโยงตรงกัน ระบบนี้อ่านหลักฐานเท่านั้นและไม่ดำเนินการกู้คืนเอง',
  };
}
