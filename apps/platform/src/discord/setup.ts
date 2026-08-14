import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  MessageFlags,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '@autoserver/config';
import { ensureGuild, MaintenanceWindowRepository, PanelRegistryRepository, ResourceMappingRepository, SetupSessionRepository, type Database, type SetupSessionRecord } from '@autoserver/database';
import type { JobRepository } from '@autoserver/jobs';
import { DiscordGuildScanner, SetupPlanner, analyzeSetupImpact, applyDesiredResourceLocks, planResourceLocks } from '@autoserver/setup';
import { panelsForBlueprint, planPreviewPanel, setupConfigurationPanel, setupControlPanel, v2EditNoticePanel, v2NoticePanel } from '@autoserver/panels';
import { canManagePlatform } from '@autoserver/security';
import { newCorrelationId, type EventBus } from '@autoserver/core';
import { analyzeSetupConfigurationImpact, blueprintForSetupDraft, defaultSetupDraft, enabledModulesForDraft, normalizeSetupDraft, patchSetupDraft, type SetupDraft, type ModulePreset, type SetupTheme, type GamingPreset, type SecurityPreset, type AutomationPreset } from '@autoserver/control-center';
import { handlePanelButton, handlePanelModal, handlePanelSelect } from './panel-actions.js';
import { resolveGuildBlueprint } from '../runtime/blueprint-resolver.js';
import { maintenancePolicyFromAutomation, operationAllowed } from '@autoserver/operations';
import { AdmissionControlRepository } from '@autoserver/admission-control';
import { VISUAL_SCENE_PRESETS, visualScenePatch, type VisualSceneKey } from '@autoserver/visual-system';
import { allowedSetupModuleKeys, assertSetupDraftSemantics, assertSetupModuleOverridesAllowed, loadCurrentSetupDraft, setupApprovalHash, setupConfigurationWorkUnits, setupDraftFingerprint } from '../runtime/setup-state.js';
import { presentEnabled, presentSystemValue } from '@autoserver/localization';

export const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('ตั้งค่าและจัดเตรียมระบบออโต้เซิร์ฟเวอร์ทั้งหมด')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((option) => option
    .setName('mode')
    .setDescription('เปิดศูนย์ตั้งค่า ดูตัวอย่างสถานะเป้าหมาย หรือตรวจงานปัจจุบัน')
    .setRequired(false)
    .addChoices(
      { name: 'ศูนย์ควบคุมการตั้งค่า', value: 'wizard' },
      { name: 'ดูตัวอย่างก่อนนำไปใช้', value: 'dry-run' },
      { name: 'สถานะปัจจุบัน', value: 'status' },
    ))
  .addStringOption((option) => option
    .setName('blueprint')
    .setDescription('เลือกแม่แบบเริ่มต้นของเซิร์ฟเวอร์ โดยทุกส่วนยังปรับแต่งได้')
    .setRequired(false)
    .addChoices(
      { name: 'ศูนย์ควบคุมแบบผสม', value: 'hybrid-standard' },
      { name: 'ชุมชนเกมขั้นสูง', value: 'gaming-advanced' },
      { name: 'แพลตฟอร์มพรีเมียมครบวงจร', value: 'omni-premium' },
      { name: 'สตูดิโอครีเอเตอร์', value: 'creator-studio' },
      { name: 'ศูนย์การเรียนรู้', value: 'education-focus' },
      { name: 'ธุรกิจและบริการช่วยเหลือ', value: 'business-support' },
      { name: 'องค์กรระดับใหญ่', value: 'organization-enterprise' },
      { name: 'ชุมชนกะทัดรัด', value: 'community-compact' },
    ));

export async function registerDiscordCommands(config: AppConfig): Promise<void> {
  if (!config.DISCORD_BOT_TOKEN || !config.DISCORD_APPLICATION_ID) throw new Error('Discord credentials are not configured');
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_BOT_TOKEN);
  const body = [setupCommand.toJSON()];
  if (config.DISCORD_TEST_GUILD_ID) await rest.put(Routes.applicationGuildCommands(config.DISCORD_APPLICATION_ID, config.DISCORD_TEST_GUILD_ID), { body });
  else await rest.put(Routes.applicationCommands(config.DISCORD_APPLICATION_ID), { body });
}

function isAuthorized(interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction): boolean {
  return interaction.inCachedGuild() && canManagePlatform(interaction.member);
}

async function setupMutationAllowed(database: Database, guildId: string): Promise<boolean> {
  if (!database.configured) return true;
  const window = await new MaintenanceWindowRepository(database).current(guildId);
  if (!window) return true;
  return operationAllowed(maintenancePolicyFromAutomation({ ...window.automationPolicy, reason: window.reason }), 'SETUP');
}

async function buildPlan(interaction: { guild: NonNullable<ChatInputCommandInteraction['guild']> }, database: Database, blueprintKey: string, draft?: SetupDraft) {
  await ensureGuild(database, { id: interaction.guild.id, name: interaction.guild.name, ownerId: interaction.guild.ownerId });
  const mappings = new ResourceMappingRepository(database);
  const scanner = new DiscordGuildScanner(mappings);
  const rawSnapshot = await scanner.scan(interaction.guild);
  const effectiveDraft = draft ?? (await loadCurrentSetupDraft(database, interaction.guild.id, blueprintKey)).draft;
  const snapshot = applyDesiredResourceLocks(rawSnapshot, effectiveDraft.resourceLocks);
  const baseBlueprint = await resolveGuildBlueprint(database,interaction.guild.id,effectiveDraft.blueprintKey);
  const blueprint = blueprintForSetupDraft(baseBlueprint, effectiveDraft);
  assertSetupModuleOverridesAllowed(effectiveDraft, blueprint);
  assertSetupDraftSemantics(effectiveDraft);
  const knownLockKeys = new Set([...rawSnapshot.mappings.map((mapping)=>mapping.logicalKey), ...blueprint.resources.map((resource)=>resource.logicalKey)]);
  const unknownLock = effectiveDraft.resourceLocks.find((key)=>!knownLockKeys.has(key));
  if(unknownLock) throw new Error(`SETUP_RESOURCE_LOCK_UNKNOWN:${unknownLock}`);
  const plan = new SetupPlanner().plan(snapshot, blueprint);
  const impact = analyzeSetupImpact(plan.actions);
  const currentSetup = await loadCurrentSetupDraft(database, interaction.guild.id);
  const configurationImpact = analyzeSetupConfigurationImpact(currentSetup.draft, effectiveDraft);
  const lockPlan = planResourceLocks(rawSnapshot.mappings, effectiveDraft.resourceLocks);
  const baseConfigVersion=currentSetup.configVersion??0;
  const baseDraftFingerprint=setupDraftFingerprint(currentSetup.draft);
  const planHash = setupApprovalHash(plan, effectiveDraft, blueprint, {configVersion:baseConfigVersion,draftFingerprint:baseDraftFingerprint});
  return { plan, blueprint, impact, configurationImpact, lockPlan, planHash, draft: effectiveDraft, baseConfigVersion, baseDraftFingerprint };
}

export interface SetupInteractionDependencies { config: AppConfig; database: Database; jobs: JobRepository | null; bus?: EventBus; }

async function openSetupSession(interaction: ChatInputCommandInteraction, deps: SetupInteractionDependencies, blueprintKey?: string): Promise<{ sessionId?: string; draft?: SetupDraft }> {
  if (!deps.database.configured) return {};
  await ensureGuild(deps.database, { id: interaction.guild!.id, name: interaction.guild!.name, ownerId: interaction.guild!.ownerId });
  const { draft } = await loadCurrentSetupDraft(deps.database, interaction.guild!.id, blueprintKey);
  const session = await new SetupSessionRepository(deps.database).start({
    sessionId: randomUUID(), guildId: interaction.guild!.id, actorId: interaction.user.id, correlationId: newCorrelationId(), config: draft as unknown as Record<string, unknown>, ttlMinutes: 60,
  });
  return { sessionId: session.sessionId, draft };
}

