import { ChannelType, OverwriteType, PermissionFlagsBits, type Client, type Guild, type GuildBasedChannel, type Role } from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@autoserver/config';
import { makeEvent, type EventBus } from '@autoserver/core';
import {
  ApprovalRepository,
  BackupSnapshotRepository,
  GuildConfigRepository,
  GuildLockRepository,
  MutationJournalRepository,
  ResourceMappingRepository,
  RestoreRunRepository,
  type Database,
} from '@autoserver/database';
import { GuildBackupService, restorePlanEvidenceHash, validateBackupEnvelope, type BackupEnvelope, type BackupResourceState, type GuildBackupPayload } from '@autoserver/backups';
import { DiscordResourceExecutor, orderPlanForExecution, type ActualResource, type DesiredResource, type PlanAction, type ResourceKind } from '@autoserver/setup';
import { JobCancelledError, JobExecutionError, type JobRecord, type JobRepository } from '@autoserver/jobs';
import { DiscordMutationCompensator } from '@autoserver/recovery';
import { PanelDeploymentService } from '@autoserver/panels';
import { AdmissionControlRepository } from '@autoserver/admission-control';
import { captureManagedDiscordBackup, snapshotManagedDiscordResourceDetails } from './discord-backup-snapshot.js';

export interface RestoreWorkerDependencies {
  client: Client;
  config: AppConfig;
  database: Database;
  jobs: JobRepository;
  bus: EventBus;
}

function ownership(value: string): DesiredResource['ownership'] {
  return value === 'SYSTEM_OWNED' || value === 'USER_OWNED' || value === 'LOCKED' ? value : 'TEMPLATE_OWNED';
}

function resourceKind(value: string): ResourceKind {
  if (value === 'ROLE' || value === 'CATEGORY' || value === 'TEXT_CHANNEL' || value === 'FORUM_CHANNEL' || value === 'VOICE_CHANNEL') return value;
  throw new JobExecutionError(`Unsupported backup resource kind: ${value}`, 'RESTORE_RESOURCE_KIND_UNSUPPORTED', false);
}

function desiredFromBackup(item: BackupResourceState): DesiredResource {
  return {
    logicalKey: item.logicalKey,
    kind: resourceKind(item.kind),
    name: item.name,
    parentKey: item.parentLogicalKey,
    ownership: ownership(item.ownership),
    reason: 'Integrity-checked, approval-bound backup restore',
    module: 'restore',
    required: true,
    visibility: 'PUBLIC',
  };
}

function actualFromBackup(item: BackupResourceState | undefined): ActualResource | undefined {
  if (!item?.discordId) return undefined;
  return { discordId:item.discordId,kind:resourceKind(item.kind),name:item.name,logicalKey:item.logicalKey,ownership:ownership(item.ownership),locked:item.locked };
}

function toAction(change: { kind: string; before?: BackupResourceState; desired?: BackupResourceState; risk: string; reason: string }): PlanAction | null {
  if (!change.desired || !['CREATE','UPDATE'].includes(change.kind)) return null;
  return {
    type: change.kind as 'CREATE'|'UPDATE',
    desired: desiredFromBackup(change.desired),
    actual: actualFromBackup(change.before),
    risk: change.risk === 'HIGH' ? 'HIGH' : change.risk === 'MEDIUM' ? 'MEDIUM' : 'LOW',
    reason: change.reason,
  };
}

async function applyRoleDetails(role: Role, detail: BackupResourceState, approvalRisk: string, warnings: string[]): Promise<void> {
  if (detail.rolePermissions) {
    const permissions = BigInt(detail.rolePermissions);
    if ((permissions & PermissionFlagsBits.Administrator) !== 0n && approvalRisk !== 'CRITICAL') throw new JobExecutionError('Administrator permission restore requires CRITICAL approval', 'RESTORE_CRITICAL_PERMISSION_APPROVAL_REQUIRED', false);
    await role.setPermissions(permissions, `ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`);
  }
  if (typeof detail.roleColor === 'number') await role.setColor(detail.roleColor, `ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`);
  if (typeof detail.roleHoist === 'boolean') await role.setHoist(detail.roleHoist, `ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`);
  if (typeof detail.roleMentionable === 'boolean') await role.setMentionable(detail.roleMentionable, `ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`);
  if (typeof detail.rolePosition === 'number') {
    await role.setPosition(detail.rolePosition,{ reason:`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}` }).catch((error)=>warnings.push(`ROLE_POSITION ${detail.logicalKey}: ${error instanceof Error ? error.message : 'failed'}`));
  }
}

