const fs = require('fs');
const path = require('path');

function createBilhetesStore(file, options = {}) {
  const io = options.fs || fs;
  let state = { schemaVersion: 1, tickets: [] };
  let writeQueue = Promise.resolve();
  try { const parsed = JSON.parse(io.readFileSync(file, 'utf8')); if (parsed?.schemaVersion === 1 && Array.isArray(parsed.tickets)) state = parsed; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const clone = value => JSON.parse(JSON.stringify(value));
  const save = next => { const temporary = `${file}.${process.pid}.tmp`; io.mkdirSync(path.dirname(file), { recursive: true }); io.writeFileSync(temporary, JSON.stringify(next, null, 2)); io.renameSync(temporary, file); state = next; };
  const enqueue = operation => { const result = writeQueue.then(operation); writeQueue = result.catch(() => {}); return result; };
  return {
    list({ date, status } = {}) { return clone(state.tickets.filter(ticket => (!date || ticket.date === date) && (!status || ticket.status === status))); },
    get(id) { const ticket = state.tickets.find(item => item.id === id); return ticket ? clone(ticket) : null; },
    history(filters) { return this.list(filters); },
    async upsert(ticket) { return enqueue(async () => { if (state.tickets.some(item => item.id === ticket.id)) return this.get(ticket.id); const next = { ...state, tickets: [...state.tickets, clone(ticket)] }; save(next); return clone(ticket); }); },
    async create(ticket) { return this.upsert(ticket); },
    async update(id, patch) { return enqueue(async () => { const index = state.tickets.findIndex(item => item.id === id); if (index < 0) return null; const updated = { ...state.tickets[index], ...clone(patch), id, updatedAt: new Date().toISOString() }; const tickets = [...state.tickets]; tickets[index] = updated; save({ ...state, tickets }); return clone(updated); }); },
    async delete(id) { return enqueue(async () => { const found = state.tickets.some(item => item.id === id); if (!found) return false; save({ ...state, tickets: state.tickets.filter(item => item.id !== id) }); return true; }); },
    async seed(tickets) { for (const ticket of tickets) await this.upsert(ticket); return this.list(); },
    flush() { return writeQueue; },
    file
  };
}

function createDemoBilhetes(date = '2026-09-08') {
  const picks = [['Real Madrid x Inter','Real Madrid ou Empate','double_chance','home_or_draw'],['Porto x Manchester City','Mais de 1.5 gols','total_goals','over'],['Club Brugge x Aston Villa','Mais de 8.5 escanteios','total_corners','over'],['Borussia Dortmund x Villarreal','Dortmund ou Empate','double_chance','home_or_draw'],['Lille x Real Betis','Mais de 3.5 cartões','total_cards','over'],['AEK Athens x LASK','Mais de 1.5 gols','total_goals','over']];
  const types = [['CONSERVADOR','Mais segurança, menos risco.','2.50'],['BILHETE DO DIA','Nosso principal bilhete da rodada.','4.46'],['CHAMPIONS','Destaques da rodada europeia.','3.24'],['JOGADORES','Mercados individuais selecionados pelos dados.','5.10'],['ESCANTEIOS','Tendências de volume e pressão ofensiva.','6.20'],['BET BUILDER','Mercados combinados de uma mesma partida.','8.75'],['OUSADO','Mais risco, mais valor.','20.19']];
  return types.map((type, index) => ({ id: `DEMO-${date.replaceAll('-','')}-${String(index + 1).padStart(3,'0')}`, schemaVersion: 1, publishedAt: `${date}T12:00:00-03:00`, date, type: type[0], title: type[0], description: type[1], competition: 'UEFA Champions League', status: 'OPEN', totalOdd: Number(type[2]), selections: picks.slice(index % picks.length, index % picks.length + (index % 3) + 2).map((pick, n) => ({ id: `DEMO-${index + 1}-${n + 1}`, fixtureId: null, fixtureDate: `${date}T19:00:00-03:00`, competitionId: null, competitionName: 'UEFA Champions League', marketType: pick[2], marketKey: pick[2], selectionType: pick[3], line: pick[3] === 'over' ? (pick[2] === 'total_corners' ? 8.5 : pick[2] === 'total_cards' ? 3.5 : 1.5) : null, teamId: null, teamName: null, playerId: null, playerName: null, goalkeeperId: null, goalkeeperName: null, displayMatch: pick[0], displaySelection: pick[1], odd: Number((1.3 + n * .21).toFixed(2)), bookmakerId: null, bookmakerName: null, status: 'OPEN', metadata: { demo: true } })), analysis: { generatedAt: null, demo: true }, source: 'demo', settledAt: null, createdAt: `${date}T12:00:00-03:00`, updatedAt: `${date}T12:00:00-03:00` }));
}
module.exports = { createBilhetesStore, createDemoBilhetes };
