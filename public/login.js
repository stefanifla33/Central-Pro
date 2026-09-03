(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const authPanel = byId('authPanel');
  const forgotPanel = byId('forgotPanel');
  const resetPanel = byId('resetPanel');
  const profilePanel = byId('profilePanel');
  const sessionPanel = byId('sessionPanel');
  const message = byId('authMessage');
  const tabs = document.querySelectorAll('[data-auth-tab]');
  const forms = document.querySelectorAll('[data-auth-form]');
  let busy = false;
  let recoveryMode = new URLSearchParams(location.search).get('recovery') === '1';

  function safeDestination() {
    const candidate = new URLSearchParams(location.search).get('next');
    return CentralProAuth.safeInternalDestination(candidate);
  }

  function enterCentralPro() {
    location.replace(safeDestination());
  }

  function recoveryRedirectUrl() {
    const url = new URL('/login.html', location.origin);
    url.searchParams.set('recovery', '1');
    return url.toString();
  }

  const friendlyErrors = {
    invalid_credentials: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
    user_already_exists: 'Já existe uma conta com este e-mail.',
    signup_disabled: 'A criação de contas está desativada no momento.',
    weak_password: 'Escolha uma senha mais segura.',
    over_email_send_rate_limit: 'Muitas tentativas. Aguarde um pouco e tente novamente.',
    same_password: 'A nova senha precisa ser diferente da senha atual.'
  };

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `auth-message ${type}`;
    message.hidden = !text;
  }

  function setBusy(value) {
    busy = value;
    document.querySelectorAll('.auth-submit, .auth-secondary, .forgot-password-link, #logoutButton').forEach((button) => {
      button.disabled = value;
      button.classList.toggle('loading', value && button.classList.contains('auth-submit'));
    });
  }

  function errorMessage(error) {
    if (error?.code === 'AUTH_NOT_CONFIGURED') return error.message;
    return friendlyErrors[error?.code] || error?.message || 'Não foi possível concluir a operação. Tente novamente.';
  }

  function hidePanels() {
    authPanel.hidden = true;
    forgotPanel.hidden = true;
    resetPanel.hidden = true;
    profilePanel.hidden = true;
    sessionPanel.hidden = true;
  }

  function showAuthPanel() {
    hidePanels();
    authPanel.hidden = false;
  }

  function showForgotPanel() {
    hidePanels();
    forgotPanel.hidden = false;
    showMessage('');
    const currentEmail = byId('loginEmail').value.trim();
    if (currentEmail) byId('forgotEmail').value = currentEmail;
    byId('forgotEmail').focus();
  }

  function showResetPanel() {
    recoveryMode = true;
    hidePanels();
    resetPanel.hidden = false;
    showMessage('');
    byId('resetPassword').focus();
  }

  function showTab(name) {
    showAuthPanel();
    tabs.forEach((tab) => {
      const active = tab.dataset.authTab === name;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    forms.forEach((form) => { form.hidden = form.dataset.authForm !== name; });
    showMessage('');
  }

  function renderSession(session) {
    const signedIn = Boolean(session?.user);
    hidePanels();
    if (signedIn) {
      sessionPanel.hidden = false;
      byId('sessionEmail').textContent = session.user.email;
      showMessage('');
    } else {
      authPanel.hidden = false;
      byId('sessionEmail').textContent = '';
    }
  }

  function renderProfileCompletion() {
    hidePanels();
    profilePanel.hidden = false;
    showMessage('');
    byId('profileName').focus();
  }

  function validName(value) {
    const name = CentralProAuth.normalizeName(value);
    if (!name) return { error: 'Informe seu nome.' };
    if (name.length < 2) return { error: 'O nome deve ter pelo menos 2 caracteres.' };
    if (name.length > 60) return { error: 'O nome deve ter no máximo 60 caracteres.' };
    return { name };
  }

  function continueWithSession(session) {
    if (recoveryMode) return showResetPanel();
    if (!CentralProAuth.userName(session?.user)) return renderProfileCompletion();
    enterCentralPro();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => showTab(tab.dataset.authTab)));

  byId('forgotPasswordButton').addEventListener('click', showForgotPanel);
  byId('backToLoginButton').addEventListener('click', () => showTab('login'));

  byId('loginForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const email = byId('loginEmail').value.trim();
    const password = byId('loginPassword').value;
    if (!email || !password) return showMessage('Preencha o e-mail e a senha.');

    setBusy(true);
    showMessage('Entrando…', 'info');
    try {
      const { data, error } = await CentralProAuth.signIn(email, password);
      if (error) throw error;
      continueWithSession(data.session);
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  byId('forgotForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const email = byId('forgotEmail').value.trim();
    if (!email) return showMessage('Informe o e-mail cadastrado.');

    setBusy(true);
    showMessage('Enviando link de recuperação…', 'info');
    try {
      const { error } = await CentralProAuth.requestPasswordReset(email, recoveryRedirectUrl());
      if (error) throw error;
      showMessage('Pronto! Se esse e-mail estiver cadastrado, você receberá um link para redefinir sua senha. Confira também a caixa de spam.', 'success');
      event.target.reset();
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  byId('resetForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const password = byId('resetPassword').value;
    const confirmation = byId('resetPasswordConfirmation').value;
    if (!password || !confirmation) return showMessage('Preencha os dois campos de senha.');
    if (password.length < 6) return showMessage('A senha deve ter pelo menos 6 caracteres.');
    if (password !== confirmation) return showMessage('As senhas não coincidem.');

    setBusy(true);
    showMessage('Salvando sua nova senha…', 'info');
    try {
      const { error } = await CentralProAuth.updatePassword(password);
      if (error) throw error;
      recoveryMode = false;
      history.replaceState({}, '', '/login.html');
      event.target.reset();
      showTab('login');
      showMessage('Senha alterada com sucesso. Agora você já pode entrar com a nova senha.', 'success');
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  byId('signupForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const checkedName = validName(byId('signupName').value);
    const email = byId('signupEmail').value.trim();
    const password = byId('signupPassword').value;
    const confirmation = byId('signupPasswordConfirmation').value;
    if (checkedName.error) return showMessage(checkedName.error);
    if (!email || !password || !confirmation) return showMessage('Preencha todos os campos.');
    if (password.length < 6) return showMessage('A senha deve ter pelo menos 6 caracteres.');
    if (password !== confirmation) return showMessage('As senhas não coincidem.');

    setBusy(true);
    showMessage('Criando sua conta…', 'info');
    try {
      const { data, error } = await CentralProAuth.signUp(email, password, checkedName.name);
      if (error) throw error;
      if (data.session) {
        renderSession(data.session);
        enterCentralPro();
      } else {
        showMessage('Conta criada. Confira seu e-mail para confirmar o cadastro.', 'success');
      }
      event.target.reset();
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  byId('profileForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const checkedName = validName(byId('profileName').value);
    if (checkedName.error) return showMessage(checkedName.error);
    setBusy(true);
    showMessage('Salvando seu nome…', 'info');
    try {
      const { error } = await CentralProAuth.updateName(checkedName.name);
      if (error) throw error;
      enterCentralPro();
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  byId('logoutButton').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    showMessage('Saindo…', 'info');
    try {
      const { error } = await CentralProAuth.signOut();
      if (error) throw error;
      renderSession(null);
      showMessage('Sessão encerrada com segurança.', 'success');
    } catch (error) {
      showMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  async function initialize() {
    setBusy(true);
    try {
      const [{ data, error }] = await Promise.all([
        CentralProAuth.getSession(),
        CentralProAuth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') {
            recoveryMode = true;
            return showResetPanel();
          }
          if (recoveryMode) return;
          if (!session?.user) return renderSession(null);
          if (!CentralProAuth.userName(session.user)) renderProfileCompletion();
        })
      ]);
      if (error) throw error;
      if (recoveryMode) {
        if (data.session?.user) return showResetPanel();
        showAuthPanel();
        return showMessage('Abra novamente o link de recuperação enviado para o seu e-mail. Se ele expirou, solicite um novo link.', 'info');
      }
      if (data.session?.user) return continueWithSession(data.session);
      renderSession(null);
    } catch (error) {
      renderSession(null);
      showMessage(errorMessage(error));
    } finally {
      setBusy(false);
      document.body.classList.add('auth-ready');
    }
  }

  initialize();
})();
