import { describe, expect, it } from 'vitest';
import { mayAutoApplyRecommendation, recommendFromDailyMetrics } from '@autoserver/recommendations';
import type { DailyMetricRecord } from '@autoserver/analytics';

const metric = (metricKey:string,value:number):DailyMetricRecord => ({ metricKey, dimensions:{}, value, sampleCount:1 });

describe('evidence-backed server advisor', () => {
  it('creates non-destructive recommendations from recorded daily metrics', () => {
    const recommendations = recommendFromDailyMetrics([
      metric('members.joined',20), metric('verification.succeeded',8), metric('tickets.created',8), metric('tickets.resolution_minutes_avg',900), metric('security.observations',12), metric('gaming.lfg_created',30), metric('panels.interactions',0),
    ]);
    expect(recommendations.map((item)=>item.key)).toEqual(expect.arrayContaining(['onboarding.verification-friction','support.resolution-latency','security.observation-spike','gaming.lfg-capacity','panels.zero-engagement']));
    expect(recommendations.every((item)=>item.destructive===false)).toBe(true);
  });

  it('never auto-applies high-risk or destructive advice', () => {
    expect(mayAutoApplyRecommendation({key:'x',title:'x',reason:'x',risk:'HIGH',destructive:false,evidence:{}},'LOW_RISK_AUTO')).toBe(false);
    expect(mayAutoApplyRecommendation({key:'x',title:'x',reason:'x',risk:'LOW',destructive:true,evidence:{}},'LOW_RISK_AUTO')).toBe(false);
  });
});
