import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import type { Database } from '@autoserver/database';
import { AuditRepository } from '@autoserver/database';
import { CommunityFabricRepository, type FabricDomain, type FabricStatus } from '@autoserver/community-fabric';
import { newCorrelationId } from '@autoserver/core';
import { v2NoticePanel } from '@autoserver/panels';
import { randomUUID } from 'node:crypto';
import { safeDiscordError } from './presentation.js';

export interface FabricActionDependencies { database: Database; }
const createActions:Record<string,FabricDomain>={
  'fabric:project:create':'PROJECT','fabric:care:create':'MEMBER_CARE','fabric:content:create':'CONTENT','fabric:event:create':'EVENT',
};
const listActions:Record<string,FabricDomain>={
  'fabric:project:list':'PROJECT','fabric:content:list':'CONTENT','fabric:event:list':'EVENT',
};
function manager(interaction:ButtonInteraction|ModalSubmitInteraction){return interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)??false;}
const FABRIC_DOMAIN_LABEL:Record<FabricDomain,string>={PROJECT:'โครงการชุมชน',MEMBER_CARE:'ดูแลสมาชิก',CONTENT:'สตูดิโอเนื้อหา',EVENT:'กิจกรรมชุมชน'};
const FABRIC_STATUS_LABEL:Record<FabricStatus,string>={OPEN:'เปิดรับ',IN_REVIEW:'กำลังตรวจสอบ',APPROVED:'อนุมัติแล้ว',ACTIVE:'กำลังใช้งาน',BLOCKED:'ติดข้อจำกัด',COMPLETED:'เสร็จสิ้น',RESOLVED:'แก้ไขแล้ว',REJECTED:'ปฏิเสธแล้ว',CANCELLED:'ยกเลิกแล้ว'};
function label(domain:FabricDomain){return FABRIC_DOMAIN_LABEL[domain];}
function statusLabel(status:FabricStatus){return FABRIC_STATUS_LABEL[status]??status;}
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function handleFabricButton(interaction:ButtonInteraction,deps:FabricActionDependencies):Promise<boolean>{
  if(!interaction.inCachedGuild()) return false;
  const domain=createActions[interaction.customId];
  if(domain){
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ขั้นตอนงานยังไม่พร้อม',description:'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    const modal=new ModalBuilder().setCustomId(`fabric:create:${domain}`).setTitle(`${label(domain)} · คำขอ`);
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('title').setLabel('ชื่อเรื่อง').setStyle(TextInputStyle.Short).setMinLength(3).setMaxLength(100).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('summary').setLabel('สรุป').setStyle(TextInputStyle.Paragraph).setMinLength(10).setMaxLength(1500).setRequired(true)),
    );
    await interaction.showModal(modal);return true;
  }
  const listDomain=listActions[interaction.customId];
  if(listDomain){
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ขั้นตอนงานยังไม่พร้อม',description:'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    const items=await new CommunityFabricRepository(deps.database).listPublic(interaction.guild.id,listDomain,10);
    const body=items.length?items.map((item)=>`**${item.title}** · ${statusLabel(item.status)}\n${item.summary.slice(0,220)}\n-# ${item.work_id}`).join('\n\n'):'ยังไม่มีรายการที่อนุมัติหรือเปิดใช้งานเผยแพร่ในส่วนนี้';
    await interaction.reply(v2NoticePanel({title:`${label(listDomain)} · สารบัญ`,description:body,tone:'ice',ephemeral:true}));return true;
  }
  if(interaction.customId==='fabric:queue'){
    if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์',description:'คิวตรวจงานจำกัดเฉพาะผู้จัดการเซิร์ฟเวอร์ที่ได้รับอนุญาต',tone:'danger',ephemeral:true}));return true;}
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ขั้นตอนงานยังไม่พร้อม',description:'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    const items=await new CommunityFabricRepository(deps.database).listQueue(interaction.guild.id,12);
    const body=items.length?items.map((item)=>`**${label(item.domain)} · ${statusLabel(item.status)}** — ${item.title}\n-# ${item.work_id}`).join('\n\n'):'ไม่มีรายการงานที่เปิดอยู่';
    const row=new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('fabric:review').setLabel('ตรวจสอบด้วยรหัส').setStyle(ButtonStyle.Primary));
    await interaction.reply(v2NoticePanel({title:'คิวตรวจงาน',description:body,tone:'warning',actions:[row],ephemeral:true}));return true;
  }
  if(interaction.customId==='fabric:review'){
    if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์',description:'การตรวจงานจำกัดเฉพาะผู้จัดการเซิร์ฟเวอร์ที่ได้รับอนุญาต',tone:'danger',ephemeral:true}));return true;}
    const modal=new ModalBuilder().setCustomId('fabric:review:modal').setTitle('ตรวจสอบรายการงาน');
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('work_id').setLabel('รหัสรายการงาน').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('decision').setLabel('การตัดสินใจ').setPlaceholder('สถานะ: IN_REVIEW / APPROVED / ACTIVE / BLOCKED / COMPLETED / RESOLVED / REJECTED / CANCELLED').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder<TextInputBuilder>().addComponents(new TextInputBuilder().setCustomId('note').setLabel('บันทึกการตรวจสอบ (ไม่บังคับ)').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false)),
    );
    await interaction.showModal(modal);return true;
  }
  return false;
}

