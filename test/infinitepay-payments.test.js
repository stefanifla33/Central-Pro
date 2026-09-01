const assert = require('assert');
const fs = require('fs');
const { INFINITEPAY_BASE_URL, createInfinitePayClient } = require('../lib/infinitepay');
const {
  INFINITEPAY_PRODUCTION_BASE_URL, infinitePayCallbackBase, createInfinitePayPaymentService
} = require('../lib/infinitepay-payments');

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TRANSACTION_ID = '33333333-3333-4333-8333-333333333333';

function response(ok, data, status = ok ? 200 : 400, contentType = 'application/json; charset=utf-8') {
  return {
    ok, status,
    headers: { get: (name) => name.toLowerCase() === 'content-type' ? contentType : null },
    text: async () => typeof data === 'string' ? data : JSON.stringify(data),
    json: async () => data
  };
}

function scenario({
  planId = 'monthly', amount = 19.90, verifiedAmount = 1990,
  paid = true, success = true, accessStatus = 'trial', futureExpiry = null,
  checkoutUrl = 'https://checkout.infinitepay.com.br/centralpro?lenc=test'
} = {}) {
  const calls = [];
  const seenEvents = new Set();
  const state = { accessStatus, planId: null, expiry: futureExpiry, applied: 0, orderStatus: 'pending' };
  const order = {
    id: ORDER_ID, user_id: USER_ID, plan_id: planId, amount,
    provider_checkout_id: null, provider_payment_id: null
  };
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, options, body });
    if (url.endsWith('/auth/v1/user')) return response(options.headers.Authorization === 'Bearer valid', options.headers.Authorization === 'Bearer valid' ? { id: USER_ID } : {} , 401);
    if (url.includes('/user_access?')) return response(true, [{ user_id: USER_ID }]);
    if (url.endsWith('/payment_orders?select=id') && options.method === 'POST') return response(true, [{ id: ORDER_ID }]);
    if (url.includes('/payment_orders?id=eq.') && options.method === 'PATCH') return response(true, {});
    if (url.includes(`/payment_orders?id=eq.${ORDER_ID}`) && options.method !== 'PATCH') return response(true, [order]);
    if (url.includes('/payment_orders?id=eq.') && options.method !== 'PATCH') return response(true, []);
    if (url.endsWith('/rpc/process_infinitepay_payment_event')) {
      if (seenEvents.has(body.p_event_id)) return response(true, { duplicate: true, applied: false });
      seenEvents.add(body.p_event_id);
      state.orderStatus = 'paid';
      if (state.applied === 0) {
        if (state.accessStatus !== 'lifetime') {
          state.accessStatus = 'active';
          state.planId = planId;
          const base = futureExpiry ? new Date(futureExpiry) : new Date('2026-08-31T12:00:00Z');
          base.setUTCMonth(base.getUTCMonth() + (planId === 'quarterly' ? 3 : 1));
          state.expiry = base.toISOString();
        }
        state.applied += 1;
      }
      return response(true, { duplicate: false, applied: state.accessStatus !== 'lifetime' });
    }
    if (url === `${INFINITEPAY_BASE_URL}/links`) {
      return response(true, { url: checkoutUrl });
    }
    if (url === `${INFINITEPAY_BASE_URL}/payment_check`) {
      return response(true, { success, paid, amount: verifiedAmount, paid_amount: verifiedAmount, capture_method: 'pix' });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const logs = [];
  const service = createInfinitePayPaymentService({
    supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key', serviceRoleKey: 'service-key',
    infinitePayHandle: '$centralpro', fetchImpl, logger: { info(message, details) { logs.push({ message, details }); }, error() {} }
  });
  return { calls, service, state, logs };
}

function notification(overrides = {}) {
  return { payload: {
    invoice_slug: 'invoice-test', amount: 1990, paid_amount: 1990,
    transaction_nsu: TRANSACTION_ID, order_nsu: ORDER_ID, capture_method: 'pix', ...overrides
  } };
}

