(function(){
  'use strict';
  let recentPlayersData=null;
  let recentPlayersPromise=null;
  let activePlayerMarket='shotsOnGoal';
  const marketLabels={shotsOnGoal:'Chutes no gol',shotsTotal:'Finalizações',goals:'Gols',assists:'Assistências',tackles:'Desarmes',foulsCommitted:'Faltas cometidas',foulsDrawn:'Faltas sofridas'};
  const playerHref=playerId=>`player.html?id=${encodeURIComponent(playerId)}&fixture=${encodeURIComponent(id)}`;
  const numberText=(value,digits=2)=>value==null?'—':Number(value).toFixed(digits);
  const playerImage=player=>`<img src="${safe(player?.photo||lineupPhoto(player))}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`;
  const coverageText=summary=>summary?.frequency?.sample?`${summary.frequency.hits}/${summary.frequency.sample}`:'—';
  function playerForm(games){
    if(!games?.length)return '<span class="premium-data-note">Histórico indisponível</span>';
    return games.map(game=>`<i>${safe(game.value)}</i>`).join('');
  }
  function formBars(games){
    if(!games?.length)return '';
    const maximum=Math.max(1,...games.map(game=>Number(game.value)||0));
    return games.map(game=>`<i style="height:${Math.max(4,Math.round((Number(game.value)||0)*25/maximum)+5)}px" title="${safe(game.value)}"></i>`).join('');
  }
  function combinedLeaders(market){
    const rows=(recentPlayersData?.teams||[]).flatMap(team=>(team.markets?.[market]||[]).map(row=>({...row,team:team.team})));
    return rows.sort((a,b)=>b.average-a.average||b.frequency.hits-a.frequency.hits||b.games.reduce((n,g)=>n+Number(g.minutes||0),0)-a.games.reduce((n,g)=>n+Number(g.minutes||0),0)||b.frequency.sample-a.frequency.sample).slice(0,5);
  }
  function chosenHighlights(){
    const chosen=[],seen=new Set();
    for(const market of Object.keys(marketLabels))for(const row of combinedLeaders(market).slice(0,2)){
      if(seen.has(row.player.id))continue;
      seen.add(row.player.id);chosen.push({...row,market});break;
    }
    for(const row of combinedLeaders('shotsTotal'))if(chosen.length<6&&!seen.has(row.player.id)){seen.add(row.player.id);chosen.push({...row,market:'shotsTotal'})}
    return chosen.slice(0,6);
  }
  function highlightCard(row){return `<a class="premium-highlight" href="${playerHref(row.player.id)}">${`<div class="premium-player-id">${playerImage(row.player)}<span><strong>${safe(row.player.name)}</strong><span>${safe(row.team.name)} · ${safe(row.player.positionGroup||row.player.position||'—')}</span></span></div>`}<div class="premium-highlight-label">${safe(marketLabels[row.market])}</div><div class="premium-highlight-value">${numberText(row.average)} <small>/ jogo</small></div><div class="premium-sequence">${formBars(row.games)}</div><div class="premium-highlight-meta"><span>${row.frequency.sample} jogos com dado</span><span>Frequência ${row.frequency.hits}/${row.frequency.sample}</span></div></a>`}
  function fieldPlayer(item){const player=item.player||{};return `<a class="premium-field-player" href="${playerHref(player.id)}" style="left:${item._x}%;top:${item._y}%">${playerImage(player)}<strong>${safe(player.name||'Jogador')}</strong></a>`}
  function benchPlayer(item){const player=item.player||{};return `<a class="premium-bench-player" href="${playerHref(player.id)}">${playerImage(player)}<span>${safe(player.name||'Jogador')}</span><b>${safe(lineupPosition(player.pos))}</b></a>`}
  function lineupTeams(result){
    const status=result.lineupStatus||(result.status==='available'?'official':result.status==='probable'?'probable':'unavailable');
    if(status==='official'&&result.lineups?.length)return result.lineups;
    if(status==='probable'&&result.probableTeams?.length)return result.probableTeams.map(buildProbableTeam);
    return [];
  }
  function lineupsMarkup(result){
    const teams=lineupTeams(result),status=result.lineupStatus||(result.status==='available'?'official':result.status==='probable'?'probable':'unavailable'),probable=status==='probable';
    if(!teams.length)return `<div class="card lineup-message"><h2>Escalação ainda não divulgada</h2><p>Os dados serão atualizados quando estiverem disponíveis.</p></div>`;
    return `<div class="premium-lineup-grid">${teams.map(team=>`<article class="card premium-lineup-team"><header class="premium-lineup-head"><strong>${safe(team.team?.name)}</strong><span>${probable?'Provável':'Oficial'} · ${safe(team.formation||'—')}</span></header><div class="premium-pitch">${gridCoordinates(team.startXI||[]).map(fieldPlayer).join('')}</div><div class="premium-bench"><h3>Reservas · ${(team.substitutes||[]).length}</h3><div class="premium-bench-list">${(team.substitutes||[]).length?(team.substitutes||[]).map(benchPlayer).join(''):'<div class="empty">Nenhuma opção informada.</div>'}</div></div></article>`).join('')}</div>`;
  }
  function highlightsMarkup(){const rows=chosenHighlights();return rows.length?`<div class="premium-player-highlights">${rows.map(highlightCard).join('')}</div>`:'<div class="card empty">Histórico recente de jogadores ainda indisponível.</div>'}
  function rankingMarkup(){
    const rankRow=(row,index,team)=>`<a class="premium-rank-row" href="${playerHref(row.player.id)}"><strong>${index+1}</strong>${playerImage(row.player)}<span class="premium-rank-name"><b>${safe(row.player.name)}</b><small>${safe(team.name)} · ${safe(row.player.positionGroup||row.player.position||'—')}</small></span><span class="premium-rank-form">${playerForm(row.games)}</span><span class="premium-rank-value"><b>${numberText(row.average)}</b><small>${row.frequency.sample} jogos · ${coverageText(row)}</small></span></a>`;
    const teams=(recentPlayersData?.teams||[]).slice(0,2);
    return `<div class="premium-team-rankings">${teams.map(({team,markets},teamIndex)=>{const rows=[...(markets?.[activePlayerMarket]||[])].filter(row=>row.average!=null&&Number.isFinite(Number(row.average))).sort((a,b)=>b.average-a.average||b.frequency.hits-a.frequency.hits||b.frequency.sample-a.frequency.sample).slice(0,5);return `<section class="premium-team-ranking"><header><img src="${safe(team.logo)}" alt=""><div><small>${teamIndex===0?'TIME DA CASA':'TIME VISITANTE'}</small><strong>${safe(team.name)}</strong></div></header><div class="premium-ranking">${rows.length?rows.map((row,index)=>rankRow(row,index,team)).join(''):'<div class="empty">Nenhum dado confiável para este mercado.</div>'}</div></section>`}).join('')}</div>`;
  }
  function bindPremiumPlayers(){
    document.querySelectorAll('[data-premium-market]').forEach(button=>button.onclick=()=>{activePlayerMarket=button.dataset.premiumMarket;document.querySelectorAll('[data-premium-market]').forEach(item=>item.classList.toggle('active',item===button));document.querySelector('[data-premium-ranking]').innerHTML=rankingMarkup()});
  }
  window.renderPlayers=function(){
    const box=document.getElementById('players');
    if(!playersData||!recentPlayersData){box.innerHTML='<div class="card"><div class="empty">Carregando jogadores…</div></div>';return}
    box.innerHTML=`<div class="premium-players"><section class="premium-section"><header class="premium-section-head"><div><small>Formações</small><h2>Escalações</h2></div><p>Posicionamento informado pela competição ou projeção claramente identificada.</p></header>${lineupsMarkup(playersData)}</section><section class="premium-section"><header class="premium-section-head"><div><small>Últimos jogos</small><h2>Destaques da partida</h2></div><p>Seleção objetiva baseada somente no histórico recente disponível.</p></header>${highlightsMarkup()}</section><section class="premium-section"><header class="premium-section-head"><div><small>Comparativo</small><h2>Melhores por mercado</h2></div><p>Máximo de cinco jogadores por equipe. Ausência de estatística não conta como zero.</p></header><article class="card premium-market-card"><nav class="premium-market-tabs">${Object.entries(marketLabels).map(([key,label])=>`<button class="${key===activePlayerMarket?'active':''}" data-premium-market="${key}">${label}</button>`).join('')}</nav><div data-premium-ranking>${rankingMarkup()}</div></article></section><div class="premium-data-note">Forma recente: fixtures concluídas e anteriores à partida, com participação confirmada por minutos. A cobertura é específica de cada métrica.</div></div>`;
    bindPremiumPlayers();correctTeamNames();
  };
  window.loadPlayers=async function(force=false,silent=false){
    const box=document.getElementById('players');
    if(!/^\d+$/.test(id||'')){box.innerHTML='<div class="card empty">ID da partida inválido.</div>';return}
    if(force&&Date.now()<lineupRefreshLockedUntil)return;
    if(playersData&&recentPlayersData&&!force)return renderPlayers();
    if(!silent)box.innerHTML='<div class="lineup-skeleton" aria-label="Carregando jogadores"></div>';
    lineupRefreshLockedUntil=Date.now()+20000;
    try{
      const lineupRequest=fetch(`/api/partidas/${encodeURIComponent(id)}/jogadores${force?'?refresh=1':''}`).then(async response=>{const result=await response.json();if(!response.ok||result.status==='error')throw Error(result.erro||'Escalações indisponíveis.');return result});
      if(!recentPlayersPromise||force)recentPlayersPromise=fetch(`/api/partidas/${encodeURIComponent(id)}/jogadores-recentes`).then(async response=>{const result=await response.json();if(!response.ok)throw Error(result.erro||'Histórico recente indisponível.');return result});
      [playersData,recentPlayersData]=await Promise.all([lineupRequest,recentPlayersPromise]);renderPlayers();
    }catch(error){if(!silent)box.innerHTML=`<div class="card lineup-message"><h2>Não foi possível carregar os jogadores</h2><p>${safe(error.message)}</p><button class="lineup-refresh" onclick="loadPlayers(true)">Tentar novamente</button></div>`}
  };
}());
