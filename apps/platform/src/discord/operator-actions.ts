import {
  ActionRowBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { ApprovalRepository, AuditRepository, type Database } from '@autoserver/database';
import { PrivacyExportService, RetentionLegalHoldRepository, RetentionService, type RetentionRule } from '@autoserver/governance';
import { ScheduledTaskRepository } from '@autoserver/scheduler';
import { v2NoticePanel } from '@autoserver/panels';
import { newCorrelationId } from '@autoserver/core';
import { RecommendationService } from '@autoserver/recommendations';
import { IncidentRepository, type IncidentKind, type IncidentSeverity, type IncidentStatus } from '@autoserver/incidents';
import { RecoveryDrillRepository, type RecoveryDrillStatus, type RecoveryDrillType } from '@autoserver/recovery-drills';
import { ResourceBudgetRepository } from '@autoserver/budgets';
import { AdmissionControlRepository } from '@autoserver/admission-control';
import { AuditLogService } from '@autoserver/audit-log';
import { safeDiscordError } from './presentation.js';

export interface OperatorActionDependencies { database: Database; }
function field(id:string,label:string,style:TextInputStyle,opts:{required?:boolean;placeholder?:string;min?:number;max?:number}={}){const v=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(opts.required??true);if(opts.placeholder)v.setPlaceholder(opts.placeholder);if(opts.min!==undefined)v.setMinLength(opts.min);if(opts.max!==undefined)v.setMaxLength(opts.max);return new ActionRowBuilder<TextInputBuilder>().addComponents(v);}
function manager(i:ButtonInteraction|ModalSubmitInteraction){return i.inCachedGuild()&&(i.user.id===i.guild.ownerId||i.member.permissions.has(PermissionFlagsBits.ManageGuild));}
async function audit(database:Database,i:ButtonInteraction|ModalSubmitInteraction,action:string,type:string,id:string,state?:Record<string,unknown>){await new AuditRepository(database).record({auditId:randomUUID(),guildId:i.guild!.id,actorId:i.user.id,action,resourceType:type,resourceId:id,afterState:state,result:'SUCCEEDED',correlationId:newCorrelationId()});}
const operatorUiValues:Record<string,string>={
  READY:'พร้อม',NOT_READY:'ไม่พร้อม',HEALTHY:'ปกติ',DEGRADED:'ผิดปกติ',RUNNING:'กำลังทำงาน',QUEUED:'รอคิว',RETRYING:'กำลังลองใหม่',SUCCEEDED:'สำเร็จ',FAILED:'ล้มเหลว',CANCELLED:'ยกเลิกแล้ว',
  ON:'เปิด',OFF:'ปิด',ENFORCE:'บังคับใช้',OBSERVE:'เฝ้าดู',DISABLED:'ปิดใช้',BALANCED:'สมดุล',CONSERVATIVE:'ระมัดระวัง',MAX_AVAILABILITY:'พร้อมใช้งานสูงสุด',NORMAL:'ปกติ',THROTTLE:'จำกัดงาน',EMERGENCY:'ฉุกเฉิน',
  INFO:'ข้อมูล',LOW:'ต่ำ',MEDIUM:'ปานกลาง',HIGH:'สูง',CRITICAL:'วิกฤต',OPEN:'เปิดอยู่',INVESTIGATING:'กำลังตรวจสอบ',MITIGATING:'กำลังบรรเทา',MONITORING:'เฝ้าติดตาม',RESOLVED:'แก้ไขแล้ว',CLOSED:'ปิดแล้ว',BLOCKED:'ติดขัด',PASSED:'ผ่าน',ACTIVE:'ใช้งาน',RELEASED:'ยกเลิกแล้ว',FULL:'เต็ม',TAIL:'ช่วงท้าย',NONE:'ไม่มี',UNINITIALIZED:'ยังไม่เริ่ม',
  ALERT:'แจ้งเตือน',TEMPORARY_LOCK:'ล็อกชั่วคราว',ESCALATE:'ยกระดับให้ผู้ดูแล',
  MASS_CHANNEL_CREATE:'สร้างช่องจำนวนมากผิดปกติ',MASS_CHANNEL_DELETE:'ลบช่องจำนวนมากผิดปกติ',MASS_ROLE_CREATE:'สร้างยศจำนวนมากผิดปกติ',MASS_ROLE_DELETE:'ลบยศจำนวนมากผิดปกติ',
  SECURITY:'ความปลอดภัย',PLATFORM:'แพลตฟอร์ม',DISCORD:'Discord',DATABASE:'ฐานข้อมูล',INTEGRATION:'การเชื่อมต่อ',CONTENT:'เนื้อหา',OTHER:'อื่น ๆ',
  RESTORE:'กู้คืนข้อมูล',PANEL_REPAIR:'ซ่อมแผงควบคุม',PERMISSION_REPAIR:'ซ่อมสิทธิ์',STARTUP_RECOVERY:'กู้คืนเมื่อเริ่มระบบ',OUTBOX_RECOVERY:'กู้คืนคิวส่งออก',
  RETENTION_DELETE:'ลบข้อมูลตามอายุ',LEGAL_HOLD_RELEASE:'ยกเลิกคำสั่งระงับการลบ',PENDING:'รออนุมัติ',APPROVED:'อนุมัติแล้ว',REJECTED:'ปฏิเสธแล้ว',EXECUTED:'ดำเนินการแล้ว',
  OPERATIONAL:'ข้อมูลปฏิบัติการ',ANALYTICS:'ข้อมูลวิเคราะห์',AUDIT:'บันทึกตรวจสอบ',USER_CONTENT:'เนื้อหาผู้ใช้',ALL:'ทุกประเภทข้อมูล',
  SETUP_APPLY:'ปรับใช้การตั้งค่า',PERMISSION_REPAIR_JOB:'ซ่อมสิทธิ์',RESTORE_APPLY:'ปรับใช้การกู้คืน',
};
function operatorUi(value:unknown):string{const key=String(value??'');return operatorUiValues[key]??key;}

export async function handleOperatorButton(interaction:ButtonInteraction,deps:OperatorActionDependencies):Promise<boolean>{
  if(!interaction.inCachedGuild())return false;const id=interaction.customId;if(!id.startsWith('security:')&&!id.startsWith('status:')&&!id.startsWith('privacy:')&&!id.startsWith('incident:')&&!id.startsWith('drill:'))return false;
  if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:'ขั้นตอนปฏิบัติการนี้ต้องใช้ `DATABASE_URL`',tone:'primary',ephemeral:true}));return true;}
  try{
    if(id==='security:alerts'){
      const rows=(await deps.database.requirePool().query<any>(`select alert_id,alert_type,severity,status,response_tier,created_at from security_alerts where guild_id=$1 and status='OPEN' order by case severity when 'CRITICAL' then 1 when 'HIGH' then 2 when 'MEDIUM' then 3 else 4 end,created_at desc limit 15`,[interaction.guild.id])).rows;
      const text=rows.length?rows.map((r)=>`\`${r.alert_id}\`\n**${operatorUi(r.severity)}** · ${operatorUi(r.alert_type)} · ${operatorUi(r.response_tier??'ALERT')} · <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`).join('\n\n'):'ไม่มีการแจ้งเตือนความปลอดภัยที่เปิดอยู่';
      await interaction.reply(v2NoticePanel({title:'การแจ้งเตือนความปลอดภัยที่ยังเปิดอยู่',description:`${text.slice(0,4000)}\n\n-# การตรวจจับเป็นแบบแนะนำตามระดับ ระบบจะไม่ใช้บทลงโทษอัตโนมัติจากจุดนี้`,tone:rows.some((r)=>['HIGH','CRITICAL'].includes(r.severity))?'danger':'success',ephemeral:true}));return true;
    }
    if(id==='security:resolve'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อปิดการแจ้งเตือนความปลอดภัย',tone:'primary',ephemeral:true}));return true;}
      const m=new ModalBuilder().setCustomId('security:resolve:modal').setTitle('ปิดการแจ้งเตือนความปลอดภัย');m.addComponents(field('id','UUID การแจ้งเตือน',TextInputStyle.Short,{min:36,max:36}),field('note','หมายเหตุการปิดเหตุ',TextInputStyle.Paragraph,{min:3,max:1500}));await interaction.showModal(m);return true;
    }
    if(id==='status:health'){
      const db=await deps.database.health();const gateway=interaction.client.isReady();const ping=gateway?interaction.client.ws.ping:undefined;
      const counts=await deps.database.requirePool().query<any>(`select (select count(*) from jobs where guild_id=$1 and status in ('QUEUED','RUNNING','RETRYING'))::int as jobs,(select count(*) from tickets where guild_id=$1 and status not in ('CLOSED','ARCHIVED'))::int as tickets,(select count(*) from security_alerts where guild_id=$1 and status='OPEN')::int as alerts`,[interaction.guild.id]);const c=counts.rows[0]??{};
      await interaction.reply(v2NoticePanel({title:'สุขภาพแพลตฟอร์มแบบสด',description:`เกตเวย์: **${gateway?'พร้อม':'ไม่พร้อม'}**${ping!==undefined?` · ${ping} มิลลิวินาที`:''}\nฐานข้อมูล: **${db.healthy?'ปกติ':'ผิดปกติ'}**${db.latencyMs!==undefined?` · ${db.latencyMs} มิลลิวินาที`:''}\nงานที่กำลังทำ: **${c.jobs??0}**\nคำขอช่วยเหลือที่เปิดอยู่: **${c.tickets??0}**\nการแจ้งเตือนความปลอดภัยที่เปิดอยู่: **${c.alerts??0}**\n\n-# สแนปช็อตนี้ใช้สถานะเกตเวย์และฐานข้อมูลจริง ไม่มีค่าความคืบหน้าจำลอง`,tone:db.healthy&&gateway?'success':'warning',ephemeral:true}));return true;
    }
    if(id==='status:jobs'){
      const rows=(await deps.database.requirePool().query<any>(`select job_id,type,status,current_step,retry_count,created_at from jobs where guild_id=$1 order by created_at desc limit 12`,[interaction.guild.id])).rows;const text=rows.length?rows.map((r)=>`\`${r.job_id}\` · **${operatorUi(r.type)}** · ${operatorUi(r.status)}${r.current_step?` · ${operatorUi(r.current_step)}`:''}${r.retry_count?` · ลองใหม่ ${r.retry_count}`:''}`).join('\n'):'ไม่มีงานคงทนล่าสุด';await interaction.reply(v2NoticePanel({title:'งานคงทนล่าสุด',description:text.slice(0,4000),tone:'primary',ephemeral:true}));return true;
    }
    if(id==='status:audit-integrity'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ความครบถ้วนของบันทึกตรวจสอบ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อตรวจความครบถ้วนของหลักฐานตรวจสอบ',tone:'primary',ephemeral:true}));return true;}
      const report=await new AuditLogService(deps.database).verifyIntegrityTail(interaction.guild.id,500);
      const tone=report.state==='HEALTHY'?'success':report.state==='UNINITIALIZED'?'warning':'danger';
      const mismatch=report.mismatchCount?`\nหลักฐานไม่ตรงกัน: **${report.mismatchCount}** · ${report.mismatches.slice(0,3).join(', ')}`:'';
      await interaction.reply(v2NoticePanel({title:'ความครบถ้วนของบันทึกตรวจสอบ',description:`สถานะ: **${operatorUi(report.state)}** · ความครอบคลุม **${operatorUi(report.coverage)}**\nลำดับหัวโซ่: **${report.headSequence}** · แฮช \`${report.headHash.slice(0,16)}…\`\nตรวจแล้ว: **${report.checkedEntries}** · คำนวณเนื้อหาใหม่: **${report.recomputedEntries}** · คงไว้เฉพาะแฮช: **${report.hashOnlyEntries}**\nรายการเดิมที่ไม่อยู่ในโซ่: **${report.legacyUnchainedEntries}${report.legacyUnchainedCapped?'+':''}** · ไม่อยู่ในโซ่หลังเริ่มโซ่: **${report.unchainedAfterStart}${report.unchainedAfterStartCapped?'+':''}**${mismatch}\n\n-# เป็นโซ่หลักฐานป้องกันการแก้ไขในฐานข้อมูลเท่านั้น ไม่ใช่พื้นที่จัดเก็บแบบแก้ไม่ได้หรือการรับรองเข้ารหัสภายนอก`,tone,ephemeral:true}));return true;
    }
    if(id==='status:budgets'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'งบทรัพยากร',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อดูหลักฐานงบทรัพยากร',tone:'primary',ephemeral:true}));return true;}
      const policies=await new ResourceBudgetRepository(deps.database).list(interaction.guild.id);const text=policies.map((policy)=>`**${policy.budgetKey}** · ${operatorUi(policy.enabled?policy.mode:'DISABLED')} · ${policy.maxUnits} หน่วย/${policy.windowSeconds} วินาที`).join('\n');
      await interaction.reply(v2NoticePanel({title:'นโยบายงบทรัพยากร',description:`${text.slice(0,3900)}

-# โหมดบังคับใช้จะชะลองานทางเลือก/เบื้องหลังเท่านั้น งานความปลอดภัยและงานช่วยเหลือไม่ผ่านงบส่วนนี้`,tone:'ice',ephemeral:true}));return true;
    }
    if(id==='status:admission'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ควบคุมการรับเข้า',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อดูหลักฐานการรับเข้า',tone:'primary',ephemeral:true}));return true;}
      const repository=new AdmissionControlRepository(deps.database);const policy=await repository.get(interaction.guild.id);const context=await repository.context(interaction.guild.id,'STRUCTURAL');const preview=await repository.evaluate({guildId:interaction.guild.id,operation:'DIAGNOSTIC',actorId:interaction.user.id,correlationId:newCorrelationId(),detail:'ตรวจสถานะนโยบายรับงานโดยผู้ดูแล'});
      await interaction.reply(v2NoticePanel({title:'ควบคุมการรับเข้า',description:`ค่าล่วงหน้า: **${operatorUi(policy.preset)}** · โหมด: **${operatorUi(policy.mode)}**\nหลักฐานแรงกดดัน: **${operatorUi(context.pressure)}** · เหตุวิกฤต: **${context.criticalIncidentOpen?'ใช่':'ไม่'}** · บำรุงรักษา: **${context.maintenanceActive?'ใช่':'ไม่'}**\nเมื่อหลักฐานผลกระทบสูงไม่ทราบค่า: **${policy.failClosedWhenUnknown?'ปฏิเสธแบบปลอดภัย':'อนุญาต'}**\n\n-# งานความปลอดภัย งานช่วยเหลือ และการวินิจฉัยยังได้รับการปกป้อง งานโครงสร้าง ผู้ให้บริการ เบื้องหลัง และงานกลุ่มอาจถูกชะลอ โดยจะไม่ลบหรือลดทรัพยากรเซิร์ฟเวอร์อัตโนมัติ`,tone:context.pressure==='EMERGENCY'?'danger':context.pressure==='THROTTLE'?'warning':'ice',ephemeral:true}));void preview;return true;
    }
    if(id==='status:automation'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ห้องทดลองระบบอัตโนมัติ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อดูหลักฐานระบบอัตโนมัติ',tone:'primary',ephemeral:true}));return true;}
      const [rules,executions]=await Promise.all([deps.database.requirePool().query<any>(`select rule_key,event_type,enabled,version,jsonb_array_length(actions) as action_count from automation_rules where guild_id=$1 order by rule_key limit 15`,[interaction.guild.id]),deps.database.requirePool().query<any>(`select status,budget_decision,count(*)::int as count from automation_executions where guild_id=$1 and created_at>=now()-interval '24 hours' group by status,budget_decision order by status`,[interaction.guild.id])]);
      const ruleText=rules.rows.length?rules.rows.map((row)=>`**${row.rule_key}** · ${row.enabled?'เปิด':'ปิด'} · ${row.event_type} · รุ่น ${row.version} · ${row.action_count} การดำเนินการ`).join('\n'):'ยังไม่ได้ตั้งกฎระบบอัตโนมัติ';const executionText=executions.rows.length?executions.rows.map((row)=>`${operatorUi(row.status)} · งบ ${operatorUi(row.budget_decision??'ไม่ระบุ')} · ${row.count}`).join('\n'):'ไม่มีการทำงานอัตโนมัติใน 24 ชั่วโมงที่ผ่านมา';
      await interaction.reply(v2NoticePanel({title:'สถานะระบบอัตโนมัติขณะทำงาน',description:`${ruleText.slice(0,2600)}\n\n**หลักฐานการทำงาน 24 ชั่วโมง**\n${executionText.slice(0,1000)}\n\n-# ระบบอัตโนมัติทั่วไปปฏิเสธแบบปลอดภัย: ทำได้เฉพาะการแจ้งเตือน/บันทึกตรวจสอบ ไม่ส่งคำขอ HTTP ตามอำเภอใจและไม่แก้ Discord แบบทำลายข้อมูล`,tone:'ice',ephemeral:true}));return true;
    }
    if(id==='status:advisor'){
      const items=await new RecommendationService(deps.database).listOpen(interaction.guild.id,15);
      const text=items.length?items.map((item)=>`**${operatorUi(item.risk)} · ${item.title}**\n${item.reason}\n\`${item.key}\``).join('\n\n'):'ไม่มีคำแนะนำที่เปิดอยู่และมีหลักฐานรองรับ งานวิเคราะห์รายวันจะสร้างคำแนะนำเมื่อถึงเกณฑ์เท่านั้น';
      await interaction.reply(v2NoticePanel({title:'ที่ปรึกษาเซิร์ฟเวอร์',description:`${text.slice(0,4000)}\n\n-# คำแนะนำเป็นแบบไม่ทำลายข้อมูลโดยปริยาย และจะไม่ใช้การเปลี่ยนแปลงความเสี่ยงสูงอัตโนมัติ`,tone:items.some((item)=>item.risk==='HIGH')?'warning':'ice',ephemeral:true}));return true;
    }
    if(id==='incident:list'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ศูนย์เหตุผิดปกติ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อดูหลักฐานเหตุผิดปกติ',tone:'primary',ephemeral:true}));return true;}
      const rows=await new IncidentRepository(deps.database).listOpen(interaction.guild.id,15);
      const text=rows.length?rows.map((item)=>`\`${item.incidentId}\`\n**${operatorUi(item.severity)} · ${operatorUi(item.kind)} · ${operatorUi(item.status)}**\n${item.title}\nผู้ควบคุมเหตุ: ${item.commanderId?`<@${item.commanderId}>`:'ยังไม่มอบหมาย'} · <t:${Math.floor(new Date(item.startedAt).getTime()/1000)}:R>`).join('\n\n'):'ไม่มีเหตุผิดปกติด้านปฏิบัติการที่เปิดอยู่';
      await interaction.reply(v2NoticePanel({title:'เหตุผิดปกติที่ยังเปิดอยู่',description:`${text.slice(0,4000)}\n\n-# สถานะเหตุผิดปกติถูกจัดเก็บแบบคงทนและเห็นได้เฉพาะทีมงาน การปิด/แก้ไขต้องมีหมายเหตุชัดเจน`,tone:rows.some((item)=>item.severity==='CRITICAL')?'danger':rows.some((item)=>item.severity==='HIGH')?'warning':'primary',ephemeral:true}));return true;
    }
    if(id==='incident:create'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ศูนย์เหตุผิดปกติ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อประกาศเหตุผิดปกติ',tone:'primary',ephemeral:true}));return true;}
      const m=new ModalBuilder().setCustomId('incident:create:modal').setTitle('ประกาศเหตุผิดปกติด้านปฏิบัติการ');
      m.addComponents(field('kind','ประเภท',TextInputStyle.Short,{placeholder:'เช่น PLATFORM / SECURITY / DATABASE',min:3,max:20}),field('severity','ระดับความรุนแรง',TextInputStyle.Short,{placeholder:'เช่น LOW / MEDIUM / HIGH / CRITICAL',min:3,max:10}),field('title','ชื่อเหตุผิดปกติ',TextInputStyle.Short,{min:4,max:120}),field('summary','ผลกระทบ / อาการที่พบ',TextInputStyle.Paragraph,{min:10,max:3000}));await interaction.showModal(m);return true;
    }
    if(id==='incident:update'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ศูนย์เหตุผิดปกติ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่ออัปเดตเหตุผิดปกติ',tone:'primary',ephemeral:true}));return true;}
      const m=new ModalBuilder().setCustomId('incident:update:modal').setTitle('อัปเดตเหตุผิดปกติด้านปฏิบัติการ');
      m.addComponents(field('id','UUID เหตุผิดปกติ',TextInputStyle.Short,{min:36,max:36}),field('status','สถานะถัดไป',TextInputStyle.Short,{placeholder:'เช่น INVESTIGATING / MITIGATING / MONITORING',min:4,max:20}),field('note','หลักฐาน / การบรรเทา / หมายเหตุการแก้ไข',TextInputStyle.Paragraph,{min:3,max:1500}));await interaction.showModal(m);return true;
    }
    if(id==='drill:list'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'การซ้อมกู้คืน',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อดูหลักฐานการซ้อมกู้คืน',tone:'primary',ephemeral:true}));return true;}
      const rows=await new RecoveryDrillRepository(deps.database).list(interaction.guild.id,15);const text=rows.length?rows.map((r)=>`\`${r.id}\`\n**${operatorUi(r.drill_type)} · ${operatorUi(r.status)}**\n${r.objective}\n${r.finished_at?`เสร็จสิ้น <t:${Math.floor(new Date(r.finished_at).getTime()/1000)}:R>`:`สร้าง <t:${Math.floor(new Date(r.created_at).getTime()/1000)}:R>`}`).join('\n\n'):'ยังไม่มีบันทึกการซ้อมกู้คืน';
      await interaction.reply(v2NoticePanel({title:'หลักฐานการซ้อมกู้คืน',description:`${text.slice(0,4000)}\n\n-# สถานะผ่านต้องผ่านการตรวจหลายรายการและมีข้อมูลอ้างอิงอย่างน้อยหนึ่งรายการ`,tone:rows.some((r)=>r.status==='FAILED'||r.status==='BLOCKED')?'warning':'primary',ephemeral:true}));return true;
    }
    if(id==='drill:plan'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'การซ้อมกู้คืน',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อวางแผนซ้อมกู้คืน',tone:'primary',ephemeral:true}));return true;}
      const m=new ModalBuilder().setCustomId('drill:plan:modal').setTitle('วางแผนซ้อมกู้คืน');m.addComponents(field('type','ประเภทการซ้อม',TextInputStyle.Short,{placeholder:'เช่น RESTORE / PANEL_REPAIR / STARTUP_RECOVERY',min:5,max:24}),field('objective','วัตถุประสงค์',TextInputStyle.Paragraph,{min:8,max:500}),field('checks','รายการตรวจที่คาดหวัง (หนึ่งรายการต่อบรรทัด)',TextInputStyle.Paragraph,{min:5,max:1500}));await interaction.showModal(m);return true;
    }
    if(id==='drill:update'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'การซ้อมกู้คืน',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อบันทึกผลการซ้อม',tone:'primary',ephemeral:true}));return true;}
      const m=new ModalBuilder().setCustomId('drill:update:modal').setTitle('บันทึกสถานะการซ้อมกู้คืน');m.addComponents(field('id','UUID การซ้อม',TextInputStyle.Short,{min:36,max:36}),field('status','สถานะถัดไป',TextInputStyle.Short,{placeholder:'เช่น RUNNING / BLOCKED / PASSED / FAILED',min:6,max:12}),field('checks','จำนวนตรวจผ่าน,ไม่ผ่าน',TextInputStyle.Short,{placeholder:'3,0',min:3,max:15}),field('artifact','ข้อมูลอ้างอิงหลักฐาน',TextInputStyle.Short,{required:false,placeholder:'เช่น backup:... / audit:... / report:...',max:240}),field('note','หมายเหตุหลักฐาน / ตัวขัดขวาง',TextInputStyle.Paragraph,{required:false,max:1000}));await interaction.showModal(m);return true;
    }
    if(id==='privacy:export'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อส่งออกข้อมูลส่วนบุคคล',tone:'primary',ephemeral:true}));return true;}const m=new ModalBuilder().setCustomId('privacy:export:modal').setTitle('ส่งออกข้อมูลผู้ใช้ตามขอบเขต');m.addComponents(field('user','รหัสผู้ใช้เจ้าของข้อมูล',TextInputStyle.Short,{min:15,max:22}));await interaction.showModal(m);return true;
    }
    if(id==='privacy:holds'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'การควบคุมความเป็นส่วนตัว',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อดูคำสั่งระงับการลบ',tone:'primary',ephemeral:true}));return true;}
      const holds=await new RetentionLegalHoldRepository(deps.database).listActive(interaction.guild.id);const text=holds.length?holds.map((hold)=>`\`${hold.holdId}\` · **${operatorUi(hold.dataClass)}**
${hold.reason}
สร้างโดย <@${hold.createdBy}> · <t:${Math.floor(new Date(hold.createdAt).getTime()/1000)}:R>${hold.releaseApprovalId?` · รหัสอนุมัติการยกเลิก \`${hold.releaseApprovalId}\``:''}`).join('\n\n'):'ไม่มีคำสั่งระงับการลบที่ใช้งานอยู่';
      await interaction.reply(v2NoticePanel({title:'คำสั่งระงับการลบที่ยังใช้งาน',description:`${text.slice(0,3900)}

-# คำสั่งระงับที่ยังใช้งานจะทำให้คำขอลบปฏิเสธแบบปลอดภัยและตรวจซ้ำตอนดำเนินการ คำสั่งระงับจะไม่หมดอายุอัตโนมัติ`,tone:holds.length?'warning':'success',ephemeral:true}));return true;
    }
    if(id==='privacy:hold'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'การควบคุมความเป็นส่วนตัว',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อสร้างคำสั่งระงับการลบ',tone:'primary',ephemeral:true}));return true;}const m=new ModalBuilder().setCustomId('privacy:hold:modal').setTitle('สร้างคำสั่งระงับการลบแบบคงทน');m.addComponents(field('class','ประเภทข้อมูลหรือ ALL',TextInputStyle.Short,{placeholder:'เช่น AUDIT',min:3,max:20}),field('reason','เหตุผลการระงับการลบ',TextInputStyle.Paragraph,{min:10,max:1500}));await interaction.showModal(m);return true;
    }
    if(id==='privacy:release-hold'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'การควบคุมความเป็นส่วนตัว',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อขอยกเลิกคำสั่งระงับการลบ',tone:'primary',ephemeral:true}));return true;}const m=new ModalBuilder().setCustomId('privacy:release-hold:modal').setTitle('ขอยกเลิกคำสั่งระงับการลบ');m.addComponents(field('id','UUID คำสั่งระงับ',TextInputStyle.Short,{min:36,max:36}),field('reason','เหตุผลการยกเลิกคำสั่งระงับ',TextInputStyle.Paragraph,{min:10,max:1500}));await interaction.showModal(m);return true;
    }
    if(id==='privacy:retention'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อเปลี่ยนนโยบายเก็บรักษาข้อมูล',tone:'primary',ephemeral:true}));return true;}const m=new ModalBuilder().setCustomId('privacy:retention:modal').setTitle('ขอล้างข้อมูลตามนโยบายเก็บรักษา');m.addComponents(field('operational','จำนวนวันข้อมูลปฏิบัติการ',TextInputStyle.Short,{placeholder:'30',min:1,max:5}),field('analytics','จำนวนวันข้อมูลวิเคราะห์',TextInputStyle.Short,{placeholder:'90',min:1,max:5}),field('audit','จำนวนวันบันทึกตรวจสอบ',TextInputStyle.Short,{placeholder:'365',min:1,max:5}),field('content','จำนวนวันเนื้อหาผู้ใช้',TextInputStyle.Short,{placeholder:'180',min:1,max:5}));await interaction.showModal(m);return true;
    }
    if(id==='privacy:approve'||id==='privacy:execute'){
      if(!manager(interaction)){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์',tone:'primary',ephemeral:true}));return true;}const m=new ModalBuilder().setCustomId(`${id}:modal`).setTitle(id==='privacy:approve'?'อนุมัติคำขอความเป็นส่วนตัว':'ดำเนินการคำขอความเป็นส่วนตัวที่อนุมัติแล้ว');m.addComponents(field('id','รหัสการอนุมัติ',TextInputStyle.Short,{min:36,max:36}));await interaction.showModal(m);return true;
    }
  }catch(error){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:safeDiscordError(error,{fallback:'การดำเนินการของผู้ปฏิบัติการล้มเหลวอย่างปลอดภัย'}),tone:'primary',ephemeral:true}));return true;}return false;
}

