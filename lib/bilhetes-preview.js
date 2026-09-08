const { MARKETS, BOOKMAKERS, validOdd } = require('./prematch-odds');

const MARKET_SELECTIONS = Object.freeze({
  over05: ['Total de gols', '+0.5 gols'], over15: ['Total de gols', '+1.5 gols'], over25: ['Total de gols', '+2.5 gols'],
  over05HT: ['Gols no 1º tempo', '+0.5 gol no 1º tempo'], btts: ['Ambas marcam', 'Sim'],
  homeScores: ['Time marca', 'Mandante marca'], awayScores: ['Time marca', 'Visitante marca'],
  cornersOver65: ['Total de escanteios', '+6.5 escanteios'], cornersOver75: ['Total de escanteios', '+7.5 escanteios'],
  cornersOver85: ['Total de escanteios', '+8.5 escanteios'], cornersOver95: ['Total de escanteios', '+9.5 escanteios']
});
const MARKET_LINES = Object.freeze({ over05: 0.5, over15: 1.5, over25: 2.5, over05HT: 0.5, cornersOver65: 6.5, cornersOver75: 7.5, cornersOver85: 8.5, cornersOver95: 9.5 });

function exactQuote(quotes, fixtureId, marketKey) {
  const expected = MARKETS[marketKey];
  if (!expected) return { quote: null, reason: 'market_not_supported' };
  const matches = (quotes || []).filter(q => Number(q.fixtureId) === Number(fixtureId) && q.marketKey === marketKey && BOOKMAKERS.some(book => book.id === q.bookmakerId && book.name === q.bookmakerName) && validOdd(String(q.odd)));
  if (!matches.length) return { quote: null, reason: 'exact_real_odd_unavailable' };
  const compatible = matches.filter(q => Number(q.marketId) === expected[0] && q.marketName === expected[1] && q.selection === expected[2] && (q.line === undefined || q.line === MARKET_LINES[marketKey]));
  if (!compatible.length) return { quote: null, reason: 'fixture_market_selection_line_mismatch' };
  return { quote: compatible.sort((a,b) => Number(b.odd) - Number(a.odd))[0], reason: null };
}

function cachedQuotesForFixture(oddsCache, fixtureId) {
  const entry = typeof oddsCache?.getCachedOdds === 'function' ? oddsCache.getCachedOdds(fixtureId) : oddsCache?.[fixtureId] || null;
  if (!entry) return { entry: null, quotes: [], reason: 'cached_real_odd_unavailable' };
  const quotes = Object.entries(entry.selections || {}).flatMap(([marketKey, values]) => (values || []).map(value => ({ ...value, fixtureId: entry.fixtureId, marketKey, marketId: value.marketId, marketName: value.market, bookmakerName: value.name, capturedAt: value.update || entry.fetchedAt })));
  return { entry, quotes, reason: null };
}

async function sharedCachedQuotesForFixture(sharedCache, fixtureId) {
  const entry = await sharedCache?.getNormalizedOdds?.(fixtureId);
  return entry ? cachedQuotesForFixture({ [fixtureId]: entry }, fixtureId) : { entry: null, quotes: [], reason: 'cached_real_odd_unavailable' };
}

function buildCandidates(games, quotes = [], marketKeys = Object.keys(MARKETS)) {
  const candidates = [], rejected = [];
  for (const game of games || []) for (const marketKey of marketKeys) {
    const fixtureId = game.fixture?.id;
    if (!fixtureId) { rejected.push({ fixtureId: null, marketKey, reason: 'fixture_id_missing' }); continue; }
    const result = exactQuote(quotes, fixtureId, marketKey);
    if (!result.quote) { rejected.push({ fixtureId, marketKey, match: `${game.teams?.home?.name || ''} x ${game.teams?.away?.name || ''}`.trim(), reason: result.reason }); continue; }
    const [marketName, selectionDisplay] = MARKET_SELECTIONS[marketKey] || [marketKey, marketKey];
    candidates.push({ fixtureId, competitionId: Number(game.league?.id) || null, fixtureDate: game.fixture.date, competition: game.league?.name || '', homeTeam: game.teams?.home, awayTeam: game.teams?.away, marketKey, marketName, selectionType: marketKey.startsWith('over') ? 'over' : 'yes', selectionDisplay, line: MARKET_LINES[marketKey] ?? null, bookmakerId: result.quote.bookmakerId, bookmakerName: result.quote.bookmakerName, odd: String(result.quote.odd), capturedAt: result.quote.capturedAt || result.quote.update || null, update: result.quote.update || null, marketId: result.quote.marketId, market: result.quote.marketName, selection: result.quote.selection, evidence: game.metrics || null });
  }
  return { candidates, rejected };
}

