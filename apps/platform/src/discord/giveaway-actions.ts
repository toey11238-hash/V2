import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, PermissionFlagsBits, TextInputBuilder, TextInputStyle, type ButtonInteraction, type ModalSubmitInteraction } from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { PanelActionDependencies } from './panel-actions.js';
import { GiveawayRepository } from '@autoserver/giveaways';
import { AuditRepository } from '@autoserver/database';
import { newCorrelationId } from '@autoserver/core';
import { v2NoticePanel } from '@autoserver/panels';
import { ScheduledTaskRepository } from '@autoserver/scheduler';
import { safeDiscordError } from './presentation.js';

function manager(interaction:ButtonInteraction|ModalSubmitInteraction){return interaction.inCachedGuild()&&(interaction.guild.ownerId===interaction.user.id||interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)||interaction.member.permissions.has(PermissionFlagsBits.Administrator));}
function durationMs(value:string){const match=/^(\d{1,3})(m|h|d)$/i.exec(value.trim());if(!match)throw new Error('GIVEAWAY_DURATION_INVALID');const n=Number(match[1]);const unit=match[2]!.toLowerCase();return n*(unit==='m'?60_000:unit==='h'?3_600_000:86_400_000);}
function input(id:string,label:string,required=true){return new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(id==='prize'?1000:120));}

export async function handleGiveawayButton(interaction:ButtonInteraction,deps:PanelActionDependencies):Promise<boolean>{
  if(!interaction.customId.startsWith('giveaway:'))return false;if(!interaction.inCachedGuild())return false;if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ยังไม่พร้อมจัดเก็บสถานะกิจกรรมรางวัลชุมชน',description:'กิจกรรมรางวัลแบบเข้าร่วมฟรีต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
  const [,action,giveawayId]=interaction.customId.split(':');const repo=new GiveawayRepository(deps.database);
  try{
    if(action==='create'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การสร้างกิจกรรมรางวัล',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อสร้างกิจกรรมรางวัลชุมชนแบบเข้าร่วมฟรี',tone:'danger',ephemeral:true}));return true;}
      const modal=new ModalBuilder().setCustomId('giveaway:create:modal').setTitle('สร้างกิจกรรมแจกของเข้าร่วมฟรี').addComponents(input('title','ชื่อเรื่อง'),input('prize','รายละเอียดของรางวัล'),input('winners','จำนวนผู้ได้รับรางวัล (1-20)'),input('duration','ระยะเวลา: 30m / 12h / 7d'));
      await interaction.showModal(modal);return true;
    }
    if(action==='list'){
      const rows=await repo.listOpen(interaction.guild.id,15);const lines=rows.map((row:any)=>`• **${row.title}** · ผู้เข้าร่วม ${row.entry_count} ราย · ปิดรับ <t:${Math.floor(new Date(row.closes_at).getTime()/1000)}:R> · \`${String(row.giveaway_id).slice(0,8)}\``);
      await interaction.reply(v2NoticePanel({title:'กิจกรรมรางวัลชุมชนแบบเข้าร่วมฟรีที่เปิดอยู่',description:lines.join('\n')||'ไม่มีกิจกรรมรางวัลชุมชนที่เปิดอยู่',tone:'warning',ephemeral:true}));return true;
    }
    if(action==='enter'&&giveawayId){const result=await repo.enter(interaction.guild.id,giveawayId,interaction.user.id);await interaction.reply(v2NoticePanel({title:result.entered?'บันทึกการเข้าร่วมฟรีแล้ว':'มีรายการเข้าร่วมนี้แล้ว',description:`จำนวนผู้เข้าร่วมทั้งหมด: **${result.count}**.`,tone:result.entered?'success':'neutral',ephemeral:true}));return true;}
    if(action==='draw'&&giveawayId){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การสุ่มผู้ชนะ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อสุ่มผู้ชนะ',tone:'danger',ephemeral:true}));return true;}
      const draw=await repo.draw({guildId:interaction.guild.id,giveawayId,drawnBy:interaction.user.id});const mentions=draw.winners.map((id)=>`<@${id}>`).join(', ');
      await interaction.reply({...v2NoticePanel({title:'สุ่มผลกิจกรรมรางวัลชุมชนเสร็จแล้ว',description:`ผู้ได้รับรางวัล: ${mentions}\nจำนวนผู้เข้าร่วม: **${draw.entrantCount}**\nรอบสุ่ม: **#${draw.drawNo}**\nสแนปช็อตผู้เข้าร่วม: \`${draw.entrantSnapshotHash.slice(0,16)}…\`\n\n-# เข้าร่วมฟรีเท่านั้น · ไม่มีการซื้อ การเดิมพัน หรือค่าเข้าร่วม`,tone:'success'}),allowedMentions:{users:draw.winners}});return true;
    }
    if(action==='reroll'&&giveawayId){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การสุ่มใหม่',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อสุ่มผลอีกครั้ง',tone:'danger',ephemeral:true}));return true;}
      const modal=new ModalBuilder().setCustomId(`giveaway:reroll:modal:${giveawayId}`).setTitle('สุ่มผลกิจกรรมแจกของอีกครั้ง').addComponents(input('reason','เหตุผลที่สุ่มใหม่'));
      await interaction.showModal(modal);return true;
    }
  }catch(error){await interaction.reply(v2NoticePanel({title:'การดำเนินการกิจกรรมรางวัลชุมชนถูกปฏิเสธอย่างปลอดภัย',description:safeDiscordError(error,{fallback:'ระบบปฏิเสธการดำเนินการกิจกรรมรางวัลแบบเข้าร่วมฟรีอย่างปลอดภัย'}),tone:'danger',ephemeral:true})).catch(()=>undefined);return true;}
  return false;
}

