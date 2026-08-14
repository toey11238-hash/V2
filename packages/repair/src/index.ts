import { sha256 } from '@autoserver/core';

export type DriftKind = 'MISSING' | 'RENAMED' | 'PERMISSION' | 'PARENT' | 'DUPLICATE' | 'PANEL_MISSING' | 'PANEL_STALE' | 'ROLE_ORDER' | 'ORPHAN';
export type RepairRisk = 'LOW' | 'MEDIUM' | 'HIGH';
export type RepairDecision = 'AUTO_REPAIR' | 'NOTIFY' | 'REQUIRE_APPROVAL' | 'IGNORE';

export interface DriftRecord {
  logicalKey: string;
  kind: DriftKind;
  ownership: 'SYSTEM_OWNED' | 'TEMPLATE_OWNED' | 'USER_OWNED' | 'LOCKED';
  before?: unknown;
  desired?: unknown;
}

export interface RepairPolicy {
  lowRisk: 'AUTO' | 'NOTIFY';
  mediumRisk: 'AUTO' | 'NOTIFY' | 'APPROVAL';
  highRisk: 'NOTIFY' | 'APPROVAL';
}

export function classifyRepairRisk(drift: DriftRecord): RepairRisk {
  if (drift.kind === 'PERMISSION' || drift.kind === 'ROLE_ORDER' || drift.kind === 'PARENT') return 'MEDIUM';
  if (drift.kind === 'DUPLICATE' || drift.kind === 'ORPHAN') return 'HIGH';
  return 'LOW';
}

export function repairDecision(drift: DriftRecord, policy: RepairPolicy): RepairDecision {
  if (drift.ownership === 'LOCKED' || drift.ownership === 'USER_OWNED') return 'NOTIFY';
  const risk = classifyRepairRisk(drift);
  if (risk === 'LOW') return policy.lowRisk === 'AUTO' ? 'AUTO_REPAIR' : 'NOTIFY';
  if (risk === 'MEDIUM') return policy.mediumRisk === 'AUTO' ? 'AUTO_REPAIR' : policy.mediumRisk === 'APPROVAL' ? 'REQUIRE_APPROVAL' : 'NOTIFY';
  return policy.highRisk === 'APPROVAL' ? 'REQUIRE_APPROVAL' : 'NOTIFY';
}

export function buildRepairPlan(drifts: readonly DriftRecord[], policy: RepairPolicy) {
  return drifts.map((drift) => ({ drift, risk: classifyRepairRisk(drift), decision: repairDecision(drift, policy) }));
}


export function permissionRepairDriftHash(drifts: readonly Pick<DriftRecord,'logicalKey'|'ownership'|'before'|'desired'>[]): string {
  return sha256(JSON.stringify([...drifts]
    .map((item)=>({logicalKey:item.logicalKey,ownership:item.ownership,before:item.before,desired:item.desired}))
    .sort((a,b)=>a.logicalKey.localeCompare(b.logicalKey))));
}

import type { PermissionDriftDiff } from '@autoserver/permissions';

export function permissionDriftRecord(input: {
  logicalKey: string;
  ownership: DriftRecord['ownership'];
  diffs: readonly PermissionDriftDiff[];
}): DriftRecord | null {
  if (!input.diffs.length) return null;
  return { logicalKey: input.logicalKey, kind: 'PERMISSION', ownership: input.ownership, before: input.diffs.map((item) => item.before), desired: input.diffs.map((item) => item.desired) };
}

import type { Guild } from 'discord.js';
import type { ResourceMapping } from '@autoserver/database';
import type { ServerBlueprint } from '@autoserver/setup';
import { buildVisibilityOverwrites, diffPermissionOverwrites, normalizePermissionOverwrites } from '@autoserver/permissions';

export async function scanDiscordPermissionDrift(input: {
  guild: Guild;
  blueprint: ServerBlueprint;
  mappings: readonly ResourceMapping[];
}): Promise<DriftRecord[]> {
  const byKey = new Map(input.mappings.map((mapping) => [mapping.logicalKey, mapping]));
  const roleId = (key: string) => byKey.get(key)?.discordId;
  const drifts: DriftRecord[] = [];
  for (const desired of input.blueprint.resources) {
    if (desired.kind === 'ROLE') continue;
    const mapping = byKey.get(desired.logicalKey);
    if (!mapping) continue;
    const channel = input.guild.channels.cache.get(mapping.discordId);
    if (!channel || !('permissionOverwrites' in channel)) continue;
    const expected = buildVisibilityOverwrites({
      everyoneId: input.guild.id,
      botUserId: input.guild.client.user?.id,
      profile: desired.visibility ?? 'PUBLIC',
      roles: {
        member: roleId('ROLE_MEMBER'),
        newMember: roleId('ROLE_NEW_MEMBER'),
        serverManager: roleId('ROLE_SERVER_MANAGER'),
        moderator: roleId('ROLE_MODERATOR'),
        support: roleId('ROLE_SUPPORT'),
        eventParticipant: roleId('ROLE_EVENT_PARTICIPANT'),
      },
    });
    const actualSnapshot = normalizePermissionOverwrites(channel.permissionOverwrites.cache.values());
    const expectedSnapshot = normalizePermissionOverwrites(expected as Iterable<{ id: string; allow?: unknown; deny?: unknown }>);
    const diffs = diffPermissionOverwrites(actualSnapshot, expectedSnapshot);
    const drift = permissionDriftRecord({ logicalKey: desired.logicalKey, ownership: mapping.ownership, diffs });
    if (drift) drifts.push(drift);
  }
  return drifts;
}
