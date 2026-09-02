const crypto = require("crypto");

const CACHE_PREFIX = "centralpro:football:";
const QUOTA_KEY = `${CACHE_PREFIX}quota:blocked`;
const COMMAND_TIMEOUT_MS = 800;
const LOCK_TTL_MS = 15_000;
const LOCK_WAIT_MS = 2_000;
const LOCK_POLL_MS = 100;

function createRemoteFootballCache(options = {}) {
    const env = options.env || process.env;
    const fetchImpl = options.fetch || fetch;
    const logger = options.logger || console;
    const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "").replace(/\/$/, "");
    const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "");
    const enabled = Boolean(url && token);
    let lastWarningAt = 0;
    let unavailableUntil = 0;

    const warn = error => {
        const now = Date.now();
        if (now - lastWarningAt < 60_000) return;
        lastWarningAt = now;
        logger.warn(`[REMOTE-CACHE] unavailable; using local fallback: ${error?.message || error}`);
    };

    const command = async args => {
        if (!enabled || unavailableUntil > Date.now()) return undefined;
        try {
            const response = await fetchImpl(url, {
                method: "POST",
                headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
                body: JSON.stringify(args),
                signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS)
            });
            if (!response.ok) throw new Error(`Redis REST HTTP ${response.status}`);
            const body = await response.json();
            if (body.error) throw new Error(body.error);
            return body.result;
        } catch (error) {
            unavailableUntil = Date.now() + 30_000;
            warn(error);
            return undefined;
        }
    };

    const digest = endpoint => crypto.createHash("sha256").update(endpoint).digest("base64url");
    const cacheKey = endpoint => `${CACHE_PREFIX}cache:${digest(endpoint)}`;
    const lockKey = endpoint => `${CACHE_PREFIX}lock:${digest(endpoint)}`;

    const getJson = async key => {
        const value = await command(["GET", key]);
        if (typeof value !== "string") return null;
        try { return JSON.parse(value); } catch { return null; }
    };

    return {
        enabled,
        async get(endpoint, ttl) {
            if (!enabled || ttl <= 0) return null;
            const entry = await getJson(cacheKey(endpoint));
            if (!entry || !Number.isFinite(entry.createdAt) || Date.now() - entry.createdAt >= ttl) return null;
            return entry;
        },
        async set(endpoint, data, ttl, createdAt = Date.now()) {
            if (!enabled || ttl <= 0) return false;
            const seconds = Math.max(1, Math.ceil(ttl / 1000));
            return await command(["SET", cacheKey(endpoint), JSON.stringify({ data, createdAt }), "EX", seconds]) === "OK";
        },
        async acquire(endpoint) {
            if (!enabled) return null;
            const lock = { key: lockKey(endpoint), token: crypto.randomUUID() };
            const result = await command(["SET", lock.key, lock.token, "NX", "PX", LOCK_TTL_MS]);
            return result === "OK" ? lock : result === undefined ? undefined : null;
        },
        async release(lock) {
            if (!enabled || !lock) return false;
            const script = "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end";
            return Number(await command(["EVAL", script, 1, lock.key, lock.token])) === 1;
        },
        async waitForValue(endpoint, ttl) {
            if (!enabled || ttl <= 0) return null;
            const deadline = Date.now() + LOCK_WAIT_MS;
            while (Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, LOCK_POLL_MS));
                const entry = await this.get(endpoint, ttl);
                if (entry) return entry;
            }
            return null;
        },
        async getQuotaState() {
            return enabled ? getJson(QUOTA_KEY) : null;
        },
        async setQuotaState(state) {
            if (!enabled || !state || state.blockedUntil <= Date.now()) return false;
            const seconds = Math.max(1, Math.ceil((state.blockedUntil - Date.now()) / 1000));
            return await command(["SET", QUOTA_KEY, JSON.stringify(state), "EX", seconds]) === "OK";
        }
    };
}

module.exports = { createRemoteFootballCache };
