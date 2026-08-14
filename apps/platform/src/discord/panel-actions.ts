import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { AuditRepository, ResourceMappingRepository, type Database } from '@autoserver/database';
import { TicketRepository } from '@autoserver/tickets';
import { v2EditNoticePanel, v2NoticePanel } from '@autoserver/panels';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';
import { resolveLocale, t } from '@autoserver/localization';
import { CommunityWorkflowRepository } from '@autoserver/workflows';
import { handleGamingButton, handleGamingModal } from './gaming-actions.js';
import { handleWorkflowButton, handleWorkflowModal } from './workflow-actions.js';
import { handleModerationButton, handleModerationModal } from './moderation-actions.js';
import { handleRecoveryButton, handleRecoveryModal } from './recovery-actions.js';
import { handleTicketButton, ticketControls } from './ticket-actions.js';
import { handleDomainButton, handleDomainModal } from './domain-actions.js';
import { handleOperatorButton, handleOperatorModal } from './operator-actions.js';
import type { JobRepository } from '@autoserver/jobs';
import { handleGiveawayButton, handleGiveawayModal } from './giveaway-actions.js';
import { handleFabricButton, handleFabricModal } from './fabric-actions.js';

export interface PanelActionDependencies { database: Database; dashboardUrl?: string; jobs?: JobRepository | null; bus?: EventBus; }

async function mappedIds(database: Database, guildId: string) {
  const rows = await new ResourceMappingRepository(database).list(guildId);
  return new Map(rows.map((row) => [row.logicalKey, row.discordId]));
}


const selfRoleCatalog = [
  ['ROLE_GAMER', 'ผู้เล่นเกม'], ['ROLE_LFG_READY', 'พร้อมหาปาร์ตี้'], ['ROLE_COMPETITIVE_PLAYER', 'ผู้เล่นแข่งขัน'],
  ['ROLE_CREATOR', 'ครีเอเตอร์'], ['ROLE_STREAMER', 'สตรีมเมอร์'], ['ROLE_ARTIST', 'ศิลปิน'], ['ROLE_DEVELOPER', 'นักพัฒนา'],
] as const;
const notificationRoleCatalog = [
  ['ROLE_NOTIFY_ANNOUNCEMENTS', 'ประกาศ'], ['ROLE_NOTIFY_EVENTS', 'กิจกรรม'], ['ROLE_NOTIFY_NEWS', 'ข่าวสาร'], ['ROLE_NOTIFY_GAMING', 'ข่าวเกม'], ['ROLE_NOTIFY_LIVE', 'ไลฟ์และครีเอเตอร์'],
  ['ROLE_NOTIFY_UPDATES', 'อัปเดตระบบ'], ['ROLE_NOTIFY_LFG', 'หาปาร์ตี้'], ['ROLE_NOTIFY_TOURNAMENTS', 'การแข่งขัน'], ['ROLE_NOTIFY_MAINTENANCE', 'บำรุงรักษา'],
] as const;
const notificationTopicByRoleKey: Record<string,string> = { ROLE_NOTIFY_ANNOUNCEMENTS:'ANNOUNCEMENTS', ROLE_NOTIFY_EVENTS:'EVENTS', ROLE_NOTIFY_NEWS:'NEWS', ROLE_NOTIFY_GAMING:'GAME_PATCHES', ROLE_NOTIFY_LIVE:'LIVE', ROLE_NOTIFY_UPDATES:'UPDATES', ROLE_NOTIFY_LFG:'LFG', ROLE_NOTIFY_TOURNAMENTS:'TOURNAMENTS', ROLE_NOTIFY_MAINTENANCE:'MAINTENANCE' };

