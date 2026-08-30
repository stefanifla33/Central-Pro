const assert = require("assert");

function response(status, body, headers = {}) {
    const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
    return { ok: status >= 200 && status < 300, status, headers: { get: name => normalized[name.toLowerCase()] ?? null }, json: async () => body };
}

async function run() {
    const originalFetch = global.fetch;
    const originalOffline = process.env.CENTRAL_PRO_OFFLINE;
    const replies = [
        response(200, { response: [] }, { "x-ratelimit-requests-limit": 7500, "x-ratelimit-requests-remaining": 6462 }),
        response(429, { errors: { rateLimit: "Too many requests. You have reached your per-minute request limit." } }),
        response(429, { errors: { quota: "You have reached the request limit for the day." } })
    ];
    global.fetch = async () => replies.shift();
    process.env.CENTRAL_PRO_OFFLINE = "false";
    const app = require("../server");
    const { football, apiQuotaState } = app.locals.offlineTest;
    try {
        await football("/quota-test-known", 1);
        assert.strictEqual(apiQuotaState.remaining, 6462);
        const blockedBefore = apiQuotaState.blockedUntil;
        await assert.rejects(football("/quota-test-minute", 1), error => error.code === "API_MINUTE_QUOTA" && error.retryAfterMs === 60_000);
        assert.strictEqual(apiQuotaState.remaining, 6462, "headerless minute 429 preserves last known daily remaining");
        assert.strictEqual(apiQuotaState.blockedUntil, blockedBefore, "minute 429 does not activate daily cooldown");
        await assert.rejects(football("/quota-test-daily", 1), error => error.code === "API_DAILY_QUOTA");
        assert.strictEqual(apiQuotaState.remaining, 0, "daily limit still activates daily quota state");
        assert(apiQuotaState.blockedUntil > Date.now(), "daily cooldown remains active");
    } finally {
        global.fetch = originalFetch;
        if (originalOffline === undefined) delete process.env.CENTRAL_PRO_OFFLINE; else process.env.CENTRAL_PRO_OFFLINE = originalOffline;
    }
    console.log("API minute/daily quota classification tests passed.");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
