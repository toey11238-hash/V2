import { ChannelType, type Guild } from 'discord.js';
import { ResourceMappingRepository, type Database } from '@autoserver/database';
import { GuildBackupService, type BackupKind, type BackupResourceState } from '@autoserver/backups';

export async function snapshotManagedDiscordResourceDetails(input: { guild: Guild; database: Database }): Promise<Record<string, Partial<BackupResourceState>>> {
  await Promise.all([input.guild.roles.fetch(), input.guild.channels.fetch()]);
  const mappings = await new ResourceMappingRepository(input.database).list(input.guild.id);
  const logicalByDiscordId = new Map(mappings.map((mapping) => [mapping.discordId, mapping.logicalKey]));
  const details: Record<string, Partial<BackupResourceState>> = {};

  for (const mapping of mappings) {
    if (mapping.resourceKind === 'ROLE') {
      const role = input.guild.roles.cache.get(mapping.discordId);
      if (!role) continue;
      details[mapping.logicalKey] = {
        rolePermissions: role.permissions.bitfield.toString(),
        roleColor: role.color,
        roleHoist: role.hoist,
        roleMentionable: role.mentionable,
        rolePosition: role.position,
      };
      continue;
    }

    const channel = input.guild.channels.cache.get(mapping.discordId);
    if (!channel) continue;
    const parentId = 'parentId' in channel ? channel.parentId : null;
    const permissionOverwrites = 'permissionOverwrites' in channel
      ? [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
          target: overwrite.id === input.guild.id ? '@everyone' : (logicalByDiscordId.get(overwrite.id) ?? overwrite.id),
          targetKind: overwrite.id === input.guild.id ? 'EVERYONE' as const : overwrite.type === 0 ? 'ROLE' as const : 'MEMBER' as const,
          allow: overwrite.allow.bitfield.toString(),
          deny: overwrite.deny.bitfield.toString(),
        }))
      : [];
    const detail: Partial<BackupResourceState> = {
      parentLogicalKey: parentId ? logicalByDiscordId.get(parentId) : undefined,
      channelType: ChannelType[channel.type] ?? String(channel.type),
      permissionOverwrites,
    };
    if ('topic' in channel && (typeof channel.topic === 'string' || channel.topic === null)) detail.topic = channel.topic ?? undefined;
    if ('nsfw' in channel && typeof channel.nsfw === 'boolean') detail.nsfw = channel.nsfw;
    if ('rateLimitPerUser' in channel && typeof channel.rateLimitPerUser === 'number') detail.rateLimitPerUser = channel.rateLimitPerUser;
    if ('bitrate' in channel && typeof channel.bitrate === 'number') detail.bitrate = channel.bitrate;
    if ('userLimit' in channel && typeof channel.userLimit === 'number') detail.userLimit = channel.userLimit;
    if (channel.type === ChannelType.GuildForum) {
      detail.forumDefaultAutoArchiveDuration = channel.defaultAutoArchiveDuration ?? undefined;
      detail.forumDefaultThreadRateLimitPerUser = channel.defaultThreadRateLimitPerUser ?? undefined;
      detail.forumAvailableTags = channel.availableTags.map((tag) => ({ name: tag.name, moderated: tag.moderated }));
    }
    details[mapping.logicalKey] = detail;
  }
  return details;
}

export async function captureManagedDiscordBackup(input: {
  guild: Guild;
  database: Database;
  kind: BackupKind;
  createdBy?: string;
}) {
  const details = await snapshotManagedDiscordResourceDetails(input);

  return new GuildBackupService(input.database).captureWithId({
    guildId: input.guild.id,
    kind: input.kind,
    createdBy: input.createdBy,
    sourceGuildName: input.guild.name,
    resourceDetails: details,
  });
}
