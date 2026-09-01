const INFINITEPAY_BASE_URL = "https://api.checkout.infinitepay.io";

function sanitizeResponseBody(value) {
    const sensitiveKey = /token|secret|authorization|apikey|password|lenc|email|phone|cpf|cnpj|document|customer|address|receipt/i;
    const sanitize = (item, key = "") => {
        if (sensitiveKey.test(key)) return "[redacted]";
        if (typeof item === "string") {
            const limited = item.slice(0, 1000);
            return limited.replace(/(https:\/\/[^\s?"']+)\?[^\s"']+/gi, "$1?[redacted]");
        }
        if (Array.isArray(item)) return item.slice(0, 20).map((entry) => sanitize(entry));
        if (item && typeof item === "object") {
            return Object.fromEntries(Object.entries(item).slice(0, 30).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
        }
        return item;
    };
    return sanitize(value);
}

function createInfinitePayClient({ handle, fetchImpl = global.fetch, onResponse } = {}) {
    const merchantHandle = String(handle || "").trim().replace(/^\$/, "");

    function configured() {
        return Boolean(merchantHandle && typeof fetchImpl === "function");
    }

    async function request(path, body) {
        if (!configured()) throw Object.assign(new Error("InfinitePay não configurada."), { code: "INFINITEPAY_NOT_CONFIGURED" });
        const response = await fetchImpl(`${INFINITEPAY_BASE_URL}${path}`, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const contentType = String(response.headers?.get?.("content-type") || "");
        let rawBody = "";
        let data = {};
        if (typeof response.text === "function") {
            rawBody = await response.text();
            if (rawBody) {
                try { data = JSON.parse(rawBody); } catch (_error) { data = rawBody; }
            }
        } else {
            data = await response.json().catch(() => ({}));
        }
        if (typeof onResponse === "function") {
            onResponse({
                path, status: response.status, contentType,
                body: sanitizeResponseBody(data)
            });
        }
        if (!response.ok) {
            const providerMessage = typeof data === "string" ? data : data?.message || data?.error || null;
            throw Object.assign(new Error("A operação na InfinitePay foi recusada."), {
                code: "INFINITEPAY_REQUEST_FAILED", status: response.status,
                providerMessage: sanitizeResponseBody(providerMessage)
            });
        }
        return data;
    }

    return { baseUrl: INFINITEPAY_BASE_URL, handle: merchantHandle, configured, request };
}

module.exports = { INFINITEPAY_BASE_URL, sanitizeResponseBody, createInfinitePayClient };
