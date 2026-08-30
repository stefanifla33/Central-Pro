const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
    CP_FEATURED_LEAGUES,
    cpIsScannerEligibleGame,
    cpSelectScannerFixtures
} = require("../public/competition-config");

const snapshotFile = path.join(__dirname, "..", "data", "game-snapshots.json");
const scannerFile = path.join(__dirname, "..", "public", "analysis-scanner.js");
const snapshot = JSON.parse(fs.readFileSync(snapshotFile, "utf8")).dates["2026-08-29"];
const schedule = snapshot.fixtures;
const eligible = cpSelectScannerFixtures(schedule);
const discarded = schedule.filter(game => !cpIsScannerEligibleGame(game));

assert.strictEqual(schedule.length, 1392, "snapshot preserves the complete agenda");
assert(eligible.some(game => game.league.id === 253), "whitelisted MLS fixture enters the scanner queue");
assert(!eligible.some(game => game.league.id === 47), "non-whitelisted FA Trophy fixture stays out of the scanner queue");
assert.strictEqual(eligible.length + discarded.length, schedule.length, "selection neither loses nor duplicates agenda fixtures");
assert.strictEqual(snapshot.fixtures.length, 1392, "scanner selection does not mutate the agenda snapshot");

const analysisCalls = new Map();
for (const game of eligible) analysisCalls.set(game.fixture.id, (analysisCalls.get(game.fixture.id) || 0) + 1);
assert(eligible.every(game => analysisCalls.get(game.fixture.id) === 1), "every eligible fixture reaches analysis once in the queue model");
assert(discarded.every(game => !analysisCalls.has(game.fixture.id)), "discarded fixtures generate zero analysis/history calls in the queue model");

const scannerSource = fs.readFileSync(scannerFile, "utf8");
const selectionPosition = scannerSource.indexOf("fixtures=cpSelectScannerFixtures(schedule)");
const queuePosition = scannerSource.indexOf("loadAnalysisRows(targets,token)");
assert(selectionPosition >= 0 && queuePosition > selectionPosition, "production scanner applies whitelist before starting the heavy queue");
assert(scannerSource.includes("agendaTotal=schedule.length"), "production scanner retains the full agenda count");
assert(scannerSource.includes("const targets=[...fixtures]"), "heavy queue is built only from eligible fixtures");

console.log(JSON.stringify({
    date: snapshot.date,
    agenda: schedule.length,
    eligible: eligible.length,
    discarded: discarded.length,
    whitelistIds: [...CP_FEATURED_LEAGUES]
}, null, 2));
