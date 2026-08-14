import assert from 'node:assert/strict';
import { decideEventSequence } from '../packages/core/src/index.ts';
import { InProcessTtlCache, LayeredCache } from '../packages/cache/src/index.ts';
import { CircuitBreaker } from '../packages/integrations/src/index.ts';
import { InProcessMutationRateLimiter, mutationRateLimitPolicy, rateLimitSubjectHash } from '../packages/http-security/src/index.ts';

let assertions=0;const ok=(value,message)=>{assert.ok(value,message);assertions+=1;};

// Deterministic model only: this validates invariants under many operations, not real throughput/latency.
let head=null;
for(let sequence=0;sequence<5_000;sequence+=1){const current={sequence,eventId:`evt-${sequence}`};const decision=decideEventSequence(head,current);if(!decision.accepted)throw new Error(`sequence ${sequence} unexpectedly rejected`);head=current;}
ok(head?.sequence===4_999,'ordered stream accepts 5000 monotonic model events');
ok(decideEventSequence(head,{sequence:4_998,eventId:'stale'}).stale,'ordered stream rejects model stale event');

const cache=new LayeredCache(new InProcessTtlCache());let loads=0;
const results=await Promise.all(Array.from({length:100},()=>cache.getOrLoad('stress','single-flight',5_000,async()=>{loads+=1;await new Promise((resolve)=>setTimeout(resolve,2));return 42;})));
ok(results.every((value)=>value===42),'cache single-flight returns same modeled value');
ok(loads===1,'cache single-flight invokes loader once for 100 concurrent callers');

const boundedL1=new InProcessTtlCache(10);
for(let i=0;i<250;i+=1)await boundedL1.set({scopeKey:'stress-bound',cacheKey:`key-${i}`,value:i,ttlMs:60_000});
const boundedStats=boundedL1.stats();
ok(boundedStats.entries<=10,'bounded L1 cache never exceeds configured entry ceiling under 250 modeled keys');
ok(boundedStats.evictions>=240,'bounded L1 cache records pressure evictions rather than growing without bound');

const tightFlights=new LayeredCache(new InProcessTtlCache(10),undefined,2);
let releaseFlights;
const gate=new Promise((resolve)=>{releaseFlights=resolve;});
const first=tightFlights.getOrLoad('flight','a',1000,async()=>{await gate;return 1;});
const second=tightFlights.getOrLoad('flight','b',1000,async()=>{await gate;return 2;});
await new Promise((resolve)=>setTimeout(resolve,0));
let inflightRejected=false;
try{await tightFlights.getOrLoad('flight','c',1000,async()=>3);}catch(error){inflightRejected=String(error?.message??error)==='CACHE_INFLIGHT_LIMIT';}
ok(inflightRejected,'bounded single-flight registry rejects excess distinct concurrent loaders');
releaseFlights();
await Promise.all([first,second]);
ok(tightFlights.stats().inFlight===0,'single-flight registry releases entries after loaders settle');

const limiter=new InProcessMutationRateLimiter(2_000);const policy=mutationRateLimitPolicy('/api/guilds/g/restore/run');
for(let subject=0;subject<500;subject+=1){const hash=rateLimitSubjectHash({actorId:`actor-${subject}`,guildId:'g',routeClass:policy.routeClass});for(let i=0;i<policy.limit;i+=1){const result=limiter.consume(hash,policy,1000);if(!result.allowed)throw new Error(`subject ${subject} rejected before limit`);}const blocked=limiter.consume(hash,policy,1000);if(blocked.allowed)throw new Error(`subject ${subject} exceeded limit without rejection`);}
ok(true,'500 modeled subjects enforce independent fixed-window limits');

const circuit=new CircuitBreaker(3,3_000);circuit.failure(10_000);circuit.failure(10_010);circuit.failure(10_020);
ok(!circuit.canAttempt(10_100),'open circuit rejects modeled concurrent traffic');
ok(circuit.canAttempt(13_021),'one half-open probe is admitted after cooldown');
ok(!circuit.canAttempt(13_022),'second half-open probe is rejected');circuit.success();ok(circuit.canAttempt(13_023),'successful half-open probe closes circuit');

console.log(`stress-model-smoke PASS ${assertions} assertions · deterministic model only, not load/chaos evidence`);
