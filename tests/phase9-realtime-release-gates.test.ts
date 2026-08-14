import { describe, expect, it } from 'vitest';
import { makeEvent } from '@autoserver/core';
import { RealtimeHub } from '@autoserver/realtime';
import { evaluateRuntimeReadiness } from '../apps/platform/src/runtime/readiness.js';
import { reviewCanaryOutcome } from '@autoserver/feature-flags';

describe('Phase 9 realtime pressure policy',()=>{
  it('disconnects a slow websocket instead of buffering without bound',()=>{
    const hub=new RealtimeHub(10,16_384);const socket:any={readyState:1,bufferedAmount:20_000,send:()=>undefined,close(code:number,reason:string){this.code=code;this.reason=reason;}};
    hub.addClient(socket,()=>true);hub.publish(makeEvent({type:'test',guildId:'g',correlationId:'11111111-1111-4111-8111-111111111111',payload:{}}));
    expect(socket.code).toBe(1013);expect(hub.stats().backpressureDisconnects).toBe(1);expect(hub.clientCount).toBe(0);
  });
  it('deduplicates repeated event ids',()=>{
    const hub=new RealtimeHub(10);let sent=0;const socket:any={readyState:1,bufferedAmount:0,send:()=>{sent+=1;},close:()=>undefined};hub.addClient(socket,()=>true);
    const event=makeEvent({type:'test',correlationId:'11111111-1111-4111-8111-111111111111',payload:{}});hub.publish(event);hub.publish(event);expect(sent).toBe(1);expect(hub.stats().deduplicatedEvents).toBe(1);
  });
});


describe('Phase 9 readiness truth',()=>{
  const base={nodeEnv:'production' as const,processRole:'all' as const,botEnabled:true,databaseConfigured:true,databaseHealthy:true,discordReady:true,jobWorkerRunning:true,schedulerActive:true,outboxActive:true,inboxActive:true,automationActive:true};
  it('is ready only when required durable loops are active',()=>{expect(evaluateRuntimeReadiness(base).ready).toBe(true);expect(evaluateRuntimeReadiness({...base,inboxActive:false}).ready).toBe(false);expect(evaluateRuntimeReadiness({...base,jobWorkerRunning:false}).ready).toBe(false);});
  it('allows a development API process without a configured database',()=>{const result=evaluateRuntimeReadiness({nodeEnv:'development',processRole:'api',botEnabled:false,databaseConfigured:false,databaseHealthy:false,discordReady:false,jobWorkerRunning:false,schedulerActive:false,outboxActive:false,inboxActive:false,automationActive:false});expect(result.ready).toBe(true);});
});


describe('Phase 9 canary review policy',()=>{
  it('returns review guidance without automatic promotion',()=>{
    const comparison={guildId:'g',featureKey:'feature.x',metricKey:'success.rate',lookbackDays:14,enabled:{samples:40,average:.9,sum:36,min:0,max:1},excluded:{samples:40,average:.75,sum:30,min:0,max:1}};
    expect(reviewCanaryOutcome({comparison}).action).toBe('REVIEW_EXPAND');
  });
});