export async function handleOperatorModal(interaction:ModalSubmitInteraction,deps:OperatorActionDependencies):Promise<boolean>{
  if(!interaction.inCachedGuild()||(!interaction.customId.startsWith('security:')&&!interaction.customId.startsWith('privacy:')&&!interaction.customId.startsWith('incident:')&&!interaction.customId.startsWith('drill:')))return false;if(!deps.database.configured){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:'ขั้นตอนปฏิบัติการนี้ต้องใช้ `DATABASE_URL`',tone:'primary',ephemeral:true}));return true;}
  try{
    if(interaction.customId==='security:resolve:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const alertId=interaction.fields.getTextInputValue('id').trim();const note=interaction.fields.getTextInputValue('note').trim();const result=await deps.database.requirePool().query(`update security_alerts set status='RESOLVED',resolved_at=now(),evidence=evidence || $3::jsonb where guild_id=$1 and alert_id=$2 and status='OPEN'`,[interaction.guild.id,alertId,JSON.stringify({resolutionNote:note,resolvedBy:interaction.user.id})]);if(!result.rowCount)throw new Error('SECURITY_ALERT_NOT_OPEN');await audit(deps.database,interaction,'SECURITY_ALERT_RESOLVE','SECURITY_ALERT',alertId,{note});await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:'ปิดการแจ้งเตือนความปลอดภัยพร้อมหลักฐานตรวจสอบแล้ว ระบบไม่ได้ลงโทษอัตโนมัติ',tone:'primary',ephemeral:true}));return true;
    }
    if(interaction.customId==='incident:create:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');
      const kind=interaction.fields.getTextInputValue('kind').trim().toUpperCase() as IncidentKind;const severity=interaction.fields.getTextInputValue('severity').trim().toUpperCase() as IncidentSeverity;const correlationId=newCorrelationId();
      const incident=await new IncidentRepository(deps.database).create({guildId:interaction.guild.id,kind,severity,title:interaction.fields.getTextInputValue('title'),summary:interaction.fields.getTextInputValue('summary'),openedBy:interaction.user.id,commanderId:interaction.user.id,correlationId});
      await audit(deps.database,interaction,'INCIDENT_DECLARE','INCIDENT',incident.incidentId,{kind:incident.kind,severity:incident.severity,status:incident.status,correlationId});
      await interaction.reply(v2NoticePanel({title:'ประกาศเหตุผิดปกติแล้ว',description:`\`${incident.incidentId}\` · **${operatorUi(incident.severity)} · ${operatorUi(incident.kind)}** · ${incident.title}\nสถานะ: **${operatorUi(incident.status)}** · ผู้ควบคุมเหตุ: <@${interaction.user.id}>\nรหัสความเชื่อมโยง: \`${incident.correlationId}\``,tone:incident.severity==='CRITICAL'?'danger':incident.severity==='HIGH'?'warning':'primary',ephemeral:true}));return true;
    }
    if(interaction.customId==='incident:update:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');
      const incidentId=interaction.fields.getTextInputValue('id').trim();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(incidentId))throw new Error('INCIDENT_ID_INVALID');
      const next=interaction.fields.getTextInputValue('status').trim().toUpperCase() as IncidentStatus;const note=interaction.fields.getTextInputValue('note').trim();const correlationId=newCorrelationId();
      const incident=await new IncidentRepository(deps.database).transition({guildId:interaction.guild.id,incidentId,actorId:interaction.user.id,next,note,correlationId});
      await audit(deps.database,interaction,'INCIDENT_TRANSITION','INCIDENT',incidentId,{status:incident.status,severity:incident.severity,correlationId});
      await interaction.reply(v2NoticePanel({title:'อัปเดตเหตุผิดปกติแล้ว',description:`\`${incident.incidentId}\` · **${operatorUi(incident.status)}**\n${incident.title}\nบันทึกหมายเหตุหลักฐานพร้อมรหัสความเชื่อมโยง \`${correlationId}\``,tone:incident.status==='CLOSED'||incident.status==='RESOLVED'?'success':incident.severity==='CRITICAL'?'danger':'warning',ephemeral:true}));return true;
    }
    if(interaction.customId==='drill:plan:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const correlationId=newCorrelationId();const type=interaction.fields.getTextInputValue('type').trim().toUpperCase() as RecoveryDrillType;const checks=interaction.fields.getTextInputValue('checks').split(/\r?\n/).map((item)=>item.trim()).filter(Boolean);
      const drill=await new RecoveryDrillRepository(deps.database).create({guildId:interaction.guild.id,drillType:type,objective:interaction.fields.getTextInputValue('objective'),expectedChecks:checks,actorId:interaction.user.id,correlationId});await audit(deps.database,interaction,'RECOVERY_DRILL_PLAN','RECOVERY_DRILL',drill.drillId,{drillType:drill.drillType,status:drill.status,expectedChecks:drill.expectedChecks.length});await interaction.reply(v2NoticePanel({title:'วางแผนการซ้อมกู้คืนแล้ว',description:`\`${drill.drillId}\` · **${operatorUi(drill.drillType)}**\n${drill.objective}\nรายการตรวจที่คาดหวัง: **${drill.expectedChecks.length}**. ยังไม่มีการอ้างว่ากู้คืนสำเร็จ`,tone:'primary',ephemeral:true}));return true;
    }
    if(interaction.customId==='drill:update:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const drillId=interaction.fields.getTextInputValue('id').trim();if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(drillId))throw new Error('RECOVERY_DRILL_ID_INVALID');const next=interaction.fields.getTextInputValue('status').trim().toUpperCase() as RecoveryDrillStatus;const [passedRaw,failedRaw]=interaction.fields.getTextInputValue('checks').split(',');const passed=Number(passedRaw),failed=Number(failedRaw);if(!Number.isInteger(passed)||passed<0||!Number.isInteger(failed)||failed<0)throw new Error('RECOVERY_DRILL_CHECK_COUNTS_INVALID');const artifact=interaction.fields.getTextInputValue('artifact').trim();const note=interaction.fields.getTextInputValue('note').trim();const correlationId=newCorrelationId();const blockers=['BLOCKED','FAILED'].includes(next)&&note?[note]:[];const row=await new RecoveryDrillRepository(deps.database).transition({guildId:interaction.guild.id,drillId,actorId:interaction.user.id,next,evidence:{checksPassed:passed,checksFailed:failed,artifactRefs:artifact?[artifact]:[],notes:note?[note]:[]},blockers,note,correlationId});await audit(deps.database,interaction,'RECOVERY_DRILL_UPDATE','RECOVERY_DRILL',drillId,{status:row.status,checksPassed:passed,checksFailed:failed});await interaction.reply(v2NoticePanel({title:'อัปเดตการซ้อมกู้คืนแล้ว',description:`\`${drillId}\` · **${operatorUi(row.status)}**\nตรวจผ่าน: **${passed}** · ไม่ผ่าน: **${failed}**${artifact?`\nหลักฐานอ้างอิง: \`${artifact.slice(0,180)}\``:''}`,tone:row.status==='PASSED'?'success':row.status==='FAILED'||row.status==='BLOCKED'?'danger':'warning',ephemeral:true}));return true;
    }
    if(interaction.customId==='privacy:export:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const userId=interaction.fields.getTextInputValue('user').trim();const result=await new PrivacyExportService(deps.database).createUserExport({guildId:interaction.guild.id,subjectUserId:userId,requestedBy:interaction.user.id,ttlHours:24});await new ScheduledTaskRepository(deps.database).schedule({guildId:interaction.guild.id,taskType:'PRIVACY_EXPORT_EXPIRE',runAt:new Date(result.expiresAt),timezone:'UTC',dedupKey:`privacy-export:${result.artifactId}`,payload:{artifactId:result.artifactId,requestId:result.requestId}});await audit(deps.database,interaction,'PRIVACY_EXPORT_CREATE','DATA_EXPORT',result.artifactId,{subjectUserId:userId,expiresAt:result.expiresAt});await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:`สร้างไฟล์ส่งออกตามขอบเขตแล้ว อาร์ติแฟกต์ \`${result.artifactId}\` · แฮช \`${result.hash.slice(0,16)}…\` · หมดอายุ <t:${Math.floor(new Date(result.expiresAt).getTime()/1000)}:R>. ไม่รวมข้อมูลลับและหลักฐานสำหรับทีมงานเท่านั้น`,tone:'primary',ephemeral:true}));return true;
    }
    if(interaction.customId==='privacy:hold:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const hold=await new RetentionLegalHoldRepository(deps.database).create({guildId:interaction.guild.id,dataClass:interaction.fields.getTextInputValue('class'),reason:interaction.fields.getTextInputValue('reason'),createdBy:interaction.user.id,correlationId:newCorrelationId()});await audit(deps.database,interaction,'LEGAL_HOLD_CREATE','LEGAL_HOLD',hold.holdId,{dataClass:hold.dataClass,state:hold.state});await interaction.reply(v2NoticePanel({title:'คำสั่งระงับการลบมีผลแล้ว',description:`\`${hold.holdId}\` · **${operatorUi(hold.dataClass)}**
${hold.reason}

การลบตามอายุข้อมูลที่กระทบประเภทข้อมูลนี้จะ fail-closed จนกว่าจะดำเนินการปลดระงับที่อนุมัติแล้ว`,tone:'warning',ephemeral:true}));return true;
    }
    if(interaction.customId==='privacy:release-hold:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const holdId=interaction.fields.getTextInputValue('id').trim();const result=await new RetentionLegalHoldRepository(deps.database).requestRelease({guildId:interaction.guild.id,holdId,requestedBy:interaction.user.id,reason:interaction.fields.getTextInputValue('reason')});await audit(deps.database,interaction,'LEGAL_HOLD_RELEASE_REQUEST','APPROVAL',result.approvalId,{holdId,dataClass:result.hold.dataClass});await interaction.reply(v2NoticePanel({title:'ส่งคำขอยกเลิกคำสั่งระงับการลบแล้ว',description:`คำสั่งระงับ \`${holdId}\` ยังคง **${operatorUi('ACTIVE')}** การอนุมัติ \`${result.approvalId}\` ต้องมีผู้ปฏิบัติการต่างกัน **2 คน** ก่อนดำเนินการ การสร้างคำขอนี้ไม่ลดความเข้มงวดของคำสั่งระงับ`,tone:'warning',ephemeral:true}));return true;
    }
    if(interaction.customId==='privacy:retention:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const read=(key:string)=>{const n=Number(interaction.fields.getTextInputValue(key).trim());if(!Number.isInteger(n)||n<1||n>3650)throw new Error(`INVALID_RETENTION_DAYS:${key}`);return n;};const rules:RetentionRule[]=[{dataClass:'OPERATIONAL',days:read('operational')},{dataClass:'ANALYTICS',days:read('analytics')},{dataClass:'AUDIT',days:read('audit')},{dataClass:'USER_CONTENT',days:read('content')}];const result=await new RetentionService(deps.database).requestExecution({guildId:interaction.guild.id,requestedBy:interaction.user.id,rules});const total=result.plan.reduce((sum,item)=>sum+item.candidateCount,0);await audit(deps.database,interaction,'RETENTION_REQUEST','APPROVAL',result.approvalId,{candidateCount:total,planHash:result.planHash,policyHash:result.policyHash,governanceRevision:result.governanceRevision});await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:`สร้างแผนการลบตามอายุสำหรับ **${total}** รายการ รหัสอนุมัติ: \`${result.approvalId}\`. แผน \`${result.planHash.slice(0,12)}…\` · นโยบาย \`${result.policyHash.slice(0,12)}…\` · รุ่นธรรมาภิบาล **${result.governanceRevision}**. ต้องให้ผู้ปฏิบัติการคนอื่นอนุมัติ และแผนวิกฤตอาจต้องอนุมัติสองคน ยังไม่มีข้อมูลถูกลบ`,tone:'primary',ephemeral:true}));return true;
    }
    if(interaction.customId==='privacy:approve:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const approvalId=interaction.fields.getTextInputValue('id').trim();const repo=new ApprovalRepository(deps.database);const before=await repo.get(interaction.guild.id,approvalId);if(!before||!['RETENTION_DELETE','LEGAL_HOLD_RELEASE'].includes(before.operationKey))throw new Error('PRIVACY_APPROVAL_OPERATION_UNSUPPORTED');const approval=await repo.approve(interaction.guild.id,approvalId,interaction.user.id);await audit(deps.database,interaction,'PRIVACY_APPROVE','APPROVAL',approvalId,{operationKey:approval.operationKey,state:approval.state,approvedBy:approval.approvedBy});await interaction.reply(v2NoticePanel({title:'การอนุมัติด้านความเป็นส่วนตัว',description:`**${operatorUi(approval.operationKey)}** · สถานะ **${operatorUi(approval.state)}** · การอนุมัติ ${approval.approvedBy.length}/${approval.requiredApprovals}.`,tone:'primary',ephemeral:true}));return true;
    }
    if(interaction.customId==='privacy:execute:modal'){
      if(!manager(interaction))throw new Error('MANAGE_GUILD_REQUIRED');const approvalId=interaction.fields.getTextInputValue('id').trim();const approval=await new ApprovalRepository(deps.database).get(interaction.guild.id,approvalId);if(!approval)throw new Error('APPROVAL_NOT_FOUND');
      if(approval.operationKey==='RETENTION_DELETE'){const result=await new RetentionService(deps.database).executeApproved({guildId:interaction.guild.id,approvalId,actorId:interaction.user.id});await audit(deps.database,interaction,'RETENTION_EXECUTE','APPROVAL',approvalId,{deleted:result.deleted,examined:result.examined,retentionRunId:result.retentionRunId});await interaction.reply(v2NoticePanel({title:'ดำเนินการเก็บรักษาข้อมูลแบบอะตอมมิกแล้ว',description:`ลบแล้ว **${result.deleted}** จาก **${result.examined}** รายการที่อนุมัติ งาน \`${result.retentionRunId}\`. ระหว่างดำเนินการมีการตรวจแฮชแผนที่อนุมัติ แฮชนโยบายตัวเลือก รุ่นธรรมาภิบาล คำสั่งระงับที่ใช้งาน และรายการเป้าหมายซ้ำอีกครั้ง`,tone:'success',ephemeral:true}));return true;}
      if(approval.operationKey==='LEGAL_HOLD_RELEASE'){const hold=await new RetentionLegalHoldRepository(deps.database).executeApprovedRelease({guildId:interaction.guild.id,approvalId,actorId:interaction.user.id});await audit(deps.database,interaction,'LEGAL_HOLD_RELEASE_EXECUTE','LEGAL_HOLD',hold.holdId,{approvalId,dataClass:hold.dataClass,state:hold.state});await interaction.reply(v2NoticePanel({title:'ยกเลิกคำสั่งระงับการลบแล้ว',description:`คำสั่งระงับ \`${hold.holdId}\` · **${operatorUi(hold.dataClass)}** เปลี่ยนเป็น **${operatorUi('RELEASED')}** หลังผ่านขั้นตอนผู้ปฏิบัติการสองคนแล้ว ยังต้องสร้างแผนการลบตามอายุใหม่ก่อนลบข้อมูล`,tone:'success',ephemeral:true}));return true;}
      throw new Error('PRIVACY_APPROVAL_OPERATION_UNSUPPORTED');
    }
  }catch(error){await interaction.reply(v2NoticePanel({title:'ศูนย์ควบคุมผู้ปฏิบัติการ',description:safeDiscordError(error,{fallback:'การส่งคำสั่งผู้ปฏิบัติการล้มเหลวอย่างปลอดภัย'}),tone:'primary',ephemeral:true}));return true;}return false;
}
