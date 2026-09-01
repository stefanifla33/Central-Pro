(function (root, factory) {
    const api = factory();
    if (typeof module === "object" && module.exports) module.exports = api;
    else root.CPAdaptiveAnalysis = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    const finite = Number.isFinite;

    function goalResult(game, teamId, period = 0) {
        const isHome = Number(game?.teams?.home?.id) === Number(teamId);
        const halftime = game?.score?.halftime || {};
        const fulltime = game?.score?.fulltime || {};
        let home;
        let away;
        if (period === 1) {
            home = halftime.home;
            away = halftime.away;
        } else if (period === 2) {
            home = finite(fulltime.home) && finite(halftime.home) ? fulltime.home - halftime.home : null;
            away = finite(fulltime.away) && finite(halftime.away) ? fulltime.away - halftime.away : null;
        } else {
            home = finite(fulltime.home) ? fulltime.home : game?.goals?.home;
            away = finite(fulltime.away) ? fulltime.away : game?.goals?.away;
        }
        if (!finite(home) || !finite(away)) return null;
        return { scored: isHome ? home : away, conceded: isHome ? away : home, total: home + away };
    }

    function goalTrend(games, teamId, period = 0) {
        const rows = (games || []).map(game => goalResult(game, teamId, period)).filter(Boolean);
        const n = rows.length;
        const percentage = predicate => n ? rows.filter(predicate).length * 100 / n : null;
        return {
            n,
            scored: n ? rows.reduce((sum, row) => sum + row.scored, 0) / n : null,
            conceded: n ? rows.reduce((sum, row) => sum + row.conceded, 0) / n : null,
            over05: percentage(row => row.total > 0.5),
            over15: percentage(row => row.total > 1.5),
            over25: percentage(row => row.total > 2.5),
            over35: percentage(row => row.total > 3.5),
            btts: percentage(row => row.scored > 0 && row.conceded > 0),
            clean: percentage(row => row.conceded === 0)
        };
    }

    function metricSample(values, requested = 5) {
        const valid = (values || []).filter(finite);
        return {
            value: valid.length ? valid.reduce((sum, value) => sum + value, 0) / valid.length : null,
            coverage: valid.length,
            requested,
            status: valid.length >= requested ? "complete" : valid.length ? "partial" : "unavailable"
        };
    }

    function coverageMode({ fulltime = 0, firstHalf = 0, secondHalf = 0 }, requested = 5) {
        if (fulltime >= requested && firstHalf >= requested && secondHalf >= requested) return "complete";
        if (fulltime > 0 && firstHalf === 0 && secondHalf === 0) return "fulltime-only";
        if (fulltime > 0 || firstHalf > 0 || secondHalf > 0) return "partial";
        return "unavailable";
    }

    return { goalResult, goalTrend, metricSample, coverageMode };
}));
