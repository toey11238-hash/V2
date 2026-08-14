import { expect, it } from 'vitest';
import { loadConfig } from '@autoserver/config';

it('requires Discord credentials only when bot is enabled', () => {
  expect(() => loadConfig({ BOT_ENABLED: 'true' } as NodeJS.ProcessEnv)).toThrow(/DISCORD_BOT_TOKEN/);
  expect(loadConfig({ BOT_ENABLED: 'false' } as NodeJS.ProcessEnv).BOT_ENABLED).toBe(false);
});
