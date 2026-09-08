const assert = require('assert');
const { createSupabaseBilhetesStore, SupabaseBilhetesStoreNotConfiguredError } = require('../lib/supabase-bilhetes-store');
const ticket = { id: 'BIL-001', schema_version: 1, published_at: '2026-09-08T12:00:00Z', date: '2026-09-08', type: 'DEMO', title: 'Demo', description: 'Demo', competition: 'Champions', status: 'OPEN', total_odd: 2.5, selections: [{ marketKey: 'total_goals', line: 1.5 }], analysis: {}, source: 'demo' };
(async () => {
  const calls = []; const fetchImpl = async (url, options) => { calls.push({ url, options }); return { ok: true, status: options?.method === 'PATCH' ? 200 : 200, async json() { return [ticket]; }, async text() { return ''; } }; };
  const store = createSupabaseBilhetesStore({ supabaseUrl: 'https://example.supabase.co', serviceRoleKey: 'server-only', fetchImpl });
  assert.equal(store.configured, true); assert.equal((await store.getById(ticket.id)).id, ticket.id); assert.equal((await store.list({ date: ticket.date, status: ticket.status })).length, 1);
  await store.create(ticket); await store.update(ticket.id, { status: 'GREEN', selections: [] });
  assert(calls[0].options.headers.Authorization.includes('server-only')); assert(calls.at(-1).options.body.includes('GREEN')); assert(!calls.at(-1).options.body.includes('selections'));
  await assert.rejects(() => createSupabaseBilhetesStore({}).getById('x'), error => error instanceof SupabaseBilhetesStoreNotConfiguredError);
  console.log('supabase bilhetes store scenarios: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
