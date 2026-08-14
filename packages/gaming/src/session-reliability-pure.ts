export type SessionAdmission = 'JOINED' | 'WAITLISTED' | 'REJECTED';
export type SessionCheckInState = 'PENDING' | 'CHECKED_IN' | 'NO_SHOW' | 'EXCUSED';
export type SessionCheckInEvent = 'CHECK_IN' | 'MARK_NO_SHOW' | 'EXCUSE' | 'RESET';

export interface SessionAdmissionInput {
  joinedCount: number;
  capacity: number;
  waitlistedCount: number;
  waitlistCapacity: number;
}

function boundedInt(value: number, min: number, max: number, code: string): number {
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(code);
  return value;
}

export function decideSessionAdmission(input: SessionAdmissionInput): SessionAdmission {
  const capacity = boundedInt(input.capacity, 2, 100, 'GAMING_SESSION_CAPACITY_INVALID');
  const joined = boundedInt(input.joinedCount, 0, 100, 'GAMING_SESSION_JOINED_COUNT_INVALID');
  if (joined > capacity) throw new Error('GAMING_SESSION_JOINED_COUNT_INVALID');
  const waitlistCapacity = boundedInt(input.waitlistCapacity, 0, 100, 'GAMING_SESSION_WAITLIST_CAPACITY_INVALID');
  const waitlisted = boundedInt(input.waitlistedCount, 0, 100, 'GAMING_SESSION_WAITLIST_COUNT_INVALID');
  if (joined < capacity) return 'JOINED';
  if (waitlisted < waitlistCapacity) return 'WAITLISTED';
  return 'REJECTED';
}

export function promoteSessionWaitlist(waitlistedUserIds: readonly string[], availableSlots: number): string[] {
  const slots = boundedInt(availableSlots, 0, 100, 'GAMING_SESSION_PROMOTION_SLOT_INVALID');
  if (waitlistedUserIds.length > 100) throw new Error('GAMING_SESSION_WAITLIST_LIMIT');
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of waitlistedUserIds) {
    const userId = raw.trim();
    if (!userId || userId.length > 80) throw new Error('GAMING_SESSION_WAITLIST_USER_INVALID');
    if (!seen.has(userId)) { seen.add(userId); unique.push(userId); }
  }
  return unique.slice(0, slots);
}

export function transitionSessionCheckIn(state: SessionCheckInState, event: SessionCheckInEvent): SessionCheckInState {
  const transitions: Record<SessionCheckInState, Partial<Record<SessionCheckInEvent, SessionCheckInState>>> = {
    PENDING: { CHECK_IN: 'CHECKED_IN', MARK_NO_SHOW: 'NO_SHOW', EXCUSE: 'EXCUSED', RESET: 'PENDING' },
    CHECKED_IN: { EXCUSE: 'EXCUSED', RESET: 'PENDING' },
    NO_SHOW: { EXCUSE: 'EXCUSED', RESET: 'PENDING' },
    EXCUSED: { RESET: 'PENDING' },
  };
  const next = transitions[state]?.[event];
  if (!next) throw new Error(`GAMING_SESSION_CHECKIN_TRANSITION_INVALID:${state}:${event}`);
  return next;
}

export function isSessionCheckInOpen(
  startsAt: Date,
  now = new Date(),
  opensBeforeMinutes = 30,
  closesAfterMinutes = 15,
): boolean {
  if (!(startsAt instanceof Date) || !Number.isFinite(startsAt.getTime())) throw new Error('GAMING_SESSION_START_INVALID');
  const before = boundedInt(opensBeforeMinutes, 0, 240, 'GAMING_SESSION_CHECKIN_OPEN_INVALID');
  const after = boundedInt(closesAfterMinutes, 0, 240, 'GAMING_SESSION_CHECKIN_CLOSE_INVALID');
  const timestamp = now.getTime();
  return timestamp >= startsAt.getTime() - before * 60_000 && timestamp <= startsAt.getTime() + after * 60_000;
}

export interface AvailabilityCandidate {
  weekday: number;
  startMinute: number;
  endMinute: number;
  participantIds: readonly string[];
}

export interface RankedAvailabilityCandidate extends AvailabilityCandidate {
  participantCount: number;
  durationMinutes: number;
  score: number;
}

export function rankGamingAvailabilityCandidates(input: readonly AvailabilityCandidate[], limit = 10): RankedAvailabilityCandidate[] {
  const safeLimit = boundedInt(limit, 1, 50, 'GAMING_AVAILABILITY_RANK_LIMIT_INVALID');
  if (input.length > 100) throw new Error('GAMING_AVAILABILITY_CANDIDATE_LIMIT');
  return input.map((candidate) => {
    if (!Number.isInteger(candidate.weekday) || candidate.weekday < 0 || candidate.weekday > 6) throw new Error('GAMING_AVAILABILITY_WEEKDAY_INVALID');
    if (!Number.isInteger(candidate.startMinute) || !Number.isInteger(candidate.endMinute) || candidate.startMinute < 0 || candidate.endMinute > 1440 || candidate.endMinute <= candidate.startMinute) throw new Error('GAMING_AVAILABILITY_TIME_INVALID');
    const participantIds = [...new Set(candidate.participantIds.map((id) => id.trim()).filter(Boolean))].sort();
    if (participantIds.length > 100) throw new Error('GAMING_AVAILABILITY_PARTICIPANT_LIMIT');
    const durationMinutes = candidate.endMinute - candidate.startMinute;
    const participantCount = participantIds.length;
    const score = participantCount * 10_000 + Math.min(durationMinutes, 720) * 10 - candidate.startMinute;
    return { weekday: candidate.weekday, startMinute: candidate.startMinute, endMinute: candidate.endMinute, participantIds, participantCount, durationMinutes, score };
  }).sort((a, b) => b.score - a.score || a.weekday - b.weekday || a.startMinute - b.startMinute).slice(0, safeLimit);
}
