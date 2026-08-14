export type ModerationAction = 'WARN' | 'TIMEOUT' | 'KICK' | 'BAN' | 'UNBAN' | 'DELETE_MESSAGE' | 'SLOWMODE' | 'LOCK_CHANNEL';
export type ModerationRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ModerationPolicy {
  allowAutomaticWarn: boolean;
  allowAutomaticTimeout: boolean;
  allowAutomaticKick: boolean;
  allowAutomaticBan: boolean;
  autoBanMinimumConfidence: number;
}

export interface ModerationDecision {
  action: ModerationAction;
  risk: ModerationRisk;
  requiresHumanApproval: boolean;
  reason: string;
}

export function classifyModerationAction(action: ModerationAction, automated: boolean, confidence = 0, policy?: ModerationPolicy): ModerationDecision {
  const risk: ModerationRisk = action === 'BAN' || action === 'KICK' ? 'HIGH' : action === 'TIMEOUT' || action === 'LOCK_CHANNEL' ? 'MEDIUM' : 'LOW';
  if (!automated) return { action, risk, requiresHumanApproval: false, reason: 'Authorized human-initiated moderation action.' };
  const p = policy ?? { allowAutomaticWarn: true, allowAutomaticTimeout: false, allowAutomaticKick: false, allowAutomaticBan: false, autoBanMinimumConfidence: 1 };
  const allowed = action === 'WARN' ? p.allowAutomaticWarn
    : action === 'TIMEOUT' ? p.allowAutomaticTimeout
      : action === 'KICK' ? p.allowAutomaticKick
        : action === 'BAN' ? p.allowAutomaticBan && confidence >= p.autoBanMinimumConfidence
          : false;
  return {
    action,
    risk,
    requiresHumanApproval: !allowed,
    reason: allowed ? 'Automation policy explicitly permits this action.' : 'Automation policy requires human approval for this action.',
  };
}

export type SecurityResponseTier = 'ALERT' | 'THROTTLE' | 'TEMPORARY_LOCK' | 'ESCALATE';
export function securityResponseForScore(score: number): SecurityResponseTier {
  if (!Number.isFinite(score) || score < 0) throw new Error('INVALID_SECURITY_SCORE');
  if (score < 0.35) return 'ALERT';
  if (score < 0.65) return 'THROTTLE';
  if (score < 0.9) return 'TEMPORARY_LOCK';
  return 'ESCALATE';
}

export function parseTemporaryRoleDuration(value: string): number {
  const match = /^\s*(\d+)\s*([mhd])\s*$/i.exec(value);
  if (!match) throw new Error('INVALID_TEMP_ROLE_DURATION');
  const amount = Number(match[1]);
  const unit = match[2]!.toLowerCase();
  const multiplier = unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  const durationMs = amount * multiplier;
  if (!Number.isSafeInteger(durationMs) || durationMs < 5 * 60_000 || durationMs > 30 * 86_400_000) throw new Error('TEMP_ROLE_DURATION_OUT_OF_RANGE');
  return durationMs;
}

export function temporaryRoleWarningLeadMs(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs < 5 * 60_000) throw new Error('INVALID_TEMP_ROLE_DURATION');
  if (durationMs >= 24 * 60 * 60_000) return 60 * 60_000;
  if (durationMs >= 60 * 60_000) return 30 * 60_000;
  if (durationMs >= 15 * 60_000) return 5 * 60_000;
  return null;
}
