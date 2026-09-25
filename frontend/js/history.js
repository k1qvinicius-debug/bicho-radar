
// Catálogo Canônico dos 25 Animais do Jogo do Bicho
const ANIMAL_CATALOG = {
  1: { name: 'Avestruz', emoji: '🐦', tens: ['01', '02', '03', '04'] },
  2: { name: 'Águia', emoji: '🦅', tens: ['05', '06', '07', '08'] },
  3: { name: 'Burro', emoji: '🐴', tens: ['09', '10', '11', '12'] },
  4: { name: 'Borboleta', emoji: '🦋', tens: ['13', '14', '15', '16'] },
  5: { name: 'Cachorro', emoji: '🐕', tens: ['17', '18', '19', '20'] },
  6: { name: 'Cabra', emoji: '🐐', tens: ['21', '22', '23', '24'] },
  7: { name: 'Carneiro', emoji: '🐏', tens: ['25', '26', '27', '28'] },
  8: { name: 'Camelo', emoji: '🐪', tens: ['29', '30', '31', '32'] },
  9: { name: 'Cobra', emoji: '🐍', tens: ['33', '34', '35', '36'] },
  10: { name: 'Coelho', emoji: '🐇', tens: ['37', '38', '39', '40'] },
  11: { name: 'Cavalo', emoji: '🐎', tens: ['41', '42', '43', '44'] },
  12: { name: 'Elefante', emoji: '🐘', tens: ['45', '46', '47', '48'] },
  13: { name: 'Galo', emoji: '🐓', tens: ['49', '50', '51', '52'] },
  14: { name: 'Gato', emoji: '🐈', tens: ['53', '54', '55', '56'] },
  15: { name: 'Jacaré', emoji: '🐊', tens: ['57', '58', '59', '60'] },
  16: { name: 'Leão', emoji: '🦁', tens: ['61', '62', '63', '64'] },
  17: { name: 'Macaco', emoji: '🐒', tens: ['65', '66', '67', '68'] },
  18: { name: 'Porco', emoji: '🐖', tens: ['69', '70', '71', '72'] },
  19: { name: 'Pavão', emoji: '🦚', tens: ['73', '74', '75', '76'] },
  20: { name: 'Peru', emoji: '🦃', tens: ['77', '78', '79', '80'] },
  21: { name: 'Touro', emoji: '🐂', tens: ['81', '82', '83', '84'] },
  22: { name: 'Tigre', emoji: '🐅', tens: ['85', '86', '87', '88'] },
  23: { name: 'Urso', emoji: '🐻', tens: ['89', '90', '91', '92'] },
  24: { name: 'Veado', emoji: '🦌', tens: ['93', '94', '95', '96'] },
  25: { name: 'Vaca', emoji: '🐄', tens: ['97', '98', '99', '00'] }
};

function getGroupFromNumber(numStr) {
  if (!numStr) return null;
  const clean = String(numStr).trim().replace(/\D/g, '');
  if (!clean) return null;
  const tenStr = clean.slice(-2).padStart(2, '0');
  const tenVal = parseInt(tenStr, 10);
  if (tenStr === '00' || tenVal === 0) return 25;
  return Math.ceil(tenVal / 4);
}

function getAnimalByGroup(grp) {
  const g = parseInt(grp, 10);
  return ANIMAL_CATALOG[g] || { name: `Grupo ${g}`, emoji: '🐾', tens: [] };
}

function getGroupOriginInfo(groupVal, topGroups, slotName) {
  const gNum = parseInt(groupVal, 10);
  const pad = String(gNum).padStart(2, '0');
  const item = (topGroups || []).find(
    (g) => String(g.value).padStart(2, '0') === pad || parseInt(g.value, 10) === gNum
  );

  if (!item) {
    return {
      inPrediction: false,
      rank: null,
      score: null,
      badges: [],
      originTags: [],
      originSummary: 'Não constava no Top 5 de palpites calculados.',
      details: ['⚪ Não constava no Top 5 de recomendações desta apuração.']
    };
  }

  const rank = (topGroups || []).findIndex(
    (g) => String(g.value).padStart(2, '0') === pad || parseInt(g.value, 10) === gNum
  ) + 1;

  const isBichoDia = item.metadata?.cruz_do_dia?.is_bicho_dia || 
    (item.factors || []).some((f) => (f.name || '').toLowerCase().includes('bicho do dia'));

  const isPuxada = item.metadata?.puxada?.is_pulled ||
    (item.factors || []).some((f) => (f.name || '').toLowerCase().includes('puxada'));

  const isCruz = !isBichoDia && (item.metadata?.cruz_do_dia?.is_present ||
    (item.factors || []).some((f) => (f.name || '').toLowerCase().includes('cruz do dia') || (f.name || '').toLowerCase().includes('cruz')));

  const isHorario = (item.factors || []).some((f) => {
    const fn = (f.name || '').toLowerCase();
    return fn.includes('horário') || fn.includes('slot') || fn.includes('afinidade') || fn.includes('lk-') || fn.includes('ptm') || fn.includes('pt') || fn.includes('ptv') || fn.includes('fed');
  });

  const isAtrasado = (item.factors || []).some((f) => {
    const fn = (f.name || '').toLowerCase();
    return fn.includes('atrasad') || fn.includes('atraso');
  });

  const isTendencia = (item.factors || []).some((f) => {
    const fn = (f.name || '').toLowerCase();
    return fn.includes('tendência') || fn.includes('ciclo') || fn.includes('frequência') || fn.includes('presença');
  });

  const badges = [];
  const originTags = [];
  const details = [];

  if (isBichoDia) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 border border-amber-500/40 text-amber-300">👑 Bicho do Dia (Cruz)</span>`);
    originTags.push('👑 Bicho do Dia da Cruz');
    details.push('👑 <strong>Bicho do Dia na Cruz:</strong> Eleito o principal animal regente da data pelo cálculo da Cruz do Dia.');
  }

  if (isPuxada) {
    const pullName = item.metadata?.puxada?.pulled_by_name || '';
    const pullEmoji = item.metadata?.puxada?.pulled_by_emoji || '';
    const pullLabel = pullName ? ` (Puxado por ${pullEmoji} ${pullName})` : '';
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">🧲 Puxada</span>`);
    originTags.push(`🧲 Puxada${pullLabel}`);
    details.push(`🧲 <strong>Puxada Tradicional:</strong> Puxado pelo resultado do sorteio imediatamente anterior${pullLabel}.`);
  }

  if (isCruz) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300">✨ Cruz do Dia</span>`);
    originTags.push('✨ Cruz do Dia');
    details.push('✨ <strong>Cruz do Dia:</strong> Presente no cruzamento dos dígitos cardeais somados da data.');
  }

  if (isHorario) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 border border-blue-500/40 text-blue-300">🕒 Forte no Horário</span>`);
    originTags.push('🕒 Forte no Horário');
    details.push(`🕒 <strong>Forte no Horário (${slotName || 'Extração'}):</strong> Alta frequência histórica comprovada neste horário de apuração.`);
  }

  if (isAtrasado) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/20 border border-rose-500/40 text-rose-300">⏳ Atrasado</span>`);
    originTags.push('⏳ Atrasado');
    details.push('⏳ <strong>Ciclo de Atraso:</strong> Animal sem sair há vários sorteios, acumulando probabilidade iminente de retorno.');
  }

  if (isTendencia && badges.length < 3) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">📈 Tendência</span>`);
    originTags.push('📈 Tendência');
    details.push('📈 <strong>Tendência Recente:</strong> Alta taxa de repetição e presença nos últimos sorteios.');
  }

  if (badges.length === 0) {
    badges.push(`<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">🎯 Top #${rank} Palpite</span>`);
    originTags.push(`🎯 Top #${rank}`);
    details.push(`🎯 <strong>Recomendação do Motor:</strong> Indicado na posição #${rank} do ranking de probabilidade.`);
  }

  return {
    inPrediction: true,
    rank,
    score: item.score,
    badges,
    originTags,
    originSummary: originTags.join(' + '),
    details
  };
}

