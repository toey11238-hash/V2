import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Gauge, RadioTower, Sparkles } from 'lucide-react';
import {
  deriveRealtimeVisualDirective,
  initialVisualOrchestratorState,
  initialVisualPerformanceGovernorState,
  orchestrateRealtimeVisual,
  resolveThemePack,
  updateVisualPerformanceGovernor,
  visualPerformanceBudget,
  type MotionPreset,
  type RealtimeVisualDirective,
} from '@autoserver/visual-system';

type VisualEvent={eventId:string;type:string;occurredAt:string;payload:Record<string,unknown>};
type Props={events:VisualEvent[];themeKey:string;motionPreset:string;connected:boolean;guildName?:string};
type Particle={x:number;y:number;vx:number;vy:number;life:number;ttl:number;size:number;hue:number;alpha:number;kind:'spark'|'orb'};
type Wave={x:number;y:number;radius:number;life:number;ttl:number;motion:RealtimeVisualDirective['motion'];intensity:number};

type RuntimeBudget=ReturnType<typeof visualPerformanceBudget>;
const allowedMotion=new Set<MotionPreset>(['STATIC','BALANCED','ANIMATED','CINEMATIC']);
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const hash=(value:string)=>{let total=0;for(let i=0;i<value.length;i+=1)total=(total*31+value.charCodeAt(i))>>>0;return total;};

function cssColor(element:HTMLElement,name:string,fallback:string){const value=getComputedStyle(element).getPropertyValue(name).trim();return value||fallback;}

