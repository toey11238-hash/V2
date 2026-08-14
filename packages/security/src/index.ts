import { createHmac, timingSafeEqual } from 'node:crypto';
import { PermissionFlagsBits, type GuildMember } from 'discord.js';

export class PolicyViolationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'PolicyViolationError';
  }
}

export interface CompetitionPolicyInput {
  wageringEnabled?: boolean;
  entryStakeRequired?: boolean;
  odds?: unknown;
  stake?: unknown;
  bettingPool?: unknown;
}

export function assertNonWageringCompetition(input: CompetitionPolicyInput): void {
  const violation = input.wageringEnabled === true
    || input.entryStakeRequired === true
    || input.odds != null
    || input.stake != null
    || input.bettingPool != null;
  if (violation) {
    throw new PolicyViolationError('GAMBLING_PROHIBITED', 'Competition configuration violates the project no-gambling Canon.');
  }
}

export function canManagePlatform(member: GuildMember): boolean {
  return member.id === member.guild.ownerId
    || member.permissions.has(PermissionFlagsBits.ManageGuild)
    || member.permissions.has(PermissionFlagsBits.Administrator);
}

export class InteractionTokenService {
  constructor(private readonly secret: string) {
    if (secret.length < 24) throw new Error('INTERACTION_SIGNING_SECRET must be at least 24 characters');
  }

  sign(scope: string, value: string): string {
    const payload = `${scope}:${value}`;
    const sig = createHmac('sha256', this.secret).update(payload).digest('base64url').slice(0, 16);
    return `${value}.${sig}`;
  }

  verify(scope: string, token: string): string | null {
    const split = token.lastIndexOf('.');
    if (split < 1) return null;
    const value = token.slice(0, split);
    const signature = token.slice(split + 1);
    const expected = createHmac('sha256', this.secret).update(`${scope}:${value}`).digest('base64url').slice(0, 16);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return value;
  }
}