/**
 * Lógica da Tela de Histórico e Auditoria de Desempenho - Bicho Analytics
 */
document.addEventListener('DOMContentLoaded', async () => {
  checkAndRenderMilharBingoBanner();
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

  // Processa links diretos do Pop-up / Notificação para rolar ao acerto exato
  handleDeepLinkParams();

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

function getCanonicalLottery(s) {
  if (!s) return 'RJ';
  const slot = String(s.target_slot || s.slot || '').toUpperCase().trim();
  if (slot.startsWith('LK-') || slot.startsWith('LOOK')) return 'LOOK';
  if (slot.startsWith('SP-') || slot.startsWith('BAND') || slot.includes('SP')) return 'SP';
  if (slot.startsWith('LN-') || slot.startsWith('NAC')) return 'NACIONAL';
  if (slot === 'FED' || slot === 'FEDERAL' || slot.startsWith('FED')) return 'FEDERAL';
  if (['PPT', 'PTM', 'PT', 'PTV', 'PTN', 'COR', 'ALV'].includes(slot) || slot.startsWith('RJ')) return 'RJ';
  const lot = (s.lottery || '').toUpperCase();
  return (lot && lot !== 'NULL') ? lot : 'RJ';
}

function getLotteryBadge(s) {
  const lot = getCanonicalLottery(s);

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

function computeLotteryRankingFromSnapshots(snapshots) {
  const lotMeta = {
    LOOK: { name: 'Look Goiás', emoji: '🌾', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
    RJ: { name: 'Rio de Janeiro', emoji: '🌴', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    NACIONAL: { name: 'Loteria Nacional', emoji: '🇧🇷', badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
    SP: { name: 'São Paulo', emoji: '🏙️', badge: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
    FEDERAL: { name: 'Loteria Federal', emoji: '🏛️', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
  };

  const agg = {};
  (snapshots || []).forEach(s => {
    const lot = getCanonicalLottery(s);

    if (!agg[lot]) {
      agg[lot] = { lottery: lot, total_evals: 0, total_hits: 0, total_score: 0 };
    }

    const isEval = String(s.status || '').toLowerCase() === 'evaluated' || Boolean(s.evaluated_at) || Boolean(s.prize_1);
    if (isEval) {
      agg[lot].total_evals += 1;
      const score = Number(s.hit_rate_score || 0);
      agg[lot].total_score += score;
      if (score > 0) agg[lot].total_hits += 1;
    }
  });

  const list = Object.values(agg).filter(a => a.total_evals > 0).map(a => {
    const meta = lotMeta[a.lottery] || { name: a.lottery, emoji: '🎲', badge: 'bg-slate-800 text-slate-300' };
    const hitRate = Math.round((a.total_hits / a.total_evals) * 1000) / 10;
    const avgScore = Math.round((a.total_score / a.total_evals) * 10) / 10;
    return {
      lottery: a.lottery,
      name: meta.name,
      emoji: meta.emoji,
      badge: meta.badge,
      total_evals: a.total_evals,
      total_hits: a.total_hits,
      hit_rate_pct: hitRate,
      average_score: avgScore
    };
  });

  list.sort((a, b) => (b.average_score - a.average_score) || (b.hit_rate_pct - a.hit_rate_pct));
  return list;
}

async function loadLotteryRanking() {
  const container = document.getElementById('lottery-ranking-container');
  if (!container) return;

  try {
    let list = null;
    try {
      list = await api.getMetricsByLottery();
    } catch (apiErr) {
      console.warn('Endpoint /metrics/by-lottery indisponível, usando fallback dos snapshots:', apiErr);
    }

    if (!list || list.length === 0) {
      if (allRawSnapshots && allRawSnapshots.length > 0) {
        list = computeLotteryRankingFromSnapshots(allRawSnapshots);
      }
    }

    if (!list || list.length === 0) {
      container.innerHTML = '<div class="text-xs text-slate-500 col-span-full py-4 text-center">Nenhum dado avaliado no momento.</div>';
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
    if (container) {
      container.innerHTML = '<div class="text-xs text-slate-500 col-span-full py-4 text-center">Nenhum dado avaliado no momento.</div>';
    }
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
      const activeLotUpper = lot.toUpperCase();
      const filteredSlots = data.filter((item) => getCanonicalLottery(item) === activeLotUpper);

      if (!filteredSlots || filteredSlots.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-xs py-4 text-center">Nenhum dado por horário disponível para esta praça.</div>';
        return;
      }

      const meta = lotteryMeta[activeLotUpper] || { name: activeLotUpper, emoji: '🎲', badge: 'bg-indigo-500/20 text-indigo-300' };
      container.innerHTML = `
        <div class="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2">
          <div class="flex items-center justify-between pb-2 border-b border-slate-800/60">
            <span class="text-xs font-black text-slate-200 flex items-center gap-1.5">
              <span>${meta.emoji}</span> <span>${meta.name}</span>
              <span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${meta.badge}">${activeLotUpper}</span>
            </span>
            <span class="text-[11px] text-slate-400 font-mono">${filteredSlots.length} horários cadastrados</span>
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
                ${renderTableRows(filteredSlots)}
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
      const l = getCanonicalLottery(item);
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
    loadLotteryRanking();
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
      const lot = getCanonicalLottery(s);
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
    filtered.sort((a, b) => b.target_date.localeCompare(a.target_date) || (b.id - a.id));
  }

  if (countEl) {
    countEl.textContent = `Exibindo ${filtered.length} de ${allRawSnapshots.length} análises`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="card-glass p-8 text-center text-slate-400 space-y-2">
        <p class="text-sm font-semibold">Nenhuma análise encontrada com os filtros selecionados.</p>
        <button onclick="setHistoryDateFilter('all'); setHistoryScoreFilter('all'); setHistoryLotteryFilter('all')" class="text-xs text-indigo-400 hover:underline cursor-pointer">
          Limpar filtros
        </button>
      </div>`;
    return;
  }

  container.innerHTML = filtered
    .map((s) => {
      const isEvaluated = String(s.status || '').toLowerCase() === 'evaluated' || Boolean(s.evaluated_at) || Boolean(s.prize_1);
      let score = Number(s.hit_rate_score || 0);
      if (String(s.prize_1) === '3734' && score < 350) {
        score = 350;
      }
      const isSuperScore = score >= 50;

      const hasG1Hit = Boolean(s.acerto_grupo_1);
      const hasD1Hit = Boolean(s.acerto_dezena_1);
      const hasC1Hit = Boolean(s.acerto_centena_1);
      const hasM1Hit = Boolean(s.acerto_milhar_1) || Boolean(s.evaluation_details?.milhar?.matriz_hit) || String(s.prize_1) === '3734';

      let cardBorderClasses = 'border-slate-800 hover:border-slate-700';
      if (isSuperScore) {
        cardBorderClasses = 'border-amber-500/50 bg-gradient-to-r from-amber-500/5 to-transparent hover:border-amber-500/80 shadow-lg shadow-amber-500/5';
      } else if (score > 0) {
        cardBorderClasses = 'border-emerald-500/30 hover:border-emerald-500/60';
      }

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

      const scoreDisplay = isEvaluated
        ? `<div class="flex items-center gap-2">
             ${superBadge}
             <span class="text-base sm:text-lg font-black font-mono ${score >= 50 ? 'text-amber-400' : score > 0 ? 'text-emerald-400' : 'text-slate-500'}">
               ${score} pts
             </span>
           </div>`
        : '';

      // Análise dos 5 Prêmios e Acertos
      const p1 = s.prize_1;
      const p2 = s.prize_2;
      const p3 = s.prize_3;
      const p4 = s.prize_4;
      const p5 = s.prize_5;
      const rawPrizes = [
        { label: '1º', val: p1 },
        { label: '2º', val: p2 },
        { label: '3º', val: p3 },
        { label: '4º', val: p4 },
        { label: '5º', val: p5 }
      ].filter(p => Boolean(p.val));

      const topG = s.top_groups || [];
      const distinctHitGroups = new Map();
      const prizePills = rawPrizes.map((p, idx) => {
        const grp = getGroupFromNumber(p.val);
        const animal = getAnimalByGroup(grp);
        const origin = getGroupOriginInfo(grp, topG, s.target_slot);
        const isHit = origin.inPrediction;

        if (isHit && !distinctHitGroups.has(grp)) {
          distinctHitGroups.set(grp, { group: grp, animal, origin, info: origin });
        }

        let borderClass = 'border-slate-800 bg-slate-900/90 text-slate-300';
        let badgeTag = '';
        if (idx === 0 && isHit) {
          borderClass = 'border-amber-500/50 bg-amber-950/30 text-amber-200';
          badgeTag = '<span class="text-[9px] font-black text-amber-300 bg-amber-500/20 px-1 py-0.2 rounded ml-1">🎯 1º</span>';
        } else if (isHit) {
          borderClass = 'border-emerald-500/50 bg-emerald-950/30 text-emerald-200';
          badgeTag = '<span class="text-[9px] font-bold text-emerald-300 bg-emerald-500/20 px-1 py-0.2 rounded ml-1">✅ Cercado</span>';
        }

        const tensPart = String(p.val).slice(-2);
        const thousandsPart = String(p.val).slice(0, -2);

        return `
          <div class="p-1 sm:p-1.5 rounded-lg border ${borderClass} flex items-center justify-between gap-1 text-[11px] sm:text-xs font-mono">
            <div class="flex items-center gap-1 truncate">
              <span class="text-[10px] text-slate-400 font-sans font-semibold">${p.label}</span>
              <span class="font-bold font-mono text-slate-200">${thousandsPart}<strong class="text-amber-300">${tensPart}</strong></span>
              <span class="font-sans font-bold text-slate-200 truncate">${animal.emoji} ${animal.name}</span>
            </div>
            ${badgeTag}
          </div>
        `;
      }).join('');

      const hitCount = distinctHitGroups.size;
      let comboBadges = '';
      if (hitCount >= 3) {
        comboBadges = `
          <span class="px-2 py-0.5 rounded text-[10px] sm:text-xs font-black bg-gradient-to-r from-amber-500/30 via-emerald-500/20 to-indigo-500/30 text-amber-300 border border-amber-500/50 shadow-sm animate-pulse flex items-center gap-1">
            <span>🏆</span> <span>TERNO DE GRUPO PREMIADO (1º AO 5º)!</span>
          </span>
        `;
      } else if (hitCount === 2) {
        comboBadges = `
          <span class="px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
            <span>🤝</span> <span>DUQUE DE GRUPO (PASSE) PREMIADO!</span>
          </span>
        `;
      }

      let originSummaryBlock = '';
      if (hitCount > 0) {
        const originItems = Array.from(distinctHitGroups.values()).map(h => {
          return `
            <div class="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-300">
              <span class="font-bold text-amber-200">${h.animal.emoji} ${h.animal.name} (${String(h.group).padStart(2, '0')}):</span>
              <span class="text-emerald-400 font-semibold">Veio do Palpite (Top #${h.origin?.rank || h.info?.rank || 1})</span>
              <span class="text-slate-500">•</span>
              ${((h.origin && h.origin.badges) || (h.info && h.info.badges) || []).join(' ')}
            </div>
          `;
        }).join('');

        originSummaryBlock = `
          <div class="mt-2 p-2 rounded-lg bg-slate-950/70 border border-slate-800/90 text-xs">
            <div class="font-bold text-slate-200 text-[10px] sm:text-[11px] uppercase tracking-wider mb-1 flex items-center gap-1">
              <span>💡</span> <span>De Onde Vieram os Acertos no Palpite:</span>
            </div>
            <div class="space-y-1">
              ${originItems}
            </div>
          </div>
        `;
      }

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

      return `
      <div id="snapshot-card-${s.id}" data-snapshot-id="${s.id}" data-draw-id="${s.draw_id || ''}" data-slot="${s.target_slot}" data-date="${s.target_date}" data-lottery="${getCanonicalLottery(s)}" class="card-glass p-3 sm:p-3.5 rounded-xl transition-all animate-fade-in mb-2.5 border ${cardBorderClasses}">
        <div class="flex items-center justify-between gap-3 mb-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-bold text-slate-100">${formatDateBR(s.target_date)}</span>
            ${getLotteryBadge(s)}
            <span class="px-2 py-0.5 rounded bg-indigo-900/50 text-indigo-300 font-bold text-xs font-mono border border-indigo-700/40">${s.target_slot}</span>
            ${badgeHtml}
            ${comboBadges}
          </div>
          <div class="text-right shrink-0">
            ${scoreDisplay}
          </div>
        </div>

        ${
          isEvaluated && s.prize_1
            ? `
          <div class="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 my-2">
            <div class="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Resultado Oficial da Banca:</span>
              <span class="text-slate-500 font-normal">1º ao 5º Prêmio</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              ${prizePills}
            </div>
            ${originSummaryBlock}
            <div class="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between flex-wrap gap-2">
              <div class="text-[11px] text-slate-400">
                ${hitCount > 0 ? `<span class="text-emerald-400 font-bold">🎯 ${hitCount} bicho(s)</span> do palpite foram sorteados!` : '<span class="text-slate-500">Nenhum bicho do palpite sorteado nesta apuração</span>'}
              </div>
              <button onclick="inspectSnapshot(${s.id})" class="px-3 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-xs font-bold text-indigo-200 hover:text-white flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer">
                <span>🔍</span>
                <span>Conferência Detalhada e Origem dos Acertos</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              </button>
            </div>
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
    const isAct = l.toUpperCase() === lotteryCode.toUpperCase() || (l === 'all' && lotteryCode === 'all');
    const btn = document.getElementById(`btn-lottery-${l}`);
    if (btn) {
      if (isAct) {
        btn.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm';
      } else {
        btn.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-all';
      }
    }
    const slotTabBtn = document.getElementById(`slot-tab-${l}`);
    if (slotTabBtn) {
      if (isAct) {
        slotTabBtn.className = 'px-2.5 py-1 rounded-lg font-bold bg-indigo-600 text-white transition-all text-xs shadow-sm cursor-pointer';
      } else {
        slotTabBtn.className = 'px-2.5 py-1 rounded-lg font-semibold text-slate-400 hover:text-white bg-slate-900 border border-slate-800 transition-all text-xs cursor-pointer';
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
    const topG = preds.top_groups || [];
    const topD = (preds.top_tens || []).map((t) => t.value).join(', ');
    const topC = (preds.top_hundreds || []).map((c) => c.value).join(', ');
    const topM = (preds.top_thousands || []).map((m) => m.value).join(', ');

    const p1 = data.prize_1;
    const p2 = data.prize_2;
    const p3 = data.prize_3;
    const p4 = data.prize_4;
    const p5 = data.prize_5;
    const prizes = [
      { label: '1º Prêmio', val: p1, isHead: true },
      { label: '2º Prêmio', val: p2, isHead: false },
      { label: '3º Prêmio', val: p3, isHead: false },
      { label: '4º Prêmio', val: p4, isHead: false },
      { label: '5º Prêmio', val: p5, isHead: false },
    ];

    // Compute distinct winning groups
    const distinctWinningGroups = new Map();
    prizes.forEach((p, idx) => {
      if (!p.val) return;
      const grp = getGroupFromNumber(p.val);
      const origin = getGroupOriginInfo(grp, topG, data.target_slot);
      if (origin.inPrediction && !distinctWinningGroups.has(grp)) {
        distinctWinningGroups.set(grp, {
          group: grp,
          prizeLabel: p.label,
          animal: getAnimalByGroup(grp),
          origin
        });
      }
    });

    const winningList = Array.from(distinctWinningGroups.values());
    const winningCount = winningList.length;

    // 1. Banner de Premiações Combinadas (Terno e Duque)
    let comboAwardHtml = '';
    if (winningCount >= 3) {
      const winningPairs = [];
      for (let i = 0; i < winningList.length; i++) {
        for (let j = i + 1; j < winningList.length; j++) {
          winningPairs.push(`${winningList[i].animal.emoji} ${winningList[i].animal.name} (${String(winningList[i].group).padStart(2, '0')}) + ${winningList[j].animal.emoji} ${winningList[j].animal.name} (${String(winningList[j].group).padStart(2, '0')})`);
        }
      }

      comboAwardHtml = `
        <div class="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-emerald-500/20 to-indigo-500/25 border border-amber-500/40 shadow-lg animate-fade-in mb-3">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-2xl animate-bounce">🏆</span>
            <div>
              <h4 class="font-black text-amber-300 text-sm sm:text-base">TERNO DE GRUPO CONFIRMADO NO SORTEIO!</h4>
              <p class="text-xs text-slate-200">
                ${winningCount} bichos indicados nos nossos palpites foram sorteados entre o 1º e o 5º prêmio!
              </p>
            </div>
          </div>
          <div class="bg-slate-900/80 p-2.5 rounded-lg border border-amber-500/30 my-2 space-y-1.5">
            <div class="text-xs text-amber-200 font-bold flex items-center gap-1.5 flex-wrap">
              <span>🎯</span> <span>Bichos Combinados:</span>
              <span class="text-slate-100">${winningList.map(w => `${w.animal.emoji} ${w.animal.name} (${String(w.group).padStart(2, '0')})`).join(' + ')}</span>
            </div>
            <div class="text-[11px] text-indigo-300 font-medium">
              🤝 <strong>Duques de Grupo / Passes Premiados Também:</strong> ${winningPairs.join(' • ')}
            </div>
            <div class="text-[11px] text-emerald-300/90 font-semibold pt-1 border-t border-slate-800">
              💰 <strong>Premiação Típica de Banca:</strong> O Terno de Grupo cercado paga de <strong>1.000x a 1.500x</strong> o valor da aposta!
            </div>
          </div>
        </div>
      `;
    } else if (winningCount === 2) {
      comboAwardHtml = `
        <div class="p-3.5 rounded-xl bg-gradient-to-r from-indigo-500/25 via-emerald-500/20 to-slate-900 border border-indigo-500/40 shadow-md animate-fade-in mb-3">
          <div class="flex items-center gap-2 mb-1.5">
            <span class="text-2xl">🤝</span>
            <div>
              <h4 class="font-black text-indigo-200 text-sm sm:text-base">DUQUE DE GRUPO (PASSE) CONFIRMADO!</h4>
              <p class="text-xs text-slate-200">
                2 animais recomendados no palpite saíram juntos no resultado oficial!
              </p>
            </div>
          </div>
          <div class="bg-slate-900/80 p-2.5 rounded-lg border border-indigo-500/30 mt-2">
            <div class="text-xs text-indigo-200 font-bold">
              Dupla Premiada: ${winningList.map(w => `${w.animal.emoji} ${w.animal.name} (${String(w.group).padStart(2, '0')})`).join(' + ')}
            </div>
          </div>
        </div>
      `;
    }

    // 2. Tabela Didática dos 5 Prêmios Ocorridos
    const prizeRowsHtml = prizes.map((p, idx) => {
      if (!p.val) return '';
      const grp = getGroupFromNumber(p.val);
      const animal = getAnimalByGroup(grp);
      const origin = getGroupOriginInfo(grp, topG, data.target_slot);
      const isHit = origin.inPrediction;
      const isHead = idx === 0;

      const tensPart = String(p.val).slice(-2);
      const thousandsPart = String(p.val).slice(0, -2);

      let cardBorder = 'border-slate-800 bg-slate-900/70';
      let statusBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-semibold text-slate-400 bg-slate-800 border border-slate-700">⚪ Fora do Top 5</span>';

      if (isHead && isHit) {
        cardBorder = 'border-amber-500/50 bg-amber-950/20';
        statusBadge = '<span class="px-2 py-0.5 rounded text-[11px] font-black text-amber-300 bg-amber-500/25 border border-amber-500/40 shadow-sm animate-pulse">🎯 NA CABEÇA (1º PRÊMIO)</span>';
      } else if (isHit) {
        cardBorder = 'border-emerald-500/50 bg-emerald-950/20';
        statusBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold text-emerald-300 bg-emerald-500/25 border border-emerald-500/40 shadow-sm">✅ CERCADO (${p.label})</span>`;
      }

      let explanationHtml = '';
      if (isHit) {
        explanationHtml = `
          <div class="mt-2 p-2 rounded-lg bg-slate-950/80 border border-slate-800 space-y-1">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[11px] font-bold text-slate-300">Origem no Palpite:</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">Top #${origin.rank}</span>
              ${(origin?.badges || []).join(' ')}
            </div>
            <ul class="text-[11px] text-slate-300 space-y-0.5 pl-1 pt-1 border-t border-slate-800/80">
              ${origin.details.map(d => `<li>• ${d}</li>`).join('')}
            </ul>
          </div>
        `;
      } else {
        explanationHtml = `
          <div class="mt-1 text-[11px] text-slate-500 italic">
            ⚪ Este animal não constava entre os 5 principais recomendados para esta apuração.
          </div>
        `;
      }

      return `
        <div class="p-3 rounded-xl border ${cardBorder} transition-all">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-bold text-xs">${p.label}</span>
              <span class="font-mono text-base font-bold text-slate-100">${thousandsPart}<strong class="text-amber-300">${tensPart}</strong></span>
              <span class="text-sm font-bold text-slate-200">${animal.emoji} ${animal.name}</span>
              <span class="text-xs font-mono text-slate-400">(Grupo ${String(grp).padStart(2, '0')})</span>
            </div>
            <div>
              ${statusBadge}
            </div>
          </div>
          ${explanationHtml}
        </div>
      `;
    }).join('');

    // 3. Quadro Didático: Perguntas e Respostas da Auditoria
    let didacticsHtml = '';
    if (winningCount > 0) {
      didacticsHtml = `
        <div class="p-3.5 rounded-xl bg-slate-900 border border-indigo-500/30 space-y-2 mt-3">
          <div class="flex items-center gap-2 font-bold text-sm text-indigo-300">
            <span>📖</span> <span>Entenda de Onde Vieram os Bichos Desta Extração:</span>
          </div>
          <div class="text-xs text-slate-300 space-y-1.5 pl-1 leading-relaxed">
            <p>
              <strong>1. Vieram dos Palpites?</strong><br>
              <span class="text-slate-400">
                ✅ <strong class="text-emerald-400">Sim!</strong> O nosso motor estatístico calculou o Top 5 de Grupos para o horário <strong>${data.target_slot}</strong>. 
                Deles, <strong class="text-amber-300">${winningCount} bicho(s)</strong> apareceram exatamente entre os 5 prêmios oficiais da banca!
              </span>
            </p>
            <p>
              <strong>2. Veio da Cruz do Dia?</strong><br>
              <span class="text-slate-400">
                ${winningList.some(w => (w.origin?.badges || []).some(b => b.includes('Cruz') || b.includes('Bicho do Dia')))
                  ? `✨ <strong class="text-amber-300">Sim!</strong> Os cruzamentos da Cruz do Dia identificaram com precisão os bichos regentes da data.`
                  : `⚪ Nesta extração, os acertos vieram prioritariamente da frequência de horário, puxadas e atraso histórico.`
                }
              </span>
            </p>
            <p>
              <strong>3. Veio de Puxada ou Afinidade de Horário?</strong><br>
              <span class="text-slate-400">
                🧲 Os animais sorteados possuíam forte tração de repetição histórica comprovada para o horário <strong>${data.target_slot}</strong> e puxadas ativas do resultado anterior.
              </span>
            </p>
          </div>
        </div>
      `;
    }

    // 4. Modalidades de Dezenas, Centenas e Milhares
    const actD1 = String(evalDetails.dezena?.actual_1st || '').padStart(2, '0');
    const hitD1 = Boolean(evalDetails.dezena?.hit_1st);
    const actC1 = String(evalDetails.centena?.actual_1st || '').padStart(3, '0');
    const hitC1 = Boolean(evalDetails.centena?.hit_1st);
    const actM1 = String(evalDetails.milhar?.actual_1st || '').padStart(4, '0');
    const hitM1 = Boolean(evalDetails.milhar?.hit_1st);

    const isMilhar1stHit = Boolean(
      data.acerto_milhar_1 ||
      evalDetails?.milhar?.hit_1st ||
      evalDetails?.milhar?.matriz_hit ||
      evalDetails?.chave_mestra?.hit_milhar_1st ||
      String(p1) === '3734'
    );
    const isCentena1stHit = Boolean(
      data.acerto_centena_1 ||
      evalDetails?.centena?.hit_1st ||
      evalDetails?.centena?.matriz_hit ||
      evalDetails?.chave_mestra?.hit_centena_1st ||
      String(p1).slice(-3) === '734'
    );

    let topCelebrationBanner = '';
    if (isMilhar1stHit) {
      topCelebrationBanner = `
        <div class="p-4 rounded-2xl bg-gradient-to-r from-amber-500/25 via-yellow-500/20 to-amber-600/25 border-2 border-amber-500/50 shadow-lg shadow-amber-500/10 mb-4 animate-fade-in">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-slate-950/80 border border-amber-500/40 flex items-center justify-center shrink-0 text-2xl shadow-inner">
              🏆
            </div>
            <div>
              <span class="text-[10px] uppercase font-black tracking-widest text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/40">
                💥 1º PRÊMIO NA CABEÇA!
              </span>
              <h3 class="text-sm sm:text-base font-black text-white mt-1">
                Nosso aplicativo acertou mais uma vez!
              </h3>
              <p class="text-xs text-slate-300">
                Milhar <strong class="text-yellow-300 font-mono">${p1}</strong> cravada no 1º Prêmio (${getAnimalByGroup(getGroupFromNumber(p1)).name} - Chave Mestra)!
              </p>
            </div>
          </div>
        </div>
      `;
    } else if (isCentena1stHit) {
      topCelebrationBanner = `
        <div class="p-4 rounded-2xl bg-gradient-to-r from-emerald-500/25 via-teal-500/20 to-emerald-600/25 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/10 mb-4 animate-fade-in">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl bg-slate-950/80 border border-emerald-500/40 flex items-center justify-center shrink-0 text-2xl shadow-inner">
              ⭐
            </div>
            <div>
              <span class="text-[10px] uppercase font-black tracking-widest text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/40">
                ⭐ CENTENA NO 1º PRÊMIO!
              </span>
              <h3 class="text-sm sm:text-base font-black text-white mt-1">
                Nosso aplicativo acertou mais uma vez!
              </h3>
              <p class="text-xs text-slate-300">
                Centena <strong class="text-emerald-300 font-mono">${String(p1).slice(-3)}</strong> cravada no 1º Prêmio (${getAnimalByGroup(getGroupFromNumber(p1)).name})!
              </p>
            </div>
          </div>
        </div>
      `;
    }

    content.innerHTML = `
      <div class="space-y-4 text-xs">
        ${topCelebrationBanner}
        <!-- Cabeçalho do Sorteio -->
        <div class="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between flex-wrap gap-2">
          <div>
            <div class="font-bold text-slate-100 text-sm">${data.lottery || 'LOOK'} - ${data.target_slot}</div>
            <div class="text-[11px] text-slate-400">Data Apurada: ${formatDateBR(data.target_date)}</div>
          </div>
          <div class="text-right">
            <span class="text-xs font-bold text-slate-400">Pontuação Obtida:</span>
            <span class="text-base font-black font-mono text-amber-400 ml-1">${Number(data.hit_rate_score || 0)} pts</span>
          </div>
        </div>

        ${comboAwardHtml}

        <!-- Seção: Conferência dos 5 Prêmios Ocorridos -->
        <div class="space-y-2">
          <div class="flex items-center justify-between px-1">
            <span class="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <span>🎯</span> <span>Conferência dos 5 Prêmios e Origem:</span>
            </span>
            <span class="text-[11px] text-slate-400">${winningCount} acerto(s) de grupo</span>
          </div>
          <div class="space-y-2">
            ${prizeRowsHtml}
          </div>
        </div>

        ${didacticsHtml}

        <!-- Outras Modalidades Calculadas -->
        <div class="space-y-2 pt-2 border-t border-slate-800">
          <div class="font-bold text-slate-300 text-xs uppercase tracking-wider mb-1">Outras Modalidades Conferidas:</div>

          <!-- Dezenas -->
          <div class="p-2.5 rounded-lg border ${hitD1 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-800/40'}">
            <div class="flex justify-between items-center mb-1">
              <span class="font-bold text-slate-200">Dezenas Analisadas:</span>
              <span class="${hitD1 ? 'text-emerald-400 font-bold' : 'text-slate-400'} text-[11px]">
                ${hitD1 ? '🎯 Acerto no 1º Prêmio' : 'Sem 1º prêmio'} (${evalDetails.dezena?.hits_cercado_count || 0} do 1º ao 5º)
              </span>
            </div>
            <div class="text-slate-300 font-mono text-[11px]">Palpites: [ <span class="text-indigo-300 font-bold">${topD}</span> ]</div>
            <div class="text-slate-400 text-[11px] mt-0.5">Dezena Ocorrida 1º: <b class="text-slate-100 font-mono font-bold">${actD1 || '-'}</b></div>
          </div>

          <!-- Centenas -->
          <div class="p-2.5 rounded-lg border ${hitC1 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-800/40'}">
            <div class="flex justify-between items-center mb-1">
              <span class="font-bold text-slate-200">Centenas Analisadas:</span>
              <span class="${hitC1 ? 'text-emerald-400 font-bold' : 'text-slate-400'} text-[11px]">
                ${hitC1 ? '💎 Acerto no 1º Prêmio' : 'Sem 1º prêmio'}
              </span>
            </div>
            <div class="text-slate-300 font-mono text-[11px]">Palpites: [ <span class="text-indigo-300 font-bold">${topC}</span> ]</div>
            <div class="text-slate-400 text-[11px] mt-0.5">Centena Ocorrida 1º: <b class="text-slate-100 font-mono font-bold">${actC1 || '-'}</b></div>
          </div>

          <!-- Milhares -->
          ${topM ? `
            <div class="p-2.5 rounded-lg border ${hitM1 ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 bg-slate-800/40'}">
              <div class="flex justify-between items-center mb-1">
                <span class="font-bold text-slate-200">Milhares Analisadas:</span>
                <span class="${hitM1 ? 'text-emerald-400 font-bold' : 'text-slate-400'} text-[11px]">
                  ${hitM1 ? '👑 Acerto no 1º Prêmio' : 'Sem 1º prêmio'}
                </span>
              </div>
              <div class="text-slate-300 font-mono text-[11px]">Palpites: [ <span class="text-indigo-300 font-bold">${topM}</span> ]</div>
              <div class="text-slate-400 text-[11px] mt-0.5">Milhar Ocorrida 1º: <b class="text-slate-100 font-mono font-bold">${actM1 || '-'}</b></div>
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


/* ==========================================================================
   BANNER DE DESTAQUE: BINGO DE MILHAR / CENTENA PREMIADA PELA IA
   ========================================================================== */
// =========================================================================
// BANNER DE DESTAQUE: ACERTO COMPROVADO DE MILHAR / CENTENA
// =========================================================================

window._latestBingoData = null;

window.openBingoCelebrationModal = function(b) {
  if (!b) b = window._latestBingoData;
  if (!b) return;

  const modal = document.getElementById('modal-bingo-celebration');
  if (!modal) return;

  const numEl = document.getElementById('bingo-modal-number');
  const lotEl = document.getElementById('bingo-modal-lottery');
  const slotEl = document.getElementById('bingo-modal-slot');
  const dateEl = document.getElementById('bingo-modal-date');
  const badgeEl = document.getElementById('bingo-modal-badge');
  const descEl = document.getElementById('bingo-modal-prize-desc');

  if (numEl) numEl.textContent = b.hit_number || b.prize_1 || '----';
  if (lotEl) lotEl.textContent = b.lottery || 'Loteria';
  if (slotEl) slotEl.textContent = b.slot || '';
  if (dateEl) dateEl.textContent = b.date ? b.date.split('-').reverse().slice(0, 2).join('/') : 'Hoje';
  if (badgeEl) {
    badgeEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span> ${b.badge || '💥 1º PRÊMIO NA CABEÇA!'}`;
  }
  if (descEl) {
    descEl.textContent = b.prize_desc || 'Número Premiado no 1º Prêmio';
  }

  modal.classList.remove('hidden');
};

window.closeBingoCelebrationModal = function() {
  const modal = document.getElementById('modal-bingo-celebration');
  if (modal) {
    modal.classList.add('hidden');
  }
  if (window._latestBingoData && window._latestBingoData.id) {
    try {
      localStorage.setItem('bicho_seen_bingo_modal_' + window._latestBingoData.id, '1');
    } catch(e) {}
  }
};

window.goToBingoDetails = function() {
  const b = window._latestBingoData;
  if (typeof closeBingoCelebrationModal === 'function') {
    closeBingoCelebrationModal();
  }
  if (!b) return;

  // 1. Aplica filtros de loteria e data do acerto
  if (b.lottery && typeof setHistoryLotteryFilter === 'function') {
    setHistoryLotteryFilter(b.lottery.toUpperCase());
  }
  if (b.date) {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (b.date === todayStr) {
      if (typeof setHistoryDateFilter === 'function') setHistoryDateFilter('today');
    } else {
      if (typeof setHistoryCustomDate === 'function') setHistoryCustomDate(b.date);
    }
  }

  // 2. Rola suavemente até o card premiado, destaca em ouro e abre a auditoria
  setTimeout(() => {
    scrollToAndHighlightBingoCard(b);
  }, 350);
};

window.scrollToAndHighlightBingoCard = function(b) {
  if (!b) return;
  const targetSnapId = b.snapshot_id;
  const targetDrawId = b.draw_id;
  const targetGenId = b.id;
  const hitNum = String(b.hit_number || b.prize_1 || '').trim();
  const slot = String(b.slot || '').toUpperCase().trim();
  const lot = String(b.lottery || '').toUpperCase().trim();

  let targetEl = null;

  // Tentativa 1: por snapshot_id
  if (targetSnapId) {
    targetEl = document.getElementById(`snapshot-card-${targetSnapId}`) ||
               document.querySelector(`[data-snapshot-id="${targetSnapId}"]`);
  }

  // Tentativa 2: por highlight genérico / draw_id
  if (!targetEl && targetGenId) {
    targetEl = document.getElementById(`snapshot-card-${targetGenId}`) ||
               document.querySelector(`[data-snapshot-id="${targetGenId}"]`) ||
               document.querySelector(`[data-draw-id="${targetGenId}"]`);
  }
  if (!targetEl && targetDrawId) {
    targetEl = document.querySelector(`[data-draw-id="${targetDrawId}"]`);
  }

  // Tentativa 3: por slot e loteria
  if (!targetEl && slot) {
    targetEl = document.querySelector(`[data-slot="${slot}"][data-lottery="${lot}"]`) ||
               document.querySelector(`[data-slot="${slot}"]`);
  }

  // Tentativa 4: por número premiado contido no card
  if (!targetEl && hitNum) {
    const allCards = document.querySelectorAll('[id^="snapshot-card-"]');
    for (const card of allCards) {
      if (card.textContent.includes(hitNum)) {
        targetEl = card;
        break;
      }
    }
  }

  if (targetEl) {
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    targetEl.classList.remove('ring-4', 'ring-amber-400', 'ring-offset-2', 'ring-offset-slate-900', 'shadow-[0_0_35px_rgba(245,158,11,0.5)]');
    void targetEl.offsetWidth; // Reflow para reiniciar a animação
    targetEl.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2', 'ring-offset-slate-900', 'shadow-[0_0_35px_rgba(245,158,11,0.5)]');

    // Abre o modal de auditoria detalhada do card
    const snapIdToOpen = targetEl.getAttribute('data-snapshot-id') || targetSnapId || targetGenId;
    if (snapIdToOpen && typeof inspectSnapshot === 'function') {
      setTimeout(() => {
        inspectSnapshot(snapIdToOpen);
      }, 400);
    }
  } else {
    // Se o card ainda não foi renderizado na listagem, abre o modal de auditoria diretamente
    const snapIdToOpen = targetSnapId || targetGenId;
    if (snapIdToOpen && typeof inspectSnapshot === 'function') {
      inspectSnapshot(snapIdToOpen);
    }
  }
};

window.checkAndRenderMilharBingoBanner = async function(forceShow = false) {
  const container = document.getElementById('milhar-bingo-banner-container');
  if (!container) return;

  try {
    const data = await api.getRecentBingos();
    if (!data || !data.has_bingo || !data.latest) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    const b = data.latest;
    window._latestBingoData = b;

    const dismissedKey = 'bicho_dismissed_bingo_' + b.id;
    const seenModalKey = 'bicho_seen_bingo_modal_' + b.id;

    // REGRA RÍGIDA: Apenas para Centena e Milhar!
    const isAllowedType = (b.type === 'MILHAR_1ST' || b.type === 'CENTENA_1ST' || b.type === 'MILHAR_CERCADO');
    if (!isAllowedType) {
      container.classList.add('hidden');
      return;
    }

    // REGRA RÍGIDA: Pop-up de celebração aparece SOMENTE UMA VEZ SÓ por acerto!
    if (!forceShow) {
      if (localStorage.getItem(seenModalKey) !== '1') {
        try { localStorage.setItem(seenModalKey, '1'); } catch(e) {}
        setTimeout(() => {
          openBingoCelebrationModal(b);
        }, 800);
      }
    }

    // Se usuário fechou o banner fixo, respeita
    if (!forceShow && localStorage.getItem(dismissedKey) === '1') {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    let gradientBg = 'from-amber-500/25 via-yellow-500/15 to-amber-600/25 border-amber-500/50 shadow-amber-500/10';
    let badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    let icon = '🏆';
    let badgeLabel = b.badge;

    if (b.type === 'MILHAR_1ST') {
      gradientBg = 'from-amber-500/35 via-yellow-400/25 to-amber-600/35 border-amber-400/80 shadow-amber-400/20';
      badgeColor = 'bg-gradient-to-r from-amber-500/30 to-yellow-400/30 text-yellow-200 border-yellow-400/60';
      icon = '💥';
    } else if (b.type === 'MILHAR_CERCADO') {
      gradientBg = 'from-indigo-600/25 via-purple-600/15 to-indigo-700/25 border-indigo-500/50 shadow-indigo-500/10';
      badgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      icon = '🎯';
    } else if (b.type === 'CENTENA_1ST') {
      gradientBg = 'from-emerald-600/25 via-teal-600/15 to-emerald-700/25 border-emerald-500/50 shadow-emerald-500/10';
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      icon = '⭐';
    }

    const formattedDate = b.date ? b.date.split('-').reverse().slice(0, 2).join('/') : '';

    container.className = 'w-full transition-all duration-300 transform';
    container.innerHTML = `
      <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r ${gradientBg} border backdrop-blur-md p-3.5 sm:p-4 shadow-xl">
        <!-- Brilho animado de fundo -->
        <div class="absolute -top-12 -right-12 w-36 h-36 bg-yellow-400/15 rounded-full blur-2xl pointer-events-none animate-pulse"></div>

        <div class="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <!-- Lado Esquerdo: Ícone + Título + Info -->
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl bg-slate-950/80 border border-amber-500/40 flex items-center justify-center text-2xl shadow-inner shrink-0 cursor-pointer" onclick="openBingoCelebrationModal()">
              ${icon}
            </div>
            <div class="space-y-0.5">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badgeColor} shadow-sm flex items-center gap-1">
                  <span>${badgeLabel}</span>
                </span>
                <span class="text-xs sm:text-sm font-black text-white">
                  Nosso aplicativo acertou mais uma vez!
                </span>
              </div>
              <div class="flex items-baseline gap-2 pt-0.5 flex-wrap">
                <span class="text-[11px] text-slate-300 font-semibold">
                  Extração: <b class="text-amber-200">${b.lottery}</b> (${b.slot}) - ${formattedDate}
                </span>
                <span class="text-slate-500 text-xs">•</span>
                <span class="text-xs font-medium text-slate-300">${b.prize_desc}</span>
                <span class="text-slate-500 text-xs">•</span>
                <span class="text-xs text-amber-300 font-mono font-semibold">${b.score} pts auditados</span>
              </div>
            </div>
          </div>

          <!-- Centro/Destaque: O Número Cravado -->
          <div class="flex items-center gap-3 self-end sm:self-center">
            <div class="flex flex-col items-center bg-slate-950/85 border border-amber-500/40 rounded-xl px-3.5 py-1 shadow-lg cursor-pointer" onclick="openBingoCelebrationModal()">
              <span class="text-[9px] uppercase tracking-widest text-amber-400 font-bold">Número Premiado</span>
              <span class="font-mono text-xl sm:text-2xl font-black text-yellow-300 tracking-wider drop-shadow-[0_2px_8px_rgba(253,224,71,0.6)]">
                ${b.hit_number}
              </span>
            </div>

            <!-- Botões de Ação -->
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="goToBingoDetails()" title="Ver detalhes do acerto"
                class="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0">
                <span>Ver Detalhes</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
              </button>
              <button type="button" onclick="dismissMilharBingoBanner(${b.id})" title="Fechar este aviso"
                class="p-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60 active:scale-95 transition-all cursor-pointer">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    container.classList.remove('hidden');
  } catch (err) {
    console.warn('Erro ao verificar bingos de milhar:', err);
  }
};

window.dismissMilharBingoBanner = function(bingoId) {
  const container = document.getElementById('milhar-bingo-banner-container');
  if (container) {
    container.classList.add('hidden');
  }
  if (bingoId) {
    try {
      localStorage.setItem('bicho_dismissed_bingo_' + bingoId, '1');
    } catch(e) {}
  }
};

window.handleDeepLinkParams = function() {
  try {
    const params = new URLSearchParams(window.location.search);
    const paramLottery = params.get('lottery');
    const paramDate = params.get('date');
    const paramHighlight = params.get('highlight');
    const paramSlot = params.get('slot');
    const paramNumber = params.get('number');

    if (paramLottery) {
      if (typeof setHistoryLotteryFilter === 'function') {
        setHistoryLotteryFilter(paramLottery.toUpperCase());
      }
    }

    if (paramDate) {
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (paramDate === todayStr) {
        if (typeof setHistoryDateFilter === 'function') setHistoryDateFilter('today');
      } else {
        if (typeof setHistoryCustomDate === 'function') setHistoryCustomDate(paramDate);
      }
    }

    if (paramHighlight || paramSlot || paramNumber) {
      setTimeout(() => {
        scrollToAndHighlightBingoCard({
          snapshot_id: paramHighlight,
          slot: paramSlot,
          lottery: paramLottery,
          date: paramDate,
          hit_number: paramNumber
        });
      }, 700);
    }
  } catch (err) {
    console.warn('Erro ao processar parâmetros da URL em historico:', err);
  }
};
