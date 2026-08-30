function createSerializedJsonPersister(options) {
    const fileSystem = options.fileSystem;
    const file = options.file;
    const label = options.label;
    const retries = options.retries ?? 5;
    const backoffMs = options.backoffMs || [40, 80, 160, 320, 640];
    const sleep = options.sleep || (delay => new Promise(resolve => setTimeout(resolve, delay)));
    const logger = options.logger || console;
    const directory = options.directory;
    let sequence = 0;
    let pendingRevision = null;
    let drainPromise = null;
    let activeWriters = 0;
    let maximumConcurrentWriters = 0;

    async function atomicWrite(serialized, fixtureCount) {
        const temporary = `${file}.tmp-${process.pid}-${++sequence}`;
        await fileSystem.mkdir(directory, { recursive: true });
        await fileSystem.writeFile(temporary, serialized, "utf8");
        activeWriters++;
        maximumConcurrentWriters = Math.max(maximumConcurrentWriters, activeWriters);
        try {
            for (let attempt = 0; ; attempt++) {
                try {
                    await fileSystem.rename(temporary, file);
                    logger.log(`[${label}] saved fixtures=${fixtureCount}`);
                    return true;
                } catch (error) {
                    const transient = ["EPERM", "EBUSY", "EACCES"].includes(error.code);
                    if (!transient || attempt >= retries) throw error;
                    const delay = backoffMs[Math.min(attempt, backoffMs.length - 1)];
                    logger.warn(`[${label}] retry fixtures=${fixtureCount} attempt=${attempt + 1} error=${error.code} delayMs=${delay}`);
                    await sleep(delay);
                }
            }
        } finally {
            activeWriters--;
            await fileSystem.unlink(temporary).catch(() => {});
        }
    }

    async function drain() {
        while (pendingRevision) {
            const revision = pendingRevision;
            pendingRevision = null;
            try {
                await atomicWrite(revision.serialized, revision.fixtureCount);
                revision.waiters.forEach(waiter => waiter.resolve(true));
            } catch (error) {
                logger.error(`[${label}] failed fixtures=${revision.fixtureCount} error=${error.code || error.message}`);
                revision.waiters.forEach(waiter => waiter.reject(error));
            }
        }
    }

    function startDrain() {
        if (drainPromise) return;
        drainPromise = Promise.resolve().then(drain).finally(() => {
            drainPromise = null;
            if (pendingRevision) startDrain();
        });
    }

    function enqueue(value) {
        // Capture a complete immutable revision before it enters the queue.
        const serialized = JSON.stringify(value, null, 2);
        const fixtureCount = Object.keys(value?.fixtures || {}).length;
        logger.log(`[${label}] queued fixtures=${fixtureCount}`);
        const operation = new Promise((resolve, reject) => {
            if (pendingRevision) {
                // The latest player-history revision contains every prior in-memory
                // mutation, so pending disk writes can safely be coalesced.
                pendingRevision.serialized = serialized;
                pendingRevision.fixtureCount = fixtureCount;
                pendingRevision.waiters.push({ resolve, reject });
            } else {
                pendingRevision = { serialized, fixtureCount, waiters: [{ resolve, reject }] };
            }
        });
        startDrain();
        return operation;
    }

    return {
        enqueue,
        flush: () => drainPromise || Promise.resolve(),
        state: () => ({ activeWriters, maximumConcurrentWriters })
    };
}

module.exports = { createSerializedJsonPersister };
