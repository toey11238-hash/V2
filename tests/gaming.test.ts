import { describe, expect, it } from 'vitest';
import { applyQuestEvent, reduceLfg, transitionTournament, validateTeamRoster, validateTournamentConfig } from '@autoserver/gaming';

it('LFG is idempotent for duplicate join and becomes full from real roster count', () => {
  const initial = { ownerUserId: 'u1', partySize: 2, memberIds: ['u1'], status: 'OPEN' as const };
  const joined = reduceLfg(initial, { type: 'JOIN', userId: 'u2' });
  expect(joined.status).toBe('FULL');
  expect(reduceLfg(joined, { type: 'JOIN', userId: 'u2' })).toEqual(joined);
});

it('tournament state machine rejects impossible jumps', () => {
  expect(() => transitionTournament('DRAFT', 'START')).toThrow();
  expect(transitionTournament('DRAFT', 'OPEN_REGISTRATION')).toBe('REGISTRATION');
});

it('no-gambling policy rejects wagering configuration', () => {
  expect(() => validateTournamentConfig({ name: 'Bad', format: 'ROUND_ROBIN', teamSize: 1, wageringEnabled: true })).toThrow(/no-gambling/i);
  expect(validateTournamentConfig({ name: 'Community Cup', format: 'ROUND_ROBIN', teamSize: 5 }).name).toBe('Community Cup');
});

it('team roster requires unique users and exactly one captain', () => {
  expect(() => validateTeamRoster([{ userId: 'a', role: 'CAPTAIN' }, { userId: 'b', role: 'MEMBER' }])).not.toThrow();
  expect(() => validateTeamRoster([{ userId: 'a', role: 'CAPTAIN' }, { userId: 'a', role: 'MEMBER' }])).toThrow(/duplicate/i);
});

it('quest progress is bounded by actual target', () => {
  const def = { questKey: 'HELP_3', target: 3, eventType: 'member.helped', cadence: 'WEEKLY' as const };
  expect(applyQuestEvent(def, { progress: 2, completed: false }, 'member.helped', 10)).toEqual({ progress: 3, completed: true });
});

describe('expanded gaming kernel', () => {
  it('manages party ownership and lifecycle', async () => {
    const { reduceParty } = await import('@autoserver/gaming');
    let party: import('@autoserver/gaming').PartyState = { ownerUserId: 'a', maxMembers: 4, memberIds: ['a'], status: 'FORMING' };
    party = reduceParty(party, { type: 'JOIN', userId: 'b' });
    party = reduceParty(party, { type: 'TRANSFER_OWNER', userId: 'b' });
    expect(party.ownerUserId).toBe('b');
  });

  it('rejects wagering-like scrim configuration and validates match results', async () => {
    const { validateScrim, validateMatchScore } = await import('@autoserver/gaming');
    expect(() => validateScrim({ gameKey: 'x', teamAId: 'a', teamBId: 'b', startsAt: new Date(Date.now()+60_000), bestOf: 3, wageringEnabled: true })).toThrow();
    expect(validateMatchScore({ participantA: 2, participantB: 1, winner: 'A' }).winner).toBe('A');
  });

  it('applies XP cooldown and hourly caps', async () => {
    const { awardXp } = await import('@autoserver/gaming');
    const policy = { minEventIntervalMs: 10_000, maxXpPerEvent: 20, maxXpPerHour: 30 };
    const initial = { hourStartedAt: 0, awardedThisHour: 0, totalXp: 0 };
    const first = awardXp(policy, initial, 25, 1_000);
    expect(first.awarded).toBe(20);
    const cooldown = awardXp(policy, first.state, 20, 2_000);
    expect(cooldown.awarded).toBe(0);
  });

  it('creates deterministic seeded bracket slots', async () => {
    const { seedSingleElimination } = await import('@autoserver/gaming');
    const bracket = seedSingleElimination([{ entryId: 'a', seed: 1 }, { entryId: 'b', seed: 2 }, { entryId: 'c', seed: 3 }]);
    expect(bracket).toHaveLength(2);
    expect(bracket.some((pair) => pair.bye)).toBe(true);
  });
});
