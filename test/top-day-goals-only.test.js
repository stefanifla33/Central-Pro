const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const html = read("public/top-day.html");
const source = read("public/top-day.js");
const engine = read("public/opportunity-engine.js");
const server = read("server.js");

assert(!/Top Jogadores|topPlayers|players\.snapshot|player-collector|player-snapshot|player-competition-config/i.test(html + source), "Top do Dia has no player UI, snapshot or collector");
assert(!/data-top-tab|top-tabs/.test(html), "single-page layout has no category tabs");
assert(!/fetch\s*\(/.test(source), "Top do Dia cannot initiate any network request");
const marketDeclaration = source.match(/TOP_GAME_MARKETS=new Set\(\[([^\]]+)\]\)/)?.[1] || "";
const markets = [...marketDeclaration.matchAll(/'([^']+)'/g)].map(match => match[1]);
assert.deepStrictEqual(markets, ["over05HT", "over15", "over25", "btts", "homeScores", "awayScores"], "only approved goal markets remain");
assert(!markets.includes("over05"), "+0.5 goals FT remains excluded");
assert(source.includes("engine.opportunities({games:snapshot.items})") && source.includes("engine.compareRecommendations"), "existing opportunity ranking remains in use");

let networkCalls = 0;
const elements = Object.fromEntries(["topGamesCount", "lastUpdated", "snapshotMeta", "topGamesList"].map(id => [id, { textContent: "", innerHTML: "" }]));
const context = {
    window: { CPOpportunityEngine: { opportunities: () => [], compareRecommendations: () => 0, entryFields: () => ({}) } },
    document: { getElementById: id => elements[id] },
    localStorage: { getItem: () => null },
    fetch: () => { networkCalls++; throw new Error("network forbidden"); },
    cpEscape: value => String(value ?? ""), URLSearchParams, Date, Intl, Map, Set, Number, JSON, encodeURIComponent
};
vm.runInNewContext(source, context, { filename: "top-day.js" });
assert.strictEqual(networkCalls, 0, "opening Top do Dia makes zero calls, including player calls");
assert(elements.topGamesList.innerHTML.includes("snapshot de jogos"), "Top do Dia opens normally with local empty state");

const playersPage = read("public/players.html");
const matchPage = read("public/match.html");
assert(playersPage.includes("/api/jogadores/busca"), "normal Players page remains functional");
assert(matchPage.includes("/jogadores${force?'?refresh=1':''}"), "pre-game player statistics remain wired");
assert(server.includes('app.get("/api/jogadores/busca"') && server.includes('app.get("/api/partidas/:id/jogadores"'), "shared player endpoints remain available");
assert(read("public/analysis-scanner.js").includes("cpSelectScannerFixtures"), "game scanner remains intact");
assert(engine.includes("over05HT") && engine.includes("over15") && engine.includes("over25") && engine.includes("btts") && engine.includes("homeScores") && engine.includes("awayScores"), "approved goal markets remain available in opportunity engine");
assert(fs.existsSync(path.join(root, "public/index.html")) && fs.existsSync(path.join(root, "public/opportunities.html")), "Home and Opportunities remain present");

console.log(JSON.stringify({ topDayNetworkCalls: networkCalls, markets, playerUiPresent: false, normalPlayersPreserved: true, scannerPreserved: true }, null, 2));
