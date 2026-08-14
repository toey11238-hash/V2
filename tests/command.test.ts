import { expect, it } from 'vitest';
import { setupCommand } from '../apps/platform/src/discord/setup';

it('Phase 1 exposes only the canonical /setup top-level command', () => {
  const commands = [setupCommand.toJSON()];
  expect(commands.map((x) => x.name)).toEqual(['setup']);
  expect(commands.length).toBeLessThanOrEqual(2);
});
