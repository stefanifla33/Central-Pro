const assert = require("assert");
const { createGameSnapshotStorage, resolveGames } = require("../lib/storage/game-snapshot-storage");
const { createOfflineError } = require("../lib/central-pro-offline");

async function run() {
    const originalOffline = process.env.CENTRAL_PRO_OFFLINE;
    const originalFetch = global.fetch;
    let fetchCalls = 0;
    global.fetch = async () => {
        fetchCalls++;
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ response: [] }) };
    };
    process.env.CENTRAL_PRO_OFFLINE = "true";
    const app = require("../server");
    const { football, monitorMainLeagues, metrics } = app.locals.offlineTest;
    try {
        await assert.rejects(football("/fixtures?id=offline-test-a", 0), error => error.code === "CENTRAL_PRO_OFFLINE", "A: football returns controlled offline error");
        assert.strictEqual(fetchCalls, 0, "A: external fetch is never executed");

        const date = "2026-08-28", snapshot = { version: 1, date, generatedAt: "2026-08-28T15:42:00.000Z", count: 1,
            fixtures: [{ fixture: { id: 1, date: `${date}T20:00:00-03:00` }, teams: { home: { id: 2 }, away: { id: 3 } } }] };
        const values = new Map([[date, snapshot]]);
        const adapter = { get: async key => values.get(key) || null, set: async (key, value) => values.set(key, value), getAll: async () => Object.fromEntries(values), has: async key => values.has(key) };
        const storage = createGameSnapshotStorage(adapter);
        const fallback = await resolveGames(date, async () => { throw createOfflineError("/fixtures"); }, storage);
        assert.strictEqual(fallback.source, "snapshot", "B: persisted snapshot remains the fallback");
        assert.strictEqual(fallback.offline, true, "B: fallback identifies offline mode");

        values.clear();
        await assert.rejects(resolveGames(date, async () => { throw createOfflineError("/fixtures"); }, storage), error => error.code === "CENTRAL_PRO_OFFLINE", "C: no snapshot preserves offline error");

        const externalBeforeMonitor = metrics.externalRequests;
        const monitorResult = await monitorMainLeagues();
        assert.deepStrictEqual(monitorResult, { disabled: true, reason: "offline" }, "D: monitor exits immediately");
        assert.strictEqual(metrics.externalRequests, externalBeforeMonitor, "D: monitor creates no external request");
        assert.strictEqual(fetchCalls, 0, "D: monitor does not call fetch");

        process.env.CENTRAL_PRO_OFFLINE = "false";
        const normal = await football("/fixtures?id=offline-test-e", 0);
        assert.deepStrictEqual(normal, { response: [] }, "E: normal flow remains available with a stubbed response");
        assert.strictEqual(fetchCalls, 1, "E: disabled offline guard allows the configured fetch implementation");
        process.env.CENTRAL_PRO_OFFLINE = "true";
        const cached = await football("/fixtures?id=offline-test-e", 60_000);
        assert.deepStrictEqual(cached, normal, "A: valid cache hits remain available offline");
        assert.strictEqual(fetchCalls, 1, "A: offline cache hit does not execute another fetch");
        console.log("offline mode scenarios A-E: ok");
    } finally {
        if (originalOffline === undefined) delete process.env.CENTRAL_PRO_OFFLINE; else process.env.CENTRAL_PRO_OFFLINE = originalOffline;
        global.fetch = originalFetch;
    }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
