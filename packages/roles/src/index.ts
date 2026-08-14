export type RoleRisk = 'COSMETIC' | 'MEMBER_ACCESS' | 'STAFF' | 'PRIVILEGED';

export interface SelfRolePolicy {
  roleKey: string;
  risk: RoleRisk;
  requiresVerified: boolean;
  removableByMember: boolean;
  exclusiveGroup?: string;
  maxSelectionsInGroup?: number;
}

export interface RoleAssignmentContext {
  verified: boolean;
  isStaff: boolean;
  existingRoleKeys: readonly string[];
  policies: readonly SelfRolePolicy[];
}

export type RoleAssignmentDecision =
  | { allowed: true; removeRoleKeys: string[] }
  | { allowed: false; code: 'UNKNOWN_ROLE' | 'VERIFICATION_REQUIRED' | 'STAFF_ROLE_FORBIDDEN' | 'GROUP_LIMIT' };

export function evaluateSelfRole(roleKey: string, context: RoleAssignmentContext): RoleAssignmentDecision {
  const policy = context.policies.find((item) => item.roleKey === roleKey);
  if (!policy) return { allowed: false, code: 'UNKNOWN_ROLE' };
  if (policy.risk === 'STAFF' || policy.risk === 'PRIVILEGED') return { allowed: false, code: 'STAFF_ROLE_FORBIDDEN' };
  if (policy.requiresVerified && !context.verified) return { allowed: false, code: 'VERIFICATION_REQUIRED' };
  if (!policy.exclusiveGroup) return { allowed: true, removeRoleKeys: [] };
  const groupPolicies = context.policies.filter((item) => item.exclusiveGroup === policy.exclusiveGroup);
  const groupExisting = context.existingRoleKeys.filter((key) => groupPolicies.some((item) => item.roleKey === key) && key !== roleKey);
  const limit = policy.maxSelectionsInGroup ?? 1;
  if (limit <= 1) return { allowed: true, removeRoleKeys: groupExisting };
  if (groupExisting.length >= limit) return { allowed: false, code: 'GROUP_LIMIT' };
  return { allowed: true, removeRoleKeys: [] };
}

export interface TemporaryRoleGrant {
  roleId: string;
  userId: string;
  expiresAt: number;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
}

export function temporaryRoleDue(grant: TemporaryRoleGrant, now = Date.now()): boolean {
  return grant.status === 'ACTIVE' && grant.expiresAt <= now;
}

export function classifyRoleRisk(input: { staff: boolean; permissions?: readonly string[]; cosmetic?: boolean }): RoleRisk {
  if (input.permissions?.some((permission) => ['Administrator', 'ManageGuild', 'ManageRoles', 'BanMembers'].includes(permission))) return 'PRIVILEGED';
  if (input.staff) return 'STAFF';
  if (input.cosmetic) return 'COSMETIC';
  return 'MEMBER_ACCESS';
}
