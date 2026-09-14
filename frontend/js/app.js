/**
 * Lógica do Dashboard Principal - BICHO RADAR
 */
let currentPrediction = null;
let currentDayDraws = {};
let standardSlotsList = [];
let cachedDDZCombos = [];
let currentDDZIndex = 0;
let currentStrategy = 'hybrid';
let currentFixedAnimalData = null;
let currentFixedGroup = 8;
let currentLottery = localStorage.getItem('bicho_active_lottery') || 'RJ';

document.addEventListener('DOMContentLoaded', async () => {
  await initTenantAuth();
  updateLotteryButtonsUI();
  await initSlotSelector(currentLottery);
  setDefaultDate();
  await Promise.all([loadPrediction(), loadDrawResults()]);
  setupEventListeners();

  // Verifica se há tela solicitada via hash (#palpites, #cruz, #puxadas, #atrasados, #resultados) ou query param
  const hash = window.location.hash.replace('#', '');
  const urlParams = new URLSearchParams(window.location.search);
  const requestedScreen = hash || urlParams.get('tab');
  
  if (['home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados'].includes(requestedScreen)) {
    switchScreen(requestedScreen, false);
  } else {
    switchScreen('home', false);
  }
});

// Suporte ao botão voltar/avançar do navegador entre as telas
window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (['home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados'].includes(hash)) {
    switchScreen(hash, false);
  } else {
    switchScreen('home', false);
  }
});

/* ==========================================================================
   NAVEGAÇÃO PRINCIPAL EM TELAS NORMAIS (SINGLE PAGE VIEWS)
   Telas: 'home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados'
   ========================================================================== */
window.switchScreen = function(screenName, updateHash = true) {
  const screens = ['home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados'];
  if (!screens.includes(screenName)) screenName = 'home';

  // Oculta todas as telas e exibe a selecionada
  screens.forEach(s => {
    const el = document.getElementById(`view-${s}`);
    if (el) {
      if (s === screenName) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });

  // Oculta a barra de loterias na tela da Cruz do Dia (pois a Cruz é universal e válida para todas as praças)
  const globalLotteryBar = document.getElementById('global-lottery-bar-container');
  if (globalLotteryBar) {
    if (screenName === 'cruz') {
      globalLotteryBar.classList.add('hidden');
    } else {
      globalLotteryBar.classList.remove('hidden');
    }
  }

  // Atualiza botões do Desktop Nav
  const navBtnHome = document.getElementById('nav-btn-home');
  const navBtnPalpites = document.getElementById('nav-btn-palpites');
  const navBtnCruz = document.getElementById('nav-btn-cruz');
  const navBtnResultados = document.getElementById('nav-btn-resultados');

  const activeDesktopClass = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white shadow-sm transition-all';
  const inactiveDesktopClass = 'px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all';

  if (navBtnHome) navBtnHome.className = (screenName === 'home') ? activeDesktopClass : inactiveDesktopClass;
  if (navBtnPalpites) navBtnPalpites.className = (screenName === 'palpites') ? activeDesktopClass : inactiveDesktopClass;
  if (navBtnCruz) navBtnCruz.className = (screenName === 'cruz') ? activeDesktopClass : inactiveDesktopClass;
  if (navBtnResultados) navBtnResultados.className = (screenName === 'resultados') ? activeDesktopClass : inactiveDesktopClass;

  // Atualiza botões do Mobile Bottom Nav
  const mobBtnHome = document.getElementById('mob-btn-home');
  const mobBtnPalpites = document.getElementById('mob-btn-palpites');
  const mobBtnCruz = document.getElementById('mob-btn-cruz');
  const mobBtnResultados = document.getElementById('mob-btn-resultados');

  const setMobBtnActive = (btn, isActive, activeColor = 'text-indigo-400') => {
    if (!btn) return;
    if (isActive) {
      btn.className = `flex flex-col items-center gap-1 ${activeColor} font-bold transition-colors`;
    } else {
      btn.className = 'flex flex-col items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors';
    }
  };

  setMobBtnActive(mobBtnHome, screenName === 'home', 'text-indigo-400');
  setMobBtnActive(mobBtnPalpites, screenName === 'palpites', 'text-indigo-400');
  setMobBtnActive(mobBtnCruz, screenName === 'cruz', 'text-cyan-400');
  setMobBtnActive(mobBtnResultados, screenName === 'resultados', 'text-emerald-400');

  // Fecha o menu lateral caso esteja aberto
  if (typeof closeDrawer === 'function') {
    closeDrawer();
  }

  // Rola suavemente ao topo
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Dispara carregamentos sob demanda se necessário
  if (screenName === 'cruz') {
    loadCruzModalContent();
  } else if (screenName === 'puxadas') {
    loadPuxadasModalContent();
  } else if (screenName === 'atrasados') {
    loadAtrasadosModalList();
  } else if (screenName === 'resultados') {
    loadDrawResults();
  } else if (screenName === 'home') {
    updateHomeScreenData();
  }

  // Atualiza hash da URL
  if (updateHash && window.location.hash !== `#${screenName}`) {
    history.replaceState(null, '', `#${screenName}`);
  }
};

// Retrocompatibilidade
window.switchMainTab = function(tabName, updateHash = true) {
  window.switchScreen(tabName, updateHash);
};

/* ==========================================================================
   GERENCIADOR DE 3 TÓPICOS NA TELA DE PALPITES
   Tópicos: 'animals', 'duques', 'fixed'
   ========================================================================== */
window.switchPalpitesTopic = function(topicName) {
  const topics = ['animals', 'duques', 'fixed'];
  if (!topics.includes(topicName)) topicName = 'animals';

  topics.forEach(t => {
    const btn = document.getElementById(`topic-tab-${t}`);
    const content = document.getElementById(`topic-content-${t}`);

    if (btn) {
      if (t === topicName) {
        btn.className = 'py-2.5 px-2 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-1.5 bg-indigo-600 text-white shadow-md shadow-indigo-600/30 active:scale-95 cursor-pointer';
      } else {
        btn.className = 'py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800 active:scale-95 cursor-pointer';
      }
    }

    if (content) {
      content.classList.toggle('hidden', t !== topicName);
    }
  });
};

/* ==========================================================================
   TOGGLE LISTAS INDIVIDUAIS (GRUPOS, DEZENAS, CENTENAS, MILHARES)
   ========================================================================== */
window.toggleRawListsSection = function() {
  const container = document.getElementById('raw-lists-container');
  const arrow = document.getElementById('raw-lists-toggle-arrow');
  const label = document.getElementById('raw-lists-toggle-label');
  if (!container) return;

  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    if (arrow) arrow.textContent = '▲';
    if (label) label.textContent = 'Ocultar Listas Individuais de Grupos, Dezenas, Centenas e Milhares';
  } else {
    container.classList.add('hidden');
    if (arrow) arrow.textContent = '▼';
    if (label) label.textContent = 'Ver Listas Individuais de Grupos, Dezenas, Centenas e Milhares';
  }
};

/* ==========================================================================
   ATUALIZAR DADOS DINÂMICOS DA TELA HOME
   ========================================================================== */
function updateHomeScreenData() {
  const tenant = api.getCurrentTenant();
  const userNameEl = document.getElementById('home-user-name');
  if (userNameEl) {
    if (tenant) {
      if (tenant.role === 'admin') {
        userNameEl.innerHTML = `K. Vinicius (KVS) <span class="ml-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold font-sans align-middle shadow-sm">👑 Master</span>`;
      } else {
        userNameEl.textContent = tenant.name || 'Testador Convidado';
      }
    } else {
      userNameEl.textContent = 'Convidado';
    }
  }

  const todayEl = document.getElementById('home-today-date');
  if (todayEl) {
    const now = new Date();
    const options = { weekday: 'short', day: 'numeric', month: 'short' };
    todayEl.textContent = now.toLocaleDateString('pt-BR', options);
  }

  const homeNextSlot = document.getElementById('home-next-slot-name');
  const targetSlotSelect = document.getElementById('target-slot');
  if (homeNextSlot && targetSlotSelect) {
    const selectedOpt = targetSlotSelect.options[targetSlotSelect.selectedIndex];
    if (selectedOpt) {
      homeNextSlot.textContent = selectedOpt.textContent;
    }
  }

  const homeSummary = document.getElementById('home-analyzed-summary');
  const analyzedCount = document.getElementById('analyzed-draws-count');
  if (homeSummary && analyzedCount && analyzedCount.textContent) {
    homeSummary.textContent = analyzedCount.textContent;
  }

  const homeTopBadge = document.getElementById('home-top-thermometer-badge');
  if (homeTopBadge) {
    if (currentPrediction && currentPrediction.top_groups && currentPrediction.top_groups.length > 0) {
      const topG = currentPrediction.top_groups[0];
      const therm = calculateConfidenceData(topG);
      homeTopBadge.innerHTML = `
        <span class="animate-pulse">${therm.flame}</span>
        <span>Destaque: ${topG.animal_name} (Gr ${String(topG.value).padStart(2, '0')})</span>
        <span class="text-[#00e676] font-black">${therm.confidence}%</span>
      `;
      homeTopBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold shadow-sm';
    } else {
      homeTopBadge.className = 'hidden';
    }
  }
}

/* ==========================================================================
   SELETOR DE ESTRATÉGIA / PERFIL DE JOGO
   ========================================================================== */
window.setPredictionStrategy = function(strat) {
  currentStrategy = strat;
  const strategies = ['hybrid', 'frequency', 'puxada', 'delay'];
  strategies.forEach((s) => {
    const btn = document.getElementById(`strat-btn-${s}`);
    if (btn) {
      if (s === strat) {
        btn.className = 'px-2.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30';
      } else {
        btn.className = 'px-2.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 transition-all flex items-center justify-center gap-1.5';
      }
    }
  });

  const badge = document.getElementById('strategy-desc-badge');
  if (badge) {
    if (strat === 'hybrid') {
      badge.textContent = 'Anti-Aleatoriedade Ativa (Equilíbrio Geral)';
      badge.className = 'text-[10px] text-indigo-400 font-semibold hidden sm:inline';
    } else if (strat === 'frequency') {
      badge.textContent = 'Foco em Momentum e Repetição';
      badge.className = 'text-[10px] text-amber-400 font-semibold hidden sm:inline';
    } else if (strat === 'puxada') {
      badge.textContent = 'Foco em Puxadas Tradicionais (+8 pts)';
      badge.className = 'text-[10px] text-violet-400 font-semibold hidden sm:inline';
    } else if (strat === 'delay') {
      badge.textContent = 'Caçador de Atrasos Críticos';
      badge.className = 'text-[10px] text-rose-400 font-semibold hidden sm:inline';
    }
  }

  loadPrediction();
};

/* ==========================================================================
   SUB-FILTRO DE CATEGORIAS DE PALPITES (TODOS, HÍBRIDO, BICHO FIXO, ETC.)
   ========================================================================== */
window.filterPredictionsCategory = function(category) {
  const secHybrid = document.getElementById('section-hybrid');
  const secAnimals = document.getElementById('section-animals');
  const secDDZ = document.getElementById('section-ddz');
  const secFixed = document.getElementById('section-fixed');
  const secGroups = document.getElementById('section-groups');
  const secTens = document.getElementById('section-tens');
  const secHundreds = document.getElementById('section-hundreds');
  const secThousands = document.getElementById('section-thousands');

  const categories = ['all', 'hybrid', 'animals', 'ddz', 'fixed', 'groups', 'tens', 'hundreds', 'thousands'];
  categories.forEach((cat) => {
    const btn = document.getElementById(`pred-cat-${cat}`);
    if (btn) {
      if (cat === category) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-indigo-600 text-white shadow-sm shrink-0';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 shrink-0 transition-all';
      }
    }
  });

  const showAll = category === 'all';
  if (secHybrid) secHybrid.classList.toggle('hidden', !showAll && category !== 'hybrid');
  if (secAnimals) secAnimals.classList.toggle('hidden', !showAll && category !== 'animals');
  if (secDDZ) secDDZ.classList.toggle('hidden', !showAll && category !== 'ddz');
  if (secFixed) secFixed.classList.toggle('hidden', !showAll && category !== 'fixed');
  if (secGroups) secGroups.classList.toggle('hidden', !showAll && category !== 'groups');
  if (secTens) secTens.classList.toggle('hidden', !showAll && category !== 'tens');
  if (secHundreds) secHundreds.classList.toggle('hidden', !showAll && category !== 'hundreds');
  if (secThousands) secThousands.classList.toggle('hidden', !showAll && category !== 'thousands');
};

function setDefaultDate() {
  const dateInput = document.getElementById('target-date');
  if (dateInput && !dateInput.value) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
  }
}

async function initSlotSelector(lottery = currentLottery) {
  const slotSelect = document.getElementById('target-slot');
  if (!slotSelect) return;

  try {
    const slots = await api.getSlots(lottery);
    standardSlotsList = slots;
    slotSelect.innerHTML = '';

    if (!slots || slots.length === 0) {
      renderSlotPillsUI([], null);
      return;
    }

    // Determina horário automático baseado no horário atual e grade da loteria
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    let defaultSlot = slots[0].code;

    for (const s of slots) {
      if (s.time) {
        const parts = s.time.split(':');
        const sMin = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
        if (minutes <= sMin) {
          defaultSlot = s.code;
          break;
        }
      }
    }

    slots.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = `${s.name}`;
      if (s.code === defaultSlot) opt.selected = true;
      slotSelect.appendChild(opt);
    });

    renderSlotPillsUI(slots, defaultSlot);
  } catch (err) {
    console.error('Erro ao inicializar horários:', err);
  }
}

window.toggleLotteryFilterCard = function() {
  const body = document.getElementById('lottery-filter-body');
  const icon = document.getElementById('toggle-lottery-icon');
  const text = document.getElementById('toggle-lottery-text');
  if (!body) return;
  const isHidden = body.classList.contains('hidden');
  if (isHidden) {
    body.classList.remove('hidden');
    if (icon) icon.style.transform = 'rotate(0deg)';
    if (text) text.textContent = 'Recolher';
  } else {
    body.classList.add('hidden');
    if (icon) icon.style.transform = 'rotate(180deg)';
    if (text) text.textContent = 'Expandir';
  }
};

window.selectSlotFromPill = async function(slotCode) {
  const slotSelect = document.getElementById('target-slot');
  if (slotSelect) {
    slotSelect.value = slotCode;
  }
  updateSlotPillsUI(slotCode);
  await Promise.all([loadPrediction(), loadDrawResults()]);
  updateHomeScreenData();
};

