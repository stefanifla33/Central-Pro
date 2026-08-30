(function (global) {
  'use strict';

  const root = document.documentElement;
  root.classList.add('auth-pending');
  const guardStyle = document.createElement('style');
  guardStyle.textContent = 'html.auth-pending body{visibility:hidden!important}.auth-logout{padding:0;border:0;background:none;color:#9da8a1;font:inherit;text-align:left;cursor:pointer}.auth-logout:hover{color:var(--green,#16e785)}.auth-session{display:grid;gap:7px;margin:18px 10px;padding:12px;border:1px solid #273029;border-radius:9px;color:#9da8a1;font-size:10px}.auth-session strong{overflow:hidden;color:#eef3f0;text-overflow:ellipsis}.auth-session .auth-logout{color:var(--green,#16e785)}';
  document.head.appendChild(guardStyle);

  const currentDestination = `${location.pathname}${location.search}${location.hash}`;
  const loginDestination = `/login.html?next=${encodeURIComponent(currentDestination)}`;
  let redirecting = false;

  function redirectToLogin() {
    if (redirecting) return;
    redirecting = true;
    location.replace(loginDestination);
  }

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${source}.`));
      document.head.appendChild(script);
    });
  }

  async function loadAuth() {
    if (!global.supabase?.createClient) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
    if (!global.CentralProAuth) await loadScript('/auth.js?v=2');
  }

  function enhanceShell(user) {
    const displayName = global.CentralProAuth.userName(user);
    const userCard = document.querySelector('.user-card');
    if (userCard && displayName) {
      const avatar = userCard.querySelector('.avatar');
      const name = userCard.querySelector('strong');
      const role = userCard.querySelector('small');
      if (avatar) avatar.textContent = displayName.charAt(0).toUpperCase();
      if (name) { name.textContent = displayName; name.title = displayName; }
      if (role) role.textContent = 'Conta autenticada';
    }
    document.querySelectorAll('.header-avatar').forEach((avatar) => {
      avatar.textContent = displayName ? displayName.charAt(0).toUpperCase() : '';
      avatar.title = displayName;
    });
    document.querySelectorAll('.header-user').forEach((identity) => {
      const name = identity.querySelector('strong');
      const role = identity.querySelector('small');
      if (name) { name.textContent = displayName; name.title = displayName; }
      if (role) role.textContent = 'Conta autenticada';
    });

    const greeting = document.getElementById('homeGreeting');
    if (greeting && displayName) {
      const hour = new Date().getHours();
      const period = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
      greeting.textContent = `${period}, ${displayName}!`;
    }

    let accountArea = document.querySelector('.sidebar-future');
    if (!accountArea) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) {
        accountArea = document.createElement('div');
        accountArea.className = 'auth-session';
        const nameLabel = document.createElement('strong');
        nameLabel.textContent = displayName;
        nameLabel.title = displayName;
        accountArea.appendChild(nameLabel);
        sidebar.appendChild(accountArea);
      }
    }
    if (accountArea && !accountArea.querySelector('.auth-logout')) {
      const logout = document.createElement('button');
      logout.className = 'auth-logout';
      logout.type = 'button';
      logout.textContent = 'Sair da conta';
      logout.addEventListener('click', async () => {
        logout.disabled = true;
        logout.textContent = 'Saindo…';
        const { error } = await global.CentralProAuth.signOut();
        if (error) { logout.disabled = false; logout.textContent = 'Sair da conta'; return; }
        location.replace('/login.html');
      });
      accountArea.appendChild(logout);
    }
  }

  async function initialize() {
    try {
      await loadAuth();
      const { data, error } = await global.CentralProAuth.getSession();
      if (error || !data.session?.user) return redirectToLogin();
      if (!global.CentralProAuth.userName(data.session.user)) return redirectToLogin();
      if (document.readyState === 'loading') {
        await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
      }
      enhanceShell(data.session.user);
      await global.CentralProAuth.onAuthStateChange((_event, session) => { if (!session?.user) redirectToLogin(); });
      root.classList.remove('auth-pending');
    } catch (_error) {
      redirectToLogin();
    }
  }

  initialize();
})(window);