async function showMappedRoleSelector(interaction: ButtonInteraction, deps: PanelActionDependencies, kind: 'roles' | 'notifications'): Promise<void> {
  if (!deps.database.configured) { await interaction.reply(v2NoticePanel({ title: 'การตั้งค่ายศยังไม่พร้อม', description: 'การตั้งค่ายศต้องใช้ `DATABASE_URL`', tone: 'warning', ephemeral: true })); return; }
  const ids = await mappedIds(deps.database, interaction.guild!.id);
  const memberRoleId = ids.get('ROLE_MEMBER') ?? ids.get('ROLE_VERIFIED_MEMBER');
  if (memberRoleId && !interaction.member.roles.cache.has(memberRoleId)) { await interaction.reply(v2NoticePanel({ title: 'ต้องยืนยันตัวตน', description: 'โปรดยืนยันสิทธิ์สมาชิกก่อนเลือกยศ', tone: 'warning', ephemeral: true })); return; }
  const catalog = kind === 'roles' ? selfRoleCatalog : notificationRoleCatalog;
  const options = catalog.flatMap(([key, label]) => ids.has(key) ? [{ label, value: key, description: `ยศที่ระบบดูแล: ${key}` }] : []);
  if (!options.length) { await interaction.reply(v2NoticePanel({ title: 'ยังไม่มียศที่ระบบจัดการ', description: 'พิมพ์เขียวปัจจุบันยังไม่ได้ติดตั้งยศที่ระบบจัดการสำหรับส่วนนี้', tone: 'neutral', ephemeral: true })); return; }
  const selected = catalog.filter(([key]) => {
    const id = ids.get(key); return Boolean(id && interaction.member.roles.cache.has(id));
  }).map(([key]) => key);
  const select = new StringSelectMenuBuilder().setCustomId(`${kind}:assign`).setPlaceholder(kind === 'roles' ? 'เลือกยศของคุณ' : 'เลือกหัวข้อการแจ้งเตือน')
    .setMinValues(0).setMaxValues(Math.min(options.length, 25)).addOptions(options.map((option) => ({ ...option, default: selected.includes(option.value as any) })));
  await interaction.reply(v2NoticePanel({ title: kind === 'roles' ? 'เลือกยศสมาชิก' : 'เลือกหัวข้อการแจ้งเตือน', description: kind === 'roles' ? 'เลือกยศสมาชิกที่ต้องการ ยศที่มีสิทธิ์สูงจะไม่ถูกแสดงในจุดนี้' : 'เลือกหัวข้อการแจ้งเตือนที่ต้องการ', tone: 'primary', actions: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)], ephemeral: true }));
}
export async function handlePanelButton(interaction: ButtonInteraction, deps: PanelActionDependencies): Promise<boolean> {
  if (await handleFabricButton(interaction, deps)) return true;
  if (await handleGiveawayButton(interaction, deps)) return true;
  if (await handleOperatorButton(interaction, deps)) return true;
  if (await handleDomainButton(interaction, deps)) return true;
  if (await handleTicketButton(interaction, deps)) return true;
  if (await handleRecoveryButton(interaction, deps)) return true;
  if (!interaction.inCachedGuild()) return false;
  if (await handleGamingButton(interaction, deps)) return true;
  if (await handleWorkflowButton(interaction, deps)) return true;
  if (await handleModerationButton(interaction, deps)) return true;

  if (interaction.customId.startsWith('help:')) {
    const section=interaction.customId.split(':')[1] ?? 'overview';
    const content:Record<string,{title:string;body:string}>={
      setup:{title:'การตั้งค่าและโครงสร้างเซิร์ฟเวอร์',body:'Server managers configure blueprints, modules, Gaming, theme, security, automation, backups and advanced resource locks through **/setup** or the authorized dashboard. Large changes always use preview before apply.'},
      member:{title:'บริการสมาชิกด้วยตนเอง',body:'Verify access, choose safe self-roles, configure notification topics and quiet hours, open support tickets, submit suggestions/applications/reports, and join enabled event or Gaming workflows from managed panels.'},
      gaming:{title:'ระบบเกมและชุมชนผู้เล่น',body:'Gaming is configured under **/setup**. Enabled guilds can expose profiles, LFG, parties, teams, clans, scrims, non-wagering tournaments, progression, quests, achievements, game events and temporary voice without creating another top-level command.'},
      operations:{title:'ปฏิบัติการและการกู้คืน',body:'Authorized staff use Status, Security, Backup, Repair, Privacy and Staff panels or the dashboard for health, approvals, drift, backup/restore, tickets and governed changes. High-risk mutations require policy/approval instead of silent automation.'},
    };
    const selected=content[section] ?? {title:'ศูนย์ช่วยเหลือ',body:'Choose a help section from the managed Help panel.'};
    await interaction.reply(v2NoticePanel({ title: selected.title, description: `${selected.body}\n\n-# ออโต้เซิร์ฟเวอร์ · ศูนย์ช่วยเหลือแบบบริการตนเอง · UI V2`, tone: 'ice', ephemeral: true }));
    return true;
  }

  if (interaction.customId === 'verify:complete') {
    if (!deps.database.configured) {
      await interaction.reply(v2NoticePanel({ title: 'การยืนยันตัวตนยังไม่พร้อม', description: 'การจัดเก็บสถานะยืนยันตัวตนยังไม่พร้อมจนกว่าจะตั้งค่า `DATABASE_URL`', tone: 'warning', ephemeral: true }));
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ids = await mappedIds(deps.database, interaction.guild.id);
    const memberRoleId = ids.get('ROLE_MEMBER') ?? ids.get('ROLE_VERIFIED_MEMBER');
    const verifiedRoleId = ids.get('ROLE_VERIFIED_MEMBER');
    const newMemberRoleId = ids.get('ROLE_NEW_MEMBER');
    if (!memberRoleId) {
      await interaction.editReply(v2EditNoticePanel({ title: 'การยืนยันตัวตนยังไม่พร้อม', description: t('th', 'verify.missingRole'), tone: 'warning' }));
      return true;
    }
    const member = interaction.member;
    const already = member.roles.cache.has(memberRoleId) && (!verifiedRoleId || member.roles.cache.has(verifiedRoleId));
    if (already) { await interaction.editReply(v2EditNoticePanel({ title: 'ยืนยันตัวตนแล้ว', description: t('th', 'verify.already'), tone: 'neutral' })); return true; }

    await member.roles.add(memberRoleId, 'ออโต้เซิร์ฟเวอร์ · ยืนยันตัวตน');
    if (verifiedRoleId && verifiedRoleId !== memberRoleId) await member.roles.add(verifiedRoleId, 'ออโต้เซิร์ฟเวอร์ · ยืนยันตัวตน');
    if (newMemberRoleId && member.roles.cache.has(newMemberRoleId)) await member.roles.remove(newMemberRoleId, 'ออโต้เซิร์ฟเวอร์ · ยืนยันตัวตนเสร็จสมบูรณ์');
    const correlationId = newCorrelationId();
    await deps.database.requirePool().query(
      `insert into member_onboarding(guild_id,user_id,stage,verified_at,state)
       values($1,$2,'VERIFIED',now(),$3)
       on conflict (guild_id,user_id) do update set stage='VERIFIED', verified_at=coalesce(member_onboarding.verified_at,now()), state=member_onboarding.state || excluded.state, updated_at=now()`,
      [interaction.guild.id, interaction.user.id, { source: 'discord_panel', verifiedBy: 'SELF_SERVICE' }],
    );
    await deps.database.requirePool().query(
      `insert into verification_attempts(attempt_id,guild_id,user_id,method,result,correlation_id) values($1,$2,$3,'PANEL_BUTTON','SUCCEEDED',$4)`,
      [randomUUID(), interaction.guild.id, interaction.user.id, correlationId],
    );
    await interaction.editReply(v2EditNoticePanel({ title: 'ยืนยันตัวตนสำเร็จ', description: t('th', 'verify.success'), tone: 'success' }));
    return true;
  }

  if (interaction.customId === 'roles:open') { await showMappedRoleSelector(interaction, deps, 'roles'); return true; }
  if (interaction.customId === 'notifications:open') { await showMappedRoleSelector(interaction, deps, 'notifications'); return true; }
  if (interaction.customId === 'notifications:quiet') {
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'การตั้งค่าการแจ้งเตือนยังไม่พร้อม',description:'การตั้งค่าการแจ้งเตือนต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    const row=(await deps.database.requirePool().query<any>(`select quiet_hours,timezone from notification_preferences where guild_id=$1 and user_id=$2`,[interaction.guild.id,interaction.user.id])).rows[0];
    const quiet=row?.quiet_hours as {startHour?:number;endHour?:number;timezone?:string}|null|undefined;
    const modal=new ModalBuilder().setCustomId('notifications:quiet:modal').setTitle('ช่วงงดแจ้งเตือน');
    const windowInput=new TextInputBuilder().setCustomId('window').setLabel('ช่วงเวลา: HH-HH หรือ OFF').setPlaceholder('22-08').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16).setValue(quiet&&Number.isInteger(quiet.startHour)&&Number.isInteger(quiet.endHour)?`${String(quiet.startHour).padStart(2,'0')}-${String(quiet.endHour).padStart(2,'0')}`:'OFF');
    const timezoneInput=new TextInputBuilder().setCustomId('timezone').setLabel('เขตเวลา').setPlaceholder('เช่น Asia/Bangkok').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(String(quiet?.timezone??row?.timezone??'Asia/Bangkok'));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(windowInput),new ActionRowBuilder<TextInputBuilder>().addComponents(timezoneInput));
    await interaction.showModal(modal);return true;
  }

  if (interaction.customId === 'application:create') {
    const modal = new ModalBuilder().setCustomId('application:create:modal').setTitle('ส่งใบสมัคร');
    const type = new TextInputBuilder().setCustomId('type').setLabel('ประเภทใบสมัคร').setPlaceholder('ทีมงาน / ครีเอเตอร์ / ผู้ดูแลการเรียนรู้ / พันธมิตร').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(40).setRequired(true);
    const answer = new TextInputBuilder().setCustomId('answer').setLabel('เหตุผลที่สมัคร').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(1500).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(type), new ActionRowBuilder<TextInputBuilder>().addComponents(answer));
    await interaction.showModal(modal); return true;
  }

  if (interaction.customId === 'report:create') {
    const modal = new ModalBuilder().setCustomId('report:create:modal').setTitle('รายงานส่วนตัว');
    const target = new TextInputBuilder().setCustomId('target').setLabel('รหัสผู้ใช้ / การกล่าวถึง (ไม่บังคับ)').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(false);
    const detail = new TextInputBuilder().setCustomId('detail').setLabel('เกิดอะไรขึ้น').setStyle(TextInputStyle.Paragraph).setMinLength(20).setMaxLength(1800).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(target), new ActionRowBuilder<TextInputBuilder>().addComponents(detail));
    await interaction.showModal(modal); return true;
  }

  if (interaction.customId === 'suggestion:create') {
    const modal = new ModalBuilder().setCustomId('suggestion:create:modal').setTitle('ส่งข้อเสนอแนะ');
    const content = new TextInputBuilder().setCustomId('content').setLabel('ไอเดียของคุณ').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1500).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(content));
    await interaction.showModal(modal); return true;
  }

  if (interaction.customId.startsWith('suggestion:vote:')) {
    if (!deps.database.configured) { await interaction.reply(v2NoticePanel({ title: 'การโหวตข้อเสนอแนะยังไม่พร้อม', description: 'การจัดเก็บข้อเสนอแนะยังไม่พร้อม', tone: 'warning', ephemeral: true })); return true; }
    const [, , direction, suggestionId] = interaction.customId.split(':');
    if (!suggestionId || !['up','down','clear'].includes(direction ?? '')) return false;
    const result = await new CommunityWorkflowRepository(deps.database).voteSuggestion({ suggestionId, guildId: interaction.guild.id, userId: interaction.user.id, vote: direction === 'up' ? 'UP' : direction === 'down' ? 'DOWN' : 'CLEAR' });
    await interaction.reply(v2NoticePanel({ title: 'บันทึกคะแนนโหวตแล้ว', description: `คะแนน: **${result.score}** · ${result.upvoters.length} เห็นด้วย / ${result.downvoters.length} ไม่เห็นด้วย`, tone: 'success', ephemeral: true }));
    return true;
  }

  if (interaction.customId === 'ticket:create') {
    const modal = new ModalBuilder().setCustomId('ticket:create:modal').setTitle('เปิดห้องช่วยเหลือ');
    const subject = new TextInputBuilder().setCustomId('subject').setLabel('หัวข้อ').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(80).setRequired(true);
    const detail = new TextInputBuilder().setCustomId('detail').setLabel('ต้องการความช่วยเหลือเรื่องใด').setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(1200).setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(subject), new ActionRowBuilder<TextInputBuilder>().addComponents(detail));
    await interaction.showModal(modal);
    return true;
  }

  return false;
}

