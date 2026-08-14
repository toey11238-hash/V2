import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildServerDigitalTwin } from '../packages/digital-twin/src/index.ts';
import { buildOperationsIntelligence } from '../packages/operations-intelligence/src/index.ts';
import { buildEventReplay } from '../packages/event-replay/src/index.ts';
import { buildRecoveryEvidenceReport } from '../packages/recovery-evidence/src/index.ts';
import { initialVisualOrchestratorState, orchestrateRealtimeVisual, initialVisualPerformanceGovernorState, updateVisualPerformanceGovernor } from '../packages/visual-system/src/index.ts';

const root=process.cwd();const text=(file)=>fs.readFileSync(path.join(root,file),'utf8');let assertions=0;const check=(value,message)=>{assertions+=1;assert.ok(value,`ASSERTION_${assertions}_FAILED: ${message}`);};

const twin=buildServerDigitalTwin({actions:[
  {type:'CREATE',risk:'LOW',reason:'create',desired:{logicalKey:'CH_NEW',kind:'TEXT_CHANNEL',module:'community',name:'ห้องใหม่',parentKey:'CAT_MAIN'}},
  {type:'ADOPT',risk:'MEDIUM',reason:'adopt',desired:{logicalKey:'ROLE_MEMBER',kind:'ROLE',module:'roles',name:'สมาชิก'},actual:{discordId:'1',name:'สมาชิก'}},
  {type:'CONFLICT',risk:'HIGH',reason:'conflict',desired:{logicalKey:'ROLE_ADMIN',kind:'ROLE',module:'security',name:'ผู้ดูแล',required:true}},
],structuralImpact:{level:'HIGH',score:41,reasons:['โครงสร้างกระทบสูง']},configurationImpact:{level:'MEDIUM',score:18,reasons:['การตั้งค่ากระทบปานกลาง']}});
check(twin.mode==='READ_ONLY_PREVIEW','digital twin must be read-only');
check(twin.applyBlocked===true&&twin.overallRisk==='CRITICAL','required conflict must block apply and elevate risk');
check(twin.summary.discordMutations===1&&twin.summary.mappingOnly===1,'digital twin mutation accounting must distinguish Discord from mapping-only work');
check(twin.edges.some((edge)=>edge.from==='CAT_MAIN'&&edge.to==='CH_NEW'),'digital twin must preserve parent topology');
check(twin.rollback.note.includes('ข้อมูลสำรองสถานะ')&&twin.rollback.note.includes('ตรวจสถานะ Discord ซ้ำ')&&twin.apiPressure.note.includes('ไม่ใช่เวลาประมาณการ'),'twin must not fabricate rollback or timing certainty');

const highPressureActions=Array.from({length:90},(_,index)=>({type:'CREATE',risk:'LOW',reason:'scale',desired:{logicalKey:`CH_${index}`,kind:'TEXT_CHANNEL',module:'community',name:`ห้อง ${index}`}}));
const highTwin=buildServerDigitalTwin({actions:highPressureActions});
check(highTwin.apiPressure.modelRisk==='HIGH'&&highTwin.apiPressure.mutationUnits===90,'digital twin API pressure must derive from real mutation count');

const healthyOps=buildOperationsIntelligence({database:{configured:true,healthy:true},discord:{enabled:true,ready:true,guildAvailable:true},realtime:{clients:2,recentGuildEvents:20,backpressureDisconnects:0,sendFailures:0,deduplicatedEvents:3},queues:[{name:'งานระบบ',queued:0,running:1,retrying:0,failed:0,deadLetter:0,oldestPendingAgeSeconds:null}],components:[{name:'worker',state:'HEALTHY',lastSeenAgeSeconds:4}],incidents:{open:0,critical:0},errorBudgets:[{name:'งานระบบ',health:'HEALTHY',remainingFraction:.8,burnMultiple:.2,total:100}]});
check(healthyOps.health==='HEALTHY'&&healthyOps.signals.length===0,'healthy evidence must remain healthy without decorative warnings');
const criticalOps=buildOperationsIntelligence({database:{configured:true,healthy:false},discord:{enabled:true,ready:false,guildAvailable:false},realtime:{clients:0,recentGuildEvents:0,backpressureDisconnects:2,sendFailures:3,deduplicatedEvents:0},queues:[{name:'งานระบบ',queued:120,retrying:30,deadLetter:2,oldestPendingAgeSeconds:1200}],components:[{name:'worker',state:'OFFLINE',lastSeenAgeSeconds:400}],incidents:{open:2,critical:1},errorBudgets:[{name:'งานระบบ',health:'EXHAUSTED',remainingFraction:0,burnMultiple:3,total:80}]});
check(criticalOps.health==='CRITICAL'&&criticalOps.riskScore===100,'critical evidence must fail closed at maximum bounded risk');
check(criticalOps.summary.criticalSignals>=4,'critical report must preserve multiple independent failure signals');

