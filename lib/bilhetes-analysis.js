const RESULT_MARKETS = new Set(['homeWin', 'awayWin', 'homeOrDraw', 'awayOrDraw', 'homeWinEitherHalf', 'awayWinEitherHalf']);
const CORNER_MARKETS = new Set(['cornersOver65', 'cornersOver75', 'cornersOver85', 'cornersOver95']);

const finite = value => Number.isFinite(Number(value));
const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const pct = (values, predicate) => {
  const valid = values.filter(Boolean); if (!valid.length) return { value: null, hits: null, total: 0 };
  const hits = valid.filter(predicate).length; return { value: hits / valid.length * 100, hits, total: valid.length };
};
function teamRows(history, teamId, venue) {
  return (history || []).map(item => {
    const isHome = Number(item.teams?.home?.id) === Number(teamId);
    if (venue === 'home' && !isHome || venue === 'away' && isHome) return null;
    const gf = Number(isHome ? item.goals?.home : item.goals?.away), ga = Number(isHome ? item.goals?.away : item.goals?.home);
    if (!finite(gf) || !finite(ga)) return null;
    return { gf, ga, won: gf > ga, draw: gf === ga, notLost: gf >= ga, scored: gf > 0, conceded: ga > 0, btts: gf > 0 && ga > 0, over15: gf + ga >= 2, over25: gf + ga >= 3, clean: ga === 0 };
  }).filter(Boolean);
}
function form(rows) {
  const recent = rows.slice(0, 10), last5 = recent.slice(0, 5), weights = recent.map((_, i) => Math.pow(0.85, i));
  const weighted = predicate => { const usable = recent.map((r, i) => predicate(r) == null ? null : [predicate(r) ? 1 : 0, weights[i]]).filter(Boolean); return usable.length ? usable.reduce((s, x) => s + x[0] * x[1], 0) / usable.reduce((s, x) => s + x[1], 0) * 100 : null; };
  const metric = key => ({ ...pct(recent, r => r[key]), recent5: pct(last5, r => r[key]), weighted: weighted(r => r[key]) });
  return { sampleSize: recent.length, last5: last5.length, wins: pct(recent, r => r.won), draws: pct(recent, r => r.draw), losses: pct(recent, r => !r.won && !r.draw), goalsFor: mean(recent.map(r => r.gf)), goalsAgainst: mean(recent.map(r => r.ga)), notLost: metric('notLost'), scored: metric('scored'), conceded: metric('conceded'), btts: metric('btts'), over15: metric('over15'), over25: metric('over25'), cleanSheets: metric('clean') };
}
const val = (f, key, fallback = null) => f?.[key]?.weighted ?? f?.[key]?.value ?? fallback;
function analyzeMatch(game, histories = {}) {
  const home = Number(game.teams?.home?.id), away = Number(game.teams?.away?.id);
  const overall = { home: form(teamRows(histories[home], home)), away: form(teamRows(histories[away], away)) };
  const venue = { home: form(teamRows(histories[home], home, 'home')), away: form(teamRows(histories[away], away, 'away')) };
  const signals = { positive: [], negative: [], unavailable: [], divergences: [] };
  const components = [];
  const add = (label, value, threshold = 60) => { if (value == null) signals.unavailable.push(label); else { components.push(value); (value >= threshold ? signals.positive : signals.negative).push(label); } };
  const market = game.marketKey || 'over15';
  if (CORNER_MARKETS.has(market)) {
    const suffix = market.replace('cornersOver', 'over'); const metric = game.cornerMetrics?.[suffix];
    if (metric?.value != null) add(`corners.${suffix}`, metric.value); else signals.unavailable.push('corner_statistics_unavailable');
  }
  else if (market.startsWith('cardsOver')) {
    const metric = game.cardMetrics?.[market];
    if (metric?.value != null) add(`cards.${market}`, metric.value); else signals.unavailable.push('card_statistics_unavailable');
  }
  else if (market === 'btts') { add('home.btts', val(venue.home, 'btts')); add('away.btts', val(venue.away, 'btts')); add('home.scored', val(venue.home, 'scored')); add('away.scored', val(venue.away, 'scored')); }
  else if (market === 'over15' || market === 'over25') { add(`home.${market}`, val(venue.home, market)); add(`away.${market}`, val(venue.away, market)); add('home.recent', val(venue.home, 'over15')); add('away.recent', val(venue.away, 'over15')); }
  else { const key = market.includes('Win') && !market.includes('Either') ? (market.startsWith('home') ? 'home' : 'away') : null; if (key) { add(`${key}.venue.notLost`, val(venue[key], 'notLost')); add(`${key}.venue.wins`, val(venue[key], 'wins')); add(`${key}.overall.notLost`, val(overall[key], 'notLost')); } }
  if (market.startsWith('home') || market === 'homeOrDraw') { if (venue.home.sampleSize && overall.home.sampleSize && val(venue.home, 'notLost') < val(overall.home, 'notLost') - 15) signals.divergences.push('overall_good_but_home_form_weaker'); }
  if (market.startsWith('away') || market === 'awayOrDraw') { if (venue.away.sampleSize && overall.away.sampleSize && val(venue.away, 'notLost') < val(overall.away, 'notLost') - 15) signals.divergences.push('overall_good_but_away_form_weaker'); }
  const samples = [venue.home.sampleSize, venue.away.sampleSize].filter(Boolean); const sampleQuality = samples.length ? Math.min(1, Math.min(...samples) / 10) : 0;
  const agreement = components.length ? Math.max(0, 100 - (Math.max(...components) - Math.min(...components))) : 0;
  const analysisScore = components.length ? Math.round((mean(components) * 0.55 + agreement * 0.3 + sampleQuality * 100 * 0.15)) : 0;
  const standings = game.standings || (game.homeStanding || game.awayStanding ? { home: game.homeStanding || null, away: game.awayStanding || null } : null);
  const competitionContext = standings ? { available: true, teams: standings } : { available: false, reason: 'standings_not_present_in_fixture_snapshot' };
  const warnings = []; if (components.length < 2) warnings.push('limited_market_components'); if (sampleQuality < 0.5) warnings.push('small_relevant_sample');
  const cappedScore = components.length < 2 ? Math.min(analysisScore, 54) : Math.min(analysisScore, 100);
  return { score: cappedScore, confidenceScore: cappedScore, sampleQuality, signals, warnings, componentsUsed: components.length, overall, venue, recentForm: { home: overall.home, away: overall.away }, competitionContext, marketAnalysis: { market, score: cappedScore }, sampleSizes: { overall: { home: overall.home.sampleSize, away: overall.away.sampleSize }, venue: { home: venue.home.sampleSize, away: venue.away.sampleSize } }, whyApproved: cappedScore >= 55 ? 'múltiplos sinais específicos do mercado concordam com amostra disponível' : null };
}
module.exports = { analyzeMatch, form, teamRows };

