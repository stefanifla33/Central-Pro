const assert = require("assert");
const http = require("http");
const { fork } = require("child_process");

const endpoints = id => [
    `/fixtures?id=${id}`,
    `/fixtures/statistics?fixture=${id}`,
    `/fixtures/events?fixture=${id}`,
    `/fixtures/lineups?fixture=${id}`
];

if (process.argv.includes("--worker")) {
    const nativeFetch = global.fetch;
    global.fetch = (url, options) => String(url).startsWith("https://v3.football.api-sports.io")
        ? nativeFetch(`${process.env.TEST_COORDINATOR_URL}/external?endpoint=${encodeURIComponent(String(url))}`, options)
        : nativeFetch(url, options);
    const app = require("../server");
    const { football, metrics } = app.locals.offlineTest;
    const open = id => Promise.all(endpoints(id).map(endpoint => football(endpoint, 30_000)));
    const mode = process.argv.at(-1);
    (async () => {
        const before = () => ({ requests: metrics.requests, cacheHits: metrics.cacheHits, external: metrics.externalRequests });
        const delta = start => ({ logical: metrics.requests - start.requests, cacheHits: metrics.cacheHits - start.cacheHits, external: metrics.externalRequests - start.external });
        if (mode === "warm") {
            await open(4101);
            const start = before();
            await open(4101);
            process.send({ mode, ...delta(start) });
        } else if (mode === "same-process") {
            const start = before();
            await Promise.all(Array.from({ length: 10 }, () => open(4201)));
            process.send({ mode, ...delta(start) });
        } else if (mode.startsWith("quota-")) {
            const start = before();
            let code = null;
            try { await football(`/${mode}`, 30_000); } catch (error) { code = error.code; }
            process.send({ mode, code, ...delta(start) });
        } else {
            const start = before();
            await open(mode === "fallback" ? 4401 : 4301);
            process.send({ mode, ...delta(start) });
        }
    })().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
} else {
    const redis = new Map();
    let external = 0;
    const readBody = request => new Promise(resolve => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", chunk => { body += chunk; });
        request.on("end", () => resolve(body));
    });
    const get = key => {
        const entry = redis.get(key);
        if (!entry || entry.expiresAt <= Date.now()) { redis.delete(key); return null; }
        return entry.value;
    };
    const server = http.createServer(async (request, response) => {
        response.setHeader("content-type", "application/json");
        if (request.url.startsWith("/external")) {
            external++;
            await new Promise(resolve => setTimeout(resolve, 100));
            if (decodeURIComponent(request.url).includes("quota-producer")) {
                response.statusCode = 429;
                response.setHeader("retry-after", "60");
                response.end(JSON.stringify({ errors: { rate: "Too many requests" } }));
                return;
            }
            response.end(JSON.stringify({ response: [] }));
            return;
        }
        const args = JSON.parse(await readBody(request));
        const command = String(args[0]).toUpperCase();
        let result = null;
        if (command === "GET") result = get(args[1]);
        if (command === "SET") {
            const nx = args.includes("NX");
            if (!nx || get(args[1]) == null) {
                const unit = args.includes("PX") ? "PX" : "EX";
                const index = args.indexOf(unit);
                const duration = Number(args[index + 1]) * (unit === "PX" ? 1 : 1000);
                redis.set(args[1], { value: args[2], expiresAt: Date.now() + duration });
                result = "OK";
            }
        }
        if (command === "EVAL" && get(args[3]) === args[4]) { redis.delete(args[3]); result = 1; }
        response.end(JSON.stringify({ result }));
    });

    const runWorker = (mode, port, redisPort = port) => new Promise((resolve, reject) => {
        const child = fork(__filename, ["--worker", mode], {
            silent: true,
            env: { ...process.env, VERCEL: "1", CENTRAL_PRO_OFFLINE: "false", API_FOOTBALL_KEY: "test", TEST_COORDINATOR_URL: `http://127.0.0.1:${port}`, UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${redisPort}`, UPSTASH_REDIS_REST_TOKEN: "test" }
        });
        let stderr = "";
        child.stderr.on("data", chunk => { stderr += chunk; });
        child.on("message", resolve);
        child.on("exit", code => { if (code) reject(new Error(stderr || `worker exited ${code}`)); });
    });

    (async () => {
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        const port = server.address().port;
        redis.clear(); external = 0;
        const cold = await runWorker("cold", port);
        assert.deepStrictEqual({ logical: cold.logical, external: cold.external }, { logical: 4, external: 4 });
        redis.clear(); external = 0;
        const warm = await runWorker("warm", port);
        assert.deepStrictEqual({ logical: warm.logical, cacheHits: warm.cacheHits, external: warm.external }, { logical: 4, cacheHits: 4, external: 0 });
        redis.clear(); external = 0;
        const sameProcess = await runWorker("same-process", port);
        assert.deepStrictEqual({ logical: sameProcess.logical, external: sameProcess.external }, { logical: 40, external: 4 });
        redis.clear(); external = 0;
        const distributed = await Promise.all([runWorker("distributed", port), runWorker("distributed", port)]);
        assert.strictEqual(external, 4, "two cold processes share each API-Football request through the distributed lock");
        const distributedBefore = 8;
        redis.clear(); external = 0;
        const quotaProducer = await runWorker("quota-producer", port);
        const quotaConsumer = await runWorker("quota-consumer", port);
        assert.strictEqual(quotaProducer.code, "API_MINUTE_QUOTA");
        assert.strictEqual(quotaConsumer.code, "API_MINUTE_QUOTA");
        assert.strictEqual(external, 1, "a second process honors the shared cooldown without reaching API-Football");
        const sharedCooldown = { producer: quotaProducer.code, consumer: quotaConsumer.code, external: external };
        redis.clear(); external = 0;
        const fallback = await runWorker("fallback", port, port + 1);
        assert.deepStrictEqual({ logical: fallback.logical, external: fallback.external }, { logical: 4, external: 4 });
        console.log(JSON.stringify({ cold, warm, sameProcess, distributed: { logical: distributed.reduce((sum, item) => sum + item.logical, 0), externalBefore: distributedBefore, externalAfter: 4 }, sharedCooldown, fallback }, null, 2));
    })().finally(() => server.close()).catch(error => { console.error(error); process.exitCode = 1; });
}
