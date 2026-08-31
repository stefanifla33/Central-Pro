const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { bearerToken, createUserAccessService, DEFAULT_TRIAL_HOURS } = require('../lib/user-access');

function response(ok, body, status = ok ? 200 : 401) {
  return { ok, status, json: async () => body };
}

function serviceScenario(rpcRow) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) return response(true, { id: 'server-derived-user' });
    return response(true, rpcRow);
  };
  return {
    calls,
    service: createUserAccessService({ supabaseUrl: 'https://project.supabase.co/', publishableKey: 'public-key', fetchImpl })
  };
}

function classList() {
  const values = new Set();
  return { add: (v) => values.add(v), remove: (v) => values.delete(v), contains: (v) => values.has(v) };
}

async function runGuard({ session, access }) {
  const source = fs.readFileSync('public/auth-guard.js', 'utf8');
  const redirects = [];
  const location = { pathname: '/games.html', search: '', hash: '', replace: (value) => redirects.push(value) };
  const document = {
    documentElement: { classList: classList() }, head: { appendChild() {} }, readyState: 'complete',
    createElement: () => ({ textContent: '', appendChild() {}, addEventListener() {} }),
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null
  };
  const CentralProAuth = {
    getSession: async () => ({ data: { session }, error: null }), getAccess: async () => access,
    userName: (user) => user?.user_metadata?.name || '', onAuthStateChange: async () => ({}), signOut: async () => ({})
  };
  vm.runInNewContext(source, { window: { supabase: { createClient() {} }, CentralProAuth }, document, location, URL, Promise, Error, Date });
  await new Promise((resolve) => setImmediate(resolve));
  return redirects;
}

(async () => {
  assert.strictEqual(DEFAULT_TRIAL_HOURS, 24);
  assert.strictEqual(bearerToken('Bearer real-token'), 'real-token');
  assert.strictEqual(bearerToken('Basic forged-user-id'), '');

  const trial = {
    allowed: true, status: 'trial', created: true,
    trial_started_at: '2026-08-31T17:32:00.000Z', trial_ends_at: '2026-09-01T17:32:00.000Z', remaining_seconds: 86400
  };
  const first = serviceScenario(trial);
  const created = await first.service.getAccess('Bearer signed-jwt');
  assert.strictEqual(created.httpStatus, 200, 'usuário sem registro recebe trial');
  assert.strictEqual(new Date(created.body.trialEndsAt) - new Date(created.body.trialStartedAt), 24 * 60 * 60 * 1000, 'trial dura 24 horas');
  assert.strictEqual(first.calls[0].url.endsWith('/auth/v1/user'), true, 'token é validado antes do RPC');
  assert.strictEqual(first.calls[1].options.body, '{}', 'frontend não envia user_id');

  const again = await first.service.getAccess('Bearer signed-jwt');
  assert.strictEqual(again.body.trialStartedAt, created.body.trialStartedAt, 'novo login não reinicia trial');
  assert.strictEqual(created.body.allowed, true, 'trial válido é liberado');

  const expiredScenario = serviceScenario({ ...trial, allowed: false, status: 'expired', created: false, remaining_seconds: 0 });
  const expired = await expiredScenario.service.getAccess('Bearer signed-jwt');
  assert.strictEqual(expired.body.allowed, false, 'trial expirado é bloqueado');

  const noSession = await createUserAccessService({}).getAccess('');
  assert.strictEqual(noSession.httpStatus, 401, 'sessão ausente é negada');
  assert.deepStrictEqual(await runGuard({ session: null }), ['/login.html?next=%2Fgames.html'], 'sem sessão vai ao login');
  const user = { access_token: 'jwt', user: { user_metadata: { name: 'Ana' } } };
  assert.deepStrictEqual(await runGuard({ session: user, access: expired.body }), ['/trial-expired.html?ended=2026-09-01T17%3A32%3A00.000Z'], 'expirado vai à tela pública');

  const invalid = createUserAccessService({
    supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key',
    fetchImpl: async () => response(false, { id: 'forged-id' })
  });
  assert.strictEqual((await invalid.getAccess('Bearer forged-token')).httpStatus, 401, 'user_id não pode ser forjado');

  const sql = fs.readFileSync('supabase/user-access.sql', 'utf8');
  assert.match(sql, /on conflict \(user_id\) do nothing/i, 'conta antiga recebe apenas um trial');
  assert.match(sql, /auth\.uid\(\)/, 'identidade vem do token validado pelo Supabase');
  assert.match(sql, /clock_timestamp\(\)/, 'relógio é o do banco');
  assert.match(sql, /central_pro_trial_duration[\s\S]*interval '24 hours'/, 'duração fica centralizada no banco');
  assert.match(sql, /v_now \+ public\.central_pro_trial_duration\(\)/, 'criação usa a configuração central');

  const authSource = fs.readFileSync('public/auth.js', 'utf8');
  assert.match(authSource, /destination\.origin !== global\.location\.origin/, 'open redirect continua bloqueado');
  console.log('user access trial scenarios: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
