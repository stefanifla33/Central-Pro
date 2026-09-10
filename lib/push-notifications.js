const crypto = require('crypto');

function clean(value, max = 2048) { return String(value || '').trim().slice(0, max); }
function config(env = process.env) {
  return {
    supabaseUrl: clean(env.SUPABASE_URL).replace(/\/+$/, ''),
    serviceRoleKey: clean(env.SUPABASE_SERVICE_ROLE_KEY, 8192),
    publicKey: clean(env.VAPID_PUBLIC_KEY, 512),
    privateKey: clean(env.VAPID_PRIVATE_KEY, 512),
    subject: clean(env.VAPID_SUBJECT || 'mailto:centralproapp@gmail.com', 512)
  };
}
async function authenticateUser(authorization, { env = process.env, fetchImpl = global.fetch } = {}) {
  const token = /^Bearer\s+([^\s]+)$/i.exec(String(authorization || '').trim())?.[1];
  const { supabaseUrl } = config(env);
  const key = clean(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY, 8192);
  if (!token || !supabaseUrl || !key || typeof fetchImpl !== 'function') return null;
  const response = await fetchImpl(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return response.ok ? response.json() : null;
}
function configured(env = process.env) {
  const c = config(env);
  return Boolean(c.supabaseUrl && c.serviceRoleKey && c.publicKey && c.privateKey);
}
async function supabaseRequest(path, options = {}, { env = process.env, fetchImpl = global.fetch } = {}) {
  const c = config(env);
  if (!c.supabaseUrl || !c.serviceRoleKey) throw new Error('Supabase de push não configurado.');
  const response = await fetchImpl(`${c.supabaseUrl}/rest/v1/central_pro_push_subscriptions${path}`, {
    ...options,
    headers: { apikey: c.serviceRoleKey, Authorization: `Bearer ${c.serviceRoleKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(options.headers || {}) }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    const error = new Error(`Push store HTTP ${response.status}: ${detail}`);
    error.status = response.status >= 400 && response.status < 500 ? response.status : 500;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}
function normalizeSubscription(subscription) {
  const endpoint = clean(subscription?.endpoint, 4096);
  const p256dh = clean(subscription?.keys?.p256dh, 1024);
  const auth = clean(subscription?.keys?.auth, 1024);
  if (!endpoint || !p256dh || !auth) throw Object.assign(new Error('Inscrição push inválida.'), { status: 400 });
  return { endpoint, p256dh, auth };
}
async function saveSubscription(user, subscription, meta = {}, deps = {}) {
  const sub = normalizeSubscription(subscription);
  const body = { user_id: user.id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: clean(meta.userAgent, 500) || null, updated_at: new Date().toISOString() };
  const rows = await supabaseRequest('?on_conflict=endpoint', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(body) }, deps);
  return rows?.[0] || body;
}
async function removeSubscription(user, endpoint, deps = {}) {
  const safe = clean(endpoint, 4096);
  if (!safe) return false;
  await supabaseRequest(`?user_id=eq.${encodeURIComponent(user.id)}&endpoint=eq.${encodeURIComponent(safe)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, deps);
  return true;
}
async function listSubscriptions(deps = {}) { return supabaseRequest('?select=id,user_id,endpoint,p256dh,auth', {}, deps); }
async function deleteEndpoint(endpoint, deps = {}) { return supabaseRequest(`?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }, deps); }
function notificationForTicket(ticket) {
  const picks = Array.isArray(ticket?.selections) ? ticket.selections : [];
  const first = picks[0];
  const body = picks.length === 1
    ? `${first?.displayMatch || 'Novo bilhete'} · ${first?.displaySelection || ''}`.replace(/\s+·\s*$/, '')
    : `${picks.length} seleções · Odd ${Number((ticket?.total_odd ?? ticket?.totalOdd) || 0).toFixed(2)}`;
  return { title: '🎟️ Novo bilhete na Central Pro', body, url: `/bilhetes.html?ticket=${encodeURIComponent(ticket.id)}`, tag: `bilhete-${ticket.id}`, ticketId: ticket.id };
}
function b64url(input) { return Buffer.from(input).toString('base64url'); }
function hkdfExtract(salt, ikm) { return crypto.createHmac('sha256', salt).update(ikm).digest(); }
function hkdfExpand(prk, info, length) {
  let output = Buffer.alloc(0), previous = Buffer.alloc(0), counter = 1;
  while (output.length < length) { previous = crypto.createHmac('sha256', prk).update(Buffer.concat([previous, info, Buffer.from([counter++])])).digest(); output = Buffer.concat([output, previous]); }
  return output.subarray(0, length);
}
function vapidKeyObjects(publicKey, privateKey) {
  const pub = Buffer.from(publicKey, 'base64url');
  const priv = Buffer.from(privateKey, 'base64url');
  if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) throw new Error('Chaves VAPID inválidas.');
  const jwk = { kty: 'EC', crv: 'P-256', x: b64url(pub.subarray(1,33)), y: b64url(pub.subarray(33,65)), d: b64url(priv) };
  return { publicRaw: pub, privateKey: crypto.createPrivateKey({ key: jwk, format: 'jwk' }) };
}
function vapidAuthorization(endpoint, c) {
  const { publicRaw, privateKey } = vapidKeyObjects(c.publicKey, c.privateKey);
  const origin = new URL(endpoint).origin;
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64url(JSON.stringify({ aud: origin, exp: Math.floor(Date.now()/1000) + 12*60*60, sub: c.subject }));
  const unsigned = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(unsigned), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${unsigned}.${b64url(signature)}, k=${b64url(publicRaw)}`;
}
function encryptPayload(row, payload) {
  const userPublic = Buffer.from(row.p256dh, 'base64url');
  const authSecret = Buffer.from(row.auth, 'base64url');
  const server = crypto.createECDH('prime256v1'); server.generateKeys();
  const serverPublic = server.getPublicKey();
  const shared = server.computeSecret(userPublic);
  const prkKey = hkdfExtract(authSecret, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), userPublic, serverPublic]);
  const ikm = hkdfExpand(prkKey, keyInfo, 32);
  const salt = crypto.randomBytes(16);
  const prk = hkdfExtract(salt, ikm);
  const cek = hkdfExpand(prk, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdfExpand(prk, Buffer.from('Content-Encoding: nonce\0'), 12);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([serverPublic.length]), serverPublic, ciphertext]);
}
async function deliver(row, payload, c, fetchImpl = global.fetch) {
  const body = encryptPayload(row, payload);
  const response = await fetchImpl(row.endpoint, { method: 'POST', headers: { TTL: '3600', Urgency: 'high', 'Content-Encoding': 'aes128gcm', Authorization: vapidAuthorization(row.endpoint, c), 'Content-Type': 'application/octet-stream' }, body });
  if (!response.ok) { const error = new Error(`Push HTTP ${response.status}`); error.statusCode = response.status; throw error; }
}
async function sendNewTicketNotification(ticket, deps = {}) {
  const env = deps.env || process.env, c = config(env);
  if (!configured(env)) return { configured: false, sent: 0, failed: 0, removed: 0 };
  const subscriptions = await listSubscriptions(deps);
  const payload = JSON.stringify(notificationForTicket(ticket));
  let sent = 0, failed = 0, removed = 0;
  await Promise.all(subscriptions.map(async row => {
    try { await deliver(row, payload, c, deps.fetchImpl || global.fetch); sent++; }
    catch (error) { failed++; if (error?.statusCode === 404 || error?.statusCode === 410) { await deleteEndpoint(row.endpoint, deps).catch(()=>{}); removed++; } else console.error('[PUSH] Falha ao enviar:', error?.statusCode || error?.message); }
  }));
  return { configured: true, sent, failed, removed };
}
module.exports = { authenticateUser, configured, config, saveSubscription, removeSubscription, sendNewTicketNotification, notificationForTicket };
