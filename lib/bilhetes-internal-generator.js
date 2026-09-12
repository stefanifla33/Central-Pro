function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function totalOdd(selections) {
  if (!selections.length || selections.some(item => item.odd == null || item.odd === '' || !Number.isFinite(Number(item.odd)) || Number(item.odd) <= 1)) return null;
  return Number(selections.reduce((total, item) => total * Number(item.odd), 1).toFixed(2));
}
function keyOf(item) { return item.id || `${item.kind || 'pick'}:${item.fixtureId}:${item.marketKey || item.market}:${item.playerId || ''}`; }
function profileFloor(profile) {
  return { CONSERVADOR: 80, MODERADO: 72, AGRESSIVO: 64, LIVRE: 60 }[String(profile || '').toUpperCase()] || 72;
}
function normalizedScore(item) {
  const score = Number(item.score ?? item.analysis?.score ?? item.evidencePct ?? 0);
  return clamp(score, 0, 100);
}
function candidateOrder(a, b) {
  return normalizedScore(b) - normalizedScore(a)
    || Number(b.evidencePct || 0) - Number(a.evidencePct || 0)
    || Number(b.odd || 0) - Number(a.odd || 0);
}
function makeReason(item) {
  if (item.reason) return item.reason;
  const pct = Number(item.evidencePct || 0);
  if (item.kind === 'player') return `${item.playerName || 'Jogador'}: ${pct.toFixed(0)}% de frequência na amostra recente usada pelo gerador.`;
  return `${pct.toFixed(0)}% de frequência na evidência recente e score ${normalizedScore(item).toFixed(0)}/100.`;
}
function compatible(picked, candidate, allowSameFixture = false) {
  if (picked.some(item => keyOf(item) === keyOf(candidate))) return false;
  // Fora do modo jogo específico, uma perna por partida reduz correlação.
  if (!allowSameFixture && picked.some(item => Number(item.fixtureId) === Number(candidate.fixtureId))) return false;
  return true;
}
function ticketScore(selections) {
  if (!selections.length) return 0;
  const avg = selections.reduce((sum, item) => sum + normalizedScore(item), 0) / selections.length;
  const diversity = new Set(selections.map(item => item.kind)).size > 1 ? 2 : 0;
  return Number(Math.min(100, avg + diversity).toFixed(1));
}
function generateInternalTickets({ candidates = [], count = 5, minLegs = 2, maxLegs = 2, profile = 'MODERADO', minScore = 0, oddMin = 1.01, oddMax = 1000, scopeMode = 'all', targetFixtureId = null } = {}) {
  const desired = Math.min(50, Math.max(1, Number(count) || 5));
  const lowLegs = Math.min(12, Math.max(1, Number(minLegs) || 1));
  const highLegs = Math.min(12, Math.max(lowLegs, Number(maxLegs) || lowLegs));
  const requestedFloor = Math.max(profileFloor(profile), Number(minScore) || 0);
  let floor = requestedFloor;
  const lowOdd = Math.max(1.01, Number(oddMin) || 1.01);
  const highOdd = Math.max(lowOdd, Number(oddMax) || 1000);
  const normalizedScope = ['all', 'specific', 'fixed'].includes(scopeMode) ? scopeMode : 'all';
  const targetId = Number(targetFixtureId) || null;
  const scopedCandidates = normalizedScope === 'specific' && targetId
    ? (candidates || []).filter(item => Number(item.fixtureId) === targetId)
    : (candidates || []);
  let filtered = scopedCandidates.filter(item => normalizedScore(item) >= floor);
  // Para um jogo escolhido manualmente, tenta uma segunda faixa sem fabricar mercado:
  // só usa itens que já foram aprovados pela análise estatística do jogo.
  if (normalizedScope === 'specific' && !filtered.length && scopedCandidates.length) {
    floor = Math.max(60, Math.min(requestedFloor, requestedFloor - 12));
    filtered = scopedCandidates.filter(item => normalizedScore(item) >= floor);
  }
  const pool = [...new Map(filtered.map(item => [keyOf(item), { ...item, score: normalizedScore(item), reason: makeReason(item) }])).values()]
    .sort((a, b) => {
      if (normalizedScope === 'fixed' && targetId) {
        const af = Number(a.fixtureId) === targetId ? 0 : 1;
        const bf = Number(b.fixtureId) === targetId ? 0 : 1;
        if (af !== bf) return af - bf;
      }
      return candidateOrder(a, b);
    })
    .slice(0, 80);
  const tickets = [];
  const signatures = new Set();
  const usage = new Map();
  const maxExplored = 160000;
  const candidateTicketLimit = Math.min(2000, Math.max(200, desired * 50));
  let explored = 0;

  const accept = picked => {
    if (picked.length < lowLegs || picked.length > highLegs) return;
    if (normalizedScope === 'fixed' && targetId && !picked.some(item => Number(item.fixtureId) === targetId)) return;
    const odd = totalOdd(picked);
    if (odd != null && (odd < lowOdd || odd > highOdd)) return;
    const signature = picked.map(keyOf).sort().join('|');
    if (signatures.has(signature)) return;
    signatures.add(signature);
    tickets.push({
      id: `SUG-${tickets.length + 1}`,
      selections: picked.map(item => ({ ...item })),
      totalOdd: odd,
      score: ticketScore(picked),
      profile: String(profile || 'MODERADO').toUpperCase(),
      requiresOdds: picked.some(item => item.odd == null || item.odd === '' || !Number.isFinite(Number(item.odd)) || Number(item.odd) <= 1)
    });
  };

  function search(start, picked) {
    if (++explored > maxExplored || tickets.length >= candidateTicketLimit) return;
    if (picked.length >= lowLegs) accept(picked);
    if (picked.length >= highLegs) return;
    const orderedIndexes = [];
    for (let i = start; i < pool.length; i++) orderedIndexes.push(i);
    orderedIndexes.sort((ia, ib) => (usage.get(keyOf(pool[ia])) || 0) - (usage.get(keyOf(pool[ib])) || 0) || candidateOrder(pool[ia], pool[ib]));
    for (const i of orderedIndexes) {
      const candidate = pool[i];
      if (!compatible(picked, candidate, normalizedScope === 'specific')) continue;
      const next = [...picked, candidate];
      const knownOdd = totalOdd(next);
      if (knownOdd != null && knownOdd > highOdd * 1.08) continue;
      search(i + 1, next);
      if (tickets.length >= candidateTicketLimit || explored > maxExplored) break;
    }
  }
  search(0, []);

  tickets.sort((a, b) => b.score - a.score || (a.requiresOdds - b.requiresOdds) || Number(b.totalOdd || 0) - Number(a.totalOdd || 0));

  // Seleção final com diversidade: evita que os mesmos jogos/mercados dominem todos os bilhetes.
  const final = [];
  const pickUsage = new Map();
  const fixtureUsage = new Map();
  const fixtureSetUsage = new Map();
  const maxPickUse = desired <= 3 ? 1 : Math.max(2, Math.ceil(desired * 0.35));
  const maxFixtureUse = normalizedScope === 'specific' ? desired : Math.max(2, Math.ceil(desired * 0.55));

  const fixtureSetKey = ticket => [...new Set(ticket.selections.map(item => Number(item.fixtureId)))].sort((a,b)=>a-b).join('-');
  const repetitionPenalty = ticket => {
    let penalty = (fixtureSetUsage.get(fixtureSetKey(ticket)) || 0) * 14;
    for (const item of ticket.selections) {
      penalty += (pickUsage.get(keyOf(item)) || 0) * 11;
      if (normalizedScope !== 'specific') penalty += (fixtureUsage.get(Number(item.fixtureId)) || 0) * 4;
    }
    return penalty;
  };

  const canUseStrict = ticket => (normalizedScope === 'specific' || !(fixtureSetUsage.get(fixtureSetKey(ticket))))
    && ticket.selections.every(item =>
      (pickUsage.get(keyOf(item)) || 0) < maxPickUse
      && (normalizedScope === 'specific' || (fixtureUsage.get(Number(item.fixtureId)) || 0) < maxFixtureUse)
    );

  const addTicket = ticket => {
    final.push(ticket);
    fixtureSetUsage.set(fixtureSetKey(ticket), (fixtureSetUsage.get(fixtureSetKey(ticket)) || 0) + 1);
    for (const item of ticket.selections) {
      pickUsage.set(keyOf(item), (pickUsage.get(keyOf(item)) || 0) + 1);
      fixtureUsage.set(Number(item.fixtureId), (fixtureUsage.get(Number(item.fixtureId)) || 0) + 1);
    }
  };

  // Primeiro passe: aplica limites de repetição e reordena a cada escolha conforme o que já foi usado.
  const remaining = [...tickets];
  while (final.length < desired && remaining.length) {
    remaining.sort((a, b) =>
      (b.score - repetitionPenalty(b)) - (a.score - repetitionPenalty(a))
      || (a.requiresOdds - b.requiresOdds)
      || Number(b.totalOdd || 0) - Number(a.totalOdd || 0)
    );
    const index = remaining.findIndex(canUseStrict);
    if (index < 0) break;
    addTicket(remaining.splice(index, 1)[0]);
  }

  // Segundo passe: se o pool for pequeno, completa sem inventar bilhetes, mas ainda favorece novidade.
  while (final.length < desired && remaining.length) {
    remaining.sort((a, b) =>
      (b.score - repetitionPenalty(b) * 1.35) - (a.score - repetitionPenalty(a) * 1.35)
      || Number(b.totalOdd || 0) - Number(a.totalOdd || 0)
    );
    addTicket(remaining.shift());
  }

  const uniqueFixtures = new Set(final.flatMap(ticket => ticket.selections.map(item => Number(item.fixtureId)))).size;
  const uniquePicks = new Set(final.flatMap(ticket => ticket.selections.map(keyOf))).size;
  return { tickets: final, poolSize: pool.length, requested: desired, generated: final.length, minScoreApplied: floor, requestedMinScore: requestedFloor, explored, scopeMode: normalizedScope, targetFixtureId: targetId, diversity: { uniqueFixtures, uniquePicks, maxPickUse, maxFixtureUse } };
}
module.exports = { generateInternalTickets, totalOdd, profileFloor };
