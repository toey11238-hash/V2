import { describe, expect, it } from 'vitest';
import { computeReminderInstants, localDateKey, localWeekday, nextLocalTime, nextLocalWeekdayTime } from '@autoserver/scheduler';
import { evaluateNotification, isQuietHour, nextAllowedNotificationTime, wantsNotification } from '@autoserver/notifications';
import { temporaryRoleWarningLeadMs } from '@autoserver/moderation';

describe('notification policy', () => {
  const preferences = { userId:'u1', topics:{ EVENTS:true, ANNOUNCEMENTS:false }, quietHours:{ startHour:22,endHour:8,timezone:'Asia/Bangkok' } } as const;

  it('respects opt-in and overnight quiet hours', () => {
    expect(wantsNotification(preferences,'EVENTS')).toBe(true);
    expect(wantsNotification(preferences,'ANNOUNCEMENTS')).toBe(false);
    expect(isQuietHour(preferences,23)).toBe(true);
    expect(isQuietHour(preferences,7)).toBe(true);
    expect(isQuietHour(preferences,12)).toBe(false);
  });

  it('skips opted-out topics before delivery', () => {
    expect(evaluateNotification(preferences,'ANNOUNCEMENTS',new Date('2026-08-14T05:00:00Z'))).toEqual({state:'SKIP',reason:'OPTED_OUT'});
  });

  it('defers inside quiet hours and eventually produces a later instant', () => {
    const now = new Date('2026-08-14T17:00:00Z'); // midnight Bangkok
    const next = nextAllowedNotificationTime(preferences,now);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(now.getTime());
    expect(evaluateNotification(preferences,'EVENTS',now).state).toBe('DEFER');
  });
});

describe('scheduler local-time helpers', () => {
  it('deduplicates reminder offsets', () => {
    const at = new Date('2026-08-20T12:00:00Z');
    expect(computeReminderInstants(at,[60,10,60])).toHaveLength(2);
  });

  it('resolves local calendar and weekday schedules', () => {
    const after = new Date('2026-08-14T00:00:00Z');
    const daily = nextLocalTime('Asia/Bangkok',4,0,after);
    expect(localDateKey('Asia/Bangkok',daily)).toMatch(/^2026-08-/);
    const sunday = nextLocalWeekdayTime('Asia/Bangkok',0,4,0,after);
    expect(localWeekday('Asia/Bangkok',sunday)).toBe(0);
  });
});

describe('temporary role reminder policy', () => {
  it('uses bounded warning lead times', () => {
    expect(temporaryRoleWarningLeadMs(2 * 86_400_000)).toBe(3_600_000);
    expect(temporaryRoleWarningLeadMs(2 * 3_600_000)).toBe(1_800_000);
    expect(temporaryRoleWarningLeadMs(30 * 60_000)).toBe(300_000);
    expect(temporaryRoleWarningLeadMs(5 * 60_000)).toBeNull();
  });
});
