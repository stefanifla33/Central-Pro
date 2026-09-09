require('dotenv').config();
const app = require('../server');
const { createSupabaseBilhetesStore } = require('../lib/supabase-bilhetes-store');
const { settleOpenTickets } = require('../lib/bilhetes-settlement');
async function main() {
  const store = createSupabaseBilhetesStore({ supabaseUrl: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
  if (!store.configured) throw new Error('Supabase Bilhetes não configurado.');
  const result = await settleOpenTickets({ store, football: app.locals.offlineTest.football });
  console.log(JSON.stringify(result, null, 2));
}
if (require.main === module) main().catch(error => { console.error(`Falha: ${error.message}`); process.exitCode = 1; });
module.exports = { main };
