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
    trial: 'Você está usando o período gratuito de 24 horas.',
    expired: 'Seu período gratuito terminou. Este espaço receberá as opções de assinatura futuramente.',
    active: 'Seu acesso ao Central Pro está ativo.',
    canceled: 'Seu acesso foi cancelado. As opções de renovação serão exibidas aqui futuramente.',
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
    trial: 'Você ainda não possui um plano ativo. Assinaturas e renovações estarão disponíveis em breve.',
    expired: 'As opções de assinatura serão disponibilizadas aqui futuramente.',
    active: 'Os detalhes do seu plano serão exibidos aqui quando estiverem disponíveis.',
    canceled: 'As opções de renovação serão disponibilizadas aqui futuramente.',
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
    byId('futurePlan').hidden = status === 'lifetime';
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

  try {
    const auth = await waitForAuth();
    const { data, error } = await auth.getSession();
    if (error || !data.session?.user) return location.replace('/login.html');
    const user = data.session.user;
    const name = auth.userName(user);
    byId('accountName').textContent = name;
    byId('accountEmail').textContent = user.email || 'E-mail não informado';
    byId('accountAvatar').textContent = name.charAt(0).toUpperCase();
    renderAccess(await auth.getAccess(data.session));
  } catch (_error) {
    byId('accountMessage').textContent = 'Não foi possível carregar os dados da conta agora.';
  }

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
