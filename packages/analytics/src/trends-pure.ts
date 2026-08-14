export type MetricTrendDirection = 'UP' | 'DOWN' | 'FLAT' | 'INSUFFICIENT';
export type MetricHealth = 'HEALTHY' | 'WATCH' | 'DEGRADED' | 'UNKNOWN';

export interface MetricTrendPoint { value: number; sampleCount: number; }
export interface MetricTrendResult {
  current: number;
  previous: number;
  absoluteChange: number;
  percentChange: number | null;
  direction: MetricTrendDirection;
  health: MetricHealth;
  sufficientSamples: boolean;
}

export function evaluateMetricTrend(
  previous: MetricTrendPoint,
  current: MetricTrendPoint,
  options: { higherIsBetter?: boolean; minimumSamples?: number; watchPercent?: number; degradedPercent?: number } = {},
): MetricTrendResult {
  if (![previous.value, current.value, previous.sampleCount, current.sampleCount].every(Number.isFinite)) throw new Error('METRIC_TREND_INPUT_INVALID');
  const minimumSamples = Math.max(1, Math.min(100000, Math.floor(options.minimumSamples ?? 5)));
  const sufficientSamples = previous.sampleCount >= minimumSamples && current.sampleCount >= minimumSamples;
  const absoluteChange = current.value - previous.value;
  const percentChange = previous.value === 0 ? null : (absoluteChange / Math.abs(previous.value)) * 100;
  const epsilon = Math.max(1e-9, Math.abs(previous.value) * 0.005);
  const direction: MetricTrendDirection = !sufficientSamples ? 'INSUFFICIENT' : Math.abs(absoluteChange) <= epsilon ? 'FLAT' : absoluteChange > 0 ? 'UP' : 'DOWN';
  let health: MetricHealth = sufficientSamples ? 'HEALTHY' : 'UNKNOWN';
  if (sufficientSamples && percentChange !== null) {
    const signed = (options.higherIsBetter ?? true) ? percentChange : -percentChange;
    const watch = Math.abs(options.watchPercent ?? 10);
    const degraded = Math.max(watch, Math.abs(options.degradedPercent ?? 25));
    if (signed <= -degraded) health = 'DEGRADED';
    else if (signed <= -watch) health = 'WATCH';
  }
  return { current: current.value, previous: previous.value, absoluteChange, percentChange, direction, health, sufficientSamples };
}
