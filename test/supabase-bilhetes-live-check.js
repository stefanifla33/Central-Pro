require('dotenv').config();
const { createSupabaseBilhetesStore } = require('../lib/supabase-bilhetes-store');

async function main() {
  const missing = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter(name => !String(process.env[name] || '').trim());
  if (missing.length) { console.error(`Variáveis ausentes: ${missing.join(', ')}`); process.exitCode = 2; return; }
  const store = createSupabaseBilhetesStore({ supabaseUrl: process.env.SUPABASE_URL, serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY });
  const rows = await store.list();
  if (!Array.isArray(rows)) throw new Error('Resposta inválida: esperada uma lista de bilhetes.');
  console.log(`Leitura Supabase OK: ${rows.length} registro(s). Nenhuma escrita ou deleção foi executada.`);
}

main().catch(error => { console.error(`Falha na leitura Supabase: ${error.message}`); process.exitCode = 1; });
