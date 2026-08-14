import { describe, expect, it } from 'vitest';
import { decodeAuditCursor, encodeAuditCursor, redactAuditValue } from '@autoserver/audit-log';
import { buildReleaseTruth } from '@autoserver/release-truth';
import { validateIntegrationSecretRef, validateWebhookDeliveryId, validateWebhookTimestamp, webhookDigest } from '@autoserver/integrations';
import { localizationCoverage } from '@autoserver/localization';

describe('phase 7 audit, webhook, release and locale contracts',()=>{
  it('redacts nested audit secrets without discarding safe evidence',()=>{
    const value=redactAuditValue({safe:'ok',token:'secret-value',nested:{password:'hidden',value:'kept'}}) as any;
    expect(value.safe).toBe('ok');expect(value.token).toBe('[redacted]');expect(value.nested.password).toBe('[redacted]');expect(value.nested.value).toBe('kept');
  });
  it('round-trips opaque audit cursors and rejects malformed cursors',()=>{
    const cursor=encodeAuditCursor({createdAt:'2026-08-14T00:00:00.000Z',auditId:'11111111-1111-4111-8111-111111111111'});
    expect(decodeAuditCursor(cursor)?.auditId).toBe('11111111-1111-4111-8111-111111111111');
    expect(()=>decodeAuditCursor('not-a-cursor')).toThrow('AUDIT_CURSOR_INVALID');
  });
  it('binds webhook secret references to registered integration keys',()=>{
    expect(validateIntegrationSecretRef('game-news','env:INTEGRATION_GAME_NEWS_WEBHOOK_SECRET')).toContain('GAME_NEWS');
    expect(()=>validateIntegrationSecretRef('game-news','env:OTHER_SECRET')).toThrow();
  });
  it('rejects stale webhook timestamps and unsafe delivery IDs',()=>{
    expect(()=>validateWebhookTimestamp('1000',300,2_000_000_000_000)).toThrow('WEBHOOK_TIMESTAMP_STALE');
    expect(()=>validateWebhookDeliveryId('bad\nvalue')).toThrow('WEBHOOK_DELIVERY_ID_INVALID');
    expect(webhookDigest('same')).toBe(webhookDigest('same'));
  });
  it('reports localization parity and release blockers truthfully',()=>{
    expect(localizationCoverage().complete).toBe(true);
    const report=buildReleaseTruth(process.cwd());expect(report.ready).toBe(false);expect(report.findings.some((finding)=>finding.includes('lockfile.missing'))).toBe(true);
  });
});
