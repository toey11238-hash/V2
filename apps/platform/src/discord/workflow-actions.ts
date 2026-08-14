import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { AuditRepository, ResourceMappingRepository, type Database } from '@autoserver/database';
import { CommunityWorkflowRepository, type ApplicationStatus, type ReportStatus, type SuggestionStatus } from '@autoserver/workflows';
import { ServerEventRepository, type PersistedServerEvent } from '@autoserver/events';
import { ScheduledTaskRepository, computeReminderInstants } from '@autoserver/scheduler';
import { v2EditNoticePanel, v2NoticePanel } from '@autoserver/panels';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';
import { GamingRepository } from '@autoserver/gaming';
import { presentSystemValue } from '@autoserver/localization';
import { safeDiscordError } from './presentation.js';

export interface WorkflowActionDependencies { database: Database; bus?: EventBus; }

async function publishWorkflowEvent(deps:WorkflowActionDependencies,input:{type:string;guildId:string;actorId?:string;aggregateKey:string;correlationId?:string;payload?:Record<string,unknown>}):Promise<void>{
  if(!deps.bus)return;
  await deps.bus.publish(makeEvent({type:input.type,guildId:input.guildId,actorId:input.actorId,correlationId:input.correlationId??newCorrelationId(),aggregateKey:input.aggregateKey,source:'discord-panel',payload:input.payload??{}})).catch(()=>undefined);
}

type XpAwardResult = Awaited<ReturnType<GamingRepository['awardXp']>>;
async function publishWorkflowXp(deps:WorkflowActionDependencies,input:{guildId:string;userId:string;sourceType:string;sourceId:string;correlationId:string;xp:XpAwardResult}):Promise<void>{
  if(!deps.bus || input.xp.awarded<=0)return;
  const payload={userId:input.userId,gameKey:null,sourceType:input.sourceType,sourceId:input.sourceId,amount:input.xp.awarded,totalXp:input.xp.totalXp,level:input.xp.level,previousLevel:input.xp.previousLevel,reason:input.xp.reason};
  await publishWorkflowEvent(deps,{type:'gaming.xp.awarded',guildId:input.guildId,actorId:input.userId,aggregateKey:`${input.userId}:global`,correlationId:input.correlationId,payload});
  if(input.xp.level>input.xp.previousLevel)await publishWorkflowEvent(deps,{type:'gaming.level.up',guildId:input.guildId,actorId:input.userId,aggregateKey:`${input.userId}:global`,correlationId:input.correlationId,payload});
}

function field(id: string, label: string, style: TextInputStyle, opts: { placeholder?: string; required?: boolean; min?: number; max?: number } = {}) {
  const value = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(opts.required ?? true);
  if (opts.placeholder) value.setPlaceholder(opts.placeholder);
  if (opts.min !== undefined) value.setMinLength(opts.min);
  if (opts.max !== undefined) value.setMaxLength(opts.max);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(value);
}

async function mappingMap(database: Database, guildId: string) {
  const rows = await new ResourceMappingRepository(database).list(guildId);
  return new Map(rows.map((row) => [row.logicalKey, row.discordId]));
}

async function isAuthorizedStaff(interaction: ButtonInteraction | ModalSubmitInteraction, database: Database): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  if (interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) || interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return true;
  const ids = await mappingMap(database, interaction.guild.id);
  const staffKeys = ['ROLE_OWNER','ROLE_CO_OWNER','ROLE_SERVER_MANAGER','ROLE_ADMINISTRATOR','ROLE_HEAD_MODERATOR','ROLE_MODERATOR','ROLE_STAFF','ROLE_SUPPORT','ROLE_TICKET_STAFF','ROLE_EVENT_MANAGER','ROLE_COMMUNITY_MANAGER'];
  return staffKeys.some((key) => { const id = ids.get(key); return Boolean(id && interaction.member.roles.cache.has(id)); });
}

async function managerGuard(interaction: ButtonInteraction | ModalSubmitInteraction): Promise<boolean> {
  return interaction.inCachedGuild() && (interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild));
}

