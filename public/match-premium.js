(function () {
  const baseRender = render;
  const number = (stats, label) => {
    const raw = stats?.find(item => item.type === label)?.value;
    const parsed = Number.parseFloat(String(raw ?? '').replace('%', ''));
    return Number.isFinite(parsed) ? parsed : null;
  };
  const display = value => value == null ? '—' : Number(value).toFixed(Number.isInteger(value) ? 0 : 1);
  const pair = (label, home, away, fixture) => `<article class="premium-metric"><small>${label}</small><div class="premium-pair"><span><b>${display(home)}</b><em>${safe(fixture.teams.home.name)}</em></span><i></i><span><b>${display(away)}</b><em>${safe(fixture.teams.away.name)}</em></span></div></article>`;
  const venueText = fixture => [fixture.fixture.venue?.name, fixture.fixture.venue?.city].filter(Boolean).map(safe).join(' · ');
  const leagueText = fixture => cpLeagueDisplayName(fixture.league);
  const roundText = fixture => String(fixture.league.round || '').replace(/^Regular Season\s*-?\s*(\d+)$/i, 'Temporada Regular · Rodada $1').replace(/^Round\s*(\d+)$/i, 'Rodada $1');
  const confidenceBadge = value => `<span class="quick-confidence" title="Classificação baseada na quantidade de estatísticas recentes disponíveis.">Confiança: <b>${value}</b></span>`;

  function enhanceBase(d) {
    const fixture = d.fixture;
    const home = d.statistics[0]?.statistics || [];
    const away = d.statistics[1]?.statistics || [];
    const date = new Date(fixture.fixture.date);
    const active = liveS.includes(fixture.fixture.status.short);
    document.querySelector('.top')?.insertAdjacentHTML('afterend', `<nav class="match-breadcrumb" aria-label="Navegação estrutural"><span>Partidas</span><i>›</i><span>${safe(cpLeagueDisplayName(fixture.league))}</span><i>›</i><strong>${safe(fixture.teams.home.name)} x ${safe(fixture.teams.away.name)}</strong></nav>`);
    const statusLabel = active ? `AO VIVO ${fixture.fixture.status.elapsed || ''}'` : fixture.fixture.status.short === 'FT' ? 'ENCERRADO' : 'PRÉ-JOGO';
    document.getElementById('hero').innerHTML = `<div class="hero-kicker"><div class="comp">${safe(leagueText(fixture))} · ${safe(roundText(fixture))}</div><span class="match-status ${active ? 'live' : ''}">${statusLabel}</span></div><div class="teams"><div class="team"><img src="${safe(fixture.teams.home.logo)}" alt="Escudo ${safe(fixture.teams.home.name)}"><div>${safe(fixture.teams.home.name)}</div></div><div><div class="score">${active || fixture.fixture.status.short === 'FT' ? `${fixture.goals.home ?? 0} — ${fixture.goals.away ?? 0}` : '—'}</div><div class="state">${date.toLocaleDateString('pt-BR')} · ${date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div></div><div class="team"><img src="${safe(fixture.teams.away.logo)}" alt="Escudo ${safe(fixture.teams.away.name)}"><div>${safe(fixture.teams.away.name)}</div></div></div><div class="hero-meta">${venueText(fixture) ? `<span>⌖ ${venueText(fixture)}</span>` : ''}${fixture.league.country ? `<span>${safe(fixture.league.country)}</span>` : ''}</div>`;
    const metrics = [
      pair('Posse de bola', number(home,'Ball Possession'), number(away,'Ball Possession'), fixture),
      pair('Finalizações totais', number(home,'Total Shots'), number(away,'Total Shots'), fixture),
      pair('Finalizações no gol', number(home,'Shots on Goal'), number(away,'Shots on Goal'), fixture),
      pair('Escanteios', number(home,'Corner Kicks'), number(away,'Corner Kicks'), fixture)
    ].join('');
    const quick = liveQuickRead(fixture, home, away);
    document.getElementById('overview').insertAdjacentHTML('afterbegin', `<section class="premium-overview"><div class="metric-strip">${metrics}</div><aside class="quick-read" id="quickRead"><h2>Leitura rápida</h2>${quick}</aside></section>`);
    enhanceEvents(d);
    enhanceLineups(d);
    enrichHistorical(fixture);
  }

  const eventIcon = event => {
    const text = `${event.type || ''} ${event.detail || ''}`.toLowerCase();
    if (text.includes('goal') || text.includes('gol')) return '⚽';
    if (text.includes('yellow')) return '🟨';
    if (text.includes('red')) return '🟥';
    if (text.includes('subst')) return '↻';
    if (text.includes('var')) return 'VAR';
    if (text.includes('penalty')) return 'P';
    return '•';
  };
  function enhanceEvents(d) {
    const box = document.getElementById('events');
    if (!box) return;
    if (!d.events.length) {
      box.innerHTML = '<article class="card event-empty"><span>◷</span><h2>Nenhum evento registrado ainda</h2><p>Os eventos da partida aparecerão aqui conforme forem disponibilizados.</p></article>';
      return;
    }
    box.innerHTML = `<article class="card timeline-card"><div class="section-heading"><div><small>ACONTECIMENTOS</small><h2>Linha do tempo</h2></div><span>${d.events.length} eventos</span></div><div class="match-timeline">${d.events.map(event => `<div class="timeline-event"><time>${event.time.elapsed}'${event.time.extra ? `+${event.time.extra}` : ''}</time><span class="timeline-icon">${eventIcon(event)}</span><div><strong>${safe(event.player?.name || event.team?.name)}</strong><small>${safe(event.detail || event.type)}${event.team?.name ? ` · ${safe(event.team.name)}` : ''}</small></div></div>`).join('')}</div></article>`;
  }
  function enhanceLineups(d) {
    const box = document.getElementById('lineups');
    if (!box || !d.lineups.length) return;
    box.querySelectorAll('.card').forEach((card, index) => {
      card.classList.add('lineup-card');
      const lineup = d.lineups[index];
      const heading = card.querySelector('h2');
      if (heading) heading.innerHTML = `<span>${safe(lineup.team.name)}</span>${lineup.formation ? `<b>${safe(lineup.formation)}</b>` : ''}`;
      card.querySelectorAll('.player').forEach(player => {
        const position = player.querySelector('.green');
        if (position) position.textContent = translatePosition(position.textContent);
      });
    });
  }
  function translatePosition(position) {
    const labels = { G:'Goleiro', Goalkeeper:'Goleiro', D:'Defensor', Defender:'Defensor', M:'Meia', Midfielder:'Meia', F:'Atacante', Forward:'Atacante', Attacker:'Atacante' };
    return labels[String(position || '').trim()] || position || '—';
  }

  async function enrichHistorical(fixture) {
    try {
      const [analysisResponse, advancedResponse] = await Promise.all([
        fetch(`/api/partidas/${id}/analise?sample=5`),
        fetch(`/api/partidas/${id}/estatisticas-avancadas?sample=5`)
      ]);
      if (!analysisResponse.ok || !advancedResponse.ok) return;
      const analysis = await analysisResponse.json();
      const advanced = await advancedResponse.json();
      const homeGoals = trend(analysis.homeRecent, fixture.teams.home.id, 0);
      const awayGoals = trend(analysis.awayRecent, fixture.teams.away.id, 0);
      const homeShots = shotTrend(advanced.home);
      const awayShots = shotTrend(advanced.away);
      const homeCorners = cornerTrend(advanced.home);
      const awayCorners = cornerTrend(advanced.away);
      const strip = document.querySelector('.premium-overview .metric-strip');
      if (!strip) return;
      strip.innerHTML = [
        pair('Média de gols marcados', homeGoals.scored, awayGoals.scored, fixture),
        pair('Média de gols sofridos', homeGoals.conceded, awayGoals.conceded, fixture),
        pair('Finalizações totais', homeShots.total, awayShots.total, fixture),
        pair('Finalizações no gol', homeShots.on, awayShots.on, fixture)
      ].join('');
      const leader = homeGoals.scored === awayGoals.scored ? null : homeGoals.scored > awayGoals.scored ? fixture.teams.home : fixture.teams.away;
      const cornerPeak = Math.max(homeCorners.total, awayCorners.total);
      const confidence = Math.min(analysis.homeRecent.length, analysis.awayRecent.length, advanced.home.length, advanced.away.length) >= 5 ? 'Alta' : 'Moderada';
      const items = [
        leader ? [`${safe(leader.name)} apresenta maior média ofensiva`, `Comparação dos últimos 5 jogos disponíveis`, false] : ['Médias ofensivas equilibradas', 'Comparação dos últimos 5 jogos disponíveis', false],
        [cornerPeak >= 8 ? 'Alta frequência de escanteios' : cornerPeak >= 6 ? 'Frequência moderada de escanteios' : 'Baixa frequência de escanteios', `Maior média total: ${display(cornerPeak)} por partida`, cornerPeak < 8],
        [Math.max(homeGoals.over15, awayGoals.over15) >= 80 ? 'Alta frequência no mercado de gols' : 'Mercado de gols moderado', `Frequência histórica máxima de ${display(Math.max(homeGoals.over15, awayGoals.over15))}%`, true]
      ];
      const quick = document.getElementById('quickRead');
      if (quick) quick.innerHTML = `<h2>Leitura rápida</h2>${items.map(([title, subtitle, warn]) => `<div class="quick-item"><span class="quick-icon ${warn ? 'warning' : ''}">${warn ? '!' : '↗'}</span><span><strong>${title}</strong><small>${subtitle}</small></span></div>`).join('')}${confidenceBadge(confidence)}`;
    } catch (_) {
      /* A visão ao vivo permanece disponível se o histórico estiver indisponível. */
    }
  }

  function liveQuickRead(fixture, home, away) {
    const hs = number(home,'Total Shots'), as = number(away,'Total Shots');
    const hc = number(home,'Corner Kicks'), ac = number(away,'Corner Kicks');
    const items = [];
    if (hs != null && as != null) {
      const leader = hs === as ? 'Equilíbrio ofensivo' : `${safe(hs > as ? fixture.teams.home.name : fixture.teams.away.name)} mais ofensivo`;
      items.push([leader, `${display(Math.max(hs,as))} finalizações até agora`, false]);
    }
    if (hc != null && ac != null) items.push([hc + ac >= 8 ? 'Alta frequência de escanteios' : 'Escanteios em ritmo moderado', `${display(hc + ac)} escanteios na partida`, hc + ac < 8]);
    if (!items.length) items.push(['Aguardando dados ao vivo','A leitura será atualizada quando a competição fornecer estatísticas.',true]);
    return items.map(([title,subtitle,warn]) => `<div class="quick-item"><span class="quick-icon ${warn?'warning':''}">${warn?'!':'↗'}</span><span><strong>${title}</strong><small>${subtitle}</small></span></div>`).join('') + confidenceBadge(detailedCoverage(home,away));
  }
  function detailedCoverage(home, away) {
    const filled = ['Ball Possession','Total Shots','Shots on Goal','Corner Kicks'].filter(label => number(home,label) != null && number(away,label) != null).length;
    return filled >= 4 ? 'Alta' : filled >= 2 ? 'Moderada' : 'Baixa';
  }

  render = function (d) {
    baseRender(d);
    document.querySelector('.match-breadcrumb')?.remove();
    enhanceBase(d);
  };

  if (typeof renderPlayers === 'function') {
    const basePlayersRender = renderPlayers;
    renderPlayers = function () {
      basePlayersRender();
      const players = document.getElementById('players');
      players?.querySelectorAll('.ranking-player small').forEach(label => { label.textContent = translatePosition(label.textContent); });
      const presenceRows = [];
      players?.querySelectorAll('.sector-confidence div').forEach((item, index) => {
        const value = Number.parseInt(item.querySelector('b')?.textContent || '', 10);
        const labels = ['Goleiros', 'Defensores', 'Meias', 'Atacantes'];
        presenceRows.push({ label: labels[index], value: Number.isFinite(value) && value > 0 ? value : null });
      });
      players?.querySelectorAll('.stat-menu span').forEach(chip => chip.setAttribute('aria-label', `Mostrar ${chip.textContent.trim()}`));
      const shell = players?.querySelector('.lineup-shell');
      const sidebar = shell?.querySelector('.sector-confidence');
      const totalBar = players?.querySelector('.confidence-total');
      const total = Number.parseInt(totalBar?.textContent || '', 10);
      if (shell && presenceRows.length) {
        sidebar?.remove();
        totalBar?.remove();
        const validTotal = Number.isFinite(total) && total > 0 ? total : null;
        const level = validTotal == null ? 'Dados insuficientes' : validTotal < 40 ? 'Baixa' : validTotal < 70 ? 'Moderada' : 'Alta';
        const rows = presenceRows.map(row => `<div class="presence-row"><span>${row.label}</span><div class="presence-track"><i style="width:${row.value ?? 0}%"></i></div><b>${row.value == null ? 'Dados insuficientes' : `${row.value}%`}</b></div>`).join('');
        shell.insertAdjacentHTML('afterend', `<section class="presence-card"><div class="presence-heading"><div><small>ELENCO PROVÁVEL</small><h3>Presença dos principais jogadores</h3></div><div class="presence-summary ${validTotal == null ? 'unknown' : level.toLowerCase()}"><span>Presença geral</span><b>${validTotal == null ? '—' : `${validTotal}%`}</b><small>${validTotal == null ? level : `${level} presença entre os principais jogadores`}</small></div></div><div class="presence-list">${rows}</div></section>`);
      }
    };
  }
  if (typeof showPlayerRanking === 'function') {
    const baseShowPlayerRanking = showPlayerRanking;
    showPlayerRanking = function (label) {
      baseShowPlayerRanking(label);
      document.querySelectorAll('#players .ranking-player small').forEach(position => {
        position.textContent = translatePosition(position.textContent);
      });
    };
  }
})();
