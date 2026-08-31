(async function () {
  'use strict';
  const message = document.getElementById('plansMessage');
  const buttons = [...document.querySelectorAll('[data-plan]')];

  async function waitForAuth() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (window.CentralProAuth) return window.CentralProAuth;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('auth_unavailable');
  }

  async function session() {
    const auth = await waitForAuth();
    const { data, error } = await auth.getSession();
    if (error || !data.session?.user) { location.replace('/login.html'); return null; }
    return data.session;
  }

  const currentSession = await session();
  if (!currentSession) return;

  buttons.forEach((button) => button.addEventListener('click', async () => {
    buttons.forEach((item) => { item.disabled = true; });
    message.textContent = 'Preparando checkout seguro…';
    try {
      const response = await fetch('/api/payments/asaas/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ planId: button.dataset.plan })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.checkoutUrl) throw new Error('checkout_unavailable');
      location.assign(result.checkoutUrl);
    } catch (_error) {
      message.textContent = 'Não foi possível iniciar o pagamento agora. Tente novamente.';
      buttons.forEach((item) => { item.disabled = false; });
    }
  }));
})();
