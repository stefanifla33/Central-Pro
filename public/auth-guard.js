(function (global) {
  'use strict';

  const root = document.documentElement;
  root.classList.add('auth-pending');
  const guardStyle = document.createElement('style');
  guardStyle.textContent = 'html.auth-pending body{visibility:hidden!important}.account-link{cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}.account-link:hover{border-color:#316046!important;background:#15231c!important}.account-link:focus-visible{outline:2px solid var(--green,#16e785);outline-offset:3px}.auth-session{display:grid;gap:7px;margin:18px 10px;padding:12px;border:1px solid #273029;border-radius:9px;color:#9da8a1;font-size:10px}.auth-session strong{overflow:hidden;color:#eef3f0;text-overflow:ellipsis}';
  document.head.appendChild(guardStyle);

  const currentDestination = `${location.pathname}${location.search}${location.hash}`;
  const loginDestination = `/login.html?next=${encodeURIComponent(currentDestination)}`;
  let redirecting = false;

  function redirectToLogin() {
    if (redirecting) return;
    redirecting = true;
    location.replace(loginDestination);
  }

  function redirectToExpired(access) {
    if (redirecting) return;
    redirecting = true;
    const end = encodeURIComponent(access?.trialEndsAt || '');
    location.replace(`/trial-expired.html?ended=${end}`);
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

    function bindAccountLink(element) {
      if (!element || element.dataset.accountLink === 'true') return;
      element.dataset.accountLink = 'true';
      element.classList.add('account-link');
      element.setAttribute('role', 'link');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-label', 'Abrir Minha Conta');
      const openAccount = () => { location.href = '/minha-conta.html'; };
      element.addEventListener('click', openAccount);
      element.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openAccount();
      });
    }

    document.querySelectorAll('.user-card').forEach(bindAccountLink);
    document.querySelectorAll('.header-user').forEach((identity) => {
      const group = identity.parentElement;
      bindAccountLink(group && !group.querySelector('button') ? group : identity);
    });
    document.querySelectorAll('.header-avatar').forEach((avatar) => {
      if (!avatar.closest('.account-link')) bindAccountLink(avatar);
    });

    const greeting = document.getElementById('homeGreeting');
    if (greeting && displayName) {
      const hour = new Date().getHours();
      const period = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite';
      greeting.textContent = `${period}, ${displayName}!`;
    }

  }

  async function initialize() {
    try {
      await loadAuth();
      const { data, error } = await global.CentralProAuth.getSession();
      if (error || !data.session?.user) return redirectToLogin();
      if (!global.CentralProAuth.userName(data.session.user)) return redirectToLogin();
      const access = await global.CentralProAuth.getAccess(data.session);
      const accessManagementPage = location.pathname === '/minha-conta.html' || location.pathname === '/planos.html';
      if (!access.allowed && !accessManagementPage) return redirectToExpired(access);
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