async function loadSession(interaction: ButtonInteraction | StringSelectMenuInteraction, deps: SetupInteractionDependencies, sessionId: string): Promise<SetupSessionRecord<Record<string, unknown>>> {
  if (!deps.database.configured) throw new Error('Durable setup sessions require DATABASE_URL');
  const session = await new SetupSessionRepository(deps.database).get(sessionId, interaction.guild!.id);
  if (!session || session.actorId !== interaction.user.id) throw new Error('Setup session expired or belongs to another operator. Reopen /setup.');
  return session;
}

async function patchSession(interaction: ButtonInteraction | StringSelectMenuInteraction, deps: SetupInteractionDependencies, session: SetupSessionRecord<Record<string, unknown>>, draft: SetupDraft) {
  return new SetupSessionRepository(deps.database).patch({
    sessionId: session.sessionId, guildId: interaction.guild!.id, actorId: interaction.user.id, expectedVersion: session.configVersion, config: draft as unknown as Record<string, unknown>,
  });
}

function asDraft(session: SetupSessionRecord<Record<string, unknown>>): SetupDraft {
  return normalizeSetupDraft(session.config,String(session.config.blueprintKey ?? 'hybrid-standard'));
}

export async function handleSetupCommand(interaction: ChatInputCommandInteraction, deps: SetupInteractionDependencies): Promise<void> {
  if (interaction.commandName !== 'setup') return;
  if (!interaction.inCachedGuild() || !isAuthorized(interaction)) {
    await interaction.reply(v2NoticePanel({ title: 'ปฏิเสธการเข้าถึงการตั้งค่า', description: 'ต้องมีสิทธิ์จัดการเซิร์ฟเวอร์หรือเป็นเจ้าของเซิร์ฟเวอร์เพื่อใช้ส่วนควบคุมนี้', tone: 'danger', ephemeral: true }));
    return;
  }

  const mode = interaction.options.getString('mode') ?? 'wizard';
  const requestedBlueprintKey = interaction.options.getString('blueprint') ?? undefined;
  const blueprintKey = requestedBlueprintKey ?? (deps.database.configured ? (await loadCurrentSetupDraft(deps.database, interaction.guild.id)).draft.blueprintKey : 'hybrid-standard');

  if (mode === 'wizard') {
    const session = await openSetupSession(interaction, deps, requestedBlueprintKey);
    const selectedBlueprint = session.draft?.blueprintKey ?? blueprintKey;
    await interaction.reply({ ...setupControlPanel({ guildName: interaction.guild.name, dashboardUrl: deps.config.DASHBOARD_URL, databaseReady: deps.database.configured, selectedBlueprint, sessionId: session.sessionId, draft: session.draft }), flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 });
    return;
  }

  if (mode === 'status') {
    if (!deps.jobs || !deps.database.configured) {
      await interaction.reply(v2NoticePanel({ title: 'สถานะคงทนยังไม่พร้อม', description: 'สถานะงานคงทนต้องใช้ `DATABASE_URL` ขณะนี้แพลตฟอร์มทำงานในโหมดไร้สถานะแบบจำกัด', tone: 'warning', ephemeral: true }));
      return;
    }
    const job = await deps.jobs.latestForGuild(interaction.guild.id);
    if (!job) { await interaction.reply(v2NoticePanel({ title: 'ยังไม่มีงานปฏิบัติการ', description: 'ยังไม่มีบันทึกงานตั้งค่าหรือปฏิบัติการสำหรับเซิร์ฟเวอร์นี้', tone: 'neutral', ephemeral: true })); return; }
    const progress = job.totalUnits ? `${job.completedUnits}/${job.totalUnits}` : presentSystemValue(job.currentStep ?? job.status);
    await interaction.reply(v2NoticePanel({
      title: 'ออโต้เซิร์ฟเวอร์ · งานปัจจุบัน',
      description: `**งาน** \`${job.jobId}\`\n**ประเภท** ${presentSystemValue(job.type)} · **สถานะ** ${presentSystemValue(job.status)}\n**ความคืบหน้า** ${progress}\n**รหัสความเชื่อมโยง** \`${job.correlationId}\`\n\n-# หน้าจอรุ่น 2 · ความคืบหน้ามาจากหน่วยงานและสถานะที่บันทึกจริง`,
      tone: 'primary', ephemeral: true,
    }));
    return;
  }

  if (!deps.database.configured) {
    await interaction.reply(v2NoticePanel({ title: 'การจำลองต้องใช้การจัดเก็บสถานะ', description: 'การจำลองการจับคู่อัตลักษณ์ต้องใช้ `DATABASE_URL` โปรดตั้งค่า PostgreSQL แบบคงทนก่อนเพื่อรักษาความเป็นเจ้าของทรัพยากรอย่างถูกต้อง', tone: 'warning', ephemeral: true }));
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { plan, blueprint, impact, configurationImpact, lockPlan } = await buildPlan(interaction, deps.database, blueprintKey);
  await interaction.editReply(planPreviewPanel({ ...plan, panelCount: panelsForBlueprint(blueprint).length, impact, configurationImpact, lockChanges: { lock: lockPlan.lock.length, unlock: lockPlan.unlock.length } }));
}

export async function handleSetupSelect(interaction: StringSelectMenuInteraction, deps: SetupInteractionDependencies): Promise<void> {
  if (!interaction.customId.startsWith('setup:')) return;
  if (!interaction.inCachedGuild() || !isAuthorized(interaction)) { await interaction.reply(v2NoticePanel({ title: 'จำกัดสิทธิ์การควบคุมการตั้งค่า', description: 'ส่วนควบคุมการตั้งค่านี้ใช้ได้เฉพาะผู้จัดการเซิร์ฟเวอร์', tone: 'danger', ephemeral: true })); return; }
  const [, kind, sessionId] = interaction.customId.split(':');

  if (!sessionId && kind === 'blueprint') {
    const selectedBlueprint = interaction.values[0] ?? 'hybrid-standard';
    await interaction.update(setupControlPanel({ guildName: interaction.guild.name, dashboardUrl: deps.config.DASHBOARD_URL, databaseReady: deps.database.configured, selectedBlueprint }));
    return;
  }
  if (!sessionId) return;

  const session = await loadSession(interaction, deps, sessionId);
  const draft = asDraft(session);
  const value = interaction.values[0];
  let next = draft;
  if (kind === 'blueprint' && value) {
    next = normalizeSetupDraft({ ...draft, blueprintKey: value }, value);
  } else if (kind === 'modules' && value) next = patchSetupDraft(draft, { modulePreset: value as ModulePreset });
  else if (kind === 'theme' && value) next = patchSetupDraft(draft, { themeKey: value as SetupTheme });
  else if (kind === 'gaming' && value) next = patchSetupDraft(draft, { gamingPreset: value as GamingPreset });
  else if (kind === 'security' && value) next = patchSetupDraft(draft, { securityPreset: value as SecurityPreset });
  else if (kind === 'automation' && value) next = patchSetupDraft(draft, { automationPreset: value as AutomationPreset });
  else return;

  const updated = await patchSession(interaction, deps, session, next);
  const stored = asDraft(updated);
  if (kind === 'blueprint') await interaction.update(setupControlPanel({ guildName: interaction.guild.name, dashboardUrl: deps.config.DASHBOARD_URL, databaseReady: true, selectedBlueprint: stored.blueprintKey, sessionId, draft: stored }));
  else {
    const page = kind === 'modules' ? 'systems' : kind === 'theme' ? 'visuals' : kind === 'security' ? 'safety' : kind as 'gaming' | 'automation';
    await interaction.update(setupConfigurationPanel(page, sessionId, stored));
  }
}

function setupIntegrationsModal(sessionId:string,draft:SetupDraft){
  const row=(input:TextInputBuilder)=>new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  const riot=draft.integrations.riotDataDragon;
  const github=draft.integrations.githubReleases;
  const discordStatus=draft.integrations.discordStatus;
  const steam=draft.integrations.steamNews;
  return new ModalBuilder().setCustomId(`setup:integrations-modal:${sessionId}`).setTitle('ผู้ให้บริการที่เชื่อมต่อ').addComponents(
    row(new TextInputBuilder().setCustomId('riot').setLabel('Riot: เปิด/ปิด | ภาษา | รอบตรวจ').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(`${riot.enabled?'on':'off'} | ${riot.locale} | ${riot.syncCadence}`)),
    row(new TextInputBuilder().setCustomId('github_repo').setLabel('คลัง GitHub สาธารณะ: owner/repo').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(201).setValue(github.owner&&github.repo?`${github.owner}/${github.repo}`:'')),
    row(new TextInputBuilder().setCustomId('github_options').setLabel('GitHub: เปิด/ปิด | รอบตรวจ | prerelease เปิด/ปิด').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(`${github.enabled?'on':'off'} | ${github.syncCadence} | ${github.includePrereleases?'on':'off'}`)),
    row(new TextInputBuilder().setCustomId('discord_status').setLabel('สถานะ Discord: เปิด/ปิด | รอบตรวจ').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(50).setValue(`${discordStatus.enabled?'on':'off'} | ${discordStatus.syncCadence}`)),
    row(new TextInputBuilder().setCustomId('steam_news').setLabel('Steam: เปิด/ปิด | appid | จำนวน | สูงสุด | รอบตรวจ').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(`${steam.enabled?'on':'off'} | ${steam.appId} | ${steam.count} | ${steam.maxLength} | ${steam.syncCadence}`)),
  );
}

function setupBudgetModal(sessionId:string,draft:SetupDraft){
  const row=(input:TextInputBuilder)=>new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  const format=(policy:SetupDraft['budgets']['providerSync'])=>`${policy.enabled?'on':'off'} | ${policy.mode} | ${policy.windowSeconds} | ${policy.maxUnits}`;
  return new ModalBuilder().setCustomId(`setup:budgets-modal:${sessionId}`).setTitle('งบทรัพยากร').addComponents(
    row(new TextInputBuilder().setCustomId('provider').setLabel('ซิงก์ผู้ให้บริการ: เปิด/ปิด | โหมด | วินาที | สูงสุด').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(format(draft.budgets.providerSync))),
    row(new TextInputBuilder().setCustomId('analytics').setLabel('วิเคราะห์ข้อมูล: เปิด/ปิด | โหมด | วินาที | สูงสุด').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(format(draft.budgets.analytics))),
    row(new TextInputBuilder().setCustomId('backup').setLabel('สำรองข้อมูล: เปิด/ปิด | โหมด | วินาที | สูงสุด').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(format(draft.budgets.backup))),
    row(new TextInputBuilder().setCustomId('fanout').setLabel('กระจายการแจ้งเตือน: เปิด/ปิด | โหมด | วินาที | สูงสุด').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(format(draft.budgets.notificationFanout))),
    row(new TextInputBuilder().setCustomId('bulk').setLabel('ระบบอัตโนมัติแบบกลุ่ม: เปิด/ปิด | โหมด | วินาที | สูงสุด').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(format(draft.budgets.bulkAutomation))),
  );
}
function parseBudgetPolicy(value:string,current:SetupDraft['budgets']['providerSync']){
  const parts=value.split('|').map((item)=>item.trim());const enabled=parseOnOff(parts[0]??'');const mode=String(parts[1]??'').toUpperCase();const windowSeconds=Number(parts[2]);const maxUnits=Number(parts[3]);
  if(enabled===undefined||!['OBSERVE','ENFORCE'].includes(mode)||!Number.isInteger(windowSeconds)||windowSeconds<60||windowSeconds>86400||!Number.isInteger(maxUnits)||maxUnits<1||maxUnits>1_000_000)throw new Error('BUDGET_POLICY_FORMAT_INVALID');
  return {enabled,mode:mode as 'OBSERVE'|'ENFORCE',windowSeconds,maxUnits};
}

function parseOnOff(value:string):boolean|undefined{
  const normalized=value.trim().toLowerCase();
  if(['on','true','1','yes'].includes(normalized))return true;
  if(['off','false','0','no'].includes(normalized))return false;
  return undefined;
}
function parseSyncCadence(value:string):'OFF'|'DAILY'|'WEEKLY'|undefined{
  const normalized=value.trim().toUpperCase();
  return ['OFF','DAILY','WEEKLY'].includes(normalized)?normalized as 'OFF'|'DAILY'|'WEEKLY':undefined;
}

function setupAdvancedModal(sessionId:string,draft:SetupDraft){
  const row=(input:TextInputBuilder)=>new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  const moduleText=Object.entries(draft.moduleOverrides).map(([key,value])=>`${key}=${value?'on':'off'}`).join(', ');
  return new ModalBuilder().setCustomId(`setup:advanced-modal:${sessionId}`).setTitle('การตั้งค่าขั้นสูง').addComponents(
    row(new TextInputBuilder().setCustomId('games').setLabel('รหัสเกม (คั่นด้วยจุลภาค)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(700).setValue(draft.games.join(', '))),
    row(new TextInputBuilder().setCustomId('timezone').setLabel('เขตเวลาของเซิร์ฟเวอร์').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(draft.timezone)),
    row(new TextInputBuilder().setCustomId('locks').setLabel('รหัสทรัพยากรที่ล็อกไว้').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500).setValue(draft.resourceLocks.join(', '))),
    row(new TextInputBuilder().setCustomId('modules').setLabel('กำหนดโมดูล: key=เปิด/ปิด').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1800).setValue(moduleText)),
    row(new TextInputBuilder().setCustomId('governance').setLabel('การเก็บรักษา การอนุมัติ และรอบสำรองข้อมูล').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(`${draft.retentionProfile}, ${draft.approvalMode}, ${draft.backupSchedule}@${draft.backupWeekday}:${draft.backupHourLocal}, ${draft.admissionPreset}, ${draft.aiProvider}`)),
  );
}

function parseModuleOverrides(value:string,allowedKeys:ReadonlySet<string>):Record<string,boolean>{
  const out:Record<string,boolean>={};
  for(const token of value.split(',').map((item)=>item.trim()).filter(Boolean)){
    const [rawKey,rawValue,...rest]=token.split('=').map((item)=>item?.trim());
    if(rest.length || !rawKey || !/^[a-z][a-z0-9-]{1,63}$/i.test(rawKey) || !rawValue) throw new Error(`MODULE_OVERRIDE_FORMAT_INVALID:${token}`);
    if(!allowedKeys.has(rawKey)) throw new Error(`MODULE_OVERRIDE_UNKNOWN:${rawKey}`);
    const normalized=rawValue.toLowerCase();
    if(!['on','off','true','false','1','0'].includes(normalized)) throw new Error(`MODULE_OVERRIDE_VALUE_INVALID:${rawKey}`);
    out[rawKey]=['on','true','1'].includes(normalized);
  }
  return out;
}


function setupVisualModesModal(sessionId:string,draft:SetupDraft){
  const row=(input:TextInputBuilder)=>new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  return new ModalBuilder().setCustomId(`setup:visual-modal:${sessionId}`).setTitle('โหมดประสบการณ์ภาพ').addComponents(
    row(new TextInputBuilder().setCustomId('decoration').setLabel('รูปแบบช่อง: CLEAN / SIGNAL / ICONIC').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setValue(draft.channelDecoration)),
    row(new TextInputBuilder().setCustomId('roles').setLabel('รูปแบบยศ: CLASSIC / THEMED / ENHANCED').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setValue(draft.roleVisualStyle)),
    row(new TextInputBuilder().setCustomId('media').setLabel('สื่อ: MINIMAL / BALANCED / RICH').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setValue(draft.mediaDensity)),
    row(new TextInputBuilder().setCustomId('scene').setLabel('ฉากสำเร็จรูป (ไม่บังคับ)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('รหัสฉาก: CALM / BALANCED / SHOWCASE / LIVE / OPERATIONS').setMaxLength(12)),
  );
}

function setupPreferencesModal(sessionId:string,draft:SetupDraft){
  const row=(input:TextInputBuilder)=>new ActionRowBuilder<TextInputBuilder>().addComponents(input);
  return new ModalBuilder().setCustomId(`setup:preferences-modal:${sessionId}`).setTitle('ภาษาและการแสดงผล').addComponents(
    row(new TextInputBuilder().setCustomId('locale').setLabel('ภาษา: ไทย').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setValue(draft.locale)),
    row(new TextInputBuilder().setCustomId('timezone').setLabel('เขตเวลา IANA').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(draft.timezone)),
    row(new TextInputBuilder().setCustomId('motion').setLabel('การเคลื่อนไหว: STATIC / BALANCED / ANIMATED / CINEMATIC').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setValue(draft.motionPreset)),
    row(new TextInputBuilder().setCustomId('density').setLabel('ความหนาแน่นแผง: COMPACT / COMFORTABLE / SPACIOUS').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setValue(draft.panelDensity)),
  );
}

export async function handleSetupModal(interaction:ModalSubmitInteraction,deps:SetupInteractionDependencies):Promise<void>{
  if(!interaction.customId.startsWith('setup:advanced-modal:')&&!interaction.customId.startsWith('setup:integrations-modal:')&&!interaction.customId.startsWith('setup:budgets-modal:')&&!interaction.customId.startsWith('setup:preferences-modal:')&&!interaction.customId.startsWith('setup:visual-modal:'))return;
  if(!interaction.inCachedGuild()||!canManagePlatform(interaction.member)){await interaction.reply(v2NoticePanel({title:'จำกัดสิทธิ์การควบคุมการตั้งค่า',description:'ส่วนควบคุมการตั้งค่านี้ใช้ได้เฉพาะผู้จัดการเซิร์ฟเวอร์',tone:'danger',ephemeral:true}));return;}
  const sessionId=interaction.customId.split(':')[2]; if(!sessionId)throw new Error('SETUP_SESSION_ID_MISSING');
  const session=await new SetupSessionRepository(deps.database).get(sessionId,interaction.guild.id);
  if(!session||session.actorId!==interaction.user.id)throw new Error('Setup session expired or belongs to another operator. Reopen /setup.');
  const draft=asDraft(session);
  if(interaction.customId.startsWith('setup:visual-modal:')){
    const decoration=interaction.fields.getTextInputValue('decoration').trim().toUpperCase();
    const roles=interaction.fields.getTextInputValue('roles').trim().toUpperCase();
    const media=interaction.fields.getTextInputValue('media').trim().toUpperCase();
    const scene=interaction.fields.getTextInputValue('scene').trim().toUpperCase();
    if(!['CLEAN','SIGNAL','ICONIC'].includes(decoration)||!['CLASSIC','THEMED','ENHANCED'].includes(roles)||!['MINIMAL','BALANCED','RICH'].includes(media)){
      await interaction.reply(v2NoticePanel({title:'รูปแบบโหมดภาพไม่ถูกต้อง',description:'รูปแบบช่องต้องเป็น `CLEAN`, `SIGNAL` หรือ `ICONIC`; ยศต้องเป็น `CLASSIC`, `THEMED` หรือ `ENHANCED`; สื่อต้องเป็น `MINIMAL`, `BALANCED` หรือ `RICH`',tone:'warning',ephemeral:true}));return;
    }
    if(scene && !(scene in VISUAL_SCENE_PRESETS)){await interaction.reply(v2NoticePanel({title:'ฉากสำเร็จรูปไม่ถูกต้อง',description:'ใช้ `CALM`, `BALANCED`, `SHOWCASE`, `LIVE` หรือ `OPERATIONS` หรือเว้นว่าง',tone:'warning',ephemeral:true}));return;}
    const scenePatch=scene?visualScenePatch(scene as VisualSceneKey):{};
    const candidate=normalizeSetupDraft({...draft,channelDecoration:decoration,roleVisualStyle:roles,mediaDensity:media,...scenePatch},draft.blueprintKey);
    const updated=await new SetupSessionRepository(deps.database).patch({sessionId,guildId:interaction.guild.id,actorId:interaction.user.id,expectedVersion:session.configVersion,config:candidate as unknown as Record<string,unknown>});
    const stored=asDraft(updated);
    await interaction.reply(v2NoticePanel({title:'บันทึกโหมดภาพแล้ว',description:`รูปแบบช่อง: **${presentSystemValue(stored.channelDecoration)}** · ยศ: **${presentSystemValue(stored.roleVisualStyle)}** · สื่อ: **${presentSystemValue(stored.mediaDensity)}**

${scene?`ฉากสำเร็จรูป: **${presentSystemValue(scene)}**\n`:''}ให้สแกนและดูตัวอย่างก่อนนำไปใช้`,tone:'success',ephemeral:true}));return;
  }
  if(interaction.customId.startsWith('setup:preferences-modal:')){
    const locale=interaction.fields.getTextInputValue('locale').trim().toLowerCase();
    const timezone=interaction.fields.getTextInputValue('timezone').trim();
    const motion=interaction.fields.getTextInputValue('motion').trim().toUpperCase();
    const density=interaction.fields.getTextInputValue('density').trim().toUpperCase();
    if(locale!=='th'||!['STATIC','BALANCED','ANIMATED','CINEMATIC'].includes(motion)||!['COMPACT','COMFORTABLE','SPACIOUS'].includes(density)){
      await interaction.reply(v2NoticePanel({title:'รูปแบบการตั้งค่าไม่ถูกต้อง',description:'ระบบใช้ภาษาไทย การเคลื่อนไหวต้องเป็น `STATIC`, `BALANCED`, `ANIMATED` หรือ `CINEMATIC`; ความหนาแน่นต้องเป็น `COMPACT`, `COMFORTABLE` หรือ `SPACIOUS`',tone:'warning',ephemeral:true}));return;
    }
    try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());}catch{await interaction.reply(v2NoticePanel({title:'เขตเวลาไม่ถูกต้อง',description:'ใช้เขตเวลา IANA เช่น `Asia/Bangkok`',tone:'warning',ephemeral:true}));return;}
    const candidate=normalizeSetupDraft({...draft,locale,timezone,motionPreset:motion,panelDensity:density},draft.blueprintKey);
    const updated=await new SetupSessionRepository(deps.database).patch({sessionId,guildId:interaction.guild.id,actorId:interaction.user.id,expectedVersion:session.configVersion,config:candidate as unknown as Record<string,unknown>});
    const stored=asDraft(updated);
    await interaction.reply(v2NoticePanel({title:'บันทึกการตั้งค่าแล้ว',description:`ภาษา: **ไทย** · เขตเวลา: **${stored.timezone}**\nการเคลื่อนไหว: **${presentSystemValue(stored.motionPreset)}** · ความหนาแน่น: **${presentSystemValue(stored.panelDensity)}**\n\nให้สแกนและดูตัวอย่างก่อนนำไปใช้`,tone:'success',ephemeral:true}));return;
  }
  if(interaction.customId.startsWith('setup:budgets-modal:')){
    try{
      const candidate=normalizeSetupDraft({...draft,budgets:{providerSync:parseBudgetPolicy(interaction.fields.getTextInputValue('provider'),draft.budgets.providerSync),analytics:parseBudgetPolicy(interaction.fields.getTextInputValue('analytics'),draft.budgets.analytics),backup:parseBudgetPolicy(interaction.fields.getTextInputValue('backup'),draft.budgets.backup),notificationFanout:parseBudgetPolicy(interaction.fields.getTextInputValue('fanout'),draft.budgets.notificationFanout),bulkAutomation:parseBudgetPolicy(interaction.fields.getTextInputValue('bulk'),draft.budgets.bulkAutomation)}},draft.blueprintKey);
      const updated=await new SetupSessionRepository(deps.database).patch({sessionId,guildId:interaction.guild.id,actorId:interaction.user.id,expectedVersion:session.configVersion,config:candidate as unknown as Record<string,unknown>});const stored=asDraft(updated);
      await interaction.reply(v2NoticePanel({title:'บันทึกงบทรัพยากรแล้ว',description:`ซิงก์ผู้ให้บริการ: **${presentSystemValue(stored.budgets.providerSync.mode)} ${stored.budgets.providerSync.maxUnits}/${stored.budgets.providerSync.windowSeconds} วินาที**
วิเคราะห์ข้อมูล: **${presentSystemValue(stored.budgets.analytics.mode)} ${stored.budgets.analytics.maxUnits}/${stored.budgets.analytics.windowSeconds} วินาที**
สำรองข้อมูล: **${presentSystemValue(stored.budgets.backup.mode)} ${stored.budgets.backup.maxUnits}/${stored.budgets.backup.windowSeconds} วินาที**
กระจายการแจ้งเตือน: **${presentSystemValue(stored.budgets.notificationFanout.mode)} ${stored.budgets.notificationFanout.maxUnits}/${stored.budgets.notificationFanout.windowSeconds} วินาที**

-# การแจ้งเตือนด้านความปลอดภัยจะข้ามงบงานทางเลือก`,tone:'success',ephemeral:true}));return;
    }catch(error){await interaction.reply(v2NoticePanel({title:'รูปแบบงบทรัพยากรไม่ถูกต้อง',description:'ใช้ `on/off | OBSERVE/ENFORCE | window-seconds | max-units` ตามรูปแบบที่กำหนด',tone:'warning',ephemeral:true}));return;}
  }
  if(interaction.customId.startsWith('setup:integrations-modal:')){
    const riotParts=interaction.fields.getTextInputValue('riot').split('|').map((item)=>item.trim());
    const riotEnabled=parseOnOff(riotParts[0]??'');const riotCadence=parseSyncCadence(riotParts[2]??'');
    const riotLocale=riotParts[1]??'';
    const githubParts=interaction.fields.getTextInputValue('github_options').split('|').map((item)=>item.trim());
    const githubEnabled=parseOnOff(githubParts[0]??'');const githubCadence=parseSyncCadence(githubParts[1]??'');const includePrereleases=parseOnOff(githubParts[2]??'');
    const statusParts=interaction.fields.getTextInputValue('discord_status').split('|').map((item)=>item.trim());
    const discordStatusEnabled=parseOnOff(statusParts[0]??'');const discordStatusCadence=parseSyncCadence(statusParts[1]??'');
    const steamParts=interaction.fields.getTextInputValue('steam_news').split('|').map((item)=>item.trim());
    const steamEnabled=parseOnOff(steamParts[0]??'');const steamAppId=Number(steamParts[1]??'');const steamCount=Number(steamParts[2]??'');const steamMaxLength=Number(steamParts[3]??'');const steamCadence=parseSyncCadence(steamParts[4]??'');
    const repoRaw=interaction.fields.getTextInputValue('github_repo').trim();
    const repoMatch=repoRaw?/^([A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99}))\/([A-Za-z0-9](?:[A-Za-z0-9_.-]{0,99}))$/.exec(repoRaw):null;
    const riotLocales=new Set(['cs_CZ','el_GR','pl_PL','ro_RO','hu_HU','en_GB','de_DE','es_ES','it_IT','fr_FR','ja_JP','ko_KR','es_MX','es_AR','pt_BR','en_US','en_AU','ru_RU','tr_TR','ms_MY','en_PH','en_SG','th_TH','vi_VN','id_ID','zh_MY','zh_CN','zh_TW']);
    if(riotEnabled===undefined||!riotLocales.has(riotLocale)||!riotCadence||githubEnabled===undefined||!githubCadence||includePrereleases===undefined||discordStatusEnabled===undefined||!discordStatusCadence||steamEnabled===undefined||!Number.isSafeInteger(steamAppId)||steamAppId<1||steamAppId>4294967295||![5,10,20].includes(steamCount)||![600,1200,2000,4000].includes(steamMaxLength)||!steamCadence){await interaction.reply(v2NoticePanel({title:'รูปแบบการเชื่อมต่อไม่ถูกต้อง',description:'รูปแบบที่รองรับ — Riot: `on/off | th_TH | DAILY/WEEKLY`; GitHub: `on/off | DAILY/WEEKLY | on/off`; Steam: `on/off | appid | count | max-length | DAILY/WEEKLY`',tone:'warning',ephemeral:true}));return;}
    if(githubEnabled&&!repoMatch){await interaction.reply(v2NoticePanel({title:'ต้องระบุคลัง GitHub',description:'การเปิดใช้ GitHub Releases ต้องระบุคลังสาธารณะรูปแบบ `owner/repo`',tone:'warning',ephemeral:true}));return;}
    const candidate=normalizeSetupDraft({...draft,integrations:{riotDataDragon:{enabled:riotEnabled,locale:riotLocale,syncCadence:riotCadence},githubReleases:{enabled:githubEnabled,owner:repoMatch?.[1]??'',repo:repoMatch?.[2]??'',includePrereleases,syncCadence:githubCadence},discordStatus:{enabled:discordStatusEnabled,syncCadence:discordStatusCadence},steamNews:{enabled:steamEnabled,appId:steamAppId,count:steamCount,maxLength:steamMaxLength,syncCadence:steamCadence}}},draft.blueprintKey);
    const updated=await new SetupSessionRepository(deps.database).patch({sessionId,guildId:interaction.guild.id,actorId:interaction.user.id,expectedVersion:session.configVersion,config:candidate as unknown as Record<string,unknown>});
    const stored=asDraft(updated);
    await interaction.reply(v2NoticePanel({title:'บันทึกการตั้งค่าการเชื่อมต่อแล้ว',description:`Riot Data Dragon: **${presentEnabled(stored.integrations.riotDataDragon.enabled)} / ${stored.integrations.riotDataDragon.locale} / ${presentSystemValue(stored.integrations.riotDataDragon.syncCadence)}**\nรุ่นเผยแพร่ GitHub: **${presentEnabled(stored.integrations.githubReleases.enabled)} / ${presentSystemValue(stored.integrations.githubReleases.syncCadence)}**\nสถานะ Discord: **${presentEnabled(stored.integrations.discordStatus.enabled)} / ${presentSystemValue(stored.integrations.discordStatus.syncCadence)}**\nข่าว Steam: **${presentEnabled(stored.integrations.steamNews.enabled)} / รหัสแอป ${stored.integrations.steamNews.appId} / ${stored.integrations.steamNews.count} รายการ / สูงสุด ${stored.integrations.steamNews.maxLength} อักขระ / ${presentSystemValue(stored.integrations.steamNews.syncCadence)}**\n\nการซิงก์ผู้ให้บริการจะทำผ่านงานคงทนหลังนำค่าตั้งไปใช้`,tone:'success',ephemeral:true}));
    return;
  }
  const [retentionRaw,approvalRaw,backupRaw,admissionRaw='BALANCED',aiProviderRaw='local-rules']=interaction.fields.getTextInputValue('governance').split(',').map((item)=>item.trim());
  const backupMatch=/^(OFF|DAILY|WEEKLY)(?:@([0-6]):([0-9]|1[0-9]|2[0-3]))?$/i.exec(backupRaw ?? '');
  const retentionAllowed=['MINIMAL','BALANCED','EXTENDED_AUDIT']; const approvalAllowed=['SAFE_DEFAULTS','STRICT','ENTERPRISE']; const admissionAllowed=['BALANCED','CONSERVATIVE','MAX_AVAILABILITY']; const aiProviderAllowed=['local-rules','openai-responses'];
  if(!retentionAllowed.includes(retentionRaw) || !approvalAllowed.includes(approvalRaw) || !backupMatch || !admissionAllowed.includes(admissionRaw) || !aiProviderAllowed.includes(aiProviderRaw)){await interaction.reply(v2NoticePanel({title:'รูปแบบธรรมาภิบาลไม่ถูกต้อง',description:'ใช้ `RETENTION, APPROVAL, BACKUP@weekday:hour, ADMISSION, AI_PROVIDER` เช่น `BALANCED, STRICT, WEEKLY@0:4, BALANCED, local-rules`',tone:'warning',ephemeral:true}));return;}
  const timezoneRaw=interaction.fields.getTextInputValue('timezone').trim();
  try{new Intl.DateTimeFormat('en',{timeZone:timezoneRaw}).format(new Date());}catch{await interaction.reply(v2NoticePanel({title:'เขตเวลาไม่ถูกต้อง',description:'ใช้เขตเวลา IANA เช่น `Asia/Bangkok`',tone:'warning',ephemeral:true}));return;}
  const baseBlueprint=await resolveGuildBlueprint(deps.database,interaction.guild.id,draft.blueprintKey);
  const allowedModuleKeys=allowedSetupModuleKeys(baseBlueprint);
  let moduleOverrides:Record<string,boolean>;
  try{moduleOverrides=parseModuleOverrides(interaction.fields.getTextInputValue('modules'),allowedModuleKeys);}catch(error){await interaction.reply(v2NoticePanel({title:'ค่ากำหนดโมดูลไม่ถูกต้อง',description:'ใช้คีย์โมดูลที่รองรับในรูปแบบ `key=on/off`',tone:'warning',ephemeral:true}));return;}
  const candidate=normalizeSetupDraft({
    ...draft,
    games:interaction.fields.getTextInputValue('games').split(',').map((item)=>item.trim()).filter(Boolean),
    timezone:timezoneRaw,
    resourceLocks:interaction.fields.getTextInputValue('locks').split(',').map((item)=>item.trim()).filter(Boolean),
    moduleOverrides,
    retentionProfile:retentionRaw,
    approvalMode:approvalRaw,
    backupSchedule:backupMatch?.[1]?.toUpperCase(),
    backupWeekday:backupMatch?.[2] === undefined ? draft.backupWeekday : Number(backupMatch[2]),
    backupHourLocal:backupMatch?.[3] === undefined ? draft.backupHourLocal : Number(backupMatch[3]),
    admissionPreset: admissionRaw as SetupDraft['admissionPreset'],
    aiProvider: aiProviderRaw as SetupDraft['aiProvider'],
  },draft.blueprintKey);
  const updated=await new SetupSessionRepository(deps.database).patch({sessionId,guildId:interaction.guild.id,actorId:interaction.user.id,expectedVersion:session.configVersion,config:candidate as unknown as Record<string,unknown>});
  const stored=asDraft(updated);
  await interaction.reply(v2NoticePanel({title:'บันทึกการตั้งค่าขั้นสูงแล้ว',description:`เกม: **${stored.games.length}** · ล็อก: **${stored.resourceLocks.length}**\nการเก็บรักษา: **${presentSystemValue(stored.retentionProfile)}** · การอนุมัติ: **${presentSystemValue(stored.approvalMode)}**\nสำรองข้อมูล: **${presentSystemValue(stored.backupSchedule)} @ ${stored.backupWeekday}:${String(stored.backupHourLocal).padStart(2,'0')}** · การรับเข้า: **${presentSystemValue(stored.admissionPreset)}**
ผู้ให้บริการปัญญาประดิษฐ์: **${presentSystemValue(stored.aiProvider)}**\n\nให้สแกนและดูตัวอย่างก่อนนำไปใช้`,tone:'success',ephemeral:true}));
}

