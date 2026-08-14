import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, History, Pause, Play, RefreshCw } from 'lucide-react';
import { thEventType, thValue } from '../ui-thai';

type ReplayEvent={eventId:string;type:string;correlationId:string;source?:string;aggregateKey?:string;sequence?:number;occurredAt:string;origin:'DURABLE'|'LIVE';offsetMs:number;payload:unknown;redactedFields:number;ordering:string};
type Replay={mode:string;sideEffectsAllowed:false;events:ReplayEvent[];durationMs:number;eventTypes:Record<string,number>;correlations:number;aggregates:number;orderingGaps:number;staleSequences:number;duplicateEventsDropped:number;redactedFields:number;sources:{durable:number;live:number};note:string};
type Payload={generatedAt:string;replay:Replay};
const fmtOffset=(ms:number)=>ms<1000?`+${ms} มส.`:`+${(ms/1000).toFixed(ms<10000?1:0)} วิ`;

export function EventReplayConsole({api,guildId,authenticated}:{api:string;guildId:string;authenticated:boolean}){
  const [data,setData]=useState<Payload|null>(null);const [cursor,setCursor]=useState(0);const [playing,setPlaying]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [reduced,setReduced]=useState(false);
  const load=async()=>{if(!guildId||!authenticated)return;setBusy(true);try{const response=await fetch(`${api}/api/guilds/${guildId}/event-replay?limit=220`,{credentials:'include'});const body=await response.json();if(!response.ok)throw new Error(body.message||body.error||'โหลดเหตุการณ์ย้อนหลังไม่สำเร็จ');setData(body);setCursor(Math.max(0,(body.replay?.events?.length??1)-1));setError('');}catch(err){setError(err instanceof Error?err.message:'โหลดเหตุการณ์ย้อนหลังไม่สำเร็จ');}finally{setBusy(false);}};
  useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener?.('change',update);return()=>media.removeEventListener?.('change',update);},[]);
  useEffect(()=>{setPlaying(false);void load();},[guildId,authenticated]);
  const events=data?.replay.events??[];const current=events[cursor];
  useEffect(()=>{if(!playing||reduced||events.length<2)return;const timer=window.setInterval(()=>setCursor((value)=>value>=events.length-1?0:value+1),850);return()=>window.clearInterval(timer);},[playing,reduced,events.length]);
  const payloadText=useMemo(()=>current?JSON.stringify(current.payload,null,2):'', [current]);
  if(!authenticated||!guildId)return null;
  return <section className="panel replay-console">
    <div className="panel-heading"><div><span className="kicker"><History size={14}/> ห้องเล่นเหตุการณ์ย้อนหลัง</span><h2>ย้อนดูเหตุการณ์จริงโดยตัดผลข้างเคียงออกทั้งหมด</h2></div><button className="secondary-action compact-action" disabled={busy} onClick={()=>void load()}><RefreshCw size={13}/>{busy?'กำลังรวมหลักฐาน…':'โหลดหลักฐานใหม่'}</button></div>
    {error&&<div className="recovery-message">{error}</div>}
    {data&&<><div className="replay-proof"><span><b>{events.length}</b>เหตุการณ์</span><span><b>{data.replay.sources.durable}</b>ถาวร</span><span><b>{data.replay.sources.live}</b>สด</span><span><b>{data.replay.orderingGaps}</b>ช่องว่างลำดับ</span><span><b>{data.replay.redactedFields}</b>ช่องที่ปกปิด</span><span className="replay-readonly">อ่านอย่างเดียว · ไม่ยิง Discord</span></div>
      {events.length===0?<div className="setup-empty">ยังไม่มีหลักฐานเหตุการณ์ของเซิร์ฟเวอร์นี้ใน durable outbox หรือ realtime buffer</div>:<div className="replay-workbench">
        <div className="replay-timeline"><div className="timeline-rail">{events.map((event,index)=><button type="button" aria-label={`${index+1} ${thEventType(event.type)}`} className={`${index===cursor?'active ':''}order-${event.ordering.toLowerCase()}`} key={event.eventId} style={{left:`${events.length===1?50:(index/(events.length-1))*100}%`}} onClick={()=>{setCursor(index);setPlaying(false);}}><i/></button>)}</div><input aria-label="ตำแหน่งเหตุการณ์ย้อนหลัง" type="range" min="0" max={Math.max(0,events.length-1)} value={cursor} onChange={(event)=>{setCursor(Number(event.target.value));setPlaying(false);}}/><div className="replay-controls"><button type="button" disabled={cursor<=0} onClick={()=>{setPlaying(false);setCursor(Math.max(0,cursor-1));}}><ChevronLeft size={14}/>ก่อนหน้า</button><button type="button" disabled={reduced||events.length<2} onClick={()=>setPlaying((value)=>!value)}>{playing?<Pause size={14}/>:<Play size={14}/>} {reduced?'ปิดตามโหมดลดการเคลื่อนไหว':playing?'หยุด':'เล่นย้อนหลัง'}</button><button type="button" disabled={cursor>=events.length-1} onClick={()=>{setPlaying(false);setCursor(Math.min(events.length-1,cursor+1));}}>ถัดไป<ChevronRight size={14}/></button></div></div>
        {current&&<article className="replay-inspector" data-order={current.ordering.toLowerCase()}><div className="replay-event-head"><div><span>{fmtOffset(current.offsetMs)} · {current.origin==='DURABLE'?'หลักฐานถาวร':'ข้อมูลสด'}</span><h3>{thEventType(current.type)}</h3></div><b>{thValue(current.ordering)}</b></div><dl><div><dt>เวลา</dt><dd>{new Date(current.occurredAt).toLocaleString('th-TH')}</dd></div><div><dt>รหัสเชื่อมโยง</dt><dd>{current.correlationId}</dd></div><div><dt>กลุ่มเหตุการณ์</dt><dd>{current.aggregateKey??'—'} {current.sequence!=null?`#${current.sequence}`:''}</dd></div><div><dt>ปกปิด</dt><dd>{current.redactedFields} ช่อง</dd></div></dl><pre>{payloadText}</pre></article>}
      </div>}
      <p className="ops-evidence-note">{data.replay.note}</p>
    </>}
  </section>;
}
