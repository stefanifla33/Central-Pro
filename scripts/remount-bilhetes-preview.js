const fs = require('fs');
const path = require('path');
const { assembleTickets } = require('../lib/bilhetes-preview');
const TIER1 = new Set([2, 39, 135, 61, 78, 71, 73, 11, 13]);
const CONTINENTAL = new Set([2, 11, 13]);

const output = path.join(__dirname, '..', 'outputs', 'bilhetes-real-preview.json');
const report = JSON.parse(fs.readFileSync(output, 'utf8'));
const byName = new Map([['UEFA Champions League', 2], ['Premier League', 39], ['Serie A', 135], ['Ligue 1', 61], ['Bundesliga', 78], ['Brasileirão Série A', 71], ['Copa do Brasil', 73], ['CONMEBOL Sudamericana', 11], ['CONMEBOL Libertadores', 13]]);
report.approvedCandidates.forEach(item => { item.competitionId = item.competitionId || byName.get(item.competition) || null; });
report.tickets = assembleTickets(report.approvedCandidates);
const used = report.tickets.flatMap(ticket => ticket.selections);
const key = item => `${item.fixtureId}:${item.marketKey}`;
const groups = new Map();
for (const item of report.approvedCandidates) { const group = groups.get(item.fixtureId) || []; group.push(item); groups.set(item.fixtureId, group); }
report.assembly = {
  approvedCandidatesUsed: used.length,
  approvedCandidatesUnused: report.approvedCandidates.length - used.length,
  fixtureGroups: [...groups].map(([fixtureId, items]) => ({ fixtureId, competition: items[0].competition, approvedCandidates: items.length, markets: [...new Set(items.map(item => item.selectionDisplay))] })),
  repeatedSelections: [],
  externalCallsAdded: 0,
  approvedByTier1Competition: Object.fromEntries([...new Set(report.approvedCandidates.filter(item => TIER1.has(item.competitionId)).map(item => `${item.competitionId}:${item.competition}`))].map(key => [key, report.approvedCandidates.filter(item => `${item.competitionId}:${item.competition}` === key).length])),
  usedByTier1Competition: Object.fromEntries([...new Set(report.tickets.flatMap(ticket => ticket.selections).filter(item => TIER1.has(item.competitionId)).map(item => `${item.competitionId}:${item.competition}`))].map(key => [key, report.tickets.flatMap(ticket => ticket.selections).filter(item => `${item.competitionId}:${item.competition}` === key).length])),
  tier1CandidatesUnused: report.approvedCandidates.filter(item => TIER1.has(item.competitionId) && !report.tickets.flatMap(ticket => ticket.selections).includes(item)).length,
  ticketsWithTier1: report.tickets.filter(ticket => ticket.selections.some(item => TIER1.has(item.competitionId))).length,
  ticketsExclusivelyTier1: report.tickets.filter(ticket => ticket.selections.length > 0 && ticket.selections.every(item => TIER1.has(item.competitionId))).length,
  tier2CandidatesUsed: used.filter(item => !TIER1.has(item.competitionId)).length,
  sameFixtureTickets: report.tickets.filter(ticket => ticket.combinationType === 'SAME_FIXTURE').length,
  multiFixtureTickets: report.tickets.filter(ticket => ticket.combinationType === 'MULTI_FIXTURE').length,
  championsTickets: report.tickets.filter(ticket => ticket.type === 'CHAMPIONS' || ticket.type === 'BINGO_CHAMPIONS').length,
  bingoTickets: report.tickets.filter(ticket => ticket.type === 'BINGO' || ticket.type === 'BINGO_CHAMPIONS').length,
  repeatedSelections: [...new Set(used.map(key))].filter(selectionKey => used.filter(item => key(item) === selectionKey).length > 1)
};
for (const [id, name] of [[2, 'Champions'], [13, 'Libertadores'], [11, 'Sul-Americana']]) {
  const approved = report.approvedCandidates.filter(item => item.competitionId === id);
  const selected = used.filter(item => item.competitionId === id);
  report.assembly[name] = { approved: approved.length, used: selected.length, unused: approved.length - selected.length, unusedReason: approved.length && !selected.length ? 'sem_combinacao_continental_na_faixa' : null };
}
report.assembly.continentalOnlyChampions = report.tickets.filter(ticket => ticket.selections.length && ticket.selections.every(item => item.competitionId === 2)).length;
report.assembly.continentalOnlyLibertadores = report.tickets.filter(ticket => ticket.selections.length && ticket.selections.every(item => item.competitionId === 13)).length;
report.assembly.continentalOnlySulAmericana = report.tickets.filter(ticket => ticket.selections.length && ticket.selections.every(item => item.competitionId === 11)).length;
report.assembly.mixedContinental = report.tickets.filter(ticket => new Set(ticket.selections.map(item => item.competitionId)).size > 1 && ticket.selections.every(item => CONTINENTAL.has(item.competitionId))).length;
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ tickets: report.tickets, assembly: report.assembly }, null, 2));
