const assert = require("assert");
const http = require("http");

const originalFetch = global.fetch;
const originalServerless = process.env.VERCEL;
const originalOffline = process.env.CENTRAL_PRO_OFFLINE;
process.env.VERCEL = "1";
process.env.CENTRAL_PRO_OFFLINE = "false";

const fixtureId = 999001;
const homeTeam = { id: 990101, name: "Casa" };
const awayTeam = { id: 990102, name: "Fora" };
const homePlayerId = 991001;
const awayPlayerId = 991002;
const externalCalls = [];

const apiResponse = response => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ response }) });
global.fetch = async url => {
    const endpoint = new URL(url).pathname + new URL(url).search;
    externalCalls.push(endpoint);
    if (endpoint === `/fixtures?id=${fixtureId}`) return apiResponse([{
        fixture: { id: fixtureId, date: "2026-09-01T18:00:00Z", status: { short: "NS" } },
        league: { id: 39, season: 2026 }, teams: { home: homeTeam, away: awayTeam }
    }]);
    if (endpoint === `/fixtures/lineups?fixture=${fixtureId}`) return apiResponse([
        { team: homeTeam, startXI: [{ player: { id: homePlayerId } }], substitutes: [] },
        { team: awayTeam, startXI: [{ player: { id: awayPlayerId } }], substitutes: [] }
    ]);
    throw new Error(`Unexpected mocked API endpoint: ${endpoint}`);
};

const app = require("../server");
const { playerHistoryStore } = app.locals.offlineTest;
const insertedFixtureIds = [];

function addCompleteHistory(team, playerId, baseFixtureId) {
    for (let index = 0; index < 5; index++) {
        const historicalId = baseFixtureId + index;
        insertedFixtureIds.push(historicalId);
        playerHistoryStore.fixtures[historicalId] = {
            fixture: { id: historicalId, date: `2026-08-${String(25 - index).padStart(2, "0")}T18:00:00Z`, status: "FT", league: { id: 39 }, teams: { home: team, away: { id: 1 } } },
            complete: true,
            players: { [playerId]: { playerId, name: `Jogador ${playerId}`, teamId: team.id, minutes: 90, position: "M", shots: { total: 2, on: 1 }, goals: 1, assists: 1, tackles: 2, fouls: { committed: 1, drawn: 1 } } }
        };
    }
}

function request(server, path) {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
        http.get({ host: "127.0.0.1", port, path }, response => {
            let body = "";
            response.setEncoding("utf8");
            response.on("data", chunk => { body += chunk; });
            response.on("end", () => resolve({ status: response.statusCode, body: JSON.parse(body) }));
        }).on("error", reject);
    });
}

async function run() {
    addCompleteHistory(homeTeam, homePlayerId, 998100);
    addCompleteHistory(awayTeam, awayPlayerId, 998200);
    const server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    try {
        const normal = await request(server, `/api/partidas/${fixtureId}/jogadores-recentes`);
        assert.strictEqual(normal.status, 200, "normal match request succeeds without player query parameters");
        assert.notStrictEqual(normal.body.code, "PLAYER_CONFIRMATION_EMPTY", "normal match request never requires scanner confirmation parameters");
        assert.deepStrictEqual(normal.body.teams.map(team => team.players.length), [1, 1], "normal mode discovers both players from the lineup");
        assert(normal.body.teams.every(team => Object.keys(team.markets).length === 7), "all seven existing player markets are assembled");

        const missingConfirmation = await request(server, `/api/partidas/${fixtureId}/jogadores-recentes?mode=scanner&league=39`);
        assert.strictEqual(missingConfirmation.status, 409);
        assert.strictEqual(missingConfirmation.body.code, "PLAYER_CONFIRMATION_REQUIRED", "scanner still requires confirmation");

        const missingPlayers = await request(server, `/api/partidas/${fixtureId}/jogadores-recentes?mode=scanner&league=39&confirmation=official`);
        assert.strictEqual(missingPlayers.status, 409);
        assert.strictEqual(missingPlayers.body.code, "PLAYER_CONFIRMATION_EMPTY", "scanner still requires homePlayers and awayPlayers");

        assert.deepStrictEqual(externalCalls, [`/fixtures?id=${fixtureId}`, `/fixtures/lineups?fixture=${fixtureId}`], "normal mode restores only the previous fixture and lineup API behavior; scanner validation adds no external call");
        console.log(JSON.stringify({ normalStatus: normal.status, normalPlayersByTeam: normal.body.teams.map(team => team.players.length), marketsPerTeam: normal.body.teams.map(team => Object.keys(team.markets).length), scannerConfirmationCode: missingConfirmation.body.code, scannerPlayersCode: missingPlayers.body.code, mockedExternalCalls: externalCalls }, null, 2));
    } finally {
        await new Promise(resolve => server.close(resolve));
    }
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
    insertedFixtureIds.forEach(id => { delete playerHistoryStore.fixtures[id]; });
    global.fetch = originalFetch;
    if (originalServerless === undefined) delete process.env.VERCEL; else process.env.VERCEL = originalServerless;
    if (originalOffline === undefined) delete process.env.CENTRAL_PRO_OFFLINE; else process.env.CENTRAL_PRO_OFFLINE = originalOffline;
});
