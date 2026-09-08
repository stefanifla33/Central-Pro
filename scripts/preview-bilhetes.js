const fs = require('fs');
const path = require('path');
const { buildCandidates, cachedQuotesForFixture, sharedCachedQuotesForFixture, previewTickets } = require('../lib/bilhetes-preview');
const { createPrematchOddsService } = require('../lib/prematch-odds');
const { createRemoteFootballCache } = require('../lib/remote-football-cache');

const snapshots = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'game-snapshots.json'), 'utf8'));
const dates = Object.keys(snapshots.dates || {}).sort();
const latest = dates.at(-1);
const games = latest ? snapshots.dates[latest].fixtures || [] : [];
const oddsService = createPrematchOddsService({ football: async () => { throw new Error('preview must not fetch odds'); } });
const sharedCache = createRemoteFootballCache();
Promise.all(games.map(async game => { const local = cachedQuotesForFixture(oddsService, game.fixture?.id); if (local.entry) return local.quotes; return (await sharedCachedQuotesForFixture(sharedCache, game.fixture?.id)).quotes; })).then(groups => {
const result = buildCandidates(games, groups.flat());
const report = { generatedAt: new Date().toISOString(), source: 'local-snapshots-only', date: latest || null, callsToApiFootball: 0, odds: { realOnly: true, quotesLoaded: 0 }, candidates: result.candidates, rejected: result.rejected, tickets: previewTickets(result.candidates), notes: ['Nenhuma odd foi inventada.', 'Sem snapshot local de odds reais, as seleções foram rejeitadas.', 'Nenhum preview foi salvo no Supabase.'] };
const output = path.join(__dirname, '..', 'outputs', 'bilhetes-preview.json');
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(`Preview gerado: ${output}`); console.log(`Jogos inspecionados: ${games.length}; candidatos: ${result.candidates.length}; rejeitados: ${result.rejected.length}; bilhetes: ${report.tickets.length}; API-Football: ${report.callsToApiFootball}`);
}).catch(error => { console.error(`Preview falhou: ${error.message}`); process.exitCode = 1; });
