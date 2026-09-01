const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { goalTrend, metricSample, coverageMode } = require("../public/adaptive-analysis");
const { createExpiringCache } = require("../lib/metric-sample-coverage");

const game = (id, home, away, halftimeHome = null, halftimeAway = null) => ({
    fixture: { id },
    teams: { home: { id: 10 }, away: { id: 20 } },
    goals: { home, away },
    score: { fulltime: { home, away }, halftime: { home: halftimeHome, away: halftimeAway } }
});

{
    const full = metricSample([1, 2, 3, 4, 5], 5);
    assert.deepStrictEqual(full, { value: 3, coverage: 5, requested: 5, status: "complete" });
    assert.strictEqual(coverageMode({ fulltime: 5, firstHalf: 5, secondHalf: 5 }), "complete");
}

{
    assert.strictEqual(coverageMode({ fulltime: 5, firstHalf: 0, secondHalf: 0 }), "fulltime-only");
    assert.strictEqual(coverageMode({ fulltime: 3, firstHalf: 1, secondHalf: 0 }), "partial");
    assert.strictEqual(coverageMode({ fulltime: 0, firstHalf: 0, secondHalf: 0 }), "unavailable");
}

{
    const partial = metricSample([2, null, 4, undefined, 6], 5);
    assert.deepStrictEqual(partial, { value: 4, coverage: 3, requested: 5, status: "partial" });
    const absent = metricSample([null, undefined, NaN], 5);
    assert.deepStrictEqual(absent, { value: null, coverage: 0, requested: 5, status: "unavailable" });
    assert.notStrictEqual(absent.value, 0, "absence never becomes zero");
}

{
    const games = [
        game(1, 2, 1, 1, 0),
        game(2, 3, 1, 1, 1),
        game(3, 1, 0, null, null),
        game(4, 2, 2, 0, 1),
        game(5, 0, 0, 0, 0)
    ];
    const fulltime = goalTrend(games, 10, 0);
    assert.strictEqual(fulltime.n, 5);
    assert.strictEqual(fulltime.over25, 60, "Over 2.5 uses valid final scores");
    assert.strictEqual(fulltime.over35, 40, "Over 3.5 uses valid final scores");
    const firstHalf = goalTrend(games, 10, 1);
    assert.strictEqual(firstHalf.n, 4, "missing halftime score is excluded instead of counted as 0-0");
    assert.strictEqual(coverageMode({ fulltime: fulltime.n, firstHalf: 0, secondHalf: 0 }), "fulltime-only", "unavailable periods do not block FT");
}

{
    let now = 1_000;
    const negative = createExpiringCache(120_000, () => now);
    negative.set("empty-period", { response: [] });
    assert.deepStrictEqual(negative.get("empty-period"), { response: [] }, "temporary negative result is reused");
    now += 120_001;
    assert.strictEqual(negative.get("empty-period"), null, "negative result expires after two minutes");
}

{
    const renderer = fs.readFileSync(path.join(__dirname, "../public/match-stats-premium.js"), "utf8");
    const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
    assert.match(renderer, /render\(null\);periods\(\)\.then/, "shots render FT before period requests resolve");
    assert.match(renderer, /render\(null\);Promise\.all/, "corners render FT before period requests resolve");
    assert.match(renderer, /Jogos com \+2,5 gols/);
    assert.match(renderer, /Jogos com \+3,5 gols/);
    assert.doesNotMatch(renderer, /c\.n<3\?'Amostra insuficiente'/, "partial samples remain visible");
    assert.match(server, /PERIOD_STATISTICS_NEGATIVE_TTL_MS = 120_000/);
    assert.match(server, /const status = allExternalRequestsRejected \|\| \(!home\.length && !away\.length\) \? "unavailable"/, "missing FT statistics return adaptive data instead of hiding the tab");
}

console.log("adaptive analysis scenarios: complete, FT-only, partial, unavailable and goal overs: ok");
