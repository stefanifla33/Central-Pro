const assert = require('assert');
const fs = require('fs');
const { PAGBANK_BASE_URLS, createPagBankClient } = require('../lib/pagbank');
const { authenticityToken, eventDetails, createPagBankPaymentService } = require('../lib/pagbank-payments');

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const TOKEN = 'pagbank-server-secret';

function response(ok, data, status = ok ? 200 : 400) {
  return { ok, status, json: async () => data };
}

function scenario({ planId = 'monthly', amount = 19.90, verifiedAmount = 1990, verifiedStatus = 'PAID', accessStatus = 'trial', futureExpiry = null } = {}) {
  const calls = [];
  const seenEvents = new Set();
  const state = { accessStatus, planId: null, expiry: futureExpiry, applied: 0, orderStatus: 'pending', paymentId: null };
  const order = { id: ORDER_ID, user_id: USER_ID, plan_id: planId, amount, provider_checkout_id: 'CHEC_TEST', provider_payment_id: null };
  const fetchImpl = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, options, body });
    if (url.endsWith('/auth/v1/user')) return response(true, { id: USER_ID });
    if (url.includes('/user_access?')) return response(true, [{ user_id: USER_ID }]);
    if (url.endsWith('/payment_orders?select=id') && options.method === 'POST') return response(true, [{ id: ORDER_ID }]);
    if (url.includes('/payment_orders?id=eq.') && options.method === 'PATCH') return response(true, {});
    if (url.includes(`/payment_orders?id=eq.${ORDER_ID}`) && options.method !== 'PATCH') return response(true, [order]);
    if (url.includes('/payment_orders?id=eq.') && options.method !== 'PATCH') return response(true, []);
    if (url.endsWith('/rpc/process_pagbank_payment_event')) {
      if (seenEvents.has(body.p_event_id)) return response(true, { duplicate: true, applied: false });
      seenEvents.add(body.p_event_id);
      state.orderStatus = body.p_event_type.split('.').pop().toLowerCase();
      state.paymentId = body.p_payment_id;
      if (body.p_event_type === 'ORDER.CHARGE.PAID' && state.applied === 0) {
        if (state.accessStatus !== 'lifetime') {
          state.accessStatus = 'active';
          state.planId = planId;
          const base = futureExpiry ? new Date(futureExpiry) : new Date('2026-08-31T12:00:00Z');
          base.setUTCMonth(base.getUTCMonth() + (planId === 'quarterly' ? 3 : 1));
          state.expiry = base.toISOString();
        }
        state.applied += 1;
      }
      return response(true, { duplicate: false, applied: state.accessStatus !== 'lifetime' && body.p_event_type === 'ORDER.CHARGE.PAID' });
    }
    if (url.endsWith('/checkouts') && options.method === 'POST') {
      return response(true, { id: 'CHEC_TEST', links: [{ rel: 'PAY', method: 'GET', href: 'https://pagamento.pagseguro.uol.com.br/pagamento?code=TEST' }] });
    }
    if (url.endsWith('/checkouts/CHEC_TEST')) {
      return response(true, { id: 'CHEC_TEST', reference_id: ORDER_ID, payments: [{ id: 'CHAR_TEST', status: verifiedStatus, amount: { value: verifiedAmount, currency: 'BRL' } }] });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const service = createPagBankPaymentService({
    supabaseUrl: 'https://project.supabase.co', publishableKey: 'public-key', serviceRoleKey: 'service-key',
    pagBankToken: TOKEN, pagBankEnvironment: 'sandbox', fetchImpl, logger: { info() {}, error() {} }
  });
  return { calls, service, state };
}

function notification(event = 'ORDER.CHARGE.PAID', status = 'PAID') {
  const payload = { event, data: { id: 'ORDE_TEST', reference_id: ORDER_ID, charges: [{ id: 'CHAR_TEST', status, amount: { value: 1990 } }] } };
  const rawBody = JSON.stringify(payload);
  return { payload, rawBody, signature: authenticityToken(TOKEN, rawBody) };
}

