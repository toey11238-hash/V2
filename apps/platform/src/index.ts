import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import {
  Client,
  Events,
  GatewayIntentBits,
  type ClientOptions,
} from 'discord.js';
import { loadConfig, type AppConfig } from '@autoserver/config';
import { Database, runMigrations } from '@autoserver/database';
import { InProcessEventBus, type EventBus } from '@autoserver/core';
import { DurableJobWorker, JobRepository } from '@autoserver/jobs';
import { RealtimeHub } from '@autoserver/realtime';
import { ServiceHeartbeatRepository, type HealthState } from '@autoserver/diagnostics';
import { createDefaultIntegrationRegistry } from '@autoserver/integrations';
import { probeLinuxThirdPartySandbox } from '@autoserver/plugins';
import { createHttpServer } from './http/server.js';
import { DurableEventPublisher } from './runtime/durable-publisher.js';
import { DurableOutboxWorker } from './runtime/outbox-worker.js';
import { DurableInboxWorker } from './runtime/inbox-worker.js';
import { DurableAutomationWorker } from './runtime/automation-worker.js';
import { ScheduledWorker } from './runtime/scheduled-worker.js';
import { createSetupJobHandler } from './runtime/setup-worker.js';
import { createRestoreJobHandler } from './runtime/restore-worker.js';
import { createPermissionRepairJobHandler } from './runtime/permission-repair-worker.js';
import { bindDiscordInteractions, registerDiscordCommands } from './discord/setup.js';
import { bindMemberLifecycle } from './discord/member-events.js';
import { bindForumLifecycle } from './discord/forum-events.js';
import { bindVoiceLifecycle } from './discord/voice-events.js';
import { bindStructuralSecurityDetector } from './discord/security-events.js';
import { LivingPanelWorker } from './runtime/living-panel-worker.js';

function shardOptions(config: AppConfig): Pick<ClientOptions, 'shards' | 'shardCount'> {
  if (config.DISCORD_SHARD_MODE === 'auto') return { shards: 'auto' };
  if (config.DISCORD_SHARD_MODE === 'manual') {
    const shards = config.DISCORD_SHARD_IDS!.split(',').map((item) => Number(item.trim()));
    return { shards, shardCount: config.DISCORD_SHARD_COUNT };
  }
  return {};
}

function createDiscordClient(config: AppConfig): Client {
  const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates];
  if (config.DISCORD_GUILD_MEMBERS_INTENT) intents.push(GatewayIntentBits.GuildMembers);
  return new Client({
    intents,
    ...shardOptions(config),
    allowedMentions: { parse: [], repliedUser: false },
    failIfNotExists: false,
  });
}

async function ensureDiscordReady(client: Client, token: string, timeoutMs = 45_000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  let resolveReady: (() => void) | undefined;
  let rejectReady: ((error: Error) => void) | undefined;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const readyListener = () => resolveReady?.();
  client.once(Events.ClientReady, readyListener);
  timer = setTimeout(() => rejectReady?.(new Error('DISCORD_READY_TIMEOUT')), timeoutMs);
  try {
    await client.login(token);
    if (!client.isReady()) await ready;
  } finally {
    if (timer) clearTimeout(timer);
    client.off(Events.ClientReady, readyListener);
  }
}

function componentState(active: boolean | undefined): HealthState {
  return active ? 'HEALTHY' : 'DEGRADED';
}