async function audit(database: Database, input: { guildId:string; actorId:string; action:string; resourceType:string; resourceId:string; afterState?:Record<string,unknown> }) {
  await new AuditRepository(database).record({ auditId:randomUUID(),guildId:input.guildId,actorId:input.actorId,action:input.action,resourceType:input.resourceType,resourceId:input.resourceId,afterState:input.afterState,result:'SUCCEEDED',correlationId:newCorrelationId() });
}

function staffQueueDescription(queue: Awaited<ReturnType<CommunityWorkflowRepository['staffQueue']>>) {
  const applications = queue.applications.map((r:any)=>`\`${String(r.application_id)}\` ${r.application_type} · ${presentSystemValue(r.status)}`).join('\n') || 'ไม่มี';
  const reports = queue.reports.map((r:any)=>`\`${String(r.report_id)}\` ${presentSystemValue(r.priority)} · ${presentSystemValue(r.status)}`).join('\n') || 'ไม่มี';
  const suggestions = queue.suggestions.map((r:any)=>`\`${String(r.suggestion_id)}\` คะแนน ${r.score} · ${presentSystemValue(r.status)}`).join('\n') || 'ไม่มี';
  const announcements = queue.announcements.map((r:any)=>`\`${String(r.announcement_id)}\` ${presentSystemValue(r.status)} · ${String(r.title).slice(0,60)}`).join('\n') || 'ไม่มี';
  return `### ใบสมัคร\n${applications.slice(0,950)}\n\n### รายงาน\n${reports.slice(0,950)}\n\n### ข้อเสนอแนะ\n${suggestions.slice(0,950)}\n\n### ประกาศ\n${announcements.slice(0,950)}\n\n-# แสดงรหัสรายการแบบเต็มเพื่อให้ทีมดูแลทำงานผ่าน Discord ได้โดยไม่ต้องเข้าฐานข้อมูลภายนอก`;
}


function eventPayload(event: PersistedServerEvent, summary: { registered:number; waitlisted:number; checkedIn:number }, edit = false) {
  const rows = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`event:register:${event.eventId}`).setLabel('ลงทะเบียน').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`event:cancel:${event.eventId}`).setLabel('ยกเลิกการเข้าร่วม').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`event:checkin:${event.eventId}`).setLabel('เช็กอิน').setStyle(ButtonStyle.Primary),
  );
  const desc=[`ประเภท: **${event.eventType}**`,`เริ่ม: <t:${Math.floor(event.startsAt.getTime()/1000)}:F>`,event.endsAt?`สิ้นสุด: <t:${Math.floor(event.endsAt.getTime()/1000)}:t>`:undefined,`ลงทะเบียน: **${summary.registered}${event.capacity ? `/${event.capacity}`:''}**`,`คิวรอ: **${summary.waitlisted}**`,`เช็กอินแล้ว: **${summary.checkedIn}**`].filter(Boolean).join('\n');
  const panel = edit ? v2EditNoticePanel({title:event.title,description:`${desc}\n\n-# กิจกรรม ${event.eventId}`,tone:'warning',actions:[rows]}) : v2NoticePanel({title:event.title,description:`${desc}\n\n-# กิจกรรม ${event.eventId}`,tone:'warning',actions:[rows]});
  return {...panel,allowedMentions:{parse:[]}};
}

async function refreshEventMessage(interaction: ButtonInteraction, repo: ServerEventRepository, eventId:string) {
  const event=await repo.get(interaction.guild!.id,eventId); if(!event) return;
  const summary=await repo.registrationSummary(interaction.guild!.id,eventId);
  await interaction.message.edit(eventPayload(event,summary,true)).catch(()=>undefined);
}

