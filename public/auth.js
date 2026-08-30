(function (global) {
  'use strict';

  let clientPromise;

  async function createClient() {
    if (!global.supabase?.createClient) throw new Error('O módulo de autenticação não pôde ser carregado. Verifique sua conexão e tente novamente.');

    const response = await fetch('/api/auth/config', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Não foi possível carregar a configuração de autenticação.');

    const config = await response.json();
    if (!config.configured) {
      const error = new Error('A autenticação ainda não foi configurada neste ambiente.');
      error.code = 'AUTH_NOT_CONFIGURED';
      throw error;
    }

    return global.supabase.createClient(config.url, config.publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
      }
    });
  }

  function getClient() {
    if (!clientPromise) clientPromise = createClient();
    return clientPromise;
  }

  function normalizeName(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function userName(user) {
    return normalizeName(user?.user_metadata?.name);
  }

  async function signUp(email, password, name) {
    const client = await getClient();
    return client.auth.signUp({ email, password, options: { data: { name: normalizeName(name) } } });
  }

  async function signIn(email, password) {
    const client = await getClient();
    return client.auth.signInWithPassword({ email, password });
  }

  async function signOut() {
    const client = await getClient();
    return client.auth.signOut({ scope: 'local' });
  }

  async function getSession() {
    const client = await getClient();
    return client.auth.getSession();
  }

  async function getUser() {
    const client = await getClient();
    return client.auth.getUser();
  }

  async function updateName(name) {
    const client = await getClient();
    return client.auth.updateUser({ data: { name: normalizeName(name) } });
  }

  async function onAuthStateChange(callback) {
    const client = await getClient();
    return client.auth.onAuthStateChange(callback);
  }

  function safeInternalDestination(candidate, fallback = '/index.html') {
    if (!candidate) return fallback;
    try {
      const destination = new URL(candidate, global.location.origin);
      if (destination.origin !== global.location.origin || destination.pathname === '/login.html') return fallback;
      return `${destination.pathname}${destination.search}${destination.hash}`;
    } catch {
      return fallback;
    }
  }

  global.CentralProAuth = Object.freeze({ getClient, signUp, signIn, signOut, getSession, getUser, updateName, normalizeName, userName, onAuthStateChange, safeInternalDestination });
})(window);
