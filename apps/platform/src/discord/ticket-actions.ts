import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  type ButtonInteraction,
  type Guild,
  type TextChannel,
} from 'discord.js';
import { createHash, randomUUID } from 'node:crypto';
import { AuditRepository, ResourceMappingRepository, type Database } from '@autoserver/database';
import { ScheduledTaskRepository } from '@autoserver/scheduler';
import { TicketRepository, type TicketRecord } from '@autoserver/tickets';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';
import { v2EditNoticePanel, v2NoticePanel } from '@autoserver/panels';
import { safeDiscordError } from './presentation.js';
import { presentSystemValue } from '@autoserver/localization';

export interface TicketActionDependencies { database: Database; bus?: EventBus; }

async function publishTicketEvent(deps:TicketActionDependencies,input:{type:string;guildId:string;actorId?:string;ticket:TicketRecord;correlationId?:string;payload?:Record<string,unknown>}):Promise<void>{
  if(!deps.bus)return;
  await deps.bus.publish(makeEvent({type:input.type,guildId:input.guildId,actorId:input.actorId,correlationId:input.correlationId??newCorrelationId(),aggregateKey:input.ticket.ticketId,source:'discord-panel',payload:{ticketId:input.ticket.ticketId,ticketNumber:input.ticket.ticketNumber,status:input.ticket.status,channelId:input.ticket.channelId??null,...input.payload}})).catch(()=>undefined);
}

