import { OverwriteType, type Client, type Guild } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { makeEvent, type EventBus } from '@autoserver/core';
import {
  ApprovalRepository,
  GuildConfigRepository,
  GuildLockRepository,
  MutationJournalRepository,
  ResourceMappingRepository,
  type Database,
} from '@autoserver/database';
import type { JobRecord, JobRepository } from '@autoserver/jobs';
import { JobCancelledError, JobExecutionError } from '@autoserver/jobs';
import { blueprintForEnabledModules } from '@autoserver/control-center';
import { buildVisibilityOverwrites, normalizePermissionOverwrites, type PermissionOverwriteSnapshot } from '@autoserver/permissions';
import { permissionRepairDriftHash, scanDiscordPermissionDrift } from '@autoserver/repair';
import { resolveGuildBlueprint } from './blueprint-resolver.js';

export interface PermissionRepairWorkerDependencies {
  client: Client;
  database: Database;
  jobs: JobRepository;
  bus: EventBus;
}

function overwritesFromSnapshots(guild: Guild, snapshots: readonly PermissionOverwriteSnapshot[]) {
  return snapshots.map((item)=>({
    id:item.id,
    type:item.id===guild.id || guild.roles.cache.has(item.id) ? OverwriteType.Role : OverwriteType.Member,
    allow:BigInt(item.allow),
    deny:BigInt(item.deny),
  }));
}

function sameSnapshots(a: readonly PermissionOverwriteSnapshot[], b: readonly PermissionOverwriteSnapshot[]): boolean {
  return JSON.stringify(normalizePermissionOverwrites(a))===JSON.stringify(normalizePermissionOverwrites(b));
}

async function currentManagedState(guild: Guild, database: Database) {
  const config=await new GuildConfigRepository(database).get(guild.id);
  if(!config) throw new JobExecutionError('Guild configuration is missing','GUILD_CONFIGURATION_NOT_FOUND',false);
  const enabled=Object.entries(config.enabledModules).filter(([,value])=>value).map(([key])=>key);
  const blueprint=blueprintForEnabledModules(await resolveGuildBlueprint(database,guild.id,config.templateKey),enabled);
  const mappings=await new ResourceMappingRepository(database).list(guild.id);
  const drifts=await scanDiscordPermissionDrift({guild,blueprint,mappings});
  const repairable=drifts.filter((item)=>item.ownership!=='USER_OWNED'&&item.ownership!=='LOCKED');
  return {config,blueprint,mappings,drifts,repairable};
}

async function compensatePermissions(guild: Guild, database: Database, jobId: string) {
  const journal=new MutationJournalRepository(database);
  const records=await journal.listAppliedReverse(jobId);
  const results:Array<{logicalKey:string;status:string;reason:string}>=[];
  for(const record of records.filter((item)=>item.action==='PERMISSION_UPDATE')) {
    const channel=record.discordId ? guild.channels.cache.get(record.discordId) : undefined;
    if(!channel||!('permissionOverwrites' in channel)) { await journal.markState(record.mutationId,'SKIPPED'); results.push({logicalKey:record.logicalKey,status:'SKIPPED',reason:'Channel missing'}); continue; }
    const before=Array.isArray(record.beforeState?.overwrites) ? record.beforeState!.overwrites as PermissionOverwriteSnapshot[] : [];
    const after=Array.isArray(record.afterState?.overwrites) ? record.afterState!.overwrites as PermissionOverwriteSnapshot[] : [];
    const current=normalizePermissionOverwrites(channel.permissionOverwrites.cache.values());
    if(!sameSnapshots(current,after)) { await journal.markState(record.mutationId,'SKIPPED'); results.push({logicalKey:record.logicalKey,status:'SKIPPED',reason:'Permissions changed after job write; preserving newer state'}); continue; }
    try {
      await journal.markState(record.mutationId,'COMPENSATING');
      await channel.permissionOverwrites.set(overwritesFromSnapshots(guild,before),`ออโต้เซิร์ฟเวอร์ · ย้อนคืนการซ่อมสิทธิ์ ${record.logicalKey}`);
      await journal.markState(record.mutationId,'COMPENSATED'); results.push({logicalKey:record.logicalKey,status:'COMPENSATED',reason:'Exact pre-job overwrites restored'});
    } catch(error) {
      await journal.markState(record.mutationId,'FAILED','PERMISSION_COMPENSATION_FAILED').catch(()=>undefined);
      results.push({logicalKey:record.logicalKey,status:'FAILED',reason:error instanceof Error?error.message:'rollback failed'});
    }
  }
  return results;
}