async function applyChannelDetails(guild: Guild, channel: GuildBasedChannel, detail: BackupResourceState, mappings: ResourceMappingRepository, warnings: string[]): Promise<void> {
  const mappingRows = await mappings.list(guild.id);
  const idByLogical = new Map(mappingRows.map((row)=>[row.logicalKey,row.discordId]));
  if (detail.parentLogicalKey && 'setParent' in channel) {
    const parentId=idByLogical.get(detail.parentLogicalKey);
    if (parentId && channel.parentId !== parentId) await channel.setParent(parentId,{lockPermissions:false,reason:`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`});
  }
  if ('setTopic' in channel && detail.topic !== undefined) await channel.setTopic(detail.topic,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`TOPIC ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('setNSFW' in channel && typeof detail.nsfw === 'boolean') await channel.setNSFW(detail.nsfw,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`NSFW ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('setRateLimitPerUser' in channel && typeof detail.rateLimitPerUser === 'number') await channel.setRateLimitPerUser(detail.rateLimitPerUser,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`SLOWMODE ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('setBitrate' in channel && typeof detail.bitrate === 'number') await channel.setBitrate(detail.bitrate,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`BITRATE ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('setUserLimit' in channel && typeof detail.userLimit === 'number') await channel.setUserLimit(detail.userLimit,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`USER_LIMIT ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('setDefaultAutoArchiveDuration' in channel && typeof detail.forumDefaultAutoArchiveDuration === 'number' && [60,1440,4320,10080].includes(detail.forumDefaultAutoArchiveDuration)) await channel.setDefaultAutoArchiveDuration(detail.forumDefaultAutoArchiveDuration as 60|1440|4320|10080,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`FORUM_ARCHIVE ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('setDefaultThreadRateLimitPerUser' in channel && typeof detail.forumDefaultThreadRateLimitPerUser === 'number') await channel.setDefaultThreadRateLimitPerUser(detail.forumDefaultThreadRateLimitPerUser,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`FORUM_SLOWMODE ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('setAvailableTags' in channel && detail.forumAvailableTags) await channel.setAvailableTags(detail.forumAvailableTags.map((tag)=>({name:tag.name,moderated:tag.moderated})),`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`).catch((error)=>warnings.push(`FORUM_TAGS ${detail.logicalKey}: ${error instanceof Error?error.message:'failed'}`));
  if ('permissionOverwrites' in channel && detail.permissionOverwrites?.length) {
    const overwrites=[] as Array<{id:string;type:OverwriteType;allow:bigint;deny:bigint}>;
    for (const snapshot of detail.permissionOverwrites) {
      let id=snapshot.target === '@everyone' ? guild.id : idByLogical.get(snapshot.target) ?? snapshot.target;
      const type=snapshot.targetKind === 'MEMBER' ? OverwriteType.Member : OverwriteType.Role;
      if (snapshot.targetKind === 'ROLE' && id !== guild.id && !guild.roles.cache.has(id)) { warnings.push(`OVERWRITE_ROLE_MISSING ${detail.logicalKey}:${snapshot.target}`); continue; }
      if (snapshot.targetKind === 'MEMBER' && !guild.members.cache.has(id)) { warnings.push(`OVERWRITE_MEMBER_SKIPPED ${detail.logicalKey}:${snapshot.target}`); continue; }
      overwrites.push({id,type,allow:BigInt(snapshot.allow),deny:BigInt(snapshot.deny)});
    }
    await channel.permissionOverwrites.set(overwrites,`ออโต้เซิร์ฟเวอร์ · กู้คืน ${detail.logicalKey}`);
  }
}


function normalizedOverwrites(value: BackupResourceState['permissionOverwrites'] | undefined): string {
  return JSON.stringify([...(value ?? [])].map((item)=>({target:item.target,targetKind:item.targetKind,allow:item.allow,deny:item.deny}))
    .sort((a,b)=>`${a.targetKind}:${a.target}`.localeCompare(`${b.targetKind}:${b.target}`)));
}

function detailDrift(target: BackupResourceState, actual: Partial<BackupResourceState> | undefined): string[] {
  if (!actual) return [`DETAIL_MISSING ${target.logicalKey}`];
  const drift: string[]=[];
  const compare=(key:keyof BackupResourceState,label=String(key))=>{
    const expected=target[key]; if(expected===undefined) return;
    if(actual[key]!==expected) drift.push(`${label} expected=${String(expected)} actual=${String(actual[key])}`);
  };
  if(target.kind==='ROLE') {
    compare('rolePermissions','permissions'); compare('roleColor','color'); compare('roleHoist','hoist'); compare('roleMentionable','mentionable'); compare('rolePosition','position');
  } else {
    compare('parentLogicalKey','parent'); compare('channelType','channelType'); compare('topic','topic'); compare('nsfw','nsfw'); compare('rateLimitPerUser','slowmode'); compare('bitrate','bitrate'); compare('userLimit','userLimit'); compare('forumDefaultAutoArchiveDuration','forumAutoArchive'); compare('forumDefaultThreadRateLimitPerUser','forumThreadSlowmode');
    if(target.forumAvailableTags!==undefined && JSON.stringify([...target.forumAvailableTags].sort((a,b)=>a.name.localeCompare(b.name)))!==JSON.stringify([...(actual.forumAvailableTags ?? [])].sort((a,b)=>a.name.localeCompare(b.name)))) drift.push('forumAvailableTags differ');
    if(target.permissionOverwrites!==undefined && normalizedOverwrites(target.permissionOverwrites)!==normalizedOverwrites(actual.permissionOverwrites)) drift.push('permissionOverwrites differ');
  }
  return drift.map((item)=>`${target.logicalKey}: ${item}`);
}

async function verifyRestoredDetails(guild: Guild, database: Database, envelope: BackupEnvelope<GuildBackupPayload>): Promise<string[]> {
  const actual=await snapshotManagedDiscordResourceDetails({guild,database});
  return envelope.payload.resources.flatMap((target)=>detailDrift(target,actual[target.logicalKey]));
}

async function verifyRestoredConfig(database: Database, guildId: string, snapshot: Record<string, unknown>): Promise<string[]> {
  const current=await new GuildConfigRepository(database).get(guildId); if(!current) return ['CONFIG missing after restore'];
  const drift:string[]=[];
  const pairs:[string,unknown,unknown][]=[
    ['templateKey',snapshot.templateKey,current.templateKey],['templateVersion',snapshot.templateVersion,current.templateVersion],['sizeProfile',snapshot.sizeProfile,current.sizeProfile],
    ['language',snapshot.language,current.language],['timezone',snapshot.timezone,current.timezone],['themeKey',snapshot.themeKey,current.themeKey],
  ];
  for(const [key,expected,actual] of pairs) if(expected!==undefined && expected!==actual) drift.push(`CONFIG ${key} expected=${String(expected)} actual=${String(actual)}`);
  for(const key of ['enabledModules','automationPolicy','permissionPolicy','retentionPolicy','setupProfile','gamingConfig','approvalPolicy'] as const) {
    const expected=snapshot[key]; if(expected!==undefined && JSON.stringify(expected)!==JSON.stringify(current[key])) drift.push(`CONFIG ${key} differs`);
  }
  return drift;
}

async function restoreConfig(database: Database, guildId: string, actorId: string | undefined, config: Record<string, unknown>, warnings: string[]): Promise<void> {
  const templateKey=typeof config.templateKey==='string'?config.templateKey:undefined;
  const templateVersion=Number(config.templateVersion);
  const sizeProfile=typeof config.sizeProfile==='string'?config.sizeProfile:undefined;
  if(!templateKey || !Number.isInteger(templateVersion) || !sizeProfile){ warnings.push('CONFIG snapshot lacks template identity; config restore skipped.'); return; }
  const enabledObject=config.enabledModules && typeof config.enabledModules==='object' ? config.enabledModules as Record<string,unknown> : {};
  const enabledModules=Object.entries(enabledObject).filter(([,enabled])=>enabled===true).map(([key])=>key);
  await new GuildConfigRepository(database).applyBlueprint({guildId,actorId,templateKey,templateVersion,sizeProfile,enabledModules,verified:false,language:typeof config.language==='string'?config.language:undefined,timezone:typeof config.timezone==='string'?config.timezone:undefined,themeKey:typeof config.themeKey==='string'?config.themeKey:undefined,automationPolicy:config.automationPolicy && typeof config.automationPolicy==='object' ? config.automationPolicy as Record<string,unknown> : {},permissionPolicy:config.permissionPolicy && typeof config.permissionPolicy==='object' ? config.permissionPolicy as Record<string,unknown> : {},retentionPolicy:config.retentionPolicy && typeof config.retentionPolicy==='object' ? config.retentionPolicy as Record<string,unknown> : {},setupProfile:config.setupProfile && typeof config.setupProfile==='object' ? config.setupProfile as Record<string,unknown> : {},gamingConfig:config.gamingConfig && typeof config.gamingConfig==='object' ? config.gamingConfig as Record<string,unknown> : {},approvalPolicy:config.approvalPolicy && typeof config.approvalPolicy==='object' ? config.approvalPolicy as Record<string,unknown> : {}});
  const setupProfile=config.setupProfile&&typeof config.setupProfile==='object'?config.setupProfile as Record<string,unknown>:{};
  if(typeof setupProfile.admissionPreset==='string')await new AdmissionControlRepository(database).upsert({guildId,preset:setupProfile.admissionPreset,mode:'ENFORCE',failClosedWhenUnknown:true,updatedBy:actorId??'restore'});
}

export function createRestoreJobHandler(deps: RestoreWorkerDependencies) {
  const locks=new GuildLockRepository(deps.database); const mappings=new ResourceMappingRepository(deps.database); const journal=new MutationJournalRepository(deps.database); const executor=new DiscordResourceExecutor(mappings); const compensator=new DiscordMutationCompensator(deps.database);
  return async(job:JobRecord):Promise<unknown>=>{
    if(!job.guildId) throw new JobExecutionError('Restore job requires guild scope','RESTORE_GUILD_REQUIRED',false);
    const payload=job.payload as {restoreRunId?:string;backupId?:string;approvalId?:string};
    if(!payload.restoreRunId||!payload.backupId||!payload.approvalId) throw new JobExecutionError('Restore job payload is incomplete','RESTORE_PAYLOAD_INVALID',false);
    const approval=await new ApprovalRepository(deps.database).get(job.guildId,payload.approvalId);
    if(!approval||approval.operationKey!=='RESTORE_APPLY'||approval.state!=='APPROVED') throw new JobExecutionError('Approved restore authorization is required','RESTORE_APPROVAL_REQUIRED',false);
    const run=await new RestoreRunRepository(deps.database).get(job.guildId,payload.restoreRunId);
    if(!run||run.backupId!==payload.backupId||run.approvalRequestId!==payload.approvalId) throw new JobExecutionError('Restore run does not match the approved job payload','RESTORE_BINDING_INVALID',false);
    const backupRepo=new BackupSnapshotRepository(deps.database);
    const backup=await backupRepo.get(job.guildId,payload.backupId);
    if(!backup?.payload) throw new JobExecutionError('Backup payload not found','BACKUP_NOT_FOUND',false);
    if(!['INTEGRITY_CHECKED','RESTORE_VERIFIED'].includes(backup.status)) throw new JobExecutionError(`Backup state ${backup.status} is not eligible for restore`,'BACKUP_NOT_RESTORE_ELIGIBLE',false);
    const envelope=backup.payload as unknown as BackupEnvelope<GuildBackupPayload>;
    if(!validateBackupEnvelope(envelope)||envelope.guildId!==job.guildId||envelope.checksum!==backup.contentHash||envelope.hashAlgorithm!==backup.hashAlgorithm) throw new JobExecutionError('Backup checksum, algorithm or guild scope is invalid','BACKUP_VALIDATION_FAILED',false);
    const guild=await deps.client.guilds.fetch(job.guildId); await Promise.all([guild.roles.fetch(),guild.channels.fetch()]);
    const owner=`restore:${job.jobId}`; if(!await locks.acquire({guildId:guild.id,lockKey:'restore',ownerId:owner,correlationId:job.correlationId,ttlSeconds:240})) throw new JobExecutionError('Restore lock is busy','RESTORE_LOCK_BUSY',true,3000);
    const warnings:string[]=[]; let preRestoreBackupId:string|undefined;
    try{
      const plan=await new GuildBackupService(deps.database).plan(guild.id,envelope);
      if(plan.some((change)=>change.kind==='CONFLICT')) throw new JobExecutionError('Restore has protected-resource conflicts; preview again after resolving them','RESTORE_CONFLICT',false);
      const currentPlanHash=restorePlanEvidenceHash({guildId:guild.id,backupId:payload.backupId,backupContentHash:backup.contentHash,hashAlgorithm:backup.hashAlgorithm,changes:plan});
      const approvedPlanHash=String(approval.payload.planHash ?? '');
      const runPlanHash=String((run.plan as Record<string,unknown>).planHash ?? '');
      const approvedBackupHash=String(approval.payload.backupContentHash ?? '');
      const approvedAlgorithm=String(approval.payload.hashAlgorithm ?? '');
      if(currentPlanHash!==approvedPlanHash||currentPlanHash!==runPlanHash) throw new JobExecutionError('Restore plan changed after approval','RESTORE_PLAN_HASH_MISMATCH',false);
      if(backup.contentHash!==approvedBackupHash||backup.hashAlgorithm!==approvedAlgorithm) throw new JobExecutionError('Backup content changed after approval','RESTORE_BACKUP_HASH_MISMATCH',false);
      const pre=await captureManagedDiscordBackup({guild,database:deps.database,kind:'PRE_RESTORE',createdBy:job.actorId}); preRestoreBackupId=pre.backupId;
      await deps.database.requirePool().query(`update restore_runs set state='RUNNING',result=$3,updated_at=now() where restore_run_id=$1 and guild_id=$2`,[payload.restoreRunId,guild.id,{preRestoreBackupId}]);
      await deps.bus.publish(makeEvent({type:'restore.job.started',guildId:guild.id,actorId:job.actorId,correlationId:job.correlationId,payload:{jobId:job.jobId,restoreRunId:payload.restoreRunId,backupId:payload.backupId,preRestoreBackupId}}));
      const actions=orderPlanForExecution(plan.map(toAction).filter((item):item is PlanAction=>Boolean(item)));
      const targetByKey=new Map(envelope.payload.resources.map((item)=>[item.logicalKey,item]));
      let completed=0;
      for(const [sequenceNo,action] of actions.entries()){
        if(await deps.jobs.isCancelled(job.jobId)) throw new JobCancelledError();
        if(!await locks.renew(guild.id,'restore',owner,240)) throw new JobExecutionError('Restore lock was lost','RESTORE_LOCK_LOST',true,3000);
        const target=targetByKey.get(action.desired.logicalKey)!; const mutationId=randomUUID();
        await journal.prepare({mutationId,jobId:job.jobId,guildId:guild.id,sequenceNo,action:action.type,resourceKind:action.desired.kind,logicalKey:action.desired.logicalKey,discordId:action.actual?.discordId,beforeState:action.actual?{name:action.actual.name,ownership:action.actual.ownership,locked:action.actual.locked??false}:undefined,afterState:{name:target.name,ownership:target.ownership},compensator:{policy:'SAFE_EXACT_MATCH_ONLY'},correlationId:job.correlationId});
        const result=await executor.apply(guild,action); if(!result.discordId) throw new JobExecutionError(`Restore did not resolve ${action.desired.logicalKey}`,'RESTORE_RESOURCE_ID_MISSING',false);
        const role=action.desired.kind==='ROLE'?guild.roles.cache.get(result.discordId):undefined; const channel=action.desired.kind!=='ROLE'?guild.channels.cache.get(result.discordId):undefined;
        if(role) await applyRoleDetails(role,target,approval.risk,warnings); else if(channel) await applyChannelDetails(guild,channel,target,mappings,warnings);
        await mappings.upsert({guildId:guild.id,logicalKey:target.logicalKey,resourceKind:target.kind,discordId:result.discordId,ownership:ownership(target.ownership),nameSnapshot:target.name,locked:Boolean(target.locked)});
        await journal.markApplied(mutationId,result.discordId,{name:target.name,ownership:target.ownership}); completed++; await deps.jobs.progress(job.jobId,`restore:${target.logicalKey}`,completed);
      }
      for(const change of plan.filter((item)=>item.kind==='REMOVE_MAPPING')) warnings.push(`PRESERVED_EXTRA ${change.logicalKey}: restore never deletes resources merely because they are absent from a backup.`);
      await restoreConfig(deps.database,guild.id,job.actorId,envelope.payload.config,warnings);
      const panelService=new PanelDeploymentService(deps.database);
      for(const panel of envelope.payload.panels){
        try{ await panelService.rollbackPanel({guild,panelId:panel.panelId,contentVersion:panel.contentVersion,actorId:job.actorId}); }
        catch(error){ warnings.push(`PANEL ${panel.panelId}: ${error instanceof Error?error.message:'restore skipped'}`); }
      }
      await deps.database.requirePool().query(`update restore_runs set state='VERIFYING',updated_at=now() where restore_run_id=$1 and guild_id=$2`,[payload.restoreRunId,guild.id]);
      const verify=await new GuildBackupService(deps.database).plan(guild.id,envelope);
      const unresolved=verify.filter((item)=>['CREATE','UPDATE','CONFLICT'].includes(item.kind));
      const [detailDrifts,configDrifts]=await Promise.all([verifyRestoredDetails(guild,deps.database,envelope),verifyRestoredConfig(deps.database,guild.id,envelope.payload.config)]);
      const verificationFailed=unresolved.length>0||detailDrifts.length>0||configDrifts.length>0;
      await deps.database.requirePool().query(`update restore_runs set state=$3,result=$4,updated_at=now() where restore_run_id=$1 and guild_id=$2`,[payload.restoreRunId,guild.id,verificationFailed?'FAILED':'SUCCEEDED',{preRestoreBackupId,warnings,unresolved:unresolved.map((item)=>({kind:item.kind,logicalKey:item.logicalKey})),detailDrifts,configDrifts}]);
      if(verificationFailed) throw new JobExecutionError(`Restore verification found ${unresolved.length} resource, ${detailDrifts.length} detail and ${configDrifts.length} config drift item(s)`,'RESTORE_VERIFY_DRIFT',false);
      await backupRepo.markRestoreVerified({guildId:guild.id,backupId:payload.backupId,restoreRunId:payload.restoreRunId,contentHash:backup.contentHash,hashAlgorithm:backup.hashAlgorithm,correlationId:job.correlationId,report:{unresolved:0,detailDrifts:0,configDrifts:0,warnings:warnings.length,completed}});
      await new ApprovalRepository(deps.database).markExecuted(guild.id,payload.approvalId);
      await deps.bus.publish(makeEvent({type:'restore.job.completed',guildId:guild.id,actorId:job.actorId,correlationId:job.correlationId,payload:{jobId:job.jobId,restoreRunId:payload.restoreRunId,backupId:payload.backupId,preRestoreBackupId,warnings,completed,backupVerification:'RESTORE_VERIFIED'}}));
      return {restoreRunId:payload.restoreRunId,backupId:payload.backupId,preRestoreBackupId,completed,warnings,destructiveDeletes:0};
    }catch(error){
      const compensation=await compensator.compensateJob(guild,job.jobId).catch(()=>[]);
      await deps.database.requirePool().query(`update restore_runs set state=case when $3 then 'CANCELLED' else 'ROLLED_BACK' end,result=$4,updated_at=now() where restore_run_id=$1 and guild_id=$2`,[payload.restoreRunId,guild.id,error instanceof JobCancelledError,{preRestoreBackupId,warnings,compensation,error:error instanceof Error?error.message:'unknown'}]).catch(()=>undefined);
      await deps.bus.publish(makeEvent({type:'restore.job.failed',guildId:guild.id,actorId:job.actorId,correlationId:job.correlationId,payload:{jobId:job.jobId,restoreRunId:payload.restoreRunId,preRestoreBackupId,compensation,errorCode:error instanceof JobExecutionError?error.code:error instanceof JobCancelledError?'CANCELLED':'RESTORE_ERROR'}})).catch(()=>undefined);
      throw error;
    }finally{ await locks.release(guild.id,'restore',owner); }
  };
}
