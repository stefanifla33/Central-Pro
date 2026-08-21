(function () {
  'use strict';

  const STORAGE_KEY = 'centralPro.bankroll.v1';
  const RESULTS = new Set(['pending', 'green', 'red', 'void']);

  function emptyState() {
    return { version: 1, initialBankroll: null, entries: [] };
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyState();
      return {
        version: 1,
        initialBankroll: parsed.initialBankroll == null ? null : Math.max(0, number(parsed.initialBankroll)),
        entries: parsed.entries.filter(Boolean)
      };
    } catch (_) {
      return emptyState();
    }
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function setInitialBankroll(value) {
    const state = load();
    state.initialBankroll = Math.max(0, number(value));
    return save(state);
  }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeEntry(input, existing) {
    const result = RESULTS.has(input.result) ? input.result : 'pending';
    return {
      id: existing?.id || createId(),
      date: String(input.date || ''),
      competition: String(input.competition || '').trim(),
      match: String(input.match || '').trim(),
      market: String(input.market || '').trim(),
      selection: String(input.selection || '').trim(),
      odd: Math.max(0, number(input.odd)),
      stake: Math.max(0, number(input.stake)),
      result,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function upsertEntry(input) {
    const state = load();
    const index = state.entries.findIndex((entry) => entry.id === input.id);
    const existing = index >= 0 ? state.entries[index] : null;
    const normalized = normalizeEntry(input, existing);
    if (index >= 0) state.entries[index] = normalized;
    else state.entries.push(normalized);
    return save(state);
  }

  function removeEntry(id) {
    const state = load();
    state.entries = state.entries.filter((entry) => entry.id !== id);
    return save(state);
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    return emptyState();
  }

  function profit(entry) {
    const stake = number(entry.stake);
    if (entry.result === 'green') return stake * (number(entry.odd) - 1);
    if (entry.result === 'red') return -stake;
    return 0;
  }

  function calculate(state = load()) {
    const entries = state.entries;
    const settled = entries.filter((entry) => entry.result !== 'pending');
    const counts = { green: 0, red: 0, void: 0, pending: 0 };
    entries.forEach((entry) => { counts[entry.result] += 1; });

    const netProfit = settled.reduce((sum, entry) => sum + profit(entry), 0);
    const settledStake = settled.reduce((sum, entry) => sum + number(entry.stake), 0);
    const totalStake = entries.reduce((sum, entry) => sum + number(entry.stake), 0);
    const averageOdd = entries.length
      ? entries.reduce((sum, entry) => sum + number(entry.odd), 0) / entries.length
      : 0;
    const decided = counts.green + counts.red;

    return {
      initialBankroll: state.initialBankroll,
      currentBankroll: state.initialBankroll == null ? null : state.initialBankroll + netProfit,
      netProfit,
      roi: settledStake ? (netProfit / settledStake) * 100 : 0,
      totalStake,
      settledStake,
      averageOdd,
      hitRate: decided ? (counts.green / decided) * 100 : 0,
      counts
    };
  }

  function evolution(state = load()) {
    if (state.initialBankroll == null) return [];
    let balance = state.initialBankroll;
    const points = [{ label: 'Inicial', value: balance }];
    state.entries
      .filter((entry) => entry.result !== 'pending')
      .slice()
      .sort((a, b) => `${a.date}|${a.createdAt}`.localeCompare(`${b.date}|${b.createdAt}`))
      .forEach((entry) => {
        balance += profit(entry);
        points.push({ label: entry.date, value: balance, id: entry.id });
      });
    return points;
  }

  window.BankrollStore = {
    load,
    setInitialBankroll,
    upsertEntry,
    removeEntry,
    reset,
    profit,
    calculate,
    evolution
  };
}());
