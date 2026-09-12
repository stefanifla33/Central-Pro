const crypto = require('crypto');

function todaySP(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
function clean(value, max = 160) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function cleanUrl(value) {
  const raw = clean(value, 1000);
  if (!raw) return null;
  try { const u = new URL(raw); return ['http:', 'https:'].includes(u.protocol) ? u.toString() : null; } catch { return null; }
}
function configuredAdmin(env = process.env) {
  return { email: clean(env.CENTRAL_PRO_ADMIN_EMAIL, 254).toLowerCase(), userId: clean(env.CENTRAL_PRO_ADMIN_USER_ID, 80) };
}
async function authenticateAdmin(authorization, { env = process.env, fetchImpl = global.fetch } = {}) {
  const token = /^Bearer\s+([^\s]+)$/i.exec(String(authorization || '').trim())?.[1];
  if (!token) return null;
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || '').trim();
  const admin = configuredAdmin(env);
  if (!url || !key || typeof fetchImpl !== 'function') return null;
  const response = await fetchImpl(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const user = await response.json();
  // No desenvolvimento local, o próprio usuário autenticado pode usar o painel manual.
  // Em produção/Vercel, o admin continua obrigatoriamente restrito pelas variáveis CENTRAL_PRO_ADMIN_*.
  const isProduction = env.NODE_ENV === 'production' || env.VERCEL === '1';
  if (!admin.email && !admin.userId) return isProduction ? null : user;
  const emailOk = admin.email && String(user?.email || '').toLowerCase() === admin.email;
  const idOk = admin.userId && String(user?.id || '') === admin.userId;
  return emailOk || idOk ? user : null;
}
function normalizeSelections(input) {
  if (!Array.isArray(input) || !input.length || input.length > 12) throw Object.assign(new Error('Adicione entre 1 e 12 seleções.'), { status: 400 });
  return input.map((item, index) => {
    const displayMatch = clean(item.displayMatch, 120), market = clean(item.market, 100), displaySelection = clean(item.displaySelection, 120), bookmakerName = clean(item.bookmakerName, 60);
    const rawOdd = String(item.odd ?? '').trim();
    const odd = rawOdd ? Number(rawOdd) : null;
    if (!displayMatch || !market || !displaySelection || (odd !== null && (!Number.isFinite(odd) || odd < 1.01 || odd > 1000))) throw Object.assign(new Error(`Seleção ${index + 1} incompleta ou com odd inválida.`), { status: 400 });
    return { id: `MANUAL-PICK-${index + 1}`, fixtureId: item.fixtureId ? Number(item.fixtureId) : null, fixtureDate: clean(item.fixtureDate, 40) || null, competitionName: clean(item.competitionName, 100) || null, market, marketName: market, marketKey: clean(item.marketKey, 80) || 'manual', displayMatch, displaySelection, odd: odd === null ? null : Number(odd.toFixed(2)), bookmakerName: bookmakerName || null, status: 'OPEN', metadata: { manual: true } };
  });
}
function buildManualTicket(input, now = new Date()) {
  const selections = normalizeSelections(input.selections);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date || '')) ? String(input.date) : todaySP(now);
  const totalOdd = Number(input.totalOdd);
  if (!Number.isFinite(totalOdd) || totalOdd < 1.01 || totalOdd > 100000) throw Object.assign(new Error('Informe a odd final real do bilhete.'), { status: 400 });
  const id = `MANUAL-${date.replaceAll('-', '')}-${crypto.randomBytes(6).toString('hex')}`;
  const iso = now.toISOString();
  const title = clean(input.title, 80) || 'Bilhete Central Pro';
  const profileRaw = clean(input.profile, 30).toUpperCase();
  const profile = ['CONSERVADOR', 'MODERADO', 'AGRESSIVO'].includes(profileRaw) ? profileRaw : 'MODERADO';
  return { id, schema_version: 1, published_at: iso, date, type: 'MANUAL', title, description: clean(input.description, 180) || 'Bilhete selecionado pela Central Pro.', competition: clean(input.competition, 120) || 'Seleção manual', status: 'OPEN', total_odd: totalOdd, selections, analysis: { manual: true, reason: clean(input.reason, 900) || null, profile, ticketUrl: cleanUrl(input.ticketUrl) }, source: 'manual', settled_at: null };
}
function editablePatch(input, ticket) {
  if (!ticket || ticket.source !== 'manual') throw Object.assign(new Error('Somente bilhetes manuais podem ser alterados aqui.'), { status: 403 });
  const patch = {};
  if (input.status !== undefined) {
    const status = clean(input.status, 20).toUpperCase();
    if (!['OPEN','GREEN','RED','VOID'].includes(status)) throw Object.assign(new Error('Status inválido.'), { status: 400 });
    patch.status = status; patch.settled_at = status === 'OPEN' ? null : new Date().toISOString();
  }
  if (input.title !== undefined) patch.title = clean(input.title, 80) || ticket.title;
  if (input.description !== undefined) patch.description = clean(input.description, 180);
  return patch;
}
module.exports = { authenticateAdmin, buildManualTicket, editablePatch, configuredAdmin };
