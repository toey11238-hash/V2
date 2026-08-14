import { describe, expect, it } from 'vitest';
import { evaluateFeatureRollouts, stableRolloutBucket, type FeatureRollout } from '@autoserver/feature-flags';
const rule=(input:Partial<FeatureRollout>):FeatureRollout=>({rolloutId:'r',featureKey:'feature.x',scope:'GLOBAL',state:'OFF',rolloutPercent:100,config:{},revision:1,...input});
describe('feature rollout precedence',()=>{
  it('uses role over guild over environment over global',()=>{
    const rules=[rule({scope:'GLOBAL',state:'OFF'}),rule({rolloutId:'g',scope:'GUILD',guildId:'guild',state:'ON'}),rule({rolloutId:'role',scope:'ROLE',guildId:'guild',roleId:'staff',state:'OFF'})];
    expect(evaluateFeatureRollouts('feature.x',rules,{guildId:'guild',userId:'u',roleIds:['staff'],environment:'production'}).matched?.rolloutId).toBe('role');
    expect(evaluateFeatureRollouts('feature.x',rules,{guildId:'guild',userId:'u',roleIds:[],environment:'production'}).enabled).toBe(true);
  });
  it('assigns stable canary buckets',()=>{expect(stableRolloutBucket('feature.x','user-1')).toBe(stableRolloutBucket('feature.x','user-1'));expect(stableRolloutBucket('feature.x','user-1')).toBeGreaterThanOrEqual(0);expect(stableRolloutBucket('feature.x','user-1')).toBeLessThan(100);});
});