export async function handleSetupButton(interaction: ButtonInteraction, deps: SetupInteractionDependencies): Promise<void> {
  if (!interaction.customId.startsWith('setup:')) return;
  if (!interaction.inCachedGuild() || !isAuthorized(interaction)) { await interaction.reply(v2NoticePanel({ title: 'จำกัดสิทธิ์การควบคุมการตั้งค่า', description: 'ส่วนควบคุมการตั้งค่านี้ใช้ได้เฉพาะผู้จัดการเซิร์ฟเวอร์', tone: 'danger', ephemeral: true })); return; }
  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'advanced') {
    const sessionId=parts[2]; if(!sessionId)throw new Error('SETUP_SESSION_ID_MISSING');
    const session=await loadSession(interaction,deps,sessionId);
    await interaction.showModal(setupAdvancedModal(sessionId,asDraft(session)));
    return;
  }

  if (action === 'budgets') {
    const sessionId=parts[2]; if(!sessionId)throw new Error('SETUP_SESSION_ID_MISSING');
    const session=await loadSession(interaction,deps,sessionId);
    await interaction.showModal(setupBudgetModal(sessionId,asDraft(session)));
    return;
  }

  if (action === 'integrations') {
    const sessionId=parts[2]; if(!sessionId)throw new Error('SETUP_SESSION_ID_MISSING');
    const session=await loadSession(interaction,deps,sessionId);
    await interaction.showModal(setupIntegrationsModal(sessionId,asDraft(session)));
    return;
  }

  if (action === 'visual-modes') {
    const sessionId=parts[2]; if(!sessionId)throw new Error('SETUP_SESSION_ID_MISSING');
    const session=await loadSession(interaction,deps,sessionId);
    await interaction.showModal(setupVisualModesModal(sessionId,asDraft(session)));
    return;
  }

  if (action === 'preferences') {
    const sessionId=parts[2]; if(!sessionId)throw new Error('SETUP_SESSION_ID_MISSING');
    const session=await loadSession(interaction,deps,sessionId);
    await interaction.showModal(setupPreferencesModal(sessionId,asDraft(session)));
    return;
  }

  if (action === 'review') {
    const sessionId=parts[2]; if(!sessionId)throw new Error('SETUP_SESSION_ID_MISSING');
    const session=await loadSession(interaction,deps,sessionId); const draft=asDraft(session);
    const base=await resolveGuildBlueprint(deps.database,interaction.guild.id,draft.blueprintKey);
    const modules=enabledModulesForDraft(base.enabledModules,draft);
    const enabledIntegrations=[draft.integrations.riotDataDragon.enabled?'Riot Data Dragon':null,draft.integrations.githubReleases.enabled?'GitHub':null,draft.integrations.discordStatus.enabled?'สถานะ Discord':null,draft.integrations.steamNews.enabled?'ข่าว Steam':null].filter(Boolean);
    const budgetEnforced=Object.values(draft.budgets).filter((budget)=>budget.enabled&&budget.mode==='ENFORCE').length;
    await interaction.reply(v2NoticePanel({title:'ร่างการตั้งค่า · ตรวจสอบทั้งหมด',description:`พิมพ์เขียว: **${draft.blueprintKey}** · โมดูล: **${modules.length}**\nธีม: **${draft.themeKey}** · ภาษา: **ไทย** · เขตเวลา: **${draft.timezone}**\nการเคลื่อนไหว: **${presentSystemValue(draft.motionPreset)}** · ความหนาแน่น: **${presentSystemValue(draft.panelDensity)}**\nรูปแบบช่อง: **${presentSystemValue(draft.channelDecoration)}** · ยศ: **${presentSystemValue(draft.roleVisualStyle)}** · สื่อ: **${presentSystemValue(draft.mediaDensity)}**\nระบบเกม: **${presentSystemValue(draft.gamingPreset)}** · เกม: **${draft.games.length?draft.games.join(', '):'ไม่มี'}**\nความปลอดภัย: **${presentSystemValue(draft.securityPreset)}** · ระบบอัตโนมัติ: **${presentSystemValue(draft.automationPreset)}**\nการเก็บรักษา: **${presentSystemValue(draft.retentionProfile)}** · การอนุมัติ: **${presentSystemValue(draft.approvalMode)}** · การรับเข้า: **${presentSystemValue(draft.admissionPreset)}**\nสำรองข้อมูล: **${presentSystemValue(draft.backupSchedule)} @ ${draft.backupWeekday}:${String(draft.backupHourLocal).padStart(2,'0')}**\nการเชื่อมต่อ: **${enabledIntegrations.length?enabledIntegrations.join(', '):'ไม่มี'}** · งบที่บังคับใช้: **${budgetEnforced}/5**\nทรัพยากรที่ล็อก: **${draft.resourceLocks.length}** · ปัญญาประดิษฐ์: **${presentSystemValue(draft.aiProvider)}**\n\n-# การตรวจทานเป็นแบบอ่านอย่างเดียว การสแกนและดูตัวอย่างจะคำนวณความคลาดเคลื่อนจาก Discord สดใหม่ก่อนนำค่าใดไปใช้`,tone:'primary',ephemeral:true}));
    return;
  }

  if (action === 'status') {
    if (!deps.jobs) { await interaction.reply(v2NoticePanel({ title: 'สถานะคงทนยังไม่พร้อม', description: 'ยังดูสถานะงานคงทนไม่ได้จนกว่าจะตั้งค่า `DATABASE_URL`', tone: 'warning', ephemeral: true })); return; }
    const job = await deps.jobs.latestForGuild(interaction.guild.id);
    await interaction.reply(v2NoticePanel({ title: 'ปฏิบัติการล่าสุด', description: job ? `**${presentSystemValue(job.status)}** · ${presentSystemValue(job.currentStep ?? job.type)} · \`${job.jobId}\`` : 'ยังไม่มีงานถูกบันทึก', tone: job ? 'primary' : 'neutral', ephemeral: true }));
    return;
  }

  if (action === 'page') {
    const page = parts[2] as 'systems' | 'visuals' | 'gaming' | 'safety' | 'automation';
    const sessionId = parts[3];
    const session = await loadSession(interaction, deps, sessionId);
    await interaction.update(setupConfigurationPanel(page, sessionId, asDraft(session)));
    return;
  }

  if (action === 'home') {
    const sessionId = parts[2];
    const session = await loadSession(interaction, deps, sessionId);
    const draft = asDraft(session);
    await interaction.update(setupControlPanel({ guildName: interaction.guild.name, dashboardUrl: deps.config.DASHBOARD_URL, databaseReady: true, selectedBlueprint: draft.blueprintKey, sessionId, draft }));
    return;
  }

  if (!deps.database.configured) { await interaction.reply(v2NoticePanel({ title: 'ต้องใช้ฐานข้อมูล', description: 'ต้องตั้งค่า `DATABASE_URL` ก่อนตรวจหรือใช้สถานะทรัพยากรที่ระบบดูแล', tone: 'warning', ephemeral: true })); return; }

  if (action === 'scan-session' || action === 'apply-session') {
    const sessionId = parts[2];
    const session = await loadSession(interaction, deps, sessionId);
    const draft = asDraft(session);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { plan, blueprint, impact, configurationImpact, lockPlan, planHash } = await buildPlan(interaction, deps.database, draft.blueprintKey, draft);
    const preview = planPreviewPanel({ ...plan, panelCount: panelsForBlueprint(blueprint).length, impact, configurationImpact, lockChanges: { lock: lockPlan.lock.length, unlock: lockPlan.unlock.length } });
    if (action === 'scan-session') { await interaction.editReply(preview); return; }
    if (plan.conflicts > 0) { await interaction.editReply(planPreviewPanel({ ...plan, panelCount: panelsForBlueprint(blueprint).length }, { note: '**บล็อกการนำไปใช้:** แก้ข้อขัดแย้งก่อนดำเนินการต่อ' })); return; }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`setup:confirm-session:${sessionId}:${planHash}`).setLabel('ยืนยันการนำแผนไปใช้').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`setup:scan-session:${sessionId}`).setLabel('ตรวจซ้ำ').setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply(planPreviewPanel({ ...plan, panelCount: panelsForBlueprint(blueprint).length, impact, configurationImpact, lockChanges: { lock: lockPlan.lock.length, unlock: lockPlan.unlock.length } }, { note: 'ตรวจการปรับทรัพยากร แผงระบบ และการตั้งค่าให้สอดคล้อง ขั้นตอนตั้งค่านี้จะไม่ลบทรัพยากรของผู้ใช้แบบเงียบ', actions: [row] }));
    return;
  }

  if (action === 'confirm-session') {
    if (!deps.jobs) { await interaction.reply(v2NoticePanel({ title: 'งานคงทนยังไม่พร้อม', description: 'งานคงทนยังไม่พร้อมจนกว่าจะตั้งค่า `DATABASE_URL`', tone: 'warning', ephemeral: true })); return; }
    const sessionId = parts[2]; const expectedHash = parts[3];
    const session = await loadSession(interaction, deps, sessionId); const draft = asDraft(session);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!await setupMutationAllowed(deps.database, interaction.guild.id)) { await interaction.editReply(v2EditNoticePanel({ title: 'ถูกบล็อกการนำการตั้งค่าไปใช้', description: 'นโยบายบำรุงรักษาที่ใช้งานอยู่บล็อกการเปลี่ยนโครงสร้าง แต่ยังตรวจวินิจฉัยและดูแผนตัวอย่างได้', tone: 'warning' })); return; }
    const { plan, blueprint, impact, planHash: currentHash, baseConfigVersion, baseDraftFingerprint } = await buildPlan(interaction, deps.database, draft.blueprintKey, draft);
    if (expectedHash !== currentHash) { await interaction.editReply(v2EditNoticePanel({ title: 'แผนตัวอย่างล้าสมัยแล้ว', description: 'เซิร์ฟเวอร์เปลี่ยนหลังสร้างตัวอย่าง จึงยกเลิกการนำไปใช้ โปรดตรวจและสร้างตัวอย่างใหม่', tone: 'warning' })); return; }
    const panelCount = panelsForBlueprint(blueprint).length;
    const correlationId = newCorrelationId();
    const admission=await new AdmissionControlRepository(deps.database).evaluate({guildId:interaction.guild.id,operation:'STRUCTURAL',actorId:interaction.user.id,correlationId,detail:'discord setup apply'});
    if(admission.decision!=='ALLOW'){await interaction.editReply(v2EditNoticePanel({title:'เลื่อนการตั้งค่าตามนโยบายความจุ',description:`${admission.reason}\n\nคำแนะนำการลองใหม่: **${admission.retryAfterSeconds??120}s** · แรงกดดัน: **${admission.pressure}**`,tone:'warning'}));return;}
    const jobId = await deps.jobs.create({ guildId: interaction.guild.id, actorId: interaction.user.id, type: 'SETUP_APPLY', payload: { blueprintKey: draft.blueprintKey, planHash: currentHash, setupDraft: draft, sessionId, baseConfigVersion, baseDraftFingerprint }, priority: 80, correlationId,
      idempotencyKey: `${draft.blueprintKey}:${currentHash}:${session.configVersion}`, totalUnits: plan.actionableCount + panelCount + setupConfigurationWorkUnits(), maxRetries: 3 });
    await new SetupSessionRepository(deps.database).setState(sessionId, interaction.guild.id, 'QUEUED');
    await interaction.editReply(v2EditNoticePanel({ title: 'นำงานตั้งค่าเข้าคิวแล้ว', description: `**งาน** \`${jobId}\`\n**รหัสความเชื่อมโยง** \`${correlationId}\`\n\nหน่วยงานรวมการแก้ทรัพยากรและการติดตั้งแผงที่ระบบดูแล`, tone: 'success' }));
    return;
  }

  const blueprintKey = parts[2] ?? 'hybrid-standard';
  const expectedHash = parts[3];
  if (action === 'scan') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { plan, blueprint, impact, configurationImpact, lockPlan } = await buildPlan(interaction, deps.database, blueprintKey);
    await interaction.editReply(planPreviewPanel({ ...plan, panelCount: panelsForBlueprint(blueprint).length, impact, configurationImpact, lockChanges: { lock: lockPlan.lock.length, unlock: lockPlan.unlock.length } }));
    return;
  }
  if (action === 'apply') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { plan, blueprint, planHash } = await buildPlan(interaction, deps.database, blueprintKey);
    if (plan.conflicts > 0) { await interaction.editReply(planPreviewPanel({ ...plan, panelCount: panelsForBlueprint(blueprint).length }, { note: '**Apply blocked:** resolve conflicts before continuing.' })); return; }
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`setup:confirm:${blueprintKey}:${planHash}`).setLabel('ยืนยันการนำแผนไปใช้').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`setup:scan:${blueprintKey}`).setLabel('ตรวจซ้ำ').setStyle(ButtonStyle.Secondary),
    );
    await interaction.editReply(planPreviewPanel({ ...plan, panelCount: panelsForBlueprint(blueprint).length }, { note: 'ตรวจความแตกต่างด้านบน ระบบทำเฉพาะ CREATE/ADOPT/UPDATE ที่ดูแลและติดตั้งแผง โดยไม่มีการลบแบบเงียบ', actions: [row] }));
    return;
  }
  if (action === 'confirm') {
    if (!deps.jobs) { await interaction.reply(v2NoticePanel({ title: 'งานคงทนยังไม่พร้อม', description: 'งานคงทนยังไม่พร้อมจนกว่าจะตั้งค่า `DATABASE_URL`', tone: 'warning', ephemeral: true })); return; }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!await setupMutationAllowed(deps.database, interaction.guild.id)) { await interaction.editReply(v2EditNoticePanel({ title: 'ถูกบล็อกการนำการตั้งค่าไปใช้', description: 'นโยบายบำรุงรักษาที่ใช้งานอยู่บล็อกการเปลี่ยนโครงสร้าง แต่ยังตรวจวินิจฉัยและดูแผนตัวอย่างได้', tone: 'warning' })); return; }
    const { plan, blueprint, planHash: currentHash, draft, baseConfigVersion, baseDraftFingerprint } = await buildPlan(interaction, deps.database, blueprintKey);
    if (expectedHash !== currentHash) { await interaction.editReply(v2EditNoticePanel({ title: 'แผนตัวอย่างล้าสมัยแล้ว', description: 'เซิร์ฟเวอร์เปลี่ยนหลังสร้างตัวอย่าง จึงยกเลิกการนำไปใช้ โปรดตรวจและสร้างตัวอย่างใหม่', tone: 'warning' })); return; }
    const correlationId = newCorrelationId();
    const admission=await new AdmissionControlRepository(deps.database).evaluate({guildId:interaction.guild.id,operation:'STRUCTURAL',actorId:interaction.user.id,correlationId,detail:'discord setup apply'});
    if(admission.decision!=='ALLOW'){await interaction.editReply(v2EditNoticePanel({title:'เลื่อนการตั้งค่าตามนโยบายความจุ',description:`${admission.reason}\n\nคำแนะนำการลองใหม่: **${admission.retryAfterSeconds??120}s** · แรงกดดัน: **${admission.pressure}**`,tone:'warning'}));return;}
    const jobId = await deps.jobs.create({ guildId: interaction.guild.id, actorId: interaction.user.id, type: 'SETUP_APPLY', payload: { blueprintKey, planHash: currentHash, setupDraft: draft, baseConfigVersion, baseDraftFingerprint }, priority: 80, correlationId,
      idempotencyKey: `${blueprintKey}:${currentHash}`, totalUnits: plan.actionableCount + panelsForBlueprint(blueprint).length + setupConfigurationWorkUnits(), maxRetries: 3 });
    await interaction.editReply(v2EditNoticePanel({ title: 'นำงานตั้งค่าเข้าคิวแล้ว', description: `**งาน** \`${jobId}\`\n**รหัสความเชื่อมโยง** \`${correlationId}\`\n\nความคืบหน้าคำนวณจากหน่วยงานทรัพยากรและแผงระบบจริง`, tone: 'success' }));
  }
}


