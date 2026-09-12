(async()=>{
  const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button=$('generateTickets'), results=$('generatorResults'), status=$('generatorStatus'), error=$('generatorError'), format=$('gFormat'), scope=$('gScope'), fixture=$('gFixture');
  const focusField=document.querySelector('.game-focus-field');
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
  $('gDate').value=today();
  format.onchange=()=>document.querySelectorAll('.free-field').forEach(el=>el.hidden=format.value!=='free');
  let token='';
  for(let i=0;i<50&&!window.CentralProAuth;i++)await new Promise(r=>setTimeout(r,100));
  try{
    const {data}=await window.CentralProAuth.getSession(); token=data.session?.access_token||'';
    const r=await fetch('/api/bilhetes/admin/status',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'}); const body=await r.json();
    if(!token||!body.admin){document.body.innerHTML='<main style="padding:40px;color:white">Acesso administrativo necessário.</main>';return;}
  }catch{document.body.innerHTML='<main style="padding:40px;color:white">Não foi possível confirmar o acesso administrativo.</main>';return;}

  let fixturesLoadedFor='';
  const loadFixtures=async({force=false}={})=>{
    const needsFocus=scope.value!=='all';
    focusField.hidden=!needsFocus;
    const date=$('gDate').value;
    if(!date)return;
    if(!force&&fixturesLoadedFor===date&&fixture.options.length>1)return;
    fixture.disabled=true; fixture.innerHTML='<option value="">Carregando jogos...</option>';
    try{
      const r=await fetch(`/api/bilhetes/gerador/jogos?date=${encodeURIComponent(date)}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      const body=await r.json().catch(()=>({})); if(!r.ok)throw new Error(body.erro||'Não foi possível carregar os jogos.');
      const games=Array.isArray(body.games)?body.games:[];
      fixturesLoadedFor=date;
      fixture.innerHTML=games.length
        ? '<option value="">Escolha um confronto</option>'+games.map(g=>`<option value="${esc(g.fixtureId)}">${esc(g.time?g.time+' · ':'')}${esc(g.match)}${g.competition?` · ${esc(g.competition)}`:''}</option>`).join('')
        : '<option value="">Nenhum jogo disponível nessa data</option>';
    }catch(err){
      fixturesLoadedFor='';
      fixture.innerHTML=`<option value="">${esc(err.message)}</option>`;
    }finally{fixture.disabled=false;}
  };
  scope.onchange=()=>{
    focusField.hidden=scope.value==='all';
    if(scope.value!=='all')loadFixtures();
  };
  $('gDate').onchange=()=>loadFixtures({force:true});
  focusField.hidden=scope.value==='all';
  loadFixtures({force:true});

  const payload=()=>{
    const exact=format.value==='free'?null:Number(format.value);
    return {date:$('gDate').value,sourceMode:'games',scopeMode:scope.value,targetFixtureId:scope.value==='all'?null:Number(fixture.value||0),profile:$('gProfile').value,count:Number($('gCount').value),minLegs:exact||Number($('gMinLegs').value),maxLegs:exact||Number($('gMaxLegs').value),minScore:Number($('gMinScore').value),oddMin:Number($('gOddMin').value),oddMax:Number($('gOddMax').value)};
  };
  const localDateTime=value=>{if(!value)return'';const d=new Date(value);if(Number.isNaN(d.getTime()))return'';const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).formatToParts(d);const o=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`;};
  const useTicket=ticket=>{
    const reason=ticket.selections.map((s,i)=>`${i+1}. ${s.reason||''}`).join('\n');
    const draft={title:`Bilhete Central Pro · ${ticket.profile==='CONSERVADOR'?'Conservador':ticket.profile==='AGRESSIVO'?'Agressivo':'Moderado'}`,description:'Bilhete selecionado com apoio do Gerador Interno da Central Pro.',profile:['CONSERVADOR','MODERADO','AGRESSIVO'].includes(ticket.profile)?ticket.profile:'MODERADO',reason,totalOdd:ticket.totalOdd||'',selections:ticket.selections.map(s=>({displayMatch:s.match,fixtureDate:localDateTime(s.fixtureDate),market:s.market,displaySelection:s.selection,odd:s.odd||'',bookmakerName:s.bookmakerName||''}))};
    localStorage.setItem('centralPro.generatorDraft.v1',JSON.stringify(draft)); location.href='bilhetes.html?generatorDraft=1';
  };
  const render=body=>{
    const scopeText=body.scopeMode==='specific'?'Jogo específico':body.scopeMode==='fixed'?'Jogo fixo + outros':'Todos os jogos';
    const diversity=body.diversity||{};
    const diag=body.diagnostics||{};
    status.hidden=false;status.innerHTML=`<span>${body.generated}/${body.requested} bilhetes gerados</span><span>${body.poolSize} seleções passaram no filtro</span><span>${body.candidates.games} mercados de jogo encontrados</span>${diag.pendingOdds?`<span>${diag.pendingOdds} com odd pendente</span>`:''}${diversity.uniqueFixtures!=null?`<span>${diversity.uniqueFixtures} jogos diferentes nos bilhetes</span>`:''}<span>${esc(scopeText)}</span><span>Score mínimo aplicado: ${body.minScoreApplied}</span>`;
    results.innerHTML='';
    if(body.focusGame)results.insertAdjacentHTML('beforeend',`<div class="focus-note">🎯 Jogo em destaque: <b>${esc(body.focusGame.match)}</b>${body.scopeMode==='specific'?' · as sugestões usam somente este confronto':' · toda sugestão precisa incluir pelo menos uma seleção deste confronto'}</div>`);
    (body.warnings||[]).forEach(w=>results.insertAdjacentHTML('beforeend',`<div class="warning-note">⚠ ${esc(w)}</div>`));
    if(!body.tickets?.length){const detail=body.poolSize>0?`Foram encontradas ${body.poolSize} seleções para este filtro, mas não foi possível montar o formato/odd que você pediu. Tente usar Simples, reduzir o número de seleções ou ampliar a faixa de odd.`:'Nenhum mercado deste jogo atingiu o nível mínimo de evidência do modelo. O gerador não criou uma aposta só para preencher.';results.insertAdjacentHTML('beforeend',`<div class="empty-generator">${esc(detail)}</div>`);return;}
    body.tickets.forEach((ticket,index)=>{
      const card=document.createElement('article');card.className='suggestion-card';
      const legs=ticket.selections.map(s=>`<div class="suggestion-leg"><small class="kind-chip">${s.kind==='player'?'JOGADOR':'JOGO'}</small><strong>${esc(s.match)}</strong><span>${esc(s.market)} · ${esc(s.selection)}</span><small>${s.bookmakerName?esc(s.bookmakerName)+' · ':''}${s.odd?`Odd ${Number(s.odd).toFixed(2)} · `:'Odd pendente · '}Score ${Number(s.score).toFixed(0)}/100 · ${esc(s.reason||'')}</small></div>`).join('');
      card.innerHTML=`<div class="suggestion-head"><h3>Sugestão ${index+1}</h3><span class="score-badge">${Number(ticket.score).toFixed(0)}/100</span></div><div class="suggestion-meta"><span>${ticket.selections.length} seleções</span><span>${ticket.requiresOdds?'Odd incompleta':'Odd calculada'}</span></div>${legs}<div class="suggestion-footer"><b>${ticket.totalOdd?`Odd ${Number(ticket.totalOdd).toFixed(2)}`:'Preencher odd antes de publicar'}</b><button class="use-ticket">Usar este bilhete →</button></div>`;
      card.querySelector('.use-ticket').onclick=()=>useTicket(ticket);results.appendChild(card);
    });
  };
  button.onclick=async()=>{
    error.hidden=true;
    if(scope.value!=='all'&&!Number(fixture.value)){error.textContent='Escolha o jogo que você quer destacar antes de gerar.';error.hidden=false;return;}
    button.disabled=true;button.textContent='Gerando...';results.innerHTML='';status.hidden=true;
    try{const r=await fetch('/api/bilhetes/gerador',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload())});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.erro||'Falha ao gerar sugestões.');render(body);}catch(err){error.textContent=err.message;error.hidden=false;}finally{button.disabled=false;button.textContent='⚡ Gerar sugestões';}
  };
})();
