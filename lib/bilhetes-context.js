const fs = require('fs');
const path = require('path');

function normalizeStandings(payload) {
  const groups = payload?.response?.[0]?.league?.standings || payload?.league?.standings || [];
  const rows = Array.isArray(groups) ? groups.flat() : [];
  return rows.map(row => { const t = row.team || {}; const all = row.all || {}; return { teamId: Number(t.id), position: Number(row.rank) || null, points: Number.isFinite(Number(row.points)) ? Number(row.points) : null, played: Number.isFinite(Number(all.played)) ? Number(all.played) : null, goalDifference: Number.isFinite(Number(row.goalsDiff)) ? Number(row.goalsDiff) : null, zone: row.description || null }; }).filter(row => row.teamId);
}
function cornerMetricsFromHistory(history, homeId, awayId, sample = 10) {
  const fixtures = history?.fixtures || history || {};
  const rows = Object.values(fixtures).filter(item => item?.complete && Array.isArray(item.teams));
  const side = (teamId, venue) => rows.filter(item => { const f = item.fixture?.teams || item.fixture?.teams; const isHome = Number(f?.home?.id) === Number(teamId); return venue === 'home' ? isHome : !isHome && Number(f?.away?.id) === Number(teamId); }).map(item => { const own = item.teams.find(t => Number(t.teamId) === Number(teamId))?.corners; const opp = item.teams.find(t => Number(t.teamId) !== Number(teamId))?.corners; return Number.isFinite(Number(own)) && Number.isFinite(Number(opp)) ? { own: Number(own), against: Number(opp), total: Number(own) + Number(opp) } : null; }).filter(Boolean).slice(-sample);
  const h = side(homeId, 'home'), a = side(awayId, 'away'), all = [...h, ...a];
  const frequency = line => { const valid = all.length; if (!valid) return null; const hits = all.filter(x => x.total > line).length; return { value: hits * 100 / valid, hits, total: valid }; };
  const average = rows => rows.length ? { value: rows.reduce((s, x) => s + x.own, 0) / rows.length, total: rows.length } : null;
  return { home: { sampleSize: h.length, average: average(h), conceded: h.length ? { value: h.reduce((s, x) => s + x.against, 0) / h.length, total: h.length } : null }, away: { sampleSize: a.length, average: average(a), conceded: a.length ? { value: a.reduce((s, x) => s + x.against, 0) / a.length, total: a.length } : null }, over65: frequency(6.5), over75: frequency(7.5), over85: frequency(8.5), over95: frequency(9.5), sampleSize: all.length, source: 'corner-history' };
}
function loadCornerHistory(file = path.join(__dirname, '..', 'data', 'corner-history.json')) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
async function hydrateMatchContext(games, { football, standingsCache = new Map(), cornerHistory = loadCornerHistory(), season } = {}) {
  const result = [...(games || [])];
  for (const game of result) {
    const leagueId = Number(game.league?.id), leagueSeason = Number(game.league?.season || season);
    if (football && leagueId && leagueSeason) {
      const key = `${leagueId}:${leagueSeason}`;
      if (!standingsCache.has(key)) standingsCache.set(key, Promise.resolve(football(`/standings?league=${leagueId}&season=${leagueSeason}`, 3_600_000)).then(normalizeStandings).catch(() => []));
      const rows = await standingsCache.get(key); const byTeam = new Map(rows.map(row => [row.teamId, row]));
      game.homeStanding = byTeam.get(Number(game.teams?.home?.id)) || null; game.awayStanding = byTeam.get(Number(game.teams?.away?.id)) || null; game.competitionContext = { available: rows.length > 0, standingsSampleSize: rows.length };
    }
    const corners = cornerMetricsFromHistory(cornerHistory, game.teams?.home?.id, game.teams?.away?.id);
    if (corners.sampleSize) game.cornerMetrics = corners;
  }
  return result;
}
module.exports = { normalizeStandings, cornerMetricsFromHistory, hydrateMatchContext, loadCornerHistory };
