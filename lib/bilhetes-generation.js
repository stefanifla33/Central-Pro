const { MARKET_SELECTIONS, cachedQuotesForFixture, buildCandidates, previewTickets } = require('./bilhetes-preview');
const { cpSelectScannerFixtures } = require('../public/competition-config');

const STAT_MARKETS = Object.freeze(['over15', 'over25', 'btts', 'homeScores', 'awayScores', 'cornersOver85']);
function statisticCandidates(games) {
  const candidates = [], rejected = [];
  for (const game of games || []) {
    const metrics = game.metrics || game.sampleMetrics || {};
    const found = STAT_MARKETS.filter(key => {
      const metric = metrics[key]?.evidence || metrics[key];
      return metric && Number(metric.total || 0) >= (key.startsWith('corners') ? 6 : 8);
    });
    if (!found.length) { rejected.push({ fixtureId: game.fixture?.id || null, reason: 'insufficient_existing_statistical_evidence' }); continue; }
    for (const marketKey of found) candidates.push({ game, marketKey });
  }
  return { candidates, rejected };
}

async function generateBilhetesPreview({ games, date, oddsService, sharedCache, football, apiUsageDiagnostic }) {
  const gamesOnDate = (games || []).filter(game => game.fixture?.status?.short === 'NS' && (!date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(game.fixture.date)) === date) && Date.parse(game.fixture.date) > Date.now());
  const eligibleGames = cpSelectScannerFixtures(gamesOnDate);
  const statsSnapshot = eligibleGames.filter(game => game.metrics || game.sampleMetrics);
  const hydrated = [];
  const statsExternalBefore = apiUsageDiagnostic?.externalTotal || 0;
  const teams = [...new Map(eligibleGames.flatMap(game => [game.teams?.home, game.teams?.away]).filter(team => team?.id).map(team => [Number(team.id), team])).values()];
  if (football && teams.length) {
    const histories = new Map();
    await Promise.all(teams.map(async team => { try { const response = await football(`/fixtures?team=${team.id}&last=10&timezone=America%2FSao_Paulo`, 900000); histories.set(team.id, (response.response || []).filter(item => ['FT','AET','PEN'].includes(item.fixture?.status?.short))); } catch { histories.set(team.id, []); } }));
    for (const game of eligibleGames) { const home = histories.get(Number(game.teams.home.id)) || [], away = histories.get(Number(game.teams.away.id)) || [], all = [...home, ...away].map(item => ({ total: Number(item.goals?.home) + Number(item.goals?.away), btts: Number(item.goals?.home) > 0 && Number(item.goals?.away) > 0 })).filter(item => Number.isFinite(item.total)); const evidence = key => { const values = all.slice(0, 10), hits = values.filter(item => key === 'btts' ? item.btts : item.total >= (key === 'over25' ? 3 : 2)).length; return { value: values.length ? hits / values.length * 100 : 0, total: values.length, hits }; }; const metrics = Object.fromEntries(['over15','over25','btts'].map(key => [key, { evidence: evidence(key), total: all.length }])); hydrated.push({ ...game, metrics }); }
  }
  const hydratedGames = hydrated.length ? hydrated : eligibleGames;
  const statsExternalAfter = apiUsageDiagnostic?.externalTotal || statsExternalBefore;
  const statistics = statisticCandidates(hydratedGames);
  const unique = [...new Map(statistics.candidates.map(item => [Number(item.game.fixture.id), item.game])).values()];
  const gamesWithStatisticalSnapshot = eligibleGames.filter(game => game.metrics || game.sampleMetrics).length;
  const report = { date: date || null, fixturesFound: gamesOnDate.length, gamesAfterCompetitionFilter: eligibleGames.length, gamesAnalyzed: hydratedGames.length, gamesWithExistingStatisticalSnapshot: statsSnapshot.length, gamesStatisticallyHydrated: Math.max(0, hydratedGames.length - statsSnapshot.length), gamesRejectedBeforeHydration: gamesOnDate.length - eligibleGames.length, gamesWithStatisticalSnapshot, gamesWithoutStatisticalSnapshot: hydratedGames.length - gamesWithStatisticalSnapshot, statisticsExternalCalls: statsExternalAfter - statsExternalBefore, statisticsCacheHits: 0, statisticalCandidates: statistics.candidates.length, uniqueCandidateFixtures: unique.length, oddsMemoryCacheHits: 0, oddsRedisCacheHits: 0, oddsExternalCalls: 0, approvedCandidates: [], rejectedCandidates: [...statistics.rejected], rejectionReasons: {}, tickets: [] };
  const quotes = [];
  for (const game of unique) {
    const fixtureId = Number(game.fixture.id);
    let normalized = oddsService.getCachedOdds(fixtureId);
    if (normalized) { report.oddsMemoryCacheHits++; quotes.push(...cachedQuotesForFixture({ [fixtureId]: normalized }, fixtureId).quotes); continue; }
    if (sharedCache?.getNormalizedOdds) normalized = await sharedCache.getNormalizedOdds(fixtureId);
    if (normalized) { report.oddsRedisCacheHits++; quotes.push(...cachedQuotesForFixture({ [fixtureId]: normalized }, fixtureId).quotes); continue; }
    report.oddsExternalCalls++;
    normalized = await oddsService.get(fixtureId);
    if (normalized?.selections) quotes.push(...cachedQuotesForFixture({ [fixtureId]: normalized }, fixtureId).quotes);
    else report.rejectedCandidates.push({ fixtureId, reason: 'odds_service_unavailable' });
  }
  const result = buildCandidates(unique, quotes, [...new Set(statistics.candidates.map(item => item.marketKey))]);
  report.approvedCandidates = result.candidates;
  report.rejectedCandidates.push(...result.rejected);
  report.tickets = previewTickets(result.candidates);
  for (const item of report.rejectedCandidates) report.rejectionReasons[item.reason] = (report.rejectionReasons[item.reason] || 0) + 1;
  return report;
}

module.exports = { STAT_MARKETS, statisticCandidates, generateBilhetesPreview };
