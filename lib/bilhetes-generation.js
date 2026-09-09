const { MARKET_SELECTIONS, cachedQuotesForFixture, buildCandidates, previewTickets } = require('./bilhetes-preview');
const { cpSelectScannerFixtures } = require('../public/competition-config');
const { analyzeMatch, resolveMatchConsistency } = require('./bilhetes-analysis');
const { hydrateMatchContext } = require('./bilhetes-context');
const HISTORY_CONCURRENCY = 6;
async function mapWithConcurrency(items, limit, worker) {
  const output = new Array(items.length); let next = 0;
  async function run() { while (next < items.length) { const index = next++; output[index] = await worker(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run)); return output;
}

const STAT_MARKETS = Object.freeze(['over15', 'over25', 'btts', 'homeWin', 'awayWin', 'homeOrDraw', 'awayOrDraw', 'homeWinEitherHalf', 'awayWinEitherHalf', 'homeScores', 'awayScores', 'cornersOver85']);
function statisticCandidates(games) {
  const candidates = [], rejected = [];
  for (const game of games || []) {
    const metrics = game.metrics || game.sampleMetrics || {};
    const found = STAT_MARKETS.filter(key => {
      if (game.analyses?.[key]) return game.analyses[key].score >= 55 && game.analyses[key].componentsUsed >= 2;
      const metric = metrics[key]?.evidence || metrics[key];
      return metric && Number(metric.total || 0) >= (key.startsWith('corners') ? 6 : 8);
    });
    if (!found.length) { rejected.push({ fixtureId: game.fixture?.id || null, reason: 'insufficient_existing_statistical_evidence' }); continue; }
    for (const key of STAT_MARKETS.filter(key => game.analyses?.[key] && !found.includes(key))) rejected.push({ fixtureId: game.fixture?.id || null, marketKey: key, reason: 'analysis_below_quality_threshold', analysis: game.analyses[key] });
    for (const marketKey of found) candidates.push({ game: game.analyses ? { ...game, analysis: game.analyses[marketKey] } : game, marketKey });
  }
  return { candidates, rejected };
}

async function generateBilhetesPreview({ games, date, oddsService, sharedCache, football, apiUsageDiagnostic }) {
  const gamesOnDate = (games || []).filter(game => game.fixture?.status?.short === 'NS' && (!date || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(game.fixture.date)) === date) && Date.parse(game.fixture.date) >= Date.now() + (2 * 60 * 60 * 1000));
  let eligibleGames = cpSelectScannerFixtures(gamesOnDate);
  const standingsCache = new Map();
  if (football) eligibleGames = await hydrateMatchContext(eligibleGames, { football, standingsCache });
  const statsSnapshot = eligibleGames.filter(game => game.metrics || game.sampleMetrics);
  const hydrated = [];
  const statsExternalBefore = apiUsageDiagnostic?.externalTotal || 0;
  const teams = [...new Map(eligibleGames.flatMap(game => [game.teams?.home, game.teams?.away]).filter(team => team?.id).map(team => [Number(team.id), team])).values()];
  if (football && teams.length) {
    const histories = new Map();
    await mapWithConcurrency(teams, HISTORY_CONCURRENCY, async team => { try { const response = await football(`/fixtures?team=${team.id}&last=10&timezone=America%2FSao_Paulo`, 900000); histories.set(team.id, (response.response || []).filter(item => ['FT','AET','PEN'].includes(item.fixture?.status?.short))); } catch { histories.set(team.id, []); } });
    for (const game of eligibleGames) {
      const homeHistory = (histories.get(Number(game.teams.home.id)) || []).slice(0, 10);
      const awayHistory = (histories.get(Number(game.teams.away.id)) || []).slice(0, 10);
      const all = [...homeHistory, ...awayHistory].slice(0, 20);
      const pct = (values, predicate) => { const hits = values.filter(predicate).length; return { value: values.length ? hits / values.length * 100 : 0, total: values.length, hits }; };
      const teamResult = (item, teamId) => {
        const isHome = Number(item.teams?.home?.id) === Number(teamId);
        const gf = Number(isHome ? item.goals?.home : item.goals?.away), ga = Number(isHome ? item.goals?.away : item.goals?.home);
        if (!Number.isFinite(gf) || !Number.isFinite(ga)) return null;
        return { won: gf > ga, notLost: gf >= ga, scored: gf > 0 };
      };
      const wonEitherHalf = (item, teamId) => {
        const isHome = Number(item.teams?.home?.id) === Number(teamId);
        const htFor = Number(isHome ? item.score?.halftime?.home : item.score?.halftime?.away);
        const htAgainst = Number(isHome ? item.score?.halftime?.away : item.score?.halftime?.home);
        const ftFor = Number(isHome ? item.goals?.home : item.goals?.away);
        const ftAgainst = Number(isHome ? item.goals?.away : item.goals?.home);
        if (![htFor, htAgainst, ftFor, ftAgainst].every(Number.isFinite)) return null;
        const shFor = ftFor - htFor, shAgainst = ftAgainst - htAgainst;
        return htFor > htAgainst || shFor > shAgainst;
      };
      const goalEvidence = key => pct(all.filter(item => Number.isFinite(Number(item.goals?.home)) && Number.isFinite(Number(item.goals?.away))), item => {
        const total = Number(item.goals.home) + Number(item.goals.away);
        return key === 'btts' ? Number(item.goals.home) > 0 && Number(item.goals.away) > 0 : total >= (key === 'over25' ? 3 : 2);
      });
      const homeResults = homeHistory.map(item => teamResult(item, game.teams.home.id)).filter(Boolean);
      const awayResults = awayHistory.map(item => teamResult(item, game.teams.away.id)).filter(Boolean);
      const metrics = {
        over15: { evidence: goalEvidence('over15') }, over25: { evidence: goalEvidence('over25') }, btts: { evidence: goalEvidence('btts') },
        homeWin: { evidence: pct(homeResults, x => x.won) }, awayWin: { evidence: pct(awayResults, x => x.won) },
        homeOrDraw: { evidence: pct(homeResults, x => x.notLost) }, awayOrDraw: { evidence: pct(awayResults, x => x.notLost) },
        homeWinEitherHalf: { evidence: pct(homeHistory.map(item => wonEitherHalf(item, game.teams.home.id)).filter(value => value !== null), Boolean) },
        awayWinEitherHalf: { evidence: pct(awayHistory.map(item => wonEitherHalf(item, game.teams.away.id)).filter(value => value !== null), Boolean) },
        homeScores: { evidence: pct(homeResults, x => x.scored) }, awayScores: { evidence: pct(awayResults, x => x.scored) }
      };
      const analyses = {};
      for (const marketKey of STAT_MARKETS) analyses[marketKey] = analyzeMatch({ ...game, marketKey }, { [game.teams.home.id]: homeHistory, [game.teams.away.id]: awayHistory });
      hydrated.push({ ...game, metrics, analyses, analysis: analyses });
    }
  }
  const hydratedGames = hydrated.length ? hydrated : eligibleGames;
  const statsExternalAfter = apiUsageDiagnostic?.externalTotal || statsExternalBefore;
  const statistics = statisticCandidates(hydratedGames);
  const unique = [...new Map(statistics.candidates.map(item => [Number(item.game.fixture.id), item.game])).values()];
  const gamesWithStatisticalSnapshot = eligibleGames.filter(game => game.metrics || game.sampleMetrics).length;
  const uniqueLeagueSeasons = new Set(eligibleGames.map(game => `${game.league?.id}:${game.league?.season}`));
  const report = { date: date || null, fixturesFound: gamesOnDate.length, gamesAfterCompetitionFilter: eligibleGames.length, gamesAnalyzed: hydratedGames.length, uniqueTeams: teams.length, uniqueLeagueSeasons: uniqueLeagueSeasons.size, fixturesReachingOdds: unique.length, gamesWithExistingStatisticalSnapshot: statsSnapshot.length, gamesStatisticallyHydrated: Math.max(0, hydratedGames.length - statsSnapshot.length), gamesRejectedBeforeHydration: gamesOnDate.length - eligibleGames.length, gamesWithStatisticalSnapshot, gamesWithoutStatisticalSnapshot: hydratedGames.length - gamesWithStatisticalSnapshot, statisticsExternalCalls: statsExternalAfter - statsExternalBefore, statisticsCacheHits: 0, statisticalCandidates: statistics.candidates.length, uniqueCandidateFixtures: unique.length, oddsMemoryCacheHits: 0, oddsRedisCacheHits: 0, oddsExternalCalls: 0, individuallyQualified: 0, consistencyRejected: [], approvedCandidates: [], rejectedCandidates: [...statistics.rejected], rejectionReasons: {}, tickets: [] };
  const quotes = [];
  for (const game of unique) {
    const fixtureId = Number(game.fixture.id);
    let normalized = oddsService.getCachedOdds(fixtureId);
    if (normalized) { report.oddsMemoryCacheHits++; quotes.push(...cachedQuotesForFixture({ [fixtureId]: normalized }, fixtureId).quotes); continue; }
    if (sharedCache?.getNormalizedOdds) normalized = await sharedCache.getNormalizedOdds(fixtureId);
    if (normalized) { report.oddsRedisCacheHits++; quotes.push(...cachedQuotesForFixture({ [fixtureId]: normalized }, fixtureId).quotes); continue; }
    report.oddsExternalCalls++;
    normalized = await oddsService.get(fixtureId, { fixture: game.fixture });
    if (normalized?.selections) quotes.push(...cachedQuotesForFixture({ [fixtureId]: normalized }, fixtureId).quotes);
    else report.rejectedCandidates.push({ fixtureId, reason: 'odds_service_unavailable' });
  }
  const individuallyQualified = [...new Map(statistics.candidates.map(item => [`${item.game.fixture?.id}:${item.marketKey}`, item])).values()];
  const consistencyByFixture = new Map();
  for (const group of [...new Set(individuallyQualified.map(item => Number(item.game.fixture?.id)))]) {
    const consistency = resolveMatchConsistency(individuallyQualified.filter(item => Number(item.game.fixture?.id) === group)); consistencyByFixture.set(group, consistency);
    report.consistencyRejected = (report.consistencyRejected || []).concat(consistency.rejected.map(item => ({ fixtureId: group, marketKey: item.marketKey, reason: item.reason, whyRejected: item.whyRejected, matchConsistency: consistency })));
  }
  const qualifiedRequests = individuallyQualified.filter(item => !consistencyByFixture.get(Number(item.game.fixture?.id)).rejected.some(rejected => rejected.marketKey === item.marketKey));
  report.individuallyQualified = individuallyQualified.length;
  report.consistencyRejectedCount = (report.consistencyRejected || []).length;
  report.matchConsistency = Object.fromEntries([...consistencyByFixture].map(([id, value]) => [id, value]));
  const result = buildCandidates(qualifiedRequests, quotes);
  report.approvedCandidates = result.candidates.map(candidate => ({ ...candidate, analysis: candidate.analysis || null, matchConsistency: report.matchConsistency[candidate.fixtureId] || null }));
  report.rejectedCandidates.push(...result.rejected);
  report.rejectedCandidates.push(...(report.consistencyRejected || []));
  report.tickets = previewTickets(result.candidates);
  for (const item of report.rejectedCandidates) report.rejectionReasons[item.reason] = (report.rejectionReasons[item.reason] || 0) + 1;
  return report;
}

