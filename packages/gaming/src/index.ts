import { assertNonWageringCompetition } from '@autoserver/security';
import { decideSessionAdmission, isSessionCheckInOpen, promoteSessionWaitlist, rankGamingAvailabilityCandidates, transitionSessionCheckIn, type SessionCheckInEvent } from './session-reliability-pure.ts';

export type LfgStatus = 'OPEN' | 'FILLING' | 'FULL' | 'PLAYING' | 'FINISHED' | 'CANCELLED' | 'EXPIRED';

export interface LfgConfig {
  gameKey: string;
  partySize: number;
  region?: string;
  platform?: string;
  mode?: string;
  rankLabel?: string;
  expiresAt: Date;
}

export function validateLfgConfig(config: LfgConfig, now = new Date()): LfgConfig {
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(config.gameKey)) throw new Error('INVALID_GAME_KEY');
  if (!Number.isInteger(config.partySize) || config.partySize < 2 || config.partySize > 100) throw new Error('INVALID_PARTY_SIZE');
  if (!(config.expiresAt instanceof Date) || !Number.isFinite(config.expiresAt.getTime()) || config.expiresAt.getTime() <= now.getTime()) throw new Error('INVALID_EXPIRY');
  for (const [key, value] of Object.entries({ region: config.region, platform: config.platform, mode: config.mode, rankLabel: config.rankLabel })) {
    if (value !== undefined && value.trim().length > 80) throw new Error(`INVALID_LFG_${key.toUpperCase()}`);
  }
  return { ...config, gameKey: config.gameKey.toLowerCase() };
}

export interface LfgState {
  ownerUserId: string;
  partySize: number;
  memberIds: string[];
  status: LfgStatus;
}

export type LfgEvent =
  | { type: 'JOIN'; userId: string }
  | { type: 'LEAVE'; userId: string }
  | { type: 'START' }
  | { type: 'FINISH' }
  | { type: 'CANCEL' }
  | { type: 'EXPIRE' };

export function reduceLfg(state: LfgState, event: LfgEvent): LfgState {
  const terminal: LfgStatus[] = ['FINISHED', 'CANCELLED', 'EXPIRED'];
  if (terminal.includes(state.status)) throw new Error(`LFG is terminal: ${state.status}`);

  if (event.type === 'JOIN') {
    if (state.status === 'PLAYING') throw new Error('Cannot join an LFG after play has started');
    if (state.memberIds.includes(event.userId)) return state;
    if (state.memberIds.length >= state.partySize) throw new Error('LFG party is already full');
    const memberIds = [...state.memberIds, event.userId];
    return { ...state, memberIds, status: memberIds.length >= state.partySize ? 'FULL' : 'FILLING' };
  }

  if (event.type === 'LEAVE') {
    if (event.userId === state.ownerUserId) throw new Error('Owner cannot leave; transfer ownership or cancel the LFG');
    if (state.status === 'PLAYING') throw new Error('Cannot leave through LFG workflow after play has started');
    const memberIds = state.memberIds.filter((id) => id !== event.userId);
    return { ...state, memberIds, status: memberIds.length <= 1 ? 'OPEN' : memberIds.length >= state.partySize ? 'FULL' : 'FILLING' };
  }

  if (event.type === 'START') {
    if (state.memberIds.length < 2) throw new Error('At least two players are required to start');
    return { ...state, status: 'PLAYING' };
  }
  if (event.type === 'FINISH') {
    if (state.status !== 'PLAYING') throw new Error('Only a playing LFG can be finished');
    return { ...state, status: 'FINISHED' };
  }
  if (event.type === 'CANCEL') return { ...state, status: 'CANCELLED' };
  return { ...state, status: 'EXPIRED' };
}

export type TournamentStatus = 'DRAFT' | 'REGISTRATION' | 'CHECK_IN' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
export type TournamentEvent = 'OPEN_REGISTRATION' | 'START_CHECK_IN' | 'START' | 'COMPLETE' | 'CANCEL' | 'ARCHIVE';

const tournamentTransitions: Record<TournamentStatus, Partial<Record<TournamentEvent, TournamentStatus>>> = {
  DRAFT: { OPEN_REGISTRATION: 'REGISTRATION', CANCEL: 'CANCELLED' },
  REGISTRATION: { START_CHECK_IN: 'CHECK_IN', CANCEL: 'CANCELLED' },
  CHECK_IN: { START: 'ACTIVE', CANCEL: 'CANCELLED' },
  ACTIVE: { COMPLETE: 'COMPLETED', CANCEL: 'CANCELLED' },
  COMPLETED: { ARCHIVE: 'ARCHIVED' },
  CANCELLED: { ARCHIVE: 'ARCHIVED' },
  ARCHIVED: {},
};

export interface TournamentConfig {
  name: string;
  format: 'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION' | 'ROUND_ROBIN' | 'GROUP_STAGE' | 'CUSTOM';
  teamSize: number;
  maxEntries?: number;
  wageringEnabled?: boolean;
  entryStakeRequired?: boolean;
}

export function validateTournamentConfig(config: TournamentConfig): TournamentConfig {
  assertNonWageringCompetition(config);
  if (config.teamSize < 1 || !Number.isInteger(config.teamSize)) throw new Error('teamSize must be a positive integer');
  if (config.maxEntries !== undefined && (config.maxEntries < 2 || !Number.isInteger(config.maxEntries))) throw new Error('maxEntries must be an integer >= 2');
  return config;
}

export function transitionTournament(status: TournamentStatus, event: TournamentEvent): TournamentStatus {
  const next = tournamentTransitions[status][event];
  if (!next) throw new Error(`Invalid tournament transition ${status} -> ${event}`);
  return next;
}

export interface QuestDefinition {
  questKey: string;
  target: number;
  eventType: string;
  cadence: 'ONCE' | 'DAILY' | 'WEEKLY' | 'EVENT' | 'SEASONAL';
}

export interface QuestProgress {
  progress: number;
  completed: boolean;
}

export function applyQuestEvent(definition: QuestDefinition, state: QuestProgress, eventType: string, increment = 1): QuestProgress {
  if (state.completed || eventType !== definition.eventType) return state;
  if (definition.target <= 0) throw new Error('Quest target must be positive');
  const progress = Math.min(definition.target, state.progress + Math.max(0, increment));
  return { progress, completed: progress >= definition.target };
}

export type TeamMemberRole = 'CAPTAIN' | 'CO_CAPTAIN' | 'MEMBER' | 'SUBSTITUTE' | 'COACH';

export interface TeamRosterMember {
  userId: string;
  role: TeamMemberRole;
}

export function validateTeamRoster(members: TeamRosterMember[]): void {
  const unique = new Set(members.map((member) => member.userId));
  if (unique.size !== members.length) throw new Error('Team roster contains duplicate users');
  if (members.filter((member) => member.role === 'CAPTAIN').length !== 1) throw new Error('Team roster requires exactly one captain');
}

export interface GameAdapterCapabilities {
  identity: boolean;
  stats: boolean;
  rank: boolean;
  matches: boolean;
  status: boolean;
  news: boolean;
  events: boolean;
  assets: boolean;
}

export interface GameAdapterDescriptor {
  key: string;
  displayName: string;
  platforms: string[];
  regions: string[];
  capabilities: GameAdapterCapabilities;
}

export class GameRegistry {
  private adapters = new Map<string, GameAdapterDescriptor>();

  register(adapter: GameAdapterDescriptor): void {
    if (this.adapters.has(adapter.key)) throw new Error(`Game adapter already registered: ${adapter.key}`);
    this.adapters.set(adapter.key, adapter);
  }

  get(key: string): GameAdapterDescriptor | undefined {
    return this.adapters.get(key);
  }

