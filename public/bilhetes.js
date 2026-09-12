document.addEventListener('DOMContentLoaded',()=>{
  const g=document.querySelector('#ticketGrid'),f=document.querySelector('#ticketFilters'),m=document.querySelector('#analysisModal');
  let ts=[];
  const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ml=v=>({'Goals Over/Under':'Total de gols','Both Teams Score':'Ambas marcam','Match Winner':'Resultado da partida','Double Chance':'Dupla chance','Team Goals':'Gols da equipe','Corners':'Escanteios','Total Corners':'Total de escanteios','Team Corners':'Escanteios da equipe','Cards':'Cartões','Total Cards':'Total de cartões','Team Cards':'Cartões da equipe','Shots':'Finalizações','Shots on Goal':'Finalizações no gol','Goalkeeper Saves':'Defesas do goleiro','First Half Goals':'Gols no 1º tempo'}[v]||v||'');
  const sl=v=>String(v??'').replace(/^Over\s+([0-9.]+)/i,'Mais de $1').replace(/^Under\s+([0-9.]+)/i,'Menos de $1').replace(/^Yes$/i,'Sim').replace(/^No$/i,'Não');
  const tl=v=>({'CHAMPIONS_MULTIPLA':'Champions — Múltipla','BILHETE_DO_DIA':'Bilhete do Dia','SUL_AMERICANA':'Sul-Americana','BINGO_CHAMPIONS':'Bingo Champions','BINGO_LIBERTADORES':'Bingo Libertadores','CONTINENTAL_DO_DIA':'Continental do Dia','CONSERVADOR':'Conservador','OUSADO':'Ousado','BINGO':'Bingo','CHAMPIONS':'Champions'}[v]||String(v??'').replaceAll('_',' '));
  const profileLabel=v=>({CONSERVADOR:'Conservador',MODERADO:'Moderado',AGRESSIVO:'Agressivo'}[String(v||'').toUpperCase()]||'');
  const formatPublished=v=>{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(d)};
  const formatFixture=v=>{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(d)};
  const n=t=>({...t,totalOdd:t.totalOdd??t.total_odd,combinationType:t.combinationType??t.analysis?.combinationType,combinedOddType:t.combinedOddType??t.analysis?.combinedOddType,selections:(t.selections||[]).map(s=>({...s,displayMatch:s.displayMatch||`${s.homeTeam?.name||''} x ${s.awayTeam?.name||''}`.trim(),displaySelection:s.displaySelection||s.selectionDisplay,bookmakerName:s.bookmakerName||s.name}))});

  const renderAnalysis=t=>{
    const reason=String(t.analysis?.reason||'').trim();
    const profile=profileLabel(t.analysis?.profile);
    if(t.source==='manual'&&reason){
      const blocks=(t.selections||[]).map(s=>`<div class="analysis-block"><strong>${e(s.displayMatch)}</strong><span>${e(ml(s.market||s.marketName))} · ${e(sl(s.displaySelection))}</span><small>${s.fixtureDate?`🕒 ${e(formatFixture(s.fixtureDate))}`:''}${s.bookmakerName?`${s.fixtureDate?' · ':''}${e(s.bookmakerName)}`:''}${s.odd!=null?` · Odd ${Number(s.odd).toFixed(2)}`:''}</small></div>`).join('');
      document.querySelector('.analysis-placeholder').innerHTML=`<div class="analysis-block manual-reason">${profile?`<span class="ticket-profile profile-${e(String(t.analysis.profile).toLowerCase())}">${e(profile)}</span>`:''}<strong>Por que escolhi este bilhete?</strong><p>${e(reason)}</p></div>${blocks}<div class="analysis-note">Odds registradas no momento da publicação e sujeitas a alteração.</div>`;
      return;
    }
    const ev=t.analysis?.evidence||[];
    const blocks=(t.selections||[]).map(s=>{const row=ev.find(x=>Number(x.fixtureId)===Number(s.fixtureId));const q=row?.evidence?.[s.marketKey]?.evidence||row?.evidence?.[s.marketKey];if(!q)return `<div class="analysis-block"><strong>${e(s.displayMatch)}</strong><span>${e(sl(s.displaySelection))}</span><small>Detalhamento estatístico indisponível para esta seleção.</small></div>`;return `<div class="analysis-block"><strong>${e(s.displayMatch)}</strong><span>${e(sl(s.displaySelection))}</span><b>${Number(q.value)}%</b><small>${Number(q.hits)} de ${Number(q.total)} jogos analisados</small></div>`}).join('');
    document.querySelector('.analysis-placeholder').innerHTML=blocks||'<div class="analysis-block"><small>Detalhamento estatístico indisponível para este bilhete.</small></div>';
  };

  const pickMeta=s=>{
    const parts=[];
    if(s.fixtureDate)parts.push(`🕒 ${formatFixture(s.fixtureDate)}`);
    if(s.bookmakerName)parts.push(e(s.bookmakerName));
    return parts.length?`<em>${parts.join(' · ')}</em>`:'';
  };
  const statusLabel=v=>v==='OPEN'?'ABERTO':v==='VOID'?'ANULADO':e(v);
  const card=t=>{
    const profile=profileLabel(t.analysis?.profile);
    const published=formatPublished(t.published_at);
    return `<article class="ticket-card" data-ticket-id="${e(t.id)}" data-ticket-source="${e(t.source)}"><div class="ticket-head"><div class="ticket-type">${e(t.source==='manual'?(t.title||'Bilhete Central Pro'):tl(t.type))}<small>${e(t.description)}</small>${published?`<small class="published-time">Publicado às ${e(published)}</small>`:''}</div><div class="ticket-head-tags">${profile?`<span class="ticket-profile profile-${e(String(t.analysis.profile).toLowerCase())}">${e(profile)}</span>`:''}<span class="ticket-status status-${e(String(t.status||'').toLowerCase())}">${statusLabel(t.status)}</span></div></div><div class="ticket-picks">${t.selections.map(s=>`<div class="pick"><span>${e(s.displayMatch)}<br><small>${e(ml(s.market||s.marketName))} · ${e(sl(s.displaySelection))}</small>${pickMeta(s)}</span><strong>${s.odd==null?'—':Number(s.odd).toFixed(2)}</strong></div>`).join('')}</div><div class="ticket-foot"><span><small>ODD TOTAL · ${t.selections.length} ${t.selections.length===1?'seleção':'seleções'}${t.combinationType==='SAME_FIXTURE'?' · Mesmo jogo':''}${t.combinedOddType==='CALCULATED'?' · Odd combinada calculada':''}</small><strong>${Number(t.totalOdd).toFixed(2)}</strong></span><small>${e(t.date)}</small></div><div class="ticket-actions"><button data-analysis="${e(t.id)}">Ver análise</button>${t.analysis?.ticketUrl?`<a class="ticket-link" href="${e(t.analysis.ticketUrl)}" target="_blank" rel="noopener noreferrer">🎟 Pegar bilhete</a>`:''}</div></article>`;
  };

  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const todays=()=>ts.filter(t=>t.date===today());
  const render=x=>{const day=todays();g.innerHTML=day.filter(t=>x==='Todos'||(x==='Aberto'&&t.status==='OPEN')||t.status===x).map(card).join('')||'<div class="empty-state">Nenhum bilhete encontrado para hoje.</div>'};
  const hist=()=>{document.querySelector('#historyTable').innerHTML=ts.filter(t=>t.date!==today()).map(t=>`<div class="history-row"><span>${e(t.date)}</span><strong>${e(t.source==='manual'?(t.title||'Bilhete Central Pro'):tl(t.type))}</strong><span>${e(t.competition)}</span><span>${t.selections.length} seleções</span><span>${Number(t.totalOdd).toFixed(2)}</span><span>${statusLabel(t.status)}</span><a href="#ticketGrid">Ver</a></div>`).join('')};

  const upd=()=>{
    const day=todays();
    const count=(arr,s)=>arr.filter(t=>t.status===s).length;
    const dayValues=[day.length,count(day,'OPEN'),count(day,'GREEN'),count(day,'RED')];
    document.querySelectorAll('.ticket-summary article strong').forEach((x,i)=>x.textContent=dayValues[i]);
    document.querySelectorAll('.ticket-filters b').forEach((x,i)=>x.textContent=dayValues[i]);
    const allValues=[ts.length,count(ts,'OPEN'),count(ts,'GREEN'),count(ts,'RED')];
    document.querySelectorAll('.mini-stats b').forEach((x,i)=>x.textContent=allValues[i]);

    const finished=ts.filter(t=>['GREEN','RED','VOID'].includes(t.status));
    const decided=finished.filter(t=>t.status!=='VOID');
    const profit=finished.reduce((sum,t)=>t.status==='GREEN'?sum+(Number(t.totalOdd||0)-1):t.status==='RED'?sum-1:sum,0);
    const roi=decided.length?profit/decided.length*100:null;
    const avgOdd=decided.length?decided.reduce((sum,t)=>sum+Number(t.totalOdd||0),0)/decided.length:null;
    const roiStrong=document.querySelector('.roi strong');
    if(roiStrong)roiStrong.textContent=decided.length?`${profit>=0?'+':''}${profit.toFixed(2)}u`:'—';
    const roiSmall=document.querySelector('.roi small');
    if(roiSmall)roiSmall.textContent=decided.length?`Resultado com stake fixa de 1u por bilhete · ${decided.length} finalizado${decided.length===1?'':'s'}`:'Resultado em unidades · 1u por bilhete';
    const details=document.querySelector('#performanceDetails');
    if(details)details.textContent=decided.length?`Odd média ${avgOdd.toFixed(2)} · ROI ${roi>=0?'+':''}${roi.toFixed(1)}%${count(ts,'VOID')?` · ${count(ts,'VOID')} anulado${count(ts,'VOID')===1?'':'s'}`:''}`:'Odd média — · ROI —';
    const round=document.querySelector('.round-note strong');if(round){const [y,mo,d]=today().split('-');round.textContent=`${d}/${mo}/${y}`}
  };

  f.addEventListener('click',x=>{const b=x.target.closest('button[data-filter]');if(b){f.querySelectorAll('button[data-filter]').forEach(y=>y.classList.remove('active'));b.classList.add('active');render(b.dataset.filter)}});
  g.addEventListener('click',async x=>{const b=x.target.closest('[data-analysis]');if(b){const t=n((await fetch('/api/bilhetes/'+encodeURIComponent(b.dataset.analysis)).then(r=>r.json())).ticket||{});document.querySelector('#modalTitle').textContent=t.source==='manual'?(t.title||'Bilhete Central Pro'):tl(t.title);renderAnalysis(t);m.hidden=false}});
  const close=()=>m.hidden=true;
  document.querySelector('#closeAnalysis').addEventListener('click',close);
  m.addEventListener('click',x=>{if(x.target===m)close()});
  document.addEventListener('keydown',x=>{if(x.key==='Escape'&&!m.hidden)close()});
  fetch('/api/bilhetes').then(r=>r.json()).then(p=>{ts=(p.tickets||[]).map(n);upd();render('Todos');hist();const z=document.querySelector('.history-section .section-heading>span');if(z&&ts.every(t=>t.source==='real'))z.textContent='REAL'}).catch(()=>g.innerHTML='<div class="empty-state">Não foi possível carregar os bilhetes persistidos.</div>');
});
