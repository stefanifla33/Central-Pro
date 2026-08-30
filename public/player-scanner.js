(function(){
  const fixtureRequests=new Map();
  let playerTabActive=false,runToken=0,activeRows=[],activeDate='',lastCompleteSnapshot=null;
  const snapshot=window.CPPlayerSnapshot;
  const analyzedDate=()=>document.getElementById('analysisDate')?.value||'';
  const position=row=>row.playerPosition||'—';

  async function json(url){
    const response=await fetch(url),data=await response.json();
    if(!response.ok||data?.status==='error')throw Error(data?.erro||'Jogadores indisponíveis.');
    return data;
  }
  function requestFixture(game){
    if(!cpIsScannerEligibleGame(game))return Promise.resolve(null);
    const key=`${game.fixture.id}:${game.fixture.date}`;
    if(!fixtureRequests.has(key))fixtureRequests.set(key,(async()=>{
      const scannerQuery=`mode=scanner&league=${encodeURIComponent(game.league.id)}`;
      const confirmation=await json(`/api/partidas/${game.fixture.id}/jogadores?confirmationOnly=1&${scannerQuery}`);
      const confirmationStatus=confirmation?.lineupStatus==='official'||confirmation?.status==='available'?'official':confirmation?.lineupStatus==='probable'||confirmation?.status==='probable'?'probable':null;
      if(!confirmationStatus)return null;
      const ids=team=>{const lineup=(confirmation.lineups||[]).find(item=>Number(item.team?.id)===Number(team.id)),probable=(confirmation.probableTeams||[]).find(item=>Number(item.team?.id)===Number(team.id));return [...(lineup?.startXI||[]),...(lineup?.substitutes||[])].map(item=>item.player?.id).concat((probable?.players||[]).map(item=>item.player?.id)).filter(Number.isSafeInteger)};
      const recent=await json(`/api/partidas/${game.fixture.id}/jogadores-recentes?${scannerQuery}&confirmation=${confirmationStatus}&homePlayers=${ids(game.teams.home).join(',')}&awayPlayers=${ids(game.teams.away).join(',')}`);
      return snapshot.rowsFromResponses(game,confirmation,recent);
    })());
    return fixtureRequests.get(key);
  }
  function selectedRows(){
    const includeUnconfirmed=document.getElementById('playerStatusFilter')?.value==='all';
    return snapshot.selectQualified(activeRows).filter(row=>includeUnconfirmed||snapshot.confirmedStatus(row.status));
  }
  function row(item){
    const game=fixtures.find(value=>Number(value.fixture.id)===Number(item.fixtureId));
    const statusClass=item.status==='OFICIAL'?'official':'probable',tone=item.average>=.7?'high':item.average>=.35?'mid':'low';
    const bankrollData=encodeURIComponent(JSON.stringify({date:activeDate,competition:item.leagueName,match:`${item.teamName} x ${item.opponentName}`,market:'Chutes no gol',selection:`${item.playerName} +0.5`}));
    return `<tr class="player-row" data-match="${item.fixtureId}"><td><div class="player-person"><img src="${cpEscape(item.playerPhoto||'')}" alt=""><span><strong>${cpEscape(item.playerName)}</strong><small>${cpEscape(position(item))}</small></span></div></td><td><span class="player-team-name">${cpEscape(item.teamName)}</span><span class="player-match-name">${cpEscape(game?.teams.home.name||item.teamName)} × ${cpEscape(game?.teams.away.name||item.opponentName)}</span></td><td><span class="player-status ${statusClass}">${item.status}</span></td><td><span class="player-season-number">${item.games}</span></td><td><span class="player-season-number">${item.shotsOn}</span></td><td><span class="player-average ${tone}">${item.average.toFixed(2)}</span></td><td><button class="bankroll-add" data-bankroll="${bankrollData}" type="button">+ Minha Banca</button></td></tr>`;
  }
  function renderPlayers(){
    const body=document.getElementById('playerScannerBody'),meta=document.getElementById('playerLoadMeta'),selected=selectedRows();
    meta.textContent=`${activeRows.length} encontrados · ${selected.length} classificados por SOG L5`;
    body.innerHTML=selected.length?selected.map(row).join(''):'<tr><td class="player-scanner-empty" colspan="7"><span>♙</span><strong>Nenhum jogador atingiu os critérios</strong><small>Exige confirmação oficial/provável, 5 jogos válidos, 270 minutos e média mínima de 0,20 SOG.</small></td></tr>';
    body.querySelectorAll('[data-bankroll]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();const data=JSON.parse(decodeURIComponent(button.dataset.bankroll)),params=new URLSearchParams({newEntry:'1',...data});location.href=`bankroll.html?${params}`});
    cpBindMatches();
  }
  function persistComplete(date,rows,token){
    if(token!==runToken||date!==analyzedDate())return false;
    const value=snapshot.createSnapshot(date,rows);
    const saved=snapshot.persist(localStorage,value,date);if(saved)lastCompleteSnapshot=value;return saved;
  }
  async function loadPlayerScanner(){
    if(!playerTabActive)return;
    const body=document.getElementById('playerScannerBody'),meta=document.getElementById('playerLoadMeta');
    if(window.CENTRAL_PRO_OFFLINE){body.innerHTML='<tr><td class="player-scanner-empty" colspan="7"><strong>Modo offline</strong><small>Nenhuma consulta foi iniciada; o snapshot válido anterior foi preservado.</small></td></tr>';meta.textContent='Consultas externas bloqueadas';return}
    const token=++runToken,date=analyzedDate();
    try{const cached=JSON.parse(localStorage.getItem(snapshot.KEY));if(snapshot.validSnapshot(cached)&&cached.date===date){activeDate=date;activeRows=cached.players;renderPlayers();return}}catch{}
    const games=cpSelectScannerFixtures(fixtures);
    activeDate=date;activeRows=[];
    if(!games.length){body.innerHTML='<tr><td class="player-scanner-empty" colspan="7"><strong>Nenhuma partida elegível</strong><small>Nenhuma chamada de jogadores foi iniciada.</small></td></tr>';meta.textContent='0 partidas processadas';return}
    body.innerHTML='<tr><td class="player-scanner-empty" colspan="7"><strong>Carregando jogadores elegíveis…</strong><small>Histórico L5 compartilhado e cacheado pelo servidor.</small></td></tr>';
    let cursor=0,failed=0,completed=0;
    const workers=Array.from({length:3},async()=>{while(cursor<games.length&&token===runToken){const game=games[cursor++];try{const rows=await requestFixture(game);if(rows)activeRows.push(...rows)}catch{failed++}completed++;meta.textContent=`${completed}/${games.length} partidas · ${failed} falhas`;renderPlayers()}});
    await Promise.all(workers);
    if(token!==runToken||date!==analyzedDate())return;
    renderPlayers();
    if(failed===0)persistComplete(date,activeRows,token);
    else meta.textContent+=` · snapshot anterior preservado`;
  }
  document.querySelector('[data-analysis-tab="players"]')?.addEventListener('click',()=>{playerTabActive=true;loadPlayerScanner()});
  document.querySelector('[data-analysis-tab="goals"]')?.addEventListener('click',()=>{playerTabActive=false;runToken++});
  document.getElementById('playerStatusFilter')?.addEventListener('change',renderPlayers);
  ['todayButton','tomorrowButton'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>{runToken++;activeRows=[]}));
  document.getElementById('analysisDate')?.addEventListener('change',()=>{runToken++;activeRows=[]});
  window.addEventListener('pagehide',()=>{if(lastCompleteSnapshot?.date===analyzedDate())snapshot.persist(localStorage,lastCompleteSnapshot,analyzedDate())});
}());
