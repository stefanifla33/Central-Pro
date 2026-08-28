(function(){
  const fixtureRequests=new Map(),fixtureResults=new Map();let playerTabActive=false,refreshQueued=false,allPlayerRows=[];
  const PLAYER_SNAPSHOT_KEY='centralPro.players.snapshot.v1',PLAYER_SNAPSHOT_VERSION=1;
  let playerSnapshotDate=null,playerSnapshotTimer=null,playerSnapshotDirty=false;
  const statValue=(statistics,path)=>path.reduce((value,key)=>value?.[key],statistics);
  const number=value=>{if(value==null||value==='')return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null};
  const position=item=>({Goalkeeper:'G',Defender:'D',Midfielder:'M',Attacker:'A',Forward:'A',F:'A'}[item.statistics?.games?.position||item.player?.position]||item.statistics?.games?.position||item.player?.position||'—');
  const analyzedDate=()=>document.getElementById('analysisDate')?.value||'';
  const compactTeam=team=>team?{id:team.id,name:team.name,logo:team.logo||null}:null;
  function snapshotPlayer(item){
    const game=item.game,home=game.teams.home,away=game.teams.away,isHome=Number(item.team.id)===Number(home.id),opponent=isHome?away:Number(item.team.id)===Number(away.id)?home:null,playerPosition=position(item);
    return{fixture:{id:game.fixture.id,date:game.fixture.date,teams:{home:compactTeam(home),away:compactTeam(away)}},league:{id:game.league.id,name:game.league.name,country:game.league.country||null},team:compactTeam(item.team),opponent:compactTeam(opponent),player:{id:item.player.id,name:item.player.name,photo:item.player.photo||null,position:playerPosition==='—'?null:playerPosition},status:item.status,games:item.games,minutes:item.minutes,shotsOn:item.shotsOn,average:item.average};
  }
  function persistPlayerSnapshot(){
    if(playerSnapshotTimer!==null){clearTimeout(playerSnapshotTimer);playerSnapshotTimer=null}
    if(!playerSnapshotDirty)return;
    playerSnapshotDirty=false;
    const date=playerSnapshotDate||analyzedDate();
    try{localStorage.setItem(PLAYER_SNAPSHOT_KEY,JSON.stringify({version:PLAYER_SNAPSHOT_VERSION,date,generatedAt:new Date().toISOString(),players:allPlayerRows.map(snapshotPlayer)}))}catch{}
  }
  function schedulePlayerSnapshot(){
    playerSnapshotDate=analyzedDate();playerSnapshotDirty=true;
    if(playerSnapshotTimer===null)playerSnapshotTimer=setTimeout(persistPlayerSnapshot,500);
  }
  function resetPlayerSnapshotForDate(date=analyzedDate()){
    if(!date||playerSnapshotDate===date)return;
    if(playerSnapshotTimer!==null){clearTimeout(playerSnapshotTimer);playerSnapshotTimer=null}
    playerSnapshotDate=date;playerSnapshotDirty=true;allPlayerRows=[];persistPlayerSnapshot();
  }
  try{const saved=JSON.parse(localStorage.getItem(PLAYER_SNAPSHOT_KEY));if(saved?.version===PLAYER_SNAPSHOT_VERSION&&typeof saved.date==='string'&&Array.isArray(saved.players))playerSnapshotDate=saved.date}catch{}
  const probableScore=item=>(item.recentScore||0)*100+(Number(item.statistics?.games?.lineups)||0)*10+(Number(item.statistics?.games?.minutes)||0)/90+(Number(item.statistics?.games?.rating)||0);
  function probableIds(team){return new Set([...(team.players||[])].sort((a,b)=>probableScore(b)-probableScore(a)).slice(0,11).map(item=>item.player.id))}
  function normalizedPlayers(result,game){
    const statsById=new Map((result.playerStatsTeams||[]).flatMap(team=>(team.players||[]).map(item=>[`${team.team.id}:${item.player.id}`,{...item,team:team.team}]))),rows=[];
    if(result.status==='available'&&(result.lineups||[]).length){for(const lineup of result.lineups){const starters=new Set((lineup.startXI||[]).map(item=>item.player.id));for(const item of [...(lineup.startXI||[]),...(lineup.substitutes||[])]){const stats=statsById.get(`${lineup.team.id}:${item.player.id}`);rows.push({team:lineup.team,player:{...(stats?.player||{}),...item.player},statistics:stats?.statistics||null,status:starters.has(item.player.id)?'OFICIAL':'SEM CONFIRMAÇÃO'})}}}
    else if(result.status==='probable'){for(const team of result.probableTeams||[]){const likely=probableIds(team);for(const item of team.players||[])rows.push({...item,team:team.team,status:likely.has(item.player.id)?'PROVÁVEL':'SEM CONFIRMAÇÃO'})}}
    else for(const team of result.playerStatsTeams||[])for(const item of team.players||[])rows.push({...item,team:team.team,status:'SEM CONFIRMAÇÃO'});
    return rows.map(item=>{const games=number(statValue(item.statistics,['games','appearences'])),minutes=number(statValue(item.statistics,['games','minutes'])),shotsOn=number(statValue(item.statistics,['shots','on']));return{...item,game,games,minutes,shotsOn,average:games&&shotsOn!=null?shotsOn/games:null}});
  }
  function balancedTop(rows,limit=8){
    const byTeam=new Map;for(const item of rows){if(!byTeam.has(item.team.id))byTeam.set(item.team.id,[]);byTeam.get(item.team.id).push(item)}
    for(const teamRows of byTeam.values())teamRows.sort((a,b)=>(b.average??-1)-(a.average??-1));
    const selected=[];for(const teamRows of byTeam.values())selected.push(...teamRows.slice(0,4));
    if(selected.length<limit){const chosen=new Set(selected),remaining=rows.filter(item=>!chosen.has(item)).sort((a,b)=>(b.average??-1)-(a.average??-1));selected.push(...remaining.slice(0,limit-selected.length))}
    return selected.sort((a,b)=>(b.average??-1)-(a.average??-1)).slice(0,limit);
  }
  function selectRelevant(){
    const includeUnconfirmed=document.getElementById('playerStatusFilter').value==='all',showNoData=document.getElementById('showPlayerNoData').checked,selected=[];
    const byFixture=new Map;for(const item of allPlayerRows){if(!byFixture.has(item.game.fixture.id))byFixture.set(item.game.fixture.id,[]);byFixture.get(item.game.fixture.id).push(item)}
    for(const rows of byFixture.values()){
      const statusRows=rows.filter(item=>includeUnconfirmed||item.status==='OFICIAL'||item.status==='PROVÁVEL');
      const relevant=statusRows.filter(item=>item.games>=5&&item.minutes>=270&&item.shotsOn!=null&&item.average>=.2);
      const missing=showNoData?statusRows.filter(item=>item.games==null||item.minutes==null||item.shotsOn==null):[];
      selected.push(...balancedTop([...relevant,...missing],8));
    }
    return selected;
  }
  function row(item){
    const statusClass=item.status==='OFICIAL'?'official':item.status==='PROVÁVEL'?'probable':'unconfirmed',game=item.game,tone=item.average==null?'low':item.average>=.7?'high':item.average>=.35?'mid':'low';
    const bankrollData=encodeURIComponent(JSON.stringify({date:document.getElementById('analysisDate').value,competition:game.league.name,match:`${game.teams.home.name} x ${game.teams.away.name}`,market:'Chutes no gol',selection:`${item.player.name} +0.5`}));
    return `<tr class="player-row" data-match="${game.fixture.id}"><td><div class="player-person"><img src="${cpEscape(item.player.photo||'')}" alt=""><span><strong>${cpEscape(item.player.name)}</strong><small>${cpEscape(position(item))}</small></span></div></td><td><span class="player-team-name">${cpEscape(item.team.name)}</span><span class="player-match-name">${cpEscape(game.teams.home.name)} × ${cpEscape(game.teams.away.name)}</span></td><td><span class="player-status ${statusClass}">${item.status}</span></td><td><span class="player-season-number">${item.games??'—'}</span></td><td><span class="player-season-number">${item.shotsOn??'—'}</span></td><td>${item.average==null?'<span class="player-no-data">Sem dados</span>':`<span class="player-average ${tone}">${item.average.toFixed(2)}</span>`}</td><td><button class="bankroll-add" data-bankroll="${bankrollData}" type="button">+ Minha Banca</button></td></tr>`;
  }
  function renderPlayers(){
    const body=document.getElementById('playerScannerBody'),meta=document.getElementById('playerLoadMeta'),selected=selectRelevant(),sample=allPlayerRows.filter(item=>item.games>=5&&item.minutes>=270&&item.shotsOn!=null),confirmed=sample.filter(item=>item.status==='OFICIAL'||item.status==='PROVÁVEL');
    meta.textContent=`${allPlayerRows.length} encontrados · ${sample.length} com amostra · ${confirmed.length} oficiais/prováveis · ${selected.length} relevantes`;
    body.innerHTML=selected.length?selected.map(row).join(''):'<tr><td class="player-scanner-empty" colspan="7"><span>♙</span><strong>Nenhum jogador atingiu os critérios</strong><small>Mínimo de 5 jogos, 270 minutos e média de 0,20 chute no gol por jogo.</small></td></tr>';body.querySelectorAll('[data-bankroll]').forEach(button=>button.onclick=event=>{event.preventDefault();event.stopPropagation();const data=JSON.parse(decodeURIComponent(button.dataset.bankroll)),params=new URLSearchParams({newEntry:'1',...data});location.href=`bankroll.html?${params}`});cpBindMatches();
  }
  async function requestFixture(game){if(fixtureResults.has(game.fixture.id))return fixtureResults.get(game.fixture.id);if(!fixtureRequests.has(game.fixture.id))fixtureRequests.set(game.fixture.id,fetch(`/api/partidas/${game.fixture.id}/jogadores`).then(async response=>{const data=await response.json();if(!response.ok||data.status==='error')throw Error(data.erro||'Jogadores indisponíveis.');fixtureResults.set(game.fixture.id,data);return data}));return fixtureRequests.get(game.fixture.id)}
  async function loadPlayerPilot(){
    if(!playerTabActive)return;const loadDate=analyzedDate();resetPlayerSnapshotForDate(loadDate);const games=fixtures.filter(game=>CP_MAIN_LEAGUES.has(game.league.id)&&metrics.get(game.fixture.id)?.coverage),body=document.getElementById('playerScannerBody'),meta=document.getElementById('playerLoadMeta');
    if(!games.length){body.innerHTML='<tr><td class="player-scanner-empty" colspan="7"><span>♙</span><strong>Aguardando partidas prioritárias analisadas</strong><small>Nenhuma chamada de jogadores foi iniciada.</small></td></tr>';meta.textContent='0 partidas processadas';return}
    body.innerHTML='<tr><td class="player-scanner-empty" colspan="7"><span>♙</span><strong>Selecionando jogadores relevantes…</strong><small>Usando somente estatísticas agregadas já disponíveis.</small></td></tr>';
    const settled=await Promise.allSettled(games.map(async game=>normalizedPlayers(await requestFixture(game),game)));allPlayerRows=settled.filter(item=>item.status==='fulfilled').flatMap(item=>item.value);renderPlayers();if(loadDate===analyzedDate()){schedulePlayerSnapshot();const pending=[...analysisState.values()].some(state=>state==='queued'||state==='loading');if(!pending)persistPlayerSnapshot()}
  }
  document.querySelector('[data-analysis-tab="players"]')?.addEventListener('click',()=>{playerTabActive=true;loadPlayerPilot()});
  document.querySelector('[data-analysis-tab="goals"]')?.addEventListener('click',()=>{playerTabActive=false});
  document.getElementById('playerStatusFilter')?.addEventListener('change',renderPlayers);document.getElementById('showPlayerNoData')?.addEventListener('change',renderPlayers);
  window.addEventListener('centralpro:analysis-ready',()=>{if(!playerTabActive||refreshQueued)return;refreshQueued=true;setTimeout(()=>{refreshQueued=false;loadPlayerPilot()},100)});
  ['todayButton','tomorrowButton'].forEach(id=>document.getElementById(id)?.addEventListener('click',()=>setTimeout(()=>resetPlayerSnapshotForDate(),0)));
  document.getElementById('analysisDate')?.addEventListener('change',()=>setTimeout(()=>resetPlayerSnapshotForDate(),0));
  window.addEventListener('pagehide',persistPlayerSnapshot);
  resetPlayerSnapshotForDate();
})();
