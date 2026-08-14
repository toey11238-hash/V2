export type FeatureFlagValue = boolean | 'INHERIT';
export interface FeatureFlagLayer { key: string; value: FeatureFlagValue; scope: 'GLOBAL' | 'ENVIRONMENT' | 'GUILD' | 'ROLE'; priority: number; }

export function resolveFeatureFlag(layers: readonly FeatureFlagLayer[], defaultValue = false): boolean {
  const selected = [...layers].filter((item) => item.value !== 'INHERIT').sort((a, b) => b.priority - a.priority)[0];
  return selected ? Boolean(selected.value) : defaultValue;
}

export type ApprovalRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ApprovalState = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED' | 'CANCELLED';

export interface ApprovalRequest {
  state: ApprovalState;
  risk: ApprovalRisk;
  requestedBy: string;
  requiredApprovals: number;
  approvedBy: string[];
  expiresAt?: number;
}

export function approveRequest(request: ApprovalRequest, actorId: string, now = Date.now()): ApprovalRequest {
  if (request.expiresAt && request.expiresAt <= now) return { ...request, state: 'EXPIRED' };
  if (!['DRAFT', 'PENDING'].includes(request.state)) throw new Error(`Approval cannot be changed from ${request.state}`);
  if (request.requestedBy === actorId && request.risk === 'CRITICAL') throw new Error('Critical changes require a second operator');
  const approvedBy = request.approvedBy.includes(actorId) ? request.approvedBy : [...request.approvedBy, actorId];
  return { ...request, approvedBy, state: approvedBy.length >= request.requiredApprovals ? 'APPROVED' : 'PENDING' };
}

export interface MaintenancePolicy {
  enabled: boolean;
  allowSetup: boolean;
  allowRepair: boolean;
  allowMemberAutomation: boolean;
  reason?: string;
}

export function operationAllowed(policy: MaintenancePolicy, operation: 'SETUP' | 'REPAIR' | 'MEMBER_AUTOMATION' | 'DIAGNOSTIC'): boolean {
  if (!policy.enabled || operation === 'DIAGNOSTIC') return true;
  if (operation === 'SETUP') return policy.allowSetup;
  if (operation === 'REPAIR') return policy.allowRepair;
  return policy.allowMemberAutomation;
}

export interface MaintenanceWindowInput {
  startsAt: Date;
  endsAt?: Date;
  reason?: string;
  allowSetup?: boolean;
  allowRepair?: boolean;
  allowMemberAutomation?: boolean;
}
export function validateMaintenanceWindow(input: MaintenanceWindowInput, now = new Date()): MaintenanceWindowInput {
  if (Number.isNaN(input.startsAt.getTime())) throw new Error('MAINTENANCE_START_INVALID');
  if (input.endsAt && Number.isNaN(input.endsAt.getTime())) throw new Error('MAINTENANCE_END_INVALID');
  if (input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) throw new Error('MAINTENANCE_END_BEFORE_START');
  if (input.startsAt.getTime() < now.getTime() - 5 * 60_000) throw new Error('MAINTENANCE_START_TOO_OLD');
  if (input.endsAt && input.endsAt.getTime() - input.startsAt.getTime() > 7 * 86_400_000) throw new Error('MAINTENANCE_WINDOW_TOO_LONG');
  return { ...input, reason: input.reason?.trim().slice(0, 300) };
}
export function maintenancePolicyFromAutomation(value: Record<string, unknown>): MaintenancePolicy {
  return {
    enabled: true,
    allowSetup: value.allowSetup === true,
    allowRepair: value.allowRepair === true,
    allowMemberAutomation: value.allowMemberAutomation === true,
    reason: typeof value.reason === 'string' ? value.reason.slice(0, 300) : undefined,
  };
}
