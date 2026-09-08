require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createSupabaseBilhetesStore } = require('../lib/supabase-bilhetes-store');

const requested = process.argv.find(arg => arg.startsWith('--date='))?.slice(7) || '';
const publish = process.argv.includes('--publish');
const previewPath = path.join(__dirname, '..', 'outputs', 'bilhetes-real-preview.json');
const hash = value => crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);
const idFor = (ticket, date) => `REAL-${date.replaceAll('-', '')}-${hash(JSON.stringify({ date, type: ticket.type, selections: ticket.selections.map(item => [item.fixtureId, item.marketKey, item.selection, item.line]) }))}`;
function validateTicket(ticket, date) {
  const errors = [];
  if (!ticket || !ticket.type || !Array.isArray(ticket.selections) || !ticket.selections.length) errors.push('ticket_incompleto');
  for (const item of ticket.selections || []) {
    for (const field of ['fixtureId', 'marketKey', 'marketId', 'market', 'selection', 'bookmakerId', 'bookmakerName', 'odd']) if (item[field] === undefined || item[field] === null || item[field] === '') errors.push(`selection_${field}_ausente`);
    if (!['Betano', 'Bet365', 'Superbet'].includes(item.bookmakerName)) errors.push('bookmaker_invalido');
    if (!(Number(item.odd) > 1)) errors.push('odd_invalida');
  }
  return [...new Set(errors)];
}
function recordFor(ticket, date) {
  const selections = ticket.selections.map(item => ({ ...item, displayMatch: `${item.homeTeam?.name || ''} x ${item.awayTeam?.name || ''}`.trim(), displaySelection: item.selectionDisplay }));
  return { id: idFor(ticket, date), schema_version: 1, published_at: new Date().toISOString(), date, type: ticket.type, title: ticket.type, description: 'Seleção analisada pelos dados da Central Pro.', competition: [...new Set(selections.map(item => item.competition))].join(' / '), status: 'OPEN', total_odd: ticket.totalOdd, selections, analysis: { snapshot: true, combinationType: ticket.combinationType, combinedOddType: ticket.combinedOddType, evidence: selections.map(item => ({ fixtureId: item.fixtureId, marketKey: item.marketKey, evidence: item.evidence || null })) }, source: 'real', settled_at: null };
}
async function main() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) throw new Error('Use --date=YYYY-MM-DD.');
  const preview = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
  const tickets = (preview.tickets || []).filter(ticket => !requested || preview.date === requested);
  const valid = [], invalid = [];
  for (const ticket of tickets) { const errors = validateTicket(ticket, requested); (errors.length ? invalid : valid).push({ ticket, errors }); }
  const records = valid.map(item => recordFor(item.ticket, requested));
  const summary = { preview: previewPath, ticketsFound: tickets.length, valid: valid.length, invalid: invalid.length, new: publish ? null : records.length, alreadyPublished: publish ? 0 : 'não consultado no dry-run', conflicts: 0, wouldInsert: records.length, wouldSkip: 0, apiFootballCalls: 0, supabaseWrites: 0, records, invalidTickets: invalid };
  if (publish) {
    const store = createSupabaseBilhetesStore({ supabaseUrl: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
    for (const record of records) { const existing = await store.getById(record.id); if (existing) { if (JSON.stringify(existing.selections) !== JSON.stringify(record.selections)) throw new Error(`CONFLICT ${record.id}`); summary.wouldInsert--; summary.wouldSkip++; } else { await store.create(record); summary.supabaseWrites++; } }
  }
  console.log(JSON.stringify(summary, null, 2));
}
if (require.main === module) main().catch(error => { console.error(`Falha: ${error.message}`); process.exitCode = 1; });

module.exports = { idFor, validateTicket, recordFor };
