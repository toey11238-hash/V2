import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { AuditRepository, type Database } from '@autoserver/database';
import { makeEvent, newCorrelationId, type EventBus } from '@autoserver/core';
import { GamingRepository, type LfgRecord } from '@autoserver/gaming';
import { v2EditNoticePanel, v2NoticePanel } from '@autoserver/panels';
import { ScheduledTaskRepository } from '@autoserver/scheduler';

export interface GamingActionDependencies { database: Database; bus?: EventBus; }


async function publishSessionEvent(deps:GamingActionDependencies,input:{guildId:string;actorId?:string;type:string;sessionId:string;status?:string;gameKey?:string;participantCount?:number;waitlistCount?:number}):Promise<void>{
  if(!deps.bus)return;
  await deps.bus.publish(makeEvent({type:`gaming.session.${input.type}`,guildId:input.guildId,actorId:input.actorId,correlationId:newCorrelationId(),aggregateKey:input.sessionId,source:'discord-panel',payload:{sessionId:input.sessionId,status:input.status??null,gameKey:input.gameKey??null,participantCount:input.participantCount??null,waitlistCount:input.waitlistCount??null}})).catch(()=>undefined);
}

type XpAwardResult = Awaited<ReturnType<GamingRepository['awardXp']>>;
async function publishXpEvents(deps:GamingActionDependencies,input:{guildId:string;userId:string;gameKey?:string;sourceType:string;sourceId?:string;correlationId:string;xp:XpAwardResult}):Promise<void>{
  if(!deps.bus || input.xp.awarded<=0)return;
  const payload={userId:input.userId,gameKey:input.gameKey??null,sourceType:input.sourceType,sourceId:input.sourceId??null,amount:input.xp.awarded,totalXp:input.xp.totalXp,level:input.xp.level,previousLevel:input.xp.previousLevel,reason:input.xp.reason};
  await deps.bus.publish(makeEvent({type:'gaming.xp.awarded',guildId:input.guildId,actorId:input.userId,correlationId:input.correlationId,aggregateKey:`${input.userId}:${input.gameKey??'global'}`,source:'discord-panel',payload})).catch(()=>undefined);
  if(input.xp.level>input.xp.previousLevel){
    await deps.bus.publish(makeEvent({type:'gaming.level.up',guildId:input.guildId,actorId:input.userId,correlationId:input.correlationId,aggregateKey:`${input.userId}:${input.gameKey??'global'}`,source:'discord-panel',payload})).catch(()=>undefined);
  }
}

function input(customId: string, label: string, style: TextInputStyle, options: { placeholder?: string; required?: boolean; min?: number; max?: number } = {}) {
  const field = new TextInputBuilder().setCustomId(customId).setLabel(label).setStyle(style).setRequired(options.required ?? true);
  if (options.placeholder) field.setPlaceholder(options.placeholder);
  if (options.min !== undefined) field.setMinLength(options.min);
  if (options.max !== undefined) field.setMaxLength(options.max);
  return new ActionRowBuilder<TextInputBuilder>().addComponents(field);
}

function positiveInt(raw: string, code: string, min: number, max: number): number {
  const value = Number(raw.trim());
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(code);
  return value;
}

function futureDate(raw: string, code: string): Date {
  const date = new Date(raw.trim());
  if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error(code);
  return date;
}

const weekdayLookup:Record<string,number>={sun:0,sunday:0,'อา':0,'อาทิตย์':0,mon:1,monday:1,'จ':1,'จันทร์':1,tue:2,tues:2,tuesday:2,'อ':2,'อังคาร':2,wed:3,wednesday:3,'พ':3,'พุธ':3,thu:4,thur:4,thurs:4,thursday:4,'พฤ':4,'พฤหัสบดี':4,fri:5,friday:5,'ศ':5,'ศุกร์':5,sat:6,saturday:6,'ส':6,'เสาร์':6};
function clockMinute(raw:string):number{const match=/^(\d{1,2}):(\d{2})$/.exec(raw.trim());if(!match)throw new Error('GAMING_AVAILABILITY_FORMAT_INVALID');const hour=Number(match[1]),minute=Number(match[2]);if(hour<0||hour>23||minute<0||minute>59)throw new Error('GAMING_AVAILABILITY_FORMAT_INVALID');return hour*60+minute;}
function parseAvailabilityWindows(raw:string):Array<{weekday:number;startMinute:number;endMinute:number}>{
  const lines=raw.split(/[;\n]+/).map((line)=>line.trim()).filter(Boolean);if(!lines.length||lines.length>14)throw new Error('GAMING_AVAILABILITY_FORMAT_INVALID');
  return lines.map((line)=>{const match=/^([A-Za-zก-๙]+|[0-6])\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/.exec(line);if(!match)throw new Error('GAMING_AVAILABILITY_FORMAT_INVALID');const key=match[1]!.toLowerCase();const weekday=/^[0-6]$/.test(key)?Number(key):weekdayLookup[key];if(weekday===undefined)throw new Error('GAMING_AVAILABILITY_FORMAT_INVALID');return{weekday,startMinute:clockMinute(match[2]!),endMinute:clockMinute(match[3]!)}});
}

async function assertEnabledGame(repo: GamingRepository, guildId: string, gameKey: string): Promise<void> {
  const games = await repo.listEnabledGames(guildId);
  if (!games.some((game) => game.gameKey.toLowerCase() === gameKey.toLowerCase())) throw new Error('GAME_NOT_ENABLED');
}

function thaiGamingStatus(status:string):string{
  return ({OPEN:'เปิดรับ',FILLING:'กำลังรวมสมาชิก',FULL:'เต็ม',PLAYING:'กำลังเล่น',FINISHED:'เสร็จสิ้น',CANCELLED:'ยกเลิก',EXPIRED:'หมดอายุ',FORMING:'กำลังจัดทีม',READY:'พร้อม',ACTIVE:'กำลังดำเนินการ',COMPLETED:'เสร็จสมบูรณ์',SCHEDULED:'กำหนดเวลาแล้ว',DRAFT:'ฉบับร่าง',REGISTRATION:'เปิดลงทะเบียน',CHECK_IN:'กำลังเช็กอิน',ARCHIVED:'เก็บถาวร',CLOSED:'ปิด',PENDING:'รอตรวจสอบ',ACCEPTED:'รับแล้ว',REJECTED:'ปฏิเสธแล้ว',WITHDRAWN:'ถอนใบสมัครแล้ว'} as Record<string,string>)[status]??status;
}
function thaiRecruitmentType(type:string):string{
  return ({TEAM_RECRUITING:'ทีมกำลังรับสมาชิก',CLAN_RECRUITING:'แคลนกำลังรับสมาชิก',PLAYER_LFT:'ผู้เล่นกำลังหาทีม',COACH_AVAILABLE:'โค้ชพร้อมร่วมทีม'} as Record<string,string>)[type]??type;
}

function lfgPayload(record: LfgRecord) {
  const closed = !['OPEN', 'FILLING'].includes(record.status);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`gaming:lfg:join:${record.lfgId}`).setLabel('เข้าร่วม').setStyle(ButtonStyle.Success).setDisabled(closed || record.memberIds.length >= record.partySize),
    new ButtonBuilder().setCustomId(`gaming:lfg:leave:${record.lfgId}`).setLabel('ออก').setStyle(ButtonStyle.Secondary).setDisabled(closed),
  );
  const details = [
    `เกม: **${record.gameKey}**`,
    record.mode ? `โหมด: **${record.mode}**` : undefined,
    record.region ? `ภูมิภาค: **${record.region}**` : undefined,
    record.platform ? `แพลตฟอร์ม: **${record.platform}**` : undefined,
    record.rankLabel ? `แรงก์: **${record.rankLabel}**` : undefined,
    `ปาร์ตี้: **${record.memberIds.length}/${record.partySize}**`,
    `สถานะ: **${thaiGamingStatus(record.status)}**`,
    `หมดอายุ: <t:${Math.floor(new Date(record.expiresAt).getTime() / 1000)}:R>`,
  ].filter(Boolean).join('\n');
  return v2EditNoticePanel({
    title: 'ประกาศหาปาร์ตี้',
    description: `${details}\n\n-# รหัสประกาศ ${record.lfgId}`,
    tone: closed ? 'neutral' : 'ice',
    actions: [row],
  });
}

