import { describe, expect, it } from 'vitest';
import { InProcessTtlCache, LayeredCache } from '@autoserver/cache';
import { evaluateCompatibility, planLibraryUpgrade } from '@autoserver/compatibility';
import { assessGrowth, scoreChannelRecommendation } from '@autoserver/growth';
import { generateBlueprintTree, generateServerBlueprintReport } from '@autoserver/documentation';
import { validateMaintenanceWindow } from '@autoserver/operations';
import type { ServerBlueprint } from '@autoserver/setup';
import { decideEventSequence } from '@autoserver/core';
import { validateRecruitmentPost } from '@autoserver/gaming';

describe('phase 4 platform completeness primitives', () => {
  it('uses cache as a TTL optimization rather than permanent state', async () => {
    const cache=new LayeredCache(new InProcessTtlCache()); let calls=0;
    expect(await cache.getOrLoad('guild:1','health',50,async()=>{calls+=1;return {ok:true};})).toEqual({ok:true});
    expect(await cache.getOrLoad('guild:1','health',50,async()=>{calls+=1;return {ok:false};})).toEqual({ok:true});
    expect(calls).toBe(1); await cache.invalidate('guild:1','health');
    await cache.getOrLoad('guild:1','health',50,async()=>{calls+=1;return {ok:false};}); expect(calls).toBe(2);
  });
  it('blocks incompatible major runtime contracts and marks major upgrades high risk', () => {
    expect(evaluateCompatibility({nodeVersion:'20.0.0',discordJsVersion:'14.22.1'}).compatible).toBe(false);
    expect(evaluateCompatibility({nodeVersion:'22.0.0',discordJsVersion:'14.22.1',postgresMajor:17}).compatible).toBe(true);
    expect(planLibraryUpgrade({packageName:'discord.js',from:'14.22.1',to:'15.0.0'}).risk).toBe('HIGH');
  });
  it('assesses growth deterministically and scores low-signal channels down', () => {
    const small=assessGrowth({memberCount:40,roleCount:8,channelCount:12}); const large=assessGrowth({memberCount:12_000,roleCount:80,channelCount:140,activeTickets7d:80,lfg30d:500});
    expect(['SMALL','STANDARD']).toContain(small.mode); expect(['LARGE','ENTERPRISE']).toContain(large.mode); expect(large.score).toBeGreaterThan(small.score);
    expect(scoreChannelRecommendation({key:'CH_UNUSED',purpose:'duplicate chat',expectedWeeklyUse:0,audienceCoverage:0.05,moderationCost:1,duplicateRisk:1}).recommendation).toBe('OMIT');
  });
  it('orders inbound aggregate events monotonically and identifies duplicates', () => {
    expect(decideEventSequence(null,{sequence:1,eventId:'evt-1'}).accepted).toBe(true);
    expect(decideEventSequence({sequence:3,eventId:'evt-3'},{sequence:3,eventId:'evt-x'}).stale).toBe(true);
    expect(decideEventSequence({sequence:3,eventId:'evt-3'},{sequence:3,eventId:'evt-3'}).duplicate).toBe(true);
    expect(decideEventSequence({sequence:3,eventId:'evt-3'},{sequence:4,eventId:'evt-4'}).accepted).toBe(true);
  });
  it('validates maintenance windows without allowing unbounded suppression', () => {
    const start=new Date(Date.now()+60_000); expect(validateMaintenanceWindow({startsAt:start,endsAt:new Date(start.getTime()+60*60_000)}).startsAt).toEqual(start);
    expect(()=>validateMaintenanceWindow({startsAt:start,endsAt:new Date(start.getTime()+8*86_400_000)})).toThrow('MAINTENANCE_WINDOW_TOO_LONG');
  });
  it('validates structured Gaming recruitment without paid-entry mechanics', () => {
    const expiresAt=new Date(Date.now()+86_400_000);
    const post=validateRecruitmentPost({gameKey:'valorant',postType:'TEAM_RECRUITING',title:'Need controller',description:'SEA evenings',preferredRoles:['Controller','Controller'],expiresAt});
    expect(post.preferredRoles).toEqual(['Controller']);
    expect(()=>validateRecruitmentPost({gameKey:'valorant',postType:'TEAM_RECRUITING',title:'Need controller',expiresAt:new Date(Date.now()+31*86_400_000)})).toThrow('INVALID_RECRUITMENT_EXPIRY');
  });
  it('renders a human-readable blueprint tree', () => {
    const blueprint:ServerBlueprint={key:'test',version:1,displayName:'Test',description:'x',complexity:'compact',enabledModules:['core'],resources:[
      {kind:'CATEGORY',logicalKey:'CAT_START',name:'START',module:'core',ownership:'SYSTEM_OWNED',reason:'test'},
      {kind:'TEXT_CHANNEL',logicalKey:'CH_WELCOME',name:'welcome',module:'core',ownership:'SYSTEM_OWNED',reason:'test',parentKey:'CAT_START',visibility:'PUBLIC'},
    ]};
    expect(generateBlueprintTree(blueprint)).toContain('CH_WELCOME');
    const report=generateServerBlueprintReport({blueprint,panelIds:['PANEL_WELCOME'],generatedAt:'2026-08-14T00:00:00.000Z'});
    expect(report).toContain('Text channels'); expect(report).toContain('PANEL_WELCOME'); expect(report).toContain('PUBLIC');
  });
});
