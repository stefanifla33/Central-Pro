const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createGameSnapshotStorage, resolveGames } = require("../lib/storage/game-snapshot-storage");
const { createLocalGameSnapshotAdapter } = require("../lib/storage/local-game-snapshot-storage");
const { createRemoteGameSnapshotAdapter } = require("../lib/storage/remote-game-snapshot-storage");
const { createConfiguredGameSnapshotStorage } = require("../lib/storage/create-game-snapshot-storage");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "central-pro-storage-"));
const file = path.join(directory, "game-snapshots.json");
const dateA = "2026-08-28", dateB = "2026-08-29";
const fixture = (id, date) => ({ fixture: { id, date: `${date}T20:00:00-03:00` }, teams: { home: { id: id + 1 }, away: { id: id + 2 } }, league: { id: 3 } });

async function run() { try {
    let storage = createGameSnapshotStorage(createLocalGameSnapshotAdapter(file));
    await storage.saveApiPayload(dateA, { response: [fixture(100, dateA)] }, "2026-08-28T15:42:00.000Z");
    assert.strictEqual((await storage.get(dateA)).count, 1, "A: local adapter saves and reads");
    assert.strictEqual(await storage.has(dateA), true, "A: local adapter reports stored date");

    storage = createGameSnapshotStorage(createLocalGameSnapshotAdapter(file));
    assert.strictEqual((await storage.get(dateA)).fixtures[0].fixture.id, 100, "B: new instance reloads persisted data");
    await storage.saveApiPayload(dateB, { response: [fixture(200, dateB)] });
    assert.deepStrictEqual(Object.keys(await storage.getAll()).sort(), [dateA, dateB], "C: dates stay separate");

    const before = fs.readFileSync(file, "utf8");
    assert.strictEqual(await storage.saveApiPayload(dateA, { response: [] }), null, "D: invalid snapshot is rejected");
    assert.strictEqual(fs.readFileSync(file, "utf8"), before, "D: valid file is not overwritten");

    const values = new Map();
    const memoryAdapter = { get: async key => values.get(key) || null, set: async (key, value) => values.set(key, value), getAll: async () => Object.fromEntries(values), has: async key => values.has(key) };
    const abstractStorage = createGameSnapshotStorage(memoryAdapter);
    const apiResult = await resolveGames(dateA, async () => ({ response: [fixture(300, dateA)] }), abstractStorage);
    const fallback = await resolveGames(dateA, async () => { throw Error("offline"); }, abstractStorage);
    assert.strictEqual(apiResult.source, "api", "E: service saves through an abstract adapter");
    assert.strictEqual(fallback.source, "snapshot", "E: service reads fallback through an abstract adapter");

    const remote = createRemoteGameSnapshotAdapter();
    await assert.rejects(remote.get(dateA), error => error.code === "GAME_SNAPSHOT_REMOTE_NOT_CONFIGURED", "F: unconfigured remote fails explicitly");

    const defaultFile = path.join(directory, "default.json");
    const configured = createConfiguredGameSnapshotStorage({ env: {}, localFile: defaultFile });
    await configured.saveApiPayload(dateA, { response: [fixture(400, dateA)] });
    assert.strictEqual(fs.existsSync(defaultFile), true, "G: current default selects local storage");
    console.log("game snapshot storage scenarios A-G: ok");
} finally { fs.rmSync(directory, { recursive: true, force: true }); }}

run().catch(error => { console.error(error); process.exitCode = 1; });
