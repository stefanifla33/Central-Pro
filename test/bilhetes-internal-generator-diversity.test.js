const assert = require('assert');
const { generateInternalTickets } = require('../lib/bilhetes-internal-generator');

function candidate(fixtureId, score, odd = 1.4) {
  return {
    id: `GAME:${fixtureId}:over15`,
    kind: 'game',
    fixtureId,
    fixtureDate: '2026-09-15T18:00:00Z',
    match: `Time ${fixtureId} A x Time ${fixtureId} B`,
    marketKey: 'over15',
    market: 'Total de gols',
    selection: 'Mais de 1.5 gols',
    odd,
    score,
    evidencePct: score,
  };
}

const candidates = [
  candidate(101, 94),
  candidate(102, 91),
  candidate(103, 88),
  candidate(104, 82),
  candidate(105, 69), // abaixo do piso MODERADO: deve entrar para ampliar diversidade
  candidate(106, 61), // abaixo do piso MODERADO: deve entrar para ampliar diversidade
  candidate(107, 55),
];

const result = generateInternalTickets({
  candidates,
  count: 3,
  minLegs: 2,
  maxLegs: 2,
  profile: 'MODERADO',
  oddMin: 1.01,
  oddMax: 10,
  scopeMode: 'all',
});

assert.strictEqual(result.generated, 3, 'deve gerar 3 bilhetes quando há 6+ partidas diferentes');
const fixtureIds = result.tickets.flatMap(ticket => ticket.selections.map(item => item.fixtureId));
assert.strictEqual(new Set(fixtureIds).size, fixtureIds.length, 'nenhuma partida pode repetir entre bilhetes da mesma geração');
assert.ok(fixtureIds.some(id => id === 105 || id === 106 || id === 107), 'deve explorar jogos abaixo do piso quando necessário para diversidade');
assert.strictEqual(result.diversity.maxFixtureUse, 1);
assert.strictEqual(result.diversity.noFixtureRepeat, true);

const shortResult = generateInternalTickets({
  candidates: candidates.slice(0, 5),
  count: 3,
  minLegs: 2,
  maxLegs: 2,
  profile: 'MODERADO',
  scopeMode: 'all',
});
assert.strictEqual(shortResult.generated, 2, 'com apenas 5 partidas, deve gerar 2 bilhetes de 2 sem repetir em vez de forçar repetição');
assert.strictEqual(shortResult.diversity.insufficientUniqueFixtures, true);

console.log('OK - gerador interno não repete partidas e amplia o pool para scores menores.');
