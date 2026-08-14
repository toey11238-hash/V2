export type GamingSessionStatus = 'OPEN' | 'READY' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type GamingSessionEvent = 'MARK_READY' | 'START' | 'COMPLETE' | 'CANCEL';

export interface GamingAvailabilityWindow {
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface CommonAvailabilityWindow extends GamingAvailabilityWindow {
  participantIds: string[];
}

export interface GamingSessionConfig {
  gameKey: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  capacity: number;
  region?: string;
  platform?: string;
  mode?: string;
}

function validMinute(value: number): boolean { return Number.isInteger(value) && value >= 0 && value <= 1440; }

export function validateGamingAvailabilityWindows(input: readonly GamingAvailabilityWindow[]): GamingAvailabilityWindow[] {
  if (!Array.isArray(input) || input.length > 14) throw new Error('GAMING_AVAILABILITY_WINDOW_LIMIT');
  const normalized = input.map((window) => {
    if (!Number.isInteger(window.weekday) || window.weekday < 0 || window.weekday > 6) throw new Error('GAMING_AVAILABILITY_WEEKDAY_INVALID');
    if (!validMinute(window.startMinute) || !validMinute(window.endMinute) || window.startMinute >= window.endMinute) throw new Error('GAMING_AVAILABILITY_TIME_INVALID');
    if (window.endMinute - window.startMinute < 15) throw new Error('GAMING_AVAILABILITY_TOO_SHORT');
    return { weekday: window.weekday, startMinute: window.startMinute, endMinute: window.endMinute };
  }).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute || a.endMinute - b.endMinute);
  for (let i = 1; i < normalized.length; i += 1) {
    const previous = normalized[i - 1]!;
    const current = normalized[i]!;
    if (previous.weekday === current.weekday && current.startMinute < previous.endMinute) throw new Error('GAMING_AVAILABILITY_OVERLAP');
  }
  return normalized;
}

export function commonGamingAvailability(
  byUser: Readonly<Record<string, readonly GamingAvailabilityWindow[]>>,
  minimumParticipants = 2,
  minimumDurationMinutes = 30,
): CommonAvailabilityWindow[] {
  const users = Object.keys(byUser).sort();
  if (!Number.isInteger(minimumParticipants) || minimumParticipants < 2 || minimumParticipants > 100) throw new Error('GAMING_AVAILABILITY_PARTICIPANT_LIMIT_INVALID');
  if (!Number.isInteger(minimumDurationMinutes) || minimumDurationMinutes < 15 || minimumDurationMinutes > 720) throw new Error('GAMING_AVAILABILITY_DURATION_INVALID');
  if (users.length > 100) throw new Error('GAMING_AVAILABILITY_USER_LIMIT');
  const eventsByDay = new Map<number, Array<{ minute: number; delta: 1 | -1; userId: string }>>();
  for (const userId of users) {
    if (!/^\d{5,30}$/.test(userId) && !/^[A-Za-z0-9_.:-]{1,80}$/.test(userId)) throw new Error('GAMING_AVAILABILITY_USER_INVALID');
    const windows = validateGamingAvailabilityWindows(byUser[userId] ?? []);
    for (const window of windows) {
      const events = eventsByDay.get(window.weekday) ?? [];
      events.push({ minute: window.startMinute, delta: 1, userId }, { minute: window.endMinute, delta: -1, userId });
      eventsByDay.set(window.weekday, events);
    }
  }
  const result: CommonAvailabilityWindow[] = [];
  for (let weekday = 0; weekday <= 6; weekday += 1) {
    const events = (eventsByDay.get(weekday) ?? []).sort((a, b) => a.minute - b.minute || a.delta - b.delta || a.userId.localeCompare(b.userId));
    const active = new Set<string>();
    let previousMinute: number | null = null;
    for (let index = 0; index < events.length;) {
      const minute = events[index]!.minute;
      if (previousMinute !== null && minute > previousMinute && active.size >= minimumParticipants && minute - previousMinute >= minimumDurationMinutes) {
        result.push({ weekday, startMinute: previousMinute, endMinute: minute, participantIds: [...active].sort() });
      }
      while (index < events.length && events[index]!.minute === minute && events[index]!.delta === -1) { active.delete(events[index]!.userId); index += 1; }
      while (index < events.length && events[index]!.minute === minute && events[index]!.delta === 1) { active.add(events[index]!.userId); index += 1; }
      previousMinute = minute;
    }
  }
  return result.slice(0, 50);
}

export function validateGamingSessionConfig(config: GamingSessionConfig, now = new Date()): GamingSessionConfig {
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(config.gameKey)) throw new Error('GAMING_SESSION_GAME_INVALID');
  const title = config.title.trim();
  if (title.length < 3 || title.length > 100) throw new Error('GAMING_SESSION_TITLE_INVALID');
  if (!(config.startsAt instanceof Date) || !Number.isFinite(config.startsAt.getTime()) || config.startsAt.getTime() <= now.getTime()) throw new Error('GAMING_SESSION_START_INVALID');
  if (!Number.isInteger(config.durationMinutes) || config.durationMinutes < 15 || config.durationMinutes > 720) throw new Error('GAMING_SESSION_DURATION_INVALID');
  if (!Number.isInteger(config.capacity) || config.capacity < 2 || config.capacity > 100) throw new Error('GAMING_SESSION_CAPACITY_INVALID');
  for (const value of [config.region, config.platform, config.mode]) if (value !== undefined && (value.trim().length < 1 || value.trim().length > 80)) throw new Error('GAMING_SESSION_METADATA_INVALID');
  return { ...config, gameKey: config.gameKey.toLowerCase(), title, region: config.region?.trim(), platform: config.platform?.trim(), mode: config.mode?.trim() };
}

export function transitionGamingSession(status: GamingSessionStatus, event: GamingSessionEvent): GamingSessionStatus {
  const transitions: Record<GamingSessionStatus, Partial<Record<GamingSessionEvent, GamingSessionStatus>>> = {
    OPEN: { MARK_READY: 'READY', CANCEL: 'CANCELLED' },
    READY: { START: 'ACTIVE', CANCEL: 'CANCELLED' },
    ACTIVE: { COMPLETE: 'COMPLETED', CANCEL: 'CANCELLED' },
    COMPLETED: {},
    CANCELLED: {},
  };
  const next = transitions[status][event];
  if (!next) throw new Error(`GAMING_SESSION_TRANSITION_INVALID:${status}:${event}`);
  return next;
}
