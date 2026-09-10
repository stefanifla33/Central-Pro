const path = require('path');
const { createBilhetesStore, createDemoBilhetes } = require('./bilhetes-store');
const { createSupabaseBilhetesStore, SupabaseBilhetesStoreNotConfiguredError } = require('./supabase-bilhetes-store');
function createUnavailableStore() { const fail = async () => { throw new SupabaseBilhetesStoreNotConfiguredError(); }; return { list: fail, history: fail, get: fail }; }
function createConfiguredBilhetesStore({ env = process.env, logger = console } = {}) {
  const production = env.NODE_ENV === 'production' || env.VERCEL === '1';
  const supabaseStore = createSupabaseBilhetesStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY });
  if (supabaseStore.configured) { return { store: { list: filters => supabaseStore.list(filters), history: filters => supabaseStore.list(filters), get: id => supabaseStore.getById(id), create: ticket => supabaseStore.create(ticket), update: (id, patch) => supabaseStore.update(id, patch), delete: id => supabaseStore.delete(id) }, seedPromise: Promise.resolve([]), mode: 'supabase' }; }
  if (production) { const store = createSupabaseBilhetesStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }); if (!store.configured) { logger.error('[BILHETES] Supabase obrigatório em produção não está configurado.'); return { store: createUnavailableStore(), seedPromise: Promise.resolve([]), mode: 'supabase-unavailable' }; } return { store: { list: filters => store.list(filters), history: filters => store.list(filters), get: id => store.getById(id), create: ticket => store.create(ticket), update: (id, patch) => store.update(id, patch), delete: id => store.delete(id) }, seedPromise: Promise.resolve([]), mode: 'supabase' }; }
  const store = createBilhetesStore(path.join(__dirname, '..', 'data', 'bilhetes.json')); return { store, seedPromise: env.BILHETES_SEED_DEMO === '1' ? store.seed(createDemoBilhetes()).catch(error => { logger.error(`[BILHETES] seed failed: ${error.message}`); return []; }) : Promise.resolve([]), mode: 'local' };
}
module.exports = { createConfiguredBilhetesStore };
