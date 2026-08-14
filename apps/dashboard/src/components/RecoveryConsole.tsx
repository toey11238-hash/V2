import { useEffect, useState } from 'react';
import { thValue } from '../ui-thai';

type Backup={backupId:string;kind:string;schemaVersion:number;contentHash:string;hashAlgorithm:string;status:string;integrityCheckedAt?:string;restoreVerifiedAt?:string;lastRestoreRunId?:string;createdAt:string};
type DriftPayload={drifts?:unknown[];repairPlan?:unknown[];configured?:boolean};
type PanelHealth={healthy?:number;unhealthy?:number;panels?:unknown[]};
type RecoveryTimelineItem={id:string;stage:'BACKUP'|'INTEGRITY'|'APPROVAL'|'RESTORE'|'VERIFY'|'DRILL';state:'PASS'|'ACTIVE'|'WAITING'|'FAIL'|'UNKNOWN';at:string;title:string;detail:string;backupId?:string;restoreRunId?:string};
type RecoveryEvidenceReport={mode:'READ_ONLY_EVIDENCE';readiness:'VERIFIED'|'IN_PROGRESS'|'ATTENTION'|'UNPROVEN'|'NO_EVIDENCE';restoreVerified:boolean;integrityProven:boolean;approvalProven:boolean;contradictions:string[];summary:{backups:number;restoreRuns:number;verificationRecords:number;drills:number;timelineItems:number};timeline:RecoveryTimelineItem[];note:string};

async function json(response:Response){const body=await response.json();if(!response.ok)throw new Error(body.message||'เรียกข้อมูลไม่สำเร็จ');return body;}
const readinessLabel:Record<RecoveryEvidenceReport['readiness'],string>={VERIFIED:'มีหลักฐานยืนยันการกู้คืน',IN_PROGRESS:'กำลังดำเนินการ',ATTENTION:'ต้องตรวจสอบ',UNPROVEN:'ยังไม่มีหลักฐานยืนยันการกู้คืน',NO_EVIDENCE:'ยังไม่มีหลักฐาน'};
const stageLabel:Record<RecoveryTimelineItem['stage'],string>={BACKUP:'ชุดสำรอง',INTEGRITY:'ตรวจความสมบูรณ์',APPROVAL:'การอนุมัติ',RESTORE:'การกู้คืน',VERIFY:'ตรวจหลังการกู้คืน',DRILL:'การซ้อม'};
const stateLabel:Record<RecoveryTimelineItem['state'],string>={PASS:'ผ่าน',ACTIVE:'กำลังทำงาน',WAITING:'รอดำเนินการ',FAIL:'ต้องตรวจสอบ',UNKNOWN:'ไม่ทราบ'};

