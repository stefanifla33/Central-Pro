(async function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const stateLabels = { trial: 'Teste gratuito', expired: 'Teste encerrado', active: 'Acesso ativo', canceled: 'Acesso cancelado', lifetime: 'Acesso vitalício' };
  const accessDescriptions = {
    trial: 'Aproveite todos os recursos do Central Pro.',
    expired: 'Seu período gratuito foi encerrado.',
    active: 'Seu acesso ao Central Pro está disponível.',
    canceled: 'Seu acesso ao Central Pro foi cancelado.',
    lifetime: 'Acesso permanente ao Central Pro.'
  };
  const descriptions = {
    trial: 'Você está usando o período gratuito de 24 horas e já pode escolher seu plano.',
    expired: 'Seu período gratuito terminou. Escolha um plano para continuar.',
    active: 'Seu acesso ao Central Pro está ativo.',
    canceled: 'Seu acesso foi cancelado. Escolha um plano para voltar a acessar.',
    lifetime: 'Seu acesso ao Central Pro é permanente.'
  };
  const planHeadlines = {
    trial: 'Você está no período gratuito',
    expired: 'Seu teste gratuito terminou',
    active: 'Seu acesso está ativo',
    canceled: 'Seu acesso está cancelado',
    lifetime: 'Central Pro — Proprietária'
  };
  const planSupporting = {
    trial: 'Você não precisa esperar o fim do teste para assinar.',
    expired: 'Assine para reativar seu acesso ao Central Pro.',
    active: 'Os detalhes do seu plano serão exibidos aqui quando estiverem disponíveis.',
    canceled: 'Assine para reativar seu acesso ao Central Pro.',
    lifetime: 'Acesso permanente, sem necessidade de renovação.'
  };

  async function waitForAuth() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (window.CentralProAuth) return window.CentralProAuth;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('auth_unavailable');
  }

  function formatDate(value) {
    if (!value) return 'Não informada';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Não informada';
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date).replace(',', ' às');
  }

  function formatRemaining(seconds) {
    const totalMinutes = Math.max(0, Math.floor(Number(seconds) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}h ${minutes}min` : `${minutes}min`;
  }

  function renderAccess(access) {
    const status = Object.prototype.hasOwnProperty.call(stateLabels, access.status) ? access.status : 'expired';
    byId('accessBadge').textContent = stateLabels[status];
    byId('accessBadge').className = `access-badge ${status}`;
    byId('accessTitle').textContent = stateLabels[status];
    byId('accessSummaryDescription').textContent = accessDescriptions[status];
    byId('accessStatus').textContent = stateLabels[status];
    const prefix = status === 'expired' ? 'Encerrado em' : status === 'canceled' ? 'Última validade' : 'Acesso válido até';
    const validity = status === 'active' ? access.accessExpiresAt : access.trialEndsAt;
    byId('accessValidity').textContent = status === 'lifetime' ? 'Sem vencimento' : `${prefix} ${formatDate(validity)}`;
    byId('planDescription').textContent = descriptions[status];
    byId('planHeadline').textContent = planHeadlines[status];
    if (status === 'active' && access.planName) byId('planHeadline').textContent = `Plano ${access.planName}`;
    byId('planSupporting').textContent = planSupporting[status];
    byId('purchasePlans').hidden = !['trial', 'expired', 'canceled'].includes(status);
    byId('renewPlan').hidden = status !== 'active';
    if (status === 'trial') {
      byId('remainingRow').hidden = false;
      byId('accessRemaining').textContent = formatRemaining(access.remainingSeconds);
      const start = new Date(access.trialStartedAt).getTime();
      const end = new Date(access.trialEndsAt).getTime();
      const totalSeconds = Math.max(0, (end - start) / 1000);
      if (Number.isFinite(start) && totalSeconds > 0) {
        const remainingPercent = Math.min(100, Math.max(0, (Number(access.remainingSeconds) / totalSeconds) * 100));
        byId('trialProgressBar').style.width = `${remainingPercent}%`;
        byId('trialProgress').hidden = false;
        byId('trialStartText').textContent = `Seu teste gratuito de 24 horas começou em ${formatDate(access.trialStartedAt)}.`;
        byId('trialStart').hidden = false;
      }
    }
  }

  let currentSession = null;

  try {
    const auth = await waitForAuth();
    const { data, error } = await auth.getSession();
    if (error || !data.session?.user) return location.replace('/login.html');
    currentSession = data.session;
    const user = currentSession.user;
    const fullName = auth.userName(user);
    const name = auth.firstName?.(fullName) || fullName;
    byId('accountName').textContent = name;
    byId('accountEmail').textContent = user.email || 'E-mail não informado';
    byId('accountAvatar').textContent = name.charAt(0).toUpperCase();
    renderAccess(await auth.getAccess(currentSession));
  } catch (_error) {
    byId('accountMessage').textContent = 'Não foi possível carregar os dados da conta agora.';
  }

  const checkoutButtons = [...document.querySelectorAll('[data-plan]')];
  checkoutButtons.forEach((button) => button.addEventListener('click', async () => {
    if (!currentSession?.access_token || button.disabled) return;
    const originalLabel = button.textContent;
    checkoutButtons.forEach((item) => { item.disabled = true; });
    button.textContent = 'Carregando…';
    byId('accountMessage').textContent = 'Preparando checkout seguro…';
    try {
      const response = await fetch('/api/payments/infinitepay/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentSession.access_token}` },
        body: JSON.stringify({ planId: button.dataset.plan })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.checkoutUrl) throw new Error('checkout_unavailable');
      location.assign(result.checkoutUrl);
    } catch (_error) {
      button.textContent = originalLabel;
      checkoutButtons.forEach((item) => { item.disabled = false; });
      byId('accountMessage').textContent = 'Não foi possível iniciar o pagamento agora. Tente novamente.';
    }
  }));

  byId('logoutButton').addEventListener('click', async () => {
    const button = byId('logoutButton');
    button.disabled = true;
    button.textContent = 'Saindo…';
    const auth = await waitForAuth();
    const { error } = await auth.signOut();
    if (error) {
      button.disabled = false;
      button.textContent = 'Sair da conta';
      byId('accountMessage').textContent = 'Não foi possível sair. Tente novamente.';
      return;
    }
    location.replace('/login.html');
  });
})();
