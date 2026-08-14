import { describe, expect, it } from 'vitest';
import { transitionIncidentStatus, validateIncidentCreate } from '@autoserver/incidents';
import { assessCapacity } from '@autoserver/capacity';

describe('incident response contracts',()=>{
  it('validates declarations and bounded states',()=>{
    expect(validateIncidentCreate({kind:'DATABASE',severity:'CRITICAL',title:'Database unavailable',summary:'Primary database health checks are failing across the control plane.'}).kind).toBe('DATABASE');
    expect(()=>validateIncidentCreate({kind:'OTHER',severity:'LOW',title:'x',summary:'too short'})).toThrow();
  });
  it('requires evidence when resolving or closing',()=>{
    expect(transitionIncidentStatus('OPEN','INVESTIGATING')).toBe('INVESTIGATING');
    expect(()=>transitionIncidentStatus('MITIGATING','RESOLVED','fixed')).toThrow('INCIDENT_RESOLUTION_NOTE_REQUIRED');
    expect(transitionIncidentStatus('MITIGATING','RESOLVED','Mitigation applied and health checks are stable.')).toBe('RESOLVED');
  });
});

describe('capacity evidence contracts',()=>{
  it('stays advisory in normal conditions',()=>{
    const value=assessCapacity({resourceCount:100,queuedJobs:1,retryingJobs:0,deadLetterJobs:0,dueScheduledTasks:0,notificationBacklog:0,realtimeBackpressureDisconnects:0,realtimeSendFailures:0,criticalOpenIncidents:0});
    expect(value.pressure).toBe('NORMAL');
    expect(value.actions[0]).toContain('No capacity intervention');
  });
  it('escalates critical incidents and dead-letter evidence',()=>{
    const value=assessCapacity({resourceCount:430,queuedJobs:20,retryingJobs:8,deadLetterJobs:2,dueScheduledTasks:25,notificationBacklog:180,realtimeBackpressureDisconnects:4,realtimeSendFailures:3,criticalOpenIncidents:1});
    expect(value.score).toBeGreaterThanOrEqual(80);
    expect(['THROTTLE','EMERGENCY']).toContain(value.pressure);
    expect(value.reasons.some((item)=>item.includes('critical incident'))).toBe(true);
  });
});
