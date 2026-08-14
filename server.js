require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://v3.football.api-sports.io";
const APP_TIMEZONE = "America/Sao_Paulo";
const MAIN_LEAGUES = new Set([2, 3, 11, 13, 39, 61, 71, 73, 78, 135, 140, 848]);
const SNAPSHOT_FILE = path.join(__dirname, "data", "period-stats.json");
const cache = new Map();
const pending = new Map();
const metrics = { requests: 0, externalRequests: 0, cacheHits: 0, startedAt: Date.now() };
let periodStore = { version: 1, fixtures: {} };
let monitorRunning = false;

try {
    periodStore = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8"));
} catch (erro) {
    if (erro.code !== "ENOENT") console.error("Não foi possível ler os snapshots:", erro.message);
}

function savePeriodStore() {
    fs.mkdirSync(path.dirname(SNAPSHOT_FILE), { recursive: true });
    const temporary = `${SNAPSHOT_FILE}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(periodStore, null, 2));
    fs.renameSync(temporary, SNAPSHOT_FILE);
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

async function football(endpoint, ttl = 60_000) {
    metrics.requests++;
    const cached = cache.get(endpoint);

    if (cached && Date.now() - cached.createdAt < ttl) {
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
    } catch (erro) {
        console.error("Monitor de períodos:", erro.message);
    } finally {
        monitorRunning = false;
    }
}

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

        res.json(await football(`/fixtures?date=${date}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 300_000));

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
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: "ID da partida inválido." });
    try {
        const fixtureData = await football(`/fixtures?id=${id}`, 30_000);
        const fixture = fixtureData.response?.[0];
        if (!fixture) return res.status(404).json({ erro: "Partida não encontrada." });
        const [official, injuries] = await Promise.all([
            football(`/fixtures/lineups?fixture=${id}`, 30_000).catch(() => ({ response: [] })),
            football(`/injuries?fixture=${id}`, 300_000).catch(() => ({ response: [] }))
        ]);
        const teamIds = [fixture.teams.home.id, fixture.teams.away.id];
        const playerData = await Promise.all(teamIds.map(async teamId => {
            const squadData = await football(`/players/squads?team=${teamId}`, 300_000).catch(() => ({ response: [] }));
            const currentSquad = squadData.response?.[0]?.players || [];
            let data = await football(`/players?team=${teamId}&season=${fixture.league.season}`, 3_600_000).catch(() => ({ response: [] }));
            if (!data.response?.length) {
                data = await football(`/players?team=${teamId}&season=${fixture.league.season - 1}`, 3_600_000).catch(() => ({ response: [] }));
            }
            if (currentSquad.length) {
                const statisticsByPlayer = new Map((data.response || []).map(item => [item.player.id, item]));
                data = { response: currentSquad.map(player => {
                    const historical = statisticsByPlayer.get(player.id);
                    return historical ? { ...historical, player: { ...historical.player, ...player } } : { player, statistics: [] };
                }) };
            }
            return data;
        }));
        const teams = teamIds.map((teamId, index) => ({
            team: index ? fixture.teams.away : fixture.teams.home,
            players: (playerData[index].response || []).map(item => ({
                player: item.player,
                statistics: item.statistics?.find(stat => stat.league?.id === fixture.league.id) || item.statistics?.[0] || null
            }))
        }));
        res.json({ fixture, confirmed: official.response || [], injuries: injuries.response || [], teams });
    } catch (erro) {
        res.status(502).json({ erro: "Não foi possível carregar os jogadores.", detalhe: erro.message });
    }
});

app.get("/api/partidas/:id/analise", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: "ID da partida inválido." });
    const sample = req.query.sample === "10" ? 10 : 5;
    const venue = ["home-away", "home", "away"].includes(req.query.venue) ? req.query.venue : "home-away";
    const scope = req.query.scope === "league" ? "league" : "all";

    try {
        const base = await football(`/fixtures?id=${id}`, 30_000);
        const fixture = base.response?.[0];
        if (!fixture) return res.status(404).json({ erro: "Partida não encontrada." });

        const { home, away } = fixture.teams;
        const { id: leagueId, season } = fixture.league;
        const historySize = venue === "home-away" && scope === "all" ? sample : Math.min(30, sample * 3);
        const result = await Promise.allSettled([
            football(`/fixtures/headtohead?h2h=${home.id}-${away.id}&last=10`, 3_600_000),
            football(`/fixtures?team=${home.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
            football(`/fixtures?team=${away.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
            football(`/standings?league=${leagueId}&season=${season}`, 3_600_000),
            football(`/teams/statistics?league=${leagueId}&season=${season}&team=${home.id}`, 21_600_000),
            football(`/teams/statistics?league=${leagueId}&season=${season}&team=${away.id}`, 21_600_000)
        ]);
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
            filters: { sample, venue, scope },
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
        const historySize = venue === "home-away" && scope === "all" ? sample : Math.min(30, sample * 3);
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
    console.log(`Servidor rodando em http://localhost:${PORT}`);
    monitorMainLeagues();
    setInterval(monitorMainLeagues, 300_000).unref();
});
