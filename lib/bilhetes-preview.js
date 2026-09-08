const { MARKETS, BOOKMAKERS, validOdd } = require('./prematch-odds');

const MARKET_SELECTIONS = Object.freeze({
  over05: ['Total de gols', '+0.5 gols'], over15: ['Total de gols', '+1.5 gols'], over25: ['Total de gols', '+2.5 gols'],
  over05HT: ['Gols no 1º tempo', '+0.5 gol no 1º tempo'], btts: ['Ambas marcam', 'Sim'],
  homeWin: ['Resultado da partida', 'Mandante vence'], awayWin: ['Resultado da partida', 'Visitante vence'],
  homeOrDraw: ['Dupla chance', 'Mandante ou empate'], awayOrDraw: ['Dupla chance', 'Empate ou visitante'],
  homeWinEitherHalf: ['Vence algum dos tempos', 'Mandante vence pelo menos um tempo'], awayWinEitherHalf: ['Vence algum dos tempos', 'Visitante vence pelo menos um tempo'],
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
  const requested = (games || []).flatMap(game => game?.game && game?.marketKey ? [game] : (Array.isArray(marketKeys) ? marketKeys.map(marketKey => ({ game, marketKey })) : []));
  for (const request of requested) { const game = request.game || request; const marketKey = request.marketKey;
    const fixtureId = game.fixture?.id;
    if (!fixtureId) { rejected.push({ fixtureId: null, marketKey, reason: 'fixture_id_missing' }); continue; }
    const analysis = game.analyses?.[marketKey] || game.analysis || null;
    if (analysis && (Number(analysis.score) < 55 || !analysis.whyApproved)) { rejected.push({ fixtureId, marketKey, reason: !analysis.whyApproved ? 'analysis_not_approved' : 'analysis_below_quality_threshold', whyRejected: !analysis.whyApproved ? 'analysis_did_not_record_approval' : 'analysis_score_below_quality_threshold', analysis }); continue; }
    const result = exactQuote(quotes, fixtureId, marketKey);
    if (!result.quote) { rejected.push({ fixtureId, marketKey, match: `${game.teams?.home?.name || ''} x ${game.teams?.away?.name || ''}`.trim(), reason: result.reason }); continue; }
    const [marketName, selectionDisplay] = MARKET_SELECTIONS[marketKey] || [marketKey, marketKey];
    candidates.push({ fixtureId, competitionId: Number(game.league?.id) || null, fixtureDate: game.fixture.date, competition: game.league?.name || '', homeTeam: game.teams?.home, awayTeam: game.teams?.away, marketKey, marketName, selectionType: marketKey.startsWith('over') ? 'over' : 'yes', selectionDisplay, line: MARKET_LINES[marketKey] ?? null, bookmakerId: result.quote.bookmakerId, bookmakerName: result.quote.bookmakerName, odd: String(result.quote.odd), capturedAt: result.quote.capturedAt || result.quote.update || null, update: result.quote.update || null, marketId: result.quote.marketId, market: result.quote.marketName, selection: result.quote.selection, evidence: game.metrics || null, analysis });
  }
  return { candidates, rejected };
}

function calculateTotalOdd(candidates) { return Number(candidates.reduce((total, candidate) => total * Number(candidate.odd), 1).toFixed(4)); }
function candidateEvidencePercentage(candidate) {
  const metric = candidate.evidence?.[candidate.marketKey]?.evidence || candidate.evidence?.[candidate.marketKey];
  return Number(metric?.value || 0);
}
function candidateQuality(candidate) {
  if (candidate.analysis?.score != null) return candidate.analysis.score;
  const metric = candidate.evidence?.[candidate.marketKey]?.evidence || candidate.evidence?.[candidate.marketKey];
  const percentage = candidateEvidencePercentage(candidate);
  const hits = Number(metric?.hits || 0);
  const total = Number(metric?.total || candidate.evidence?.[candidate.marketKey]?.total || 0);
  const sampleBonus = Math.min(total, 10) * 0.35;
  return percentage + hits * 1.5 + sampleBonus;
}
// Peso de relevância usado no ranking geral. A oportunidade continua precisando
// de evidência forte; o peso serve para desempatar/privilegiar o melhor universo
// de jogos do dia, em vez de tratar Champions e ligas secundárias como iguais.
const LEAGUE_PRIORITY = new Map([
  [2, 40],   // Champions League
  [13, 38],  // Libertadores
  [39, 35],  // Premier League
  [140, 35], // La Liga
  [135, 35], // Serie A (Itália)
  [78, 35],  // Bundesliga
  [71, 34],  // Brasileirão Série A
  [3, 30],   // Europa League
  [848, 28], // Conference League
  [73, 27],  // Copa do Brasil
  [11, 26],  // Sul-Americana
  [61, 25],  // Ligue 1
  [72, 24]   // Brasileirão Série B
]);
const MIN_BILHETE_ODD = 1.28;
const MIN_BILHETE_EVIDENCE = 80;
const CONTINENTAL_LEAGUES = new Set([2, 3, 11, 13, 848]);
const CORNER_MARKETS = new Set(['cornersOver65', 'cornersOver75', 'cornersOver85', 'cornersOver95']);
const RESULT_MARKETS = new Set(['homeWin', 'awayWin', 'homeOrDraw', 'awayOrDraw', 'homeWinEitherHalf', 'awayWinEitherHalf']);

function candidateRank(candidate) {
  const leagueBonus = LEAGUE_PRIORITY.get(candidate.competitionId) || 0;
  const marketBonus = RESULT_MARKETS.has(candidate.marketKey) ? 2 : 0;
  return candidateQuality(candidate) + leagueBonus + marketBonus;
}

function findCombination(pool, min, max, low, high, usedSelections, usedFixtures, options = {}) {
  const target = (low + high) / 2;
  const maxPool = options.maxPool || 36;
  const minEvidencePercentage = Number(options.minEvidencePercentage || 0);
  const minCandidateOdd = Number(options.minCandidateOdd || 0);
  const ordered = pool
    .filter(candidate => !usedSelections.has(`${candidate.fixtureId}:${candidate.marketKey}`) && !usedFixtures.has(candidate.fixtureId))
    .filter(candidate => candidateEvidencePercentage(candidate) >= minEvidencePercentage)
    .filter(candidate => Number(candidate.odd) >= minCandidateOdd)
    .sort((a, b) => candidateRank(b) - candidateRank(a) || Number(b.odd) - Number(a.odd))
    .slice(0, maxPool);
  let best = null;
  let bestScore = -Infinity;
  let explored = 0;
  const MAX_EXPLORED = 50000;

  function evaluate(picked) {
    const odd = calculateTotalOdd(picked);
    if (odd < low || odd > high) return;
    const competitions = new Set(picked.map(item => item.competitionId).filter(Boolean)).size;
    const markets = new Set(picked.map(item => item.marketKey)).size;
    const averageQuality = picked.reduce((sum, item) => sum + candidateRank(item), 0) / picked.length;
    const closeness = 1 - Math.min(1, Math.abs(odd - target) / Math.max(target, 1));
    const score = averageQuality + competitions * 2.5 + markets * 1.25 + closeness * 4;
    if (score > bestScore) { bestScore = score; best = [...picked]; }
  }

  function search(start, picked, fixtures) {
    if (++explored > MAX_EXPLORED) return;
    if (picked.length >= min) evaluate(picked);
    if (picked.length === max) return;
    for (let i = start; i < ordered.length; i++) {
      const candidate = ordered[i];
      if (fixtures.has(candidate.fixtureId)) continue; // regra absoluta: 1 seleção por partida
      const nextOdd = calculateTotalOdd([...picked, candidate]);
      if (nextOdd > high * 1.15 && picked.length + 1 >= min) continue;
      const nextFixtures = new Set(fixtures); nextFixtures.add(candidate.fixtureId);
      search(i + 1, [...picked, candidate], nextFixtures);
    }
  }
  search(0, [], new Set());
  return best;
}

function assembleTickets(candidates) {
  const remaining = [...candidates], usedSelections = new Set(), usedFixtures = new Set(), tickets = [];
  const add = (type, picked) => {
    if (!picked?.length) return;
    if (new Set(picked.map(item => item.fixtureId)).size !== picked.length) return;
    const continentalNames = new Map([[2, 'CHAMPIONS_MULTIPLA'], [13, 'LIBERTADORES'], [11, 'SUL_AMERICANA'], [3, 'EUROPA_LEAGUE'], [848, 'CONFERENCE']]);
    const continentalIds = new Set(picked.filter(item => CONTINENTAL_LEAGUES.has(item.competitionId)).map(item => item.competitionId));
    if (type === 'CONTINENTAL_DO_DIA' && continentalIds.size === 1) type = continentalNames.get([...continentalIds][0]) || type;
    picked.forEach(item => { usedSelections.add(`${item.fixtureId}:${item.marketKey}`); usedFixtures.add(item.fixtureId); });
    tickets.push({ type, combinationType: 'MULTI_FIXTURE', combinedOddType: 'INDIVIDUAL_LEGS', selections: picked, totalOdd: calculateTotalOdd(picked) });
  };

  // O Bilhete do Dia é a vitrine principal: escolhe antes de qualquer bingo ou
  // perfil secundário. Pode ter 1, 2 ou 3 pernas; nunca recebe uma perna fraca
  // apenas para completar quantidade. Odds individuais muito baixas também são
  // descartadas porque acrescentam risco sem retorno proporcional.
  const mainPool = remaining.filter(item => !CORNER_MARKETS.has(item.marketKey));
  add('BILHETE_DO_DIA', findCombination(
    mainPool,
    1,
    3,
    MIN_BILHETE_ODD,
    3.2,
    usedSelections,
    usedFixtures,
    { minEvidencePercentage: MIN_BILHETE_EVIDENCE, minCandidateOdd: MIN_BILHETE_ODD }
  ));

  // Os bilhetes temáticos usam o que restou depois da melhor seleção do dia.
  for (const [leagueId, type] of [[2, 'BINGO_CHAMPIONS'], [11, 'BINGO_SUL_AMERICANA'], [13, 'BINGO_LIBERTADORES']]) {
    add(type, findCombination(remaining.filter(item => item.competitionId === leagueId), 2, 4, 2.4, 6, usedSelections, usedFixtures, { minEvidencePercentage: 70 }));
  }
  add('CONTINENTAL_DO_DIA', findCombination(remaining.filter(item => CONTINENTAL_LEAGUES.has(item.competitionId)), 2, 4, 1.8, 4.5, usedSelections, usedFixtures, { minEvidencePercentage: 70 }));

  const profiles = [
    ['CONSERVADOR', 1.55, 2.15, 2, 3, 80],
    ['ESCANTEIOS', 1.75, 3.5, 2, 4, 70],
    ['BINGO', 2.8, 6.5, 2, 5, 70],
    ['OUSADO', 3.5, 12, 2, 6, 60]
  ];
  for (const [type, low, high, min, max, minEvidencePercentage] of profiles) {
    const pool = type === 'ESCANTEIOS'
      ? remaining.filter(item => CORNER_MARKETS.has(item.marketKey))
      : remaining.filter(item => !CORNER_MARKETS.has(item.marketKey));
    add(type, findCombination(pool, min, max, low, high, usedSelections, usedFixtures, { minEvidencePercentage }));
  }
  return tickets;
}
function previewTickets(candidates) { return assembleTickets(candidates); }
module.exports = { MARKET_SELECTIONS, exactQuote, cachedQuotesForFixture, sharedCachedQuotesForFixture, buildCandidates, calculateTotalOdd, assembleTickets, previewTickets };
