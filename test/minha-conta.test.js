const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const pageSource = fs.readFileSync('public/minha-conta.html', 'utf8');
const accountSource = fs.readFileSync('public/minha-conta.js', 'utf8');
const guardSource = fs.readFileSync('public/auth-guard.js', 'utf8');
const appShellSource = fs.readFileSync('public/app-shell.js', 'utf8');

function element(dataset = {}) {
  const listeners = {};
  return { textContent: '', className: '', hidden: false, disabled: false, style: {}, dataset, addEventListener(type, callback) { listeners[type] = callback; }, listeners };
}

async function accountScenario(access, checkoutResponse = { ok: true, checkoutUrl: 'https://sandbox.asaas.com/checkout/test' }) {
  const ids = ['accountAvatar', 'accountName', 'accountEmail', 'accessBadge', 'accessTitle', 'accessSummaryDescription', 'accessStatus', 'accessValidity', 'remainingRow', 'accessRemaining', 'trialProgress', 'trialProgressBar', 'trialStart', 'trialStartText', 'planHeadline', 'planDescription', 'planSupporting', 'purchasePlans', 'renewPlan', 'accountMessage', 'logoutButton'];
  const elements = Object.fromEntries(ids.map((id) => [id, element()]));
  const checkoutButtons = [element({ plan: 'monthly' }), element({ plan: 'quarterly' })];
  checkoutButtons[0].textContent = 'Assinar mensal';
  checkoutButtons[1].textContent = 'Assinar trimestral';
  elements.remainingRow.hidden = true;
  elements.trialProgress.hidden = true;
  elements.trialStart.hidden = true;
  const redirects = [];
  const assigned = [];
  const checkoutCalls = [];
  let signOutCalls = 0;
  const CentralProAuth = {
    getSession: async () => ({ data: { session: { access_token: 'jwt', user: { email: 'ana@teste.local', user_metadata: { name: 'Ana Silva' } } } }, error: null }),
    userName: (user) => user.user_metadata.name,
    getAccess: async () => access,
    signOut: async () => { signOutCalls += 1; return { error: null }; }
  };
  vm.runInNewContext(accountSource, {
    window: { CentralProAuth }, document: { getElementById: (id) => elements[id], querySelectorAll: () => checkoutButtons },
    location: { replace: (value) => redirects.push(value), assign: (value) => assigned.push(value) },
    fetch: async (url, options) => { checkoutCalls.push({ url, options }); return { ok: checkoutResponse.ok, json: async () => checkoutResponse }; },
    Intl, Date, Number, Math, Object, Promise, Error, setTimeout
  });
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, checkoutButtons, checkoutCalls, redirects, assigned, getSignOutCalls: () => signOutCalls };
}

