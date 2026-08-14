import {
  ActionRowBuilder,
  ModalBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type GuildMember,
  type ModalSubmitInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { AuditRepository, type Database } from '@autoserver/database';
import { classifyModerationAction, parseTemporaryRoleDuration, temporaryRoleWarningLeadMs, type ModerationAction } from '@autoserver/moderation';
import { newCorrelationId } from '@autoserver/core';
import { ScheduledTaskRepository } from '@autoserver/scheduler';
import { v2EditNoticePanel, v2NoticePanel } from '@autoserver/panels';
import { safeDiscordError } from './presentation.js';

export interface ModerationActionDependencies { database: Database; }
const MODERATION_ACTION_LABEL:Record<string,string>={WARN:'เตือน',TIMEOUT:'พักการใช้งานชั่วคราว',KICK:'นำออกจากเซิร์ฟเวอร์',BAN:'แบน',UNBAN:'ยกเลิกแบน',DELETE_MESSAGE:'ลบข้อความ',SLOWMODE:'โหมดช้า',LOCK_CHANNEL:'ล็อกช่อง'};
const MODERATION_RISK_LABEL:Record<string,string>={LOW:'ต่ำ',MEDIUM:'ปานกลาง',HIGH:'สูง'};
function moderationActionLabel(value:string){return MODERATION_ACTION_LABEL[value]??value;}
function moderationRiskLabel(value:string){return MODERATION_RISK_LABEL[value]??value;}

function row(id:string,label:string,style:TextInputStyle,opts:{placeholder?:string;required?:boolean;min?:number;max?:number}={}){
  const f=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(opts.required??true);
  if(opts.placeholder) f.setPlaceholder(opts.placeholder); if(opts.min!==undefined) f.setMinLength(opts.min); if(opts.max!==undefined) f.setMaxLength(opts.max);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(f);
}

function actionFromId(customId:string): ModerationAction | null {
  if(customId==='moderation:warn') return 'WARN'; if(customId==='moderation:timeout') return 'TIMEOUT'; if(customId==='moderation:kick') return 'KICK'; if(customId==='moderation:ban') return 'BAN'; return null;
}

function requiredPermission(action:ModerationAction): bigint {
  if(action==='TIMEOUT') return PermissionFlagsBits.ModerateMembers;
  if(action==='KICK') return PermissionFlagsBits.KickMembers;
  if(action==='BAN') return PermissionFlagsBits.BanMembers;
  return PermissionFlagsBits.ManageMessages;
}

function canActOn(actor:GuildMember,target:GuildMember): boolean {
  if(target.id===target.guild.ownerId) return false;
  if(actor.id===actor.guild.ownerId) return true;
  return actor.roles.highest.comparePositionTo(target.roles.highest)>0;
}

async function persist(database:Database,input:{guildId:string;actorId:string;targetId:string;action:ModerationAction;reason:string;result:string;correlationId:string;afterState?:unknown}){
  const actionId=randomUUID();
  await database.requirePool().query(
    `insert into moderation_actions(action_id,guild_id,actor_id,target_user_id,action_type,reason,automated,confidence,result,correlation_id) values($1,$2,$3,$4,$5,$6,false,null,$7,$8)`,
    [actionId,input.guildId,input.actorId,input.targetId,input.action,input.reason,input.result,input.correlationId],
  );
  await new AuditRepository(database).record({auditId:randomUUID(),guildId:input.guildId,actorId:input.actorId,action:`MODERATION_${input.action}`,resourceType:'MEMBER',resourceId:input.targetId,afterState:input.afterState,result:input.result,correlationId:input.correlationId});
  return actionId;
}

export async function handleModerationButton(interaction:ButtonInteraction,deps:ModerationActionDependencies):Promise<boolean>{
  if(!interaction.inCachedGuild()) return false;
  if(interaction.customId==='moderation:temp-role'){
    if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'การจัดเก็บยศชั่วคราวยังไม่พร้อม',description:'การจัดเก็บยศชั่วคราวต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
    if(!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && interaction.user.id!==interaction.guild.ownerId){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การมอบยศชั่วคราว',description:'ต้องมีสิทธิ์จัดการยศเพื่อมอบยศชั่วคราว',tone:'danger',ephemeral:true}));return true;}
    const modal=new ModalBuilder().setCustomId('moderation:temp-role:modal').setTitle('มอบยศชั่วคราวอย่างปลอดภัย');
    modal.addComponents(
      row('target','รหัสผู้ใช้เป้าหมาย',TextInputStyle.Short,{min:15,max:22}),
      row('role','รหัสยศ',TextInputStyle.Short,{min:15,max:22}),
      row('duration','ระยะเวลา (5m–30d)',TextInputStyle.Short,{placeholder:'เช่น 2h',min:2,max:8}),
      row('reason','เหตุผล',TextInputStyle.Paragraph,{min:3,max:1000}),
    );
    await interaction.showModal(modal);return true;
  }
  const action=actionFromId(interaction.customId); if(!action) return false;
  if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'การจัดเก็บสถานะการดูแลชุมชนยังไม่พร้อม',description:'การเก็บบันทึกตรวจสอบการดูแลชุมชนต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
  if(!interaction.member.permissions.has(requiredPermission(action)) && interaction.user.id!==interaction.guild.ownerId){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การดูแลชุมชน',description:`คุณไม่มีสิทธิ์ Discord ที่จำเป็นสำหรับ **${moderationActionLabel(action)}**`,tone:'danger',ephemeral:true}));return true;}
  const decision=classifyModerationAction(action,false);
  const modal=new ModalBuilder().setCustomId(`moderation:${action.toLowerCase()}:modal`).setTitle(`ดำเนินการ${moderationActionLabel(action)}กับสมาชิก`);
  modal.addComponents(row('target','รหัสผู้ใช้เป้าหมาย',TextInputStyle.Short,{min:15,max:22}),row('reason','เหตุผล',TextInputStyle.Paragraph,{min:3,max:1000}));
  if(action==='TIMEOUT') modal.addComponents(row('duration','ระยะเวลาพักการใช้งานเป็นนาที (1-40320)',TextInputStyle.Short,{placeholder:'60',min:1,max:5}));
  if(action==='KICK'||action==='BAN') modal.addComponents(row('confirm',`พิมพ์ ${action} เพื่อยืนยัน`,TextInputStyle.Short,{min:3,max:4}));
  modal.addComponents(row('policy','หมายเหตุนโยบาย (ไม่บังคับ)',TextInputStyle.Short,{required:false,placeholder:`ความเสี่ยง${moderationRiskLabel(decision.risk)} · เริ่มโดยผู้ดูแล`,max:100}));
  await interaction.showModal(modal); return true;
}

export async function handleModerationModal(interaction:ModalSubmitInteraction,deps:ModerationActionDependencies):Promise<boolean>{
  if(!interaction.inCachedGuild()||!interaction.customId.startsWith('moderation:')||!interaction.customId.endsWith(':modal')) return false;
  if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'การจัดเก็บสถานะการดูแลชุมชนยังไม่พร้อม',description:'การเก็บบันทึกตรวจสอบการดูแลชุมชนต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));return true;}
  if(interaction.customId==='moderation:temp-role:modal'){
    if(!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && interaction.user.id!==interaction.guild.ownerId){await interaction.reply(v2NoticePanel({title:'สิทธิ์เปลี่ยนแปลงแล้ว',description:'ผู้ดำเนินการนี้ไม่มีสิทธิ์จัดการยศแล้ว',tone:'danger',ephemeral:true}));return true;}
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    const targetId=interaction.fields.getTextInputValue('target').trim();
    const roleId=interaction.fields.getTextInputValue('role').trim();
    const durationValue=interaction.fields.getTextInputValue('duration').trim();
    const reason=interaction.fields.getTextInputValue('reason').trim();
    const correlationId=newCorrelationId();
    try{
      const durationMs=parseTemporaryRoleDuration(durationValue);
      const target=await interaction.guild.members.fetch(targetId).catch(()=>null);
      const role=await interaction.guild.roles.fetch(roleId).catch(()=>null);
      const botMember=interaction.guild.members.me ?? await interaction.guild.members.fetchMe().catch(()=>null);
      if(!target) throw new Error('TARGET_MEMBER_NOT_FOUND');
      if(!role) throw new Error('TARGET_ROLE_NOT_FOUND');
      if(!botMember) throw new Error('BOT_MEMBER_NOT_FOUND');
      if(role.managed) throw new Error('MANAGED_ROLE_NOT_ASSIGNABLE');
      if(!canActOn(interaction.member,target)) throw new Error('ACTOR_MEMBER_HIERARCHY_BLOCKS_ASSIGNMENT');
      const dangerous=[PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,PermissionFlagsBits.ManageRoles,PermissionFlagsBits.BanMembers,PermissionFlagsBits.KickMembers,PermissionFlagsBits.ModerateMembers,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageWebhooks,PermissionFlagsBits.ManageEvents,PermissionFlagsBits.MentionEveryone];
      if(dangerous.some((permission)=>role.permissions.has(permission))) throw new Error('PRIVILEGED_ROLE_REQUIRES_GOVERNED_WORKFLOW');
      if(botMember.roles.highest.comparePositionTo(role)<=0) throw new Error('BOT_ROLE_HIERARCHY_BLOCKS_ASSIGNMENT');
      if(interaction.user.id!==interaction.guild.ownerId && interaction.member.roles.highest.comparePositionTo(role)<=0) throw new Error('ACTOR_ROLE_HIERARCHY_BLOCKS_ASSIGNMENT');
      const pool=deps.database.requirePool();
      const existing=(await pool.query<{expires_at:Date}>(`select expires_at from temporary_roles where guild_id=$1 and user_id=$2 and role_id=$3 and status='ACTIVE' and expires_at>now() order by expires_at desc limit 1`,[interaction.guild.id,target.id,role.id])).rows[0];
      const baseAt=Math.max(Date.now(),existing?new Date(existing.expires_at).getTime():0);
      const expiresAt=new Date(baseAt+durationMs);
      if(expiresAt.getTime()>Date.now()+90*86_400_000) throw new Error('TEMP_ROLE_TOTAL_WINDOW_OUT_OF_RANGE');
      const eventType=existing?'EXTENDED':'GRANTED';
      await pool.query(
        `insert into temporary_roles(guild_id,user_id,role_id,source,expires_at,status,correlation_id,granted_by,reason,updated_at) values($1,$2,$3,'MODERATION_PANEL',$4,'ACTIVE',$5,$6,$7,now())`,
        [interaction.guild.id,target.id,role.id,expiresAt,correlationId,interaction.user.id,reason],
      );
      await pool.query(`insert into temporary_role_events(event_id,guild_id,user_id,role_id,expires_at,event_type,actor_id,payload,correlation_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),interaction.guild.id,target.id,role.id,expiresAt,eventType,interaction.user.id,{durationMs,reason,previousExpiry:existing?.expires_at??null},correlationId]);
      const dedupKey=`temp-role:${target.id}:${role.id}:${expiresAt.toISOString()}`;
      const warningLead=temporaryRoleWarningLeadMs(durationMs);
      const warningAt=warningLead?new Date(expiresAt.getTime()-warningLead):null;
      const warningDedup=warningAt&&warningAt.getTime()>Date.now()?`temp-role-warn:${target.id}:${role.id}:${expiresAt.toISOString()}`:null;
      const hadRoleBefore=target.roles.cache.has(role.id);
      try{
        await new ScheduledTaskRepository(deps.database).schedule({guildId:interaction.guild.id,taskType:'TEMP_ROLE_EXPIRE',runAt:expiresAt,timezone:'UTC',dedupKey,payload:{userId:target.id,roleId:role.id,expiresAt:expiresAt.toISOString(),correlationId}});
        if(warningAt&&warningDedup) await new ScheduledTaskRepository(deps.database).schedule({guildId:interaction.guild.id,taskType:'TEMP_ROLE_WARN',runAt:warningAt,timezone:'UTC',dedupKey:warningDedup,payload:{userId:target.id,roleId:role.id,expiresAt:expiresAt.toISOString(),correlationId}});
        if(!hadRoleBefore) await target.roles.add(role,`ยศชั่วคราว: ${reason}`);
      }catch(error){
        await pool.query(`delete from temporary_roles where guild_id=$1 and user_id=$2 and role_id=$3 and expires_at=$4 and correlation_id=$5`,[interaction.guild.id,target.id,role.id,expiresAt,correlationId]).catch(()=>undefined);
        await pool.query(`insert into temporary_role_events(event_id,guild_id,user_id,role_id,expires_at,event_type,actor_id,payload,correlation_id) values($1,$2,$3,$4,$5,'ROLLBACK',$6,$7,$8)`,[randomUUID(),interaction.guild.id,target.id,role.id,expiresAt,interaction.user.id,{reason:'ธุรกรรมการมอบยศล้มเหลว'},correlationId]).catch(()=>undefined);
        await new ScheduledTaskRepository(deps.database).cancelByDedup(interaction.guild.id,'TEMP_ROLE_EXPIRE',dedupKey).catch(()=>undefined);
        if(warningDedup) await new ScheduledTaskRepository(deps.database).cancelByDedup(interaction.guild.id,'TEMP_ROLE_WARN',warningDedup).catch(()=>undefined);
        if(!hadRoleBefore&&target.roles.cache.has(role.id)) await target.roles.remove(role,'ย้อนคืนการมอบยศชั่วคราว').catch(()=>undefined);
        throw error;
      }
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:`TEMP_ROLE_${eventType}`,resourceType:'ROLE',resourceId:role.id,afterState:{targetUserId:target.id,roleName:role.name,expiresAt:expiresAt.toISOString(),reason,warningAt:warningAt?.toISOString()},result:'SUCCEEDED',correlationId});
      await interaction.editReply(v2EditNoticePanel({title:`ยศชั่วคราว${existing?'ถูกขยายเวลาแล้ว':'ถูกมอบแล้ว'}`,description:`**${role.name}** → <@${target.id}>\nหมดอายุ <t:${Math.floor(expiresAt.getTime()/1000)}:F>${warningAt?`\nแจ้งเตือนก่อนหมดอายุ <t:${Math.floor(warningAt.getTime()/1000)}:R>`:''}`,tone:'success'}));return true;
    }catch(error){
      const code=error instanceof Error?error.message:'UNKNOWN';
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'TEMP_ROLE_GRANT',resourceType:'ROLE',resourceId:roleId||'unknown',afterState:{targetUserId:targetId,duration:durationValue,errorCode:code},result:'FAILED',correlationId}).catch(()=>undefined);
      await interaction.editReply(v2EditNoticePanel({title:'การมอบยศชั่วคราวล้มเหลวอย่างปลอดภัย',description:safeDiscordError(error,{fallback:'การมอบยศชั่วคราวล้มเหลวอย่างปลอดภัย'}),tone:'danger'}));return true;
    }
  }
  const action=interaction.customId.split(':')[1]?.toUpperCase() as ModerationAction;
  if(!['WARN','TIMEOUT','KICK','BAN'].includes(action)){return false;}
  if(!interaction.member.permissions.has(requiredPermission(action)) && interaction.user.id!==interaction.guild.ownerId){await interaction.reply(v2NoticePanel({title:'สิทธิ์เปลี่ยนแปลงแล้ว',description:'การดำเนินการดูแลชุมชนนี้ไม่ได้รับอนุญาตแล้ว',tone:'danger',ephemeral:true}));return true;}
  await interaction.deferReply({flags:MessageFlags.Ephemeral});
  const targetId=interaction.fields.getTextInputValue('target').trim(); const reason=interaction.fields.getTextInputValue('reason').trim(); const correlationId=newCorrelationId();
  const target=await interaction.guild.members.fetch(targetId).catch(()=>null);
  if(!target){await interaction.editReply(v2EditNoticePanel({title:'ไม่พบเป้าหมาย',description:'ไม่พบสมาชิกเป้าหมายในเซิร์ฟเวอร์',tone:'warning'}));return true;}
  if(target.user.bot){await interaction.editReply(v2EditNoticePanel({title:'เป้าหมายถูกยกเว้น',description:'บัญชีบอตไม่ถูกดำเนินการผ่านขั้นตอนดูแลสมาชิกนี้',tone:'warning'}));return true;}
  if(!canActOn(interaction.member,target)){await interaction.editReply(v2EditNoticePanel({title:'ลำดับยศขัดขวางการดำเนินการ',description:'ลำดับยศปัจจุบันไม่อนุญาตให้ดำเนินการดูแลชุมชนนี้',tone:'danger'}));return true;}
  try{
    if(action==='WARN'){
      const dmDelivered=await target.send(`คุณได้รับคำเตือนใน **${interaction.guild.name}** เหตุผล: ${reason}`).then(()=>true).catch(()=>false);
      const actionId=await persist(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,targetId,action,reason,result:'SUCCEEDED',correlationId,afterState:{dmDelivered}});
      await interaction.editReply(v2EditNoticePanel({title:'บันทึกคำเตือนแล้ว',description:`ส่งข้อความส่วนตัวสำเร็จ: **${dmDelivered?'ใช่':'ไม่ใช่'}**\nรหัสการดำเนินการ \`${actionId.slice(0,8)}\``,tone:'success'})); return true;
    }
    if(action==='TIMEOUT'){
      const minutes=Number(interaction.fields.getTextInputValue('duration').trim()); if(!Number.isInteger(minutes)||minutes<1||minutes>40320) throw new Error('INVALID_TIMEOUT_DURATION');
      if(!target.moderatable) throw new Error('TARGET_NOT_MODERATABLE');
      await target.timeout(minutes*60_000,reason);
      const actionId=await persist(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,targetId,action,reason,result:'SUCCEEDED',correlationId,afterState:{minutes,until:new Date(Date.now()+minutes*60_000).toISOString()}});
      await interaction.editReply(v2EditNoticePanel({title:'พักการใช้งานชั่วคราวแล้ว',description:`ระยะเวลา: **${minutes} นาที**\nรหัสการดำเนินการ \`${actionId.slice(0,8)}\``,tone:'warning'})); return true;
    }
    const confirm=interaction.fields.getTextInputValue('confirm').trim().toUpperCase(); if(confirm!==action) throw new Error('CONFIRMATION_MISMATCH');
    if(action==='KICK'){
      if(!target.kickable) throw new Error('TARGET_NOT_KICKABLE'); await target.kick(reason);
      const actionId=await persist(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,targetId,action,reason,result:'SUCCEEDED',correlationId}); await interaction.editReply(v2EditNoticePanel({title:'นำสมาชิกออกแล้ว',description:`รหัสการดำเนินการ \`${actionId.slice(0,8)}\``,tone:'warning'})); return true;
    }
    if(!target.bannable) throw new Error('TARGET_NOT_BANNABLE'); await target.ban({reason,deleteMessageSeconds:0});
    const actionId=await persist(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,targetId,action,reason,result:'SUCCEEDED',correlationId}); await interaction.editReply(v2EditNoticePanel({title:'แบนสมาชิกแล้ว',description:`รหัสการดำเนินการ \`${actionId.slice(0,8)}\``,tone:'danger'})); return true;
  }catch(error){
    const code=error instanceof Error?error.message:'UNKNOWN'; await persist(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,targetId,action,reason,result:'FAILED',correlationId,afterState:{errorCode:code}}).catch(()=>undefined); await interaction.editReply(v2EditNoticePanel({title:'การดูแลชุมชนล้มเหลวอย่างปลอดภัย',description:safeDiscordError(error,{fallback:'การดูแลชุมชนล้มเหลวอย่างปลอดภัย'}),tone:'danger'})); return true;
  }
}
