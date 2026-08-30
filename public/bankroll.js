(function () {
  'use strict';

  const store = window.BankrollStore;
  let activeFilter = 'all';
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const resultLabels = { pending: 'Pendente', green: 'Green', red: 'Red', void: 'Void' };
  const byId = (id) => document.getElementById(id);

  byId('menuButton').addEventListener('click', () => byId('sidebar').classList.toggle('open'));
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault(); byId('globalSearch').focus();
    }
  });
  byId('globalSearch').addEventListener('keydown', (event) => {
    const query = event.target.value.trim();
    if (event.key === 'Enter' && query.length >= 3) location.href = `teams.html?q=${encodeURIComponent(query)}`;
  });

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function dateLabel(value) {
    if (!value) return '—';
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }

  function setTone(element, value) {
    element.parentElement.classList.toggle('positive', value > 0);
    element.parentElement.classList.toggle('negative', value < 0);
  }

  function renderSummary(state) {
    const summary = store.calculate(state);
    byId('initialBankroll').textContent = summary.initialBankroll == null ? '—' : currency.format(summary.initialBankroll);
    byId('currentBankroll').textContent = summary.currentBankroll == null ? '—' : currency.format(summary.currentBankroll);
    byId('netProfit').textContent = currency.format(summary.netProfit);
    byId('roi').textContent = `${decimal.format(summary.roi)}%`;
    byId('totalStake').textContent = currency.format(summary.totalStake);
    byId('greens').textContent = summary.counts.green;
    byId('reds').textContent = summary.counts.red;
    byId('voids').textContent = summary.counts.void;
    byId('pendings').textContent = summary.counts.pending;
    byId('averageOdd').textContent = decimal.format(summary.averageOdd);
    byId('hitRate').textContent = `${decimal.format(summary.hitRate)}%`;
    setTone(byId('netProfit'), summary.netProfit);
    setTone(byId('roi'), summary.roi);
    setTone(byId('currentBankroll'), summary.netProfit);
    byId('setupNotice').hidden = summary.initialBankroll != null;
    byId('initialBankrollButton').textContent = summary.initialBankroll == null ? 'Definir banca inicial' : 'Editar banca inicial';
  }

  function filteredEntries(entries) {
    const term = byId('entrySearch').value.trim().toLocaleLowerCase('pt-BR');
    return entries
      .filter((entry) => activeFilter === 'all' || entry.result === activeFilter)
      .filter((entry) => !term || [entry.match, entry.market, entry.selection].some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)))
      .slice()
      .sort((a, b) => `${b.date}|${b.createdAt}`.localeCompare(`${a.date}|${a.createdAt}`));
  }

  function renderTable(state) {
    const entries = filteredEntries(state.entries);
    const body = byId('entriesBody');
    body.innerHTML = entries.map((entry) => {
      const profit = store.profit(entry);
      const profitClass = profit > 0 ? 'profit-positive' : profit < 0 ? 'profit-negative' : '';
      return `<tr>
        <td data-label="Data">${dateLabel(entry.date)}</td>
        <td class="match-cell" data-label="Partida"><strong>${escapeHtml(entry.match)}</strong><small><b>Competição</b>${escapeHtml(entry.competition)}</small></td>
        <td data-label="Mercado">${escapeHtml(entry.market)}</td><td data-label="Seleção">${escapeHtml(entry.selection)}</td>
        <td class="odd-value" data-label="Odd">${decimal.format(entry.odd)}</td><td class="money-value" data-label="Stake">${currency.format(entry.stake)}</td>
        <td data-label="Resultado"><span class="result-badge ${entry.result}">${resultLabels[entry.result]}</span></td>
        <td class="money-value ${profitClass}" data-label="Lucro/Prejuízo">${entry.result === 'pending' ? '—' : currency.format(profit)}</td>
        <td class="entry-actions-cell" data-label="Ações"><div class="row-actions"><button class="row-action" data-edit="${entry.id}" type="button">Editar</button><button class="row-action delete" data-delete="${entry.id}" type="button">Excluir</button></div></td>
      </tr>`;
    }).join('');
    byId('emptyState').hidden = entries.length > 0;
    byId('entryCount').textContent = `${state.entries.length} ${state.entries.length === 1 ? 'entrada' : 'entradas'}`;
  }

  function drawChart(state) {
    const canvas = byId('bankrollChart');
    const wrap = canvas.parentElement;
    const points = store.evolution(state);
    byId('chartEmpty').hidden = points.length > 1;
    const ratio = window.devicePixelRatio || 1;
    const width = Math.max(300, wrap.clientWidth);
    const height = wrap.clientHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
    if (points.length < 2) return;
    const values = points.map((point) => point.value);
    let min = Math.min(...values), max = Math.max(...values);
    const paddingValue = Math.max((max - min) * .18, Math.abs(max) * .025, 1);
    min -= paddingValue; max += paddingValue;
    const pad = { left: 56, right: 18, top: 15, bottom: 24 };
    const plotWidth = width - pad.left - pad.right, plotHeight = height - pad.top - pad.bottom;
    const x = (index) => pad.left + (points.length === 1 ? 0 : (index / (points.length - 1)) * plotWidth);
    const y = (value) => pad.top + ((max - value) / (max - min)) * plotHeight;
    ctx.font = '9px system-ui'; ctx.fillStyle = '#788391'; ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
    for (let line = 0; line < 4; line += 1) {
      const py = pad.top + (line / 3) * plotHeight;
      ctx.beginPath(); ctx.moveTo(pad.left, py); ctx.lineTo(width - pad.right, py); ctx.stroke();
      const labelValue = max - (line / 3) * (max - min);
      ctx.fillText(currency.format(labelValue).replace(/\s/g, ' '), 2, py + 3);
    }
    const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    gradient.addColorStop(0, 'rgba(52,211,120,.22)'); gradient.addColorStop(1, 'rgba(52,211,120,0)');
    ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(x(index), y(point.value)) : ctx.moveTo(x(index), y(point.value)));
    ctx.lineTo(x(points.length - 1), height - pad.bottom); ctx.lineTo(x(0), height - pad.bottom); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath(); points.forEach((point, index) => index ? ctx.lineTo(x(index), y(point.value)) : ctx.moveTo(x(index), y(point.value)));
    ctx.strokeStyle = '#39db85'; ctx.lineWidth = 2; ctx.stroke();
    points.forEach((point, index) => { ctx.beginPath(); ctx.arc(x(index), y(point.value), 2.7, 0, Math.PI * 2); ctx.fillStyle = '#39db85'; ctx.fill(); });
  }

  function render() {
    const state = store.load();
    renderSummary(state); renderTable(state); drawChart(state);
    window.BankrollExport?.updateAvailability(state);
  }

  function openInitialDialog() {
    const state = store.load();
    byId('initialBankrollInput').value = state.initialBankroll ?? '';
    byId('initialBankrollDialog').showModal();
  }

  function openEntryDialog(entry) {
    byId('entryForm').reset();
    byId('entryId').value = entry?.id || '';
    byId('entryDialogTitle').textContent = entry ? 'Editar entrada' : 'Nova entrada';
    byId('entryDate').value = entry?.date || new Date().toISOString().slice(0, 10);
    byId('entryCompetition').value = entry?.competition || '';
    byId('entryMatch').value = entry?.match || '';
    byId('entryMarket').value = entry?.market || '';
    byId('entrySelection').value = entry?.selection || '';
    byId('entryOdd').value = entry?.odd || '';
    byId('entryStake').value = entry?.stake || '';
    byId('entryResult').value = entry?.result || 'pending';
    byId('entryDialog').showModal();
  }

  function openPrefilledEntryFromQuery() {
    const params = new URLSearchParams(location.search);
    if (params.get('newEntry') !== '1') return;
    openEntryDialog({
      date: params.get('date') || new Date().toISOString().slice(0, 10),
      competition: params.get('competition') || '',
      match: params.get('match') || '',
      market: params.get('market') || '',
      selection: params.get('selection') || '',
      result: 'pending'
    });
    history.replaceState(null, '', location.pathname);
  }

  byId('initialBankrollButton').addEventListener('click', openInitialDialog);
  byId('setupNoticeButton').addEventListener('click', openInitialDialog);
  byId('newEntryButton').addEventListener('click', () => openEntryDialog());
  byId('firstEntryButton').addEventListener('click', () => openEntryDialog());
  document.querySelectorAll('.close-dialog').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));

  byId('initialBankrollForm').addEventListener('submit', (event) => {
    event.preventDefault();
    store.setInitialBankroll(byId('initialBankrollInput').value);
    byId('initialBankrollDialog').close(); render();
  });

  byId('resetBankrollButton').addEventListener('click', () => {
    document.querySelector('.settings-menu').removeAttribute('open');
    byId('resetBankrollForm').reset();
    byId('confirmResetButton').disabled = true;
    byId('resetBankrollDialog').showModal();
  });
  byId('resetConfirmationInput').addEventListener('input', (event) => {
    byId('confirmResetButton').disabled = event.target.value !== 'RESETAR';
  });
  byId('resetBankrollForm').addEventListener('submit', (event) => {
    event.preventDefault();
    if (byId('resetConfirmationInput').value !== 'RESETAR') return;
    store.reset();
    byId('resetBankrollDialog').close();
    activeFilter = 'all';
    byId('entrySearch').value = '';
    byId('resultFilters').querySelectorAll('button').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'all'));
    render();
  });

  byId('entryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    store.upsertEntry({ id: byId('entryId').value || undefined, date: byId('entryDate').value, competition: byId('entryCompetition').value, match: byId('entryMatch').value, market: byId('entryMarket').value, selection: byId('entrySelection').value, odd: byId('entryOdd').value, stake: byId('entryStake').value, result: byId('entryResult').value });
    byId('entryDialog').close(); render();
  });

  byId('entriesBody').addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-edit]');
    const deleteButton = event.target.closest('[data-delete]');
    if (editButton) openEntryDialog(store.load().entries.find((entry) => entry.id === editButton.dataset.edit));
    if (deleteButton && window.confirm('Excluir esta entrada? Esta ação recalculará todos os indicadores.')) { store.removeEntry(deleteButton.dataset.delete); render(); }
  });

  byId('resultFilters').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    byId('resultFilters').querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
    renderTable(store.load());
  });
  byId('entrySearch').addEventListener('input', () => renderTable(store.load()));
  let resizeTimer;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => drawChart(store.load()), 100); });
  render();
  openPrefilledEntryFromQuery();
}());
