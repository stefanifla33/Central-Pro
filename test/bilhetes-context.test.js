const assert = require('assert');
const { normalizeStandings, cornerMetricsFromHistory, hydrateMatchContext } = require('../lib/bilhetes-context');
const standings = normalizeStandings({ response: [{ league: { standings: [[{ rank: 1, points: 20, team: { id: 1 }, all: { played: 8 }, goalsDiff: 9 }]] } }] });
assert.deepStrictEqual(standings[0], { teamId: 1, position: 1, points: 20, played: 8, goalDifference: 9, zone: null });
const corner = cornerMetricsFromHistory({ fixtures: { a: { complete: true, fixture: { teams: { home: { id: 1 }, away: { id: 2 } } }, teams: [{ teamId: 1, corners: 8 }, { teamId: 2, corners: 4 }] } } }, 1, 2);
assert.equal(corner.home.sampleSize, 1); assert.equal(corner.away.sampleSize, 1); assert.equal(corner.over85.value, 100);
(async () => { let calls = 0; const games = [1, 2].map(id => ({ fixture: { id }, teams: { home: { id: 1 }, away: { id: 2 } }, league: { id: 10, season: 2026 } })); await hydrateMatchContext(games, { football: async () => { calls++; return { response: [{ league: { standings: [[]] } }] }; }, cornerHistory: { fixtures: {} } }); assert.equal(calls, 1); console.log('bilhetes context scenarios: OK'); })().catch(e => { console.error(e); process.exitCode = 1; });
