function createPlayerRateLimiter(options = {}) {
    const limit = options.limit || 240;
    const windowMs = options.windowMs || 60_000;
    const now = options.now || Date.now;
    const setTimer = options.setTimer || setTimeout;
    const clearTimer = options.clearTimer || clearTimeout;
    const spacingMs = Math.ceil(windowMs / limit);
    const queue = [];
    const releases = [];
    let lastReleaseAt = -Infinity;
    let pausedUntil = 0;
    let timer = null;
    let draining = false;

    const purge = time => {
        while (releases.length && releases[0] <= time - windowMs) releases.shift();
    };

    const arm = delay => {
        if (timer) clearTimer(timer);
        timer = setTimer(() => {
            timer = null;
            drain();
        }, Math.max(0, delay));
    };

    const drain = () => {
        if (draining || !queue.length) return;
        draining = true;
        try {
            const time = now();
            purge(time);
            let readyAt = Math.max(pausedUntil, lastReleaseAt + spacingMs);
            if (releases.length >= limit) readyAt = Math.max(readyAt, releases[0] + windowMs);
            if (readyAt > time) {
                arm(readyAt - time);
                return;
            }

            const job = queue.shift();
            let consumesSlot;
            try {
                consumesSlot = job.shouldConsume();
            } catch (error) {
                job.reject(error);
                arm(0);
                return;
            }

            // Execute synchronously up to the returned promise. This lets the
            // football() pending map be populated before the next queued job.
            let result;
            try {
                if (consumesSlot) {
                    releases.push(time);
                    lastReleaseAt = time;
                }
                result = job.run();
            } catch (error) {
                if (error?.code === "API_MINUTE_QUOTA") pause(error.retryAfterMs);
                job.reject(error);
                arm(consumesSlot ? spacingMs : 0);
                return;
            }
            Promise.resolve(result).then(job.resolve, error => {
                if (error?.code === "API_MINUTE_QUOTA") pause(error.retryAfterMs);
                job.reject(error);
            });
            arm(consumesSlot ? spacingMs : 0);
        } finally {
            draining = false;
        }
    };

    const schedule = (run, scheduleOptions = {}) => new Promise((resolve, reject) => {
        queue.push({ run, shouldConsume: scheduleOptions.shouldConsume || (() => true), resolve, reject });
        drain();
    });

    function pause(retryAfterMs = windowMs) {
        const delay = Number.isFinite(Number(retryAfterMs)) && Number(retryAfterMs) > 0 ? Number(retryAfterMs) : windowMs;
        pausedUntil = Math.max(pausedUntil, now() + delay);
        if (queue.length) arm(Math.max(0, pausedUntil - now()));
    }

    const state = () => {
        const time = now();
        purge(time);
        return { limit, windowMs, spacingMs, queued: queue.length, releasesInWindow: releases.length, pausedUntil };
    };

    return { schedule, pause, state };
}

module.exports = { createPlayerRateLimiter };
