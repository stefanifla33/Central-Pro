const { getPlan } = require("./plans");
const { createInfinitePayClient } = require("./infinitepay");

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createInfinitePayPaymentService({
    supabaseUrl, publishableKey, serviceRoleKey, infinitePayHandle,
    fetchImpl = global.fetch, logger = console
} = {}) {
    const url = String(supabaseUrl || "").replace(/\/+$/, "");
    const publicKey = String(publishableKey || "").trim();
    const adminKey = String(serviceRoleKey || "").trim();
    const infinitePay = createInfinitePayClient({
        handle: infinitePayHandle,
        fetchImpl,
        onResponse: ({ path, status, contentType, body }) => {
            if (path === "/links") {
                logger.info("[INFINITEPAY-CHECKOUT] POST /links response", {
                    status, contentType: contentType || null, body
                });
            }
        }
    });

    function officialCheckoutUrl(value) {
        try {
            const checkoutUrl = new URL(String(value || "").trim());
            const allowedHosts = new Set(["checkout.infinitepay.io", "checkout.infinitepay.com.br"]);
            return checkoutUrl.protocol === "https:" && allowedHosts.has(checkoutUrl.hostname.toLowerCase())
                ? checkoutUrl.toString() : "";
        } catch (_error) {
            return "";
        }
    }

    async function jsonRequest(target, options) {
        const response = await fetchImpl(target, options);
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    async function validateUser(authorization) {
        const token = /^Bearer\s+([^\s]+)$/i.exec(String(authorization || "").trim())?.[1];
        if (!token || !url || !publicKey) return null;
        const { response, data } = await jsonRequest(`${url}/auth/v1/user`, {
            headers: { apikey: publicKey, Authorization: `Bearer ${token}` }
        });
        return response.ok && data?.id ? data : null;
    }

    async function adminRequest(path, { method = "GET", body, prefer } = {}) {
        if (!url || !adminKey) throw Object.assign(new Error("Supabase administrativo não configurado."), { code: "PAYMENTS_NOT_CONFIGURED" });
        const headers = { apikey: adminKey, Authorization: `Bearer ${adminKey}`, Accept: "application/json", "Content-Type": "application/json" };
        if (prefer) headers.Prefer = prefer;
        const { response, data } = await jsonRequest(`${url}/rest/v1/${path}`, {
            method, headers, body: body === undefined ? undefined : JSON.stringify(body)
        });
        if (!response.ok) throw Object.assign(new Error("Persistência de pagamento indisponível."), { code: "PAYMENT_STORAGE_FAILED", status: response.status });
        return data;
    }

    async function createCheckout({ authorization, planId, callbackBase }) {
        if (!infinitePay.configured() || !adminKey) return { httpStatus: 503, body: { error: "payments_not_configured" } };
        const user = await validateUser(authorization);
        if (!user) return { httpStatus: 401, body: { error: "unauthorized" } };
        const plan = getPlan(planId);
        if (!plan) return { httpStatus: 400, body: { error: "invalid_plan" } };
        const access = await adminRequest(`user_access?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
        if (!access[0]) return { httpStatus: 409, body: { error: "access_record_missing" } };

        const orders = await adminRequest("payment_orders?select=id", {
            method: "POST", prefer: "return=representation",
            body: {
                user_id: user.id, plan_id: plan.id, amount: plan.price, status: "pending",
                provider: "infinitepay", provider_checkout_id: null, provider_payment_id: null
            }
        });
        const order = orders[0];
        if (!order?.id) throw Object.assign(new Error("Pedido de pagamento não retornado."), { code: "PAYMENT_STORAGE_FAILED" });
        const base = String(callbackBase || "").replace(/\/+$/, "");
        const payload = {
            handle: infinitePay.handle,
            order_nsu: order.id,
            redirect_url: `${base}/minha-conta.html`,
            webhook_url: `${base}/api/payments/infinitepay/webhook`,
            items: [{ quantity: 1, price: Math.round(plan.price * 100), description: `Central Pro - Plano ${plan.name}` }]
        };
        try {
            const checkout = await infinitePay.request("/links", payload);
            const checkoutUrl = officialCheckoutUrl(checkout?.url);
            if (!checkoutUrl) {
                throw Object.assign(new Error("Checkout InfinitePay inválido."), { code: "INFINITEPAY_INVALID_RESPONSE" });
            }
            await adminRequest(`payment_orders?id=eq.${encodeURIComponent(order.id)}`, {
                method: "PATCH", prefer: "return=minimal", body: { checkout_url: checkoutUrl, updated_at: new Date().toISOString() }
            });
            return { httpStatus: 200, body: { checkoutUrl } };
        } catch (error) {
            await adminRequest(`payment_orders?id=eq.${encodeURIComponent(order.id)}`, {
                method: "PATCH", prefer: "return=minimal", body: { status: "failed", updated_at: new Date().toISOString() }
            }).catch(() => {});
            throw error;
        }
    }

    async function processWebhook({ payload }) {
        if (!infinitePay.configured() || !adminKey || !url) return { httpStatus: 503, body: { success: false, message: "Pagamentos não configurados" } };
        const orderNsu = String(payload?.order_nsu || "");
        const transactionNsu = String(payload?.transaction_nsu || "");
        const slug = String(payload?.invoice_slug || payload?.slug || "");
        if (!UUID_PATTERN.test(orderNsu) || !transactionNsu || !slug) {
            return { httpStatus: 400, body: { success: false, message: "Notificação inválida" } };
        }
        const orders = await adminRequest(`payment_orders?id=eq.${encodeURIComponent(orderNsu)}&provider=eq.infinitepay&select=id,user_id,plan_id,amount,provider_checkout_id,provider_payment_id`);
        const order = orders[0];
        if (!order) return { httpStatus: 400, body: { success: false, message: "Pedido não encontrado" } };

        const verified = await infinitePay.request("/payment_check", {
            handle: infinitePay.handle, order_nsu: order.id, transaction_nsu: transactionNsu, slug
        });
        if (verified?.success !== true || verified?.paid !== true) {
            return { httpStatus: 400, body: { success: false, message: "Pagamento não confirmado", error: "payment_not_paid" } };
        }
        const expectedCents = Math.round(Number(order.amount) * 100);
        if (!Number.isSafeInteger(verified.amount) || verified.amount !== expectedCents) {
            return { httpStatus: 400, body: { success: false, message: "Valor divergente", error: "payment_amount_mismatch" } };
        }
        if (order.provider_payment_id && order.provider_payment_id !== transactionNsu) {
            return { httpStatus: 400, body: { success: false, message: "Transação divergente", error: "payment_reference_mismatch" } };
        }
        if (order.provider_checkout_id && order.provider_checkout_id !== slug) {
            return { httpStatus: 400, body: { success: false, message: "Fatura divergente", error: "payment_reference_mismatch" } };
        }
        const eventId = `infinitepay:${transactionNsu}:paid`;
        const result = await adminRequest("rpc/process_infinitepay_payment_event", {
            method: "POST", prefer: "return=representation",
            body: {
                p_event_id: eventId, p_order_nsu: order.id, p_transaction_nsu: transactionNsu,
                p_invoice_slug: slug, p_amount_cents: verified.amount
            }
        });
        logger.info("[INFINITEPAY-WEBHOOK] payment verified", { orderNsu: order.id, duplicate: Boolean(result?.duplicate) });
        return { httpStatus: 200, body: { success: true, message: null, duplicate: Boolean(result?.duplicate), applied: Boolean(result?.applied) } };
    }

    return { createCheckout, processWebhook };
}

module.exports = { UUID_PATTERN, createInfinitePayPaymentService };