async function recordManagedPanelInteraction(input: {
  interaction: ButtonInteraction | StringSelectMenuInteraction;
  database: Database;
  handled: boolean;
  startedAt: number;
}): Promise<void> {
  if (!input.handled || !input.database.configured || !input.interaction.inCachedGuild()) return;
  const panel=await new PanelRegistryRepository(input.database).findByMessage(input.interaction.guild.id,input.interaction.message.id).catch(()=>null);
  if(!panel) return;
  await input.database.requirePool().query(
    `insert into panel_interaction_events(interaction_event_id,guild_id,panel_id,user_id,action_key,result,duration_ms,correlation_id)
     values($1,$2,$3,$4,$5,'SUCCEEDED',$6,$7)`,
    [randomUUID(),input.interaction.guild.id,panel.panelId,input.interaction.user.id,input.interaction.customId,Math.max(0,Date.now()-input.startedAt),newCorrelationId()],
  ).catch(()=>undefined);
}

export function bindDiscordInteractions(client: Client, deps: SetupInteractionDependencies): void {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) await handleSetupCommand(interaction, deps);
      else if (interaction.isStringSelectMenu()) {
        if (interaction.customId.startsWith('setup:')) await handleSetupSelect(interaction, deps);
        else {
          const startedAt=Date.now();
          const handled=await handlePanelSelect(interaction, { database: deps.database, dashboardUrl: deps.config.DASHBOARD_URL, jobs: deps.jobs, bus: deps.bus });
          await recordManagedPanelInteraction({interaction,database:deps.database,handled,startedAt});
        }
      }
      else if (interaction.isButton()) {
        if (interaction.customId.startsWith('setup:')) await handleSetupButton(interaction, deps);
        else {
          const startedAt=Date.now();
          const handled=await handlePanelButton(interaction, { database: deps.database, dashboardUrl: deps.config.DASHBOARD_URL, jobs: deps.jobs, bus: deps.bus });
          await recordManagedPanelInteraction({interaction,database:deps.database,handled,startedAt});
        }
      } else if (interaction.isModalSubmit()) {
        if(interaction.customId.startsWith('setup:')) await handleSetupModal(interaction,deps);
        else await handlePanelModal(interaction, { database: deps.database, dashboardUrl: deps.config.DASHBOARD_URL, jobs: deps.jobs, bus: deps.bus });
      }
    } catch (error) {
      const errorId = newCorrelationId();
      console.error('[discord-interaction-error]', { errorId, name: error instanceof Error ? error.name : 'UnknownError', message: error instanceof Error ? error.message : 'Unknown interaction error' });
      const safe = `ระบบหยุดการดำเนินการอย่างปลอดภัย รหัสอ้างอิง: \`${errorId}\` ผู้ดูแลสามารถใช้รหัสนี้ตรวจสอบบันทึกระบบได้`;
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) await interaction.editReply(v2EditNoticePanel({ title: 'การตั้งค่าล้มเหลวอย่างปลอดภัย', description: safe, tone: 'danger' })).catch(() => undefined);
        else await interaction.reply(v2NoticePanel({ title: 'การตั้งค่าล้มเหลวอย่างปลอดภัย', description: safe, tone: 'danger', ephemeral: true })).catch(() => undefined);
      }
    }
  });
}
