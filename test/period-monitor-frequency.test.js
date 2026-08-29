const assert = require("assert");

async function run() {
    const originalApiKey = process.env.API_FOOTBALL_KEY;
    const originalOffline = process.env.CENTRAL_PRO_OFFLINE;
    const originalFetch = global.fetch;
    const originalSetTimeout = global.setTimeout;
    const originalDateNow = Date.now;
    const scheduled = [];
    let fetchCalls = 0;
    let quotaResponse = false;

    process.env.API_FOOTBALL_KEY = "period-monitor-test";
    process.env.CENTRAL_PRO_OFFLINE = "false";
    global.setTimeout = (callback, delay) => {
        const timer = { callback, delay, unref() {} };
        scheduled.push(timer);
        return timer;
    };
    global.fetch = async () => {
        fetchCalls++;
        if (quotaResponse) {
            return {
                ok: false,
                status: 429,
                headers: { get: () => null },
                json: async () => ({ message: "Request limit for the day reached" })
            };
        }
        return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ response: [{ league: { id: 71 }, fixture: { id: 1, status: { short: "1H" } } }] })
        };
    };

    const app = require("../server");
    const { monitorMainLeagues } = app.locals.offlineTest;
    try {
        const firstRun = monitorMainLeagues();
        assert.strictEqual(fetchCalls, 1, "first monitor execution starts immediately");
        assert.strictEqual(scheduled.length, 0, "no polling is scheduled before the first execution completes");
        await firstRun;
        assert.strictEqual(scheduled.at(-1).delay, 300_000, "live fixtures wait at least five minutes");

        Date.now = () => originalDateNow() + 300_001;
        quotaResponse = true;
        await scheduled.at(-1).callback();
        assert.strictEqual(fetchCalls, 2, "the next external schedule request runs only after the five-minute timer");
        assert.ok(scheduled.at(-1).delay >= 300_000, "daily quota preserves its cooldown instead of short polling");
        const fetchCallsAtQuota = fetchCalls;
        await scheduled.at(-1).callback();
        assert.strictEqual(fetchCalls, fetchCallsAtQuota, "daily quota cooldown interrupts further external requests");

        const schedulesBeforeOffline = scheduled.length;
        process.env.CENTRAL_PRO_OFFLINE = "true";
        const offlineResult = await monitorMainLeagues();
        assert.deepStrictEqual(offlineResult, { disabled: true, reason: "offline" }, "offline monitor exits immediately");
        assert.strictEqual(scheduled.length, schedulesBeforeOffline, "offline monitor does not schedule polling");
        assert.strictEqual(fetchCalls, 2, "offline monitor makes no external request");

        console.log("period monitor frequency scenarios: ok");
    } finally {
        if (originalApiKey === undefined) delete process.env.API_FOOTBALL_KEY; else process.env.API_FOOTBALL_KEY = originalApiKey;
        if (originalOffline === undefined) delete process.env.CENTRAL_PRO_OFFLINE; else process.env.CENTRAL_PRO_OFFLINE = originalOffline;
        global.fetch = originalFetch;
        global.setTimeout = originalSetTimeout;
        Date.now = originalDateNow;
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
