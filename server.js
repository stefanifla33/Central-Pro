require("dotenv").config();

const express = require("express");
const path = require("path");
const fs = require("fs");
const { createConfiguredGameSnapshotStorage } = require("./lib/storage/create-game-snapshot-storage");
const { resolveGames } = require("./lib/storage/game-snapshot-storage");
const { assertExternalRequestsAllowed, isCentralProOffline } = require("./lib/central-pro-offline");
const { createPlayerRateLimiter } = require("./lib/player-rate-limiter");
const { createSerializedJsonPersister } = require("./lib/serialized-json-persister");
const { CP_MAIN_LEAGUES: MAIN_LEAGUES, cpIsScannerEligibleLeagueId } = require("./public/competition-config");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://v3.football.api-sports.io";
const APP_TIMEZONE = "America/Sao_Paulo";
const SNAPSHOT_FILE = path.join(__dirname, "data", "period-stats.json");
const PLAYER_HISTORY_FILE = path.join(__dirname, "data", "player-history.json");
const CORNER_HISTORY_FILE = path.join(__dirname, "data", "corner-history.json");
const IS_SERVERLESS = process.env.VERCEL === "1" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
const cache = new Map();
const pending = new Map();
const lineupRefreshes = new Map();
const lineupRevalidations = new Map();
const metrics = { requests: 0, externalRequests: 0, cacheHits: 0, startedAt: Date.now() };
// API-USAGE-DIAGNOSTIC: instrumentação temporária; remover após a auditoria de cota.
const apiUsageDiagnostic = { externalTotal: 0, cacheHits: 0, pendingHits: 0, byEndpoint: new Map() };
const apiQuotaState = { remaining: null, limit: null, blockedUntil: 0, reason: null };
const API_DAILY_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const API_MINUTE_COOLDOWN_MS = 60_000;
const playerRateLimiter = createPlayerRateLimiter({ limit: 240, windowMs: 60_000 });
let periodStore = { version: 1, fixtures: {} };
let playerHistoryStore = { version: 1, fixtures: {} };
let cornerHistoryStore = { version: 1, fixtures: {} };
const gameSnapshotStorage = createConfiguredGameSnapshotStorage();
const playerHistoryPersister = createSerializedJsonPersister({
    fileSystem: fs.promises,
    file: PLAYER_HISTORY_FILE,
    directory: path.dirname(PLAYER_HISTORY_FILE),
    label: "PLAYER-HISTORY-PERSIST"
});
let monitorRunning = false;
let periodMonitorTimer = null;
let periodMonitorNextDelay = 300_000;
let nextCornerRequestAt = 0;
let cornerRequestQueue = Promise.resolve();
const teamPlayerHistoryBuilds = new Map();

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
    if (erro.code !== "ENOENT") console.error("Não foi possível ler o histórico de escanteios:", erro.message);
}

function persistStore(file, store, label) {
    if (IS_SERVERLESS) return false;
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temporary = `${file}.tmp`;
        fs.writeFileSync(temporary, JSON.stringify(store, null, 2));
        fs.renameSync(temporary, file);
        return true;
    } catch (erro) {
        console.error(`[CACHE-PERSIST] store=${label} status=skipped error=${erro.code || erro.message}`);
        return false;
    }
}

function savePeriodStore() {
    return persistStore(SNAPSHOT_FILE, periodStore, "period-stats");
}

function savePlayerHistoryStore() {
    if (IS_SERVERLESS) return Promise.resolve(true);
    return playerHistoryPersister.enqueue(playerHistoryStore).catch(() => false);
}

function saveCornerHistoryStore() {
    return persistStore(CORNER_HISTORY_FILE, cornerHistoryStore, "corner-history");
}

