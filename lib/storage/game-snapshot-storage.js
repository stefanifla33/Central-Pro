function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
function validFixture(game) {
    return Number.isInteger(Number(game?.fixture?.id)) && !Number.isNaN(Date.parse(game?.fixture?.date))
        && Number.isInteger(Number(game?.teams?.home?.id)) && Number.isInteger(Number(game?.teams?.away?.id));
}
function normalizeApiPayload(date, payload, generatedAt = new Date().toISOString()) {
    if (!validDate(date) || !payload || !Array.isArray(payload.response)) return null;
    const fixtures = payload.response.filter(validFixture);
    return fixtures.length ? { version: 1, date, generatedAt, count: fixtures.length, fixtures } : null;
}
function validSnapshot(date, snapshot) {
    return validDate(date) && snapshot?.date === date && Array.isArray(snapshot.fixtures)
        && snapshot.fixtures.length > 0 && snapshot.fixtures.every(validFixture);
}
function createGameSnapshotStorage(adapter) {
    for (const method of ["get", "set", "getAll", "has"]) {
        if (typeof adapter?.[method] !== "function") throw new TypeError(`Game snapshot adapter must implement ${method}()`);
    }
    async function get(date) { const snapshot = await adapter.get(date); return validSnapshot(date, snapshot) ? snapshot : null; }
    async function set(date, snapshot) {
        if (!validSnapshot(date, snapshot)) throw new TypeError("Cannot persist an invalid game snapshot.");
        await adapter.set(date, snapshot);
        return snapshot;
    }
    return {
        get, set,
        async getAll() { const all = await adapter.getAll(); return Object.fromEntries(Object.entries(all || {}).filter(([date, snapshot]) => validSnapshot(date, snapshot))); },
        async has(date) { return Boolean(await get(date)); },
        async saveApiPayload(date, payload, generatedAt) {
            const snapshot = normalizeApiPayload(date, payload, generatedAt);
            if (!snapshot) return null;
            return set(date, snapshot);
        }
    };
}
async function resolveGames(date, fetchGames, storage) {
    try {
        const data = await fetchGames(); let snapshot = null;
        try { snapshot = await storage.saveApiPayload(date, data); }
        catch (error) { console.error(`[GAME-SNAPSHOT] write failed: ${error.message}`); }
        return { ...data, source: "api", stale: false, snapshotGeneratedAt: snapshot?.generatedAt || null };
    } catch (error) {
        const snapshot = await storage.get(date);
        if (!snapshot) throw error;
        return { response: snapshot.fixtures, results: snapshot.count, source: "snapshot", stale: true,
            snapshotGeneratedAt: snapshot.generatedAt, date: snapshot.date, offline: error.code === "CENTRAL_PRO_OFFLINE" };
    }
}
module.exports = { createGameSnapshotStorage, normalizeApiPayload, resolveGames, validDate, validFixture, validSnapshot };
