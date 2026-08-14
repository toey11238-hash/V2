import { describe, expect, it } from 'vitest';
import { normalizeForumConfig } from '@autoserver/forums';
import { getBlueprint } from '@autoserver/blueprints';

function assertUniqueLogicalKeys(blueprintKey:string){
  const blueprint=getBlueprint(blueprintKey);
  const keys=blueprint.resources.map((resource)=>resource.logicalKey);
  expect(new Set(keys).size).toBe(keys.length);
}

describe('forum configuration', () => {
  it('normalizes native Discord-safe forum settings', () => {
    const config=normalizeForumConfig({defaultAutoArchiveMinutes:1440,defaultThreadSlowmodeSeconds:45,tags:[{name:'Guide'},{name:'Help',moderated:true}]});
    expect(config.defaultAutoArchiveMinutes).toBe(1440);
    expect(config.defaultThreadSlowmodeSeconds).toBe(45);
    expect(config.tags).toHaveLength(2);
  });

  it('falls back from unsupported archive duration and caps tags', () => {
    expect(normalizeForumConfig({defaultAutoArchiveMinutes:30 as 60}).defaultAutoArchiveMinutes).toBe(1440);
    expect(normalizeForumConfig({tags:Array.from({length:21},(_,index)=>({name:`T${index}`}))}).tags).toHaveLength(20);
  });

  it('keeps blueprint logical identities unique after forum expansion', () => {
    for(const key of ['hybrid-standard','gaming-advanced','creator-standard','education-standard']) assertUniqueLogicalKeys(key);
  });
});
