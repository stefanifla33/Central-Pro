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

  const buildPayload=()=>{
    const selections=[...list.querySelectorAll('.manual-pick-form')].map(row=>Object.fromEntries([...row.querySelectorAll('input')].map(x=>[x.name,x.value])));
    return {
      title:form.elements.title.value,
      description:form.elements.description.value,
      profile:form.elements.profile.value,
      reason:form.elements.reason.value,
      ticketUrl:form.elements.ticketUrl?.value||'',
      totalOdd:form.elements.totalOdd.value,
      selections
    };
  };

  const renderPreview=payload=>{
    const odd=Number(payload.totalOdd);
    const picks=payload.selections.map(s=>`<div class="preview-pick"><strong>${esc(s.displayMatch)}</strong><span>${esc(s.market)} · ${esc(s.displaySelection)}</span><small>${s.fixtureDate?`🕒 ${esc(formatDateTime(s.fixtureDate))}`:''}${s.bookmakerName?`${s.fixtureDate?' · ':''}${esc(s.bookmakerName)}`:''}${s.odd?` · Odd ${Number(s.odd).toFixed(2)}`:''}</small></div>`).join('');
    preview.innerHTML=`<div class="preview-head"><span class="ticket-profile profile-${esc(payload.profile.toLowerCase())}">${esc(profileLabel(payload.profile))}</span><strong>ODD ${Number.isFinite(odd)?odd.toFixed(2):'—'}</strong></div><h3>${esc(payload.title||'Bilhete Central Pro')}</h3><p>${esc(payload.description||'')}</p><div class="preview-reason"><b>Por que escolhi este bilhete?</b><p>${esc(payload.reason||'')}</p></div>${picks}${payload.ticketUrl?`<a class="preview-ticket-link" href="${esc(payload.ticketUrl)}" target="_blank" rel="noopener noreferrer">🎟 Pegar bilhete</a>`:''}<small class="preview-note">Odds registradas no momento da publicação e sujeitas a alteração.</small>`;
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
      list.innerHTML='';(draft.selections||[]).forEach(add);if(!list.children.length)add();
      invalidatePreview();error.textContent='Sugestão carregada do Gerador Interno. Confira as odds, escalações e o link antes de publicar.';modal.hidden=false;
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