function statisticNumber(statistics, type) {
    const value = (statistics || []).find(item => item.type === type)?.value;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

async function cornerRecord(game) {
    const fixtureId = game.fixture?.id;
    const existing = cornerHistoryStore.fixtures[fixtureId];
    const expectedTeamIds = [game.teams?.home?.id, game.teams?.away?.id].map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    const existingTeamIds = (existing?.teams || []).map(team => Number(team.teamId)).filter(Number.isInteger).sort((a, b) => a - b);
    const compatibleComplete = existing?.complete
        && Number(existing.fixture?.id) === Number(fixtureId)
        && existing.fixture?.date === game.fixture?.date
        && expectedTeamIds.length === 2
        && expectedTeamIds.every((teamId, index) => teamId === existingTeamIds[index])
        && existing.teams.every(team => Number.isFinite(team.corners));
    if (compatibleComplete) return existing;
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
    "cards.yellow", "cards.red", "rating", "offsides", "saves", "duels.total",
    "duels.won", "dribbles.attempts", "dribbles.success"
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

const PLAYER_MARKETS = Object.freeze({
    shotsOnGoal: "shots.on",
    shotsTotal: "shots.total",
    goals: "goals",
    assists: "assists",
    tackles: "tackles",
    foulsCommitted: "fouls.committed",
    foulsDrawn: "fouls.drawn"
});
const PLAYER_POSITION_METRICS = Object.freeze({
    G: ["saves", "passes.total", "rating", "cards.yellow", "cards.red"],
    D: ["tackles", "duels.total", "duels.won", "passes.total", "fouls.committed", "cards.yellow", "cards.red"],
    M: ["assists", "passes.total", "passes.key", "tackles", "shots.total", "shots.on", "rating"],
    A: ["goals", "assists", "shots.total", "shots.on", "offsides", "dribbles.success", "rating"]
});

function playerPositionGroup(position) {
    const value = String(position || "").trim().toUpperCase();
    if (["G", "GK", "GOALKEEPER"].includes(value)) return "G";
    if (["D", "DEF", "DEFENDER"].includes(value)) return "D";
    if (["M", "MID", "MIDFIELDER"].includes(value)) return "M";
    if (["F", "A", "ATT", "ATTACKER"].includes(value)) return "A";
    return null;
}

function getPlayerRecentGames(playerId, { teamId = null, before = null, limit = 5 } = {}) {
    const beforeTime = before ? new Date(before).getTime() : Number.POSITIVE_INFINITY;
    return Object.values(playerHistoryStore.fixtures)
        .filter(record => record.complete && record.fixture?.date && new Date(record.fixture.date).getTime() < beforeTime)
        .filter(record => ["FT", "AET", "PEN"].includes(record.fixture?.status || "FT"))
        .filter(record => record.players?.[playerId])
        .map(record => ({ record, player: record.players[playerId] }))
        .filter(({ player }) => (teamId == null || Number(player.teamId) === Number(teamId)) && Number(player.minutes) > 0)
        .sort((a, b) => new Date(b.record.fixture.date) - new Date(a.record.fixture.date))
        .slice(0, Math.min(10, Math.max(1, Number(limit) || 5)))
        .map(({ record, player }) => {
            const teams = record.fixture.teams || {};
            const isHome = Number(teams.home?.id) === Number(player.teamId);
            const opponent = isHome ? teams.away : teams.home;
            return {
                fixtureId: record.fixture.id,
                date: record.fixture.date,
                league: record.fixture.league ? { id: record.fixture.league.id, name: record.fixture.league.name, season: record.fixture.league.season } : null,
                opponent: opponent ? { id: opponent.id, name: opponent.name, logo: opponent.logo } : null,
                homeAway: isHome ? "home" : "away",
                minutes: player.minutes,
                starter: player.substitute == null ? null : !player.substitute,
                number: player.number,
                position: player.position,
                rating: player.rating,
                shots: player.shots,
                goals: player.goals,
                assists: player.assists,
                tackles: player.tackles,
                passes: player.passes,
                fouls: player.fouls,
                cards: player.cards,
                offsides: player.offsides,
                saves: player.saves,
                duels: player.duels,
                dribbles: player.dribbles
            };
        });
}

function summarizePlayerMetric(games, metric) {
    const rows = games.map(game => ({ ...game, value: playerHistoryValue(game, metric) }))
        .filter(game => game.value != null && Number.isFinite(Number(game.value)))
        .map(game => ({ fixtureId: game.fixtureId, date: game.date, opponent: game.opponent, minutes: game.minutes, value: Number(game.value) }));
    const total = rows.reduce((sum, game) => sum + game.value, 0);
    return {
        average: rows.length ? total / rows.length : null,
        frequency: { hits: rows.filter(game => game.value > 0).length, sample: rows.length },
        coverage: rows.length,
        games: rows
    };
}

function buildIndividualPlayerMarkets(summaries) {
    return {
        shotsOnGoal: summaries["shots.on"],
        shotsTotal: summaries["shots.total"],
        goals: summaries.goals,
        assists: summaries.assists,
        tackles: summaries.tackles,
        foulsCommitted: summaries["fouls.committed"],
        foulsDrawn: summaries["fouls.drawn"]
    };
}

function buildPlayerHighlights(positionGroup, markets) {
    const highlight = (type, title, description, metric, summary) => ({
        type, title, description, metric, average: summary.average,
        frequency: { hits: summary.frequency.hits, covered: summary.frequency.sample },
        coverage: summary.coverage
    });
    const rules = {
        D: [
            ["offensive_frequency", "Participação ofensiva frequente", "Finalizou em {hits} dos {covered} jogos com dado.", "shotsTotal", s => s.coverage >= 4 && s.frequency.hits >= 4],
            ["defensive_activity", "Alta participação defensiva", "Média de {average} desarmes nos jogos cobertos.", "tackles", s => s.coverage >= 4 && s.average >= 2],
            ["duel_fouls", "Participação frequente em disputas", "Cometeu faltas em {hits} de {covered} jogos.", "foulsCommitted", s => s.coverage >= 4 && s.average >= 1.5]
        ],
        M: [
            ["fouls_target", "Alvo frequente de faltas", "Sofreu faltas em {hits} de {covered} jogos.", "foulsDrawn", s => s.coverage >= 4 && s.frequency.hits >= 4],
            ["defensive_activity", "Alta participação defensiva", "Média de {average} desarmes nos jogos cobertos.", "tackles", s => s.coverage >= 4 && s.average >= 2],
            ["shots_on_target", "Boa frequência de finalizações no alvo", "Acertou o alvo em {hits} de {covered} jogos.", "shotsOnGoal", s => s.coverage >= 4 && s.frequency.hits >= 3]
        ],
        A: [
            ["shots_on_target", "Boa frequência de finalizações no alvo", "Acertou o alvo em {hits} de {covered} jogos.", "shotsOnGoal", s => s.coverage >= 4 && s.frequency.hits >= 3],
            ["fouls_target", "Alvo frequente de faltas", "Sofreu faltas em {hits} de {covered} jogos.", "foulsDrawn", s => s.coverage >= 4 && s.frequency.hits >= 4],
            ["goal_frequency", "Presença frequente em gols", "Marcou em {hits} de {covered} jogos com dado.", "goals", s => s.coverage >= 4 && s.frequency.hits >= 2]
        ],
        G: []
    };
    return (rules[positionGroup] || rules.M).flatMap(([type, title, template, metric, passes]) => {
        const summary = markets[metric];
        if (!summary || !passes(summary)) return [];
        const description = template.replace("{hits}", summary.frequency.hits).replace("{covered}", summary.frequency.sample).replace("{average}", summary.average.toFixed(2));
        return [highlight(type, title, description, metric, summary)];
    }).slice(0, 3);
}

function buildPlayerRecentPayload(playerId, teamId, before, limit = 5) {
    const games = getPlayerRecentGames(playerId, { teamId, before, limit });
    const latest = games[0];
    const cachedPlayer = Object.values(playerHistoryStore.fixtures)
        .map(record => record.players?.[playerId])
        .find(player => player && Number(player.teamId) === Number(teamId));
    const summaries = Object.fromEntries([...PLAYER_HISTORY_METRICS].map(metric => [metric, summarizePlayerMetric(games, metric)]));
    const position = latest?.position ?? cachedPlayer?.position ?? null;
    const positionGroup = playerPositionGroup(position);
    const markets = buildIndividualPlayerMarkets(summaries);
    const minutesAverage = games.length ? games.reduce((sum, game) => sum + Number(game.minutes), 0) / games.length : null;
    return {
        player: {
            id: Number(playerId),
            name: cachedPlayer?.name || null,
            photo: `https://media.api-sports.io/football/players/${Number(playerId)}.png`,
            teamId: Number(teamId),
            position,
            positionGroup,
            number: latest?.number ?? cachedPlayer?.number ?? null
        },
        participationGames: games.length,
        games,
        summaries,
        markets,
        metrics: {
            tackles: summaries.tackles,
            foulsCommitted: summaries["fouls.committed"],
            foulsDrawn: summaries["fouls.drawn"]
        },
        summary: {
            lastMatchesCount: games.length,
            minutesAverage,
            reliableAverages: Object.fromEntries(Object.entries(markets).filter(([, metric]) => metric.coverage >= 3).map(([name, metric]) => [name, metric.average]))
        },
        playerHighlights: buildPlayerHighlights(positionGroup, markets),
        reliableMetricsForPosition: PLAYER_POSITION_METRICS[playerPositionGroup(position)] || []
    };
}

function selectPlayerMarketLeaders(players, market, maximum = 5) {
    const metric = PLAYER_MARKETS[market];
    if (!metric) return [];
    const minimumCoverage = ["tackles", "foulsCommitted", "foulsDrawn"].includes(market) ? 3 : 1;
    return players.map(player => ({ player, summary: player.summaries[metric] }))
        .filter(item => item.summary.coverage >= minimumCoverage)
        .sort((a, b) => b.summary.average - a.summary.average
            || b.summary.frequency.hits - a.summary.frequency.hits
            || b.player.games.reduce((sum, game) => sum + Number(game.minutes || 0), 0) - a.player.games.reduce((sum, game) => sum + Number(game.minutes || 0), 0)
            || b.summary.coverage - a.summary.coverage)
        .slice(0, Math.min(5, Math.max(3, Number(maximum) || 5)))
        .map(({ player, summary }) => ({ player: player.player, average: summary.average, frequency: summary.frequency, games: summary.games }));
}

function cachedPlayerCoverage(teamId, relevantPlayerIds, before, target) {
    return new Map([...relevantPlayerIds].map(playerId => [Number(playerId), new Set(
        getPlayerRecentGames(playerId, { teamId, before, limit: target }).map(game => Number(game.fixtureId))
    )]));
}

function coverageComplete(coverage, relevantPlayerIds, target) {
    return relevantPlayerIds.size > 0 && [...relevantPlayerIds].every(playerId => (coverage.get(Number(playerId))?.size || 0) >= target);
}

function qualifiedConfirmedPlayers(teamId, relevantPlayerIds, before, target = 5) {
    return [...relevantPlayerIds].filter(playerId => {
        const games = getPlayerRecentGames(playerId, { teamId, before, limit: target });
        if (games.length < target) return false;
        const minutes = games.reduce((sum, game) => sum + Number(game.minutes || 0), 0);
        const shots = games.map(game => Number(game.shots?.on)).filter(Number.isFinite);
        return minutes >= 270 && shots.length === target && shots.reduce((sum, value) => sum + value, 0) / target >= 0.20;
    }).length;
}

async function buildTeamPlayerHistory(fixture, team, relevantPlayerIds = new Set(), target = 5, maximumCandidates = 30) {
    const maximumQualified = 4;
    const maximumNewFixtureRequests = 8;
    const beforeTime = new Date(fixture.fixture.date).getTime();
    const coverage = cachedPlayerCoverage(team.id, relevantPlayerIds, fixture.fixture.date, target);
    const reusedFixtures = new Set([...coverage.values()].flatMap(ids => [...ids]));
    if (coverageComplete(coverage, relevantPlayerIds, target) || qualifiedConfirmedPlayers(team.id, relevantPlayerIds, fixture.fixture.date, target) >= maximumQualified) {
        return { teamId: team.id, candidates: 0, inspected: 0, requested: 0, cacheHits: reusedFixtures.size, valid: reusedFixtures.size, empty: 0, failed: 0, acceptedPlayers: 0, discardedZeroMinutes: 0, reusedHistory: true, fixtures: [] };
    }
    const history = await rateLimitedPlayerFootball(`/fixtures?team=${team.id}&last=${maximumCandidates}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000);
    const candidates = [...new Map((history.response || [])
        .filter(game => game.fixture?.id !== fixture.fixture.id)
        .filter(game => new Date(game.fixture?.date).getTime() < beforeTime)
        .filter(game => ["FT", "AET", "PEN"].includes(game.fixture?.status?.short))
        .map(game => [game.fixture.id, game])).values()]
        .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
        .slice(0, maximumCandidates);
    const diagnostics = { teamId: team.id, candidates: candidates.length, inspected: 0, requested: 0, cacheHits: reusedFixtures.size, valid: reusedFixtures.size, empty: 0, failed: 0, acceptedPlayers: 0, discardedZeroMinutes: 0, reusedHistory: reusedFixtures.size > 0, fixtures: [] };
    let dirty = false;
    for (const game of candidates) {
        diagnostics.inspected++;
        let record = playerHistoryStore.fixtures[game.fixture.id];
        let source = "cache";
        let requestStatus = "cached";
        if (record?.complete || record?.retryAfter && new Date(record.retryAfter) > new Date()) {
            if (!reusedFixtures.has(Number(game.fixture.id))) diagnostics.cacheHits++;
        } else {
            if (diagnostics.requested >= maximumNewFixtureRequests) {
                diagnostics.budgetReached = true;
                break;
            }
            source = "api";
            diagnostics.requested++;
            try {
                const response = await rateLimitedPlayerFootball(`/fixtures/players?fixture=${game.fixture.id}`, 21_600_000);
                const players = normalizeFixturePlayers(response.response);
                const complete = Object.keys(players).length > 0;
                requestStatus = complete ? "ok" : "empty";
                record = {
                    fixture: { id: game.fixture.id, date: game.fixture.date, status: game.fixture.status.short, league: game.league, teams: game.teams },
                    players,
                    complete,
                    updatedAt: new Date().toISOString(),
                    retryAfter: complete ? null : new Date(Date.now() + 21_600_000).toISOString(),
                    attempts: (record?.attempts || 0) + 1,
                    source: "/fixtures/players",
                    errorType: complete ? null : "empty"
                };
                playerHistoryStore.fixtures[game.fixture.id] = record;
                dirty = true;
            } catch (erro) {
                requestStatus = "error";
                diagnostics.failed++;
                record = {
                    ...(record || { fixture: { id: game.fixture.id, date: game.fixture.date, status: game.fixture.status.short, league: game.league, teams: game.teams }, players: {} }),
                    complete: false,
                    updatedAt: new Date().toISOString(),
                    retryAfter: new Date(Date.now() + 900_000).toISOString(),
                    attempts: (record?.attempts || 0) + 1,
                    source: "/fixtures/players",
                    errorType: "request"
                };
                playerHistoryStore.fixtures[game.fixture.id] = record;
                dirty = true;
                if (["API_DAILY_QUOTA", "API_MINUTE_QUOTA"].includes(erro.code)) {
                    if (dirty) await savePlayerHistoryStore();
                    throw erro;
                }
            }
        }
        const teamPlayers = Object.values(record?.players || {}).filter(player => Number(player.teamId) === Number(team.id));
        const participating = teamPlayers.filter(player => Number(player.minutes) > 0);
        diagnostics.discardedZeroMinutes += teamPlayers.length - participating.length;
        diagnostics.acceptedPlayers += participating.length;
        if (!record?.complete || !participating.length) {
            if (requestStatus !== "error") diagnostics.empty++;
        } else {
            diagnostics.valid++;
            for (const player of participating) {
                if (relevantPlayerIds.has(Number(player.playerId))) {
                    if (!coverage.has(Number(player.playerId))) coverage.set(Number(player.playerId), new Set());
                    coverage.get(Number(player.playerId)).add(Number(game.fixture.id));
                }
            }
        }
        diagnostics.fixtures.push({ fixtureId: game.fixture.id, date: game.fixture.date, status: game.fixture.status.short, leagueId: game.league?.id || null, season: game.league?.season ?? null, source, result: requestStatus, returnedPlayers: Object.keys(record?.players || {}).length, participatingPlayers: participating.length });
        if (coverageComplete(coverage, relevantPlayerIds, target) || qualifiedConfirmedPlayers(team.id, relevantPlayerIds, fixture.fixture.date, target) >= maximumQualified) break;
    }
    if (dirty && !await savePlayerHistoryStore()) {
        const error = new Error("Histórico atualizado em memória, mas ainda não foi persistido em disco.");
        error.code = "PLAYER_HISTORY_PERSIST";
        throw error;
    }
    if (diagnostics.failed > 0) {
        const error = new Error(`Histórico do time ${team.id} ficou incompleto em ${diagnostics.failed} fixture(s).`);
        error.code = "API_TRANSIENT";
        throw error;
    }
    console.log(`[PLAYER-HISTORY] fixture=${fixture.fixture.id} team=${team.id} candidates=${diagnostics.candidates} inspected=${diagnostics.inspected} valid=${diagnostics.valid} requested=${diagnostics.requested} qualified=${qualifiedConfirmedPlayers(team.id, relevantPlayerIds, fixture.fixture.date, target)} empty=${diagnostics.empty} failed=${diagnostics.failed}`);
    return diagnostics;
}

function ensureTeamPlayerHistory(fixture, team, relevantPlayerIds = new Set(), target = 5, maximumCandidates = 30) {
    const day = String(fixture.fixture.date || "").slice(0, 10);
    const key = `${Number(team.id)}:${day}`;
    if (teamPlayerHistoryBuilds.has(key)) return teamPlayerHistoryBuilds.get(key);
    const build = buildTeamPlayerHistory(fixture, team, relevantPlayerIds, target, maximumCandidates)
        .catch(error => { teamPlayerHistoryBuilds.delete(key); throw error; });
    teamPlayerHistoryBuilds.set(key, build);
    return build;
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
            const response = await rateLimitedPlayerFootball(`/fixtures/players?fixture=${game.fixture.id}`, 21_600_000);
            const players = normalizeFixturePlayers(response.response);
            const complete = Object.keys(players).length > 0;
            playerHistoryStore.fixtures[game.fixture.id] = {
                fixture: { id: game.fixture.id, date: game.fixture.date, status: game.fixture.status.short, league: game.league, teams: game.teams },
                players,
                complete,
                updatedAt: new Date().toISOString(),
                retryAfter: complete ? null : new Date(Date.now() + 21_600_000).toISOString(),
                attempts: (existing?.attempts || 0) + 1,
                source: "/fixtures/players"
            };
            await savePlayerHistoryStore();
            console.log(`[PLAYER HISTORY] fixture=${game.fixture.id} complete=${complete} players=${Object.keys(players).length}`);
        } catch (erro) {
            playerHistoryStore.fixtures[game.fixture.id] = {
                ...(existing || { fixture: { id: game.fixture.id, date: game.fixture.date, status: game.fixture.status.short, league: game.league, teams: game.teams }, players: {} }),
                complete: false,
                updatedAt: new Date().toISOString(),
                retryAfter: new Date(Date.now() + (erro.code === "API_DAILY_QUOTA" ? (erro.retryAfterMs || API_DAILY_COOLDOWN_MS) : 900_000)).toISOString(),
                errorType: erro.code || "request",
                source: "/fixtures/players"
            };
            await savePlayerHistoryStore();
            console.error(`[PLAYER HISTORY] fixture=${game.fixture.id} error=${erro.message}`);
            if (["API_DAILY_QUOTA", "API_MINUTE_QUOTA"].includes(erro.code)) throw erro;
        }
    }
}

function normalizeStatistics(response) {
    return Object.fromEntries((response || []).map(team => [team.team.id, {
        team: team.team,
        values: Object.fromEntries((team.statistics || []).map(item => [item.type, item.value]))
    }]));
}

const PERIOD_SHOT_METRICS = ["Total Shots", "Shots on Goal", "Shots off Goal", "Blocked Shots", "Shots insidebox", "Shots outsidebox"];
const PERIOD_ACCUMULATIVE_METRICS = new Set([
    ...PERIOD_SHOT_METRICS, "Fouls", "Corner Kicks", "Offsides", "Yellow Cards",
    "Red Cards", "Goalkeeper Saves", "Total passes", "Passes accurate"
]);

function validPeriodStatistics(statistics, game) {
    const teamIds = [game.teams?.home?.id, game.teams?.away?.id].filter(Number.isInteger);
    // Um snapshot parcial continua sendo real e util. A validade de cada campo
    // e decidida depois, na cobertura da metrica, sem converter ausencia em zero.
    return teamIds.length === 2 && teamIds.every(teamId => PERIOD_SHOT_METRICS.some(metric =>
        Number.isFinite(statistics?.[teamId]?.values?.[metric])
    ));
}

function subtractStatistics(total, firstHalf) {
    const result = {};
    for (const [teamId, team] of Object.entries(total || {})) {
        const first = firstHalf?.[teamId]?.values || {};
        const values = {};
        for (const [type, value] of Object.entries(team.values || {})) {
            // 2T = FT - HT apenas para contagens acumulativas. Percentuais,
            // posse, precisao e metricas de modelo nunca sao subtraidos.
            if (PERIOD_ACCUMULATIVE_METRICS.has(type) && typeof value === "number" && typeof first[type] === "number" && value >= first[type]) values[type] = value - first[type];
        }
        result[teamId] = { team: team.team, values };
    }
    return result;
}

function applyPeriodSnapshot(store, game, phase, response, capturedAt = new Date().toISOString()) {
    const statistics = normalizeStatistics(response);
    if (!validPeriodStatistics(statistics, game)) return { saved: false, reason: "missing_statistics", secondHalf: false };
    const fixtureId = game.fixture.id;
    const record = store.fixtures[fixtureId] || {
        fixture: { id: fixtureId, date: game.fixture.date, league: game.league, teams: game.teams }
    };
    record.fixture = { ...record.fixture, id: fixtureId, date: game.fixture.date, league: game.league, teams: game.teams, status: game.fixture.status.short };
    delete record.retryAfter;
    delete record.errorType;
    if (record[phase] && validPeriodStatistics(record[phase].statistics, game)) return { saved: false, reason: "duplicate", secondHalf: Boolean(record.secondHalf) };
    record[phase] = { capturedAt, elapsed: game.fixture.status.elapsed, status: game.fixture.status.short, statistics };
    let secondHalf = false;
    if (phase === "fulltime" && record.halftime && validPeriodStatistics(record.halftime.statistics, game)) {
        const calculated = subtractStatistics(record.fulltime.statistics, record.halftime.statistics);
        if (validPeriodStatistics(calculated, game)) {
            record.secondHalf = { capturedAt, status: game.fixture.status.short, statistics: calculated };
            secondHalf = true;
        } else delete record.secondHalf;
    }
    store.fixtures[fixtureId] = record;
    return { saved: true, reason: null, secondHalf };
}

async function football(endpoint, ttl = 60_000, options = {}) {
    metrics.requests++;
    const cached = cache.get(endpoint);
    const diagnosticStartedAt = Date.now();
    const parsedEndpoint = new URL(endpoint, API_BASE);
    const endpointPath = parsedEndpoint.pathname;
    const query = parsedEndpoint.searchParams.toString() || "-";
    const caller = (new Error().stack || "").split("\n").slice(2)
        .map(line => line.trim())
        .find(line => !line.includes("footballAllPages") && !line.includes("cornerFootball")) || "unknown";

    if (!options.force && cached && Date.now() - cached.createdAt < ttl) {
        metrics.cacheHits++;
        apiUsageDiagnostic.cacheHits++;
        console.log(`[API-USAGE-DIAGNOSTIC] ${new Date().toISOString()} CACHE_HIT endpoint=${endpointPath} query="${query}" caller="${caller}" durationMs=${Date.now() - diagnosticStartedAt}`);
        return cached.data;
    }

    if (pending.has(endpoint)) {
        metrics.cacheHits++;
        apiUsageDiagnostic.pendingHits++;
        console.log(`[API-USAGE-DIAGNOSTIC] ${new Date().toISOString()} PENDING_HIT endpoint=${endpointPath} query="${query}" caller="${caller}" durationMs=${Date.now() - diagnosticStartedAt}`);
        return pending.get(endpoint);
    }

    // This is the final gate before the only external API-Football fetch.
    // Cache and in-flight hits above remain available while offline.
    assertExternalRequestsAllowed(endpoint);

    if (apiQuotaState.blockedUntil > Date.now()) {
        const retryAfterMs = apiQuotaState.blockedUntil - Date.now();
        console.warn(`[API-QUOTA] BLOCKED_BY_COOLDOWN endpoint=${endpointPath} remaining=${apiQuotaState.remaining ?? "unknown"} retryAfterMs=${retryAfterMs}`);
        const quotaError = new Error("Cota diária da API-Football esgotada. Nova tentativa externa bloqueada temporariamente.");
        quotaError.code = "API_DAILY_QUOTA";
        quotaError.status = 429;
        quotaError.retryAfterMs = retryAfterMs;
        throw quotaError;
    }

    const request = (async () => {
        metrics.externalRequests++;
        apiUsageDiagnostic.externalTotal++;
        const sequence = apiUsageDiagnostic.externalTotal;
        apiUsageDiagnostic.byEndpoint.set(endpointPath, (apiUsageDiagnostic.byEndpoint.get(endpointPath) || 0) + 1);
        let resposta;
        let dados;
        try {
            resposta = await fetch(`${API_BASE}${endpoint}`, {
                headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY },
                signal: AbortSignal.timeout(12_000)
            });
            dados = await resposta.json();
            const dailyLimitHeader = resposta.headers.get("x-ratelimit-requests-limit");
            const dailyRemainingHeader = resposta.headers.get("x-ratelimit-requests-remaining");
            if (dailyLimitHeader != null) apiQuotaState.limit = Number(dailyLimitHeader);
            if (dailyRemainingHeader != null) apiQuotaState.remaining = Number(dailyRemainingHeader);
            console.log(`[API-QUOTA] remaining=${Number.isFinite(apiQuotaState.remaining) ? apiQuotaState.remaining : "unknown"} limit=${Number.isFinite(apiQuotaState.limit) ? apiQuotaState.limit : "unknown"}`);
        } finally {
            const dailyLimit = resposta?.headers.get("x-ratelimit-requests-limit") ?? "unknown";
            const dailyRemaining = resposta?.headers.get("x-ratelimit-requests-remaining") ?? "unknown";
            const minuteLimit = resposta?.headers.get("x-ratelimit-limit") ?? "unknown";
            const minuteRemaining = resposta?.headers.get("x-ratelimit-remaining") ?? "unknown";
            console.log(`[API-USAGE] #${sequence} ${new Date().toISOString()} endpoint=${endpointPath} query="${query}" status=${resposta?.status ?? "NETWORK_ERROR"} dailyLimit=${dailyLimit} dailyRemaining=${dailyRemaining} minuteLimit=${minuteLimit} minuteRemaining=${minuteRemaining} caller="${caller}" external=true durationMs=${Date.now() - diagnosticStartedAt}`);
        }

        if (!resposta.ok || dados.errors?.length || Object.keys(dados.errors || {}).length) {
            const apiMessage = dados.message || JSON.stringify(dados.errors) || "Erro na API-Football";
            const dailyLimitReached = /request limit for the day|daily.{0,20}(?:limit|quota)|quota.{0,20}daily/i.test(apiMessage);
            const requestError = new Error(apiMessage);
            requestError.status = resposta.status;
            if (dailyLimitReached) {
                apiQuotaState.remaining = 0;
                apiQuotaState.blockedUntil = Date.now() + API_DAILY_COOLDOWN_MS;
                apiQuotaState.reason = "daily-limit";
                requestError.code = "API_DAILY_QUOTA";
                requestError.retryAfterMs = API_DAILY_COOLDOWN_MS;
                console.error(`[API-QUOTA] DAILY_LIMIT_REACHED blockedUntil=${new Date(apiQuotaState.blockedUntil).toISOString()}`);
            } else if (resposta.status === 429) {
                const retryAfter = resposta.headers.get("retry-after");
                const retrySeconds = retryAfter == null ? NaN : Number(retryAfter);
                const retryDateMs = retryAfter && !Number.isFinite(retrySeconds) ? new Date(retryAfter).getTime() - Date.now() : NaN;
                requestError.code = "API_MINUTE_QUOTA";
                requestError.retryAfterMs = Number.isFinite(retrySeconds)
                    ? Math.max(1_000, retrySeconds * 1_000)
                    : Number.isFinite(retryDateMs) && retryDateMs > 0 ? retryDateMs : API_MINUTE_COOLDOWN_MS;
                console.warn(`[API-MINUTE-QUOTA] PAUSED retryAfterMs=${requestError.retryAfterMs} dailyRemaining=${Number.isFinite(apiQuotaState.remaining) ? apiQuotaState.remaining : "unknown"}`);
            } else if (resposta.status >= 500) {
                requestError.code = "API_TRANSIENT";
            } else if (resposta.status >= 400) {
                requestError.code = "API_PERMANENT";
            }
            throw requestError;
        }

        cache.set(endpoint, { data: dados, createdAt: Date.now() });
        if (apiQuotaState.remaining === 0) {
            apiQuotaState.blockedUntil = Date.now() + API_DAILY_COOLDOWN_MS;
            apiQuotaState.reason = "remaining-zero";
            console.error(`[API-QUOTA] DAILY_LIMIT_REACHED blockedUntil=${new Date(apiQuotaState.blockedUntil).toISOString()}`);
        }
        return dados;
    })();

    pending.set(endpoint, request);
    try {
        return await request;
    } finally {
        pending.delete(endpoint);
    }
}

