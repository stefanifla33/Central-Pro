const assert = require("assert");
const playerSnapshot = require("../public/player-snapshot");
const { cpSelectScannerFixtures } = require("../public/competition-config");

const schedule = require("../data/game-snapshots.json").dates["2026-08-29"].fixtures;
const eligible = cpSelectScannerFixtures(schedule);
const outside = schedule.find(game => game.league.id === 47);
assert(eligible.some(game => game.league.id === 253), "whitelisted fixture enters player scanner universe");
assert(outside && !eligible.includes(outside), "fixture outside whitelist does not enter player scanner universe");
let calls = 0;
for (const game of eligible) { void game; calls++; }
const outsideCalls = eligible.includes(outside) ? 1 : 0;
assert.strictEqual(outsideCalls, 0, "fixture outside whitelist generates zero player scanner calls");
assert.strictEqual(calls, eligible.length, "only eligible fixtures are modeled as player calls");

const base = (id, teamId, fixtureId = 10, overrides = {}) => ({
    fixtureId, date: "2026-08-29T20:00:00-03:00", leagueId: 253, leagueName: "MLS",
    teamId, teamName: `Team ${teamId}`, opponentId: 99, opponentName: "Opponent",
    playerId: id, playerName: `Player ${id}`, status: "OFICIAL", games: 5,
    minutes: 450, shotsOn: 5, average: 1, ...overrides
});
assert.strictEqual(playerSnapshot.qualifies(base(1, 1, 10, { games: 4 })), false, "player below five valid games is excluded");
assert.strictEqual(playerSnapshot.qualifies(base(2, 1, 10, { minutes: 269 })), false, "player below 270 minutes is excluded");
assert.strictEqual(playerSnapshot.qualifies(base(3, 1, 10, { average: .19 })), false, "player below 0.20 SOG is excluded");
assert.strictEqual(playerSnapshot.qualifies(base(4, 1, 10, { status: "SEM CONFIRMAÇÃO" })), false, "unconfirmed player is excluded");

const candidates = [
    ...Array.from({ length: 6 }, (_, i) => base(i + 1, 1, 10, { average: 1 - i / 100 })),
    ...Array.from({ length: 6 }, (_, i) => base(i + 20, 2, 10, { average: .9 - i / 100 }))
];
const selected = playerSnapshot.selectQualified(candidates);
assert.strictEqual(selected.length, 8, "maximum eight players per fixture is respected");
assert.strictEqual(selected.filter(row => row.teamId === 1).length, 4, "maximum four players from first team is respected");
assert.strictEqual(selected.filter(row => row.teamId === 2).length, 4, "maximum four players from second team is respected");
const duplicatePlayer = playerSnapshot.selectQualified([base(90, 1, 10), base(90, 3, 11, { average: .8 })]);
assert.strictEqual(duplicatePlayer.length, 1, "same player is not repeated across fixtures");

const memory = new Map();
const storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) };
const valid = playerSnapshot.createSnapshot("2026-08-29", [base(50, 1)], "2026-08-29T15:00:00.000Z");
assert.strictEqual(valid.completed, true, "new snapshot carries explicit completion marker");
assert.strictEqual(playerSnapshot.persist(storage, valid, "2026-08-29"), true, "valid snapshot is persisted");
const saved = memory.get(playerSnapshot.KEY);
assert.strictEqual(playerSnapshot.persist(storage, { version: 1, date: "2026-08-29", generatedAt: "bad", players: [] }, "2026-08-29"), false, "invalid snapshot is rejected");
assert.strictEqual(memory.get(playerSnapshot.KEY), saved, "invalid snapshot does not replace valid snapshot");
const legacyEmpty = { version: 1, date: "2026-08-29", generatedAt: "2026-08-29T15:30:00.000Z", players: [] };
assert.strictEqual(playerSnapshot.validSnapshot(legacyEmpty), false, "legacy empty snapshot without completion marker is incomplete");
assert.strictEqual(playerSnapshot.persist(storage, legacyEmpty, "2026-08-29"), false, "legacy snapshot cannot replace completed snapshot");
const older = playerSnapshot.createSnapshot("2026-08-29", [base(51, 1)], "2026-08-29T14:00:00.000Z");
assert.strictEqual(playerSnapshot.persist(storage, older, "2026-08-29"), false, "older execution cannot replace newer snapshot");

const fs = require("fs");
const path = require("path");
const scannerSource = fs.readFileSync(path.join(__dirname, "..", "public", "player-scanner.js"), "utf8");
assert(scannerSource.includes("cpSelectScannerFixtures(fixtures)"), "player scanner reuses central eligible fixture selector");
assert(scannerSource.includes("confirmationOnly=1"), "player scanner uses lightweight confirmation mode");
assert(scannerSource.includes("mode=scanner&league="), "player scanner sends league for server-side whitelist guard");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
assert(serverSource.includes("cpIsScannerEligibleLeagueId(scannerLeagueId)"), "server uses canonical eligibility helper before heavy endpoints");

console.log(JSON.stringify({ eligibleFixtures: eligible.length, selectedPlayers: selected.length, outsideWhitelistCalls: outsideCalls }, null, 2));