export async function handleFabricModal(interaction:ModalSubmitInteraction,deps:FabricActionDependencies):Promise<boolean>{
  if(!interaction.inCachedGuild()) return false;
  if(interaction.customId.startsWith('fabric:create:')){
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ขั้นตอนงานยังไม่พร้อม',description:'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    const domain=interaction.customId.slice('fabric:create:'.length) as FabricDomain;
    const correlationId=newCorrelationId();
    try{
      const created=await new CommunityFabricRepository(deps.database).create({guildId:interaction.guild.id,createdBy:interaction.user.id,correlationId,submission:{domain,title:interaction.fields.getTextInputValue('title'),summary:interaction.fields.getTextInputValue('summary')}});
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'FABRIC_WORK_CREATE',resourceType:'FABRIC_WORK',resourceId:created.workId,afterState:{domain:created.domain,status:created.status,visibility:created.visibility},result:'SUCCEEDED',correlationId});
      const privacy=created.domain==='MEMBER_CARE'?'คำขอนี้เป็นส่วนตัวและจะไม่แสดงในสารบัญสาธารณะ':'รายการนี้เริ่มในสถานะ OPEN เพื่อรอตรวจ และจะยังไม่เผยแพร่จนกว่าผู้มีสิทธิ์จะอนุมัติ';
      await interaction.reply(v2NoticePanel({title:`${label(created.domain)} · ส่งแล้ว`,description:`เลขอ้างอิง: \`${created.workId}\`\n\n${privacy}`,tone:'success',ephemeral:true}));
    }catch(error){await interaction.reply(v2NoticePanel({title:'ปฏิเสธการส่งข้อมูล',description:safeDiscordError(error,{fallback:'ระบบปฏิเสธคำขอนี้เพื่อรักษาความถูกต้องของข้อมูล'}),tone:'warning',ephemeral:true}));}
    return true;
  }
  if(interaction.customId==='fabric:review:modal'){
    if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์',description:'การตรวจงานจำกัดเฉพาะผู้จัดการเซิร์ฟเวอร์ที่ได้รับอนุญาต',tone:'danger',ephemeral:true}));return true;}
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ขั้นตอนงานยังไม่พร้อม',description:'ขั้นตอนนี้ต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    const workId=interaction.fields.getTextInputValue('work_id').trim();
    const decision=interaction.fields.getTextInputValue('decision').trim().toUpperCase() as FabricStatus;
    const allowed=new Set<FabricStatus>(['IN_REVIEW','APPROVED','ACTIVE','BLOCKED','COMPLETED','RESOLVED','REJECTED','CANCELLED']);
    if(!uuidPattern.test(workId)||!allowed.has(decision)){await interaction.reply(v2NoticePanel({title:'ข้อมูลตรวจสอบไม่ถูกต้อง',description:'ใช้ UUID ของรายการงานแบบเต็มและสถานะการตัดสินใจที่รองรับ',tone:'warning',ephemeral:true}));return true;}
    const correlationId=newCorrelationId();
    try{
      const result=await new CommunityFabricRepository(deps.database).transition({guildId:interaction.guild.id,workId,actorId:interaction.user.id,next:decision,note:interaction.fields.getTextInputValue('note').trim()||undefined,correlationId});
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'FABRIC_WORK_REVIEW',resourceType:'FABRIC_WORK',resourceId:workId,beforeState:{status:result.before},afterState:{status:result.status,domain:result.domain},result:'SUCCEEDED',correlationId});
      await interaction.reply(v2NoticePanel({title:'อัปเดตรายการงานแล้ว',description:`**${result.title}**\n${statusLabel(result.before)} → **${statusLabel(result.status)}**\n-# ${workId}`,tone:'success',ephemeral:true}));
    }catch(error){await interaction.reply(v2NoticePanel({title:'ปฏิเสธการตรวจสอบ',description:safeDiscordError(error,{fallback:'ระบบปฏิเสธการตรวจสอบนี้เพื่อรักษาความถูกต้องของสถานะ'}),tone:'warning',ephemeral:true}));}
    return true;
  }
  return false;
}