function playerRequestWouldBeExternal(endpoint, ttl, options = {}) {
    const cached = cache.get(endpoint);
    return apiQuotaState.blockedUntil <= Date.now()
        && Boolean(options.force || !cached || Date.now() - cached.createdAt >= ttl)
        && !pending.has(endpoint);
}

function rateLimitedPlayerFootball(endpoint, ttl = 60_000, options = {}) {
    if (!playerRequestWouldBeExternal(endpoint, ttl, options)) return football(endpoint, ttl, options);
    return playerRateLimiter.schedule(
        () => football(endpoint, ttl, options),
        { shouldConsume: () => playerRequestWouldBeExternal(endpoint, ttl, options) }
    );
}

function shouldRevalidatePlayerLineup({ lineups, force, cacheHit }) {
    return !lineups.length && !force && cacheHit;
}

function printApiUsageDiagnosticSummary() {
    console.log("[API-USAGE-SUMMARY] API-USAGE-DIAGNOSTIC");
    console.log(`[API-USAGE-SUMMARY] total externas: ${apiUsageDiagnostic.externalTotal}`);
    console.log(`[API-USAGE-SUMMARY] cache hits: ${apiUsageDiagnostic.cacheHits}`);
    console.log(`[API-USAGE-SUMMARY] pending hits: ${apiUsageDiagnostic.pendingHits}`);
    [...apiUsageDiagnostic.byEndpoint.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .forEach(([name, count]) => console.log(`[API-USAGE-SUMMARY] ${name}: ${count}`));
}

setInterval(printApiUsageDiagnosticSummary, 60_000).unref();

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
    const existing = periodStore.fixtures[fixtureId];
    if (existing?.retryAfter && new Date(existing.retryAfter).getTime() > Date.now()) return false;
    if (existing?.[phase] && validPeriodStatistics(existing[phase].statistics, game)) return false;
    try {
        const data = await cornerFootball(`/fixtures/statistics?fixture=${fixtureId}`, 10_000);
        const result = applyPeriodSnapshot(periodStore, game, phase, data.response || []);
        if (!result.saved) {
            console.warn(`[PERIOD-STATS] fixture=${fixtureId} status=${game.fixture.status.short} snapshot=${phase === "halftime" ? "ht" : "ft"} skipped=${result.reason}`);
            return false;
        }
        savePeriodStore();
        console.log(`[PERIOD-STATS] fixture=${fixtureId} status=${game.fixture.status.short} snapshot=${phase === "halftime" ? "ht" : "ft"} saved`);
        if (result.secondHalf) console.log(`[PERIOD-STATS] fixture=${fixtureId} status=${game.fixture.status.short} secondHalf=calculated`);
        else if (phase === "fulltime" && !periodStore.fixtures[fixtureId]?.halftime) console.warn(`[PERIOD-STATS] fixture=${fixtureId} status=${game.fixture.status.short} secondHalf=skipped_missing_ht`);
        return true;
    } catch (erro) {
        const retryMs = erro.code === "API_DAILY_QUOTA" ? (erro.retryAfterMs || API_DAILY_COOLDOWN_MS) : 900_000;
        periodStore.fixtures[fixtureId] = {
            ...(existing || { fixture: { id: fixtureId, date: game.fixture.date, league: game.league, teams: game.teams } }),
            retryAfter: new Date(Date.now() + retryMs).toISOString(),
            errorType: erro.code || "request"
        };
        savePeriodStore();
        console.warn(`[PERIOD-STATS] fixture=${fixtureId} status=${game.fixture.status.short} snapshot=${phase === "halftime" ? "ht" : "ft"} failed=${erro.message}`);
        if (erro.code === "API_DAILY_QUOTA") throw erro;
        return false;
    }
}

