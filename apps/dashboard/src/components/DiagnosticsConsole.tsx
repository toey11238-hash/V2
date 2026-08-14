import { useEffect, useState } from 'react';
import { thModule, thValue } from '../ui-thai';
type ComponentState={key:string;state:'HEALTHY'|'DEGRADED'|'OFFLINE'|'UNKNOWN';latencyMs?:number;detail?:string};
type Diagnostics={guildId:string;configured:boolean;state:string;generatedAt:string;components:ComponentState[];permissionDriftCount:number|null;panelIssues:number|null;queue:{queued:number;running:number;retrying:number;deadLetter:number};latestJob?:{jobId:string;type:string;status:string;currentStep?:string}|null};
export function DiagnosticsConsole({api,guildId,authenticated}:{api:string;guildId:string;authenticated:boolean}){
  const [data,setData]=useState<Diagnostics|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const load=async()=>{if(!guildId||!authenticated)return;setBusy(true);try{const response=await fetch(`${api}/api/guilds/${guildId}/diagnostics`,{credentials:'include'});const body=await response.json();if(!response.ok)throw new Error(body.message||body.error||'ตรวจวินิจฉัยไม่สำเร็จ');setData(body);setError('');}catch(e){setError(e instanceof Error?e.message:'ตรวจวินิจฉัยไม่สำเร็จ');}finally{setBusy(false);}};
  useEffect(()=>{void load();},[guildId,authenticated]);if(!authenticated||!guildId)return null;
  return <section className="panel diagnostics-console"><div className="panel-heading"><div><span className="kicker">ศูนย์วินิจฉัย</span><h2>แสดงหลักฐานสด ไม่ใช้ไฟเขียวเพื่อการตกแต่ง</h2></div><button className="secondary-action compact-action" disabled={busy} onClick={()=>void load()}>{busy?'กำลังสแกน…':'สแกนข้อมูลสด'}</button></div>
    {error&&<div className="recovery-message">{error}</div>}{data&&<><div className="recovery-metrics"><span><b>{thValue(data.state)}</b>ภาพรวม</span><span><b>{data.permissionDriftCount??'?'}</b>สิทธิ์คลาดเคลื่อน</span><span><b>{data.panelIssues??'?'}</b>ปัญหาแผง</span><span><b>{data.queue.deadLetter}</b>งานตกค้างถาวร</span></div>
    <div className="diagnostic-grid">{data.components.map((component)=><article key={component.key} className={`diagnostic-card state-${component.state.toLowerCase()}`}><div><b>{thModule(component.key)}</b><span>{thValue(component.state)}</span></div><p>{component.detail||'ไม่มีรายละเอียดเพิ่มเติม'}</p>{component.latencyMs!=null&&<small>{Math.round(component.latencyMs)} มิลลิวินาที</small>}</article>)}</div>
    <p className="recovery-note">สร้างข้อมูลเมื่อ {new Date(data.generatedAt).toLocaleString('th-TH')} · ถ้าระบบเก็บหลักฐานอย่างปลอดภัยไม่ได้ สถานะจะคงเป็น “ไม่ทราบ” แทนการเดา</p></>}
  </section>;
}