function safeError(error: unknown): string {
  const code = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  const known: Record<string, string> = {
    GAME_NOT_ENABLED: 'เกมนี้ยังไม่ได้เปิดใช้สำหรับเซิร์ฟเวอร์นี้ โปรดตั้งค่าผ่าน /setup ก่อน',
    INVALID_PARTY_SIZE: 'ขนาดปาร์ตี้ต้องเป็นจำนวนเต็มที่อยู่ในช่วงที่รองรับ',
    INVALID_EXPIRY: 'เวลาหมดอายุต้องอยู่ระหว่าง 15 ถึง 1440 นาที',
    LFG_NOT_FOUND: 'ประกาศหาปาร์ตี้นี้ไม่มีอยู่แล้ว',
    LFG_EXPIRED: 'ประกาศหาปาร์ตี้นี้หมดอายุแล้ว',
    LFG_NOT_JOINABLE: 'ประกาศหาปาร์ตี้นี้ไม่ได้เปิดรับสมาชิก',
    LFG_FULL: 'ประกาศหาปาร์ตี้นี้เต็มแล้ว',
    INVALID_TEAM_NAME: 'ชื่อทีมต้องยาว 2-80 ตัวอักษร',
    INVALID_CLAN_NAME: 'ชื่อแคลนต้องยาว 2-80 ตัวอักษร',
    INVALID_TOURNAMENT_NAME: 'ชื่อการแข่งขันต้องยาว 3-100 ตัวอักษร',
    INVALID_TOURNAMENT_FORMAT: 'ใช้รูปแบบ SINGLE_ELIMINATION, DOUBLE_ELIMINATION, ROUND_ROBIN, GROUP_STAGE หรือ CUSTOM',
    INVALID_TEAM_SIZE: 'ขนาดทีมอยู่นอกช่วงที่รองรับ',
    INVALID_MAX_ENTRIES: 'จำนวนผู้เข้าแข่งขันสูงสุดต้องอยู่ระหว่าง 2 ถึง 10000',
    INVALID_SCRIM_DATE: 'เวลาเริ่มซ้อมแข่งขันต้องเป็นวันเวลา ISO ในอนาคตที่ถูกต้อง',
    INVALID_RECRUITMENT_TYPE: 'ชนิดประกาศรับสมาชิกต้องเป็น TEAM_RECRUITING, CLAN_RECRUITING, PLAYER_LFT หรือ COACH_AVAILABLE',
    INVALID_RECRUITMENT_TITLE: 'ชื่อประกาศรับสมาชิกต้องยาว 3-100 ตัวอักษร',
    INVALID_RECRUITMENT_DESCRIPTION: 'คำอธิบายประกาศรับสมาชิกยาวเกินไป',
    INVALID_RECRUITMENT_EXPIRY: 'วันหมดอายุประกาศต้องอยู่ในอนาคตและไม่เกิน 30 วัน',
    RECRUITMENT_NOT_FOUND: 'ประกาศรับสมาชิกนี้ไม่มีอยู่แล้ว',
    RECRUITMENT_NOT_OPEN: 'ประกาศรับสมาชิกนี้ปิดหรือหมดอายุแล้ว',
    RECRUITMENT_OWNER_CANNOT_APPLY: 'เจ้าของประกาศรับสมาชิกสมัครประกาศของตนเองไม่ได้',
    RECRUITMENT_NOT_AUTHORIZED: 'เฉพาะเจ้าของประกาศหรือผู้จัดการเซิร์ฟเวอร์เท่านั้นที่ดูใบสมัครหรือปิดประกาศได้',
    GAMING_AVAILABILITY_FORMAT_INVALID: 'ช่วงเวลาว่างต้องใช้รูปแบบ เช่น จันทร์ 19:00-22:00; อังคาร 20:00-23:00 และกำหนดได้สูงสุด 14 ช่วง',
    GAMING_AVAILABILITY_OVERLAP: 'ช่วงเวลาว่างในวันเดียวกันห้ามทับซ้อนกัน',
    GAMING_AVAILABILITY_TIMEZONE_INVALID: 'ใช้เขตเวลา IANA ที่ถูกต้อง เช่น Asia/Bangkok',
    GAMING_SESSION_NOT_FOUND: 'เซสชันเกมนี้ไม่มีอยู่แล้ว',
    GAMING_SESSION_NOT_JOINABLE: 'เซสชันนี้ไม่ได้เปิดรับสมาชิกแล้ว',
    GAMING_SESSION_FULL: 'เซสชันเกมนี้เต็มแล้ว',
    GAMING_SESSION_NOT_AUTHORIZED: 'เฉพาะผู้จัดเซสชันหรือผู้จัดการเซิร์ฟเวอร์เท่านั้นที่ควบคุมเซสชันนี้ได้',
    GAMING_SESSION_START_INVALID: 'เวลาเริ่มเซสชันต้องเป็นวันเวลา ISO ในอนาคตที่ถูกต้อง',
    GAMING_SESSION_DURATION_INVALID: 'ระยะเวลาเซสชันต้องอยู่ระหว่าง 15-720 นาที',
    GAMING_SESSION_CAPACITY_INVALID: 'ความจุเซสชันต้องอยู่ระหว่าง 2-100 คน',
    GAMING_SESSION_TITLE_INVALID: 'ชื่อเซสชันต้องยาว 3-100 ตัวอักษร',
    GAMING_SESSION_GAME_INVALID: 'ใช้คีย์เกมที่ถูกต้องและเปิดใช้แล้วสำหรับเซสชันนี้',
    GAMING_SESSION_METADATA_INVALID: 'ข้อมูลประกอบเซสชันอยู่นอกขอบเขตที่รองรับ',
    GAMING_SESSION_HOST_CANNOT_LEAVE: 'ผู้จัดเซสชันออกจากเซสชันไม่ได้ ให้ยกเลิกเซสชันแทน',
    GAMING_SESSION_NOT_LEAVABLE: 'ออกจากเซสชันได้เฉพาะก่อนเซสชันเริ่มทำงาน',
    GAMING_SESSION_CONTROL_ACTION_INVALID: 'ใช้ READY, START, COMPLETE หรือ CANCEL',
  };
  if (known[code]) return known[code]!;
  if (code.includes('duplicate key')) return 'มีรายการชื่อนี้อยู่แล้วสำหรับเกมนี้';
  if (code.includes('foreign key')) return 'ข้อมูลระบบเกมที่อ้างอิงบางรายการไม่มีอยู่แล้วหรืออยู่คนละบริบท';
  return `ดำเนินการระบบเกมไม่สำเร็จ รหัสข้อผิดพลาด: ${code.slice(0, 80)}`;
}

async function audit(database: Database, input: { guildId: string; actorId: string; action: string; resourceType: string; resourceId: string; afterState?: Record<string, unknown> }) {
  await new AuditRepository(database).record({
    auditId: randomUUID(), guildId: input.guildId, actorId: input.actorId, action: input.action,
    resourceType: input.resourceType, resourceId: input.resourceId, afterState: input.afterState,
    result: 'SUCCEEDED', correlationId: newCorrelationId(),
  });
}