async function monitorMainLeagues() {
    if (isCentralProOffline()) {
        if (!monitorMainLeagues.offlineLogged) {
            console.log("[PERIOD-MONITOR] disabled: offline mode");
            monitorMainLeagues.offlineLogged = true;
        }
        return { disabled: true, reason: "offline" };
    }
    if (monitorRunning || !process.env.API_FOOTBALL_KEY) return;
    monitorRunning = true;
    try {
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
        const schedule = await football(`/fixtures?date=${date}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 45_000);
        const games = (schedule.response || []).filter(game => MAIN_LEAGUES.has(game.league.id));
        const active = games.some(game => ["1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT"].includes(game.fixture.status.short));
        periodMonitorNextDelay = active ? 300_000 : 300_000;
        const halftime = games.filter(game => game.fixture.status.short === "HT");
        const finished = games.filter(game => ["FT", "AET", "PEN"].includes(game.fixture.status.short));
        for (const game of halftime) {
            try { await capturePeriodStatistics(game, "halftime"); }
            catch (erro) { if (erro.code === "API_DAILY_QUOTA") throw erro;console.warn(`[PERIOD-STATS] fixture=${game.fixture.id} status=HT failed=${erro.message}`); }
        }
        for (const game of finished) {
            try {
                const record = periodStore.fixtures[game.fixture.id];
                if ((!record?.fulltime || !validPeriodStatistics(record.fulltime.statistics, game)) && !(record?.retryAfter && new Date(record.retryAfter).getTime() > Date.now())) await capturePeriodStatistics(game, "fulltime");
            } catch (erro) { if (erro.code === "API_DAILY_QUOTA") throw erro;console.warn(`[PERIOD-STATS] fixture=${game.fixture.id} status=${game.fixture.status.short} failed=${erro.message}`); }
        }
        await collectFinishedPlayerHistory(finished, 2);
    } catch (erro) {
        periodMonitorNextDelay = erro.code === "API_DAILY_QUOTA" ? (erro.retryAfterMs || API_DAILY_COOLDOWN_MS) : 300_000;
        console.error("Monitor de períodos:", erro.message);
    } finally {
        monitorRunning = false;
        clearTimeout(periodMonitorTimer);
        periodMonitorTimer = setTimeout(monitorMainLeagues, periodMonitorNextDelay);
        periodMonitorTimer.unref();
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

// Diagnóstico temporário: mostra a resposta REAL da API-Football para half=true
// de uma partida histórica do time da casa. Não altera cálculos nem a interface.
app.get("/api/debug/periodo", async (req, res) => {
    const fixtureId = Number.parseInt(req.query.fixture, 10);
    if (!Number.isInteger(fixtureId)) return res.status(400).json({ erro: "Partida inválida." });

    try {
        const currentResult = await football(`/fixtures?id=${fixtureId}`, 30_000);
        const current = currentResult.response?.[0];
        if (!current) return res.status(404).json({ erro: "Partida atual não encontrada." });

        const teamId = Number(current.teams?.home?.id);
        const currentTime = new Date(current.fixture?.date).getTime();
        const historyResult = await football(`/fixtures?team=${teamId}&last=20&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 60_000);
        const historical = (historyResult.response || [])
            .filter(game => Number(game.fixture?.id) !== fixtureId)
            .filter(game => ["FT", "AET", "PEN"].includes(game.fixture?.status?.short))
            .filter(game => new Date(game.fixture?.date).getTime() < currentTime)
            .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))[0];

        if (!historical) return res.status(404).json({ erro: "Nenhuma partida histórica concluída encontrada." });

        const historicalId = Number(historical.fixture.id);
        const halfResult = await football(`/fixtures/statistics?fixture=${historicalId}&half=true`, 0);

        console.log("\n========== DEBUG API-FOOTBALL half=true ==========");
        console.log(`Partida atual: ${fixtureId}`);
        console.log(`Time usado: ${teamId} - ${current.teams?.home?.name || ""}`);
        console.log(`Partida histórica: ${historicalId} - ${historical.teams?.home?.name || ""} x ${historical.teams?.away?.name || ""}`);
        console.log(JSON.stringify(halfResult, null, 2));
        console.log("========== FIM DEBUG half=true ==========\n");

        res.json({
            ok: true,
            currentFixture: fixtureId,
            team: { id: teamId, name: current.teams?.home?.name || null },
            historicalFixture: {
                id: historicalId,
                date: historical.fixture?.date,
                home: historical.teams?.home?.name,
                away: historical.teams?.away?.name
            },
            halfTrueResponse: halfResult
        });
    } catch (error) {
        console.error("DEBUG half=true falhou:", error?.message || error);
        res.status(500).json({ erro: "Falha no diagnóstico de período." });
    }
});

