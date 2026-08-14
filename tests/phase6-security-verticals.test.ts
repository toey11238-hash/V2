import { describe, expect, it } from 'vitest';
import { transitionCreatorContent } from '@autoserver/creator';
import { CircuitBreaker } from '@autoserver/integrations';
import { evaluateFixedWindow, fixedWindowStart, InProcessMutationRateLimiter, mutationRateLimitPolicy, rateLimitSubjectHash, securityHeaders } from '@autoserver/http-security';
import { parseScheduleInstant } from '@autoserver/scheduler';

describe('phase 6 security and vertical scheduling contracts', () => {
  it('parses only bounded future schedule instants', () => {
    const now=new Date('2026-08-14T00:00:00.000Z');
    expect(parseScheduleInstant('2026-08-14T01:00:00.000Z',now).toISOString()).toBe('2026-08-14T01:00:00.000Z');
    expect(parseScheduleInstant(String(Math.floor(new Date('2026-08-14T02:00:00.000Z').getTime()/1000)),now).toISOString()).toBe('2026-08-14T02:00:00.000Z');
    expect(()=>parseScheduleInstant('2026-08-13T23:59:00.000Z',now)).toThrow('SCHEDULE_INSTANT_MUST_BE_FUTURE');
    expect(()=>parseScheduleInstant('2030-01-01T00:00:00.000Z',now,30)).toThrow('SCHEDULE_INSTANT_TOO_FAR');
  });

  it('keeps creator publication behind the approved state', () => {
    expect(transitionCreatorContent('REVIEW','APPROVED')).toBe('APPROVED');
    expect(transitionCreatorContent('APPROVED','PUBLISHED')).toBe('PUBLISHED');
    expect(()=>transitionCreatorContent('REVIEW','PUBLISHED')).toThrow('INVALID_CREATOR_CONTENT_TRANSITION');
  });

  it('hashes rate-limit subjects and rejects a fixed window after its limit', () => {
    const hash=rateLimitSubjectHash({actorId:'user-123',guildId:'guild-456',ip:'198.51.100.10',routeClass:'repair'});
    expect(hash).toHaveLength(64);
    expect(hash).not.toContain('user-123');
    const policy=mutationRateLimitPolicy('/api/guilds/g/repair/execute');
    expect(policy.limit).toBe(30);
    const windowStart=fixedWindowStart(60_000,120_000);
    expect(evaluateFixedWindow({count:30,limit:30,windowStart,windowMs:60_000,nowMs:150_000}).allowed).toBe(false);
  });

  it('enforces in-process fallback mutation limits deterministically', () => {
    const limiter=new InProcessMutationRateLimiter();
    const policy={limit:2,windowMs:60_000,routeClass:'test'};
    expect(limiter.consume('subject',policy,100_000).allowed).toBe(true);
    expect(limiter.consume('subject',policy,100_001).allowed).toBe(true);
    expect(limiter.consume('subject',policy,100_002).allowed).toBe(false);
    expect(limiter.consume('subject',policy,160_001).allowed).toBe(true);
  });

  it('ships restrictive browser capability headers without claiming CSP isolation', () => {
    const headers=securityHeaders('https://dashboard.example');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['permissions-policy']).toContain('payment=()');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  });

  it('opens and recovers an integration circuit on deterministic failure thresholds', () => {
    const circuit=new CircuitBreaker(2,5_000);
    expect(circuit.canAttempt(1_000)).toBe(true);
    circuit.failure(1_000);
    expect(circuit.snapshot(1_001).state).toBe('CLOSED');
    circuit.failure(1_100);
    expect(circuit.snapshot(1_101).state).toBe('OPEN');
    expect(circuit.canAttempt(2_000)).toBe(false);
    expect(circuit.canAttempt(6_101)).toBe(true);
    expect(circuit.snapshot(6_101).state).toBe('HALF_OPEN');
    expect(circuit.canAttempt(6_102)).toBe(false);
    circuit.success();
    expect(circuit.snapshot(6_103)).toMatchObject({state:'CLOSED',failures:0});
  });
});
