(function(){
  'use strict';
  document.body.classList.add('match-shell-page');
  const layout=document.querySelector('.layout'),main=layout?.querySelector('main');
  if(!layout||!main)return;
  layout.querySelector(':scope > .sidebar')?.remove();
  const menu=document.createElement('button');menu.className='menu-button';menu.id='menuButton';menu.type='button';menu.setAttribute('aria-label','Abrir menu');menu.textContent='☰';
  const sidebar=document.createElement('aside');sidebar.className='sidebar';sidebar.id='sidebar';sidebar.innerHTML='<a class="brand" href="index.html" aria-label="Central Pro — Inteligência Esportiva"><img class="sidebar-logo" src="assets/central-pro-logo.png" alt="Central Pro — Inteligência Esportiva"></a><nav class="main-nav match-main-nav"><small class="shell-nav-label">PRINCIPAL</small><a href="index.html"><span>⌂</span>Dashboard</a><small class="shell-nav-label">PARTIDAS</small><a href="index.html#live"><span>◉</span>Ao vivo</a><a href="index.html#upcoming"><span>◷</span>Próximas</a><a class="active" href="#overview" data-match-tab="overview"><span>▣</span>Detalhes da partida</a><small class="shell-nav-label">ANÁLISE</small><a href="#stats" data-match-tab="stats"><span>≡</span>Estatísticas</a><a href="#lineups" data-match-tab="lineups"><span>♟</span>Escalações</a></nav><div class="api-state match-api-state"><small>API Status</small><span><i></i><b>Online</b></span><em>Dados protegidos no servidor</em><time>Última atualização: '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'</time></div>';
  const frame=document.createElement('div');frame.className='app-frame';
  const header=document.createElement('header');header.className='app-header';header.innerHTML='<label class="global-search"><span>⌕</span><input id="globalSearch" placeholder="Buscar time, jogador, campeonato..." autocomplete="off"></label><div class="header-actions"><a class="match-context-link" href="games.html">← Todos os jogos</a><span class="header-avatar">S</span></div>';
  frame.append(header,main);layout.replaceWith(frame);document.body.prepend(menu,sidebar);
  sidebar.querySelectorAll('[data-match-tab]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();document.querySelector(`.tab[data-tab="${link.dataset.matchTab}"]`)?.click();sidebar.querySelectorAll('[data-match-tab]').forEach(item=>item.classList.toggle('active',item===link));document.getElementById(link.dataset.matchTab)?.scrollIntoView({block:'start'})}));
}());
