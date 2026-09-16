const { bearerToken } = require('./user-access');

class BankrollCloudNotConfiguredError extends Error {
  constructor() {
    super('Sincronização da banca não configurada.');
    this.code = 'BANKROLL_CLOUD_NOT_CONFIGURED';
  }
}

function createBankrollCloudStore({ supabaseUrl, publishableKey, serviceRoleKey, fetchImpl = global.fetch } = {}) {
  const url = String(supabaseUrl || '').replace(/\/+$/, '');
  const publicKey = String(publishableKey || '').trim();
  const serviceKey = String(serviceRoleKey || '').trim();
  const configured = Boolean(url && publicKey && serviceKey && typeof fetchImpl === 'function');

  function ensureConfigured() {
    if (!configured) throw new BankrollCloudNotConfiguredError();
  }

  async function resolveUserId(authorization) {
    ensureConfigured();
    const token = bearerToken(authorization);
    if (!token) return null;
    const response = await fetchImpl(`${url}/auth/v1/user`, {
      headers: { apikey: publicKey, Authorization: `Bearer ${token}` }
    });
    if (!response.ok) return null;
    const user = await response.json().catch(() => null);
    return user?.id || null;
  }

  async function rest(table, query = '', options = {}) {
    ensureConfigured();
    const response = await fetchImpl(`${url}/rest/v1/${table}${query}`, {
      ...options,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        Prefer: options.prefer || 'return=representation',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      const error = new Error(`Supabase Minha Banca HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      error.status = response.status;
      error.detail = detail;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function normalizeLegs(value) {
    return Array.isArray(value)
      ? value.map((leg) => ({
          match: String(leg?.match || '').trim(),
          market: String(leg?.market || '').trim(),
          selection: String(leg?.selection || '').trim()
        })).filter((leg) => leg.match || leg.market || leg.selection)
      : [];
  }

  function normalizeEntry(input = {}) {
    const result = ['pending', 'green', 'red', 'void'].includes(input.result) ? input.result : 'pending';
    const odd = Number(input.odd);
    const stake = Number(input.stake);
    return {
      id: String(input.id || '').trim(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? String(input.date) : new Date().toISOString().slice(0, 10),
      competition: String(input.competition || '').trim().slice(0, 120),
      match: String(input.match || '').trim().slice(0, 200),
      market: String(input.market || '').trim().slice(0, 500),
      selection: String(input.selection || '').trim().slice(0, 500),
      legs: normalizeLegs(input.legs),
      source: input.source === 'screenshot' ? 'screenshot' : 'manual',
      odd: Number.isFinite(odd) && odd >= 0 ? odd : 0,
      stake: Number.isFinite(stake) && stake >= 0 ? stake : 0,
      result,
      created_at: input.createdAt || input.created_at || new Date().toISOString(),
      updated_at: input.updatedAt || input.updated_at || new Date().toISOString()
    };
  }

  function rowToEntry(row) {
    return {
      id: row.id,
      date: row.date,
      competition: row.competition || '',
      match: row.match || '',
      market: row.market || '',
      selection: row.selection || '',
      legs: Array.isArray(row.legs) ? row.legs : [],
      source: row.source || 'manual',
      odd: Number(row.odd) || 0,
      stake: Number(row.stake) || 0,
      result: row.result || 'pending',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  async function getState(userId) {
    const encoded = encodeURIComponent(userId);
    const [profiles, entries] = await Promise.all([
      rest('central_pro_bankroll_profiles', `?user_id=eq.${encoded}&select=initial_bankroll&limit=1`),
      rest('central_pro_bankroll_entries', `?user_id=eq.${encoded}&select=*&order=date.asc,created_at.asc`)
    ]);
    return {
      version: 2,
      initialBankroll: profiles?.[0]?.initial_bankroll == null ? null : Number(profiles[0].initial_bankroll),
      entries: (entries || []).map(rowToEntry)
    };
  }

  async function setInitial(userId, value) {
    const number = Number(value);
    const initialBankroll = Number.isFinite(number) ? Math.max(0, number) : null;
    await rest('central_pro_bankroll_profiles', '?on_conflict=user_id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify({ user_id: userId, initial_bankroll: initialBankroll, updated_at: new Date().toISOString() })
    });
  }

  async function upsertEntry(userId, entry) {
    const normalized = normalizeEntry(entry);
    if (!normalized.id) throw new Error('Entrada sem id.');
    await rest('central_pro_bankroll_entries', '?on_conflict=user_id,id', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify({ user_id: userId, ...normalized })
    });
  }

  async function deleteEntry(userId, id) {
    await rest('central_pro_bankroll_entries', `?user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE', prefer: 'return=minimal'
    });
  }

  async function reset(userId) {
    await Promise.all([
      rest('central_pro_bankroll_entries', `?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE', prefer: 'return=minimal' }),
      rest('central_pro_bankroll_profiles', `?user_id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE', prefer: 'return=minimal' })
    ]);
  }

  async function applyOperations(userId, operations = []) {
    for (const operation of operations.slice(0, 200)) {
      if (!operation || typeof operation !== 'object') continue;
      if (operation.type === 'setInitial') await setInitial(userId, operation.value);
      else if (operation.type === 'upsertEntry') await upsertEntry(userId, operation.entry);
      else if (operation.type === 'deleteEntry') await deleteEntry(userId, operation.id);
      else if (operation.type === 'reset') await reset(userId);
    }
    return getState(userId);
  }

  async function importState(userId, state = {}) {
    // Migração conservadora: preserva o que já estiver na nuvem e adiciona apenas
    // dados locais que ainda não existem. Isso permite migrar PC e celular sem
    // um aparelho sobrescrever o outro.
    const current = await getState(userId);
    if (current.initialBankroll == null && state.initialBankroll != null) {
      await setInitial(userId, state.initialBankroll);
    }
    const existingIds = new Set(current.entries.map((entry) => entry.id));
    const entries = Array.isArray(state.entries) ? state.entries.slice(0, 2000) : [];
    for (const entry of entries) {
      if (!entry?.id || existingIds.has(String(entry.id))) continue;
      await upsertEntry(userId, entry);
      existingIds.add(String(entry.id));
    }
    return getState(userId);
  }

  return { configured, resolveUserId, getState, applyOperations, importState };
}

module.exports = { createBankrollCloudStore, BankrollCloudNotConfiguredError };
