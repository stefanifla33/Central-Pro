const crypto = require("crypto");
const { getPlan } = require("./plans");
const { createPagBankClient } = require("./pagbank");

const SUPPORTED_EVENTS = new Set([
    "ORDER.CHARGE.PAID", "ORDER.CHARGE.DECLINED", "ORDER.CHARGE.CANCELED", "CHARGEBACK.CREATED"
]);

function secureEqual(left, right) {
    const a = Buffer.from(String(left || "").trim().toLowerCase());
    const b = Buffer.from(String(right || "").trim().toLowerCase());
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticityToken(token, rawBody) {
    return crypto.createHash("sha256").update(`${String(token || "")}-${String(rawBody || "")}`, "utf8").digest("hex");
}

function cents(value) {
    const amount = Number(value);
    return Number.isSafeInteger(amount) ? amount : null;
}

function chargeAmount(charge) {
    return cents(charge?.amount?.value ?? charge?.amount);
}

function collectCharges(value, result = [], seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return result;
    seen.add(value);
    if (String(value.id || "").startsWith("CHAR_") && value.status) result.push(value);
    for (const key of ["charges", "payments", "orders", "data"]) {
        const child = value[key];
        if (Array.isArray(child)) child.forEach((item) => collectCharges(item, result, seen));
        else collectCharges(child, result, seen);
    }
    return result;
}

function eventDetails(payload) {
    const resource = payload?.data && typeof payload.data === "object" ? payload.data : payload;
    const charges = collectCharges(resource);
    const charge = charges[0] || (String(resource?.id || "").startsWith("CHAR_") ? resource : null);
    const status = String(charge?.status || payload?.status || "").toUpperCase();
    const explicit = String(payload?.event || payload?.type || "").toUpperCase();
    const eventType = SUPPORTED_EVENTS.has(explicit)
        ? explicit
        : status === "PAID" ? "ORDER.CHARGE.PAID"
            : status === "DECLINED" ? "ORDER.CHARGE.DECLINED"
                : status === "CANCELED" ? "ORDER.CHARGE.CANCELED" : "";
    return {
        resource,
        charge,
        eventType,
        orderReference: String(resource?.reference_id || payload?.reference_id || charge?.reference_id || ""),
        paymentId: String(charge?.id || payload?.charge_id || payload?.payment_id || "")
    };
}

function createPagBankPaymentService({
    supabaseUrl, publishableKey, serviceRoleKey, pagBankToken, pagBankEnvironment,
    fetchImpl = global.fetch, logger = console
} = {}) {
    const url = String(supabaseUrl || "").replace(/\/+$/, "");
    const publicKey = String(publishableKey || "").trim();
    const adminKey = String(serviceRoleKey || "").trim();
    const token = String(pagBankToken || "").trim();
    const pagBank = createPagBankClient({ token, environment: pagBankEnvironment, fetchImpl });

    async function jsonRequest(target, options) {
        const response = await fetchImpl(target, options);
        const data = await response.json().catch(() => ({}));
        return { response, data };
    }

    async function validateUser(authorization) {
        const bearer = /^Bearer\s+([^\s]+)$/i.exec(String(authorization || "").trim())?.[1];
        if (!bearer || !url || !publicKey) return null;
        const { response, data } = await jsonRequest(`${url}/auth/v1/user`, {
            headers: { apikey: publicKey, Authorization: `Bearer ${bearer}` }
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
        if (!pagBank.configured() || !adminKey) return { httpStatus: 503, body: { error: "payments_not_configured" } };
        const user = await validateUser(authorization);
        if (!user) return { httpStatus: 401, body: { error: "unauthorized" } };
        const plan = getPlan(planId);
        if (!plan) return { httpStatus: 400, body: { error: "invalid_plan" } };
        const accessRows = await adminRequest(`user_access?user_id=eq.${encodeURIComponent(user.id)}&select=user_id`);
        if (!accessRows[0]) return { httpStatus: 409, body: { error: "access_record_missing" } };

        const orders = await adminRequest("payment_orders?select=id", {
            method: "POST", prefer: "return=representation",
            body: { user_id: user.id, plan_id: plan.id, amount: plan.price, status: "pending", provider: "pagbank" }
        });
        const order = orders[0];
        if (!order?.id) throw Object.assign(new Error("Pedido de pagamento não retornado."), { code: "PAYMENT_STORAGE_FAILED" });
        const base = String(callbackBase || "").replace(/\/+$/, "");
        const webhookUrl = `${base}/api/payments/pagbank/webhook`;
        const payload = {
            reference_id: order.id,
            items: [{ reference_id: plan.id, name: `Central Pro - ${plan.name}`, quantity: 1, unit_amount: Math.round(plan.price * 100) }],
            payment_methods: [{ type: "PIX" }, { type: "CREDIT_CARD" }],
            redirect_url: `${base}/minha-conta.html`,
            return_url: `${base}/minha-conta.html`,
            payment_notification_urls: [webhookUrl]
        };

        try {
            const checkout = await pagBank.request("/checkouts", { method: "POST", body: payload });
            const checkoutUrl = checkout.links?.find((link) => link?.rel === "PAY" && link?.method === "GET")?.href;
            if (!checkout.id || !checkoutUrl) throw Object.assign(new Error("Checkout PagBank incompleto."), { code: "PAGBANK_INVALID_RESPONSE" });
            await adminRequest(`payment_orders?id=eq.${encodeURIComponent(order.id)}`, {
                method: "PATCH", prefer: "return=minimal",
                body: { provider_checkout_id: checkout.id, checkout_url: checkoutUrl, updated_at: new Date().toISOString() }
            });
            return { httpStatus: 200, body: { checkoutUrl } };
        } catch (error) {
            await adminRequest(`payment_orders?id=eq.${encodeURIComponent(order.id)}`, {
                method: "PATCH", prefer: "return=minimal", body: { status: "failed", updated_at: new Date().toISOString() }
            }).catch(() => {});
            throw error;
        }
    }

    async function processWebhook({ signature, rawBody, payload }) {
        if (!token || !adminKey || !url || !pagBank.configured()) return { httpStatus: 503, body: { error: "payments_not_configured" } };
        if (!secureEqual(signature, authenticityToken(token, rawBody))) return { httpStatus: 401, body: { error: "invalid_webhook_signature" } };
        const details = eventDetails(payload);
        if (!SUPPORTED_EVENTS.has(details.eventType)) return { httpStatus: 200, body: { received: true, ignored: true } };
        if (!details.orderReference || !details.paymentId) return { httpStatus: 400, body: { error: "invalid_webhook_payload" } };

        const orders = await adminRequest(
            `payment_orders?id=eq.${encodeURIComponent(details.orderReference)}&provider=eq.pagbank&select=id,user_id,plan_id,amount,provider_checkout_id,provider_payment_id`
        );
        const order = orders[0];
        if (!order?.provider_checkout_id) return { httpStatus: 404, body: { error: "payment_not_found" } };
        const verified = await pagBank.request(`/checkouts/${encodeURIComponent(order.provider_checkout_id)}`);
        if (String(verified?.reference_id || "") !== String(order.id)) return { httpStatus: 409, body: { error: "payment_reference_mismatch" } };
        const verifiedCharge = collectCharges(verified).find((charge) => String(charge.id) === details.paymentId);
        if (!verifiedCharge) return { httpStatus: 404, body: { error: "payment_not_found" } };
        const verifiedStatus = String(verifiedCharge.status || "").toUpperCase();
        const expectedStatus = details.eventType === "CHARGEBACK.CREATED" ? null : details.eventType.split(".").pop();
        if (expectedStatus && verifiedStatus !== expectedStatus) return { httpStatus: 409, body: { error: "payment_status_mismatch" } };
        const expectedAmount = Math.round(Number(order.amount) * 100);
        const verifiedAmount = chargeAmount(verifiedCharge);
        if (verifiedAmount !== expectedAmount) return { httpStatus: 409, body: { error: "payment_amount_mismatch" } };
        const eventId = String(payload?.id && !String(payload.id).startsWith("ORDE_") ? payload.id : `pagbank:${order.provider_checkout_id}:${details.paymentId}:${details.eventType}`);
        const result = await adminRequest("rpc/process_pagbank_payment_event", {
            method: "POST", prefer: "return=representation",
            body: {
                p_event_id: eventId, p_event_type: details.eventType, p_payment_id: details.paymentId,
                p_order_reference: order.id, p_amount_cents: verifiedAmount, p_verified_status: verifiedStatus
            }
        });
        return { httpStatus: 200, body: { received: true, duplicate: Boolean(result?.duplicate), applied: Boolean(result?.applied) } };
    }

    return { createCheckout, processWebhook };
}

module.exports = { SUPPORTED_EVENTS, authenticityToken, secureEqual, collectCharges, eventDetails, createPagBankPaymentService };
