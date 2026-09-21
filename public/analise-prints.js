(async function () {
  'use strict';

  const MAX_FILES = 8;
  const CACHE_KEY = 'centralPro.matchPrintAnalyses.v1';
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const state = { files: [], token: '', analysis: null };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const elements = {
    access: $('accessState'), workspace: $('analyzerWorkspace'), input: $('printsInput'), dropzone: $('printsDropzone'),
    preview: $('previewGrid'), clear: $('clearPrints'), add: $('addMorePrints'), analyze: $('analyzePrints'),
    hint: $('matchHint'), status: $('analysisStatus'), result: $('resultPanel'), toast: $('toast')
  };

  function toast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => elements.toast.classList.remove('show'), 2600);
  }

  function status(message, type = '') {
    elements.status.textContent = message || '';
    elements.status.className = `analysis-status${type ? ` ${type}` : ''}`;
    elements.status.hidden = !message;
  }

  function releaseFile(item) {
    if (item?.url) URL.revokeObjectURL(item.url);
  }

  function renderPreviews() {
    elements.preview.hidden = !state.files.length;
    elements.preview.style.display = state.files.length ? 'grid' : '';
    elements.preview.innerHTML = state.files.map((item, index) => `<div class="preview-item"><img src="${esc(item.url)}" alt="Print ${index + 1}"><span>Print ${index + 1}</span><button type="button" data-remove="${esc(item.id)}" aria-label="Remover print ${index + 1}">×</button></div>`).join('');
    elements.clear.hidden = !state.files.length;
    elements.add.hidden = !state.files.length || state.files.length >= MAX_FILES;
    elements.analyze.disabled = !state.files.length;
  }

  function addFiles(fileList) {
    const candidates = [...(fileList || [])];
    const errors = [];
    for (const file of candidates) {
      if (state.files.length >= MAX_FILES) { errors.push(`limite de ${MAX_FILES} imagens atingido`); break; }
      if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) { errors.push(`${file.name}: formato não suportado`); continue; }
      if (file.size > 10 * 1024 * 1024) { errors.push(`${file.name}: maior que 10 MB`); continue; }
      const duplicate = state.files.some(item => item.file.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified);
      if (duplicate) continue;
      state.files.push({ file, id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, url: URL.createObjectURL(file) });
    }
    renderPreviews();
    if (errors.length) status(errors.join(' · '), 'error');
    else if (state.files.length) status(`${state.files.length} print(s) pronto(s). A IA analisará todos como um único conjunto.`);
  }

  function clearFiles() {
    state.files.forEach(releaseFile);
    state.files = [];
    elements.input.value = '';
    elements.result.hidden = true;
    state.analysis = null;
    renderPreviews();
    status('');
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Não consegui abrir ${file.name}.`)); };
      image.src = url;
    });
  }

  function canvasBlob(canvas, quality) {
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível preparar uma das imagens.')), 'image/jpeg', quality));
  }

  function blobDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Não foi possível preparar uma das imagens.'));
      reader.readAsDataURL(blob);
    });
  }

  async function prepareImage(file) {
    const image = await loadImage(file);
    const canvas = document.createElement('canvas');
    let blob;
    let maxSide = 1800;
    while (maxSide >= 900) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.74, 0.62]) {
        blob = await canvasBlob(canvas, quality);
        if (blob.size <= 350 * 1024) break;
      }
      if (blob.size <= 350 * 1024 || maxSide === 900) break;
      maxSide = Math.max(900, Math.round(maxSide * 0.82));
    }
    return blobDataUrl(blob);
  }

  async function fileDigest(file) {
    const buffer = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buffer);
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function analysisKey() {
    const hashes = [];
    for (const item of state.files) hashes.push(await fileDigest(item.file));
    const raw = `v1|${elements.hint.value.trim()}|${hashes.join('|')}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function readCache(key) {
    try {
      const entries = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      return entries.find(entry => entry.key === key)?.analysis || null;
    } catch { return null; }
  }

  function saveCache(key, analysis) {
    try {
      const current = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      const entries = [{ key, analysis, savedAt: new Date().toISOString() }, ...current.filter(entry => entry.key !== key)].slice(0, 10);
      localStorage.setItem(CACHE_KEY, JSON.stringify(entries));
    } catch { /* A análise continua disponível mesmo se o navegador estiver sem espaço. */ }
  }

  function listHtml(items, empty = 'Nenhum dado suficiente nos prints.') {
    return Array.isArray(items) && items.length ? `<ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : `<p class="empty-copy">${esc(empty)}</p>`;
  }

  function evidenceHtml(section) {
    return `<div class="evidence-block favorable"><strong>O que favorece</strong>${listHtml(section?.favorable)}</div><div class="evidence-block contrary"><strong>O que vai contra</strong>${listHtml(section?.contrary)}</div><p class="section-conclusion">${esc(section?.conclusion || 'Sem conclusão segura com os dados disponíveis.')}</p>`;
  }

  function renderAnalysis(data, fromCache = false) {
    state.analysis = data;
    const match = [data?.match?.homeTeam, data?.match?.awayTeam].filter(Boolean).join(' × ') || elements.hint.value.trim() || 'Confronto não identificado';
    $('resultMatch').textContent = match;
    $('resultCompetition').textContent = data?.match?.competition || 'Competição não identificada nos prints';
    const quality = ['forte', 'moderada', 'fraca'].includes(data?.dataQuality) ? data.dataQuality : 'fraca';
    $('qualityBadge').className = `quality-badge ${quality}`;
    $('qualityBadge').textContent = `Dados: ${quality}`;
    $('generalReading').textContent = data?.generalReading || 'A IA não encontrou dados suficientes para uma leitura geral.';
    ['goals', 'firstHalf', 'result', 'cards'].forEach(key => {
      const target = document.querySelector(`[data-section="${key}"] .section-content`);
      if (target) target.innerHTML = evidenceHtml(data?.[key]);
    });
    $('contradictions').innerHTML = `<strong>Principais alertas</strong>${listHtml(data?.contradictions, 'Nenhuma contradição legível foi identificada.')}`;

    const markets = Array.isArray(data?.recommendedMarkets) ? data.recommendedMarkets : [];
    $('marketResults').innerHTML = markets.length ? markets.map((market, index) => `<article class="market-card"><div class="market-name"><span class="market-rank">${index + 1}</span><div><h3>${esc(market.market)}</h3><span class="strength-pill ${esc(market.strength)}">${esc(market.strength)}</span></div></div><div class="market-column"><strong>Evidências favoráveis</strong>${listHtml(market.favorableEvidence)}</div><div class="market-column"><strong>Evidências contrárias</strong>${listHtml(market.contraryEvidence)}</div><p class="market-risk"><b>Principal risco:</b> ${esc(market.mainRisk || 'Não informado.')}</p></article>`).join('') : '<article class="market-card"><div class="market-name"><div><h3>Nenhuma entrada sustentada</h3><p class="empty-copy">Os prints não deram base suficiente para recomendar um mercado.</p></div></div></article>';

    const players = Array.isArray(data?.players) ? data.players : [];
    $('playersResult').innerHTML = players.length ? players.map(player => `<div class="player-box"><strong>${esc(player.name)}</strong><div class="evidence-block favorable">${listHtml(player.favorable)}</div><div class="evidence-block contrary">${listHtml(player.contrary)}</div><p>${esc(player.conclusion)}</p></div>`).join('') : '<p class="empty-copy">Sem dados suficientes de jogadores nos prints.</p>';
    $('avoidMarkets').innerHTML = `<div class="avoid-list">${listHtml(data?.avoidMarkets, 'Nenhum mercado específico foi marcado.')}</div>`;
    $('finalConclusion').textContent = data?.finalConclusion || 'Sem conclusão segura com os prints enviados.';
    $('warnings').innerHTML = Array.isArray(data?.warnings) && data.warnings.length ? `<b>Avisos da leitura:</b> ${data.warnings.map(esc).join(' · ')}` : '';
    $('printEvidence').innerHTML = (data?.printEvidence || []).map(item => `<div class="print-evidence"><strong>Print ${Number(item.printNumber) || '—'}</strong>${listHtml(item.facts)}</div>`).join('') || '<p class="empty-copy">A IA não separou as evidências por print.</p>';
    elements.result.hidden = false;
    elements.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    status(fromCache ? 'Resultado recuperado do navegador. Nenhuma chamada de IA foi feita.' : 'Análise concluída e salva neste navegador.', 'success');
  }

  function sectionText(title, section) {
    return `${title}\nFavorável:\n${(section?.favorable || []).map(item => `- ${item}`).join('\n') || '- Sem dados'}\nContra:\n${(section?.contrary || []).map(item => `- ${item}`).join('\n') || '- Sem dados'}\nConclusão: ${section?.conclusion || 'Sem conclusão'}`;
  }

  function analysisToText(data) {
    const match = [data?.match?.homeTeam, data?.match?.awayTeam].filter(Boolean).join(' x ') || 'Confronto não identificado';
    const markets = (data?.recommendedMarkets || []).map((item, index) => `${index + 1}. ${item.market} [${item.strength}]\n   Favorável: ${(item.favorableEvidence || []).join(' · ') || 'Sem dados'}\n   Contra: ${(item.contraryEvidence || []).join(' · ') || 'Sem dados'}\n   Risco: ${item.mainRisk || 'Não informado'}`).join('\n');
    return `CENTRAL PRO — ANÁLISE POR PRINTS\n${match}${data?.match?.competition ? ` · ${data.match.competition}` : ''}\nQualidade dos dados: ${data?.dataQuality || 'fraca'}\n\nLEITURA GERAL\n${data?.generalReading || ''}\n\n${sectionText('GOLS', data?.goals)}\n\n${sectionText('PRIMEIRO TEMPO', data?.firstHalf)}\n\n${sectionText('RESULTADO E FORÇA', data?.result)}\n\n${sectionText('CARTÕES', data?.cards)}\n\nDADOS QUE VÃO CONTRA\n${(data?.contradictions || []).map(item => `- ${item}`).join('\n') || '- Nenhum identificado'}\n\nMERCADOS MAIS SUSTENTADOS\n${markets || 'Nenhuma entrada sustentada'}\n\nMERCADOS A EVITAR\n${(data?.avoidMarkets || []).map(item => `- ${item}`).join('\n') || '- Nenhum específico'}\n\nCONCLUSÃO\n${data?.finalConclusion || ''}`;
  }

  async function analyze() {
    if (!state.files.length || !state.token) return;
    elements.analyze.disabled = true;
    elements.result.hidden = true;
    try {
      status('Verificando se estes prints já foram analisados…');
      const key = await analysisKey();
      const cached = readCache(key);
      if (cached) return renderAnalysis(cached, true);
      const images = [];
      for (let index = 0; index < state.files.length; index += 1) {
        status(`Preparando os prints… ${index + 1}/${state.files.length}`);
        images.push(await prepareImage(state.files[index].file));
      }
      status('A IA está lendo todos os prints e procurando dados contrários…');
      const response = await fetch('/api/admin/analyze-match-prints', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: `Bearer ${state.token}` },
        body: JSON.stringify({ images, matchHint: elements.hint.value.trim() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Não foi possível analisar os prints.');
      saveCache(key, payload);
      renderAnalysis(payload, false);
    } catch (error) {
      status(error?.message || 'Não foi possível analisar os prints.', 'error');
    } finally {
      elements.analyze.disabled = !state.files.length;
    }
  }

  elements.dropzone.onclick = () => elements.input.click();
  elements.dropzone.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.input.click(); } };
  elements.input.onchange = () => { addFiles(elements.input.files); elements.input.value = ''; };
  elements.add.onclick = () => elements.input.click();
  elements.clear.onclick = clearFiles;
  elements.analyze.onclick = analyze;
  elements.preview.onclick = event => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    const index = state.files.findIndex(item => item.id === button.dataset.remove);
    if (index < 0) return;
    releaseFile(state.files[index]);
    state.files.splice(index, 1);
    renderPreviews();
    status(state.files.length ? `${state.files.length} print(s) pronto(s).` : '');
  };
  ['dragenter', 'dragover'].forEach(name => elements.dropzone.addEventListener(name, event => { event.preventDefault(); elements.dropzone.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach(name => elements.dropzone.addEventListener(name, event => { event.preventDefault(); elements.dropzone.classList.remove('is-dragging'); }));
  elements.dropzone.addEventListener('drop', event => addFiles(event.dataTransfer?.files));
  $('copyAnalysis').onclick = async () => {
    if (!state.analysis) return;
    try { await navigator.clipboard.writeText(analysisToText(state.analysis)); toast('Análise copiada.'); }
    catch { toast('Não consegui copiar automaticamente.'); }
  };

  try {
    for (let attempt = 0; attempt < 60 && !window.CentralProAuth; attempt += 1) await new Promise(resolve => setTimeout(resolve, 100));
    if (!window.CentralProAuth) {
      if (isLocal) {
        elements.access.hidden = true;
        elements.workspace.hidden = false;
        return;
      }
      throw new Error('Não foi possível carregar a autenticação.');
    }
    const { data } = await window.CentralProAuth.getSession();
    state.token = data.session?.access_token || '';
    if (!state.token && !isLocal) throw new Error('Faça login novamente para usar o analisador.');
    if (state.token) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch('/api/bilhetes/admin/status', { headers: { Authorization: `Bearer ${state.token}` }, cache: 'no-store', signal: controller.signal });
        const access = await response.json().catch(() => ({}));
        if (!access.admin && !isLocal) throw new Error('Esta ferramenta é exclusiva da conta administradora.');
      } catch (error) {
        if (!isLocal) throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    elements.access.hidden = true;
    elements.workspace.hidden = false;
  } catch (error) {
    elements.access.innerHTML = `<strong>${esc(error?.message || 'Acesso não autorizado.')}</strong><a href="bilhetes.html">Voltar para Bilhetes</a>`;
  }
}());
