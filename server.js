require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const { CP_MAIN_LEAGUES: MAIN_LEAGUES } = require("./public/competition-config");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://v3.football.api-sports.io";
const APP_TIMEZONE = "America/Sao_Paulo";
const SNAPSHOT_FILE = path.join(__dirname, "data", "period-stats.json");
const PLAYER_HISTORY_FILE = path.join(__dirname, "data", "player-history.json");
const CORNER_HISTORY_FILE = path.join(__dirname, "data", "corner-history.json");
const cache = new Map();
const pending = new Map();
const lineupRefreshes = new Map();
const metrics = { requests: 0, externalRequests: 0, cacheHits: 0, startedAt: Date.now() };
let periodStore = { version: 1, fixtures: {} };
let playerHistoryStore = { version: 1, fixtures: {} };
let cornerHistoryStore = { version: 1, fixtures: {} };
let monitorRunning = false;
let nextCornerRequestAt = 0;
let cornerRequestQueue = Promise.resolve();

try {
    periodStore = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
} catch (erro) {
    if (erro.code !== "ENOENT") console.error("Não foi possível ler os snapshots:", erro.message);
}

try {
    playerHistoryStore = JSON.parse(fs.readFileSync(PLAYER_HISTORY_FILE, "utf8"));
} catch (erro) {
    if (erro.code !== "ENOENT") console.error("Não foi possível ler o histórico de jogadores:", erro.message);
}

try {
    cornerHistoryStore = JSON.parse(fs.readFileSync(CORNER_HISTORY_FILE, "utf8"));
} catch (erro) {
    if (erro.code !== "ENOENT") console.error("NÃ£o foi possÃ­vel ler o histÃ³rico de escanteios:", erro.message);
}

function savePeriodStore() {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    const temporary = `${SNAPSHOT_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(periodStore, null, 2));
    fs.renameSync(temporary, SNAPSHOT_FILE);
}

function savePlayerHistoryStore() {
    fs.mkdirSync(path.dirname(PLAYER_HISTORY_FILE), { recursive: true });
    const temporary = `${PLAYER_HISTORY_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(playerHistoryStore, null, 2));
    fs.renameSync(temporary, PLAYER_HISTORY_FILE);
}

