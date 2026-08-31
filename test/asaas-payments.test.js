const assert = require('assert');
const fs = require('fs');
const { PLANS, getPlan } = require('../lib/plans');
const { ASAAS_BASE_URLS, createAsaasClient } = require('../lib/asaas');
const { secureEqual, createAsaasPaymentService } = require('../lib/asaas-payments');

function response(ok, data, status = ok ? 200 : 400) {
  return { ok, status, json: async () => data };
}

function scenario({ rpcResult = { duplicate: false }, accessStatus = 'trial' } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url.endsWith('/auth/v1/user')) return response(true, { id: 'server-user-id', email: 'user@test.local', user_metadata: { name: 'Pessoa' } });
    if (url.includes('/user_access?')) return response(true, [{ user_id: 'server-user-id', access_status: accessStatus, asaas_customer_id: null }]);
    if (url.endsWith('/payment_orders?select=id')) return response(true, [{ id: '11111111-1111-4111-8111-111111111111' }]);
    if (url.includes('/payment_orders?asaas_checkout_id=eq.')) return response(true, [{ id: '11111111-1111-4111-8111-111111111111' }]);
    if (url.includes('/payment_orders?id=eq.')) return response(true, {});
    if (url.endsWith('/rpc/process_asaas_payment_event')) return response(true, rpcResult);
    if (url.endsWith('/checkouts')) return response(true, { id: 'checkout-1', link: 'https://sandbox.asaas.com/checkout/test' });
    throw new Error(`unexpected URL ${url}`);
  };
  const service = createAsaasPaymentService({
    supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key', serviceRoleKey: 'server-only-key',
    asaasApiKey: 'asaas-secret', asaasEnvironment: 'sandbox', webhookToken: 'webhook-secret-token-with-more-than-32-chars', fetchImpl
  });
  return { calls, service };
}