function calculateTotalOdd(candidates) { return Number(candidates.reduce((total, candidate) => total * Number(candidate.odd), 1).toFixed(4)); }
function candidateQuality(candidate) { const metric = candidate.evidence?.[candidate.marketKey]?.evidence || candidate.evidence?.[candidate.marketKey]; return Number(metric?.value || 0) + Number(metric?.hits || 0) * 2; }
const TIER1_LEAGUES = new Set([2, 39, 135, 61, 78, 71, 73, 11, 13]);
const CONTINENTAL_LEAGUES = new Set([2, 11, 13]);
function findCombination(pool, min, max, low, high, used, allowSameFixture = false) {
  const ordered = pool.filter(candidate => !used.has(`${candidate.fixtureId}:${candidate.marketKey}`)).sort((a, b) => Number(TIER1_LEAGUES.has(b.competitionId)) - Number(TIER1_LEAGUES.has(a.competitionId)) || candidateQuality(b) - candidateQuality(a));
  function search(start, picked) {
    if (picked.length >= min) { const odd = calculateTotalOdd(picked); if (odd >= low && odd <= high) return picked; }
    if (picked.length === max) return null;
    for (let i = start; i < ordered.length; i++) {
      if (!allowSameFixture && picked.some(item => item.fixtureId === ordered[i].fixtureId)) continue;
      const result = search(i + 1, [...picked, ordered[i]]); if (result) return result;
    }
    return null;
  }
  return search(0, []);
}
function assembleTickets(candidates) {
  const remaining = [...candidates], used = new Set(), tickets = [];
  const add = (type, picked, combinationType) => { if (!picked) return; const continentalNames = new Map([[2, 'CHAMPIONS_MULTIPLA'], [13, 'LIBERTADORES'], [11, 'SUL_AMERICANA']]); const continentalIds = new Set(picked.filter(item => CONTINENTAL_LEAGUES.has(item.competitionId)).map(item => item.competitionId)); if (type === 'CONTINENTAL_DO_DIA' && continentalIds.size === 1) type = continentalNames.get([...continentalIds][0]); picked.forEach(item => used.add(`${item.fixtureId}:${item.marketKey}`)); tickets.push({ type, combinationType, combinedOddType: combinationType === 'SAME_FIXTURE' ? 'CALCULATED' : 'INDIVIDUAL_LEGS', selections: picked, totalOdd: calculateTotalOdd(picked) }); };
  const tier1 = item => TIER1_LEAGUES.has(item.competitionId);
  const continental = item => CONTINENTAL_LEAGUES.has(item.competitionId);
  const sameFixturePool = [...new Map(remaining.filter(tier1).map(item => [item.fixtureId, remaining.filter(other => other.fixtureId === item.fixtureId && tier1(other) && other.marketKey !== item.marketKey).sort((a,b) => candidateQuality(b)-candidateQuality(a))])).values()];
  for (const pool of sameFixturePool) { const picked = findCombination(pool, 2, 3, 1.8, 3.5, used, true); if (picked) { add('CHAMPIONS', picked, 'SAME_FIXTURE'); break; } }
  for (const [leagueId, type] of [[2, 'BINGO_CHAMPIONS'], [11, 'BINGO_SUL_AMERICANA'], [13, 'BINGO_LIBERTADORES']]) {
    const pool = remaining.filter(item => item.competitionId === leagueId);
    const picked = findCombination(pool, 2, 4, 3, 6, used);
    add(type, picked, picked && new Set(picked.map(item => item.fixtureId)).size === 1 ? 'SAME_FIXTURE' : 'MULTI_FIXTURE');
  }
  const continentalDay = findCombination(remaining.filter(continental), 2, 4, 2, 4.5, used);
  add('CONTINENTAL_DO_DIA', continentalDay, continentalDay && new Set(continentalDay.map(item => item.fixtureId)).size === 1 ? 'SAME_FIXTURE' : 'MULTI_FIXTURE');
  const profiles = [['CONSERVADOR', 1.6, 2, 2, 3], ['BILHETE_DO_DIA', 2, 3, 2, 4], ['ESCANTEIOS', 1.8, 3, 2, 4], ['BINGO', 3, 6, 2, 5], ['OUSADO', 3.5, 100, 2, 6]];
  for (const [type, low, high, min, max] of profiles) {
    const pool = type === 'ESCANTEIOS' ? remaining.filter(item => item.marketKey.startsWith('corners')) : remaining.filter(item => !item.marketKey.startsWith('corners'));
    const picked = findCombination(pool, min, max, low, high, used);
    add(type, picked, picked && new Set(picked.map(item => item.fixtureId)).size === 1 ? 'SAME_FIXTURE' : 'MULTI_FIXTURE');
  }
  return tickets;
}
function previewTickets(candidates) { return assembleTickets(candidates); }
module.exports = { MARKET_SELECTIONS, exactQuote, cachedQuotesForFixture, sharedCachedQuotesForFixture, buildCandidates, calculateTotalOdd, assembleTickets, previewTickets };