(async () => {
  assert.strictEqual(INFINITEPAY_BASE_URL, 'https://api.checkout.infinitepay.io');
  assert.strictEqual(createInfinitePayClient({ handle: '$centralpro', fetchImpl: async () => {} }).handle, 'centralpro');
  assert.strictEqual(INFINITEPAY_PRODUCTION_BASE_URL, 'https://central-pro.vercel.app');
  assert.strictEqual(
    infinitePayCallbackBase({ nodeEnv: 'production', vercel: '1', port: 3000, vercelUrl: 'central-preview-projects.vercel.app' }),
    'https://central-pro.vercel.app',
    'produção ignora completamente a URL dinâmica do deployment'
  );
  assert.strictEqual(infinitePayCallbackBase({ nodeEnv: 'development', vercel: '', port: 4567 }), 'http://localhost:4567');

  const productionCheckout = scenario();
  await productionCheckout.service.createCheckout({
    authorization: 'Bearer valid', planId: 'monthly',
    callbackBase: infinitePayCallbackBase({ nodeEnv: 'production', vercel: '1' })
  });
  const productionPayload = productionCheckout.calls.find((call) => call.url === `${INFINITEPAY_BASE_URL}/links`).body;
  assert.strictEqual(productionPayload.redirect_url, 'https://central-pro.vercel.app/minha-conta.html');
  assert.strictEqual(productionPayload.webhook_url, 'https://central-pro.vercel.app/api/payments/infinitepay/webhook');

  for (const [planId, expectedCents] of [['monthly', 1990], ['quarterly', 4990]]) {
    const checkout = scenario({ planId, amount: expectedCents / 100 });
    const result = await checkout.service.createCheckout({
      authorization: 'Bearer valid', planId, price: 1, userId: 'forged', callbackBase: 'https://central-pro.vercel.app'
    });
    assert.strictEqual(result.httpStatus, 200, `checkout ${planId}`);
    assert.deepStrictEqual(Object.keys(result.body), ['checkoutUrl'], 'frontend recebe somente a URL');
    const insert = checkout.calls.find((call) => call.url.endsWith('/payment_orders?select=id'));
    assert.deepStrictEqual(insert.body, {
      user_id: USER_ID, plan_id: planId, amount: expectedCents / 100, status: 'pending',
      provider: 'infinitepay', provider_checkout_id: null, provider_payment_id: null
    });
    const providerCall = checkout.calls.find((call) => call.url === `${INFINITEPAY_BASE_URL}/links`);
    assert.strictEqual(providerCall.body.order_nsu, ORDER_ID);
    assert.strictEqual(providerCall.body.items[0].price, expectedCents);
    assert.strictEqual(providerCall.body.redirect_url, 'https://central-pro.vercel.app/minha-conta.html');
    assert.strictEqual(providerCall.body.webhook_url, 'https://central-pro.vercel.app/api/payments/infinitepay/webhook');
    assert.strictEqual(providerCall.body.address, undefined, 'endereço não é solicitado');
    const persistedCheckout = checkout.calls.find((call) => call.url.includes('/payment_orders?id=eq.') && call.options.method === 'PATCH' && call.body.checkout_url);
    assert.strictEqual(persistedCheckout.body.checkout_url, result.body.checkoutUrl);
    assert.strictEqual(persistedCheckout.body.provider_checkout_id, undefined, 'URL nunca ocupa o campo reservado ao invoice_slug');
    const responseLog = checkout.logs.find((entry) => entry.message.includes('POST /links response'));
    assert.strictEqual(responseLog.details.status, 200);
    assert.strictEqual(responseLog.details.contentType, 'application/json; charset=utf-8');
    assert.strictEqual(responseLog.details.body.url, 'https://checkout.infinitepay.com.br/centralpro?[redacted]', 'query sensível é removida do log');
  }

  const productionHost = scenario({ checkoutUrl: 'https://checkout.infinitepay.io/stefani-pena?lenc=production-test' });
  const productionResult = await productionHost.service.createCheckout({
    authorization: 'Bearer valid', planId: 'monthly', callbackBase: 'https://central-pro.vercel.app'
  });
  assert.strictEqual(productionResult.body.checkoutUrl, 'https://checkout.infinitepay.io/stefani-pena?lenc=production-test');
  const productionLog = productionHost.logs.find((entry) => entry.message.includes('POST /links response'));
  assert.strictEqual(productionLog.details.body.url, 'https://checkout.infinitepay.io/stefani-pena?[redacted]');

  const fakeHost = scenario({ checkoutUrl: 'https://checkout.infinitepay.io.evil.example/stefani-pena?lenc=test' });
  await assert.rejects(
    fakeHost.service.createCheckout({ authorization: 'Bearer valid', planId: 'monthly', callbackBase: 'https://central-pro.vercel.app' }),
    (error) => error?.code === 'INFINITEPAY_INVALID_RESPONSE',
    'hostname parecido, mas fora da allowlist exata, é rejeitado'
  );

  const unauthenticated = scenario();
  assert.strictEqual((await unauthenticated.service.createCheckout({ planId: 'monthly' })).httpStatus, 401);
  const invalidPlan = scenario();
  assert.strictEqual((await invalidPlan.service.createCheckout({ authorization: 'Bearer valid', planId: 'lifetime' })).body.error, 'invalid_plan');

  const approved = scenario();
  const first = await approved.service.processWebhook(notification());
  const duplicate = await approved.service.processWebhook(notification());
  assert.deepStrictEqual(first.body, { success: true, message: null, duplicate: false, applied: true });
  assert.strictEqual(duplicate.body.duplicate, true);
  assert.strictEqual(approved.state.applied, 1, 'webhook duplicado não adiciona outro mês');
  const check = approved.calls.find((call) => call.url === `${INFINITEPAY_BASE_URL}/payment_check`);
  assert.deepStrictEqual(check.body, { handle: 'centralpro', order_nsu: ORDER_ID, transaction_nsu: TRANSACTION_ID, slug: 'invoice-test' });

  const wrongAmount = scenario({ verifiedAmount: 1989 });
  assert.strictEqual((await wrongAmount.service.processWebhook(notification())).body.error, 'payment_amount_mismatch');
  assert.strictEqual(wrongAmount.state.applied, 0);
  const invalidOrder = scenario();
  assert.strictEqual((await invalidOrder.service.processWebhook(notification({ order_nsu: 'not-a-uuid' }))).httpStatus, 400);
  assert.strictEqual(invalidOrder.calls.some((call) => call.url.includes('/payment_check')), false);
  const pending = scenario({ paid: false });
  assert.strictEqual((await pending.service.processWebhook(notification())).body.error, 'payment_not_paid');
  assert.strictEqual(pending.state.applied, 0);

  const active = scenario({ accessStatus: 'active', futureExpiry: '2026-10-10T12:00:00Z' });
  await active.service.processWebhook(notification());
  assert.strictEqual(active.state.expiry, '2026-11-10T12:00:00.000Z');
  for (const status of ['trial', 'expired']) {
    const activation = scenario({ accessStatus: status });
    await activation.service.processWebhook(notification());
    assert.strictEqual(activation.state.accessStatus, 'active', `${status} é ativado`);
  }
  const lifetime = scenario({ accessStatus: 'lifetime' });
  await lifetime.service.processWebhook(notification());
  assert.strictEqual(lifetime.state.accessStatus, 'lifetime');
  assert.strictEqual(lifetime.state.planId, null);

  for (const providerState of [{ paid: false }, { success: false, paid: false }]) {
    const failed = scenario({ accessStatus: 'active', futureExpiry: '2026-10-10T12:00:00Z', ...providerState });
    await failed.service.processWebhook(notification());
    assert.strictEqual(failed.state.accessStatus, 'active', 'falha/cancelamento não reduz acesso');
    assert.strictEqual(failed.state.expiry, '2026-10-10T12:00:00Z');
  }

  const migration = fs.readFileSync('supabase/infinitepay-payments.sql', 'utf8');
  assert.match(migration, /provider in \('asaas', 'pagbank', 'infinitepay'\)/);
  assert.match(migration, /on conflict \(event_id\) do nothing/);
  assert.match(migration, /v_access\.access_status <> 'lifetime'/);
  assert.match(migration, /access_applied_at is null/);
  const frontend = `${fs.readFileSync('public/planos.js', 'utf8')}\n${fs.readFileSync('public/minha-conta.js', 'utf8')}`;
  assert.match(frontend, /\/api\/payments\/infinitepay\/checkout/);
  assert.doesNotMatch(frontend, /INFINITEPAY_HANDLE|service.role|payment_check/i);
  assert.doesNotMatch(fs.readFileSync('server.js', 'utf8'), /INFINITEPAY_WEBHOOK_SECRET/);
  console.log('InfinitePay payment scenarios: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
