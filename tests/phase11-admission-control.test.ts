import { describe, expect, it } from 'vitest';
import { defaultAdmissionPolicy, evaluateAdmission, normalizeAdmissionPolicy } from '@autoserver/admission-control';
import { normalizeSetupDraft } from '@autoserver/control-center';

describe('phase 11 admission control',()=>{
  it('protects safety/support/diagnostic work from load shedding',()=>{
    const policy=defaultAdmissionPolicy('guild');
    for(const operation of ['SAFETY','SUPPORT','DIAGNOSTIC'] as const){
      expect(evaluateAdmission(policy,{operation,pressure:'EMERGENCY',criticalIncidentOpen:true,maintenanceActive:true}).decision).toBe('ALLOW');
    }
  });
  it('defers structural work at throttle under balanced policy',()=>{
    expect(evaluateAdmission(defaultAdmissionPolicy('guild'),{operation:'STRUCTURAL',pressure:'THROTTLE',criticalIncidentOpen:false,maintenanceActive:false}).decision).toBe('DEFER');
  });
  it('observe mode records the would-defer result without blocking',()=>{
    const policy={...defaultAdmissionPolicy('guild'),mode:'OBSERVE' as const};
    const result=evaluateAdmission(policy,{operation:'BULK',pressure:'EMERGENCY',criticalIncidentOpen:true,maintenanceActive:false});
    expect(result.decision).toBe('ALLOW');
    expect(result.wouldDecision).toBe('DEFER');
  });
  it('validates presets and setup persistence',()=>{
    expect(()=>normalizeAdmissionPolicy({guildId:'g',preset:'UNKNOWN',mode:'ENFORCE'})).toThrow('ADMISSION_PRESET_INVALID');
    expect(normalizeSetupDraft({blueprintKey:'hybrid-standard',admissionPreset:'CONSERVATIVE'}).admissionPreset).toBe('CONSERVATIVE');
  });
});
