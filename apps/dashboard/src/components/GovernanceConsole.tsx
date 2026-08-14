import { useEffect, useMemo, useState } from 'react';
import { thValue } from '../ui-thai';

type Rollout={rolloutId:string;featureKey:string;scope:string;state:string;rolloutPercent:number;revision:number};
type RolloutHistory={historyId:string;rolloutId:string;featureKey:string;revision:number;action:string;snapshot:Rollout;reason?:string;createdAt:string};
type RolloutObservation={observationId:string;featureKey:string;rolloutRevision?:number;enabled:boolean;reason:string;bucket?:number;observedAt:string};
type Maintenance={maintenanceId:string;state:string;reason?:string;startsAt:string;endsAt?:string;automationPolicy?:Record<string,unknown>};
type GrowthPayload={assessment:{mode:string;score:number;reasons:string[];recommendations:string[];recommendedComplexity?:string;recommendedModules?:string[];operationalControls?:string[]};signals:Record<string,number>;channelScores:Array<{key:string;score:number;recommendation:string}>;roleScores:Array<{key:string;score:number;recommendation:string}>};

function localInput(date:Date){const local=new Date(date.getTime()-date.getTimezoneOffset()*60_000);return local.toISOString().slice(0,16);}

export function GovernanceConsole({api,guildId,authenticated,csrf}:{api:string;guildId:string;authenticated:boolean;csrf?:string}){
  const [flags,setFlags]=useState<Rollout[]>([]);
  const [history,setHistory]=useState<RolloutHistory[]>([]);
  const [observations,setObservations]=useState<RolloutObservation[]>([]);
  const [featureKey,setFeatureKey]=useState('experimental.panel-motion');
  const [outcomeMetric,setOutcomeMetric]=useState('success.rate');
  const [outcomeSummary,setOutcomeSummary]=useState<any>(null);
  const [state,setState]=useState('OFF');
  const [percent,setPercent]=useState(10);
  const [message,setMessage]=useState('');
  const [advisor,setAdvisor]=useState('');
  const [maintenance,setMaintenance]=useState<Maintenance|null>(null);
  const [maintenanceHistory,setMaintenanceHistory]=useState<Maintenance[]>([]);
  const [startsAt,setStartsAt]=useState(()=>localInput(new Date(Date.now()+10*60_000)));
  const [durationHours,setDurationHours]=useState(1);
  const [maintenanceReason,setMaintenanceReason]=useState('Controlled platform maintenance');
  const [allowRepair,setAllowRepair]=useState(true);
  const [growth,setGrowth]=useState<GrowthPayload|null>(null);
  const headers=useMemo<Record<string,string>>(()=>({'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{})}),[csrf]);
  const post=async(path:string,body:unknown)=>{const response=await fetch(`${api}${path}`,{method:'POST',credentials:'include',headers,body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.message||data.error||'คำขอล้มเหลว');return data;};

  const load=async()=>{
    if(!authenticated||!guildId){setFlags([]);setHistory([]);setObservations([]);setMaintenance(null);setGrowth(null);return;}
    const [flagResponse,historyResponse,observationResponse,maintenanceResponse,growthResponse]=await Promise.all([
      fetch(`${api}/api/guilds/${guildId}/feature-flags`,{credentials:'include'}),
      fetch(`${api}/api/guilds/${guildId}/feature-flag-history?limit=80`,{credentials:'include'}),
      fetch(`${api}/api/guilds/${guildId}/feature-flag-observations?limit=80`,{credentials:'include'}),
      fetch(`${api}/api/guilds/${guildId}/maintenance`,{credentials:'include'}),
      fetch(`${api}/api/guilds/${guildId}/growth`,{credentials:'include'}),
    ]);
    const [flagBody,historyBody,observationBody,maintenanceBody,growthBody]=await Promise.all([flagResponse.json(),historyResponse.json(),observationResponse.json(),maintenanceResponse.json(),growthResponse.json()]);
    if(flagResponse.ok)setFlags(flagBody.rollouts??[]);
    if(historyResponse.ok)setHistory(historyBody.history??[]);
    if(observationResponse.ok)setObservations(observationBody.observations??[]);
    if(maintenanceResponse.ok){setMaintenance(maintenanceBody.current??null);setMaintenanceHistory(maintenanceBody.windows??[]);}
    if(growthResponse.ok)setGrowth(growthBody);
  };

  useEffect(()=>{void load();},[guildId,authenticated]);

  const save=async()=>{try{await post(`/api/guilds/${guildId}/feature-flags`,{featureKey,scope:'GUILD',state,rolloutPercent:state==='CANARY'?percent:100});setMessage('บันทึกการทยอยเปิดใช้สำหรับเซิร์ฟเวอร์แล้ว และเก็บภาพรวมรุ่นแก้ไขไว้');await load();}catch(err){setMessage(err instanceof Error?err.message:'บันทึกไม่สำเร็จ');}};
  const evaluate=async()=>{try{const data=await post(`/api/guilds/${guildId}/feature-flags/${encodeURIComponent(featureKey)}/evaluate`,{});setMessage(`บันทึกหลักฐานแล้ว: ${data.enabled?'เปิดใช้':'ปิดใช้'} · ${thValue(data.reason)}${data.bucket==null?'':` · กลุ่ม ${data.bucket}`}`);await load();}catch(err){setMessage(err instanceof Error?err.message:'ประเมินไม่สำเร็จ');}};
  const loadOutcomes=async()=>{try{const response=await fetch(`${api}/api/guilds/${guildId}/feature-flag-outcomes?featureKey=${encodeURIComponent(featureKey)}&metricKey=${encodeURIComponent(outcomeMetric)}`,{credentials:'include'});const data=await response.json();if(!response.ok)throw new Error(data.message??data.error??'เปรียบเทียบผลลัพธ์ไม่สำเร็จ');setOutcomeSummary(data);}catch(err){setMessage(err instanceof Error?err.message:'เปรียบเทียบผลลัพธ์ไม่สำเร็จ');}};
  const rollback=async(entry:RolloutHistory)=>{const current=flags.find(flag=>flag.rolloutId===entry.rolloutId);if(!current)return;try{await post(`/api/guilds/${guildId}/feature-flags/rollouts/${current.rolloutId}/rollback`,{historyId:entry.historyId,reason:`ย้อนกลับจากแดชบอร์ดไปยังรุ่น ${entry.revision}`});setFeatureKey(entry.featureKey);setMessage(`ย้อน ${entry.featureKey} กลับไปยังรุ่น ${entry.revision} แล้ว และบันทึกการย้อนกลับเป็นรุ่นใหม่`);await load();}catch(err){setMessage(err instanceof Error?err.message:'ย้อนกลับไม่สำเร็จ');}};
  const runAdvisor=async()=>{try{const data=await post(`/api/guilds/${guildId}/ai/run`,{capability:'ANALYTICS_SUMMARY',providerKey:'local-rules',inputClasses:['ANALYTICS'],input:{request:'Summarize evidence-backed operational risks and next safe actions.'}});setAdvisor(JSON.stringify(data.result,null,2));setMessage('ตัวช่วยวิเคราะห์ภายในทำงานเสร็จแล้ว โดยไม่ได้ใช้ผู้ให้บริการปัญญาประดิษฐ์แบบเสียค่าใช้จ่าย');}catch(err){setMessage(err instanceof Error?err.message:'ตัวช่วยวิเคราะห์ทำงานไม่สำเร็จ');}};
  const scheduleMaintenance=async()=>{try{const start=new Date(startsAt);const end=new Date(start.getTime()+Math.max(1,durationHours)*60*60_000);await post(`/api/guilds/${guildId}/maintenance`,{startsAt:start.toISOString(),endsAt:end.toISOString(),reason:maintenanceReason,allowSetup:false,allowRepair,allowMemberAutomation:false});setMessage('กำหนดช่วงบำรุงรักษาผ่านตัวกำหนดเวลาถาวรแล้ว');await load();}catch(err){setMessage(err instanceof Error?err.message:'กำหนดช่วงบำรุงรักษาไม่สำเร็จ');}};
  const cancelMaintenance=async()=>{if(!maintenance)return;try{await post(`/api/guilds/${guildId}/maintenance/${maintenance.maintenanceId}/cancel`,{});setMessage('ยกเลิกช่วงบำรุงรักษาแล้ว และนำการแจ้งเตือนเข้าคิว');await load();}catch(err){setMessage(err instanceof Error?err.message:'ยกเลิกช่วงบำรุงรักษาไม่สำเร็จ');}};
  const refreshGrowth=async()=>{try{const data=await post(`/api/guilds/${guildId}/growth/refresh`,{});setGrowth(data);setMessage('อัปเดตการประเมินการเติบโตจาก Discord สดและสัญญาณกิจกรรมถาวรแล้ว');}catch(err){setMessage(err instanceof Error?err.message:'ประเมินการเติบโตไม่สำเร็จ');}};

  const selectedFlag=flags.find(flag=>flag.featureKey===featureKey);
  const selectedHistory=history.filter(item=>item.featureKey===featureKey).slice(0,6);
  const selectedObservations=observations.filter(item=>item.featureKey===featureKey).slice(0,6);
  if(!authenticated||!guildId)return null;

  return <section className="panel governance-console" aria-label="การกำกับ ความจุ และการบำรุงรักษา"><div className="panel-heading"><div><span className="kicker">การกำกับระบบ</span><h2>จำกัดผลกระทบก่อนการเปลี่ยนแปลง</h2><p className="panel-lede">การทยอยเปิดใช้ การแยกช่วงบำรุงรักษา โหมดความจุ และการตรวจหลักฐานภายในอยู่ในศูนย์ควบคุมเดียว</p></div><span className="safety-badge">ค่าเริ่มต้นไม่เสียค่าใช้จ่าย</span></div>
    <div className="governance-grid phase4-governance-grid">
      <div className="governance-cell rollout-evidence-cell"><h3>การทยอยเปิดใช้ฟีเจอร์</h3><div className="inline-fields"><input value={featureKey} onChange={e=>setFeatureKey(e.target.value)} aria-label="คีย์ฟีเจอร์"/><select value={state} onChange={e=>setState(e.target.value)}><option value="OFF">ปิด</option><option value="ON">เปิด</option><option value="CANARY">ทยอยเปิดใช้</option></select>{state==='CANARY'&&<input type="number" min="1" max="100" value={percent} onChange={e=>setPercent(Number(e.target.value))}/>}</div><div className="operator-action-buttons"><button className="secondary-action" disabled={!csrf} onClick={()=>void save()}>บันทึกการทยอยเปิดใช้</button><button className="secondary-action" disabled={!csrf||!featureKey} onClick={()=>void evaluate()}>บันทึกการประเมิน</button></div>
        <div className="canary-outcome-review"><span className="kicker">ทบทวนผลลัพธ์</span><div className="inline-fields"><input value={outcomeMetric} onChange={e=>setOutcomeMetric(e.target.value)} aria-label="คีย์ตัวชี้วัดผลลัพธ์"/><button type="button" className="secondary-action" onClick={()=>void loadOutcomes()} disabled={!featureKey||!outcomeMetric}>ทบทวนผลลัพธ์แต่ละกลุ่ม</button></div>{outcomeSummary&&<div className="evidence-row outcome-summary"><span><b>{thValue(outcomeSummary.review?.action)}</b> · กลุ่มเปิดใช้ {outcomeSummary.comparison?.enabled?.samples??0} / กลุ่มไม่เปิดใช้ {outcomeSummary.comparison?.excluded?.samples??0}</span><small>{outcomeSummary.review?.reason}</small></div>}</div><div className="flag-list">{flags.slice(0,12).map(flag=><button className="flag-row-button" type="button" key={flag.rolloutId} onClick={()=>{setFeatureKey(flag.featureKey);setState(flag.state);setPercent(flag.rolloutPercent);}}><code>{flag.featureKey}</code><span>{thValue(flag.scope)} · {thValue(flag.state)} · {flag.rolloutPercent}% · รุ่น {flag.revision}</span></button>)}</div>
        {selectedFlag&&<div className="rollout-evidence"><div><span className="kicker">ประวัติรุ่นแก้ไข</span>{selectedHistory.map(entry=><div className="evidence-row" key={entry.historyId}><span><b>รุ่น {entry.revision}</b> · {thValue(entry.action)} · {thValue(entry.snapshot.state)} {entry.snapshot.rolloutPercent}%</span><button type="button" className="secondary-action compact-action" disabled={!csrf||entry.revision>=selectedFlag.revision} onClick={()=>void rollback(entry)}>ย้อนกลับ</button></div>)}</div><div><span className="kicker">หลักฐานล่าสุด</span>{selectedObservations.length?selectedObservations.map(item=><div className="evidence-row" key={item.observationId}><span>{item.enabled?'กลุ่มเปิดใช้':'กลุ่มไม่เปิดใช้'} · {item.reason}{item.bucket==null?'':` · กลุ่ม ${item.bucket}`}</span><time>{new Date(item.observedAt).toLocaleTimeString()}</time></div>):<small>ยังไม่มีการประเมินสำหรับคีย์นี้</small>}</div></div>}
      </div>
      <div className="governance-cell"><div className="governance-cell-heading"><div><h3>ขอบเขตบำรุงรักษา</h3><p>หยุดระบบอัตโนมัติของสมาชิกเป็นค่าเริ่มต้น ขณะที่ข้อมูลวินิจฉัยยังอ่านได้</p></div><span className={`status-dot ${maintenance?'active':''}`}>{thValue(maintenance?.state??'IDLE')}</span></div>{maintenance?<div className="maintenance-current"><strong>{maintenance.reason??'บำรุงรักษาแบบควบคุม'}</strong><span>{new Date(maintenance.startsAt).toLocaleString()} → {maintenance.endsAt?new Date(maintenance.endsAt).toLocaleString():'สิ้นสุดด้วยตนเอง'}</span><button className="danger-outline" onClick={()=>void cancelMaintenance()}>ยกเลิกช่วงที่ทำงานอยู่</button></div>:<><div className="inline-fields"><input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/><input type="number" min="1" max="168" value={durationHours} onChange={e=>setDurationHours(Number(e.target.value))} aria-label="ระยะเวลาบำรุงรักษาเป็นชั่วโมง"/></div><input value={maintenanceReason} onChange={e=>setMaintenanceReason(e.target.value)} aria-label="เหตุผลการบำรุงรักษา"/><label className="check-row"><input type="checkbox" checked={allowRepair} onChange={e=>setAllowRepair(e.target.checked)}/>อนุญาตการซ่อมแบบมีการกำกับระหว่างบำรุงรักษา</label><button className="secondary-action" disabled={!csrf} onClick={()=>void scheduleMaintenance()}>กำหนดช่วงบำรุงรักษา</button></>}<small>{maintenanceHistory.length} ช่วงบำรุงรักษาที่บันทึกไว้</small></div>
      <div className="governance-cell growth-cell"><div className="governance-cell-heading"><div><h3>โหมดการเติบโต</h3><p>โหมดความจุคำนวณจากโครงสร้างสดร่วมกับกิจกรรมสนับสนุน กิจกรรม และระบบเกมที่บันทึกถาวร</p></div>{growth&&<span className="growth-orbit"><b>{growth.assessment.score}</b><small>{thValue(growth.assessment.mode)}</small></span>}</div>{growth?<><div className="growth-signals">{Object.entries(growth.signals).map(([key,value])=><span key={key}><small>{thValue(key)}</small><b>{value}</b></span>)}</div>{growth.assessment.recommendedComplexity&&<div className="growth-profile"><span>โครงสร้างที่แนะนำ</span><strong>{thValue(growth.assessment.recommendedComplexity)}</strong><small>{growth.assessment.operationalControls?.join(' · ')}</small></div>}<ul className="compact-list">{growth.assessment.recommendations.map(item=><li key={item}>{item}</li>)}</ul><div className="score-strips">{[...growth.channelScores,...growth.roleScores].slice(0,5).map(item=><div key={item.key}><code>{item.key}</code><span>{thValue(item.recommendation)}</span><meter min="0" max="100" value={item.score}>{item.score}</meter></div>)}</div></>:<p>ยังไม่มีการประเมิน</p>}<button className="secondary-action" disabled={!csrf} onClick={()=>void refreshGrowth()}>อัปเดตหลักฐาน</button></div>
      <div className="governance-cell"><h3>ตัวเชื่อมปัญญาประดิษฐ์</h3><p>ตัวที่มาพร้อมระบบ <code>กฎภายใน (local-rules)</code> ทำงานแบบกำหนดผลลัพธ์ได้ ผู้ให้บริการเชิงกำเนิดจะยังปิดอยู่จนกว่าจะลงทะเบียนและอนุญาตอย่างชัดเจน</p><button className="secondary-action" onClick={()=>void runAdvisor()}>เรียกตัวช่วยวิเคราะห์ภายใน</button>{advisor&&<pre className="advisor-output">{advisor}</pre>}</div>
    </div>{message&&<div className="recovery-message">{message}</div>}</section>;
}
