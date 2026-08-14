import { randomUUID } from 'node:crypto';
import { sha256 } from '@autoserver/core';
import type { Database } from '@autoserver/database';

export type NotificationTopic = 'ANNOUNCEMENTS' | 'EVENTS' | 'NEWS' | 'LIVE' | 'UPDATES' | 'GAME_PATCHES' | 'LFG' | 'TOURNAMENTS' | 'SECURITY' | 'MAINTENANCE';
export interface NotificationPreferences {
  userId: string;
  topics: Partial<Record<NotificationTopic, boolean>>;
  quietHours?: { startHour: number; endHour: number; timezone: string };
}

export interface PersistedNotificationPreferences extends NotificationPreferences {
  guildId: string;
  locale?: string;
  timezone?: string;
}

export type NotificationDecision =
  | { state: 'DELIVER'; reason: 'OPTED_IN' }
  | { state: 'SKIP'; reason: 'OPTED_OUT' }
  | { state: 'DEFER'; reason: 'QUIET_HOURS'; retryAt: Date }
  | { state: 'SKIP'; reason: 'QUIET_HOURS_ALWAYS' };

export function wantsNotification(preferences: NotificationPreferences, topic: NotificationTopic): boolean {
  return preferences.topics[topic] === true;
}

export function isQuietHour(preferences: NotificationPreferences, localHour: number): boolean {
  const q = preferences.quietHours;
  if (!q) return false;
  if (q.startHour === q.endHour) return true;
  return q.startHour < q.endHour ? localHour >= q.startHour && localHour < q.endHour : localHour >= q.startHour || localHour < q.endHour;
}

function hourInTimezone(timezone: string, at: Date): number {
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour12: false, hour: '2-digit' }); }
  catch { throw new Error('INVALID_NOTIFICATION_TIMEZONE'); }
  const hour = Number(formatter.formatToParts(at).find((part) => part.type === 'hour')?.value);
  if (!Number.isInteger(hour)) throw new Error('INVALID_NOTIFICATION_LOCAL_HOUR');
  return hour === 24 ? 0 : hour;
}

export function nextAllowedNotificationTime(preferences: NotificationPreferences, after = new Date()): Date | null {
  if (!preferences.quietHours) return after;
  if (preferences.quietHours.startHour === preferences.quietHours.endHour) return null;
  const timezone = preferences.quietHours.timezone;
  if (!isQuietHour(preferences, hourInTimezone(timezone, after))) return after;
  const start = Math.ceil((after.getTime() + 60_000) / 60_000) * 60_000;
  for (let minute = 0; minute <= 48 * 60; minute += 1) {
    const candidate = new Date(start + minute * 60_000);
    if (!isQuietHour(preferences, hourInTimezone(timezone, candidate))) return candidate;
  }
  return null;
}

export function evaluateNotification(preferences: NotificationPreferences, topic: NotificationTopic, now = new Date()): NotificationDecision {
  if (!wantsNotification(preferences, topic)) return { state: 'SKIP', reason: 'OPTED_OUT' };
  const next = nextAllowedNotificationTime(preferences, now);
  if (!next) return { state: 'SKIP', reason: 'QUIET_HOURS_ALWAYS' };
  if (next.getTime() > now.getTime() + 30_000) return { state: 'DEFER', reason: 'QUIET_HOURS', retryAt: next };
  return { state: 'DELIVER', reason: 'OPTED_IN' };
}

export class NotificationRepository {
  constructor(private readonly database: Database) {}

