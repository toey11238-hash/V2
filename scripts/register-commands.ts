import { loadConfig } from '@autoserver/config';
import { registerDiscordCommands } from '../apps/platform/src/discord/setup.js';

const config = loadConfig();
await registerDiscordCommands(config);
console.log(`Registered /setup ${config.DISCORD_TEST_GUILD_ID ? `in test guild ${config.DISCORD_TEST_GUILD_ID}` : 'globally'}.`);
