import { ChannelType, type Guild, type GuildBasedChannel, type Role } from 'discord.js';
import { buildVisibilityOverwrites, type VisibilityProfile } from '@autoserver/permissions';
import type { ResourceMapping, ResourceMappingRepository } from '@autoserver/database';
import { sha256 } from '@autoserver/core';

export type ResourceKind = 'ROLE' | 'CATEGORY' | 'TEXT_CHANNEL' | 'FORUM_CHANNEL' | 'VOICE_CHANNEL';
export type Ownership = 'SYSTEM_OWNED' | 'TEMPLATE_OWNED' | 'USER_OWNED' | 'LOCKED';

export interface RoleResourceConfig {
  color?: number;
  colors?: { primaryColor:number; secondaryColor?:number|null; tertiaryColor?:number|null };
  unicodeEmoji?: string | null;
  hoist?: boolean;
  mentionable?: boolean;
}

export interface ForumResourceConfig {
  defaultAutoArchiveDuration?: 60 | 1440 | 4320 | 10080;
  defaultThreadRateLimitPerUser?: number;
  availableTags?: Array<{ name: string; moderated?: boolean }>;
}

export interface DesiredResource {
  logicalKey: string;
  kind: ResourceKind;
  name: string;
  parentKey?: string;
  ownership: Ownership;
  reason: string;
  module: string;
  required?: boolean;
  visibility?: VisibilityProfile;
  forum?: ForumResourceConfig;
  role?: RoleResourceConfig;
}

export interface ServerBlueprint {
  key: string;
  version: number;
  displayName: string;
  description: string;
  complexity: 'compact' | 'standard' | 'advanced' | 'enterprise';
  enabledModules: string[];
  resources: DesiredResource[];
}

export interface ActualResource {
  discordId: string;
  kind: ResourceKind;
  name: string;
  parentId?: string;
  parentLogicalKey?: string;
  forum?: ForumResourceConfig;
  role?: RoleResourceConfig;
  logicalKey?: string;
  ownership?: Ownership;
  locked?: boolean;
}

export interface GuildSnapshot {
  guildId: string;
  name: string;
  roles: ActualResource[];
  channels: ActualResource[];
  mappings: ResourceMapping[];
  guildFeatures: string[];
  scannedAt: string;
}

export type PlanActionType = 'CREATE' | 'ADOPT' | 'KEEP' | 'UPDATE' | 'SKIP' | 'CONFLICT';

export interface PlanAction {
  type: PlanActionType;
  desired: DesiredResource;
  actual?: ActualResource;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  reason: string;
}

export interface ExecutionPlan {
  guildId: string;
  blueprintKey: string;
  blueprintVersion: number;
  actions: PlanAction[];
  actionableCount: number;
  conflicts: number;
  summary: Record<PlanActionType, number>;
}

function channelKind(channel: GuildBasedChannel): ResourceKind | null {
  if (channel.type === ChannelType.GuildCategory) return 'CATEGORY';
  if (channel.type === ChannelType.GuildForum) return 'FORUM_CHANNEL';
  if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) return 'TEXT_CHANNEL';
  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) return 'VOICE_CHANNEL';
  return null;
}

export class DiscordGuildScanner {
  constructor(private readonly mappings: ResourceMappingRepository | null) {}

  async scan(guild: Guild): Promise<GuildSnapshot> {
    await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
    const mappings = this.mappings ? await this.mappings.list(guild.id) : [];
    const byDiscordId = new Map(mappings.map((mapping) => [mapping.discordId, mapping]));

    const roles: ActualResource[] = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.id)
      .map((role) => this.roleToActual(role, byDiscordId.get(role.id)));

    const channels: ActualResource[] = [...guild.channels.cache.values()]
      .filter((channel): channel is GuildBasedChannel => Boolean(channel))
      .flatMap((channel) => {
        const kind = channelKind(channel);
        if (!kind) return [];
        const mapping = byDiscordId.get(channel.id);
        return [{
          discordId: channel.id,
          kind,
          name: channel.name,
          parentId: 'parentId' in channel ? channel.parentId ?? undefined : undefined,
          parentLogicalKey: 'parentId' in channel && channel.parentId ? byDiscordId.get(channel.parentId)?.logicalKey : undefined,
          forum: channel.type === ChannelType.GuildForum ? {
            defaultAutoArchiveDuration: channel.defaultAutoArchiveDuration ?? undefined,
            defaultThreadRateLimitPerUser: channel.defaultThreadRateLimitPerUser ?? undefined,
            availableTags: channel.availableTags.map((tag)=>({name:tag.name,moderated:tag.moderated})),
          } : undefined,
          logicalKey: mapping?.logicalKey,
          ownership: mapping?.ownership,
          locked: mapping?.locked,
        } satisfies ActualResource];
      });