app.get("/api/estatisticas-periodos", async (req, res) => {
    const team = Number.parseInt(req.query.team, 10);
    const fixtureId = Number.parseInt(req.query.fixture, 10);
    const limit = req.query.limit === "10" ? 10 : 5;
    if (!Number.isInteger(team) || !Number.isInteger(fixtureId)) return res.status(400).json({ erro: "Time ou partida inválida." });

    try {
        const fixtureResponse = await football(`/fixtures?id=${fixtureId}`, 30_000);
        const currentFixture = fixtureResponse.response?.[0];
        if (!currentFixture) return res.status(404).json({ erro: "Partida não encontrada." });

        const fixtureTime = new Date(currentFixture.fixture.date).getTime();
        const candidateLimit = Math.max(30, limit * 6);
        const history = await football(`/fixtures?team=${team}&last=${candidateLimit}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000);
        const candidates = (history.response || [])
            .filter(game => Number(game.fixture?.id) !== fixtureId)
            .filter(game => ["FT", "AET", "PEN"].includes(game.fixture?.status?.short))
            .filter(game => new Date(game.fixture?.date).getTime() < fixtureTime)
            .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date));

        const metrics = [
            "Total Shots", "Shots on Goal", "Shots off Goal", "Blocked Shots",
            "Shots insidebox", "Shots outsidebox", "Corner Kicks", "Fouls",
            "Offsides", "Yellow Cards", "Red Cards", "Goalkeeper Saves",
            "Total passes", "Passes accurate"
        ];
        const rows = [];
        const attempts = [];

        const valuesForTeam = (response) => normalizeStatistics(response)?.[team]?.values || null;
        const valuesFromList = list => Object.fromEntries((list || []).map(item => [item.type, item.value]));
        const hasUsefulMetric = values => Boolean(values && metrics.some(metric => Number.isFinite(values?.[metric])));

        // Estrutura REAL confirmada na resposta da API-Football com half=true:
        // block.statistics     = jogo completo (FT)
        // block.statistics_1h  = primeiro tempo
        // block.statistics_2h  = segundo tempo
        const periodValuesForTeam = (response, wanted) => {
            const block = (response || []).find(item => Number(item?.team?.id) === team);
            if (!block) return null;
            if (wanted === "full" && Array.isArray(block.statistics)) return valuesFromList(block.statistics);
            if (wanted === "first" && Array.isArray(block.statistics_1h)) return valuesFromList(block.statistics_1h);
            if (wanted === "second" && Array.isArray(block.statistics_2h)) return valuesFromList(block.statistics_2h);
            return null;
        };

        for (const game of candidates) {
            if (rows.length >= limit) break;
            const gameId = Number(game.fixture.id);
            let fulltime = null;
            let halftime = null;
            let secondHalf = null;
            let source = "api-football";
            const diagnostic = { fixtureId: gameId, date: game.fixture.date, leagueId: game.league?.id || null, season: game.league?.season ?? null, fulltime: "empty", halftime: "empty" };

            // Fonte principal: UMA única chamada histórica à API-Football.
            // A própria resposta de half=true contém FT, 1T e 2T em campos separados.
            try {
                const periodResult = await cornerFootball(`/fixtures/statistics?fixture=${gameId}&half=true`, 21_600_000);
                const periodResponse = periodResult.response || [];
                fulltime = periodValuesForTeam(periodResponse, "full");
                halftime = periodValuesForTeam(periodResponse, "first");
                secondHalf = periodValuesForTeam(periodResponse, "second");

                diagnostic.fulltime = hasUsefulMetric(fulltime) ? "ok" : "empty";
                diagnostic.halftime = hasUsefulMetric(halftime) ? "ok" : "empty";
                diagnostic.secondHalf = hasUsefulMetric(secondHalf) ? "ok" : "empty";

                // Fallback defensivo apenas para APIs/partidas que não tragam statistics_2h.
                if (!hasUsefulMetric(secondHalf) && hasUsefulMetric(fulltime) && hasUsefulMetric(halftime)) {
                    const normalizedFull = { [team]: { team: { id: team }, values: fulltime } };
                    const normalizedHalf = { [team]: { team: { id: team }, values: halftime } };
                    secondHalf = subtractStatistics(normalizedFull, normalizedHalf)?.[team]?.values || null;
                }
            } catch (error) {
                diagnostic.error = "Falha na consulta externa.";
            }

            // Cache local antigo é apenas fallback. Nunca limita a amostra principal.
            if (!hasUsefulMetric(halftime) || !hasUsefulMetric(fulltime)) {
                const stored = periodStore.fixtures[gameId];
                if (stored) {
                    const storedHalf = stored.halftime?.statistics?.[team]?.values || null;
                    const storedFull = stored.fulltime?.statistics?.[team]?.values || null;
                    const storedSecond = stored.secondHalf?.statistics?.[team]?.values || null;
                    if (!hasUsefulMetric(halftime) && hasUsefulMetric(storedHalf)) halftime = storedHalf;
                    if (!hasUsefulMetric(fulltime) && hasUsefulMetric(storedFull)) fulltime = storedFull;
                    if (!hasUsefulMetric(secondHalf) && hasUsefulMetric(storedSecond)) secondHalf = storedSecond;
                    source = "api-football+local-fallback";
                }
            }

            if (!hasUsefulMetric(secondHalf) && hasUsefulMetric(fulltime) && hasUsefulMetric(halftime)) {
                const normalizedFull = { [team]: { team: { id: team }, values: fulltime } };
                const normalizedHalf = { [team]: { team: { id: team }, values: halftime } };
                secondHalf = subtractStatistics(normalizedFull, normalizedHalf)?.[team]?.values || null;
            }

            attempts.push(diagnostic);
            // Uma partida entra na amostra de períodos se tiver pelo menos estatística
            // real de 1T ou 2T; continuamos voltando no histórico até completar 5/10.
            if (!hasUsefulMetric(halftime) && !hasUsefulMetric(secondHalf)) continue;
            rows.push({
                fixture: {
                    id: gameId,
                    date: game.fixture.date,
                    status: game.fixture.status?.short,
                    league: game.league,
                    teams: game.teams
                },
                halftime: hasUsefulMetric(halftime) ? halftime : null,
                secondHalf: hasUsefulMetric(secondHalf) ? secondHalf : null,
                fulltime: hasUsefulMetric(fulltime) ? fulltime : null,
                source
            });
        }

        const metricCoverage = Object.fromEntries(metrics.map(metric => [metric, {
            halftime: rows.filter(row => Number.isFinite(row.halftime?.[metric])).length,
            secondHalf: rows.filter(row => Number.isFinite(row.secondHalf?.[metric])).length,
            fulltime: rows.filter(row => Number.isFinite(row.fulltime?.[metric])).length
        }]));

        res.json({
            team,
            fixtureId,
            requested: limit,
            coverage: {
                halftime: rows.filter(row => row.halftime && Object.values(row.halftime).some(Number.isFinite)).length,
                secondHalf: rows.filter(row => row.secondHalf && Object.values(row.secondHalf).some(Number.isFinite)).length,
                fulltime: rows.filter(row => row.fulltime && Object.values(row.fulltime).some(Number.isFinite)).length,
                metrics: metricCoverage
            },
            diagnostics: {
                candidates: candidates.length,
                attempted: attempts.length,
                usable: rows.length,
                source: "api-football-primary",
                rule: "últimos jogos válidos do time, qualquer competição e temporada",
                attempts
            },
            response: rows
        });
    } catch (erro) {
        res.status(502).json({ erro: "Estatísticas por período indisponíveis.", detalhe: erro.message });
    }
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
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIMEZONE }).format(new Date());
    try {
        // Placar e status ao vivo precisam de cache curto. Cinco minutos fazia
        // jogos iniciados demorarem demais para aparecer como "ao vivo".
        res.json(await resolveGames(date,
            () => football(`/fixtures?date=${date}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 30_000),
            gameSnapshotStorage));

    } catch (erro) {
        console.error(erro);
        res.status(erro.status === 429 ? 429 : 502).json({ erro: "Não foi possível buscar os jogos.", detalhe: erro.message, code: erro.code || "API_ERROR", retryAfterMs: erro.retryAfterMs || null });
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
    const confirmationOnly = req.query.confirmationOnly === "1";
    const scannerLeagueId = Number(req.query.league);
    if (req.query.mode === "scanner" && (!Number.isSafeInteger(scannerLeagueId) || !cpIsScannerEligibleLeagueId(scannerLeagueId))) return res.status(403).json({ status: "error", erro: "Competição fora da whitelist do scanner." });
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ status: "error", erro: "ID da partida inválido." });
    const playerExternalStart = metrics.externalRequests;
    const maxPlayerExternalRequests = 80;
    const playerFootball = (endpoint, ttl, options = {}) => {
        const cached = cache.get(endpoint);
        const cacheUsable = !options.force && cached && Date.now() - cached.createdAt < ttl;
        if (!cacheUsable && !pending.has(endpoint) && metrics.externalRequests - playerExternalStart >= maxPlayerExternalRequests) {
            const budgetError = new Error("Limite preventivo de chamadas externas da fixture atingido.");
            budgetError.code = "PLAYER_FIXTURE_BUDGET";
            throw budgetError;
        }
        return rateLimitedPlayerFootball(endpoint, ttl, options);
    };
    const playerFootballAllPages = async (endpoint, ttl) => {
        const separator = endpoint.includes("?") ? "&" : "?";
        const first = await playerFootball(`${endpoint}${separator}page=1`, ttl);
        const total = Math.max(1, Number(first.paging?.total) || 1);
        const remaining = await Promise.all(Array.from({ length: total - 1 }, (_, index) => playerFootball(`${endpoint}${separator}page=${index + 2}`, ttl)));
        return { ...first, response: [first, ...remaining].flatMap(page => page.response || []) };
    };
    const playerOptional = promise => promise.catch(error => {
        if (["API_DAILY_QUOTA", "API_MINUTE_QUOTA"].includes(error.code)) throw error;
        return { response: [] };
    });
    try {
        const fixtureData = await playerFootball(`/fixtures?id=${id}`, 30_000);
        const fixture = fixtureData.response?.[0];
        if (!fixture || fixture.fixture?.id !== id) return res.status(404).json({ status: "error", erro: "Partida não encontrada." });

        const endpoint = `/fixtures/lineups?fixture=${id}`;
        const now = Date.now();
        const hoursUntilKickoff = (new Date(fixture.fixture.date).getTime() - now) / 3_600_000;
        const played = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "FT", "AET", "PEN"].includes(fixture.fixture.status.short);
        const finished = ["FT", "AET", "PEN"].includes(fixture.fixture.status.short);
        const existing = cache.get(endpoint);
        const hasOfficial = Boolean(existing?.data?.response?.length);
        let ttl = hoursUntilKickoff > 24 ? 21_600_000 : hoursUntilKickoff > 1 ? 3_600_000 : hoursUntilKickoff > 0.25 ? 300_000 : 60_000;
        if (hasOfficial) ttl = 21_600_000;

        const refreshRequested = req.query.refresh === "1";
        const lastRefresh = lineupRefreshes.get(id) || 0;
        const force = refreshRequested && now - lastRefresh >= 20_000;
        if (force) lineupRefreshes.set(id, now);
        const cacheHit = !force && Boolean(existing && now - existing.createdAt < ttl);
        console.log(`[LINEUP] fixture=${id} endpoint=${endpoint} cache=${cacheHit ? "HIT" : "MISS"} ttl=${ttl}`);

        let official = await playerFootball(endpoint, ttl, { force });
        let lineups = Array.isArray(official.response) ? official.response : [];
        let lineupSource = cacheHit ? "cache" : "api";
        let lineupCacheState = cacheHit ? "hit" : force ? "refresh" : "miss";
        // Revalidate only an older cached empty response. A fresh cache miss has
        // just called /fixtures/lineups and must not be forced a second time.
        if (shouldRevalidatePlayerLineup({ lineups, force, cacheHit })) {
            const closeToKickoff = hoursUntilKickoff <= 24;
            const revalidationInterval = finished ? 900_000 : hoursUntilKickoff <= 3 ? 60_000 : 300_000;
            const lastRevalidation = lineupRevalidations.get(id) || 0;
            if (closeToKickoff && now - lastRevalidation >= revalidationInterval) {
                lineupRevalidations.set(id, now);
                official = await playerFootball(endpoint, ttl, { force: true });
                lineups = Array.isArray(official.response) ? official.response : [];
                lineupSource = "api";
                lineupCacheState = "refresh";
            }
        }
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
                    playerOptional(playerFootball(`/players/squads?team=${team.id}`, 86_400_000)),
                    confirmationOnly ? Promise.resolve({ response: [] }) : playerOptional(playerFootballAllPages(`/players?team=${team.id}&season=${fixture.league.season}`, 21_600_000)),
                    playerOptional(playerFootball(`/fixtures?team=${team.id}&last=5&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 3_600_000))
                ]);
                const squad = squadResult.response?.[0]?.players || [];
                const currentIds = new Set(squad.map(player => player.id));
                const statsById = new Map((statsResult.response || []).map(item => [item.player.id, selectPlayerStatistics([item], { teamId: team.id, leagueId: fixture.league.id, season: fixture.league.season })]));
                const recentFixtures = (recentResult.response || []).filter(game => game.fixture?.id !== id).slice(0, 3);
                const recentLineups = await Promise.all(recentFixtures.map(game => playerOptional(playerFootball(`/fixtures/lineups?fixture=${game.fixture.id}`, 86_400_000))));
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
            if (confirmationOnly) return res.json({ fixture, fixtureId: id, status: "available", lineupStatus: "official", lineups, probableTeams: [], playerStatsTeams: [], updatedAt, cached: lineupCacheState === "hit" });
            playerStatsTeams = await Promise.all([fixture.teams.home, fixture.teams.away].map(async team => {
                const [squadResult, statsResult] = await Promise.all([
                    playerOptional(playerFootball(`/players/squads?team=${team.id}`, 86_400_000)),
                    playerOptional(playerFootballAllPages(`/players?team=${team.id}&season=${fixture.league.season}`, 21_600_000))
                ]);
                const squad = squadResult.response?.[0]?.players || [];
                const statsById = new Map((statsResult.response || []).map(item => [item.player.id, selectPlayerStatistics([item], { teamId: team.id, leagueId: fixture.league.id, season: fixture.league.season })]));
                return { team, players: squad.map(player => ({ player, statistics: statsById.get(player.id) || null })) };
            }));
        }
        if (confirmationOnly) return res.json({ fixture, fixtureId: id, status, lineupStatus: status === "probable" ? "probable" : "unavailable", lineups, probableTeams, playerStatsTeams: [], updatedAt, cached: lineupCacheState === "hit" });
        if (lineups.length) {
            const official = lineups.flatMap(lineup => [
                ...(lineup.startXI || []).map(item => ({ team: lineup.team, player: item.player })),
                ...(lineup.substitutes || []).map(item => ({ team: lineup.team, player: item.player }))
            ]);
            const statsIndex = new Map(playerStatsTeams.flatMap(team => team.players.filter(item => item.statistics).map(item => [`${team.team.id}:${item.player.id}`, item.statistics])));
            const missing = [...new Map(official.filter(item => !statsIndex.has(`${item.team.id}:${item.player.id}`)).map(item => [`${item.team.id}:${item.player.id}`,item])).values()];
            additionalStatsCalls = missing.length;
            playerStatsDiagnostics = await Promise.all(missing.map(async item => {
                const endpoint = `/players?id=${item.player.id}&season=${fixture.league.season}`;
                const result = await playerOptional(playerFootball(endpoint, 86_400_000));
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
        const lineupStatus = lineups.length ? "official" : probableTeams.some(team => team.players.length >= 11) ? "probable" : "unavailable";
        const fixtureStatus = fixture.fixture.status.short;
        const matchHasStarted = !["NS", "TBD", "PST", "CANC"].includes(fixtureStatus);
        const fixturePlayerTtl = ["1H", "HT", "2H", "ET", "BT", "P", "LIVE"].includes(fixtureStatus) ? 30_000
            : ["FT", "AET", "PEN"].includes(fixtureStatus) ? 21_600_000
            : 60_000;
        const matchPlayers = matchHasStarted
            ? await playerOptional(playerFootball(`/fixtures/players?fixture=${id}`, fixturePlayerTtl, { force }))
            : { response: [] };
        const tablePlayers = lineups.length
            ? lineups.reduce((total, lineup) => total + (lineup.startXI?.length || 0) + (lineup.substitutes?.length || 0), 0)
            : playerStatsTeams.reduce((total, team) => total + team.players.length, 0);
        console.log(`[PLAYER TABLE] source=${lineups.length ? "official" : "probable"} fixture=${id} players=${tablePlayers}`);
        console.log(`[LINEUP] fixture=${id} status=${status}`);
        console.log(`[LINEUP] fixture=${id} source=${lineupSource} status=${lineupStatus} cache=${lineupCacheState}`);
        for (const lineup of lineups) {
            console.log(`[LINEUP] ${lineup.team?.name || lineup.team?.id} startXI=${lineup.startXI?.length || 0} substitutes=${lineup.substitutes?.length || 0} formation=${lineup.formation || "n/a"}`);
        }
        res.json({ fixture, fixtureId: id, status, lineupStatus, lineupSource, lineupCacheState, lineups, probableTeams, playerStatsTeams, matchPlayerStats: matchPlayers.response || [], playerStatsDiagnostics, additionalStatsCalls, updatedAt, cached: lineupCacheState === "hit", refreshAllowedIn: force || !refreshRequested ? 0 : Math.ceil((20_000 - (now - lastRefresh)) / 1000) });
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

        // Regra estrutural do Central Pro: histórico recente pertence ao TIME, não
        // à competição/temporada do jogo atual. O endpoint `last` sem `league`/`season`
        // atravessa copas, ligas e viradas de temporada automaticamente.
        const scannerTeamHistory = async (teamId) => {
            const candidateLimit = Math.max(45, sample * 4);
            return football(`/fixtures?team=${teamId}&last=${candidateLimit}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000);
        };

        const requests = scannerMode
            ? [
                Promise.resolve({ response: [] }),
                scannerTeamHistory(home.id),
                scannerTeamHistory(away.id),
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
        const requestNames = ["h2h", "homeRecent", "awayRecent", "standings", "homeTeamStats", "awayTeamStats"];
        const notApplicable = scannerMode ? new Set(["h2h", "standings", "homeTeamStats", "awayTeamStats"]) : new Set();
        const diagnostics = Object.fromEntries(result.map((item, index) => {
            const name = requestNames[index];
            if (notApplicable.has(name)) return [name, { status: "not_applicable" }];
            if (item.status === "rejected") return [name, { status: "error", error: "Falha na consulta externa.", code: item.reason?.code || "API_ERROR", httpStatus: item.reason?.status || null }];
            const value = item.value.response;
            const empty = value == null || (Array.isArray(value) && value.length === 0);
            return [name, { status: empty ? "empty" : "ok" }];
        }));
        const response = result.map((item, index) => {
            if (item.status === "rejected") return null;
            if (notApplicable.has(requestNames[index])) return null;
            return item.value.response ?? null;
        });
        const rejectedHistory = ["homeRecent", "awayRecent"].filter(name => diagnostics[name].status === "error");
        if (rejectedHistory.length) {
            const quotaFailure = rejectedHistory.some(name => diagnostics[name].code === "API_DAILY_QUOTA");
            console.warn(`[MATCH-ANALYSIS] fixture=${id} failed=${rejectedHistory.join(",")}`);
            return res.status(quotaFailure ? 429 : 502).json({
                erro: "Histórico recente indisponível. Tente novamente em instantes.",
                code: quotaFailure ? "API_DAILY_QUOTA" : "API_TRANSIENT",
                diagnostics
            });
        }
        const selectHistory = (games, team, side, limit = sample) => {
            const seen = new Set();
            return (games || [])
                .filter(game => game?.fixture?.id !== id)
                .filter(game => game?.fixture?.id && !seen.has(game.fixture.id) && seen.add(game.fixture.id))
                .filter(game => ["FT", "AET", "PEN"].includes(game.fixture?.status?.short))
                .filter(game => scannerMode || scope === "all" || (
                    Number(game.league?.id) === Number(leagueId)
                    && [Number(season), Number(season) - 1].includes(Number(game.league?.season))
                ))
                .filter(game => {
                    if (venue === "home-away") return true;
                    const isHome = Number(game.teams?.home?.id) === Number(team.id);
                    return side === "home" ? isHome : !isHome;
                })
                .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
                .slice(0, Math.max(1, Number(limit) || sample));
        };
        const homeSide = venue === "away" ? "away" : "home";
        const awaySide = venue === "home" ? "home" : "away";
        const homeRecent = selectHistory(response[1] || [], home, homeSide);
        const awayRecent = selectHistory(response[2] || [], away, awaySide);

        const parallelRecent = {
            l5: {
                home: selectHistory(response[1] || [], home, homeSide, 5),
                away: selectHistory(response[2] || [], away, awaySide, 5)
            },
            l10: {
                home: selectHistory(response[1] || [], home, homeSide, 10),
                away: selectHistory(response[2] || [], away, awaySide, 10)
            }
        };
        // Contexto casa/fora independente da amostra principal.
        // Mandante: somente partidas em casa; visitante: somente partidas fora.
        const selectVenueHistory = (games, team, side, limit) => {
            const seen = new Set();
            return (games || [])
                .filter(game => game?.fixture?.id !== id)
                .filter(game => game?.fixture?.id && !seen.has(game.fixture.id) && seen.add(game.fixture.id))
                .filter(game => ["FT", "AET", "PEN"].includes(game.fixture?.status?.short))
                .filter(game => scannerMode || scope === "all" || (
                    Number(game.league?.id) === Number(leagueId)
                    && [Number(season), Number(season) - 1].includes(Number(game.league?.season))
                ))
                .filter(game => {
                    const isHome = Number(game.teams?.home?.id) === Number(team.id);
                    return side === "home" ? isHome : !isHome;
                })
                .sort((a, b) => new Date(b.fixture.date) - new Date(a.fixture.date))
                .slice(0, Math.max(1, Number(limit) || 5));
        };
        const venueRecent = {
            l5: {
                home: selectVenueHistory(response[1] || [], home, "home", 5),
                away: selectVenueHistory(response[2] || [], away, "away", 5)
            },
            l10: {
                home: selectVenueHistory(response[1] || [], home, "home", 10),
                away: selectVenueHistory(response[2] || [], away, "away", 10)
            }
        };
        if (scannerMode) {
            const auditGame = (game, teamId) => {
                const isHome = Number(game.teams?.home?.id) === Number(teamId);
                const opponent = isHome ? game.teams?.away?.name : game.teams?.home?.name;
                const goalsFor = isHome ? game.goals?.home : game.goals?.away;
                const goalsAgainst = isHome ? game.goals?.away : game.goals?.home;
                return {
                    fixtureId: Number(game.fixture?.id),
                    date: game.fixture?.date || null,
                    leagueId: Number(game.league?.id),
                    league: game.league?.name || null,
                    season: Number(game.league?.season),
                    opponent: opponent || null,
                    score: Number.isFinite(Number(goalsFor)) && Number.isFinite(Number(goalsAgainst)) ? `${goalsFor}-${goalsAgainst}` : null
                };
            };
            const auditMarketGame = (game, teamId) => {
                const base = auditGame(game, teamId);
                const homeGoals = Number(game.score?.fulltime?.home ?? game.goals?.home);
                const awayGoals = Number(game.score?.fulltime?.away ?? game.goals?.away);
                const totalGoals = Number.isFinite(homeGoals) && Number.isFinite(awayGoals) ? homeGoals + awayGoals : null;
                return {
                    ...base,
                    totalGoals,
                    over05: totalGoals == null ? null : totalGoals > 0.5,
                    over15: totalGoals == null ? null : totalGoals > 1.5
                };
            };
            const homeAudit = homeRecent.map(game => auditMarketGame(game, home.id));
            const awayAudit = awayRecent.map(game => auditMarketGame(game, away.id));
            const combinedByFixture = new Map();
            [...homeAudit, ...awayAudit].forEach(game => { if (game.fixtureId && !combinedByFixture.has(game.fixtureId)) combinedByFixture.set(game.fixtureId, game); });
            const combinedAudit = [...combinedByFixture.values()].sort((a,b) => new Date(b.date) - new Date(a.date));
            const auditHits = key => combinedAudit.filter(game => game[key] === true).length;
            console.log(`[SAMPLE-AUDIT] fixture=${id} teams=${home.id},${away.id} league=${leagueId} season=${season} home=${JSON.stringify(homeAudit)} away=${JSON.stringify(awayAudit)}`);
            console.log(`[SAMPLE-AUDIT-SUMMARY] fixture=${id} unique=${combinedAudit.length} over05=${auditHits("over05")}/${combinedAudit.length} over15=${auditHits("over15")}/${combinedAudit.length} seasons=${[...new Set(combinedAudit.map(game => game.season))].join(",")}`);
        }
        const sampleContext = (games) => {
            const seasonsUsed = [...new Set(games.map(game => Number(game.league?.season)).filter(Number.isInteger))].sort((a,b)=>b-a);
            const currentSeasonGames = games.filter(game => Number(game.league?.season) === Number(season)).length;
            const previousSeasonGames = games.filter(game => Number(game.league?.season) === Number(season) - 1).length;
            return {
                seasonsUsed,
                currentSeasonGames,
                previousSeasonGames,
                transitionSeason: previousSeasonGames > 0
            };
        };

        res.json({
            fixture,
            h2h: response[0] || [],
            homeRecent,
            awayRecent,
            standings: response[3],
            homeTeamStats: response[4] || null,
            awayTeamStats: response[5] || null,
            filters: { sample, venue, scope, mode: scannerMode ? "scanner" : "full" },
            coverage: { home: homeRecent.length, away: awayRecent.length },
            parallelSamples: {
                l5: {
                    homeRecent: parallelRecent.l5.home,
                    awayRecent: parallelRecent.l5.away,
                    coverage: {
                        home: parallelRecent.l5.home.length,
                        away: parallelRecent.l5.away.length
                    }
                },
                l10: {
                    homeRecent: parallelRecent.l10.home,
                    awayRecent: parallelRecent.l10.away,
                    coverage: {
                        home: parallelRecent.l10.home.length,
                        away: parallelRecent.l10.away.length
                    }
                }
            },
            venueSamples: {
                l5: {
                    homeRecent: venueRecent.l5.home,
                    awayRecent: venueRecent.l5.away,
                    coverage: { home: venueRecent.l5.home.length, away: venueRecent.l5.away.length }
                },
                l10: {
                    homeRecent: venueRecent.l10.home,
                    awayRecent: venueRecent.l10.away,
                    coverage: { home: venueRecent.l10.home.length, away: venueRecent.l10.away.length }
                },
                rule: "mandante somente em casa; visitante somente fora; histórico do time atravessa competições e temporadas"
            },
            sampleContext: {
                home: sampleContext(homeRecent),
                away: sampleContext(awayRecent),
                transitionSeason: sampleContext(homeRecent).transitionSeason || sampleContext(awayRecent).transitionSeason,
                currentSeason: season,
                previousSeason: season - 1,
                rule: "histórico recente do time atravessa competições e temporadas até completar a amostra"
            },
            diagnostics
        });
    } catch (erro) {
        console.error(erro);
        res.status(erro.status === 429 ? 429 : 502).json({ erro: "Não foi possível gerar a análise da partida.", detalhe: erro.message, code: erro.code || "API_ERROR", retryAfterMs: erro.retryAfterMs || null });
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
        const historySize = 30;
        const recent = await Promise.all(teams.map(team => football(
            `/fixtures?team=${team.id}&last=${historySize}&timezone=${encodeURIComponent(APP_TIMEZONE)}`,
            900_000
        )));

        const build = async (team, fixtures) => {
            const rows = [];
            const attempts = [];
            for (const fixtureRow of fixtures.response || []) {
                if (rows.length >= sample) break;
                try {
                    const result = await football(`/fixtures/statistics?fixture=${fixtureRow.fixture.id}`, 21_600_000);
                    const blocks = Array.isArray(result.response) ? result.response : [];
                    const teamIds = blocks.map(row => Number(row.team?.id)).filter(Number.isInteger);
                    const own = blocks.find(row => Number(row.team?.id) === Number(team.id));
                    const opponent = blocks.find(row => Number(row.team?.id) !== Number(team.id));
                    const statistics = own?.statistics;
                    const opponentStatistics = opponent?.statistics;
                    const hasTotalShots = Array.isArray(statistics) && statistics.some(item => item.type === "Total Shots" && item.value != null);
                    const hasShotsOnGoal = Array.isArray(statistics) && statistics.some(item => item.type === "Shots on Goal" && item.value != null);
                    const validBlocks = Array.isArray(statistics) && statistics.length && Array.isArray(opponentStatistics) && opponentStatistics.length;
                    const diagnostic = { fixture: fixtureRow.fixture.id, status: validBlocks ? "ok" : "empty", blocks: blocks.length, teamIds, hasTotalShots, hasShotsOnGoal };
                    attempts.push(diagnostic);
                    console.log(`[MATCH-STATS-REQUEST] fixture=${fixtureRow.fixture.id} status=${diagnostic.status} blocks=${blocks.length} teams=${teamIds.join(",") || "none"} totalShots=${hasTotalShots} shotsOnGoal=${hasShotsOnGoal}`);
                    if (!validBlocks) continue;
                    rows.push({ fixture: fixtureRow, statistics, opponentStatistics, status: "ok" });
                } catch (error) {
                    attempts.push({ fixture: fixtureRow.fixture.id, status: "error", blocks: 0, teamIds: [], hasTotalShots: false, hasShotsOnGoal: false, error: "Falha na consulta externa.", errorCode: "request_failed" });
                    console.warn(`[MATCH-STATS-REQUEST] fixture=${fixtureRow.fixture.id} status=error blocks=0 teams=none totalShots=false shotsOnGoal=false`);
                }
            }
            return { rows, attempts };
        };

        const select = (games, team, side) => ({ response: (games.response || [])
            .filter(game => game.fixture.id !== id)
            .filter(game => ["FT", "AET", "PEN"].includes(game.fixture.status?.short))
            .filter(game => new Date(game.fixture.date).getTime() < new Date(fixture.fixture.date).getTime())
            .filter(game => scope === "all" || game.league.id === fixture.league.id)
            .filter(game => venue === "home-away" || (side === "home" ? game.teams.home.id === team.id : game.teams.away.id === team.id))
        });
        const [homeResult, awayResult] = await Promise.all([
            build(teams[0], select(recent[0], teams[0], "home")),
            build(teams[1], select(recent[1], teams[1], "away"))
        ]);
        const home = homeResult.rows;
        const away = awayResult.rows;
        const shotCovered = rows => rows.filter(row => row.statistics.some(item => item.type === "Total Shots" && item.value != null)).length;
        const homeCovered = shotCovered(home);
        const awayCovered = shotCovered(away);
        const requested = homeResult.attempts.length + awayResult.attempts.length;
        const successful = home.length + away.length;
        const failed = requested - successful;
        const diagnostics = {
            requested,
            successful,
            failed,
            home: { requested: homeResult.attempts.length, successful: home.length, failed: homeResult.attempts.length - home.length, attempts: homeResult.attempts },
            away: { requested: awayResult.attempts.length, successful: away.length, failed: awayResult.attempts.length - away.length, attempts: awayResult.attempts }
        };
        console.log(`[MATCH-STATS] fixture=${id} home=${homeCovered}/${home.length} away=${awayCovered}/${away.length} failed=${failed}`);
        const allAttempts = [...homeResult.attempts, ...awayResult.attempts];
        const allExternalRequestsRejected = allAttempts.length > 0 && allAttempts.every(row => row.errorCode === "request_failed");
        if (allExternalRequestsRejected) return res.status(502).json({
            erro: "Estatísticas avançadas temporariamente indisponíveis.",
            diagnostics
        });
        res.json({ sample, venue, scope, home, away, coverage: { home: homeCovered, away: awayCovered }, diagnostics });
    } catch (erro) {
        console.error(erro);
        res.status(502).json({ erro: "Estatísticas avançadas indisponíveis.", detalhe: erro.message });
    }
});