(async () => {
  assert.strictEqual(PAGBANK_BASE_URLS.sandbox, 'https://sandbox.api.pagseguro.com');
  assert.strictEqual(PAGBANK_BASE_URLS.production, 'https://api.pagseguro.com');
  assert.strictEqual(createPagBankClient({ token: TOKEN }).configured(), true);
  assert.match(authenticityToken(TOKEN, '{}'), /^[a-f0-9]{64}$/);
  assert.strictEqual(eventDetails({ reference_id: ORDER_ID, charges: [{ id: 'CHAR_TEST', status: 'PAID' }] }).eventType, 'ORDER.CHARGE.PAID', 'payload oficial sem nome de evento é normalizado pelo status');

  for (const [planId, expectedCents] of [['monthly', 1990], ['quarterly', 4990]]) {
    const checkoutScenario = scenario({ planId, amount: expectedCents / 100 });
    const result = await checkoutScenario.service.createCheckout({
      authorization: 'Bearer valid', planId, price: 1, userId: 'forged-user', callbackBase: 'https://central-pro.vercel.app'
    });
    assert.strictEqual(result.httpStatus, 200);
    assert.match(result.body.checkoutUrl, /^https:\/\/pagamento\.pagseguro\.uol\.com\.br\//);
    const insert = checkoutScenario.calls.find((call) => call.url.endsWith('/payment_orders?select=id'));
    assert.strictEqual(insert.body.user_id, USER_ID, 'userId forjado é ignorado');
    assert.strictEqual(insert.body.amount, expectedCents / 100, 'preço forjado é ignorado');
    assert.strictEqual(insert.body.provider, 'pagbank');
    const pagBank = checkoutScenario.calls.find((call) => call.url.endsWith('/checkouts'));
    assert.strictEqual(pagBank.body.items[0].unit_amount, expectedCents);
    assert.deepStrictEqual(pagBank.body.payment_methods, [{ type: 'PIX' }, { type: 'CREDIT_CARD' }]);
    assert.deepStrictEqual(pagBank.body.payment_notification_urls, ['https://central-pro.vercel.app/api/payments/pagbank/webhook']);
    assert.deepStrictEqual(pagBank.body.redirect_url, 'https://central-pro.vercel.app/minha-conta.html');
  }

  const approved = scenario();
  const paid = notification();
  assert.strictEqual((await approved.service.processWebhook({ ...paid, signature: 'forged' })).httpStatus, 401, 'assinatura inválida é recusada');
  const first = await approved.service.processWebhook(paid);
  const duplicate = await approved.service.processWebhook(paid);
  assert.deepStrictEqual(first.body, { received: true, duplicate: false, applied: true });
  assert.strictEqual(duplicate.body.duplicate, true);
  assert.strictEqual(approved.state.applied, 1, 'webhook duplicado não adiciona outro mês');
  assert.strictEqual(approved.state.accessStatus, 'active', 'trial é ativado');
  assert.strictEqual(approved.state.planId, 'monthly');

  const expired = scenario({ accessStatus: 'expired' });
  await expired.service.processWebhook(notification());
  assert.strictEqual(expired.state.accessStatus, 'active', 'expired é reativado');

  const active = scenario({ accessStatus: 'active', futureExpiry: '2026-10-10T12:00:00Z' });
  await active.service.processWebhook(notification());
  assert.strictEqual(active.state.expiry, '2026-11-10T12:00:00.000Z', 'active renova a partir da validade futura');

  const lifetime = scenario({ accessStatus: 'lifetime' });
  await lifetime.service.processWebhook(notification());
  assert.strictEqual(lifetime.state.accessStatus, 'lifetime');
  assert.strictEqual(lifetime.state.planId, null);

  for (const [event, status] of [['ORDER.CHARGE.DECLINED', 'DECLINED'], ['ORDER.CHARGE.CANCELED', 'CANCELED'], ['CHARGEBACK.CREATED', 'PAID']]) {
    const negative = scenario({ verifiedStatus: status });
    const result = await negative.service.processWebhook(notification(event, status));
    assert.strictEqual(result.httpStatus, 200, event);
    assert.strictEqual(negative.state.accessStatus, 'trial', `${event} não concede nem reduz acesso`);
    assert.strictEqual(negative.state.applied, 0);
  }

  const wrongAmount = scenario({ verifiedAmount: 1989 });
  assert.strictEqual((await wrongAmount.service.processWebhook(notification())).body.error, 'payment_amount_mismatch');
  const wrongStatus = scenario({ verifiedStatus: 'DECLINED' });
  assert.strictEqual((await wrongStatus.service.processWebhook(notification())).body.error, 'payment_status_mismatch');
  const unknown = scenario();
  unknown.calls.length = 0;
  const unknownPayload = notification();
  unknownPayload.payload.data.reference_id = '33333333-3333-4333-8333-333333333333';
  unknownPayload.rawBody = JSON.stringify(unknownPayload.payload);
  unknownPayload.signature = authenticityToken(TOKEN, unknownPayload.rawBody);
  const originalProcess = unknown.service.processWebhook;
  const unknownResult = await originalProcess(unknownPayload);
  assert.strictEqual(unknownResult.httpStatus, 404);

  const migration = fs.readFileSync('supabase/pagbank-payments.sql', 'utf8');
  assert.match(migration, /v_access\.access_status <> 'lifetime'/);
  assert.match(migration, /on conflict \(event_id\) do nothing/);
  assert.match(migration, /p_amount_cents <> v_expected_cents/);
  assert.match(migration, /Eventos adversos são auditados, mas nunca reduzem/);
  const publicSources = ['public/planos.js', 'public/minha-conta.js', 'public/planos.html', 'public/trial-expired.js', 'public/trial-expired.html'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.match(publicSources, /\/api\/payments\/pagbank\/checkout/);
  assert.doesNotMatch(publicSources, /PAGBANK_TOKEN|Bearer pagbank|service.role/i, 'nenhum segredo PagBank está no frontend');
  const serverSource = fs.readFileSync('server.js', 'utf8');
  assert.match(serverSource, /req\.get\("x-authenticity-token"\)/);
  assert.match(serverSource, /req\.rawBody/);
  console.log('PagBank payment scenarios: OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