function resolveMatchConsistency(requests) {
  const items = [...(requests || [])], conflicts = [], agreements = [], decisions = [];
  const winners = items.filter(x => ['homeWin', 'awayWin'].includes(x.marketKey));
  const home = winners.find(x => x.marketKey === 'homeWin'), away = winners.find(x => x.marketKey === 'awayWin');
  const rejected = new Set();
  if (home && away) {
    const delta = Math.abs(Number(home.game.analysis?.score || 0) - Number(away.game.analysis?.score || 0));
    conflicts.push({ markets: ['homeWin', 'awayWin'], scores: { homeWin: home.game.analysis?.score, awayWin: away.game.analysis?.score } });
    if (delta >= 10) { const loser = home.game.analysis.score > away.game.analysis.score ? away : home; rejected.add(loser); decisions.push({ type: 'dominant_result_side', kept: home.game.analysis.score > away.game.analysis.score ? 'homeWin' : 'awayWin', rejected: loser.marketKey, scoreDifference: delta, reason: 'vantagem objetiva de score igual ou superior a 10 pontos' }); }
    else { rejected.add(home); rejected.add(away); decisions.push({ type: 'inconclusive_result', rejected: ['homeWin', 'awayWin'], scoreDifference: delta, reason: 'scores próximos não sustentam vencedor único' }); }
  }
  const overs = items.filter(x => ['over15', 'over25'].includes(x.marketKey)); if (overs.length > 1) agreements.push({ markets: overs.map(x => x.marketKey), reason: 'linhas de gols compatíveis' });
  const btts = items.find(x => x.marketKey === 'btts'); if (btts && items.some(x => ['homeScores', 'awayScores'].includes(x.marketKey))) agreements.push({ markets: ['btts', ...items.filter(x => ['homeScores', 'awayScores'].includes(x.marketKey)).map(x => x.marketKey)], reason: 'BTTS possui sinais de marcação dos dois lados' });
  return { score: rejected.size ? 100 - rejected.size * 25 : 100, conflicts, agreements, dominantSignals: decisions.filter(x => x.type === 'dominant_result_side'), warnings: decisions.some(x => x.type === 'inconclusive_result') ? ['resultado_inconclusivo'] : [], decisions, qualified: items.filter(x => !rejected.has(x)), rejected: items.filter(x => rejected.has(x)).map(x => ({ ...x, reason: 'cross_market_inconsistency', whyRejected: 'mercados mutuamente exclusivos sem vantagem suficientemente clara' })) };
}
module.exports.resolveMatchConsistency = resolveMatchConsistency;
