export type OnboardingStage = 'NEW' | 'WELCOMED' | 'VERIFIED' | 'PROFILED' | 'ACTIVE' | 'PAUSED';

export interface OnboardingState {
  stage: OnboardingStage;
  joinedAt: string;
  welcomedAt?: string;
  verifiedAt?: string;
  profiledAt?: string;
  activatedAt?: string;
  pauseReason?: string;
}

const onboardingTransitions: Record<OnboardingStage, readonly OnboardingStage[]> = {
  NEW: ['WELCOMED', 'PAUSED'],
  WELCOMED: ['VERIFIED', 'PAUSED'],
  VERIFIED: ['PROFILED', 'ACTIVE', 'PAUSED'],
  PROFILED: ['ACTIVE', 'PAUSED'],
  ACTIVE: ['PAUSED'],
  PAUSED: ['WELCOMED', 'VERIFIED', 'PROFILED', 'ACTIVE'],
};

export function transitionOnboarding(state: OnboardingState, next: OnboardingStage, now = new Date()): OnboardingState {
  if (state.stage === next) return state;
  if (!onboardingTransitions[state.stage].includes(next)) throw new Error(`Invalid onboarding transition ${state.stage} -> ${next}`);
  const iso = now.toISOString();
  const result: OnboardingState = { ...state, stage: next };
  if (next === 'WELCOMED') result.welcomedAt = state.welcomedAt ?? iso;
  if (next === 'VERIFIED') result.verifiedAt = state.verifiedAt ?? iso;
  if (next === 'PROFILED') result.profiledAt = state.profiledAt ?? iso;
  if (next === 'ACTIVE') result.activatedAt = state.activatedAt ?? iso;
  if (next !== 'PAUSED') delete result.pauseReason;
  return result;
}

export interface VerificationPolicy {
  cooldownMs: number;
  maxAttemptsPerWindow: number;
  windowMs: number;
  requireAccountAgeMs?: number;
}

export interface VerificationHistory {
  attemptedAt: number[];
  verifiedAt?: number;
}

export type VerificationDecision =
  | { allowed: true; remainingAttempts: number }
  | { allowed: false; code: 'ALREADY_VERIFIED' | 'COOLDOWN' | 'ATTEMPT_LIMIT' | 'ACCOUNT_TOO_NEW'; retryAt?: number };

export function evaluateVerification(input: {
  policy: VerificationPolicy;
  history: VerificationHistory;
  now: number;
  accountCreatedAt?: number;
}): VerificationDecision {
  if (input.history.verifiedAt) return { allowed: false, code: 'ALREADY_VERIFIED' };
  if (input.policy.requireAccountAgeMs && input.accountCreatedAt && input.now - input.accountCreatedAt < input.policy.requireAccountAgeMs) {
    return { allowed: false, code: 'ACCOUNT_TOO_NEW', retryAt: input.accountCreatedAt + input.policy.requireAccountAgeMs };
  }
  const recent = input.history.attemptedAt.filter((at) => input.now - at <= input.policy.windowMs).sort((a, b) => b - a);
  if (recent[0] != null && input.now - recent[0] < input.policy.cooldownMs) return { allowed: false, code: 'COOLDOWN', retryAt: recent[0] + input.policy.cooldownMs };
  if (recent.length >= input.policy.maxAttemptsPerWindow) return { allowed: false, code: 'ATTEMPT_LIMIT', retryAt: Math.min(...recent) + input.policy.windowMs };
  return { allowed: true, remainingAttempts: Math.max(0, input.policy.maxAttemptsPerWindow - recent.length - 1) };
}

export interface WelcomeStep {
  key: 'RULES' | 'VERIFY' | 'ROLES' | 'PROFILE' | 'NOTIFICATIONS' | 'INTRODUCE';
  required: boolean;
  order: number;
}

export function buildWelcomeJourney(input: { verification: boolean; profiles: boolean; notifications: boolean; introductions: boolean }): WelcomeStep[] {
  const steps: WelcomeStep[] = [{ key: 'RULES', required: true, order: 10 }];
  if (input.verification) steps.push({ key: 'VERIFY', required: true, order: 20 });
  steps.push({ key: 'ROLES', required: false, order: 30 });
  if (input.profiles) steps.push({ key: 'PROFILE', required: false, order: 40 });
  if (input.notifications) steps.push({ key: 'NOTIFICATIONS', required: false, order: 50 });
  if (input.introductions) steps.push({ key: 'INTRODUCE', required: false, order: 60 });
  return steps;
}
