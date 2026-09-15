function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function totalOdd(selections) {
  if (!selections.length || selections.some(item => item.odd == null || item.odd === '' || !Number.isFinite(Number(item.odd)) || Number(item.odd) <= 1)) return null;
  return Number(selections.reduce((total, item) => total * Number(item.odd), 1).toFixed(2));
}
function keyOf(item) { return item.id || `${item.kind || 'pick'}:${item.fixtureId}:${item.marketKey || item.market}:${item.playerId || ''}`; }
function fixtureKey(item) {
  const fixtureId = Number(item?.fixtureId);
  if (Number.isFinite(fixtureId) && fixtureId > 0) return `fixture:${fixtureId}`;
  return `match:${String(item?.match || '').trim().toLowerCase()}|${String(item?.fixtureDate || '').slice(0, 10)}`;
}
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

  // No modo geral, diversidade de PARTIDAS vem antes do score depois que uma partida já foi usada.
  // Se o filtro de score não trouxer jogos diferentes suficientes para preencher todas as sugestões,
  // amplia automaticamente para candidatos estatisticamente aprovados de score menor.
  if (normalizedScope !== 'specific') {
    const requiredUniqueFixtures = desired * lowLegs;
    const selectedKeys = new Set(filtered.map(keyOf));
    const selectedFixtures = new Set(filtered.map(fixtureKey));
    if (selectedFixtures.size < requiredUniqueFixtures) {
      const lowerScoreCandidates = scopedCandidates
        .filter(item => !selectedKeys.has(keyOf(item)))
        .sort(candidateOrder);
      for (const item of lowerScoreCandidates) {
        filtered.push(item);
        selectedKeys.add(keyOf(item));
        selectedFixtures.add(fixtureKey(item));
        floor = Math.min(floor, normalizedScore(item));
        if (selectedFixtures.size >= requiredUniqueFixtures) break;
      }
    }
  }

  // Mantém alguns mercados por partida, mas evita que 1 ou 2 jogos ocupem quase todo o pool.
  const perFixtureCount = new Map();
  const normalizedFiltered = [...new Map(filtered.map(item => [keyOf(item), { ...item, score: normalizedScore(item), reason: makeReason(item) }])).values()]
    .sort((a, b) => {
      if (normalizedScope === 'fixed' && targetId) {
        const af = Number(a.fixtureId) === targetId ? 0 : 1;
        const bf = Number(b.fixtureId) === targetId ? 0 : 1;
        if (af !== bf) return af - bf;
      }
      return candidateOrder(a, b);
    });
  const pool = normalizedFiltered.filter(item => {
    if (normalizedScope === 'specific') return true;
    const fk = fixtureKey(item);
    const used = perFixtureCount.get(fk) || 0;
    if (used >= 3) return false;
    perFixtureCount.set(fk, used + 1);
    return true;
  }).slice(0, 120);
  // Modo geral: monta os bilhetes por PARTIDA, não por combinação de mercados.
  // Assim que uma partida entra em um bilhete, ela sai totalmente da geração atual.
  // O score só ordena quais partidas serão vistas primeiro; não autoriza repetição.
  if (normalizedScope === 'all') {
    const byFixture = new Map();
    for (const item of pool) {
      const fk = fixtureKey(item);
      const list = byFixture.get(fk) || [];
      list.push(item);
      byFixture.set(fk, list);
    }

    // Dentro de cada partida, escolhe primeiro o melhor mercado disponível.
    for (const list of byFixture.values()) list.sort(candidateOrder);

    // Ordena PARTIDAS pela melhor oportunidade de cada uma.
    const fixtureGroups = [...byFixture.entries()]
      .map(([fk, items]) => ({ fk, items, best: items[0] }))
      .sort((a, b) => candidateOrder(a.best, b.best));

    const final = [];
    const usedFixtures = new Set();
    const usedPicks = new Set();
    let cursor = 0;

    // Tenta formar cada bilhete com partidas ainda não usadas.
    // Começa pelo número mínimo de pernas pedido; não repete jogo para "completar".
    while (final.length < desired) {
      const picked = [];
      while (picked.length < lowLegs && cursor < fixtureGroups.length) {
        const group = fixtureGroups[cursor++];
        if (usedFixtures.has(group.fk)) continue;

        // Escolhe o melhor mercado da partida que respeita a odd individual informada.
        // Mercados sem odd continuam permitidos para revisão manual.
        const candidate = group.items.find(item => {
          const odd = Number(item.odd);
          return !Number.isFinite(odd) || odd <= 1 || (odd >= lowOdd && odd <= highOdd);
        }) || group.items[0];

        picked.push(candidate);
        usedFixtures.add(group.fk);
        usedPicks.add(keyOf(candidate));
      }

      if (picked.length < lowLegs) break;

      // Se houver espaço até maxLegs, só adiciona pernas extras se ainda existirem
      // partidas inéditas e a odd combinada não estourar o teto configurado.
      while (picked.length < highLegs && cursor < fixtureGroups.length) {
        const group = fixtureGroups[cursor];
        if (usedFixtures.has(group.fk)) { cursor++; continue; }
        const candidate = group.items[0];
        const tentative = [...picked, candidate];
        const odd = totalOdd(tentative);
        if (odd != null && odd > highOdd) break;
        cursor++;
        picked.push(candidate);
        usedFixtures.add(group.fk);
        usedPicks.add(keyOf(candidate));
      }

      const odd = totalOdd(picked);
      // Se a odd combinada conhecida ficar abaixo do mínimo, ainda mantém o bilhete:
      // a prioridade aqui é descobrir partidas diferentes; a tela sinaliza odd pendente
      // quando necessário e a revisão final continua manual.
      final.push({
        id: `SUG-${final.length + 1}`,
        selections: picked.map(item => ({ ...item })),
        totalOdd: odd,
        score: ticketScore(picked),
        profile: String(profile || 'MODERADO').toUpperCase(),
        requiresOdds: picked.some(item => item.odd == null || item.odd === '' || !Number.isFinite(Number(item.odd)) || Number(item.odd) <= 1)
      });
    }

    const uniqueFixtures = usedFixtures.size;
    const uniquePicks = usedPicks.size;
    const insufficientUniqueFixtures = final.length < desired;
    return {
      tickets: final,
      poolSize: pool.length,
      requested: desired,
      generated: final.length,
      minScoreApplied: floor,
      requestedMinScore: requestedFloor,
      explored: fixtureGroups.length,
      scopeMode: normalizedScope,
      targetFixtureId: targetId,
      diversity: {
        uniqueFixtures,
        uniquePicks,
        maxPickUse: 1,
        maxFixtureUse: 1,
        noFixtureRepeat: true,
        insufficientUniqueFixtures,
        availableUniqueFixtures: fixtureGroups.length
      }
    };
  }

  // Modos "specific" e "fixed" mantêm a busca combinatória, pois nesses modos
  // a própria usuária escolheu uma partida para receber atenção especial.
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

  const final = [];
  const usedFixtures = new Set();
  const usedPicks = new Set();

  const canUseWithoutRepeatingFixture = ticket => {
    if (normalizedScope === 'specific') return true;
    return ticket.selections.every(item => !usedFixtures.has(fixtureKey(item)));
  };

  const addTicket = ticket => {
    final.push(ticket);
    for (const item of ticket.selections) {
      usedPicks.add(keyOf(item));
      usedFixtures.add(fixtureKey(item));
    }
  };

  const remaining = [...tickets];
  while (final.length < desired && remaining.length) {
    remaining.sort((a, b) =>
      b.score - a.score
      || (a.requiresOdds - b.requiresOdds)
      || Number(b.totalOdd || 0) - Number(a.totalOdd || 0)
    );
    const index = remaining.findIndex(canUseWithoutRepeatingFixture);
    if (index < 0) break;
    addTicket(remaining.splice(index, 1)[0]);
  }

  const uniqueFixtures = usedFixtures.size;
  const uniquePicks = usedPicks.size;
  const maxPickUse = normalizedScope === 'specific' ? desired : 1;
  const maxFixtureUse = normalizedScope === 'specific' ? desired : 1;
  const insufficientUniqueFixtures = normalizedScope !== 'specific' && final.length < desired;
  return {
    tickets: final,
    poolSize: pool.length,
    requested: desired,
    generated: final.length,
    minScoreApplied: floor,
    requestedMinScore: requestedFloor,
    explored,
    scopeMode: normalizedScope,
    targetFixtureId: targetId,
    diversity: { uniqueFixtures, uniquePicks, maxPickUse, maxFixtureUse, noFixtureRepeat: normalizedScope !== 'specific', insufficientUniqueFixtures }
  };
}
module.exports = { generateInternalTickets, totalOdd, profileFloor };