export async function handlePanelSelect(interaction: StringSelectMenuInteraction, deps: PanelActionDependencies): Promise<boolean> {
  if (!interaction.inCachedGuild() || !['roles:assign','notifications:assign'].includes(interaction.customId)) return false;
  if (!deps.database.configured) { await interaction.reply(v2NoticePanel({ title: 'การตั้งค่ายศยังไม่พร้อม', description: 'การตั้งค่ายศต้องใช้ `DATABASE_URL`', tone: 'warning', ephemeral: true })); return true; }
  await interaction.deferUpdate();
  const kind = interaction.customId.startsWith('roles:') ? 'roles' : 'notifications';
  const catalog = kind === 'roles' ? selfRoleCatalog : notificationRoleCatalog;
  const ids = await mappedIds(deps.database, interaction.guild.id);
  const selected = new Set(interaction.values);
  const correlationId = newCorrelationId();
  const changed: string[] = [];
  for (const [roleKey] of catalog) {
    const roleId = ids.get(roleKey); if (!roleId) continue;
    const has = interaction.member.roles.cache.has(roleId); const wants = selected.has(roleKey);
    if (wants && !has) { await interaction.member.roles.add(roleId, `ออโต้เซิร์ฟเวอร์ · ตั้งค่าความต้องการ ${kind==='roles'?'ยศ':'การแจ้งเตือน'}`); changed.push(`+${roleKey}`); }
    if (!wants && has) { await interaction.member.roles.remove(roleId, `ออโต้เซิร์ฟเวอร์ · ตั้งค่าความต้องการ ${kind==='roles'?'ยศ':'การแจ้งเตือน'}`); changed.push(`-${roleKey}`); }
    await deps.database.requirePool().query(
      `insert into self_role_assignments(guild_id,user_id,role_key,role_id,source,state,correlation_id,assigned_at,removed_at)
       values($1,$2,$3,$4,$5,$6,$7,now(),case when $6='REMOVED' then now() else null end)
       on conflict (guild_id,user_id,role_key) do update set role_id=excluded.role_id, source=excluded.source, state=excluded.state, correlation_id=excluded.correlation_id, removed_at=excluded.removed_at`,
      [interaction.guild.id, interaction.user.id, roleKey, roleId, kind.toUpperCase(), wants ? 'ACTIVE' : 'REMOVED', correlationId],
    );
  }
  if(kind==='notifications'){
    const topics=Object.fromEntries(notificationRoleCatalog.map(([roleKey])=>[notificationTopicByRoleKey[roleKey],selected.has(roleKey)]));
    await deps.database.requirePool().query(`insert into notification_preferences(guild_id,user_id,topics,updated_at) values($1,$2,$3,now()) on conflict(guild_id,user_id) do update set topics=excluded.topics,updated_at=now()`,[interaction.guild.id,interaction.user.id,topics]);
  }
  await interaction.editReply(v2EditNoticePanel({ title: 'บันทึกการตั้งค่ายศแล้ว', description: changed.length ? `อัปเดตแล้ว: ${changed.join(', ')}` : 'การตั้งค่าตรงกับตัวเลือกของคุณอยู่แล้ว', tone: changed.length ? 'success' : 'neutral' }));
  return true;
}