export function createPermissionRepairJobHandler(deps: PermissionRepairWorkerDependencies) {
  const locks=new GuildLockRepository(deps.database);
  const journal=new MutationJournalRepository(deps.database);
  return async(job:JobRecord):Promise<unknown>=>{
    if(!job.guildId) throw new JobExecutionError('Permission repair requires guild scope','REPAIR_GUILD_REQUIRED',false);
    const payload=job.payload as {approvalId?:string;driftHash?:string};
    if(!payload.approvalId||!payload.driftHash) throw new JobExecutionError('Permission repair payload is incomplete','REPAIR_PAYLOAD_INVALID',false);
    const approval=await new ApprovalRepository(deps.database).get(job.guildId,payload.approvalId);
    if(!approval||approval.operationKey!=='PERMISSION_REPAIR'||approval.state!=='APPROVED') throw new JobExecutionError('Approved permission repair request is required','REPAIR_APPROVAL_REQUIRED',false);
    const guild=await deps.client.guilds.fetch(job.guildId); await Promise.all([guild.roles.fetch(),guild.channels.fetch()]);
    const state=await currentManagedState(guild,deps.database);
    if(permissionRepairDriftHash(state.repairable)!==payload.driftHash) throw new JobExecutionError('Permission drift changed after approval; create a fresh repair request','REPAIR_APPROVAL_STALE',false);
    const owner=`permission-repair:${job.jobId}`;
    if(!await locks.acquire({guildId:guild.id,lockKey:'repair:permissions',ownerId:owner,correlationId:job.correlationId,ttlSeconds:180})) throw new JobExecutionError('Permission repair lock is busy','REPAIR_LOCK_BUSY',true,3000);
    let completed=0;
    try {
      const mappingsByKey=new Map(state.mappings.map((item)=>[item.logicalKey,item]));
      const desiredByKey=new Map(state.blueprint.resources.map((item)=>[item.logicalKey,item]));
      const roleId=(key:string)=>mappingsByKey.get(key)?.discordId;
      for(const [sequenceNo,drift] of state.repairable.entries()) {
        if(await deps.jobs.isCancelled(job.jobId)) throw new JobCancelledError();
        if(!await locks.renew(guild.id,'repair:permissions',owner,180)) throw new JobExecutionError('Permission repair lock was lost','REPAIR_LOCK_LOST',true,3000);
        const mapping=mappingsByKey.get(drift.logicalKey); const desired=desiredByKey.get(drift.logicalKey);
        if(!mapping||!desired||desired.kind==='ROLE') continue;
        const channel=guild.channels.cache.get(mapping.discordId);
        if(!channel||!('permissionOverwrites' in channel)) continue;
        const before=normalizePermissionOverwrites(channel.permissionOverwrites.cache.values());
        const expected=buildVisibilityOverwrites({
          everyoneId:guild.id,botUserId:guild.client.user?.id,profile:desired.visibility??'PUBLIC',roles:{
            member:roleId('ROLE_MEMBER'),newMember:roleId('ROLE_NEW_MEMBER'),serverManager:roleId('ROLE_SERVER_MANAGER'),moderator:roleId('ROLE_MODERATOR'),support:roleId('ROLE_SUPPORT'),eventParticipant:roleId('ROLE_EVENT_PARTICIPANT'),
          },
        });
        const after=normalizePermissionOverwrites(expected as Iterable<{id:string;allow?:unknown;deny?:unknown}>);
        const mutationId=randomUUID();
        await journal.prepare({mutationId,jobId:job.jobId,guildId:guild.id,sequenceNo,action:'PERMISSION_UPDATE',resourceKind:mapping.resourceKind,logicalKey:drift.logicalKey,discordId:mapping.discordId,beforeState:{overwrites:before},afterState:{overwrites:after},compensator:{policy:'EXACT_OVERWRITE_MATCH_ONLY'},correlationId:job.correlationId});
        await channel.permissionOverwrites.set(expected,`ออโต้เซิร์ฟเวอร์ · ซ่อมสิทธิ์ที่อนุมัติแล้ว ${drift.logicalKey}`);
        await journal.markApplied(mutationId,mapping.discordId,{overwrites:after});
        completed+=1; await deps.jobs.progress(job.jobId,`permissions:${drift.logicalKey}`,completed);
      }
      const verification=await currentManagedState(guild,deps.database);
      const remaining=verification.repairable;
      if(remaining.length) throw new JobExecutionError(`Permission repair verification found ${remaining.length} remaining drift item(s)`,'REPAIR_VERIFY_DRIFT',false);
      await new ApprovalRepository(deps.database).markExecuted(guild.id,payload.approvalId);
      await deps.bus.publish(makeEvent({type:'repair.permissions.completed',guildId:guild.id,actorId:job.actorId,correlationId:job.correlationId,payload:{jobId:job.jobId,completed,protectedDrift:verification.drifts.length-verification.repairable.length}}));
      return {completed,protectedDrift:verification.drifts.length-verification.repairable.length};
    } catch(error) {
      const compensation=await compensatePermissions(guild,deps.database,job.jobId).catch(()=>[]);
      await deps.bus.publish(makeEvent({type:'repair.permissions.failed',guildId:guild.id,actorId:job.actorId,correlationId:job.correlationId,payload:{jobId:job.jobId,errorCode:error instanceof JobExecutionError?error.code:error instanceof JobCancelledError?'CANCELLED':'REPAIR_ERROR',compensation}})).catch(()=>undefined);
      throw error;
    } finally { await locks.release(guild.id,'repair:permissions',owner); }
  };
}
