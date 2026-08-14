import { ChannelType, type Client, type ThreadChannel } from 'discord.js';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';
import { ResourceMappingRepository, type Database } from '@autoserver/database';
import { ForumThreadRepository, type ForumThreadState } from '@autoserver/forums';

export interface ForumLifecycleDependencies { database: Database; bus: EventBus; }

function stateFor(thread: ThreadChannel): ForumThreadState {
  if (thread.locked) return 'LOCKED';
  if (thread.archived) return 'ARCHIVED';
  return 'OPEN';
}

async function persistThread(thread: ThreadChannel, deps: ForumLifecycleDependencies, eventType: string): Promise<void> {
  if (!deps.database.configured || !thread.guild) return;
  const parent = thread.parent;
  if (!parent || parent.type !== ChannelType.GuildForum) return;
  const mappings = await new ResourceMappingRepository(deps.database).list(thread.guild.id);
  const forumLogicalKey = mappings.find((mapping) => mapping.discordId === parent.id)?.logicalKey;
  const repo = new ForumThreadRepository(deps.database);
  await repo.upsert({
    guildId: thread.guild.id,
    threadId: thread.id,
    forumChannelId: parent.id,
    forumLogicalKey,
    ownerUserId: thread.ownerId ?? undefined,
    titleSnapshot: thread.name,
    appliedTagIds: [...thread.appliedTags],
    state: stateFor(thread),
    autoArchiveMinutes: thread.autoArchiveDuration ?? undefined,
    lastActivityAt: new Date().toISOString(),
  });
  await deps.bus.publish(makeEvent({
    type: `forum.thread.${eventType}`,
    guildId: thread.guild.id,
    actorId: thread.ownerId ?? undefined,
    correlationId: newCorrelationId(),
    payload: { threadId: thread.id, forumChannelId: parent.id, forumLogicalKey, state: stateFor(thread), appliedTagIds: [...thread.appliedTags] },
  }));
}

export function bindForumLifecycle(client: Client, deps: ForumLifecycleDependencies): void {
  client.on('threadCreate', (thread) => { void persistThread(thread, deps, 'created').catch((error) => console.error('[forum-thread-create]', error)); });
  client.on('threadUpdate', (_before, after) => { void persistThread(after, deps, 'updated').catch((error) => console.error('[forum-thread-update]', error)); });
  client.on('threadDelete', (thread) => {
    if (!deps.database.configured) return;
    const guildId = thread.guild.id;
    void (async () => {
      const parent = thread.parent;
      if (!parent || parent.type !== ChannelType.GuildForum) return;
      await new ForumThreadRepository(deps.database).markDeleted(guildId, thread.id);
      await deps.bus.publish(makeEvent({ type:'forum.thread.deleted', guildId, actorId:thread.ownerId ?? undefined, correlationId:newCorrelationId(), payload:{ threadId:thread.id, forumChannelId:parent.id } }));
    })().catch((error) => console.error('[forum-thread-delete]', error));
  });
}