    return { guildId: guild.id, name: guild.name, roles, channels, mappings, guildFeatures:[...guild.features].map(String).sort(), scannedAt: new Date().toISOString() };
  }

  private roleToActual(role: Role, mapping?: ResourceMapping): ActualResource {
    return {
      discordId: role.id,
      kind: 'ROLE',
      name: role.name,
      role: {
        color: role.color,
        colors: (role as any).colors ? { primaryColor:(role as any).colors.primaryColor, secondaryColor:(role as any).colors.secondaryColor ?? null, tertiaryColor:(role as any).colors.tertiaryColor ?? null } : undefined,
        unicodeEmoji: (role as any).unicodeEmoji ?? null,
        hoist: role.hoist,
        mentionable: role.mentionable,
      },
      logicalKey: mapping?.logicalKey,
      ownership: mapping?.ownership,
      locked: mapping?.locked,
    };
  }
}


function normalizeDesiredRoleForGuild(desired:DesiredResource,features:ReadonlySet<string>):DesiredResource{
  if(desired.kind!=='ROLE'||!desired.role)return desired;
  const role={...desired.role};
  if(!features.has('ENHANCED_ROLE_COLORS')) delete role.colors;
  else if(role.colors){
    role.colors={primaryColor:role.colors.primaryColor,secondaryColor:role.colors.secondaryColor??null,tertiaryColor:role.colors.tertiaryColor??null};
    role.color=role.colors.primaryColor;
  }
  if(!features.has('ROLE_ICONS')) delete role.unicodeEmoji;
  return {...desired,role};
}

function normalizeActualRoleForGuild(actual:RoleResourceConfig|undefined,features:ReadonlySet<string>):RoleResourceConfig|undefined{
  if(!actual)return actual;
  const role={...actual};
  if(!features.has('ENHANCED_ROLE_COLORS')) delete role.colors;
  else if(role.colors){
    role.colors={primaryColor:role.colors.primaryColor,secondaryColor:role.colors.secondaryColor??null,tertiaryColor:role.colors.tertiaryColor??null};
    role.color=role.colors.primaryColor;
  }
  if(!features.has('ROLE_ICONS') || role.unicodeEmoji == null) delete role.unicodeEmoji;
  return role;
}

export class SetupPlanner {
  plan(snapshot: GuildSnapshot, blueprint: ServerBlueprint): ExecutionPlan {
    const actual = [...snapshot.roles, ...snapshot.channels];
    const byLogical = new Map(actual.filter((item) => item.logicalKey).map((item) => [item.logicalKey!, item]));
    const byKindName = new Map<string, ActualResource[]>();
    for (const item of actual) {
      const key = `${item.kind}:${item.name.toLocaleLowerCase()}`;
      const list = byKindName.get(key) ?? [];
      list.push(item);
      byKindName.set(key, list);
    }

    const guildFeatures=new Set(snapshot.guildFeatures??[]);
    const actions: PlanAction[] = blueprint.resources.map((rawDesired) => {
      const desired=normalizeDesiredRoleForGuild(rawDesired,guildFeatures);
      const mapped = byLogical.get(desired.logicalKey);
      if (mapped) {
        if (mapped.kind !== desired.kind) {
          return { type: 'CONFLICT', desired, actual: mapped, risk: 'HIGH', reason: `Stable logical resource kind changed from ${mapped.kind} to ${desired.kind}; automatic replacement is unsafe.` };
        }
        if (mapped.locked || mapped.ownership === 'LOCKED') {
          return { type: 'SKIP', desired, actual: mapped, risk: 'LOW', reason: 'Resource is locked; drift is report-only.' };
        }
        const parentDrift = desired.kind !== 'ROLE' && desired.kind !== 'CATEGORY' && (desired.parentKey ?? null) !== (mapped.parentLogicalKey ?? null);
        const forumDrift = desired.kind === 'FORUM_CHANNEL' && JSON.stringify(desired.forum ?? {}) !== JSON.stringify(mapped.forum ?? {});
        const roleDrift = desired.kind === 'ROLE' && JSON.stringify(desired.role ?? {}) !== JSON.stringify(normalizeActualRoleForGuild(mapped.role,guildFeatures) ?? {});
        if (mapped.name === desired.name && !parentDrift && !forumDrift && !roleDrift) {
          return { type: 'KEEP', desired, actual: mapped, risk: 'LOW', reason: 'Stable logical resource exists and matches desired identity and managed attributes.' };
        }
        if (mapped.ownership === 'USER_OWNED') {
          return { type: 'SKIP', desired, actual: mapped, risk: 'LOW', reason: 'User-owned resource differs; preserving manual state.' };
        }
        return { type: 'UPDATE', desired, actual: mapped, risk: desired.kind === 'ROLE' ? 'MEDIUM' : 'LOW', reason: 'Managed resource exists with identity or managed-attribute drift.' };
      }

      const candidates = byKindName.get(`${desired.kind}:${desired.name.toLocaleLowerCase()}`) ?? [];
      if (candidates.length === 1) {
        return { type: 'ADOPT', desired, actual: candidates[0], risk: 'LOW', reason: 'Exactly one matching unmanaged resource can be safely adopted.' };
      }
      if (candidates.length > 1) {
        return { type: 'CONFLICT', desired, risk: 'MEDIUM', reason: 'Multiple same-kind resources share this name; manual resolution required.' };
      }
      return { type: 'CREATE', desired, risk: desired.kind === 'ROLE' ? 'MEDIUM' : 'LOW', reason: 'Required logical resource is missing.' };
    });

    const summary: Record<PlanActionType, number> = { CREATE: 0, ADOPT: 0, KEEP: 0, UPDATE: 0, SKIP: 0, CONFLICT: 0 };
    for (const action of actions) summary[action.type]++;
    return {
      guildId: snapshot.guildId,
      blueprintKey: blueprint.key,
      blueprintVersion: blueprint.version,
      actions,
      actionableCount: summary.CREATE + summary.ADOPT + summary.UPDATE,
      conflicts: summary.CONFLICT,
      summary,
    };
  }
}

