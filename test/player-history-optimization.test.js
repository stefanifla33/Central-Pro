const assert = require("assert");

const originalFetch = global.fetch;
const originalServerless = process.env.VERCEL;
const originalOffline = process.env.CENTRAL_PRO_OFFLINE;
process.env.VERCEL = "1";
process.env.CENTRAL_PRO_OFFLINE = "false";
let externalCalls = [];

function apiResponse(response) {
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ response }) };
}

global.fetch = async url => {
    const endpoint = new URL(url).pathname + new URL(url).search;
    externalCalls.push(endpoint);
    if (endpoint.startsWith("/fixtures?team=99002")) return apiResponse([
        { fixture: { id: 89999, date: "2026-08-28T12:00:00Z", status: { short: "FT" } }, league: { id: 253 }, teams: { home: { id: 99002 }, away: { id: 1 } } }
    ]);
    if (endpoint === "/fixtures/players?fixture=89999") return apiResponse([
        { team: { id: 99002 }, players: [{ player: { id: 90002, name: "Partial" }, statistics: [{ games: { minutes: 90 }, shots: { on: 1 } }] }] }
    ]);
    if (endpoint.startsWith("/fixtures?team=99004")) return apiResponse(Array.from({ length: 29 }, (_, index) => ({
        fixture: { id: 84000 + index, date: new Date(Date.UTC(2026, 7, 28 - index, 12)).toISOString(), status: { short: "FT" } },
        league: { id: 39 }, teams: { home: { id: 99004 }, away: { id: index + 1 } }
    })));
    if (endpoint.startsWith("/fixtures/players?fixture=84")) return apiResponse([{
        team: { id: 99004 },
        players: [90010, 90011, 90012, 90013].map(id => ({ player: { id, name: `Qualified ${id}` }, statistics: [{ games: { minutes: 90 }, shots: { on: 1 } }] }))
    }]);
    if (endpoint.startsWith("/fixtures?team=99005")) return apiResponse(Array.from({ length: 29 }, (_, index) => ({
        fixture: { id: 85000 + index, date: new Date(Date.UTC(2026, 7, 28 - index, 12)).toISOString(), status: { short: "FT" } },
        league: { id: 39 }, teams: { home: { id: 99005 }, away: { id: index + 1 } }
    })));
    if (endpoint.startsWith("/fixtures/players?fixture=85")) return apiResponse([{
        team: { id: 99005 }, players: [{ player: { id: 99999, name: "Unrelated" }, statistics: [{ games: { minutes: 90 }, shots: { on: 0 } }] }]
    }]);
    throw new Error(`unexpected mocked endpoint ${endpoint}`);
};

const app = require("../server");
const { ensureTeamPlayerHistory, playerHistoryStore } = app.locals.offlineTest;

function addHistory(teamId, playerId, count, baseId) {
    for (let index = 0; index < count; index++) {
        const id = baseId + index;
        playerHistoryStore.fixtures[id] = {
            fixture: { id, date: `2026-08-${String(20 - index).padStart(2, "0")}T12:00:00Z`, status: "FT", teams: { home: { id: teamId }, away: { id: 1 } } },
            complete: true,
            players: { [playerId]: { playerId, teamId, minutes: 90, shots: { on: 1 } } }
        };
    }
}

async function run() {
    const current = teamId => ({ fixture: { id: teamId + 1, date: "2026-08-29T12:00:00Z" } });
    addHistory(99001, 90001, 5, 81000);
    externalCalls = [];
    const complete = await ensureTeamPlayerHistory(current(99001), { id: 99001 }, new Set([90001]), 5, 30);
    assert.strictEqual(externalCalls.length, 0, "complete persistent L5 causes zero historical calls");
    assert.strictEqual(complete.reusedHistory, true);

    addHistory(99002, 90002, 4, 82000);
    externalCalls = [];
    const partial = await ensureTeamPlayerHistory(current(99002), { id: 99002 }, new Set([90002]), 5, 30);
    assert.deepStrictEqual(externalCalls.map(value => value.split("&timezone")[0]), ["/fixtures?team=99002&last=30", "/fixtures/players?fixture=89999"], "partial L4 fetches one candidate list and only the missing fixture");
    assert.strictEqual(partial.requested, 1);

    addHistory(99003, 90003, 5, 83000);
    const first = ensureTeamPlayerHistory(current(99003), { id: 99003 }, new Set([90003]), 5, 30);
    const second = ensureTeamPlayerHistory(current(99003), { id: 99003 }, new Set([90003]), 5, 30);
    assert.strictEqual(first, second, "same team/day shares one in-flight history build");
    await Promise.all([first, second]);

    externalCalls = [];
    const early = await ensureTeamPlayerHistory(current(99004), { id: 99004 }, new Set([90010, 90011, 90012, 90013, 90014, 90015]), 5, 30);
    assert.strictEqual(early.requested, 5, "four qualifying confirmed players stop the team after their exact L5");
    assert.strictEqual(early.inspected, 5, "29 candidates are not scanned after enough qualified players exist");
    externalCalls = [];
    const capped = await ensureTeamPlayerHistory(current(99005), { id: 99005 }, new Set([90100, 90101, 90102, 90103]), 5, 30);
    assert.strictEqual(capped.requested, 8, "one team cannot request more than eight new historical fixtures");
    assert.strictEqual(capped.budgetReached, true);
    console.log(JSON.stringify({ completeHistoricalCalls: 0, partialExternalCalls: 2, partialFixturePlayers: partial.requested, sharedTeamBuilds: 1, earlyStopCandidates: 29, earlyStopInspected: early.inspected, earlyStopRequests: early.requested, maximumNewFixturePlayersPerTeam: capped.requested }, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    global.fetch = originalFetch;
    if (originalServerless === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalServerless;
    if (originalOffline === undefined) delete process.env.CENTRAL_PRO_OFFLINE; else process.env.CENTRAL_PRO_OFFLINE = originalOffline;
});
