const fs = require("fs");
const path = require("path");
function createLocalGameSnapshotAdapter(file, options = {}) {
    const io = options.fs || fs; let data = { version: 1, dates: {} };
    try { const parsed = JSON.parse(io.readFileSync(file, "utf8")); if (parsed?.version === 1 && parsed.dates && typeof parsed.dates === "object") data = parsed; }
    catch (error) { if (error.code !== "ENOENT") console.error(`[GAME-SNAPSHOT] read failed: ${error.message}`); }
    function persist(next) {
        io.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`;
        try { io.writeFileSync(temporary, JSON.stringify(next, null, 2), "utf8"); io.renameSync(temporary, file); }
        catch (error) { try { io.unlinkSync(temporary); } catch {} throw error; }
    }
    return {
        async get(date) { return data.dates[date] || null; }, async getAll() { return { ...data.dates }; },
        async has(date) { return Boolean(data.dates[date]); },
        async set(date, snapshot) { const next = { ...data, dates: { ...data.dates, [date]: snapshot } }; persist(next); data = next; return snapshot; }
    };
}
module.exports = { createLocalGameSnapshotAdapter };