function saveCornerHistoryStore() {
    fs.mkdirSync(path.dirname(CORNER_HISTORY_FILE), { recursive: true });
    const temporary = `${CORNER_HISTORY_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(cornerHistoryStore, null, 2));
    fs.renameSync(temporary, CORNER_HISTORY_FILE);
}

function statisticNumber(statistics, type) {
    const value = (statistics || []).find(item => item.type === type)?.value;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function cornerRecord(game) {
    const fixtureId = game.fixture?.id;
    const existing = cornerHistoryStore.fixtures[fixtureId];
    if (existing?.complete) return existing;
    if (existing?.retryAfter && new Date(existing.retryAfter) > new Date()) {
        const emptyTemporaryFailure = !existing.teams?.length && Date.now() - new Date(existing.updatedAt || 0).getTime() >= 60_000;
        if (!emptyTemporaryFailure) return existing;
    }
    try {
        const result = await cornerFootball(`/fixtures/statistics?fixture=${fixtureId}`, 21_600_000);
        const teams = (result.response || []).map(team => ({
            teamId: team.team?.id,
            corners: statisticNumber(team.statistics, "Corner Kicks")
        })).filter(team => Number.isInteger(team.teamId));
        const complete = teams.length === 2 && teams.every(team => team.corners != null);
        const record = {
            fixture: { id: fixtureId, date: game.fixture?.date, teams: game.teams, league: game.league },
            teams,
            complete,
            updatedAt: new Date().toISOString(),
            retryAfter: complete ? null : new Date(Date.now() + 21_600_000).toISOString(),
            attempts: (existing?.attempts || 0) + 1,
            source: "/fixtures/statistics"
        };
        cornerHistoryStore.fixtures[fixtureId] = record;
        return record;
    } catch (erro) {
        cornerHistoryStore.fixtures[fixtureId] = {
            ...(existing || { fixture: { id: fixtureId, date: game.fixture?.date, teams: game.teams, league: game.league }, teams: [] }),
            complete: false,
            updatedAt: new Date().toISOString(),
            retryAfter: new Date(Date.now() + (/rateLimit|Too many requests/i.test(erro.message) ? 60_000 : 900_000)).toISOString(),
            attempts: (existing?.attempts || 0) + 1,
            errorType: /rateLimit|Too many requests/i.test(erro.message) ? "rate-limit" : "request"
        };
        return cornerHistoryStore.fixtures[fixtureId];
    }
}

/*
 * Histórico individual orientado por PARTIDA.
 * A API-Football fornece todos os jogadores de uma partida em uma única chamada:
 * GET /fixtures/players?fixture={fixtureId}. Não é necessário consultar jogador por jogador.
 * Cada fixture encerrada é persistida por fixtureId e indexada internamente por playerId.
 * getPlayerRecentStats apenas lê o arquivo local; ela nunca realiza chamadas externas.
 */
const PLAYER_HISTORY_METRICS = new Set([
    "minutes", "shots.total", "shots.on", "goals", "assists", "tackles",
    "fouls.committed", "fouls.drawn", "passes.total", "passes.key", "passes.accuracy",
    "cards.yellow", "cards.red", "rating"
]);
function playerHistoryValue(player, metric) {
    return metric.split(".").reduce((value, key) => value?.[key], player);
}
function normalizeFixturePlayers(response) {
    const players = {};
    for (const team of response || []) {
        for (const item of team.players || []) {
            const stat = Array.isArray(item.statistics) ? item.statistics[0] : item.statistics;
            if (!item.player?.id || !stat) continue;
            players[item.player.id] = {
                playerId: item.player.id,
                name: item.player.name || null,
                teamId: team.team?.id || stat.team?.id || null,
                minutes: stat.games?.minutes ?? null,
                number: stat.games?.number ?? null,
                position: stat.games?.position ?? null,
                rating: stat.games?.rating == null ? null : Number(stat.games.rating),
                captain: stat.games?.captain ?? null,
                substitute: stat.games?.substitute ?? null,
                shots: { total: stat.shots?.total ?? null, on: stat.shots?.on ?? null },
                goals: stat.goals?.total ?? null,
                assists: stat.goals?.assists ?? null,
                tackles: stat.tackles?.total ?? null,
                passes: { total: stat.passes?.total ?? null, key: stat.passes?.key ?? null, accuracy: stat.passes?.accuracy ?? null },
                fouls: { committed: stat.fouls?.committed ?? null, drawn: stat.fouls?.drawn ?? null },
                cards: { yellow: stat.cards?.yellow ?? null, red: stat.cards?.red ?? null },
                offsides: stat.offsides ?? null,
                saves: stat.goals?.saves ?? null,
                duels: { total: stat.duels?.total ?? null, won: stat.duels?.won ?? null },
                dribbles: { attempts: stat.dribbles?.attempts ?? null, success: stat.dribbles?.success ?? null }
            };
        }
    }
    return players;
}
function getPlayerRecentStats(playerId, metric, limit = 5) {
    if (!PLAYER_HISTORY_METRICS.has(metric)) return [];
    return Object.values(playerHistoryStore.fixtures)
        .filter(record => record.complete && record.players?.[playerId])
        .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
        .map(record => ({ fixtureId: record.fixture.id, date: record.fixture.date, value: playerHistoryValue(record.players[playerId], metric) }))
        .filter(row => row.value != null && Number.isFinite(Number(row.value)))
        .slice(0, Math.min(10, Math.max(1, Number(limit) || 5)))
        .map(row => ({ ...row, value: Number(row.value) }));
}

async function collectFinishedPlayerHistory(games, limit = 2) {
    const finished = (games || []).filter(game => ["FT", "AET", "PEN"].includes(game.fixture.status.short));
    let requested = 0;
    for (const game of finished) {
        if (requested >= limit) break;
        const existing = playerHistoryStore.fixtures[game.fixture.id];
        if (existing?.complete || existing?.retryAfter && new Date(existing.retryAfter) > new Date()) continue;
        requested++;
        try {
            const response = await football(`/fixtures/players?fixture=${game.fixture.id}`, 21_600_000);
            const players = normalizeFixturePlayers(response.response);
            const complete = Object.keys(players).length > 0;
            playerHistoryStore.fixtures[game.fixture.id] = {
                fixture: { id: game.fixture.id, date: game.fixture.date, league: game.league, teams: game.teams },
                players,
                complete,
                updatedAt: new Date().toISOString(),
                retryAfter: complete ? null : new Date(Date.now() + 21_600_000).toISOString(),
                attempts: (existing?.attempts || 0) + 1,
                source: "/fixtures/players"
            };
            savePlayerHistoryStore();
            console.log(`[PLAYER HISTORY] fixture=${game.fixture.id} complete=${complete} players=${Object.keys(players).length}`);
        } catch (erro) {
            console.error(`[PLAYER HISTORY] fixture=${game.fixture.id} error=${erro.message}`);
        }
    }
}

function normalizeStatistics(response) {
    return Object.fromEntries((response || []).map(team => [team.team.id, {
        team: team.team,
        values: Object.fromEntries((team.statistics || []).map(item => [item.type, item.value]))
    }]));
}

function subtractStatistics(total, firstHalf) {
    const result = {};
    for (const [teamId, team] of Object.entries(total || {})) {
        const first = firstHalf?.[teamId]?.values || {};
        const values = {};
        for (const [type, value] of Object.entries(team.values || {})) {
            if (typeof value === "number" && typeof first[type] === "number") values[type] = Math.max(0, value - first[type]);
        }
        result[teamId] = { team: team.team, values };
    }
    return result;
}

async function football(endpoint, ttl = 60_000, options = {}) {
    metrics.requests++;
    const cached = cache.get(endpoint);

    if (!options.force && cached && Date.now() - cached.createdAt < ttl) {
        metrics.cacheHits++;
        return cached.data;
    }

    if (pending.has(endpoint)) {
        metrics.cacheHits++;
        return pending.get(endpoint);
    }

    const request = (async () => {
        metrics.externalRequests++;
        const resposta = await fetch(`${API_BASE}${endpoint}`, {
            headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
            signal: AbortSignal.timeout(12_000)
        });

        const dados = await resposta.json();

        if (!resposta.ok || dados.errors?.length || Object.keys(dados.errors || {}).length) {
            throw new Error(dados.message || JSON.stringify(dados.errors) || "Erro na API-Football");
        }

        cache.set(endpoint, { data: dados, createdAt: Date.now() });
        return dados;
    })();

    pending.set(endpoint, request);
    try {
        return await request;
    } finally {
        pending.delete(endpoint);
    }
}

async function footballAllPages(endpoint, ttl) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const first = await football(`${endpoint}${separator}page=1`, ttl);
    const total = Math.max(1, Number(first.paging?.total) || 1);
    if (total === 1) return first;
    const remaining = await Promise.all(Array.from({ length: total - 1 }, (_, index) =>
        football(`${endpoint}${separator}page=${index + 2}`, ttl)
    ));
    return { ...first, results: (first.response?.length || 0) + remaining.reduce((sum, page) => sum + (page.response?.length || 0), 0), paging: { current: total, total }, response: [first, ...remaining].flatMap(page => page.response || []) };
}

function cornerFootball(endpoint, ttl) {
    const cached = cache.get(endpoint);
    if (cached && Date.now() - cached.createdAt < ttl) return football(endpoint, ttl);
    if (pending.has(endpoint)) return football(endpoint, ttl);
    const scheduled = cornerRequestQueue.then(async () => {
        const wait = Math.max(0, nextCornerRequestAt - Date.now());
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        nextCornerRequestAt = Date.now() + 650;
        return football(endpoint, ttl);
    });
    cornerRequestQueue = scheduled.catch(() => {});
    return scheduled;
}

function selectPlayerStatistics(response, { teamId, leagueId, season }) {
    const blocks = (response || []).flatMap(item => item.statistics || []);
    return blocks.find(stat => stat.league?.id === leagueId && stat.league?.season === season && stat.team?.id === teamId)
        || blocks.find(stat => stat.league?.id === leagueId && stat.league?.season === season)
        || blocks.find(stat => stat.league?.season === season && stat.team?.id === teamId)
        || null;
}

async function capturePeriodStatistics(game, phase) {
    const fixtureId = game.fixture.id;
    const record = periodStore.fixtures[fixtureId] || {
        fixture: {
            id: fixtureId,
            date: game.fixture.date,
            league: game.league,
            teams: game.teams
        }
    };
    if (record[phase]) return false;

    const data = await football(`/fixtures/statistics?fixture=${fixtureId}`, 10_000);
    if (!data.response?.length) return false;
    record[phase] = {
        capturedAt: new Date().toISOString(),
        elapsed: game.fixture.status.elapsed,
        statistics: normalizeStatistics(data.response)
    };
    if (phase === "fulltime" && record.halftime) {
        record.secondHalf = {
            capturedAt: record.fulltime.capturedAt,
            statistics: subtractStatistics(record.fulltime.statistics, record.halftime.statistics)
        };
    }
    periodStore.fixtures[fixtureId] = record;
    savePeriodStore();
    return true;
}

async function monitorMainLeagues() {
    if (monitorRunning || !process.env.API_FOOTBALL_KEY) return;
    monitorRunning = true;
    try {
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
        const schedule = await football(`/fixtures?date=${date}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 300_000);
        const games = (schedule.response || []).filter(game => MAIN_LEAGUES.has(game.league.id));
        const halftime = games.filter(game => ["HT", "INT"].includes(game.fixture.status.short));
        const finished = games.filter(game => ["FT", "AET", "PEN"].includes(game.fixture.status.short));
        for (const game of halftime) await capturePeriodStatistics(game, "halftime");
        for (const game of finished) {
            const record = periodStore.fixtures[game.fixture.id];
            if (record?.halftime && !record.fulltime) await capturePeriodStatistics(game, "fulltime");
        }
        await collectFinishedPlayerHistory(finished, 2);
    } catch (erro) {
        console.error("Monitor de períodos:", erro.message);
    } finally {
        monitorRunning = false;
    }
}

