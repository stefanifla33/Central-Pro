const fs = require('fs');
const path = require('path');
const app = require('../server');

const snapshots = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'game-snapshots.json'), 'utf8'));
const requested = process.argv.find(arg => arg.startsWith('--date='))?.slice(7) || '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(requested) || Number.isNaN(Date.parse(`${requested}T00:00:00Z`))) { console.error('Data inválida. Use --date=YYYY-MM-DD.'); process.exit(2); }
const beforeFixtures = app.locals.bilhetesApiMetrics.externalRequests;
const beforeExternalTotal = app.locals.bilhetesApiUsageDiagnostic.externalTotal;
const beforeEndpoints = new Map(app.locals.bilhetesApiUsageDiagnostic.byEndpoint);
app.locals.bilhetesFixturesLoader(requested).then(payload => { const games = payload.response || []; return app.locals.bilhetesPreviewGenerator({ games, date: requested, apiUsageDiagnostic: app.locals.bilhetesApiUsageDiagnostic }).then(report => ({ games, report })); }).then(({ games, report }) => {
  report.fixturesExternalCalls = app.locals.bilhetesApiMetrics.externalRequests - beforeFixtures;
  report.generatedAt = new Date().toISOString(); report.source = 'central-preview-existing-services'; report.apiFootballCalls = app.locals.bilhetesApiUsageDiagnostic.externalTotal - beforeExternalTotal;
  report.externalCallsByEndpoint = Object.fromEntries([...app.locals.bilhetesApiUsageDiagnostic.byEndpoint].map(([endpoint, count]) => [endpoint, count - (beforeEndpoints.get(endpoint) || 0)]));
  const output = path.join(__dirname, '..', 'outputs', 'bilhetes-real-preview.json');
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(`Preview gerado: ${output}`); console.log(JSON.stringify({ date: requested, gamesAnalyzed: report.gamesAnalyzed, statisticalCandidates: report.statisticalCandidates, uniqueCandidateFixtures: report.uniqueCandidateFixtures, oddsMemoryCacheHits: report.oddsMemoryCacheHits, oddsRedisCacheHits: report.oddsRedisCacheHits, oddsExternalCalls: report.oddsExternalCalls, approvedCandidates: report.approvedCandidates.length, rejectedCandidates: report.rejectedCandidates.length, tickets: report.tickets.length, apiFootballCalls: report.apiFootballCalls }));
}).catch(error => { console.error(`Falha ao gerar preview: ${error.message}`); process.exitCode = 1; });