const replay=buildEventReplay([
  {origin:'DURABLE',eventId:'a',type:'ticket.created',guildId:'g',correlationId:'c1',aggregateKey:'ticket:1',sequence:1,occurredAt:'2026-08-15T00:00:00.000Z',payload:{token:'secret',subject:'ช่วยเหลือ'}},
  {origin:'LIVE',eventId:'b',type:'ticket.claimed',guildId:'g',correlationId:'c1',aggregateKey:'ticket:1',sequence:3,occurredAt:'2026-08-15T00:00:01.000Z',payload:{authorization:'Bearer hidden'}},
  {origin:'LIVE',eventId:'b',type:'ticket.claimed',guildId:'g',correlationId:'c1',aggregateKey:'ticket:1',sequence:3,occurredAt:'2026-08-15T00:00:01.000Z',payload:{}},
]);
check(replay.mode==='READ_ONLY_SANDBOX'&&replay.sideEffectsAllowed===false,'event replay must be side-effect free by contract');
check(replay.orderingGaps===1&&replay.duplicateEventsDropped===1,'event replay must expose ordering gaps and deduplicate event identities');
check(replay.redactedFields===2,'event replay must redact secret-bearing fields');
check(JSON.stringify(replay.events).includes('[ปกปิด]')&&!JSON.stringify(replay.events).includes('Bearer hidden'),'event replay output must not expose secret values');


