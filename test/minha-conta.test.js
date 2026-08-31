const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const pageSource = fs.readFileSync('public/minha-conta.html', 'utf8');
const accountSource = fs.readFileSync('public/minha-conta.js', 'utf8');
const guardSource = fs.readFileSync('public/auth-guard.js', 'utf8');
const appShellSource = fs.readFileSync('public/app-shell.js', 'utf8');

function element() {
  const listeners = {};
  return { textContent: '', className: '', hidden: false, disabled: false, style: {}, addEventListener(type, callback) { listeners[type] = callback; }, listeners };
}

async function accountScenario(access) {
  const ids = ['accountAvatar', 'accountName', 'accountEmail', 'accessBadge', 'accessTitle', 'accessSummaryDescription', 'accessStatus', 'accessValidity', 'remainingRow', 'accessRemaining', 'trialProgress', 'trialProgressBar', 'trialStart', 'trialStartText', 'planHeadline', 'planDescription', 'planSupporting', 'accountMessage', 'logoutButton'];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  elements.remainingRow.hidden = true;
  const redirects = [];
  let signOutCalls = 0;
  const CentralProAuth = {
    getSession: async () => ({ data: { session: { access_token: 'jwt', user: { email: 'ana@teste.local', user_metadata: { name: 'Ana Silva' } } } }, error: null }),
    userName: (user) => user.user_metadata.name,
    getAccess: async () => access,
    signOut: async () => { signOutCalls += 1; return { error: null }; }
  };
  vm.runInNewContext(accountSource, {
    window: { CentralProAuth }, document: { getElementById: (id) => elements[id] },
    location: { replace: (value) => redirects.push(value) }, Intl, Date, Number, Math, Object, Promise, Error, setTimeout
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, redirects, getSignOutCalls: () => signOutCalls };
}

(async () => {
  assert.match(pageSource, /auth-guard\.js/, 'Minha Conta exige o guard de sessão');
  assert.match(guardSource, /querySelectorAll\('\.user-card'\)\.forEach\(bindAccountLink\)/, 'card mobile aponta para Minha Conta');
  assert.match(guardSource, /querySelectorAll\('\.header-user'\)/, 'bloco desktop aponta para Minha Conta');
  assert.match(guardSource, /location\.href = '\/minha-conta\.html'/, 'destino da conta é único');
  assert.doesNotMatch(guardSource, /auth-logout|Sair da conta/, 'shell não oferece logout');
  assert.doesNotMatch(appShellSource, /Sair da conta|signOut/, 'shell principal não oferece logout');

  const trial = await accountScenario({ status: 'trial', allowed: true, trialStartedAt: '2026-08-31T17:32:00Z', trialEndsAt: '2026-09-01T17:32:00Z', remainingSeconds: 3600 });
  assert.strictEqual(trial.elements.accountName.textContent, 'Ana Silva', 'nome vem da sessão');
  assert.strictEqual(trial.elements.accountEmail.textContent, 'ana@teste.local', 'e-mail vem da sessão');
  assert.strictEqual(trial.elements.accessStatus.textContent, 'Teste gratuito', 'status vem do backend');
  assert.strictEqual(trial.elements.accessTitle.textContent, 'Teste gratuito', 'destaque visual acompanha o status');
  assert.strictEqual(trial.elements.accessRemaining.textContent, '1h 0min', 'tempo exibido vem do backend');
  assert.strictEqual(trial.elements.trialProgress.hidden, false, 'progresso visual usa o período retornado');
  assert.match(trial.elements.trialStartText.textContent, /começou em/, 'início seguro do trial é exibido');
  await trial.elements.logoutButton.listeners.click();
  assert.strictEqual(trial.getSignOutCalls(), 1, 'logout invalida a sessão pelo módulo central');
  assert.deepStrictEqual(trial.redirects, ['/login.html'], 'logout redireciona ao login');

  const expired = await accountScenario({ status: 'expired', allowed: false, trialEndsAt: '2026-09-01T17:32:00Z', remainingSeconds: 0 });
  assert.strictEqual(expired.elements.accessStatus.textContent, 'Teste encerrado');
  assert.strictEqual(expired.elements.accessTitle.textContent, 'Teste encerrado');
  assert.match(expired.elements.accessValidity.textContent, /^Encerrado em /);
  assert.match(guardSource, /!access\.allowed && !accountPage/, 'páginas premium continuam bloqueando expirados');
  assert.match(fs.readFileSync('public/auth.js', 'utf8'), /destination\.origin !== global\.location\.origin/, 'open redirect permanece protegido');
  assert.doesNotMatch(`${pageSource}\n${accountSource}`, /api-football|api-sports|\/api\/jogos/i, 'Minha Conta não chama API-Football');
  console.log('Minha Conta scenarios: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
