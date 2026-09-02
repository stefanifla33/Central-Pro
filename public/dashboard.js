const $=id=>document.getElementById(id);
const YOUTH_PATTERN=/\b(?:u[-\s]?(?:17|18|19|20|21|22|23)|youth|juniors?|academy|reserves?)\b/i;
const CONTINENTAL_PATTERN=/\b(?:champions league|libertadores|sudamericana|europa league|conference league|afc|caf|concacaf|conmebol)\b/i;
const CUP_PATTERN=/\b(?:cup|copa|ta[cç]a|pokal|coupe|coppa|beker|trophy)\b/i;
const FIRST_DIVISION_PATTERN=/\b(?:premier|primeira|primera|serie a|liga 1|ligue 1|bundesliga|eredivisie|super league|pro league|division 1)\b/i;
const SECOND_DIVISION_PATTERN=/\b(?:segunda|serie b|liga 2|ligue 2|2\. bundesliga|championship|division 2)\b/i;
const DASHBOARD_IMPORTANT_LEAGUES=new Map([[2,[1000,5]],[13,[1000,5]],[71,[1000,5]],[39,[1000,5]],[140,[1000,5]],[135,[1000,5]],[78,[1000,5]],[61,[1000,5]],[3,[950,5]],[11,[950,5]],[73,[950,4]],[848,[900,5]],[94,[900,5]],[72,[850,3]],[203,[850,5]]]);
const DASHBOARD_OPPORTUNITY_MARKETS={over05HT:{label:'+0.5 HT',minimum:6},over05:{label:'+0.5 gols',minimum:8},over15:{label:'+1.5 gols',minimum:8},over25:{label:'+2.5 gols',minimum:8},btts:{label:'Ambas marcam',minimum:8},homeScores:{label:'Casa marca',minimum:4},awayScores:{label:'Fora marca',minimum:4}};
function dashboardSearchText(game){return[game.league?.name,game.league?.country,game.league?.round,game.teams?.home?.name,game.teams?.away?.name].filter(Boolean).join(' ')}
function isRelevantSeniorGame(game){return!YOUTH_PATTERN.test(dashboardSearchText(game))}
function competitionPriority(game){const league=`${game.league?.name||''} ${game.league?.country||''}`;if(CP_MAIN_LEAGUES.has(game.league?.id))return 1000;if(CONTINENTAL_PATTERN.test(league))return 800;if(CUP_PATTERN.test(league))return 600;if(FIRST_DIVISION_PATTERN.test(league))return 500;if(SECOND_DIVISION_PATTERN.test(league))return 350;return 100}
function dashboardLiveGames(games){return games.filter(cpIsLive).filter(isRelevantSeniorGame).sort((a,b)=>competitionPriority(b)-competitionPriority(a)||new Date(a.fixture.date)-new Date(b.fixture.date))}
const DASHBOARD_SNAPSHOT_VERSION=3;
function dashboardSnapshot(date){try{const snapshot=JSON.parse(localStorage.getItem('centralPro.opportunities.v1')),generated=Date.parse(snapshot?.generatedAt),fresh=Number.isFinite(generated)&&Date.now()-generated<172800000;if(snapshot?.version!==DASHBOARD_SNAPSHOT_VERSION||snapshot.date!==date||!fresh||!Array.isArray(snapshot.games))return{version:DASHBOARD_SNAPSHOT_VERSION,date,games:[]};return snapshot}catch{return{version:DASHBOARD_SNAPSHOT_VERSION,date,games:[]}}}
function dashboardAnalysisIds(snapshot){return new Set(snapshot.games.map(game=>Number(game.fixture?.id)).filter(Number.isFinite))}
function dashboardOpportunityRows(snapshot){return snapshot.games.flatMap(game=>Object.entries(DASHBOARD_OPPORTUNITY_MARKETS).filter(([key])=>key!=='over05').map(([key,market])=>{const metric=game.metrics?.[key];if(!metric||metric.total<market.minimum||metric.value<70)return null;return{game,key,market,metric,strong:metric.value>=80,sampleQuality:Math.min(metric.total/market.minimum,1)}}).filter(Boolean)).sort((a,b)=>Number(b.strong)-Number(a.strong)||b.metric.value-a.metric.value||b.sampleQuality-a.sampleQuality||b.metric.total-a.metric.total||new Date(a.game.fixture.date)-new Date(b.game.fixture.date))}
function dashboardTrendIndex(snapshot){const index=new Map;dashboardOpportunityRows(snapshot).forEach(row=>{const id=Number(row.game.fixture?.id);if(Number.isFinite(id)&&!index.has(id))index.set(id,row)});return index}
function dashboardTeamLogo(team){return team?.logo?`<img src="${cpEscape(team.logo)}" alt="" loading="lazy">`:'<span class="team-logo-fallback">•</span>'}
function dashboardParallelGoalMetrics(data){
  const windows=data?.parallelSamples||{};
  const build=(sample,useEvidence=false)=>{
    if(!sample?.homeRecent||!sample?.awayRecent)return null;
    const calculated=fixtureGoalMetrics({...data,homeRecent:sample.homeRecent,awayRecent:sample.awayRecent});
    if(!calculated)return null;
    return Object.fromEntries(Object.keys(DASHBOARD_OPPORTUNITY_MARKETS).map(key=>{
      const raw=calculated[key],metric=useEvidence?(raw?.evidence||raw):raw;
      return [key,metric?{value:metric.value,hits:metric.hits,total:metric.total}:null];
    }));
  };
  return {l5:build(windows.l5,false),l10:build(windows.l10,true)};
}
function dashboardVenueGoalMetrics(data){
  const windows=data?.venueSamples||{};
  const buildSide=(games,side,useEvidence=false)=>{
    if(!Array.isArray(games)||!games.length)return null;
    const calculated=fixtureGoalMetrics({...data,homeRecent:side==='home'?games:[],awayRecent:side==='away'?games:[]});
    if(!calculated)return null;
    return Object.fromEntries(Object.keys(DASHBOARD_OPPORTUNITY_MARKETS).map(key=>{
      const raw=calculated[key],metric=useEvidence?(raw?.evidence||raw):raw;
      return [key,metric?{value:metric.value,hits:metric.hits,total:metric.total}:null];
    }));
  };
  const buildWindow=(sample,useEvidence=false)=>({
    home:buildSide(sample?.homeRecent,'home',useEvidence),
    away:buildSide(sample?.awayRecent,'away',useEvidence)
  });
  return {l5:buildWindow(windows.l5,false),l10:buildWindow(windows.l10,true)};
}
function dashboardWindowBadges(game,key){
  const l5=game?.sampleMetrics?.l5?.[key],l10=game?.sampleMetrics?.l10?.[key],parts=[];
  if(l5?.total)parts.push(`<span><b>L5</b> ${l5.hits}/${l5.total}</span>`);
  if(l10?.total)parts.push(`<span><b>L10</b> ${l10.hits}/${l10.total}</span>`);
  return parts.length?`<span class="trend-windows">${parts.join('')}</span>`:'';
}
function renderDashboardOpportunities(snapshot){const allRows=dashboardOpportunityRows(snapshot),rows=[...dashboardTrendIndex(snapshot).values()],strong=allRows.filter(row=>row.strong).length;$('dashboardOpportunityCount').textContent=allRows.length;$('dashboardStrongLabel').textContent=allRows.length?`${strong} ${strong===1?'forte':'fortes'}`:'Nenhuma neste momento';$('dashboardOpportunities').innerHTML=rows.slice(0,3).map(row=>`<a class="dashboard-opportunity" href="match.html?id=${row.game.fixture.id}"><span class="dashboard-opportunity-league">${cpEscape(cpLeagueDisplayName(row.game.league))} <i class="${row.strong?'strong':'moderate'}">${row.strong?'Forte':'Moderada'}</i></span><span class="dashboard-opportunity-teams">${dashboardTeamLogo(row.game.teams.home)}<strong>${cpEscape(row.game.teams.home.name)} <small>×</small> ${cpEscape(row.game.teams.away.name)}</strong>${dashboardTeamLogo(row.game.teams.away)}</span><span class="dashboard-opportunity-insight"><span><small>Melhor tendência</small><b>${row.market.label}</b></span><strong class="trend-score"><span class="trend-percent">${Math.round(row.metric.value)}%</span><small class="trend-main-sample">${row.metric.hits}/${row.metric.total}</small>${dashboardWindowBadges(row.game,row.key)}</strong></span><span class="trend-progress"><i style="width:${Math.max(0,Math.min(100,Math.round(row.metric.value)))}%"></i></span></a>`).join('')||'<div class="dashboard-opportunity-empty"><strong>Nenhuma oportunidade disponível</strong><span>As análises de hoje são preparadas automaticamente; nenhuma atingiu os critérios neste momento.</span></div>'}
function importantRank(game){const known=DASHBOARD_IMPORTANT_LEAGUES.get(game.league?.id);if(known)return known;const league=`${game.league?.name||''} ${game.league?.country||''}`;if(CONTINENTAL_PATTERN.test(league))return[800,5];if(CUP_PATTERN.test(league))return[700,4];if(FIRST_DIVISION_PATTERN.test(league))return[650,5];if(SECOND_DIVISION_PATTERN.test(league))return[500,3];return[0,0]}
function dashboardImportantGames(games,analysisIds){return games.filter(isRelevantSeniorGame).filter(game=>importantRank(game)[0]>0).sort((a,b)=>{const ar=importantRank(a),br=importantRank(b);return br[0]-ar[0]||br[1]-ar[1]||new Date(a.fixture.date)-new Date(b.fixture.date)||Number(analysisIds.has(b.fixture.id))-Number(analysisIds.has(a.fixture.id))}).slice(0,9)}
function dashboardHighlightCard(game,trend,analysis){const live=cpIsLive(game),time=live?cpStatus(game):cpTime(game),trendMarkup=`<div class="featured-trend"><span><small>Melhor tendência</small><b>${trend.market.label}</b></span><strong class="trend-score"><span class="trend-percent">${Math.round(trend.metric.value)}%</span><small class="trend-main-sample">${trend.metric.hits}/${trend.metric.total}</small>${dashboardWindowBadges(analysis,trend.key)}</strong></div><span class="trend-progress"><i style="width:${Math.max(0,Math.min(100,Math.round(trend.metric.value)))}%"></i></span>`;return `<article class="featured-match-card" data-match="${game.fixture.id}"><div class="featured-meta"><span>${cpEscape(cpLeagueDisplayName(game.league))}</span><em class="${live?'is-live':''}">${cpEscape(time)}</em></div><div class="featured-teams"><div>${dashboardTeamLogo(game.teams.home)}<strong>${cpEscape(game.teams.home.name)}</strong></div><span>×</span><div>${dashboardTeamLogo(game.teams.away)}<strong>${cpEscape(game.teams.away.name)}</strong></div></div>${trendMarkup}<a href="match.html?id=${game.fixture.id}">Ver partida <span>→</span></a></article>`}

