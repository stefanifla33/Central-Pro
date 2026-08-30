const assert = require("assert");
const { createPlayerRateLimiter } = require("../lib/player-rate-limiter");

function fakeClock() {
    let time = 0;
    let sequence = 0;
    const timers = new Map();
    return {
        now: () => time,
        setTimer(fn, delay) {
            const id = ++sequence;
            timers.set(id, { at: time + Math.max(0, delay), fn });
            return id;
        },
        clearTimer: id => timers.delete(id),
        async runAll(maximum = 10_000) {
            for (let count = 0; timers.size; count++) {
                if (count >= maximum) throw new Error("fake timer did not settle");
                const [id, timer] = [...timers.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
                timers.delete(id);
                time = timer.at;
                timer.fn();
                await Promise.resolve();
                await Promise.resolve();
            }
        }
    };
}

async function run() {
    const clock = fakeClock();
    const limiter = createPlayerRateLimiter({ limit: 240, windowMs: 60_000, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
    const released = [];
    const requests = Array.from({ length: 500 }, () => limiter.schedule(() => released.push(clock.now())));
    await clock.runAll();
    await Promise.all(requests);
    assert.strictEqual(released.length, 500, "all 500 queued requests continue");
    for (const time of released) {
        const inWindow = released.filter(value => value > time - 60_000 && value <= time).length;
        assert(inWindow <= 240, `rolling minute released ${inWindow} requests at ${time}`);
    }

    const cacheClock = fakeClock();
    const cacheLimiter = createPlayerRateLimiter({ limit: 240, windowMs: 60_000, now: cacheClock.now, setTimer: cacheClock.setTimer, clearTimer: cacheClock.clearTimer });
    let external = false;
    let actualCalls = 0;
    const first = cacheLimiter.schedule(() => { external = true; actualCalls++; }, { shouldConsume: () => !external });
    const hits = Array.from({ length: 20 }, () => cacheLimiter.schedule(() => {}, { shouldConsume: () => !external }));
    await cacheClock.runAll();
    await Promise.all([first, ...hits]);
    assert.strictEqual(actualCalls, 1, "cache/pending consumers do not create external calls");
    assert.strictEqual(cacheLimiter.state().releasesInWindow, 1, "cache/pending hits consume no limiter slots");

    const pauseClock = fakeClock();
    const pauseLimiter = createPlayerRateLimiter({ limit: 240, windowMs: 60_000, now: pauseClock.now, setTimer: pauseClock.setTimer, clearTimer: pauseClock.clearTimer });
    const pauseReleases = [];
    let firstAttempts = 0;
    const minute429 = pauseLimiter.schedule(() => {
        pauseReleases.push(pauseClock.now());
        firstAttempts++;
        const error = new Error("Too many requests");
        error.code = "API_MINUTE_QUOTA";
        error.retryAfterMs = 60_000;
        throw error;
    }).catch(error => error.code);
    const afterPause = pauseLimiter.schedule(() => pauseReleases.push(pauseClock.now()));
    await pauseClock.runAll();
    assert.strictEqual(await minute429, "API_MINUTE_QUOTA");
    await afterPause;
    assert.strictEqual(firstAttempts, 1, "minute 429 is not retried by the limiter");
    assert(pauseReleases[1] >= 60_000, "queue waits before continuing after minute 429");

    console.log(JSON.stringify({ concurrentRequests: 500, maximumRollingMinute: 240, firstRelease: released[0], lastRelease: released.at(-1), cachePendingSlots: cacheLimiter.state().releasesInWindow, minute429Attempts: firstAttempts, resumedAt: pauseReleases[1] }, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
