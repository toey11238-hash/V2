import assert from 'node:assert/strict';
import { RealtimeHub } from '../packages/realtime/src/index.ts';
import { buildEventReplay } from '../packages/event-replay/src/index.ts';
import { buildServerDigitalTwin } from '../packages/digital-twin/src/index.ts';
import { buildOperationsIntelligence } from '../packages/operations-intelligence/src/index.ts';
import { initialVisualOrchestratorState, orchestrateRealtimeVisual, initialVisualPerformanceGovernorState, updateVisualPerformanceGovernor } from '../packages/visual-system/src/index.ts';

let assertions=0;const check=(value,message)=>{assertions+=1;assert.ok(value,`ASSERTION_${assertions}_FAILED: ${message}`);};
const event=(id,type='job.started',sequence=1)=>({eventId:id,schemaVersion:1,type,guildId:'g',correlationId:'00000000-0000-4000-8000-000000000001',aggregateKey:'job:1',sequence,occurredAt:new Date(1_700_000_000_000+sequence).toISOString(),payload:{}});
const delivered=[];const normal={readyState:1,bufferedAmount:0,send:(data)=>delivered.push(data),close:()=>{}};let backpressureClose=0;const pressured={readyState:1,bufferedAmount:20_000,send:()=>{},close:(code)=>{backpressureClose=code??0;}};
const hub=new RealtimeHub(50,16_384);hub.addClient(normal,()=>true);hub.addClient(pressured,()=>true);hub.publish(event('hub-1'));hub.publish(event('hub-1'));check(delivered.length===1,'realtime hub must deliver duplicate event only once');check(backpressureClose===1013&&hub.stats().backpressureDisconnects===1,'realtime hub must shed backpressured client');check(hub.stats().deduplicatedEvents===1,'realtime hub must count duplicate evidence');
for(let i=2;i<=90;i++)hub.publish(event(`hub-${i}`,'job.progress',i));check(hub.getRecent(500).length===50,'realtime hub must bound recent buffer');

const replayInput=[];for(let i=0;i<700;i++)replayInput.push({origin:i%2?'LIVE':'DURABLE',...event(`r-${i}`,'setup.job.progress',i+1),payload:{nested:{secret:i%17===0?'hide':'ok'}}});
const replay=buildEventReplay(replayInput,500);check(replay.events.length===500,'replay must enforce upper timeline bound');check(replay.events[0].sequence===201&&replay.events.at(-1).sequence===700,'replay must retain the newest bounded chronological window');check(replay.redactedFields>0,'replay stress corpus must retain redaction evidence');check(replay.orderingGaps===0&&replay.staleSequences===0,'contiguous replay stress corpus must preserve ordering');

const actions=Array.from({length:1200},(_,i)=>({type:i%97===0?'CONFLICT':i%3===0?'UPDATE':'CREATE',risk:i%41===0?'HIGH':'LOW',reason:'chaos model',desired:{logicalKey:`R_${i}`,kind:i%4===0?'ROLE':'TEXT_CHANNEL',module:`m${i%12}`,name:`ทรัพยากร ${i}`,required:i%97===0}}));
const twin=buildServerDigitalTwin({actions});check(twin.summary.total===1200&&twin.lanes.length===12,'digital twin must remain bounded and complete under large valid plans');check(twin.applyBlocked&&twin.apiPressure.modelRisk==='HIGH','large conflict-bearing plan must fail closed and flag API pressure');

const overload=buildOperationsIntelligence({database:{configured:true,healthy:true},discord:{enabled:true,ready:true,guildAvailable:true},realtime:{clients:30,recentGuildEvents:200,backpressureDisconnects:14,sendFailures:9,deduplicatedEvents:100},queues:[{name:'งานระบบ',queued:1000,retrying:200,failed:50,deadLetter:10,oldestPendingAgeSeconds:7200}],components:[{name:'worker',state:'DEGRADED',lastSeenAgeSeconds:500}],incidents:{open:5,critical:0},errorBudgets:[{name:'งานระบบ',health:'EXHAUSTED',remainingFraction:0,burnMultiple:5,total:500}]});check(overload.health==='CRITICAL'&&overload.riskScore===100,'overload model must saturate at bounded critical risk');

let visual=initialVisualOrchestratorState();
visual=orchestrateRealtimeVisual(visual,{eventId:'branch-ticket',type:'ticket.created',payload:{severity:'LOW'}},9_000).state;
visual=orchestrateRealtimeVisual(visual,{eventId:'branch-security',type:'security.alert',payload:{severity:'CRITICAL'}},9_020).state;
visual=orchestrateRealtimeVisual(visual,{eventId:'branch-member',type:'member.join',payload:{}},9_040).state;
visual=orchestrateRealtimeVisual(visual,{eventId:'branch-security-merge',type:'security.alert',payload:{severity:'CRITICAL'}},9_060).state;
check(visual.preempted===1&&visual.suppressed===1&&visual.merged===1,'deterministic visual branch proof must exercise preemption, suppression and merge');
for(let i=0;i<2000;i++){const type=i%29===0?'security.alert':i%7===0?'gaming.level.up':i%3===0?'ticket.created':'member.join';const result=orchestrateRealtimeVisual(visual,{eventId:`v-${i}`,type,payload:{severity:i%29===0?'CRITICAL':'LOW'}},10_000+i*20);visual=result.state;check(result.directive.particleCount<=56,`particle budget exceeded at ${i}`);check(result.directive.durationMs<=3200,`duration budget exceeded at ${i}`);}check(visual.recentEventIds.length<=96,'visual dedup window must remain bounded');check(visual.preempted>=1&&visual.suppressed>1&&visual.merged>1,'mixed visual storm must preserve bounded branch counters under load');

let governor=initialVisualPerformanceGovernorState('BALANCED');const tiers=[];for(let i=0;i<40;i++){const fps=i%2?58:40;governor=updateVisualPerformanceGovernor(governor,{reducedMotion:false,hidden:false,hardwareConcurrency:8,deviceMemoryGb:8,measuredFps:fps,motionPreset:'BALANCED'}).state;tiers.push(governor.tier);}check(!tiers.includes('LITE'),'alternating single low/high FPS samples must not flap to LITE');
const hidden=updateVisualPerformanceGovernor(governor,{reducedMotion:false,hidden:true,motionPreset:'BALANCED'});check(hidden.state.tier==='PAUSED'&&hidden.budget.targetFps===0,'hidden tab must pause immediately under chaos load');
console.log(`Phase 29 chaos/replay smoke passed: ${assertions} assertions.`);
