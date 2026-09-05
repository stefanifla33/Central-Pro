"use strict";

const TTL_MS = 30 * 60_000;
const ERROR_TTL_MS = 2 * 60_000;
const MAX_QUOTE_AGE_MS = 48 * 60 * 60_000;
const BOOKMAKERS = Object.freeze([{ id: 32, name: "Betano" }, { id: 8, name: "Bet365" }, { id: 34, name: "Superbet" }]);
// Exact API market ID, name and selection. Never substitute adjacent lines or periods.
const MARKETS = Object.freeze({
    over05: [5, "Goals Over/Under", "Over 0.5"],
    over15: [5, "Goals Over/Under", "Over 1.5"],
    over25: [5, "Goals Over/Under", "Over 2.5"],
    over05HT: [6, "Goals Over/Under First Half", "Over 0.5"],
    btts: [8, "Both Teams Score", "Yes"],
    homeScores: [43, "Home Team Score a Goal", "Yes"],
    awayScores: [44, "Away Team Score a Goal", "Yes"],
    cornersOver65: [45, "Corners Over Under", "Over 6.5"],
    cornersOver75: [45, "Corners Over Under", "Over 7.5"],
    cornersOver85: [45, "Corners Over Under", "Over 8.5"],
    cornersOver95: [45, "Corners Over Under", "Over 9.5"]
});
const validOdd = odd => typeof odd === "string" && /^\d+(?:\.\d+)?$/.test(odd) && Number.isFinite(Number(odd)) && Number(odd) > 1;
const eligible = (fixture, now) => fixture?.status?.short === "NS" && Date.parse(fixture.date) > now;
function checked(body) {
    if (!body || (body.errors && Object.keys(body.errors).length) || !Array.isArray(body.response)) throw new Error("Odds provider unavailable");
    return body;
}

function mapQuotes(records, fixtureId, now) {
    const selections = Object.fromEntries(Object.keys(MARKETS).map(key => [key, []]));
    for (const [key, [marketId, marketName, selection]] of Object.entries(MARKETS)) {
        for (const bookmaker of BOOKMAKERS) {
            const matches = [];
            for (const record of records) {
                const updatedAt = Date.parse(record.update);
                if (record.fixture?.id !== fixtureId || !Number.isFinite(updatedAt) || updatedAt > now + 60_000 || now - updatedAt >= MAX_QUOTE_AGE_MS) continue;
                for (const book of record.bookmakers || []) {
                    if (book.id !== bookmaker.id || book.name !== bookmaker.name) continue;
                    for (const bet of book.bets || []) {
                        if (bet.id !== marketId || bet.name !== marketName) continue;
                        for (const value of bet.values || []) {
                            if (value.value === selection && validOdd(value.odd)) matches.push({ bookmakerId: book.id, name: book.name, odd: value.odd, marketId, market: bet.name, selection, update: record.update });
                        }
                    }
                }
            }
            // Ambiguous provider records must not silently choose a different price.
            if (matches.length && new Set(matches.map(item => item.odd)).size === 1) {
                matches.sort((a, b) => Date.parse(b.update) - Date.parse(a.update));
                selections[key].push(matches[0]);
            }
        }
    }
    return selections;
}

function createPrematchOddsService({ football, now = Date.now, cacheExpiry = () => now() + TTL_MS }) {
    const cache = new Map(), pending = new Map();
    async function load(fixtureId) {
        const started = now();
        const unavailable = reason => ({ fixtureId, status: "unavailable", reason, selections: {}, fetchedAt: new Date(started).toISOString(), expiresAt: new Date(started + ERROR_TTL_MS).toISOString() });
        try {
            const fixtureBody = checked(await football(`/fixtures?id=${fixtureId}`, TTL_MS));
            let rawExpiry = cacheExpiry(`/fixtures?id=${fixtureId}`);
            const fixture = fixtureBody.response.find(item => item.fixture?.id === fixtureId)?.fixture;
            if (!eligible(fixture, now())) return { ...unavailable("fixture_not_prematch"), expiresAt: new Date(started + TTL_MS).toISOString() };
            const records = [];
            let page = 1, total = 1;
            do {
                const endpoint = `/odds?fixture=${fixtureId}${page > 1 ? `&page=${page}` : ""}`;
                const body = checked(await football(endpoint, TTL_MS));
                rawExpiry = Math.min(rawExpiry, cacheExpiry(endpoint));
                total = Number(body.paging?.total || 1);
                if (!Number.isInteger(total) || total > 10 || total < 1) throw new Error("Invalid odds pagination");
                records.push(...body.response);
            } while (++page <= total);
            if (!eligible(fixture, now())) return unavailable("fixture_not_prematch");
            const selections = mapQuotes(records, fixtureId, now());
            const quotes = Object.values(selections).flat();
            const expires = Math.min(started + TTL_MS, rawExpiry, Date.parse(fixture.date), ...quotes.map(item => Date.parse(item.update) + MAX_QUOTE_AGE_MS));
            return { fixtureId, status: quotes.length ? "available" : "unavailable", reason: quotes.length ? null : "no_exact_quotes", fixtureStatus: fixture.status.short, kickoff: fixture.date, fetchedAt: new Date(started).toISOString(), expiresAt: new Date(expires).toISOString(), selections };
        } catch {
            return unavailable("provider_unavailable");
        }
    }
    async function get(fixtureId) {
        const entry = cache.get(fixtureId);
        if (entry && Date.parse(entry.expiresAt) > now()) return entry;
        if (pending.has(fixtureId)) return pending.get(fixtureId);
        const request = load(fixtureId).then(result => {
            if (cache.size >= 2000) for (const [id, value] of cache) if (Date.parse(value.expiresAt) <= now()) cache.delete(id);
            if (cache.size >= 2000) cache.delete(cache.keys().next().value);
            cache.set(fixtureId, result);
            return result;
        }).finally(() => pending.delete(fixtureId));
        pending.set(fixtureId, request);
        return request;
    }
    return { get };
}
module.exports = { createPrematchOddsService, mapQuotes, validOdd, eligible, MARKETS, BOOKMAKERS, TTL_MS, ERROR_TTL_MS, MAX_QUOTE_AGE_MS };
