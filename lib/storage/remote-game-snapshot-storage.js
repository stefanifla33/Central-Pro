class RemoteGameSnapshotStorageNotConfiguredError extends Error {
    constructor() { super("Remote game snapshot storage is not configured."); this.name = "RemoteGameSnapshotStorageNotConfiguredError"; this.code = "GAME_SNAPSHOT_REMOTE_NOT_CONFIGURED"; }
}
function createRemoteGameSnapshotAdapter() {
    // Replace these four methods with the chosen provider's persistent operations.
    // The domain service and server do not need to change when that happens.
    const unavailable = async () => { throw new RemoteGameSnapshotStorageNotConfiguredError(); };
    return { get: unavailable, set: unavailable, getAll: unavailable, has: unavailable };
}
module.exports = { createRemoteGameSnapshotAdapter, RemoteGameSnapshotStorageNotConfiguredError };