export class DiscordResourceExecutor {
  constructor(private readonly mappingRepo: ResourceMappingRepository) {}

  private async permissionOverwrites(guild: Guild, profile: VisibilityProfile | undefined) {
    if (!profile || profile === 'PUBLIC') return undefined;
    const mappings = await this.mappingRepo.list(guild.id);
    const ids = new Map(mappings.map((mapping) => [mapping.logicalKey, mapping.discordId]));
    return buildVisibilityOverwrites({
      everyoneId: guild.id,
      botUserId: guild.client.user?.id,
      profile,
      roles: {
        member: ids.get('ROLE_MEMBER'),
        newMember: ids.get('ROLE_NEW_MEMBER'),
        serverManager: ids.get('ROLE_SERVER_MANAGER'),
        moderator: ids.get('ROLE_MODERATOR'),
        support: ids.get('ROLE_SUPPORT'),
        eventParticipant: ids.get('ROLE_EVENT_PARTICIPANT'),
      },
    });
  }

  async apply(guild: Guild, action: PlanAction): Promise<{ action: PlanActionType; discordId?: string }> {
    if (action.type === 'KEEP' || action.type === 'SKIP' || action.type === 'CONFLICT') return { action: action.type, discordId: action.actual?.discordId };

    if (action.type === 'ADOPT' && action.actual) {
      await this.mappingRepo.upsert({ guildId: guild.id, logicalKey: action.desired.logicalKey, resourceKind: action.desired.kind, discordId: action.actual.discordId, ownership: action.desired.ownership, nameSnapshot: action.actual.name, locked: false });
      return { action: 'ADOPT', discordId: action.actual.discordId };
    }

    if (action.type === 'UPDATE' && action.actual) {
      const role = action.desired.kind === 'ROLE' ? guild.roles.cache.get(action.actual.discordId) : null;
      const channel = action.desired.kind !== 'ROLE' ? guild.channels.cache.get(action.actual.discordId) : null;
      if (role) {
        const desiredRole=action.desired.role??{};
        const edit:any={reason:`ออโต้เซิร์ฟเวอร์ · ซิงก์ภาพ ${action.desired.logicalKey}`};
        if(role.name!==action.desired.name)edit.name=action.desired.name;
        if(desiredRole.colors)edit.colors=desiredRole.colors;
        else if(desiredRole.color!==undefined&&role.color!==desiredRole.color)edit.color=desiredRole.color;
        if(desiredRole.unicodeEmoji!==undefined)edit.unicodeEmoji=desiredRole.unicodeEmoji;
        if(desiredRole.hoist!==undefined&&role.hoist!==desiredRole.hoist)edit.hoist=desiredRole.hoist;
        if(desiredRole.mentionable!==undefined&&role.mentionable!==desiredRole.mentionable)edit.mentionable=desiredRole.mentionable;
        if(Object.keys(edit).length>1)await role.edit(edit);
      }
      else if (channel && 'setName' in channel) {
        if (channel.name !== action.desired.name) await channel.setName(action.desired.name, `ออโต้เซิร์ฟเวอร์ · ซิงก์ ${action.desired.logicalKey}`);
        if (action.desired.parentKey && 'setParent' in channel) {
          const parentId=(await this.mappingRepo.list(guild.id)).find((mapping)=>mapping.logicalKey===action.desired.parentKey)?.discordId;
          if(!parentId) throw new Error(`Parent resource not mapped yet: ${action.desired.parentKey}`);
          if ('parentId' in channel && channel.parentId !== parentId) await channel.setParent(parentId,{lockPermissions:false,reason:`ออโต้เซิร์ฟเวอร์ · ซิงก์ ${action.desired.logicalKey}`});
        }
        if (action.desired.kind === 'FORUM_CHANNEL' && channel.type === ChannelType.GuildForum) {
          const forum=action.desired.forum;
          if(forum?.defaultAutoArchiveDuration && channel.defaultAutoArchiveDuration!==forum.defaultAutoArchiveDuration) await channel.setDefaultAutoArchiveDuration(forum.defaultAutoArchiveDuration,`ออโต้เซิร์ฟเวอร์ · ซิงก์ ${action.desired.logicalKey}`);
          if(typeof forum?.defaultThreadRateLimitPerUser==='number' && channel.defaultThreadRateLimitPerUser!==forum.defaultThreadRateLimitPerUser) await channel.setDefaultThreadRateLimitPerUser(Math.max(0,Math.min(21_600,forum.defaultThreadRateLimitPerUser)),`ออโต้เซิร์ฟเวอร์ · ซิงก์ ${action.desired.logicalKey}`);
          if(forum?.availableTags && JSON.stringify(channel.availableTags.map((tag)=>({name:tag.name,moderated:tag.moderated})))!==JSON.stringify(forum.availableTags.map((tag)=>({name:tag.name.slice(0,20),moderated:Boolean(tag.moderated)})))) await channel.setAvailableTags(forum.availableTags.slice(0,20).map((tag)=>({name:tag.name.slice(0,20),moderated:Boolean(tag.moderated)})),`ออโต้เซิร์ฟเวอร์ · ซิงก์ ${action.desired.logicalKey}`);
        }
      }
      else throw new Error(`Mapped Discord resource is missing: ${action.actual.discordId}`);
      await this.mappingRepo.upsert({ guildId: guild.id, logicalKey: action.desired.logicalKey, resourceKind: action.desired.kind, discordId: action.actual.discordId, ownership: action.desired.ownership, nameSnapshot: action.desired.name, locked: false });
      return { action: 'UPDATE', discordId: action.actual.discordId };
    }

    if (action.type !== 'CREATE') throw new Error(`Unsupported action ${action.type}`);

    let discordId: string;
    if (action.desired.kind === 'ROLE') {
      const role = await guild.roles.create({ name: action.desired.name, permissions: [], color: action.desired.role?.colors ? undefined : action.desired.role?.color, colors: action.desired.role?.colors, unicodeEmoji: action.desired.role?.unicodeEmoji ?? undefined, hoist: action.desired.role?.hoist ?? false, mentionable: action.desired.role?.mentionable ?? false, reason: `ออโต้เซิร์ฟเวอร์ · สร้าง ${action.desired.logicalKey}` } as any);
      discordId = role.id;
    } else {
      let parent: string | undefined;
      if (action.desired.parentKey) {
        const mappings = await this.mappingRepo.list(guild.id);
        parent = mappings.find((mapping) => mapping.logicalKey === action.desired.parentKey)?.discordId;
        if (!parent) throw new Error(`Parent resource not mapped yet: ${action.desired.parentKey}`);
      }
      const type = action.desired.kind === 'CATEGORY'
        ? ChannelType.GuildCategory
        : action.desired.kind === 'VOICE_CHANNEL'
          ? ChannelType.GuildVoice
          : action.desired.kind === 'FORUM_CHANNEL'
            ? ChannelType.GuildForum
            : ChannelType.GuildText;
      const permissionOverwrites = await this.permissionOverwrites(guild, action.desired.visibility);
      if (action.desired.kind === 'FORUM_CHANNEL') {
        const forum = action.desired.forum;
        const channel = await guild.channels.create({
          name: action.desired.name, type: ChannelType.GuildForum, parent, permissionOverwrites,
          defaultAutoArchiveDuration: forum?.defaultAutoArchiveDuration ?? 1440,
          defaultThreadRateLimitPerUser: Math.max(0, Math.min(21_600, forum?.defaultThreadRateLimitPerUser ?? 30)),
          availableTags: (forum?.availableTags ?? []).slice(0,20).map((tag)=>({name:tag.name.slice(0,20),moderated:Boolean(tag.moderated)})),
          reason: `ออโต้เซิร์ฟเวอร์ · สร้าง ${action.desired.logicalKey}`,
        });
        discordId = channel.id;
      } else {
        const channel = await guild.channels.create({ name: action.desired.name, type, parent, permissionOverwrites, reason: `ออโต้เซิร์ฟเวอร์ · สร้าง ${action.desired.logicalKey}` });
        discordId = channel.id;
      }
    }

    await this.mappingRepo.upsert({ guildId: guild.id, logicalKey: action.desired.logicalKey, resourceKind: action.desired.kind, discordId, ownership: action.desired.ownership, nameSnapshot: action.desired.name, locked: false });
    return { action: 'CREATE', discordId };
  }
}

