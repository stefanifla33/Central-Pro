(function () {
  'use strict';
  const cache = new Map(), pending = new Map(), selected = new Map(), visible = new Set(), observed = new Set();
  const books = new Map([[32, 'Betano'], [8, 'Bet365'], [34, 'Superbet']]);
  const validOdd = value => typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && Number(value) > 1;
  const current = data => data && Date.parse(data.expiresAt) > Date.now() && data.fixtureStatus === 'NS' && Date.parse(data.kickoff) > Date.now();
  let active = 0;
  const queue = [];
  function drain() {
    while (active < 3 && queue.length) {
      active++;
      const { task, resolve } = queue.shift();
      task().then(resolve).finally(() => { active--; drain(); });
    }
  }
  function fetchFixture(id) {
    const cached = cache.get(id);
    if (cached && Date.parse(cached.expiresAt) > Date.now()) return Promise.resolve(cached);
    if (pending.has(id)) return pending.get(id);
    const request = new Promise(resolve => {
      queue.push({ resolve, task: async () => {
        let data;
        try {
          const response = await fetch(`/api/partidas/${id}/odds`, { signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error('unavailable');
          data = await response.json();
          if (String(data.fixtureId) !== id || !Number.isFinite(Date.parse(data.expiresAt))) throw new Error('invalid');
        } catch {
          data = { fixtureId: Number(id), selections: {}, expiresAt: new Date(Date.now() + 120000).toISOString() };
        }
        cache.set(id, data);
        return data;
      } });
      drain();
    }).finally(() => pending.delete(id));
    pending.set(id, request);
    return request;
  }
  function quotesFor(id, key) {
    const data = cache.get(String(id));
    if (!current(data)) return [];
    return (data.selections?.[key] || []).filter(quote => books.get(quote.bookmakerId) === quote.name && validOdd(quote.odd) && Number.isFinite(Date.parse(quote.update)) && Date.now() - Date.parse(quote.update) < 172800000 && Date.parse(quote.update) <= Date.now() + 60000);
  }
  function selectedQuote(id, key) {
    const quotes = quotesFor(id, key), book = selected.get(`${id}:${key}`);
    return quotes.find(quote => quote.bookmakerId === book) || quotes.reduce((best, quote) => !best || Number(quote.odd) > Number(best.odd) ? quote : best, null);
  }
  function paint(node) {
    const { oddsFixture: id, oddsMarket: key } = node.dataset;
    const quotes = quotesFor(id, key);
    node.replaceChildren();
    if (!quotes.length) { node.textContent = 'Odds indisponíveis'; node.classList.add('is-unavailable'); return; }
    node.classList.remove('is-unavailable');
    const chosen = selectedQuote(id, key), best = Math.max(...quotes.map(quote => Number(quote.odd)));
    const row = document.createElement('div'); row.className = 'cp-odds-options';
    for (const quote of quotes) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'cp-odd';
      button.setAttribute('aria-pressed', String(chosen?.bookmakerId === quote.bookmakerId));
      button.title = `${quote.market} · ${quote.selection} · Atualização da casa: ${new Date(quote.update).toLocaleString('pt-BR')}`;
      button.setAttribute('aria-label', `${quote.name}, odd ${quote.odd}. Selecionar para Minha Banca`);
      const name = document.createElement('span'); name.className = 'cp-odd-name'; name.textContent = quote.name;
      const value = document.createElement('strong'); value.textContent = quote.odd;
      button.append(name, value);
      if (quotes.length > 1 && Number(quote.odd) === best) {
        button.classList.add('is-best');
        const badge = document.createElement('small'); badge.textContent = 'Melhor odd'; button.append(badge);
      }
      button.addEventListener('click', () => {
        selected.set(`${id}:${key}`, quote.bookmakerId);
        document.querySelectorAll('.cp-odds').forEach(other => { if (other.dataset.oddsFixture === id && other.dataset.oddsMarket === key) paint(other); });
      });
      row.append(button);
    }
    const note = document.createElement('small'); note.className = 'cp-odds-note';
    note.textContent = `Cotação selecionada · ${chosen.name} · ${new Date(chosen.update).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
    node.append(row, note);
  }
  async function refresh(node) {
    paint(node);
    await fetchFixture(node.dataset.oddsFixture);
    if (node.isConnected) paint(node);
  }
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { visible.add(entry.target); void refresh(entry.target); }
      else visible.delete(entry.target);
    });
  }, { rootMargin: '100px' }) : null;
  function mount(root) {
    for (const node of observed) if (!node.isConnected) { observed.delete(node); visible.delete(node); observer?.unobserve(node); }
    root.querySelectorAll('.cp-odds').forEach(node => {
      paint(node);
      observed.add(node);
      if (observer) observer.observe(node); else { visible.add(node); void refresh(node); }
    });
  }
  function placeholder(item) {
    const id = String(item.game.fixture.id), key = item.key;
    if (!/^\d+$/.test(id) || !/^[a-zA-Z0-9]+$/.test(key)) return '';
    return `<div class="cp-odds is-unavailable" data-odds-fixture="${id}" data-odds-market="${key}" aria-label="Odds pré-jogo">Odds indisponíveis</div>`;
  }
  function refreshVisible() {
    if (document.hidden) return;
    for (const node of visible) {
      if (!node.isConnected) { visible.delete(node); observer?.unobserve(node); continue; }
      void refresh(node);
    }
  }
  // Hide at kickoff/expiry even on a long-lived tab. Only visible cards refresh.
  setInterval(() => { for (const node of visible) if (node.isConnected && !current(cache.get(node.dataset.oddsFixture))) paint(node); }, 1000);
  setInterval(refreshVisible, 60000);
  document.addEventListener('visibilitychange', refreshVisible);
  window.CPPrematchOdds = { placeholder, mount, selectedQuote };
}());
