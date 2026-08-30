(function(){
  'use strict';
  const GAMES_KEY='centralPro.opportunities.v1',today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),$=id=>document.getElementById(id);
  const engine=window.CPOpportunityEngine;
  const TOP_GAME_MARKETS=new Set(['over05HT','over15','over25','btts','homeScores','awayScores']);
  const time=value=>new Date(value).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'});
  const medal=rank=>['🥇','🥈','🥉'][rank-1]||rank;
  const teamLogo=team=>team?.logo?`<img src="${cpEscape(team.logo)}" alt="" loading="lazy">`:'<span class="team-logo-fallback">•</span>';
  function readSnapshot(){
    let data;try{const raw=localStorage.getItem(GAMES_KEY);if(!raw)return{state:'missing',items:[]};data=JSON.parse(raw)}catch{return{state:'invalid',items:[]}}
    if(data?.version!==3||!Array.isArray(data?.games)||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data?.date||'')||!Number.isFinite(Date.parse(data?.generatedAt)))return{state:'invalid',items:[]};
    if(data.date!==today)return{state:'stale',items:[],data};
    return{state:data.games.length?'ready':'empty',items:data.games,data};
  }
  function emptyState(snapshot){
    if(snapshot.state==='missing'||snapshot.state==='invalid')return '<div class="top-empty"><div><strong>Execute a análise do dia para gerar o Top do Dia.</strong><span>O snapshot de jogos ainda não está disponível.</span><a href="analysis.html">Abrir Análise Rápida</a></div></div>';
    if(snapshot.state==='stale')return '<div class="top-empty"><div><strong>Os resultados disponíveis pertencem a outra data.</strong><span>Execute a análise de hoje para atualizar o Top do Dia.</span><a href="analysis.html">Abrir Análise Rápida</a></div></div>';
    return '<div class="top-empty"><div><strong>Nenhuma oportunidade forte encontrada para esta data.</strong><span>O snapshot foi carregado corretamente, mas nenhum mercado de gols atingiu o critério forte.</span></div></div>';
  }
  function bestGames(snapshot){
    if(snapshot.state!=='ready')return[];
    const best=new Map;
    engine.opportunities({games:snapshot.items}).filter(item=>TOP_GAME_MARKETS.has(item.key)&&item.level==='strong').sort(engine.compareRecommendations).forEach(item=>{const id=String(item.game.fixture.id);if(!best.has(id))best.set(id,item)});
    return[...best.values()].sort(engine.compareRecommendations);
  }
  function windowBadge(item,key,label){const metric=item.game.sampleMetrics?.[key]?.[item.key];return metric?.total?`<span>${label} <b>${metric.hits}/${metric.total}</b></span>`:''}
  function bankrollHref(item){const fields=engine.entryFields(item),params=new URLSearchParams({newEntry:'1',...fields});return`bankroll.html?${params}`}
  function gameCard(item,index){
    const game=item.game,rank=index+1,evidence=item.metric.evidence||item.metric;
    return`<article class="top-card rank-${rank}"><div class="rank-badge"><span>${medal(rank)}</span></div><div class="top-main"><div class="top-meta"><span>${cpEscape(cpLeagueDisplayName(game.league))}</span><span>${cpEscape(time(game.fixture.date))}</span></div><div class="top-teams"><div class="top-team home"><strong>${cpEscape(game.teams.home.name)}</strong>${teamLogo(game.teams.home)}</div><i>×</i><div class="top-team away">${teamLogo(game.teams.away)}<strong>${cpEscape(game.teams.away.name)}</strong></div></div><div class="market-title"><strong>${cpEscape(item.market.label)}</strong><span>${cpEscape(item.market.detail)}</span></div><div class="sample-badges">${windowBadge(item,'l5','L5')}${windowBadge(item,'l10','L10')}<span>Amostra <b>${evidence.total}</b></span></div></div><div class="top-score"><span class="history-rate">${Math.round(item.metric.value)}%</span><span class="history-label">frequência histórica</span><span class="confidence-high">CONFIANÇA ALTA</span><div class="top-actions"><a href="match.html?id=${encodeURIComponent(game.fixture.id)}">Ver análise</a><a class="bankroll-link" href="${bankrollHref(item)}">+ Minha Banca</a></div></div></article>`;
  }
  const snapshot=readSnapshot(),games=bestGames(snapshot),updated=Date.parse(snapshot.data?.generatedAt);
  $('topGamesCount').textContent=games.length;
  $('lastUpdated').textContent=Number.isFinite(updated)?`Atualizado às ${new Date(updated).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'Aguardando análise';
  $('snapshotMeta').textContent=Number.isFinite(updated)?$('lastUpdated').textContent:'Aguardando análises';
  $('topGamesList').innerHTML=games.length?games.map(gameCard).join(''):emptyState(snapshot);
}());