let dashboardHydrationDate=null;
const dashboardHydrationFailures=new Map;
let dashboardQuotaCooldownUntil=0;
function dashboardHydrationAllowed(id){const failure=dashboardHydrationFailures.get(Number(id));if(!failure)return true;if(Date.now()-failure.windowStarted>=21600000){dashboardHydrationFailures.delete(Number(id));return true}return failure.attempts<3&&failure.retryAt<=Date.now()}
function dashboardRecordHydrationFailure(id,data={}){const key=Number(id),stored=dashboardHydrationFailures.get(key),previous=stored&&Date.now()-stored.windowStarted<21600000?stored:{attempts:0,windowStarted:Date.now()},attempts=previous.attempts+1,delays=[300000,900000,3600000];dashboardHydrationFailures.set(key,{attempts,windowStarted:previous.windowStarted,retryAt:Date.now()+(delays[Math.min(attempts-1,delays.length-1)]||3600000)});if(data.code==='API_DAILY_QUOTA')dashboardQuotaCooldownUntil=Date.now()+21600000}
async function hydrateDashboardAnalyses(date,games,snapshot){
  if(dashboardHydrationDate===date||dashboardQuotaCooldownUntil>Date.now()||typeof fixtureGoalMetrics!=="function")return;
  const existing=new Map((snapshot.games||[]).map(game=>[Number(game.fixture?.id),game]));
  const queue=games.filter(game=>!existing.has(Number(game.fixture.id))&&dashboardHydrationAllowed(game.fixture.id));
  if(!queue.length)return;
  dashboardHydrationDate=date;

  const publishProgress=()=>{
    const next={version:DASHBOARD_SNAPSHOT_VERSION,date,generatedAt:new Date().toISOString(),games:[...existing.values()]};
    try{localStorage.setItem('centralPro.opportunities.v1',JSON.stringify(next))}catch{}
    renderDashboardOpportunities(next);
    dashboardHighlightTrends=dashboardTrendIndex(next);
    dashboardHighlightAnalyses=new Map(next.games.map(game=>[Number(game.fixture?.id),game]));
    $('analysisGames').textContent=next.games.length;
    renderDashboardHighlights();
  };

  const workers=Array.from({length:2},async()=>{
    while(queue.length){
      const game=queue.shift();
      try{
        const params=new URLSearchParams({sample:'15',scope:'all',mode:'scanner',home:String(game.teams.home.id),away:String(game.teams.away.id),league:String(game.league.id),season:String(game.league.season)});
        const response=await fetch(`/api/partidas/${game.fixture.id}/analise?${params}`),data=await response.json();
        if(!response.ok){
          console.warn('[DASHBOARD-ANALYSIS]',game.fixture.id,data?.erro||response.status);
          dashboardRecordHydrationFailure(game.fixture.id,data);
          continue;
        }
        const result=fixtureGoalMetrics(data);
        if(result){
          existing.set(Number(game.fixture.id),{fixture:{id:game.fixture.id,date:game.fixture.date,status:game.fixture.status},league:game.league,teams:game.teams,metrics:result,sampleMetrics:dashboardParallelGoalMetrics(data),venueMetrics:dashboardVenueGoalMetrics(data),sampleContext:data.sampleContext||null,cornerMetrics:null,analysisStatus:result.coverage>0?'ready':'insufficient'});
          dashboardHydrationFailures.delete(Number(game.fixture.id));
          // Uma resposta concluída também precisa sair do estado "preparando"
          // quando não houver amostra ou tendência suficiente.
          publishProgress();
        }
      }catch(error){
        console.warn('[DASHBOARD-ANALYSIS]',game.fixture.id,error?.message||error);
        dashboardRecordHydrationFailure(game.fixture.id);
      }
    }
  });
  await Promise.all(workers);
  publishProgress();
  dashboardHydrationDate=null;
}

