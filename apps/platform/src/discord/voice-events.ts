import { ChannelType, PermissionFlagsBits, type Client, type VoiceState } from 'discord.js';
import { ResourceMappingRepository, type Database } from '@autoserver/database';
import { ScheduledTaskRepository } from '@autoserver/scheduler';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';

export interface VoiceLifecycleDependencies { database: Database; bus: EventBus; }

const CREATOR_KEYS = new Set(['VC_JOIN_CREATE', 'VC_PARTY_CREATE']);
const EMPTY_GRACE_MS = 120_000;

function safeVoiceName(displayName: string): string {
  const clean = displayName.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 72) || 'Member';
  return `${clean} · private voice`.slice(0, 100);
}

async function mappingKeyForChannel(database: Database, guildId: string, channelId: string): Promise<string | undefined> {
  const mappings = await new ResourceMappingRepository(database).list(guildId);
  return mappings.find((row) => row.discordId === channelId)?.logicalKey;
}

async function markOccupied(database: Database, guildId: string, channelId: string): Promise<void> {
  await database.requirePool().query(
    `update temporary_voice_rooms set state='ACTIVE',empty_since=null,updated_at=now() where guild_id=$1 and channel_id=$2`,
    [guildId, channelId],
  );
}

async function markEmptyAndSchedule(database: Database, guildId: string, channelId: string): Promise<void> {
  const result = await database.requirePool().query(
    `update temporary_voice_rooms set state='EMPTY_GRACE',empty_since=now(),updated_at=now()
     where guild_id=$1 and channel_id=$2 and state <> 'DELETED' returning channel_id`,
    [guildId, channelId],
  );
  if (!result.rowCount) return;
  await new ScheduledTaskRepository(database).schedule({
    guildId,
    taskType: 'TEMP_VOICE_CLEANUP',
    runAt: new Date(Date.now() + EMPTY_GRACE_MS),
    timezone: 'UTC',
    dedupKey: `temporary-voice:${channelId}`,
    payload: { channelId },
  });
}

async function createTemporaryVoice(state: VoiceState, deps: VoiceLifecycleDependencies): Promise<void> {
  if (!state.channel || state.channel.type !== ChannelType.GuildVoice || !state.member) return;
  const guild = state.guild;
  const source = state.channel;
  const key = await mappingKeyForChannel(deps.database, guild.id, source.id);
  if (!key || !CREATOR_KEYS.has(key)) return;

  const existing = await deps.database.requirePool().query<{ channel_id: string }>(
    `select channel_id from temporary_voice_rooms where guild_id=$1 and owner_user_id=$2 and state in ('ACTIVE','EMPTY_GRACE') order by created_at desc limit 1`,
    [guild.id, state.member.id],
  );
  if (existing.rows[0]) {
    const current = await guild.channels.fetch(existing.rows[0].channel_id).catch(() => null);
    if (current?.type === ChannelType.GuildVoice) {
      await state.member.voice.setChannel(current, 'Reuse existing managed temporary voice').catch(() => undefined);
      return;
    }
    await deps.database.requirePool().query(`delete from temporary_voice_rooms where guild_id=$1 and channel_id=$2`, [guild.id, existing.rows[0].channel_id]);
  }

  const channel = await guild.channels.create({
    name: safeVoiceName(state.member.displayName),
    type: ChannelType.GuildVoice,
    parent: source.parentId ?? undefined,
    userLimit: 10,
    bitrate: Math.min(source.bitrate || 64000, guild.maximumBitrate ?? (source.bitrate || 64000)),
    permissionOverwrites: [
      { id: state.member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.ManageChannels] },
    ],
    reason: `ออโต้เซิร์ฟเวอร์ · ห้องเสียงชั่วคราวสำหรับ ${state.member.id}`,
  });

  try {
    await deps.database.requirePool().query(
      `insert into temporary_voice_rooms(guild_id,channel_id,owner_user_id,source_channel_id,state,config)
       values($1,$2,$3,$4,'ACTIVE',$5)`,
      [guild.id, channel.id, state.member.id, source.id, { sourceKey: key, userLimit: 10, emptyGraceMs: EMPTY_GRACE_MS }],
    );
    await state.member.voice.setChannel(channel, 'ออโต้เซิร์ฟเวอร์ · สร้างห้องเสียงชั่วคราวแล้ว');
    await deps.bus.publish(makeEvent({ type: 'voice.temporary.created', guildId: guild.id, correlationId: newCorrelationId(), payload: { channelId: channel.id, ownerUserId: state.member.id, sourceKey: key } }));
  } catch (error) {
    await channel.delete('Rollback unmanaged temporary voice').catch(() => undefined);
    throw error;
  }
}

async function reconcileTemporaryRoom(state: VoiceState, deps: VoiceLifecycleDependencies): Promise<void> {
  if (!state.channelId) return;
  const row = await deps.database.requirePool().query<{ state: string }>(
    `select state from temporary_voice_rooms where guild_id=$1 and channel_id=$2`,
    [state.guild.id, state.channelId],
  );
  if (!row.rows[0]) return;
  const channel = state.channel ?? await state.guild.channels.fetch(state.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await deps.database.requirePool().query(`delete from temporary_voice_rooms where guild_id=$1 and channel_id=$2`, [state.guild.id, state.channelId]);
    return;
  }
  if (channel.members.size > 0) await markOccupied(deps.database, state.guild.id, channel.id);
  else await markEmptyAndSchedule(deps.database, state.guild.id, channel.id);
}

export function bindVoiceLifecycle(client: Client, deps: VoiceLifecycleDependencies): void {
  if (!deps.database.configured) return;
  client.on('voiceStateUpdate', async (oldState, newState) => {
    try {
      if (oldState.channelId && oldState.channelId !== newState.channelId) await reconcileTemporaryRoom(oldState, deps);
      if (newState.channelId) {
        await reconcileTemporaryRoom(newState, deps);
        await createTemporaryVoice(newState, deps);
      }
    } catch (error) {
      console.error('[temporary-voice-lifecycle-error]', { guildId: newState.guild.id, userId: newState.id, message: error instanceof Error ? error.message : 'unknown' });
      await deps.bus.publish(makeEvent({ type: 'voice.temporary.failed', guildId: newState.guild.id, correlationId: newCorrelationId(), payload: { userId: newState.id, error: error instanceof Error ? error.message : 'unknown' } })).catch(() => undefined);
    }
  });
}
