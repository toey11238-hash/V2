import { describe, expect, it } from 'vitest';
import { assertFreeEntryGiveaway, giveawayEntrantHash, selectGiveawayWinners } from '@autoserver/giveaways';
describe('free-entry community rewards',()=>{
  it('blocks paid entry, wagering and casino mechanics',()=>{
    const base={title:'Community reward',winnerCount:1,closesAt:new Date(Date.now()+3_600_000)};
    for(const prizeDescription of ['pay to enter','เดิมพันเพื่อรับรางวัล','casino reward']) expect(()=>assertFreeEntryGiveaway({...base,prizeDescription})).toThrow('GIVEAWAY_GAMBLING_OR_PAID_ENTRY_FORBIDDEN');
  });
  it('deduplicates entrants and selects deterministically from a recorded seed',()=>{const entrants=['u3','u1','u2','u1'];expect(giveawayEntrantHash(entrants)).toBe(giveawayEntrantHash(['u1','u2','u3']));expect(selectGiveawayWinners(entrants,2,'seed')).toEqual(selectGiveawayWinners([...entrants].reverse(),2,'seed'));expect(new Set(selectGiveawayWinners(entrants,3,'seed')).size).toBe(3);});
});
