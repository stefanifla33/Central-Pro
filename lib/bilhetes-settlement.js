const FINAL_STATUSES = new Set(['FT', 'AET', 'PEN']);

function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function teamStat(statistics, teamId, names) {
  const row = (statistics || []).find(x => Number(x.team?.id) === Number(teamId));
  if (!row) return null;
  const wanted = new Set(names.map(x => x.toLowerCase()));
  const item = (row.statistics || []).find(x => wanted.has(String(x.type || '').toLowerCase()));
  return num(item?.value);
}
function evaluateSelection(selection, fixture, statistics = []) {
  const home = num(fixture.goals?.home), away = num(fixture.goals?.away);
  if (home == null || away == null) return null;
  const key = selection.marketKey;
  const line = num(selection.line);
  const htHome = num(fixture.score?.halftime?.home), htAway = num(fixture.score?.halftime?.away);
  const secondHome = htHome == null ? null : home - htHome, secondAway = htAway == null ? null : away - htAway;
  if (key === 'over15') return home + away > 1.5;
  if (key === 'over25') return home + away > 2.5;
  if (key === 'btts') return home > 0 && away > 0;
  if (key === 'homeWin') return home > away;
  if (key === 'awayWin') return away > home;
  if (key === 'homeOrDraw') return home >= away;
  if (key === 'awayOrDraw') return away >= home;
  if (key === 'homeScores') return home > 0;
  if (key === 'awayScores') return away > 0;
  if (key === 'homeWinEitherHalf') return htHome != null && htAway != null && ((htHome > htAway) || (secondHome > secondAway));
  if (key === 'awayWinEitherHalf') return htHome != null && htAway != null && ((htAway > htHome) || (secondAway > secondHome));
  if (key === 'cornersOver85') {
    const h = teamStat(statistics, fixture.teams?.home?.id, ['Corner Kicks', 'Corners']);
    const a = teamStat(statistics, fixture.teams?.away?.id, ['Corner Kicks', 'Corners']);
    if (h == null || a == null) return null;
    return h + a > (line == null ? 8.5 : line);
  }
  return null;
}
async function settleOpenTickets({ store, football, now = new Date() }) {
  const open = await store.listByStatus('OPEN');
  const waitingData = await store.listByStatus('WAITING_DATA');
  const tickets = [...open, ...waitingData];
  const fixtureCache = new Map(), statsCache = new Map();
  let green = 0, red = 0, waiting = 0, unchanged = 0;
  for (const ticket of tickets) {
    const results = [];
    let needsData = false, allFinal = true;
    for (const selection of ticket.selections || []) {
      const id = Number(selection.fixtureId);
      if (!fixtureCache.has(id)) fixtureCache.set(id, football(`/fixtures?id=${id}`, 30_000).then(x => x.response?.[0] || null));
      const fixture = await fixtureCache.get(id);
      if (!fixture || !FINAL_STATUSES.has(fixture.fixture?.status?.short)) { allFinal = false; continue; }
      let statistics = [];
      if (selection.marketKey === 'cornersOver85') {
        if (!statsCache.has(id)) statsCache.set(id, football(`/fixtures/statistics?fixture=${id}`, 300_000).then(x => x.response || []).catch(() => []));
        statistics = await statsCache.get(id);
      }
      const value = evaluateSelection(selection, fixture, statistics);
      if (value == null) needsData = true; else results.push(value);
    }
    if (!allFinal) { unchanged++; continue; }
    const status = needsData || results.length !== (ticket.selections || []).length ? 'WAITING_DATA' : results.every(Boolean) ? 'GREEN' : 'RED';
    await store.update(ticket.id, { status, settled_at: status === 'WAITING_DATA' ? null : now.toISOString() });
    if (status === 'GREEN') green++; else if (status === 'RED') red++; else waiting++;
  }
  return { checked: tickets.length, green, red, waiting, unchanged };
}
module.exports = { FINAL_STATUSES, evaluateSelection, settleOpenTickets };
