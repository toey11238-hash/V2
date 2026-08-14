import type { Database } from '@autoserver/database';

export type ForumThreadState = 'OPEN' | 'ARCHIVED' | 'LOCKED' | 'DELETED';

export interface ManagedForumThread {
  guildId: string;
  threadId: string;
  forumChannelId: string;
  forumLogicalKey?: string;
  ownerUserId?: string;
  titleSnapshot: string;
  appliedTagIds: string[];
  state: ForumThreadState;
  autoArchiveMinutes?: number;
  lastActivityAt: string;
}

export interface ForumTagBlueprint { name: string; moderated?: boolean; emojiName?: string; }
export interface ForumBlueprintConfig {
  defaultAutoArchiveMinutes: 60 | 1440 | 4320 | 10080;
  defaultThreadSlowmodeSeconds: number;
  tags: ForumTagBlueprint[];
}

export function normalizeForumConfig(input?: Partial<ForumBlueprintConfig>): ForumBlueprintConfig {
  const autoArchive = [60,1440,4320,10080].includes(Number(input?.defaultAutoArchiveMinutes))
    ? Number(input!.defaultAutoArchiveMinutes) as ForumBlueprintConfig['defaultAutoArchiveMinutes']
    : 1440;
  const slowmode = Math.max(0, Math.min(21600, Math.floor(Number(input?.defaultThreadSlowmodeSeconds ?? 0))));
  const seen = new Set<string>();
  const tags = (input?.tags ?? []).flatMap((tag) => {
    const name = String(tag.name ?? '').trim().slice(0,20);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key) || seen.size >= 20) return [];
    seen.add(key);
    return [{ name, moderated: Boolean(tag.moderated), emojiName: typeof tag.emojiName === 'string' ? tag.emojiName.slice(0,32) : undefined }];
  });
  return { defaultAutoArchiveMinutes: autoArchive, defaultThreadSlowmodeSeconds: slowmode, tags };
}

export class ForumThreadRepository {
  constructor(private readonly database: Database) {}

  async upsert(thread: ManagedForumThread): Promise<void> {
    await this.database.requirePool().query(
      `insert into managed_forum_threads(guild_id,thread_id,forum_channel_id,forum_logical_key,owner_user_id,title_snapshot,applied_tag_ids,state,auto_archive_minutes,last_activity_at)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       on conflict(guild_id,thread_id) do update set forum_channel_id=excluded.forum_channel_id,forum_logical_key=coalesce(excluded.forum_logical_key,managed_forum_threads.forum_logical_key),owner_user_id=coalesce(excluded.owner_user_id,managed_forum_threads.owner_user_id),title_snapshot=excluded.title_snapshot,applied_tag_ids=excluded.applied_tag_ids,state=excluded.state,auto_archive_minutes=excluded.auto_archive_minutes,last_activity_at=excluded.last_activity_at,updated_at=now()`,
      [thread.guildId,thread.threadId,thread.forumChannelId,thread.forumLogicalKey ?? null,thread.ownerUserId ?? null,thread.titleSnapshot,thread.appliedTagIds,thread.state,thread.autoArchiveMinutes ?? null,new Date(thread.lastActivityAt)],
    );
  }

  async markDeleted(guildId: string, threadId: string): Promise<void> {
    await this.database.requirePool().query(
      `update managed_forum_threads set state='DELETED',updated_at=now(),last_activity_at=now() where guild_id=$1 and thread_id=$2`,
      [guildId,threadId],
    );
  }

  async list(guildId: string, forumChannelId?: string, limit = 100): Promise<ManagedForumThread[]> {
    const safeLimit=Math.max(1,Math.min(250,limit));
    const values:unknown[]=[guildId];
    let where='guild_id=$1';
    if(forumChannelId){values.push(forumChannelId);where+=' and forum_channel_id=$2';}
    values.push(safeLimit);
    const limitParam=`$${values.length}`;
    const {rows}=await this.database.requirePool().query<any>(
      `select * from managed_forum_threads where ${where} order by updated_at desc limit ${limitParam}`,
      values,
    );
    return rows.map((row:any)=>({guildId:row.guild_id,threadId:row.thread_id,forumChannelId:row.forum_channel_id,forumLogicalKey:row.forum_logical_key ?? undefined,ownerUserId:row.owner_user_id ?? undefined,titleSnapshot:row.title_snapshot,appliedTagIds:row.applied_tag_ids ?? [],state:row.state,autoArchiveMinutes:row.auto_archive_minutes ?? undefined,lastActivityAt:(row.last_activity_at instanceof Date?row.last_activity_at:new Date(row.last_activity_at)).toISOString()}));
  }
}