export async function handlePanelModal(interaction: ModalSubmitInteraction, deps: PanelActionDependencies): Promise<boolean> {
  if (await handleFabricModal(interaction, deps)) return true;
  if (await handleGiveawayModal(interaction, deps)) return true;
  if (await handleOperatorModal(interaction, deps)) return true;
  if (await handleDomainModal(interaction, deps)) return true;
  if (await handleRecoveryModal(interaction, deps)) return true;
  if (!interaction.inCachedGuild()) return false;
  if (await handleGamingModal(interaction, deps)) return true;
  if (await handleWorkflowModal(interaction, deps)) return true;
  if (await handleModerationModal(interaction, deps)) return true;
  if(interaction.customId==='notifications:quiet:modal'){
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'การตั้งค่าการแจ้งเตือนยังไม่พร้อม',description:'การตั้งค่าการแจ้งเตือนต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    const windowValue=interaction.fields.getTextInputValue('window').trim().toUpperCase(); const timezone=interaction.fields.getTextInputValue('timezone').trim();
    try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());}catch{await interaction.reply(v2NoticePanel({title:'เขตเวลาไม่ถูกต้อง',description:'ใช้เขตเวลา IANA เช่น `Asia/Bangkok`',tone:'warning',ephemeral:true}));return true;}
    let quietHours:null|{startHour:number;endHour:number;timezone:string}=null;
    if(windowValue!=='OFF'){
      const match=/^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(windowValue); const start=match?Number(match[1]):-1,end=match?Number(match[2]):-1;
      if(!match||!Number.isInteger(start)||!Number.isInteger(end)||start<0||start>23||end<0||end>23){await interaction.reply(v2NoticePanel({title:'รูปแบบช่วงงดแจ้งเตือนไม่ถูกต้อง',description:'ใช้รูปแบบ `HH-HH` ตั้งแต่ 0–23 เช่น `22-08` หรือ `OFF`',tone:'warning',ephemeral:true}));return true;}
      quietHours={startHour:start,endHour:end,timezone};
    }
    await deps.database.requirePool().query(`insert into notification_preferences(guild_id,user_id,topics,quiet_hours,timezone,updated_at) values($1,$2,'{}'::jsonb,$3,$4,now()) on conflict(guild_id,user_id) do update set quiet_hours=excluded.quiet_hours,timezone=excluded.timezone,updated_at=now()`,[interaction.guild.id,interaction.user.id,quietHours,timezone]);
    await interaction.reply(v2NoticePanel({title:'ช่วงงดแจ้งเตือน',description:quietHours?`บันทึกแล้ว: **${String(quietHours.startHour).padStart(2,'0')}:00–${String(quietHours.endHour).padStart(2,'0')}:00** (${timezone}).`:'ปิดช่วงเวลางดรบกวนแล้ว',tone:'success',ephemeral:true}));return true;
  }

  if (['application:create:modal','report:create:modal','suggestion:create:modal'].includes(interaction.customId)) {
    if (!deps.database.configured) { await interaction.reply(v2NoticePanel({ title: 'ขั้นตอนงานยังไม่พร้อม', description: 'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`', tone: 'warning', ephemeral: true })); return true; }
    const repo = new CommunityWorkflowRepository(deps.database);
    if (interaction.customId === 'application:create:modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const type = interaction.fields.getTextInputValue('type').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 40);
      const answer = interaction.fields.getTextInputValue('answer').trim();
      const applicationId = await repo.createApplication({ guildId: interaction.guild.id, userId: interaction.user.id, type: type || 'GENERAL', answers: { motivation: answer } });
      await new AuditRepository(deps.database).record({ auditId: randomUUID(), guildId: interaction.guild.id, actorId: interaction.user.id, action: 'APPLICATION_SUBMIT', resourceType: 'APPLICATION', resourceId: applicationId, afterState: { type }, result: 'SUCCEEDED', correlationId: newCorrelationId() });
      await interaction.editReply(v2EditNoticePanel({ title: 'ส่งใบสมัครแล้ว', description: `เลขอ้างอิงส่วนตัว: \`${applicationId.slice(0, 8)}\``, tone: 'success' })); return true;
    }
    if (interaction.customId === 'report:create:modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const rawTarget = interaction.fields.getTextInputValue('target').trim();
      const subjectUserId = rawTarget.match(/\d{15,22}/)?.[0];
      const detail = interaction.fields.getTextInputValue('detail').trim();
      const reportId = await repo.createReport({ guildId: interaction.guild.id, reporterId: interaction.user.id, subjectUserId, type: 'MEMBER_OR_SERVER', priority: 'NORMAL', detail });
      await new AuditRepository(deps.database).record({ auditId: randomUUID(), guildId: interaction.guild.id, actorId: interaction.user.id, action: 'REPORT_SUBMIT', resourceType: 'REPORT', resourceId: reportId, afterState: { subjectUserId: subjectUserId ?? null }, result: 'SUCCEEDED', correlationId: newCorrelationId() });
      await interaction.editReply(v2EditNoticePanel({ title: 'ส่งรายงานส่วนตัวแล้ว', description: `เลขอ้างอิงส่วนตัว: \`${reportId.slice(0, 8)}\``, tone: 'success' })); return true;
    }
    const content = interaction.fields.getTextInputValue('content').trim();
    const suggestionId = await repo.createSuggestion({ guildId: interaction.guild.id, userId: interaction.user.id, content });
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`suggestion:vote:up:${suggestionId}`).setLabel('เห็นด้วย').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`suggestion:vote:down:${suggestionId}`).setLabel('ไม่เห็นด้วย').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`suggestion:vote:clear:${suggestionId}`).setLabel('ล้างคะแนนโหวต').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply(v2NoticePanel({ title: 'ข้อเสนอแนะใหม่', description: `${content}\n\n-# ข้อเสนอแนะ ${suggestionId.slice(0, 8)} · เปิดอยู่`, tone: 'ice', actions: [row] }));
    return true;
  }
  if (interaction.customId !== 'ticket:create:modal') return false;
  if (!deps.database.configured) { await interaction.reply(v2NoticePanel({ title: 'การจัดเก็บคำขอช่วยเหลือยังไม่พร้อม', description: 'การจัดเก็บคำขอช่วยเหลือต้องใช้ `DATABASE_URL`', tone: 'warning', ephemeral: true })); return true; }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const subject = interaction.fields.getTextInputValue('subject').trim();
  const detail = interaction.fields.getTextInputValue('detail').trim();
  const repo = new TicketRepository(deps.database);
  const ticket = await repo.reserve({ guildId: interaction.guild.id, openerUserId: interaction.user.id, ticketType: 'GENERAL_SUPPORT', subject, metadata: { detail } });
  const ids = await mappedIds(deps.database, interaction.guild.id);
  const categoryId = ids.get('CAT_SUPPORT');
  const supportRoles = [ids.get('ROLE_SUPPORT'), ids.get('ROLE_TICKET_STAFF'), ids.get('ROLE_MODERATOR')].filter(Boolean) as string[];
  const safeUser = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 18) || 'member';

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: `help-${ticket.ticketNumber}-${safeUser}`.slice(0, 100),
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `ออโต้เซิร์ฟเวอร์ · คำขอช่วยเหลือ #${ticket.ticketNumber} · ${ticket.ticketId}`,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks] },
        ...supportRoles.map((id) => ({ id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] })),
      ],
      reason: `ออโต้เซิร์ฟเวอร์ · คำขอช่วยเหลือ #${ticket.ticketNumber}`,
    });
    await repo.attachChannel(ticket.ticketId, channel.id);
    const closeRow = ticketControls(ticket.ticketId);
    await channel.send({
      ...v2NoticePanel({ title: `คำขอช่วยเหลือ #${ticket.ticketNumber} · ${subject}`, description: `<@${interaction.user.id}>\n\n${detail}\n\n-# รหัสคำขอช่วยเหลือ ${ticket.ticketId}`, tone: 'warning', actions: [closeRow] }),
      allowedMentions: { users: [interaction.user.id] },
    });
    const correlationId = newCorrelationId();
    await new AuditRepository(deps.database).record({ auditId: randomUUID(), guildId: interaction.guild.id, actorId: interaction.user.id, action: 'TICKET_CREATE', resourceType: 'TICKET', resourceId: ticket.ticketId, afterState: { ticketNumber: ticket.ticketNumber, channelId: channel.id, subject }, result: 'SUCCEEDED', correlationId });
    if(deps.bus) await deps.bus.publish(makeEvent({type:'ticket.created',guildId:interaction.guild.id,actorId:interaction.user.id,correlationId,aggregateKey:ticket.ticketId,source:'discord-panel',payload:{ticketId:ticket.ticketId,ticketNumber:ticket.ticketNumber,status:'OPEN',channelId:channel.id,openerUserId:interaction.user.id,subject}})).catch(()=>undefined);
    if (ticket.slaDueAt) {
      const { ScheduledTaskRepository } = await import('@autoserver/scheduler');
      await new ScheduledTaskRepository(deps.database).schedule({ guildId: interaction.guild.id, taskType: 'TICKET_SLA_CHECK', runAt: ticket.slaDueAt, timezone: 'UTC', dedupKey: `ticket-sla:${ticket.ticketId}`, payload: { ticketId: ticket.ticketId } });
    }
    await interaction.editReply(v2EditNoticePanel({ title: 'สร้างห้องช่วยเหลือแล้ว', description: `${t(resolveLocale('th'), 'ticket.created')} <#${channel.id}>`, tone: 'success' }));
  } catch (error) {
    await repo.remove(ticket.ticketId).catch(() => undefined);
    if (channel) await channel.delete('Rollback failed ticket creation').catch(() => undefined);
    const errorId = newCorrelationId();
    console.error('[ticket-create-error]', { errorId, message: error instanceof Error ? error.message : 'unknown' });
    await interaction.editReply(v2EditNoticePanel({ title: 'สร้างห้องช่วยเหลือไม่สำเร็จอย่างปลอดภัย', description: `${t('th', 'ticket.createFailed')} รหัสข้อผิดพลาด: \`${errorId}\``, tone: 'danger' }));
  }
  return true;
}