  list(): GameAdapterDescriptor[] {
    return [...this.adapters.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
}

export type PartyStatus = 'FORMING' | 'READY' | 'PLAYING' | 'FINISHED' | 'DISBANDED';
export interface PartyState { ownerUserId: string; maxMembers: number; memberIds: string[]; status: PartyStatus; voiceChannelId?: string; }
export type PartyEvent = { type: 'JOIN'; userId: string } | { type: 'LEAVE'; userId: string } | { type: 'TRANSFER_OWNER'; userId: string } | { type: 'READY' } | { type: 'START' } | { type: 'FINISH' } | { type: 'DISBAND' };

export function reduceParty(state: PartyState, event: PartyEvent): PartyState {
  if (['FINISHED','DISBANDED'].includes(state.status)) throw new Error(`Party is terminal: ${state.status}`);
  if (event.type === 'JOIN') {
    if (state.status === 'PLAYING') throw new Error('Cannot join after party play started');
    if (state.memberIds.includes(event.userId)) return state;
    if (state.memberIds.length >= state.maxMembers) throw new Error('Party is full');
    return { ...state, memberIds: [...state.memberIds, event.userId], status: 'FORMING' };
  }
  if (event.type === 'LEAVE') {
    if (event.userId === state.ownerUserId) throw new Error('Owner must transfer ownership or disband');
    return { ...state, memberIds: state.memberIds.filter((id) => id !== event.userId), status: 'FORMING' };
  }
  if (event.type === 'TRANSFER_OWNER') {
    if (!state.memberIds.includes(event.userId)) throw new Error('New party owner must be a member');
    return { ...state, ownerUserId: event.userId };
  }
  if (event.type === 'READY') {
    if (state.memberIds.length < 2) throw new Error('Party requires at least two members');
    return { ...state, status: 'READY' };
  }
  if (event.type === 'START') {
    if (state.status !== 'READY') throw new Error('Party must be ready before starting');
    return { ...state, status: 'PLAYING' };
  }
  if (event.type === 'FINISH') {
    if (state.status !== 'PLAYING') throw new Error('Only a playing party can finish');
    return { ...state, status: 'FINISHED' };
  }
  return { ...state, status: 'DISBANDED' };
}

export type ClanMemberRole = 'LEADER' | 'OFFICER' | 'MEMBER' | 'RECRUIT';
export interface ClanMember { userId: string; role: ClanMemberRole; }
export function validateClanRoster(members: readonly ClanMember[]): void {
  if (new Set(members.map((member) => member.userId)).size !== members.length) throw new Error('Clan roster contains duplicate users');
  if (members.filter((member) => member.role === 'LEADER').length !== 1) throw new Error('Clan roster requires exactly one leader');
}

export interface ScrimConfig {
  gameKey: string;
  teamAId: string;
  teamBId?: string;
  startsAt: Date;
  bestOf: number;
  region?: string;
  wageringEnabled?: boolean;
  entryStakeRequired?: boolean;
}
export function validateScrim(config: ScrimConfig, now = new Date()): ScrimConfig {
  assertNonWageringCompetition(config);
  if (config.teamAId === config.teamBId) throw new Error('Scrim teams must be different');
  if (!Number.isInteger(config.bestOf) || config.bestOf < 1 || config.bestOf % 2 === 0) throw new Error('bestOf must be a positive odd integer');
  if (config.startsAt.getTime() <= now.getTime()) throw new Error('Scrim start time must be in the future');
  return config;
}

export type MatchStatus = 'SCHEDULED' | 'READY' | 'ACTIVE' | 'RESULT_SUBMITTED' | 'UNDER_REVIEW' | 'COMPLETED' | 'CANCELLED';
export type MatchEvent = 'MARK_READY' | 'START' | 'SUBMIT_RESULT' | 'DISPUTE' | 'APPROVE_RESULT' | 'CANCEL';
const matchTransitions: Record<MatchStatus, Partial<Record<MatchEvent, MatchStatus>>> = {
  SCHEDULED: { MARK_READY: 'READY', CANCEL: 'CANCELLED' },
  READY: { START: 'ACTIVE', CANCEL: 'CANCELLED' },
  ACTIVE: { SUBMIT_RESULT: 'RESULT_SUBMITTED', CANCEL: 'CANCELLED' },
  RESULT_SUBMITTED: { DISPUTE: 'UNDER_REVIEW', APPROVE_RESULT: 'COMPLETED' },
  UNDER_REVIEW: { APPROVE_RESULT: 'COMPLETED', CANCEL: 'CANCELLED' },
  COMPLETED: {}, CANCELLED: {},
};
export function transitionMatch(status: MatchStatus, event: MatchEvent): MatchStatus {
  const next = matchTransitions[status][event];
  if (!next) throw new Error(`Invalid match transition ${status} -> ${event}`);
  return next;
}

export interface MatchScore { participantA: number; participantB: number; winner: 'A' | 'B' | 'DRAW'; evidence?: string[]; }
export function validateMatchScore(score: MatchScore): MatchScore {
  if (![score.participantA, score.participantB].every((value) => Number.isInteger(value) && value >= 0)) throw new Error('Match scores must be non-negative integers');
  const expected = score.participantA === score.participantB ? 'DRAW' : score.participantA > score.participantB ? 'A' : 'B';
  if (score.winner !== expected) throw new Error('Winner does not match submitted score');
  return score;
}

export interface PlayerGamingProfile {
  userId: string;
  gameKey: string;
  platform?: string;
  region?: string;
  preferredRoles: string[];
  rankLabel?: string;
  availability?: Record<string, unknown>;
  visibility: 'GUILD' | 'TEAM_ONLY' | 'PRIVATE';
}
export function validatePlayerGamingProfile(profile: PlayerGamingProfile): PlayerGamingProfile {
  if (!profile.userId || !profile.gameKey) throw new Error('Player profile requires userId and gameKey');
  if (profile.preferredRoles.length > 10) throw new Error('Player profile has too many preferred roles');
  return { ...profile, preferredRoles: [...new Set(profile.preferredRoles.map((role) => role.trim()).filter(Boolean))] };
}

export interface XpPolicy {
  minEventIntervalMs: number;
  maxXpPerEvent: number;
  maxXpPerHour: number;
}
export interface XpWindowState { lastAwardAt?: number; hourStartedAt: number; awardedThisHour: number; totalXp: number; }
export function awardXp(policy: XpPolicy, state: XpWindowState, requested: number, now = Date.now()): { state: XpWindowState; awarded: number; reason: 'AWARDED' | 'COOLDOWN' | 'HOURLY_CAP' } {
  if (requested <= 0 || !Number.isFinite(requested)) return { state, awarded: 0, reason: 'COOLDOWN' };
  if (state.lastAwardAt !== undefined && now - state.lastAwardAt < policy.minEventIntervalMs) return { state, awarded: 0, reason: 'COOLDOWN' };
  const hourReset = now - state.hourStartedAt >= 3_600_000;
  const base = hourReset ? { ...state, hourStartedAt: now, awardedThisHour: 0 } : state;
  const remaining = Math.max(0, policy.maxXpPerHour - base.awardedThisHour);
  if (remaining === 0) return { state: base, awarded: 0, reason: 'HOURLY_CAP' };
  const awarded = Math.min(Math.floor(requested), policy.maxXpPerEvent, remaining);
  return { state: { ...base, lastAwardAt: now, awardedThisHour: base.awardedThisHour + awarded, totalXp: base.totalXp + awarded }, awarded, reason: 'AWARDED' };
}

export interface AchievementDefinition { key: string; metric: string; threshold: number; }
export function qualifiesForAchievement(definition: AchievementDefinition, metricValue: number, alreadyAwarded: boolean): boolean {
  return !alreadyAwarded && definition.threshold > 0 && metricValue >= definition.threshold;
}

export interface SeasonDefinition { seasonKey: string; startsAt: Date; endsAt: Date; maxLevel: number; xpPerLevel: number; }
export function seasonLevel(definition: SeasonDefinition, xp: number, now = new Date()): { active: boolean; level: number; progressIntoLevel: number } {
  if (definition.endsAt <= definition.startsAt || definition.maxLevel < 1 || definition.xpPerLevel < 1) throw new Error('Invalid season definition');
  const active = now >= definition.startsAt && now <= definition.endsAt;
  const safeXp = Math.max(0, Math.floor(xp));
  return { active, level: Math.min(definition.maxLevel, Math.floor(safeXp / definition.xpPerLevel) + 1), progressIntoLevel: safeXp % definition.xpPerLevel };
}

export interface SeededEntry { entryId: string; seed: number; }
export interface BracketPair { round: 1; slot: number; a?: SeededEntry; b?: SeededEntry; bye?: SeededEntry; }
export function seedSingleElimination(entries: readonly SeededEntry[]): BracketPair[] {
  if (entries.length < 2) throw new Error('Single elimination requires at least two entries');
  const sorted = [...entries].sort((a, b) => a.seed - b.seed);
  if (new Set(sorted.map((entry) => entry.entryId)).size !== sorted.length) throw new Error('Duplicate tournament entry');
  if (new Set(sorted.map((entry) => entry.seed)).size !== sorted.length) throw new Error('Duplicate tournament seed');
  let bracketSize = 1;
  while (bracketSize < sorted.length) bracketSize *= 2;
  const pairs: BracketPair[] = [];
  for (let slot = 0; slot < bracketSize / 2; slot++) {
    const a = sorted[slot];
    const b = sorted[bracketSize - 1 - slot];
    if (a && b) pairs.push({ round: 1, slot, a, b });
    else pairs.push({ round: 1, slot, bye: a ?? b });
  }
  return pairs;
}



export { validateRecruitmentPost } from './recruitment.js';
export type { RecruitmentPostRecord, RecruitmentPostType } from './recruitment.js';
export { commonGamingAvailability, transitionGamingSession, validateGamingAvailabilityWindows, validateGamingSessionConfig } from './session-pure.ts';
export type { CommonAvailabilityWindow, GamingAvailabilityWindow, GamingSessionConfig, GamingSessionEvent, GamingSessionStatus } from './session-pure.ts';
import { validateRecruitmentPost, type RecruitmentPostRecord, type RecruitmentPostType } from './recruitment.js';
import { commonGamingAvailability, transitionGamingSession, validateGamingAvailabilityWindows, validateGamingSessionConfig, type GamingAvailabilityWindow, type GamingSessionStatus } from './session-pure.ts';

import { randomUUID } from 'node:crypto';
import type { Database } from '@autoserver/database';
export interface GuildGameConfig {
  gameKey: string;
  displayName: string;
  config?: Record<string, unknown>;
  featureFlags?: Record<string, boolean>;
  adapterCapabilities?: Record<string, boolean>;
}

export interface LfgRecord {
  lfgId: string;
  guildId: string;
  gameKey: string;
  ownerUserId: string;
  status: LfgStatus;
  region?: string;
  platform?: string;
  mode?: string;
  rankLabel?: string;
  partySize: number;
  memberIds: string[];
  requirements: Record<string, unknown>;
  startsAt?: string;
  expiresAt: string;
}


export interface GamingSessionRecord {
  sessionId: string;
  guildId: string;
  gameKey: string;
  hostUserId: string;
  title: string;
  status: GamingSessionStatus;
  startsAt: string;
  durationMinutes: number;
  capacity: number;
  participantIds: string[];
  waitlistedUserIds: string[];
  checkedInUserIds: string[];
  waitlistCapacity: number;
  checkInOpensMinutes: number;
  checkInClosesMinutes: number;
  region?: string;
  platform?: string;
  mode?: string;
}

export class GamingRepository {
  constructor(private readonly database: Database) {}

  async enableGame(guildId: string, game: GuildGameConfig): Promise<void> {
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(game.gameKey)) throw new Error('Invalid game key');
    if (!game.displayName.trim() || game.displayName.length > 100) throw new Error('Invalid game display name');
    await this.database.requirePool().query(
      `insert into guild_games(guild_id,game_key,enabled,display_name,config,feature_flags,adapter_capabilities)
       values($1,$2,true,$3,$4,$5,$6)
       on conflict (guild_id,game_key) do update set enabled=true,display_name=excluded.display_name,config=excluded.config,
         feature_flags=excluded.feature_flags,adapter_capabilities=excluded.adapter_capabilities,updated_at=now()`,
      [guildId, game.gameKey, game.displayName.trim(), game.config ?? {}, game.featureFlags ?? {}, game.adapterCapabilities ?? {}],
    );
  }

  async reconcileEnabledGames(guildId: string, desiredGames: readonly GuildGameConfig[]): Promise<{ enabled: string[]; disabled: string[] }> {
    const desired = new Map<string, GuildGameConfig>();
    for (const game of desiredGames) {
      if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(game.gameKey)) throw new Error('Invalid game key');
      desired.set(game.gameKey.toLowerCase(), { ...game, gameKey: game.gameKey.toLowerCase() });
    }
    return this.database.transaction(async (client) => {
      const current = await client.query<{game_key:string;enabled:boolean}>(`select game_key,enabled from guild_games where guild_id=$1 for update`, [guildId]);
      const disabled: string[] = [];
      const enabled: string[] = [];
      for (const row of current.rows) {
        if (row.enabled && !desired.has(row.game_key)) {
          await client.query(`update guild_games set enabled=false,updated_at=now() where guild_id=$1 and game_key=$2`, [guildId,row.game_key]);
          disabled.push(row.game_key);
        }
      }
      for (const game of desired.values()) {
        if (!game.displayName.trim() || game.displayName.length > 100) throw new Error('Invalid game display name');
        await client.query(
          `insert into guild_games(guild_id,game_key,enabled,display_name,config,feature_flags,adapter_capabilities)
           values($1,$2,true,$3,$4,$5,$6)
           on conflict (guild_id,game_key) do update set enabled=true,display_name=excluded.display_name,config=guild_games.config || excluded.config,
             feature_flags=excluded.feature_flags,adapter_capabilities=guild_games.adapter_capabilities || excluded.adapter_capabilities,updated_at=now()`,
          [guildId,game.gameKey,game.displayName.trim(),game.config??{},game.featureFlags??{},game.adapterCapabilities??{}],
        );
        enabled.push(game.gameKey);
      }
      enabled.sort(); disabled.sort();
      return { enabled, disabled };
    });
  }