export function RecoveryConsole({api,guildId,authenticated,csrf}:{api:string;guildId:string;authenticated:boolean;csrf?:string}){
  const [backups,setBackups]=useState<Backup[]>([]);
  const [drift,setDrift]=useState<DriftPayload|null>(null);
  const [panels,setPanels]=useState<PanelHealth|null>(null);
  const [evidence,setEvidence]=useState<RecoveryEvidenceReport|null>(null);
  const [backupId,setBackupId]=useState('');
  const [restoreRunId,setRestoreRunId]=useState('');
  const [approvalId,setApprovalId]=useState('');
  const [repairApprovalId,setRepairApprovalId]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const headers:Record<string,string>=csrf?{'x-csrf-token':csrf}:{};

  const load=async()=>{
    if(!guildId||!authenticated)return;
    const [b,d,p,e]=await Promise.all([
      fetch(`${api}/api/guilds/${guildId}/backups`,{credentials:'include'}).then(json),
      fetch(`${api}/api/guilds/${guildId}/drift`,{credentials:'include'}).then(json),
      fetch(`${api}/api/guilds/${guildId}/panels/health`,{credentials:'include'}).then(json),
      fetch(`${api}/api/guilds/${guildId}/recovery-evidence`,{credentials:'include'}).then(json),
    ]);
    setBackups(b.backups??[]);setDrift(d);setPanels(p);setEvidence(e.report??null);
    if(!backupId&&b.backups?.[0])setBackupId(b.backups[0].backupId);
  };
  useEffect(()=>{void load().catch(()=>undefined);},[guildId,authenticated]);
  const action=async(run:()=>Promise<string>)=>{setBusy(true);try{setMessage(await run());await load();}catch(error){setMessage(error instanceof Error?error.message:'ดำเนินการไม่สำเร็จ');}finally{setBusy(false);}};
  if(!authenticated||!guildId)return null;

  return <section className="panel recovery-console">
    <div className="panel-heading"><div><span className="kicker">ระบบกู้คืน</span><h2>หลักฐาน → อนุมัติ → กู้คืน → ตรวจยืนยัน → ซ้อม</h2></div><button className="secondary-action compact-action" type="button" onClick={()=>void action(async()=>{await load();return'รีเฟรชหลักฐานการกู้คืนแล้ว';})}>รีเฟรช</button></div>
    <div className="recovery-metrics"><span><b>{backups.length}</b>ชุดสำรอง</span><span><b>{drift?.drifts?.length??0}</b>สิทธิ์คลาดเคลื่อน</span><span><b>{panels?.unhealthy??0}</b>ปัญหาแผง</span><span><b>{evidence?.summary.drills??0}</b>การซ้อม</span></div>

    {evidence&&<div className={`recovery-evidence recovery-evidence--${evidence.readiness.toLowerCase()}`}>
      <div className="recovery-proof-heading"><div><span className="kicker">สายหลักฐานแบบอ่านอย่างเดียว</span><h3>{readinessLabel[evidence.readiness]}</h3></div><div className="recovery-proof-flags"><span>{evidence.integrityProven?'มีหลักฐานความสมบูรณ์':'ยังไม่มีหลักฐานความสมบูรณ์'}</span><span>{evidence.approvalProven?'พบหลักฐานอนุมัติ':'ยังไม่มีหลักฐานอนุมัติ'}</span><span>{evidence.restoreVerified?'ยืนยันการกู้คืนแล้ว':'ห้ามอ้างว่ากู้คืนสำเร็จ'}</span></div></div>
      <div className="recovery-evidence-timeline" role="list" aria-label="ลำดับหลักฐานการกู้คืน">
        {evidence.timeline.slice(0,12).map((item)=><article className={`recovery-evidence-step recovery-evidence-step--${item.state.toLowerCase()}`} role="listitem" key={item.id}>
          <div className="recovery-step-node" aria-hidden="true"/><div><span>{stageLabel[item.stage]} · {stateLabel[item.state]}</span><strong>{item.title}</strong><small>{item.detail}</small><time dateTime={item.at}>{new Date(item.at).toLocaleString('th-TH')}</time></div>
        </article>)}
        {!evidence.timeline.length&&<div className="recovery-evidence-empty">ยังไม่มีหลักฐานการกู้คืนในเซิร์ฟเวอร์นี้</div>}
      </div>
      {evidence.contradictions.length>0&&<div className="recovery-contradictions" role="alert"><strong>พบหลักฐานที่ขัดกัน</strong>{evidence.contradictions.map((item)=><span key={item}>{item}</span>)}</div>}
      <p className="recovery-note">{evidence.note}</p>
    </div>}

    <div className="recovery-grid"><div><h3>สำรองและกู้คืน</h3><select value={backupId} onChange={(e)=>setBackupId(e.target.value)}>{backups.map((b)=><option key={b.backupId} value={b.backupId}>{thValue(b.kind)} · {thValue(b.status)} · {new Date(b.createdAt).toLocaleString('th-TH')} · รุ่น {b.schemaVersion}</option>)}</select>
      <div className="action-row"><button disabled={busy||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/backups`,{method:'POST',credentials:'include',headers}).then(json);setBackupId(d.backupId);return`สร้างชุดสำรองแบบละเอียดแล้ว: ${d.backupId}`;})}>สร้างชุดสำรองละเอียด</button><button disabled={busy||!backupId||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/backups/${backupId}/restore-plan`,{method:'POST',credentials:'include',headers}).then(json);return`ตัวอย่างกู้คืน: ${d.changes?.length??0} การเปลี่ยนแปลง · ${d.requiresApproval?'ต้องอนุมัติ':'ไม่ต้องอนุมัติตามนโยบาย'}`;})}>ดูตัวอย่างกู้คืน</button></div>
      <button disabled={busy||!backupId||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/backups/${backupId}/restore-request`,{method:'POST',credentials:'include',headers}).then(json);if(d.noChanges)return'ชุดสำรองตรงกับสถานะที่ระบบดูแลอยู่แล้ว';setRestoreRunId(d.restoreRunId);setApprovalId(d.approvalId);return`สร้างคำขอกู้คืน ${d.restoreRunId} · ต้องมีผู้อนุมัติอิสระ ${d.requiredApprovals} คน`;})}>ขอกู้คืนภายใต้การควบคุม</button>
      <div className="inline-fields"><input value={approvalId} onChange={(e)=>setApprovalId(e.target.value)} placeholder="รหัสการอนุมัติกู้คืน"/><button disabled={busy||!approvalId||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/approvals/${approvalId}/approve`,{method:'POST',credentials:'include',headers}).then(json);return`สถานะการอนุมัติ: ${thValue(d.approval.state)}`;})}>อนุมัติ</button></div>
      <div className="inline-fields"><input value={restoreRunId} onChange={(e)=>setRestoreRunId(e.target.value)} placeholder="รหัสรอบการกู้คืน"/><button disabled={busy||!restoreRunId||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/restore-runs/${restoreRunId}/execute`,{method:'POST',credentials:'include',headers}).then(json);return`ส่งงานกู้คืนเข้าคิวแล้ว: ${d.jobId}`;})}>ดำเนินการกู้คืน</button></div></div>
      <div><h3>ซ่อมแซมและแผง</h3><div className="action-row"><button disabled={busy||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/panels/repair`,{method:'POST',credentials:'include',headers}).then(json);return`ปรับแผงให้ตรงสถานะแล้ว ${d.results?.length??0} แผง`;})}>ปรับแผงให้ตรงสถานะ</button><button disabled={busy||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/drift/permission-repair-request`,{method:'POST',credentials:'include',headers}).then(json);if(d.noChanges)return'ไม่พบสิทธิ์คลาดเคลื่อนที่ซ่อมได้';setRepairApprovalId(d.approvalId);return`สร้างคำขอซ่อมสิทธิ์สำหรับ ${d.repairableCount} ช่อง`;})}>ขอซ่อมสิทธิ์</button></div>
      <div className="inline-fields"><input value={repairApprovalId} onChange={(e)=>setRepairApprovalId(e.target.value)} placeholder="รหัสการอนุมัติซ่อมสิทธิ์"/><button disabled={busy||!repairApprovalId||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/approvals/${repairApprovalId}/approve`,{method:'POST',credentials:'include',headers}).then(json);return`สถานะการอนุมัติ: ${thValue(d.approval.state)}`;})}>อนุมัติ</button><button disabled={busy||!repairApprovalId||!csrf} onClick={()=>void action(async()=>{const d=await fetch(`${api}/api/guilds/${guildId}/permission-repair/${repairApprovalId}/execute`,{method:'POST',credentials:'include',headers}).then(json);return`ส่งงานซ่อมสิทธิ์เข้าคิวแล้ว: ${d.jobId}`;})}>ดำเนินการ</button></div>
      <p className="recovery-note">สถานะตรวจความสมบูรณ์หมายถึงสแนปช็อตผ่านการตรวจเช็กซัมแบบไป-กลับเท่านั้น ไม่ใช่หลักฐานว่ากู้คืนสำเร็จ สถานะยืนยันการกู้คืนจะบันทึกหลังงานกู้คืนภายใต้การควบคุมผ่านการตรวจหลังใช้งานจริงเท่านั้น งานเสี่ยงสูงห้ามผู้ขออนุมัติตัวเอง และระบบจะปฏิเสธแผนหรือแฮชชุดสำรองที่ล้าสมัย</p></div>
    </div>{message&&<div className="recovery-message" role="status" aria-live="polite">{message}</div>}
  </section>;
}
