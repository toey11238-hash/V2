import { describe, expect, it } from 'vitest';
import { transitionRecoveryDrill, validateRecoveryDrillPlan } from '@autoserver/recovery-drills';

describe('recovery drill evidence contracts',()=>{
  it('requires multiple expected checks at plan time',()=>{
    expect(validateRecoveryDrillPlan({drillType:'OUTBOX_RECOVERY',objective:'Prove durable event recovery after restart.',expectedChecks:['Persist event','Restart consumer','Verify dispatch']}).expectedChecks).toHaveLength(3);
    expect(()=>validateRecoveryDrillPlan({drillType:'RESTORE',objective:'Restore',expectedChecks:['only one']})).toThrow();
  });
  it('does not allow optimistic pass states',()=>{
    expect(()=>transitionRecoveryDrill('RUNNING','PASSED',{evidence:{checksPassed:2,checksFailed:0,artifactRefs:[]}})).toThrow('RECOVERY_DRILL_PASS_EVIDENCE_REQUIRED');
    expect(transitionRecoveryDrill('RUNNING','PASSED',{evidence:{checksPassed:4,checksFailed:0,artifactRefs:['report:verified']}})).toBe('PASSED');
  });
  it('requires blocker evidence for blocked and failed states',()=>{
    expect(()=>transitionRecoveryDrill('RUNNING','BLOCKED',{})).toThrow('RECOVERY_DRILL_BLOCKER_REQUIRED');
    expect(transitionRecoveryDrill('RUNNING','BLOCKED',{blockers:['Discord test guild unavailable']})).toBe('BLOCKED');
  });
});
