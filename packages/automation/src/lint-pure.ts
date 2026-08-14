import type { AutomationSimulationRule } from './simulation-pure.ts';

export type AutomationLintSeverity = 'INFO' | 'WARNING' | 'HIGH';
export interface AutomationLintFinding { code: string; severity: AutomationLintSeverity; message: string; }
export interface AutomationLintResult { score: number; risk: 'LOW' | 'MEDIUM' | 'HIGH'; findings: AutomationLintFinding[]; }

export function lintAutomationRule(rule: AutomationSimulationRule): AutomationLintResult {
  if (!rule || typeof rule !== 'object' || !Array.isArray(rule.conditions) || !Array.isArray(rule.actions)) throw new Error('AUTOMATION_LINT_RULE_INVALID');
  const findings: AutomationLintFinding[] = [];
  let score = 0;
  if (rule.enabled && rule.conditions.length === 0) { findings.push({ code:'BROAD_MATCH',severity:'HIGH',message:'Enabled rule has no conditions and matches every event of its type.' }); score += 45; }
  if (rule.actions.length >= 6) { findings.push({ code:'ACTION_FANOUT',severity:'WARNING',message:'Rule has many actions; split responsibilities if independent failure handling is needed.' }); score += 15; }
  const scheduled = rule.actions.filter((action)=>action.type==='SCHEDULE_NOTIFICATION').length;
  if (scheduled >= 3) { findings.push({ code:'SCHEDULE_FANOUT',severity:'WARNING',message:'Multiple scheduled notifications can amplify one source event.' }); score += 15; }
  const seen = new Set<string>();
  const existencePaths = new Set(rule.conditions.filter((condition)=>condition.operator==='EXISTS').map((condition)=>condition.path));
  for (const condition of rule.conditions) {
    const key=`${condition.path}:${condition.operator}:${JSON.stringify(condition.value)}`;
    if (seen.has(key)) { findings.push({ code:'DUPLICATE_CONDITION',severity:'INFO',message:`Duplicate condition on ${condition.path}.` }); score += 5; }
    seen.add(key);
    if ((condition.operator==='NOT_EQUALS'||condition.operator==='NOT_IN')&&!existencePaths.has(condition.path)) {
      findings.push({ code:'NEGATIVE_WITHOUT_EXISTS',severity:'WARNING',message:`Negative match on ${condition.path} also matches a missing field; add EXISTS if absence should not match.` }); score += 10;
    }
  }
  const auditOnly=rule.actions.length>0&&rule.actions.every((action)=>action.type==='AUDIT_NOTE');
  if (auditOnly) findings.push({ code:'AUDIT_ONLY',severity:'INFO',message:'Rule has no external notification side effect.' });
  score=Math.min(100,score);
  return { score, risk: score>=40?'HIGH':score>=15?'MEDIUM':'LOW', findings:findings.slice(0,20) };
}