  async upsertProfile(guildId: string, profile: PlayerGamingProfile): Promise<PlayerGamingProfile> {
    const valid = validatePlayerGamingProfile(profile);
    await this.database.requirePool().query(
      `insert into player_game_profiles(guild_id,user_id,game_key,platform,region,preferred_roles,rank_label,availability,preferences)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (guild_id,user_id,game_key) do update set platform=excluded.platform,region=excluded.region,
         preferred_roles=excluded.preferred_roles,rank_label=excluded.rank_label,availability=excluded.availability,
         preferences=excluded.preferences,updated_at=now()`,
      [guildId, valid.userId, valid.gameKey, valid.platform ?? null, valid.region ?? null, valid.preferredRoles, valid.rankLabel ?? null,
       valid.availability ?? {}, { visibility: valid.visibility }],
    );
    return valid;
  }

  async getProfile(guildId: string, userId: string, gameKey: string): Promise<PlayerGamingProfile | null> {
    const { rows } = await this.database.requirePool().query<any>(
      `select * from player_game_profiles where guild_id=$1 and user_id=$2 and game_key=$3`, [guildId, userId, gameKey],
    );
    const row = rows[0];
    return row ? {
      userId: row.user_id, gameKey: row.game_key, platform: row.platform ?? undefined, region: row.region ?? undefined,
      preferredRoles: row.preferred_roles ?? [], rankLabel: row.rank_label ?? undefined, availability: row.availability ?? {},
      visibility: row.preferences?.visibility === 'PRIVATE' || row.preferences?.visibility === 'TEAM_ONLY' ? row.preferences.visibility : 'GUILD',
    } : null;
  }


