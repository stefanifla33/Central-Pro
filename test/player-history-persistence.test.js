const assert = require("assert");
const { createSerializedJsonPersister } = require("../lib/serialized-json-persister");

function mockFileSystem({ renameFailures = 0, alwaysFail = false } = {}) {
    const files = new Map([["/data/player-history.json", JSON.stringify({ version: 1, fixtures: { old: {} } })]]);
    let activeRenames = 0;
    let maximumActiveRenames = 0;
    let renameAttempts = 0;
    return {
        files,
        stats: () => ({ activeRenames, maximumActiveRenames, renameAttempts }),
        adapter: {
            mkdir: async () => {},
            writeFile: async (file, content) => { files.set(file, content); },
            rename: async (source, target) => {
                activeRenames++;
                maximumActiveRenames = Math.max(maximumActiveRenames, activeRenames);
                renameAttempts++;
                await Promise.resolve();
                try {
                    if (alwaysFail || renameAttempts <= renameFailures) {
                        const error = new Error("OneDrive temporarily locked target");
                        error.code = "EPERM";
                        throw error;
                    }
                    files.set(target, files.get(source));
                    files.delete(source);
                } finally {
                    activeRenames--;
                }
            },
            unlink: async file => { files.delete(file); }
        }
    };
}

function persister(mock, logs = []) {
    return createSerializedJsonPersister({
        fileSystem: mock.adapter,
        file: "/data/player-history.json",
        directory: "/data",
        label: "PLAYER-HISTORY-PERSIST",
        retries: 3,
        backoffMs: [1, 2, 3],
        sleep: async () => {},
        logger: { log: value => logs.push(value), warn: value => logs.push(value), error: value => logs.push(value) }
    });
}

async function run() {
    const concurrentFs = mockFileSystem();
    const queued = persister(concurrentFs);
    const revisions = Array.from({ length: 12 }, (_, index) => ({ version: 1, fixtures: Object.fromEntries(Array.from({ length: index + 1 }, (__, fixture) => [fixture, { complete: true }])) }));
    await Promise.all(revisions.map(value => queued.enqueue(value)));
    assert.strictEqual(concurrentFs.stats().maximumActiveRenames, 1, "there are no concurrent writers");
    assert.strictEqual(queued.state().maximumConcurrentWriters, 1, "persister serializes every writer promise");
    assert.deepStrictEqual(JSON.parse(concurrentFs.files.get("/data/player-history.json")), revisions.at(-1), "last queued complete revision is persisted");

    const retryLogs = [];
    const retryFs = mockFileSystem({ renameFailures: 2 });
    const retrying = persister(retryFs, retryLogs);
    const recovered = { version: 1, fixtures: { 101: { complete: true }, 102: { complete: true } } };
    await retrying.enqueue(recovered);
    assert.strictEqual(retryFs.stats().renameAttempts, 3, "temporary EPERM is recovered with retry");
    assert(retryLogs.some(line => line.includes("retry")) && retryLogs.some(line => line.includes("saved fixtures=2")));
    const restartedStore = JSON.parse(retryFs.files.get("/data/player-history.json"));
    assert.deepStrictEqual(restartedStore, recovered, "restart from saved file recovers collected histories");

    const failedFs = mockFileSystem({ alwaysFail: true });
    const failureLogs = [];
    const failing = persister(failedFs, failureLogs);
    const memoryStore = { version: 1, fixtures: { new: { complete: true } } };
    const previousFile = failedFs.files.get("/data/player-history.json");
    await assert.rejects(failing.enqueue(memoryStore), error => error.code === "EPERM");
    assert.strictEqual(failedFs.files.get("/data/player-history.json"), previousFile, "failed atomic rename preserves previous file");
    assert(memoryStore.fixtures.new.complete, "new history remains in memory after persistence failure");
    assert(failureLogs.some(line => line.includes("failed fixtures=1")), "persistent failure is explicit in logs");

    console.log(JSON.stringify({ simultaneousWrites: revisions.length, maximumConcurrentWriters: concurrentFs.stats().maximumActiveRenames, temporaryEpermAttempts: retryFs.stats().renameAttempts, previousFilePreserved: true, restartRecoveredFixtures: Object.keys(restartedStore.fixtures).length }, null, 2));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
