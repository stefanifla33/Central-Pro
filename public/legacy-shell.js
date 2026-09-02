(function(){
  'use strict';
  const script=document.currentScript,path=location.pathname.split('/').pop()||'index.html',active=script?.dataset.active||'';
  const overrides=document.createElement('link');overrides.rel='stylesheet';overrides.href='legacy-pages.css?v=1';document.head.append(overrides);
  document.body.classList.add('legacy-page',`legacy-${path.replace('.html','')}`);
  document.querySelector('header.top')?.remove();
  const item=(key,href,icon,label)=>`<a ${active===key?'class="active" ':''}href="${href}"><span>${icon}</span>${label}</a>`;
  const menu=document.createElement('button');menu.className='menu-button';menu.id='menuButton';menu.type='button';menu.setAttribute('aria-label','Abrir menu');menu.textContent='☰';
  const sidebar=document.createElement('aside');sidebar.className='sidebar';sidebar.id='sidebar';sidebar.innerHTML=`<a class="brand" href="index.html" aria-label="Central Pro — Inteligência Esportiva"><img class="sidebar-logo" src="assets/central-pro-logo.png" alt="Central Pro — Inteligência Esportiva"></a><div class="user-card"><span class="avatar">S</span><span><strong>Stefani</strong><small>Analista</small></span><span class="status-dot"></span></div><nav class="main-nav">${item('home','index.html','⌂','Início')}${item('top-day','top-day.html','🏆','Top do Dia')}${item('games','games.html','◫','Jogos')}${item('analysis','analysis.html','⌁','Análises')}${item('opportunities','opportunities.html','↗','Melhores Oportunidades')}${item('bankroll','bankroll.html','◈','Minha Banca')}<a href="bankroll.html#history"><span>↺</span>Histórico</a></nav><div class="sidebar-future"><small>CONTA</small><span>Perfil</span><span>Configurações</span><span>Plano Premium</span></div><div class="api-state"><span><i></i> Central Pro</span><small>Navegação integrada</small></div>`;
  sidebar.querySelector('.main-nav')?.insertAdjacentHTML('beforeend','<a href="leagues.html"><span>♜</span>Competições</a>');
  const main=document.querySelector('main'),frame=document.createElement('div');frame.className='app-frame';
  const contextual={
    'player.html':['players.html','← Buscar jogadores'],
    'team.html':['teams.html','← Buscar times'],
    'my-teams.html':['teams.html','Explorar times']
  }[path];
  const header=document.createElement('header');header.className='app-header';header.innerHTML=`<label class="global-search"><span>⌕</span><input id="globalSearch" placeholder="Buscar time, jogador, campeonato..." autocomplete="off"></label><div class="header-actions">${contextual?`<a class="legacy-context-link" href="${contextual[0]}">${contextual[1]}</a>`:''}<span class="header-avatar">S</span></div>`;
  frame.append(header);if(main)frame.append(main);document.body.prepend(menu,sidebar,frame);
  menu.onclick=()=>sidebar.classList.toggle('open');
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();document.getElementById('globalSearch')?.focus()}});
  document.getElementById('globalSearch')?.addEventListener('keydown',event=>{const query=event.target.value.trim();if(event.key==='Enter'&&query.length>=3)location.href=`teams.html?q=${encodeURIComponent(query)}`});
}());
(()=>{const s=document.createElement('script');s.src='site-footer.js?v=1';document.body.appendChild(s)})();