function compactAnalysis(analysis) { if (!analysis) return null; return { score: analysis.score, componentsUsed: analysis.componentsUsed, sampleSizes: analysis.sampleSizes, whyApproved: analysis.whyApproved, signals: analysis.signals ? { unavailable: analysis.signals.unavailable } : undefined }; }
function compactCandidate(candidate, consistencyByFixture = null) { const fixtureId = candidate.fixtureId; return { fixtureId, competitionId: candidate.competitionId, fixtureDate: candidate.fixtureDate, competition: candidate.competition, homeTeam: { id: candidate.homeTeam?.id, name: candidate.homeTeam?.name }, awayTeam: { id: candidate.awayTeam?.id, name: candidate.awayTeam?.name }, marketKey: candidate.marketKey, marketName: candidate.marketName, selectionType: candidate.selectionType, selectionDisplay: candidate.selectionDisplay, line: candidate.line, bookmakerId: candidate.bookmakerId, bookmakerName: candidate.bookmakerName, odd: candidate.odd, capturedAt: candidate.capturedAt, update: candidate.update, marketId: candidate.marketId, market: candidate.market, selection: candidate.selection, evidence: candidate.evidence?.[candidate.marketKey]?.evidence || candidate.evidence?.[candidate.marketKey] || null, analysis: compactAnalysis(candidate.analysis), ...(consistencyByFixture && Object.prototype.hasOwnProperty.call(consistencyByFixture, fixtureId) ? { consistencyRef: Number(fixtureId) } : {}) }; }
function compactRejection(item) { return { fixtureId: item.fixtureId, marketKey: item.marketKey, match: item.match, reason: item.reason, whyRejected: item.whyRejected, analysis: compactAnalysis(item.analysis), consistencyRef: item.matchConsistency && item.fixtureId != null ? Number(item.fixtureId) : undefined }; }
function compactConsistency(value) { if (!value) return null; return { score: value.score, conflicts: value.conflicts, agreements: value.agreements, dominantSignals: value.dominantSignals, warnings: value.warnings, decisions: value.decisions, qualified: (value.qualified || []).map(item => ({ fixtureId: item.game?.fixture?.id, marketKey: item.marketKey, score: item.game?.analysis?.score || item.analysis?.score })) , rejected: (value.rejected || []).map(item => ({ marketKey: item.marketKey, reason: item.reason, whyRejected: item.whyRejected })) }; }
function compactPreviewReport(report) { const { matchConsistency, ...base } = report; const consistencyByFixture = Object.fromEntries(Object.entries(matchConsistency || {}).map(([id, value]) => [id, compactConsistency(value)])); return { ...base, consistencyByFixture, consistencyRejected: (report.consistencyRejected || []).map(compactRejection), approvedCandidates: (report.approvedCandidates || []).map(item => compactCandidate(item, consistencyByFixture)), rejectedCandidates: (report.rejectedCandidates || []).map(compactRejection), tickets: (report.tickets || []).map(ticket => ({ ...ticket, selections: (ticket.selections || []).map(item => compactCandidate(item, consistencyByFixture)) })) }; }
module.exports = { STAT_MARKETS, statisticCandidates, generateBilhetesPreview, compactPreviewReport, compactCandidate };