export async function handleGamingButton(interaction: ButtonInteraction, deps: GamingActionDependencies): Promise<boolean> {
  if (!interaction.inCachedGuild() || !interaction.customId.startsWith('gaming:')) return false;
  if (!deps.database.configured) {
    await interaction.reply(v2NoticePanel({title:'การจัดเก็บสถานะระบบเกมยังไม่พร้อม',description:'การจัดเก็บสถานะระบบเกมต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true}));
    return true;
  }
  const repo = new GamingRepository(deps.database);

  try {
    if (interaction.customId === 'gaming:lfg:create') {
      const modal = new ModalBuilder().setCustomId('gaming:lfg:create:modal').setTitle('สร้างประกาศหาปาร์ตี้');
      modal.addComponents(
        input('game', 'คีย์เกม', TextInputStyle.Short, { placeholder: 'เช่น valorant', min: 2, max: 64 }),
        input('mode', 'โหมด / กิจกรรม', TextInputStyle.Short, { placeholder: 'แรงก์ / เรด / เล่นสบาย', min: 2, max: 80 }),
        input('region_platform', 'ภูมิภาค / แพลตฟอร์ม', TextInputStyle.Short, { placeholder: 'ไทย / พีซี', required: false, max: 80 }),
        input('party_size', 'ขนาดปาร์ตี้', TextInputStyle.Short, { placeholder: '5', min: 1, max: 3 }),
        input('expires_minutes', 'หมดอายุในกี่นาที (15-1440)', TextInputStyle.Short, { placeholder: '120', min: 2, max: 4 }),
      );
      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === 'gaming:lfg:list') {
      const records = await repo.listOpenLfg(interaction.guild.id, undefined, 12);
      const description = records.length
        ? records.map((record) => `• **${record.gameKey}** · ${record.mode ?? 'ทุกโหมด'} · ${record.memberIds.length}/${record.partySize} · <t:${Math.floor(new Date(record.expiresAt).getTime() / 1000)}:R>\n  \`${record.lfgId}\``).join('\n')
        : 'ขณะนี้ไม่มีประกาศหาปาร์ตี้ที่เปิดอยู่';
      await interaction.reply(v2NoticePanel({title:'ประกาศหาปาร์ตี้ที่เปิดอยู่',description,tone:'ice',ephemeral:true}));
      return true;
    }

    if (interaction.customId.startsWith('gaming:lfg:join:')) {
      const lfgId = interaction.customId.slice('gaming:lfg:join:'.length);
      const result = await repo.joinLfg(interaction.guild.id, lfgId, interaction.user.id);
      const correlationId = newCorrelationId();
      const progression = result.joined ? await repo.applyProgressionEvent({ guildId: interaction.guild.id, userId: interaction.user.id, gameKey: result.record.gameKey, eventType: 'gaming.lfg.join', dedupKey: `lfg-join:${lfgId}`, sourceId: lfgId, correlationId, payload: { joined: true } }) : { completedQuests:[], awardedAchievements:[] };
      const xp = result.joined ? await repo.awardXp({ guildId: interaction.guild.id, userId: interaction.user.id, gameKey: result.record.gameKey, sourceType: 'LFG_JOIN', sourceId: lfgId, amount: 5, dedupKey: `lfg-join:${lfgId}:xp`, correlationId }) : null;
      await audit(deps.database, { guildId: interaction.guild.id, actorId: interaction.user.id, action: 'LFG_JOIN', resourceType: 'LFG', resourceId: lfgId, afterState: { joined: result.joined, status: result.record.status, memberCount: result.record.memberIds.length, xpAwarded: xp?.awarded ?? 0, completedQuests: progression.completedQuests, achievements: progression.awardedAchievements } });
      if(xp) await publishXpEvents(deps,{guildId:interaction.guild.id,userId:interaction.user.id,gameKey:result.record.gameKey,sourceType:'LFG_JOIN',sourceId:lfgId,correlationId,xp});
      await interaction.update(lfgPayload(result.record));
      return true;
    }

    if (interaction.customId.startsWith('gaming:lfg:leave:')) {
      const lfgId = interaction.customId.slice('gaming:lfg:leave:'.length);
      const record = await repo.leaveLfg(interaction.guild.id, lfgId, interaction.user.id);
      await audit(deps.database, { guildId: interaction.guild.id, actorId: interaction.user.id, action: 'LFG_LEAVE', resourceType: 'LFG', resourceId: lfgId, afterState: { status: record.status, memberCount: record.memberIds.length } });
      await interaction.update(lfgPayload(record));
      return true;
    }

    if (interaction.customId === 'gaming:availability:set') {
      const modal=new ModalBuilder().setCustomId('gaming:availability:set:modal').setTitle('ช่วงเวลาเล่นเกมรายสัปดาห์');
      modal.addComponents(
        input('game','คีย์เกม',TextInputStyle.Short,{placeholder:'เช่น valorant',min:2,max:64}),
        input('timezone','เขตเวลา',TextInputStyle.Short,{placeholder:'เช่น Asia/Bangkok',min:1,max:80}),
        input('windows','ช่วงเวลารายสัปดาห์',TextInputStyle.Paragraph,{placeholder:'จันทร์ 19:00-22:00; พุธ 20:00-23:00',min:8,max:1000}),
      );
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:availability:recommend') {
      const modal=new ModalBuilder().setCustomId('gaming:availability:recommend:modal').setTitle('หาช่วงเวลาเล่นร่วมกัน');
      modal.addComponents(input('game','คีย์เกม',TextInputStyle.Short,{placeholder:'เช่น valorant',min:2,max:64}),input('timezone','กลุ่มเขตเวลา',TextInputStyle.Short,{placeholder:'เช่น Asia/Bangkok',min:1,max:80}),input('minimum','ผู้เล่นขั้นต่ำ / นาที',TextInputStyle.Short,{placeholder:'3 / 60',min:3,max:12}));
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:session:create') {
      const modal=new ModalBuilder().setCustomId('gaming:session:create:modal').setTitle('สร้างเซสชันเกม');
      modal.addComponents(
        input('game','คีย์เกม',TextInputStyle.Short,{min:2,max:64}),
        input('title','ชื่อเซสชัน',TextInputStyle.Short,{placeholder:'คืนเล่นแรงก์ / ซ้อมเรด',min:3,max:100}),
        input('starts_at','เวลาเริ่ม (ISO 8601)',TextInputStyle.Short,{placeholder:'เช่น 2026-08-20T20:00:00+07:00',min:10,max:40}),
        input('duration','ระยะเวลาเป็นนาที (15-720)',TextInputStyle.Short,{placeholder:'120',min:2,max:3}),
        input('capacity','ความจุ (2-100)',TextInputStyle.Short,{placeholder:'5',min:1,max:3}),
      );
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:session:list') {
      const sessions=await repo.listUpcomingSessions(interaction.guild.id,undefined,12);
      const description=sessions.length?sessions.map((session)=>`• **${session.title}** · ${session.gameKey} · ${session.participantIds.length}/${session.capacity}${session.waitlistedUserIds.length?` · รายชื่อรอ ${session.waitlistedUserIds.length}/${session.waitlistCapacity}`:''} · เช็กอินแล้ว ${session.checkedInUserIds.length} · <t:${Math.floor(new Date(session.startsAt).getTime()/1000)}:F>\n  \`${session.sessionId}\``).join('\n'):'ไม่มีเซสชันเกมที่กำลังจะมาถึงซึ่งเปิดอยู่';
      const joinable=sessions.slice(0,5);const actions=joinable.length?[
        new ActionRowBuilder<ButtonBuilder>().addComponents(...joinable.map((session)=>new ButtonBuilder().setCustomId(`gaming:session:join:${session.sessionId}`).setLabel(`${session.participantIds.length>=session.capacity?'รายชื่อรอ':'เข้าร่วม'} ${session.title.slice(0,19)}`).setStyle(ButtonStyle.Success))),
        new ActionRowBuilder<ButtonBuilder>().addComponents(...joinable.map((session)=>new ButtonBuilder().setCustomId(`gaming:session:checkin:${session.sessionId}`).setLabel(`เช็กอิน ${session.title.slice(0,18)}`).setStyle(ButtonStyle.Primary))),
        new ActionRowBuilder<ButtonBuilder>().addComponents(...joinable.map((session)=>new ButtonBuilder().setCustomId(`gaming:session:leave:${session.sessionId}`).setLabel(`ออก ${session.title.slice(0,22)}`).setStyle(ButtonStyle.Secondary))),
      ]:undefined;
      await interaction.reply(v2NoticePanel({title:'เซสชันเกมที่กำลังจะมาถึง',description:`${description.slice(0,3800)}\n\n-# เวลาที่แสดงเป็นเวลาตามกำหนดจริง รายละเอียดช่วงเวลาว่างยังเป็นข้อมูลส่วนตัวของสมาชิก`,tone:'ice',ephemeral:true,actions}));return true;
    }

    if (interaction.customId.startsWith('gaming:session:join:')) {
      const sessionId=interaction.customId.slice('gaming:session:join:'.length);const result=await repo.joinSession(interaction.guild.id,sessionId,interaction.user.id);const correlationId=newCorrelationId();
      const progression=result.joined?await repo.applyProgressionEvent({guildId:interaction.guild.id,userId:interaction.user.id,gameKey:result.record.gameKey,eventType:'gaming.session.join',dedupKey:`gaming-session-join:${sessionId}`,sourceId:sessionId,correlationId,payload:{joined:true}}):{completedQuests:[],awardedAchievements:[]};
      const xp=result.joined?await repo.awardXp({guildId:interaction.guild.id,userId:interaction.user.id,gameKey:result.record.gameKey,sourceType:'SESSION_JOIN',sourceId:sessionId,amount:5,dedupKey:`gaming-session-join:${sessionId}:xp`,correlationId}):null;
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:result.waitlisted?'GAMING_SESSION_WAITLIST':'GAMING_SESSION_JOIN',resourceType:'GAMING_SESSION',resourceId:sessionId,afterState:{joined:result.joined,waitlisted:result.waitlisted,participantCount:result.record.participantIds.length,waitlistCount:result.record.waitlistedUserIds.length,xpAwarded:xp?.awarded ?? 0,completedQuests:progression.completedQuests,achievements:progression.awardedAchievements}});
      if(xp) await publishXpEvents(deps,{guildId:interaction.guild.id,userId:interaction.user.id,gameKey:result.record.gameKey,sourceType:'SESSION_JOIN',sourceId:sessionId,correlationId,xp});
      await publishSessionEvent(deps,{guildId:interaction.guild.id,actorId:interaction.user.id,type:result.waitlisted?'waitlisted':'joined',sessionId,status:result.record.status,gameKey:result.record.gameKey,participantCount:result.record.participantIds.length,waitlistCount:result.record.waitlistedUserIds.length});
      const waitlistNote=result.waitlisted?'\n\n-# การลงชื่อในรายชื่อรอยังไม่ได้รับความก้าวหน้าจนกว่าจะถูกเลื่อนเข้าร่วม':'';
      await interaction.reply(v2NoticePanel({title:result.joined?'เข้าร่วมเซสชันแล้ว':result.waitlisted?'เพิ่มเข้ารายชื่อรอแล้ว':'ลงทะเบียนไว้แล้ว',description:`**${result.record.title}** · ${result.record.participantIds.length}/${result.record.capacity}${result.record.waitlistedUserIds.length?` · รายชื่อรอ ${result.record.waitlistedUserIds.length}/${result.record.waitlistCapacity}`:''}\nเริ่ม <t:${Math.floor(new Date(result.record.startsAt).getTime()/1000)}:F>${waitlistNote}`,tone:result.waitlisted?'warning':'success',ephemeral:true}));return true;
    }

    if (interaction.customId.startsWith('gaming:session:leave:')) {
      const sessionId=interaction.customId.slice('gaming:session:leave:'.length);
      const result=await repo.leaveSession(interaction.guild.id,sessionId,interaction.user.id);
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'GAMING_SESSION_LEAVE',resourceType:'GAMING_SESSION',resourceId:sessionId,afterState:{left:result.left,participantCount:result.record.participantIds.length,waitlistCount:result.record.waitlistedUserIds.length,promotedCount:result.promotedUserIds.length}});
      if(result.left)await publishSessionEvent(deps,{guildId:interaction.guild.id,actorId:interaction.user.id,type:'left',sessionId,status:result.record.status,gameKey:result.record.gameKey,participantCount:result.record.participantIds.length,waitlistCount:result.record.waitlistedUserIds.length});
      await interaction.reply(v2NoticePanel({title:result.left?'ออกจากเซสชันแล้ว':'คุณไม่ได้ลงทะเบียนในเซสชันนี้',description:`**${result.record.title}** · ${result.record.participantIds.length}/${result.record.capacity}${result.promotedUserIds.length?`
${result.promotedUserIds.length} สมาชิกจากรายชื่อรอถูกเลื่อนเข้าร่วมอัตโนมัติ`:''}`,tone:result.left?'success':'neutral',ephemeral:true}));return true;
    }

    if (interaction.customId.startsWith('gaming:session:checkin:')) {
      const sessionId=interaction.customId.slice('gaming:session:checkin:'.length);const record=await repo.checkInSession(interaction.guild.id,sessionId,interaction.user.id);
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'GAMING_SESSION_CHECK_IN',resourceType:'GAMING_SESSION',resourceId:sessionId,afterState:{checkedInCount:record.checkedInUserIds.length,participantCount:record.participantIds.length}});
      await publishSessionEvent(deps,{guildId:interaction.guild.id,actorId:interaction.user.id,type:'checked_in',sessionId,status:record.status,gameKey:record.gameKey,participantCount:record.participantIds.length,waitlistCount:record.waitlistedUserIds.length});
      await interaction.reply(v2NoticePanel({title:'บันทึกการเช็กอินเซสชันแล้ว',description:`**${record.title}** · ${record.checkedInUserIds.length}/${record.participantIds.length} สมาชิกที่เข้าร่วมเช็กอินแล้ว`,tone:'success',ephemeral:true}));return true;
    }

    if (interaction.customId === 'gaming:session:attendance') {
      const modal=new ModalBuilder().setCustomId('gaming:session:attendance:modal').setTitle('จัดการการเข้าร่วมเซสชัน');
      modal.addComponents(input('session_id','รหัสเซสชัน',TextInputStyle.Short,{min:32,max:40}),input('user_id','รหัสผู้ใช้สมาชิก',TextInputStyle.Short,{min:5,max:30}),input('action','การดำเนินการ: NO_SHOW / EXCUSE / RESET',TextInputStyle.Short,{min:5,max:10}));
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:session:control') {
      const modal=new ModalBuilder().setCustomId('gaming:session:control:modal').setTitle('ควบคุมเซสชันเกม');
      modal.addComponents(input('session_id','รหัสเซสชัน',TextInputStyle.Short,{min:32,max:40}),input('action','การดำเนินการ: READY / START / COMPLETE / CANCEL',TextInputStyle.Short,{min:5,max:12}));
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:profile:edit') {
      const modal = new ModalBuilder().setCustomId('gaming:profile:edit:modal').setTitle('แก้ไขโปรไฟล์ผู้เล่น');
      modal.addComponents(
        input('game', 'คีย์เกม', TextInputStyle.Short, { placeholder: 'เช่น valorant', min: 2, max: 64 }),
        input('platform', 'แพลตฟอร์ม', TextInputStyle.Short, { placeholder: 'พีซี / PlayStation / Xbox', required: false, max: 50 }),
        input('region', 'ภูมิภาค', TextInputStyle.Short, { placeholder: 'ไทย / เอเชียตะวันออกเฉียงใต้', required: false, max: 50 }),
        input('roles', 'บทบาทที่ต้องการ (คั่นด้วยจุลภาค)', TextInputStyle.Short, { placeholder: 'ควบคุมพื้นที่, ผู้นำทีม', required: false, max: 180 }),
        input('rank', 'แรงก์ / ระดับทักษะ', TextInputStyle.Short, { placeholder: 'ไดมอนด์', required: false, max: 80 }),
      );
      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === 'gaming:profile:view') {
      const [profiles, memberships, progression] = await Promise.all([
        repo.listProfiles(interaction.guild.id, interaction.user.id),
        repo.listMemberships(interaction.guild.id, interaction.user.id),
        repo.progressionSummary(interaction.guild.id, interaction.user.id),
      ]);
      const profileText = profiles.length ? profiles.map((profile) => `**${profile.gameKey}** · ${profile.platform ?? 'ยังไม่ตั้งค่าแพลตฟอร์ม'} · ${profile.region ?? 'ยังไม่ตั้งค่าภูมิภาค'} · ${profile.rankLabel ?? 'ยังไม่ตั้งค่าแรงก์'}${profile.preferredRoles.length ? `\n${profile.preferredRoles.join(', ')}` : ''}`).join('\n\n') : 'ยังไม่มีโปรไฟล์ผู้เล่น ใช้ **แก้ไขโปรไฟล์** เพื่อสร้างโปรไฟล์';
      const teamText = [...memberships.teams.map((team) => `ทีม · **${team.name}** (${team.gameKey}) · ${team.role}\n\`${team.id}\``), ...memberships.clans.map((clan) => `แคลน · **${clan.name}** (${clan.gameKey}) · ${clan.role}\n\`${clan.id}\``)].join('\n') || 'ยังไม่มีสมาชิกภาพทีม/แคลนที่ระบบดูแล';
      const xpText = progression.map((item) => `**${item.gameKey}** · เลเวล ${item.level} · ค่าประสบการณ์ ${item.xp.toLocaleString()}`).join('\n') || 'ยังไม่มีประวัติความก้าวหน้า';
      await interaction.reply(v2NoticePanel({title:`${interaction.user.displayName} · โปรไฟล์ผู้เล่น`,description:`${profileText}\n\n### ทีม / แคลน\n${teamText.slice(0,1200)}\n\n### ความก้าวหน้า\n${xpText.slice(0,1200)}`,tone:'primary',ephemeral:true}));
      return true;
    }

    if (interaction.customId === 'gaming:team:create' || interaction.customId === 'gaming:clan:create') {
      const kind = interaction.customId.includes(':team:') ? 'team' : 'clan';
      const modal = new ModalBuilder().setCustomId(`gaming:${kind}:create:modal`).setTitle(kind === 'team' ? 'สร้างทีม' : 'สร้างแคลน');
      modal.addComponents(
        input('game', 'คีย์เกม', TextInputStyle.Short, { placeholder: 'เช่น valorant', min: 2, max: 64 }),
        input('name', kind === 'team' ? 'ชื่อทีม' : 'ชื่อแคลน', TextInputStyle.Short, { min: 2, max: 80 }),
      );
      await interaction.showModal(modal);
      return true;
    }

    if (interaction.customId === 'gaming:recruitment:create') {
      const modal=new ModalBuilder().setCustomId('gaming:recruitment:create:modal').setTitle('สร้างประกาศรับสมาชิก');
      modal.addComponents(
        input('type','ชนิดประกาศรับสมาชิก',TextInputStyle.Short,{placeholder:'เช่น TEAM_RECRUITING / PLAYER_LFT',min:3,max:32}),
        input('game','คีย์เกม',TextInputStyle.Short,{placeholder:'เช่น valorant',min:2,max:64}),
        input('roles','บทบาท / ตำแหน่ง',TextInputStyle.Short,{placeholder:'ควบคุมพื้นที่, ผู้นำทีม',required:false,max:180}),
        input('region_platform','ภูมิภาค / แพลตฟอร์ม',TextInputStyle.Short,{placeholder:'เอเชียตะวันออกเฉียงใต้ / พีซี',required:false,max:80}),
        input('description','คุณกำลังมองหาอะไร?',TextInputStyle.Paragraph,{placeholder:'ระบุตาราง ช่วงทักษะ และความคาดหวัง รับสมาชิกฟรีเท่านั้น',min:3,max:800}),
      );
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:recruitment:list') {
      const posts=await repo.listRecruitmentPosts(interaction.guild.id,{},12);
      const description=posts.length?posts.map(post=>`• **${post.title}** · ${post.gameKey} · ${thaiRecruitmentType(post.postType)}${post.region?` · ${post.region}`:''}${post.platform?` · ${post.platform}`:''}\n  ${post.preferredRoles.length?post.preferredRoles.join(', '):'เปิดรับทุกบทบาท'} · <t:${Math.floor(new Date(post.expiresAt).getTime()/1000)}:R> · \`${post.recruitmentPostId}\``).join('\n'):'ขณะนี้ยังไม่มีประกาศรับสมาชิกที่เปิดอยู่';
      await interaction.reply(v2NoticePanel({title:'กระดานรับสมาชิก',description:`${description}\n\n-# ใช้ปุ่มสมัครในแผงรับสมาชิกพร้อมรหัสประกาศ`,tone:'violet',ephemeral:true}));return true;
    }

    if (interaction.customId === 'gaming:recruitment:apply') {
      const modal=new ModalBuilder().setCustomId('gaming:recruitment:apply:modal').setTitle('สมัครเข้าร่วมประกาศรับสมาชิก');
      modal.addComponents(input('post_id','รหัสประกาศรับสมาชิก',TextInputStyle.Short,{min:32,max:40}),input('message','ข้อความประกอบใบสมัคร',TextInputStyle.Paragraph,{placeholder:'บทบาท ช่วงเวลาว่าง และประสบการณ์ที่เกี่ยวข้อง',required:false,max:800}));
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:recruitment:applications') {
      const modal=new ModalBuilder().setCustomId('gaming:recruitment:applications:modal').setTitle('ใบสมัครเข้าร่วมทีม');
      modal.addComponents(input('post_id','รหัสประกาศรับสมาชิก',TextInputStyle.Short,{min:32,max:40}));
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:recruitment:close') {
      const modal=new ModalBuilder().setCustomId('gaming:recruitment:close:modal').setTitle('ปิดประกาศรับสมาชิก');
      modal.addComponents(input('post_id','รหัสประกาศรับสมาชิก',TextInputStyle.Short,{min:32,max:40}));
      await interaction.showModal(modal);return true;
    }

    if (interaction.customId === 'gaming:tournament:create') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การสร้างการแข่งขัน',description:'นโยบายความปลอดภัยปัจจุบันจำกัดการสร้างการแข่งขันไว้ที่ผู้จัดการเซิร์ฟเวอร์',tone:'danger',ephemeral:true})); return true;
      }
      const modal = new ModalBuilder().setCustomId('gaming:tournament:create:modal').setTitle('สร้างร่างการแข่งขัน');
      modal.addComponents(
        input('game', 'คีย์เกม', TextInputStyle.Short, { min: 2, max: 64 }),
        input('name', 'ชื่อการแข่งขัน', TextInputStyle.Short, { min: 3, max: 100 }),
        input('format', 'รูปแบบ', TextInputStyle.Short, { placeholder: 'เช่น SINGLE_ELIMINATION', min: 4, max: 32 }),
        input('team_size', 'ผู้เล่นต่อรายการ', TextInputStyle.Short, { placeholder: '5', min: 1, max: 3 }),
        input('max_entries', 'จำนวนรายการสูงสุด', TextInputStyle.Short, { placeholder: '16', min: 1, max: 5 }),
      );
      await interaction.showModal(modal); return true;
    }

    if (interaction.customId === 'gaming:scrim:create') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) {
        await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การกำหนดเวลาซ้อมแข่งขัน',description:'การกำหนดเวลาซ้อมแข่งขันจำกัดเฉพาะผู้จัดการเซิร์ฟเวอร์จนกว่าระบบสิทธิ์หัวหน้าทีมจะเชื่อมครบ',tone:'danger',ephemeral:true})); return true;
      }
      const modal = new ModalBuilder().setCustomId('gaming:scrim:create:modal').setTitle('กำหนดเวลาซ้อมแข่งขันแบบไม่เกี่ยวข้องกับการพนัน');
      modal.addComponents(
        input('game', 'คีย์เกม', TextInputStyle.Short, { min: 2, max: 64 }),
        input('team_a', 'รหัสทีม A', TextInputStyle.Short, { min: 32, max: 40 }),
        input('team_b', 'รหัสทีม B', TextInputStyle.Short, { min: 32, max: 40 }),
        input('best_of', 'แข่งแบบชนะ (เลขคี่)', TextInputStyle.Short, { placeholder: '3', min: 1, max: 3 }),
        input('starts_at', 'เวลาเริ่ม (ISO 8601)', TextInputStyle.Short, { placeholder: 'เช่น 2026-08-20T20:00:00+07:00', min: 10, max: 40 }),
      );
      await interaction.showModal(modal); return true;
    }
  } catch (error) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply(v2NoticePanel({title:'การดำเนินการระบบเกมถูกปฏิเสธอย่างปลอดภัย',description:safeError(error),tone:'danger',ephemeral:true}));
    else if (interaction.deferred && !interaction.replied) await interaction.editReply(v2EditNoticePanel({title:'การดำเนินการระบบเกมถูกปฏิเสธอย่างปลอดภัย',description:safeError(error),tone:'danger'}));
    return true;
  }
  return false;
}

