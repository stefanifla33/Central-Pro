const fs = require("fs");
const path = require("path");
function createLocalGameSnapshotAdapter(file, options = {}) {
    const io = options.fs || fs;
    const maxDates = Math.max(1, Number(options.maxDates) || 5);
    let data = { version: 1, dates: {} };
    try { const parsed = JSON.parse(io.readFileSync(file, "utf8")); if (parsed?.version === 1 && parsed.dates && typeof parsed.dates === "object") data = parsed; }
    catch (error) { if (error.code !== "ENOENT") console.error(`[GAME-SNAPSHOT] read failed: ${error.message}`); }
    function pruneDates(dates) {
        const keys = Object.keys(dates || {}).sort().reverse();
        return Object.fromEntries(keys.slice(0, maxDates).map(key => [key, dates[key]]));
    }
    data = { ...data, dates: pruneDates(data.dates) };
    function persist(next) {
        next = { ...next, dates: pruneDates(next.dates) };
        io.mkdirSync(path.dirname(file), { recursive: true }); const temporary = `${file}.${process.pid}.tmp`;
        try { io.writeFileSync(temporary, JSON.stringify(next), "utf8"); io.renameSync(temporary, file); }
        catch (error) { try { io.unlinkSync(temporary); } catch {} throw error; }
    }
    return {
        async get(date) { return data.dates[date] || null; }, async getAll() { return { ...data.dates }; },
        async has(date) { return Boolean(data.dates[date]); },
        async set(date, snapshot) { const next = { ...data, dates: pruneDates({ ...data.dates, [date]: snapshot }) }; persist(next); data = next; return snapshot; }
    };
}
module.exports = { createLocalGameSnapshotAdapter };
