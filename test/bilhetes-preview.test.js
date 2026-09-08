const assert = require('assert');
const { buildCandidates, calculateTotalOdd } = require('../lib/bilhetes-preview');
const game = { fixture: { id: 10, date: '2026-09-08T19:00:00Z' }, league: { name: 'Demo' }, teams: { home: { name: 'A' }, away: { name: 'B' } } };
const quote = { fixtureId: 10, marketKey: 'over15', marketId: 5, marketName: 'Goals Over/Under', selection: 'Over 1.5', bookmakerId: 8, bookmakerName: 'Bet365', odd: '1.80', capturedAt: '2026-09-08T10:00:00Z' };
const result = buildCandidates([game], [quote], ['over15']);
assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].bookmakerName, 'Bet365'); assert.equal(result.candidates[0].line, 1.5); assert.equal(calculateTotalOdd(result.candidates), 1.8);
assert.equal(buildCandidates([game], [], ['over15']).rejected[0].reason, 'exact_real_odd_unavailable');
console.log('bilhetes preview scenarios: OK');
