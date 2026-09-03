const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { selectStatisticsItems } = require("../lib/metric-sample-coverage");
const { goalTrend, metricSample } = require("../public/adaptive-analysis");

const serverSource = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const matchHtml = fs.readFileSync(path.join(__dirname, "../public/match.html"), "utf8");

function browserFunction(name) {
    const match = matchHtml.match(new RegExp(`function ${name}\\([^\\n]+`));
    assert(match, `${name} must remain available in match.html`);
    return match[0];
}

const browserContext = {};
vm.runInNewContext([
    browserFunction("statValue"),
    browserFunction("rawCornerValue"),
    browserFunction("cornerTrend")
].join("\n"), browserContext);

const stat = (type, value) => ({ type, value });
const cornerRow = (own, opponent) => ({
    statistics: own === undefined ? [] : [stat("Corner Kicks", own)],
    opponentStatistics: opponent === undefined ? [] : [stat("Corner Kicks", opponent)]
});

function assertSample(sample, expectedCoverage, expectedValue, expectedStatus) {
    assert.strictEqual(sample.coverage, expectedCoverage);
    assert.strictEqual(sample.value, expectedValue);
    assert.strictEqual(sample.status, expectedStatus);
}

// Escanteios: o renderer real usa somente valores numéricos e mantém a amostra real.
{
    const scenarios = [
        { values: [2, 4, 6, 8, 10], n: 5, average: 6, status: "complete" },
        { values: [2, 4, 6], n: 3, average: 4, status: "partial" },
        { values: [7], n: 1, average: 7, status: "partial" },
        { values: [null, undefined], n: 0, average: null, status: "unavailable" }
    ];
    for (const scenario of scenarios) {
        const rows = scenario.values.map(value => cornerRow(value, Number.isFinite(value) ? value + 1 : value));
        const trend = browserContext.cornerTrend(rows);
        assert.strictEqual(trend.n, scenario.n);
        assert.strictEqual(trend.for, scenario.average);
        assertSample(metricSample(scenario.values, 5), scenario.n, scenario.average, scenario.status);
    }
    assert.strictEqual(browserContext.rawCornerValue([stat("Corner Kicks", null)]), null);
    assert.strictEqual(browserContext.rawCornerValue([]), null);
}

// Chutes: o seletor usado pelo backend não conta null/ausência e continua até 5 valores reais.
{
    const collect = values => {
        const coverage = { "Total Shots": 0 };
        const selected = values.flatMap(value => selectStatisticsItems(
            value === undefined ? [] : [stat("Total Shots", value)],
            ["Total Shots"], coverage, 5
        ));
        return { coverage: coverage["Total Shots"], values: selected.map(item => item.value) };
    };
    assert.deepStrictEqual(collect([1, 2, 3, 4, 5]), { coverage: 5, values: [1, 2, 3, 4, 5] });
    assert.deepStrictEqual(collect([1, null, 3, undefined, 5]), { coverage: 3, values: [1, 3, 5] });
    assert.deepStrictEqual(collect([null, 8, undefined]), { coverage: 1, values: [8] });
    assert.deepStrictEqual(collect([null, undefined, NaN]), { coverage: 0, values: [] });
}

// Histórico: mantém competições/temporadas diferentes e exclui apenas as regras existentes.
{
    const currentId = 100;
    const currentTime = Date.parse("2026-09-01T12:00:00Z");
    const candidates = [
        { id: 100, date: "2026-08-31T12:00:00Z", status: "FT", league: 1, season: 2026 },
        { id: 1, date: "2026-08-30T12:00:00Z", status: "FT", league: 10, season: 2026 },
        { id: 2, date: "2026-08-20T12:00:00Z", status: "AET", league: 20, season: 2025 },
        { id: 3, date: "2026-08-10T12:00:00Z", status: "PEN", league: 30, season: 2024 },
        { id: 4, date: "2026-09-02T12:00:00Z", status: "FT", league: 40, season: 2026 },
        { id: 5, date: "2026-08-05T12:00:00Z", status: "NS", league: 50, season: 2025 }
    ];
    const eligible = candidates
        .filter(game => game.id !== currentId)
        .filter(game => ["FT", "AET", "PEN"].includes(game.status))
        .filter(game => Date.parse(game.date) < currentTime)
        .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    assert.deepStrictEqual(eligible.map(game => game.id), [1, 2, 3]);
    assert.deepStrictEqual(eligible.map(game => game.league), [10, 20, 30]);
    assert.deepStrictEqual(eligible.map(game => game.season), [2026, 2025, 2024]);
    assert.match(serverSource, /\["FT", "AET", "PEN"\]\.includes\(game\.fixture\?\.status\?\.short\)/);
    assert.match(serverSource, /new Date\(game\.fixture\?\.date\)\.getTime\(\) < fixtureTime/);
}

// Gols FT independem de /fixtures/statistics e usam somente placares finais válidos.
{
    const game = (id, home, away) => ({
        fixture: { id, status: { short: "FT" } },
        teams: { home: { id: 10 }, away: { id: 20 } },
        goals: { home, away },
        score: { fulltime: { home, away } },
        statistics: null
    });
    const games = [game(1, 2, 1), game(2, 3, 1), game(3, 1, 0), game(4, 2, 2), game(5, 0, 0)];
    const trend = goalTrend(games, 10, 0);
    assert.deepStrictEqual(trend, {
        n: 5,
        scored: 1.6,
        conceded: 0.8,
        over05: 80,
        over15: 60,
        over25: 60,
        over35: 40,
        btts: 60,
        clean: 40
    });
    const withoutValidScore = goalTrend([...games, game(6, null, null)], 10, 0);
    assert.deepStrictEqual(withoutValidScore, trend, "missing final score is excluded, never converted to 0-0");
}

// Garantia explícita: valores próprios válidos não deveriam desaparecer por falta de outra métrica.
{
    const cornerWithMissingOpponent = browserContext.cornerTrend([cornerRow(7, undefined)]);
    assert.strictEqual(cornerWithMissingOpponent.n, 1, "valid API Corner Kicks must remain usable even when opponent metric is missing");
    assert.strictEqual(cornerWithMissingOpponent.for, 7, "valid API Corner Kicks must not be discarded downstream");
}

console.log("real API coverage rule: corners, shots, goals and cross-season history: ok");
