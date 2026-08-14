export type ErrorBudgetHealth = 'HEALTHY' | 'WATCH' | 'EXHAUSTED' | 'UNKNOWN';

export interface ErrorBudgetInput {
  good: number;
  total: number;
  targetRatio: number;
  minimumSamples?: number;
  watchRemainingFraction?: number;
}

export interface ErrorBudgetResult {
  good: number;
  total: number;
  bad: number;
  targetRatio: number;
  observedRatio: number | null;
  allowedBad: number;
  consumedBad: number;
  remainingBad: number;
  remainingFraction: number | null;
  burnMultiple: number | null;
  sufficientSamples: boolean;
  health: ErrorBudgetHealth;
}

export function evaluateErrorBudget(input: ErrorBudgetInput): ErrorBudgetResult {
  if (![input.good, input.total, input.targetRatio].every(Number.isFinite)) throw new Error('SLO_INPUT_INVALID');
  if (!Number.isInteger(input.good) || !Number.isInteger(input.total) || input.good < 0 || input.total < 0 || input.good > input.total) throw new Error('SLO_COUNT_INVALID');
  if (!(input.targetRatio > 0 && input.targetRatio < 1)) throw new Error('SLO_TARGET_INVALID');
  const minimumSamples = Math.max(1, Math.min(1_000_000, Math.floor(input.minimumSamples ?? 20)));
  const watchRemainingFraction = Math.max(0, Math.min(1, input.watchRemainingFraction ?? 0.25));
  const bad = input.total - input.good;
  const allowedBad = input.total * (1 - input.targetRatio);
  const remainingBad = Math.max(0, allowedBad - bad);
  const observedRatio = input.total === 0 ? null : input.good / input.total;
  const remainingFraction = allowedBad <= 0 ? null : Math.max(0, Math.min(1, remainingBad / allowedBad));
  const burnMultiple = allowedBad <= 0 ? null : bad / allowedBad;
  const sufficientSamples = input.total >= minimumSamples;
  let health: ErrorBudgetHealth = 'UNKNOWN';
  if (sufficientSamples) {
    if (bad > allowedBad) health = 'EXHAUSTED';
    else if ((remainingFraction ?? 0) <= watchRemainingFraction) health = 'WATCH';
    else health = 'HEALTHY';
  }
  return { good: input.good, total: input.total, bad, targetRatio: input.targetRatio, observedRatio, allowedBad, consumedBad: bad, remainingBad, remainingFraction, burnMultiple, sufficientSamples, health };
}
