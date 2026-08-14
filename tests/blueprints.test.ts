import { describe, expect, it } from 'vitest';
import { blueprintCatalog } from '@autoserver/blueprints';

describe('stable blueprint identity', () => {
  for (const blueprint of blueprintCatalog.values()) {
    it(`${blueprint.key} never emits duplicate logical resource keys`, () => {
      const keys = blueprint.resources.map((resource) => resource.logicalKey);
      expect(new Set(keys).size).toBe(keys.length);
    });
  }
});
