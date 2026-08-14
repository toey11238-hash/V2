import type { Client } from 'discord.js';
import { makeEvent } from '@autoserver/core';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@autoserver/config';
import { AuditRepository, ensureGuild, GuildConfigRepository, GuildLockRepository, MutationJournalRepository, ResourceMappingRepository, SetupSessionRepository, type Database } from '@autoserver/database';
import { JobCancelledError, JobExecutionError, type JobRecord, type JobRepository } from '@autoserver/jobs';
import type { EventBus } from '@autoserver/core';
import { DiscordGuildScanner, DiscordResourceExecutor, SetupPlanner, applyDesiredResourceLocks, orderPlanForExecution } from '@autoserver/setup';
import { PanelDeploymentService, panelsForBlueprint } from '@autoserver/panels';
import { blueprintForSetupDraft, defaultSetupDraft, enabledModulesForDraft, normalizeSetupDraft, type SetupDraft } from '@autoserver/control-center';
import { GamingRepository } from '@autoserver/gaming';
import { DiscordMutationCompensator } from '@autoserver/recovery';
import { ScheduledTaskRepository, localDateKey, nextLocalTime, nextLocalWeekdayTime } from '@autoserver/scheduler';
import { resolveGuildBlueprint } from './blueprint-resolver.js';
import { ChangeRunRepository } from '@autoserver/change-control';
import { BUILTIN_INTEGRATIONS, IntegrationControlRepository, createDefaultIntegrationRegistry } from '@autoserver/integrations';
import { ResourceBudgetRepository } from '@autoserver/budgets';
import { AdmissionControlRepository } from '@autoserver/admission-control';
import { SETUP_MANAGED_INTEGRATION_KEYS, assertSetupDraftSemantics, assertSetupModuleOverridesAllowed, loadCurrentSetupDraft, setupApprovalHash, setupConfigurationWorkUnits, setupDraftFingerprint } from './setup-state.js';

