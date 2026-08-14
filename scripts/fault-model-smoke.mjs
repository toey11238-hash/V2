import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { decideEventSequence, makeEvent } from '../packages/core/src/index.ts';
import { RealtimeHub } from '../packages/realtime/src/index.ts';
import { evaluateRuntimeReadiness } from '../apps/platform/src/runtime/readiness.ts';
import { createPortableConfig, migratePortableConfig } from '../packages/governance/src/portable-config.ts';
import { transitionApplication, transitionReport, transitionSuggestion } from '../packages/workflows/src/index.ts';
import { ReplayGuard, HmacWebhookVerifier, sanitizeIntegrationHealthDetail, CircuitBreaker, validateIntegrationSecretRef, validateWebhookDeliveryId, validateWebhookTimestamp, createGenericInboundAdapter } from '../packages/integrations/src/index.ts';
import { decodeAuditCursor, redactAuditValue } from '../packages/audit-log/src/index.ts';
import { evaluateFeatureRollouts } from '../packages/feature-flags/src/index.ts';
import { isTaskDue, parseScheduleInstant } from '../packages/scheduler/src/index.ts';
import { InProcessMutationRateLimiter, mutationRateLimitPolicy, rateLimitSubjectHash } from '../packages/http-security/src/index.ts';
import { defaultAdmissionPolicy, evaluateAdmission } from '../packages/admission-control/src/pure.ts';

let assertions=0;
const ok=(value,message)=>{assert.ok(value,message);assertions+=1;};
const throws=(operation,message)=>{let failed=false;try{operation();}catch{failed=true;}ok(failed,message);};

const previous={sequence:12,eventId:'evt-12'};
ok(decideEventSequence(previous,{sequence:11,eventId:'evt-old'}).stale,'stale aggregate event is rejected');
ok(decideEventSequence(previous,{sequence:12,eventId:'evt-12'}).duplicate,'duplicate aggregate event is rejected');
ok(decideEventSequence(previous,{sequence:13,eventId:'evt-13'}).accepted,'next aggregate event is accepted');

throws(()=>transitionApplication('ACCEPTED','UNDER_REVIEW'),'application cannot move backward from accepted');
throws(()=>transitionReport('CLOSED','INVESTIGATING'),'closed report cannot silently reopen');
throws(()=>transitionSuggestion('ARCHIVED','OPEN'),'archived suggestion cannot reopen through review path');

const portable=createPortableConfig({schemaVersion:1,exportedAt:'2026-08-14T00:00:00Z',guildId:'guild-a',payload:{setupDraft:{blueprintKey:'hybrid-standard'},templateVersion:2}});
ok(migratePortableConfig(portable).targetSchemaVersion===2,'supported portable config upgrades');
throws(()=>migratePortableConfig(createPortableConfig({schemaVersion:99,exportedAt:portable.exportedAt,guildId:'guild-a',payload:{}})),'future portable config is rejected');
throws(()=>migratePortableConfig(portable,0),'invalid portable config downgrade target is rejected');

const replay=new ReplayGuard(60_000);
ok(replay.accept('delivery-1',1000),'first webhook delivery accepted');
ok(!replay.accept('delivery-1',1001),'replayed webhook delivery rejected');
const secret='this-is-a-long-test-webhook-secret';
const body='{"event":"test"}';
const signature=createHmac('sha256',secret).update(body).digest('hex');
const verifier=new HmacWebhookVerifier(secret);
ok(verifier.verify(body,`sha256=${signature}`),'valid HMAC accepted');
ok(!verifier.verify(`${body}x`,`sha256=${signature}`),'tampered HMAC rejected');
ok(!sanitizeIntegrationHealthDetail('Authorization=Bearer-super-secret-token').includes('Bearer-super-secret-token'),'health detail does not preserve authorization secret');

const rules=[
  {rolloutId:'global',featureKey:'safe.feature',scope:'GLOBAL',state:'ON',rolloutPercent:100,config:{},revision:1},
  {rolloutId:'guild',featureKey:'safe.feature',scope:'GUILD',guildId:'guild-a',state:'OFF',rolloutPercent:100,config:{},revision:3},
];
ok(!evaluateFeatureRollouts('safe.feature',rules,{guildId:'guild-a',environment:'production'}).enabled,'guild OFF overrides global ON');
ok(evaluateFeatureRollouts('safe.feature',rules,{guildId:'guild-b',environment:'production'}).enabled,'global ON applies outside guild override');
ok(!isTaskDue({taskId:'t',guildId:'g',runAt:new Date(0),state:'RUNNING',dedupKey:'d'},new Date()),'claimed/running task is not re-executed as due');
throws(()=>parseScheduleInstant('not-a-time',new Date('2026-08-14T00:00:00Z')),'invalid schedule timestamp rejected');
const limiter=new InProcessMutationRateLimiter();const policy=mutationRateLimitPolicy('/api/guilds/g/restore/run');const subject=rateLimitSubjectHash({actorId:'operator',guildId:'g',routeClass:'restore'});let last;for(let i=0;i<31;i++)last=limiter.consume(subject,policy,1_000);ok(last?.allowed===false,'mutation limiter rejects after policy limit');


