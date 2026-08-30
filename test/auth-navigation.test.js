const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const authSource = fs.readFileSync('public/auth.js', 'utf8');
const guardSource = fs.readFileSync('public/auth-guard.js', 'utf8');
const loginSource = fs.readFileSync('public/login.js', 'utf8');

function authContext() {
  const calls = [];
  const auth = {
    signUp: async (credentials) => { calls.push(['signUp', credentials]); return { data: { credentials }, error: null }; },
    signInWithPassword: async (credentials) => ({ data: { session: { user: { email: credentials.email } } }, error: null }),
    signOut: async (options) => { calls.push(['signOut', options]); return { error: null }; },
    updateUser: async (attributes) => { calls.push(['updateUser', attributes]); return { data: { user: { user_metadata: attributes.data } }, error: null }; },
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: {} } })
  };
  const window = {
    location: { origin: 'https://central-pro.test' },
    supabase: { createClient: () => ({ auth }) }
  };
  const context = {
    URL,
    window,
    fetch: async () => ({ ok: true, json: async () => ({ configured: true, url: 'https://project.supabase.co', publishableKey: 'public-test-key' }) })
  };
  vm.createContext(context);
  vm.runInContext(authSource, context);
  return { api: window.CentralProAuth, calls };
}

function classList() {
  const values = new Set();
  return { add: (value) => values.add(value), remove: (value) => values.delete(value), contains: (value) => values.has(value) };
}

async function guardContext(session, withHomeShell = false) {
  const redirects = [];
  const rootClasses = classList();
  const avatar = { textContent: '', title: '' };
  const name = { textContent: '', title: '' };
  const role = { textContent: '' };
  const greeting = { textContent: '' };
  const userCard = { querySelector: (selector) => ({ '.avatar': avatar, strong: name, small: role }[selector] || null) };
  const accountArea = { querySelector: () => null, appendChild() {} };
  const location = {
    pathname: '/match.html', search: '?id=123', hash: '',
    replace: (destination) => redirects.push(destination)
  };
  const document = {
    documentElement: { classList: rootClasses },
    head: { appendChild() {} },
    readyState: 'complete',
    createElement: () => ({ textContent: '', appendChild() {}, addEventListener() {} }),
    getElementById: (id) => withHomeShell && id === 'homeGreeting' ? greeting : null,
    querySelector: (selector) => withHomeShell ? ({ '.user-card': userCard, '.sidebar-future': accountArea }[selector] || null) : null,
    querySelectorAll: () => []
  };
  const CentralProAuth = {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: async () => ({ data: { subscription: {} } }),
    signOut: async () => ({ error: null }),
    userName: (user) => String(user?.user_metadata?.name || '').trim()
  };
  const window = { supabase: { createClient() {} }, CentralProAuth };
  const context = { window, document, location, Promise, Error, Date };
  vm.createContext(context);
  vm.runInContext(guardSource, context);
  await new Promise((resolve) => setImmediate(resolve));
  return { redirects, rootClasses, avatar, name, role, greeting };
}

(async () => {
  const { api, calls } = authContext();
  assert.strictEqual(api.safeInternalDestination('/match.html?id=123'), '/match.html?id=123');
  assert.strictEqual(api.safeInternalDestination('https://evil.example/roubo'), '/index.html');
  assert.strictEqual(api.safeInternalDestination('//evil.example/roubo'), '/index.html');
  assert.strictEqual(api.safeInternalDestination('/login.html'), '/index.html');
  assert.strictEqual(api.normalizeName('  Ana   Silva  '), 'Ana Silva');
  assert.strictEqual(api.userName({ user_metadata: { name: ' Ana ' } }), 'Ana');
  await api.signUp('ana@teste.local', 'senha-segura', '  Ana   Silva ');
  assert.strictEqual(calls[0][1].options.data.name, 'Ana Silva');
  await api.updateName('  Ana Paula  ');
  assert.strictEqual(calls[1][1].data.name, 'Ana Paula');
  await api.signOut();
  assert.strictEqual(calls.length, 3);
  assert.strictEqual(calls[2][1].scope, 'local');

  const loggedOut = await guardContext(null);
  assert.deepStrictEqual(loggedOut.redirects, ['/login.html?next=%2Fmatch.html%3Fid%3D123']);
  assert.strictEqual(loggedOut.rootClasses.contains('auth-pending'), true);

  const missingName = await guardContext({ user: { email: 'pessoa@teste.local', user_metadata: {} } });
  assert.deepStrictEqual(missingName.redirects, ['/login.html?next=%2Fmatch.html%3Fid%3D123']);

  const loggedIn = await guardContext({ user: { email: 'pessoa@teste.local', user_metadata: { name: 'Pessoa Teste' } } });
  assert.deepStrictEqual(loggedIn.redirects, []);
  assert.strictEqual(loggedIn.rootClasses.contains('auth-pending'), false);

  const home = await guardContext({ user: { email: 'nao-exibir@teste.local', user_metadata: { name: 'Ana Silva' } } }, true);
  assert.strictEqual(home.avatar.textContent, 'A');
  assert.strictEqual(home.name.textContent, 'Ana Silva');
  assert.strictEqual(home.role.textContent, 'Conta autenticada');
  assert.match(home.greeting.textContent, /Ana Silva!/);
  assert.doesNotMatch(home.name.textContent, /@/);

  assert.match(loginSource, /CentralProAuth\.signIn[\s\S]*?continueWithSession\(data\.session\)/);
  assert.match(loginSource, /data\.session\?\.user[\s\S]*?continueWithSession\(data\.session\)/);
  assert.match(loginSource, /CentralProAuth\.updateName[\s\S]*?enterCentralPro\(\)/);
  console.log('auth navigation scenarios: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
