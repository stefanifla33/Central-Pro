(function () {
  'use strict';

  const LEGACY_KEY = 'centralPro.bankroll.v1';
  const STORAGE_PREFIX = 'centralPro.bankroll.v2.';
  const QUEUE_PREFIX = 'centralPro.bankroll.syncQueue.v1.';
  const MIGRATION_PREFIX = 'centralPro.bankroll.cloudMigrated.v1.';
  const RESULTS = new Set(['pending', 'green', 'red', 'void']);
  let currentUserId = '';
  let initialized = false;
  let flushing = null;
  let refreshTimer = null;
  let syncStatus = { state: 'local', message: 'Preparando sincronização…' };

  function emptyState() {
    return { version: 2, initialBankroll: null, entries: [] };
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function storageKey() {
    return currentUserId ? `${STORAGE_PREFIX}${currentUserId}` : LEGACY_KEY;
  }

  function queueKey() {
    return `${QUEUE_PREFIX}${currentUserId || 'anonymous'}`;
  }

  function migrationKey() {
    return `${MIGRATION_PREFIX}${currentUserId}`;
  }

  function normalizeState(parsed) {
    if (!parsed || !Array.isArray(parsed.entries)) return emptyState();
    return {
      version: 2,
      initialBankroll: parsed.initialBankroll == null ? null : Math.max(0, number(parsed.initialBankroll)),
      entries: parsed.entries.filter(Boolean)
    };
  }

  function readKey(key) {
    try { return normalizeState(JSON.parse(localStorage.getItem(key))); }
    catch (_) { return emptyState(); }
  }

  function load() {
    return readKey(storageKey());
  }

  function save(state, { notify = false } = {}) {
    const normalized = normalizeState(state);
    localStorage.setItem(storageKey(), JSON.stringify(normalized));
    if (notify) dispatchChanged();
    return normalized;
  }

  function dispatchChanged() {
    window.dispatchEvent(new CustomEvent('bankroll:changed', { detail: load() }));
  }

  function setSyncStatus(state, message) {
    syncStatus = { state, message };
    window.dispatchEvent(new CustomEvent('bankroll:sync-status', { detail: syncStatus }));
  }

  function getSyncStatus() { return { ...syncStatus }; }

  function createId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `entry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeEntry(input, existing) {
    const result = RESULTS.has(input.result) ? input.result : 'pending';
    return {
      id: existing?.id || input.id || createId(),
      date: String(input.date || ''),
      competition: String(input.competition || '').trim(),
      match: String(input.match || '').trim(),
      market: String(input.market || '').trim(),
      selection: String(input.selection || '').trim(),
      legs: Array.isArray(input.legs)
        ? input.legs.map((leg) => ({ match: String(leg?.match || '').trim(), market: String(leg?.market || '').trim(), selection: String(leg?.selection || '').trim() })).filter((leg) => leg.match || leg.market || leg.selection)
        : Array.isArray(existing?.legs) ? existing.legs : [],
      source: input.source === 'screenshot' ? 'screenshot' : (existing?.source || 'manual'),
      odd: Math.max(0, number(input.odd)),
      stake: Math.max(0, number(input.stake)),
      result,
      createdAt: existing?.createdAt || input.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function readQueue() {
    if (!currentUserId) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(queueKey()));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function writeQueue(queue) {
    if (!currentUserId) return;
    localStorage.setItem(queueKey(), JSON.stringify(queue.slice(-500)));
  }

  function enqueue(operation) {
    if (!currentUserId) return;
    const queue = readQueue();
    queue.push({ ...operation, operationId: createId(), queuedAt: new Date().toISOString() });
    writeQueue(queue);
    flushQueue().catch(() => {});
  }

  async function waitForAuth() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (window.CentralProAuth?.getSession) return window.CentralProAuth;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Autenticação indisponível para sincronizar a banca.');
  }

  async function authContext() {
    const auth = await waitForAuth();
    const { data, error } = await auth.getSession();
    if (error || !data.session?.user?.id || !data.session?.access_token) throw new Error('Sessão não encontrada.');
    return { userId: data.session.user.id, token: data.session.access_token };
  }

  async function request(path, options = {}) {
    const { token } = await authContext();
    const response = await fetch(path, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      cache: 'no-store'
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error === 'bankroll_sync_not_configured'
        ? 'A sincronização da banca ainda não foi configurada no servidor.'
        : 'Não foi possível sincronizar a banca agora.');
      error.status = response.status;
      error.code = body?.error;
      throw error;
    }
    return normalizeState(body);
  }

  async function flushQueue() {
    if (!currentUserId) return load();
    if (flushing) return flushing;
    const queued = readQueue();
    if (!queued.length) return load();
    flushing = (async () => {
      setSyncStatus('syncing', 'Sincronizando alterações…');
      try {
        const remote = await request('/api/bankroll/sync', { method: 'POST', body: JSON.stringify({ operations: queued }) });
        writeQueue([]);
        save(remote, { notify: true });
        setSyncStatus('synced', 'Banca sincronizada com sua conta');
        return remote;
      } catch (error) {
        setSyncStatus('error', 'Sem sincronizar — os dados ficaram salvos neste aparelho');
        throw error;
      } finally { flushing = null; }
    })();
    return flushing;
  }

  function localHasData(state) {
    return state.initialBankroll != null || state.entries.length > 0;
  }

  async function importLegacyIfNeeded() {
    if (localStorage.getItem(migrationKey()) === '1') return;
    const accountLocal = readKey(storageKey());
    const legacy = readKey(LEGACY_KEY);
    const source = localHasData(accountLocal) ? accountLocal : legacy;
    if (localHasData(source)) {
      setSyncStatus('syncing', 'Migrando sua banca deste aparelho…');
      const remote = await request('/api/bankroll/import', { method: 'POST', body: JSON.stringify({ state: source }) });
      save(remote);
    }
    localStorage.setItem(migrationKey(), '1');
    if (LEGACY_KEY !== storageKey()) localStorage.removeItem(LEGACY_KEY);
  }

  async function refreshFromCloud({ notify = true } = {}) {
    if (!currentUserId || readQueue().length) return load();
    try {
      const remote = await request('/api/bankroll/state');
      save(remote, { notify });
      setSyncStatus('synced', 'Banca sincronizada com sua conta');
      return remote;
    } catch (error) {
      setSyncStatus('error', 'Sem sincronizar — usando dados salvos neste aparelho');
      throw error;
    }
  }

  async function initialize() {
    if (initialized) return load();
    setSyncStatus('syncing', 'Conectando sua banca à conta…');
    try {
      const context = await authContext();
      currentUserId = context.userId;
      await importLegacyIfNeeded();
      await flushQueue();
      await refreshFromCloud({ notify: false });
      initialized = true;
      if (!refreshTimer) refreshTimer = setInterval(() => refreshFromCloud().catch(() => {}), 30_000);
      window.addEventListener('online', () => flushQueue().then(() => refreshFromCloud()).catch(() => {}));
      window.addEventListener('focus', () => flushQueue().then(() => refreshFromCloud()).catch(() => {}));
      dispatchChanged();
      return load();
    } catch (error) {
      initialized = true;
      setSyncStatus('error', 'Sincronização indisponível — usando dados locais');
      dispatchChanged();
      return load();
    }
  }

  function setInitialBankroll(value) {
    const state = load();
    state.initialBankroll = Math.max(0, number(value));
    const saved = save(state);
    enqueue({ type: 'setInitial', value: saved.initialBankroll });
    return saved;
  }

  function upsertEntry(input) {
    const state = load();
    const index = state.entries.findIndex((entry) => entry.id === input.id);
    const existing = index >= 0 ? state.entries[index] : null;
    const normalized = normalizeEntry(input, existing);
    if (index >= 0) state.entries[index] = normalized;
    else state.entries.push(normalized);
    const saved = save(state);
    enqueue({ type: 'upsertEntry', entry: normalized });
    return saved;
  }

  function removeEntry(id) {
    const state = load();
    state.entries = state.entries.filter((entry) => entry.id !== id);
    const saved = save(state);
    enqueue({ type: 'deleteEntry', id });
    return saved;
  }

  function reset() {
    const state = emptyState();
    save(state);
    enqueue({ type: 'reset' });
    return state;
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
    entries.forEach((entry) => { if (counts[entry.result] != null) counts[entry.result] += 1; });
    const netProfit = settled.reduce((sum, entry) => sum + profit(entry), 0);
    const settledStake = settled.reduce((sum, entry) => sum + number(entry.stake), 0);
    const totalStake = entries.reduce((sum, entry) => sum + number(entry.stake), 0);
    const averageOdd = entries.length ? entries.reduce((sum, entry) => sum + number(entry.odd), 0) / entries.length : 0;
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
    state.entries.filter((entry) => entry.result !== 'pending').slice()
      .sort((a, b) => `${a.date}|${a.createdAt}`.localeCompare(`${b.date}|${b.createdAt}`))
      .forEach((entry) => { balance += profit(entry); points.push({ label: entry.date, value: balance, id: entry.id }); });
    return points;
  }

  window.BankrollStore = {
    initialize,
    refreshFromCloud,
    flushQueue,
    getSyncStatus,
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