export interface ResourceLockPlan {
  lock: string[];
  unlock: string[];
  unchanged: number;
  changeCount: number;
}

export function planResourceLocks(mappings: readonly ResourceMapping[], desiredLocks: readonly string[]): ResourceLockPlan {
  const desired = new Set(desiredLocks);
  const lock: string[] = [];
  const unlock: string[] = [];
  let unchanged = 0;
  for (const mapping of mappings) {
    const wantsLocked = desired.has(mapping.logicalKey);
    if (Boolean(mapping.locked) === wantsLocked) unchanged += 1;
    else if (wantsLocked) lock.push(mapping.logicalKey);
    else unlock.push(mapping.logicalKey);
  }
  lock.sort(); unlock.sort();
  return { lock, unlock, unchanged, changeCount: lock.length + unlock.length };
}

export function applyDesiredResourceLocks(snapshot: GuildSnapshot, desiredLocks: readonly string[]): GuildSnapshot {
  const desired = new Set(desiredLocks);
  const adjust = (resource: ActualResource): ActualResource => {
    if (!resource.logicalKey) return resource;
    const locked = desired.has(resource.logicalKey);
    const ownership: Ownership | undefined = locked ? 'LOCKED' : resource.ownership === 'LOCKED' ? 'SYSTEM_OWNED' : resource.ownership;
    return { ...resource, locked, ownership };
  };
  return {
    ...snapshot,
    roles: snapshot.roles.map(adjust),
    channels: snapshot.channels.map(adjust),
    mappings: snapshot.mappings.map((mapping) => {
      const locked = desired.has(mapping.logicalKey);
      return { ...mapping, locked, ownership: locked ? 'LOCKED' : mapping.ownership === 'LOCKED' ? 'SYSTEM_OWNED' : mapping.ownership };
    }),
  };
}

function canonicalSetupValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalSetupValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalSetupValue(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashSetupApproval(plan: ExecutionPlan, desiredState: unknown): string {
  return sha256(canonicalSetupValue({ executionPlanHash: hashExecutionPlan(plan), desiredState }));
}

export function orderPlanForExecution(actions: PlanAction[]): PlanAction[] {
  const weight: Record<ResourceKind, number> = { ROLE: 0, CATEGORY: 1, TEXT_CHANNEL: 2, FORUM_CHANNEL: 2, VOICE_CHANNEL: 2 };
  return [...actions].sort((a, b) => weight[a.desired.kind] - weight[b.desired.kind]);
}

export function hashExecutionPlan(plan: ExecutionPlan): string {
  const stable = plan.actions.map((action) => ({
    type: action.type,
    key: action.desired.logicalKey,
    kind: action.desired.kind,
    name: action.desired.name,
    actualId: action.actual?.discordId ?? null,
    visibility: action.desired.visibility ?? 'PUBLIC',
    forum: action.desired.forum ?? null,
  }));
  return sha256(JSON.stringify({ blueprintKey: plan.blueprintKey, blueprintVersion: plan.blueprintVersion, stable }));
}

export { analyzeSetupImpact } from './impact.js';
export type { SetupImpactAction, SetupImpactLevel, SetupImpactReport } from './impact.js';
