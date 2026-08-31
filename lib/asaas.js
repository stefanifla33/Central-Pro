const ASAAS_BASE_URLS = Object.freeze({
    sandbox: "https://api-sandbox.asaas.com/v3",
    production: "https://api.asaas.com/v3"
});

function createAsaasClient({ apiKey, environment = "sandbox", fetchImpl = global.fetch, onResponse } = {}) {
    const env = String(environment || "").trim().toLowerCase();
    const baseUrl = ASAAS_BASE_URLS[env];
    const key = String(apiKey || "").trim();

    function configured() {
        return Boolean(baseUrl && key && typeof fetchImpl === "function");
    }

    async function request(path, { method = "GET", body } = {}) {
        if (!configured()) throw Object.assign(new Error("Asaas não configurado."), { code: "ASAAS_NOT_CONFIGURED" });
        const response = await fetchImpl(`${baseUrl}${path}`, {
            method,
            headers: { access_token: key, Accept: "application/json", "Content-Type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (typeof onResponse === "function") onResponse({ path, method, status: response.status });
        if (!response.ok) throw Object.assign(new Error("A operação no Asaas foi recusada."), { code: "ASAAS_REQUEST_FAILED", status: response.status, details: data.errors });
        return data;
    }

    return { environment: env, baseUrl, configured, request };
}

module.exports = { ASAAS_BASE_URLS, createAsaasClient };