export function RealtimeVisualStage({events,themeKey,motionPreset,connected,guildName}:Props){
  const stageRef=useRef<HTMLDivElement|null>(null);
  const canvasRef=useRef<HTMLCanvasElement|null>(null);
  const orchestratorRef=useRef(initialVisualOrchestratorState());
  const governorRef=useRef(initialVisualPerformanceGovernorState(allowedMotion.has(motionPreset as MotionPreset)?motionPreset as MotionPreset:'BALANCED'));
  const particlesRef=useRef<Particle[]>([]);
  const wavesRef=useRef<Wave[]>([]);
  const latestRef=useRef<RealtimeVisualDirective|null>(null);
  const measuredFpsRef=useRef(60);
  const [tier,setTier]=useState<RuntimeBudget['tier']>('FULL');
  const [latest,setLatest]=useState<RealtimeVisualDirective>(()=>deriveRealtimeVisualDirective('status.idle'));
  const [orchestration,setOrchestration]=useState({suppressed:0,merged:0,preempted:0});
  const theme=useMemo(()=>resolveThemePack(themeKey),[themeKey]);

  useEffect(()=>{
    const stage=stageRef.current;if(!stage)return;
    let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    let hidden=document.hidden;
    const motion=allowedMotion.has(motionPreset as MotionPreset)?motionPreset as MotionPreset:'BALANCED';
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const compute=()=>{
      const memory=(navigator as Navigator & {deviceMemory?:number}).deviceMemory;
      const next=updateVisualPerformanceGovernor(governorRef.current,{reducedMotion:reduced,hidden,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGb:memory,measuredFps:measuredFpsRef.current,motionPreset:motion});
      governorRef.current=next.state;setTier(next.budget.tier);return next.budget;
    };
    const onMedia=()=>{reduced=media.matches;compute();};
    const onVisibility=()=>{hidden=document.hidden;compute();};
    media.addEventListener?.('change',onMedia);document.addEventListener('visibilitychange',onVisibility);compute();
    return()=>{media.removeEventListener?.('change',onMedia);document.removeEventListener('visibilitychange',onVisibility);};
  },[motionPreset]);

  useEffect(()=>{
    const current=events[0];
    if(!current)return;
    const orchestrated=orchestrateRealtimeVisual(orchestratorRef.current,current,Date.now());
    orchestratorRef.current=orchestrated.state;
    setOrchestration({suppressed:orchestrated.state.suppressed,merged:orchestrated.state.merged,preempted:orchestrated.state.preempted});
    if(!orchestrated.accepted)return;
    const directive=orchestrated.directive;
    latestRef.current=directive;setLatest(directive);
    if(tier==='STATIC'||tier==='PAUSED')return;
    const canvas=canvasRef.current;if(!canvas)return;
    const seed=hash(current.eventId);const cx=canvas.width*(.34+((seed%31)/100));const cy=canvas.height*(.34+(((seed>>5)%29)/100));
    const scale=tier==='LITE'?.45:tier==='CINEMATIC'?1:.72;
    const count=Math.max(5,Math.round(directive.particleCount*scale));
    const particles=particlesRef.current;
    for(let i=0;i<count;i+=1){
      const angle=((seed+i*137.5)%360)*Math.PI/180;const speed=(.28+((seed+i*17)%70)/100)*directive.intensity*(tier==='LITE'?.8:1.35);
      particles.push({x:cx,y:cy,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-(directive.motion==='LIFT'?.55:0),life:0,ttl:directive.durationMs*(.72+((i%5)*.07)),size:1.1+(i%4)*.65,hue:(seed+i*19)%360,alpha:.88,kind:i%4===0?'orb':'spark'});
    }
    wavesRef.current.push({x:cx,y:cy,radius:8,life:0,ttl:directive.durationMs,motion:directive.motion,intensity:directive.intensity});
  },[events,tier]);

  useEffect(()=>{
    const canvas=canvasRef.current;const stage=stageRef.current;if(!canvas||!stage)return;
    const ctx=canvas.getContext('2d',{alpha:true});if(!ctx)return;
    let raf=0;let last=performance.now();let sampleAt=last;let frames=0;const initialGovernor=updateVisualPerformanceGovernor(governorRef.current,{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:document.hidden,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGb:(navigator as Navigator & {deviceMemory?:number}).deviceMemory,measuredFps:measuredFpsRef.current,motionPreset:allowedMotion.has(motionPreset as MotionPreset)?motionPreset as MotionPreset:'BALANCED'});governorRef.current=initialGovernor.state;let budget:RuntimeBudget=initialGovernor.budget;
    const resize=()=>{const rect=stage.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,1.75);canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));canvas.style.width=`${rect.width}px`;canvas.style.height=`${rect.height}px`;};
    const observer=new ResizeObserver(resize);observer.observe(stage);resize();
    const draw=(now:number)=>{
      const delta=Math.min(42,now-last);last=now;frames+=1;
      if(now-sampleAt>=1000){measuredFpsRef.current=frames*1000/(now-sampleAt);frames=0;sampleAt=now;const governed=updateVisualPerformanceGovernor(governorRef.current,{reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,hidden:document.hidden,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemoryGb:(navigator as Navigator & {deviceMemory?:number}).deviceMemory,measuredFps:measuredFpsRef.current,motionPreset:allowedMotion.has(motionPreset as MotionPreset)?motionPreset as MotionPreset:'BALANCED'});governorRef.current=governed.state;budget=governed.budget;setTier((old)=>old===budget.tier?old:budget.tier);}
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if(budget.tier!=='PAUSED'&&budget.tier!=='STATIC'){
        const accent=cssColor(stage,'--theme-accent',theme.tokens.accent);const accent2=cssColor(stage,'--theme-accent-secondary',theme.tokens.accentSecondary);const tertiary=cssColor(stage,'--theme-accent-tertiary',theme.tokens.accentTertiary);
        const centerX=canvas.width*.5,centerY=canvas.height*.49;const ambient=now/1000;
        ctx.save();ctx.globalAlpha=budget.tier==='LITE'?.18:.26;ctx.strokeStyle=accent2;ctx.lineWidth=Math.max(1,canvas.width/1200);
        for(let ring=0;ring<(budget.tier==='LITE'?2:4);ring+=1){ctx.beginPath();ctx.ellipse(centerX,centerY,canvas.width*(.13+ring*.055),canvas.height*(.09+ring*.038),ambient*(ring%2?.08:-.06),0,Math.PI*2);ctx.stroke();}
        ctx.restore();
        const waves=wavesRef.current;
        for(let i=waves.length-1;i>=0;i-=1){const wave=waves[i]!;wave.life+=delta;if(wave.life>=wave.ttl){waves.splice(i,1);continue;}const p=wave.life/wave.ttl;const radius=wave.radius+Math.max(canvas.width,canvas.height)*(.12+.18*wave.intensity)*p;ctx.save();ctx.globalAlpha=(1-p)*(.5*wave.intensity);ctx.strokeStyle=wave.motion==='SHIELD'?tertiary:wave.motion==='ENERGY'?accent:accent2;ctx.lineWidth=Math.max(1.2,4*(1-p));ctx.setLineDash(wave.motion==='ENERGY'?[10,12]:[]);ctx.beginPath();if(wave.motion==='SHIELD'){const sides=6;for(let s=0;s<=sides;s+=1){const a=-Math.PI/2+(s%sides)*Math.PI*2/sides;const x=wave.x+Math.cos(a)*radius,y=wave.y+Math.sin(a)*radius;if(s===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}}else{ctx.arc(wave.x,wave.y,radius,0,Math.PI*2);}ctx.stroke();ctx.restore();}
        const particles=particlesRef.current;const maxParticles=budget.tier==='LITE'?70:180;if(particles.length>maxParticles)particles.splice(0,particles.length-maxParticles);
        for(let i=particles.length-1;i>=0;i-=1){const p=particles[i]!;p.life+=delta;if(p.life>=p.ttl){particles.splice(i,1);continue;}p.x+=p.vx*delta;p.y+=p.vy*delta;p.vx*=.994;p.vy*=.994;if(latestRef.current?.motion==='LIFT')p.vy-=.00018*delta;const life=1-p.life/p.ttl;ctx.save();ctx.globalAlpha=life*p.alpha;ctx.fillStyle=i%3===0?accent2:i%3===1?accent:tertiary;ctx.shadowBlur=budget.shadows?12*p.size:0;ctx.shadowColor=ctx.fillStyle;ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.kind==='orb'?1.5:1),0,Math.PI*2);ctx.fill();ctx.restore();}
      }
      raf=requestAnimationFrame(draw);
    };
    raf=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(raf);observer.disconnect();};
  },[motionPreset,theme]);

  useEffect(()=>{
    const stage=stageRef.current;if(!stage)return;let frame=0;
    const move=(event:PointerEvent)=>{if(tier==='LITE'||tier==='STATIC'||tier==='PAUSED')return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const rect=stage.getBoundingClientRect();const x=clamp((event.clientX-rect.left)/rect.width-.5,-.5,.5);const y=clamp((event.clientY-rect.top)/rect.height-.5,-.5,.5);stage.style.setProperty('--parallax-x',`${x*8}deg`);stage.style.setProperty('--parallax-y',`${y*-6}deg`);stage.style.setProperty('--light-x',`${50+x*28}%`);stage.style.setProperty('--light-y',`${45+y*24}%`);});};
    const reset=()=>{stage.style.setProperty('--parallax-x','0deg');stage.style.setProperty('--parallax-y','0deg');stage.style.setProperty('--light-x','50%');stage.style.setProperty('--light-y','45%');};
    stage.addEventListener('pointermove',move,{passive:true});stage.addEventListener('pointerleave',reset,{passive:true});return()=>{cancelAnimationFrame(frame);stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerleave',reset);};
  },[tier]);

  return <section ref={stageRef} className="realtime-visual-stage" data-fx={latest.kind.toLowerCase()} data-tier={tier} aria-label="เวทีภาพเคลื่อนไหวแบบเรียลไทม์">
    <canvas ref={canvasRef} className="realtime-fx-canvas" aria-hidden="true"/>
    <div className="cinema-depth-grid" aria-hidden="true"/>
    <div className="holo-orbit orbit-one" aria-hidden="true"/><div className="holo-orbit orbit-two" aria-hidden="true"/>
    <div className="holo-crystal" aria-hidden="true"><i className="crystal-face face-a"/><i className="crystal-face face-b"/><i className="crystal-face face-c"/><i className="crystal-face face-d"/><span className="crystal-core"/></div>
    <div className="fx-emoji" key={`${events[0]?.eventId??'idle'}-${latest.kind}`} aria-hidden="true"><span>{latest.emoji}</span></div>
    <div className="visual-stage-copy">
      <span className="kicker"><Sparkles size={14}/> ระบบภาพสด</span>
      <h2>{guildName??'ศูนย์ควบคุมเซิร์ฟเวอร์'}</h2>
      <p>ภาพ แสง และมิติ 3D ตอบสนองจากเหตุการณ์จริงในระบบ โดยไม่ใช้สถานะหรือความคืบหน้าจำลอง</p>
      <div className="runtime-evidence" aria-live="polite">
        <span><RadioTower size={13}/>{connected?'เชื่อมต่อข้อมูลสดแล้ว':'กำลังรอการเชื่อมต่อข้อมูลสด'}</span>
        <span><Activity size={13}/>{latest.label}</span>
        <span><Gauge size={13}/>โหมด {tier==='CINEMATIC'?'ภาพยนตร์':tier==='FULL'?'เต็มรูปแบบ':tier==='LITE'?'ประหยัดทรัพยากร':tier==='PAUSED'?'หยุดเมื่อไม่ใช้งาน':'ลดการเคลื่อนไหว'} · รวม {orchestration.merged} · กดทับ {orchestration.suppressed}</span>
      </div>
    </div>
    <div className="event-signal-stack" aria-hidden="true"><i/><i/><i/><i/><i/></div>
  </section>;
}
