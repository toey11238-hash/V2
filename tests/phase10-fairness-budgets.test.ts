import { describe, expect, it } from 'vitest';
import { RESOURCE_BUDGET_KEYS, budgetWindowStart, defaultBudgetPolicy, normalizeBudgetPolicy, previewBudgetDecision, validateBudgetKey } from '@autoserver/budgets';
import { compareJobFairness, jobPriorityBand } from '@autoserver/jobs';
import { validateAutomationAction, validateAutomationRuleDefinition } from '@autoserver/automation';
import { evaluateRuntimeReadiness } from '../apps/platform/src/runtime/readiness.js';
import { readFileSync } from 'node:fs';

describe('Phase 10 tenant fairness and resource budgets',()=>{
  it('normalizes bounded policies',()=>{
    expect(normalizeBudgetPolicy({guildId:'g',budgetKey:'provider.sync',mode:'ENFORCE',windowSeconds:3600,maxUnits:24}).maxUnits).toBe(24);
    expect(()=>normalizeBudgetPolicy({guildId:'g',budgetKey:'provider.sync',mode:'ENFORCE',windowSeconds:10,maxUnits:24})).toThrow('BUDGET_WINDOW_INVALID');
  });
  it('fails closed for unregistered budget keys',()=>{
    expect(RESOURCE_BUDGET_KEYS).toHaveLength(5);
    expect(validateBudgetKey('PROVIDER.SYNC')).toBe('provider.sync');
    expect(()=>validateBudgetKey('custom.unregistered')).toThrow('BUDGET_KEY_UNREGISTERED');
  });
  it('aligns windows deterministically',()=>{
    expect(budgetWindowStart(new Date('2026-08-14T12:34:56.000Z'),3600).toISOString()).toBe('2026-08-14T12:00:00.000Z');
  });
  it('defers enforced overage without incrementing usage',()=>{
    const policy={...defaultBudgetPolicy('g','provider.sync'),maxUnits:2};
    const decision=previewBudgetDecision({policy,usedBefore:2,units:1,now:new Date('2026-08-14T12:15:00.000Z')});
    expect(decision.decision).toBe('DEFER');expect(decision.usedAfter).toBe(2);expect(decision.retryAt).toBe('2026-08-14T13:00:00.000Z');
  });
  it('keeps observe-only budgets non-blocking',()=>{
    const policy={...defaultBudgetPolicy('g','provider.sync'),mode:'OBSERVE' as const,maxUnits:2};
    const decision=previewBudgetDecision({policy,usedBefore:2,units:1,now:new Date('2026-08-14T12:15:00.000Z')});
    expect(decision.decision).toBe('OBSERVE_OVER');expect(decision.usedAfter).toBe(3);
  });
  it('keeps generic automation actions bounded and non-destructive',()=>{
    const rule=validateAutomationRuleDefinition({eventType:'member.join',actions:[{type:'NOTIFY_TOPIC',config:{topic:'UPDATES',title:'Hello',body:'Safe notification'}}]});
    expect(rule.actions).toHaveLength(1);
    expect(()=>validateAutomationAction({type:'HTTP_REQUEST',config:{url:'https://example.com'}})).toThrow('AUTOMATION_ACTION_TYPE_UNSUPPORTED');
    expect(()=>validateAutomationAction({type:'NOTIFY_TOPIC',config:{topic:'SECURITY',title:'Spoof',body:'No'}})).toThrow('AUTOMATION_NOTIFICATION_TOPIC_UNSUPPORTED');
  });

  it('requires the automation worker for database-backed all/worker readiness',()=>{
    const base={nodeEnv:'production' as const,processRole:'all' as const,botEnabled:true,databaseConfigured:true,databaseHealthy:true,discordReady:true,jobWorkerRunning:true,schedulerActive:true,outboxActive:true,inboxActive:true,automationActive:true};
    expect(evaluateRuntimeReadiness(base).ready).toBe(true);
    expect(evaluateRuntimeReadiness({...base,automationActive:false}).ready).toBe(false);
  });
  it('ships an executable composition root instead of a duplicate HTTP server',()=>{
    const source=readFileSync(new URL('../apps/platform/src/index.ts',import.meta.url),'utf8');
    expect(source).toContain("from './http/server.js'");
    expect(source).toContain('bindDiscordInteractions(');
    expect(source).toContain("jobWorker.register('SETUP_APPLY'");
    expect(source).toContain('automation?.start()');
    expect(source).not.toContain('export async function createHttpServer');
  });
  it('ranks tenant fairness before priority and age',()=>{
    expect(compareJobFairness({inFlight:0,recentStarts:0,priority:50,createdAtMs:2},{inFlight:1,recentStarts:0,priority:60,createdAtMs:1})).toBeLessThan(0);
    expect(compareJobFairness({inFlight:0,recentStarts:0,priority:60,createdAtMs:2},{inFlight:0,recentStarts:0,priority:50,createdAtMs:1})).toBeLessThan(0);
    expect(jobPriorityBand(95)).toBe(0);
    expect(compareJobFairness({inFlight:5,recentStarts:20,priority:95,createdAtMs:2},{inFlight:0,recentStarts:0,priority:60,createdAtMs:1})).toBeLessThan(0);
  });
});
