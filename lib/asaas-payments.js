const crypto = require("crypto");
const { getPlan } = require("./plans");
const { createAsaasClient } = require("./asaas");

const SUPPORTED_EVENTS = new Set([
    "PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED",
    "PAYMENT_DELETED", "PAYMENT_CHARGEBACK_REQUESTED", "PAYMENT_CHARGEBACK_DISPUTE"
]);

function secureEqual(left, right) {
    const a = Buffer.from(String(left || ""));
    const b = Buffer.from(String(right || ""));
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createAsaasPaymentService({
    supabaseUrl, publishableKey, serviceRoleKey, asaasApiKey, asaasEnvironment,
    webhookToken, fetchImpl = global.fetch
} = {}) {
    const url = String(supabaseUrl || "").replace(/\/+$/, "");
    const publicKey = String(publishableKey || "").trim();
    const adminKey = String(serviceRoleKey || "").trim();
    const expectedWebhookToken = String(webhookToken || "").trim();
    const webhookConfigured = expectedWebhookToken.length >= 32 && expectedWebhookToken.length <= 255 && !/\s/.test(expectedWebhookToken);
    const asaas = createAsaasClient({ apiKey: asaasApiKey, environment: asaasEnvironment, fetchImpl });

    async function jsonRequest(target, options) {
        const response = await fetchImpl(target, options);
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    async function validateUser(authorization) {
        const token = /^Bearer\s+([^\s]+)$/i.exec(String(authorization || "").trim())?.[1];
        if (!token || !url || !publicKey) return null;
        const { response, data } = await jsonRequest(`${url}/auth/v1/user`, { headers: { apikey: publicKey, Authorization: `Bearer ${token}` } });
        return response.ok && data?.id ? data : null;
    }

    async function adminRequest(path, { method = "GET", body, prefer } = {}) {
        if (!url || !adminKey) throw Object.assign(new Error("Supabase administrativo não configurado."), { code: "PAYMENTS_NOT_CONFIGURED" });
        const headers = { apikey: adminKey, Authorization: `Bearer ${adminKey}`, Accept: "application/json", "Content-Type": "application/json" };
        if (prefer) headers.Prefer = prefer;
        const { response, data } = await jsonRequest(`${url}/rest/v1/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
        if (!response.ok) throw Object.assign(new Error("Persistência de pagamento indisponível."), { code: "PAYMENT_STORAGE_FAILED", status: response.status });
        return data;
    }

    async function createCheckout({ authorization, planId, callbackBase }) {
        if (asaas.environment !== "sandbox") return { httpStatus: 503, body: { error: "sandbox_required" } };
        if (!asaas.configured() || !webhookConfigured || !adminKey) return { httpStatus: 503, body: { error: "payments_not_configured" } };
        const user = await validateUser(authorization);
        if (!user) return { httpStatus: 401, body: { error: "unauthorized" } };
        const plan = getPlan(planId);
        if (!plan) return { httpStatus: 400, body: { error: "invalid_plan" } };

        const accessRows = await adminRequest(`user_access?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,access_status,asaas_customer_id`);
        const access = accessRows[0];
        if (!access) return { httpStatus: 409, body: { error: "access_record_missing" } };

        const orders = await adminRequest("payment_orders?select=id", {
            method: "POST", prefer: "return=representation",
            body: { user_id: user.id, plan_id: plan.id, amount: plan.price, status: "pending" }
        });
        const order = orders[0];
        const callback = String(callbackBase || "").replace(/\/+$/, "");
        const payload = {
            billingTypes: ["PIX", "CREDIT_CARD"], chargeTypes: ["DETACHED"], minutesToExpire: 60,
            externalReference: order.id,
            callback: {
                successUrl: `${callback}/planos.html?checkout=success`,
                cancelUrl: `${callback}/planos.html?checkout=canceled`,
                expiredUrl: `${callback}/planos.html?checkout=expired`
            },
            items: [{ name: `Central Pro — ${plan.name}`, description: `Acesso ao Central Pro por ${plan.durationMonths} ${plan.durationMonths === 1 ? "mês" : "meses"}.`, quantity: 1, value: plan.price }]
        };
        if (access.asaas_customer_id) payload.customer = access.asaas_customer_id;

        try {
            const checkout = await asaas.request("/checkouts", { method: "POST", body: payload });
            const checkoutUrl = checkout.link || `https://sandbox.asaas.com/checkoutSession/show/${encodeURIComponent(checkout.id)}`;
            await adminRequest(`payment_orders?id=eq.${encodeURIComponent(order.id)}`, {
                method: "PATCH", prefer: "return=minimal", body: { asaas_checkout_id: checkout.id, checkout_url: checkoutUrl, updated_at: new Date().toISOString() }
            });
            return { httpStatus: 200, body: { checkoutUrl, paymentId: checkout.id } };
        } catch (error) {
            await adminRequest(`payment_orders?id=eq.${encodeURIComponent(order.id)}`, { method: "PATCH", prefer: "return=minimal", body: { status: "failed", updated_at: new Date().toISOString() } }).catch(() => {});
            throw error;
        }
    }

    async function processWebhook({ token, payload }) {
        if (!webhookConfigured) return { httpStatus: 503, body: { error: "payments_not_configured" } };
        if (!secureEqual(token, expectedWebhookToken)) return { httpStatus: 401, body: { error: "invalid_webhook_token" } };
        if (!adminKey || !url) return { httpStatus: 503, body: { error: "payments_not_configured" } };
        const eventType = String(payload?.event || "");
        if (!SUPPORTED_EVENTS.has(eventType)) return { httpStatus: 200, body: { received: true, ignored: true } };
        const payment = payload?.payment || {};
        const eventId = String(payload?.id || "");
        const paymentId = String(payment?.id || "");
        const externalReference = String(payment?.externalReference || payload?.checkout?.externalReference || "");
        if (!eventId || !paymentId || !externalReference) return { httpStatus: 400, body: { error: "invalid_webhook_payload" } };
        const customerId = typeof payment.customer === "string" ? payment.customer : payment.customer?.id;
        const result = await adminRequest("rpc/process_asaas_payment_event", {
            method: "POST", prefer: "return=representation",
            body: { p_event_id: eventId, p_event_type: eventType, p_payment_id: paymentId, p_external_reference: externalReference, p_customer_id: customerId || null }
        });
        return { httpStatus: 200, body: { received: true, duplicate: Boolean(result?.duplicate) } };
    }

    return { createCheckout, processWebhook };
}

module.exports = { SUPPORTED_EVENTS, secureEqual, createAsaasPaymentService };