const recoveryBase={backupId:'backup-1',kind:'MANUAL',status:'RESTORE_VERIFIED',contentHash:'a'.repeat(64),hashAlgorithm:'sha256-canonical-json-v1',createdAt:'2026-08-15T00:00:00.000Z',integrityCheckedAt:'2026-08-15T00:00:01.000Z',restoreVerifiedAt:'2026-08-15T00:00:05.000Z',lastRestoreRunId:'run-1'};
let recovery=buildRecoveryEvidenceReport({backups:[recoveryBase]});
check(recovery.restoreVerified===false&&recovery.readiness==='ATTENTION','backup RESTORE_VERIFIED status alone must never prove a restore');
check(recovery.contradictions.length===1,'unlinked RESTORE_VERIFIED status must surface contradictory evidence');
recovery=buildRecoveryEvidenceReport({backups:[recoveryBase],restoreRuns:[{restoreRunId:'run-1',backupId:'backup-1',state:'SUCCEEDED',approvalRequestId:'approval-1',createdAt:'2026-08-15T00:00:02.000Z'}]});
check(recovery.restoreVerified===false,'successful restore run without RESTORE_VERIFY evidence must remain unverified');
recovery=buildRecoveryEvidenceReport({backups:[recoveryBase],restoreRuns:[{restoreRunId:'run-1',backupId:'backup-1',state:'FAILED',approvalRequestId:'approval-1',createdAt:'2026-08-15T00:00:02.000Z'}],verification:[{evidenceId:'verify-restore',backupId:'backup-1',evidenceType:'RESTORE_VERIFY',outcome:'PASS',restoreRunId:'run-1',contentHash:'a'.repeat(64),hashAlgorithm:'sha256-canonical-json-v1',createdAt:'2026-08-15T00:00:05.000Z'}]});
check(recovery.restoreVerified===false,'RESTORE_VERIFY PASS must not override a failed restore run');
recovery=buildRecoveryEvidenceReport({backups:[recoveryBase],restoreRuns:[{restoreRunId:'run-1',backupId:'backup-1',state:'SUCCEEDED',approvalRequestId:'approval-1',createdAt:'2026-08-15T00:00:02.000Z'}],approvals:[{approvalId:'approval-1',state:'EXECUTED',requiredApprovals:1,approvedCount:1,createdAt:'2026-08-15T00:00:01.000Z'}],verification:[{evidenceId:'verify-integrity',backupId:'backup-1',evidenceType:'INTEGRITY_CHECK',outcome:'PASS',contentHash:'a'.repeat(64),hashAlgorithm:'sha256-canonical-json-v1',createdAt:'2026-08-15T00:00:01.000Z'},{evidenceId:'verify-restore',backupId:'backup-1',evidenceType:'RESTORE_VERIFY',outcome:'PASS',restoreRunId:'run-1',contentHash:'a'.repeat(64),hashAlgorithm:'sha256-canonical-json-v1',createdAt:'2026-08-15T00:00:05.000Z'}],drills:[{drillId:'drill-1',drillType:'RESTORE',status:'PASSED',createdAt:'2026-08-15T00:00:06.000Z',finishedAt:'2026-08-15T00:00:07.000Z'}]});
check(recovery.restoreVerified===true&&recovery.readiness==='VERIFIED','linked successful run plus matching RESTORE_VERIFY proof must verify recovery');
check(recovery.integrityProven===true&&recovery.approvalProven===true,'recovery report must preserve independent integrity and approval evidence');
check(['BACKUP','INTEGRITY','APPROVAL','RESTORE','VERIFY','DRILL'].every((stage)=>recovery.timeline.some((item)=>item.stage===stage)),'recovery evidence timeline must cover the complete controlled chain');
check(!JSON.stringify(recovery.timeline).includes('RESTORE_VERIFIED')&&!JSON.stringify(recovery.timeline).includes('SUCCEEDED'),'recovery timeline presentation must translate technical recovery states before display');
const badHash=buildRecoveryEvidenceReport({backups:[recoveryBase],restoreRuns:[{restoreRunId:'run-1',backupId:'backup-1',state:'SUCCEEDED',createdAt:'2026-08-15T00:00:02.000Z'}],verification:[{evidenceId:'bad-hash',backupId:'backup-1',evidenceType:'RESTORE_VERIFY',outcome:'PASS',restoreRunId:'run-1',contentHash:'b'.repeat(64),hashAlgorithm:'sha256-canonical-json-v1',createdAt:'2026-08-15T00:00:05.000Z'}]});
check(badHash.restoreVerified===false&&badHash.contradictions.length>0,'restore proof hash mismatch must fail closed');

let scene=initialVisualOrchestratorState();let visual=orchestrateRealtimeVisual(scene,{eventId:'v1',type:'ticket.created'},1000);check(visual.decision==='START','first visual event must start');scene=visual.state;
visual=orchestrateRealtimeVisual(scene,{eventId:'v2',type:'security.alert',payload:{severity:'CRITICAL'}},1100);check(visual.decision==='PREEMPT'&&visual.directive.kind==='SECURITY','critical security signal must preempt ticket FX');scene=visual.state;
visual=orchestrateRealtimeVisual(scene,{eventId:'v3',type:'member.join'},1200);check(visual.decision==='SUPPRESS'&&!visual.accepted,'low-priority FX must be suppressed while security scene is active');scene=visual.state;
visual=orchestrateRealtimeVisual(scene,{eventId:'v2',type:'security.alert'},1300);check(visual.decision==='DUPLICATE','visual orchestrator must reject duplicate event identity');
let mergeState=initialVisualOrchestratorState();let first=orchestrateRealtimeVisual(mergeState,{eventId:'m1',type:'gaming.level.up'},2000);let second=orchestrateRealtimeVisual(first.state,{eventId:'m2',type:'gaming.xp.awarded'},2200);check(second.decision==='MERGE'&&second.directive.particleCount<=56,'same-domain bursts must merge under bounded particle budget');