(async () => {
  assert.strictEqual(PLANS.monthly.price, 19.90);
  assert.strictEqual(PLANS.quarterly.price, 49.90);
  assert.strictEqual(getPlan('annual'), null);
  assert.strictEqual(ASAAS_BASE_URLS.sandbox, 'https://api-sandbox.asaas.com/v3');
  assert.strictEqual(secureEqual('same-token', 'same-token'), true);
  assert.strictEqual(secureEqual('same-token', 'wrong-token'), false);

  const noAuth = scenario();
  assert.strictEqual((await noAuth.service.createCheckout({ planId: 'monthly', callbackBase: 'http://localhost:3000' })).httpStatus, 401);

  const checkoutScenario = scenario();
  const checkout = await checkoutScenario.service.createCheckout({
    authorization: 'Bearer valid-user-token', planId: 'monthly', price: 0.01,
    userId: 'forged-user', callbackBase: 'http://localhost:3000'
  });
  assert.strictEqual(checkout.httpStatus, 200);
  const orderCall = checkoutScenario.calls.find((call) => call.url.endsWith('/payment_orders?select=id'));
  assert.strictEqual(orderCall.body.user_id, 'server-user-id', 'userId do navegador é ignorado');
  assert.strictEqual(orderCall.body.amount, 19.90, 'preço do navegador é ignorado');
  const asaasCall = checkoutScenario.calls.find((call) => call.url.endsWith('/checkouts'));
  assert.deepStrictEqual(asaasCall.body.billingTypes, ['PIX', 'CREDIT_CARD']);
  assert.strictEqual(asaasCall.body.items[0].value, 19.90);
  assert.deepStrictEqual(asaasCall.body.callback, {
    successUrl: 'http://localhost:3000/minha-conta.html',
    cancelUrl: 'http://localhost:3000/planos.html',
    expiredUrl: 'http://localhost:3000/planos.html'
  });

  const invalidPlan = scenario();
  assert.strictEqual((await invalidPlan.service.createCheckout({ authorization: 'Bearer token', planId: 'annual', callbackBase: 'http://localhost:3000' })).httpStatus, 400);

  const webhookScenario = scenario();
  const payload = { id: 'evt-1', event: 'PAYMENT_CONFIRMED', payment: { id: 'pay-1', externalReference: '11111111-1111-4111-8111-111111111111', customer: 'cus-1' } };
  assert.strictEqual((await webhookScenario.service.processWebhook({ token: '', payload })).httpStatus, 401);
  assert.strictEqual((await webhookScenario.service.processWebhook({ token: 'invalid', payload })).httpStatus, 401);
  assert.strictEqual((await webhookScenario.service.processWebhook({ token: 'webhook-secret-token-with-more-than-32-chars', payload })).httpStatus, 200);
  const rpcCall = webhookScenario.calls.find((call) => call.url.endsWith('/rpc/process_asaas_payment_event'));
  assert.strictEqual(rpcCall.body.p_event_type, 'PAYMENT_CONFIRMED');
  assert.strictEqual(rpcCall.body.p_external_reference, payload.payment.externalReference);

  const receivedScenario = scenario();
  const receivedPayload = {
    id: 'evt_d26e303b238e509335ac9ba210e51b0f&18590916',
    event: 'PAYMENT_RECEIVED',
    payment: { id: 'pay_staf553a3rkdzi0v', checkoutSession: '164b23dc-9f04-4a53-892a-6351c1b7d1d9', externalReference: null, status: 'RECEIVED', value: 19.9 }
  };
  const received = await receivedScenario.service.processWebhook({ token: 'webhook-secret-token-with-more-than-32-chars', payload: receivedPayload });
  assert.strictEqual(received.httpStatus, 200, 'PAYMENT_RECEIVED aceita checkoutSession persistida quando externalReference é null');
  const checkoutLookup = receivedScenario.calls.find((call) => call.url.includes('/payment_orders?asaas_checkout_id=eq.'));
  assert.ok(checkoutLookup, 'checkoutSession localiza o pedido persistido no servidor');
  const receivedRpc = receivedScenario.calls.find((call) => call.url.endsWith('/rpc/process_asaas_payment_event'));
  assert.strictEqual(receivedRpc.body.p_event_id, receivedPayload.id, 'event.id é preservado integralmente, inclusive com &');
  assert.strictEqual(receivedRpc.body.p_event_type, 'PAYMENT_RECEIVED');
  assert.strictEqual(receivedRpc.body.p_payment_id, receivedPayload.payment.id);
  assert.strictEqual(receivedRpc.body.p_external_reference, '11111111-1111-4111-8111-111111111111', 'RPC recebe o UUID obtido do pedido persistido');

  const migration = fs.readFileSync('supabase/user-access-subscriptions.sql', 'utf8');
  assert.match(migration, /event_id text primary key/, 'eventos são idempotentes');
  assert.match(migration, /plan_id = 'monthly' and amount = 19\.90[\s\S]*plan_id = 'quarterly' and amount = 49\.90/, 'banco também fixa preços por plano');
  assert.match(migration, /p_event_type in \('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'\) and v_order\.access_applied_at is null/, 'confirmação ou recebimento Pix aplica acesso uma vez');
  assert.match(migration, /v_applied boolean := false/, 'applied começa falso nesta execução');
  assert.match(migration, /v_applied := found/, 'applied só reflete update real de user_access');
  assert.match(migration, /'applied', v_applied/, 'resposta não depende do snapshot antigo do pedido');
  assert.match(migration, /when v_order\.plan_id = 'monthly' then 1|case v_order\.plan_id when 'monthly' then 1/, 'monthly adiciona um mês');
  assert.match(migration, /when 'quarterly' then 3/, 'quarterly adiciona três meses');
  assert.match(migration, /v_access\.access_status = 'active'[\s\S]*access_expires_at > v_now/, 'active renova da validade futura');
  assert.match(migration, /else v_now[\s\S]*make_interval/, 'expired começa na confirmação');
  assert.match(migration, /v_access\.access_status <> 'lifetime'/, 'lifetime não é sobrescrito');
  assert.match(migration, /on conflict \(event_id\) do nothing/, 'webhook duplicado não duplica');
  assert.match(migration, /Eventos adversos ficam registrados para auditoria, mas não revogam user_access/, 'eventos adversos não revogam acesso de outro pagamento');

  const serverSource = fs.readFileSync('server.js', 'utf8');
  assert.match(serverSource, /req\.body\?\.planId/, 'checkout recebe somente planId útil');
  assert.match(serverSource, /"https:\/\/central-pro\.vercel\.app"/, 'localhost usa retorno público aceito pelo Asaas');
  assert.match(serverSource, /req\.get\("asaas-access-token"\)/, 'header oficial do webhook é validado');
  const plansSource = fs.readFileSync('public/planos.js', 'utf8');
  assert.doesNotMatch(plansSource, /19\.90|49\.90|userId|price/, 'frontend não envia preço ou userId');
  const paymentSources = `${fs.readFileSync('lib/asaas.js', 'utf8')}\n${fs.readFileSync('lib/asaas-payments.js', 'utf8')}\n${plansSource}`;
  assert.doesNotMatch(paymentSources, /api-football|api-sports/i, 'pagamentos não chamam API-Football');
  console.log('Asaas payment scenarios: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
