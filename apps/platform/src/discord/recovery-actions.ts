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
  type Guild,
  type ModalSubmitInteraction,
} from 'discord.js';
import { GuildBackupService, restoreRequiresApproval, type BackupEnvelope, type GuildBackupPayload, type RestoreChange } from '@autoserver/backups';
import {
  ApprovalRepository,
  BackupSnapshotRepository,
  GuildConfigRepository,
  ResourceMappingRepository,
  RestoreRunRepository,
  type Database,
} from '@autoserver/database';
import { blueprintForEnabledModules } from '@autoserver/control-center';
import { DiscordGuildScanner, SetupPlanner, type ServerBlueprint } from '@autoserver/setup';
import { PanelDeploymentService, v2EditNoticePanel, v2NoticePanel } from '@autoserver/panels';
import { AuditRepository, PanelRegistryRepository } from '@autoserver/database';
import { randomUUID } from 'node:crypto';
import { newCorrelationId } from '@autoserver/core';
import { permissionRepairDriftHash, scanDiscordPermissionDrift } from '@autoserver/repair';
import { captureManagedDiscordBackup } from '../runtime/discord-backup-snapshot.js';
import type { JobRepository } from '@autoserver/jobs';
import { resolveGuildBlueprint } from '../runtime/blueprint-resolver.js';
import { panelRenderProfileFromGuildConfig } from '../runtime/setup-state.js';
import { safeDiscordError } from './presentation.js';
import { presentSystemValue } from '@autoserver/localization';

export interface RecoveryActionDependencies {
  database: Database;
  dashboardUrl?: string;
  jobs?: JobRepository | null;
}

function managerGuard(interaction: ButtonInteraction | ModalSubmitInteraction): boolean {
  return interaction.inCachedGuild()
    && (interaction.user.id === interaction.guild.ownerId || interaction.member.permissions.has(PermissionFlagsBits.ManageGuild));
}

function restoreIdModal() {
  const id = new TextInputBuilder()
    .setCustomId('backupId')
    .setLabel('รหัสข้อมูลสำรอง')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
    .setMinLength(36)
    .setMaxLength(36)
    .setRequired(true);
  return new ModalBuilder()
    .setCustomId('backup:restore-plan:modal')
    .setTitle('ดูแผนกู้คืนข้อมูลสำรอง')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(id));
}
function approvalIdModal() {
  const id = new TextInputBuilder().setCustomId('approvalId').setLabel('รหัสการอนุมัติ').setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').setMinLength(36).setMaxLength(36).setRequired(true);
  return new ModalBuilder().setCustomId('backup:approve:modal').setTitle('อนุมัติคำขอกู้คืน')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(id));
}

function executeRestoreModal() {
  const id = new TextInputBuilder().setCustomId('restoreRunId').setLabel('รหัสงานกู้คืน').setStyle(TextInputStyle.Short)
    .setPlaceholder('เช่น xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx').setMinLength(36).setMaxLength(36).setRequired(true);
  return new ModalBuilder().setCustomId('backup:execute:modal').setTitle('ดำเนินการกู้คืนที่อนุมัติแล้ว')
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(id));
}

function restoreApprovalRisk(changes: readonly RestoreChange[], envelope: BackupEnvelope<GuildBackupPayload>): 'HIGH' | 'CRITICAL' {
  const administrator = envelope.payload.resources.some((resource) => {
    if (!resource.rolePermissions) return false;
    try { return (BigInt(resource.rolePermissions) & PermissionFlagsBits.Administrator) !== 0n; }
    catch { return true; }
  });
  const mutationCount = changes.filter((change) => change.kind !== 'KEEP').length;
  return administrator || mutationCount >= 50 ? 'CRITICAL' : 'HIGH';
}

async function managedBlueprint(database: Database, guildId: string): Promise<{ config: Awaited<ReturnType<GuildConfigRepository['get']>>; blueprint: ServerBlueprint } | null> {
  const config = await new GuildConfigRepository(database).get(guildId);
  if (!config) return null;
  const enabledModules = Object.entries(config.enabledModules).filter(([, enabled]) => enabled).map(([key]) => key);
  return { config, blueprint: blueprintForEnabledModules(await resolveGuildBlueprint(database,guildId,config.templateKey), enabledModules) };
}

function countBy<T extends string>(items: readonly T[]): Record<T, number> {
  const out = {} as Record<T, number>;
  for (const item of items) out[item] = (out[item] ?? 0) + 1;
  return out;
}

