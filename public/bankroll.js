(function () {
  'use strict';

  const store = window.BankrollStore;
  let activeFilter = 'all';
  const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const resultLabels = { pending: 'Pendente', green: 'Green', red: 'Red', void: 'Void' };
  const byId = (id) => document.getElementById(id);
  let selectedSlipFile = null;
  let entrySource = 'manual';

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
    const decided = summary.counts.green + summary.counts.red;
    byId('hitRateDetail').textContent = `${summary.counts.green} de ${decided} ${decided === 1 ? 'entrada decidida' : 'entradas decididas'}`;
    const profitPercent = summary.initialBankroll > 0 ? (summary.netProfit / summary.initialBankroll) * 100 : 0;
    byId('profitPercent').textContent = summary.initialBankroll > 0 ? `${profitPercent >= 0 ? '+' : ''}${decimal.format(profitPercent)}% da banca inicial` : 'Banca inicial não definida';
    byId('bankrollDelta').textContent = summary.initialBankroll == null ? 'Banca inicial não definida' : `Inicial: ${currency.format(summary.initialBankroll)}`;
    renderManagement(state, summary);
    setTone(byId('netProfit'), summary.netProfit);
    setTone(byId('roi'), summary.roi);
    setTone(byId('currentBankroll'), summary.netProfit);
    byId('setupNotice').hidden = summary.initialBankroll != null;
    byId('initialBankrollButton').textContent = summary.initialBankroll == null ? 'Definir banca inicial' : 'Editar banca inicial';
  }


  function exposureLevel(percent) {
    if (percent > 10) return { key: 'high', label: 'Exposição muito alta' };
    if (percent > 5) return { key: 'high', label: 'Exposição elevada' };
    if (percent > 3) return { key: 'moderate', label: 'Exposição moderada' };
    return { key: 'controlled', label: 'Exposição controlada' };
  }

  function renderManagement(state, summary) {
    const bankroll = summary.currentBankroll;
    const validBase = Number.isFinite(bankroll) && bankroll > 0;
    const stakes = state.entries.map((entry) => Number(entry.stake) || 0).filter((stake) => stake > 0);
    const averageStake = stakes.length ? stakes.reduce((sum, stake) => sum + stake, 0) / stakes.length : 0;
    const maxStake = stakes.length ? Math.max(...stakes) : 0;
    const pendingStake = state.entries.filter((entry) => entry.result === 'pending').reduce((sum, entry) => sum + (Number(entry.stake) || 0), 0);
    const averagePercent = validBase ? (averageStake / bankroll) * 100 : 0;
    const maxPercent = validBase ? (maxStake / bankroll) * 100 : 0;
    const pendingPercent = validBase ? (pendingStake / bankroll) * 100 : 0;
    byId('averageStakePercent').textContent = validBase && stakes.length ? `${decimal.format(averagePercent)}%` : '—';
    byId('maxStakePercent').textContent = validBase && stakes.length ? `${decimal.format(maxPercent)}%` : '—';
    byId('pendingExposurePercent').textContent = validBase ? `${decimal.format(pendingPercent)}%` : '—';
    const pill = byId('managementRisk');
    const fill = byId('managementMeterFill');
    pill.className = 'risk-pill'; fill.className = '';
    if (!validBase || !stakes.length) {
      pill.textContent = validBase ? 'Sem entradas' : 'Aguardando dados';
      byId('managementMessage').textContent = validBase ? 'Registre entradas para acompanhar sua exposição em relação à banca.' : 'Defina sua banca inicial para acompanhar a exposição das suas entradas.';
      fill.style.width = '0%';
      return;
    }
    const level = exposureLevel(maxPercent);
    pill.classList.add(level.key); fill.classList.add(level.key);
    pill.textContent = level.label;
    fill.style.width = `${Math.min(100, (maxPercent / 15) * 100)}%`;
    byId('managementMessage').textContent = level.key === 'high'
      ? 'Há entrada com peso alto em relação à sua banca atual. Revise a exposição antes de aumentar a stake.'
      : level.key === 'moderate'
        ? 'Sua maior entrada merece atenção. Acompanhe o percentual da banca comprometido em cada aposta.'
        : 'As entradas registradas estão com exposição baixa em relação à banca atual.';
  }

  function updateStakeRisk() {
    const summary = store.calculate(store.load());
    const bankroll = summary.currentBankroll;
    const stake = Number(byId('entryStake').value) || 0;
    const box = byId('stakeRisk');
    if (!(bankroll > 0) || !(stake > 0)) {
      box.hidden = true;
      byId('stakeInline').textContent = bankroll > 0 ? 'Informe a stake para calcular a exposição.' : 'Defina a banca inicial para calcular a exposição.';
      return;
    }
    const percent = (stake / bankroll) * 100;
    const level = exposureLevel(percent);
    byId('stakeInline').textContent = `${currency.format(stake)} representa ${decimal.format(percent)}% da banca atual.`;
    box.hidden = false;
    box.className = `stake-risk full ${level.key === 'controlled' ? '' : level.key}`.trim();
    byId('stakeRiskTitle').textContent = `Esta entrada representa ${decimal.format(percent)}% da sua banca.`;
    byId('stakeRiskBadge').textContent = level.label;
    byId('stakeRiskFill').style.width = `${Math.min(100, (percent / 15) * 100)}%`;
    byId('stakeRiskText').textContent = level.key === 'high'
      ? 'Uma exposição alta concentra uma parcela relevante da banca em uma única entrada e aumenta o impacto de uma perda.'
      : level.key === 'moderate'
        ? 'Esta stake já representa uma parcela relevante da banca. Vale conferir se a exposição está de acordo com sua gestão.'
        : 'A stake representa uma parcela pequena da banca atual. Continue acompanhando a exposição total das entradas pendentes.';
  }

  function filteredEntries(entries) {
    const term = byId('entrySearch').value.trim().toLocaleLowerCase('pt-BR');
    return entries
      .filter((entry) => activeFilter === 'all' || entry.result === activeFilter)
      .filter((entry) => !term || [entry.match, entry.market, entry.selection, ...(Array.isArray(entry.legs) ? entry.legs.flatMap((leg) => [leg.match, leg.market, leg.selection]) : [])].some((value) => String(value).toLocaleLowerCase('pt-BR').includes(term)))
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
        <td class="match-cell" data-label="Partida"><strong>${escapeHtml(entry.match)}</strong><small><b>Competição</b>${escapeHtml(entry.competition)}</small>${entry.source === 'screenshot' ? '<span class="source-pill">via print</span>' : ''}</td>
        <td data-label="Mercado">${Array.isArray(entry.legs) && entry.legs.length > 1 ? `<span class="bet-legs-count">Múltipla · ${entry.legs.length} seleções</span>` : escapeHtml(entry.legs?.[0]?.market || entry.market)}</td>
        <td data-label="Seleção">${Array.isArray(entry.legs) && entry.legs.length ? `<div class="bet-legs-list">${entry.legs.map((leg, index) => `<span><b>${index + 1}. ${escapeHtml(leg.selection || '—')}</b>${leg.match ? `<small class="leg-match">${escapeHtml(leg.match)}</small>` : ''}<small>${escapeHtml(leg.market || 'Mercado não identificado')}</small></span>`).join('')}</div>` : escapeHtml(entry.selection)}</td>
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

  function legTemplate(leg = {}, index = 0) {
    return `<div class="entry-leg" data-leg-index="${index}">
      <label class="entry-leg-match-field"><span>Partida desta seleção</span><input class="entry-leg-match" type="text" maxlength="120" placeholder="Ex.: Atlético de Madrid x Osasuna" value="${escapeHtml(leg.match || '')}"></label>
      <label><span>Mercado / jogador</span><input class="entry-leg-market" type="text" maxlength="120" required placeholder="Ex.: Jonathan David — Chutes no gol" value="${escapeHtml(leg.market || '')}"></label>
      <label><span>Seleção</span><input class="entry-leg-selection" type="text" maxlength="80" required placeholder="Ex.: 1+" value="${escapeHtml(leg.selection || '')}"></label>
      <button class="entry-leg-remove" type="button" aria-label="Remover seleção" title="Remover seleção">×</button>
    </div>`;
  }

  function setEntryLegs(legs) {
    const normalized = Array.isArray(legs) && legs.length ? legs : [{ market: '', selection: '' }];
    byId('entryLegs').innerHTML = normalized.map(legTemplate).join('');
    updateLegRemoveButtons();
  }

  function updateLegRemoveButtons() {
    const rows = [...byId('entryLegs').querySelectorAll('.entry-leg')];
    rows.forEach((row) => { row.querySelector('.entry-leg-remove').disabled = rows.length === 1; });
  }

  function addEntryLeg(leg = {}) {
    const index = byId('entryLegs').children.length;
    byId('entryLegs').insertAdjacentHTML('beforeend', legTemplate(leg, index));
    updateLegRemoveButtons();
  }

  function collectEntryLegs() {
    return [...byId('entryLegs').querySelectorAll('.entry-leg')].map((row) => ({
      match: row.querySelector('.entry-leg-match')?.value.trim() || '',
      market: row.querySelector('.entry-leg-market').value.trim(),
      selection: row.querySelector('.entry-leg-selection').value.trim()
    })).filter((leg) => leg.market || leg.selection || leg.match);
  }

  function resetSlipReader() {
    selectedSlipFile = null;
    byId('slipImageInput').value = '';
    byId('slipPreview').src = '';
    byId('slipPreview').hidden = true;
    byId('slipDropzoneCopy').hidden = false;
    byId('changeSlipImageButton').hidden = true;
    byId('analyzeSlipButton').disabled = true;
    byId('slipReaderStatus').hidden = true;
    byId('slipReaderReview').hidden = true;
  }

  function setSlipFile(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      window.alert('Escolha uma imagem PNG, JPG ou WEBP.'); return;
    }
    if (file.size > 12 * 1024 * 1024) { window.alert('O print é muito grande. Use uma imagem de até 12 MB.'); return; }
    selectedSlipFile = file;
    const url = URL.createObjectURL(file);
    byId('slipPreview').src = url;
    byId('slipPreview').onload = () => URL.revokeObjectURL(url);
    byId('slipPreview').hidden = false;
    byId('slipDropzoneCopy').hidden = true;
    byId('changeSlipImageButton').hidden = false;
    byId('analyzeSlipButton').disabled = false;
    byId('slipReaderReview').hidden = true;
  }

  function applySlipData(data) {
    // Cada nova leitura substitui o que estava no formulário. Assim um OCR parcial
    // nunca reaproveita odd, stake, partida ou seleções de uma aposta anterior.
    byId('entryCompetition').value = '';
    byId('entryMatch').value = '';
    byId('entryOdd').value = '';
    byId('entryStake').value = '';
    setEntryLegs([{ match: '', market: '', selection: '' }]);

    if (data.date) byId('entryDate').value = data.date;
    if (data.competition) byId('entryCompetition').value = data.competition;
    if (data.match) byId('entryMatch').value = data.match;
    if (data.odd && data.odd > 1) byId('entryOdd').value = data.odd;
    if (data.stake && data.stake > 0) byId('entryStake').value = data.stake;
    if (Array.isArray(data.legs) && data.legs.length) setEntryLegs(data.legs);
    entrySource = 'screenshot';
    updateStakeRisk();
    const missing = [];
    if (!data.match) missing.push('partida/resumo');
    if (!data.competition) missing.push('competição');
    if (!data.odd) missing.push('odd');
    if (!data.stake) missing.push('stake');
    if (!data.legs?.length) missing.push('seleções');
    if (data.expectedLegs && (data.legs?.length || 0) < data.expectedLegs) missing.push(`o print parece ter ${data.expectedLegs} seleções, mas ${data.legs?.length || 0} foram reconhecidas`);
    const incompleteLegs = (data.legs || []).filter((leg) => !leg.market || !leg.selection).length;
    if (incompleteLegs) missing.push(`${incompleteLegs} seleção(ões) incompleta(s)`);
    const house = data.bookmaker ? ` Casa identificada: ${data.bookmaker}.` : '';
    byId('slipReaderReviewText').textContent = missing.length
      ? `${house} Confira especialmente: ${missing.join(', ')}. A leitura por IA pode ter incertezas; corrija qualquer campo antes de salvar.`.trim()
      : `${house} Foram identificadas ${data.legs.length} ${data.legs.length === 1 ? 'seleção' : 'seleções'}, odd ${decimal.format(data.odd)} e stake ${currency.format(data.stake)}. Confira e salve.`.trim();
    byId('slipReaderReview').hidden = false;
  }

  function openEntryDialog(entry) {
    byId('entryForm').reset();
    byId('entryId').value = entry?.id || '';
    byId('entryDialogTitle').textContent = entry ? 'Editar entrada' : 'Nova entrada';
    byId('entryDate').value = entry?.date || new Date().toISOString().slice(0, 10);
    byId('entryCompetition').value = entry?.competition || '';
    byId('entryMatch').value = entry?.match || '';
    setEntryLegs(Array.isArray(entry?.legs) && entry.legs.length ? entry.legs : [{ market: entry?.market || '', selection: entry?.selection || '' }]);
    byId('entryOdd').value = entry?.odd || '';
    byId('entryStake').value = entry?.stake || '';
    byId('entryResult').value = entry?.result || 'pending';
    entrySource = entry?.source || 'manual';
    resetSlipReader();
    byId('slipReaderBody').hidden = true;
    byId('toggleSlipReaderButton').textContent = 'Ler print da aposta';
    updateStakeRisk();
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
      odd: /^\d+(?:\.\d+)?$/.test(params.get('odd') || '') && Number.isFinite(Number(params.get('odd'))) && Number(params.get('odd')) > 1 ? params.get('odd') : '',
      result: 'pending'
    });
    history.replaceState(null, '', location.pathname);
  }

  byId('initialBankrollButton').addEventListener('click', openInitialDialog);
  byId('setupNoticeButton').addEventListener('click', openInitialDialog);
  byId('newEntryButton').addEventListener('click', () => openEntryDialog());
  byId('firstEntryButton').addEventListener('click', () => openEntryDialog());
  byId('entryStake').addEventListener('input', updateStakeRisk);
  byId('addEntryLegButton').addEventListener('click', () => addEntryLeg());
  byId('entryLegs').addEventListener('click', (event) => {
    const remove = event.target.closest('.entry-leg-remove');
    if (!remove || remove.disabled) return;
    remove.closest('.entry-leg').remove(); updateLegRemoveButtons();
  });
  byId('toggleSlipReaderButton').addEventListener('click', () => {
    const body = byId('slipReaderBody');
    body.hidden = !body.hidden;
    byId('toggleSlipReaderButton').textContent = body.hidden ? 'Ler print da aposta' : 'Fechar leitor';
  });
  byId('slipDropzone').addEventListener('click', () => byId('slipImageInput').click());
  byId('slipDropzone').addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); byId('slipImageInput').click(); } });
  byId('changeSlipImageButton').addEventListener('click', () => byId('slipImageInput').click());
  byId('slipImageInput').addEventListener('change', (event) => setSlipFile(event.target.files?.[0]));
  ['dragenter', 'dragover'].forEach((name) => byId('slipDropzone').addEventListener(name, (event) => { event.preventDefault(); byId('slipDropzone').classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach((name) => byId('slipDropzone').addEventListener(name, (event) => { event.preventDefault(); byId('slipDropzone').classList.remove('is-dragging'); }));
  byId('slipDropzone').addEventListener('drop', (event) => setSlipFile(event.dataTransfer?.files?.[0]));
  byId('analyzeSlipButton').addEventListener('click', async () => {
    if (!selectedSlipFile || !window.BankrollSlipReader) return;
    const button = byId('analyzeSlipButton');
    button.disabled = true;
    byId('slipReaderStatus').hidden = false;
    byId('slipReaderReview').hidden = true;
    byId('slipReaderStatusTitle').textContent = 'Enviando para análise por IA…';
    byId('slipReaderStatusText').textContent = 'A IA vai identificar jogos, mercados, seleções, odd e stake.';
    try {
      const data = await window.BankrollSlipReader.analyze(selectedSlipFile, (progress) => {
        byId('slipReaderStatusTitle').textContent = progress < 70 ? 'Analisando o bilhete com IA…' : 'Organizando as seleções…';
        byId('slipReaderStatusText').textContent = `Processamento: ${progress}%`;
      });
      applySlipData(data);
      byId('slipReaderStatus').hidden = true;
    } catch (error) {
      byId('slipReaderStatusTitle').textContent = 'Não consegui ler este print';
      byId('slipReaderStatusText').textContent = error?.message || 'Tente outro print ou preencha manualmente.';
    } finally { button.disabled = false; }
  });
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
    const legs = collectEntryLegs();
    if (!legs.length || legs.some((leg) => !leg.market || !leg.selection)) { window.alert('Confira as seleções da aposta antes de salvar.'); return; }
    store.upsertEntry({ id: byId('entryId').value || undefined, date: byId('entryDate').value, competition: byId('entryCompetition').value, match: byId('entryMatch').value, market: legs.map((leg) => leg.market).join(' | '), selection: legs.map((leg) => leg.selection).join(' | '), legs, source: entrySource, odd: byId('entryOdd').value, stake: byId('entryStake').value, result: byId('entryResult').value });
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