async function main(): Promise<void> {
  const config = loadConfig();
  const database = new Database(config);
  const rawBus = new InProcessEventBus();
  const eventBus: EventBus = database.configured ? new DurableEventPublisher(database, rawBus) : rawBus;
  const realtime = new RealtimeHub();
  realtime.attach(rawBus);
  const integrationRegistry = createDefaultIntegrationRegistry();
  const ownsDiscordEvents = config.BOT_ENABLED && (config.PROCESS_ROLE === 'all' || config.PROCESS_ROLE === 'bot');
  const ownsWorkers = config.PROCESS_ROLE === 'all' || config.PROCESS_ROLE === 'worker';
  const needsDiscordClient = config.BOT_ENABLED && (ownsDiscordEvents || ownsWorkers);
  const discordClient = needsDiscordClient ? createDiscordClient(config) : undefined;
  const jobs = database.configured ? new JobRepository(database) : null;
  const jobWorker = jobs && discordClient && ownsWorkers
    ? new DurableJobWorker(jobs, config.JOB_POLL_INTERVAL_MS, config.JOB_LEASE_SECONDS)
    : undefined;
  const scheduler = database.configured && discordClient && ownsWorkers
    ? new ScheduledWorker({ client: discordClient, config, database, bus: eventBus })
    : undefined;
  const outbox = database.configured ? new DurableOutboxWorker(database, rawBus) : undefined;
  const inbox = database.configured ? new DurableInboxWorker(database, rawBus) : undefined;
  const automation = database.configured && ownsWorkers ? new DurableAutomationWorker(database) : undefined;
  const livingPanels = database.configured && discordClient ? new LivingPanelWorker(database, discordClient) : undefined;
  const instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const heartbeatRepository = database.configured ? new ServiceHeartbeatRepository(database) : undefined;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  let app: Awaited<ReturnType<typeof createHttpServer>> | undefined;
  let shuttingDown = false;

  if (jobWorker && jobs && discordClient) {
    jobWorker.register('SETUP_APPLY', createSetupJobHandler({ client: discordClient, config, database, jobs, bus: eventBus }));
    jobWorker.register('RESTORE_APPLY', createRestoreJobHandler({ client: discordClient, config, database, jobs, bus: eventBus }));
    jobWorker.register('PERMISSION_REPAIR', createPermissionRepairJobHandler({ client: discordClient, database, jobs, bus: eventBus }));
  }

  if (discordClient && ownsDiscordEvents) {
    bindDiscordInteractions(discordClient, { config, database, jobs, bus: eventBus });
    bindMemberLifecycle(discordClient, { database, bus: eventBus });
    bindForumLifecycle(discordClient, { database, bus: eventBus });
    bindVoiceLifecycle(discordClient, { database, bus: eventBus });
    bindStructuralSecurityDetector(discordClient, { database, bus: eventBus });
  }

  const beat = async (): Promise<void> => {
    if (!heartbeatRepository) return;
    const beats: Array<Promise<void>> = [
      heartbeatRepository.beat({ componentKey: 'platform', instanceId, processRole: config.PROCESS_ROLE, state: 'HEALTHY', metadata: { pid: process.pid, node: process.version } }),
      ...(discordClient ? [heartbeatRepository.beat({ componentKey: 'discord', instanceId, processRole: config.PROCESS_ROLE, state: discordClient.isReady() ? 'HEALTHY' : 'DEGRADED', metadata: { shardMode: config.DISCORD_SHARD_MODE, shards: discordClient.ws.shards.size } })] : []),
      ...(jobWorker ? [heartbeatRepository.beat({ componentKey: 'job-worker', instanceId, processRole: config.PROCESS_ROLE, state: componentState(jobWorker.healthSnapshot().running), metadata: jobWorker.healthSnapshot() })] : []),
      ...(scheduler ? [heartbeatRepository.beat({ componentKey: 'scheduler', instanceId, processRole: config.PROCESS_ROLE, state: componentState(scheduler.healthSnapshot().active), metadata: scheduler.healthSnapshot() })] : []),
      ...(outbox ? [heartbeatRepository.beat({ componentKey: 'outbox', instanceId, processRole: config.PROCESS_ROLE, state: componentState(outbox.healthSnapshot().active), metadata: outbox.healthSnapshot() })] : []),
      ...(inbox ? [heartbeatRepository.beat({ componentKey: 'inbox', instanceId, processRole: config.PROCESS_ROLE, state: componentState(inbox.healthSnapshot().active), metadata: inbox.healthSnapshot() })] : []),
      ...(livingPanels ? [heartbeatRepository.beat({ componentKey: 'living-panels', instanceId, processRole: config.PROCESS_ROLE, state: 'HEALTHY', metadata: { eventBacked:true, durable:database.configured } })] : []),
      ...(automation ? [heartbeatRepository.beat({ componentKey: 'automation', instanceId, processRole: config.PROCESS_ROLE, state: componentState(automation.healthSnapshot().active), metadata: automation.healthSnapshot() })] : []),
    ];
    await Promise.allSettled(beats);
  };

  const shutdown = async (reason: string, exitCode = 0): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    const hardStop = setTimeout(() => {
      console.error('[shutdown-timeout]', { reason, graceMs: config.SHUTDOWN_GRACE_MS });
      process.exit(exitCode || 1);
    }, config.SHUTDOWN_GRACE_MS);
    hardStop.unref?.();
    try {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      livingPanels?.stop();
      automation?.stop();
      scheduler?.stop();
      jobWorker?.stop();
      inbox?.stop();
      outbox?.stop();
      realtime.close();
      if (discordClient) discordClient.destroy();
      if (heartbeatRepository) await heartbeatRepository.beat({ componentKey: 'platform', instanceId, processRole: config.PROCESS_ROLE, state: 'OFFLINE', metadata: { reason } }).catch(() => undefined);
      await app?.close().catch(() => undefined);
      await database.close().catch(() => undefined);
    } finally {
      clearTimeout(hardStop);
      process.exitCode = exitCode;
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (error) => console.error('[unhandled-rejection]', error));
  process.on('uncaughtException', (error) => {
    console.error('[uncaught-exception]', error);
    void shutdown('uncaughtException', 1);
  });

  try {
    if (config.THIRD_PARTY_PLUGINS_ENABLED) {
      const sandbox = await probeLinuxThirdPartySandbox();
      if (!sandbox.verified) throw new Error(`THIRD_PARTY_PLUGIN_SANDBOX_UNVERIFIED:${sandbox.reason ?? 'probe failed'}`);
      console.log('[plugin-sandbox-verified]', { profile: sandbox.profile, checks: Object.keys(sandbox.checks).filter((key) => sandbox.checks[key]).length });
    }

    if (database.configured && config.AUTO_RUN_MIGRATIONS) {
      const migrations = await runMigrations(database);
      if (migrations.length) console.log('[database-migrations-applied]', { count: migrations.length, latest: migrations.at(-1) });
    }

    app = await createHttpServer({
      config,
      database,
      realtime,
      discordClient,
      workerEnabled: Boolean(jobWorker),
      workerHealth: jobWorker ? () => jobWorker.healthSnapshot() : undefined,
      schedulerHealth: scheduler ? () => scheduler.healthSnapshot() : undefined,
      outboxHealth: outbox ? () => outbox.healthSnapshot() : undefined,
      inboxHealth: inbox ? () => inbox.healthSnapshot() : undefined,
      automationHealth: automation ? () => automation.healthSnapshot() : undefined,
      integrationRegistry,
    });
    await app.listen({ host: '0.0.0.0', port: config.PORT });
    console.log('[http-ready]', { port: config.PORT, processRole: config.PROCESS_ROLE });

    if (livingPanels) await livingPanels.start(rawBus);
    outbox?.start();
    inbox?.start();
    automation?.start();

    if (discordClient) {
      if (ownsDiscordEvents) await registerDiscordCommands(config);
      await ensureDiscordReady(discordClient, config.DISCORD_BOT_TOKEN!);
      console.log('[discord-ready]', { userId: discordClient.user?.id, shards: discordClient.ws.shards.size, guilds: discordClient.guilds.cache.size, ownsDiscordEvents });
    }

    if (jobWorker) void jobWorker.start().catch((error) => console.error('[job-worker-fatal]', error));
    scheduler?.start();
    await beat();
    if (heartbeatRepository) {
      heartbeatTimer = setInterval(() => void beat().catch((error) => console.error('[heartbeat-error]', error)), 15_000);
      heartbeatTimer.unref?.();
    }
  } catch (error) {
    console.error('[startup-failed]', error);
    await shutdown('startup-failed', 1);
    throw error;
  }
}

void main().catch((error) => {
  console.error('[platform-fatal]', error);
  process.exitCode = 1;
});
