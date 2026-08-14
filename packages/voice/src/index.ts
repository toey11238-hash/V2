export type TemporaryVoiceState = 'ACTIVE' | 'EMPTY_GRACE' | 'DELETING' | 'DELETED' | 'FAILED';
export interface TemporaryVoiceRoom { channelId: string; ownerId: string; state: TemporaryVoiceState; memberCount: number; emptySince?: Date; }
export function updateTemporaryVoiceOccupancy(room: TemporaryVoiceRoom, memberCount: number, now = new Date()): TemporaryVoiceRoom {
  if (memberCount < 0) throw new Error('INVALID_MEMBER_COUNT');
  if (memberCount === 0 && room.state === 'ACTIVE') return { ...room, memberCount, state: 'EMPTY_GRACE', emptySince: now };
  if (memberCount > 0 && room.state === 'EMPTY_GRACE') return { ...room, memberCount, state: 'ACTIVE', emptySince: undefined };
  return { ...room, memberCount };
}
export function shouldDeleteTemporaryVoice(room: TemporaryVoiceRoom, graceMs: number, now = new Date()): boolean {
  return room.state === 'EMPTY_GRACE' && Boolean(room.emptySince) && now.getTime() - room.emptySince!.getTime() >= graceMs;
}