function updateSlotPillsUI(activeSlotCode) {
  const pillsContainer = document.getElementById('lottery-slots-pills');
  if (!pillsContainer) return;

  const badge = document.getElementById('active-slot-badge');
  let activeName = '';

  pillsContainer.querySelectorAll('.slot-pill-btn').forEach((btn) => {
    const code = btn.getAttribute('data-slot');
    const name = btn.getAttribute('data-slot-name') || code;
    if (code === activeSlotCode) {
      activeName = name;
      btn.className = 'slot-pill-btn px-3 py-1.5 rounded-xl text-xs font-black transition-all bg-[#00e676] text-slate-950 border-2 border-[#00e676] shadow-md shadow-[#00e676]/20 cursor-pointer flex items-center gap-1.5';
    } else {
      btn.className = 'slot-pill-btn px-3 py-1.5 rounded-xl text-xs font-bold transition-all bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 cursor-pointer flex items-center gap-1.5';
    }
  });

  if (badge) {
    badge.textContent = activeName ? `${activeName} Selecionado` : (activeSlotCode || 'Selecionado');
  }
}

function renderSlotPillsUI(slots, activeSlotCode) {
  const pillsContainer = document.getElementById('lottery-slots-pills');
  if (!pillsContainer) return;
  pillsContainer.innerHTML = '';

  if (!slots || slots.length === 0) {
    pillsContainer.innerHTML = '<span class="text-xs text-slate-500 italic">Nenhum horário disponível no momento.</span>';
    const badge = document.getElementById('active-slot-badge');
    if (badge) badge.textContent = 'Sem horários';
    return;
  }

  slots.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot-pill-btn';
    btn.setAttribute('data-slot', s.code);
    btn.setAttribute('data-slot-name', s.name || s.code);
    btn.onclick = () => window.selectSlotFromPill(s.code);
    btn.innerHTML = `<span>⏰</span><span>${s.name || s.code}</span>`;
    pillsContainer.appendChild(btn);
  });

  updateSlotPillsUI(activeSlotCode);
}

function updateLotteryButtonsUI() {
  const lotNames = {
    'RJ': 'Rio de Janeiro (RJ)',
    'LOOK': 'Look Goiás (LOOK)',
    'NACIONAL': 'Loteria Nacional',
    'SP': 'São Paulo (SP)',
    'FEDERAL': 'Loteria Federal'
  };
  const pureNames = {
    'RJ': 'Rio de Janeiro',
    'LOOK': 'Look Goiás',
    'NACIONAL': 'Loteria Nacional',
    'SP': 'São Paulo',
    'FEDERAL': 'Loteria Federal'
  };
  const badge = document.getElementById('active-lottery-badge');
  if (badge) {
    badge.textContent = lotNames[currentLottery] || currentLottery;
  }
  const slotsLotteryName = document.getElementById('slots-lottery-name');
  if (slotsLotteryName) {
    slotsLotteryName.textContent = pureNames[currentLottery] || currentLottery;
  }
  const globalSelect = document.getElementById('global-lottery-select');
  if (globalSelect) {
    globalSelect.value = currentLottery;
  }
  document.querySelectorAll('.lottery-btn').forEach((btn) => {
    const lot = btn.getAttribute('data-lottery');
    const isColSpan2 = (lot === 'NACIONAL');
    const colClass = isColSpan2 ? 'col-span-2 ' : '';
    if (lot === currentLottery) {
      btn.className = `lottery-btn ${colClass}w-full py-2.5 sm:py-3 px-3 rounded-xl text-xs sm:text-sm font-black transition-all text-center flex items-center justify-center gap-1.5 bg-[#00e676] text-slate-950 border-2 border-[#00e676] shadow-lg shadow-[#00e676]/25 cursor-pointer`;
    } else {
      btn.className = `lottery-btn ${colClass}w-full py-2.5 sm:py-3 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all text-center flex items-center justify-center gap-1.5 bg-[#111827] hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 cursor-pointer shadow-sm`;
    }
  });
  const drawerSelect = document.getElementById('drawer-lottery-select');
  if (drawerSelect) {
    drawerSelect.value = currentLottery;
  }
}

window.switchLottery = async function(lotteryCode) {
  if (!lotteryCode || lotteryCode === currentLottery) {
    return;
  }
  currentLottery = lotteryCode;
  localStorage.setItem('bicho_active_lottery', lotteryCode);
  updateLotteryButtonsUI();
  await initSlotSelector(currentLottery);
  _puxadasDataCache = null;
  currentFixedAnimalData = null;
  await Promise.all([loadPrediction(), loadDrawResults()]);
  const viewPuxadas = document.getElementById('view-puxadas');
  if (viewPuxadas && !viewPuxadas.classList.contains('hidden')) {
    await loadPuxadasModalContent();
  }
  const viewAtrasados = document.getElementById('view-atrasados');
  if (viewAtrasados && !viewAtrasados.classList.contains('hidden')) {
    await loadAtrasadosModalList();
  }
  updateHomeScreenData();

  const lotLabels = {
    'RJ': 'Rio de Janeiro',
    'LOOK': 'Look Goiás',
    'NACIONAL': 'Nacional',
    'SP': 'São Paulo',
    'FEDERAL': 'Federal'
  };
  showToast(`Loteria alterada para ${lotLabels[lotteryCode] || lotteryCode}!`, 'info');
};

function setupEventListeners() {
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadPrediction();
      loadDrawResults();
    });
  }

  const slotSelect = document.getElementById('target-slot');
  if (slotSelect) {
    slotSelect.addEventListener('change', () => {
      updateSlotPillsUI(slotSelect.value);
      loadPrediction();
      loadDrawResults();
      updateHomeScreenData();
    });
  }

  const dateInput = document.getElementById('target-date');
  if (dateInput) {
    dateInput.addEventListener('change', () => {
      loadPrediction();
      loadDrawResults();
    });
  }

  const btnSnapshot = document.getElementById('btn-save-snapshot');
  if (btnSnapshot) {
    btnSnapshot.addEventListener('click', saveSnapshot);
  }

  const btnSyncWeb = document.getElementById('btn-sync-web');
  if (btnSyncWeb) {
    btnSyncWeb.addEventListener('click', async () => {
      btnSyncWeb.disabled = true;
      const originalText = btnSyncWeb.innerHTML;
      btnSyncWeb.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Puxando...';
      try {
        const res = await api.syncWebResults(currentLottery);
        showToast(res.message, 'success');
        await Promise.all([loadPrediction(), loadDrawResults()]);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSyncWeb.disabled = false;
        btnSyncWeb.innerHTML = originalText;
      }
    });
  }

  // Botão Puxar Resultados dedicado na aba de Resultados
  const btnSyncWebResults = document.getElementById('btn-sync-web-results');
  if (btnSyncWebResults) {
    btnSyncWebResults.addEventListener('click', async () => {
      btnSyncWebResults.disabled = true;
      const originalText = btnSyncWebResults.innerHTML;
      btnSyncWebResults.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Puxando...';
      try {
        const res = await api.syncWebResults(currentLottery);
        showToast(res.message, 'success');
        await Promise.all([loadPrediction(), loadDrawResults()]);
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSyncWebResults.disabled = false;
        btnSyncWebResults.innerHTML = originalText;
      }
    });
  }

  const btnOpenAtrasados = document.getElementById('btn-open-atrasados-modal');
  if (btnOpenAtrasados) {
    btnOpenAtrasados.addEventListener('click', () => openAtrasadosModal());
  }

  const btnSyncModal = document.getElementById('btn-sync-atrasados-modal');
  if (btnSyncModal) {
    btnSyncModal.addEventListener('click', async () => {
      btnSyncModal.disabled = true;
      const originalText = btnSyncModal.innerHTML;
      btnSyncModal.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> SINCRONIZANDO...';
      try {
        const res = await api.syncBichoCerto(currentLottery);
        showToast(res.message || 'Atrasados sincronizados!', 'success');
        await loadAtrasadosModalList();
        await loadPrediction();
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        btnSyncModal.disabled = false;
        btnSyncModal.innerHTML = originalText;
      }
    });
  }
}

async function loadPrediction() {
  const loadingEl = document.getElementById('loading-state');
  const contentEl = document.getElementById('content-state');
  const dateVal = document.getElementById('target-date')?.value;
  const slotVal = document.getElementById('target-slot')?.value;

  if (loadingEl) loadingEl.classList.remove('hidden');
  if (contentEl) contentEl.classList.add('opacity-40');

  try {
    currentPrediction = await api.getPrediction(dateVal, slotVal, currentStrategy, currentLottery);
    renderDashboard(currentPrediction);
  } catch (err) {
    showToast('Erro ao carregar análise: ' + err.message, 'error');
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
    if (contentEl) contentEl.classList.remove('opacity-40');
  }
}

window.openAtrasadosModal = async function () {
  switchScreen('atrasados');
};

window.closeAtrasadosModal = function () {
  switchScreen('home');
};

window.openCruzModal = async function () {
  switchScreen('cruz');
};

window.closeCruzModal = function () {
  switchScreen('home');
};

window.openPuxadasModal = async function () {
  switchScreen('puxadas');
};

window.closePuxadasModal = function () {
  switchScreen('home');
};

let _puxadasDataCache = null;

