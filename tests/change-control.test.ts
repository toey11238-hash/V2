import { describe, expect, it } from 'vitest';
import { buildSafeChangePlan, blueprintChecksum, validateCustomBlueprint } from '@autoserver/change-control';
import type { GuildSnapshot, ServerBlueprint } from '@autoserver/setup';

const target: ServerBlueprint = { key:'custom:target', version:1, displayName:'Target', description:'test', complexity:'standard', enabledModules:['core'], resources:[{ logicalKey:'CH_RULES', kind:'TEXT_CHANNEL', name:'rules', ownership:'TEMPLATE_OWNED', module:'core', reason:'required' }] };
const snapshot: GuildSnapshot = { guildId:'g1', name:'Guild', roles:[], channels:[], mappings:[
  { guildId:'g1', logicalKey:'CH_RULES', resourceKind:'TEXT_CHANNEL', discordId:'1', ownership:'TEMPLATE_OWNED', locked:false },
  { guildId:'g1', logicalKey:'CH_OLD', resourceKind:'TEXT_CHANNEL', discordId:'2', ownership:'TEMPLATE_OWNED', locked:false },
  { guildId:'g1', logicalKey:'CH_MANUAL', resourceKind:'TEXT_CHANNEL', discordId:'3', ownership:'USER_OWNED', locked:false },
], scannedAt:'2026-08-14T00:00:00.000Z' };

describe('safe change control',()=>{
  it('never emits destructive actions and preserves user-owned resources',()=>{
    const plan=buildSafeChangePlan({mode:'SAFE_REBUILD',snapshot,target});
    expect(plan.destructiveActions).toBe(0);
    expect(plan.retirements).toContainEqual(expect.objectContaining({logicalKey:'CH_OLD',disposition:'REVIEW_RETIRE'}));
    expect(plan.retirements).toContainEqual(expect.objectContaining({logicalKey:'CH_MANUAL',disposition:'PRESERVE'}));
  });
  it('validates and checksums versioned custom blueprints',()=>{
    const blueprint=validateCustomBlueprint({...target,key:'community-plus',resources:[...target.resources,{logicalKey:'CAT_MAIN',kind:'CATEGORY',name:'Community',ownership:'SYSTEM_OWNED',module:'core',reason:'group'}]});
    expect(blueprint.key).toBe('custom:community-plus');
    expect(blueprintChecksum(blueprint)).toHaveLength(64);
  });
  it('rejects duplicate logical identities',()=>{
    expect(()=>validateCustomBlueprint({...target,key:'duplicate-test',resources:[target.resources[0],target.resources[0]]})).toThrow('INVALID_OR_DUPLICATE_LOGICAL_KEY');
  });
});
