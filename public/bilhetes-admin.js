(async()=>{
  const create=document.querySelector('#createManualTicket');
  const modal=document.querySelector('#manualTicketModal');
  const form=document.querySelector('#manualTicketForm');
  const list=document.querySelector('#manualSelections');
  const error=document.querySelector('#manualTicketError');
  const preview=document.querySelector('#manualTicketPreview');
  const previewButton=document.querySelector('#previewManualTicket');
  const publishButton=document.querySelector('#publishManualTicket');
  if(!create||!modal||!form)return;

  let token='';
  const isLocal=['localhost','127.0.0.1'].includes(location.hostname);
  if(isLocal)create.hidden=false;

  for(let i=0;i<50&&!window.CentralProAuth;i++)await new Promise(resolve=>setTimeout(resolve,100));
  try{
    if(!window.CentralProAuth)return;
    const {data}=await window.CentralProAuth.getSession();
    token=data.session?.access_token||'';
    if(!token)return;
    const r=await fetch('/api/bilhetes/admin/status',{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
    if(!(await r.json()).admin){if(!isLocal)return;}
  }catch{if(!isLocal)return;}

  create.hidden=false;
  let generatorButton=document.querySelector('#openTicketGenerator');
  if(!generatorButton){generatorButton=document.createElement('button');generatorButton.id='openTicketGenerator';generatorButton.type='button';generatorButton.className='create-ticket-btn generator-ticket-btn';generatorButton.textContent='⚡ Gerador interno';create.insertAdjacentElement('beforebegin',generatorButton);}
  generatorButton.onclick=()=>{location.href='gerador-bilhetes.html'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const profileLabel=v=>({CONSERVADOR:'Conservador',MODERADO:'Moderado',AGRESSIVO:'Agressivo'}[v]||'Moderado');
  const formatDateTime=v=>{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};

  const add=(values={})=>{
    const row=document.createElement('div');
    row.className='manual-pick-form';
    row.innerHTML=`
      <label>Jogo<input name="displayMatch" placeholder="Ex.: Flamengo x Fluminense" value="${esc(values.displayMatch||'')}" required></label>
      <label>Horário do jogo (opcional)<input name="fixtureDate" type="datetime-local" value="${esc(values.fixtureDate||'')}"></label>
      <label>Mercado<input name="market" placeholder="Ex.: Total de gols" value="${esc(values.market||'')}" required></label>
      <label>Seleção<input name="displaySelection" placeholder="Ex.: Mais de 1.5 gols" value="${esc(values.displaySelection||'')}" required></label>
      <label>Odd da seleção (opcional)<input name="odd" type="number" min="1.01" max="1000" step="0.01" placeholder="Ex.: 1.55" value="${esc(values.odd||'')}"></label>
      <label>Casa (opcional)<input name="bookmakerName" placeholder="Ex.: Betano" value="${esc(values.bookmakerName||'')}"></label>
      <button type="button" class="remove-pick">Remover seleção</button>`;
    row.querySelector('.remove-pick').onclick=()=>{row.remove();if(!list.children.length)add();invalidatePreview()};
    row.querySelectorAll('input').forEach(input=>input.addEventListener('input',invalidatePreview));
    list.appendChild(row);
  };

  const invalidatePreview=()=>{if(preview){preview.hidden=true;preview.innerHTML=''}if(publishButton)publishButton.hidden=true;if(previewButton)previewButton.hidden=false};
  const close=()=>modal.hidden=true;
  create.onclick=()=>{error.textContent='';if(!list.children.length)add();invalidatePreview();modal.hidden=false};
  document.querySelector('#closeManualTicket').onclick=close;
  modal.onclick=e=>{if(e.target===modal)close()};
  form.querySelectorAll('input,textarea,select').forEach(el=>el.addEventListener('input',invalidatePreview));
  document.querySelector('#addManualSelection').onclick=()=>{add();invalidatePreview()};
  document.querySelector('#addManualMarket').onclick=()=>{
    const last=[...list.querySelectorAll('.manual-pick-form')].at(-1);
    add({
      displayMatch:last?.querySelector('[name="displayMatch"]')?.value||'',
      fixtureDate:last?.querySelector('[name="fixtureDate"]')?.value||'',
      bookmakerName:last?.querySelector('[name="bookmakerName"]')?.value||''
    });
    invalidatePreview();
  };

  // Reaproveita o mesmo leitor de print já usado em Minha Banca.
  const slipToggle=document.querySelector('#toggleManualSlipReader');
  const slipBody=document.querySelector('#manualSlipReaderBody');
  const slipInput=document.querySelector('#manualSlipImageInput');
  const slipDropzone=document.querySelector('#manualSlipDropzone');
  const slipCopy=document.querySelector('#manualSlipDropzoneCopy');
  const slipImage=document.querySelector('#manualSlipPreview');
  const slipChange=document.querySelector('#changeManualSlipImage');
  const slipAnalyze=document.querySelector('#analyzeManualSlip');
  const slipStatus=document.querySelector('#manualSlipStatus');
  let selectedSlipFile=null;

  const setSlipStatus=(message,type='')=>{
    if(!slipStatus)return;
    slipStatus.textContent=message||'';
    slipStatus.className=`manual-slip-status${type?` ${type}`:''}`;
    slipStatus.hidden=!message;
  };
  const chooseSlipFile=file=>{
    if(!file)return;
    if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){setSlipStatus('Escolha uma imagem PNG, JPG ou WEBP.','error');return;}
    if(file.size>10*1024*1024){setSlipStatus('O print é muito grande. Use uma imagem de até 10 MB.','error');return;}
    selectedSlipFile=file;
    const url=URL.createObjectURL(file);
    slipImage.src=url;
    slipImage.onload=()=>URL.revokeObjectURL(url);
    slipImage.hidden=false;
    slipCopy.hidden=true;
    slipChange.hidden=false;
    slipAnalyze.disabled=false;
    setSlipStatus('Print carregado. Clique em “Analisar e preencher”.');
  };
  const applySlipToTicket=data=>{
    const legs=Array.isArray(data?.legs)?data.legs.filter(leg=>leg?.match||leg?.market||leg?.selection):[];
    if(!legs.length)throw new Error('A IA não encontrou seleções no print. Tente um print mais completo ou nítido.');
    list.innerHTML='';
    legs.forEach(leg=>add({
      displayMatch:leg.match||'',
      market:leg.market||'',
      displaySelection:leg.selection||'',
      odd:Number(leg.odd)>1?Number(leg.odd):'',
      bookmakerName:data.bookmaker||''
    }));
    if(Number(data.odd)>1)form.elements.totalOdd.value=Number(data.odd);
    invalidatePreview();
    const missing=[];
    const incomplete=legs.filter(leg=>!leg.match||!leg.market||!leg.selection).length;
    if(incomplete)missing.push(`${incomplete} seleção(ões) com algum campo incompleto`);
    const missingOdds=legs.filter(leg=>!(Number(leg.odd)>1)).length;
    if(missingOdds)missing.push(`${missingOdds} odd(s) individual(is) não identificada(s)`);
    if(!(Number(data.odd)>1))missing.push('odd final não identificada');
    if(data.expectedLegs&&legs.length<data.expectedLegs)missing.push(`o print parece ter ${data.expectedLegs} seleções, mas ${legs.length} foram reconhecidas`);
    const house=data.bookmaker?` Casa identificada: ${data.bookmaker}.`:'';
    const warnings=Array.isArray(data.warnings)&&data.warnings.length?` Avisos da leitura: ${data.warnings.join(' · ')}`:'';
    setSlipStatus(missing.length
      ? `Preenchi ${legs.length} seleção(ões).${house} Confira: ${missing.join(', ')}.${warnings}`
      : `Pronto: ${legs.length} seleção(ões) preenchida(s)${data.bookmaker?` · ${data.bookmaker}`:''}${Number(data.odd)>1?` · odd final ${Number(data.odd).toFixed(2)}`:''}. Confira antes de publicar.${warnings}`,'success');
  };

  if(slipToggle&&slipBody&&slipInput&&slipDropzone&&slipAnalyze){
    slipToggle.onclick=()=>{slipBody.hidden=!slipBody.hidden;slipToggle.textContent=slipBody.hidden?'Ler print da aposta':'Fechar leitor'};
    slipDropzone.onclick=()=>slipInput.click();
    slipDropzone.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();slipInput.click();}};
    slipInput.onchange=()=>chooseSlipFile(slipInput.files?.[0]);
    slipChange.onclick=()=>slipInput.click();
    ['dragenter','dragover'].forEach(name=>slipDropzone.addEventListener(name,e=>{e.preventDefault();slipDropzone.classList.add('is-dragging')}));
    ['dragleave','drop'].forEach(name=>slipDropzone.addEventListener(name,e=>{e.preventDefault();slipDropzone.classList.remove('is-dragging')}));
    slipDropzone.addEventListener('drop',e=>chooseSlipFile(e.dataTransfer?.files?.[0]));
    slipAnalyze.onclick=async()=>{
      if(!selectedSlipFile||!window.BankrollSlipReader)return;
      slipAnalyze.disabled=true;
      setSlipStatus('Enviando o print para a IA…');
      try{
        const data=await window.BankrollSlipReader.analyze(selectedSlipFile,progress=>setSlipStatus(progress<70?`Analisando o bilhete… ${progress}%`:`Organizando as seleções… ${progress}%`));
        applySlipToTicket(data);
      }catch(err){setSlipStatus(err?.message||'Não foi possível analisar este print.','error')}
      finally{slipAnalyze.disabled=false}
    };
  }

  const buildPayload=()=>{
    const selections=[...list.querySelectorAll('.manual-pick-form')].map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(x=>[x.name,x.value])));
    return {
      title:form.elements.title.value,
      description:form.elements.description.value,
      profile:form.elements.profile.value,
      reason:form.elements.reason.value,
      betanoUrl:form.elements.betanoUrl?.value||'',
      superbetUrl:form.elements.superbetUrl?.value||'',
      totalOdd:form.elements.totalOdd.value,
      selections
    };
  };

  const renderPreview=payload=>{
    const odd=Number(payload.totalOdd);
    const picks=payload.selections.map(s=>`<div class="preview-pick"><strong>${esc(s.displayMatch)}</strong><span>${esc(s.market)} · ${esc(s.displaySelection)}</span><small>${s.fixtureDate?`🕒 ${esc(formatDateTime(s.fixtureDate))}`:''}${s.bookmakerName?`${s.fixtureDate?' · ':''}${esc(s.bookmakerName)}`:''}${s.odd?` · Odd ${Number(s.odd).toFixed(2)}`:''}</small></div>`).join('');
    preview.innerHTML=`<div class="preview-head"><span class="ticket-profile profile-${esc(payload.profile.toLowerCase())}">${esc(profileLabel(payload.profile))}</span><strong>ODD ${Number.isFinite(odd)?odd.toFixed(2):'—'}</strong></div><h3>${esc(payload.title||'Bilhete Central Pro')}</h3><p>${esc(payload.description||'')}</p><div class="preview-reason"><b>Por que escolhi este bilhete?</b><p>${esc(payload.reason||'')}</p></div>${picks}${payload.betanoUrl?`<a class="preview-ticket-link" href="${esc(payload.betanoUrl)}" target="_blank" rel="noopener noreferrer">🎟 Betano</a>`:''}${payload.superbetUrl?`<a class="preview-ticket-link" href="${esc(payload.superbetUrl)}" target="_blank" rel="noopener noreferrer">🎟 Superbet</a>`:''}<small class="preview-note">Odds registradas no momento da publicação e sujeitas a alteração.</small>`;
    preview.hidden=false;
  };

  previewButton.onclick=()=>{
    error.textContent='';
    if(!form.reportValidity())return;
    const payload=buildPayload();
    if(!payload.selections.length){error.textContent='Adicione pelo menos uma seleção.';return;}
    renderPreview(payload);
    previewButton.hidden=true;
    publishButton.hidden=false;
  };

  form.onsubmit=async e=>{
    e.preventDefault();
    error.textContent='';
    const payload=buildPayload();
    publishButton.disabled=true;
    publishButton.textContent='Publicando...';
    try{
      const r=await fetch('/api/bilhetes/manual',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(payload)});
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(body.erro||'Não foi possível publicar.');
      location.reload();
    }catch(err){
      error.textContent=err.message;
      publishButton.disabled=false;
      publishButton.textContent='Publicar e notificar';
    }
  };

  const loadGeneratorDraft=()=>{
    if(!new URLSearchParams(location.search).has('generatorDraft'))return;
    try{
      const raw=localStorage.getItem('centralPro.generatorDraft.v1');if(!raw)return;
      const draft=JSON.parse(raw);
      form.elements.title.value=draft.title||'Bilhete Central Pro';
      form.elements.description.value=draft.description||'Bilhete selecionado pela Central Pro.';
      form.elements.profile.value=draft.profile||'MODERADO';
      form.elements.reason.value=draft.reason||'';
      form.elements.totalOdd.value=draft.totalOdd||'';
      if(form.elements.betanoUrl)form.elements.betanoUrl.value=draft.betanoUrl||draft.ticketUrl||'';
      if(form.elements.superbetUrl)form.elements.superbetUrl.value=draft.superbetUrl||'';
      list.innerHTML='';(draft.selections||[]).forEach(add);if(!list.children.length)add();
      invalidatePreview();
      const missingOdds=[...list.querySelectorAll('[name="odd"]')].filter(input=>!input.value);
      missingOdds.forEach(input=>{input.placeholder='Preencha a odd manualmente';input.dataset.needsManual='1';});
      error.textContent=missingOdds.length
        ? `Bilhete carregado. ${missingOdds.length} odd(s) ficaram para você preencher manualmente; depois cole o link do bilhete e publique.`
        : 'Bilhete carregado. Confira as odds, cole o link do bilhete e publique.';
      modal.hidden=false;
      requestAnimationFrame(()=>{(missingOdds[0]||form.elements.betanoUrl||form.elements.superbetUrl||form.elements.totalOdd)?.focus();});
      localStorage.removeItem('centralPro.generatorDraft.v1');
      history.replaceState({},'',location.pathname);
    }catch{}
  };
  loadGeneratorDraft();

  const decorate=()=>document.querySelectorAll('.ticket-card[data-ticket-source="manual"]').forEach(card=>{
    if(card.querySelector('.manual-admin-actions'))return;
    const id=card.dataset.ticketId;
    const actions=document.createElement('div');
    actions.className='manual-admin-actions';
    actions.innerHTML='<button data-manual-status="GREEN">✓ Green</button><button data-manual-status="RED">× Red</button><button data-manual-status="VOID">↔ Anulado</button><button data-manual-status="OPEN">↺ Aberto</button><button data-manual-delete>Excluir</button>';
    actions.onclick=async e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-manual-delete')){
        if(!confirm('Excluir este bilhete manual?'))return;
        const r=await fetch('/api/bilhetes/manual/'+encodeURIComponent(id),{method:'DELETE',headers:{Authorization:`Bearer ${token}`}});
        if(r.ok)location.reload();return;
      }
      const status=b.dataset.manualStatus;
      const r=await fetch('/api/bilhetes/manual/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({status})});
      if(r.ok)location.reload();
    };
    card.appendChild(actions);
  });
  new MutationObserver(decorate).observe(document.querySelector('#ticketGrid'),{childList:true,subtree:true});
  decorate();
})();
