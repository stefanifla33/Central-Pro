const assert = require('assert');
const { createPrematchOddsService } = require('../lib/prematch-odds');
const { cachedQuotesForFixture, exactQuote } = require('../lib/bilhetes-preview');
(async () => {
  let calls = 0; const now = Date.parse('2026-09-08T10:00:00Z');
  const fixture = { id: 7, status: { short: 'NS' }, date: '2026-09-08T20:00:00Z' };
  const records = [{ fixture: { id: 7 }, update: '2026-09-08T09:59:00Z', bookmakers: [{ id: 8, name: 'Bet365', bets: [{ id: 5, name: 'Goals Over/Under', values: [{ value: 'Over 1.5', odd: '1.80' }] }] }, { id: 32, name: 'Betano', bets: [{ id: 5, name: 'Goals Over/Under', values: [{ value: 'Over 1.5', odd: '1.90' }] }] }, { id: 34, name: 'Superbet', bets: [{ id: 5, name: 'Goals Over/Under', values: [{ value: 'Over 1.5', odd: '1.85' }] }] }] }];
  const service = createPrematchOddsService({ now: () => now, football: async endpoint => { calls++; return endpoint.startsWith('/fixtures') ? { response: [{ fixture }] } : { response: records, paging: { total: 1 } }; } });
  assert.equal(service.getCachedOdds(7), null); assert.equal(service.getCachedOdds(999), null); assert.equal(calls, 0);
  await service.get(7); const cached = service.getCachedOdds(7); assert.equal(cached.fixtureId, 7); assert.notStrictEqual(cached, service.getCachedOdds(7)); assert.equal(cached.selections.over15.length, 3); assert.equal(calls, 2);
  const mapped = cachedQuotesForFixture(service, 7); const best = exactQuote(mapped.quotes, 7, 'over15'); assert.equal(best.quote.bookmakerName, 'Betano'); assert.equal(best.quote.odd, '1.90');
  const wrongLine = { ...mapped.quotes[0], line: 2.5 }; assert.equal(exactQuote([wrongLine], 7, 'over15').reason, 'fixture_market_selection_line_mismatch');
  const wrongMarket = { ...mapped.quotes[0], marketName: 'Wrong market' }; assert.equal(exactQuote([wrongMarket], 7, 'over15').reason, 'fixture_market_selection_line_mismatch');
  console.log('prematch odds cache integration scenarios: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