export function ticketControls(ticketId: string, closed = false) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  if (closed) {
    row.addComponents(new ButtonBuilder().setCustomId(`ticket:reopen:${ticketId}`).setLabel('เปิดอีกครั้ง').setStyle(ButtonStyle.Primary));
  } else {
    row.addComponents(
      new ButtonBuilder().setCustomId(`ticket:claim:${ticketId}`).setLabel('รับเรื่อง').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket:transcript:${ticketId}`).setLabel('ภาพบันทึก').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket:close:${ticketId}`).setLabel('ปิด').setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

async function staffRoleIds(database: Database, guildId: string): Promise<string[]> {
  const mappings = await new ResourceMappingRepository(database).list(guildId);
  const byKey = new Map(mappings.map((row) => [row.logicalKey,row.discordId]));
  return ['ROLE_SUPPORT','ROLE_TICKET_STAFF','ROLE_MODERATOR','ROLE_SERVER_MANAGER','ROLE_ADMINISTRATOR'].map((key)=>byKey.get(key)).filter(Boolean) as string[];
}

async function isStaff(interaction: ButtonInteraction, database: Database): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  if (interaction.user.id===interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return true;
  return (await staffRoleIds(database,interaction.guild.id)).some((id)=>interaction.member.roles.cache.has(id));
}

async function recordEvent(database: Database, input: { ticketId:string; guildId:string; actorId?:string; eventType:string; payload?:Record<string,unknown>; correlationId?:string }) {
  const correlationId=input.correlationId ?? newCorrelationId();
  await database.requirePool().query(`insert into ticket_events(ticket_event_id,ticket_id,guild_id,actor_id,event_type,payload,correlation_id) values($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),input.ticketId,input.guildId,input.actorId ?? null,input.eventType,input.payload ?? {},correlationId]);
  return correlationId;
}

export async function createAndStoreTicketTranscript(input: { guild: Guild; database: Database; ticket: TicketRecord; createdBy?: string; maxMessages?: number }): Promise<{ transcriptId:string; messageCount:number; hash:string } | null> {
  if (!input.ticket.channelId) return null;
  const channel=await input.guild.channels.fetch(input.ticket.channelId).catch(()=>null);
  if (!channel || channel.type!==ChannelType.GuildText) return null;
  const max=Math.max(50,Math.min(2000,input.maxMessages ?? 1000));
  const messages: Array<Record<string,unknown>>=[];
  let before:string|undefined;
  while(messages.length<max){
    const batch=await channel.messages.fetch({limit:Math.min(100,max-messages.length),...(before?{before}:{})});
    if(!batch.size) break;
    for(const message of batch.values()) messages.push({id:message.id,authorId:message.author.id,authorName:message.author.username,createdAt:message.createdAt.toISOString(),content:message.content,attachments:[...message.attachments.values()].map((a)=>({id:a.id,name:a.name,url:a.url,size:a.size,contentType:a.contentType}))});
    const oldest=batch.last(); if(!oldest || batch.size<100) break; before=oldest.id;
  }
  messages.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
  const content={schemaVersion:1,ticketId:input.ticket.ticketId,ticketNumber:input.ticket.ticketNumber,guildId:input.ticket.guildId,channelId:channel.id,capturedAt:new Date().toISOString(),messages};
  const hash=createHash('sha256').update(JSON.stringify(content)).digest('hex');
  const transcriptId=randomUUID();
  const row=await input.database.requirePool().query<{transcript_id:string}>(`insert into ticket_transcripts(transcript_id,ticket_id,guild_id,channel_id,message_count,content,content_hash,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(ticket_id,content_hash) do update set created_at=now() returning transcript_id`,[transcriptId,input.ticket.ticketId,input.ticket.guildId,channel.id,messages.length,content,hash,input.createdBy ?? null]);
  return {transcriptId:row.rows[0]!.transcript_id,messageCount:messages.length,hash};
}

async function channelForTicket(guild: Guild, ticket: TicketRecord): Promise<TextChannel | null> {
  if(!ticket.channelId) return null;
  const channel=await guild.channels.fetch(ticket.channelId).catch(()=>null);
  return channel?.type===ChannelType.GuildText ? channel : null;
}

export async function handleTicketButton(interaction: ButtonInteraction,deps:TicketActionDependencies):Promise<boolean>{
  if(!interaction.inCachedGuild() || !interaction.customId.startsWith('ticket:')) return false;
  const [_,action,ticketId]=interaction.customId.split(':');
  if(!ticketId || !['claim','transcript','close','reopen'].includes(action ?? '')) return false;
  if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'การจัดเก็บคำขอช่วยเหลือยังไม่พร้อม',description:'การจัดเก็บคำขอช่วยเหลือต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
  const repo=new TicketRepository(deps.database); const ticket=await repo.get(ticketId);
  if(!ticket || ticket.guildId!==interaction.guild.id){await interaction.reply(v2NoticePanel({title:'ไม่พบคำขอช่วยเหลือ',description:'ไม่พบข้อมูลคำขอช่วยเหลือนี้ในเซิร์ฟเวอร์',tone:'warning',ephemeral:true}));return true;}
  const staff=await isStaff(interaction,deps.database);
  if(action==='claim'){
    if(!staff){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การรับเรื่อง',description:'เฉพาะทีมช่วยเหลือที่ได้รับอนุญาตเท่านั้นที่รับเรื่องได้',tone:'danger',ephemeral:true}));return true;}
    try{const claimed=await repo.claim(ticketId,interaction.guild.id,interaction.user.id); const correlationId=await recordEvent(deps.database,{ticketId,guildId:interaction.guild.id,actorId:interaction.user.id,eventType:'CLAIMED',payload:{assignedStaffId:claimed.assignedStaffId}}); await publishTicketEvent(deps,{type:'ticket.claimed',guildId:interaction.guild.id,actorId:interaction.user.id,ticket:{...ticket,status:claimed.status,assignedStaffId:claimed.assignedStaffId},correlationId,payload:{assignedStaffId:claimed.assignedStaffId}}); await interaction.reply({...v2NoticePanel({title:`รับเรื่อง #${ticket.ticketNumber} แล้ว`,description:`มอบหมายให้ <@${interaction.user.id}>`,tone:'success'}),allowedMentions:{users:[interaction.user.id]}});}catch(error){await interaction.reply(v2NoticePanel({title:'รับเรื่องไม่สำเร็จ',description:safeDiscordError(error,{fallback:'ยังไม่สามารถรับเรื่องนี้ได้ โปรดลองใหม่หรือตรวจสถานะสิทธิ์'}),tone:'danger',ephemeral:true}));} return true;
  }
  if(action==='transcript'){
    if(interaction.user.id!==ticket.openerUserId && !staff){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การบันทึกสำเนาการสนทนา',description:'เฉพาะผู้เปิดเรื่องหรือทีมดูแลที่ได้รับอนุญาตเท่านั้นที่สร้างภาพบันทึกการสนทนาได้',tone:'danger',ephemeral:true}));return true;}
    await interaction.deferReply({flags:MessageFlags.Ephemeral}); const snapshot=await createAndStoreTicketTranscript({guild:interaction.guild,database:deps.database,ticket,createdBy:interaction.user.id});
    if(!snapshot){await interaction.editReply(v2EditNoticePanel({title:'ไม่สามารถบันทึกสำเนาการสนทนาได้',description:'ไม่พบห้องช่วยเหลือ จึงไม่สามารถบันทึกสำเนาการสนทนาได้',tone:'warning'}));return true;}
    await recordEvent(deps.database,{ticketId,guildId:interaction.guild.id,actorId:interaction.user.id,eventType:'TRANSCRIPT_CAPTURED',payload:{transcriptId:snapshot.transcriptId,messageCount:snapshot.messageCount,hash:snapshot.hash}});
    await interaction.editReply(v2EditNoticePanel({title:'จัดเก็บสำเนาการสนทนาแล้ว',description:`**รหัส** \`${snapshot.transcriptId}\`\n**จำนวนข้อความ** ${snapshot.messageCount}\n**แฮช** \`${snapshot.hash.slice(0,16)}…\``,tone:'success'})); return true;
  }
  if(action==='close'){
    if(interaction.user.id!==ticket.openerUserId && !staff){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การปิดเรื่อง',description:'เฉพาะผู้เปิดเรื่องหรือทีมดูแลที่ได้รับอนุญาตเท่านั้นที่ปิดเรื่องนี้ได้',tone:'danger',ephemeral:true}));return true;}
    await interaction.deferReply({flags:MessageFlags.Ephemeral}); const transcript=await createAndStoreTicketTranscript({guild:interaction.guild,database:deps.database,ticket,createdBy:interaction.user.id}).catch(()=>null);
    const closed=await repo.setStatus(ticketId,'CLOSED',staff?interaction.user.id:undefined); const correlationId=await recordEvent(deps.database,{ticketId,guildId:interaction.guild.id,actorId:interaction.user.id,eventType:'CLOSED',payload:{transcriptId:transcript?.transcriptId ?? null}}); await publishTicketEvent(deps,{type:'ticket.closed',guildId:interaction.guild.id,actorId:interaction.user.id,ticket:closed,correlationId,payload:{transcriptId:transcript?.transcriptId??null}});
    const channel=await channelForTicket(interaction.guild,ticket); if(channel){await channel.permissionOverwrites.edit(ticket.openerUserId,{SendMessages:false},{reason:`Ticket ${ticket.ticketNumber} · ปิดแล้ว`}).catch(()=>undefined); if(!channel.name.startsWith('closed-')) await channel.setName(`closed-${channel.name}`.slice(0,100),'ปิดเรื่องแล้ว').catch(()=>undefined); await channel.send({...v2NoticePanel({title:'ปิดเรื่องแล้ว',description:`ปิดโดย <@${interaction.user.id}>.`,tone:'neutral',actions:[ticketControls(ticketId,true)]}),allowedMentions:{users:[interaction.user.id]}}).catch(()=>undefined);}
    await new ScheduledTaskRepository(deps.database).schedule({guildId:interaction.guild.id,taskType:'TICKET_ARCHIVE',runAt:new Date(Date.now()+7*86_400_000),timezone:'UTC',dedupKey:`ticket-archive:${ticketId}`,payload:{ticketId}});
    await interaction.editReply(v2EditNoticePanel({title:`คำขอช่วยเหลือ #${ticket.ticketNumber} · ปิดแล้ว`,description:`${transcript?`บันทึกสำเนาการสนทนา \`${transcript.transcriptId}\` แล้ว\n`:''}ระบบกำหนดเก็บถาวรอัตโนมัติใน **7 วัน**`,tone:'success'})); return true;
  }
  if(interaction.user.id!==ticket.openerUserId && !staff){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การเปิดเรื่องอีกครั้ง',description:'เฉพาะผู้เปิดเรื่องหรือทีมดูแลที่ได้รับอนุญาตเท่านั้นที่เปิดเรื่องนี้อีกครั้งได้',tone:'danger',ephemeral:true}));return true;}
  if(!['CLOSED','RESOLVED'].includes(ticket.status)){await interaction.reply(v2NoticePanel({title:'ไม่สามารถเปิดเรื่องนี้อีกครั้งได้',description:`สถานะปัจจุบันคือ **${presentSystemValue(ticket.status)}**`,tone:'warning',ephemeral:true}));return true;}
  const reopened=await repo.setStatus(ticketId,'REOPENED',staff?interaction.user.id:undefined); await new ScheduledTaskRepository(deps.database).cancelByDedup(interaction.guild.id,'TICKET_ARCHIVE',`ticket-archive:${ticketId}`); const correlationId=await recordEvent(deps.database,{ticketId,guildId:interaction.guild.id,actorId:interaction.user.id,eventType:'REOPENED'}); await publishTicketEvent(deps,{type:'ticket.reopened',guildId:interaction.guild.id,actorId:interaction.user.id,ticket:reopened,correlationId});
  const channel=await channelForTicket(interaction.guild,ticket); if(channel){await channel.permissionOverwrites.edit(ticket.openerUserId,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true},{reason:`Ticket ${ticket.ticketNumber} · เปิดใหม่แล้ว`}).catch(()=>undefined); if(channel.name.startsWith('closed-')) await channel.setName(channel.name.slice(7) || `ticket-${ticket.ticketNumber}`,'เปิดเรื่องอีกครั้งแล้ว').catch(()=>undefined); await channel.send({...v2NoticePanel({title:'เปิดเรื่องอีกครั้งแล้ว',description:`เปิดใหม่โดย <@${interaction.user.id}>.`,tone:'success',actions:[ticketControls(ticketId,false)]}),allowedMentions:{users:[interaction.user.id]}}).catch(()=>undefined);}
  await interaction.reply(v2NoticePanel({title:`คำขอช่วยเหลือ #${ticket.ticketNumber} · เปิดใหม่แล้ว`,description:'ผู้เปิดเรื่องส่งข้อความได้อีกครั้ง และยกเลิกงานเก็บถาวรแล้ว',tone:'success',ephemeral:true})); return true;
}