const recoveryUiValues: Record<string,string> = {
  MANUAL:'สร้างด้วยผู้ดูแล',SCHEDULED:'สร้างตามกำหนด',CAPTURED:'จับข้อมูลแล้ว',INTEGRITY_CHECKED:'ตรวจความสมบูรณ์แล้ว',RESTORE_VERIFIED:'ยืนยันการกู้คืนแล้ว',INVALID:'ข้อมูลไม่ถูกต้อง',LEGACY_UNPROVEN:'ข้อมูลเดิมที่ยังไม่มีหลักฐาน',
  OFF:'ปิด',DAILY:'รายวัน',WEEKLY:'รายสัปดาห์',SUCCEEDED:'สำเร็จ',FAILED:'ล้มเหลว',CANCELLED:'ยกเลิกแล้ว',RUNNING:'กำลังทำงาน',QUEUED:'รอคิว',
  CREATE:'สร้าง',UPDATE:'อัปเดต',KEEP:'คงไว้',CONFLICT:'ขัดแย้ง',REMOVE_MAPPING:'นำการเชื่อมโยงออก',ADOPT:'รับดูแล',SKIP:'ข้าม',
  HEALTHY:'ปกติ',MISSING:'หาย',DRIFTED:'คลาดเคลื่อน',HIGH:'สูง',CRITICAL:'วิกฤต',
};
function recoveryUi(value: unknown): string { const key=String(value??''); return recoveryUiValues[key]??key; }
function weekdayUi(value: unknown): string { return ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'][Number(value)]??String(value??'—'); }

async function scanRepairState(guild: Guild, database: Database, dashboardUrl?: string) {
  const managed = await managedBlueprint(database, guild.id);
  if (!managed) throw new Error('GUILD_CONFIGURATION_NOT_FOUND');
  const mappingsRepo = new ResourceMappingRepository(database);
  const scanner = new DiscordGuildScanner(mappingsRepo);
  const snapshot = await scanner.scan(guild);
  const plan = new SetupPlanner().plan(snapshot, managed.blueprint);
  const mappings = await mappingsRepo.list(guild.id);
  const permissionDrift = await scanDiscordPermissionDrift({ guild, blueprint: managed.blueprint, mappings });
  const panelAudit = await new PanelDeploymentService(database).auditForBlueprint({
    guild,
    blueprint: managed.blueprint,
    dashboardUrl,
    ...panelRenderProfileFromGuildConfig(managed.config!),
  });
  return { managed, plan, permissionDrift, panelAudit };
}

export async function handleRecoveryButton(interaction: ButtonInteraction, deps: RecoveryActionDependencies): Promise<boolean> {
  if (!interaction.inCachedGuild()) return false;
  const id = interaction.customId;
  if (!id.startsWith('backup:') && !id.startsWith('repair:') && !id.startsWith('integration:')) return false;
  if (!deps.database.configured) {
    await interaction.reply(v2NoticePanel({ title: 'ขั้นตอนกู้คืนยังไม่พร้อม', description: 'ขั้นตอนปฏิบัติการนี้ต้องใช้ `DATABASE_URL`', tone: 'warning', ephemeral: true }));
    return true;
  }
  if (!managerGuard(interaction)) {
    await interaction.reply(v2NoticePanel({ title: 'จำกัดสิทธิ์การควบคุมกู้คืน', description: 'ขั้นตอนปฏิบัติการนี้ต้องใช้สิทธิ์จัดการเซิร์ฟเวอร์', tone: 'danger', ephemeral: true }));
    return true;
  }

  try {
    if (id === 'backup:create') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await captureManagedDiscordBackup({ guild: interaction.guild, database: deps.database, kind: 'MANUAL', createdBy: interaction.user.id });
      await interaction.editReply(v2EditNoticePanel({ title: 'ตรวจสอบและจัดเก็บหลักฐานความสมบูรณ์ของข้อมูลสำรองแล้ว', description: `**รหัส** \`${result.backupId}\`\n**ความครบถ้วน** ตรวจความสมบูรณ์แล้ว · รอการยืนยันการกู้คืน\n**เช็กซัม** \`${result.envelope.checksum}\`\n**ทรัพยากร** ${result.envelope.payload.resources.length} · **แผงระบบ** ${result.envelope.payload.panels.length}`, tone: 'success' }));
      return true;
    }

    if (id === 'backup:list') {
      const rows = await new BackupSnapshotRepository(deps.database).list(interaction.guild.id, 10);
      const description = rows.length
        ? rows.map((row) => `\`${row.backupId}\`\n${recoveryUi(row.kind)} · ${recoveryUi(row.status)} · <t:${Math.floor(new Date(row.createdAt).getTime() / 1000)}:R>\nแฮช \`${row.contentHash.slice(0, 16)}…\``).join('\n\n')
        : 'ยังไม่มีข้อมูลสำรองที่ระบบดูแล';
      await interaction.reply(v2NoticePanel({ title: 'ข้อมูลสำรองล่าสุด', description: `${description.slice(0,4000)}\n\n-# การกู้คืนจะเริ่มจากการแสดงตัวอย่างแบบไม่ทำลายข้อมูลเสมอ`, tone: 'ice', ephemeral: true }));
      return true;
    }

    if (id === 'backup:schedule-status') {
      const row=(await deps.database.requirePool().query<any>(`select cadence,local_hour,backup_weekday,timezone,keep_scheduled,last_backup_id,last_run_at,next_run_at,last_result from backup_schedule_state where guild_id=$1`,[interaction.guild.id])).rows[0];
      const description=row
        ? [`รอบทำงาน: **${recoveryUi(row.cadence)}**`, `เวลาท้องถิ่น: **${weekdayUi(row.backup_weekday)} · ${String(row.local_hour).padStart(2,'0')}:00 · ${row.timezone}**`, `จำนวนชุดสำรองตามกำหนดที่เก็บไว้: **${row.keep_scheduled}**`, `ผลล่าสุด: **${row.last_result ? recoveryUi(row.last_result) : 'ยังไม่เคยทำงาน'}**`, row.last_run_at?`ทำงานล่าสุด: <t:${Math.floor(new Date(row.last_run_at).getTime()/1000)}:R>`:'ทำงานล่าสุด: —', row.next_run_at?`กำหนดครั้งถัดไป: <t:${Math.floor(new Date(row.next_run_at).getTime()/1000)}:F>`:'กำหนดครั้งถัดไป: —'].join('\n')
        : 'ยังไม่ได้ตั้งเวลาสำรองข้อมูล ให้กำหนดผ่าน /setup';
      await interaction.reply(v2NoticePanel({ title: 'สถานะข้อมูลสำรองตามกำหนด', description: `${description}\n\n-# การตั้งค่าอยู่ที่ /setup; แผงนี้แสดงสถานะขณะทำงานเท่านั้น`, tone: 'ice', ephemeral: true }));
      return true;
    }

    if (id === 'backup:restore-plan') {
      await interaction.showModal(restoreIdModal());
      return true;
    }

    if (id === 'backup:approve') {
      await interaction.showModal(approvalIdModal());
      return true;
    }

    if (id === 'backup:execute') {
      await interaction.showModal(executeRestoreModal());
      return true;
    }

    if (id === 'repair:scan') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await scanRepairState(interaction.guild, deps.database, deps.dashboardUrl);
      const resourceCounts = countBy(result.plan.actions.map((action) => action.type));
      const panelCounts = countBy(result.panelAudit.map((panel) => panel.status));
      const unresolvedResources = result.plan.actions.filter((action) => !['KEEP', 'SKIP'].includes(action.type));
      const unhealthyPanels = result.panelAudit.filter((panel) => panel.status !== 'HEALTHY');
      const highlights = [
        ...unresolvedResources.slice(0, 5).map((item) => `${recoveryUi(item.type)} · ${item.desired.logicalKey}`),
        ...result.permissionDrift.slice(0, 5).map((item) => `สิทธิ์ · ${item.logicalKey}`),
        ...unhealthyPanels.slice(0, 5).map((item) => `แผงระบบ ${recoveryUi(item.status)} · ${item.panelId}`),
      ];
      const driftDescription = `${highlights.length ? highlights.join('\n').slice(0, 3500) : 'ตัวสแกนปัจจุบันไม่พบความคลาดเคลื่อนของทรัพยากร สิทธิ์ หรือแผงระบบที่ดูแล'}\n\n**ทรัพยากร** สร้าง ${resourceCounts.CREATE ?? 0} · รับดูแล ${resourceCounts.ADOPT ?? 0} · อัปเดต ${resourceCounts.UPDATE ?? 0} · ขัดแย้ง ${resourceCounts.CONFLICT ?? 0}\n**สิทธิ์** ${result.permissionDrift.length} ช่องที่สิทธิ์ทับซ้อนคลาดเคลื่อน\n**แผงระบบ** ผิดปกติ ${result.panelAudit.length - (panelCounts.HEALTHY ?? 0)} / ดูแลทั้งหมด ${result.panelAudit.length}\n\n-# การสแกนเป็นแบบอ่านอย่างเดียว ทรัพยากรที่ผู้ใช้เป็นเจ้าของและทรัพยากรที่ล็อกไว้ยังได้รับการปกป้อง`;
      await interaction.editReply(v2EditNoticePanel({ title: 'ตรวจความคลาดเคลื่อนจากสถานะเป้าหมาย', description: driftDescription, tone: highlights.length ? 'warning' : 'success' }));
      return true;
    }

    if (id === 'repair:permissions') {
      const result = await scanRepairState(interaction.guild, deps.database, deps.dashboardUrl);
      const protectedDrift = result.permissionDrift.filter((item)=>item.ownership==='USER_OWNED'||item.ownership==='LOCKED');
      const repairable = result.permissionDrift.filter((item)=>item.ownership!=='USER_OWNED'&&item.ownership!=='LOCKED');
      if (!result.permissionDrift.length) { await interaction.reply(v2NoticePanel({ title: 'ตรวจความคลาดเคลื่อนของสิทธิ์', description: 'ขณะนี้ไม่พบความคลาดเคลื่อนของสิทธิ์ทับซ้อน', tone: 'success', ephemeral: true })); return true; }
      const controls = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('repair:permissions:request').setLabel('ขอซ่อมแซม').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('repair:permissions:approve').setLabel('อนุมัติคำขอ').setStyle(ButtonStyle.Success),
      );
      await interaction.reply(v2NoticePanel({ title: 'ศูนย์ควบคุมการซ่อมสิทธิ์', description: `ความคลาดเคลื่อนที่ซ่อมได้: **${repairable.length}**\nความคลาดเคลื่อนที่ถูกปกป้อง/ผู้ใช้เป็นเจ้าของ: **${protectedDrift.length}**\n\nการแก้สิทธิ์ต้องได้รับการอนุมัติจากผู้ปฏิบัติการอิสระ การอนุมัติผูกกับแฮชความคลาดเคลื่อนปัจจุบัน หากสถานะเปลี่ยนจะยกเลิกการดำเนินการ\n\n-# การเปิดตัวควบคุมนี้จะไม่เปลี่ยนสิทธิ์ใด`, tone: 'warning', actions: [controls], ephemeral: true }));
      return true;
    }

    if (id === 'repair:permissions:request') {
      const result = await scanRepairState(interaction.guild, deps.database, deps.dashboardUrl);
      const repairable = result.permissionDrift.filter((item)=>item.ownership!=='USER_OWNED'&&item.ownership!=='LOCKED');
      const protectedDrift = result.permissionDrift.length-repairable.length;
      if (!repairable.length) { await interaction.reply(v2NoticePanel({ title: 'ซ่อมสิทธิ์', description: protectedDrift ? `เหลือเพียง **${protectedDrift}** รายการที่ถูกปกป้อง/ผู้ใช้เป็นเจ้าของ ซึ่งจะไม่ซ่อมอัตโนมัติ` : 'ไม่มีความคลาดเคลื่อนด้านสิทธิ์ที่ซ่อมได้เหลืออยู่', tone: 'neutral', ephemeral: true })); return true; }
      const approvalId=randomUUID(); const correlationId=newCorrelationId(); const driftHash=permissionRepairDriftHash(repairable);
      await new ApprovalRepository(deps.database).create({approvalId,guildId:interaction.guild.id,operationKey:'PERMISSION_REPAIR',risk:'HIGH',requestedBy:interaction.user.id,requiredApprovals:1,
        payload:{driftHash,logicalKeys:repairable.map((item)=>item.logicalKey),protectedDrift},correlationId,expiresAt:new Date(Date.now()+20*60_000)});
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'PERMISSION_REPAIR_REQUESTED',resourceType:'GUILD',resourceId:interaction.guild.id,afterState:{approvalId,driftHash,repairable:repairable.length,protectedDrift},result:'PENDING_APPROVAL',correlationId});
      await interaction.reply(v2NoticePanel({ title: 'สร้างคำขอซ่อมสิทธิ์แล้ว', description: `**รหัสอนุมัติ** \`${approvalId}\`\nช่องที่ซ่อมได้: **${repairable.length}** · ถูกปกป้อง: **${protectedDrift}**\n\nผู้ปฏิบัติการที่มีสิทธิ์จัดการเซิร์ฟเวอร์คนอื่นต้องเปิด **สิทธิ์ → อนุมัติคำขอ** แล้วกรอกรหัสนี้`, tone: 'warning', ephemeral: true }));
      return true;
    }

    if (id === 'repair:permissions:approve') {
      const field=new TextInputBuilder().setCustomId('approvalId').setLabel('รหัสอนุมัติการซ่อมสิทธิ์').setStyle(TextInputStyle.Short).setMinLength(36).setMaxLength(36).setRequired(true);
      await interaction.showModal(new ModalBuilder().setCustomId('repair:permissions:approve:modal').setTitle('อนุมัติการซ่อมสิทธิ์').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(field)));
      return true;
    }

    if (id === 'repair:panels') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const managed = await managedBlueprint(deps.database, interaction.guild.id);
      if (!managed) throw new Error('GUILD_CONFIGURATION_NOT_FOUND');
      const results = await new PanelDeploymentService(deps.database).deployForBlueprint({
        guild: interaction.guild,
        blueprint: managed.blueprint,
        dashboardUrl: deps.dashboardUrl,
        actorId: interaction.user.id,
        ...panelRenderProfileFromGuildConfig(managed.config!),
      });
      const deployment = new PanelDeploymentService(deps.database);
      const orphaned = await deployment.archiveOrphansForBlueprint({ guild: interaction.guild, blueprint: managed.blueprint });
      const counts = countBy(results.map((result) => result.action));
      await interaction.editReply(v2EditNoticePanel({ title: 'ปรับสถานะแผงระบบให้ตรงกันแล้ว', description: `สร้าง **${counts.CREATED ?? 0}** · อัปเดต **${counts.UPDATED ?? 0}** · ซ่อม **${counts.REPAIRED ?? 0}** · คงไว้ **${counts.KEPT ?? 0}** · ข้าม **${counts.SKIPPED ?? 0}**\nรายการกำพร้าที่เก็บในทะเบียน **${orphaned.length}**\n\nไม่มีข้อความกำพร้าถูกลบ`, tone: 'success' }));
      return true;
    }

    if (id === 'repair:panel-history' || id === 'repair:panel-rollback') {
      const panelId = new TextInputBuilder().setCustomId('panelId').setLabel('รหัสแผงระบบ').setStyle(TextInputStyle.Short).setPlaceholder('เช่น PANEL_WELCOME').setMinLength(5).setMaxLength(80).setRequired(true);
      const modal = new ModalBuilder().setCustomId(id === 'repair:panel-history' ? 'repair:panel-history:modal' : 'repair:panel-rollback:modal').setTitle(id === 'repair:panel-history' ? 'ประวัติเวอร์ชันแผงระบบ' : 'ย้อนคืนแผงระบบที่จัดการ').addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(panelId));
      if (id === 'repair:panel-rollback') {
        const version = new TextInputBuilder().setCustomId('version').setLabel('รุ่นเนื้อหา').setStyle(TextInputStyle.Short).setPlaceholder('1').setMinLength(1).setMaxLength(8).setRequired(true);
        modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(version));
      }
      await interaction.showModal(modal); return true;
    }

    if (id === 'integration:health') {
      const [general, gaming] = await Promise.all([
        deps.database.requirePool().query<any>(`select integration_key,status,last_health_at,updated_at from integrations where guild_id=$1 order by integration_key`, [interaction.guild.id]),
        deps.database.requirePool().query<any>(`select game_key,adapter_key,status,last_sync_at,last_error_code,updated_at from game_integrations where guild_id=$1 order by game_key,adapter_key`, [interaction.guild.id]),
      ]);
      const lines = [
        ...general.rows.map((row) => `**${row.integration_key}** · ${presentSystemValue(row.status)} · ตรวจล่าสุด ${row.last_health_at ? `<t:${Math.floor(new Date(row.last_health_at).getTime() / 1000)}:R>` : 'ยังไม่มีข้อมูล'}`),
        ...gaming.rows.map((row) => `**${row.game_key}/${row.adapter_key}** · ${presentSystemValue(row.status)}${row.last_error_code ? ` · รหัสข้อผิดพลาด \`${String(row.last_error_code).slice(0, 40)}\`` : ''}`),
      ];
      await interaction.reply(v2NoticePanel({ title: 'สุขภาพการเชื่อมต่อ', description: `${(lines.length ? lines.join('\n') : 'ยังไม่ได้ตั้งค่าการเชื่อมต่อภายนอกสำหรับเซิร์ฟเวอร์นี้').slice(0,4000)}\n\n-# จุดนี้จะไม่แสดงข้อมูลอ้างอิงความลับหรือข้อมูลรับรอง`, tone: 'primary', ephemeral: true }));
      return true;
    }
  } catch (error) {
    if (!interaction.replied && !interaction.deferred) await interaction.reply(v2NoticePanel({ title: 'การกู้คืนล้มเหลวอย่างปลอดภัย', description: safeDiscordError(error,{fallback:'ระบบกู้คืนหยุดการดำเนินการเพื่อป้องกันสถานะไม่สอดคล้อง'}), tone: 'danger', ephemeral: true }));
    else if (interaction.deferred) await interaction.editReply(v2EditNoticePanel({ title: 'การกู้คืนล้มเหลวอย่างปลอดภัย', description: safeDiscordError(error,{fallback:'ระบบกู้คืนหยุดการดำเนินการเพื่อป้องกันสถานะไม่สอดคล้อง'}), tone: 'danger' })).catch(() => undefined);
    return true;
  }
  return false;
}

