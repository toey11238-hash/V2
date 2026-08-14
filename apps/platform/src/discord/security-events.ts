import { ChannelType, type Client } from 'discord.js';
import { randomUUID } from 'node:crypto';
import { ResourceMappingRepository, type Database } from '@autoserver/database';
import { securityResponseForScore } from '@autoserver/moderation';
import { v2NoticePanel } from '@autoserver/panels';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';

type StructuralEvent = 'channelCreate' | 'channelDelete' | 'roleCreate' | 'roleDelete';

interface DetectorRule {
  threshold: number;
  criticalAt: number;
  windowSeconds: number;
  alertType: string;
}

const RULES: Record<StructuralEvent, DetectorRule> = {
  channelCreate: { threshold: 6, criticalAt: 15, windowSeconds: 30, alertType: 'MASS_CHANNEL_CREATE' },
  channelDelete: { threshold: 3, criticalAt: 8, windowSeconds: 30, alertType: 'MASS_CHANNEL_DELETE' },
  roleCreate: { threshold: 6, criticalAt: 15, windowSeconds: 30, alertType: 'MASS_ROLE_CREATE' },
  roleDelete: { threshold: 3, criticalAt: 8, windowSeconds: 30, alertType: 'MASS_ROLE_DELETE' },
};

function severity(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (score >= 0.9) return 'CRITICAL';
  if (score >= 0.65) return 'HIGH';
  if (score >= 0.35) return 'MEDIUM';
  return 'LOW';
}

export function bindStructuralSecurityDetector(client: Client, deps: { database: Database; bus: EventBus }): void {
  if (!deps.database.configured) return;
  for (const eventName of Object.keys(RULES) as StructuralEvent[]) {
    client.on(eventName, async (entity: any) => {
      const guild = entity.guild;
      if (!guild) return;
      const rule = RULES[eventName];
      const pool = deps.database.requirePool();
      const observationId = randomUUID();
      const correlationId = newCorrelationId();
      try {
        await pool.query(
          `insert into security_observations(observation_id,guild_id,event_type,resource_id,resource_name,evidence)
           values($1,$2,$3,$4,$5,$6)`,
          [observationId, guild.id, eventName, entity.id ?? null, entity.name ?? null, { source: 'discord_gateway' }],
        );
        const countResult = await pool.query<{ count: string }>(
          `select count(*)::text as count from security_observations where guild_id=$1 and event_type=$2 and occurred_at >= now() - ($3::text || ' seconds')::interval`,
          [guild.id, eventName, rule.windowSeconds],
        );
        const count = Number(countResult.rows[0]?.count ?? 0);
        if (count < rule.threshold) return;
        const score = Math.min(1, count / rule.criticalAt);
        const responseTier = securityResponseForScore(score);
        const alertSeverity = severity(score);
        const existing = await pool.query<{ alert_id: string }>(
          `select alert_id from security_alerts where guild_id=$1 and alert_type=$2 and status='OPEN' and created_at >= now() - interval '60 seconds' order by created_at desc limit 1`,
          [guild.id, rule.alertType],
        );
        const alertId = existing.rows[0]?.alert_id ?? randomUUID();
        if (existing.rows[0]) {
          await pool.query(
            `update security_alerts set severity=$3,confidence=$4,response_tier=$5,evidence=evidence || $6::jsonb where alert_id=$1 and guild_id=$2`,
            [alertId, guild.id, alertSeverity, score, responseTier, { count, windowSeconds: rule.windowSeconds, latestResourceId: entity.id, latestResourceName: entity.name ?? null }],
          );
        } else {
          await pool.query(
            `insert into security_alerts(alert_id,guild_id,alert_type,severity,status,confidence,evidence,response_tier,correlation_id)
             values($1,$2,$3,$4,'OPEN',$5,$6,$7,$8)`,
            [alertId, guild.id, rule.alertType, alertSeverity, score, { count, windowSeconds: rule.windowSeconds, eventType: eventName, latestResourceId: entity.id, latestResourceName: entity.name ?? null }, responseTier, correlationId],
          );
        }
        await deps.bus.publish(makeEvent({ type: 'security.alert', guildId: guild.id, correlationId, payload: { alertId, alertType: rule.alertType, severity: alertSeverity, confidence: score, responseTier, count, windowSeconds: rule.windowSeconds, automaticPunishment: false } }));

        if (alertSeverity === 'HIGH' || alertSeverity === 'CRITICAL') {
          const mappings = await new ResourceMappingRepository(deps.database).list(guild.id);
          const channelId = mappings.find((row) => row.logicalKey === 'CH_STAFF_ALERTS')?.discordId;
          if (channelId) {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (channel && (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)) {
              await channel.send({
                ...v2NoticePanel({ title: `${alertSeverity} · ${rule.alertType}`, description: `${count} เหตุการณ์ประเภท ${eventName} ถูกตรวจพบภายใน ${rule.windowSeconds} วินาที\nระดับการตอบสนอง: **${responseTier}**\nการลงโทษอัตโนมัติ: **ปิดใช้งาน**; ต้องให้ทีมงานตรวจสอบ\n\n-# การแจ้งเตือนความปลอดภัย ${alertId}`, tone: 'danger' }),
                allowedMentions: { parse: [] },
              }).catch(() => undefined);
            }
          }
        }
      } catch (error) {
        console.error('[security-detector-error]', { guildId: guild.id, eventName, message: error instanceof Error ? error.message : 'unknown' });
      }
    });
  }
}
