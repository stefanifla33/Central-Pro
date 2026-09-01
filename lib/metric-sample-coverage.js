function createMetricSampleCoverage(metrics, phases, limit) {
    const coverage = Object.fromEntries(phases.map(phase => [phase, Object.fromEntries(metrics.map(metric => [metric, 0]))]));
    const take = (phase, values) => {
        const selected = {};
        for (const metric of metrics) {
            if (coverage[phase][metric] >= limit) continue;
            const value = values?.[metric];
            if (!Number.isFinite(value)) continue;
            selected[metric] = value;
            coverage[phase][metric]++;
        }
        return Object.keys(selected).length ? selected : null;
    };
    const complete = () => phases.every(phase => metrics.every(metric => coverage[phase][metric] >= limit));
    return { coverage, take, complete };
}

function selectStatisticsItems(statistics, metrics, coverage, limit) {
    const selected = [];
    for (const metric of metrics) {
        if (coverage[metric] >= limit) continue;
        const item = (statistics || []).find(candidate => candidate.type === metric);
        if (!Number.isFinite(item?.value)) continue;
        selected.push(item);
        coverage[metric]++;
    }
    return selected;
}

function mergeMissingMetricValues(primary, fallback, metrics) {
    const merged = { ...(primary || {}) };
    for (const metric of metrics) {
        if (!Number.isFinite(merged[metric]) && Number.isFinite(fallback?.[metric])) merged[metric] = fallback[metric];
    }
    return Object.values(merged).some(Number.isFinite) ? merged : null;
}

function createConcurrencyLimiter(concurrency) {
    let active = 0;
    const queue = [];
    const drain = () => {
        while (active < concurrency && queue.length) {
            const { task, resolve, reject } = queue.shift();
            active++;
            Promise.resolve().then(task).then(resolve, reject).finally(() => { active--; drain(); });
        }
    };
    return task => new Promise((resolve, reject) => { queue.push({ task, resolve, reject }); drain(); });
}

function createExpiringCache(ttlMs, now = Date.now) {
    const entries = new Map();
    return {
        get(key) {
            const entry = entries.get(key);
            if (!entry) return null;
            if (entry.expiresAt <= now()) {
                entries.delete(key);
                return null;
            }
            return entry.value;
        },
        set(key, value) {
            entries.set(key, { value, expiresAt: now() + ttlMs });
            return value;
        },
        delete(key) { entries.delete(key); },
        size() { return entries.size; }
    };
}

module.exports = { createMetricSampleCoverage, selectStatisticsItems, mergeMissingMetricValues, createConcurrencyLimiter, createExpiringCache };
