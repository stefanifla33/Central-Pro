const PAGBANK_BASE_URLS = Object.freeze({
    sandbox: "https://sandbox.api.pagseguro.com",
    production: "https://api.pagseguro.com"
});

function createPagBankClient({ token, environment = "sandbox", fetchImpl = global.fetch } = {}) {
    const env = String(environment || "").trim().toLowerCase();
    const baseUrl = PAGBANK_BASE_URLS[env];
    const secret = String(token || "").trim();

    function configured() {
        return Boolean(baseUrl && secret && typeof fetchImpl === "function");
    }

    async function request(path, { method = "GET", body } = {}) {
        if (!configured()) throw Object.assign(new Error("PagBank não configurado."), { code: "PAGBANK_NOT_CONFIGURED" });
        const response = await fetchImpl(`${baseUrl}${path}`, {
            method,
            headers: { Authorization: `Bearer ${secret}`, Accept: "application/json", "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw Object.assign(new Error("A operação no PagBank foi recusada."), {
                code: "PAGBANK_REQUEST_FAILED", status: response.status
            });
        }
        return data;
    }

    return { environment: env, baseUrl, configured, request };
}

module.exports = { PAGBANK_BASE_URLS, createPagBankClient };
