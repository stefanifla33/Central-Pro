const $=id=>document.getElementById(id);
let fixtures=[],agendaTotal=0,metrics=new Map(),analysisState=new Map(),sortKey=null,sortDirection=-1,loadToken=0;
let renderTimer=null;
let snapshotDetails=new Map(),snapshotTimer=null,snapshotDirty=false;
const SNAPSHOT_MARKET_KEYS=['over05HT','over05','over15','over25','btts','homeScores','awayScores'];
const priorityRank=id=>{const rank=CP_PRIORITY_ORDER.indexOf(id);return rank<0?999:rank};
const localDate=offset=>{const date=new Date();date.setDate(date.getDate()+offset);return date.toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})};

function scheduleRender(){
  if(renderTimer!==null)return;
  renderTimer=setTimeout(()=>{renderTimer=null;render()},200);
}
function flushRender(){
  if(renderTimer!==null){clearTimeout(renderTimer);renderTimer=null}
  render();
}

function snapshotParallelGoalMetrics(data){
  const windows=data?.parallelSamples||{};
  const build=(sample,useEvidence=false)=>{
    if(!sample?.homeRecent||!sample?.awayRecent)return null;
    const calculated=fixtureGoalMetrics({...data,homeRecent:sample.homeRecent,awayRecent:sample.awayRecent});
    if(!calculated)return null;
    return Object.fromEntries(SNAPSHOT_MARKET_KEYS.map(key=>{
      const raw=calculated[key],metric=useEvidence?(raw?.evidence||raw):raw;
      return [key,metric?{value:metric.value,hits:metric.hits,total:metric.total}:null];
    }));
  };
  return {l5:build(windows.l5,false),l10:build(windows.l10,true)};
}
function snapshotVenueGoalMetrics(data){
  const windows=data?.venueSamples||{};
  const buildSide=(games,side,useEvidence=false)=>{
    if(!Array.isArray(games)||!games.length)return null;
    const calculated=fixtureGoalMetrics({...data,homeRecent:side==='home'?games:[],awayRecent:side==='away'?games:[]});
    if(!calculated)return null;
    return Object.fromEntries(SNAPSHOT_MARKET_KEYS.map(key=>{
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

function metricCell(metric){
  if(!metric)return '<span class="percent-pill none">—</span>';
  const value=Math.round(metric.value),tone=value>=80?'high':value>=65?'good':value>=50?'mid':'low',sample=goalSampleQuality(metric.total);
  const sampleText=`${sample.label} — ${metric.total} ${metric.total===1?'jogo válido':'jogos válidos'}`;
  return `<span class="percent-pill ${tone} sample-${sample.key}"><b>${value}%</b><small class="metric-fraction">${metric.hits}/${metric.total}<i class="sample-indicator ${sample.key}" tabindex="0" role="img" title="${sampleText}" aria-label="${sampleText}" data-tooltip="${sampleText}"></i></small></span>`;
}
function filtered(){
  const competition=$('competition').value,dayCompetition=$('dayCompetition').value,country=$('country').value,query=$('teamSearch').value.trim().toLowerCase(),onlyData=$('withData').checked,onlyLive=$('liveOnly').checked;
  const selectedLeague=game=>cpLeagueMatchesMode(game.league,competition);
  const rows=fixtures.filter(game=>selectedLeague(game)&&(dayCompetition==='all'||game.league.name?.trim()===dayCompetition)&&(country==='all'||game.league.country===country)&&(!query||`${game.teams.home.name} ${game.teams.away.name}`.toLowerCase().includes(query))&&(!onlyLive||cpIsLive(game))&&(!onlyData||metrics.get(game.fixture.id)?.coverage));
  if(sortKey)rows.sort((a,b)=>{const av=metrics.get(a.fixture.id)?.[sortKey]?.value,bv=metrics.get(b.fixture.id)?.[sortKey]?.value;if(av==null&&bv==null)return 0;if(av==null)return 1;if(bv==null)return-1;return(av-bv)*sortDirection});
  else rows.sort((a,b)=>priorityRank(a.league.id)-priorityRank(b.league.id)||a.league.name.localeCompare(b.league.name)||String(a.league.id).localeCompare(String(b.league.id))||(Boolean(metrics.get(b.fixture.id)?.coverage)-Boolean(metrics.get(a.fixture.id)?.coverage))||new Date(a.fixture.date)-new Date(b.fixture.date));
  return rows;
}
function render(){
  const rows=filtered(),groups=new Map;
  rows.forEach(game=>{const key=sortKey?'sorted':game.league.id;if(!groups.has(key))groups.set(key,{league:sortKey?null:game.league,games:[]});groups.get(key).games.push(game)});
  $('totalCount').textContent=agendaTotal;
  $('priorityCount').textContent=fixtures.length;
  const analyzed=[...metrics.values()].filter(value=>value.coverage).length;
  $('dataCount').textContent=analyzed;
  const priorityTotal=fixtures.length;
  const loading=[...analysisState.values()].filter(value=>value==='loading'||value==='queued').length;
  if($('analysisStatusMeta')) $('analysisStatusMeta').textContent=loading?`${analyzed}/${priorityTotal} concluídos · ${loading} na fila`:`${analyzed}/${priorityTotal} com dados`;
  if($('coverageBar')) $('coverageBar').style.width=priorityTotal?`${Math.min(100,Math.round(analyzed*100/priorityTotal))}%`:'0%';
  $('scannerBody').innerHTML=[...groups.values()].map(group=>`${group.league?`<tr class="league-row"><td colspan="9"><div class="league-separator">${group.league.logo?`<img src="${cpEscape(group.league.logo)}" alt="">`:'<span class="league-trophy">♜</span>'}<span><strong>${cpEscape(group.league.name)}</strong><small>${cpEscape(group.league.country)} · ${group.games.length} jogo(s)</small></span></div></td></tr>`:''}${group.games.map(game=>{const data=metrics.get(game.fixture.id),live=cpIsLive(game),match=`<td><div class="scanner-match"><span class="scanner-team home"><img src="${cpEscape(game.teams.home.logo)}" alt=""><b>${cpEscape(game.teams.home.name)}</b></span><i>×</i><span class="scanner-team away"><img src="${cpEscape(game.teams.away.logo)}" alt=""><b>${cpEscape(game.teams.away.name)}</b></span></div></td>`;return `<tr data-match="${game.fixture.id}"><td class="scanner-time ${live?'live':''}">${live?`AO VIVO · ${game.fixture.status.elapsed||0}'`:cpTime(game)}</td>${match}${data?.coverage?['over05HT','over05','over15','over25','btts','homeScores','awayScores'].map(key=>`<td class="percent-cell">${metricCell(data[key])}</td>`).join(''):`<td class="no-analysis-cell status-${analysisState.get(game.fixture.id)||'idle'}" colspan="7"><span>${analysisState.get(game.fixture.id)==='queued'?'Aguardando análise':analysisState.get(game.fixture.id)==='loading'?'Analisando…':analysisState.get(game.fixture.id)==='nodata'?'Dados insuficientes':analysisState.get(game.fixture.id)==='error'?'Falha na análise':'Sem análise'}</span></td>`}</tr>`}).join('')}`).join('')||'<tr><td class="scanner-empty" colspan="9">Nenhuma partida encontrada para estes filtros.</td></tr>';
  document.querySelectorAll('#scannerBody .no-analysis-cell').forEach(cell=>cell.closest('tr')?.classList.add('without-analysis'));
  cpBindMatches();
}
function saveOpportunitySnapshot(){
  snapshotDirty=true;
  if(snapshotTimer!==null)return;
  snapshotTimer=setTimeout(persistOpportunitySnapshot,500);
}
function persistOpportunitySnapshot(){
  if(snapshotTimer!==null){clearTimeout(snapshotTimer);snapshotTimer=null}
  if(!snapshotDirty)return;
  snapshotDirty=false;
  const games=fixtures.filter(game=>CP_FEATURED_LEAGUES.has(game.league.id)&&!cpIsExcludedGame(game)&&metrics.get(game.fixture.id)?.coverage).map(game=>{
    const details=snapshotDetails.get(game.fixture.id)||{};
    return{fixture:{id:game.fixture.id,date:game.fixture.date,status:game.fixture.status},league:game.league,teams:game.teams,metrics:metrics.get(game.fixture.id),sampleMetrics:details.sampleMetrics||null,venueMetrics:details.venueMetrics||null,sampleContext:details.sampleContext||null,cornerMetrics:window.cornerMetricsByFixture?.get(game.fixture.id)||null,analysisStatus:details.analysisStatus||'ready'};
  });
  try{localStorage.setItem('centralPro.opportunities.v1',JSON.stringify({version:3,date:$('analysisDate').value,generatedAt:new Date().toISOString(),games}))}catch{}
}
function flushOpportunitySnapshot(){
  persistOpportunitySnapshot();
}
function fillFilters(){
  const available=fixtures.filter(game=>!cpIsExcludedGame(game)),countries=[...new Set(available.map(game=>game.league.country).filter(Boolean))].sort(),current=$('competition').value;
  $('competition').innerHTML='<option value="featured">Principais + relevantes</option><option value="main">Somente principais</option><option value="all">Todas as competições</option>';
  $('competition').value=['featured','main','all'].includes(current)?current:'all';
  fillDayCompetitions();
  $('country').innerHTML='<option value="all">Todos os países</option>'+countries.map(country=>`<option>${cpEscape(country)}</option>`).join('');
}
function fillDayCompetitions(){
  const select=$('dayCompetition'),current=select.value,mode=$('competition').value;
  const names=[...new Set(fixtures.filter(game=>!cpIsExcludedGame(game)&&cpLeagueMatchesMode(game.league,mode)).map(game=>game.league.name?.trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  select.innerHTML='<option value="all">Todas as competições</option>'+names.map(name=>`<option value="${cpEscape(name)}">${cpEscape(name)}</option>`).join('');
  select.value=names.includes(current)?current:'all';
}
async function loadAnalysisRows(rows,token){
  let completed=0;
  const queue=[...rows];
  rows.forEach(game=>analysisState.set(game.fixture.id,'queued'));
  render();
  const workers=Array.from({length:5},async()=>{
    while(queue.length&&token===loadToken){
      const game=queue.shift();
      analysisState.set(game.fixture.id,'loading');
      scheduleRender();
      try{
        const params=new URLSearchParams({
          sample:'15',scope:'all',mode:'scanner',
          home:String(game.teams.home.id),away:String(game.teams.away.id),
          league:String(game.league.id),season:String(game.league.season)
        });
        let response,data,lastError;
        for(let attempt=1;attempt<=3;attempt++){
          try{
            response=await fetch(`/api/partidas/${game.fixture.id}/analise?${params}`);
            data=await response.json();
            if(response.ok)break;
            lastError=Error(data.erro||'Falha na análise');
            const transient=data.code!=='API_DAILY_QUOTA'&&(response.status===429||response.status>=500)&&data.code!=='API_PERMANENT';
            if(!transient)break;
          }catch(error){lastError=error}
          if(attempt<3)await new Promise(resolve=>setTimeout(resolve,700*attempt));
        }
        if(!response?.ok) throw lastError||Error('Falha na análise');
        const result=fixtureGoalMetrics(data);
        metrics.set(game.fixture.id,result);
        snapshotDetails.set(game.fixture.id,{sampleMetrics:snapshotParallelGoalMetrics(data),venueMetrics:snapshotVenueGoalMetrics(data),sampleContext:data.sampleContext||null,analysisStatus:result?.coverage?'ready':'insufficient'});
        saveOpportunitySnapshot();
        analysisState.set(game.fixture.id,result?.coverage?'done':'nodata');
        window.dispatchEvent(new CustomEvent('centralpro:analysis-ready'));
      }catch(error){
        analysisState.set(game.fixture.id,'error');
      }
      completed++;
      $('progressBar').style.width=`${Math.round(completed*100/rows.length)}%`;
      scheduleRender();
    }
  });
  await Promise.all(workers);
  if(token===loadToken){flushOpportunitySnapshot();flushRender();setTimeout(()=>{$('progressBar').style.width='0'},700)}
}
async function load(){
  const token=++loadToken;if(renderTimer!==null){clearTimeout(renderTimer);renderTimer=null}if(snapshotTimer!==null){clearTimeout(snapshotTimer);snapshotTimer=null}snapshotDirty=false;metrics=new Map();analysisState=new Map();snapshotDetails=new Map();window.CornersScanner?.reset();sortKey=null;document.querySelectorAll('[data-sort]').forEach(head=>head.querySelector('.sort-arrow')?.remove());$('scannerBody').innerHTML='<tr class="scanner-loading"><td colspan="9">Carregando jogos do dia…</td></tr>';
  try{const response=await fetch(`/api/jogos?date=${$('analysisDate').value}`),data=await response.json();if(!response.ok)throw Error(data.erro||'Jogos indisponíveis.');const schedule=data.response||[];agendaTotal=schedule.length;fixtures=cpSelectScannerFixtures(schedule);window.CENTRAL_PRO_OFFLINE=Boolean(data.offline);fillFilters();render();if(data.offline){if($('analysisStatusMeta'))$('analysisStatusMeta').textContent='Modo offline · análises salvas preservadas';return}saveOpportunitySnapshot();const targets=[...fixtures].sort((a,b)=>priorityRank(a.league.id)-priorityRank(b.league.id)||new Date(a.fixture.date)-new Date(b.fixture.date));if(targets.length)loadAnalysisRows(targets,token);else flushOpportunitySnapshot()}catch(error){$('scannerBody').innerHTML=`<tr><td class="scanner-empty" colspan="9">${cpEscape(error.message)}</td></tr>`}
}
function setDate(value,button){$('analysisDate').value=value;[$('todayButton'),$('tomorrowButton')].forEach(item=>item.classList.toggle('active',item===button));load()}
$('todayButton').onclick=()=>setDate(localDate(0),$('todayButton'));
$('tomorrowButton').onclick=()=>setDate(localDate(1),$('tomorrowButton'));
$('analysisDate').onchange=()=>{[$('todayButton'),$('tomorrowButton')].forEach(item=>item.classList.remove('active'));load()};
$('competition').onchange=()=>{fillDayCompetitions();render()};
['dayCompetition','country','withData','liveOnly'].forEach(id=>$(id).onchange=render);$('teamSearch').oninput=render;
document.querySelectorAll('[data-sort]').forEach(head=>head.onclick=()=>{const key=head.dataset.sort;if(sortKey===key)sortDirection*=-1;else{sortKey=key;sortDirection=-1}document.querySelectorAll('[data-sort]').forEach(item=>item.querySelector('.sort-arrow')?.remove());head.insertAdjacentHTML('beforeend',`<span class="sort-arrow">${sortDirection<0?'↓':'↑'}</span>`);render()});
document.querySelectorAll('[data-analysis-tab]').forEach(button=>button.onclick=()=>{const tab=button.dataset.analysisTab;document.querySelectorAll('[data-analysis-tab]').forEach(item=>item.classList.toggle('active',item===button));[['goals','goalsScannerView'],['players','playersScannerView'],['corners','cornersScannerView']].forEach(([key,id])=>{const active=tab===key;$(id).hidden=!active;$(id).classList.toggle('active',active)});if(tab==='corners')window.CornersScanner?.activate()});
window.addEventListener('pagehide',flushOpportunitySnapshot);
$('analysisDate').value=localDate(0);load();