async function loadPuxadasModalContent(selectedGroup = null) {
  try {
    if (!_puxadasDataCache || _puxadasDataCache.lottery !== currentLottery || !selectedGroup) {
      // Radar de Puxadas sempre consulta o último resultado apurado da loteria ativa
      _puxadasDataCache = await api.getPuxadas(null, null, currentLottery);
    }
    const data = _puxadasDataCache;
    const catalog = data.catalog || {};

    const lotNames = {
      'RJ': 'Rio de Janeiro (RJ)',
      'LOOK': 'Look Goiás',
      'NACIONAL': 'Nacional',
      'SP': 'São Paulo',
      'FEDERAL': 'Federal'
    };
    const lotLabel = lotNames[currentLottery] || currentLottery;

    const subTitleEl = document.getElementById('puxadas-modal-subtitle');
    if (subTitleEl) {
      subTitleEl.textContent = `Tradição popular: animais atraídos pelo último 1º prêmio em ${lotLabel}`;
    }

    const selectEl = document.getElementById('puxadas-select-animal');
    if (selectEl && (selectEl.options.length <= 1 || !selectEl.hasChildNodes())) {
      selectEl.innerHTML = Object.values(catalog).map(c => `
        <option value="${c.group}">Grupo ${String(c.group).padStart(2, '0')} - ${c.emoji} ${c.animal}</option>
      `).join('');
    }

    const baseGroup = selectedGroup || data.base_animal?.group || 17;
    const currentBaseInfo = catalog[baseGroup] || data.base_animal;

    if (selectEl) {
      selectEl.value = String(baseGroup);
    }

    const baseContainer = document.getElementById('puxadas-base-animal-content');
    if (baseContainer) {
      const sourceSlotText = (!selectedGroup && data.base_animal?.source_slot)
        ? `<span class="text-[10px] text-amber-400 font-bold">1º Prêmio em ${data.base_animal.source_slot} • [${lotLabel}] (Milhar: ${data.base_animal.milhar})</span>`
        : `<span class="text-[10px] text-slate-400">Animal selecionado para consulta • [${lotLabel}]</span>`;

      baseContainer.innerHTML = `
        <div class="w-12 h-12 rounded-xl bg-violet-600/20 border border-violet-500/40 flex items-center justify-center text-3xl shrink-0 shadow-inner">
          ${currentBaseInfo.emoji}
        </div>
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-black text-white text-base">${currentBaseInfo.animal.toUpperCase()}</h4>
            <span class="text-xs font-mono font-bold text-violet-300">Grupo ${String(currentBaseInfo.group).padStart(2, '0')}</span>
            <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">${lotLabel}</span>
          </div>
          <div class="text-[11px] text-slate-300 mt-0.5">
            Dezenas: <span class="font-mono font-bold text-amber-200">${currentBaseInfo.tens.join(' - ')}</span>
          </div>
          <div class="mt-1">
            ${sourceSlotText}
          </div>
        </div>
      `;
    }

    const pulledAnimals = currentBaseInfo.pulled || [];
    window._currentPuxadasThousands = [];
    window._currentPuxadasHundreds = [];
    pulledAnimals.forEach(p => {
      if (p.thousands) window._currentPuxadasThousands.push(...p.thousands);
      if (p.hundreds) window._currentPuxadasHundreds.push(...p.hundreds);
    });
    window._currentPuxadasThousands = Array.from(new Set(window._currentPuxadasThousands));
    window._currentPuxadasHundreds = Array.from(new Set(window._currentPuxadasHundreds));

    const countEl = document.getElementById('puxadas-animals-count');
    if (countEl) {
      countEl.textContent = `${pulledAnimals.length} animais puxados`;
    }

    const listContainer = document.getElementById('puxadas-animals-list');
    if (listContainer) {
      listContainer.innerHTML = pulledAnimals.map(anim => {
        const hList = anim.hundreds || [];
        const mList = anim.thousands || [];

        const hundredsPills = hList.map(h => `
          <button type="button" onclick="copySingleNumber(event, '${h}', 'Centena')"
            title="Clique para copiar a centena ${h}"
            class="px-2 py-1 rounded-lg bg-cyan-950/70 border border-cyan-700/60 hover:border-cyan-400 text-cyan-200 font-mono text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm">
            ${h}
          </button>
        `).join(' ');

        const thousandsPills = mList.map(m => `
          <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')"
            title="Clique para copiar o milhar ${m}"
            class="px-2 py-1 rounded-lg bg-amber-950/70 border border-amber-600/60 hover:border-amber-400 text-amber-200 font-mono text-xs font-bold tracking-wider transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm">
            ${m}
          </button>
        `).join(' ');

        const hStr = hList.join(', ');
        const mStr = mList.join(', ');
        const allGameStr = `🐾 ${anim.animal.toUpperCase()} (Grupo ${String(anim.group).padStart(2, '0')})\n💎 Centenas: ${hStr}\n👑 Milhares: ${mStr}`;

        return `
          <div class="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-violet-500/40 transition-all space-y-3 shadow-md animate-fade-in">
            <!-- Cabeçalho do Bicho Puxado -->
            <div class="flex items-center justify-between gap-3 pb-2.5 border-b border-slate-800/80">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                  ${anim.emoji}
                </div>
                <div>
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-sm font-black text-white">${anim.animal.toUpperCase()}</span>
                    <span class="text-xs font-mono font-bold text-violet-300">Grupo ${String(anim.group).padStart(2, '0')}</span>
                  </div>
                  <span class="text-[10px] text-slate-400 font-mono">Dezenas: ${anim.tens.join(', ')}</span>
                </div>
              </div>
              <button type="button" onclick="copyCompleteAnimalCard(this, '${anim.emoji}', '${anim.animal}', '${String(anim.group).padStart(2, '0')}', '${anim.tens.join(', ')}', '${hStr}', '${mStr}')"
                class="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-violet-400 text-[11px] font-bold text-slate-200 hover:text-white transition-all flex items-center gap-1 active:scale-95 shadow-sm" title="Copiar jogo completo deste animal">
                <span>📋</span> <span>Copiar Jogo</span>
              </button>
            </div>

            <!-- Grade: Centenas Quentes & Milhares Quentes -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <!-- Bloco de Centenas Quentes -->
              <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between space-y-2">
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                      <span>💎</span> Centenas Quentes
                    </span>
                    <span class="text-[9px] text-slate-400">3 Dígitos</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    ${hundredsPills || '<span class="text-xs text-slate-500">-</span>'}
                  </div>
                </div>
                ${hList.length > 0 ? `
                <button type="button" onclick="copyCategoryList(this, '${hStr}', 'Centenas de ${anim.animal}')"
                  class="w-full mt-1.5 py-1 px-2 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/80 border border-cyan-800/50 hover:border-cyan-500 text-[10px] font-bold text-cyan-300 hover:text-white transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95">
                  <span>📋</span> <span>Copiar Centenas</span>
                </button>` : ''}
              </div>

              <!-- Bloco de Milhares Quentes -->
              <div class="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between space-y-2">
                <div>
                  <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <span>👑</span> Milhares Quentes
                    </span>
                    <span class="text-[9px] text-slate-400">4 Dígitos</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    ${thousandsPills || '<span class="text-xs text-slate-500">-</span>'}
                  </div>
                </div>
                ${mList.length > 0 ? `
                <button type="button" onclick="copyCategoryList(this, '${mStr}', 'Milhares de ${anim.animal}')"
                  class="w-full mt-1.5 py-1 px-2 rounded-lg bg-amber-950/50 hover:bg-amber-900/80 border border-amber-800/50 hover:border-amber-500 text-[10px] font-bold text-amber-300 hover:text-white transition-all flex items-center justify-center gap-1 shadow-sm active:scale-95">
                  <span>📋</span> <span>Copiar Milhares</span>
                </button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    showToast('Erro ao carregar Puxadas: ' + err.message, 'error');
  }
}

window.onPuxadasAnimalSelectChange = function (val) {
  const grp = parseInt(val, 10);
  if (grp) {
    loadPuxadasModalContent(grp);
  }
};

window.copyAllPuxadasThousands = async function (btn) {
  if (!window._currentPuxadasThousands || window._currentPuxadasThousands.length === 0) {
    showToast('Nenhuma milhar para copiar.', 'warning');
    return;
  }
  const str = window._currentPuxadasThousands.join(', ');
  const ok = await window.copyToClipboard(str, btn, 'Copiadas!');
  if (ok) {
    showToast('Todas as milhares quentes da puxada foram copiadas!', 'success');
  }
};

window.copyAllPuxadasHundreds = async function (btn) {
  if (!window._currentPuxadasHundreds || window._currentPuxadasHundreds.length === 0) {
    showToast('Nenhuma centena para copiar.', 'warning');
    return;
  }
  const str = window._currentPuxadasHundreds.join(', ');
  const ok = await window.copyToClipboard(str, btn, 'Copiadas!');
  if (ok) {
    showToast('Todas as centenas quentes da puxada foram copiadas!', 'success');
  }
};

async function loadCruzModalContent() {
  const dateVal = document.getElementById('target-date')?.value || null;

  try {
    const data = await api.getCruzDoDia(dateVal);
    window._currentCruzThousands = data.all_thousands || [];

    const subtitle = document.getElementById('cruz-modal-subtitle');
    if (subtitle) {
      subtitle.textContent = `Cruz do Dia para ${data.date} (Regra tradicional do +3)`;
    }

    const dTop = document.getElementById('cruz-digit-top');
    const dLeft = document.getElementById('cruz-digit-left');
    const dRight = document.getElementById('cruz-digit-right');
    const dBottom = document.getElementById('cruz-digit-bottom');

    if (dTop) dTop.textContent = data.digits.top;
    if (dLeft) dLeft.textContent = data.digits.left;
    if (dRight) dRight.textContent = data.digits.right;
    if (dBottom) dBottom.textContent = data.digits.bottom;

    const bichoContent = document.getElementById('cruz-bicho-dia-content');
    if (bichoContent && data.bicho_do_dia) {
      const b = data.bicho_do_dia;
      window._currentBichoDoDiaThousands = b.thousands || [];

      const milharesBichoHtml = (b.thousands || []).map(m => `
        <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')"
          title="Clique para copiar a milhar ${m}"
          class="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/40 hover:border-amber-400 text-amber-200 hover:text-amber-100 font-mono text-xs font-black transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95">
          ${m}
        </button>
      `).join(' ');

      const centenasBichoHtml = (b.hundreds || []).map(c => `
        <button type="button" onclick="copySingleNumber(event, '${c}', 'Centena')"
          title="Clique para copiar a centena ${c}"
          class="px-2 py-0.5 rounded-lg bg-slate-800/90 hover:bg-amber-950/60 border border-slate-700/80 hover:border-amber-500/50 text-slate-200 hover:text-amber-200 font-mono text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95">
          ${c}
        </button>
      `).join(' ');

      bichoContent.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-3xl shrink-0 shadow-inner">
            ${b.emoji}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-black text-white text-base tracking-wide">${b.animal.toUpperCase()}</h4>
              <span class="text-xs font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded">Grupo ${String(b.group).padStart(2, '0')}</span>
              <span class="text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50">Dez. ${b.tens.join(', ')}</span>
            </div>
            <p class="text-[11px] text-amber-300/80 mt-0.5 font-medium">Regente principal da data (extraído pela soma e ciclo numerológico da Cruz)</p>
          </div>
        </div>

        <!-- Milhares Quentes do Bicho do Dia -->
        <div class="space-y-1.5 pt-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-bold text-amber-300 flex items-center gap-1">
              <span>🔥</span> <span>MILHARES QUENTES DO ${b.animal.toUpperCase()}</span>
            </span>
            <span class="text-[10px] text-slate-400">Toque para copiar</span>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${milharesBichoHtml}
          </div>
        </div>

        <!-- Centenas Quentes do Bicho do Dia -->
        <div class="space-y-1.5 pt-1">
          <div class="flex items-center justify-between text-[11px]">
            <span class="font-bold text-amber-400/90 flex items-center gap-1">
              <span>💎</span> <span>CENTENAS QUENTES</span>
            </span>
            <button type="button" onclick="copyCategoryList(this, '${(b.hundreds || []).join(', ')}', 'Centenas de ${b.animal}')"
              class="text-[10px] text-amber-300 hover:text-amber-200 underline cursor-pointer">
              Copiar Centenas
            </button>
          </div>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${centenasBichoHtml}
          </div>
        </div>
      `;
    }

    const countEl = document.getElementById('cruz-animals-count');
    if (countEl) countEl.textContent = `${data.animals.length} animais formados`;

    const animalsContainer = document.getElementById('cruz-animals-list');
    if (animalsContainer) {
      animalsContainer.innerHTML = data.animals.map(anim => {
        const milharesHtml = anim.thousands.map(m => `
          <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')"
            title="Clique para copiar ${m}"
            class="px-2 py-0.5 rounded bg-cyan-950/70 border border-cyan-800/60 hover:border-cyan-400 text-cyan-200 font-mono text-xs font-bold transition-all cursor-pointer">
            ${m}
          </button>
        `).join(' ');

        return `
          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl shrink-0">${anim.emoji}</span>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-black text-white">${anim.animal.toUpperCase()}</span>
                  <span class="text-[10px] font-mono text-slate-400">Grupo ${String(anim.group).padStart(2, '0')}</span>
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-[10px] uppercase font-bold text-slate-500">Dezenas:</span>
                  <span class="text-xs font-mono font-bold text-cyan-300">${anim.tens.join(', ')}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2 flex-wrap sm:justify-end">
              <div class="flex items-center gap-1 flex-wrap">
                ${milharesHtml}
              </div>
              <button type="button" onclick="copyCategoryList(this, '${anim.thousands.join(', ')}', 'Milhares de ${anim.animal}')"
                class="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-300 text-xs transition-all shrink-0" title="Copiar milhares de ${anim.animal}">
                📋
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    showToast('Erro ao carregar Cruz do Dia: ' + err.message, 'error');
  }
}

window.copyAllCruzThousands = async function (btn) {
  if (!window._currentCruzThousands || window._currentCruzThousands.length === 0) {
    showToast('Nenhuma milhar carregada na Cruz.', 'warning');
    return;
  }
  const str = window._currentCruzThousands.join(', ');
  const ok = await window.copyToClipboard(str, btn, 'Copiadas!');
  if (ok) {
    showToast('Todas as milhares da Cruz do Dia foram copiadas!', 'success');
  }
};

window.copyBichoDoDiaThousands = async function (btn) {
  if (!window._currentBichoDoDiaThousands || window._currentBichoDoDiaThousands.length === 0) {
    showToast('Nenhuma milhar do Bicho do Dia disponível.', 'warning');
    return;
  }
  const str = window._currentBichoDoDiaThousands.join(', ');
  const ok = await window.copyToClipboard(str, btn, 'Copiadas!');
  if (ok) {
    showToast('Milhares quentes do Bicho do Dia copiadas com sucesso!', 'success');
  }
};

async function loadAtrasadosModalList() {
  const container = document.getElementById('atrasados-modal-list');
  if (!container) return;

  const lotBadge = document.getElementById('atrasados-lottery-badge');
  const lotLabels = {
    'RJ': 'Rio de Janeiro (RJ)',
    'LOOK': 'Look Goiás (LOOK)',
    'NACIONAL': 'Nacional (LN)',
    'SP': 'São Paulo (SP)',
    'FEDERAL': 'Federal'
  };
  if (lotBadge) {
    lotBadge.textContent = lotLabels[currentLottery] || currentLottery;
  }

  container.innerHTML = `
    <div class="text-center py-8 text-slate-400">
      <div class="inline-block w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mb-2"></div>
      <p class="text-xs">Carregando atrasados de ${lotLabels[currentLottery] || currentLottery}...</p>
    </div>
  `;

  try {
    const items = await api.getBichoCertoAtrasados(currentLottery);
    if (!items || items.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">Nenhum registro de atrasados encontrado. Clique no botão SINCRONIZAR acima.</p>';
      return;
    }

    // Renderiza a lista completa dos 25 animais ordenada do mais atrasado para o menos atrasado
    container.innerHTML = items
      .map((item) => {
        const tensHtml = (item.tens || [])
          .map((t) => `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] font-semibold border border-slate-700/50">${t}</span>`)
          .join(' ');

        return `
        <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 transition-all flex items-center justify-between gap-3 animate-fade-in">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${item.ranking_pos <= 5 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-400'}">
              #${item.ranking_pos}
            </span>
            <span class="text-2xl shrink-0">${item.animal_emoji || '🐾'}</span>
            <div>
              <div class="font-bold text-sm text-slate-100 flex items-center gap-2">
                <span>${item.animal_name}</span>
                <span class="text-xs font-mono font-normal text-slate-400">Grupo ${String(item.group_number).padStart(2, '0')}</span>
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                ${tensHtml}
              </div>
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-sm font-black text-amber-400 font-mono">${item.delay_days} dias</div>
            <div class="text-[11px] text-indigo-300 font-mono font-medium">~${item.delay_draws_est} apurações</div>
          </div>
        </div>`;
      })
      .join('');
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-rose-400 py-6 text-center">Erro ao carregar lista de atrasados: ${err.message}</p>`;
  }
}

function renderDashboard(data) {
  // Informações do Topo
  const slotNameEl = document.getElementById('header-slot-name');
  if (slotNameEl) slotNameEl.textContent = data.target_slot_name || data.target_slot;

  const analyzedCountEl = document.getElementById('analyzed-draws-count');
  if (analyzedCountEl) analyzedCountEl.textContent = `${data.total_draws_analyzed} sorteios analisados`;

  // Atualiza também os dados na Tela HOME
  updateHomeScreenData();

  // 0. Fechamento Híbrido Anti-Aleatoriedade
  renderHybridSection(data.hybrid_combo);

  // 1. Palpites Agrupados por Animal
  renderAnimalCards(data);

  // 2. Duque de Dezena Combinado (DDZ)
  renderDDZSection(data.ddz_combos || []);

  // 3. Gerador com Meu Bicho Fixo
  renderFixedAnimalSection(data);

  // 4. Grupos Fortes
  renderGroups(data.top_groups || []);

  // 5. Dezenas Fortes
  renderTens(data.top_tens || []);

  // 6. Centenas Fortes
  renderHundreds(data.top_hundreds || []);

  // 7. Milhares Fortes
  renderThousands(data.top_thousands || []);
}

/* ==========================================================================
   TERMÔMETRO DE CONFIANÇA & CONVERGÊNCIA MULTI-FATORIAL
   ========================================================================== */
function calculateConfidenceData(group) {
  const rawScore = Number(group.score || 50);
  const cruzMeta = group.metadata?.cruz_do_dia;
  const puxadaMeta = group.metadata?.puxada;
  const bcMeta = group.metadata?.bichocerto;
  const presencePct = Number(group.metadata?.presence_pct || 0);

  // Escala base calibrada de acordo com o score estatístico (58 a 86)
  let points = 58 + (Math.min(rawScore, 100) * 0.28);
  const badges = [];

  if (cruzMeta?.is_bicho_dia) {
    points += 9;
    badges.push({ icon: '🌟', label: 'Bicho do Dia da Cruz', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' });
  } else if (cruzMeta?.is_present) {
    points += 5;
    badges.push({ icon: '✨', label: 'Presente na Cruz do Dia', color: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' });
  }

  if (puxadaMeta?.is_pulled) {
    points += 7;
    const pulledName = puxadaMeta.pulled_by_name || 'Último 1º Prêmio';
    badges.push({ icon: '🧲', label: `Puxado por ${pulledName}`, color: 'bg-violet-500/20 text-violet-300 border-violet-500/40' });
  }

  if (bcMeta && bcMeta.delay_days >= 2) {
    points += 5;
    badges.push({ icon: '⏱️', label: `${bcMeta.delay_days}d sem sair na cabeça`, color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' });
  }

  if (presencePct >= 10) {
    points += 4;
    badges.push({ icon: '📈', label: `${presencePct}% no cercado recente`, color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' });
  }

  const confidence = Math.min(Math.max(Math.round(points), 68), 98);

  let level = 'Alta';
  let levelColor = 'text-emerald-400';
  let barColor = 'from-emerald-500 to-[#00e676]';
  let flame = '🔥';
  let desc = 'Sinal Quente (Alta Convergência)';

  if (confidence >= 90) {
    level = 'Máxima Força';
    levelColor = 'text-[#00e676]';
    barColor = 'from-emerald-400 via-[#00e676] to-lime-300';
    flame = '🔥';
    desc = 'Sinal Máximo • Critérios Alinhados';
  } else if (confidence >= 80) {
    level = 'Alta';
    levelColor = 'text-emerald-400';
    barColor = 'from-teal-500 to-emerald-400';
    flame = '⚡';
    desc = 'Forte Probabilidade Técnica';
  } else {
    level = 'Moderada';
    levelColor = 'text-cyan-400';
    barColor = 'from-cyan-500 to-teal-400';
    flame = '🎯';
    desc = 'Tendência Favorável';
  }

  return { confidence, level, levelColor, barColor, flame, desc, badges };
}

function renderAnimalCards(data) {
  const container = document.getElementById('animals-container');
  if (!container) return;

  const topGroups = data.top_groups || [];
  if (topGroups.length === 0) {
    container.innerHTML = '<p class="text-slate-400 py-4 text-center">Nenhum palpite calculado.</p>';
    return;
  }

  const allTens = data.top_tens || [];
  const allHundreds = data.top_hundreds || [];
  const allThousands = data.top_thousands || [];

  container.innerHTML = topGroups.map((g, idx) => {
    const grpNum = parseInt(g.value);
    const grpStr = String(grpNum).padStart(2, '0');
    const animName = g.animal_name;
    const animEmoji = g.animal_emoji || '🐾';
    const score = Number(g.score || 0);
    const therm = calculateConfidenceData(g);

    // 1. Dezenas deste animal
    let animalTens = allTens
      .filter(t => t.group_number === grpNum)
      .map(t => t.value);

    if (animalTens.length === 0 && g.tens) {
      animalTens = g.tens.slice(0, 2);
    }
    animalTens = Array.from(new Set(animalTens));

    // 2. Centenas deste animal
    let animalHundreds = allHundreds
      .filter(h => h.group_number === grpNum || animalTens.includes(h.value.slice(-2)))
      .map(h => h.value);

    if (animalHundreds.length === 0 && animalTens.length > 0) {
      animalTens.forEach(t => {
        animalHundreds.push(`0${t}`);
        animalHundreds.push(`2${t}`);
      });
    }
    animalHundreds = Array.from(new Set(animalHundreds)).slice(0, 4);

    // 3. Milhares deste animal
    // Cruz do Dia metadata
    const cruzMeta = g.metadata?.cruz_do_dia;

    let animalThousands = allThousands
      .filter(m => m.group_number === grpNum || animalTens.includes(m.value.slice(-2)))
      .map(m => m.value);

    // Prioriza milhares exclusivas da Cruz do Dia para este animal
    if (cruzMeta?.thousands && cruzMeta.thousands.length > 0) {
      animalThousands = Array.from(new Set([...cruzMeta.thousands, ...animalThousands]));
    }

    if (animalThousands.length === 0 && animalHundreds.length > 0) {
      animalHundreds.forEach(h => {
        animalThousands.push(`0${h}`);
        animalThousands.push(`1${h}`);
      });
    }
    animalThousands = Array.from(new Set(animalThousands)).slice(0, 6);

    const tensHtml = animalTens.length > 0
      ? animalTens.map(t => `<button type="button" onclick="copySingleNumber(event, '${t}', 'Dezena')" title="Clique para copiar a dezena ${t}" class="px-2.5 py-1 rounded-lg bg-indigo-950/70 border border-indigo-700/60 hover:border-indigo-400 text-indigo-200 font-mono font-black text-sm tracking-wide shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">${t}</button>`).join(' ')
      : '<span class="text-xs text-slate-500">-</span>';

    const hundredsHtml = animalHundreds.length > 0
      ? animalHundreds.map(h => `<button type="button" onclick="copySingleNumber(event, '${h}', 'Centena')" title="Clique para copiar a centena ${h}" class="px-2.5 py-1 rounded-lg bg-cyan-950/70 border border-cyan-700/60 hover:border-cyan-400 text-cyan-200 font-mono font-black text-sm tracking-wide shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">${h}</button>`).join(' ')
      : '<span class="text-xs text-slate-500">-</span>';

    const thousandsHtml = animalThousands.length > 0
      ? animalThousands.map(m => {
          const isCruzMilhar = cruzMeta?.thousands?.includes(m);
          return `<button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')" title="Clique para copiar o milhar ${m}${isCruzMilhar ? ' (Cruz do Dia)' : ''}" class="px-2.5 py-1 rounded-lg ${isCruzMilhar ? 'bg-cyan-950/80 border border-cyan-500/70 text-cyan-200' : 'bg-amber-950/70 border border-amber-600/60 text-amber-200'} font-mono font-black text-sm tracking-widest shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer relative">${m}${isCruzMilhar ? '<span class="text-[9px] text-cyan-300 ml-1">✨</span>' : ''}</button>`;
        }).join(' ')
      : '<span class="text-xs text-slate-500">-</span>';

    const tensStr = animalTens.join(', ');
    const hundredsStr = animalHundreds.join(', ');
    const thousandsStr = animalThousands.join(', ');

    return `
      <div class="card-glass p-4 sm:p-5 rounded-2xl border border-slate-800 hover:border-emerald-500/40 transition-all animate-fade-in space-y-3.5">
        <!-- Topo: Bicho, Emoji, Ranking e Termômetro -->
        <div class="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div class="flex items-center gap-3.5">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center text-3xl animal-badge shrink-0 bg-emerald-500/15 border border-emerald-500/30 shadow-inner">
              ${animEmoji}
            </div>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-black px-2.5 py-0.5 rounded-full ${idx === 0 ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm' : 'bg-slate-800 text-slate-300'}">
                  #${idx + 1}
                </span>
                <h3 class="font-black text-base sm:text-lg text-white tracking-tight">${animName}</h3>
                <span class="text-xs font-mono font-bold text-slate-400">Grupo ${grpStr}</span>
              </div>
              <div class="flex items-center gap-1.5 mt-1">
                <span class="text-[11px] ${therm.levelColor} font-bold flex items-center gap-1">
                  <span>${therm.flame}</span> <span>${therm.desc}</span>
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2.5 shrink-0">
            <button type="button" onclick="copyCompleteAnimalCard(this, '${animEmoji}', '${animName}', '${grpStr}', '${tensStr}', '${hundredsStr}', '${thousandsStr}')"
              title="Copiar jogo completo deste animal"
              class="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 text-xs font-bold text-slate-200 hover:text-white transition-all flex items-center gap-1.5 active:scale-95 shadow-sm cursor-pointer">
              <span>📋</span> <span class="hidden sm:inline">Copiar</span>
            </button>
            <div class="text-right">
              <div class="flex items-center justify-end gap-1">
                <span class="text-sm sm:text-base animate-pulse">${therm.flame}</span>
                <span class="text-xl sm:text-2xl font-black font-mono leading-none ${therm.levelColor}">${therm.confidence}%</span>
              </div>
              <div class="text-[9px] uppercase font-black tracking-wider ${therm.levelColor} mt-0.5 flex items-center justify-end gap-1">
                <span>🌡️</span> <span>${therm.level}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Barra do Termômetro e Selos de Convergência da IA -->
        <div class="p-2.5 sm:p-3 rounded-xl bg-slate-950/80 border border-slate-800/90 space-y-2">
          <div class="flex items-center justify-between text-xs flex-wrap gap-1">
            <div class="flex items-center gap-1.5">
              <span class="text-sm">${therm.flame}</span>
              <span class="text-slate-200 font-black">Termômetro de Confiança:</span>
              <span class="${therm.levelColor} font-black">${therm.desc}</span>
            </div>
            <span class="text-[11px] text-slate-400 font-mono font-bold">Convergência: ${therm.confidence}%</span>
          </div>

          <!-- Barra de Calor -->
          <div class="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden p-0.5 border border-slate-800">
            <div class="h-full rounded-full bg-gradient-to-r ${therm.barColor} transition-all duration-700 shadow-sm" style="width: ${therm.confidence}%"></div>
          </div>

          <!-- Selos de Por Que Esse Bicho Tá Forte -->
          <div class="flex items-center gap-1.5 flex-wrap pt-0.5">
            <span class="text-[9px] uppercase font-black text-slate-500 tracking-wider">Convergência:</span>
            ${therm.badges.length > 0
              ? therm.badges.map(b => `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.color} shadow-sm">${b.icon} ${b.label}</span>`).join(' ')
              : `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">📊 Estatística Regular</span>`
            }
          </div>
        </div>

        <!-- Ficha Completa: Dezenas, Centenas e Milhares do Animal -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <!-- Bloco de Dezenas -->
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-2.5">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <span>🔢</span> Dezenas
                </span>
                <span class="text-[9px] font-bold text-indigo-400">2 Dígitos</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${tensHtml}
              </div>
            </div>
            ${animalTens.length > 0 ? `
            <button type="button" onclick="copyCategoryList(this, '${tensStr}', 'Dezenas de ${animName}')"
              class="w-full mt-2 py-1.5 px-2 rounded-lg bg-indigo-950/50 hover:bg-indigo-900/80 border border-indigo-800/50 hover:border-indigo-500 text-[11px] font-bold text-indigo-300 hover:text-white transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
              <span>📋</span> <span>Copiar Dezenas</span>
            </button>` : ''}
          </div>

          <!-- Bloco de Centenas -->
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-2.5">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <span>💎</span> Centenas
                </span>
                <span class="text-[9px] font-bold text-cyan-400">3 Dígitos</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${hundredsHtml}
              </div>
            </div>
            ${animalHundreds.length > 0 ? `
            <button type="button" onclick="copyCategoryList(this, '${hundredsStr}', 'Centenas de ${animName}')"
              class="w-full mt-2 py-1.5 px-2 rounded-lg bg-cyan-950/50 hover:bg-cyan-900/80 border border-cyan-800/50 hover:border-cyan-500 text-[11px] font-bold text-cyan-300 hover:text-white transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
              <span>📋</span> <span>Copiar Centenas</span>
            </button>` : ''}
          </div>

          <!-- Bloco de Milhares -->
          <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-2.5">
            <div>
              <div class="flex items-center justify-between mb-2">
                <span class="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <span>👑</span> Milhares
                </span>
                <span class="text-[9px] font-bold text-amber-400">4 Dígitos</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                ${thousandsHtml}
              </div>
            </div>
            ${animalThousands.length > 0 ? `
            <button type="button" onclick="copyCategoryList(this, '${thousandsStr}', 'Milhares de ${animName}')"
              class="w-full mt-2 py-1.5 px-2 rounded-lg bg-amber-950/50 hover:bg-amber-900/80 border border-amber-800/50 hover:border-amber-500 text-[11px] font-bold text-amber-300 hover:text-white transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
              <span>📋</span> <span>Copiar Milhares</span>
            </button>` : ''}
          </div>
        </div>

        <!-- Rodapé da Ficha com Recomendação de Cercado -->
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/60 text-xs">
          <div class="text-[11px] text-amber-300 font-medium leading-snug">
            <span>🛡️</span> <b>Sugestão de Jogada:</b> Apostar no <b>Grupo ${grpStr}</b> e <b>Dezenas no Cercado (1º ao 5º)</b> para garantir premiação.
          </div>
          <button type="button" onclick="openFactorsModal('Grupo ${grpStr} - ${animName}', ${score}, ${JSON.stringify(g.factors || []).replace(/"/g, '&quot;')})"
            class="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors self-end sm:self-auto text-[11px]">
            Ver Fatores &rarr;
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/* ==========================================================================
   SEÇÃO: FECHAMENTO HÍBRIDO ANTI-ALEATORIEDADE
   ========================================================================== */
function renderHybridSection(hybridCombo) {
  const container = document.getElementById('hybrid-container');
  if (!container) return;

  if (!hybridCombo || !hybridCombo.tens_items || hybridCombo.tens_items.length === 0) {
    container.innerHTML = '';
    return;
  }

  const tensItems = hybridCombo.tens_items || [];
  const duques = hybridCombo.duques || [];

  const originBadgesHtml = tensItems.map((item) => {
    let badgeBg = 'bg-indigo-950/80 border-indigo-700/60 text-indigo-300';
    if (item.origin === 'puxada') {
      badgeBg = 'bg-violet-950/80 border-violet-700/60 text-violet-300';
    } else if (item.origin === 'cruz') {
      badgeBg = 'bg-cyan-950/80 border-cyan-700/60 text-cyan-300';
    } else if (item.origin === 'delay') {
      badgeBg = 'bg-rose-950/80 border-rose-700/60 text-rose-300';
    } else if (item.origin === 'frequency') {
      badgeBg = 'bg-amber-950/80 border-amber-700/60 text-amber-300';
    } else if (item.origin === 'quadrant') {
      badgeBg = 'bg-emerald-950/80 border-emerald-700/60 text-emerald-300';
    }

    return `
      <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between gap-1.5 flex-1 min-w-[130px]">
        <div class="flex items-center justify-between">
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${badgeBg} uppercase tracking-wider">${item.badge}</span>
          <span class="text-base">${item.animal_emoji || '🐾'}</span>
        </div>
        <div class="flex items-baseline justify-between mt-1">
          <button type="button" onclick="copySingleNumber(event, '${item.value}', 'Dezena')" title="Copiar dezena ${item.value}"
            class="font-mono font-black text-xl text-white hover:text-indigo-300 transition-colors cursor-pointer">
            ${item.value}
          </button>
          <span class="text-[11px] font-medium text-slate-400">${item.animal_name}</span>
        </div>
        <div class="text-[10px] text-slate-400 line-clamp-1" title="${item.reason}">
          ${item.reason}
        </div>
      </div>
    `;
  }).join('');

  const duquesGridHtml = duques.map((d) => {
    const d1 = d.tens[0];
    const d2 = d.tens[1];
    const isBalanced = d.quadrant_type === 'Baixa + Alta';
    const quadBadgeClass = isBalanced
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : 'bg-slate-800 text-slate-400 border-slate-700';

    return `
      <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-indigo-500/50 flex flex-col justify-between gap-2 group transition-all">
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-mono font-bold text-slate-500">Jogo #${d.order}</span>
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded border ${quadBadgeClass}">
            ${d.quadrant_type}
          </span>
        </div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-1 font-mono font-black text-sm">
            <span class="px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-200 group-hover:text-white transition-colors">${d1}</span>
            <span class="text-xs text-slate-500 font-bold">+</span>
            <span class="px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-200 group-hover:text-white transition-colors">${d2}</span>
          </div>
          <button type="button" onclick="copySingleNumber(event, '${d1} - ${d2}', 'Duque')" title="Copiar duque ${d1} - ${d2}"
            class="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-900/70 border border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-200 text-xs transition-all active:scale-95 shrink-0">
            📋
          </button>
        </div>
        <div class="text-[10px] text-slate-400 truncate" title="${d.animals_label}">
          ${d.animals_label}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card-glass p-4 sm:p-6 rounded-2xl border border-indigo-500/40 bg-gradient-to-b from-indigo-950/20 via-slate-900/80 to-slate-900/90 shadow-2xl space-y-4 relative overflow-hidden">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500/30 to-violet-600/30 border border-indigo-500/50 flex items-center justify-center text-2xl shadow-inner shrink-0">
            🛡️
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-base sm:text-lg font-black text-white tracking-tight">${hybridCombo.name}</h2>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase tracking-wider">Proteção Multi-Origem</span>
            </div>
            <p class="text-xs text-slate-300 mt-0.5">${hybridCombo.subtitle}</p>
          </div>
        </div>

        <button type="button" onclick="copyHybridCombo(this)"
          class="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5 active:scale-95 shrink-0">
          <span>📋</span> <span>Copiar os 10 Duques Híbridos</span>
        </button>
      </div>

      <!-- As 5 Dezenas Selecionadas e suas Origens -->
      <div>
        <div class="text-xs font-bold text-slate-300 mb-2 flex items-center justify-between">
          <span class="flex items-center gap-1.5">
            <span>🧩</span> 5 Dezenas de Fontes Independentes (Anti-Quebra de Padrão):
          </span>
          <span class="text-[11px] text-slate-400 hidden sm:inline">Puxada + Cruz + Atraso + Frequência + Quadrante</span>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          ${originBadgesHtml}
        </div>
      </div>

      <!-- Resumo de Apostas e Métricas -->
      <div class="p-3 sm:p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2 text-slate-300">
          <span class="text-indigo-400">💡</span>
          <span><strong>Como funciona:</strong> Se a banca der uma puxada, bicho atrasado ou número da cruz do dia, as 5 dezenas se cruzam e garantem o acerto no cercado (1º ao 5º).</span>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <div class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-right">
            <span class="text-[10px] text-slate-400">Total: </span>
            <span class="font-mono font-bold text-indigo-300">${hybridCombo.duques_count} duques</span>
          </div>
          <div class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-right">
            <span class="text-[10px] text-slate-400">Custo (R$ 1/cd): </span>
            <span class="font-mono font-bold text-amber-400">R$ ${hybridCombo.investment_suggested_brl.toFixed(2).replace('.', ',')}</span>
          </div>
          <div class="px-2.5 py-1 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-right">
            <span class="text-[10px] text-emerald-400">Prêmio Base: </span>
            <span class="font-mono font-bold text-emerald-300">~R$ ${hybridCombo.estimated_prize_brl.toFixed(2).replace('.', ',')}</span>
          </div>
        </div>
      </div>

      <!-- Grid dos 10 Duques -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>🎲</span> Grade dos 10 Duques Híbridos Balanceados
          </span>
          <span class="text-[11px] text-slate-500">Clique em 📋 para copiar individual</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          ${duquesGridHtml}
        </div>
      </div>
    </div>
  `;
}

window.copyHybridCombo = async function(btn) {
  if (!currentPrediction || !currentPrediction.hybrid_combo) return;
  const combo = currentPrediction.hybrid_combo;
  const lines = [
    `🛡️ FECHAMENTO HÍBRIDO ANTI-ALEATORIEDADE (1º AO 5º)`,
    `🔢 5 Dezenas Selecionadas: ${combo.tens_formatted}`,
    `🧩 Origens: ${(combo.tens_items || []).map(it => `${it.value} (${it.badge} - ${it.animal_name})`).join(', ')}`,
    ``,
    `🎲 10 Duques Balanceados (1º ao 5º):`,
    ...(combo.duques || []).map((d) => `${d.order}. ${d.tens_formatted} [${d.quadrant_type}] (${d.animals_label})`),
    ``,
    `💰 Custo Sugerido: R$ ${combo.investment_suggested_brl.toFixed(2).replace('.', ',')} (R$ 1,00/duque)`,
    `🏆 Prêmio Base: ~R$ ${combo.estimated_prize_brl.toFixed(2).replace('.', ',')} (1º ao 5º)`
  ];

  const ok = await window.copyToClipboard(lines.join('\n'), btn, 'Copiado!');
  if (ok) {
    showToast('Fechamento Híbrido copiado!', 'success');
  }
};

/* ==========================================================================
   SEÇÃO: DUQUE DE DEZENA COMBINADO (DDZ - 1º AO 5º)
   ========================================================================== */
function renderDDZSection(ddzCombos) {
  const container = document.getElementById('ddz-container');
  if (!container) return;

  cachedDDZCombos = ddzCombos || [];
  if (cachedDDZCombos.length === 0) {
    container.innerHTML = `
      <div class="card-glass p-5 rounded-2xl border border-slate-800 text-center text-slate-400 text-xs">
        Nenhum fechamento de Duque de Dezena gerado no momento.
      </div>`;
    return;
  }

  if (currentDDZIndex >= cachedDDZCombos.length) {
    currentDDZIndex = 0;
  }

  renderDDZUI();
}

function renderDDZUI() {
  const container = document.getElementById('ddz-container');
  if (!container || cachedDDZCombos.length === 0) return;

  const activeCombo = cachedDDZCombos[currentDDZIndex] || cachedDDZCombos[0];

  const tabsHtml = cachedDDZCombos.map((combo, idx) => {
    const isActive = idx === currentDDZIndex;
    const activeClasses = 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 border-indigo-500';
    const inactiveClasses = 'bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border-slate-800';
    return `
      <button type="button" onclick="switchDDZTab(${idx})"
        class="px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 shrink-0 ${isActive ? activeClasses : inactiveClasses}">
        <span>🎯</span>
        <span>${combo.name}</span>
        <span class="px-1.5 py-0.5 rounded text-[10px] ${isActive ? 'bg-indigo-700/80 text-indigo-100' : 'bg-slate-800 text-slate-400'} font-mono">${combo.duques_count} duques</span>
      </button>
    `;
  }).join('');

  const tensPills = (activeCombo.tens || []).map(t => {
    return `<button type="button" onclick="copySingleNumber(event, '${t}', 'Dezena')" title="Clique para copiar a dezena ${t}" class="px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/60 hover:border-indigo-400 text-indigo-200 font-mono font-black text-sm tracking-wider shadow-inner cursor-pointer hover:scale-105 active:scale-95 transition-all">${t}</button>`;
  }).join(' ');

  const duquesGridHtml = (activeCombo.duques || []).map((pair, pIdx) => {
    const d1 = pair[0];
    const d2 = pair[1];
    return `
      <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-indigo-500/50 flex items-center justify-between gap-2 group transition-all">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="text-[10px] font-mono font-bold text-slate-500 w-4 text-right shrink-0">${pIdx + 1}.</span>
          <div class="flex items-center gap-1 font-mono font-black text-sm shrink-0">
            <span class="px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-200 group-hover:text-white transition-colors">${d1}</span>
            <span class="text-xs text-slate-500 font-bold">+</span>
            <span class="px-2 py-0.5 rounded bg-indigo-950/70 border border-indigo-800/60 text-indigo-200 group-hover:text-white transition-colors">${d2}</span>
          </div>
        </div>
        <button type="button" onclick="copySingleNumber(event, '${d1} - ${d2}', 'Duque')" title="Copiar duque ${d1} - ${d2}"
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-900/70 border border-slate-700 hover:border-indigo-500 text-slate-400 hover:text-indigo-200 text-xs transition-all active:scale-95 shrink-0">
          📋
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card-glass p-4 sm:p-6 rounded-2xl border border-slate-800 hover:border-indigo-500/40 transition-all space-y-4">
      <!-- Topo: Título, Descrição e Botão Copiar Tudo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-2xl shadow-inner shrink-0">
            🎯
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-base sm:text-lg font-black text-white tracking-tight">Duque de Dezena Combinado (DDZ - 1º ao 5º)</h2>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase tracking-wider">Fechamento Inteligente</span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">Combinações prontas com as dezenas mais quentes calculadas para cercar do 1º ao 5º prêmio.</p>
          </div>
        </div>

        <button type="button" onclick="copyActiveDDZCombo(this)"
          class="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 flex items-center gap-1.5 active:scale-95 shrink-0">
          <span>📋</span> <span>Copiar Fechamento Completo</span>
        </button>
      </div>

      <!-- Abas dos Cercos -->
      <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        ${tabsHtml}
      </div>

      <!-- Caixa de Informações do Cerco Ativo -->
      <div class="p-3.5 sm:p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div class="text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <span>🔥 Dezenas Selecionadas no Cerco (${activeCombo.tens_count}):</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            ${tensPills}
          </div>
          <p class="text-[11px] text-slate-400 mt-2">${activeCombo.description}</p>
        </div>

        <div class="flex items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800 shrink-0">
          <div class="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-right">
            <div class="text-[10px] font-bold uppercase text-slate-400">Total de Duques</div>
            <div class="text-base sm:text-lg font-mono font-black text-indigo-300">${activeCombo.duques_count} jogos</div>
          </div>
          <div class="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-right">
            <div class="text-[10px] font-bold uppercase text-slate-400">Custo Sugerido (R$ 1/cd)</div>
            <div class="text-base sm:text-lg font-mono font-black text-amber-400">R$ ${activeCombo.investment_suggested_brl.toFixed(2).replace('.', ',')}</div>
          </div>
          <div class="px-3 py-2 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-right">
            <div class="text-[10px] font-bold uppercase text-emerald-400">Prêmio Base (1º ao 5º)</div>
            <div class="text-base sm:text-lg font-mono font-black text-emerald-300">~R$ ${activeCombo.estimated_prize_brl.toFixed(2).replace('.', ',')}</div>
          </div>
        </div>
      </div>

      <!-- Grid dos Duques Gerados -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>🎲</span> Grade de Jogos Prontos (${activeCombo.duques_count} Duques)
          </span>
          <span class="text-[11px] text-slate-500">Clique em 📋 para copiar individualmente</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          ${duquesGridHtml}
        </div>
      </div>

      <!-- Dica de Rodapé -->
      <div class="pt-2 border-t border-slate-800/60 flex items-center gap-2 text-[11px] text-slate-400">
        <span>💡</span>
        <span><strong>Regra do Duque de Dezena Combinado:</strong> Acertando 2 dezenas entre as ${activeCombo.tens_count} em qualquer um dos 5 primeiros prêmios (1º ao 5º), pelo menos um dos seus duques é premiado integralmente.</span>
      </div>
    </div>
  `;
}

window.switchDDZTab = function(idx) {
  currentDDZIndex = idx;
  renderDDZUI();
};

window.copyActiveDDZCombo = async function(btn) {
  if (!cachedDDZCombos || cachedDDZCombos.length === 0) return;
  const activeCombo = cachedDDZCombos[currentDDZIndex] || cachedDDZCombos[0];
  if (!activeCombo) return;

  const lines = [
    `🎯 DUQUE DE DEZENA COMBINADO (1º AO 5º)`,
    `📦 Fechamento: ${activeCombo.name}`,
    `🔢 Dezenas Base (${activeCombo.tens_count}): ${(activeCombo.tens || []).join(' - ')}`,
    `🎲 Total de Duques (${activeCombo.duques_count}):`,
    ...(activeCombo.duques || []).map((d, i) => `${i + 1}. ${d[0]} - ${d[1]}`),
    ``,
    `💰 Custo sugerido: R$ ${activeCombo.investment_suggested_brl.toFixed(2).replace('.', ',')} (R$ 1,00/duque)`,
    `🏆 Retorno base: ~R$ ${activeCombo.estimated_prize_brl.toFixed(2).replace('.', ',')} (1º ao 5º)`
  ];

  const ok = await window.copyToClipboard(lines.join('\n'), btn, 'Copiado!');
  if (ok) {
    showToast(`Fechamento DDZ (${activeCombo.duques_count} duques) copiado!`, 'success');
  }
};

/* ==========================================================================
   SEÇÃO: GERADOR COM MEU BICHO FIXO
   ========================================================================== */
const ALL_ANIMALS_CATALOG = [
  { group: 1, name: "Avestruz", emoji: "🪶", tens: ["01", "02", "03", "04"] },
  { group: 2, name: "Águia", emoji: "🦅", tens: ["05", "06", "07", "08"] },
  { group: 3, name: "Burro", emoji: "🫏", tens: ["09", "10", "11", "12"] },
  { group: 4, name: "Borboleta", emoji: "🦋", tens: ["13", "14", "15", "16"] },
  { group: 5, name: "Cachorro", emoji: "🐕", tens: ["17", "18", "19", "20"] },
  { group: 6, name: "Cabra", emoji: "🐐", tens: ["21", "22", "23", "24"] },
  { group: 7, name: "Carneiro", emoji: "🐏", tens: ["25", "26", "27", "28"] },
  { group: 8, name: "Camelo", emoji: "🐪", tens: ["29", "30", "31", "32"] },
  { group: 9, name: "Cobra", emoji: "🐍", tens: ["33", "34", "35", "36"] },
  { group: 10, name: "Coelho", emoji: "🐇", tens: ["37", "38", "39", "40"] },
  { group: 11, name: "Cavalo", emoji: "🐎", tens: ["41", "42", "43", "44"] },
  { group: 12, name: "Elefante", emoji: "🐘", tens: ["45", "46", "47", "48"] },
  { group: 13, name: "Galo", emoji: "🐓", tens: ["49", "50", "51", "52"] },
  { group: 14, name: "Gato", emoji: "🐈", tens: ["53", "54", "55", "56"] },
  { group: 15, name: "Jacaré", emoji: "🐊", tens: ["57", "58", "59", "60"] },
  { group: 16, name: "Leão", emoji: "🦁", tens: ["61", "62", "63", "64"] },
  { group: 17, name: "Macaco", emoji: "🐒", tens: ["65", "66", "67", "68"] },
  { group: 18, name: "Porco", emoji: "🐖", tens: ["69", "70", "71", "72"] },
  { group: 19, name: "Pavão", emoji: "🦚", tens: ["73", "74", "75", "76"] },
  { group: 20, name: "Peru", emoji: "🦃", tens: ["77", "78", "79", "80"] },
  { group: 21, name: "Touro", emoji: "🐂", tens: ["81", "82", "83", "84"] },
  { group: 22, name: "Tigre", emoji: "🐅", tens: ["85", "86", "87", "88"] },
  { group: 23, name: "Urso", emoji: "🐻", tens: ["89", "90", "91", "92"] },
  { group: 24, name: "Veado", emoji: "🦌", tens: ["93", "94", "95", "96"] },
  { group: 25, name: "Vaca", emoji: "🐄", tens: ["97", "98", "99", "00"] }
];

async function renderFixedAnimalSection(predData) {
  const container = document.getElementById('fixed-animal-container');
  if (!container) return;

  const dateVal = document.getElementById('target-date')?.value || null;
  const slotVal = document.getElementById('target-slot')?.value || null;

  try {
    if (!currentFixedAnimalData || currentFixedAnimalData.fixed_group !== currentFixedGroup) {
      currentFixedAnimalData = await api.getFixedAnimalCombo(currentFixedGroup, dateVal, slotVal, currentLottery);
    }
    renderFixedAnimalUI();
  } catch (err) {
    console.error('Erro ao carregar bicho fixo:', err);
    container.innerHTML = `
      <div class="card-glass p-4 rounded-xl border border-rose-800/40 text-rose-300 text-xs">
        Erro ao carregar fechamento com bicho fixo: ${err.message}
      </div>
    `;
  }
}

function renderFixedAnimalUI() {
  const container = document.getElementById('fixed-animal-container');
  if (!container || !currentFixedAnimalData) return;

  const data = currentFixedAnimalData;

  const selectOptionsHtml = ALL_ANIMALS_CATALOG.map(a => {
    const isSel = a.group === currentFixedGroup ? 'selected' : '';
    return `<option value="${a.group}" ${isSel}>Grupo ${String(a.group).padStart(2, '0')} - ${a.emoji} ${a.name} (${a.tens.join(', ')})</option>`;
  }).join('');

  const fixedTensHtml = (data.fixed_tens || []).map(t => {
    return `<button type="button" onclick="copySingleNumber(event, '${t}', 'Dezena Fixa')" title="Copiar dezena ${t}" class="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-600/70 text-amber-200 font-mono font-black text-sm tracking-wider cursor-pointer hover:scale-105 active:scale-95 transition-all">${t}</button>`;
  }).join(' ');

  const compTensHtml = (data.complementary_tens || []).map(t => {
    return `<button type="button" onclick="copySingleNumber(event, '${t}', 'Dezena Complementar')" title="Copiar dezena ${t}" class="px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-indigo-200 font-mono font-black text-sm tracking-wider cursor-pointer hover:scale-105 active:scale-95 transition-all">${t}</button>`;
  }).join(' ');

  const duquesGridHtml = (data.duques || []).map((d, idx) => {
    const d1 = d.tens[0];
    const d2 = d.tens[1];
    const hasFixed = d.has_fixed_animal;
    const borderClass = hasFixed ? 'border-amber-500/40 hover:border-amber-400' : 'border-slate-800 hover:border-indigo-500/50';

    return `
      <div class="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 border ${borderClass} flex items-center justify-between gap-2 group transition-all">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="text-[10px] font-mono font-bold text-slate-500 w-4 text-right shrink-0">${idx + 1}.</span>
          <div class="flex items-center gap-1 font-mono font-black text-sm shrink-0">
            <span class="px-2 py-0.5 rounded ${hasFixed ? 'bg-amber-950/70 border border-amber-700/60 text-amber-200' : 'bg-indigo-950/70 border border-indigo-800/60 text-indigo-200'} group-hover:text-white transition-colors">${d1}</span>
            <span class="text-xs text-slate-500 font-bold">+</span>
            <span class="px-2 py-0.5 rounded ${hasFixed ? 'bg-amber-950/70 border border-amber-700/60 text-amber-200' : 'bg-indigo-950/70 border border-indigo-800/60 text-indigo-200'} group-hover:text-white transition-colors">${d2}</span>
          </div>
        </div>
        <button type="button" onclick="copySingleNumber(event, '${d1} - ${d2}', 'Duque')" title="Copiar duque ${d1} - ${d2}"
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-900/70 border border-slate-700 hover:border-amber-500 text-slate-400 hover:text-amber-200 text-xs transition-all active:scale-95 shrink-0">
          📋
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="card-glass p-4 sm:p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/10 via-slate-900/80 to-slate-900/90 shadow-xl space-y-4 relative overflow-hidden">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/40 flex items-center justify-center text-2xl shadow-inner shrink-0">
            🎲
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-base sm:text-lg font-black text-white tracking-tight">Gerador com Meu Bicho Fixo</h2>
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase tracking-wider">Fechamento Inteligente</span>
            </div>
            <p class="text-xs text-slate-300 mt-0.5">Trave qualquer animal e o sistema cruza com 3 dezenas complementares de alta chance no 1º ao 5º.</p>
          </div>
        </div>

        <button type="button" onclick="copyFixedAnimalCombo(this)"
          class="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-black text-xs transition-all shadow-md shadow-amber-600/30 flex items-center gap-1.5 active:scale-95 shrink-0">
          <span>📋</span> <span>Copiar os 10 Duques com Bicho Fixo</span>
        </button>
      </div>

      <!-- Seletor de Animal e Visualização do Fechamento -->
      <div class="p-3.5 sm:p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div class="space-y-2 flex-1">
          <div class="flex flex-col sm:flex-row sm:items-center gap-2">
            <label for="select-fixed-animal" class="text-xs font-bold text-slate-300 uppercase tracking-wider shrink-0 flex items-center gap-1.5">
              <span>🔒</span> Escolha o Bicho Fixo:
            </label>
            <select id="select-fixed-animal" onchange="onFixedAnimalSelectChange(this.value)"
              class="bg-slate-950 border border-amber-500/50 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400">
              ${selectOptionsHtml}
            </select>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-1 text-xs">
            <div class="flex items-center gap-1.5">
              <span class="text-amber-400 font-bold">Dezenas do Bicho (${data.animal_emoji} ${data.animal_name}):</span>
              ${fixedTensHtml}
            </div>
            <div class="flex items-center gap-1.5">
              <span class="text-indigo-400 font-bold">+ Complementares:</span>
              ${compTensHtml}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-3 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800 shrink-0">
          <div class="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-right">
            <div class="text-[10px] font-bold uppercase text-slate-400">Total</div>
            <div class="text-sm font-mono font-black text-amber-300">${data.duques_count} duques</div>
          </div>
          <div class="px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 text-right">
            <div class="text-[10px] font-bold uppercase text-slate-400">Custo (R$ 1/cd)</div>
            <div class="text-sm font-mono font-black text-slate-200">R$ ${data.investment_suggested_brl.toFixed(2).replace('.', ',')}</div>
          </div>
          <div class="px-3 py-2 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-right">
            <div class="text-[10px] font-bold uppercase text-emerald-400">Prêmio (1º-5º)</div>
            <div class="text-sm font-mono font-black text-emerald-300">~R$ ${data.estimated_prize_brl.toFixed(2).replace('.', ',')}</div>
          </div>
        </div>
      </div>

      <!-- Grid dos Duques -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <span>🎯</span> Grade dos Duques Gerados com ${data.animal_emoji} ${data.animal_name}
          </span>
          <span class="text-[11px] text-slate-500">Cartões destacados em amarelo contêm o animal fixo</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
          ${duquesGridHtml}
        </div>
      </div>
    </div>
  `;
}

window.onFixedAnimalSelectChange = async function(val) {
  const grp = parseInt(val, 10);
  if (!grp || grp < 1 || grp > 25) return;
  currentFixedGroup = grp;
  const dateVal = document.getElementById('target-date')?.value || null;
  const slotVal = document.getElementById('target-slot')?.value || null;
  try {
    currentFixedAnimalData = await api.getFixedAnimalCombo(currentFixedGroup, dateVal, slotVal, currentLottery);
    renderFixedAnimalUI();
  } catch (err) {
    showToast('Erro ao atualizar bicho fixo: ' + err.message, 'error');
  }
};

window.copyFixedAnimalCombo = async function(btn) {
  if (!currentFixedAnimalData) return;
  const data = currentFixedAnimalData;
  const lines = [
    `🎲 FECHAMENTO COM BICHO FIXO (1º AO 5º)`,
    `🔒 Animal Fixo: Grupo ${String(data.fixed_group).padStart(2, '0')} - ${data.animal_emoji} ${data.animal_name}`,
    `🔢 Dezenas do Fechamento: ${data.tens_formatted}`,
    ``,
    `🎯 10 Duques de Dezena Gerados:`,
    ...(data.duques || []).map((d, i) => `${i + 1}. ${d.tens_formatted}${d.has_fixed_animal ? ' (Com Bicho Fixo)' : ''}`),
    ``,
    `💰 Custo Sugerido: R$ ${data.investment_suggested_brl.toFixed(2).replace('.', ',')} (R$ 1,00/duque)`,
    `🏆 Retorno Base: ~R$ ${data.estimated_prize_brl.toFixed(2).replace('.', ',')} (1º ao 5º)`
  ];

  const ok = await window.copyToClipboard(lines.join('\n'), btn, 'Copiado!');
  if (ok) {
    showToast(`Fechamento com ${data.animal_name} copiado!`, 'success');
  }
};

function renderGroups(groups) {
  const container = document.getElementById('groups-container');
  if (!container) return;

  if (!groups || groups.length === 0) {
    container.innerHTML = '<p class="text-slate-400 py-4 text-center">Nenhum grupo calculado.</p>';
    return;
  }

  container.innerHTML = groups
    .map((g, idx) => {
      const tensHtml = (g.tens || [])
        .map((t) => `<span class="px-2 py-0.5 text-xs font-mono rounded bg-slate-800 text-indigo-300 font-semibold border border-indigo-900/50">${t}</span>`)
        .join(' ');

      const factorsPreview = (g.factors || [])
        .slice(0, 2)
        .map((f) => `<span class="inline-flex items-center text-xs text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 mr-1.5 mb-1">
          <span class="w-1.5 h-1.5 rounded-full ${f.type === 'positive' ? 'bg-emerald-400' : 'bg-indigo-400'} mr-1.5"></span>
          ${f.name}
        </span>`)
        .join('');

      const bcBadge = g.metadata?.bichocerto
        ? `<div class="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
             <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30">
               <span>🕒</span> ${g.metadata.bichocerto.delay_days} dias sem sair (~${g.metadata.bichocerto.delay_draws_est} sorteios no RJ)
             </span>
           </div>`
        : '';

      const presencePct = g.metadata?.presence_pct;
      const presenceBadge = (presencePct !== undefined && presencePct !== null)
        ? `<div class="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
             <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30">
               <span>📈</span> ${presencePct}% de presença no cercado (últimos 30 sorteios)
             </span>
           </div>`
        : '';

      const therm = calculateConfidenceData(g);

      return `
      <div class="card-glass p-4 relative overflow-hidden group hover:border-emerald-500/40 transition-all animate-fade-in">
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl animal-badge shrink-0 bg-emerald-500/15 border border-emerald-500/30 shadow-inner">
              ${g.animal_emoji || '🐾'}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-bold px-2 py-0.5 rounded-full ${idx === 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-400'}">
                  #${idx + 1}
                </span>
                <h3 class="font-bold text-base text-slate-100">Grupo ${g.value} - ${g.animal_name}</h3>
              </div>
              <div class="mt-1 flex flex-wrap gap-1">
                ${tensHtml}
              </div>
              ${bcBadge}
              ${presenceBadge}
            </div>
          </div>
          <div class="text-right shrink-0">
            <div class="flex items-center justify-end gap-1">
              <span class="text-sm animate-pulse">${therm.flame}</span>
              <span class="text-xl font-black font-mono tracking-tight ${therm.levelColor}">${therm.confidence}%</span>
            </div>
            <div class="text-[9px] uppercase font-bold tracking-wider ${therm.levelColor}">
              ${therm.level}
            </div>
          </div>
        </div>

        <div class="flex items-center justify-between mb-1 text-[11px]">
          <span class="text-slate-400 font-bold flex items-center gap-1">
            <span>🌡️</span> Termômetro: <span class="${therm.levelColor} font-black">${therm.desc}</span>
          </span>
          <span class="text-[10px] text-slate-500 font-mono">Score: ${g.score.toFixed(1)}</span>
        </div>
        <div class="w-full bg-slate-900 rounded-full h-2 mb-3 overflow-hidden p-0.5 border border-slate-800">
          <div class="h-full rounded-full bg-gradient-to-r ${therm.barColor} transition-all duration-500" style="width: ${therm.confidence}%"></div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
          <div class="flex flex-wrap items-center">
            ${factorsPreview}
          </div>
          <button onclick="openFactorsModal('Grupo ${g.value} - ${g.animal_name}', ${g.score}, ${JSON.stringify(g.factors).replace(/"/g, '&quot;')})"
            class="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors">
            Ver Fatores 
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>`;
    })
    .join('');
}

function renderTens(tens) {
  const container = document.getElementById('tens-container');
  if (!container) return;

  if (!tens || tens.length === 0) {
    container.innerHTML = '<p class="text-slate-400 py-4 text-center col-span-2">Nenhuma dezena calculada.</p>';
    return;
  }

  container.innerHTML = tens
    .map(
      (t, idx) => {
        const presencePct = t.metadata?.presence_pct;
        const presenceBadge = (presencePct !== undefined && presencePct !== null)
          ? `<span class="inline-block text-[10px] text-emerald-400 font-semibold ml-1.5 px-1.5 py-0.2 rounded bg-emerald-950/40 border border-emerald-800/40" title="Presente em ${presencePct}% dos últimos 30 sorteios no cercado">📈 ${presencePct}%</span>`
          : '';

        return `
    <div class="card-glass p-3 flex items-center justify-between hover:border-indigo-500/40 hover:bg-slate-800/60 transition-all animate-fade-in group">
      <div class="flex items-center gap-3 cursor-pointer" onclick="openFactorsModal('Dezena ${t.value} (${t.animal_name})', ${t.score}, ${JSON.stringify(t.factors).replace(/"/g, '&quot;')})">
        <span class="text-lg font-black font-mono text-indigo-300 w-9 h-9 rounded-lg bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center shrink-0">
          ${t.value}
        </span>
        <div>
          <div class="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
            <span>${t.animal_emoji || '🐾'}</span>
            <span>${t.animal_name}</span>
          </div>
          <div class="text-[11px] text-slate-400 flex items-center">
            <span>Grupo ${String(t.group_number).padStart(2, '0')}</span>
            ${presenceBadge}
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" onclick="copySingleNumber(event, '${t.value}', 'Dezena')" title="Copiar dezena ${t.value}"
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-indigo-950 border border-slate-700 hover:border-indigo-500 text-slate-300 hover:text-indigo-300 text-xs transition-all">
          📋
        </button>
        <div class="text-right cursor-pointer" onclick="openFactorsModal('Dezena ${t.value} (${t.animal_name})', ${t.score}, ${JSON.stringify(t.factors).replace(/"/g, '&quot;')})">
          <span class="text-sm font-bold text-emerald-400">${t.score.toFixed(1)}</span>
          <div class="text-[10px] text-slate-400">pts</div>
        </div>
      </div>
    </div>`;
      }
    )
    .join('');
}

function renderHundreds(hundreds) {
  const container = document.getElementById('hundreds-container');
  if (!container) return;

  if (!hundreds || hundreds.length === 0) {
    container.innerHTML = '<p class="text-slate-400 py-4 text-center">Nenhuma centena calculada.</p>';
    return;
  }

  const allVals = hundreds.map(h => h.value).join(', ');

  const headerHtml = `
    <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
      <span class="text-xs text-slate-400 font-medium">Top ${hundreds.length} centenas</span>
      <button type="button" onclick="copyCategoryList(this, '${allVals}', 'Centenas')"
        class="px-2.5 py-1 rounded-lg bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-800/60 hover:border-cyan-500 text-cyan-300 text-xs font-bold transition-all flex items-center gap-1 active:scale-95">
        <span>📋</span> <span>Copiar Todas</span>
      </button>
    </div>
  `;

  container.innerHTML = headerHtml + hundreds
    .map(
      (h) => `
    <div class="card-glass p-3 flex items-center justify-between hover:border-cyan-500/40 hover:bg-slate-800/60 transition-all animate-fade-in group">
      <div class="flex items-center gap-2.5 cursor-pointer" onclick="openFactorsModal('Centena ${h.value} (${h.animal_name})', ${h.score}, ${JSON.stringify(h.factors).replace(/"/g, '&quot;')})">
        <span class="text-base font-black font-mono text-cyan-300 px-2.5 py-1 rounded bg-cyan-950/50 border border-cyan-800/50">
          ${h.value}
        </span>
        <div>
          <div class="text-xs font-semibold text-slate-200 flex items-center gap-1">
            <span>${h.animal_emoji || '🐾'}</span>
            <span>${h.animal_name}</span>
          </div>
          <div class="text-[10px] text-slate-400">Dezena ${h.metadata?.ten || h.value.slice(-2)}</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" onclick="copySingleNumber(event, '${h.value}', 'Centena')" title="Copiar centena ${h.value}"
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-300 text-xs transition-all">
          📋
        </button>
        <div class="text-right cursor-pointer" onclick="openFactorsModal('Centena ${h.value} (${h.animal_name})', ${h.score}, ${JSON.stringify(h.factors).replace(/"/g, '&quot;')})">
          <span class="text-xs font-bold text-emerald-400">${h.score.toFixed(1)}</span>
          <div class="text-[9px] text-slate-400">pts</div>
        </div>
      </div>
    </div>`
    )
    .join('');
}

function renderThousands(thousands) {
  const container = document.getElementById('thousands-container');
  if (!container) return;

  if (!thousands || thousands.length === 0) {
    container.innerHTML = '<p class="text-slate-400 py-4 text-center">Nenhum milhar calculado.</p>';
    return;
  }

  const allVals = thousands.map(m => m.value).join(', ');

  const headerHtml = `
    <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
      <span class="text-xs text-slate-400 font-medium">Top ${thousands.length} milhares</span>
      <button type="button" onclick="copyCategoryList(this, '${allVals}', 'Milhares')"
        class="px-2.5 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900 border border-amber-800/60 hover:border-amber-500 text-amber-300 text-xs font-bold transition-all flex items-center gap-1 active:scale-95">
        <span>📋</span> <span>Copiar Todos</span>
      </button>
    </div>
  `;

  container.innerHTML = headerHtml + thousands
    .map(
      (m) => `
    <div class="card-glass p-3 flex items-center justify-between hover:border-amber-500/40 hover:bg-slate-800/60 transition-all animate-fade-in group">
      <div class="flex items-center gap-2.5 cursor-pointer" onclick="openFactorsModal('Milhar ${m.value} (${m.animal_name})', ${m.score}, ${JSON.stringify(m.factors).replace(/"/g, '&quot;')})">
        <span class="text-base font-black font-mono text-amber-300 px-2.5 py-1 rounded bg-amber-950/50 border border-amber-800/50">
          ${m.value}
        </span>
        <div>
          <div class="text-xs font-semibold text-slate-200 flex items-center gap-1">
            <span>${m.animal_emoji || '🐾'}</span>
            <span>${m.animal_name}</span>
          </div>
          <div class="text-[10px] text-slate-400">Centena ${m.value.slice(-3)}</div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button type="button" onclick="copySingleNumber(event, '${m.value}', 'Milhar')" title="Copiar milhar ${m.value}"
          class="p-1.5 rounded-lg bg-slate-800 hover:bg-amber-950 border border-slate-700 hover:border-amber-500 text-slate-300 hover:text-amber-300 text-xs transition-all">
          📋
        </button>
        <div class="text-right cursor-pointer" onclick="openFactorsModal('Milhar ${m.value} (${m.animal_name})', ${m.score}, ${JSON.stringify(m.factors).replace(/"/g, '&quot;')})">
          <span class="text-xs font-bold text-emerald-400">${m.score.toFixed(1)}</span>
          <div class="text-[9px] text-slate-400">pts</div>
        </div>
      </div>
    </div>`
    )
    .join('');
}

async function saveSnapshot() {
  const dateVal = document.getElementById('target-date')?.value;
  const slotVal = document.getElementById('target-slot')?.value;

  if (!dateVal || !slotVal) {
    showToast('Selecione data e horário para salvar a análise.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-save-snapshot');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin inline-block mr-2">⏳</span> Congelando...';
  }

  try {
    const res = await api.createSnapshot(dateVal, slotVal, currentLottery);
    showToast(`Análise [${currentLottery}] para ${slotVal} (${dateVal}) congelada com sucesso! Código #${res.snapshot_id}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/></svg>
        Salvar Análise para Auditoria
      `;
    }
  }
}

// Modal de Fatores
window.openFactorsModal = function (title, score, factors) {
  const modal = document.getElementById('factors-modal');
  const titleEl = document.getElementById('modal-title');
  const scoreEl = document.getElementById('modal-score');
  const listEl = document.getElementById('modal-factors-list');

  if (!modal || !titleEl || !listEl) return;

  titleEl.textContent = title;
  if (scoreEl) scoreEl.textContent = `${score.toFixed(1)} pts`;

  if (!factors || factors.length === 0) {
    listEl.innerHTML = '<p class="text-slate-400 text-center py-4">Nenhum fator preponderante registrado.</p>';
  } else {
    listEl.innerHTML = factors
      .map(
        (f) => `
      <div class="p-3 rounded-lg bg-slate-800/80 border border-slate-700/60 mb-2">
        <div class="flex items-center justify-between mb-1">
          <div class="font-semibold text-sm text-slate-100 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${f.type === 'positive' ? 'bg-emerald-400' : 'bg-indigo-400'}"></span>
            ${f.name}
          </div>
          <span class="text-xs font-mono font-bold text-emerald-400">+${f.impact_points.toFixed(1)} pts</span>
        </div>
        <p class="text-xs text-slate-300 ml-4">${f.description}</p>
      </div>`
      )
      .join('');
  }

  modal.classList.remove('hidden');
};

window.closeFactorsModal = function () {
  const modal = document.getElementById('factors-modal');
  if (modal) modal.classList.add('hidden');
};

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white',
    error: 'bg-rose-600 text-white',
    warning: 'bg-amber-600 text-white',
    info: 'bg-indigo-600 text-white',
  };

  toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-2xl transition-all duration-300 animate-fade-in ${colors[type] || colors.info}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

window.copyToClipboard = async function (text, btnElement = null, successLabel = 'Copiado!') {
  if (!text) return false;
  let success = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      success = true;
    }
  } catch (e) {
    console.warn('Clipboard API error, tentando fallback execCommand', e);
  }

  if (!success) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      success = document.execCommand('copy');
      textarea.remove();
    } catch (err) {
      console.error('Fallback copy falhou', err);
    }
  }

  if (btnElement && success) {
    const origHtml = btnElement.innerHTML;
    const origClass = btnElement.className;
    btnElement.innerHTML = `<span>✓</span> <span>${successLabel}</span>`;
    btnElement.classList.add('!bg-emerald-600', '!text-white', '!border-emerald-400');
    setTimeout(() => {
      btnElement.innerHTML = origHtml;
      btnElement.className = origClass;
    }, 1800);
  }

  return success;
};

window.copyCategoryList = async function (btn, numbersStr, label) {
  if (!numbersStr) return;
  const ok = await window.copyToClipboard(numbersStr, btn, 'Copiado!');
  if (ok) {
    showToast(`${label} copiado(as): ${numbersStr}`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};

window.copySingleNumber = async function (event, num, type) {
  if (event) event.stopPropagation();
  const ok = await window.copyToClipboard(num);
  if (ok) {
    showToast(`${type} ${num} copiado!`, 'success');
  }
};

window.copyCompleteAnimalCard = async function (btn, emoji, name, group, tens, hundreds, thousands) {
  const lines = [
    `🐾 ${emoji} ${name.toUpperCase()} - GRUPO ${group}`,
    `🔢 Dezenas: ${tens || '-'}`,
    `💎 Centenas: ${hundreds || '-'}`,
    `👑 Milhares: ${thousands || '-'}`,
    `🛡️ Sugestão: Grupo ${group} e Dezenas no Cercado (1º ao 5º)`
  ];
  const ok = await window.copyToClipboard(lines.join('\n'), btn, 'Copiado!');
  if (ok) {
    showToast(`Ficha de ${name} copiada com sucesso!`, 'success');
  }
};

/* ==========================================================================
   CAMPO DE RESULTADOS DAS EXTRAÇÕES (HOJE E ÚLTIMOS 7 DIAS)
   ========================================================================== */

let selectedResultDate = null;
let allRecentDrawsByDate = {};
let availableDatesList = [];

async function loadDrawResults(dateOverride = null) {
  const contentEl = document.getElementById('draw-results-content');
  const summaryEl = document.getElementById('results-day-summary');
  const pillsEl = document.getElementById('results-day-pills');
  if (!contentEl) return;

  try {
    // 1. Busca os últimos 60 sorteios da base para a loteria ativa
    const resData = await api.getResults(60, 0, currentLottery);
    const items = resData?.items || [];

    // Agrupa por data: allRecentDrawsByDate[dateStr][slotCode] = draw
    allRecentDrawsByDate = {};
    items.forEach((draw) => {
      const d = draw.draw_date;
      if (!allRecentDrawsByDate[d]) allRecentDrawsByDate[d] = {};
      allRecentDrawsByDate[d][draw.slot] = draw;
    });

    // Garante que a data de hoje esteja presente na lista
    const todayStr = new Date().toISOString().split('T')[0];
    const datesSet = new Set(Object.keys(allRecentDrawsByDate));
    datesSet.add(todayStr);

    // Lista ordenada do mais recente para o mais antigo (até 8 dias)
    availableDatesList = Array.from(datesSet).sort().reverse().slice(0, 8);

    // Determina a data ativa
    if (dateOverride) {
      selectedResultDate = dateOverride;
    } else if (!selectedResultDate || !availableDatesList.includes(selectedResultDate)) {
      // Se a data de hoje tem resultados para esta loteria, seleciona hoje; senão, seleciona a data mais recente com resultados
      const todayHasDraws = allRecentDrawsByDate[todayStr] && Object.keys(allRecentDrawsByDate[todayStr]).length > 0;
      if (todayHasDraws) {
        selectedResultDate = todayStr;
      } else {
        const latestWithDraws = availableDatesList.find(d => allRecentDrawsByDate[d] && Object.keys(allRecentDrawsByDate[d]).length > 0);
        selectedResultDate = latestWithDraws || todayStr;
      }
    }

    // 2. Renderiza as Pills de Dias (Hoje, Ontem, etc.)
    if (pillsEl) {
      pillsEl.innerHTML = availableDatesList
        .map((dateStr) => {
          const isSelected = dateStr === selectedResultDate;
          const isToday = dateStr === todayStr;
          const label = getDayLabel(dateStr, todayStr);
          const drawsForDate = allRecentDrawsByDate[dateStr] || {};
          const drawnCount = Object.keys(drawsForDate).length;
          const statusDot = drawnCount > 0 ? '🟢' : '⚪';

          const activeClasses = isSelected
            ? 'bg-amber-500 text-slate-950 font-black shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
            : isToday
            ? 'bg-slate-800 text-amber-300 hover:bg-slate-700 border border-amber-500/30 font-bold'
            : 'bg-slate-900/80 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800 font-medium';

          return `
            <button type="button" onclick="selectResultDate('${dateStr}')"
              class="px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 active:scale-95 ${activeClasses}">
              <span>${label}</span>
              <span class="text-[9px]">${statusDot}</span>
            </button>
          `;
        })
        .join('');
    }

    // 3. Determina lista de horários da loteria ativa
    const slots = (standardSlotsList && standardSlotsList.length > 0)
      ? [...standardSlotsList]
      : [
          { code: 'PPT', name: 'PPT - 09:20', time: '09:20' },
          { code: 'PTM', name: 'PTM - 11:20', time: '11:20' },
          { code: 'PT', name: 'PT - 14:20', time: '14:20' },
          { code: 'PTV', name: 'PTV - 16:20', time: '16:20' },
          { code: 'PTN', name: 'PTN - 18:20', time: '18:20' },
          { code: 'COR', name: 'Coruja - 21:20', time: '21:20' },
        ];

    // Inclui dinamicamente qualquer slot que já tenha sorteio apurado nesta data (ex: FED no RJ às quartas, sábados e domingos)
    const dayDraws = allRecentDrawsByDate[selectedResultDate] || {};
    Object.keys(dayDraws).forEach((drawSlotCode) => {
      if (!slots.some(s => s.code === drawSlotCode)) {
        const slotMeta = (drawSlotCode === 'FED')
          ? { code: 'FED', name: 'Federal - 19:00', time: '19:00' }
          : { code: drawSlotCode, name: drawSlotCode, time: '' };
        slots.push(slotMeta);
      }
    });

    // Ordena os slots cronologicamente pelo horário
    slots.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    // 4. Atualiza o resumo no cabeçalho
    const drawnCount = Object.keys(dayDraws).length;
    const dateFormatted = formatDateBR(selectedResultDate);
    const dayOfWeekName = getDayOfWeekName(selectedResultDate);

    if (summaryEl) {
      summaryEl.textContent = `${dayOfWeekName}, ${dateFormatted} • ${drawnCount} de ${slots.length} extrações apuradas`;
    }

    contentEl.innerHTML = slots
      .map((slotInfo) => {
        const draw = dayDraws[slotInfo.code];
        if (draw) {
          return renderDrawSlotCard(draw, slotInfo);
        } else {
          return renderPendingSlotCard(slotInfo, selectedResultDate === todayStr);
        }
      })
      .join('');
  } catch (err) {
    console.error('Erro ao carregar campo de resultados:', err);
    contentEl.innerHTML = `<p class="text-xs text-rose-400 py-3 text-center">Erro ao carregar resultados: ${err.message}</p>`;
  }
}

function renderDrawSlotCard(draw, slotInfo) {
  const details = draw.prizes_detail || [];
  const p1 = details.find((p) => p.order === 1) || {
    number: draw.prize_1 || '',
    group: draw.group_1 || '-',
    animal_name: draw.animal_1?.name || '',
    animal_emoji: draw.animal_1?.emoji || '🐾',
    tens: draw.animal_1?.tens || [],
  };

  const otherPrizes = details.length > 1
    ? details.filter((p) => p.order > 1)
    : [
        { label: '2º', number: draw.prize_2, group: draw.groups_1_to_5?.[1] || '-', animal_emoji: '🐾', animal_name: '' },
        { label: '3º', number: draw.prize_3, group: draw.groups_1_to_5?.[2] || '-', animal_emoji: '🐾', animal_name: '' },
        { label: '4º', number: draw.prize_4, group: draw.groups_1_to_5?.[3] || '-', animal_emoji: '🐾', animal_name: '' },
        { label: '5º', number: draw.prize_5, group: draw.groups_1_to_5?.[4] || '-', animal_emoji: '🐾', animal_name: '' },
        ...(draw.prize_6 ? [{ label: '6º', number: draw.prize_6, group: '-', animal_emoji: '🐾', animal_name: '' }] : []),
        ...(draw.prize_7 ? [{ label: '7º', number: draw.prize_7, group: '-', animal_emoji: '🐾', animal_name: '' }] : []),
      ];

  const tensBadges = (p1.tens || [])
    .map((t) => `<span class="px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-500/40 text-amber-300 font-mono text-[11px] font-bold shrink-0 min-w-[22px] text-center">${t}</span>`)
    .join(' ');

  const otherPrizesHtml = otherPrizes
    .map((p) => `
      <div class="px-2 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-1.5 min-w-0 overflow-hidden">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="text-[10px] text-slate-400 font-bold shrink-0">${p.label || p.order + 'º'}</span>
          <span class="text-xs shrink-0">${p.animal_emoji || '🐾'}</span>
          <span class="text-[11px] text-slate-300 truncate">${p.animal_name || (p.group !== '-' ? 'Gr ' + p.group : '')}</span>
        </div>
        <div class="text-xs font-black font-mono text-slate-100 shrink-0">${p.number || '-'}</div>
      </div>
    `)
    .join('');

  return `
    <div class="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/30 transition-all animate-fade-in space-y-2.5 overflow-hidden">
      <!-- Topo do Card do Horário -->
      <div class="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-800/80">
        <div class="flex items-center gap-2">
          <span class="text-xs font-black uppercase tracking-wider text-slate-100">${slotInfo.name}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 shrink-0">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> APURADO
          </span>
        </div>
        <button type="button" onclick="selectSlotForPrediction('${slotInfo.code}', '${draw.draw_date}')" 
          class="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-500/60 text-[11px] text-indigo-300 hover:text-white font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95">
          <span>⚡ Palpite deste Resultado</span> &rarr;
        </button>
      </div>

      <!-- 1º Prêmio (Cabeça) -->
      <div class="p-3 rounded-lg bg-gradient-to-r from-amber-500/10 via-slate-900 to-slate-900 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 overflow-hidden">
        <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div class="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center text-xl sm:text-2xl animal-badge shrink-0 bg-amber-500/20 border border-amber-500/40 shadow-inner">
            ${p1.animal_emoji || '🐾'}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0">
                1º Prêmio (Cabeça)
              </span>
              <span class="text-xs text-slate-300 font-mono font-bold shrink-0">Grupo ${String(p1.group).padStart(2, '0')}</span>
            </div>
            <div class="text-sm sm:text-base font-black text-white truncate mt-0.5">${p1.animal_name}</div>
          </div>
        </div>

        <div class="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-slate-800/80 pt-2 sm:pt-0 shrink-0 w-full sm:w-auto">
          <div class="flex flex-col sm:items-end">
            <span class="text-[9px] uppercase font-bold text-amber-400/70 sm:hidden">Milhar Sorteada</span>
            <div class="text-2xl sm:text-3xl font-black text-amber-400 font-mono tracking-widest leading-none drop-shadow">${p1.number}</div>
          </div>
          <div class="flex flex-col sm:items-end">
            <span class="text-[9px] uppercase font-bold text-slate-400/80 sm:hidden mb-0.5 text-right">Dezenas</span>
            <div class="flex items-center justify-end gap-1 flex-wrap">
              ${tensBadges}
            </div>
          </div>
        </div>
      </div>

      <!-- Cercado (2º ao 7º) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-1.5 pt-1">
        ${otherPrizesHtml}
      </div>
    </div>
  `;
}

function renderPendingSlotCard(slotInfo, isToday) {
  const statusText = isToday
    ? `Aguardando apuração às ${slotInfo.time}. Clique em "Puxar Resultados" no topo após o horário para sincronizar.`
    : `Nenhum resultado registrado para esta extração nesta data.`;

  return `
    <div class="p-3 rounded-xl bg-slate-900/40 border border-dashed border-slate-800/80 flex items-center justify-between gap-3 animate-fade-in opacity-75 hover:opacity-100 transition-opacity">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-sm text-slate-400">
          ⏳
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-300">${slotInfo.name}</span>
            <span class="text-[9px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
              AGUARDANDO
            </span>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">${statusText}</p>
        </div>
      </div>
      <button type="button" onclick="selectSlotForPrediction('${slotInfo.code}')" 
        class="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold shrink-0">
        Gerar Palpite &rarr;
      </button>
    </div>
  `;
}

window.selectResultDate = function(dateStr) {
  selectedResultDate = dateStr;
  loadDrawResults(dateStr);
};

window.selectSlotForPrediction = function(slotCode, dateStr = null) {
  switchMainTab('palpites');
  const targetSlotEl = document.getElementById('target-slot');
  if (targetSlotEl) targetSlotEl.value = slotCode;
  if (dateStr) {
    const targetDateEl = document.getElementById('target-date');
    if (targetDateEl) targetDateEl.value = dateStr;
  }
  loadPrediction();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

function getDayLabel(dateStr, todayStr) {
  if (dateStr === todayStr) return 'Hoje';
  const dt = new Date(dateStr + 'T12:00:00');
  const todayDt = new Date(todayStr + 'T12:00:00');
  const diffDays = Math.round((todayDt - dt) / (1000 * 60 * 60 * 24));
  if (diffDays === 1) return 'Ontem';

  const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const dayName = dayNames[dt.getDay()];
  const parts = dateStr.split('-');
  return `${dayName} (${parts[2]}/${parts[1]})`;
}

function getDayOfWeekName(dateStr) {
  const dt = new Date(dateStr + 'T12:00:00');
  const dayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return dayNames[dt.getDay()];
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/* ==========================================================================
   AUTENTICAÇÃO & SESSÃO MULTI-TENANT
   ========================================================================== */
async function initTenantAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlKey = urlParams.get('key');
  if (urlKey && urlKey.trim()) {
    try {
      const tenant = await api.login(urlKey.trim());
      if (tenant) {
        showToast(`Olá, ${tenant.name || 'Testador'}! Acesso ativado.`, 'success');
        const cleanUrl = new URL(window.location);
        cleanUrl.searchParams.delete('key');
        window.history.replaceState({}, '', cleanUrl.toString());
      }
    } catch (err) {
      showToast('Chave de acesso inválida ou suspensa.', 'error');
    }
  } else {
    await api.checkSession();
  }
  updateAuthUI();
}

function updateAuthUI() {
  const badgeContainer = document.getElementById('user-badge-desktop');
  const navAdminLink = document.getElementById('nav-admin-link');
  const mobAdminLink = document.getElementById('mob-admin-link');
  const appGate = document.getElementById('app-auth-gate');
  const mainContainer = document.getElementById('main-content-container');
  const mobBottomNav = document.getElementById('mob-bottom-nav');
  const drawerUserLabel = document.getElementById('drawer-user-label');
  const drawerAdminLink = document.getElementById('drawer-admin-link');
  const tenant = api.getCurrentTenant();

  if (tenant) {
    // Usuário logado: esconde tela de login e exibe dashboard completo
    if (appGate) appGate.classList.add('hidden');
    if (mainContainer) mainContainer.classList.remove('hidden');
    if (mobBottomNav) mobBottomNav.classList.remove('hidden');
    updateHomeScreenData();

    if (tenant.role === 'admin') {
      if (navAdminLink) navAdminLink.classList.remove('hidden');
      if (mobAdminLink) mobAdminLink.classList.remove('hidden');
      if (drawerAdminLink) drawerAdminLink.classList.remove('hidden');
      if (drawerUserLabel) drawerUserLabel.textContent = 'K. Vinicius (Master)';
      if (badgeContainer) {
        badgeContainer.innerHTML = `
          <div class="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-2.5 py-1 rounded-full font-bold shadow-sm">
            <span>👑</span>
            <span class="inline">K. Vinicius</span>
            <button type="button" onclick="handleUserLogout()" class="ml-1 text-slate-400 hover:text-red-400 text-xs transition-colors" title="Desconectar">✕</button>
          </div>
        `;
      }
    } else {
      if (navAdminLink) navAdminLink.classList.add('hidden');
      if (mobAdminLink) mobAdminLink.classList.add('hidden');
      if (drawerAdminLink) drawerAdminLink.classList.add('hidden');
      if (drawerUserLabel) drawerUserLabel.textContent = tenant.name || 'Testador Convidado';
      if (badgeContainer) {
        badgeContainer.innerHTML = `
          <div class="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs px-2.5 py-1 rounded-full font-semibold shadow-sm">
            <span>👤</span>
            <span class="truncate max-w-[110px]" title="${tenant.name}">${tenant.name}</span>
            <button type="button" onclick="handleUserLogout()" class="ml-1 text-slate-400 hover:text-red-400 text-xs transition-colors" title="Sair da Conta">✕</button>
          </div>
        `;
      }
    }
  } else {
    // Não logado (Opção A): Bloqueia visualização do dashboard e exibe gate de login
    if (appGate) appGate.classList.remove('hidden');
    if (mainContainer) mainContainer.classList.add('hidden');
    if (mobBottomNav) mobBottomNav.classList.add('hidden');
    if (navAdminLink) navAdminLink.classList.add('hidden');
    if (mobAdminLink) mobAdminLink.classList.add('hidden');
    if (drawerAdminLink) drawerAdminLink.classList.add('hidden');
    if (drawerUserLabel) drawerUserLabel.textContent = 'Não Conectado';
    if (badgeContainer) badgeContainer.innerHTML = '';
  }
}

window.switchGateTab = function(tab) {
  const tabTester = document.getElementById('gate-tab-tester');
  const tabAdmin = document.getElementById('gate-tab-admin');
  const formTester = document.getElementById('gate-form-tester');
  const formAdmin = document.getElementById('gate-form-admin');

  if (tab === 'admin') {
    if (tabAdmin) tabAdmin.className = 'py-2.5 rounded-lg bg-indigo-600 text-white shadow transition-all flex items-center justify-center gap-1.5';
    if (tabTester) tabTester.className = 'py-2.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5';
    if (formAdmin) formAdmin.classList.remove('hidden');
    if (formTester) formTester.classList.add('hidden');
    const passInput = document.getElementById('gate-input-admin-pass');
    if (passInput) setTimeout(() => passInput.focus(), 50);
  } else {
    if (tabTester) tabTester.className = 'py-2.5 rounded-lg bg-indigo-600 text-white shadow transition-all flex items-center justify-center gap-1.5';
    if (tabAdmin) tabAdmin.className = 'py-2.5 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5';
    if (formTester) formTester.classList.remove('hidden');
    if (formAdmin) formAdmin.classList.add('hidden');
    const keyInput = document.getElementById('gate-input-key');
    if (keyInput) setTimeout(() => keyInput.focus(), 50);
  }
};

window.handleGateTesterLogin = async function(event) {
  event.preventDefault();
  const input = document.getElementById('gate-input-key');
  const errDiv = document.getElementById('gate-tester-error');
  const btn = document.getElementById('gate-btn-tester-submit');
  const key = input ? input.value.trim() : '';

  if (!key) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Verificando chave...';
  }
  if (errDiv) {
    errDiv.textContent = '';
    errDiv.classList.add('hidden');
  }

  try {
    const tenant = await api.login(key);
    updateAuthUI();
    showToast(`Bem-vindo, ${tenant.name || 'Testador'}! Acesso liberado.`, 'success');
  } catch (err) {
    if (errDiv) {
      errDiv.textContent = err.message || 'Chave de acesso inválida ou suspensa.';
      errDiv.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Desbloquear e Acessar Palpites';
    }
  }
};

window.handleGateAdminLogin = async function(event) {
  event.preventDefault();
  const userInput = document.getElementById('gate-input-admin-user');
  const passInput = document.getElementById('gate-input-admin-pass');
  const errDiv = document.getElementById('gate-admin-error');
  const btn = document.getElementById('gate-btn-admin-submit');

  const username = userInput ? userInput.value.trim() : 'admin';
  const password = passInput ? passInput.value.trim() : '';

  if (!password) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Autenticando Master...';
  }
  if (errDiv) {
    errDiv.textContent = '';
    errDiv.classList.add('hidden');
  }

  try {
    const tenant = await api.login({ username, password, key: password });
    if (!tenant || tenant.role !== 'admin') {
      api.logout();
      throw new Error('Credenciais não autorizadas para perfil Administrador.');
    }
    updateAuthUI();
    showToast('Acesso de Administrador Master ativado!', 'success');
  } catch (err) {
    if (errDiv) {
      errDiv.textContent = err.message || 'Usuário ou senha master incorretos.';
      errDiv.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Entrar como Administrador Master';
    }
  }
};

window.openAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  const errDiv = document.getElementById('auth-modal-error');
  const input = document.getElementById('input-access-key');
  if (errDiv) {
    errDiv.textContent = '';
    errDiv.classList.add('hidden');
  }
  if (input) {
    input.value = '';
    setTimeout(() => input.focus(), 50);
  }
  if (modal) modal.classList.remove('hidden');
};

window.closeAuthModal = function() {
  const modal = document.getElementById('auth-modal');
  if (modal) modal.classList.add('hidden');
};

window.handleUserLogin = async function(event) {
  event.preventDefault();
  const input = document.getElementById('input-access-key');
  const errDiv = document.getElementById('auth-modal-error');
  const btn = document.getElementById('btn-submit-auth');
  const key = input ? input.value.trim() : '';

  if (!key) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Verificando...';
  }
  if (errDiv) {
    errDiv.textContent = '';
    errDiv.classList.add('hidden');
  }

  try {
    const tenant = await api.login(key);
    closeAuthModal();
    updateAuthUI();
    showToast(`Bem-vindo, ${tenant.name || 'Usuário'}!`, 'success');
  } catch (err) {
    if (errDiv) {
      errDiv.textContent = err.message || 'Chave de acesso inválida.';
      errDiv.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Ativar Acesso';
    }
  }
};

window.handleUserLogout = function() {
  api.logout();
  updateAuthUI();
  showToast('Desconectado com sucesso.', 'info');
};

// =========================================================================
// CONTROLES DO MENU GAVETA LATERAL (SIDEBAR DRAWER)
// =========================================================================
window.openDrawer = function () {
  const drawer = document.getElementById('drawer-menu');
  const overlay = document.getElementById('drawer-overlay');
  if (drawer && overlay) {
    overlay.classList.remove('hidden');
    void overlay.offsetWidth; // Força recálculo do DOM para transição CSS suave
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');
    drawer.classList.remove('-translate-x-full');
    drawer.classList.add('translate-x-0');
    document.body.classList.add('overflow-hidden');
  }
};

window.closeDrawer = function () {
  const drawer = document.getElementById('drawer-menu');
  const overlay = document.getElementById('drawer-overlay');
  if (drawer && overlay) {
    drawer.classList.remove('translate-x-0');
    drawer.classList.add('-translate-x-full');
    overlay.classList.remove('opacity-100');
    overlay.classList.add('opacity-0');
    document.body.classList.remove('overflow-hidden');
    setTimeout(() => {
      if (overlay && overlay.classList.contains('opacity-0')) {
        overlay.classList.add('hidden');
      }
    }, 300);
  }
};

window.toggleDrawer = function () {
  const drawer = document.getElementById('drawer-menu');
  if (drawer && drawer.classList.contains('translate-x-0')) {
    closeDrawer();
  } else {
    openDrawer();
  }
};

window.handleDrawerLogout = function () {
  closeDrawer();
  api.logout();
  updateAuthUI();
  showToast('Desconectado com sucesso.', 'info');
};

window.saveSnapshot = saveSnapshot;


