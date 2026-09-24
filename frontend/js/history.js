/**
 * Lógica da Tela de Histórico e Auditoria de Desempenho - Bicho Analytics
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await api.checkSession();
  } catch (e) {
    console.warn('Check session error:', e);
  }
  updateHistoryAuthUI();

  // Carrega as seções de forma independente para que uma não trave as outras
  try {
    await loadLotteryRanking();
    await loadMetricsSummary();
  } catch (e) {
    console.error('Erro ao carregar resumo de métricas:', e);
  }

  try {
    await loadMetricsBySlot();
  } catch (e) {
    console.error('Erro ao carregar métricas por horário:', e);
  }

  try {
    await loadSnapshotsList();
  } catch (e) {
    console.error('Erro ao carregar lista de análises:', e);
  }

  setupHistoryEvents();
});

function updateHistoryAuthUI() {
  const badgeContainer = document.getElementById('user-badge-desktop');
  const navAdminLink = document.getElementById('nav-admin-link');
  const mobAdminLink = document.getElementById('mob-admin-link');
  const btnRecalc = document.getElementById('btn-recalculate-evals');
  const tenant = api.getCurrentTenant();

  if (tenant && tenant.role === 'admin') {
    if (navAdminLink) navAdminLink.classList.remove('hidden');
    if (mobAdminLink) mobAdminLink.classList.remove('hidden');
    if (btnRecalc) btnRecalc.classList.remove('hidden');
    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <div class="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-2.5 py-1 rounded-full font-bold shadow-sm">
          <span>👑</span>
          <span class="inline">K. Vinicius</span>
        </div>
      `;
    }
  } else {
    if (navAdminLink) navAdminLink.classList.add('hidden');
    if (mobAdminLink) mobAdminLink.classList.add('hidden');
    if (btnRecalc) btnRecalc.classList.add('hidden');
    if (badgeContainer && tenant) {
      badgeContainer.innerHTML = `
        <div class="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs px-2.5 py-1 rounded-full font-semibold shadow-sm">
          <span>👤</span>
          <span class="truncate max-w-[110px]" title="${tenant.name}">${tenant.name}</span>
        </div>
      `;
    } else if (badgeContainer) {
      badgeContainer.innerHTML = `
        <a href="/" class="text-xs font-semibold text-indigo-400 hover:text-indigo-300 px-2.5 py-1 rounded-lg border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors">
          Entrar
        </a>
      `;
    }
  }
}

function setupHistoryEvents() {
  const btnRecalc = document.getElementById('btn-recalculate-evals');
  if (btnRecalc) {
    btnRecalc.addEventListener('click', async () => {
      btnRecalc.disabled = true;
      btnRecalc.textContent = 'Recalculando...';
      try {
        const res = await api.recalculateEvaluations();
        showToast(res.message, 'success');
        await loadLotteryRanking();
    await loadMetricsSummary();
        await loadMetricsBySlot();
        await loadSnapshotsList();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnRecalc.disabled = false;
        btnRecalc.textContent = 'Recalcular Auditoria';
      }
    });
  }
}


// =========================================================================
// RANKING E IDENTIFICAÇÃO DE ASSERTIVIDADE POR LOTERIA
// =========================================================================

function getLotteryBadge(s) {
  let lot = (s.lottery || '').toUpperCase();
  if (!lot || lot === 'NULL') {
    const slot = String(s.target_slot || '').toUpperCase();
    if (slot.startsWith('LK-')) lot = 'LOOK';
    else if (slot.startsWith('SP-')) lot = 'SP';
    else if (slot.startsWith('LN-')) lot = 'NACIONAL';
    else if (slot === 'FED' || slot === 'FEDERAL') lot = 'FEDERAL';
    else lot = 'RJ';
  }

  if (lot === 'LOOK') {
    return `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase border border-emerald-500/40 flex items-center gap-1"><span>🌾</span> <span>LOOK</span></span>`;
  }
  if (lot === 'SP') {
    return `<span class="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-bold text-[10px] uppercase border border-purple-500/40 flex items-center gap-1"><span>🏙️</span> <span>SÃO PAULO</span></span>`;
  }
  if (lot === 'NACIONAL') {
    return `<span class="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold text-[10px] uppercase border border-cyan-500/40 flex items-center gap-1"><span>🇧🇷</span> <span>NACIONAL</span></span>`;
  }
  if (lot === 'FEDERAL') {
    return `<span class="px-2 py-0.5 rounded bg-amber-500/25 text-amber-300 font-bold text-[10px] uppercase border border-amber-500/50 flex items-center gap-1"><span>🏛️</span> <span>FEDERAL</span></span>`;
  }
  return `<span class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px] uppercase border border-amber-500/40 flex items-center gap-1"><span>🌴</span> <span>RIO (RJ)</span></span>`;
}

async function loadLotteryRanking() {
  const container = document.getElementById('lottery-ranking-container');
  if (!container) return;

  try {
    const list = await api.getMetricsByLottery();
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-500 col-span-full py-2 text-center">Nenhum dado avaliado ainda.</div>';
      return;
    }

    const medals = ['🥇', '🥈', '🥉', '4º', '5º'];

    container.innerHTML = list.map((item, idx) => {
      const medal = medals[idx] || `${idx + 1}º`;
      const isTop1 = idx === 0;
      const isSelected = activeHistoryLotteryFilter.toUpperCase() === item.lottery.toUpperCase();
      
      let borderStyle = isTop1 ? 'border-amber-500/50 bg-amber-500/5 shadow-md shadow-amber-500/10' : 'border-slate-800 bg-slate-900/60 hover:border-slate-700';
      if (isSelected) {
        borderStyle = 'border-indigo-500 bg-indigo-950/60 ring-2 ring-indigo-500/50 shadow-lg shadow-indigo-500/20';
      }

      return `
        <div onclick="setHistoryLotteryFilter('${item.lottery}')"
          class="p-3 rounded-2xl border transition-all cursor-pointer ${borderStyle} hover:scale-[1.02] active:scale-98 relative group">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-sm font-black">${medal}</span>
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${item.badge}">${item.lottery}</span>
          </div>
          <div class="text-xs font-black text-slate-100 truncate flex items-center gap-1">${item.emoji} ${item.name}</div>
          <div class="mt-2 flex items-baseline justify-between">
            <span class="text-[10px] text-slate-400">Taxa de Acerto:</span>
            <span class="text-sm font-black font-mono text-emerald-400">${item.hit_rate_pct}%</span>
          </div>
          <div class="flex items-baseline justify-between mt-0.5">
            <span class="text-[10px] text-slate-400">Score Médio:</span>
            <span class="text-xs font-bold font-mono text-amber-300">${item.average_score} pts</span>
          </div>
          <div class="text-[9px] text-slate-500 mt-1.5 flex items-center justify-between border-t border-slate-800/60 pt-1">
            <span>Extrações:</span>
            <span class="font-mono font-semibold text-slate-300">${item.total_hits}/${item.total_evals}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao carregar ranking de loterias:', err);
  }
}

async function loadMetricsSummary(lottery = null) {
  try {
    const lot = (lottery && lottery !== 'all') ? lottery : ((activeHistoryLotteryFilter && activeHistoryLotteryFilter !== 'all') ? activeHistoryLotteryFilter : null);
    const data = await api.getMetricsSummary(lot);

    setText('metric-total-evals', data.evaluated_snapshots);
    setText('metric-group-1st', `${data.group_1st_hit_rate}%`);
    setText('metric-group-cercado', `${data.group_cercado_hit_rate}%`);
    setText('metric-ten-1st', `${data.ten_1st_hit_rate}%`);
    setText('metric-hundred-1st', `${data.hundred_1st_hit_rate}%`);
    setText('metric-thousand-1st', `${data.thousand_1st_hit_rate}%`);
    setText('metric-avg-score', data.average_performance_score);
  } catch (err) {
    console.error('Erro ao carregar métricas gerais:', err);
  }
}

async function loadMetricsBySlot(lottery = null) {
  const container = document.getElementById('slot-metrics-container');
  if (!container) return;

  const lot = (lottery && lottery !== 'all') ? lottery : ((activeHistoryLotteryFilter && activeHistoryLotteryFilter !== 'all') ? activeHistoryLotteryFilter : null);

  // Atualiza título do quadro de horários
  const titleEl = document.getElementById('slot-metrics-title');
  if (titleEl) {
    const lotNames = {
      'LOOK': 'Look',
      'RJ': 'Rio de Janeiro',
      'NACIONAL': 'Loteria Nacional',
      'SP': 'São Paulo',
      'FEDERAL': 'Loteria Federal'
    };
    if (lot && lotNames[lot.toUpperCase()]) {
      titleEl.innerHTML = `Desempenho por Horário: <span class="text-indigo-400 font-bold">${lotNames[lot.toUpperCase()]}</span>`;
    } else {
      titleEl.textContent = 'Desempenho por Horário de Sorteio (Separado por Praça)';
    }
  }

  // Atualiza abas do quadro de horários
  const slotTabs = ['all', 'look', 'rj', 'nacional', 'sp', 'federal'];
  slotTabs.forEach((tabKey) => {
    const tabBtn = document.getElementById(`slot-tab-${tabKey}`);
    if (tabBtn) {
      const isAct = (lot && tabKey.toUpperCase() === lot.toUpperCase()) || (!lot && tabKey === 'all');
      if (isAct) {
        tabBtn.className = 'px-2.5 py-1 rounded-lg font-bold bg-indigo-600 text-white transition-all text-xs shadow-sm cursor-pointer';
      } else {
        tabBtn.className = 'px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 transition-all text-xs cursor-pointer';
      }
    }
  });

  try {
    const data = await api.getMetricsBySlot(lot);
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="text-slate-400 text-xs py-4 text-center">Nenhum dado por horário disponível para esta praça.</div>';
      return;
    }

    const lotteryMeta = {
      'LOOK': { name: 'Look Goiás', emoji: '🌾', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
      'RJ': { name: 'Rio de Janeiro', emoji: '🌴', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
      'NACIONAL': { name: 'Loteria Nacional', emoji: '🇧🇷', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
      'SP': { name: 'São Paulo', emoji: '🏙️', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
      'FEDERAL': { name: 'Loteria Federal', emoji: '🏛️', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    };

    const renderTableRows = (items) => items.map((item) => `
      <tr class="hover:bg-slate-800/40 transition-colors">
        <td class="py-2.5 px-3 font-bold text-indigo-300 font-mono flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full ${item.average_score >= 40 ? 'bg-emerald-400' : 'bg-indigo-400'}"></span>
          <span>${item.slot}</span>
        </td>
        <td class="py-2.5 px-3 text-center font-mono text-slate-200 font-semibold">${item.total_evals}</td>
        <td class="py-2.5 px-3 text-center font-bold ${item.group_1st_rate > 0 ? 'text-emerald-400' : 'text-slate-400'}">${item.group_1st_rate}%</td>
        <td class="py-2.5 px-3 text-center font-bold ${item.group_cercado_rate > 0 ? 'text-emerald-400' : 'text-slate-400'}">${item.group_cercado_rate}%</td>
        <td class="py-2.5 px-3 text-center font-bold ${item.ten_1st_rate > 0 ? 'text-emerald-400' : 'text-slate-400'}">${item.ten_1st_rate}%</td>
        <td class="py-2.5 px-3 text-center font-bold ${item.hundred_1st_rate > 0 ? 'text-cyan-400 font-bold' : 'text-slate-400'}">${item.hundred_1st_rate}%</td>
        <td class="py-2.5 px-3 text-right font-mono font-black ${item.average_score >= 40 ? 'text-emerald-400' : 'text-amber-300'}">${item.average_score} pts</td>
      </tr>
    `).join('');

    // Se uma loteria específica estiver selecionada
    if (lot && lot !== 'all') {
      const meta = lotteryMeta[lot.toUpperCase()] || { name: lot, emoji: '🎲', badge: 'bg-indigo-500/20 text-indigo-300' };
      container.innerHTML = `
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2">
          <div class="flex items-center justify-between pb-2 border-b border-slate-800/60">
            <span class="text-xs font-black text-slate-200 flex items-center gap-1.5">
              <span>${meta.emoji}</span> <span>${meta.name}</span>
              <span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${meta.badge}">${lot.toUpperCase()}</span>
            </span>
            <span class="text-[11px] text-slate-400 font-mono">${data.length} horários cadastrados</span>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse">
              <thead>
                <tr class="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th class="py-2.5 px-3">Horário</th>
                  <th class="py-2.5 px-3 text-center">Análises</th>
                  <th class="py-2.5 px-3 text-center">Grupo 1º</th>
                  <th class="py-2.5 px-3 text-center" title="Taxa de acertos do grupo entre o 1º e 5º prêmio">Grupo (1º ao 5º)</th>
                  <th class="py-2.5 px-3 text-center">Dezena 1º</th>
                  <th class="py-2.5 px-3 text-center">Centena 1º</th>
                  <th class="py-2.5 px-3 text-right">Score Médio</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                ${renderTableRows(data)}
              </tbody>
            </table>
          </div>
        </div>
      `;
      return;
    }

    // Se "Todas": exibe cada praça separada em seu próprio bloco!
    const grouped = {};
    data.forEach((item) => {
      let l = (item.lottery || '').toUpperCase();
      if (!l || l === 'NULL') {
        const slot = String(item.slot || '').toUpperCase();
        if (slot.startsWith('LK-')) l = 'LOOK';
        else if (slot.startsWith('SP-')) l = 'SP';
        else if (slot.startsWith('LN-')) l = 'NACIONAL';
        else if (slot === 'FED' || slot === 'FEDERAL') l = 'FEDERAL';
        else l = 'RJ';
      }
      if (!grouped[l]) grouped[l] = [];
      grouped[l].push(item);
    });

    const orderedLots = ['LOOK', 'RJ', 'SP', 'NACIONAL', 'FEDERAL'].filter((k) => grouped[k] && grouped[k].length > 0);

    container.innerHTML = `
      <div class="space-y-4">
        ${orderedLots
          .map((lotKey) => {
            const meta = lotteryMeta[lotKey] || { name: lotKey, emoji: '🎲', badge: 'bg-indigo-500/20 text-indigo-300' };
            const slots = grouped[lotKey];
            return `
            <div class="rounded-2xl border border-slate-800/90 bg-slate-900/40 p-3.5 space-y-2.5">
              <div class="flex items-center justify-between pb-2 border-b border-slate-800/60 flex-wrap gap-2">
                <span class="text-xs font-black text-slate-100 flex items-center gap-1.5">
                  <span class="text-base">${meta.emoji}</span>
                  <span>${meta.name}</span>
                  <span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${meta.badge}">${lotKey}</span>
                </span>
                <button type="button" onclick="setHistoryLotteryFilter('${lotKey}')" class="text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer">
                  Filtrar só ${meta.name} (${slots.length} horários) →
                </button>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th class="py-2 px-3">Horário</th>
                      <th class="py-2 px-3 text-center">Análises</th>
                      <th class="py-2 px-3 text-center">Grupo 1º</th>
                      <th class="py-2 px-3 text-center" title="Taxa de acertos do grupo entre o 1º e 5º prêmio">Grupo (1º ao 5º)</th>
                      <th class="py-2 px-3 text-center">Dezena 1º</th>
                      <th class="py-2 px-3 text-center">Centena 1º</th>
                      <th class="py-2 px-3 text-right">Score Médio</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-800/60">
                    ${renderTableRows(slots)}
                  </tbody>
                </table>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  } catch (err) {
    console.error('Erro ao carregar métricas por horário:', err);
    container.innerHTML = `<div class="text-xs text-rose-400 py-2">Erro ao carregar horários: ${err.message}</div>`;
  }
}

let allRawSnapshots = [];
let activeHistoryLotteryFilter = 'all'; // 'all', 'RJ', 'LOOK', 'NACIONAL', 'SP', 'FEDERAL'
let activeHistoryDateFilter = 'all'; // 'all', 'today', 'yesterday', or specific 'YYYY-MM-DD'
let activeHistoryScoreFilter = 'all'; // 'all', 'hits', 'strong', 'head'
let activeHistorySort = 'recent'; // 'recent', 'score_desc', 'score_asc'

async function loadSnapshotsList() {
  const container = document.getElementById('snapshots-timeline');
  if (!container) return;

  container.innerHTML = `
    <div class="card-glass p-8 text-center text-slate-400">
      <div class="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2"></div>
      <p class="text-xs">Carregando histórico de auditoria...</p>
    </div>
  `;

  try {
    allRawSnapshots = await api.getSnapshots(100, 0);
    renderFilteredSnapshots();
  } catch (err) {
    console.error('Erro ao carregar lista de análises:', err);
    container.innerHTML = `<p class="text-xs text-rose-400 py-6 text-center">Erro ao carregar auditorias: ${err.message}</p>`;
  }
}

function renderFilteredSnapshots() {
  const container = document.getElementById('snapshots-timeline');
  const countEl = document.getElementById('history-filter-count');
  if (!container) return;

  if (!allRawSnapshots || allRawSnapshots.length === 0) {
    if (countEl) countEl.textContent = '0 análises';
    container.innerHTML = `
      <div class="card-glass p-8 text-center text-slate-400">
        <p class="mb-2">Nenhuma análise congelada para auditoria ainda.</p>
        <a href="/" class="text-sm font-semibold text-indigo-400 hover:underline">Ir para a tela inicial e salvar uma análise</a>
      </div>`;
    return;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayDt = new Date();
  yesterdayDt.setDate(yesterdayDt.getDate() - 1);
  const yesterdayStr = yesterdayDt.toISOString().split('T')[0];

  // 1. Filtragem
  let filtered = allRawSnapshots.filter((s) => {
    // Filtro de Loteria
    if (activeHistoryLotteryFilter !== 'all') {
      let lot = (s.lottery || '').toUpperCase();
      if (!lot || lot === 'NULL') {
        const slot = String(s.target_slot || '').toUpperCase();
        if (slot.startsWith('LK-')) lot = 'LOOK';
        else if (slot.startsWith('SP-')) lot = 'SP';
        else if (slot.startsWith('LN-')) lot = 'NACIONAL';
        else if (slot === 'FED' || slot === 'FEDERAL') lot = 'FEDERAL';
        else lot = 'RJ';
      }
      if (lot !== activeHistoryLotteryFilter.toUpperCase()) return false;
    }

    // Filtro de Data
    if (activeHistoryDateFilter === 'today' && s.target_date !== todayStr) return false;
    if (activeHistoryDateFilter === 'yesterday' && s.target_date !== yesterdayStr) return false;
    if (activeHistoryDateFilter !== 'all' && activeHistoryDateFilter !== 'today' && activeHistoryDateFilter !== 'yesterday' && activeHistoryDateFilter) {
      if (s.target_date !== activeHistoryDateFilter) return false;
    }

    // Filtro de Pontuação
    const score = Number(s.hit_rate_score || 0);
    if (activeHistoryScoreFilter === 'hits' && score <= 0) return false;
    if (activeHistoryScoreFilter === 'strong' && score < 25) return false;
    if (activeHistoryScoreFilter === 'head') {
      const hasHeadHit = Boolean(s.acerto_grupo_1 || s.acerto_dezena_1 || s.acerto_centena_1 || s.acerto_milhar_1);
      if (!hasHeadHit) return false;
    }

    return true;
  });

  // 2. Ordenação
  if (activeHistorySort === 'score_desc') {
    filtered.sort((a, b) => (Number(b.hit_rate_score || 0) - Number(a.hit_rate_score || 0)) || b.target_date.localeCompare(a.target_date) || (b.id - a.id));
  } else if (activeHistorySort === 'score_asc') {
    filtered.sort((a, b) => (Number(a.hit_rate_score || 0) - Number(b.hit_rate_score || 0)) || b.target_date.localeCompare(a.target_date) || (b.id - a.id));
  } else {
    // 'recent' (cronológico mais recente primeiro)
    filtered.sort((a, b) => b.target_date.localeCompare(a.target_date) || (b.id - a.id));
  }

  // Atualiza contador
  if (countEl) {
    countEl.textContent = `Exibindo ${filtered.length} de ${allRawSnapshots.length} análises`;
  }

  // Estado Vazio com Filtro
  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card-glass p-8 text-center text-slate-400 space-y-2">
        <div class="text-3xl mb-1">🔍</div>
        <p class="text-sm font-bold text-slate-200">Nenhuma análise encontrada com os filtros selecionados.</p>
        <p class="text-xs text-slate-400">Tente selecionar "Todas as Datas" ou limpar o filtro de pontuação.</p>
        <div class="pt-2">
          <button type="button" onclick="resetHistoryFilters()" class="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all active:scale-95">
            Restaurar Todos os Filtros
          </button>
        </div>
      </div>`;
    return;
  }

  // 3. Renderização dos Cards
  container.innerHTML = filtered
    .map((s) => {
      const isEvaluated = s.status === 'EVALUATED';
      const score = Number(s.hit_rate_score || 0);
      const hasG1Hit = Boolean(s.acerto_grupo_1);
      const hasD1Hit = Boolean(s.acerto_dezena_1);
      const hasC1Hit = Boolean(s.acerto_centena_1);
      const hasM1Hit = Boolean(s.acerto_milhar_1);

      const isSuperScore = score >= 50;
      const isHighScore = score >= 25 && score < 50;
      const hasAnyHit = score > 0;

      // Destaque visual por intensidade de acertos
      let cardBorderClasses = 'border-slate-800 hover:border-indigo-500/40';
      if (isSuperScore) {
        cardBorderClasses = 'border-amber-500/60 bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 shadow-xl shadow-amber-500/10 ring-1 ring-amber-500/30';
      } else if (isHighScore) {
        cardBorderClasses = 'border-emerald-500/50 bg-gradient-to-r from-emerald-500/10 via-slate-900 to-slate-900 shadow-lg shadow-emerald-500/10';
      } else if (hasAnyHit) {
        cardBorderClasses = 'border-emerald-500/30 hover:border-emerald-500/50';
      }

      // Selo de Status / Pontuação
      const badgeHtml = isEvaluated
        ? `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
             <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Auditado
           </span>`
        : `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
             Aguardando Sorteio
           </span>`;

      const superBadge = isSuperScore
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-500/25 text-amber-300 border border-amber-500/40 animate-pulse">🔥 SUPER PONTUAÇÃO</span>`
        : '';

      let hitsSummary = '';
      if (isEvaluated) {
        hitsSummary = `
          <div class="flex flex-wrap items-center gap-1.5 mt-2">
            ${hasG1Hit ? '<span class="hit-tag-success px-2 py-0.5 rounded text-xs font-bold">🎯 Grupo na Cabeça</span>' : ''}
            ${s.acertos_grupo_cercado > 0 ? `<span class="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded text-xs font-semibold" title="Acerto em qualquer posição do 1º ao 5º prêmio">✨ ${s.acertos_grupo_cercado} Grupo(s) (1º ao 5º)</span>` : ''}
            ${hasD1Hit ? '<span class="hit-tag-success px-2 py-0.5 rounded text-xs font-bold">🔥 Dezena na Cabeça</span>' : ''}
            ${s.acertos_dezena_cercado > 0 ? `<span class="bg-indigo-950 text-indigo-300 border border-indigo-800 px-2 py-0.5 rounded text-xs font-semibold" title="Acerto em qualquer posição do 1º ao 5º prêmio">⚡ ${s.acertos_dezena_cercado} Dezena(s) (1º ao 5º)</span>` : ''}
            ${hasC1Hit ? '<span class="hit-tag-success px-2 py-0.5 rounded text-xs font-bold">💎 Centena na Cabeça!</span>' : ''}
            ${hasM1Hit ? '<span class="hit-tag-success px-2 py-0.5 rounded text-xs font-bold">👑 MILHAR NA CABEÇA!</span>' : ''}
            ${!hasG1Hit && (s.acertos_grupo_cercado || 0) === 0 && !hasD1Hit && (s.acertos_dezena_cercado || 0) === 0 ? '<span class="text-slate-500 text-xs py-0.5">Sem acerto nesta extração</span>' : ''}
          </div>
        `;
      }

      const scoreDisplay = isEvaluated
        ? `<div class="flex items-center gap-2">
             ${superBadge}
             <span class="text-base sm:text-lg font-black font-mono ${score >= 50 ? 'text-amber-400' : score > 0 ? 'text-emerald-400' : 'text-slate-500'}">
               ${score} pts
             </span>
           </div>`
        : '';

      return `
      <div class="card-glass p-3 sm:p-3.5 rounded-xl transition-all animate-fade-in mb-2.5 border ${cardBorderClasses}">
        <div class="flex items-center justify-between gap-3 mb-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-bold text-slate-100">${formatDateBR(s.target_date)}</span>
            ${getLotteryBadge(s)}
            <span class="px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300 font-bold text-xs font-mono border border-indigo-700/40">${s.target_slot}</span>
            ${badgeHtml}
          </div>
          <div class="text-right shrink-0">
            ${scoreDisplay}
          </div>
        </div>

        ${
          isEvaluated && s.prize_1
            ? `
          <div class="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-xs my-2 flex flex-wrap gap-2 justify-between items-center">
            <div>
              <span class="text-slate-400">Resultado Real:</span>
              <span class="font-mono font-bold text-amber-300 ml-1">1º ${s.prize_1}</span>
              ${s.prize_2 ? `<span class="font-mono text-slate-400 ml-1">| 2º ${s.prize_2} | 3º ${s.prize_3 || '-'}</span>` : ''}
            </div>
            <button onclick="inspectSnapshot(${s.id})" class="text-xs font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
              Conferência Detalhada
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        `
            : ''
        }

        ${hitsSummary}
      </div>`;
    })
    .join('');
}

window.setHistoryDateFilter = function(filterType) {
  activeHistoryDateFilter = filterType;

  const btnAll = document.getElementById('btn-date-all');
  const btnToday = document.getElementById('btn-date-today');
  const btnYesterday = document.getElementById('btn-date-yesterday');
  const inputCustom = document.getElementById('history-custom-date');

  const activeBtnClass = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm';
  const inactiveBtnClass = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 transition-all';

  if (btnAll) btnAll.className = filterType === 'all' ? activeBtnClass : inactiveBtnClass;
  if (btnToday) btnToday.className = filterType === 'today' ? activeBtnClass : inactiveBtnClass;
  if (btnYesterday) btnYesterday.className = filterType === 'yesterday' ? activeBtnClass : inactiveBtnClass;

  if (filterType !== 'custom' && inputCustom) {
    inputCustom.value = '';
  }

  renderFilteredSnapshots();
};

window.setHistoryCustomDate = function(dateVal) {
  if (!dateVal) return;
  activeHistoryDateFilter = dateVal;

  const btnAll = document.getElementById('btn-date-all');
  const btnToday = document.getElementById('btn-date-today');
  const btnYesterday = document.getElementById('btn-date-yesterday');
  const inactiveBtnClass = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-900 border border-slate-800 transition-all';

  if (btnAll) btnAll.className = inactiveBtnClass;
  if (btnToday) btnToday.className = inactiveBtnClass;
  if (btnYesterday) btnYesterday.className = inactiveBtnClass;

  renderFilteredSnapshots();
};

window.setHistoryScoreFilter = function(scoreType) {
  activeHistoryScoreFilter = scoreType;

  const scores = ['all', 'hits', 'strong', 'head'];
  scores.forEach((s) => {
    const btn = document.getElementById(`btn-score-${s}`);
    if (btn) {
      if (s === scoreType) {
        btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-all';
      }
    }
  });

  renderFilteredSnapshots();
};

window.setHistoryLotteryFilter = function(lotteryCode) {
  activeHistoryLotteryFilter = lotteryCode;

  const lotteries = ['all', 'rj', 'look', 'nacional', 'sp', 'federal'];
  lotteries.forEach((l) => {
    const btn = document.getElementById(`btn-lottery-${l}`);
    if (btn) {
      if (l.toUpperCase() === lotteryCode.toUpperCase() || (l === 'all' && lotteryCode === 'all')) {
        btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-all';
      }
    }
  });

  // Atualiza título do escopo das métricas
  const titleEl = document.getElementById('metrics-scope-title');
  if (titleEl) {
    const lotNames = {
      'LOOK': 'Look',
      'RJ': 'Rio de Janeiro',
      'NACIONAL': 'Loteria Nacional',
      'SP': 'São Paulo',
      'FEDERAL': 'Loteria Federal'
    };
    if (lotteryCode !== 'all' && lotNames[lotteryCode.toUpperCase()]) {
      titleEl.innerHTML = `Indicadores de Assertividade: <span class="text-indigo-400 font-bold">${lotNames[lotteryCode.toUpperCase()]}</span>`;
    } else {
      titleEl.textContent = 'Indicadores Globais de Assertividade (Todas as Loterias)';
    }
  }

  // Recarrega métricas e cards de ranking filtrados
  loadMetricsSummary(lotteryCode);
  loadLotteryRanking();
  loadMetricsBySlot(lotteryCode);
  renderFilteredSnapshots();
};

window.setHistorySortOrder = function(order) {
  activeHistorySort = order;
  renderFilteredSnapshots();
};

window.resetHistoryFilters = function() {
  activeHistoryLotteryFilter = 'all';
  activeHistoryDateFilter = 'all';
  activeHistoryScoreFilter = 'all';
  activeHistorySort = 'recent';

  const selectSort = document.getElementById('history-sort-order');
  if (selectSort) selectSort.value = 'recent';

  setHistoryLotteryFilter('all');
  setHistoryDateFilter('all');
  setHistoryScoreFilter('all');
};

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

window.inspectSnapshot = async function (id) {
  try {
    const data = await api.getSnapshotDetails(id);
    const modal = document.getElementById('snapshot-modal');
    const content = document.getElementById('snapshot-modal-content');
    if (!modal || !content) return;

    const preds = data.predictions || {};
    const evalDetails = data.evaluation_details || {};

    const topG = (preds.top_groups || []).map((g) => g.value).join(', ');
    const topD = (preds.top_tens || []).map((t) => t.value).join(', ');
    const topC = (preds.top_hundreds || []).map((c) => c.value).join(', ');
    const topM = (preds.top_thousands || []).map((m) => m.value).join(', ');

    // 1. Identificação precisa de origem dos pontos no Palpite de Grupos
    const actG1 = String(evalDetails.grupo?.actual_1st || '').padStart(2, '0');
    const hitG1 = Boolean(evalDetails.grupo?.hit_1st);
    const winningGroupItem = (preds.top_groups || []).find(
      (g) => String(g.value).padStart(2, '0') === actG1 || Number(g.value) === Number(evalDetails.grupo?.actual_1st)
    );

    let grupoOriginBadges = [];
    let grupoOriginDetails = [];

    if (hitG1 && winningGroupItem) {
      const isBichoDia = winningGroupItem.metadata?.cruz_do_dia?.is_bicho_dia || 
        (winningGroupItem.factors || []).some((f) => (f.name || '').toLowerCase().includes('bicho do dia'));
      
      const isPuxada = winningGroupItem.metadata?.puxada?.is_pulled ||
        (winningGroupItem.factors || []).some((f) => (f.name || '').toLowerCase().includes('puxada'));

      const isCruz = !isBichoDia && (winningGroupItem.metadata?.cruz_do_dia?.is_present ||
        (winningGroupItem.factors || []).some((f) => (f.name || '').toLowerCase().includes('cruz do dia')));

      if (isBichoDia) {
        grupoOriginBadges.push(
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm">👑 Bicho do Dia</span>`
        );
        grupoOriginDetails.push(
          `<div class="flex items-center gap-1.5 text-amber-300 font-semibold"><span class="text-sm leading-none">👑</span> <span>Bicho do Dia na Cruz do Dia (+35 pts no cálculo do algoritmo)</span></div>`
        );
      }

      if (isPuxada) {
        const pullName = winningGroupItem.metadata?.puxada?.pulled_by_name || '';
        const pullEmoji = winningGroupItem.metadata?.puxada?.pulled_by_emoji || '';
        grupoOriginBadges.push(
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 shadow-sm">⚡ Puxada Tradicional</span>`
        );
        grupoOriginDetails.push(
          `<div class="flex items-center gap-1.5 text-indigo-300 font-semibold"><span class="text-sm leading-none">⚡</span> <span>Puxada Tradicional do 1º Prêmio anterior ${pullEmoji ? `(${pullEmoji} ${pullName})` : ''} (+22 pts)</span></div>`
        );
      }

      if (isCruz) {
        grupoOriginBadges.push(
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-sm">✨ Cruz do Dia</span>`
        );
        grupoOriginDetails.push(
          `<div class="flex items-center gap-1.5 text-cyan-300 font-semibold"><span class="text-sm leading-none">✨</span> <span>Formado pelos Dígitos Cardeais da Cruz (+5 pts)</span></div>`
        );
      }

      // Outros fatores adicionais
      (winningGroupItem.factors || []).forEach((f) => {
        const fName = (f.name || '').toLowerCase();
        if (!fName.includes('bicho do dia') && !fName.includes('puxada') && !fName.includes('cruz do dia')) {
          if (f.impact_points >= 12) {
            grupoOriginDetails.push(
              `<div class="text-slate-300 text-[11px]">• <strong class="text-slate-200">${f.name}:</strong> ${f.description || `+${f.impact_points} pts`}</div>`
            );
          }
        }
      });
    }

    // 2. Identificação de origem para Dezenas
    const actD1 = String(evalDetails.dezena?.actual_1st || '').padStart(2, '0');
    const hitD1 = Boolean(evalDetails.dezena?.hit_1st);
    const winningTenItem = (preds.top_tens || []).find(
      (t) => String(t.value).padStart(2, '0') === actD1 || Number(t.value) === Number(evalDetails.dezena?.actual_1st)
    );

    let dezenaOriginBadges = [];
    let dezenaOriginDetails = [];
    if (hitD1 && winningTenItem) {
      const isBichoDiaTen = (winningTenItem.factors || []).some((f) => (f.name || '').toLowerCase().includes('bicho do dia'));
      const isCruzTen = !isBichoDiaTen && (winningTenItem.factors || []).some((f) => (f.name || '').toLowerCase().includes('cruz'));

      if (isBichoDiaTen) {
        dezenaOriginBadges.push(
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm">👑 Dezena do Bicho do Dia</span>`
        );
        dezenaOriginDetails.push(
          `<div class="text-amber-300 font-semibold flex items-center gap-1">👑 Dezena direta do Bicho do Dia (+14 pts)</div>`
        );
      } else if (isCruzTen) {
        dezenaOriginBadges.push(
          `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 shadow-sm">✨ Dezena da Cruz</span>`
        );
        dezenaOriginDetails.push(
          `<div class="text-cyan-300 font-semibold flex items-center gap-1">✨ Formada pelos dígitos da Cruz do Dia (+6 pts)</div>`
        );
      }
    }

    // 3. Identificação para Centenas
    const actC1 = String(evalDetails.centena?.actual_1st || '').padStart(3, '0');
    const hitC1 = Boolean(evalDetails.centena?.hit_1st);
    const winningCentenaItem = (preds.top_hundreds || []).find(
      (c) => String(c.value).padStart(3, '0') === actC1
    );
    let centenaOriginBadges = [];
    if (hitC1 && winningCentenaItem) {
      centenaOriginBadges.push(
        `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm">🎯 Acerto de Centena</span>`
      );
    }

    // 4. Identificação para Milhares
    const actM1 = String(evalDetails.milhar?.actual_1st || '').padStart(4, '0');
    const hitM1 = Boolean(evalDetails.milhar?.hit_1st);
    const winningMilharItem = (preds.top_thousands || []).find(
      (m) => String(m.value).padStart(4, '0') === actM1
    );
    let milharOriginBadges = [];
    if (hitM1 && winningMilharItem) {
      milharOriginBadges.push(
        `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-sm">👑 Acerto de Milhar</span>`
      );
    }

    content.innerHTML = `
      <div class="space-y-4 text-xs">
        <div class="p-3 bg-slate-900 rounded-lg border border-slate-800">
          <div class="font-bold text-slate-300 mb-1 text-sm">Resultado Ocorrido (${data.target_date} - ${data.target_slot})</div>
          <div class="grid grid-cols-5 gap-2 font-mono text-center">
            <div class="p-2 rounded bg-indigo-950/60 border border-indigo-800/60">
              <div class="text-[10px] text-slate-400">1º Prêmio</div>
              <div class="font-bold text-sm text-indigo-200">${data.prize_1}</div>
            </div>
            <div class="p-2 rounded bg-slate-800/80">
              <div class="text-[10px] text-slate-400">2º Prêmio</div>
              <div class="font-bold text-slate-200">${data.prize_2}</div>
            </div>
            <div class="p-2 rounded bg-slate-800/80">
              <div class="text-[10px] text-slate-400">3º Prêmio</div>
              <div class="font-bold text-slate-200">${data.prize_3}</div>
            </div>
            <div class="p-2 rounded bg-slate-800/80">
              <div class="text-[10px] text-slate-400">4º Prêmio</div>
              <div class="font-bold text-slate-200">${data.prize_4}</div>
            </div>
            <div class="p-2 rounded bg-slate-800/80">
              <div class="text-[10px] text-slate-400">5º Prêmio</div>
              <div class="font-bold text-slate-200">${data.prize_5}</div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <!-- Palpite de Grupos -->
          <div class="p-3 rounded-lg border ${hitG1 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-800/40'}">
            <div class="flex justify-between items-start font-bold mb-1">
              <span class="text-slate-200">Palpite de Grupos:</span>
              <div class="text-right">
                <span class="${hitG1 ? 'text-emerald-400' : 'text-slate-400'} block">
                  ${hitG1 ? '🎯 Acerto no 1º Prêmio' : 'Sem 1º prêmio'} (${evalDetails.grupo?.hits_cercado_count || 0} do 1º ao 5º)
                </span>
                ${grupoOriginBadges.length > 0 ? `<div class="mt-1 flex items-center justify-end gap-1.5 flex-wrap">${grupoOriginBadges.join('')}</div>` : ''}
              </div>
            </div>
            <div class="text-slate-300 font-mono">Grupos Analisados: [ <span class="text-indigo-300 font-bold">${topG}</span> ]</div>
            <div class="text-slate-400 mt-1">Grupo Ocorrido 1º: <b class="text-slate-100 font-mono font-bold">${evalDetails.grupo?.actual_1st || '-'}</b> | No 1º ao 5º: <span class="font-mono text-slate-300">${evalDetails.grupo?.actual_1_to_5?.join(', ') || '-'}</span></div>

            ${grupoOriginDetails.length > 0 ? `
              <div class="mt-2.5 pt-2 border-t border-emerald-500/25 bg-emerald-950/30 -mx-3 -mb-3 p-2.5 rounded-b-lg space-y-1">
                <div class="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Origem dos Pontos / Auditoria:</div>
                ${grupoOriginDetails.join('')}
              </div>
            ` : ''}
          </div>

          <!-- Palpite de Dezenas -->
          <div class="p-3 rounded-lg border ${hitD1 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-800/40'}">
            <div class="flex justify-between items-start font-bold mb-1">
              <span class="text-slate-200">Palpite de Dezenas:</span>
              <div class="text-right">
                <span class="${hitD1 ? 'text-emerald-400' : 'text-slate-400'} block">
                  ${hitD1 ? '🎯 Acerto no 1º Prêmio' : 'Sem 1º prêmio'} (${evalDetails.dezena?.hits_cercado_count || 0} do 1º ao 5º)
                </span>
                ${dezenaOriginBadges.length > 0 ? `<div class="mt-1 flex items-center justify-end gap-1.5 flex-wrap">${dezenaOriginBadges.join('')}</div>` : ''}
              </div>
            </div>
            <div class="text-slate-300 font-mono">Dezenas Analisadas: [ <span class="text-indigo-300 font-bold">${topD}</span> ]</div>
            <div class="text-slate-400 mt-1">Dezena Ocorrida 1º: <b class="text-slate-100 font-mono font-bold">${evalDetails.dezena?.actual_1st || '-'}</b></div>

            ${dezenaOriginDetails.length > 0 ? `
              <div class="mt-2.5 pt-2 border-t border-emerald-500/25 bg-emerald-950/30 -mx-3 -mb-3 p-2.5 rounded-b-lg space-y-1">
                <div class="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Origem dos Pontos / Auditoria:</div>
                ${dezenaOriginDetails.join('')}
              </div>
            ` : ''}
          </div>

          <!-- Palpite de Centenas -->
          <div class="p-3 rounded-lg border ${hitC1 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-800/40'}">
            <div class="flex justify-between items-start font-bold mb-1">
              <span class="text-slate-200">Palpite de Centenas:</span>
              <div class="text-right">
                <span class="${hitC1 ? 'text-emerald-400' : 'text-slate-400'} block">
                  ${hitC1 ? '🎯 Acerto no 1º Prêmio' : 'Sem 1º prêmio'}
                </span>
                ${centenaOriginBadges.length > 0 ? `<div class="mt-1 flex items-center justify-end gap-1.5 flex-wrap">${centenaOriginBadges.join('')}</div>` : ''}
              </div>
            </div>
            <div class="text-slate-300 font-mono">Centenas Analisadas: [ <span class="text-indigo-300 font-bold">${topC}</span> ]</div>
            <div class="text-slate-400 mt-1">Centena Ocorrida 1º: <b class="text-slate-100 font-mono font-bold">${evalDetails.centena?.actual_1st || '-'}</b></div>
          </div>

          <!-- Palpite de Milhares -->
          ${topM ? `
            <div class="p-3 rounded-lg border ${hitM1 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-800/40'}">
              <div class="flex justify-between items-start font-bold mb-1">
                <span class="text-slate-200">Palpite de Milhares:</span>
                <div class="text-right">
                  <span class="${hitM1 ? 'text-emerald-400' : 'text-slate-400'} block">
                    ${hitM1 ? '🎯 Acerto no 1º Prêmio' : 'Sem 1º prêmio'}
                  </span>
                  ${milharOriginBadges.length > 0 ? `<div class="mt-1 flex items-center justify-end gap-1.5 flex-wrap">${milharOriginBadges.join('')}</div>` : ''}
                </div>
              </div>
              <div class="text-slate-300 font-mono">Milhares Analisadas: [ <span class="text-indigo-300 font-bold">${topM}</span> ]</div>
              <div class="text-slate-400 mt-1">Milhar Ocorrida 1º: <b class="text-slate-100 font-mono font-bold">${evalDetails.milhar?.actual_1st || '-'}</b></div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    modal.classList.remove('hidden');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.closeSnapshotModal = function () {
  const modal = document.getElementById('snapshot-modal');
  if (modal) modal.classList.add('hidden');
};

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl bg-indigo-600 text-white animate-fade-in`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