export async function handleWorkflowButton(interaction: ButtonInteraction, deps: WorkflowActionDependencies): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  const id=interaction.customId;
  if(!id.startsWith('staff:') && !id.startsWith('announcement:') && !id.startsWith('event:')) return false;
  if(!deps.database.configured){ await interaction.reply(v2NoticePanel({title:'การจัดเก็บสถานะขั้นตอนงานยังไม่พร้อม',description:'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true})); return true; }
  const workflows=new CommunityWorkflowRepository(deps.database);

  try {
    if(id==='staff:overview'){
      if(!await isAuthorizedStaff(interaction,deps.database)){ await interaction.reply(v2NoticePanel({title:'ต้องได้รับสิทธิ์ทีมดูแล',description:'ขั้นตอนนี้จำกัดเฉพาะทีมดูแลที่ได้รับอนุญาต',tone:'danger',ephemeral:true})); return true; }
      await interaction.reply(v2NoticePanel({title:'คิวตรวจสอบของทีมดูแล',description:staffQueueDescription(await workflows.staffQueue(interaction.guild.id,10)),tone:'violet',ephemeral:true})); return true;
    }
    if(['staff:application-review','staff:report-review','staff:suggestion-review'].includes(id)){
      if(!await isAuthorizedStaff(interaction,deps.database)){ await interaction.reply(v2NoticePanel({title:'ต้องได้รับสิทธิ์ทีมดูแล',description:'ขั้นตอนนี้จำกัดเฉพาะทีมดูแลที่ได้รับอนุญาต',tone:'danger',ephemeral:true})); return true; }
      const kind=id.split(':')[1]!;
      const modal=new ModalBuilder().setCustomId(`staff:${kind}-review:modal`).setTitle(`ตรวจทาน${kind==='application'?'ใบสมัคร':kind==='report'?'รายงาน':'ข้อเสนอแนะ'}`);
      modal.addComponents(field('id','UUID รายการเต็ม',TextInputStyle.Short,{min:32,max:40}),field('decision','สถานะถัดไป',TextInputStyle.Short,{placeholder:kind==='application'?'เช่น UNDER_REVIEW / INTERVIEW / ACCEPTED / REJECTED':kind==='report'?'เช่น TRIAGED / INVESTIGATING / ACTIONED / CLOSED / DISMISSED':'เช่น UNDER_REVIEW / ACCEPTED / REJECTED / IMPLEMENTED / DUPLICATE',min:4,max:30}),field('reason','เหตุผลการตัดสินใจ / หมายเหตุทีมงาน',TextInputStyle.Paragraph,{required:false,max:800}));
      await interaction.showModal(modal); return true;
    }
    if(id==='staff:announcement-create'){
      if(!await managerGuard(interaction)){ await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การสร้างประกาศ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อสร้างประกาศ',tone:'danger',ephemeral:true})); return true; }
      const modal=new ModalBuilder().setCustomId('staff:announcement-create:modal').setTitle('ร่างประกาศ');
      modal.addComponents(field('title','ชื่อเรื่อง',TextInputStyle.Short,{min:3,max:100}),field('body','เนื้อหาประกาศ',TextInputStyle.Paragraph,{min:10,max:3500}),field('schedule','เวลาตามมาตรฐาน ISO (ไม่บังคับ)',TextInputStyle.Short,{required:false,placeholder:'เช่น 2026-08-20T20:00:00+07:00',max:40}),field('channel','คีย์ช่องปลายทาง',TextInputStyle.Short,{required:false,placeholder:'เช่น CH_ANNOUNCEMENTS',max:80}));
      await interaction.showModal(modal); return true;
    }
    if(id.startsWith('announcement:approve:')){
      if(!await managerGuard(interaction)){ await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การอนุมัติประกาศ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่ออนุมัติประกาศ',tone:'danger',ephemeral:true})); return true; }
      const [, , modeRaw, announcementId]=id.split(':'); const mode=modeRaw==='schedule'?'SCHEDULE':'PUBLISH';
      if(!announcementId) return false;
      const approved=await workflows.approveAnnouncement({guildId:interaction.guild.id,announcementId,approverId:interaction.user.id,mode});
      const channelKey=String((approved.target as any)?.channelKey ?? 'CH_ANNOUNCEMENTS');
      if(mode==='SCHEDULE'){
        await new ScheduledTaskRepository(deps.database).schedule({guildId:interaction.guild.id,taskType:'ANNOUNCEMENT_PUBLISH',runAt:approved.scheduledAt!,timezone:'UTC',dedupKey:`announcement:${announcementId}`,payload:{announcementId,channelKey}});
        await interaction.update({...v2EditNoticePanel({title:'อนุมัติและกำหนดเวลาประกาศแล้ว',description:`อนุมัติโดย <@${interaction.user.id}>\nเผยแพร่ <t:${Math.floor(approved.scheduledAt!.getTime()/1000)}:F>.`,tone:'success'}),allowedMentions:{users:[interaction.user.id]}}); return true;
      }
      const mappings=await mappingMap(deps.database,interaction.guild.id); const targetId=mappings.get(channelKey);
      if(!targetId) throw new Error('ANNOUNCEMENT_TARGET_NOT_MAPPED');
      const target=await interaction.guild.channels.fetch(targetId);
      if(!target || (target.type!==ChannelType.GuildText && target.type!==ChannelType.GuildAnnouncement)) throw new Error('ANNOUNCEMENT_TARGET_INVALID');
      const sent=await target.send({...v2NoticePanel({title:approved.title,description:`${approved.body}\n\n-# ออโต้เซิร์ฟเวอร์ · ประกาศที่ระบบดูแล`,tone:'primary'}),allowedMentions:{parse:[]}});
      await workflows.markAnnouncementPublished({guildId:interaction.guild.id,announcementId,messageId:sent.id,actorId:interaction.user.id});
      await deps.database.requirePool().query(`insert into announcement_deliveries(announcement_id,guild_id,channel_id,message_id,state,delivered_at) values($1,$2,$3,$4,'PUBLISHED',now()) on conflict (announcement_id,channel_id) do update set message_id=excluded.message_id,state='PUBLISHED',delivered_at=now()`,[announcementId,interaction.guild.id,target.id,sent.id]);
      await interaction.update({...v2EditNoticePanel({title:'อนุมัติและเผยแพร่ประกาศแล้ว',description:`อนุมัติโดย <@${interaction.user.id}>\nเผยแพร่ไปยัง <#${target.id}>.`,tone:'success'}),allowedMentions:{users:[interaction.user.id]}}); return true;
    }
    if(id==='event:create'){
      if(!await managerGuard(interaction)){ await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การสร้างกิจกรรม',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อสร้างกิจกรรมที่ระบบดูแล',tone:'danger',ephemeral:true})); return true; }
      const modal=new ModalBuilder().setCustomId('event:create:modal').setTitle('สร้างกิจกรรมที่ระบบดูแล');
      modal.addComponents(field('title','ชื่อกิจกรรม',TextInputStyle.Short,{min:3,max:100}),field('type','ประเภทกิจกรรม',TextInputStyle.Short,{placeholder:'เช่น COMMUNITY / GAME_NIGHT / TRAINING',min:3,max:40}),field('starts','เวลาเริ่ม (ISO 8601)',TextInputStyle.Short,{placeholder:'เช่น 2026-08-20T20:00:00+07:00',min:10,max:40}),field('duration','ระยะเวลาเป็นนาที',TextInputStyle.Short,{placeholder:'120',min:1,max:5}),field('capacity','จำนวนรองรับ (ไม่บังคับ)',TextInputStyle.Short,{required:false,placeholder:'40',max:6}));
      await interaction.showModal(modal); return true;
    }
    if(id.startsWith('event:register:') || id.startsWith('event:cancel:') || id.startsWith('event:checkin:')){
      const repo=new ServerEventRepository(deps.database); const eventId=id.split(':')[2]!;
      if(id.startsWith('event:register:')){ const status=await repo.register(interaction.guild.id,eventId,interaction.user.id); await publishWorkflowEvent(deps,{type:'community.event.registered',guildId:interaction.guild.id,actorId:interaction.user.id,aggregateKey:eventId,payload:{eventId,userId:interaction.user.id,status}}); await interaction.reply(v2NoticePanel({title:status==='WAITLISTED'?'เพิ่มเข้าคิวรอแล้ว':'ลงทะเบียนสำเร็จ',description:status==='WAITLISTED'?'กิจกรรมเต็มแล้ว ระบบจะจัดลำดับคิวรอให้อัตโนมัติ':'ยืนยันการเข้าร่วมกิจกรรมแล้ว',tone:status==='WAITLISTED'?'warning':'success',ephemeral:true})); }
      else if(id.startsWith('event:cancel:')){ await repo.cancelRegistration(interaction.guild.id,eventId,interaction.user.id); await publishWorkflowEvent(deps,{type:'community.event.cancelled',guildId:interaction.guild.id,actorId:interaction.user.id,aggregateKey:eventId,payload:{eventId,userId:interaction.user.id}}); await interaction.reply(v2NoticePanel({title:'ยกเลิกการเข้าร่วมแล้ว',description:'ระบบอาจเลื่อนสมาชิกจากคิวรอขึ้นมาโดยอัตโนมัติ',tone:'neutral',ephemeral:true})); }
      else {
        await repo.checkIn(interaction.guild.id,eventId,interaction.user.id);
        const correlationId=newCorrelationId(); const gaming=new GamingRepository(deps.database);
        const progression=await gaming.applyProgressionEvent({guildId:interaction.guild.id,userId:interaction.user.id,eventType:'community.event.checkin',dedupKey:`event-checkin:${eventId}`,sourceId:eventId,correlationId});
        const xp=await gaming.awardXp({guildId:interaction.guild.id,userId:interaction.user.id,sourceType:'EVENT_CHECKIN',sourceId:eventId,amount:20,dedupKey:`event-checkin:${eventId}:xp`,correlationId,minEventIntervalMs:0});
        await publishWorkflowEvent(deps,{type:'community.event.checkin',guildId:interaction.guild.id,actorId:interaction.user.id,aggregateKey:eventId,correlationId,payload:{eventId,userId:interaction.user.id,xpAwarded:xp.awarded}});
        await publishWorkflowXp(deps,{guildId:interaction.guild.id,userId:interaction.user.id,sourceType:'EVENT_CHECKIN',sourceId:eventId,correlationId,xp});
        const rewardText=[xp.awarded?`+${xp.awarded} ค่าประสบการณ์`:undefined,progression.completedQuests.length?`ภารกิจสำเร็จ ${progression.completedQuests.length} รายการ`:undefined,progression.awardedAchievements.length?`ปลดล็อกความสำเร็จ ${progression.awardedAchievements.length} รายการ`:undefined].filter(Boolean).join(' · ');
        await interaction.reply(v2NoticePanel({title:'บันทึกการเช็กอินแล้ว',description:rewardText?`${rewardText}.`:'บันทึกการเข้าร่วมเรียบร้อยแล้ว',tone:'success',ephemeral:true}));
      }
      await refreshEventMessage(interaction,repo,eventId); return true;
    }
  } catch(error){
    if(!interaction.replied && !interaction.deferred) await interaction.reply(v2NoticePanel({title:'การดำเนินขั้นตอนงานล้มเหลวอย่างปลอดภัย',description:safeDiscordError(error,{fallback:'ขั้นตอนงานไม่สามารถดำเนินต่อได้อย่างปลอดภัย'}),tone:'danger',ephemeral:true}));
    return true;
  }
  return false;
}

export async function handleWorkflowModal(interaction: ModalSubmitInteraction, deps: WorkflowActionDependencies): Promise<boolean> {
  if(!interaction.inCachedGuild()) return false;
  const id=interaction.customId; if(!id.startsWith('staff:') && id!=='event:create:modal') return false;
  if(!deps.database.configured){ await interaction.reply(v2NoticePanel({title:'การจัดเก็บสถานะขั้นตอนงานยังไม่พร้อม',description:'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true})); return true; }
  const workflows=new CommunityWorkflowRepository(deps.database);
  try{
    if(id.startsWith('staff:') && id.endsWith('-review:modal')){
      if(!await isAuthorizedStaff(interaction,deps.database)){ await interaction.reply(v2NoticePanel({title:'ต้องได้รับสิทธิ์ทีมดูแล',description:'ขั้นตอนนี้จำกัดเฉพาะทีมดูแลที่ได้รับอนุญาต',tone:'danger',ephemeral:true})); return true; }
      const kind=id.slice('staff:'.length,-'-review:modal'.length); const recordId=interaction.fields.getTextInputValue('id').trim(); const decision=interaction.fields.getTextInputValue('decision').trim().toUpperCase(); const reason=interaction.fields.getTextInputValue('reason').trim() || undefined;
      let status:string;
      if(kind==='application') status=await workflows.reviewApplication({guildId:interaction.guild.id,applicationId:recordId,staffId:interaction.user.id,next:decision as ApplicationStatus,reason});
      else if(kind==='report') status=await workflows.reviewReport({guildId:interaction.guild.id,reportId:recordId,staffId:interaction.user.id,next:decision as ReportStatus});
      else status=await workflows.reviewSuggestion({guildId:interaction.guild.id,suggestionId:recordId,staffId:interaction.user.id,next:decision as SuggestionStatus,reason});
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:`${kind.toUpperCase()}_REVIEW`,resourceType:kind.toUpperCase(),resourceId:recordId,afterState:{status,reason:reason ?? null}});
      await interaction.reply(v2NoticePanel({title:'อัปเดตสถานะการตรวจสอบแล้ว',description:`${kind==='application'?'ใบสมัคร':kind==='report'?'รายงาน':'ข้อเสนอแนะ'} เปลี่ยนสถานะเป็น **${presentSystemValue(status)}**.`,tone:'success',ephemeral:true})); return true;
    }
    if(id==='staff:announcement-create:modal'){
      if(!await managerGuard(interaction)){ await interaction.reply(v2NoticePanel({title:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์',description:'ขั้นตอนนี้ต้องใช้สิทธิ์จัดการเซิร์ฟเวอร์',tone:'danger',ephemeral:true})); return true; }
      const scheduleRaw=interaction.fields.getTextInputValue('schedule').trim(); const scheduledAt=scheduleRaw?new Date(scheduleRaw):undefined;
      if(scheduledAt && (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getTime()<=Date.now())) throw new Error('INVALID_ANNOUNCEMENT_SCHEDULE');
      const channelKey=interaction.fields.getTextInputValue('channel').trim() || 'CH_ANNOUNCEMENTS';
      const title=interaction.fields.getTextInputValue('title').trim(); const body=interaction.fields.getTextInputValue('body').trim();
      const announcementId=await workflows.createAnnouncement({guildId:interaction.guild.id,createdBy:interaction.user.id,title,body,target:{channelKey},scheduledAt});
      await workflows.submitAnnouncementForReview({guildId:interaction.guild.id,announcementId,actorId:interaction.user.id});
      const mappings=await mappingMap(deps.database,interaction.guild.id); const reviewChannelId=mappings.get('CH_STAFF_ANNOUNCEMENTS') ?? mappings.get('CH_STAFF_CENTER');
      if(!reviewChannelId) throw new Error('STAFF_ANNOUNCEMENT_CHANNEL_NOT_MAPPED');
      const reviewChannel=await interaction.guild.channels.fetch(reviewChannelId);
      if(!reviewChannel || reviewChannel.type!==ChannelType.GuildText) throw new Error('STAFF_ANNOUNCEMENT_CHANNEL_INVALID');
      const buttons=[new ButtonBuilder().setCustomId(`announcement:approve:publish:${announcementId}`).setLabel('อนุมัติและเผยแพร่').setStyle(ButtonStyle.Success)];
      if(scheduledAt) buttons.push(new ButtonBuilder().setCustomId(`announcement:approve:schedule:${announcementId}`).setLabel('อนุมัติกำหนดเวลา').setStyle(ButtonStyle.Primary));
      await reviewChannel.send({...v2NoticePanel({title:`ตรวจทานประกาศ · ${title}`,description:`${body}\n\n**ผู้เขียน** <@${interaction.user.id}>\n**ช่องปลายทาง** ${channelKey}\n**เวลาที่ขอ** ${scheduledAt?`<t:${Math.floor(scheduledAt.getTime()/1000)}:F>`:'เผยแพร่หลังอนุมัติ'}\n\n-# ประกาศ ${announcementId} · ต้องมีผู้ดูแลคนที่สอง`,tone:'primary',actions:[new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)]}),allowedMentions:{users:[interaction.user.id]}});
      await interaction.reply(v2NoticePanel({title:'ส่งประกาศให้ตรวจสอบแล้ว',description:`กำลังรอผู้ดูแลคนที่สองตรวจทานใน <#${reviewChannel.id}>.`,tone:'success',ephemeral:true})); return true;
    }
    if(id==='event:create:modal'){
      if(!await managerGuard(interaction)){ await interaction.reply(v2NoticePanel({title:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์',description:'ขั้นตอนนี้ต้องใช้สิทธิ์จัดการเซิร์ฟเวอร์',tone:'danger',ephemeral:true})); return true; }
      const startsAt=new Date(interaction.fields.getTextInputValue('starts').trim()); if(!Number.isFinite(startsAt.getTime()) || startsAt.getTime()<=Date.now()) throw new Error('INVALID_EVENT_START');
      const duration=Number(interaction.fields.getTextInputValue('duration').trim()); if(!Number.isInteger(duration) || duration<10 || duration>10080) throw new Error('INVALID_EVENT_DURATION');
      const capRaw=interaction.fields.getTextInputValue('capacity').trim(); const capacity=capRaw?Number(capRaw):undefined; if(capacity!==undefined && (!Number.isInteger(capacity)||capacity<1||capacity>100000)) throw new Error('INVALID_EVENT_CAPACITY');
      const repo=new ServerEventRepository(deps.database); const event=await repo.create({guildId:interaction.guild.id,eventType:interaction.fields.getTextInputValue('type').trim(),title:interaction.fields.getTextInputValue('title').trim(),startsAt,endsAt:new Date(startsAt.getTime()+duration*60_000),capacity,createdBy:interaction.user.id,config:{managed:true}});
      const scheduler=new ScheduledTaskRepository(deps.database); for(const instant of computeReminderInstants(startsAt,[1440,60,10]).filter((date)=>date.getTime()>Date.now())) await scheduler.schedule({guildId:interaction.guild.id,taskType:'EVENT_REMINDER',runAt:instant,timezone:'UTC',dedupKey:`event:${event.eventId}:${instant.toISOString()}`,payload:{eventId:event.eventId,channelKey:'CH_EVENT_CENTER'}});
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'EVENT_CREATE',resourceType:'EVENT',resourceId:event.eventId,afterState:{title:event.title,startsAt:event.startsAt.toISOString(),capacity:event.capacity ?? null}});
      await publishWorkflowEvent(deps,{type:'community.event.created',guildId:interaction.guild.id,actorId:interaction.user.id,aggregateKey:event.eventId,payload:{eventId:event.eventId,eventType:event.eventType,title:event.title,startsAt:event.startsAt.toISOString(),endsAt:event.endsAt?.toISOString()??null,capacity:event.capacity??null}});
      await interaction.reply(eventPayload(event,{registered:0,waitlisted:0,checkedIn:0})); return true;
    }
  }catch(error){ if(!interaction.replied&&!interaction.deferred) await interaction.reply(v2NoticePanel({title:'การส่งขั้นตอนงานล้มเหลวอย่างปลอดภัย',description:safeDiscordError(error,{fallback:'ระบบไม่สามารถบันทึกหรือเปลี่ยนสถานะขั้นตอนงานนี้ได้'}),tone:'danger',ephemeral:true})); return true; }
  return false;
}