app.get("/vendor/exceljs/exceljs.min.js", (req, res) => {
    res.sendFile(path.join(__dirname, "node_modules", "exceljs", "dist", "exceljs.min.js"));
});
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
    const hitRate = metrics.requests ? Math.round((metrics.cacheHits / metrics.requests) * 100) : 0;
    res.json({
        online: true,
        requests: metrics.requests,
        externalRequests: metrics.externalRequests,
        cacheHits: metrics.cacheHits,
        cacheEntries: cache.size,
        periodFixtures: Object.keys(periodStore.fixtures).length,
        hitRate,
        uptime: Math.floor((Date.now() - metrics.startedAt) / 1000)
    });
});

app.get("/api/estatisticas-periodos", (req, res) => {
    const team = Number.parseInt(req.query.team, 10);
    const limit = req.query.limit === "10" ? 10 : 5;
    if (!Number.isInteger(team)) return res.status(400).json({ erro: "Time inválido." });
    const rows = Object.values(periodStore.fixtures)
        .filter(record => record.secondHalf && (record.fixture.teams.home.id === team || record.fixture.teams.away.id === team))
        .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
        .slice(0, limit)
        .map(record => ({
            fixture: record.fixture,
            halftime: record.halftime.statistics[team]?.values || {},
            secondHalf: record.secondHalf.statistics[team]?.values || {},
            fulltime: record.fulltime.statistics[team]?.values || {}
        }));
    res.json({ team, requested: limit, coverage: rows.length, response: rows });
});

app.get("/api/explorer", async (req, res) => {
    const allowed = new Set(["fixtures", "teams", "standings", "players", "leagues"]);
    const endpoint = String(req.query.endpoint || "fixtures").toLowerCase();
    if (!allowed.has(endpoint)) return res.status(400).json({ erro: "Endpoint não permitido." });

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
        if (key !== "endpoint" && value !== "" && value != null) params.set(key, String(value));
    }

    try {
        const startedAt = Date.now();
        const cacheKey = `/${endpoint}?${params.toString()}`;
        const wasCached = Boolean(cache.get(cacheKey) && Date.now() - cache.get(cacheKey).createdAt < 60_000);
        const dados = await football(cacheKey, 60_000);
        res.json({ endpoint: `/${endpoint}`, parameters: Object.fromEntries(params), cached: wasCached, responseTime: Date.now() - startedAt, data: dados });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível executar o endpoint.", detalhe: erro.message });
    }
});