// phase6-circuit: transient failures must open and later recover without an infinite deny state.
const phase6Circuit=new CircuitBreaker(2,2_000); phase6Circuit.failure(10_000); phase6Circuit.failure(10_100); ok(phase6Circuit.canAttempt(10_200)===false,'integration circuit blocks during open window'); ok(phase6Circuit.canAttempt(12_101)===true,'integration circuit admits a half-open probe after open window'); ok(phase6Circuit.canAttempt(12_102)===false,'integration circuit blocks a second half-open probe'); phase6Circuit.failure(12_103); ok(phase6Circuit.canAttempt(12_200)===false,'failed half-open probe reopens circuit');

throws(()=>validateIntegrationSecretRef('news','env:WRONG_SECRET'),'webhook secret ref cannot escape adapter namespace');
throws(()=>validateWebhookDeliveryId('bad\nvalue'),'webhook delivery id rejects control characters');
throws(()=>validateWebhookTimestamp('1970-01-01T00:00:00Z',300,Date.parse('2026-08-14T00:00:00Z')),'stale webhook timestamp rejected');
throws(()=>decodeAuditCursor('%%%'),'malformed audit cursor rejected');
const redacted=redactAuditValue({authorization:'Bearer abc',nested:{apiKey:'xyz'}});ok(redacted.authorization==='[redacted]'&&redacted.nested.apiKey==='[redacted]','audit redaction blocks auth/api keys');

const genericInbound=createGenericInboundAdapter();const invalidGenericBody=new TextEncoder().encode(JSON.stringify({eventType:'discord.ready',payload:{spoof:true}}));const genericTransformed=await genericInbound.webhook.transform({rawBody:invalidGenericBody,headers:{}});ok(genericTransformed[0]?.eventType==='integration.generic.discord.ready','generic inbound cannot spoof internal event namespace');let invalidGenericRejected=false;try{await genericInbound.webhook.transform({rawBody:new TextEncoder().encode(JSON.stringify({eventType:'../bad',payload:{}})),headers:{}});}catch{invalidGenericRejected=true;}ok(invalidGenericRejected,'generic inbound rejects invalid event type');

const realtime=new RealtimeHub(4,16_384);const sent=[];const slow={readyState:1,bufferedAmount:20_000,send(value){sent.push(value);},close(code,reason){this.closed={code,reason};}};realtime.addClient(slow,()=>true);const rtEvent=makeEvent({type:'smoke.event',guildId:'g',correlationId:'11111111-1111-4111-8111-111111111111',payload:{ok:true}});realtime.publish(rtEvent);ok(realtime.stats().backpressureDisconnects===1&&slow.closed?.code===1013,'realtime drops slow clients with retryable backpressure close');realtime.publish(rtEvent);ok(realtime.stats().deduplicatedEvents===1,'realtime duplicate events are not rebroadcast');

const readyBase={nodeEnv:'production',processRole:'all',botEnabled:true,databaseConfigured:true,databaseHealthy:true,discordReady:true,jobWorkerRunning:true,schedulerActive:true,outboxActive:true,inboxActive:true,automationActive:true};
ok(evaluateRuntimeReadiness(readyBase).ready,'readiness requires all critical local loops healthy');
ok(!evaluateRuntimeReadiness({...readyBase,outboxActive:false}).ready,'readiness fails when durable outbox loop is inactive');
ok(!evaluateRuntimeReadiness({...readyBase,schedulerActive:false}).ready,'readiness fails when required scheduler loop is inactive');
ok(!evaluateRuntimeReadiness({...readyBase,automationActive:false}).ready,'readiness fails when the durable automation loop is inactive for all/worker roles');

const admission=defaultAdmissionPolicy('guild-a');
ok(evaluateAdmission(admission,{operation:'BULK',pressure:'NORMAL',criticalIncidentOpen:true,maintenanceActive:false}).decision==='DEFER','critical incident preserves recovery capacity from bulk work');
ok(evaluateAdmission(admission,{operation:'SUPPORT',pressure:'EMERGENCY',criticalIncidentOpen:true,maintenanceActive:true}).decision==='ALLOW','support path remains admitted during emergency pressure');
const observed=evaluateAdmission({...admission,mode:'OBSERVE'},{operation:'PROVIDER',pressure:'EMERGENCY',criticalIncidentOpen:false,maintenanceActive:false});ok(observed.decision==='ALLOW'&&observed.wouldDecision==='DEFER','observe admission cannot accidentally enforce a defer');
console.log(`fault-model-smoke PASS ${assertions} assertions`);
