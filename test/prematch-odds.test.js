"use strict";
const assert = require("node:assert/strict");
const { createPrematchOddsService, mapQuotes, validOdd, MARKETS, TTL_MS, ERROR_TTL_MS, MAX_QUOTE_AGE_MS } = require("../lib/prematch-odds");

async function run() {
    let now = Date.parse("2026-09-05T02:00:00Z"), calls = [];
    const fixture = { id: 123, status: { short: "NS" }, date: new Date(now + 86400000).toISOString() };
    const records = [{ fixture: { id: 123 }, update: new Date(now).toISOString(), bookmakers: [
        { id: 32, name: "Betano", bets: [{ id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.820" }, { value: "Under 2.5", odd: "2.00" }, { value: "Over 1.5", odd: "1.40" }] }] },
        { id: 8, name: "Bet365", bets: [{ id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.85" }] }, { id: 6, name: "Goals Over/Under First Half", values: [{ value: "Over 0.5", odd: "1.20" }] }] },
        { id: 34, name: "Superbet", bets: [{ id: 8, name: "Both Teams Score", values: [{ value: "Yes", odd: "1.90" }] }] },
        { id: 11, name: "1xBet", bets: [{ id: 5, name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "99.00" }] }] }
    ] }];
    const football = async endpoint => { calls.push(endpoint); await new Promise(resolve => setImmediate(resolve)); return { errors: [], paging: { total: 1 }, response: endpoint.startsWith("/fixtures") ? [{ fixture }] : records }; };
    const service = createPrematchOddsService({ football, now: () => now });
    const results = await Promise.all(Array.from({ length: 20 }, () => service.get(123)));
    assert.equal(calls.length, 2, "20 simultaneous consumers use one fixture and one odds request");
    assert(results.every(result => result === results[0]));
    assert.equal(results[0].selections.over25[0].odd, "1.820", "original string precision is retained");
    assert.deepEqual(results[0].selections.over25.map(item => item.bookmakerId), [32, 8]);
    assert.equal(results[0].selections.over05HT[0].odd, "1.20");
    assert.equal(results[0].selections.over05.length, 0, "HT never substitutes FT");
    assert.equal(results[0].selections.homeScores.length, 0, "no approximation for team goals");
    assert.equal(results[0].selections.cornersOver95.length, 0);
    await service.get(123); assert.equal(calls.length, 2, "later users share cache");
    now += TTL_MS + 1; await service.get(123); assert.equal(calls.length, 4, "TTL expires");

    for (const value of [null, undefined, 1.85, "", "NaN", "Infinity", "0", "1.00", "-1.8", "1,85", "2e3", " 1.8 ", "9".repeat(400)]) assert.equal(validOdd(value), false);
    for (const status of ["FT", "PST", "CANC", "ABD", "SUSP", "INT", "1H", "HT", "2H", "AET", "PEN", "AWD", "WO", "TBD", undefined]) {
        const inactive = createPrematchOddsService({ now: () => now, football: async endpoint => {
            assert(endpoint.startsWith("/fixtures"), "inactive fixture must not request odds");
            return { response: [{ fixture: { ...fixture, status: { short: status } } }] };
        } });
        assert.equal((await inactive.get(123)).status, "unavailable");
    }
    const kickedOff = createPrematchOddsService({ now: () => Date.parse(fixture.date), football });
    assert.equal((await kickedOff.get(123)).status, "unavailable", "NS with elapsed kickoff is blocked");
    assert.equal(mapQuotes(records, 999, now).over25.length, 0, "wrong fixture blocked");
    assert.equal(mapQuotes(records, 123, now + MAX_QUOTE_AGE_MS).over25.length, 0, "old update blocked");
    assert.equal(mapQuotes([{ ...records[0], update: "bad" }], 123, now).over25.length, 0);
    assert.equal(mapQuotes([{ ...records[0], update: new Date(now + 120000).toISOString() }], 123, now).over25.length, 0);
    const wrongName = structuredClone(records); wrongName[0].bookmakers[0].bets[0].name = "Goals Over/Under First Half";
    assert.equal(mapQuotes(wrongName, 123, now).over25.some(item => item.bookmakerId === 32), false);
    const ambiguous = structuredClone(records); ambiguous[0].bookmakers[0].bets[0].values.push({ value: "Over 2.5", odd: "1.83" });
    assert.equal(mapQuotes(ambiguous, 123, now).over25.some(item => item.bookmakerId === 32), false);
    for (const [key, [id, name, value]] of Object.entries(MARKETS)) {
        const exact = [{ fixture: { id: 123 }, update: new Date(now).toISOString(), bookmakers: [{ id: 32, name: "Betano", bets: [{ id, name, values: [{ value, odd: "1.900" }] }] }] }];
        assert.equal(mapQuotes(exact, 123, now)[key][0].odd, "1.900", key);
    }
    let errorCalls = 0;
    const failing = createPrematchOddsService({ now: () => now, football: async () => { errorCalls++; throw new Error("secret provider detail"); } });
    const failure = await failing.get(123); assert.equal(failure.reason, "provider_unavailable");
    assert(!JSON.stringify(failure).includes("secret"));
    await failing.get(123); assert.equal(errorCalls, 1, "error cooldown");
    now += ERROR_TTL_MS + 1; await failing.get(123); assert.equal(errorCalls, 2);
    const malformed = createPrematchOddsService({ football: async () => ({ errors: { quota: "exhausted" }, response: [] }), now: () => now });
    assert.equal((await malformed.get(123)).status, "unavailable");
    let pages = [];
    const paginated = createPrematchOddsService({ now: () => now, football: async endpoint => {
        pages.push(endpoint);
        return endpoint.startsWith("/fixtures") ? { response: [{ fixture }] } : { response: endpoint.includes("page=2") ? records : [], paging: { total: 2 } };
    } });
    assert.equal((await paginated.get(123)).selections.over25.length, 2);
    assert(pages.includes("/odds?fixture=123&page=2"));
    const bounded = createPrematchOddsService({ football, now: () => now, cacheExpiry: () => now + 1000 });
    assert.equal(Date.parse((await bounded.get(123)).expiresAt), now + 1000, "derived cache never extends raw cache lifetime");
    console.log("prematch odds: exact mapping, precision, statuses, timestamps, TTL, simultaneous dedup, errors and pagination passed");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