app.get("/api/jogos", async (req, res) => {
    try {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
            ? req.query.date
            : new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());

        // Placar e status ao vivo precisam de cache curto. Cinco minutos fazia
        // jogos iniciados demorarem demais para aparecer como "ao vivo".
        res.json(await football(`/fixtures?date=${date}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 30_000));

    } catch (erro) {
        console.error(erro);
        res.status(502).json({ erro: "Não foi possível buscar os jogos.", detalhe: erro.message });
    }
});

app.get("/api/times/busca", async (req, res) => {
    const search = String(req.query.q || "").trim();
    if (search.length < 3 || search.length > 60) {
        return res.status(400).json({ erro: "Digite pelo menos 3 caracteres para buscar um time." });
    }
    try {
        const dados = await football(`/teams?search=${encodeURIComponent(search)}`, 3_600_000);
        res.json({ query: search, response: (dados.response || []).slice(0, 30) });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível buscar os times.", detalhe: erro.message });
    }
});

app.get("/api/times/favoritos", async (req, res) => {
    const ids = [...new Set(String(req.query.ids || "").split(",")
        .map(value => Number.parseInt(value, 10)).filter(Number.isInteger))].slice(0, 12);
    if (!ids.length) return res.json({ response: [] });
    try {
        const settled = await Promise.allSettled(ids.map(async id => {
            const [details, upcoming] = await Promise.all([
                football(`/teams?id=${id}`, 21_600_000),
                football(`/fixtures?team=${id}&next=3&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000)
            ]);
            const item = details.response?.[0];
            return item ? { ...item, upcoming: upcoming.response || [] } : null;
        }));
        res.json({ response: settled.filter(x => x.status === "fulfilled" && x.value).map(x => x.value) });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível carregar seus times.", detalhe: erro.message });
    }
});

app.get("/api/times/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: "ID do time inválido." });
    try {
        const [details, recent, upcoming] = await Promise.all([
            football(`/teams?id=${id}`, 21_600_000),
            football(`/fixtures?team=${id}&last=10&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
            football(`/fixtures?team=${id}&next=10&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000)
        ]);
        const item = details.response?.[0];
        if (!item) return res.status(404).json({ erro: "Time não encontrado." });

        const seasons = [...new Set((recent.response || []).map(game => game.league.season).filter(Number.isInteger))];
        const season = seasons[0] || new Date().getFullYear();
        let squad = [];
        try {
            const squadData = await football(`/players/squads?team=${id}`, 21_600_000);
            squad = squadData.response?.[0]?.players || [];
        } catch (erro) {
            console.warn(`Elenco do time ${id}:`, erro.message);
        }
        res.json({ ...item, season, recent: recent.response || [], upcoming: upcoming.response || [], squad });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível carregar o time.", detalhe: erro.message });
    }
});

app.get("/api/jogadores/busca", async (req, res) => {
    const search = String(req.query.q || "").trim();
    if (search.length < 3 || search.length > 60) {
        return res.status(400).json({ erro: "Digite pelo menos 3 caracteres para buscar um jogador." });
    }
    try {
        const dados = await football(`/players/profiles?search=${encodeURIComponent(search)}`, 3_600_000);
        res.json({ query: search, response: (dados.response || []).slice(0, 30) });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível buscar os jogadores.", detalhe: erro.message });
    }
});

app.get("/api/jogadores/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const season = Number.parseInt(req.query.season, 10) || new Date().getFullYear();
    if (!Number.isInteger(id) || season < 2000 || season > 2100) {
        return res.status(400).json({ erro: "Jogador ou temporada inválida." });
    }
    try {
        const [profileResult, statsResult, transfersResult] = await Promise.allSettled([
            football(`/players/profiles?player=${id}`, 21_600_000),
            football(`/players?id=${id}&season=${season}`, 3_600_000),
            football(`/transfers?player=${id}`, 21_600_000)
        ]);
        const profile = profileResult.status === "fulfilled" ? profileResult.value.response?.[0]?.player : null;
        const seasonal = statsResult.status === "fulfilled" ? statsResult.value.response?.[0] : null;
        const player = seasonal?.player || profile;
        if (!player) return res.status(404).json({ erro: "Jogador não encontrado." });
        res.json({
            player,
            season,
            statistics: seasonal?.statistics || [],
            transfers: transfersResult.status === "fulfilled" ? transfersResult.value.response?.[0]?.transfers || [] : []
        });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível carregar o jogador.", detalhe: erro.message });
    }
});

app.get("/api/partidas/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: "ID da partida inválido." });

    try {
        const [fixture, statistics, events, lineups] = await Promise.all([
            football(`/fixtures?id=${id}`, 30_000),
            football(`/fixtures/statistics?fixture=${id}`, 30_000),
            football(`/fixtures/events?fixture=${id}`, 30_000),
            football(`/fixtures/lineups?fixture=${id}`, 30_000)
        ]);

        res.json({
            fixture: fixture.response?.[0] || null,
            statistics: statistics.response || [],
            events: events.response || [],
            lineups: lineups.response || []
        });
    } catch (erro) {
        console.error(erro);
        res.status(502).json({ erro: "Não foi possível buscar os detalhes da partida.", detalhe: erro.message });
    }
});

