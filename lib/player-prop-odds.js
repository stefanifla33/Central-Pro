"use strict";

const BOOKMAKERS = Object.freeze([{ id: 32, name: "Betano" }, { id: 8, name: "Bet365" }]);
const MAX_QUOTE_AGE_MS = 12 * 60 * 60_000;
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const validOdd = odd => /^\d+(?:\.\d+)?$/.test(String(odd || "")) && Number(odd) > 1;

function marketKey(name) {
  const n = normalize(name);
  if (n.includes("player shots on target")) return "shotsOnGoal";
  if (n.includes("player shots") && !n.includes("on target") && !n.endsWith("shots total")) return "shotsTotal";
  if (n.includes("player assist") || n.includes("to assist")) return "assists";
  if (n.includes("goal scorer") || n.includes("goalscorer") || n.includes("to score")) return "goals";
  return null;
}

function splitSelection(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(.*?)\s*-\s*(\d+(?:\.5)?)\s*$/i);
  return match ? { raw, name: match[1].trim(), shown: Number(match[2]) } : { raw, name: raw, shown: null };
}

function parseSelection(value, playerName, metric) {
  const parsed = splitSelection(value);
  const wanted = normalize(playerName);
  // Use exact normalized player-name equality. `startsWith` can associate a
  // quote with another player when providers abbreviate or share name prefixes.
  if (!wanted || normalize(parsed.name) !== wanted) return null;
  if (parsed.shown != null) {
    // API-Sports/Bet365 represents "Player - 1" as 1+ occurrence, therefore
    // the equivalent betting line shown by Central Pro is over 0.5.
    return { threshold: Math.max(0.5, parsed.shown - 0.5), selection: parsed.raw };
  }
  if (metric === "goals" || metric === "assists") return { threshold: 0.5, selection: parsed.raw };
  return null;
}

function mapPlayerPropQuotes(records, fixtureId, playerName, now = Date.now()) {
  const grouped = new Map();
  for (const record of records || []) {
    const updated = Date.parse(record.update);
    if (Number(record.fixture?.id) !== Number(fixtureId) || !Number.isFinite(updated) || updated > now + 60_000 || now - updated >= MAX_QUOTE_AGE_MS) continue;
    for (const book of record.bookmakers || []) {
      if (!BOOKMAKERS.some(x => x.id === book.id && x.name === book.name)) continue;
      for (const bet of book.bets || []) {
        const metric = marketKey(bet.name); if (!metric) continue;
        for (const value of bet.values || []) {
          if (!validOdd(value.odd)) continue;
          const parsed = parseSelection(value.value, playerName, metric); if (!parsed) continue;
          const key = `${metric}:${parsed.threshold}:${book.id}`;
          const quote = { metric, threshold: parsed.threshold, bookmakerId: book.id, bookmaker: book.name, odd: String(value.odd), marketId: bet.id, market: bet.name, selection: parsed.selection, update: record.update };
          const current = grouped.get(key);
          if (!current || Date.parse(quote.update) > Date.parse(current.update)) grouped.set(key, quote);
        }
      }
    }
  }
  return [...grouped.values()].sort((a,b) => a.metric.localeCompare(b.metric) || a.threshold-b.threshold || a.bookmakerId-b.bookmakerId);
}
module.exports = { BOOKMAKERS, mapPlayerPropQuotes, marketKey, parseSelection, splitSelection };
