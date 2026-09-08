const path = require('path');
const { createBilhetesStore, createDemoBilhetes } = require('./bilhetes-store');
const { createSupabaseBilhetesStore, SupabaseBilhetesStoreNotConfiguredError } = require('./supabase-bilhetes-store');
function createUnavailableStore() { const fail = async () => { throw new SupabaseBilhetesStoreNotConfiguredError(); }; return { list: fail, history: fail, get: fail }; }
function createConfiguredBilhetesStore({ env = process.env, logger = console } = {}) {
  const production = env.NODE_ENV === 'production' || env.VERCEL === '1';
  if (production) { const store = createSupabaseBilhetesStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }); if (!store.configured) { logger.error('[BILHETES] Supabase obrigatório em produção não está configurado.'); return { store: createUnavailableStore(), seedPromise: Promise.resolve([]), mode: 'supabase-unavailable' }; } return { store: { list: filters => store.list(filters), history: filters => store.list(filters), get: id => store.getById(id) }, seedPromise: Promise.resolve([]), mode: 'supabase' }; }
  const store = createBilhetesStore(path.join(__dirname, '..', 'data', 'bilhetes.json')); return { store, seedPromise: env.BILHETES_SEED_DEMO === '0' ? Promise.resolve([]) : store.seed(createDemoBilhetes()).catch(error => { logger.error(`[BILHETES] seed failed: ${error.message}`); return []; }), mode: 'local' };
}
module.exports = { createConfiguredBilhetesStore };