export function createSetupJobHandler(deps: {
  client: Client;
  config: AppConfig;
  database: Database;
  jobs: JobRepository;
  bus: EventBus;
}) {
  const mappings = new ResourceMappingRepository(deps.database);
  const locks = new GuildLockRepository(deps.database);
  const configs = new GuildConfigRepository(deps.database);
  const audits = new AuditRepository(deps.database);
  const scanner = new DiscordGuildScanner(mappings);
  const planner = new SetupPlanner();
  const executor = new DiscordResourceExecutor(mappings);
  const panelDeployment = new PanelDeploymentService(deps.database);
  const journal = new MutationJournalRepository(deps.database);
  const compensator = new DiscordMutationCompensator(deps.database);

  return async (job: JobRecord): Promise<unknown> => {
    if (!job.guildId) throw new Error('SETUP_APPLY requires guildId');
    const payload = job.payload as { blueprintKey?: string; planHash?: string; setupDraft?: SetupDraft; sessionId?: string; changeRunId?: string; baseConfigVersion?: number; baseDraftFingerprint?: string };
    const baseBlueprint = await resolveGuildBlueprint(deps.database,job.guildId,payload.blueprintKey ?? 'hybrid-standard');
    const setupDraft = normalizeSetupDraft(payload.setupDraft ?? defaultSetupDraft(baseBlueprint.key),baseBlueprint.key);
    const blueprint = blueprintForSetupDraft(baseBlueprint, setupDraft);
    assertSetupModuleOverridesAllowed(setupDraft, blueprint);
    assertSetupDraftSemantics(setupDraft);
    const enabledModules = enabledModulesForDraft(baseBlueprint.enabledModules, setupDraft);
    const guild = await deps.client.guilds.fetch(job.guildId);
    await ensureGuild(deps.database, { id: guild.id, name: guild.name, ownerId: guild.ownerId });
    await new ResourceBudgetRepository(deps.database).ensureDefaults(guild.id, job.actorId ?? 'setup');
    const admission=await new AdmissionControlRepository(deps.database).evaluate({guildId:guild.id,operation:'STRUCTURAL',actorId:job.actorId,correlationId:job.correlationId,detail:'setup worker pre-mutation guard'});
    if(admission.decision!=='ALLOW')throw new JobExecutionError(admission.reason,'ADMISSION_DEFERRED',true,(admission.retryAfterSeconds??120)*1000);

    const lockOwner = `job:${job.jobId}`;
    const locked = await locks.acquire({ guildId: guild.id, lockKey: 'setup', ownerId: lockOwner, correlationId: job.correlationId, ttlSeconds: 180 });
    if (!locked) throw new JobExecutionError('Another setup/repair mutation currently owns the guild lock', 'GUILD_LOCK_BUSY', true, 2_500);

    let panelDeploymentStarted = false;
    try {
      const currentSetupBase=await loadCurrentSetupDraft(deps.database,guild.id);
      if (payload.baseConfigVersion !== undefined && (currentSetupBase.configVersion??0)!==payload.baseConfigVersion) throw new JobExecutionError('Guild setup config version changed after approval','PLAN_CHANGED',false);
      if (payload.baseDraftFingerprint !== undefined && setupDraftFingerprint(currentSetupBase.draft)!==payload.baseDraftFingerprint) throw new JobExecutionError('Guild setup desired state changed after approval','PLAN_CHANGED',false);
      if (payload.sessionId) await new SetupSessionRepository(deps.database).setState(payload.sessionId, guild.id, 'EXECUTING').catch(() => undefined);
      if (payload.changeRunId) await new ChangeRunRepository(deps.database).setState(guild.id,payload.changeRunId,'RUNNING').catch(() => undefined);
      await deps.bus.publish(makeEvent({ type: 'setup.job.started', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId, payload: { jobId: job.jobId, blueprintKey: blueprint.key, themeKey: setupDraft.themeKey, modules: enabledModules } }));

      const rawSnapshot = await scanner.scan(guild);
      const knownLockKeys = new Set([...rawSnapshot.mappings.map((mapping)=>mapping.logicalKey), ...blueprint.resources.map((resource)=>resource.logicalKey)]);
      const unknownLock = setupDraft.resourceLocks.find((key)=>!knownLockKeys.has(key));
      if (unknownLock) throw new JobExecutionError(`Unknown resource lock key: ${unknownLock}`, 'SETUP_RESOURCE_LOCK_UNKNOWN', false);
      const snapshot = applyDesiredResourceLocks(rawSnapshot, setupDraft.resourceLocks);
      const plan = planner.plan(snapshot, blueprint);
      const approvalBase = payload.baseConfigVersion !== undefined && payload.baseDraftFingerprint !== undefined ? {configVersion:payload.baseConfigVersion,draftFingerprint:payload.baseDraftFingerprint} : undefined;
      const hash = setupApprovalHash(plan, setupDraft, blueprint, approvalBase);
      if (plan.conflicts > 0) throw new JobExecutionError(`Setup blocked by ${plan.conflicts} unresolved resource conflict(s)`, 'SETUP_CONFLICT', false);
      if (payload.planHash && payload.planHash !== hash) throw new JobExecutionError('Desired-state plan changed after approval; a new preview is required', 'PLAN_CHANGED', false);

      const actionable = orderPlanForExecution(plan.actions).filter((action) => ['CREATE', 'ADOPT', 'UPDATE'].includes(action.type));
      const panelDefinitions = panelsForBlueprint(blueprint);
      const totalUnits = actionable.length + panelDefinitions.length + setupConfigurationWorkUnits();
      let completed = 0;

      for (const [sequenceNo, action] of actionable.entries()) {
        if (await deps.jobs.isCancelled(job.jobId)) throw new JobCancelledError();
        const renewed = await locks.renew(guild.id, 'setup', lockOwner, 180);
        if (!renewed) throw new JobExecutionError('Guild mutation lock was lost during setup', 'GUILD_LOCK_LOST', true, 2_500);
        const mutationId = randomUUID();
        await journal.prepare({
          mutationId, jobId: job.jobId, guildId: guild.id, sequenceNo, action: action.type, resourceKind: action.desired.kind, logicalKey: action.desired.logicalKey,
          discordId: action.actual?.discordId,
          beforeState: action.actual ? { name: action.actual.name, ownership: action.actual.ownership, locked: action.actual.locked ?? false } : undefined,
          afterState: { name: action.desired.name, ownership: action.desired.ownership, visibility: action.desired.visibility ?? 'PUBLIC' },
          compensator: { policy: 'SAFE_EXACT_MATCH_ONLY', action: action.type }, correlationId: job.correlationId,
        });
        await deps.jobs.progress(job.jobId, `resource:${action.desired.logicalKey}`, completed);
        await deps.bus.publish(makeEvent({
          type: 'setup.resource.started', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId,
          payload: { jobId: job.jobId, mutationId, logicalKey: action.desired.logicalKey, action: action.type, completedUnits: completed, totalUnits },
        }));
        const result = await executor.apply(guild, action);
        await journal.markApplied(mutationId, result.discordId, { name: action.desired.name, ownership: action.desired.ownership, visibility: action.desired.visibility ?? 'PUBLIC' });
        completed += 1;
        await deps.jobs.progress(job.jobId, `resource:${action.desired.logicalKey}`, completed);
        await deps.bus.publish(makeEvent({
          type: 'setup.resource.completed', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId,
          payload: { jobId: job.jobId, mutationId, logicalKey: action.desired.logicalKey, action: result.action, discordId: result.discordId, completedUnits: completed, totalUnits },
        }));
      }

      await deps.jobs.progress(job.jobId, 'verify:resources', completed);
      const verified = applyDesiredResourceLocks(await scanner.scan(guild), setupDraft.resourceLocks);
      const verifyPlan = planner.plan(verified, blueprint);
      const remaining = verifyPlan.summary.CREATE + verifyPlan.summary.ADOPT + verifyPlan.summary.UPDATE + verifyPlan.summary.CONFLICT;
      if (remaining > 0) throw new JobExecutionError(`Post-apply verification found ${remaining} unresolved desired-state item(s)`, 'POST_VERIFY_DRIFT', true, 2_000);

      await deps.jobs.progress(job.jobId, 'deploy:panels', completed);
      panelDeploymentStarted = true;
      const panelResults = await panelDeployment.deployForBlueprint({
        guild,
        blueprint,
        dashboardUrl: deps.config.DASHBOARD_URL,
        actorId: job.actorId,
        locale: setupDraft.locale,
        themeKey: setupDraft.themeKey,
        motionPreset: setupDraft.motionPreset,
        mediaDensity: setupDraft.mediaDensity,
        panelDensity: setupDraft.panelDensity,
        state: 'IDLE',
        onResult: async (result) => {
          if (await deps.jobs.isCancelled(job.jobId)) throw new JobCancelledError();
          const renewed = await locks.renew(guild.id, 'setup', lockOwner, 180);
          if (!renewed) throw new JobExecutionError('Guild mutation lock was lost during panel deployment', 'GUILD_LOCK_LOST', true, 2_500);
          completed += 1;
          await deps.jobs.progress(job.jobId, `panel:${result.panelId}`, completed);
          await deps.bus.publish(makeEvent({
            type: 'setup.panel.completed', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId,
            payload: { jobId: job.jobId, panelId: result.panelId, action: result.action, messageId: result.messageId, channelId: result.channelId, completedUnits: completed, totalUnits },
          }));
        },
      });

      if (await deps.jobs.isCancelled(job.jobId)) throw new JobCancelledError();
      if (!await locks.renew(guild.id, 'setup', lockOwner, 180)) throw new JobExecutionError('Guild mutation lock was lost before configuration reconciliation', 'GUILD_LOCK_LOST', true, 2_500);

      const budgetRepository=new ResourceBudgetRepository(deps.database);
      const budgetDrafts=[
        ['provider.sync',setupDraft.budgets.providerSync],
        ['background.analytics',setupDraft.budgets.analytics],
        ['background.backup',setupDraft.budgets.backup],
        ['notification.fanout',setupDraft.budgets.notificationFanout],
        ['bulk.automation',setupDraft.budgets.bulkAutomation],
      ] as const;
      for(const [budgetKey,policy] of budgetDrafts) await budgetRepository.upsert({guildId:guild.id,budgetKey,enabled:policy.enabled,mode:policy.mode,windowSeconds:policy.windowSeconds,maxUnits:policy.maxUnits,updatedBy:job.actorId??'setup'});
      await new AdmissionControlRepository(deps.database).upsert({guildId:guild.id,preset:setupDraft.admissionPreset,mode:'ENFORCE',failClosedWhenUnknown:true,updatedBy:job.actorId??'setup'});



      const scheduleRepo = new ScheduledTaskRepository(deps.database);
      const control=new IntegrationControlRepository(deps.database);
      const registry=createDefaultIntegrationRegistry();
      const integrationDrafts:Record<string,{enabled:boolean;config?:Record<string,unknown>;syncCadence:'OFF'|'DAILY'|'WEEKLY'}>={
        'riot-data-dragon':{enabled:setupDraft.integrations.riotDataDragon.enabled,config:{locale:setupDraft.integrations.riotDataDragon.locale},syncCadence:setupDraft.integrations.riotDataDragon.syncCadence},
        'github-releases':{enabled:setupDraft.integrations.githubReleases.enabled,config:setupDraft.integrations.githubReleases.owner&&setupDraft.integrations.githubReleases.repo?{owner:setupDraft.integrations.githubReleases.owner,repo:setupDraft.integrations.githubReleases.repo,includePrereleases:setupDraft.integrations.githubReleases.includePrereleases}:undefined,syncCadence:setupDraft.integrations.githubReleases.syncCadence},
        'discord-status':{enabled:setupDraft.integrations.discordStatus.enabled,syncCadence:setupDraft.integrations.discordStatus.syncCadence},
        'steam-news':{enabled:setupDraft.integrations.steamNews.enabled,config:{appId:setupDraft.integrations.steamNews.appId,count:setupDraft.integrations.steamNews.count,maxLength:setupDraft.integrations.steamNews.maxLength},syncCadence:setupDraft.integrations.steamNews.syncCadence},
      };
      if (enabledModules.includes('integrations')) {
        for (const integrationKey of SETUP_MANAGED_INTEGRATION_KEYS) {
          const integration=BUILTIN_INTEGRATIONS.find((item)=>item.key===integrationKey);
          if(!integration)throw new JobExecutionError(`Missing built-in integration descriptor: ${integrationKey}`,'SETUP_INTEGRATION_DESCRIPTOR_MISSING',false);
          let current=await control.ensureConfigured({guildId:guild.id,integrationKey,capabilities:integration.capabilities,actorId:job.actorId});
          const desired=integrationDrafts[integrationKey]!;
          const adapter=registry.get(integrationKey);
          if(desired.config&&adapter?.config){
            const validated=adapter.config.validate(desired.config);
            if(JSON.stringify(current.config)!==JSON.stringify(validated)) current=await control.setPublicConfig({guildId:guild.id,integrationKey,config:validated,actorId:job.actorId});
          }
          if(current.enabled!==desired.enabled) current=await control.setEnabled({guildId:guild.id,integrationKey,enabled:desired.enabled,actorId:job.actorId});
          await deps.database.requirePool().query(`update scheduled_tasks set state='CANCELLED',updated_at=now() where guild_id=$1 and task_type='INTEGRATION_SYNC' and payload->>'integrationKey'=$2 and state='SCHEDULED'`,[guild.id,integrationKey]);
          if(desired.enabled&&desired.syncCadence!=='OFF'&&adapter?.sync){
            const runAt=new Date(Date.now()+60_000);
            await scheduleRepo.schedule({guildId:guild.id,taskType:'INTEGRATION_SYNC',runAt,timezone:setupDraft.timezone,dedupKey:`integration-sync:${integrationKey}:${localDateKey(setupDraft.timezone,runAt)}`,payload:{integrationKey,cadence:desired.syncCadence,localHour:5,weekday:1}});
          }
        }
      } else {
        for (const integration of BUILTIN_INTEGRATIONS) {
          const current=await control.get(guild.id,integration.key);
          if(current?.enabled) await control.setEnabled({guildId:guild.id,integrationKey:integration.key,enabled:false,actorId:job.actorId});
          await deps.database.requirePool().query(`update scheduled_tasks set state='CANCELLED',updated_at=now() where guild_id=$1 and task_type='INTEGRATION_SYNC' and payload->>'integrationKey'=$2 and state='SCHEDULED'`,[guild.id,integration.key]);
        }
      }

      const gaming = new GamingRepository(deps.database);
      const desiredGames = enabledModules.includes('gaming') ? setupDraft.games.map((gameKey)=>({
        gameKey,
        displayName:gameKey.split(/[-_]/g).filter(Boolean).map((part)=>part.charAt(0).toUpperCase()+part.slice(1)).join(' '),
        config:{source:'setup'},
        featureFlags:{lfg:enabledModules.includes('lfg'),sessions:enabledModules.includes('game-sessions'),availability:enabledModules.includes('game-sessions'),teams:enabledModules.includes('teams'),clans:enabledModules.includes('clans'),tournaments:enabledModules.includes('tournaments'),progression:enabledModules.includes('progression')},
      })) : [];
      const gamingReconciliation=await gaming.reconcileEnabledGames(guild.id,desiredGames);

      const currentMappings=await mappings.list(guild.id);
      const desiredLocks=new Set(setupDraft.resourceLocks);
      const lockReconciliation={locked:[] as string[],unlocked:[] as string[]};
      for(const mapping of currentMappings){
        const desired=desiredLocks.has(mapping.logicalKey);
        if(Boolean(mapping.locked)===desired)continue;
        if(await mappings.setLocked(guild.id,mapping.logicalKey,desired))(desired?lockReconciliation.locked:lockReconciliation.unlocked).push(mapping.logicalKey);
      }

      await scheduleRepo.cancelPendingByType(guild.id,'ANALYTICS_DAILY');
      if (enabledModules.includes('analytics')) {
        const runAt=nextLocalTime(setupDraft.timezone,3,15);
        const metricDate=localDateKey(setupDraft.timezone,runAt);
        await scheduleRepo.schedule({guildId:guild.id,taskType:'ANALYTICS_DAILY',runAt,timezone:setupDraft.timezone,dedupKey:`analytics-daily:${metricDate}`,payload:{metricDate}});
      }

      if (enabledModules.includes('backup')) {
        const backupRunAt = setupDraft.backupSchedule === 'OFF'
          ? null
          : setupDraft.backupSchedule === 'DAILY'
            ? nextLocalTime(setupDraft.timezone, setupDraft.backupHourLocal, 0)
            : nextLocalWeekdayTime(setupDraft.timezone, setupDraft.backupWeekday, setupDraft.backupHourLocal, 0);
        await deps.database.requirePool().query(
          `insert into backup_schedule_state(guild_id,cadence,local_hour,backup_weekday,timezone,keep_scheduled,next_run_at,last_result,updated_at)
           values($1,$2,$3,$4,$5,7,$6,'CONFIGURED',now())
           on conflict(guild_id) do update set cadence=excluded.cadence,local_hour=excluded.local_hour,backup_weekday=excluded.backup_weekday,timezone=excluded.timezone,next_run_at=excluded.next_run_at,last_result='CONFIGURED',updated_at=now()`,
          [guild.id, setupDraft.backupSchedule, setupDraft.backupHourLocal, setupDraft.backupWeekday, setupDraft.timezone, backupRunAt],
        );
        await scheduleRepo.cancelPendingByType(guild.id,'BACKUP_SCHEDULED');
        if (backupRunAt) {
          await scheduleRepo.schedule({
            guildId:guild.id, taskType:'BACKUP_SCHEDULED', runAt:backupRunAt, timezone:setupDraft.timezone,
            dedupKey:`backup-scheduled:${backupRunAt.toISOString()}`, payload:{ cadence:setupDraft.backupSchedule, localHour:setupDraft.backupHourLocal, weekday:setupDraft.backupWeekday, keep:7 },
          });
        }
      } else {
        await scheduleRepo.cancelPendingByType(guild.id,'BACKUP_SCHEDULED');
        await deps.database.requirePool().query(
          `insert into backup_schedule_state(guild_id,cadence,local_hour,backup_weekday,timezone,keep_scheduled,next_run_at,last_result,updated_at)
           values($1,'OFF',$2,$3,$4,7,null,'MODULE_DISABLED',now())
           on conflict(guild_id) do update set cadence='OFF',next_run_at=null,last_result='MODULE_DISABLED',updated_at=now()`,
          [guild.id, setupDraft.backupHourLocal, setupDraft.backupWeekday, setupDraft.timezone],
        );
      }

      if (await deps.jobs.isCancelled(job.jobId)) throw new JobCancelledError();
      if (!await locks.renew(guild.id, 'setup', lockOwner, 180)) throw new JobExecutionError('Guild mutation lock was lost before configuration commit', 'GUILD_LOCK_LOST', true, 2_500);

      const configVersion = await configs.applyBlueprint({
        guildId: guild.id,
        actorId: job.actorId,
        templateKey: blueprint.key,
        templateVersion: blueprint.version,
        sizeProfile: blueprint.complexity,
        enabledModules,
        verified: false,
        language: setupDraft.locale,
        timezone: setupDraft.timezone,
        themeKey: setupDraft.themeKey,
        automationPolicy: { preset: setupDraft.automationPreset, eventBacked: true },
        permissionPolicy: { securityPreset: setupDraft.securityPreset, destructiveChanges: 'APPROVAL_REQUIRED' },
        retentionPolicy: { profile: setupDraft.retentionProfile },
        setupProfile: { modulePreset: setupDraft.modulePreset, gamingPreset: setupDraft.gamingPreset, securityPreset: setupDraft.securityPreset, automationPreset: setupDraft.automationPreset, motionPreset: setupDraft.motionPreset, panelDensity: setupDraft.panelDensity, channelDecoration: setupDraft.channelDecoration, roleVisualStyle: setupDraft.roleVisualStyle, mediaDensity: setupDraft.mediaDensity, moduleOverrides: setupDraft.moduleOverrides, resourceLocks: setupDraft.resourceLocks, integrations: setupDraft.integrations, backupSchedule: setupDraft.backupSchedule, backupHourLocal: setupDraft.backupHourLocal, backupWeekday: setupDraft.backupWeekday, budgets: setupDraft.budgets, admissionPreset: setupDraft.admissionPreset, aiProvider: setupDraft.aiProvider },
        gamingConfig: { games: setupDraft.games, preset: setupDraft.gamingPreset },
        approvalPolicy: { mode: setupDraft.approvalMode, destructiveActions: 'INDEPENDENT_APPROVAL' },
      });

      const persistedSetup=await loadCurrentSetupDraft(deps.database,guild.id);
      if(setupDraftFingerprint(persistedSetup.draft)!==setupDraftFingerprint(setupDraft)) throw new JobExecutionError('Persisted setup state did not converge to the approved draft','SETUP_CONFIG_VERIFY_DRIFT',true,2_000);
      completed += setupConfigurationWorkUnits();
      await deps.jobs.progress(job.jobId,'config:reconciled',completed);
      await deps.bus.publish(makeEvent({type:'setup.config.reconciled',guildId:guild.id,actorId:job.actorId,correlationId:job.correlationId,payload:{jobId:job.jobId,completedUnits:completed,totalUnits,gaming:gamingReconciliation,locks:lockReconciliation,analyticsEnabled:enabledModules.includes('analytics'),integrationsEnabled:enabledModules.includes('integrations')}}));

      const panelSummary = panelResults.reduce<Record<string, number>>((acc, item) => { acc[item.action] = (acc[item.action] ?? 0) + 1; return acc; }, {});
      if (payload.sessionId) await new SetupSessionRepository(deps.database).setState(payload.sessionId, guild.id, 'STRUCTURAL_COMPLETE').catch(() => undefined);
      if (payload.changeRunId) await new ChangeRunRepository(deps.database).setState(guild.id,payload.changeRunId,'SUCCEEDED',{configVersion,blueprintKey:blueprint.key,verificationSummary:verifyPlan.summary,panelSummary}).catch(() => undefined);
      await audits.record({
        auditId: randomUUID(), guildId: guild.id, actorId: job.actorId, action: 'SETUP_APPLY', resourceType: 'GUILD_CONFIG', resourceId: guild.id,
        afterState: { blueprintKey: blueprint.key, blueprintVersion: blueprint.version, configVersion, enabledModules, setupDraft, verificationSummary: verifyPlan.summary, panelSummary, gamingReconciliation, lockReconciliation },
        result: 'SUCCEEDED_STRUCTURAL_WITH_PANELS', correlationId: job.correlationId,
      });
      await deps.bus.publish(makeEvent({
        type: 'setup.job.structural_complete', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId,
        payload: { jobId: job.jobId, completedUnits: completed, totalUnits, structuralSummary: verifyPlan.summary, panelSummary, fullVerificationPending: true, configVersion, enabledModules, themeKey: setupDraft.themeKey },
      }));
      return { blueprintKey: blueprint.key, planHash: hash, completedUnits: completed, totalUnits, structuralVerificationSummary: verifyPlan.summary, panelSummary, fullVerificationPending: true, configVersion, enabledModules, setupDraft };
    } catch (error) {
      const code = error instanceof JobCancelledError ? 'CANCELLED' : error instanceof JobExecutionError ? error.code : 'SETUP_HANDLER_ERROR';
      let compensation: unknown[] = [];
      if (!panelDeploymentStarted) {
        compensation = await compensator.compensateJob(guild, job.jobId).catch(() => []);
        await deps.bus.publish(makeEvent({
          type: 'setup.rollback.completed', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId,
          payload: { jobId: job.jobId, triggerErrorCode: code, compensation },
        })).catch(() => undefined);
      } else {
        await deps.bus.publish(makeEvent({
          type: 'setup.recovery.required', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId,
          payload: { jobId: job.jobId, triggerErrorCode: code, reason: 'Panel deployment had started; automatic structural rollback is intentionally suppressed to avoid breaking panel dependencies.' },
        })).catch(() => undefined);
      }
      if (payload.sessionId) await new SetupSessionRepository(deps.database).setState(payload.sessionId, guild.id, code === 'CANCELLED' ? 'CANCELLED' : 'FAILED').catch(() => undefined);
      if (payload.changeRunId) await new ChangeRunRepository(deps.database).setState(guild.id,payload.changeRunId,code === 'CANCELLED' ? 'CANCELLED' : 'FAILED',{errorCode:code}).catch(() => undefined);
      await audits.record({
        auditId: randomUUID(), guildId: guild.id, actorId: job.actorId, action: 'SETUP_APPLY', resourceType: 'GUILD_CONFIG', resourceId: guild.id,
        result: code === 'CANCELLED' ? 'CANCELLED' : 'FAILED', errorCode: code, correlationId: job.correlationId,
      }).catch(() => undefined);
      await deps.bus.publish(makeEvent({
        type: code === 'CANCELLED' ? 'setup.job.cancelled' : 'setup.job.failed', guildId: guild.id, actorId: job.actorId, correlationId: job.correlationId,
        payload: { jobId: job.jobId, errorCode: code },
      })).catch(() => undefined);
      throw error;
    } finally {
      await locks.release(guild.id, 'setup', lockOwner);
    }
  };
}