let governor=initialVisualPerformanceGovernorState('CINEMATIC');governor=updateVisualPerformanceGovernor(governor,{reducedMotion:false,hidden:false,hardwareConcurrency:8,deviceMemoryGb:8,measuredFps:35,motionPreset:'CINEMATIC'}).state;check(governor.tier==='CINEMATIC','single low-FPS sample must not immediately flap the visual tier');
for(let i=0;i<2;i++)governor=updateVisualPerformanceGovernor(governor,{reducedMotion:false,hidden:false,hardwareConcurrency:8,deviceMemoryGb:8,measuredFps:35,motionPreset:'CINEMATIC'}).state;check(governor.tier==='LITE','sustained low FPS must degrade visual tier');
for(let i=0;i<5;i++)governor=updateVisualPerformanceGovernor(governor,{reducedMotion:false,hidden:false,hardwareConcurrency:8,deviceMemoryGb:8,measuredFps:58,motionPreset:'CINEMATIC'}).state;check(governor.tier==='CINEMATIC','sustained recovery must restore intended visual tier');
const reduced=updateVisualPerformanceGovernor(governor,{reducedMotion:true,hidden:false,motionPreset:'CINEMATIC'});check(reduced.state.tier==='STATIC'&&reduced.budget.particleScale===0,'reduced motion must immediately override adaptive recovery');

const server=text('apps/platform/src/http/server.ts');const phase29Views=text('apps/platform/src/http/phase29-views.ts');const app=text('apps/dashboard/src/App.tsx');const stage=text('apps/dashboard/src/components/RealtimeVisualStage.tsx');
check((phase29Views.match(/min\((?:created_at|received_at)\) filter\(where/g)??[]).length===3,'operations SQL must attach FILTER to aggregate min() for oldest-pending age');
check(!/extract\([^`]*\)\)\s*filter\(where/i.test(phase29Views),'operations SQL must not attach PostgreSQL FILTER to extract()');
for(const token of ['buildServerDigitalTwin','digitalTwin: preview.digitalTwin','/api/guilds/:guildId/operations-intelligence','/api/guilds/:guildId/event-replay','/api/guilds/:guildId/recovery-evidence'])check(server.includes(token),`server missing Phase 29 integration ${token}`);
check(phase29Views.includes('event_outbox')&&phase29Views.includes('service_heartbeats')&&phase29Views.includes('evaluateErrorBudget'),'operations/replay views must bind to durable evidence tables');
check(['backup_snapshots','restore_runs','approval_requests','backup_verification_evidence','recovery_drill_runs'].every((table)=>phase29Views.includes(table)),'recovery evidence view must bind to the existing durable recovery chain');
check(phase29Views.includes("origin:'DURABLE'")&&phase29Views.includes("origin:'LIVE'"),'replay API must merge durable and live evidence');
for(const token of ['DigitalTwinConsole','OperationsIntelligenceConsole','EventReplayConsole'])check(app.includes(token),`dashboard missing ${token}`);
check(stage.includes('orchestrateRealtimeVisual')&&stage.includes('updateVisualPerformanceGovernor'),'visual stage must consume Phase 29 orchestrator and governor');
check(text('apps/dashboard/src/components/EventReplayConsole.tsx').includes('อ่านอย่างเดียว · ไม่ยิง Discord'),'replay UI must make side-effect boundary visible');
check(text('apps/dashboard/src/components/DigitalTwinConsole.tsx').includes('สถานะจริง → เป้าหมาย → ผลกระทบ'),'digital twin UI must communicate actual-to-desired impact flow in Thai');
check(text('apps/dashboard/src/components/OperationsIntelligenceConsole.tsx').includes('คิว · SLO · ข้อมูลสด · เหตุผิดปกติ'),'operations UI must surface evidence domains together in Thai');
check(text('apps/dashboard/src/components/OperationsIntelligenceConsole.tsx').includes('thModule(component.name)'),'operations UI must translate runtime component identifiers before display');
const recoveryUi=text('apps/dashboard/src/components/RecoveryConsole.tsx');
check(recoveryUi.includes('/recovery-evidence')&&recoveryUi.includes('ห้ามอ้างว่ากู้คืนสำเร็จ'),'recovery UI must expose the fail-closed evidence boundary');
check(recoveryUi.includes('aria-label="ลำดับหลักฐานการกู้คืน"')&&recoveryUi.includes('aria-live="polite"'),'recovery evidence UI must preserve accessibility semantics');

console.log(`Phase 29 production-intelligence smoke passed: ${assertions} assertions.`);
