import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPortableConfig, migratePortableConfig, validatePortableConfig } from '@autoserver/governance';
import { evaluateFeatureRollouts, rolloutIdentityHash, rolloutRoleContextHash, stableRolloutBucket, type FeatureRollout } from '@autoserver/feature-flags';
import { transitionApplication, transitionReport, transitionSuggestion } from '@autoserver/workflows';
import { HmacWebhookVerifier, ReplayGuard, sanitizeIntegrationHealthDetail } from '@autoserver/integrations';
import { isTaskDue } from '@autoserver/scheduler';

describe('phase 5 controlled-operations contracts', () => {
  it('migrates checksum-verified portable config forward without mutating Discord', () => {
    const legacy=createPortableConfig({schemaVersion:1,exportedAt:'2026-08-14T00:00:00Z',guildId:'source',payload:{setupDraft:{blueprintKey:'hybrid-standard'},templateVersion:5}});
    const result=migratePortableConfig(legacy);
    expect(result.sourceSchemaVersion).toBe(1);
    expect(result.targetSchemaVersion).toBe(2);
    expect(result.appliedMigrations).toEqual(['portable-config-v1-to-v2']);
    expect(validatePortableConfig(result.envelope)).toBe(true);
    expect((result.envelope.payload.versions as Record<string,unknown>).templateVersion).toBe(5);
    expect(result.envelope.payload.setupDraft).toEqual({blueprintKey:'hybrid-standard'});
    expect(validatePortableConfig({...result.envelope,exportedAt:'2099-01-01T00:00:00Z'})).toBe(false);
  });

  it('rejects tampered or future portable configs', () => {
    const legacy=createPortableConfig({schemaVersion:1,exportedAt:'2026-08-14T00:00:00Z',guildId:'source',payload:{setupDraft:{}}});
    expect(()=>migratePortableConfig({...legacy,payload:{setupDraft:{themeKey:'tampered'}}})).toThrow('PORTABLE_CONFIG_CHECKSUM_INVALID');
    expect(()=>migratePortableConfig(createPortableConfig({schemaVersion:99,exportedAt:legacy.exportedAt,guildId:'source',payload:{}}))).toThrow('PORTABLE_CONFIG_SCHEMA_TOO_NEW');
  });

  it('keeps rollout choice stable and privacy-conscious', () => {
    const rules:FeatureRollout[]=[
      {rolloutId:'global',featureKey:'x',scope:'GLOBAL',state:'ON',rolloutPercent:100,config:{},revision:1},
      {rolloutId:'guild',featureKey:'x',scope:'GUILD',guildId:'g',state:'CANARY',rolloutPercent:40,config:{},revision:7},
    ];
    const context={guildId:'g',userId:'u',roleIds:['r2','r1'],environment:'production'};
    const first=evaluateFeatureRollouts('x',rules,context); const second=evaluateFeatureRollouts('x',rules,context);
    expect(first).toEqual(second); expect(stableRolloutBucket('x','u')).toBe(first.bucket);
    expect(rolloutIdentityHash(context)).toHaveLength(64); expect(rolloutIdentityHash(context)).not.toContain('u');
    expect(rolloutRoleContextHash(context)).toBe(rolloutRoleContextHash({...context,roleIds:['r1','r2']}));
  });

  it('accepts only legal staff workflow state transitions', () => {
    expect(transitionApplication('SUBMITTED','UNDER_REVIEW')).toBe('UNDER_REVIEW');
    expect(()=>transitionApplication('ACCEPTED','UNDER_REVIEW')).toThrow();
    expect(transitionReport('OPEN','TRIAGED')).toBe('TRIAGED');
    expect(()=>transitionReport('CLOSED','INVESTIGATING')).toThrow();
    expect(transitionSuggestion('ACCEPTED','IMPLEMENTED')).toBe('IMPLEMENTED');
  });

  it('never treats cancelled or running tasks as due', () => {
    const base={taskId:'t',guildId:'g',runAt:new Date(0),dedupKey:'d'};
    expect(isTaskDue({...base,state:'SCHEDULED'},new Date())).toBe(true);
    expect(isTaskDue({...base,state:'RUNNING'},new Date())).toBe(false);
    expect(isTaskDue({...base,state:'CANCELLED'},new Date())).toBe(false);
  });

  it('rejects webhook replay/tamper and redacts health evidence', () => {
    const guard=new ReplayGuard(); expect(guard.accept('delivery')).toBe(true); expect(guard.accept('delivery')).toBe(false);
    const secret='this-is-a-long-test-webhook-secret'; const body='{"ok":true}'; const signature=createHmac('sha256',secret).update(body).digest('hex');
    const verifier=new HmacWebhookVerifier(secret); expect(verifier.verify(body,`sha256=${signature}`)).toBe(true); expect(verifier.verify(`${body}!`,`sha256=${signature}`)).toBe(false);
    expect(sanitizeIntegrationHealthDetail('token=do-not-leak-me')).not.toContain('do-not-leak-me');
  });
});