  async replaceAvailabilityWindows(guildId: string, userId: string, gameKey: string, timezone: string, windows: readonly GamingAvailabilityWindow[]): Promise<GamingAvailabilityWindow[]> {
    const normalized = validateGamingAvailabilityWindows(windows);
    if (!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(gameKey)) throw new Error('GAMING_AVAILABILITY_GAME_INVALID');
    if (!timezone.trim() || timezone.length > 80) throw new Error('GAMING_AVAILABILITY_TIMEZONE_INVALID');
    try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date()); } catch { throw new Error('GAMING_AVAILABILITY_TIMEZONE_INVALID'); }
    await this.database.transaction(async (client) => {
      await client.query(`delete from gaming_availability_windows where guild_id=$1 and user_id=$2 and game_key=$3`, [guildId, userId, gameKey.toLowerCase()]);
      for (const window of normalized) await client.query(
        `insert into gaming_availability_windows(guild_id,user_id,game_key,weekday,start_minute,end_minute,timezone) values($1,$2,$3,$4,$5,$6,$7)`,
        [guildId, userId, gameKey.toLowerCase(), window.weekday, window.startMinute, window.endMinute, timezone.trim()],
      );
    });
    return normalized;
  }

  async listAvailabilityWindows(guildId: string, userId: string, gameKey: string): Promise<Array<GamingAvailabilityWindow & { timezone: string }>> {
    const { rows } = await this.database.requirePool().query<any>(
      `select weekday,start_minute,end_minute,timezone from gaming_availability_windows where guild_id=$1 and user_id=$2 and game_key=$3 order by weekday,start_minute`,
      [guildId, userId, gameKey.toLowerCase()],
    );
    return rows.map((row) => ({ weekday: Number(row.weekday), startMinute: Number(row.start_minute), endMinute: Number(row.end_minute), timezone: String(row.timezone) }));
  }

  async recommendAvailability(guildId:string, gameKey:string, timezone:string, minimumParticipants=2, minimumDurationMinutes=30, limit=10):Promise<Array<{weekday:number;startMinute:number;endMinute:number;participantCount:number;durationMinutes:number;score:number;timezone:string}>>{
    if(!/^[a-z0-9][a-z0-9_-]{1,63}$/i.test(gameKey))throw new Error('GAMING_AVAILABILITY_GAME_INVALID');
    if(!timezone.trim()||timezone.length>80)throw new Error('GAMING_AVAILABILITY_TIMEZONE_INVALID');
    try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(new Date());}catch{throw new Error('GAMING_AVAILABILITY_TIMEZONE_INVALID');}
    const {rows}=await this.database.requirePool().query<any>(`select user_id,weekday,start_minute,end_minute from gaming_availability_windows where guild_id=$1 and game_key=$2 and timezone=$3 order by user_id,weekday,start_minute`,[guildId,gameKey.toLowerCase(),timezone.trim()]);
    const byUser:Record<string,GamingAvailabilityWindow[]>={};
    for(const row of rows){const userId=String(row.user_id);(byUser[userId]??=[]).push({weekday:Number(row.weekday),startMinute:Number(row.start_minute),endMinute:Number(row.end_minute)});}
    const common=commonGamingAvailability(byUser,minimumParticipants,minimumDurationMinutes);
    return rankGamingAvailabilityCandidates(common,limit).map(({participantIds:_participantIds,...candidate})=>({...candidate,timezone:timezone.trim()}));
  }

  async createSession(input: { guildId: string; gameKey: string; hostUserId: string; title: string; startsAt: Date; durationMinutes: number; capacity: number; waitlistCapacity?: number; checkInOpensMinutes?: number; checkInClosesMinutes?: number; region?: string; platform?: string; mode?: string }): Promise<GamingSessionRecord> {
    const config = validateGamingSessionConfig(input);
    const sessionId = randomUUID();
    const { rows } = await this.database.transaction(async (client) => {
      const inserted = await client.query<any>(
        `insert into gaming_sessions(session_id,guild_id,game_key,host_user_id,title,status,starts_at,duration_minutes,capacity,waitlist_capacity,check_in_opens_minutes,check_in_closes_minutes,region,platform,mode)
         values($1,$2,$3,$4,$5,'OPEN',$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
        [sessionId,input.guildId,config.gameKey,input.hostUserId,config.title,config.startsAt,config.durationMinutes,config.capacity,Math.max(0,Math.min(100,input.waitlistCapacity??25)),Math.max(0,Math.min(240,input.checkInOpensMinutes??30)),Math.max(0,Math.min(240,input.checkInClosesMinutes??15)),config.region??null,config.platform??null,config.mode??null],
      );
      await client.query(`insert into gaming_session_participants(session_id,guild_id,user_id,participant_role,status,check_in_state) values($1,$2,$3,'HOST','JOINED','PENDING')`, [sessionId,input.guildId,input.hostUserId]);
      return inserted;
    });
    return this.mapSession(rows[0], [{ user_id: input.hostUserId, status: 'JOINED', check_in_state: 'PENDING' }]);
  }

  async getSession(guildId: string, sessionId: string): Promise<GamingSessionRecord | null> {
    const pool = this.database.requirePool();
    const row = (await pool.query<any>(`select * from gaming_sessions where guild_id=$1 and session_id=$2`, [guildId,sessionId])).rows[0];
    if (!row) return null;
    const participants = await pool.query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`, [guildId,sessionId]);
    return this.mapSession(row, participants.rows);
  }

  async listUpcomingSessions(guildId: string, gameKey?: string, limit = 20): Promise<GamingSessionRecord[]> {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const values: unknown[] = [guildId];
    let where = `guild_id=$1 and status in ('OPEN','READY') and starts_at > now()`;
    if (gameKey) { values.push(gameKey.toLowerCase()); where += ` and game_key=$${values.length}`; }
    values.push(safeLimit);
    const { rows } = await this.database.requirePool().query<any>(`select * from gaming_sessions where ${where} order by starts_at asc limit $${values.length}`, values);
    const records: GamingSessionRecord[] = [];
    for (const row of rows) {
      const participants = await this.database.requirePool().query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`, [guildId,row.session_id]);
      records.push(this.mapSession(row, participants.rows));
    }
    return records;
  }

  async joinSession(guildId: string, sessionId: string, userId: string): Promise<{ record: GamingSessionRecord; joined: boolean; waitlisted: boolean }> {
    return this.database.transaction(async (client) => {
      const row = (await client.query<any>(`select * from gaming_sessions where guild_id=$1 and session_id=$2 for update`, [guildId,sessionId])).rows[0];
      if (!row) throw new Error('GAMING_SESSION_NOT_FOUND');
      if (!['OPEN','READY'].includes(String(row.status))) throw new Error('GAMING_SESSION_NOT_JOINABLE');
      const existing = (await client.query<any>(`select status from gaming_session_participants where guild_id=$1 and session_id=$2 and user_id=$3`, [guildId,sessionId,userId])).rows[0];
      if (existing?.status === 'JOINED' || existing?.status === 'WAITLISTED') {
        const people = await client.query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`, [guildId,sessionId]);
        return { record: this.mapSession(row, people.rows), joined: false, waitlisted: existing.status === 'WAITLISTED' };
      }
      const joinedCount = Number((await client.query<any>(`select count(*)::int as count from gaming_session_participants where guild_id=$1 and session_id=$2 and status='JOINED'`, [guildId,sessionId])).rows[0]?.count ?? 0);
      const waitlistedCount = Number((await client.query<any>(`select count(*)::int as count from gaming_session_participants where guild_id=$1 and session_id=$2 and status='WAITLISTED'`, [guildId,sessionId])).rows[0]?.count ?? 0);
      const admission = decideSessionAdmission({ joinedCount, capacity:Number(row.capacity), waitlistedCount, waitlistCapacity:Number(row.waitlist_capacity ?? 25) });
      if (admission === 'REJECTED') throw new Error('GAMING_SESSION_AND_WAITLIST_FULL');
      if (admission === 'JOINED') {
        await client.query(
          `insert into gaming_session_participants(session_id,guild_id,user_id,participant_role,status,check_in_state,waitlist_position,promoted_at) values($1,$2,$3,'PLAYER','JOINED','PENDING',null,null)
           on conflict(session_id,user_id) do update set status='JOINED',check_in_state='PENDING',waitlist_position=null,left_at=null,updated_at=now()`,
          [sessionId,guildId,userId],
        );
      } else {
        const position = Number((await client.query<any>(`select coalesce(max(waitlist_position),0)::int+1 as position from gaming_session_participants where guild_id=$1 and session_id=$2 and status='WAITLISTED'`, [guildId,sessionId])).rows[0]?.position ?? 1);
        await client.query(
          `insert into gaming_session_participants(session_id,guild_id,user_id,participant_role,status,check_in_state,waitlist_position) values($1,$2,$3,'PLAYER','WAITLISTED','PENDING',$4)
           on conflict(session_id,user_id) do update set status='WAITLISTED',check_in_state='PENDING',waitlist_position=$4,left_at=null,updated_at=now()`,
          [sessionId,guildId,userId,position],
        );
      }
      const people = await client.query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`, [guildId,sessionId]);
      return { record: this.mapSession(row, people.rows), joined: admission === 'JOINED', waitlisted: admission === 'WAITLISTED' };
    });
  }

  async leaveSession(guildId: string, sessionId: string, userId: string): Promise<{ record: GamingSessionRecord; left: boolean; promotedUserIds: string[] }> {
    return this.database.transaction(async (client) => {
      const row = (await client.query<any>(`select * from gaming_sessions where guild_id=$1 and session_id=$2 for update`, [guildId,sessionId])).rows[0];
      if (!row) throw new Error('GAMING_SESSION_NOT_FOUND');
      if (String(row.host_user_id) === userId) throw new Error('GAMING_SESSION_HOST_CANNOT_LEAVE');
      if (!['OPEN','READY'].includes(String(row.status))) throw new Error('GAMING_SESSION_NOT_LEAVABLE');
      const updated = await client.query(
        `update gaming_session_participants set status='LEFT',left_at=now(),waitlist_position=null,updated_at=now() where guild_id=$1 and session_id=$2 and user_id=$3 and status in ('JOINED','WAITLISTED')`,
        [guildId,sessionId,userId],
      );
      const joinedCount = Number((await client.query<any>(`select count(*)::int as count from gaming_session_participants where guild_id=$1 and session_id=$2 and status='JOINED'`, [guildId,sessionId])).rows[0]?.count ?? 0);
      const waitlist = (await client.query<any>(`select user_id from gaming_session_participants where guild_id=$1 and session_id=$2 and status='WAITLISTED' order by waitlist_position asc,joined_at asc,user_id asc limit 100 for update`, [guildId,sessionId])).rows.map((item)=>String(item.user_id));
      const promotedUserIds = promoteSessionWaitlist(waitlist, Math.max(0, Number(row.capacity) - joinedCount));
      if (promotedUserIds.length) await client.query(
        `update gaming_session_participants set status='JOINED',waitlist_position=null,promoted_at=now(),updated_at=now() where guild_id=$1 and session_id=$2 and user_id=any($3::text[]) and status='WAITLISTED'`,
        [guildId,sessionId,promotedUserIds],
      );
      const people = await client.query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`, [guildId,sessionId]);
      return { record: this.mapSession(row, people.rows), left: (updated.rowCount ?? 0) > 0, promotedUserIds };
    });
  }

  async checkInSession(guildId: string, sessionId: string, userId: string): Promise<GamingSessionRecord> {
    return this.database.transaction(async (client) => {
      const row = (await client.query<any>(`select * from gaming_sessions where guild_id=$1 and session_id=$2 for update`, [guildId,sessionId])).rows[0];
      if (!row) throw new Error('GAMING_SESSION_NOT_FOUND');
      if (!['OPEN','READY','ACTIVE'].includes(String(row.status))) throw new Error('GAMING_SESSION_CHECKIN_NOT_ALLOWED');
      if (!isSessionCheckInOpen(new Date(row.starts_at), new Date(), Number(row.check_in_opens_minutes ?? 30), Number(row.check_in_closes_minutes ?? 15))) throw new Error('GAMING_SESSION_CHECKIN_WINDOW_CLOSED');
      const participant = (await client.query<any>(`select status,check_in_state from gaming_session_participants where guild_id=$1 and session_id=$2 and user_id=$3 for update`, [guildId,sessionId,userId])).rows[0];
      if (!participant || participant.status !== 'JOINED') throw new Error('GAMING_SESSION_CHECKIN_REQUIRES_JOIN');
      const next = participant.check_in_state === 'CHECKED_IN' ? 'CHECKED_IN' : transitionSessionCheckIn(participant.check_in_state ?? 'PENDING','CHECK_IN');
      await client.query(`update gaming_session_participants set check_in_state=$4,checked_in_at=case when $4='CHECKED_IN' then coalesce(checked_in_at,now()) else checked_in_at end,updated_at=now() where guild_id=$1 and session_id=$2 and user_id=$3`, [guildId,sessionId,userId,next]);
      const people = await client.query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`, [guildId,sessionId]);
      return this.mapSession(row, people.rows);
    });
  }

  async setSessionCheckInState(guildId:string, sessionId:string, targetUserId:string, actorUserId:string, event:Exclude<SessionCheckInEvent,'CHECK_IN'>, canManageGuild=false):Promise<GamingSessionRecord>{
    return this.database.transaction(async(client)=>{
      const row=(await client.query<any>(`select * from gaming_sessions where guild_id=$1 and session_id=$2 for update`,[guildId,sessionId])).rows[0];
      if(!row)throw new Error('GAMING_SESSION_NOT_FOUND');
      if(String(row.host_user_id)!==actorUserId&&!canManageGuild)throw new Error('GAMING_SESSION_NOT_AUTHORIZED');
      const participant=(await client.query<any>(`select status,check_in_state from gaming_session_participants where guild_id=$1 and session_id=$2 and user_id=$3 for update`,[guildId,sessionId,targetUserId])).rows[0];
      if(!participant||participant.status!=='JOINED')throw new Error('GAMING_SESSION_CHECKIN_REQUIRES_JOIN');
      const next=transitionSessionCheckIn(participant.check_in_state??'PENDING',event);
      await client.query(`update gaming_session_participants set check_in_state=$4,checked_in_at=case when $4='CHECKED_IN' then coalesce(checked_in_at,now()) when $4='PENDING' then null else checked_in_at end,updated_at=now() where guild_id=$1 and session_id=$2 and user_id=$3`,[guildId,sessionId,targetUserId,next]);
      const people=await client.query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`,[guildId,sessionId]);
      return this.mapSession(row,people.rows);
    });
  }

  async transitionSession(guildId: string, sessionId: string, actorUserId: string, event: 'MARK_READY'|'START'|'COMPLETE'|'CANCEL', canManageGuild = false): Promise<GamingSessionRecord> {
    return this.database.transaction(async (client) => {
      const row = (await client.query<any>(`select * from gaming_sessions where guild_id=$1 and session_id=$2 for update`, [guildId,sessionId])).rows[0];
      if (!row) throw new Error('GAMING_SESSION_NOT_FOUND');
      if (String(row.host_user_id) !== actorUserId && !canManageGuild) throw new Error('GAMING_SESSION_NOT_AUTHORIZED');
      const next = transitionGamingSession(row.status as GamingSessionStatus, event);
      const updated = (await client.query<any>(`update gaming_sessions set status=$3,updated_at=now(),completed_at=case when $3='COMPLETED' then now() else completed_at end,cancelled_at=case when $3='CANCELLED' then now() else cancelled_at end where guild_id=$1 and session_id=$2 returning *`, [guildId,sessionId,next])).rows[0];
      const people = await client.query<any>(`select user_id,status,check_in_state,waitlist_position from gaming_session_participants where guild_id=$1 and session_id=$2 and status in ('JOINED','WAITLISTED') order by case when status='JOINED' then 0 else 1 end,waitlist_position nulls last,joined_at,user_id`, [guildId,sessionId]);
      return this.mapSession(updated, people.rows);
    });
  }

  async createLfg(input: {
    guildId: string; gameKey: string; ownerUserId: string; partySize: number; region?: string; platform?: string; mode?: string;
    rankLabel?: string; requirements?: Record<string, unknown>; startsAt?: Date; expiresAt: Date;
  }): Promise<LfgRecord> {
    const config = validateLfgConfig({ gameKey: input.gameKey, partySize: input.partySize, region: input.region, platform: input.platform, mode: input.mode, rankLabel: input.rankLabel, expiresAt: input.expiresAt });
    const lfgId = randomUUID();
    const { rows } = await this.database.requirePool().query<any>(
      `insert into lfg_posts(lfg_id,guild_id,game_key,owner_user_id,status,region,platform,mode,rank_label,party_size,member_ids,requirements,starts_at,expires_at)
       values($1,$2,$3,$4,'OPEN',$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [lfgId, input.guildId, input.gameKey, input.ownerUserId, input.region ?? null, input.platform ?? null, input.mode ?? null, input.rankLabel ?? null,
       config.partySize, [input.ownerUserId], input.requirements ?? {}, input.startsAt ?? null, input.expiresAt],
    );
    return this.mapLfg(rows[0]);
  }

  async getLfg(guildId: string, lfgId: string): Promise<LfgRecord | null> {
    const { rows } = await this.database.requirePool().query<any>('select * from lfg_posts where guild_id=$1 and lfg_id=$2', [guildId, lfgId]);
    return rows[0] ? this.mapLfg(rows[0]) : null;
  }

  async listOpenLfg(guildId: string, gameKey?: string, limit = 25): Promise<LfgRecord[]> {
    const safeLimit = Math.max(1, Math.min(50, limit));
    const values: unknown[] = [guildId, safeLimit];
    let sql = `select * from lfg_posts where guild_id=$1 and status in ('OPEN','FILLING') and expires_at > now()`;
    if (gameKey) { values.push(gameKey); sql += ' and game_key=$3'; }
    sql += ' order by created_at desc limit $2';
    const { rows } = await this.database.requirePool().query<any>(sql, values);
    return rows.map((row) => this.mapLfg(row));
  }

  async joinLfg(guildId: string, lfgId: string, userId: string): Promise<{ record: LfgRecord; joined: boolean }> {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<any>('select * from lfg_posts where guild_id=$1 and lfg_id=$2 for update', [guildId, lfgId]);
      const row = rows[0];
      if (!row) throw new Error('LFG_NOT_FOUND');
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query(`update lfg_posts set status='EXPIRED',updated_at=now() where lfg_id=$1`, [lfgId]);
        throw new Error('LFG_EXPIRED');
      }
      if (!['OPEN','FILLING'].includes(row.status)) throw new Error('LFG_NOT_JOINABLE');
      const members: string[] = row.member_ids ?? [];
      if (members.includes(userId)) return { record: this.mapLfg(row), joined: false };
      if (members.length >= row.party_size) throw new Error('LFG_FULL');
      const nextMembers = [...members, userId];
      const nextStatus: LfgStatus = nextMembers.length >= row.party_size ? 'FULL' : 'FILLING';
      const updated = await client.query<any>(`update lfg_posts set member_ids=$2,status=$3,updated_at=now() where lfg_id=$1 returning *`, [lfgId, nextMembers, nextStatus]);
      return { record: this.mapLfg(updated.rows[0]), joined: true };
    });
  }

  async leaveLfg(guildId: string, lfgId: string, userId: string): Promise<LfgRecord> {
    return this.database.transaction(async (client) => {
      const { rows } = await client.query<any>('select * from lfg_posts where guild_id=$1 and lfg_id=$2 for update', [guildId, lfgId]);
      const row = rows[0];
      if (!row) throw new Error('LFG_NOT_FOUND');
      const members: string[] = row.member_ids ?? [];
      if (!members.includes(userId)) return this.mapLfg(row);
      const nextMembers = members.filter((id) => id !== userId);
      const nextStatus: LfgStatus = userId === row.owner_user_id ? 'CANCELLED' : nextMembers.length <= 1 ? 'OPEN' : 'FILLING';
      const updated = await client.query<any>('update lfg_posts set member_ids=$2,status=$3,updated_at=now() where lfg_id=$1 returning *', [lfgId, nextMembers, nextStatus]);
      return this.mapLfg(updated.rows[0]);
    });
  }

  async createTeam(input: { guildId: string; gameKey: string; name: string; captainUserId: string; metadata?: Record<string, unknown> }): Promise<string> {
    if (input.name.trim().length < 2 || input.name.length > 80) throw new Error('INVALID_TEAM_NAME');
    const teamId = randomUUID();
    await this.database.transaction(async (client) => {
      await client.query(`insert into teams(team_id,guild_id,game_key,name,captain_user_id,metadata) values($1,$2,$3,$4,$5,$6)`, [teamId, input.guildId, input.gameKey, input.name.trim(), input.captainUserId, input.metadata ?? {}]);
      await client.query(`insert into team_members(team_id,guild_id,user_id,member_role) values($1,$2,$3,'CAPTAIN')`, [teamId, input.guildId, input.captainUserId]);
    });
    return teamId;
  }

  async createClan(input: { guildId: string; gameKey: string; name: string; leaderUserId: string; metadata?: Record<string, unknown> }): Promise<string> {
    if (input.name.trim().length < 2 || input.name.length > 80) throw new Error('INVALID_CLAN_NAME');
    const clanId = randomUUID();
    await this.database.transaction(async (client) => {
      await client.query(`insert into clans(clan_id,guild_id,game_key,name,leader_user_id,metadata) values($1,$2,$3,$4,$5,$6)`, [clanId, input.guildId, input.gameKey, input.name.trim(), input.leaderUserId, input.metadata ?? {}]);
      await client.query(`insert into clan_members(clan_id,guild_id,user_id,member_role) values($1,$2,$3,'LEADER')`, [clanId, input.guildId, input.leaderUserId]);
    });
    return clanId;
  }

  async createTournament(input: { guildId: string; gameKey: string; name: string; format: string; teamSize: number; maxEntries?: number; startsAt?: Date; createdBy: string; rules?: Record<string, unknown> }): Promise<string> {
    assertNonWageringCompetition(input.rules ?? {});
    const name = input.name.trim();
    if (name.length < 3 || name.length > 100) throw new Error('INVALID_TOURNAMENT_NAME');
    if (!['SINGLE_ELIMINATION','DOUBLE_ELIMINATION','ROUND_ROBIN','GROUP_STAGE','CUSTOM'].includes(input.format)) throw new Error('INVALID_TOURNAMENT_FORMAT');
    if (!Number.isInteger(input.teamSize) || input.teamSize < 1 || input.teamSize > 100) throw new Error('INVALID_TEAM_SIZE');
    if (input.maxEntries !== undefined && (!Number.isInteger(input.maxEntries) || input.maxEntries < 2 || input.maxEntries > 10000)) throw new Error('INVALID_MAX_ENTRIES');
    const tournamentId = randomUUID();
    await this.database.requirePool().query(
      `insert into tournaments(tournament_id,guild_id,game_key,name,format,status,team_size,max_entries,rules,starts_at,created_by)
       values($1,$2,$3,$4,$5,'DRAFT',$6,$7,$8,$9,$10)`,
      [tournamentId, input.guildId, input.gameKey, name, input.format, input.teamSize, input.maxEntries ?? null, input.rules ?? {}, input.startsAt ?? null, input.createdBy],
    );
    return tournamentId;
  }

  async createScrim(input: { guildId: string; gameKey: string; teamAId: string; teamBId: string; bestOf: number; region?: string; startsAt: Date; createdBy: string; rules?: Record<string, unknown> }): Promise<string> {
    assertNonWageringCompetition(input.rules ?? {});
    validateScrim({ gameKey: input.gameKey, teamAId: input.teamAId, teamBId: input.teamBId, bestOf: input.bestOf, startsAt: input.startsAt, wageringEnabled: false, entryStakeRequired: false });
    const scrimId = randomUUID();
    await this.database.requirePool().query(
      `insert into scrims(scrim_id,guild_id,game_key,team_a_id,team_b_id,status,best_of,region,starts_at,rules,created_by)
       values($1,$2,$3,$4,$5,'CONFIRMED',$6,$7,$8,$9,$10)`,
      [scrimId, input.guildId, input.gameKey, input.teamAId, input.teamBId, input.bestOf, input.region ?? null, input.startsAt, input.rules ?? {}, input.createdBy],
    );
    return scrimId;
  }

  async awardXp(input: { guildId: string; userId: string; gameKey?: string; sourceType: string; sourceId?: string; amount: number; dedupKey: string; correlationId: string; minEventIntervalMs?: number; maxXpPerEvent?: number; maxXpPerHour?: number; xpPerLevel?: number }): Promise<{ awarded: number; totalXp: number; level: number; previousLevel: number; reason: 'AWARDED' | 'DUPLICATE' | 'COOLDOWN' | 'HOURLY_CAP' }> {
    const gameKey = input.gameKey ?? '__global__';
    const requested = Math.max(0, Math.floor(input.amount));
    const maxPerEvent = Math.max(1, input.maxXpPerEvent ?? 100);
    const hourlyCap = Math.max(maxPerEvent, input.maxXpPerHour ?? 1000);
    const cooldownMs = Math.max(0, input.minEventIntervalMs ?? 30_000);
    const xpPerLevel = Math.max(1, input.xpPerLevel ?? 1000);
    return this.database.transaction(async (client) => {
      const xpEventId = randomUUID();
      const inserted = await client.query(
        `insert into xp_events(xp_event_id,guild_id,user_id,game_key,source_type,source_id,amount,dedup_key,evidence,correlation_id)
         values($1,$2,$3,$4,$5,$6,0,$7,$8,$9) on conflict (guild_id,user_id,dedup_key) do nothing returning xp_event_id`,
        [xpEventId, input.guildId, input.userId, input.gameKey ?? null, input.sourceType, input.sourceId ?? null, input.dedupKey, { requested }, input.correlationId],
      );
      const currentRows = await client.query<any>(`select * from xp_balances where guild_id=$1 and user_id=$2 and game_key=$3 for update`, [input.guildId, input.userId, gameKey]);
      const row = currentRows.rows[0];
      const currentXp = Number(row?.xp ?? 0);
      const currentLevel = Number(row?.level ?? 1);
      if ((inserted.rowCount ?? 0) === 0) return { awarded: 0, totalXp: currentXp, level: currentLevel, previousLevel: currentLevel, reason: 'DUPLICATE' as const };
      const now = Date.now();
      const lastAward = row?.last_award_at ? new Date(row.last_award_at).getTime() : undefined;
      const windowStart = row?.hourly_window_started_at ? new Date(row.hourly_window_started_at).getTime() : now;
      const resetWindow = now - windowStart >= 3_600_000;
      const awardedThisHour = resetWindow ? 0 : Number(row?.hourly_awarded ?? 0);
      const recordDecision = async (amount: number, reason: 'AWARDED' | 'COOLDOWN' | 'HOURLY_CAP', extra: Record<string, unknown> = {}) => {
        await client.query(
          `update xp_events set amount=$2,evidence=evidence || $3::jsonb where xp_event_id=$1`,
          [xpEventId, amount, { requested, reason, maxPerEvent, hourlyCap, cooldownMs, ...extra }],
        );
      };
      if (lastAward !== undefined && now - lastAward < cooldownMs) {
        await recordDecision(0, 'COOLDOWN', { retryAfterMs: cooldownMs - (now - lastAward) });
        return { awarded: 0, totalXp: currentXp, level: currentLevel, previousLevel: currentLevel, reason: 'COOLDOWN' as const };
      }
      const remaining = Math.max(0, hourlyCap - awardedThisHour);
      if (remaining <= 0) {
        await recordDecision(0, 'HOURLY_CAP', { awardedThisHour });
        return { awarded: 0, totalXp: currentXp, level: currentLevel, previousLevel: currentLevel, reason: 'HOURLY_CAP' as const };
      }
      const awarded = Math.min(requested, maxPerEvent, remaining);
      const totalXp = currentXp + awarded;
      const level = Math.floor(totalXp / xpPerLevel) + 1;
      await client.query(
        `insert into xp_balances(guild_id,user_id,game_key,xp,level,hourly_window_started_at,hourly_awarded,last_award_at)
         values($1,$2,$3,$4,$5,now(),$6,now())
         on conflict (guild_id,user_id,game_key) do update set xp=$4,level=$5,
           hourly_window_started_at=case when $7 then now() else xp_balances.hourly_window_started_at end,
           hourly_awarded=case when $7 then $6 else xp_balances.hourly_awarded+$6 end,last_award_at=now(),updated_at=now()`,
        [input.guildId, input.userId, gameKey, totalXp, level, awarded, resetWindow],
      );
      if (awarded > 0) {
        const activeSeasons = await client.query<any>(
          `select season_id,max_level,xp_per_level from seasons where guild_id=$1 and starts_at<=now() and ends_at>=now() and (game_key is null or game_key=$2)`,
          [input.guildId,input.gameKey ?? null],
        );
        for (const season of activeSeasons.rows) {
          await client.query(
            `insert into season_progress(season_id,guild_id,user_id,xp,level) values($1,$2,$3,$4,least($5,($4/$6)::int+1))
             on conflict (season_id,user_id) do update set xp=season_progress.xp+$4,level=least($5,((season_progress.xp+$4)/$6)::int+1),updated_at=now()`,
            [season.season_id,input.guildId,input.userId,awarded,Number(season.max_level),Number(season.xp_per_level)],
          );
        }
      }
      await recordDecision(awarded, 'AWARDED', { totalXp, level, awardedThisHourBefore: awardedThisHour });
      return { awarded, totalXp, level, previousLevel: currentLevel, reason: 'AWARDED' as const };
    });
  }

  async applyProgressionEvent(input: {
    guildId: string; userId: string; eventType: string; dedupKey: string; correlationId: string;
    gameKey?: string; sourceId?: string; increment?: number; payload?: Record<string, unknown>;
  }): Promise<{ duplicate: boolean; metricValue: number; completedQuests: string[]; awardedAchievements: string[] }> {
    const gameKey = input.gameKey ?? '__global__';
    const increment = Math.max(1, Math.min(10000, Math.floor(input.increment ?? 1)));
    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
    const weekKey = `week:${weekStart.toISOString().slice(0, 10)}`;

    return this.database.transaction(async (client) => {
      const receipt = await client.query(
        `insert into progression_event_receipts(guild_id,user_id,dedup_key,event_type,game_key,source_id,correlation_id,payload)
         values($1,$2,$3,$4,$5,$6,$7,$8) on conflict do nothing returning dedup_key`,
        [input.guildId,input.userId,input.dedupKey,input.eventType,gameKey,input.sourceId ?? null,input.correlationId,input.payload ?? {}],
      );
      const metricRow = await client.query<any>(
        `select metric_value from progression_metrics where guild_id=$1 and user_id=$2 and game_key=$3 and metric_key=$4`,
        [input.guildId,input.userId,gameKey,input.eventType],
      );
      if ((receipt.rowCount ?? 0) === 0) return { duplicate: true, metricValue: Number(metricRow.rows[0]?.metric_value ?? 0), completedQuests: [], awardedAchievements: [] };

      const metric = await client.query<any>(
        `insert into progression_metrics(guild_id,user_id,game_key,metric_key,metric_value)
         values($1,$2,$3,$4,$5)
         on conflict (guild_id,user_id,game_key,metric_key) do update set metric_value=progression_metrics.metric_value+$5,updated_at=now()
         returning metric_value`,
        [input.guildId,input.userId,gameKey,input.eventType,increment],
      );
      const metricValue = Number(metric.rows[0]?.metric_value ?? increment);
      const activeSeason = (await client.query<any>(
        `select season_key from seasons where guild_id=$1 and starts_at<=now() and ends_at>=now() and (game_key is null or game_key=$2) order by case when game_key=$2 then 0 else 1 end,starts_at desc limit 1`,
        [input.guildId,input.gameKey ?? null],
      )).rows[0]?.season_key as string | undefined;

      const quests = (await client.query<any>(
        `select quest_id,quest_key,cadence,target,reward from quests where guild_id=$1 and enabled=true and event_type=$2
           and (game_key is null or game_key=$3) and (active_from is null or active_from<=now()) and (active_until is null or active_until>=now())`,
        [input.guildId,input.eventType,input.gameKey ?? null],
      )).rows;
      const completedQuests: string[] = [];
      for (const quest of quests) {
        const periodKey = quest.cadence === 'DAILY' ? `day:${dayKey}` : quest.cadence === 'WEEKLY' ? weekKey : quest.cadence === 'EVENT' ? `event:${input.sourceId ?? 'generic'}` : quest.cadence === 'SEASONAL' ? `season:${activeSeason ?? 'inactive'}` : 'lifetime';
        if (quest.cadence === 'SEASONAL' && !activeSeason) continue;
        // Serialize a quest-period transition so two different events cannot both claim the same completion edge.
        await client.query(`select pg_advisory_xact_lock(hashtext($1),hashtext($2))`, [String(quest.quest_id), `${input.userId}:${periodKey}`]);
        const prior = await client.query<any>(
          `select completed_at from quest_progress where quest_id=$1 and user_id=$2 and period_key=$3`,
          [quest.quest_id,input.userId,periodKey],
        );
        const wasComplete = Boolean(prior.rows[0]?.completed_at);
        const progress = await client.query<any>(
          `insert into quest_progress(quest_id,guild_id,user_id,period_key,progress,completed_at)
           values($1,$2,$3,$4,least($5,$6),case when $5>=$6 then now() else null end)
           on conflict (quest_id,user_id,period_key) do update set
             progress=least($6,quest_progress.progress+$5),
             completed_at=case when quest_progress.completed_at is not null then quest_progress.completed_at when least($6,quest_progress.progress+$5)>=$6 then now() else null end,
             updated_at=now()
           returning progress,completed_at`,
          [quest.quest_id,input.guildId,input.userId,periodKey,increment,Number(quest.target)],
        );
        const row = progress.rows[0];
        if (!wasComplete && row?.completed_at && Number(row.progress) >= Number(quest.target)) completedQuests.push(String(quest.quest_key));
      }

      const achievements = (await client.query<any>(
        `select achievement_id,achievement_key,condition from achievements where guild_id=$1 and enabled=true and (game_key is null or game_key=$2)`,
        [input.guildId,input.gameKey ?? null],
      )).rows;
      const awardedAchievements: string[] = [];
      for (const achievement of achievements) {
        const condition = achievement.condition && typeof achievement.condition === 'object' ? achievement.condition : {};
        const conditionEvent = String(condition.eventType ?? condition.metric ?? '');
        const threshold = Math.max(1, Number(condition.threshold ?? 1));
        if (conditionEvent !== input.eventType || !Number.isFinite(threshold) || metricValue < threshold) continue;
        const awarded = await client.query(
          `insert into player_achievements(achievement_id,guild_id,user_id,evidence) values($1,$2,$3,$4)
           on conflict (achievement_id,user_id) do nothing returning achievement_id`,
          [achievement.achievement_id,input.guildId,input.userId,{eventType:input.eventType,metricValue,dedupKey:input.dedupKey,sourceId:input.sourceId ?? null}],
        );
        if ((awarded.rowCount ?? 0) > 0) awardedAchievements.push(String(achievement.achievement_key));
      }
      return { duplicate: false, metricValue, completedQuests, awardedAchievements };
    });
  }

  async listEnabledGames(guildId: string): Promise<Array<{ gameKey: string; displayName: string; featureFlags: Record<string, unknown> }>> {
    const { rows } = await this.database.requirePool().query<any>(
      `select game_key,display_name,feature_flags from guild_games where guild_id=$1 and enabled=true order by display_name asc limit 100`,
      [guildId],
    );
    return rows.map((row) => ({ gameKey: row.game_key, displayName: row.display_name, featureFlags: row.feature_flags ?? {} }));
  }

  async listProfiles(guildId: string, userId: string): Promise<PlayerGamingProfile[]> {
    const { rows } = await this.database.requirePool().query<any>(
      `select * from player_game_profiles where guild_id=$1 and user_id=$2 order by updated_at desc limit 25`,
      [guildId, userId],
    );
    return rows.map((row) => ({
      userId: row.user_id, gameKey: row.game_key, platform: row.platform ?? undefined, region: row.region ?? undefined,
      preferredRoles: row.preferred_roles ?? [], rankLabel: row.rank_label ?? undefined, availability: row.availability ?? {},
      visibility: row.preferences?.visibility === 'PRIVATE' || row.preferences?.visibility === 'TEAM_ONLY' ? row.preferences.visibility : 'GUILD',
    }));
  }

  async listMemberships(guildId: string, userId: string): Promise<{ teams: Array<{ id: string; name: string; gameKey: string; role: string }>; clans: Array<{ id: string; name: string; gameKey: string; role: string }> }> {
    const [teams, clans] = await Promise.all([
      this.database.requirePool().query<any>(
        `select t.team_id,t.name,t.game_key,tm.member_role from team_members tm join teams t on t.team_id=tm.team_id where tm.guild_id=$1 and tm.user_id=$2 and t.status='ACTIVE' order by t.updated_at desc limit 25`,
        [guildId, userId],
      ),
      this.database.requirePool().query<any>(
        `select c.clan_id,c.name,c.game_key,cm.member_role from clan_members cm join clans c on c.clan_id=cm.clan_id where cm.guild_id=$1 and cm.user_id=$2 and c.status='ACTIVE' order by c.updated_at desc limit 25`,
        [guildId, userId],
      ),
    ]);
    return {
      teams: teams.rows.map((row) => ({ id: row.team_id, name: row.name, gameKey: row.game_key, role: row.member_role })),
      clans: clans.rows.map((row) => ({ id: row.clan_id, name: row.name, gameKey: row.game_key, role: row.member_role })),
    };
  }

  async progressionSummary(guildId: string, userId: string): Promise<Array<{ gameKey: string; xp: number; level: number }>> {
    const { rows } = await this.database.requirePool().query<any>(
      `select game_key,xp,level from xp_balances where guild_id=$1 and user_id=$2 order by xp desc limit 25`,
      [guildId, userId],
    );
    return rows.map((row) => ({ gameKey: row.game_key, xp: Number(row.xp ?? 0), level: Number(row.level ?? 1) }));
  }

  async createRecruitmentPost(input:{guildId:string;gameKey:string;postType:RecruitmentPostType;ownerUserId:string;targetId?:string;title:string;description?:string;region?:string;platform?:string;preferredRoles?:string[];rankLabel?:string;availability?:Record<string,unknown>;expiresAt:Date}):Promise<RecruitmentPostRecord>{
    const valid=validateRecruitmentPost(input);const recruitmentPostId=randomUUID();const {rows}=await this.database.requirePool().query<any>(`insert into recruitment_posts(recruitment_post_id,guild_id,game_key,post_type,owner_user_id,target_id,title,description,region,platform,preferred_roles,rank_label,availability,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,[recruitmentPostId,input.guildId,valid.gameKey,valid.postType,input.ownerUserId,input.targetId??null,valid.title,valid.description,valid.region??null,valid.platform??null,valid.preferredRoles,valid.rankLabel??null,input.availability??{},valid.expiresAt]);return this.mapRecruitment(rows[0]);
  }

  async listRecruitmentPosts(guildId:string,filters:{gameKey?:string;postType?:RecruitmentPostType;region?:string;platform?:string;preferredRole?:string}={},limit=25):Promise<RecruitmentPostRecord[]>{
    const values:unknown[]=[guildId];const where=[`guild_id=$1`,`status='OPEN'`,`expires_at>now()`];
    const add=(sql:string,value:unknown)=>{values.push(value);where.push(sql.replace('?',`$${values.length}`));};
    if(filters.gameKey)add('game_key=?',filters.gameKey.toLowerCase());if(filters.postType)add('post_type=?',filters.postType);if(filters.region)add('lower(region)=lower(?)',filters.region);if(filters.platform)add('lower(platform)=lower(?)',filters.platform);if(filters.preferredRole)add('?=any(preferred_roles)',filters.preferredRole);
    values.push(Math.max(1,Math.min(50,limit)));const {rows}=await this.database.requirePool().query<any>(`select * from recruitment_posts where ${where.join(' and ')} order by created_at desc limit $${values.length}`,values);return rows.map(row=>this.mapRecruitment(row));
  }

  async applyToRecruitment(input:{guildId:string;recruitmentPostId:string;applicantUserId:string;message?:string}):Promise<{applicationId:string;created:boolean}>{
    return this.database.transaction(async client=>{const post=(await client.query<any>(`select * from recruitment_posts where guild_id=$1 and recruitment_post_id=$2 for update`,[input.guildId,input.recruitmentPostId])).rows[0];if(!post)throw new Error('RECRUITMENT_NOT_FOUND');if(post.status!=='OPEN'||new Date(post.expires_at)<=new Date())throw new Error('RECRUITMENT_NOT_OPEN');if(post.owner_user_id===input.applicantUserId)throw new Error('RECRUITMENT_OWNER_CANNOT_APPLY');const applicationId=randomUUID();const result=await client.query<any>(`insert into recruitment_applications(recruitment_application_id,recruitment_post_id,guild_id,applicant_user_id,message) values($1,$2,$3,$4,$5) on conflict(recruitment_post_id,applicant_user_id) do nothing returning recruitment_application_id`,[applicationId,input.recruitmentPostId,input.guildId,input.applicantUserId,(input.message??'').trim().slice(0,1000)]);return{applicationId:result.rows[0]?.recruitment_application_id??applicationId,created:(result.rowCount??0)>0};});
  }

  async listRecruitmentApplications(input:{guildId:string;recruitmentPostId:string;actorUserId:string;canManageGuild?:boolean;limit?:number}):Promise<Array<{applicationId:string;applicantUserId:string;message:string;status:string;createdAt:string}>>{
    const pool=this.database.requirePool();
    const post=(await pool.query<any>(`select owner_user_id from recruitment_posts where guild_id=$1 and recruitment_post_id=$2`,[input.guildId,input.recruitmentPostId])).rows[0];
    if(!post)throw new Error('RECRUITMENT_NOT_FOUND');
    if(post.owner_user_id!==input.actorUserId&&!input.canManageGuild)throw new Error('RECRUITMENT_NOT_AUTHORIZED');
    const limit=Math.max(1,Math.min(25,input.limit??10));
    const {rows}=await pool.query<any>(`select recruitment_application_id,applicant_user_id,message,status,created_at from recruitment_applications where guild_id=$1 and recruitment_post_id=$2 order by created_at asc limit $3`,[input.guildId,input.recruitmentPostId,limit]);
    return rows.map(row=>({applicationId:String(row.recruitment_application_id),applicantUserId:String(row.applicant_user_id),message:String(row.message??''),status:String(row.status),createdAt:new Date(row.created_at).toISOString()}));
  }

  async expireRecruitment(guildId:string,recruitmentPostId:string):Promise<boolean>{const result=await this.database.requirePool().query(`update recruitment_posts set status='EXPIRED',updated_at=now() where guild_id=$1 and recruitment_post_id=$2 and status='OPEN' and expires_at<=now()`,[guildId,recruitmentPostId]);return(result.rowCount??0)>0;}
  async closeRecruitment(guildId:string,recruitmentPostId:string,actorUserId:string,canManageGuild=false):Promise<boolean>{const result=await this.database.requirePool().query(`update recruitment_posts set status='CLOSED',updated_at=now() where guild_id=$1 and recruitment_post_id=$2 and status='OPEN' and (owner_user_id=$3 or $4=true)`,[guildId,recruitmentPostId,actorUserId,canManageGuild]);return(result.rowCount??0)>0;}
  private mapSession(row:any, people:Array<{user_id:unknown;status?:unknown;check_in_state?:unknown;waitlist_position?:unknown}>):GamingSessionRecord{const participantIds=people.filter((item)=>item.status==='JOINED'||item.status===undefined).map((item)=>String(item.user_id));const waitlistedUserIds=people.filter((item)=>item.status==='WAITLISTED').map((item)=>String(item.user_id));const checkedInUserIds=people.filter((item)=>item.status==='JOINED'&&item.check_in_state==='CHECKED_IN').map((item)=>String(item.user_id));return{sessionId:String(row.session_id),guildId:String(row.guild_id),gameKey:String(row.game_key),hostUserId:String(row.host_user_id),title:String(row.title),status:row.status,startsAt:new Date(row.starts_at).toISOString(),durationMinutes:Number(row.duration_minutes),capacity:Number(row.capacity),participantIds,waitlistedUserIds,checkedInUserIds,waitlistCapacity:Number(row.waitlist_capacity??25),checkInOpensMinutes:Number(row.check_in_opens_minutes??30),checkInClosesMinutes:Number(row.check_in_closes_minutes??15),region:row.region??undefined,platform:row.platform??undefined,mode:row.mode??undefined};}

  private mapRecruitment(row:any):RecruitmentPostRecord{return{recruitmentPostId:String(row.recruitment_post_id),guildId:String(row.guild_id),gameKey:String(row.game_key),postType:row.post_type,ownerUserId:String(row.owner_user_id),targetId:row.target_id?String(row.target_id):undefined,title:String(row.title),description:String(row.description??''),region:row.region??undefined,platform:row.platform??undefined,preferredRoles:row.preferred_roles??[],rankLabel:row.rank_label??undefined,availability:row.availability??{},status:row.status,expiresAt:new Date(row.expires_at).toISOString()};}

  private mapLfg(row: any): LfgRecord {
    return {
      lfgId: row.lfg_id, guildId: row.guild_id, gameKey: row.game_key, ownerUserId: row.owner_user_id, status: row.status,
      region: row.region ?? undefined, platform: row.platform ?? undefined, mode: row.mode ?? undefined, rankLabel: row.rank_label ?? undefined,
      partySize: row.party_size, memberIds: row.member_ids ?? [], requirements: row.requirements ?? {},
      startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : undefined,
      expiresAt: new Date(row.expires_at).toISOString(),
    };
  }
}

export { decideSessionAdmission, promoteSessionWaitlist, transitionSessionCheckIn, isSessionCheckInOpen, rankGamingAvailabilityCandidates } from './session-reliability-pure.ts';
export type { SessionAdmission, SessionAdmissionInput, SessionCheckInState, SessionCheckInEvent, AvailabilityCandidate, RankedAvailabilityCandidate } from './session-reliability-pure.ts';