app.get("/api/partidas/:id/cartoes", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ erro: "ID da partida inválido." });
    const sample = 5;
    const historyLimit = 30;
    try {
        const fixtureResponse = await football(`/fixtures?id=${id}`, 30_000);
        const fixture = fixtureResponse.response?.[0];
        if (!fixture) return res.status(404).json({ erro: "Partida não encontrada." });
        const fixtureTime = new Date(fixture.fixture.date).getTime();
        const teams = [fixture.teams.home, fixture.teams.away];
        const histories = await Promise.all(teams.map(team => football(
            `/fixtures?team=${team.id}&last=${historyLimit}&timezone=${encodeURIComponent(APP_TIMEZONE)}`,
            900_000
        )));
        const candidatesFor = history => (history.response || [])
            .filter(game => game.fixture.id !== id)
            .filter(game => ["FT", "AET", "PEN"].includes(game.fixture.status?.short))
            .filter(game => new Date(game.fixture.date).getTime() < fixtureTime);
        const collect = async (team, candidates) => {
            const rows = [];
            const diagnostics = { candidates: candidates.length, requested: 0, successfulRequests: 0, emptyResponses: 0, persistentEmptyHits: 0, validCardMatches: 0, failedRequests: 0, eventRequests: 0, eventFailedRequests: 0, periodMismatches: 0, periodCoverage: 0 };
            for (const game of candidates) {
                if (rows.length >= sample) break;
                const cachedFixtureStatistics = cornerHistoryStore.fixtures[game.fixture.id];
                const reusableEmpty = cachedFixtureStatistics
                    && !cachedFixtureStatistics.complete
                    && !cachedFixtureStatistics.teams?.length
                    && cachedFixtureStatistics.retryAfter
                    && new Date(cachedFixtureStatistics.retryAfter) > new Date();
                if (reusableEmpty) {
                    diagnostics.emptyResponses++;
                    diagnostics.persistentEmptyHits++;
                    continue;
                }
                diagnostics.requested++;
                let statisticsResult;
                try {
                    statisticsResult = await cornerFootball(`/fixtures/statistics?fixture=${game.fixture.id}`, 21_600_000);
                    diagnostics.successfulRequests++;
                } catch (error) {
                    diagnostics.failedRequests++;
                    continue;
                }
                const blocks = Array.isArray(statisticsResult.response) ? statisticsResult.response : [];
                const ownBlock = blocks.find(block => Number(block.team?.id) === Number(team.id));
                const opponentTeamId = Number(game.teams.home.id) === Number(team.id) ? game.teams.away.id : game.teams.home.id;
                const opponentBlock = blocks.find(block => Number(block.team?.id) === Number(opponentTeamId));
                const ownTotal = statisticNumber(ownBlock?.statistics, "Yellow Cards");
                const opponentTotal = statisticNumber(opponentBlock?.statistics, "Yellow Cards");
                if (ownTotal == null || opponentTotal == null) {
                    diagnostics.emptyResponses++;
                    continue;
                }
                let ownFirst = null;
                let ownSecond = null;
                let opponentFirst = null;
                let opponentSecond = null;
                try {
                    diagnostics.eventRequests++;
                    const eventsResult = await cornerFootball(`/fixtures/events?fixture=${game.fixture.id}`, 21_600_000);
                    const yellowEvents = (eventsResult.response || []).filter(event => event.type === "Card" && event.detail === "Yellow Card");
                    const count = (teamId, firstHalf) => yellowEvents.filter(event => {
                        const elapsed = Number(event.time?.elapsed);
                        return Number(event.team?.id) === Number(teamId) && (firstHalf ? elapsed <= 45 : elapsed > 45 && elapsed <= 90);
                    }).length;
                    const opponentId = opponentBlock.team.id;
                    const countedOwnFirst = count(team.id, true);
                    const countedOwnSecond = count(team.id, false);
                    const countedOpponentFirst = count(opponentId, true);
                    const countedOpponentSecond = count(opponentId, false);
                    if (countedOwnFirst + countedOwnSecond === ownTotal && countedOpponentFirst + countedOpponentSecond === opponentTotal) {
                        ownFirst = countedOwnFirst;
                        ownSecond = countedOwnSecond;
                        opponentFirst = countedOpponentFirst;
                        opponentSecond = countedOpponentSecond;
                        diagnostics.periodCoverage++;
                    } else diagnostics.periodMismatches++;
                } catch (error) {
                    // O total permanece válido; somente a cobertura por período fica ausente.
                    diagnostics.eventFailedRequests++;
                }
                rows.push({
                    fixtureId: game.fixture.id,
                    date: game.fixture.date,
                    leagueId: game.league.id,
                    season: game.league.season,
                    own: { total: ownTotal, first: ownFirst, second: ownSecond },
                    opponent: { total: opponentTotal, first: opponentFirst, second: opponentSecond },
                    total: { total: ownTotal + opponentTotal, first: ownFirst == null || opponentFirst == null ? null : ownFirst + opponentFirst, second: ownSecond == null || opponentSecond == null ? null : ownSecond + opponentSecond }
                });
            }
            diagnostics.validCardMatches = rows.length;
            return { rows, diagnostics };
        };
        const [homeResult, awayResult] = await Promise.all([
            collect(teams[0], candidatesFor(histories[0])),
            collect(teams[1], candidatesFor(histories[1]))
        ]);
        console.log(`[CARD-STATS] fixture=${id} team=${teams[0].id} candidates=${homeResult.diagnostics.candidates} valid=${homeResult.rows.length} empty=${homeResult.diagnostics.emptyResponses} failed=${homeResult.diagnostics.failedRequests}`);
        console.log(`[CARD-STATS] fixture=${id} team=${teams[1].id} candidates=${awayResult.diagnostics.candidates} valid=${awayResult.rows.length} empty=${awayResult.diagnostics.emptyResponses} failed=${awayResult.diagnostics.failedRequests}`);
        const requested = homeResult.diagnostics.requested + awayResult.diagnostics.requested;
        const failedRequests = homeResult.diagnostics.failedRequests + awayResult.diagnostics.failedRequests;
        if (requested > 0 && failedRequests === requested) return res.status(502).json({
            erro: "Histórico de cartões temporariamente indisponível.",
            diagnostics: { home: homeResult.diagnostics, away: awayResult.diagnostics }
        });
        res.json({
            sample,
            fixtureId: id,
            home: homeResult.rows,
            away: awayResult.rows,
            coverage: { home: homeResult.rows.length, away: awayResult.rows.length },
            periodCoverage: { home: homeResult.diagnostics.periodCoverage, away: awayResult.diagnostics.periodCoverage },
            diagnostics: { home: homeResult.diagnostics, away: awayResult.diagnostics },
            source: "fixture-statistics-and-events"
        });
    } catch (erro) {
        console.error("Histórico de cartões:", erro.message);
        res.status(502).json({ erro: "Histórico de cartões indisponível.", detalhe: erro.message });
    }
});

