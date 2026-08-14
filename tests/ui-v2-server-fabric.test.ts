import { describe, expect, it } from 'vitest';
import { blueprintCatalog } from '@autoserver/blueprints';
import { panelsForBlueprint } from '@autoserver/panels';
import { blueprintForSetupDraft, defaultSetupDraft } from '@autoserver/control-center';

function count(blueprintKey: string, kind: string) {
  const blueprint = blueprintCatalog.get(blueprintKey)!;
  return blueprint.resources.filter((resource) => resource.kind === kind).length;
}

describe('Server Fabric V2', () => {
  it('keeps broad non-gaming topology in the standard server fabric', () => {
    const blueprint = blueprintCatalog.get('hybrid-standard')!;
    const keys = new Set(blueprint.resources.map((resource) => resource.logicalKey));
    for (const key of ['CAT_COMMUNITY_PROGRAMS','CAT_KNOWLEDGE','CAT_MEMBER_SERVICES','CAT_PARTNERSHIPS','CAT_DISCOVERY','CAT_MEMBER_CARE','CAT_PROJECT_LAB','CAT_EVENT_STUDIO','CAT_CONTENT_STUDIO','CH_VOICE_CENTER']) {
      expect(keys.has(key)).toBe(true);
    }
    expect(count('hybrid-standard', 'ROLE')).toBeGreaterThanOrEqual(35);
    expect(count('hybrid-standard', 'CATEGORY')).toBeGreaterThanOrEqual(20);
  });

  it('keeps the omni topology broad without duplicate logical keys', () => {
    const blueprint = blueprintCatalog.get('omni-premium')!;
    const keys = blueprint.resources.map((resource) => resource.logicalKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(count('omni-premium', 'ROLE')).toBeGreaterThanOrEqual(90);
    expect(count('omni-premium', 'CATEGORY')).toBeGreaterThanOrEqual(35);
    expect(blueprint.resources.filter((resource) => resource.kind !== 'ROLE').length).toBeLessThanOrEqual(450);
  });

  it('does not silently remove default blueprint resources during /setup filtering', () => {
    const blueprint = blueprintCatalog.get('hybrid-standard')!;
    const filtered = blueprintForSetupDraft(blueprint, defaultSetupDraft('hybrid-standard'));
    expect(filtered.resources.map((resource) => resource.logicalKey).sort()).toEqual(blueprint.resources.map((resource) => resource.logicalKey).sort());
    for (const resource of blueprint.resources) expect(blueprint.enabledModules).toContain(resource.module);
  });

  it('targets only desired resources when selecting panels for a blueprint', () => {
    const blueprint = blueprintCatalog.get('omni-premium')!;
    const desiredKeys = new Set(blueprint.resources.map((resource) => resource.logicalKey));
    for (const panel of panelsForBlueprint(blueprint)) expect(desiredKeys.has(panel.targetChannelKey)).toBe(true);
  });
});
