import { PermissionFlagsBits, type OverwriteResolvable } from 'discord.js';

export type VisibilityProfile = 'PUBLIC' | 'VERIFIED_ONLY' | 'NEW_MEMBER_ONLY' | 'STAFF_ONLY' | 'EVENT_ONLY' | 'BOT_ONLY' | 'ARCHIVE';

export interface LogicalRoleIds {
  member?: string;
  newMember?: string;
  serverManager?: string;
  moderator?: string;
  support?: string;
  eventParticipant?: string;
}

const readWrite = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
const viewOnly = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];

function allow(id: string | undefined, permissions: bigint[]): OverwriteResolvable[] {
  return id ? [{ id, allow: permissions }] : [];
}

export function buildVisibilityOverwrites(input: {
  everyoneId: string;
  botUserId?: string;
  profile: VisibilityProfile;
  roles: LogicalRoleIds;
}): OverwriteResolvable[] {
  const denyView: OverwriteResolvable = { id: input.everyoneId, deny: [PermissionFlagsBits.ViewChannel] };
  const staff = [
    ...allow(input.roles.serverManager, readWrite),
    ...allow(input.roles.moderator, readWrite),
    ...allow(input.roles.support, readWrite),
  ];
  switch (input.profile) {
    case 'PUBLIC':
      return [];
    case 'VERIFIED_ONLY':
      return [denyView, ...allow(input.roles.member, readWrite), ...staff];
    case 'NEW_MEMBER_ONLY':
      return [denyView, ...allow(input.roles.newMember, readWrite), ...staff];
    case 'STAFF_ONLY':
      return [denyView, ...staff];
    case 'EVENT_ONLY':
      return [denyView, ...allow(input.roles.eventParticipant, readWrite), ...staff];
    case 'BOT_ONLY':
      return [denyView, ...allow(input.botUserId, readWrite)];
    case 'ARCHIVE':
      return [denyView, ...allow(input.roles.serverManager, viewOnly), ...allow(input.roles.moderator, viewOnly), ...allow(input.roles.support, viewOnly)];
  }
}

export function explainVisibility(profile: VisibilityProfile): string {
  switch (profile) {
    case 'PUBLIC': return 'Visible by inherited guild/category permissions.';
    case 'VERIFIED_ONLY': return 'Hidden from @everyone; visible to Member and staff roles.';
    case 'NEW_MEMBER_ONLY': return 'Hidden from @everyone; visible to New Member and staff roles.';
    case 'STAFF_ONLY': return 'Hidden from @everyone; visible only to mapped staff roles.';
    case 'EVENT_ONLY': return 'Hidden from @everyone; visible to Event Participant and staff roles.';
    case 'BOT_ONLY': return 'Hidden from @everyone; visible only to the bot identity.';
    case 'ARCHIVE': return 'Hidden from @everyone; staff receive read-only visibility by default.';
  }
}

export interface PermissionOverwriteSnapshot {
  id: string;
  allow: string;
  deny: string;
}

export interface PermissionDriftDiff {
  principalId: string;
  before?: PermissionOverwriteSnapshot;
  desired?: PermissionOverwriteSnapshot;
  changed: Array<'ALLOW' | 'DENY' | 'MISSING' | 'EXTRA'>;
}

function bitfield(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number') return BigInt(value).toString();
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (Array.isArray(value)) return value.reduce<bigint>((acc, item) => acc | BigInt(item as bigint), 0n).toString();
  if (value && typeof value === 'object' && 'bitfield' in value) return bitfield((value as { bitfield: unknown }).bitfield);
  return '0';
}

export function normalizePermissionOverwrites(overwrites: Iterable<{ id: string; allow?: unknown; deny?: unknown }>): PermissionOverwriteSnapshot[] {
  return [...overwrites].map((overwrite) => ({ id: overwrite.id, allow: bitfield(overwrite.allow), deny: bitfield(overwrite.deny) }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function diffPermissionOverwrites(before: readonly PermissionOverwriteSnapshot[], desired: readonly PermissionOverwriteSnapshot[]): PermissionDriftDiff[] {
  const actualMap = new Map(before.map((item) => [item.id, item]));
  const desiredMap = new Map(desired.map((item) => [item.id, item]));
  const ids = new Set([...actualMap.keys(), ...desiredMap.keys()]);
  const diffs: PermissionDriftDiff[] = [];
  for (const id of [...ids].sort()) {
    const actual = actualMap.get(id);
    const target = desiredMap.get(id);
    if (!actual && target) { diffs.push({ principalId: id, desired: target, changed: ['MISSING'] }); continue; }
    if (actual && !target) { diffs.push({ principalId: id, before: actual, changed: ['EXTRA'] }); continue; }
    if (!actual || !target) continue;
    const changed: PermissionDriftDiff['changed'] = [];
    if (actual.allow !== target.allow) changed.push('ALLOW');
    if (actual.deny !== target.deny) changed.push('DENY');
    if (changed.length) diffs.push({ principalId: id, before: actual, desired: target, changed });
  }
  return diffs;
}

export function explainPermissionDrift(diffs: readonly PermissionDriftDiff[]): string[] {
  return diffs.map((diff) => {
    if (diff.changed.includes('MISSING')) return `${diff.principalId}: required overwrite is missing.`;
    if (diff.changed.includes('EXTRA')) return `${diff.principalId}: unmanaged extra overwrite exists.`;
    return `${diff.principalId}: ${diff.changed.join(' + ').toLowerCase()} permission bits differ from desired state.`;
  });
}
