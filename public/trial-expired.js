(async function () {
  'use strict';
  const message = document.getElementById('pageMessage');
  const logout = document.getElementById('logoutButton');
  try {
    const { data, error } = await CentralProAuth.getSession();
    if (error || !data.session?.user) return location.replace('/login.html');
    document.getElementById('userName').textContent = CentralProAuth.userName(data.session.user);
    const access = await CentralProAuth.getAccess(data.session);
    if (access.allowed) return location.replace('/index.html');
    if (access.status !== 'expired') throw new Error('Acesso indisponível.');
    if (access.trialEndsAt) {
      const end = document.getElementById('trialEnd');
      end.textContent = `O período terminou em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(access.trialEndsAt))}.`;
      end.hidden = false;
    }
  } catch (_error) {
    message.textContent = 'Não foi possível confirmar os dados do acesso agora.';
  }
  logout.addEventListener('click', async () => {
    logout.disabled = true;
    const { error } = await CentralProAuth.signOut();
    if (error) { logout.disabled = false; message.textContent = 'Não foi possível sair. Tente novamente.'; return; }
    location.replace('/login.html');
  });
})();
