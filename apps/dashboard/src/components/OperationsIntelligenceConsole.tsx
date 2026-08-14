import { useEffect, useState } from 'react';
import { Activity, Gauge, RadioTower, RefreshCw, Siren } from 'lucide-react';
import { thModule, thValue } from '../ui-thai';

type Queue={name:string;queued:number;running?:number;retrying?:number;failed?:number;deadLetter?:number;oldestPendingAgeSeconds?:number|null;maxAttempts?:number|null};
type Signal={severity:string;key:string;label:string;detail:string;weight:number};
type Component={name:string;label?:string;state:string;lastSeenAgeSeconds?:number|null;detail?:string};
type Budget={name:string;health:string;remainingFraction?:number|null;burnMultiple?:number|null;total:number};
type Report={health:string;riskScore:number;signals:Signal[];queues:Queue[];components:Component[];errorBudgets:Budget[];realtime:{clients:number;recentGuildEvents:number;backpressureDisconnects:number;sendFailures:number;deduplicatedEvents:number};summary:{criticalSignals:number;degradedSignals:number;watchSignals:number;openIncidents:number;criticalIncidents:number};note:string};
type Payload={generatedAt:string;report:Report};

const fmtAge=(seconds?:number|null)=>seconds==null?'ไม่ทราบ':seconds<60?`${Math.round(seconds)} วิ`:seconds<3600?`${Math.round(seconds/60)} นาที`:`${Math.round(seconds/3600)} ชม.`;

export function OperationsIntelligenceConsole({api,guildId,authenticated}:{api:string;guildId:string;authenticated:boolean}){
  const [data,setData]=useState<Payload|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  const load=async()=>{if(!guildId||!authenticated)return;setBusy(true);try{const response=await fetch(`${api}/api/guilds/${guildId}/operations-intelligence`,{credentials:'include'});const body=await response.json();if(!response.ok)throw new Error(body.message||body.error||'โหลดข่าวกรองปฏิบัติการไม่สำเร็จ');setData(body);setError('');}catch(err){setError(err instanceof Error?err.message:'โหลดข่าวกรองปฏิบัติการไม่สำเร็จ');}finally{setBusy(false);}};
  useEffect(()=>{if(!guildId||!authenticated)return;void load();const timer=window.setInterval(()=>void load(),15000);return()=>window.clearInterval(timer);},[guildId,authenticated]);
  if(!authenticated||!guildId)return null;const report=data?.report;
  return <section className="panel ops-intelligence" data-health={(report?.health??'unknown').toLowerCase()}>
    <div className="panel-heading"><div><span className="kicker"><RadioTower size={14}/> ข่าวกรองปฏิบัติการ</span><h2>คิว · SLO · ข้อมูลสด · เหตุผิดปกติบนหลักฐานชุดเดียว</h2></div><button className="secondary-action compact-action" disabled={busy} onClick={()=>void load()}><RefreshCw size={13}/>{busy?'กำลังอ่าน…':'อ่านหลักฐานใหม่'}</button></div>
    {error&&<div className="recovery-message">{error}</div>}
    {report&&<>
      <div className="ops-spine"><div className="ops-health-orb"><span>{thValue(report.health)}</span><b>{report.riskScore}</b><small>คะแนนความเสี่ยง</small></div><div className="ops-spine-line"><i style={{width:`${Math.max(2,report.riskScore)}%`}}/></div><div className="ops-live-evidence"><span><Activity size={13}/>{report.realtime.recentGuildEvents} เหตุการณ์ล่าสุด</span><span><Gauge size={13}/>{report.realtime.clients} ไคลเอนต์สด</span><span><Siren size={13}/>{report.summary.openIncidents} เหตุยังเปิด</span></div></div>
      <div className="ops-grid">
        <div className="ops-queues"><h3>แรงกดดันคิว</h3>{report.queues.map((queue)=>{const pressure=Math.min(100,(queue.queued+(queue.retrying??0))*2+Math.min(40,(queue.oldestPendingAgeSeconds??0)/15));return <div className="queue-pressure" key={queue.name}><div><strong>{queue.name}</strong><span>{queue.queued} รอ · {queue.retrying??0} ลองใหม่ · เก่าสุด {fmtAge(queue.oldestPendingAgeSeconds)}</span></div><div className="pressure-track"><i style={{width:`${Math.max(2,pressure)}%`}}/></div></div>})}</div>
        <div className="ops-signals"><h3>สัญญาณที่ต้องรู้</h3>{report.signals.length===0?<div className="ops-clear">ไม่พบสัญญาณยกระดับจากหลักฐานปัจจุบัน</div>:report.signals.slice(0,8).map((signal)=><div className={`ops-signal severity-${signal.severity.toLowerCase()}`} key={signal.key}><i/><div><strong>{signal.label}</strong><span>{signal.detail}</span></div></div>)}</div>
        <div className="ops-components"><h3>ชีพจรองค์ประกอบ</h3><div className="component-orbit">{report.components.slice(0,14).map((component)=><span className={`component-node state-${component.state.toLowerCase()}`} key={component.name} title={`${component.detail??''} · ${fmtAge(component.lastSeenAgeSeconds)}`}><i/>{component.label??thModule(component.name)}</span>)}</div>{report.errorBudgets.map((budget)=><div className="budget-line" key={budget.name}><strong>{budget.name}</strong><span>{thValue(budget.health)} · {budget.total} ตัวอย่าง</span><i style={{width:`${Math.round((budget.remainingFraction??0)*100)}%`}}/></div>)}</div>
      </div>
      <p className="ops-evidence-note">{report.note} · อ่านล่าสุด {new Date(data!.generatedAt).toLocaleString('th-TH')}</p>
    </>}
  </section>;
}
