export interface RuntimeReadinessInput {
  nodeEnv: 'development'|'test'|'production';
  processRole: 'all'|'api'|'bot'|'worker';
  botEnabled: boolean;
  databaseConfigured: boolean;
  databaseHealthy: boolean;
  discordReady: boolean;
  jobWorkerRunning: boolean;
  schedulerActive: boolean;
  outboxActive: boolean;
  inboxActive: boolean;
  automationActive: boolean;
}

export interface RuntimeReadinessResult {
  ready: boolean;
  checks: {
    database: boolean;
    discord: boolean;
    jobWorker: boolean;
    scheduler: boolean;
    outbox: boolean;
    inbox: boolean;
    automation: boolean;
  };
  required: {
    database: boolean;
    discord: boolean;
    jobWorker: boolean;
    scheduler: boolean;
    durableEventWorkers: boolean;
    automation: boolean;
  };
}

export function evaluateRuntimeReadiness(input:RuntimeReadinessInput):RuntimeReadinessResult {
  const databaseRequired=input.nodeEnv==='production'||input.botEnabled||input.processRole==='worker';
  const discordRequired=input.botEnabled&&['all','bot','worker'].includes(input.processRole);
  const jobWorkerRequired=input.botEnabled&&['all','worker'].includes(input.processRole);
  const schedulerRequired=input.botEnabled&&['all','worker'].includes(input.processRole);
  const durableEventWorkersRequired=input.databaseConfigured;
  const automationRequired=input.databaseConfigured&&['all','worker'].includes(input.processRole);
  const checks={
    database:databaseRequired ? input.databaseConfigured&&input.databaseHealthy : !input.databaseConfigured||input.databaseHealthy,
    discord:!discordRequired||input.discordReady,
    jobWorker:!jobWorkerRequired||input.jobWorkerRunning,
    scheduler:!schedulerRequired||input.schedulerActive,
    outbox:!durableEventWorkersRequired||input.outboxActive,
    inbox:!durableEventWorkersRequired||input.inboxActive,
    automation:!automationRequired||input.automationActive,
  };
  return {
    ready:Object.values(checks).every(Boolean),
    checks,
    required:{database:databaseRequired,discord:discordRequired,jobWorker:jobWorkerRequired,scheduler:schedulerRequired,durableEventWorkers:durableEventWorkersRequired,automation:automationRequired},
  };
}