export async function handleGamingModal(interaction: ModalSubmitInteraction, deps: GamingActionDependencies): Promise<boolean> {
  if (!interaction.inCachedGuild() || !interaction.customId.startsWith('gaming:')) return false;
  if (!deps.database.configured) { await interaction.reply(v2NoticePanel({title:'การจัดเก็บสถานะระบบเกมยังไม่พร้อม',description:'การจัดเก็บสถานะระบบเกมต้องใช้ `DATABASE_URL`',tone:'warning',ephemeral:true})); return true; }
  const repo = new GamingRepository(deps.database);

  try {
    if (interaction.customId === 'gaming:availability:set:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const gameKey=interaction.fields.getTextInputValue('game').trim().toLowerCase();
      const timezone=interaction.fields.getTextInputValue('timezone').trim();
      const windows=parseAvailabilityWindows(interaction.fields.getTextInputValue('windows'));
      await assertEnabledGame(repo,interaction.guild.id,gameKey);
      const saved=await repo.replaceAvailabilityWindows(interaction.guild.id,interaction.user.id,gameKey,timezone,windows);
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'GAMING_AVAILABILITY_REPLACE',resourceType:'GAMING_AVAILABILITY',resourceId:`${interaction.user.id}:${gameKey}`,afterState:{gameKey,timezone,windowCount:saved.length}});
      await interaction.editReply(v2EditNoticePanel({title:'บันทึกช่วงเวลาเล่นเกมแล้ว',description:`**${gameKey}** · ${saved.length} ช่วงเวลาส่วนตัวรายสัปดาห์ · ${timezone}\n\n-# ช่วงเวลาว่างแบบดิบจะไม่ถูกเขียนลงบันทึกตรวจสอบ`,tone:'success'}));return true;
    }

    if (interaction.customId === 'gaming:session:create:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const gameKey=interaction.fields.getTextInputValue('game').trim().toLowerCase();
      await assertEnabledGame(repo,interaction.guild.id,gameKey);
      const startsAt=futureDate(interaction.fields.getTextInputValue('starts_at'),'GAMING_SESSION_START_INVALID');
      const durationMinutes=positiveInt(interaction.fields.getTextInputValue('duration'),'GAMING_SESSION_DURATION_INVALID',15,720);
      const capacity=positiveInt(interaction.fields.getTextInputValue('capacity'),'GAMING_SESSION_CAPACITY_INVALID',2,100);
      const record=await repo.createSession({guildId:interaction.guild.id,gameKey,hostUserId:interaction.user.id,title:interaction.fields.getTextInputValue('title'),startsAt,durationMinutes,capacity});
      const scheduler=new ScheduledTaskRepository(deps.database);
      await scheduler.schedule({guildId:interaction.guild.id,taskType:'NOTIFICATION_FANOUT',runAt:new Date(),timezone:'UTC',dedupKey:`notify-fanout:gaming-session:${record.sessionId}:created:root`,payload:{topic:'EVENTS',sourceKey:`gaming-session:${record.sessionId}:created`,title:`เซสชันเกม · ${record.title}`,body:`${record.gameKey} · ${record.participantIds.length}/${record.capacity} · เริ่ม <t:${Math.floor(startsAt.getTime()/1000)}:F>.`,afterUserId:''}});
      const reminderAt=new Date(startsAt.getTime()-15*60_000);
      if(reminderAt.getTime()>Date.now()+30_000) await scheduler.schedule({guildId:interaction.guild.id,taskType:'NOTIFICATION_FANOUT',runAt:reminderAt,timezone:'UTC',dedupKey:`notify-fanout:gaming-session:${record.sessionId}:reminder:root`,payload:{topic:'EVENTS',sourceKey:`gaming-session:${record.sessionId}:reminder`,title:`เซสชันเกมกำลังจะเริ่ม · ${record.title}`,body:`${record.gameKey} จะเริ่มในประมาณ 15 นาที · ${record.participantIds.length}/${record.capacity} เข้าร่วมแล้ว`,afterUserId:''}});
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'GAMING_SESSION_CREATE',resourceType:'GAMING_SESSION',resourceId:record.sessionId,afterState:{gameKey,status:record.status,startsAt:record.startsAt,durationMinutes,capacity,reminderScheduled:reminderAt.getTime()>Date.now()+30_000}});
      await publishSessionEvent(deps,{guildId:interaction.guild.id,actorId:interaction.user.id,type:'created',sessionId:record.sessionId,status:record.status,gameKey:record.gameKey,participantCount:record.participantIds.length,waitlistCount:record.waitlistedUserIds.length});
      await interaction.editReply(v2EditNoticePanel({title:'สร้างเซสชันเกมแล้ว',description:`**${record.title}** · ${record.gameKey}\nเริ่ม <t:${Math.floor(startsAt.getTime()/1000)}:F> · ${durationMinutes} นาที · ${record.participantIds.length}/${capacity}\n\nรหัส \`${record.sessionId}\``,tone:'success'}));return true;
    }

    if (interaction.customId === 'gaming:session:control:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const sessionId=interaction.fields.getTextInputValue('session_id').trim();
      const action=interaction.fields.getTextInputValue('action').trim().toUpperCase();
      const event=action==='READY'?'MARK_READY':action==='START'?'START':action==='COMPLETE'?'COMPLETE':action==='CANCEL'?'CANCEL':null;
      if(!event)throw new Error('GAMING_SESSION_CONTROL_ACTION_INVALID');
      const canManageGuild=interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)??false;
      const record=await repo.transitionSession(interaction.guild.id,sessionId,interaction.user.id,event,canManageGuild);
      if(record.status==='COMPLETED'||record.status==='CANCELLED') await new ScheduledTaskRepository(deps.database).cancelByDedup(interaction.guild.id,'NOTIFICATION_FANOUT',`notify-fanout:gaming-session:${sessionId}:reminder:root`);
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:`GAMING_SESSION_${record.status}`,resourceType:'GAMING_SESSION',resourceId:sessionId,afterState:{status:record.status,participantCount:record.participantIds.length}});
      const liveType=record.status==='READY'?'ready':record.status==='ACTIVE'?'started':record.status==='COMPLETED'?'completed':record.status==='CANCELLED'?'cancelled':'updated';
      await publishSessionEvent(deps,{guildId:interaction.guild.id,actorId:interaction.user.id,type:liveType,sessionId,status:record.status,gameKey:record.gameKey,participantCount:record.participantIds.length,waitlistCount:record.waitlistedUserIds.length});
      await interaction.editReply(v2EditNoticePanel({title:`เซสชัน · ${thaiGamingStatus(record.status)}`,description:`**${record.title}** · ${record.gameKey} · ${record.participantIds.length}/${record.capacity}`,tone:record.status==='CANCELLED'?'warning':'success'}));return true;
    }

    if (interaction.customId === 'gaming:availability:recommend:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const gameKey=interaction.fields.getTextInputValue('game').trim().toLowerCase();const timezone=interaction.fields.getTextInputValue('timezone').trim();const parts=interaction.fields.getTextInputValue('minimum').split('/').map((value)=>Number(value.trim()));
      const minimumParticipants=Number.isInteger(parts[0])?Math.max(2,Math.min(100,parts[0]!)):2;const minimumDuration=Number.isInteger(parts[1])?Math.max(15,Math.min(720,parts[1]!)):30;
      await assertEnabledGame(repo,interaction.guild.id,gameKey);const candidates=await repo.recommendAvailability(interaction.guild.id,gameKey,timezone,minimumParticipants,minimumDuration,10);
      const day=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];const hm=(minute:number)=>`${String(Math.floor(minute/60)).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
      const description=candidates.length?candidates.map((candidate,index)=>`${index+1}. **${day[candidate.weekday]} ${hm(candidate.startMinute)}-${hm(candidate.endMinute)}** · ${candidate.participantCount} สมาชิก · ${candidate.durationMinutes} นาที`).join('\n'):'ไม่พบช่วงเวลาร่วมกันที่ผ่านเกณฑ์ขั้นต่ำในกลุ่มเขตเวลานี้';
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'GAMING_AVAILABILITY_RECOMMEND',resourceType:'GAMING_AVAILABILITY',resourceId:gameKey,afterState:{gameKey,timezone,minimumParticipants,minimumDuration,candidateCount:candidates.length}});
      await interaction.editReply(v2EditNoticePanel({title:'ช่วงเวลาเล่นร่วมกันที่แนะนำ',description:`${description}\n\n-# คำแนะนำใช้ผลรวมช่วงเวลาที่ทับซ้อนกันภายในกลุ่มเขตเวลาเดียวกัน โดยไม่เปิดเผยรหัสสมาชิกหรือกำหนดการดิบ`,tone:candidates.length?'success':'neutral'}));return true;
    }

    if (interaction.customId === 'gaming:session:attendance:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const sessionId=interaction.fields.getTextInputValue('session_id').trim();const targetUserId=interaction.fields.getTextInputValue('user_id').trim();const raw=interaction.fields.getTextInputValue('action').trim().toUpperCase();
      const event=raw==='NO_SHOW'?'MARK_NO_SHOW':raw==='EXCUSE'?'EXCUSE':raw==='RESET'?'RESET':null;if(!event)throw new Error('GAMING_SESSION_ATTENDANCE_ACTION_INVALID');
      const record=await repo.setSessionCheckInState(interaction.guild.id,sessionId,targetUserId,interaction.user.id,event,interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)??false);
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:`GAMING_SESSION_ATTENDANCE_${raw}`,resourceType:'GAMING_SESSION',resourceId:sessionId,afterState:{targetUserId,checkedInCount:record.checkedInUserIds.length,participantCount:record.participantIds.length}});
      await interaction.editReply(v2EditNoticePanel({title:'อัปเดตการเข้าร่วมเซสชันแล้ว',description:`**${record.title}** · ${record.checkedInUserIds.length}/${record.participantIds.length} เช็กอินแล้ว`,tone:'success'}));return true;
    }

    if (interaction.customId === 'gaming:lfg:create:modal') {
      await interaction.deferReply();
      const gameKey = interaction.fields.getTextInputValue('game').trim().toLowerCase();
      await assertEnabledGame(repo, interaction.guild.id, gameKey);
      const partySize = positiveInt(interaction.fields.getTextInputValue('party_size'), 'INVALID_PARTY_SIZE', 2, 100);
      const expiryMinutes = positiveInt(interaction.fields.getTextInputValue('expires_minutes'), 'INVALID_EXPIRY', 15, 1440);
      const [region, platform] = interaction.fields.getTextInputValue('region_platform').split('/').map((value) => value.trim()).filter(Boolean);
      const record = await repo.createLfg({
        guildId: interaction.guild.id, gameKey, ownerUserId: interaction.user.id, partySize,
        mode: interaction.fields.getTextInputValue('mode').trim(), region, platform,
        expiresAt: new Date(Date.now() + expiryMinutes * 60_000),
      });
      await audit(deps.database, { guildId: interaction.guild.id, actorId: interaction.user.id, action: 'LFG_CREATE', resourceType: 'LFG', resourceId: record.lfgId, afterState: { gameKey, partySize, expiresAt: record.expiresAt } });
      await new ScheduledTaskRepository(deps.database).schedule({
        guildId:interaction.guild.id,taskType:'NOTIFICATION_FANOUT',runAt:new Date(),timezone:'UTC',dedupKey:`notify-fanout:lfg:${record.lfgId}:root`,
        payload:{topic:'LFG',sourceKey:`lfg:${record.lfgId}`,title:`หาปาร์ตี้ · ${gameKey}`,body:`${record.mode ?? 'กลุ่ม'} · ${record.memberIds.length}/${record.partySize}${record.region?` · ${record.region}`:''}${record.platform?` · ${record.platform}`:''} · หมดอายุ <t:${Math.floor(new Date(record.expiresAt).getTime()/1000)}:R>.`,afterUserId:''},
      });
      await interaction.editReply(lfgPayload(record));
      return true;
    }

    if (interaction.customId === 'gaming:recruitment:create:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const gameKey=interaction.fields.getTextInputValue('game').trim().toLowerCase();await assertEnabledGame(repo,interaction.guild.id,gameKey);
      const postType=interaction.fields.getTextInputValue('type').trim().toUpperCase() as import('@autoserver/gaming').RecruitmentPostType;
      const [region,platform]=interaction.fields.getTextInputValue('region_platform').split('/').map(value=>value.trim()).filter(Boolean);
      const description=interaction.fields.getTextInputValue('description').trim();const roles=interaction.fields.getTextInputValue('roles').split(',').map(value=>value.trim()).filter(Boolean);
      const record=await repo.createRecruitmentPost({guildId:interaction.guild.id,gameKey,postType,ownerUserId:interaction.user.id,title:`${thaiRecruitmentType(postType)} · ${gameKey}`,description,region,platform,preferredRoles:roles,expiresAt:new Date(Date.now()+7*86_400_000)});
      await new ScheduledTaskRepository(deps.database).schedule({guildId:interaction.guild.id,taskType:'GAMING_RECRUITMENT_EXPIRE',runAt:new Date(record.expiresAt),timezone:'UTC',dedupKey:`recruitment:${record.recruitmentPostId}:expire`,payload:{recruitmentPostId:record.recruitmentPostId}});
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'RECRUITMENT_CREATE',resourceType:'RECRUITMENT_POST',resourceId:record.recruitmentPostId,afterState:{gameKey,postType,region,platform,preferredRoles:roles,expiresAt:record.expiresAt}});
      await interaction.editReply(v2EditNoticePanel({title:'เปิดประกาศรับสมาชิกแล้ว',description:`**${record.title}**\nเปิด **7 วัน** · รหัส \`${record.recruitmentPostId}\``,tone:'success'}));return true;
    }

    if (interaction.customId === 'gaming:recruitment:apply:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});const recruitmentPostId=interaction.fields.getTextInputValue('post_id').trim();const message=interaction.fields.getTextInputValue('message').trim();
      const result=await repo.applyToRecruitment({guildId:interaction.guild.id,recruitmentPostId,applicantUserId:interaction.user.id,message});
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'RECRUITMENT_APPLY',resourceType:'RECRUITMENT_POST',resourceId:recruitmentPostId,afterState:{created:result.created,applicationId:result.applicationId}});
      await interaction.editReply(v2EditNoticePanel({title:result.created?'ส่งใบสมัครแล้ว':'มีใบสมัครนี้อยู่แล้ว',description:result.created?`รหัส \`${result.applicationId}\``:'ไม่ได้สร้างใบสมัครซ้ำ',tone:result.created?'success':'neutral'}));return true;
    }


    if (interaction.customId === 'gaming:recruitment:applications:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const recruitmentPostId=interaction.fields.getTextInputValue('post_id').trim();
      const canManageGuild=interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)??false;
      const applications=await repo.listRecruitmentApplications({guildId:interaction.guild.id,recruitmentPostId,actorUserId:interaction.user.id,canManageGuild,limit:10});
      const body=applications.length?applications.map(item=>`• <@${item.applicantUserId}> · **${thaiGamingStatus(item.status)}** · \`${item.applicationId}\`\n  ${item.message.slice(0,180)||'ไม่มีข้อความประกอบใบสมัคร'}`).join('\n'):'ยังไม่มีการส่งใบสมัคร';
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'RECRUITMENT_APPLICATIONS_VIEW',resourceType:'RECRUITMENT_POST',resourceId:recruitmentPostId,afterState:{count:applications.length}});
      await interaction.editReply(v2EditNoticePanel({title:'ใบสมัครเข้าร่วมทีม',description:`${body.slice(0,3800)}\n\n-# ข้อความของผู้สมัครจะแสดงเฉพาะเจ้าของประกาศหรือผู้จัดการเซิร์ฟเวอร์`,tone:'violet'}));return true;
    }

    if (interaction.customId === 'gaming:recruitment:close:modal') {
      await interaction.deferReply({flags:MessageFlags.Ephemeral});
      const recruitmentPostId=interaction.fields.getTextInputValue('post_id').trim();
      const canManageGuild=interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)??false;
      const closed=await repo.closeRecruitment(interaction.guild.id,recruitmentPostId,interaction.user.id,canManageGuild);
      if(!closed)throw new Error('RECRUITMENT_NOT_AUTHORIZED');
      await audit(deps.database,{guildId:interaction.guild.id,actorId:interaction.user.id,action:'RECRUITMENT_CLOSE',resourceType:'RECRUITMENT_POST',resourceId:recruitmentPostId});
      await interaction.editReply(v2EditNoticePanel({title:'ปิดประกาศรับสมาชิกแล้ว',description:'ข้อมูลใบสมัครเดิมยังคงอยู่ตามนโยบายตรวจสอบและเก็บรักษาข้อมูล',tone:'success'}));return true;
    }

    if (interaction.customId === 'gaming:profile:edit:modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const gameKey = interaction.fields.getTextInputValue('game').trim().toLowerCase();
      await assertEnabledGame(repo, interaction.guild.id, gameKey);
      const profile = await repo.upsertProfile(interaction.guild.id, {
        userId: interaction.user.id, gameKey,
        platform: interaction.fields.getTextInputValue('platform').trim() || undefined,
        region: interaction.fields.getTextInputValue('region').trim() || undefined,
        preferredRoles: interaction.fields.getTextInputValue('roles').split(',').map((value) => value.trim()).filter(Boolean),
        rankLabel: interaction.fields.getTextInputValue('rank').trim() || undefined,
        visibility: 'GUILD',
      });
      await audit(deps.database, { guildId: interaction.guild.id, actorId: interaction.user.id, action: 'GAMING_PROFILE_UPSERT', resourceType: 'PLAYER_PROFILE', resourceId: `${interaction.user.id}:${gameKey}`, afterState: { gameKey: profile.gameKey, platform: profile.platform, region: profile.region, rankLabel: profile.rankLabel } });
      await interaction.editReply(v2EditNoticePanel({title:'บันทึกโปรไฟล์ผู้เล่นแล้ว',description:`เกม: **${profile.gameKey}**`,tone:'success'})); return true;
    }

    if (interaction.customId === 'gaming:team:create:modal' || interaction.customId === 'gaming:clan:create:modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const gameKey = interaction.fields.getTextInputValue('game').trim().toLowerCase();
      const name = interaction.fields.getTextInputValue('name').trim();
      await assertEnabledGame(repo, interaction.guild.id, gameKey);
      const isTeam = interaction.customId.includes(':team:');
      const id = isTeam
        ? await repo.createTeam({ guildId: interaction.guild.id, gameKey, name, captainUserId: interaction.user.id })
        : await repo.createClan({ guildId: interaction.guild.id, gameKey, name, leaderUserId: interaction.user.id });
      await audit(deps.database, { guildId: interaction.guild.id, actorId: interaction.user.id, action: isTeam ? 'TEAM_CREATE' : 'CLAN_CREATE', resourceType: isTeam ? 'TEAM' : 'CLAN', resourceId: id, afterState: { gameKey, name } });
      await interaction.editReply(v2EditNoticePanel({title:`${isTeam ? 'ทีม' : 'แคลน'} ถูกสร้างแล้ว`,description:`**${name}**\nรหัสที่ระบบดูแล \`${id}\``,tone:'success'})); return true;
    }

    if (interaction.customId === 'gaming:tournament:create:modal') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) { await interaction.reply(v2NoticePanel({title:'สิทธิ์การสร้างการแข่งขันเปลี่ยนแปลงแล้ว',description:'ผู้ดำเนินการนี้ไม่มีสิทธิ์สร้างการแข่งขันแล้ว',tone:'danger',ephemeral:true})); return true; }
      await interaction.deferReply();
      const gameKey = interaction.fields.getTextInputValue('game').trim().toLowerCase();
      await assertEnabledGame(repo, interaction.guild.id, gameKey);
      const name = interaction.fields.getTextInputValue('name').trim();
      const format = interaction.fields.getTextInputValue('format').trim().toUpperCase();
      const teamSize = positiveInt(interaction.fields.getTextInputValue('team_size'), 'INVALID_TEAM_SIZE', 1, 100);
      const maxEntries = positiveInt(interaction.fields.getTextInputValue('max_entries'), 'INVALID_MAX_ENTRIES', 2, 10000);
      const tournamentId = await repo.createTournament({ guildId: interaction.guild.id, gameKey, name, format, teamSize, maxEntries, createdBy: interaction.user.id, rules: { wageringEnabled: false, entryStakeRequired: false } });
      await audit(deps.database, { guildId: interaction.guild.id, actorId: interaction.user.id, action: 'TOURNAMENT_CREATE', resourceType: 'TOURNAMENT', resourceId: tournamentId, afterState: { gameKey, name, format, teamSize, maxEntries } });
      await interaction.editReply(v2EditNoticePanel({title:name,description:`**${gameKey}** · ${format}\nขนาดทีม: ${teamSize} · จำนวนรายการสูงสุด: ${maxEntries}\nสถานะ: **ฉบับร่าง**\nนโยบายการแข่งขัน: **ไม่เกี่ยวข้องกับการพนัน**\n\n-# การแข่งขัน ${tournamentId}`,tone:'warning'})); return true;
    }

    if (interaction.customId === 'gaming:scrim:create:modal') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild) && interaction.user.id !== interaction.guild.ownerId) { await interaction.reply(v2NoticePanel({title:'สิทธิ์การนัดซ้อมแข่งขันเปลี่ยนแปลงแล้ว',description:'ผู้ดำเนินการนี้ไม่มีสิทธิ์กำหนดเวลาซ้อมแข่งขันแล้ว',tone:'danger',ephemeral:true})); return true; }
      await interaction.deferReply();
      const gameKey = interaction.fields.getTextInputValue('game').trim().toLowerCase();
      await assertEnabledGame(repo, interaction.guild.id, gameKey);
      const startsAt = futureDate(interaction.fields.getTextInputValue('starts_at'), 'INVALID_SCRIM_DATE');
      const bestOf = positiveInt(interaction.fields.getTextInputValue('best_of'), 'INVALID_BEST_OF', 1, 99);
      const scrimId = await repo.createScrim({ guildId: interaction.guild.id, gameKey, teamAId: interaction.fields.getTextInputValue('team_a').trim(), teamBId: interaction.fields.getTextInputValue('team_b').trim(), bestOf, startsAt, createdBy: interaction.user.id, rules: { wageringEnabled: false, entryStakeRequired: false } });
      await audit(deps.database, { guildId: interaction.guild.id, actorId: interaction.user.id, action: 'SCRIM_CREATE', resourceType: 'SCRIM', resourceId: scrimId, afterState: { gameKey, bestOf, startsAt: startsAt.toISOString() } });
      await interaction.editReply(v2EditNoticePanel({title:'กำหนดเวลาซ้อมแข่งขันแล้ว',description:`**${gameKey}** · แข่งแบบชนะ ${bestOf}\nเริ่ม <t:${Math.floor(startsAt.getTime() / 1000)}:F>\nนโยบายการแข่งขัน: **ไม่เกี่ยวข้องกับการพนัน**\n\n-# ซ้อมแข่งขัน ${scrimId}`,tone:'violet'})); return true;
    }
  } catch (error) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply(v2NoticePanel({title:'การส่งข้อมูลระบบเกมถูกปฏิเสธอย่างปลอดภัย',description:safeError(error),tone:'danger',ephemeral:true}));
    else await interaction.editReply(v2EditNoticePanel({title:'การส่งข้อมูลระบบเกมถูกปฏิเสธอย่างปลอดภัย',description:safeError(error),tone:'danger'})).catch(() => undefined);
    return true;
  }
  return false;
}
