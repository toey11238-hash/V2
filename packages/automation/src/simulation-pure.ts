export interface AutomationSimulationCondition {
  path: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'EXISTS';
  value?: unknown;
}

export interface AutomationSimulationRule {
  ruleId: string;
  eventType: string;
  enabled: boolean;
  conditions: AutomationSimulationCondition[];
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  version?: number;
}

export interface AutomationSimulationResult {
  ruleId: string;
  ruleVersion: number;
  eventTypeMatched: boolean;
  enabled: boolean;
  matched: boolean;
  conditions: Array<{ path: string; operator: string; passed: boolean }>;
  actionIntents: Array<{ type: string; summary: string }>;
}

function getPath(payload: unknown, path: string): unknown {
  if (!/^[A-Za-z0-9_.-]{1,120}$/.test(path)) throw new Error('AUTOMATION_SIMULATION_PATH_INVALID');
  let value: unknown = payload;
  for (const key of path.split('.')) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function equals(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }

export function evaluateAutomationSimulationCondition(payload: unknown, condition: AutomationSimulationCondition): boolean {
  const actual = getPath(payload, condition.path);
  if (condition.operator === 'EXISTS') return actual !== undefined && actual !== null;
  if (condition.operator === 'EQUALS') return equals(actual, condition.value);
  if (condition.operator === 'NOT_EQUALS') return !equals(actual, condition.value);
  if (condition.operator === 'IN' || condition.operator === 'NOT_IN') {
    if (!Array.isArray(condition.value) || condition.value.length > 100) throw new Error('AUTOMATION_SIMULATION_SET_INVALID');
    const contained = condition.value.some((item) => equals(actual, item));
    return condition.operator === 'IN' ? contained : !contained;
  }
  const left = Number(actual); const right = Number(condition.value);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  if (condition.operator === 'GT') return left > right;
  if (condition.operator === 'GTE') return left >= right;
  if (condition.operator === 'LT') return left < right;
  return left <= right;
}

function actionSummary(action: { type: string; config: Record<string, unknown> }): string {
  if (action.type === 'NOTIFY_TOPIC') return `notify:${String(action.config.topic ?? 'unknown').slice(0, 40)}`;
  if (action.type === 'SCHEDULE_NOTIFICATION') return `schedule-notification:${String(action.config.topic ?? 'unknown').slice(0, 40)}`;
  if (action.type === 'AUDIT_NOTE') return 'audit-note';
  return 'unsupported-action';
}

export function simulateAutomationRule(rule: AutomationSimulationRule, eventType: string, payload: unknown): AutomationSimulationResult {
  if (!rule.ruleId || rule.ruleId.length > 120 || !rule.eventType || rule.eventType.length > 120) throw new Error('AUTOMATION_SIMULATION_RULE_INVALID');
  if (rule.conditions.length > 20 || rule.actions.length > 10) throw new Error('AUTOMATION_SIMULATION_RULE_LIMIT');
  const eventTypeMatched = rule.eventType === eventType;
  const conditions = rule.conditions.map((condition) => ({ path: condition.path, operator: condition.operator, passed: eventTypeMatched ? evaluateAutomationSimulationCondition(payload, condition) : false }));
  const matched = Boolean(rule.enabled && eventTypeMatched && conditions.every((condition) => condition.passed));
  return {
    ruleId: rule.ruleId,
    ruleVersion: Math.max(1, Number.isInteger(rule.version) ? Number(rule.version) : 1),
    eventTypeMatched,
    enabled: rule.enabled,
    matched,
    conditions,
    actionIntents: matched ? rule.actions.map((action) => ({ type: action.type, summary: actionSummary(action) })) : [],
  };
}
