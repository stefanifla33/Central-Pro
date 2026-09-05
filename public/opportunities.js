(function(){
  'use strict';
  const STORAGE_KEY='centralPro.opportunities.v1';
  const SNAPSHOT_VERSION=3;
  const {MARKETS,rankingMarkets,confidenceLevel,opportunities,recommendationScore,compareRecommendations,entryFields}=window.CPOpportunityEngine;
  const displayRankingMarkets=()=>rankingMarkets().filter(([key])=>key!=='over05');
  let level='all';
  const $=id=>document.getElementById(id);
  const escape=value=>{const node=document.createElement('i');node.textContent=value??'—';return node.innerHTML};
  function sampleWindows(item){
    const l5=item.game?.sampleMetrics?.l5?.[item.key],l10=item.game?.sampleMetrics?.l10?.[item.key],parts=[];
    if(l5?.total)parts.push(`L5 ${l5.hits}/${l5.total} (${Math.round(l5.value)}%)`);
    if(l10?.total)parts.push(`L10 ${l10.hits}/${l10.total} (${Math.round(l10.value)}%)`);
    return parts.join(' · ');
  }

  function loadSnapshot(){try{const data=JSON.parse(localStorage.getItem(STORAGE_KEY)),generated=Date.parse(data?.generatedAt),fresh=Number.isFinite(generated)&&Date.now()-generated<172800000;return data?.version===SNAPSHOT_VERSION&&fresh&&/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')&&Array.isArray(data.games)?data:{games:[]}}catch{return{games:[]}}}
  function confidenceLabel(item){return item.level==='strong'?'Alta':item.level==='moderate'?'Moderada':'Atenção'}
  function secondarySignals(item){
    const metrics=item.game.metrics||{};
    return displayRankingMarkets()
      .filter(([key])=>key!==item.key)
      .map(([key,market])=>({key,label:market.label,metric:metrics[key]}))
      .filter(signal=>{const evidence=signal.metric?.evidence||signal.metric;return signal.metric&&evidence.total>=(MARKETS[signal.key]?.minimum||8)&&signal.metric.value>=60})
      .sort((a,b)=>b.metric.value-a.metric.value||b.metric.total-a.metric.total)
      .slice(0,3);
  }
  function reasonText(item){
    const m=item.metric,n=m.total,hit=m.hits;
    if(item.key==='homeScores')return `${item.game.teams.home.name} marcou em ${hit} de ${n} jogos recentes válidos.`;
    if(item.key==='awayScores')return `${item.game.teams.away.name} marcou em ${hit} de ${n} jogos recentes válidos.`;
    if(item.family==='corners')return `A frequência histórica de escanteios ocorreu em ${hit} de ${n} jogos recentes válidos; não representa previsão.`;
    return `O padrão apareceu em ${hit} de ${n} registros recentes combinados das equipes.`;
  }
  function hour(game){return Number(new Date(game.fixture.date).toLocaleTimeString('pt-BR',{hour:'2-digit',hour12:false,timeZone:'America/Sao_Paulo'}).slice(0,2))}
  function timeLabel(game){return new Date(game.fixture.date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'})}
  const COUNTRY_DISPLAY_NAMES=Object.freeze({Brazil:'Brasil',Germany:'Alemanha',Italy:'Itália',France:'França',England:'Inglaterra',Spain:'Espanha',Portugal:'Portugal',Netherlands:'Países Baixos',Switzerland:'Suíça'});
  function countryDisplayName(country){return COUNTRY_DISPLAY_NAMES[country]||country||''}
  function normalized(value){return String(value||'').trim().toLocaleLowerCase('pt-BR')}
  function pendingDuplicate(fields){return window.BankrollStore.load().entries.some(entry=>entry.result==='pending'&&normalized(entry.match)===normalized(fields.match)&&normalized(entry.market)===normalized(fields.market)&&normalized(entry.selection)===normalized(fields.selection))}
  function showToast(message){$('toastMessage').textContent=message;$('opportunityToast').hidden=false;clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>$('opportunityToast').hidden=true,6000)}
  function openEntry(item){const fields=entryFields(item);if(pendingDuplicate(fields)){showToast('Esta oportunidade já está na sua banca.');return}$('opportunityEntryForm').reset();$('entryFixtureId').value=item.game.fixture.id;Object.entries(fields).forEach(([key,value])=>$(`entry${key[0].toUpperCase()}${key.slice(1)}`).value=value);$('entryOdd').value=window.CPPrematchOdds?.selectedQuote(item.game.fixture.id,item.key)?.odd||'';$('opportunityEntryDialog').showModal();setTimeout(()=>$('entryOdd').focus(),50)}
  function filtered(items){const market=$('marketFilter').value,league=$('leagueFilter').value,time=$('timeFilter').value;return items.filter(item=>(level==='all'||item.level===level)&&(market==='all'||item.key===market)&&(league==='all'||String(item.game.league.id)===league)&&(time==='all'||time==='morning'&&hour(item.game)<12||time==='afternoon'&&hour(item.game)>=12&&hour(item.game)<18||time==='night'&&hour(item.game)>=18)).sort((a,b)=>(b.level==='strong')-(a.level==='strong')||b.metric.value-a.metric.value||b.sampleQuality-a.sampleQuality||b.metric.total-a.metric.total||new Date(a.game.fixture.date)-new Date(b.game.fixture.date));}
  function fillFilters(snapshot){
    $('marketFilter').innerHTML='<option value="all">Todos os mercados</option>'+displayRankingMarkets().map(([key,item])=>`<option value="${key}">${item.label}</option>`).join('');
    const leagues=[...new Map(snapshot.games.map(game=>[game.league.id,game.league])).values()].sort((a,b)=>a.name.localeCompare(b.name));
    $('leagueFilter').innerHTML='<option value="all">Todos os campeonatos</option>'+leagues.map(item=>`<option value="${item.id}">${escape(cpLeagueDisplayName(item))}</option>`).join('');
  }
  function topItems(items,limit=3){
    const sorted=[...items].sort(compareRecommendations),chosen=[],families={};for(const item of sorted){if((families[item.family]||0)>=2)continue;chosen.push(item);families[item.family]=(families[item.family]||0)+1;if(chosen.length===limit)return chosen}for(const item of sorted){if(!chosen.includes(item))chosen.push(item);if(chosen.length===limit)break}return chosen;
  }
  function render(){
    const snapshot=loadSnapshot(),all=opportunities(snapshot).filter(item=>item.key!=='over05'),items=filtered(all),groups=new Map;
    items.forEach(item=>{const id=item.game.fixture.id;if(!groups.has(id))groups.set(id,{game:item.game,items:[]});groups.get(id).items.push(item)});
    const cards=[...groups.values()].map(group=>({...group,recommendations:topItems(group.items,3)}));
    const allGames=new Set(all.map(item=>item.game.fixture.id));
    const strongGames=new Set(all.filter(item=>item.level==='strong').map(item=>item.game.fixture.id));
    $('opportunityCount').textContent=allGames.size;$('strongCount').textContent=strongGames.size;$('analyzedCount').textContent=snapshot.games.length;
    $('snapshotMeta').textContent=snapshot.generatedAt?`Atualizado ${new Date(snapshot.generatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'Aguardando análises';
    $('opportunityList').innerHTML=cards.map(({game,recommendations})=>{const rows=recommendations.map((item,index)=>{const signals=secondarySignals(item).filter(signal=>!recommendations.some(rec=>rec.key===signal.key)).slice(0,2);return `<div class="recommendation-row ${index===0?'primary':''}"><div class="best-copy"><span class="best-kicker">${index===0?'Melhor opção':`Opção ${index+1}`}</span><div class="best-title"><strong>${item.market.label}</strong><span>${item.market.detail}</span></div><p class="opportunity-reason"><b>Por que entrou:</b> ${escape(reasonText(item))}</p>${signals.length?`<div class="secondary-signals"><span>Complementa com</span>${signals.map(signal=>`<i>${escape(signal.label)} <b>${Math.round(signal.metric.value)}%</b> <small>${signal.metric.hits}/${signal.metric.total}</small></i>`).join('')}</div>`:''}${window.CPPrematchOdds?.placeholder(item)||''}</div><div class="best-score"><span class="opportunity-percent ${item.level}"><small>Frequência</small><b>${Math.round(item.metric.value)}%</b></span><span class="frequency"><small class="score-label">Amostra</small><strong>${item.metric.hits}/${item.metric.total}</strong><small>${item.sampleLabel}${sampleWindows(item)?`<br>${sampleWindows(item)}`:''}</small></span><span class="confidence ${item.level}"><small>Confiança</small>${confidenceLabel(item)}</span><button class="add-bankroll" data-fixture="${game.fixture.id}" data-market="${item.key}" type="button">+ Adicionar à banca</button></div></div>`}).join('');return `<article class="fixture-opportunities compact"><header class="fixture-head"><span class="fixture-time">${timeLabel(game)}</span><div class="fixture-main"><small>${escape(cpLeagueDisplayName(game.league))} · ${escape(countryDisplayName(game.league.country))}</small><div class="fixture-teams"><img src="${escape(game.teams.home.logo)}" alt=""><span>${escape(game.teams.home.name)}</span><i>×</i><span>${escape(game.teams.away.name)}</span><img src="${escape(game.teams.away.logo)}" alt=""></div></div><a class="view-analysis" href="match.html?id=${game.fixture.id}">Ver análise</a></header><div class="recommendations-list">${rows}</div></article>`}).join('')||`<div class="opportunity-empty"><div><strong>${snapshot.games.length?'Nenhuma oportunidade encontrada com estes filtros.':'Nenhuma análise disponível neste momento.'}</strong><span>${snapshot.games.length?'Ajuste os filtros para visualizar outras oportunidades classificadas.':'Abra a Análise Rápida para preparar as partidas principais e relevantes.'}</span><a class="analysis-link" href="analysis.html">Abrir Análise Rápida</a></div></div>`;
    window.CPPrematchOdds?.mount($('opportunityList'));
  }
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('globalSearch').focus()}});
  $('globalSearch').addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.value.trim().length>=3)location.href=`teams.html?q=${encodeURIComponent(event.target.value.trim())}`});
  $('levelFilters').onclick=event=>{const button=event.target.closest('[data-level]');if(!button)return;level=button.dataset.level;$('levelFilters').querySelectorAll('button').forEach(item=>item.classList.toggle('active',item===button));render()};
  ['marketFilter','leagueFilter','timeFilter'].forEach(id=>$(id).onchange=render);
  $('opportunityList').addEventListener('click',event=>{const button=event.target.closest('.add-bankroll');if(!button)return;const item=opportunities(loadSnapshot()).find(candidate=>String(candidate.game.fixture.id)===button.dataset.fixture&&candidate.key===button.dataset.market);if(item)openEntry(item)});
  $('closeEntryDialog').onclick=$('cancelEntryDialog').onclick=()=>$('opportunityEntryDialog').close();
  $('closeToast').onclick=()=>$('opportunityToast').hidden=true;
  $('opportunityEntryForm').addEventListener('submit',event=>{event.preventDefault();const fields={date:$('entryDate').value,competition:$('entryCompetition').value,match:$('entryMatch').value,market:$('entryMarket').value,selection:$('entrySelection').value};if(pendingDuplicate(fields)){$('opportunityEntryDialog').close();showToast('Esta oportunidade já está na sua banca.');return}window.BankrollStore.upsertEntry({...fields,odd:$('entryOdd').value,stake:$('entryStake').value,result:'pending'});$('opportunityEntryDialog').close();showToast('Entrada adicionada à Minha Banca')});
  const snapshot=loadSnapshot();fillFilters(snapshot);render();
}());
