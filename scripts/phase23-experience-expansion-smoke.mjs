import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeSetupImpact } from '../packages/setup/src/impact.ts';
import { commonGamingAvailability, transitionGamingSession, validateGamingAvailabilityWindows, validateGamingSessionConfig } from '../packages/gaming/src/session-pure.ts';
import { simulateAutomationRule } from '../packages/automation/src/simulation-pure.ts';
import { evaluateMetricTrend } from '../packages/analytics/src/trends-pure.ts';

let assertions = 0;
const check = (fn) => { fn(); assertions += 1; };

const lowImpact = analyzeSetupImpact([{ type:'CREATE', risk:'LOW', desired:{ logicalKey:'CH_TEST', kind:'TEXT_CHANNEL', module:'core' } }]);
check(()=>assert.equal(lowImpact.level,'LOW'));
check(()=>assert.equal(lowImpact.mutationCount,1));
check(()=>assert.equal(lowImpact.approvalRecommended,false));
const criticalImpact = analyzeSetupImpact([{ type:'CONFLICT', risk:'HIGH', desired:{ logicalKey:'ROLE_REQUIRED', kind:'ROLE', module:'security', required:true } }]);
check(()=>assert.equal(criticalImpact.level,'CRITICAL'));
check(()=>assert.equal(criticalImpact.requiredConflictCount,1));
check(()=>assert.equal(criticalImpact.approvalRecommended,true));
check(()=>assert.throws(()=>analyzeSetupImpact(Array.from({length:5001},(_,i)=>({type:'KEEP',risk:'LOW',desired:{logicalKey:`K${i}`,kind:'ROLE',module:'x'}}))),/SETUP_IMPACT_ACTION_LIMIT/));

const availability = validateGamingAvailabilityWindows([{weekday:1,startMinute:19*60,endMinute:22*60},{weekday:3,startMinute:20*60,endMinute:23*60}]);
check(()=>assert.equal(availability.length,2));
check(()=>assert.throws(()=>validateGamingAvailabilityWindows([{weekday:1,startMinute:100,endMinute:200},{weekday:1,startMinute:150,endMinute:250}]),/GAMING_AVAILABILITY_OVERLAP/));
const common = commonGamingAvailability({u1:[{weekday:1,startMinute:1000,endMinute:1200}],u2:[{weekday:1,startMinute:1080,endMinute:1260}],u3:[{weekday:1,startMinute:1100,endMinute:1140}]},2,15);
check(()=>assert.ok(common.some((item)=>item.weekday===1&&item.startMinute===1080&&item.endMinute===1100&&item.participantIds.length===2)));
check(()=>assert.ok(common.some((item)=>item.weekday===1&&item.startMinute===1100&&item.endMinute===1140&&item.participantIds.length===3)));
const session = validateGamingSessionConfig({gameKey:'Valorant',title:'Ranked Night',startsAt:new Date(Date.now()+3600000),durationMinutes:120,capacity:5});
check(()=>assert.equal(session.gameKey,'valorant'));
check(()=>assert.equal(transitionGamingSession('OPEN','MARK_READY'),'READY'));
check(()=>assert.equal(transitionGamingSession('READY','START'),'ACTIVE'));
check(()=>assert.equal(transitionGamingSession('ACTIVE','COMPLETE'),'COMPLETED'));
check(()=>assert.throws(()=>transitionGamingSession('COMPLETED','START'),/GAMING_SESSION_TRANSITION_INVALID/));

const rule = {ruleId:'r1',eventType:'member.level',enabled:true,version:4,conditions:[{path:'level',operator:'GTE',value:10},{path:'region',operator:'IN',value:['TH','SG']}],actions:[{type:'NOTIFY_TOPIC',config:{topic:'UPDATES'}},{type:'AUDIT_NOTE',config:{}}]};
const sim = simulateAutomationRule(rule,'member.level',{level:12,region:'TH'});
check(()=>assert.equal(sim.matched,true));
check(()=>assert.equal(sim.ruleVersion,4));
check(()=>assert.deepEqual(sim.actionIntents.map((item)=>item.summary),['notify:UPDATES','audit-note']));
const miss = simulateAutomationRule(rule,'member.level',{level:4,region:'TH'});
check(()=>assert.equal(miss.matched,false));
check(()=>assert.deepEqual(miss.actionIntents,[]));
const wrongEvent = simulateAutomationRule(rule,'other.event',{level:12,region:'TH'});
check(()=>assert.equal(wrongEvent.eventTypeMatched,false));
check(()=>assert.equal(wrongEvent.conditions.every((item)=>item.passed===false),true));