export async function handleGiveawayModal(interaction:ModalSubmitInteraction,deps:PanelActionDependencies):Promise<boolean>{
  if(!interaction.customId.startsWith('giveaway:'))return false;if(!interaction.inCachedGuild())return false;if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ยังไม่พร้อมจัดเก็บสถานะกิจกรรมรางวัลชุมชน',description:'กิจกรรมรางวัลแบบเข้าร่วมฟรีต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}const repo=new GiveawayRepository(deps.database);
  try{
    if(interaction.customId==='giveaway:create:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const title=interaction.fields.getTextInputValue('title');const prize=interaction.fields.getTextInputValue('prize');const winners=Number(interaction.fields.getTextInputValue('winners'));const closesAt=new Date(Date.now()+durationMs(interaction.fields.getTextInputValue('duration')));
      const giveawayId=await repo.create({guildId:interaction.guild.id,channelId:interaction.channelId,title,prizeDescription:prize,winnerCount:winners,closesAt,createdBy:interaction.user.id});
      const channel=interaction.channel;if(!channel||!channel.isTextBased()||!('send' in channel))throw new Error('GIVEAWAY_CHANNEL_INVALID');
      const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`giveaway:enter:${giveawayId}`).setLabel('เข้าร่วมฟรี').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`giveaway:draw:${giveawayId}`).setLabel('สุ่มผู้ชนะ').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`giveaway:reroll:${giveawayId}`).setLabel('สุ่มใหม่พร้อมเหตุผล').setStyle(ButtonStyle.Secondary));
      const sent=await channel.send({...v2NoticePanel({title,description:`${prize}\n\n**เข้าร่วมฟรีเท่านั้น** ไม่อนุญาตการซื้อ การชำระเงิน หรือการเดิมพัน\nปิดรับ <t:${Math.floor(closesAt.getTime()/1000)}:R> · ผู้ได้รับรางวัล: **${winners}**\n\n-# รางวัล ${giveawayId.slice(0,8)} · การสุ่มตรวจสอบย้อนหลังได้`,tone:'warning',actions:[row]}),allowedMentions:{parse:[]}});await repo.attachMessage(interaction.guild.id,giveawayId,sent.id);
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'GIVEAWAY_CREATE',resourceType:'GIVEAWAY',resourceId:giveawayId,afterState:{closesAt:closesAt.toISOString(),winnerCount:winners,freeEntry:true},result:'SUCCEEDED',correlationId:newCorrelationId()});await interaction.reply(v2NoticePanel({title:'สร้างกิจกรรมรางวัลชุมชนแบบเข้าร่วมฟรีแล้ว',description:sent.url,tone:'success',ephemeral:true}));return true;
    }
    if(interaction.customId.startsWith('giveaway:reroll:modal:')){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const giveawayId=interaction.customId.split(':')[3]!;const reason=interaction.fields.getTextInputValue('reason').trim();if(reason.length<3)throw new Error('REROLL_REASON_REQUIRED');const draw=await repo.draw({guildId:interaction.guild.id,giveawayId,drawnBy:interaction.user.id,reason,allowReroll:true});await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'GIVEAWAY_REROLL',resourceType:'GIVEAWAY',resourceId:giveawayId,afterState:{drawNo:draw.drawNo,winners:draw.winners,reason,entrantSnapshotHash:draw.entrantSnapshotHash},result:'SUCCEEDED',correlationId:newCorrelationId()});await interaction.reply({...v2NoticePanel({title:`สุ่มใหม่รอบที่ #${draw.drawNo}`,description:`ผู้ได้รับรางวัล: ${draw.winners.map((id)=>`<@${id}>`).join(', ')}\nบันทึกเหตุผลไว้ในร่องรอยตรวจสอบแล้ว\n\n-# เข้าร่วมฟรีเท่านั้น`,tone:'success'}),allowedMentions:{users:draw.winners}});return true;
    }
  }catch(error){await interaction.reply(v2NoticePanel({title:'การส่งกิจกรรมรางวัลชุมชนถูกปฏิเสธอย่างปลอดภัย',description:safeDiscordError(error,{fallback:'ระบบปฏิเสธการดำเนินการกิจกรรมรางวัลแบบเข้าร่วมฟรีอย่างปลอดภัย'}),tone:'danger',ephemeral:true})).catch(()=>undefined);return true;}
  return false;
}