export async function handleRecoveryModal(interaction: ModalSubmitInteraction, deps: RecoveryActionDependencies): Promise<boolean> {
  if (!interaction.inCachedGuild() || !['backup:restore-plan:modal','backup:approve:modal','backup:execute:modal','repair:panel-history:modal','repair:panel-rollback:modal','repair:permissions:approve:modal'].includes(interaction.customId)) return false;
  if (!deps.database.configured) {
    await interaction.reply(v2NoticePanel({ title: 'ดูแผนกู้คืนไม่ได้ในขณะนี้', description: 'การดูแผนกู้คืนต้องใช้ `DATABASE_URL`', tone: 'warning', ephemeral: true }));
    return true;
  }
  if (!managerGuard(interaction)) {
    await interaction.reply(v2NoticePanel({ title: 'จำกัดสิทธิ์การควบคุมกู้คืน', description: 'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์เพื่อดูแผนกู้คืน', tone: 'danger', ephemeral: true }));
    return true;
  }
  try {
    if (interaction.customId === 'repair:permissions:approve:modal') {
      if (!deps.jobs) throw new Error('JOB_QUEUE_UNAVAILABLE');
      const approvalId=interaction.fields.getTextInputValue('approvalId').trim();
      const approvals=new ApprovalRepository(deps.database); const existing=await approvals.get(interaction.guild.id,approvalId);
      if(!existing||existing.operationKey!=='PERMISSION_REPAIR') throw new Error('PERMISSION_REPAIR_APPROVAL_NOT_FOUND');
      const approved=await approvals.approve(interaction.guild.id,approvalId,interaction.user.id);
      if(approved.state!=='APPROVED') { await interaction.reply(v2NoticePanel({title:'บันทึกการอนุมัติแล้ว',description:`${approved.approvedBy.length}/${approved.requiredApprovals} การอนุมัติอิสระแล้ว`,tone:'warning',ephemeral:true})); return true; }
      const driftHash=String(approved.payload.driftHash??''); if(!driftHash) throw new Error('PERMISSION_REPAIR_HASH_MISSING');
      const jobId=await deps.jobs.create({guildId:interaction.guild.id,actorId:interaction.user.id,type:'PERMISSION_REPAIR',payload:{approvalId,driftHash},priority:85,correlationId:approved.correlationId,idempotencyKey:`permission-repair:${approvalId}`,maxRetries:1});
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'PERMISSION_REPAIR_APPROVED',resourceType:'GUILD',resourceId:interaction.guild.id,afterState:{approvalId,jobId,driftHash},result:'QUEUED',correlationId:approved.correlationId});
      await interaction.reply(v2NoticePanel({title:'นำงานซ่อมสิทธิ์เข้าคิวแล้ว',description:`งาน **${jobId}** ถูกเข้าคิวแล้ว หากความคลาดเคลื่อนเปลี่ยนก่อนดำเนินการ งานจะล้มเหลวแบบ stale แทนการใช้แผนเก่า`,tone:'success',ephemeral:true}));
      return true;
    }

    if (interaction.customId === 'repair:panel-history:modal') {
      const panelId=interaction.fields.getTextInputValue('panelId').trim().toUpperCase();
      const versions=await new PanelRegistryRepository(deps.database).listVersions(interaction.guild.id,panelId);
      const body=versions.length?versions.slice(0,20).map((item)=>`v**${item.contentVersion}** · hash \`${item.contentHash.slice(0,16)}…\` · <t:${Math.floor(new Date(item.createdAt).getTime()/1000)}:R>`).join('\n'):'ไม่มีเวอร์ชันที่จัดเก็บสำหรับแผงระบบนี้';
      await interaction.reply(v2NoticePanel({title:`${panelId} · ประวัติเวอร์ชัน`,description:`${body.slice(0,3900)}\n\n-# การย้อนคืนจะแก้ข้อความที่ระบบดูแลในตำแหน่งเดิม และจะไม่ลบข้อความที่ผู้ใช้เป็นเจ้าของ`,tone:'ice',ephemeral:true}));return true;
    }
    if (interaction.customId === 'repair:panel-rollback:modal') {
      const panelId=interaction.fields.getTextInputValue('panelId').trim().toUpperCase(); const version=Number(interaction.fields.getTextInputValue('version').trim());
      if(!Number.isInteger(version)||version<1) throw new Error('INVALID_PANEL_VERSION');
      const result=await new PanelDeploymentService(deps.database).rollbackPanel({guild:interaction.guild,panelId,contentVersion:version,actorId:interaction.user.id});
      await new AuditRepository(deps.database).record({auditId:randomUUID(),guildId:interaction.guild.id,actorId:interaction.user.id,action:'PANEL_ROLLBACK',resourceType:'PANEL',resourceId:panelId,afterState:{contentVersion:version,messageId:result.messageId,channelId:result.channelId},result:'SUCCEEDED',correlationId:newCorrelationId()});
      await interaction.reply(v2NoticePanel({title:'ย้อนคืนแผงระบบแล้ว',description:`**${panelId}** → เวอร์ชันเนื้อหา **${version}**\nข้อความ \`${result.messageId}\` ถูกนำกลับมาใช้หรือสร้างใหม่เฉพาะเมื่อหายไป`,tone:'success',ephemeral:true}));return true;
    }
    if (interaction.customId === 'backup:approve:modal') {
      const approvalId = interaction.fields.getTextInputValue('approvalId').trim();
      const approvals = new ApprovalRepository(deps.database);
      const existing = await approvals.get(interaction.guild.id, approvalId);
      if (!existing || existing.operationKey !== 'RESTORE_APPLY') throw new Error('RESTORE_APPROVAL_NOT_FOUND');
      const approved = await approvals.approve(interaction.guild.id, approvalId, interaction.user.id);
      await interaction.reply(v2NoticePanel({ title: approved.state === 'APPROVED' ? 'อนุมัติการกู้คืนครบแล้ว' : 'บันทึกการอนุมัติการกู้คืนแล้ว', description: approved.state === 'APPROVED'
        ? `การอนุมัติการกู้คืน **${approvalId}** ครบตามเงื่อนไขแล้ว ใช้ **ดำเนินการกู้คืน** พร้อมรหัสรอบกู้คืน \`${String(approved.payload.restoreRunId ?? 'ไม่ทราบ')}\`.`
        : `**${approved.approvedBy.length}/${approved.requiredApprovals}** การอนุมัติอิสระแล้ว`, tone: approved.state === 'APPROVED' ? 'success' : 'warning', ephemeral: true }));
      return true;
    }

    if (interaction.customId === 'backup:execute:modal') {
      if (!deps.jobs) throw new Error('JOB_QUEUE_UNAVAILABLE');
      const restoreRunId = interaction.fields.getTextInputValue('restoreRunId').trim();
      const runs = new RestoreRunRepository(deps.database);
      const run = await runs.get(interaction.guild.id, restoreRunId);
      if (!run) throw new Error('RESTORE_RUN_NOT_FOUND');
      if (!run.approvalRequestId) throw new Error('RESTORE_APPROVAL_REQUIRED');
      const approval = await new ApprovalRepository(deps.database).get(interaction.guild.id, run.approvalRequestId);
      if (!approval || approval.operationKey !== 'RESTORE_APPLY' || approval.state !== 'APPROVED') throw new Error('RESTORE_APPROVAL_NOT_APPROVED');
      if (!['PLANNED','WAITING_APPROVAL'].includes(run.state)) throw new Error(`RESTORE_RUN_NOT_EXECUTABLE:${run.state}`);
      const jobId = await deps.jobs.create({
        guildId: interaction.guild.id,
        actorId: interaction.user.id,
        type: 'RESTORE_APPLY',
        payload: { restoreRunId, backupId: run.backupId, approvalId: run.approvalRequestId },
        priority: approval.risk === 'CRITICAL' ? 95 : 90,
        correlationId: run.correlationId,
        idempotencyKey: `restore:${restoreRunId}`,
        maxRetries: 1,
      });
      await new AuditRepository(deps.database).record({ auditId: randomUUID(), guildId: interaction.guild.id, actorId: interaction.user.id,
        action: 'RESTORE_ENQUEUED', resourceType: 'BACKUP', resourceId: run.backupId,
        afterState: { restoreRunId, jobId, approvalId: run.approvalRequestId, risk: approval.risk }, result: 'SUCCEEDED', correlationId: run.correlationId });
      await interaction.reply(v2NoticePanel({ title: 'นำงานกู้คืนที่อนุมัติแล้วเข้าคิว', description: `**งาน** ${jobId}\n**รอบกู้คืน** \`${restoreRunId}\`\n\nเวิร์กเกอร์บังคับสำรองข้อมูลก่อนกู้คืน ล็อกกิลด์ บันทึกการเปลี่ยนแปลง และตรวจสอบหลังใช้งาน`, tone: 'warning', ephemeral: true }));
      return true;
    }

    const backupId = interaction.fields.getTextInputValue('backupId').trim();
    const backup = await new BackupSnapshotRepository(deps.database).get(interaction.guild.id, backupId);
    if (!backup?.payload) throw new Error('BACKUP_NOT_FOUND');
    const envelope = backup.payload as unknown as BackupEnvelope<GuildBackupPayload>;
    const changes = await new GuildBackupService(deps.database).plan(interaction.guild.id, envelope);
    const counts = countBy(changes.map((change) => change.kind));
    const conflicts = changes.filter((change) => change.kind === 'CONFLICT');
    const actionable = changes.filter((change) => change.kind !== 'KEEP');
    const highlights = actionable.slice(0, 12).map((change) => `${recoveryUi(change.kind)} · ${change.logicalKey} · ความเสี่ยง${recoveryUi(change.risk)}`);
    const restoreRunId = randomUUID();
    const correlationId = newCorrelationId();
    const runRepo = new RestoreRunRepository(deps.database);
    await runRepo.create({ restoreRunId, guildId: interaction.guild.id, backupId, state: 'PLANNED',
      plan: { changes: changes.map((change) => ({ kind: change.kind, logicalKey: change.logicalKey, risk: change.risk, reason: change.reason })), counts },
      requestedBy: interaction.user.id, correlationId });

    let approvalText = 'ไม่ต้องอนุมัติ เพราะไม่มีการเปลี่ยนสถานะ';
    let approvalId: string | undefined;
    let risk: 'HIGH' | 'CRITICAL' | undefined;
    if (conflicts.length) {
      approvalText = `ถูกบล็อก: ต้องแก้ข้อขัดแย้งที่ได้รับการปกป้อง ${conflicts.length} รายการก่อนดำเนินการ`;
    } else if (actionable.length) {
      risk = restoreApprovalRisk(changes, envelope);
      const newApprovalId = randomUUID();
      approvalId = newApprovalId;
      const requiredApprovals = risk === 'CRITICAL' ? 2 : 1;
      await new ApprovalRepository(deps.database).create({ approvalId: newApprovalId, guildId: interaction.guild.id, operationKey: 'RESTORE_APPLY', risk,
        requestedBy: interaction.user.id, requiredApprovals, payload: { restoreRunId, backupId, changeCount: actionable.length },
        correlationId, expiresAt: new Date(Date.now() + 30 * 60_000) });
      await runRepo.setApproval(interaction.guild.id, restoreRunId, newApprovalId);
      approvalText = `ความเสี่ยง${recoveryUi(risk)} · ต้องมีผู้อนุมัติอิสระ ${requiredApprovals} คน และผู้ขออนุมัติตัวเองไม่ได้`;
    }

    await new AuditRepository(deps.database).record({ auditId: randomUUID(), guildId: interaction.guild.id, actorId: interaction.user.id,
      action: 'RESTORE_PREVIEW_CREATED', resourceType: 'BACKUP', resourceId: backupId,
      afterState: { restoreRunId, approvalId, risk, counts, conflicts: conflicts.length }, result: conflicts.length ? 'BLOCKED' : 'SUCCEEDED', correlationId });

    const restoreDescription = `${(highlights.length ? highlights.join('\n') : 'การเชื่อมโยงเชิงตรรกะปัจจุบันตรงกับข้อมูลสำรองชุดนี้แล้ว').slice(0,3500)}\n\n**แผน** สร้าง ${counts.CREATE ?? 0} · อัปเดต ${counts.UPDATE ?? 0} · คงไว้ ${counts.KEEP ?? 0} · ขัดแย้ง ${counts.CONFLICT ?? 0} · นำการเชื่อมโยงออก ${counts.REMOVE_MAPPING ?? 0}\n**การอนุมัติ** ${approvalText.slice(0,1024)}\n**รอบกู้คืน** \`${restoreRunId}\`${approvalId ? `\n**รหัสอนุมัติ** \`${approvalId}\`` : ''}\n\n-# ข้อมูลสำรอง ${backupId} · การนำการเชื่อมโยงออกไม่หมายถึงการลบช่องหรือยศ`;
    await interaction.reply(v2NoticePanel({ title: 'ตัวอย่างการกู้คืน · ยังไม่มีการเปลี่ยนแปลง', description: restoreDescription, tone: conflicts.length ? 'danger' : actionable.length ? 'warning' : 'success', ephemeral: true }));
    return true;
  } catch (error) {
    await interaction.reply(v2NoticePanel({ title: 'การกู้คืนล้มเหลวอย่างปลอดภัย', description: safeDiscordError(error,{fallback:'ไม่สามารถสร้างตัวอย่างหรือดำเนินการกู้คืนได้อย่างปลอดภัย'}), tone: 'danger', ephemeral: true }));
    return true;
  }
}
