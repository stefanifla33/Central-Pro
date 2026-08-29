(function(){
  'use strict';
  const GAMES_KEY='centralPro.opportunities.v1',PLAYERS_KEY='centralPro.players.snapshot.v1',today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),$=id=>document.getElementById(id);
  const engine=window.CPOpportunityEngine;
  const time=value=>new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
  const medal=rank=>['🥇','🥈','🥉'][rank-1]||rank;
  const teamLogo=team=>team?.logo?`<img src="${cpEscape(team.logo)}" alt="" loading="lazy">`:'<span class="team-logo-fallback">•</span>';
  function readSnapshot(key,version,collection){
    let data;try{const raw=localStorage.getItem(key);if(!raw)return{state:'missing',items:[]};data=JSON.parse(raw)}catch{return{state:'invalid',items:[]}}
    if(data?.version!==version||!Array.isArray(data?.[collection])||!/^\d{4}-\d{2}-\d{2}$/.test(data?.date||'')||!Number.isFinite(Date.parse(data?.generatedAt)))return{state:'invalid',items:[]};
    if(data.date!==today)return{state:'stale',items:[],data};
    return{state:data[collection].length?'ready':'empty',items:data[collection],data};
  }
  function emptyState(snapshot,type){
    const label=type==='games'?'oportunidade forte':'jogador forte';
    if(snapshot.state==='missing'||snapshot.state==='invalid')return `<div class="top-empty"><div><strong>Execute a análise do dia para gerar o Top do Dia.</strong><span>O snapshot de ${type==='games'?'jogos':'jogadores'} ainda não está disponível.</span><a href="analysis.html">Abrir Análise Rápida</a></div></div>`;
    if(snapshot.state==='stale')return `<div class="top-empty"><div><strong>Os resultados disponíveis pertencem a outra data.</strong><span>Execute a análise de hoje para atualizar o Top do Dia.</span><a href="analysis.html">Abrir Análise Rápida</a></div></div>`;
    return `<div class="top-empty"><div><strong>Nenhuma ${label} encontrada para esta data.</strong><span>O snapshot foi carregado corretamente, mas nenhum resultado atingiu o critério forte.</span></div></div>`;
  }
  function bestGames(snapshot){
    if(snapshot.state!=='ready')return[];
    const best=new Map;
    engine.opportunities({games:snapshot.items}).filter(item=>item.key!=='over05'&&item.level==='strong').sort(engine.compareRecommendations).forEach(item=>{const id=String(item.game.fixture.id);if(!best.has(id))best.set(id,item)});
    return [...best.values()].sort(engine.compareRecommendations);
  }
  function windowBadge(item,key,label){const metric=item.game.sampleMetrics?.[key]?.[item.key];return metric?.total?`<span>${label} <b>${metric.hits}/${metric.total}</b></span>`:''}
  function bankrollHref(item){const fields=engine.entryFields(item),params=new URLSearchParams({newEntry:'1',...fields});return `bankroll.html?${params}`}
  function gameCard(item,index){
    const game=item.game,rank=index+1,evidence=item.metric.evidence||item.metric;
    return `<article class="top-card rank-${rank}"><div class="rank-badge"><span>${medal(rank)}</span></div><div class="top-main"><div class="top-meta"><span>${cpEscape(game.league.name)}</span><span>${cpEscape(time(game.fixture.date))}</span></div><div class="top-teams"><div class="top-team home"><strong>${cpEscape(game.teams.home.name)}</strong>${teamLogo(game.teams.home)}</div><i>×</i><div class="top-team away">${teamLogo(game.teams.away)}<strong>${cpEscape(game.teams.away.name)}</strong></div></div><div class="market-title"><strong>${cpEscape(item.market.label)}</strong><span>${cpEscape(item.market.detail)}</span></div><div class="sample-badges">${windowBadge(item,'l5','L5')}${windowBadge(item,'l10','L10')}<span>Amostra <b>${evidence.total}</b></span></div></div><div class="top-score"><span class="history-rate">${Math.round(item.metric.value)}%</span><span class="history-label">frequência histórica</span><span class="confidence-high">CONFIANÇA ALTA</span><div class="top-actions"><a href="match.html?id=${encodeURIComponent(game.fixture.id)}">Ver análise</a><a class="bankroll-link" href="${bankrollHref(item)}">+ Minha Banca</a></div></div></article>`;
  }
  function topPlayers(snapshot){
    if(snapshot.state!=='ready')return[];
    const unique=new Map;
    snapshot.items.filter(item=>item.games>=5&&item.minutes>=270&&item.average>=.7).forEach(item=>{const key=`${item.fixture?.id}:${item.player?.id}`,current=unique.get(key);if(!current||item.average>current.average)unique.set(key,item)});
    return [...unique.values()].sort((a,b)=>b.average-a.average||(b.shotsOn??-Infinity)-(a.shotsOn??-Infinity)||(b.games??-Infinity)-(a.games??-Infinity)||(b.minutes??-Infinity)-(a.minutes??-Infinity)||new Date(a.fixture?.date)-new Date(b.fixture?.date));
  }
  function playerCard(item,index){
    const rank=index+1,statusClass=item.status==='OFICIAL'?'official':item.status==='PROVÁVEL'?'probable':'unconfirmed',opponent=item.opponent?.name||'—';
    return `<article class="top-card player-card rank-${rank}"><div class="rank-badge"><span>${medal(rank)}</span></div><div class="top-main"><img class="player-photo" src="${cpEscape(item.player?.photo||'')}" alt="" loading="lazy"><div class="player-name"><strong>${cpEscape(item.player?.name)}</strong><span>${cpEscape(item.player?.position||'Posição não informada')} · ${cpEscape(item.team?.name)} x ${cpEscape(opponent)}</span><div class="player-market">CHUTES NO GOL</div></div></div><div class="top-score"><div class="top-meta"><span>${cpEscape(item.league?.name)}</span><span>${cpEscape(time(item.fixture?.date))}</span></div><div class="player-numbers"><span>Média<b>${Number(item.average).toFixed(2)} por jogo</b></span><span>Jogos<b>${item.games}</b></span><span>Minutos<b>${item.minutes}</b></span><span>Chutes no gol<b>${item.shotsOn}</b></span></div><span class="player-status ${statusClass}">${cpEscape(item.status||'SEM CONFIRMAÇÃO')}</span></div></article>`;
  }
  function render(){
    const gamesSnapshot=readSnapshot(GAMES_KEY,3,'games'),playersSnapshot=readSnapshot(PLAYERS_KEY,1,'players'),games=bestGames(gamesSnapshot),players=topPlayers(playersSnapshot);
    $('topGamesCount').textContent=games.length;$('topPlayersCount').textContent=players.length;
    const updated=[gamesSnapshot.data?.generatedAt,playersSnapshot.data?.generatedAt].map(Date.parse).filter(Number.isFinite).sort((a,b)=>b-a)[0];$('lastUpdated').textContent=updated?new Date(updated).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'—';$('snapshotMeta').textContent=updated?`Atualizado às ${$('lastUpdated').textContent}`:'Aguardando análises';
    $('topGamesList').innerHTML=games.length?games.map(gameCard).join(''):emptyState(gamesSnapshot,'games');
    $('topPlayersList').innerHTML=players.length?players.map(playerCard).join(''):emptyState(playersSnapshot,'players');
  }
  document.querySelectorAll('[data-top-tab]').forEach(button=>button.addEventListener('click',()=>{const tab=button.dataset.topTab;document.querySelectorAll('[data-top-tab]').forEach(item=>item.classList.toggle('active',item===button));$('topGamesPanel').hidden=tab!=='games';$('topPlayersPanel').hidden=tab!=='players'}));
  render();
}());
