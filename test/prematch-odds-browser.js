"use strict";
// Isolated local QA: replay captured provider responses through the real backend.
// Historical metrics are controlled test data, never written into the user's browser.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const { MARKETS } = require("../lib/prematch-odds");
const directory = path.join(__dirname, "../outputs/odds-validation");
const capture = JSON.parse(fs.readFileSync(path.join(directory, "live-responses.json"), "utf8"));
// Fixed replay clock preserves captured timestamps and prices after games end.
const replayTime = Date.parse(capture.capturedAt) + 3 * 60 * 60_000;
const actualDateNow = Date.now;
Date.now = () => replayTime;
const byId = new Map(capture.captures.map(item => [String(item.fixture.response[0].fixture.id), item]));
const calls = [];
process.env.CENTRAL_PRO_OFFLINE = "false";
process.env.VERCEL = "1";
process.env.API_FOOTBALL_KEY = "isolated-odds-test";
for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) process.env[key] = "";
global.fetch = async url => {
    const parsed = new URL(url);
    assert.equal(parsed.hostname, "v3.football.api-sports.io", "no external services in isolated QA");
    calls.push(parsed.pathname + parsed.search);
    const id = parsed.searchParams.get("id") || parsed.searchParams.get("fixture");
    let body;
    if (id === "999990") throw new Error("Simulated provider failure");
    if (id === "999991") body = { response: [{ fixture: { id: 999991, status: { short: "PST" }, date: new Date(Date.now() + 86400000).toISOString() } }] };
    else {
        const item = byId.get(id);
        assert(item, `uncaptured fixture ${id}`);
        body = parsed.pathname === "/fixtures" ? item.fixture : item.odds;
    }
    return { ok: true, status: 200, headers: new Headers(), json: async () => structuredClone(body) };
};
const app = require("../server");
const server = app.listen(0, "127.0.0.1");
const summary = { captureTime: capture.capturedAt, source: "Real API-Football responses replayed through actual local backend; controlled historical metrics", layouts: [], assertions: [] };
summary.validatedAt = new Date(actualDateNow()).toISOString();
summary.replayTime = new Date(replayTime).toISOString();

