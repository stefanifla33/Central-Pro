(()=>{
  const MOBILE_QUERY='(max-width: 768px)';
  const tbodyIds=['scannerBody','playerScannerBody','cornersScannerBody'];
  const observers=new Map();
  const isMobile=()=>window.matchMedia(MOBILE_QUERY).matches;
  const cleanText=value=>(value||'').replace(/\s+/g,' ').trim();
  const cloneChildren=(source,target)=>Array.from(source?.childNodes||[]).forEach(node=>target.appendChild(node.cloneNode(true)));

  function getCardContainer(tbody){
    return document.querySelector(`.mobile-analysis-cards[data-mobile-for="${tbody.id}"]`);
  }

  function makeStateCard(row){
    const state=document.createElement('div');
    state.className='mobile-scanner-state';
    if(row.cells?.[0])cloneChildren(row.cells[0],state);
    return state;
  }

  function makeGenericCard(row,headers,league){
    const card=document.createElement('article');
    card.className='mobile-match-card mobile-generic-card';
    if(league){
      const heading=document.createElement('div');
      heading.className='mobile-card-league';
      heading.textContent=league;
      card.appendChild(heading);
    }
    const grid=document.createElement('div');
    grid.className='mobile-generic-grid';
    Array.from(row.cells||[]).forEach((cell,index)=>{
      const field=document.createElement('div');
      field.className='mobile-generic-field';
      const label=document.createElement('span');
      label.className='mobile-market-label';
      label.textContent=headers[index]||'';
      const value=document.createElement('div');
      value.className='mobile-generic-value';
      cloneChildren(cell,value);
      field.append(label,value);
      grid.appendChild(field);
    });
    card.appendChild(grid);
    return card;
  }

  function makeMatchCard(row,league,headers){
    const cells=Array.from(row.cells||[]);
    const match=row.querySelector('.scanner-match');
    if(!match||cells.length<2)return makeGenericCard(row,headers,league);
    const card=document.createElement('article');
    card.className='mobile-match-card';
    if(row.dataset.match){card.dataset.match=row.dataset.match;card.tabIndex=0;card.setAttribute('role','link')}
    const meta=document.createElement('div');
    meta.className='mobile-card-meta';
    const competition=document.createElement('span');
    competition.className='mobile-card-league';
    competition.textContent=league||'Partida';
    const time=document.createElement('span');
    time.className='mobile-card-time';
    cloneChildren(cells[0],time);
    meta.append(competition,time);
    const teams=document.createElement('div');
    teams.className='mobile-card-match';
    cloneChildren(match,teams);
    const grid=document.createElement('div');
    grid.className='mobile-market-grid';
    const marketCells=cells.slice(2);
    if(marketCells.length===1&&marketCells[0].hasAttribute('colspan')){
      const empty=document.createElement('div');
      empty.className='mobile-market-state';
      cloneChildren(marketCells[0],empty);
      grid.appendChild(empty);
    }else{
      marketCells.forEach((cell,index)=>{
        const item=document.createElement('div');
        item.className='mobile-market';
        const label=document.createElement('span');
        label.className='mobile-market-label';
        label.textContent=headers[index+2]||`Mercado ${index+1}`;
        const value=document.createElement('div');
        value.className='mobile-market-value';
        cloneChildren(cell,value);
        item.append(label,value);
        grid.appendChild(item);
      });
    }
    card.append(meta,teams,grid);
    return card;
  }

  function rebuild(tbody){
    if(!isMobile())return;
    const cards=getCardContainer(tbody);
    if(!cards)return;
    const headerRow=tbody.closest('table')?.tHead?.rows?.[0];
    const headers=headerRow?Array.from(headerRow.cells).map(cell=>cleanText(cell.textContent)):[];
    const fragment=document.createDocumentFragment();
    let league='';
    Array.from(tbody.rows).forEach(row=>{
      if(row.classList.contains('league-row'))league=cleanText(row.querySelector('.league-separator strong')?.textContent||row.textContent);
      else if(!row.dataset.match&&row.cells?.length===1)fragment.appendChild(makeStateCard(row));
      else fragment.appendChild(makeMatchCard(row,league,headers));
    });
    cards.replaceChildren(fragment);
  }

  function bind(tbody){
    if(observers.has(tbody))return;
    const observer=new MutationObserver(()=>rebuild(tbody));
    observer.observe(tbody,{childList:true,subtree:true,characterData:true});
    observers.set(tbody,observer);
    rebuild(tbody);
  }
  function init(){tbodyIds.forEach(id=>{const tbody=document.getElementById(id);if(tbody)bind(tbody)})}
  document.addEventListener('click',event=>{
    if(!isMobile())return;
    const card=event.target.closest('.mobile-match-card[data-match]');
    if(card&&!event.target.closest('a,button'))location.href=`match.html?id=${encodeURIComponent(card.dataset.match)}`;
  });
  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('.mobile-match-card[data-match]')){
      event.preventDefault();location.href=`match.html?id=${encodeURIComponent(event.target.dataset.match)}`;
    }
  });
  window.matchMedia(MOBILE_QUERY).addEventListener('change',event=>{
    if(event.matches){init();tbodyIds.forEach(id=>{const tbody=document.getElementById(id);if(tbody)rebuild(tbody)})}
  });
  window.addEventListener('pageshow',init);
  init();
})();
