export type RuleOperator = 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'EXISTS';
export interface RuleCondition { path: string; operator: RuleOperator; value?: unknown; }
export type AutomationActionType = 'NOTIFY_TOPIC' | 'SCHEDULE_NOTIFICATION' | 'AUDIT_NOTE';
export interface AutomationAction { type: AutomationActionType; config: Record<string, unknown>; }
export interface AutomationRule { ruleId: string; eventType: string; enabled: boolean; conditions: RuleCondition[]; actions: AutomationAction[]; version?: number; }

export const AUTOMATION_NOTIFICATION_TOPICS = ['ANNOUNCEMENTS','EVENTS','NEWS','LIVE','UPDATES','GAME_PATCHES','LFG','TOURNAMENTS'] as const;
export type AutomationNotificationTopic = typeof AUTOMATION_NOTIFICATION_TOPICS[number];
const TOPICS = new Set<string>(AUTOMATION_NOTIFICATION_TOPICS);
const ACTIONS = new Set<string>(['NOTIFY_TOPIC','SCHEDULE_NOTIFICATION','AUDIT_NOTE']);
const OPERATORS = new Set<string>(['EQUALS','NOT_EQUALS','IN','NOT_IN','GT','GTE','LT','LTE','EXISTS']);

function getPath(input: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, input);
}
function boundedText(value:unknown,max:number,code:string):string{
  const text=typeof value==='string'?value.trim():'';if(!text||text.length>max)throw new Error(code);return text;
}
function boundedInteger(value:unknown,min:number,max:number,code:string):number{
  const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(code);return n;
}

export function evaluateCondition(payload: unknown, condition: RuleCondition): boolean {
  const actual = getPath(payload, condition.path);
  switch (condition.operator) {
    case 'EXISTS': return actual !== undefined && actual !== null;
    case 'EQUALS': return actual === condition.value;
    case 'NOT_EQUALS': return actual !== condition.value;
    case 'IN': return Array.isArray(condition.value) && condition.value.includes(actual);
    case 'NOT_IN': return Array.isArray(condition.value) && !condition.value.includes(actual);
    case 'GT': return typeof actual === 'number' && typeof condition.value === 'number' && actual > condition.value;
    case 'GTE': return typeof actual === 'number' && typeof condition.value === 'number' && actual >= condition.value;
    case 'LT': return typeof actual === 'number' && typeof condition.value === 'number' && actual < condition.value;
    case 'LTE': return typeof actual === 'number' && typeof condition.value === 'number' && actual <= condition.value;
  }
}

export function matchAutomationRule(rule: AutomationRule, eventType: string, payload: unknown): boolean {
  return rule.enabled && rule.eventType === eventType && rule.conditions.every((condition) => evaluateCondition(payload, condition));
}

export function validateAutomationCondition(input:unknown):RuleCondition{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('AUTOMATION_CONDITION_INVALID');
  const value=input as Record<string,unknown>;const path=boundedText(value.path,120,'AUTOMATION_CONDITION_PATH_INVALID');
  if(!/^[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+){0,7}$/.test(path))throw new Error('AUTOMATION_CONDITION_PATH_INVALID');
  const operator=String(value.operator??'').toUpperCase();if(!OPERATORS.has(operator))throw new Error('AUTOMATION_CONDITION_OPERATOR_INVALID');
  if((operator==='IN'||operator==='NOT_IN')&&(!Array.isArray(value.value)||value.value.length>50))throw new Error('AUTOMATION_CONDITION_VALUE_INVALID');
  return {path,operator:operator as RuleOperator,...(operator==='EXISTS'?{}:{value:value.value})};
}

export function validateAutomationAction(input:unknown):AutomationAction{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('AUTOMATION_ACTION_INVALID');
  const root=input as Record<string,unknown>;const type=String(root.type??'').toUpperCase();if(!ACTIONS.has(type))throw new Error('AUTOMATION_ACTION_TYPE_UNSUPPORTED');
  const config=root.config&&typeof root.config==='object'&&!Array.isArray(root.config)?root.config as Record<string,unknown>:{};
  if(type==='AUDIT_NOTE')return {type,config:{note:boundedText(config.note,300,'AUTOMATION_AUDIT_NOTE_INVALID')}} as AutomationAction;
  const topic=String(config.topic??'').toUpperCase();if(!TOPICS.has(topic))throw new Error('AUTOMATION_NOTIFICATION_TOPIC_UNSUPPORTED');
  const normalized:Record<string,unknown>={topic,title:boundedText(config.title,120,'AUTOMATION_NOTIFICATION_TITLE_INVALID'),body:boundedText(config.body,1200,'AUTOMATION_NOTIFICATION_BODY_INVALID')};
  if(type==='SCHEDULE_NOTIFICATION')normalized.delaySeconds=boundedInteger(config.delaySeconds,60,86400,'AUTOMATION_DELAY_INVALID');
  return {type:type as AutomationActionType,config:normalized};
}

export function validateAutomationRuleDefinition(input:{eventType:string;conditions?:unknown;actions?:unknown;enabled?:boolean}):{eventType:string;conditions:RuleCondition[];actions:AutomationAction[];enabled:boolean}{
  const eventType=boundedText(input.eventType,120,'AUTOMATION_EVENT_TYPE_INVALID');if(!/^[a-z0-9][a-z0-9._:-]{1,119}$/i.test(eventType))throw new Error('AUTOMATION_EVENT_TYPE_INVALID');
  const rawConditions=Array.isArray(input.conditions)?input.conditions:[];const rawActions=Array.isArray(input.actions)?input.actions:[];
  if(rawConditions.length>12)throw new Error('AUTOMATION_CONDITION_LIMIT');if(rawActions.length<1||rawActions.length>10)throw new Error('AUTOMATION_ACTION_LIMIT');
  return {eventType,conditions:rawConditions.map(validateAutomationCondition),actions:rawActions.map(validateAutomationAction),enabled:input.enabled!==false};
}

export { evaluateAutomationSimulationCondition, simulateAutomationRule } from './simulation-pure.ts';
export type { AutomationSimulationCondition, AutomationSimulationRule, AutomationSimulationResult } from './simulation-pure.ts';
export { lintAutomationRule } from './lint-pure.ts';
export type { AutomationLintFinding, AutomationLintResult, AutomationLintSeverity } from './lint-pure.ts';
