import { Activity, Radio } from 'lucide-react';
import { deriveServerPulse, pulseColor, thaiServerPulseReason, thaiServerPulseState, type ServerPulseState } from '@autoserver/visual-system';

type DurableState={state:string;reason:string;revision:number;changedAt:string};
type Props={themeKey:string;healthStatus?:string;connected:boolean;events:Array<{type:string;occurredAt:string}>;durableState?:DurableState|null};
const validStates=new Set<ServerPulseState>(['IDLE','ACTIVE','READY','LIVE','SUCCESS','WATCH','DEGRADED','INCIDENT','MAINTENANCE','SYNCING','RECOVERY']);
export function ServerPulseCard({themeKey,healthStatus,connected,events,durableState}:Props){
  const types=events.slice(0,30).map((e)=>e.type.toLowerCase());
  const pulse=deriveServerPulse({criticalIncidents:types.filter((x)=>x.includes('incident')&&x.includes('open')).length,degradedComponents:healthStatus&&!['ok','healthy','ready'].includes(healthStatus.toLowerCase())?1:0,activeSessions:types.filter((x)=>x.includes('gaming.session')&&x.includes('active')).length,readySessions:types.filter((x)=>x.includes('gaming.session')&&x.includes('ready')).length,syncingJobs:types.filter((x)=>x.includes('job')&&x.includes('started')).length,recoveryActive:types.some((x)=>x.includes('recovery')&&x.includes('started')),lastEventAt:events[0]?.occurredAt??null});
  const durablePulse=durableState&&validStates.has(durableState.state as ServerPulseState)?{state:durableState.state as ServerPulseState,reason:durableState.reason}:null;
  const visualState=durablePulse?.state??pulse.state;const visualReason=durablePulse?.reason??pulse.reason;const color=pulseColor(themeKey,visualState);
  return <section className="server-pulse-card" style={{'--pulse-color':color} as React.CSSProperties} aria-label="ชีพจรเซิร์ฟเวอร์">
    <div className="pulse-core" aria-hidden="true"><i/><b/><span/></div>
    <div><span className="kicker"><Activity size={14}/> ชีพจรเซิร์ฟเวอร์</span><h3>{thaiServerPulseState(visualState)}</h3><p>{thaiServerPulseReason(visualReason)} ภาพสถานะคำนวณจากข้อมูลรันไทม์และเหตุการณ์ที่บันทึกจริง ไม่ใช้ตัวจับเวลาจำลอง</p><small><Radio size={12}/>{connected?'เชื่อมต่อข้อมูลสด':'การเชื่อมต่อข้อมูลสดขาดหาย'} · {durablePulse?`รุ่นสถานะ ${durableState?.revision}`:`ความเข้มสัญญาณ ${Math.round(pulse.intensity*100)}%`}</small></div>
  </section>;
}
