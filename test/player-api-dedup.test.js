const assert = require("assert");
const { CP_COMPETITIONS, CP_FEATURED_LEAGUES, cpIsScannerEligibleLeagueId, cpSelectScannerFixtures } = require("../public/competition-config");

function simulate(fixtures, inspectedPerTeam, probable) {
    const calls = new Set(), attempted = [];
    const add = endpoint => { attempted.push(endpoint); calls.add(endpoint); };
    const teamsByLeague = new Map();
    for (const game of fixtures) {
        add(`/fixtures?id=${game.fixture.id}`);add(`/fixtures?id=${game.fixture.id}`);
        add(`/fixtures/lineups?fixture=${game.fixture.id}`);add(`/fixtures/lineups?fixture=${game.fixture.id}`);
        if (!teamsByLeague.has(game.league.id)) teamsByLeague.set(game.league.id, []);
        teamsByLeague.get(game.league.id).push(game.teams.home, game.teams.away);
    }
    for (const [leagueId, rawTeams] of teamsByLeague) {
        const teams = [...new Map(rawTeams.map(team => [team.id, team])).values()];
        for (const team of teams) {
            add(`/fixtures?team=${team.id}&last=30`);
            if (probable) { add(`/players/squads?team=${team.id}`);add(`/fixtures?team=${team.id}&last=5`); }
        }
        for (let round = 0; round < inspectedPerTeam; round++) {
            for (let index = 0; index < teams.length; index += 2) {
                const a = teams[index], b = teams[(index + 1 + round * 2) % teams.length];
                const pair = [a.id, b.id].sort((x,y)=>x-y).join("-");
                const historicalId = `${leagueId}-${round}-${pair}`;
                add(`/fixtures/players?fixture=${historicalId}`);
                add(`/fixtures/players?fixture=${historicalId}`);
                if (probable && round < 3) { add(`/fixtures/lineups?fixture=${historicalId}`);add(`/fixtures/lineups?fixture=${historicalId}`); }
            }
        }
    }
    return { unique: calls.size, attempted: attempted.length, repeatedAvoided: attempted.length - calls.size, fixturePlayersUnique: [...calls].filter(x=>x.startsWith('/fixtures/players')).length };
}

async function run() {
    assert.strictEqual(CP_COMPETITIONS.length, 44, "canonical whitelist contains 44 IDs");
    assert.strictEqual(CP_FEATURED_LEAGUES.size, CP_COMPETITIONS.length, "derived ID set has every canonical competition");
    assert(CP_COMPETITIONS.every(item => cpIsScannerEligibleLeagueId(item.id)), "all 44 canonical IDs pass backend eligibility helper");

    const snapshot = require("../data/game-snapshots.json").dates["2026-08-29"];
    const eligible = cpSelectScannerFixtures(snapshot.fixtures);
    assert.strictEqual(eligible.length, 131, "simulation uses all 131 eligible fixtures");
    const officialL5 = simulate(eligible, 5, false);
    const probableL5 = simulate(eligible, 5, true);
    const realisticDegraded = simulate(eligible, 8, true);

    const originalFetch = global.fetch, originalOffline = process.env.CENTRAL_PRO_OFFLINE;
    let externalCalls = 0;
    global.fetch = async url => {
        externalCalls++;
        await new Promise(resolve => setTimeout(resolve, 5));
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ response: [{ players: [{ player: { id: 1 } }] }] }) };
    };
    process.env.CENTRAL_PRO_OFFLINE = "false";
    const app = require("../server");
    const { rateLimitedPlayerFootball, playerRateLimiter } = app.locals.offlineTest;
    try {
        const endpoint = "/fixtures/players?fixture=dedup-shared-history";
        const slotsBefore = playerRateLimiter.state().releasesInWindow;
        await Promise.all(Array.from({ length: 12 }, () => rateLimitedPlayerFootball(endpoint, 21_600_000)));
        assert.strictEqual(externalCalls, 1, "same historical fixture requested by many player consumers makes one external call");
        assert.strictEqual(playerRateLimiter.state().releasesInWindow - slotsBefore, 1, "pending hits consume only one player limiter slot");
        await rateLimitedPlayerFootball(endpoint, 21_600_000);
        assert.strictEqual(externalCalls, 1, "resolved historical fixture is reused from memory cache");
        assert.strictEqual(playerRateLimiter.state().releasesInWindow - slotsBefore, 1, "cache hit consumes no player limiter slot");
    } finally {
        global.fetch = originalFetch;
        if (originalOffline === undefined) delete process.env.CENTRAL_PRO_OFFLINE; else process.env.CENTRAL_PRO_OFFLINE = originalOffline;
    }
    console.log(JSON.stringify({ fixtures: eligible.length, officialL5, probableL5, realisticDegraded, concurrentConsumers: 12, externalFixturePlayersCalls: externalCalls }, null, 2));
}
run().catch(error => { console.error(error);process.exitCode = 1; });