const healthy = evaluateMetricTrend({value:100,sampleCount:20},{value:120,sampleCount:20},{higherIsBetter:true});
check(()=>assert.equal(healthy.direction,'UP'));
check(()=>assert.equal(healthy.health,'HEALTHY'));
const degraded = evaluateMetricTrend({value:100,sampleCount:20},{value:70,sampleCount:20},{higherIsBetter:true});
check(()=>assert.equal(degraded.health,'DEGRADED'));
const lowerBetter = evaluateMetricTrend({value:100,sampleCount:20},{value:70,sampleCount:20},{higherIsBetter:false});
check(()=>assert.equal(lowerBetter.health,'HEALTHY'));
const insufficient = evaluateMetricTrend({value:100,sampleCount:1},{value:120,sampleCount:1},{minimumSamples:5});
check(()=>assert.equal(insufficient.direction,'INSUFFICIENT'));
check(()=>assert.equal(insufficient.health,'UNKNOWN'));

const migration = await readFile('packages/database/migrations/052_gaming_sessions_orchestration.sql','utf8');
for (const table of ['gaming_availability_windows','gaming_sessions','gaming_session_participants']) check(()=>assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`,'i')));
check(()=>assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g)??[]).length,3));
check(()=>assert.match(migration,/FOREIGN KEY \(guild_id, game_key\) REFERENCES guild_games/));

const gamingActions = await readFile('apps/platform/src/discord/gaming-actions.ts','utf8');
for (const modalId of ['gaming:availability:set:modal','gaming:session:create:modal','gaming:session:control:modal']) check(()=>assert.ok(gamingActions.split(modalId).length>=3,`${modalId} must have launch + submit consumer`));
check(()=>assert.match(gamingActions,/gaming:session:leave:/));
check(()=>assert.match(gamingActions,/notify-fanout:gaming-session:\$\{record\.sessionId\}:reminder:root/));
check(()=>assert.match(gamingActions,/ช่วงเวลาว่างแบบดิบจะไม่ถูกเขียนลงบันทึกตรวจสอบ/));
const gamingRepo = await readFile('packages/gaming/src/index.ts','utf8');
check(()=>assert.match(gamingRepo,/async leaveSession\(/));
check(()=>assert.match(gamingRepo,/for update/));
const opViews = await readFile('apps/platform/src/http/operational-views.ts','utf8');
check(()=>assert.match(opViews,/availabilityDetailExposed:false/));
check(()=>assert.match(opViews,/union all select 'session'/));

const setup = await readFile('apps/platform/src/discord/setup.ts','utf8');
check(()=>assert.match(setup,/analyzeSetupImpact/));
const panels = await readFile('packages/panels/src/index.ts','utf8');
check(()=>assert.match(panels,/\*\*ผลกระทบโครงสร้าง\*\* \$\{thaiImpactLevel\(plan\.impact\.level\)\}/));
check(()=>assert.match(panels,/\*\*ผลกระทบการตั้งค่า\*\* \$\{thaiImpactLevel\(plan\.configurationImpact\.level\)\}/));
const changeControl = await readFile('packages/change-control/src/index.ts','utf8');
check(()=>assert.match(changeControl,/impact: SetupImpactReport/));
const http = await readFile('apps/platform/src/http/server.ts','utf8');
check(()=>assert.match(http,/automation\/rules\/:ruleKey\/simulate/));
check(()=>assert.match(http,/read-only-no-side-effects/));
const dashboard = await readFile('apps/dashboard/src/components/OperationalDeck.tsx','utf8');
check(()=>assert.match(dashboard,/runAutomationSimulation/));
check(()=>assert.match(dashboard,/ทดลองทำงาน/));
const analytics = await readFile('apps/platform/src/http/operational-views.ts','utf8');
check(()=>assert.match(analytics,/degradedTrends/));
check(()=>assert.match(analytics,/evaluateMetricTrend/));
const analyticsRepo = await readFile('packages/analytics/src/index.ts','utf8');
for (const metric of ['gaming.sessions_created','gaming.sessions_completed','gaming.session_joins']) check(()=>assert.match(analyticsRepo,new RegExp(metric.replaceAll('.','\\.'))));
const setupWorker = await readFile('apps/platform/src/runtime/setup-worker.ts','utf8');
check(()=>assert.match(setupWorker,/sessions:enabledModules\.includes\('game-sessions'\)/));
check(()=>assert.match(setupWorker,/availability:enabledModules\.includes\('game-sessions'\)/));
const controlCenter = await readFile('packages/control-center/src/index.ts','utf8');
check(()=>assert.match(controlCenter,/game-sessions/));

console.log(`phase23-experience-expansion-smoke PASS · ${assertions} assertions`);