async function run() {
    await new Promise(resolve => server.listening ? resolve() : server.on("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const browser = await chromium.launch({ executablePath: process.env.ODDS_TEST_BROWSER || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "America/Sao_Paulo" });
        await context.addInitScript(time => {
            const NativeDate = Date;
            window.Date = class extends NativeDate {
                constructor(...args) { super(...(args.length ? args : [time])); }
                static now() { return time; }
            };
        }, replayTime);
        const errors = [];
        context.on("page", page => page.on("pageerror", error => errors.push(error.message)));
        await context.route("**/*", route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'media.api-sports.io') return route.continue();
            if (url.origin !== base) return route.abort();
            // Auth is stubbed only in this fresh automated browser, not in project code.
            if (url.pathname === "/auth-guard.js") return route.fulfill({ contentType: "application/javascript", body: "" });
            return route.continue();
        });
        const games = [...byId.values()].map(item => {
            const game = structuredClone(item.fixture.response[0]);
            const metrics = Object.fromEntries(Object.keys(MARKETS).map(key => [key, { total: 10, hits: 9, value: 90, evidence: { total: 10, hits: 9, value: 90 } }]));
            metrics.sourceSample = { displayHome: 5, displayAway: 5 };
            game.metrics = metrics;
            game.sampleMetrics = { l5: Object.fromEntries(Object.keys(MARKETS).map(key => [key, { total: 5, hits: 5, value: 100 }])), l10: metrics };
            return game;
        });
        const snapshot = { version: 3, date: new Date(replayTime).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }), generatedAt: new Date(replayTime).toISOString(), games };
        await context.addInitScript(snapshot => { if (location.protocol === 'http:') localStorage.setItem("centralPro.opportunities.v1", JSON.stringify(snapshot)); }, snapshot);
        const page = await context.newPage();
        const data = {};
        for (const id of byId.keys()) {
            const response = await context.request.get(`${base}/api/partidas/${id}/odds`);
            assert.equal(response.status(), 200); data[id] = await response.json();
            for (const [key, quotes] of Object.entries(data[id].selections)) for (const quote of quotes) {
                const [marketId, marketName, value] = MARKETS[key];
                assert.equal(quote.marketId, marketId); assert.equal(quote.market, marketName); assert.equal(quote.selection, value);
                assert(byId.get(id).odds.response.some(record => record.bookmakers.some(book => book.id === quote.bookmakerId && book.bets.some(bet => bet.id === marketId && bet.values.some(item => item.value === value && item.odd === quote.odd)))));
            }
        }
        const before = calls.length;
        await Promise.all(Array.from({ length: 12 }, () => context.request.get(`${base}/api/partidas/1490437/odds`)));
        assert.equal(calls.length, before, "different concurrent HTTP consumers reuse server cache");
        assert.equal((await context.request.get(`${base}/api/partidas/invalid/odds`)).status(), 400);
        assert.equal((await (await context.request.get(`${base}/api/partidas/999991/odds`)).json()).status, "unavailable");
        assert(!calls.includes("/odds?fixture=999991"), "postponed never requests odds");
        assert.equal((await (await context.request.get(`${base}/api/partidas/999990/odds`)).json()).status, "unavailable");

        for (const pageName of ["top-day", "opportunities"]) {
            for (const width of [1440, 390, 320]) {
                await page.setViewportSize({ width, height: 1000 });
                await page.goto(`${base}/${pageName}.html`);
                await page.waitForSelector(".cp-odds");
                const blocks = page.locator(".cp-odds");
                for (let i = 0; i < await blocks.count(); i++) {
                    const block = blocks.nth(i);
                    await block.scrollIntoViewIfNeeded();
                    const id = await block.getAttribute("data-odds-fixture"), key = await block.getAttribute("data-odds-market");
                    const quotes = data[id].selections[key] || [];
                    if (quotes.length) await block.locator(".cp-odd").first().waitFor();
                    assert.deepEqual(await block.locator(".cp-odd strong").allTextContents(), quotes.map(quote => quote.odd), "DOM strings exactly equal provider strings");
                    if (!quotes.length) assert.equal(await block.textContent(), "Odds indisponíveis");
                    const box = await block.boundingBox();
                    assert(box.x >= 0 && box.x + box.width <= width + 1, "odds block stays within viewport");
                }
                const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
                assert(layout.scrollWidth <= layout.width, `${pageName} horizontal overflow at ${width}`);
                summary.layouts.push({ page: pageName, ...layout, exactValues: true });
                await page.evaluate(() => window.scrollTo(0, 0));
                if (width !== 320) await page.screenshot({ path: path.join(directory, `${pageName}-${width === 1440 ? "desktop" : "mobile"}.png`), fullPage: true });
            }
        }
        assert.equal(calls.filter(call => /fixture=1490437$/.test(call)).length, 1, "cards/pages/markets/users share one odds request");
        summary.assertions.push("Exact DOM/API values, missing markets, 1440/390/320px without overflow, server cache across pages and clients");

        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.goto(`${base}/opportunities.html`);
        const row = page.locator('.recommendation-row').filter({ has: page.locator('[data-odds-fixture="1490437"][data-odds-market="over25"]') });
        await row.scrollIntoViewIfNeeded(); await row.locator('.cp-odd').first().waitFor();
        await row.locator('.cp-odd').first().click();
        await row.locator('.add-bankroll').click();
        assert.equal(await page.locator('#entryOdd').inputValue(), data['1490437'].selections.over25[0].odd);
        await page.locator('#entryStake').fill('10'); await page.locator('.save-entry').click();
        const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('centralPro.bankroll.v1')).entries);
        assert.equal(saved.length, 1); assert.equal(saved[0].odd, Number(data['1490437'].selections.over25[0].odd));
        await row.locator('.add-bankroll').click();
        assert.equal(await page.locator('#opportunityEntryDialog').evaluate(node => node.open), false, "duplicate prevention preserved");
        await page.locator('#marketFilter').selectOption('over05HT');
        assert.equal(await page.locator('.recommendation-row').count(), games.length);
        assert((await page.locator('.cp-odds').allTextContents()).some(text => text.includes('Odds indisponíveis')));
        await page.goto(`${base}/top-day.html`);
        const top = page.locator('.top-card').filter({ has: page.locator('[data-odds-fixture="1490437"]') });
        await top.scrollIntoViewIfNeeded(); await top.locator('.cp-odd').first().waitFor();
        await top.locator('.bankroll-link').click();
        await page.waitForSelector('#entryDialog[open]');
        assert.equal(await page.locator('#entryOdd').inputValue(), data['1490437'].selections.over25[0].odd);
        summary.assertions.push("Minha Banca selected quote, save, duplicate prevention, market filters and Top do Dia handoff");

        // Synthetic fixture response ONLY for testing comparison, ties and precision.
        const comparison = structuredClone(data['1490437']);
        const template = comparison.selections.over25[0];
        comparison.selections.over25 = [
            { ...template, bookmakerId: 32, name: 'Betano', odd: '1.820' },
            { ...template, bookmakerId: 8, name: 'Bet365', odd: '1.85' },
            { ...template, bookmakerId: 34, name: 'Superbet', odd: '1.85' }
        ];
        await context.route('**/api/partidas/1490437/odds', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(comparison) }));
        await page.goto(`${base}/top-day.html`);
        const comparisonBlock = page.locator('[data-odds-fixture="1490437"]');
        await comparisonBlock.scrollIntoViewIfNeeded();
        await comparisonBlock.locator('.cp-odd').nth(2).waitFor();
        assert.deepEqual(await comparisonBlock.locator('.cp-odd strong').allTextContents(), ['1.820', '1.85', '1.85']);
        assert.equal(await comparisonBlock.locator('.is-best').count(), 2, 'equal highest quotes share discreet highlight');
        await comparisonBlock.getByRole('button', { name: /Betano/ }).click();
        assert.equal(await comparisonBlock.getByRole('button', { name: /Betano/ }).getAttribute('aria-pressed'), 'true');
        for (const width of [390, 320]) {
            await page.setViewportSize({ width, height: 1000 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'three-house strip wraps on mobile');
        }
        summary.assertions.push('Synthetic comparison-only test: three houses, exact 1.820 string, tied best prices, selected house and mobile wrapping');
        await page.evaluate(expiry => { Date.now = () => expiry; }, Date.parse(comparison.expiresAt) + 1);
        await comparisonBlock.locator('.cp-odd').first().waitFor({ state: 'detached' });
        assert.equal(await comparisonBlock.textContent(), 'Odds indisponíveis');
        assert.equal(await page.evaluate(() => window.CPPrematchOdds.selectedQuote('1490437', 'over25')), null);
        summary.assertions.push('Expired quotes disappear from an open tab and cannot prefill Minha Banca');
        await context.unroute('**/api/partidas/1490437/odds');

        // Controlled failures on the internal endpoint; production source remains untouched.
        await context.route('**/api/partidas/*/odds', route => route.fulfill({ status: 502, contentType: 'application/json', body: '{}' }));
        for (const pageName of ['top-day', 'opportunities']) {
            await page.goto(`${base}/${pageName}.html`);
            await page.locator('.cp-odds').first().waitFor();
            assert.equal(await page.locator('.cp-odd').count(), 0);
            assert((await page.locator('.cp-odds').allTextContents()).every(text => text === 'Odds indisponíveis'));
            assert(await page.locator(pageName === 'top-day' ? '.top-card' : '.fixture-opportunities').count() > 0);
        }
        assert.deepEqual(errors, []);
        summary.assertions.push("Both pages survive endpoint 502; no fictitious fallback and no JavaScript errors");
        summary.externalCallsInReplay = calls;
        fs.writeFileSync(path.join(directory, 'browser-results.json'), JSON.stringify(summary, null, 2));
        fs.writeFileSync(path.join(directory, 'mapped-live-odds.json'), JSON.stringify(data, null, 2));
        console.log(JSON.stringify(summary, null, 2));
        await context.close();
    } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Date.now = actualDateNow; server.close(); });
