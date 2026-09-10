(async()=>{
  const button=document.querySelector('#pushNotificationsButton');
  const note=document.querySelector('#pushNotificationsNote');
  if(!button||!('serviceWorker' in navigator)||!('PushManager' in window)){if(button)button.hidden=true;return;}
  const session=async()=>{try{return (await window.CentralProAuth?.getSession())?.data?.session||null}catch{return null}};
  const token=async()=> (await session())?.access_token||'';
  const api=async(path,options={})=>{const access=await token();const r=await fetch(path,{...options,headers:{...(options.headers||{}),...(access?{Authorization:`Bearer ${access}`}:{})}});const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.erro||'Não foi possível configurar as notificações.');return body};
  const b64=s=>{const pad='='.repeat((4-s.length%4)%4),raw=atob((s+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))};
  const registration=await navigator.serviceWorker.register('/push-sw.js');
  const current=await registration.pushManager.getSubscription();
  const paint=subscription=>{button.hidden=false;button.textContent=subscription?'🔔 Notificações ativadas':'🔔 Ativar notificações';button.dataset.enabled=subscription?'1':'0';if(note)note.textContent=subscription?'Você receberá novos bilhetes neste dispositivo.':'Ative para receber novos bilhetes mesmo com o site fechado.'};
  paint(current);
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
      let subscription=await registration.pushManager.getSubscription();
      if(subscription){await api('/api/push/unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:subscription.endpoint})});await subscription.unsubscribe();paint(null);return;}
      if(Notification.permission==='denied')throw new Error('As notificações estão bloqueadas no navegador. Libere a Central Pro nas configurações do navegador.');
      const cfg=await api('/api/push/config');
      if(!cfg.publicKey)throw new Error('As notificações ainda não foram ativadas no servidor.');
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(cfg.publicKey)});
      await api('/api/push/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({subscription})});
      paint(subscription);
    }catch(error){if(note)note.textContent=error.message;}
    finally{button.disabled=false;}
  });
})().catch(()=>{});
