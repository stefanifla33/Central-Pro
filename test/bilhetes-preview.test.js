const assert = require('assert');
const { buildCandidates, calculateTotalOdd } = require('../lib/bilhetes-preview');
const game = { fixture: { id: 10, date: '2026-09-08T19:00:00Z' }, league: { name: 'Demo' }, teams: { home: { name: 'A' }, away: { name: 'B' } } };
const quote = { fixtureId: 10, marketKey: 'over15', marketId: 5, marketName: 'Goals Over/Under', selection: 'Over 1.5', bookmakerId: 8, bookmakerName: 'Bet365', odd: '1.80', capturedAt: '2026-09-08T10:00:00Z' };
const result = buildCandidates([game], [quote], ['over15']);
assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].bookmakerName, 'Bet365'); assert.equal(result.candidates[0].line, 1.5); assert.equal(calculateTotalOdd(result.candidates), 1.8);
assert.equal(buildCandidates([game], [], ['over15']).rejected[0].reason, 'exact_real_odd_unavailable');
console.log('bilhetes preview scenarios: OK');
const { assembleTickets } = require('../lib/bilhetes-preview');
const candidates = [
  { fixtureId: 1, competitionId: 2, marketKey: 'over15', odd: '1.30', evidence: { over15: { evidence: { value: 90, hits: 9, total: 10 } } } },
  { fixtureId: 1, competitionId: 2, marketKey: 'over25', odd: '1.70', evidence: { over25: { evidence: { value: 80, hits: 8, total: 10 } } } },
  { fixtureId: 2, competitionId: 2, marketKey: 'homeWin', odd: '1.55', evidence: { homeWin: { evidence: { value: 80, hits: 8, total: 10 } } } },
  { fixtureId: 3, competitionId: 13, marketKey: 'homeOrDraw', odd: '1.35', evidence: { homeOrDraw: { evidence: { value: 90, hits: 9, total: 10 } } } },
  { fixtureId: 4, competitionId: 11, marketKey: 'awayWinEitherHalf', odd: '1.60', evidence: { awayWinEitherHalf: { evidence: { value: 80, hits: 8, total: 10 } } } },
  { fixtureId: 5, competitionId: 72, marketKey: 'btts', odd: '1.75', evidence: { btts: { evidence: { value: 80, hits: 8, total: 10 } } } },
  { fixtureId: 6, competitionId: 72, marketKey: 'homeWin', odd: '1.80', evidence: { homeWin: { evidence: { value: 80, hits: 8, total: 10 } } } }
];
const tickets = assembleTickets(candidates);
for (const ticket of tickets) {
  assert.equal(new Set(ticket.selections.map(x => x.fixtureId)).size, ticket.selections.length, `${ticket.type} must have one selection per fixture`);
  assert.equal(ticket.combinationType, 'MULTI_FIXTURE');
  assert.equal(ticket.combinedOddType, 'INDIVIDUAL_LEGS');
}
assert(!tickets.some(ticket => ticket.selections.filter(x => x.fixtureId === 1).length > 1), 'correlated lines from the same match are blocked');
const everyFixture = tickets.flatMap(ticket => ticket.selections.map(x => x.fixtureId));
assert.equal(new Set(everyFixture).size, everyFixture.length, 'a fixture cannot appear in more than one ticket on the same generation');
console.log('bilhetes ticket diversification scenarios: OK');
