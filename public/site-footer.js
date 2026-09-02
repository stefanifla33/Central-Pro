(function () {
  if (document.querySelector('.site-footer')) return;
  if (!document.querySelector('link[href^="site-footer.css"]')) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'site-footer.css?v=1';
    document.head.appendChild(stylesheet);
  }
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = '<div class="site-footer-inner"><div class="site-footer-brand"><strong>Central Pro</strong><span>Análises estatísticas para auxiliar suas decisões esportivas.</span></div><nav class="site-footer-legal" aria-label="Informações legais"><span>Termos de Uso</span><span>Política de Privacidade</span><span>Jogo Responsável</span></nav><p class="site-footer-warning">O Central Pro fornece informações e análises estatísticas. Não garantimos resultados ou lucros em apostas esportivas. Aposte com responsabilidade. Proibido para menores de 18 anos.</p><small>© 2026 Central Pro. Todos os direitos reservados.</small></div>';
  const host = document.querySelector('.app-frame') || document.querySelector('.layout > main') || document.querySelector('main') || document.body;
  host.appendChild(footer);
}());
