const assert = require("assert");
const { createMetricSampleCoverage, selectStatisticsItems, mergeMissingMetricValues, createConcurrencyLimiter } = require("../lib/metric-sample-coverage");

const item = (type, value) => ({ type, value });

{
    const merged = mergeMissingMetricValues(
        { "Total Shots": 8, "Shots on Goal": null },
        { "Total Shots": 99, "Shots on Goal": 3 },
        ["Total Shots", "Shots on Goal"]
    );
    assert.deepStrictEqual(merged, { "Total Shots": 8, "Shots on Goal": 3 }, "fallback fills only missing metrics");
    assert.strictEqual(mergeMissingMetricValues(null, { "Total Shots": null }, ["Total Shots"]), null, "missing statistics never become zero");
}

{
    const coverage = { "Total Shots": 0, "Shots on Goal": 0 };
    const fixtures = Array.from({ length: 8 }, (_, index) => [
        item("Total Shots", index < 5 ? index + 1 : null),
        item("Shots on Goal", index < 2 || index >= 5 ? index + 1 : null)
    ]);
    const selected = [];
    let processed = 0;
    for (const statistics of fixtures) {
        if (Object.values(coverage).every(value => value >= 5)) break;
        selected.push(selectStatisticsItems(statistics, Object.keys(coverage), coverage, 5));
        processed++;
    }
    assert.deepStrictEqual(coverage, { "Total Shots": 5, "Shots on Goal": 5 }, "SOG retrocede aos fixtures 6, 7 e 8");
    assert.strictEqual(processed, 8, "a coleta continua após Total Shots completar porque SOG ainda está incompleto");
    assert.strictEqual(selected.slice(5).flat().some(stat => stat.type === "Total Shots"), false, "Total Shots completo não recebe valores extras");
}

{
    const tracker = createMetricSampleCoverage(["Goals", "Corner Kicks"], ["halftime", "secondHalf"], 5);
    for (let index = 0; index < 8 && !tracker.complete(); index++) {
        const values = { Goals: 1, "Corner Kicks": index < 2 || index >= 5 ? index : null };
        tracker.take("halftime", values);
        tracker.take("secondHalf", values);
    }
    assert.deepStrictEqual(tracker.coverage.halftime, { Goals: 5, "Corner Kicks": 5 }, "corners de 1ºT completam 5/5 após gols");
    assert.deepStrictEqual(tracker.coverage.secondHalf, { Goals: 5, "Corner Kicks": 5 }, "corners de 2ºT completam 5/5 após gols");
}

{
    const tracker = createMetricSampleCoverage(["Total Shots"], ["halftime"], 5);
    tracker.take("halftime", { "Total Shots": 7 });
    tracker.take("halftime", { "Total Shots": null });
    tracker.take("halftime", {});
    tracker.take("halftime", { "Total Shots": 3 });
    assert.strictEqual(tracker.coverage.halftime["Total Shots"], 2, "candidatos esgotados preservam cobertura real 2/5");
    assert.strictEqual(tracker.take("halftime", { "Total Shots": undefined }), null, "ausência não vira zero");
    assert.strictEqual(tracker.coverage.halftime["Total Shots"], 2, "null e undefined não contam");
}

(async () => {
    const fixtures = [{ id: 1, delay: 30 }, { id: 2, delay: 5 }, { id: 3, delay: 1 }];
    const responses = await Promise.all(fixtures.map(fixture => new Promise(resolve => setTimeout(() => resolve(fixture), fixture.delay))));
    const tracker = createMetricSampleCoverage(["Shots on Goal"], ["fulltime"], 2);
    const selectedIds = [];
    for (const response of responses) {
        if (tracker.complete()) break;
        tracker.take("fulltime", { "Shots on Goal": response.id });
        selectedIds.push(response.id);
    }
    assert.deepStrictEqual(selectedIds, [1, 2], "respostas fora de ordem são incorporadas pela cronologia dos candidatos");

    const batchCandidates = Array.from({ length: 12 }, (_, index) => index + 1);
    const batchTracker = createMetricSampleCoverage(["Shots on Goal"], ["fulltime"], 5);
    const startedCandidates = [];
    for (let index = 0; index < batchCandidates.length && !batchTracker.complete(); index += 3) {
        const batch = batchCandidates.slice(index, index + 3);
        const batchResponses = await Promise.all(batch.map(async id => {
            startedCandidates.push(id);
            await new Promise(resolve => setTimeout(resolve, 4 - (id % 3)));
            return id;
        }));
        for (const id of batchResponses) batchTracker.take("fulltime", { "Shots on Goal": id });
    }
    assert.deepStrictEqual(startedCandidates, [1, 2, 3, 4, 5, 6], "only batches needed to reach coverage are started");
    assert.strictEqual(batchTracker.coverage.fulltime["Shots on Goal"], 5, "coverage stops exactly at 5/5");

    const limit = createConcurrencyLimiter(3);
    let active = 0;
    let maximumActive = 0;
    const startedAt = Date.now();
    await Promise.all(Array.from({ length: 9 }, () => limit(async () => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, 20));
        active--;
    })));
    const elapsed = Date.now() - startedAt;
    assert.strictEqual(maximumActive, 3, "limitador nunca ultrapassa três chamadas simultâneas");
    assert(elapsed < 150, `concorrência limitada reduz o tempo simulado (${elapsed} ms)`);

    let continuedAfterFailure = false;
    await Promise.allSettled([
        limit(async () => { throw Object.assign(new Error("rate limit"), { code: "API_MINUTE_QUOTA" }); }),
        limit(async () => { continuedAfterFailure = true; })
    ]);
    assert.strictEqual(continuedAfterFailure, true, "uma falha de quota libera o slot sem bloquear a fila");
    console.log(`metric sample coverage scenarios: ok; simulated concurrency=3 elapsed=${elapsed}ms sequential≈180ms`);
})().catch(error => { console.error(error); process.exitCode = 1; });