app.get("/api/partidas/:id/escanteios", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const homeId = Number.parseInt(req.query.home, 10);
    const awayId = Number.parseInt(req.query.away, 10);
    if (![id, homeId, awayId].every(Number.isInteger)) return res.status(400).json({ erro: "Partida ou times inválidos." });
    const sample = 5;
    const historyLimit = 30;
    try {
        const startedAt = Date.now();
        const fixtureResponse = await cornerFootball(`/fixtures?id=${id}`, 30_000);
        const currentFixture = fixtureResponse.response?.[0];
        if (!currentFixture) return res.status(404).json({ erro: "Partida não encontrada." });
        if (currentFixture.teams.home.id !== homeId || currentFixture.teams.away.id !== awayId) {
            return res.status(400).json({ erro: "Times informados não correspondem à partida." });
        }
        const fixtureTime = new Date(currentFixture.fixture.date).getTime();
        const [homeHistory, awayHistory] = await Promise.all([
            cornerFootball(`/fixtures?team=${homeId}&last=${historyLimit}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000),
            cornerFootball(`/fixtures?team=${awayId}&last=${historyLimit}&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000)
        ]);
        const finished = game => game.fixture?.id !== id
            && ["FT", "AET", "PEN"].includes(game.fixture?.status?.short)
            && new Date(game.fixture?.date).getTime() < fixtureTime;
        const homeGames = (homeHistory.response || []).filter(finished);
        const awayGames = (awayHistory.response || []).filter(finished);
        let changed = false;
        const collect = async (games, teamId) => {
            const rows = [];
            let inspected = 0;
            let requested = 0;
            let successfulRequests = 0;
            let emptyResponses = 0;
            let persistentHits = 0;
            let failedRequests = 0;
            for (const game of games) {
                if (rows.length >= sample) break;
                inspected++;
                const existing = cornerHistoryStore.fixtures[game.fixture.id];
                const expectedIds = [game.teams.home.id, game.teams.away.id].map(Number).sort((a, b) => a - b);
                const cachedIds = (existing?.teams || []).map(team => Number(team.teamId)).sort((a, b) => a - b);
                const compatibleComplete = existing?.complete
                    && existing.fixture?.date === game.fixture.date
                    && expectedIds.every((id, index) => id === cachedIds[index])
                    && existing.teams.every(team => Number.isFinite(team.corners));
                const emptyTemporaryFailure = !existing?.teams?.length && Date.now() - new Date(existing?.updatedAt || 0).getTime() >= 60_000;
                const reusableIncomplete = !existing?.complete
                    && existing?.retryAfter
                    && new Date(existing.retryAfter) > new Date()
                    && !emptyTemporaryFailure;
                const reusable = compatibleComplete || reusableIncomplete;
                if (reusable) persistentHits++;
                else requested++;
                const before = cornerHistoryStore.fixtures[game.fixture.id]?.updatedAt;
                const record = await cornerRecord(game);
                if (record?.updatedAt !== before) changed = true;
                if (!reusable) {
                    if (record?.errorType) failedRequests++;
                    else successfulRequests++;
                }
                if (!record?.complete) {
                    if (!record?.errorType) emptyResponses++;
                    continue;
                }
                const own = record.teams.find(team => Number(team.teamId) === Number(teamId))?.corners;
                const opponent = record.teams.find(team => Number(team.teamId) !== Number(teamId))?.corners;
                if (own == null || opponent == null) continue;
                rows.push({ fixtureId: game.fixture.id, date: game.fixture.date, leagueId: game.league.id, season: game.league.season, own, opponent, total: own + opponent });
            }
            return { rows, candidates: games.length, inspected, requested, successfulRequests, emptyResponses, persistentHits, failedRequests, validCornerMatches: rows.length };
        };
        const [homeResult, awayResult] = await Promise.all([
            collect(homeGames, homeId),
            collect(awayGames, awayId)
        ]);
        if (changed) saveCornerHistoryStore();
        const home = homeResult.rows;
        const away = awayResult.rows;
        const coverage = { home: home.length, away: away.length };
        const hasErrors = homeResult.failedRequests + awayResult.failedRequests > 0;
        const status = home.length === sample && away.length === sample ? "available"
            : home.length || away.length ? "small-sample"
            : hasErrors ? "error" : "insufficient";
        const diagnostics = {
            historyLimit,
            home: { ...homeResult, rows: undefined },
            away: { ...awayResult, rows: undefined },
            candidates: homeResult.candidates + awayResult.candidates,
            requested: homeResult.requested + awayResult.requested,
            successfulRequests: homeResult.successfulRequests + awayResult.successfulRequests,
            emptyResponses: homeResult.emptyResponses + awayResult.emptyResponses,
            validCornerMatches: homeResult.validCornerMatches + awayResult.validCornerMatches,
            failedRequests: homeResult.failedRequests + awayResult.failedRequests,
            persistentHits: homeResult.persistentHits + awayResult.persistentHits,
            elapsedMs: Date.now() - startedAt
        };
        console.log(`[CORNER-STATS] fixture=${id} team=${homeId} candidates=${homeResult.candidates} requested=${homeResult.requested} valid=${home.length} empty=${homeResult.emptyResponses} failed=${homeResult.failedRequests}`);
        console.log(`[CORNER-STATS] fixture=${id} team=${awayId} candidates=${awayResult.candidates} requested=${awayResult.requested} valid=${away.length} empty=${awayResult.emptyResponses} failed=${awayResult.failedRequests}`);
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
        console.error("Histórico de escanteios:", erro.message);
        res.status(502).json({ erro: "Histórico de escanteios indisponível.", detalhe: erro.message });
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
    const maxExternalRequests = 14;
    const budgetedFootball = async (endpoint, ttl) => {
        if (metrics.externalRequests - externalStart >= maxExternalRequests) {
            stoppedByLimit = true;
            return null;
        }
        return rateLimitedPlayerFootball(endpoint, ttl);
    };
    try {
        const currentData = await budgetedFootball(`/fixtures?id=${fixtureId}`, 30_000);
        const current = currentData?.response?.[0];
        if (!current) return res.status(404).json({ erro: "Partida piloto não encontrada." });
        const historyByTeam = [];
        for (const team of [current.teams.home, current.teams.away]) {
            const history = await budgetedFootball(`/fixtures?team=${team.id}&last=30&timezone=${encodeURIComponent(APP_TIMEZONE)}`, 900_000);
            if (!history) break;
            historyByTeam.push(...(history.response || []));
        }
        const candidates = [...new Map(historyByTeam
            .filter(game => game.fixture.id !== fixtureId)
            .filter(game => new Date(game.fixture.date).getTime() < new Date(current.fixture.date).getTime())
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
                    fixture: { id: game.fixture.id, date: game.fixture.date, status: game.fixture.status.short, league: game.league, teams: game.teams },
                    players: {},
                    complete: false,
                    updatedAt: new Date().toISOString(),
                    retryAfter: new Date(Date.now() + 21_600_000).toISOString(),
                    source: "/fixtures/players"
                };
                await savePlayerHistoryStore();
                continue;
            }
            playerHistoryStore.fixtures[game.fixture.id] = {
                fixture: { id: game.fixture.id, date: game.fixture.date, status: game.fixture.status.short, league: game.league, teams: game.teams },
                players,
                complete: true,
                updatedAt: new Date().toISOString(),
                source: "/fixtures/players"
            };
            stored.push(game.fixture.id);
            await savePlayerHistoryStore();
        }
        const relevantTeamIds = new Set([current.teams.home.id, current.teams.away.id]);
        await savePlayerHistoryStore();
        const allRelevantPlayers = Object.values(playerHistoryStore.fixtures).flatMap(record => Object.values(record.players || {})).filter(player => relevantTeamIds.has(Number(player.teamId)));
        const playerIds = new Set(allRelevantPlayers.map(player => player.playerId));
        const coverage = [...playerIds].map(playerId => {
            const teamId = allRelevantPlayers.find(player => player.playerId === playerId)?.teamId;
            return { playerId, games: getPlayerRecentGames(playerId, { teamId, before: current.fixture.date, limit: 5 }).length };
        });
        res.json({
            fixtureId,
            endpoint: "/fixtures/players?fixture={fixtureId}",
            candidates: candidates.length,
            storedFixtures: stored,
            externalRequests: metrics.externalRequests - externalStart,
            memoryCacheHits: metrics.cacheHits - cacheStart,
            persistentCacheHits: persistentHits,
            stoppedByLimit,
            maxExternalRequests,
            chronologicalRule: { before: current.fixture.date, statuses: ["FT", "AET", "PEN"], futureFixturesAllowed: false },
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

app.get("/api/partidas/:id/jogadores-recentes", async (req, res) => {
    const fixtureId = Number(req.params.id);
    const scannerLeagueId = Number(req.query.league);
    const externalStart = metrics.externalRequests;
    const cacheStart = metrics.cacheHits;
    let stage = "validation";
    if (!Number.isSafeInteger(fixtureId) || fixtureId <= 0) return res.status(400).json({ erro: "Partida inválida." });
    if (req.query.mode === "scanner" && (!Number.isSafeInteger(scannerLeagueId) || !cpIsScannerEligibleLeagueId(scannerLeagueId))) return res.status(403).json({ erro: "Competição fora da whitelist do scanner." });
    const confirmation = String(req.query.confirmation || "");
    if (req.query.mode === "scanner" && !["official", "probable"].includes(confirmation)) return res.status(409).json({ erro: "Fixture sem confirmação oficial ou provável.", code: "PLAYER_CONFIRMATION_REQUIRED" });
    try {
        stage = "fixture";
        const fixtureData = await rateLimitedPlayerFootball(`/fixtures?id=${fixtureId}`, 30_000);
        const fixture = fixtureData.response?.[0];
        if (!fixture) return res.status(404).json({ erro: "Partida não encontrada." });
        const before = fixture.fixture.date;
        const beforeTime = new Date(before).getTime();
        const scannerMode = req.query.mode === "scanner";
        stage = scannerMode ? "confirmed-players" : "lineups";
        const parsePlayerIds = value => new Set(String(value || "").split(",").map(Number).filter(id => Number.isSafeInteger(id) && id > 0));
        let relevantByTeam;
        if (scannerMode) {
            relevantByTeam = new Map([
                [fixture.teams.home.id, parsePlayerIds(req.query.homePlayers)],
                [fixture.teams.away.id, parsePlayerIds(req.query.awayPlayers)]
            ]);
            if ([...relevantByTeam.values()].some(ids => ids.size === 0)) return res.status(409).json({ erro: "Confirmação sem jogadores utilizáveis.", code: "PLAYER_CONFIRMATION_EMPTY" });
        } else {
            const lineupData = await rateLimitedPlayerFootball(`/fixtures/lineups?fixture=${fixtureId}`, 300_000).catch(() => ({ response: [] }));
            relevantByTeam = new Map([fixture.teams.home, fixture.teams.away].map(team => {
                const lineup = (lineupData.response || []).find(item => Number(item.team?.id) === Number(team.id));
                return [team.id, new Set([...(lineup?.startXI || []), ...(lineup?.substitutes || [])].map(item => Number(item.player?.id)).filter(Number.isSafeInteger))];
            }));
        }
        const diagnostics = [];
        for (const team of [fixture.teams.home, fixture.teams.away]) {
            stage = `history-team-${team.id}`;
            diagnostics.push(await ensureTeamPlayerHistory(fixture, team, relevantByTeam.get(team.id), 5, 30));
        }
        stage = "payload";
        const teams = [fixture.teams.home, fixture.teams.away].map(team => {
            const relevantIds = relevantByTeam.get(team.id) || new Set();
            const playerIds = new Set(Object.values(playerHistoryStore.fixtures)
                .filter(record => record.complete && new Date(record.fixture?.date).getTime() < beforeTime)
                .flatMap(record => Object.values(record.players || {}))
                .filter(player => Number(player.teamId) === Number(team.id) && Number(player.minutes) > 0)
                .filter(player => !relevantIds.size || relevantIds.has(Number(player.playerId)))
                .map(player => player.playerId));
            const players = [...playerIds].map(playerId => buildPlayerRecentPayload(playerId, team.id, before, 5))
                .filter(player => player.participationGames > 0);
            return {
                team,
                players,
                markets: Object.fromEntries(Object.keys(PLAYER_MARKETS).map(market => [market, selectPlayerMarketLeaders(players, market, 5)]))
            };
        });
        res.json({
            fixtureId,
            before,
            fixture,
            teams,
            selection: {
                participation: "minutes > 0 em fixture anterior e concluída",
                markets: "média, frequência, minutos e cobertura; sem score composto",
                maximumPerMarket: 5,
                candidateWindow: 30,
                crossCompetitionAndSeason: true
            },
            diagnostics,
            requests: { external: metrics.externalRequests - externalStart, memoryCacheHits: metrics.cacheHits - cacheStart, fixturePlayers: diagnostics.reduce((sum, item) => sum + item.requested, 0) },
            source: "persistent-fixture-player-cache"
        });
    } catch (erro) {
        console.error(`[PLAYER-HISTORY-ERROR] fixture=${fixtureId} stage=${stage} error=${erro.message}\n${erro.stack || ""}`);
        const quota = ["API_DAILY_QUOTA", "API_MINUTE_QUOTA"].includes(erro.code);
        res.status(quota ? 429 : 502).json({ erro: "Histórico recente de jogadores indisponível.", detalhe: erro.message, code: erro.code || "API_TRANSIENT", retryAfterMs: erro.retryAfterMs || null });
    }
});

app.get("/api/jogadores/:id/recentes", async (req, res) => {
    const playerId = Number(req.params.id);
    const fixtureId = Number(req.query.fixture);
    if (!Number.isSafeInteger(playerId) || playerId <= 0 || !Number.isSafeInteger(fixtureId) || fixtureId <= 0) {
        return res.status(400).json({ erro: "Jogador e fixture de referência são obrigatórios." });
    }
    try {
        const fixtureData = await football(`/fixtures?id=${fixtureId}`, 30_000);
        const fixture = fixtureData.response?.[0];
        if (!fixture) return res.status(404).json({ erro: "Partida de referência não encontrada." });
        const team = [fixture.teams.home, fixture.teams.away].find(item => Object.values(playerHistoryStore.fixtures)
            .some(record => Number(record.players?.[playerId]?.teamId) === Number(item.id)));
        if (!team) return res.status(404).json({ erro: "Jogador sem histórico nos times da partida." });
        const payload = buildPlayerRecentPayload(playerId, team.id, fixture.fixture.date, 5);
        const referenceTime = new Date(fixture.fixture.date).getTime();
        const referenceStatus = fixture.fixture.status?.short;
        const referenceContext = ["FT", "AET", "PEN"].includes(referenceStatus) ? "historical"
            : referenceTime > Date.now() ? "upcoming" : "current";
        res.json({
            ...payload,
            team,
            referenceFixture: fixture,
            referenceContext,
            nextFixture: null,
            source: "persistent-fixture-player-cache"
        });
    } catch (erro) {
        res.status(502).json({ erro: "Histórico do jogador indisponível.", detalhe: erro.message });
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

function startServer() {
    return app.listen(PORT, () => {
        console.log(`Servidor iniciado na porta ${PORT}`);
        if (isCentralProOffline()) {
            console.log("====================================");
            console.log("CENTRAL PRO — OFFLINE MODE");
            console.log("External API requests: BLOCKED");
            console.log("====================================");
        }
        monitorMainLeagues();
    });
}

if (require.main === module) startServer();

module.exports = app;
app.locals.offlineTest = { football, rateLimitedPlayerFootball, playerRateLimiter, apiQuotaState, shouldRevalidatePlayerLineup, ensureTeamPlayerHistory, teamPlayerHistoryBuilds, playerHistoryStore, playerHistoryPersister, monitorMainLeagues, metrics };