  async get(guildId: string, userId: string): Promise<PersistedNotificationPreferences | null> {
    const { rows } = await this.database.requirePool().query<any>(
      `select guild_id,user_id,topics,quiet_hours,locale,timezone from notification_preferences where guild_id=$1 and user_id=$2`,
      [guildId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    const quiet = row.quiet_hours && typeof row.quiet_hours === 'object' ? row.quiet_hours as Record<string, unknown> : null;
    const quietHours = quiet && Number.isInteger(quiet.startHour) && Number.isInteger(quiet.endHour) && typeof quiet.timezone === 'string'
      ? { startHour: Number(quiet.startHour), endHour: Number(quiet.endHour), timezone: String(quiet.timezone) }
      : undefined;
    return { guildId: row.guild_id, userId: row.user_id, topics: row.topics ?? {}, quietHours, locale: row.locale ?? undefined, timezone: row.timezone ?? undefined };
  }

  async listSubscribers(guildId: string, topic: NotificationTopic, afterUserId = '', limit = 100): Promise<PersistedNotificationPreferences[]> {
    const safeLimit = Math.max(1, Math.min(250, limit));
    const { rows } = await this.database.requirePool().query<any>(
      `select guild_id,user_id,topics,quiet_hours,locale,timezone
       from notification_preferences
       where guild_id=$1 and user_id>$2 and coalesce(topics->>$3,'false')='true'
       order by user_id asc limit $4`,
      [guildId, afterUserId, topic, safeLimit],
    );
    return rows.map((row: any) => {
      const quiet = row.quiet_hours && typeof row.quiet_hours === 'object' ? row.quiet_hours as Record<string, unknown> : null;
      const quietHours = quiet && Number.isInteger(quiet.startHour) && Number.isInteger(quiet.endHour) && typeof quiet.timezone === 'string'
        ? { startHour: Number(quiet.startHour), endHour: Number(quiet.endHour), timezone: String(quiet.timezone) }
        : undefined;
      return { guildId: row.guild_id, userId: row.user_id, topics: row.topics ?? {}, quietHours, locale: row.locale ?? undefined, timezone: row.timezone ?? undefined };
    });
  }

  async deliveryState(guildId: string, dedupKey: string): Promise<'QUEUED' | 'DEFERRED' | 'DELIVERED' | 'SKIPPED' | 'FAILED' | null> {
    const { rows } = await this.database.requirePool().query<{state:'QUEUED'|'DEFERRED'|'DELIVERED'|'SKIPPED'|'FAILED'}>(
      `select state from notification_deliveries where guild_id=$1 and dedup_key=$2`,
      [guildId,dedupKey],
    );
    return rows[0]?.state ?? null;
  }

  async record(input: {
    guildId: string;
    userId: string;
    topic: NotificationTopic;
    dedupKey: string;
    state: 'QUEUED' | 'DEFERRED' | 'DELIVERED' | 'SKIPPED' | 'FAILED';
    payload: Record<string, unknown>;
    correlationId: string;
    reason?: string;
    messageId?: string;
    attempts?: number;
  }): Promise<string> {
    const deliveryId = randomUUID();
    const payloadHash = sha256(JSON.stringify(input.payload));
    const { rows } = await this.database.requirePool().query<{delivery_id:string}>(
      `insert into notification_deliveries(delivery_id,guild_id,user_id,topic,dedup_key,state,channel,payload_hash,message_id,reason,attempts,correlation_id,delivered_at)
       values($1,$2,$3,$4,$5,$6,'DM',$7,$8,$9,$10,$11,case when $6='DELIVERED' then now() else null end)
       on conflict(guild_id,dedup_key) do update set state=case when notification_deliveries.state in ('DELIVERED','SKIPPED','FAILED') then notification_deliveries.state else excluded.state end,message_id=coalesce(notification_deliveries.message_id,excluded.message_id),reason=case when notification_deliveries.state in ('DELIVERED','SKIPPED','FAILED') then notification_deliveries.reason else excluded.reason end,attempts=greatest(notification_deliveries.attempts,excluded.attempts),updated_at=now(),delivered_at=case when notification_deliveries.state='DELIVERED' then notification_deliveries.delivered_at when excluded.state='DELIVERED' then now() else notification_deliveries.delivered_at end
       returning delivery_id`,
      [deliveryId,input.guildId,input.userId,input.topic,input.dedupKey,input.state,payloadHash,input.messageId ?? null,input.reason ?? null,input.attempts ?? 0,input.correlationId],
    );
    return rows[0]!.delivery_id;
  }
}
