// Compatibility facade for callers created before the storage adapters existed.
const { createGameSnapshotStorage, normalizeApiPayload, resolveGames, validFixture } = require("./storage/game-snapshot-storage");
const { createLocalGameSnapshotAdapter } = require("./storage/local-game-snapshot-storage");
function createGameSnapshotStore(file, options) {
    return createGameSnapshotStorage(createLocalGameSnapshotAdapter(file, options));
}
module.exports = { createGameSnapshotStore, createGameSnapshotStorage, normalizeApiPayload, resolveGames, validFixture };
