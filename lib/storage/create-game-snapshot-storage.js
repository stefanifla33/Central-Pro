const path = require("path");
const { createGameSnapshotStorage } = require("./game-snapshot-storage");
const { createLocalGameSnapshotAdapter } = require("./local-game-snapshot-storage");
const { createRemoteGameSnapshotAdapter } = require("./remote-game-snapshot-storage");
function createConfiguredGameSnapshotStorage(options = {}) {
    const environment = options.env || process.env, mode = String(environment.GAME_SNAPSHOT_STORAGE || "local").toLowerCase();
    if (mode === "remote") return createGameSnapshotStorage(createRemoteGameSnapshotAdapter(options.remote));
    if (mode !== "local") throw new Error(`Unsupported GAME_SNAPSHOT_STORAGE value: ${mode}`);
    if (environment.NODE_ENV === "production" && !environment.GAME_SNAPSHOT_STORAGE) (options.logger || console).warn("[GAME-SNAPSHOT] Production is using temporary local-file persistence; configure GAME_SNAPSHOT_STORAGE=remote after implementing a remote adapter.");
    const file = options.localFile || path.join(__dirname, "..", "..", "data", "game-snapshots.json");
    return createGameSnapshotStorage(createLocalGameSnapshotAdapter(file, options.localOptions));
}
module.exports = { createConfiguredGameSnapshotStorage };