let dashboardHighlights=[],dashboardHighlightTrends=new Map,dashboardHighlightAnalyses=new Map,dashboardHighlightPage=0;
function renderDashboardHighlights(){const eligibleGames=dashboardHighlights.filter(game=>dashboardHighlightTrends.has(Number(game.fixture.id))).slice(0,3);dashboardHighlightPage=0;$('importantGames').innerHTML=eligibleGames.map(game=>dashboardHighlightCard(game,dashboardHighlightTrends.get(Number(game.fixture.id)),dashboardHighlightAnalyses.get(Number(game.fixture.id)))).join('')||'<div class="empty-row">Nenhum destaque estatístico disponível hoje.</div>';$('highlightsDots').innerHTML=eligibleGames.length?'<button type="button" class="active" data-highlight-page="0" aria-label="Ir para a página 1" aria-current="page"></button>':'';$('highlightsPrev').disabled=true;$('highlightsNext').disabled=true;document.querySelectorAll('[data-highlight-page]').forEach(dot=>dot.addEventListener('click',()=>{dashboardHighlightPage=Number(dot.dataset.highlightPage);renderDashboardHighlights()}));cpBindMatches()}
function changeDashboardHighlightPage(direction){const pageCount=Math.max(1,Math.ceil(dashboardHighlights.length/3)),next=dashboardHighlightPage+direction;if(next<0||next>=pageCount)return;dashboardHighlightPage=next;renderDashboardHighlights()}
let dashboardRefreshTimer=null,dashboardLoading=false,dashboardHasGames=false;
function scheduleDashboardRefresh(delay){clearTimeout(dashboardRefreshTimer);dashboardRefreshTimer=setTimeout(loadDashboard,delay)}
async function loadDashboard(){if(dashboardLoading)return;dashboardLoading=true;const refreshDelay=300000;try{const date=new Date().toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}),snapshot=dashboardSnapshot(date),analysisIds=dashboardAnalysisIds(snapshot),trendIndex=dashboardTrendIndex(snapshot),response=await fetch(`/api/jogos?date=${date}`),data=await response.json();renderDashboardOpportunities(snapshot);if(!response.ok){if(data.code==='API_DAILY_QUOTA')dashboardQuotaCooldownUntil=Date.now()+21600000;throw Error(data.erro||'Jogos indisponíveis.')}const games=(data.response||[]).sort((a,b)=>new Date(a.fixture.date)-new Date(b.fixture.date)),allLive=games.filter(cpIsLive),live=dashboardLiveGames(games),important=dashboardImportantGames(games,analysisIds);dashboardHasGames=games.length>0;$('totalGames').textContent=games.length;$('totalLeagues').textContent=`${new Set(games.map(game=>game.league.id)).size} competições`;$('liveGames').textContent=allLive.length;$('liveLabel').textContent=data.stale?'Último estado conhecido':allLive.length?'Atualização automática':'Nenhum neste momento';$('analysisGames').textContent=games.filter(game=>analysisIds.has(game.fixture.id)).length;const updated=data.snapshotGeneratedAt?new Date(data.snapshotGeneratedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});$('updatedAt').textContent=data.stale?`dados salvos • ${updated}`:updated;$('liveBadge').textContent=live.length;dashboardHighlights=important;dashboardHighlightTrends=trendIndex;dashboardHighlightAnalyses=new Map(snapshot.games.map(game=>[Number(game.fixture?.id),game]));renderDashboardHighlights();if(!data.stale)hydrateDashboardAnalyses(date,important,snapshot);const liveRows=live.slice(0,4).map(cpMatchRow).join('');$('liveList').innerHTML=liveRows||'<div class="empty-row">Nenhuma partida relevante ao vivo agora.</div>';cpBindMatches()}catch(error){if(!dashboardHasGames){$('importantGames').innerHTML=`<div class="empty-row">${cpEscape(error.message)}</div>`;$('liveList').innerHTML='<div class="empty-row">Não foi possível carregar.</div>'}}finally{dashboardLoading=false;scheduleDashboardRefresh(refreshDelay)}}
$('highlightsPrev').addEventListener('click',()=>changeDashboardHighlightPage(-1));$('highlightsNext').addEventListener('click',()=>changeDashboardHighlightPage(1));loadDashboard();