(async () => {
  assert.match(pageSource, /auth-guard\.js/, 'Minha Conta exige o guard de sessão');
  assert.match(pageSource, /Plano Mensal[\s\S]*R\$ 19,90[\s\S]*data-plan="monthly"/, 'plano mensal é oferecido pelo preço definido');
  assert.match(pageSource, /Plano Trimestral[\s\S]*R\$ 49,90[\s\S]*data-plan="quarterly"/, 'plano trimestral é oferecido pelo preço definido');
  assert.match(pageSource, /Pagamento por Pix ou cartão[\s\S]*href="\/planos\.html"/, 'formas de pagamento e link de planos são exibidos');
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
  assert.strictEqual(trial.elements.purchasePlans.hidden, false, 'trial pode assinar sem esperar o término');
  await trial.checkoutButtons[0].listeners.click();
  assert.strictEqual(trial.checkoutCalls[0].url, '/api/payments/asaas/checkout');
  assert.strictEqual(trial.checkoutCalls[0].options.headers.Authorization, 'Bearer jwt');
  assert.deepStrictEqual(JSON.parse(trial.checkoutCalls[0].options.body), { planId: 'monthly' });
  assert.deepStrictEqual(trial.assigned, ['https://sandbox.asaas.com/checkout/test']);

  const quarterly = await accountScenario({ status: 'trial', allowed: true, trialStartedAt: '2026-08-31T17:32:00Z', trialEndsAt: '2026-09-01T17:32:00Z', remainingSeconds: 3600 });
  await quarterly.checkoutButtons[1].listeners.click();
  assert.deepStrictEqual(JSON.parse(quarterly.checkoutCalls[0].options.body), { planId: 'quarterly' });

  const failedCheckout = await accountScenario(
    { status: 'trial', allowed: true, trialStartedAt: '2026-08-31T17:32:00Z', trialEndsAt: '2026-09-01T17:32:00Z', remainingSeconds: 3600 },
    { ok: false }
  );
  await failedCheckout.checkoutButtons[0].listeners.click();
  assert.match(failedCheckout.elements.accountMessage.textContent, /Não foi possível iniciar o pagamento/);
  assert.strictEqual(failedCheckout.checkoutButtons[0].disabled, false, 'falha libera nova tentativa');
  assert.strictEqual(failedCheckout.checkoutButtons[1].disabled, false, 'falha libera os dois planos');
  await trial.elements.logoutButton.listeners.click();
  assert.strictEqual(trial.getSignOutCalls(), 1, 'logout invalida a sessão pelo módulo central');
  assert.deepStrictEqual(trial.redirects, ['/login.html'], 'logout redireciona ao login');

  const expired = await accountScenario({ status: 'expired', allowed: false, trialEndsAt: '2026-09-01T17:32:00Z', remainingSeconds: 0 });
  assert.strictEqual(expired.elements.accessStatus.textContent, 'Teste encerrado');
  assert.strictEqual(expired.elements.accessTitle.textContent, 'Teste encerrado');
  assert.match(expired.elements.accessValidity.textContent, /^Encerrado em /);

  const lifetime = await accountScenario({ status: 'lifetime', allowed: true, trialStartedAt: null, trialEndsAt: null, remainingSeconds: null });
  assert.strictEqual(lifetime.elements.accessStatus.textContent, 'Acesso vitalício');
  assert.strictEqual(lifetime.elements.accessValidity.textContent, 'Sem vencimento');
  assert.strictEqual(lifetime.elements.planHeadline.textContent, 'Central Pro — Proprietária');
  assert.strictEqual(lifetime.elements.remainingRow.hidden, true, 'lifetime não mostra horas restantes');
  assert.strictEqual(lifetime.elements.trialProgress.hidden, true, 'lifetime não mostra barra de trial');
  assert.strictEqual(lifetime.elements.purchasePlans.hidden, true, 'lifetime não mostra opções de compra');

  const active = await accountScenario({ status: 'active', allowed: true, planId: 'monthly', planName: 'Mensal', accessExpiresAt: '2026-10-01T17:32:00Z', remainingSeconds: null });
  assert.strictEqual(active.elements.accessStatus.textContent, 'Acesso ativo');
  assert.strictEqual(active.elements.planHeadline.textContent, 'Plano Mensal');
  assert.match(active.elements.accessValidity.textContent, /^Acesso válido até /);
  assert.strictEqual(active.elements.renewPlan.hidden, false);
  assert.strictEqual(active.elements.purchasePlans.hidden, true, 'plano ativo mantém somente renovação');
  assert.match(guardSource, /!access\.allowed && !accessManagementPage/, 'páginas premium continuam bloqueando expirados');
  assert.match(fs.readFileSync('public/auth.js', 'utf8'), /destination\.origin !== global\.location\.origin/, 'open redirect permanece protegido');
  assert.doesNotMatch(`${pageSource}\n${accountSource}`, /api-football|api-sports|\/api\/jogos/i, 'Minha Conta não chama API-Football');
  console.log('Minha Conta scenarios: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
