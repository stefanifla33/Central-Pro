(function (root, factory) {
  const config = factory();
  if (typeof module === "object" && module.exports) module.exports = config;
  else Object.assign(root, config);
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const CP_COMPETITIONS = Object.freeze([
    { id: 2, name: "UEFA Champions League", category: "main" },
    { id: 3, name: "UEFA Europa League", category: "main" },
    { id: 11, name: "CONMEBOL Sudamericana", category: "main" },
    { id: 13, name: "CONMEBOL Libertadores", category: "main" },
    { id: 39, name: "Premier League", category: "main" },
    { id: 61, name: "Ligue 1", category: "main" },
    { id: 71, name: "Brasileirão Série A", category: "main" },
    { id: 72, name: "Brasileirão Série B", category: "main" },
    { id: 73, name: "Copa do Brasil", category: "main" },
    { id: 78, name: "Bundesliga", category: "main" },
    { id: 135, name: "Serie A", category: "main" },
    { id: 140, name: "La Liga", category: "main" },
    { id: 848, name: "UEFA Conference League", category: "main" },
    { id: 40, name: "Championship", category: "relevant" },
    { id: 79, name: "2. Bundesliga", category: "relevant" },
    { id: 88, name: "Eredivisie", category: "relevant" },
    { id: 94, name: "Primeira Liga", category: "relevant" },
    { id: 98, name: "J1 League", category: "relevant" },
    { id: 128, name: "Liga Profesional Argentina", category: "relevant" },
    { id: 144, name: "Jupiler Pro League", category: "relevant" },
    { id: 179, name: "Scottish Premiership", category: "relevant" },
    { id: 203, name: "Süper Lig", category: "relevant" },
    { id: 253, name: "Major League Soccer", category: "relevant" },
    { id: 262, name: "Liga MX", category: "relevant" },
    { id: 307, name: "Saudi Pro League", category: "relevant" }
  ]);
  const CP_MAIN_LEAGUES = new Set(CP_COMPETITIONS.filter(item => item.category === "main").map(item => item.id));
  const CP_RELEVANT_LEAGUES = new Set(CP_COMPETITIONS.filter(item => item.category === "relevant").map(item => item.id));
  const CP_FEATURED_LEAGUES = new Set(CP_COMPETITIONS.map(item => item.id));
  const CP_PRIORITY_ORDER = CP_COMPETITIONS.map(item => item.id);
  const CP_YOUTH_LEAGUE_PATTERN = /\b(?:U[\s-]?(?:17|18|19|20|21|23)|SUB[\s-]?(?:17|18|19|20|21|23)|YOUTH|RESERVES?|RESERVAS?|JUNIORS?|JUVENIL(?:ES)?)\b/i;
  const cpIsExcludedLeague = league => CP_YOUTH_LEAGUE_PATTERN.test(`${league?.name || ""} ${league?.type || ""}`);
  const cpLeagueMatchesMode = (league, mode) => !cpIsExcludedLeague(league) && (
    mode === "all" ||
    mode === "main" && CP_MAIN_LEAGUES.has(league?.id) ||
    mode === "featured" && CP_FEATURED_LEAGUES.has(league?.id)
  );
  return { CP_COMPETITIONS, CP_MAIN_LEAGUES, CP_RELEVANT_LEAGUES, CP_FEATURED_LEAGUES, CP_PRIORITY_ORDER, CP_YOUTH_LEAGUE_PATTERN, cpIsExcludedLeague, cpLeagueMatchesMode };
}));