app.get("/api/partidas/:id/jogadores", async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ status: "error", erro: "ID da partida inválido." });
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ status: "error", erro: "ID da partida inválido." });
    try {
        const fixtureData = await football(`/fixtures?id=${id}`, 30_000);
        const fixture = fixtureData.response?.[0];
        if (!fixture || fixture.fixture?.id !== id) return res.status(404).json({ status: "error", erro: "Partida não encontrada." });

        const endpoint = `/fixtures/lineups?fixture=${id}`;
        const now = Date.now();
        const hoursUntilKickoff = (new Date(fixture.fixture.date).getTime() - now) / 3_600_000;
        const played = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "FT", "AET", "PEN"].includes(fixture.fixture.status.short);
        const existing = cache.get(endpoint);
        const hasOfficial = Boolean(existing?.data?.response?.length);
        let ttl = hoursUntilKickoff > 24 ? 21_600_000 : hoursUntilKickoff > 1 ? 3_600_000 : hoursUntilKickoff > 0.25 ? 300_000 : 60_000;
        if (played && hasOfficial) ttl = 21_600_000;

        const refreshRequested = req.query.refresh === "1";
        const lastRefresh = lineupRefreshes.get(id) || 0;
        const force = refreshRequested && now - lastRefresh >= 20_000;
        if (force) lineupRefreshes.set(id, now);
        const cacheHit = !force && Boolean(existing && now - existing.createdAt < ttl);
        console.log(`[LINEUP] fixture=${id} endpoint=${endpoint} cache=${cacheHit ? "HIT" : "MISS"} ttl=${ttl}`);

        const official = await football(endpoint, ttl, { force });
        const lineups = Array.isArray(official.response) ? official.response : [];
        const updatedAt = cache.get(endpoint)?.createdAt || now;
        let status = lineups.length ? "available" : "not_released";
        let probableTeams = [];
        let playerStatsTeams = [];
        let playerStatsDiagnostics = [];
        let additionalStatsCalls = 0;
        if (!lineups.length) {
            const teamList = [fixture.teams.home, fixture.teams.away];
            probableTeams = await Promise.all(teamList.map(async team => {
                const [squadResult, statsResult, recentResult] = await Promise.all([
                    football(`/players/squads?team=${team.id}`, 21_600_000).catch(() => ({ response: [] })),
                    footballAllPages(`/players?team=${team.id}&season=${fixture.league.season}`, 3_600_000).catch(() => ({ response: [] })),
                    football(`/fixtures?team=${team.id}&last=5&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000).catch(() => ({ response: [] }))
                ]);
                const squad = squadResult.response?.[0]?.players || [];
                const currentIds = new Set(squad.map(player => player.id));
                const statsById = new Map((statsResult.response || []).map(item => [item.player.id, selectPlayerStatistics([item], { teamId: team.id, leagueId: fixture.league.id, season: fixture.league.season })]));
                const recentFixtures = (recentResult.response || []).filter(game => game.fixture?.id !== id).slice(0, 3);
                const recentLineups = await Promise.all(recentFixtures.map(game => football(`/fixtures/lineups?fixture=${game.fixture.id}`, 21_600_000).catch(() => ({ response: [] }))));
                const usage = new Map();
                let recentFormation = null;
                recentLineups.forEach((result, matchIndex) => {
                    const lineup = (result.response || []).find(item => item.team?.id === team.id);
                    if (!recentFormation && lineup?.formation) recentFormation = lineup.formation;
                    const weight = 3 - matchIndex;
                    (lineup?.startXI || []).forEach(item => usage.set(item.player.id, (usage.get(item.player.id) || 0) + weight * 10));
                    (lineup?.substitutes || []).forEach(item => usage.set(item.player.id, (usage.get(item.player.id) || 0) + weight));
                });
                const players = squad.map(player => ({ player, statistics: statsById.get(player.id) || null, recentScore: usage.get(player.id) || 0 }));
                console.log(`[LINEUP] ${team.name} probablePool=${players.length} recentMatches=${recentFixtures.length}`);
                return { team, recentFormation, players: players.filter(item => currentIds.has(item.player.id)) };
            }));
            if (probableTeams.every(team => team.players.length >= 11)) status = "probable";
            playerStatsTeams = probableTeams;
        } else {
            playerStatsTeams = await Promise.all([fixture.teams.home, fixture.teams.away].map(async team => {
                const [squadResult, statsResult] = await Promise.all([
                    football(`/players/squads?team=${team.id}`, 21_600_000).catch(() => ({ response: [] })),
                    footballAllPages(`/players?team=${team.id}&season=${fixture.league.season}`, 3_600_000).catch(() => ({ response: [] }))
                ]);
                const squad = squadResult.response?.[0]?.players || [];
                const statsById = new Map((statsResult.response || []).map(item => [item.player.id, selectPlayerStatistics([item], { teamId: team.id, leagueId: fixture.league.id, season: fixture.league.season })]));
                return { team, players: squad.map(player => ({ player, statistics: statsById.get(player.id) || null })) };
            }));
        }
        if (lineups.length) {
            const official = lineups.flatMap(lineup => [
                ...(lineup.startXI || []).map(item => ({ team: lineup.team, player: item.player })),
                ...(lineup.substitutes || []).map(item => ({ team: lineup.team, player: item.player }))
            ]);
            const statsIndex = new Map(playerStatsTeams.flatMap(team => team.players.filter(item => item.statistics).map(item => [`${team.team.id}:${item.player.id}`, item.statistics])));
            const missing = official.filter(item => !statsIndex.has(`${item.team.id}:${item.player.id}`));
            additionalStatsCalls = missing.length;
            playerStatsDiagnostics = await Promise.all(missing.map(async item => {
                const endpoint = `/players?id=${item.player.id}&season=${fixture.league.season}`;
                const result = await football(endpoint, 21_600_000).catch(() => ({ response: [] }));
                const blocks = (result.response || []).flatMap(row => row.statistics || []);
                const selected = selectPlayerStatistics(result.response, { teamId: item.team.id, leagueId: fixture.league.id, season: fixture.league.season });
                const targetTeam = playerStatsTeams.find(team => team.team.id === item.team.id);
                let targetPlayer = targetTeam?.players.find(row => row.player.id === item.player.id);
                if (!targetPlayer && targetTeam) {
                    targetPlayer = { player: item.player, statistics: null };
                    targetTeam.players.push(targetPlayer);
                }
                if (targetPlayer && selected) targetPlayer.statistics = selected;
                const summary = blocks.map(stat => ({ teamId: stat.team?.id, leagueId: stat.league?.id, season: stat.league?.season, games: stat.games?.appearences, minutes: stat.games?.minutes, rating: stat.games?.rating }));
                console.log(`[PLAYER STATS MISS] ${item.player.name} id=${item.player.id} team=${item.team.id} league=${fixture.league.id} season=${fixture.league.season} endpoint=${endpoint} results=${result.response?.length || 0} blocks=${JSON.stringify(summary)}`);
                return { playerId: item.player.id, playerName: item.player.name, teamId: item.team.id, leagueId: fixture.league.id, season: fixture.league.season, endpoint, results: result.response?.length || 0, selectedTeamId: selected?.team?.id || null, statistics: summary };
            }));
        }
        const fixtureStatus = fixture.fixture.status.short;
        const matchHasStarted = !["NS", "TBD", "PST", "CANC"].includes(fixtureStatus);
        const fixturePlayerTtl = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(fixtureStatus) ? 30_000
            : ["FT", "AET", "PEN"].includes(fixtureStatus) ? 21_600_000
            : 60_000;
        const matchPlayers = matchHasStarted
            ? await football(`/fixtures/players?fixture=${id}`, fixturePlayerTtl, { force }).catch(() => ({ response: [] }))
            : { response: [] };
        const tablePlayers = lineups.length
            ? lineups.reduce((total, lineup) => total + (lineup.startXI?.length || 0) + (lineup.substitutes?.length || 0), 0)
            : playerStatsTeams.reduce((total, team) => total + team.players.length, 0);
        console.log(`[PLAYER TABLE] source=${lineups.length ? "official" : "probable"} fixture=${id} players=${tablePlayers}`);
        console.log(`[LINEUP] fixture=${id} status=${status}`);
        for (const lineup of lineups) {
            console.log(`[LINEUP] ${lineup.team?.name || lineup.team?.id} startXI=${lineup.startXI?.length || 0} substitutes=${lineup.substitutes?.length || 0} formation=${lineup.formation || "n/a"}`);
        }
        res.json({ fixture, fixtureId: id, status, lineups, probableTeams, playerStatsTeams, matchPlayerStats: matchPlayers.response || [], playerStatsDiagnostics, additionalStatsCalls, updatedAt, cached: cacheHit, refreshAllowedIn: force || !refreshRequested ? 0 : Math.ceil((20_000 - (now - lastRefresh)) / 1000) });
    } catch (erro) {
        console.error(`[LINEUP] fixture=${id} status=error message=${erro.message}`);
        res.status(502).json({ fixtureId: id, status: "error", erro: "Não foi possível atualizar a escalação." });
    }
});

app.get("/api/partidas/:id/analise", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: "ID da partida inválido." });
    const sample = req.query.sample === "10" ? 10 : 5;
    const venue = ["home-away", "home", "away"].includes(req.query.venue) ? req.query.venue : "home-away";
    const scope = req.query.scope === "league" ? "league" : "all";

    try {
        const scannerMode = req.query.mode === "scanner";
        const scannerHomeId = Number.parseInt(req.query.home, 10);
        const scannerAwayId = Number.parseInt(req.query.away, 10);
        const scannerLeagueId = Number.parseInt(req.query.league, 10);
        const scannerSeason = Number.parseInt(req.query.season, 10);
        const canUseScannerPayload = scannerMode
            && Number.isInteger(scannerHomeId)
            && Number.isInteger(scannerAwayId)
            && Number.isInteger(scannerLeagueId)
            && Number.isInteger(scannerSeason);

        let fixture;
        if (canUseScannerPayload) {
            fixture = {
                fixture: { id },
                teams: { home: { id: scannerHomeId }, away: { id: scannerAwayId } },
                league: { id: scannerLeagueId, season: scannerSeason }
            };
        } else {
            const base = await football(`/fixtures?id=${id}`, 30_000);
            fixture = base.response?.[0];
            if (!fixture) return res.status(404).json({ erro: "Partida não encontrada." });
        }

        const { home, away } = fixture.teams;
        const { id: leagueId, season } = fixture.league;
        const historySize = venue === "home-away" && scope === "all" ? sample : Math.min(30, sample * 3);
        const requests = scannerMode
            ? [
                Promise.resolve({ response: [] }),
                football(`/fixtures?team=${home.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
                football(`/fixtures?team=${away.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
                Promise.resolve({ response: [] }),
                Promise.resolve({ response: null }),
                Promise.resolve({ response: null })
            ]
            : [
                football(`/fixtures/headtohead?h2h=${home.id}-${away.id}&last=10`, 3_600_000),
                football(`/fixtures?team=${home.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
                football(`/fixtures?team=${away.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
                football(`/standings?league=${leagueId}&season=${season}`, 3_600_000),
                football(`/teams/statistics?league=${leagueId}&season=${season}&team=${home.id}`, 21_600_000),
                football(`/teams/statistics?league=${leagueId}&season=${season}&team=${away.id}`, 21_600_000)
            ];
        const result = await Promise.allSettled(requests);
        const response = result.map(item => item.status === "fulfilled" ? item.value.response ?? [] : []);
        const selectHistory = (games, team, side) => games
            .filter(game => game.fixture.id !== id)
            .filter(game => scope === "all" || game.league.id === leagueId)
            .filter(game => {
                if (venue === "home-away") return true;
                const isHome = game.teams.home.id === team.id;
                return side === "home" ? isHome : !isHome;
            })
            .slice(0, sample);
        const homeSide = venue === "away" ? "away" : "home";
        const awaySide = venue === "home" ? "home" : "away";
        const homeRecent = selectHistory(response[1], home, homeSide);
        const awayRecent = selectHistory(response[2], away, awaySide);

        res.json({
            fixture,
            h2h: response[0],
            homeRecent,
            awayRecent,
            standings: response[3],
            homeTeamStats: response[4] || null,
            awayTeamStats: response[5] || null,
            filters: { sample, venue, scope, mode: scannerMode ? "scanner" : "full" },
            coverage: { home: homeRecent.length, away: awayRecent.length }
        });
    } catch (erro) {
        console.error(erro);
        res.status(502).json({ erro: "Não foi possível gerar a análise da partida.", detalhe: erro.message });
    }
});

app.get("/api/partidas/:id/estatisticas-avancadas", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: "ID da partida inválido." });
    const sample = req.query.sample === "10" ? 10 : 5;
    const venue = req.query.venue === "home" ? "home" : "home-away";
    const scope = req.query.scope === "league" ? "league" : "all";

    try {
        const base = await football(`/fixtures?id=${id}`, 30_000);
        const fixture = base.response?.[0];
        if (!fixture) return res.status(404).json({ erro: "Partida não encontrada." });

        const teams = [fixture.teams.home, fixture.teams.away];
        const historySize = venue === "home-away" && scope === "all" ? sample + 1 : Math.min(30, sample * 3);
        const recent = await Promise.all(teams.map(team => football(
            `/fixtures?team=${team.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`,
            900_000
        )));

        const build = async (team, fixtures) => {
            const settled = await Promise.allSettled((fixtures.response || []).map(game =>
                football(`/fixtures/statistics?fixture=${game.fixture.id}`, 21_600_000)
            ));
            return settled.map((item, index) => ({
                fixture: fixtures.response[index],
                statistics: item.status === "fulfilled"
                    ? item.value.response?.find(row => row.team.id === team.id)?.statistics || []
                    : [],
                opponentStatistics: item.status === "fulfilled"
                    ? item.value.response?.find(row => row.team.id !== team.id)?.statistics || []
                    : []
            }));
        };

        const select = (games, team, side) => ({ response: (games.response || [])
            .filter(game => game.fixture.id !== id)
            .filter(game => scope === "all" || game.league.id === fixture.league.id)
            .filter(game => venue === "home-away" || (side === "home" ? game.teams.home.id === team.id : game.teams.away.id === team.id))
            .slice(0, sample) });
        const [home, away] = await Promise.all([
            build(teams[0], select(recent[0], teams[0], "home")),
            build(teams[1], select(recent[1], teams[1], "away"))
        ]);
        res.json({ sample, venue, scope, home, away, coverage: { home: home.length, away: away.length } });
    } catch (erro) {
        console.error(erro);
        res.status(502).json({ erro: "Estatísticas avançadas indisponíveis.", detalhe: erro.message });
    }
});

app.get("/api/partidas/:id/escanteios", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const homeId = Number.parseInt(req.query.home, 10);
    const awayId = Number.parseInt(req.query.away, 10);
    if (![id, homeId, awayId].every(Number.isInteger)) return res.status(400).json({ erro: "Partida ou times invÃ¡lidos." });
    const sample = 5;
    const historyLimit = 15;
    try {
        const startedAt = Date.now();
        const [homeHistory, awayHistory] = await Promise.all([
            cornerFootball(`/fixtures?team=${homeId}&last=${historyLimit}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
            cornerFootball(`/fixtures?team=${awayId}&last=${historyLimit}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000)
        ]);
        const finished = game => game.fixture?.id !== id && ["FT", "AET", "PEN"].includes(game.fixture?.status?.short);
        const homeGames = (homeHistory.response || []).filter(finished);
        const awayGames = (awayHistory.response || []).filter(finished);
        let changed = false;
        const collect = async (games, teamId) => {
            const rows = [];
            let inspected = 0;
            let statisticsRequests = 0;
            let persistentHits = 0;
            let errors = 0;
            for (const game of games) {
                if (rows.length >= sample) break;
                inspected++;
                const existing = cornerHistoryStore.fixtures[game.fixture.id];
                const reusable = existing?.complete || existing?.retryAfter && new Date(existing.retryAfter) > new Date();
                if (reusable) persistentHits++;
                else statisticsRequests++;
                const before = cornerHistoryStore.fixtures[game.fixture.id]?.updatedAt;
                const record = await cornerRecord(game);
                if (record?.updatedAt !== before) changed = true;
                if (record?.errorType) errors++;
                if (!record?.complete) continue;
                const own = record.teams.find(team => team.teamId === teamId)?.corners;
                const opponent = record.teams.find(team => team.teamId !== teamId)?.corners;
                if (own == null || opponent == null) continue;
                rows.push({ fixtureId: game.fixture.id, date: game.fixture.date, own, opponent, total: own + opponent });
            }
            return { rows, inspected, statisticsRequests, persistentHits, errors };
        };
        const [homeResult, awayResult] = await Promise.all([
            collect(homeGames, homeId),
            collect(awayGames, awayId)
        ]);
        if (changed) saveCornerHistoryStore();
        const home = homeResult.rows;
        const away = awayResult.rows;
        const coverage = { home: home.length, away: away.length };
        const hasErrors = homeResult.errors + awayResult.errors > 0;
        const status = home.length === sample && away.length === sample ? "available"
            : home.length || away.length ? "small-sample"
            : hasErrors ? "error" : "insufficient";
        const diagnostics = {
            historyLimit,
            inspected: { home: homeResult.inspected, away: awayResult.inspected },
            statisticsRequests: homeResult.statisticsRequests + awayResult.statisticsRequests,
            persistentHits: homeResult.persistentHits + awayResult.persistentHits,
            errors: homeResult.errors + awayResult.errors,
            elapsedMs: Date.now() - startedAt
        };
        console.log(`[CORNERS] fixture=${id} status=${status} coverage=${home.length}/${away.length} inspected=${homeResult.inspected}/${awayResult.inspected} statsRequests=${diagnostics.statisticsRequests} cacheHits=${diagnostics.persistentHits} errors=${diagnostics.errors} elapsedMs=${diagnostics.elapsedMs}`);
        res.json({
            sample,
            status,
            home,
            away,
            coverage,
            diagnostics,
            source: "persistent-fixture-statistics-cache"
        });
    } catch (erro) {
        console.error("HistÃ³rico de escanteios:", erro.message);
        res.status(502).json({ erro: "HistÃ³rico de escanteios indisponÃ­vel.", detalhe: erro.message });
    }
});

app.get("/api/historico-jogadores/recentes", (req, res) => {
    const metric = String(req.query.metric || "shots.on");
    const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 5));
    const playerIds = String(req.query.players || "").split(",").map(Number).filter(Number.isSafeInteger).slice(0, 150);
    if (!PLAYER_HISTORY_METRICS.has(metric)) return res.status(400).json({ erro: "Métrica de jogador inválida." });
    res.json({
        metric,
        limit,
        players: Object.fromEntries(playerIds.map(playerId => [playerId, getPlayerRecentStats(playerId, metric, limit)])),
        cachedFixtures: Object.keys(playerHistoryStore.fixtures).length,
        source: "persistent-cache"
    });
});

app.get("/api/historico-jogadores/piloto", async (req, res) => {
    const fixtureId = Number(req.query.fixture);
    if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) return res.status(400).json({ erro: "Partida piloto inválida." });
    const externalStart = metrics.externalRequests;
    const cacheStart = metrics.cacheHits;
    let persistentHits = 0;
    let stoppedByLimit = false;
    const budgetedFootball = async (endpoint, ttl) => {
        if (metrics.externalRequests - externalStart >= 10) {
            stoppedByLimit = true;
            return null;
        }
        return football(endpoint, ttl);
    };
    try {
        const currentData = await budgetedFootball(`/fixtures?id=${fixtureId}`, 30_000);
        const current = currentData?.response?.[0];
        if (!current) return res.status(404).json({ erro: "Partida piloto não encontrada." });
        const historyByTeam = [];
        for (const team of [current.teams.home, current.teams.away]) {
            const history = await budgetedFootball(`/fixtures?team=${team.id}&last=5&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000);
            if (!history) break;
            historyByTeam.push(...(history.response || []));
        }
        const candidates = [...new Map(historyByTeam
            .filter(game => game.fixture.id !== fixtureId)
            .filter(game => ["FT", "AET", "PEN"].includes(game.fixture.status.short))
            .map(game => [game.fixture.id, game])).values()]
            .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));
        const stored = [];
        for (const game of candidates) {
            const existing = playerHistoryStore.fixtures[game.fixture.id];
            if (existing?.complete || existing?.retryAfter && new Date(existing.retryAfter) > new Date()) {
                persistentHits++;
                if (existing.complete) stored.push(game.fixture.id);
                continue;
            }
            const response = await budgetedFootball(`/fixtures/players?fixture=${game.fixture.id}`, 21_600_000);
            if (!response) break;
            const players = normalizeFixturePlayers(response.response);
            if (!Object.keys(players).length) {
                playerHistoryStore.fixtures[game.fixture.id] = {
                    fixture: { id: game.fixture.id, date: game.fixture.date, league: game.league, teams: game.teams },
                    players: {},
                    complete: false,
                    updatedAt: new Date().toISOString(),
                    retryAfter: new Date(Date.now() + 21_600_000).toISOString(),
                    source: "/fixtures/players"
                };
                savePlayerHistoryStore();
                continue;
            }
            playerHistoryStore.fixtures[game.fixture.id] = {
                fixture: { id: game.fixture.id, date: game.fixture.date, league: game.league, teams: game.teams },
                players,
                complete: true,
                updatedAt: new Date().toISOString(),
                source: "/fixtures/players"
            };
            stored.push(game.fixture.id);
            savePlayerHistoryStore();
        }
        const relevantTeamIds = new Set([current.teams.home.id, current.teams.away.id]);
        savePlayerHistoryStore();
        const playerIds = new Set(Object.values(playerHistoryStore.fixtures).flatMap(record => Object.values(record.players || {})).filter(player => relevantTeamIds.has(player.teamId)).map(player => player.playerId));
        const coverage = [...playerIds].map(playerId => ({ playerId, games: getPlayerRecentStats(playerId, "shots.on", 5).length }));
        res.json({
            fixtureId,
            endpoint: "/fixtures/players?fixture={fixtureId}",
            candidates: candidates.length,
            storedFixtures: stored,
            externalRequests: metrics.externalRequests - externalStart,
            memoryCacheHits: metrics.cacheHits - cacheStart,
            persistentCacheHits: persistentHits,
            stoppedByLimit,
            maxExternalRequests: 10,
            coverage: {
                players: coverage.filter(row => row.games > 0).length,
                atLeast3: coverage.filter(row => row.games >= 3).length,
                atLeast5: coverage.filter(row => row.games >= 5).length
            }
        });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível construir o piloto de histórico.", detalhe: erro.message, externalRequests: metrics.externalRequests - externalStart, maxExternalRequests: 10 });
    }
});

app.get("/api/ligas", async (req, res) => {
    try {
        const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
            ? req.query.date
            : new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
        const dados = await football(`/fixtures?date=${date}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 300_000);
        const ligas = [...new Map((dados.response || []).map(item => [item.league.id, item.league])).values()];
        res.json({ response: ligas });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível buscar as ligas.", detalhe: erro.message });
    }
});

app.get("/api/ligas/:id/classificacao", async (req, res) => {
    const league = Number.parseInt(req.params.id, 10);
    const season = Number.parseInt(req.query.season, 10);
    if (!Number.isInteger(league) || !Number.isInteger(season)) return res.status(400).json({ erro: "Liga ou temporada inválida." });
    try {
        const dados = await football(`/standings?league=${league}&season=${season}`, 3_600_000);
        res.json(dados);
    } catch (erro) {
        res.status(502).json({ erro: "Classificação indisponível para esta liga.", detalhe: erro.message });
    }
});

app.get("/api/ligas/:id/artilheiros", async (req, res) => {
    const league = Number.parseInt(req.params.id, 10);
    const season = Number.parseInt(req.query.season, 10);
    if (!Number.isInteger(league) || !Number.isInteger(season)) return res.status(400).json({ erro: "Liga ou temporada inválida." });
    try {
        const dados = await football(`/players/topscorers?league=${league}&season=${season}`, 3_600_000);
        res.json(dados);
    } catch (erro) {
        res.status(502).json({ erro: "Artilheiros indisponíveis para esta liga.", detalhe: erro.message });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor iniciado na porta ${PORT}`);
    monitorMainLeagues();
    setInterval(monitorMainLeagues, 300_000).unref();
});
