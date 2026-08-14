import { ChannelType, type Client, type GuildMember } from 'discord.js';
import { ResourceMappingRepository, type Database } from '@autoserver/database';
import type { EventBus } from '@autoserver/core';
import { makeEvent, newCorrelationId } from '@autoserver/core';
import { v2NoticePanel } from '@autoserver/panels';

export function bindMemberLifecycle(client: Client, deps: { database: Database; bus: EventBus }): void {
  client.on('guildMemberAdd', async (member) => {
    const correlationId = newCorrelationId();
    try {
      if (!deps.database.configured) {
        await deps.bus.publish(makeEvent({ type: 'member.join', guildId: member.guild.id, actorId: member.id, correlationId, payload: { durableAutomation: false } }));
        return;
      }
      const mappings = await new ResourceMappingRepository(deps.database).list(member.guild.id);
      const byKey = new Map(mappings.map((row) => [row.logicalKey, row.discordId]));
      const newMemberRole = byKey.get('ROLE_NEW_MEMBER');
      if (newMemberRole) await member.roles.add(newMemberRole, 'ออโต้เซิร์ฟเวอร์ · เริ่มต้นสมาชิกใหม่').catch(() => undefined);
      await deps.database.requirePool().query(
        `insert into member_onboarding(guild_id,user_id,stage,state,joined_at) values($1,$2,'NEW',$3,now())
         on conflict (guild_id,user_id) do update set stage=case when member_onboarding.stage='ACTIVE' then member_onboarding.stage else 'NEW' end, state=member_onboarding.state || excluded.state, updated_at=now()`,
        [member.guild.id, member.id, { source: 'guildMemberAdd' }],
      );
      const welcomeId = byKey.get('CH_WELCOME');
      if (welcomeId) {
        const channel = await member.guild.channels.fetch(welcomeId).catch(() => null);
        if (channel?.type === ChannelType.GuildText) {
          await channel.send({ ...v2NoticePanel({ title: 'ยินดีต้อนรับ', description: `<@${member.id}> โปรดใช้แผงเริ่มต้นใช้งานที่ระบบดูแลด้านบนเพื่อยืนยันสิทธิ์และเลือกการตั้งค่าของคุณ`, tone: 'primary' }), allowedMentions: { users: [member.id] } }).catch(() => undefined);
        }
      }
      await deps.bus.publish(makeEvent({ type: 'member.join', guildId: member.guild.id, actorId: member.id, correlationId, payload: { newMemberRoleAssigned: Boolean(newMemberRole), onboardingState: 'NEW' } }));
    } catch (error) {
      console.error('[member-join-error]', { guildId: member.guild.id, userId: member.id, correlationId, message: error instanceof Error ? error.message : 'unknown' });
    }
  });

  client.on('guildMemberRemove', async (member: GuildMember) => {
    await deps.bus.publish(makeEvent({ type: 'member.leave', guildId: member.guild.id, actorId: member.id, correlationId: newCorrelationId(), payload: { joinedAt: member.joinedAt?.toISOString() } })).catch(() => undefined);
  });
}
