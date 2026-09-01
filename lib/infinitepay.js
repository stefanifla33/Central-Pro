const INFINITEPAY_BASE_URL = "https://api.checkout.infinitepay.io";

function createInfinitePayClient({ handle, fetchImpl = global.fetch } = {}) {
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
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw Object.assign(new Error("A operação na InfinitePay foi recusada."), {
                code: "INFINITEPAY_REQUEST_FAILED", status: response.status
            });
        }
        return data;
    }

    return { baseUrl: INFINITEPAY_BASE_URL, handle: merchantHandle, configured, request };
}

module.exports = { INFINITEPAY_BASE_URL, createInfinitePayClient };
