// Remove stale cached elements if present
(function() {
  var b = document.getElementById('nav-btn-milhares-atrasadas');
  if (b) b.remove();
})();

window.API = window.api || (typeof api !== 'undefined' ? api : null);
let currentScreen = 'home';
window.currentScreen = currentScreen;
window.API_BASE = window.API_BASE || '/api';
var API_BASE = window.API_BASE;

window.setupGoogleIdentity = async function() {
  // Autenticação Google desativada - substituída pelo fluxo VIP WhatsApp
};

window.handleGoogleCredentialResponse = async function() {};

window.formatPhoneInput = function(input) {
  if (!input) return;
  let val = input.value.replace(/\D/g, '');
  if (val.length > 11) val = val.substring(0, 11);
  if (val.length > 6) {
    input.value = `(${val.substring(0, 2)}) ${val.substring(2, 7)}-${val.substring(7)}`;
  } else if (val.length > 2) {
    input.value = `(${val.substring(0, 2)}) ${val.substring(2)}`;
  } else if (val.length > 0) {
    input.value = `(${val}`;
  } else {
    input.value = '';
  }
};

window.openWhatsAppSupport = function(msg) {
  let num = (window._publicSettings?.support_whatsapp || '11941083720').replace(/\D/g, '');
  if (!num.startsWith('55') && num.length >= 10) num = '55' + num;
  const text = encodeURIComponent(msg || 'Olá! Gostaria de ajuda com meu acesso no Bicho Master Pro.');
  window.open(`https://wa.me/${num}?text=${text}`, '_blank');
};

window.openCompleteProfileModal = function() {
  const modal = document.getElementById('modal-complete-profile');
  if (modal) {
    modal.classList.remove('hidden');
    const phoneInput = document.getElementById('complete-input-phone');
    if (phoneInput) setTimeout(() => phoneInput.focus(), 100);
  }
};

window.closeCompleteProfileModal = function() {
  const modal = document.getElementById('modal-complete-profile');
  if (modal) modal.classList.add('hidden');
};

window.handleCompleteProfile = async function(event) {
  event.preventDefault();
  const phoneInput = document.getElementById('complete-input-phone');
  const passInput = document.getElementById('complete-input-password');
  const errEl = document.getElementById('complete-profile-error-msg');
  const btn = document.getElementById('btn-submit-complete-profile');

  const phone = (phoneInput?.value || '').trim();
  const password = (passInput?.value || '').trim();

  if (password && password.length < 6) {
    if (errEl) {
      errEl.textContent = 'A senha deve conter no mínimo 6 caracteres.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (errEl) errEl.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="inline-block animate-spin mr-2">⏳</span> Salvando dados...';
  }

  try {
    await api.completeProfile({ phone, password });
    closeCompleteProfileModal();
    if (typeof showToast === 'function') {
      showToast('🎉 Perfil concluído com sucesso! Aproveite seus 5 dias grátis.', 'success');
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Erro ao salvar. Tente novamente.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Salvar e Começar a Usar';
    }
  }
};

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
  await setupGoogleIdentity();
  updateLotteryButtonsUI();
  await initSlotSelector(currentLottery);
  setDefaultDate();
  try {
    await Promise.all([loadPrediction(), loadDrawResults()]);
    checkAndRenderMilharBingoBanner();
  } catch (err) {
    console.warn('Erro ao carregar dados iniciais:', err);
    try { await loadDrawResults(); } catch(e) {}
  }
  setupEventListeners();

  // Inicia monitor em tempo real para detecção instantânea de novos resultados (a cada 25 segundos)
  startInstantResultsMonitor();

  // Restaura a tela ativa do usuário (via hash, query param ou localStorage)
  const validScreens = ['home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados', 'milhares-atrasadas', 'centena-master'];
  const hash = window.location.hash.replace('#', '');
  const urlParams = new URLSearchParams(window.location.search);
  let savedScreen = null;
  try { savedScreen = localStorage.getItem('bicho_active_screen'); } catch(e) {}

  let targetScreen = 'home';
  if (hash && validScreens.includes(hash)) {
    targetScreen = hash;
  } else if (urlParams.get('tab') && validScreens.includes(urlParams.get('tab'))) {
    targetScreen = urlParams.get('tab');
  } else if (savedScreen && validScreens.includes(savedScreen)) {
    targetScreen = savedScreen;
  }

  switchScreen(targetScreen, true);
});

// Suporte ao botão voltar/avançar do navegador entre as telas
window.addEventListener('hashchange', () => {
  const validScreens = ['home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados', 'milhares-atrasadas', 'centena-master'];
  const hash = window.location.hash.replace('#', '');
  if (validScreens.includes(hash)) {
    switchScreen(hash, false);
  }
});

/* ==========================================================================
   NAVEGAÇÃO PRINCIPAL EM TELAS NORMAIS (SINGLE PAGE VIEWS)
   Telas: 'home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados'
   ========================================================================== */
window.switchScreen = function(screenName, updateHash = true) {
  const screens = ['home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados', 'milhares-atrasadas', 'centena-master', 'matriz'];
  if (!screens.includes(screenName)) screenName = 'home';
  currentScreen = screenName;
  window.currentScreen = screenName;

  // Persiste a tela ativa no localStorage para manter a mesma tela ao recarregar a página
  try {
    localStorage.setItem('bicho_active_screen', screenName);
  } catch(e) {}
  document.documentElement.removeAttribute('data-initial-screen');

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

  // Oculta a barra de loterias na tela da Cruz do Dia e no Início
  const globalLotteryBar = document.getElementById('global-lottery-bar-container');
  if (globalLotteryBar) {
    if (screenName === 'cruz' || screenName === 'home' || screenName === 'milhares-atrasadas' || screenName === 'centena-master' || screenName === 'matriz') {
      globalLotteryBar.classList.add('hidden');
    } else {
      globalLotteryBar.classList.remove('hidden');
    }
  }

  // Se estiver em palpites, exibe a seção de horários; em outras telas (como resultados ou atrasados), esconde os horários
  const slotsSection = document.getElementById('lottery-slots-section');
  if (slotsSection) {
    if (screenName === 'palpites') {
      slotsSection.classList.remove('hidden');
    } else {
      slotsSection.classList.add('hidden');
    }
  }

  // Atualiza estado visual do menu lateral
  if (typeof updateSidebarActiveUI === 'function') {
    updateSidebarActiveUI(currentLottery, screenName);
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
    const navBtnMilhares = document.getElementById('nav-btn-milhares-atrasadas');
    if (navBtnMilhares) navBtnMilhares.remove();

  // Atualiza botões do Mobile Bottom Nav (Dock Glassmorphism)
  const mobBtnHome = document.getElementById('mob-btn-home');
  const mobBtnPalpites = document.getElementById('mob-btn-palpites');
  const mobBtnCruz = document.getElementById('mob-btn-cruz');
  const mobBtnResultados = document.getElementById('mob-btn-resultados');
  const mobBtnMenu = document.getElementById('mob-btn-menu');

  const setMobBtnActive = (btn, isActive) => {
    if (!btn) return;
    if (isActive) {
      btn.classList.add('mob-nav-active');
    } else {
      btn.classList.remove('mob-nav-active');
    }
  };

  setMobBtnActive(mobBtnHome, screenName === 'home');
  setMobBtnActive(mobBtnPalpites, screenName === 'palpites');
  setMobBtnActive(mobBtnCruz, screenName === 'cruz');
  setMobBtnActive(mobBtnResultados, screenName === 'resultados');
  setMobBtnActive(mobBtnMenu, false);

  // Fecha o menu lateral caso esteja aberto
  if (typeof closeDrawer === 'function') {
    closeDrawer();
  }

  // Rola suavemente ao topo
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Dispara carregamentos sob demanda se necessário
  if (screenName === 'matriz') {
    loadMatrizContent();
  } else if (screenName === 'centena-master') {
    loadCentenaMasterContent();
  } else if (screenName === 'cruz') {
    loadCruzModalContent();
  } else if (screenName === 'puxadas') {
    _puxadasDataCache = null;
        _predictionCache.clear();
    loadPuxadasModalContent();
  } else if (screenName === 'atrasados') {
    loadAtrasadosModalList();
  } else if (screenName === 'resultados') {
    loadDrawResults();
  } else if (screenName === 'home') {
    updateHomeScreenData();
        checkAndRenderMilharBingoBanner(true);
  } else if (screenName === 'milhares-atrasadas') {
    loadMilharesAtrasadas();
  }

  // Atualiza hash da URL
  if (updateHash && window.location.hash !== `#${screenName}`) {
    try {
      history.replaceState(null, '', `#${screenName}`);
    } catch (e) {
      window.location.hash = screenName;
    }
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
  const topics = ['animals', 'contra', 'duques', 'fixed'];
  if (!topics.includes(topicName)) topicName = 'animals';

  topics.forEach(t => {
    const btn = document.getElementById(`topic-tab-${t}`);
    const content = document.getElementById(`topic-content-${t}`);

    if (btn) {
      if (t === topicName) {
        btn.className = 'py-1.5 px-0.5 sm:px-1.5 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-0.5 sm:gap-1 bg-indigo-600 text-white shadow-sm active:scale-95 cursor-pointer';
      } else {
        btn.className = 'py-1.5 px-0.5 sm:px-1.5 rounded-lg text-[10px] sm:text-xs font-semibold transition-all flex items-center justify-center gap-0.5 sm:gap-1 text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 cursor-pointer';
      }
    }

    if (content) {
      content.classList.toggle('hidden', t !== topicName);
    }
  });

  if (topicName === 'contra' && typeof window.loadAndRenderPatternBreaksHistory === 'function') {
    window.loadAndRenderPatternBreaksHistory(window.currentLottery || 'RJ');
  }
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
  const userEmail = (tenant && tenant.email ? tenant.email : '').toLowerCase();
  const userName = (tenant && tenant.name ? tenant.name : '');
  const isMaster = (tenant && tenant.role === 'admin') || userEmail === 'k1qvinicius.cs@gmail.com' || userEmail === 'k1qvinicius@gmail.com' || userName.includes('Vinicius') || userName.includes('Master');

  if (userNameEl) {
    if (isMaster) {
      userNameEl.innerHTML = `Kaique Vinicius <span class="ml-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold font-sans align-middle shadow-sm">👑 Master</span>`;
    } else if (tenant && tenant.name) {
      userNameEl.textContent = tenant.name;
    } else {
      userNameEl.textContent = 'Testador';
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
    const currentVal = targetSlotSelect.value;
    const selectedOpt = Array.from(targetSlotSelect.options).find(o => o.value === currentVal)
      || targetSlotSelect.options[targetSlotSelect.selectedIndex];
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
        btn.className = 'px-1.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold border transition-all flex items-center justify-center gap-1 bg-indigo-600 text-white border-indigo-500 shadow-sm cursor-pointer';
      } else {
        btn.className = 'px-1.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-900/90 border border-slate-800 transition-all flex items-center justify-center gap-1 cursor-pointer';
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

function getSlotMinutes(slot, dateStr = null) {
  if (!slot) return 9999;
  const code = (slot.code || (typeof slot === 'string' ? slot : '')).toUpperCase().trim();

  if (code === 'FED' || code === 'FEDERAL') {
    // Federal corre aos domingos às 11:00 e quartas às 20:00
    const dStr = dateStr || document.getElementById('target-date')?.value || new Date().toISOString().split('T')[0];
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (d.getDay() === 0) { // 0 = Domingo
          return 11 * 60;
        }
      }
    } catch (e) {}
    return 20 * 60;
  }

  if (slot.time && slot.time.includes(':')) {
    const [h, m] = slot.time.split(':').map(Number);
    if (!isNaN(h) && !isNaN(m)) return h * 60 + m;
  }
  const fixed = {
    'ALV': 8 * 60,
    'PPT': 9 * 60 + 20,
    'PTM': 11 * 60 + 20,
    'PT': 14 * 60 + 20,
    'PTV': 16 * 60 + 20,
    'PTN': 18 * 60 + 20,
    'COR': 21 * 60 + 20,
    'CORUJA': 21 * 60 + 20,
    'LK-07': 7 * 60 + 20,
    'LK-09': 9 * 60 + 20,
    'LK-11': 11 * 60 + 20,
    'LK-14': 14 * 60 + 20,
    'LK-16': 16 * 60 + 20,
    'LK-18': 18 * 60 + 20,
    'LK-21': 21 * 60 + 20,
    'LK-23': 23 * 60 + 20,
    'SP-08': 8 * 60 + 20,
    'SP-10': 10 * 60,
    'SP-13': 13 * 60,
    'SP-15': 15 * 60 + 30,
    'SP-17': 17 * 60,
    'SP-19': 19 * 60,
    'SP-20': 20 * 60,
  };
  if (fixed[code] !== undefined) return fixed[code];
  const m = code.match(/(\d{1,2})/);
  if (m) {
    const h = parseInt(m[1], 10);
    return code.startsWith('LK') ? h * 60 + 20 : h * 60;
  }
  return 9999;
}

function getFriendlySlotMeta(drawSlotCode, dateStr = null) {
  const code = (drawSlotCode || '').toUpperCase().trim();
  if (code === 'FED' || code === 'FEDERAL') {
    const dStr = dateStr || document.getElementById('target-date')?.value || new Date().toISOString().split('T')[0];
    let isSunday = false;
    let isWednesday = false;
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (d.getDay() === 0) isSunday = true;
        if (d.getDay() === 3) isWednesday = true;
      }
    } catch (e) {}

    if (isSunday) {
      return { code: 'FED', name: 'Federal 11h (Domingo) - 11:00', time: '11:00' };
    } else if (isWednesday) {
      return { code: 'FED', name: 'Federal 20h (Quarta) - 20:00', time: '20:00' };
    } else {
      return { code: 'FED', name: 'Federal (Quarta e Domingo)', time: '20:00' };
    }
  }
  if (code === 'PPT') return { code, name: 'PPT - 09:20', time: '09:20' };
  if (code === 'PTM') return { code, name: 'PTM - 11:20', time: '11:20' };
  if (code === 'PT') return { code, name: 'PT - 14:20', time: '14:20' };
  if (code === 'PTV') return { code, name: 'PTV - 16:20', time: '16:20' };
  if (code === 'PTN') return { code, name: 'PTN - 18:20', time: '18:20' };
  if (code === 'COR' || code === 'CORUJA') return { code, name: 'Coruja - 21:20', time: '21:20' };

  if (code.startsWith('LK-')) {
    const h = parseInt(code.replace('LK-', ''), 10);
    const hStr = String(h).padStart(2, '0');
    return { code, name: `Look ${hStr}h - ${hStr}:20`, time: `${hStr}:20` };
  }
  if (code.startsWith('LN-')) {
    const h = parseInt(code.replace('LN-', ''), 10);
    const hStr = String(h).padStart(2, '0');
    return { code, name: `Nacional ${hStr}h - ${hStr}:00`, time: `${hStr}:00` };
  }
  if (code.startsWith('SP-')) {
    const spMetas = {
      'SP-08': { code: 'SP-08', name: 'PT-SP 08h20 - 08:20', time: '08:20' },
      'SP-10': { code: 'SP-10', name: 'PT-SP 10h - 10:00', time: '10:00' },
      'SP-13': { code: 'SP-13', name: 'PT-SP 13h - 13:00', time: '13:00' },
      'SP-15': { code: 'SP-15', name: 'BAND-SP 15h30 - 15:30', time: '15:30' },
      'SP-17': { code: 'SP-17', name: 'PT-SP 17h - 17:00', time: '17:00' },
      'SP-19': { code: 'SP-19', name: 'PT-SP 19h - 19:00', time: '19:00' },
      'SP-20': { code: 'SP-20', name: 'PTN-SP 20h - 20:00', time: '20:00' },
    };
    if (spMetas[code]) return spMetas[code];
    const h = parseInt(code.replace('SP-', ''), 10);
    const hStr = String(h).padStart(2, '0');
    return { code, name: `PT-SP ${hStr}h - ${hStr}:00`, time: `${hStr}:00` };
  }
  return { code, name: drawSlotCode, time: '' };
}

async function initSlotSelector(lottery = currentLottery) {
  const slotSelect = document.getElementById('target-slot');
  if (!slotSelect) return;

  try {
    const targetDate = document.getElementById('target-date')?.value || null;
    const rawSlots = await api.getSlots(lottery, targetDate);
    const slots = (rawSlots || []).slice();
    slots.sort((a, b) => getSlotMinutes(a, targetDate) - getSlotMinutes(b, targetDate));
    standardSlotsList = slots;
    slotSelect.innerHTML = '';

    if (!slots || slots.length === 0) {
      renderSlotPillsUI([], null);
      return;
    }

    // Determina horário alvo automático com precisão em tempo real
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const isToday = !targetDate || targetDate === todayStr;

    // Coleta slots já apurados hoje no backend
    const drawnCodes = new Set();
    if (isToday) {
      try {
        const resData = await api.getResults(30, 0, lottery);
        const items = resData?.items || [];
        items.forEach(r => {
          if (r.draw_date === todayStr) {
            const rLot = (r.lottery || 'RJ').toUpperCase();
            if (rLot === lottery.toUpperCase() || (lottery === 'FEDERAL' && r.slot === 'FED')) {
              if (r.slot) drawnCodes.add(r.slot.toUpperCase());
            }
          }
        });
      } catch (e) {
        console.warn('Não foi possível verificar apurações de hoje:', e);
      }
    }

    let defaultSlot = slots[0].code;

    if (isToday) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      // Encontra o próximo horário alvo que:
      // 1. Ainda NÃO foi apurado hoje (não está em drawnCodes)
      // 2. E cujo horário no relógio ainda não passou (tolerância máx 5 min)
      const upcomingSlot = slots.find(s => {
        const isDrawn = drawnCodes.has(s.code.toUpperCase());
        if (isDrawn) return false;
        const sMin = getSlotMinutes(s, todayStr);
        return sMin >= (currentMinutes - 5);
      });

      if (upcomingSlot) {
        defaultSlot = upcomingSlot.code;
      } else {
        // Se todos os horários futuros já passaram ou foram apurados,
        // procura qualquer slot de hoje que ainda esteja pendente de apuração
        const anyPending = slots.find(s => !drawnCodes.has(s.code.toUpperCase()));
        if (anyPending) {
          defaultSlot = anyPending.code;
        } else {
          // Se todos os slots de hoje já foram apurados, seleciona o último do dia
          defaultSlot = slots[slots.length - 1].code;
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

    // Sincroniza valor explicitamente no select e nos cabeçalhos
    slotSelect.value = defaultSlot;
    const selectedOpt = Array.from(slotSelect.options).find(o => o.value === defaultSlot);
    if (selectedOpt) selectedOpt.selected = true;

    const homeNextSlot = document.getElementById('home-next-slot-name');
    if (homeNextSlot && selectedOpt) {
      homeNextSlot.textContent = selectedOpt.textContent;
    }

    const currentSlotName = document.getElementById('current-slot-name');
    if (currentSlotName && selectedOpt) {
      currentSlotName.textContent = selectedOpt.textContent;
    }

    renderSlotPillsUI(slots, defaultSlot);
  } catch (err) {
    console.error('Erro ao inicializar horários:', err);
  }
}

/* ==========================================================================
   MONITOR EM TEMPO REAL: DETECÇÃO INSTANTÂNEA DE NOVAS APURAÇÕES
   ========================================================================== */
let _lastKnownDrawId = null;
let _resultsMonitorInterval = null;

let _lastWebSyncTime = 0;
function startInstantResultsMonitor() {
  if (_resultsMonitorInterval) return;

  _resultsMonitorInterval = setInterval(async () => {
    try {
      // Dispara sincronização com web a cada 60s em segundo plano para manter dados frescos
      const nowTs = Date.now();
      if (nowTs - _lastWebSyncTime > 60000) {
        _lastWebSyncTime = nowTs;
        try {
          fetch(`${API_BASE}/results/sync-web?lottery=${currentLottery}`, { method: 'POST' }).catch(() => {});
        } catch (e) {}
      }

      const res = await api.getRecentResults(currentLottery, 1);
      if (!res || res.length === 0) return;

      const latest = res[0];
      if (_lastKnownDrawId === null) {
        _lastKnownDrawId = latest.id;
        return;
      }

      // Se o ID do último sorteio mudou, um novo resultado acabou de ser gravado!
      if (latest.id !== _lastKnownDrawId) {
        _lastKnownDrawId = latest.id;
        console.log('⚡ Novo resultado apurado detectado:', latest);

        // 1. Limpa cache de puxadas e predições
        _puxadasDataCache = null;
        _predictionCache.clear();

        // 2. Recarrega os resultados
        await loadDrawResults();

        // 3. Atualiza o seletor de horários para avançar automaticamente para o próximo pendente
        await initSlotSelector(currentLottery);

        // 4. Recarrega palpites instantaneamente com a nova base apurada
        if (api.isLoggedIn()) {
          await loadPrediction(true);
        }

        // 5. Se o modal/tela de puxadas estiver aberto, atualiza imediatamente
        const viewPuxadas = document.getElementById('view-puxadas');
        if (viewPuxadas && !viewPuxadas.classList.contains('hidden')) {
          await loadPuxadasModalContent(null, true);
        }

        // 6. Atualiza dados na Home
        updateHomeScreenData();

        // 7. Notifica o usuário
        const p1 = latest.prize_1 || '----';
        const animalInfo = latest.animal ? `(${latest.animal.toUpperCase()})` : '';
        showToast(`⚡ Novo resultado apurado: ${latest.slot} - ${p1} ${animalInfo}! Palpites e Puxadas atualizados instantaneamente.`, 'success');
      } else {
        // Verifica periodicamente se o horário do slot atualmente selecionado já expirou no relógio de hoje
        const targetDate = document.getElementById('target-date')?.value || null;
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        if (!targetDate || targetDate === todayStr) {
          const slotSelect = document.getElementById('target-slot');
          if (slotSelect && slotSelect.value && Array.isArray(standardSlotsList) && standardSlotsList.length > 0) {
            const currentSlotCode = slotSelect.value;
            const currentSlotMeta = standardSlotsList.find(s => s.code === currentSlotCode);
            if (currentSlotMeta) {
              const currentSlotMin = getSlotMinutes(currentSlotMeta, todayStr);
              const nowMinutes = now.getHours() * 60 + now.getMinutes();
              if (nowMinutes > (currentSlotMin + 5)) {
                await initSlotSelector(currentLottery);
                if (api.isLoggedIn()) {
                  await loadPrediction();
                }
                updateHomeScreenData();
              }
            }
          }
        }
      }
    } catch (e) {
      // Silencioso em caso de oscilação momentânea de rede
    }
  }, 12000);
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
    const selectedOpt = Array.from(slotSelect.options).find(o => o.value === slotCode);
    if (selectedOpt) selectedOpt.selected = true;

    const homeNextSlot = document.getElementById('home-next-slot-name');
    if (homeNextSlot && selectedOpt) {
      homeNextSlot.textContent = selectedOpt.textContent;
    }

    const currentSlotName = document.getElementById('current-slot-name');
    if (currentSlotName && selectedOpt) {
      currentSlotName.textContent = selectedOpt.textContent;
    }
  }
  updateSlotPillsUI(slotCode);

  const activeScr = window.currentScreen || currentScreen || 'home';
  // Se o usuário estiver na Home e clicar em um horário, leva diretamente para os palpites desse horário
  if (activeScr === 'home') {
    switchScreen('palpites');
  }

  // Apenas busca resultados de apuração se a tela de resultados estiver atualmente visível
  const promises = [loadPrediction()];
  if (activeScr === 'resultados') {
    promises.push(loadDrawResults());
  }
  await Promise.all(promises);
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
    'LOOK': 'Look (LOOK)',
    'NACIONAL': 'Loteria Nacional',
    'SP': 'São Paulo (SP)',
    'FEDERAL': 'Loteria Federal'
  };
  const pureNames = {
    'RJ': 'Rio de Janeiro',
    'LOOK': 'Look',
    'NACIONAL': 'Loteria Nacional',
    'SP': 'São Paulo',
    'FEDERAL': 'Loteria Federal'
  };
  const lotIcons = {
    'RJ': '🌴',
    'LOOK': '🌾',
    'NACIONAL': '🇧🇷',
    'SP': '🏙️',
    'FEDERAL': '🏛️'
  };

  const badge = document.getElementById('active-lottery-badge');
  if (badge) {
    badge.textContent = lotNames[currentLottery] || currentLottery;
  }
  const slotsLotteryName = document.getElementById('slots-lottery-name');
  if (slotsLotteryName) {
    slotsLotteryName.textContent = pureNames[currentLottery] || currentLottery;
  }
  const activeIcon = document.getElementById('active-lottery-icon');
  if (activeIcon) {
    activeIcon.textContent = lotIcons[currentLottery] || '🎲';
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
  const puxBadge = document.getElementById('puxadas-lottery-badge');
  if (puxBadge) {
    puxBadge.textContent = lotNames[currentLottery] || currentLottery;
  }
  document.querySelectorAll('.puxadas-lot-btn').forEach(btn => {
    const lot = btn.getAttribute('data-puxadas-lottery');
    if (lot === currentLottery) {
      btn.className = 'puxadas-lot-btn px-2.5 py-1 rounded-lg text-xs font-black transition-all shrink-0 cursor-pointer bg-violet-600 text-white border border-violet-400 shadow-sm';
    } else {
      btn.className = 'puxadas-lot-btn px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60';
    }
  });

  // Atualiza destaque no menu lateral
  if (typeof updateSidebarActiveUI === 'function') {
    const activeScreen = window.location.hash ? window.location.hash.replace('#', '') : 'palpites';
    updateSidebarActiveUI(currentLottery, activeScreen);
  }
}

window.toggleLotteryAccordion = function(lotteryCode, forceOpen = null) {
  const content = document.getElementById(`acc-content-${lotteryCode}`);
  const icon = document.getElementById(`acc-icon-${lotteryCode}`);
  const group = document.getElementById(`group-${lotteryCode}`);
  if (!content) return;

  const willOpen = (forceOpen !== null) ? forceOpen : content.classList.contains('hidden');
  if (willOpen) {
    content.classList.remove('hidden');
    if (icon) icon.style.transform = 'rotate(180deg)';
    if (group) group.classList.add('lottery-group-active');
  } else {
    content.classList.add('hidden');
    if (icon) icon.style.transform = 'rotate(0deg)';
    if (group) group.classList.remove('lottery-group-active');
  }
};

window.navigateTo = async function(lotteryCode, screenName) {
  if (lotteryCode && lotteryCode !== currentLottery) {
    await switchLottery(lotteryCode);
  }
  if (screenName) {
    switchScreen(screenName);
  }
  updateSidebarActiveUI(lotteryCode || currentLottery, screenName || 'home');
  if (typeof closeDrawer === 'function') {
    closeDrawer();
  }
};

window.updateSidebarActiveUI = function(lotteryCode, screenName) {
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('sidebar-item-active'));
  document.querySelectorAll('.subitem-btn').forEach(el => el.classList.remove('subitem-btn-active'));

  if (screenName === 'home') {
    const homeBtn = document.getElementById('sidebar-btn-home');
    if (homeBtn) homeBtn.classList.add('sidebar-item-active');
  } else if (screenName === 'centena-master') {
    const cmBtn = document.getElementById('sidebar-btn-centena-master');
    if (cmBtn) cmBtn.classList.add('sidebar-item-active');
  } else if (screenName === 'cruz') {
    const cruzBtn = document.getElementById('sidebar-btn-cruz');
    if (cruzBtn) cruzBtn.classList.add('sidebar-item-active');
  } else if (screenName === 'milhares-atrasadas') {
    const milBtn = document.getElementById('sidebar-btn-milhares-atrasadas');
    if (milBtn) milBtn.classList.add('sidebar-item-active');
  } else if (lotteryCode && screenName) {
    window.toggleLotteryAccordion(lotteryCode, true);
    const subBtn = document.getElementById(`subnav-${lotteryCode}-${screenName}`);
    if (subBtn) subBtn.classList.add('subitem-btn-active');
  }

  const screenTitles = {
    'home': 'Visão Geral',
    'palpites': 'Jogos Prontos',
    'centena-master': 'Centena Master',
    'cruz': 'Cruz do Dia',
    'puxadas': 'Radar de Puxadas',
    'atrasados': 'Mais Atrasados',
    'resultados': 'Resultados das Extrações',
    'milhares-atrasadas': 'Milhares Atrasadas'
  };
  const screenBadge = document.getElementById('current-screen-badge');
  if (screenBadge) {
    screenBadge.textContent = screenTitles[screenName] || screenName;
  }
};

window.switchLottery = async function(lotteryCode) {
  if (!lotteryCode || lotteryCode === currentLottery) {
    return;
  }
  currentLottery = lotteryCode;
  localStorage.setItem('bicho_active_lottery', lotteryCode);
  updateLotteryButtonsUI();
  await initSlotSelector(currentLottery);
  _puxadasDataCache = null;
  _predictionCache.clear();
  currentFixedAnimalData = null;
  await Promise.all([loadPrediction(true), loadDrawResults()]);
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
    'LOOK': 'Look',
    'NACIONAL': 'Nacional',
    'SP': 'São Paulo',
    'FEDERAL': 'Federal'
  };
  showToast(`Loteria alterada para ${lotLabels[lotteryCode] || lotteryCode}!`, 'info');
};

function setupEventListeners() {
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.classList.add('animate-spin');
      try {
        showToast('Atualizando resultados e recalculando palpites...', 'info');
        try {
          await fetch(`${API_BASE}/results/sync-web?lottery=${currentLottery}`, { method: 'POST' });
        } catch (e) {}
        await Promise.all([loadPrediction(), loadDrawResults()]);
        updateHomeScreenData();
        showToast('Palpites e resultados atualizados com sucesso!', 'success');
      } catch (err) {
        console.warn('Erro ao recalcular:', err);
      } finally {
        btnRefresh.classList.remove('animate-spin');
      }
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
      if (currentLottery === 'FEDERAL') {
        initSlotSelector('FEDERAL');
      }
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
  window.syncAllWebResults = async function () {
  const btn = document.getElementById('btn-sync-all-web-results');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> Sincronizando Todas...';
  }
  showToast('Sincronizando todas as bancas (RJ, Federal, Look, Nacional, SP)...', 'info');
  try {
    const res = await api.syncWebResults(null);
    showToast(res.message || 'Todas as bancas sincronizadas com sucesso!', 'success');
    _puxadasDataCache = null;
    await Promise.all([loadPrediction(), loadDrawResults()]);
    const viewPuxadas = document.getElementById('view-puxadas');
    if (viewPuxadas && !viewPuxadas.classList.contains('hidden')) {
      await loadPuxadasModalContent();
    }
  } catch (err) {
    showToast('Erro ao sincronizar todas as bancas: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
};

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

const _predictionCache = new Map();

function getPredictionCacheKey(lottery, date, slot, strategy) {
  return `${lottery || 'RJ'}_${date || 'today'}_${slot || 'default'}_${strategy || 'hybrid'}`;
}

let _activePredictionReqSeq = 0;
let _prefetchTimeout = null;

function prefetchAdjacentSlots(lottery, activeSlot) {
  if (_prefetchTimeout) clearTimeout(_prefetchTimeout);
  if (!standardSlotsList || standardSlotsList.length <= 1) return;

  _prefetchTimeout = setTimeout(async () => {
    const dateVal = document.getElementById('target-date')?.value || '';
    for (const s of standardSlotsList) {
      if (s.code === activeSlot) continue;
      const key = getPredictionCacheKey(lottery, dateVal, s.code, currentStrategy);
      if (!_predictionCache.has(key) && api.isLoggedIn()) {
        try {
          const pred = await api.getPrediction(dateVal, s.code, currentStrategy, lottery);
          _predictionCache.set(key, pred);
        } catch (e) {
          break;
        }
      }
    }
  }, 800);
}

async function loadPrediction(forceRefresh = false) {
  if (!api.isLoggedIn()) return;
  const loadingEl = document.getElementById('loading-state');
  const contentEl = document.getElementById('content-state');
  const dateVal = document.getElementById('target-date')?.value || '';
  const slotVal = document.getElementById('target-slot')?.value || '';
  const cacheKey = getPredictionCacheKey(currentLottery, dateVal, slotVal, currentStrategy);

  // 1. Resposta INSTANTÂNEA via Cache (0ms - sem travar a tela)
  if (!forceRefresh && _predictionCache.has(cacheKey)) {
    currentPrediction = _predictionCache.get(cacheKey);
    renderDashboard(currentPrediction);
    if (contentEl) contentEl.classList.remove('opacity-40', 'pointer-events-none');
    if (loadingEl) loadingEl.classList.add('hidden');
    prefetchAdjacentSlots(currentLottery, slotVal);
    return;
  }

  const reqSeq = ++_activePredictionReqSeq;

  // Feedback visual imediato: esmaece o dashboard e bloqueia cliques duplicados durante a consulta
  if (contentEl) {
    contentEl.classList.add('opacity-40', 'pointer-events-none');
  }
  const hasRendered = currentPrediction && currentPrediction.top_groups && currentPrediction.top_groups.length > 0;
  if (!hasRendered && loadingEl) {
    loadingEl.classList.remove('hidden');
  }

  try {
    const result = await api.getPrediction(dateVal, slotVal, currentStrategy, currentLottery);
    // Ignora se uma requisição mais recente já foi disparada
    if (reqSeq !== _activePredictionReqSeq) return;

    currentPrediction = result;
    _predictionCache.set(cacheKey, currentPrediction);
    renderDashboard(currentPrediction);

    // Pré-carrega demais horários em background suave
    prefetchAdjacentSlots(currentLottery, slotVal);
  } catch (err) {
    if (reqSeq === _activePredictionReqSeq && api.isLoggedIn()) {
      showToast('Erro ao carregar análise: ' + err.message, 'error');
    }
  } finally {
    if (reqSeq === _activePredictionReqSeq) {
      if (loadingEl) loadingEl.classList.add('hidden');
      if (contentEl) contentEl.classList.remove('opacity-40', 'pointer-events-none');
    }
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
  _puxadasDataCache = null;
  switchScreen('puxadas');
  await loadPuxadasModalContent(null, true);
};

window.closePuxadasModal = function () {
  switchScreen('home');
};

let _puxadasDataCache = null;

window.syncPuxadasModal = async function () {
  const btnTop = document.getElementById('btn-sync-puxadas-modal');
  const btnCard = document.getElementById('btn-sync-puxadas-card');
  const origTopHtml = btnTop ? btnTop.innerHTML : '';
  const origCardHtml = btnCard ? btnCard.innerHTML : '';

  if (btnTop) {
    btnTop.disabled = true;
    btnTop.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> ATUALIZANDO...';
  }
  if (btnCard) {
    btnCard.disabled = true;
    btnCard.innerHTML = '<span class="animate-spin inline-block mr-1">⏳</span> SINCRONIZANDO...';
  }

  const lotNames = {
    'RJ': 'Rio de Janeiro (RJ)',
    'LOOK': 'Look',
    'NACIONAL': 'Nacional',
    'SP': 'São Paulo',
    'FEDERAL': 'Federal'
  };
  const lotLabel = lotNames[currentLottery] || currentLottery;

  showToast(`Sincronizando puxadas com último resultado de ${lotLabel}...`, 'info');

  try {
    // 1. Puxa os últimos resultados oficiais da banca ativa da web
    await api.syncWebResults(currentLottery);

    // 2. Limpa cache das puxadas
    _puxadasDataCache = null;

    // 3. Recarrega as puxadas com base no último sorteio recém-apurado
    await loadPuxadasModalContent();

    const base = _puxadasDataCache?.base_animal;
    const baseName = base?.animal ? `${base.emoji || ''} ${base.animal.toUpperCase()}` : 'Animal';
    const baseGroup = base?.group ? `(Grupo ${String(base.group).padStart(2, '0')})` : '';
    const slotStr = base?.source_slot ? ` • ${base.source_slot}` : '';

    showToast(`Puxadas atualizadas! 1º Prêmio: ${baseName} ${baseGroup}${slotStr}`, 'success');
  } catch (err) {
    console.warn('Erro ao sincronizar via web, recarregando apuração do banco:', err);
    _puxadasDataCache = null;
    await loadPuxadasModalContent();
    showToast('Puxadas atualizadas com a apuração mais recente do banco.', 'info');
  } finally {
    if (btnTop) {
      btnTop.disabled = false;
      btnTop.innerHTML = origTopHtml;
    }
    if (btnCard) {
      btnCard.disabled = false;
      btnCard.innerHTML = origCardHtml;
    }
  }
};

async function loadPuxadasModalContent(selectedGroup = null, forceRefresh = false) {
  try {
    if (forceRefresh || !_puxadasDataCache || _puxadasDataCache.lottery !== currentLottery) {
      _puxadasDataCache = await api.getPuxadas(null, null, currentLottery);
    }
    const data = _puxadasDataCache;
    const catalog = data.catalog || {};

    const lotNames = {
      'RJ': 'Rio de Janeiro (RJ)',
      'LOOK': 'Look',
      'NACIONAL': 'Loteria Nacional',
      'SP': 'São Paulo',
      'FEDERAL': 'Loteria Federal'
    };
    const lotLabel = lotNames[currentLottery] || currentLottery;

    const subTitleEl = document.getElementById('puxadas-modal-subtitle');
    if (subTitleEl) {
      subTitleEl.textContent = `Tradição popular: animais atraídos pelo último 1º prêmio apurado em ${lotLabel}`;
    }

    const badgeEl = document.getElementById('puxadas-lottery-badge');
    if (badgeEl) {
      badgeEl.textContent = lotLabel;
    }

    // Atualiza botões de loteria
    document.querySelectorAll('.puxadas-lot-btn').forEach(btn => {
      const lot = btn.getAttribute('data-puxadas-lottery');
      if (lot === currentLottery) {
        btn.className = 'puxadas-lot-btn px-2.5 py-1 rounded-lg text-xs font-black transition-all shrink-0 cursor-pointer bg-gradient-to-r from-violet-600 to-indigo-600 text-white border border-violet-400 shadow-sm ring-1 ring-violet-500/30';
      } else {
        btn.className = 'puxadas-lot-btn px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700/80 hover:text-white';
      }
    });

    const isDrawBase = !selectedGroup;
    const baseAnimal = data.base_animal || {};
    const defaultGroup = baseAnimal.group || 15;
    const activeGroup = selectedGroup || defaultGroup;
    const currentBaseInfo = (catalog[activeGroup] || catalog[String(activeGroup)]) || baseAnimal;

    // Constrói options do seletor de bicho
    const animalOptions = Object.values(catalog)
      .sort((a, b) => a.group - b.group)
      .map(c => `<option value="${c.group}" ${c.group === activeGroup ? 'selected' : ''}>Gr. ${String(c.group).padStart(2, '0')} - ${c.emoji} ${c.animal.toUpperCase()}</option>`)
      .join('');

    // Formatação de data e extração do sorteio apurado
    let drawDateFormatted = '';
    if (baseAnimal.draw_date) {
      const parts = String(baseAnimal.draw_date).split('-');
      drawDateFormatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : baseAnimal.draw_date;
    }
    const slotFormatted = baseAnimal.slot || 'Última Apuração';
    const milharPrize1 = baseAnimal.milhar || (data.last_draw ? data.last_draw.prize_1 : '----');
    const dezenaPrize1 = baseAnimal.dezena || (milharPrize1.length >= 2 ? milharPrize1.slice(-2) : '--');
    const centenaPrize1 = baseAnimal.centena || (milharPrize1.length >= 3 ? milharPrize1.slice(-3) : '---');

    // Fita compacta dos 7 prêmios da apuração oficial
    const prizes = data.last_draw?.prizes || baseAnimal.prizes || [];
    let prizesStripHtml = '';
    if (prizes && prizes.length >= 1) {
      prizesStripHtml = `
        <div class="pt-2 border-t border-slate-800/70">
          <div class="flex items-center justify-between mb-1.5 text-[10px]">
            <span class="uppercase font-bold text-slate-400 flex items-center gap-1">
              <span>📋</span> Todos os Prêmios Apurados (${slotFormatted}):
            </span>
            <span class="text-[10px] text-emerald-400 font-mono font-bold">1º ao ${prizes.length}º</span>
          </div>
          <div class="grid grid-cols-4 sm:grid-cols-7 gap-1">
            ${prizes.map((p, idx) => `
              <div class="px-1.5 py-1 rounded-md ${idx === 0 ? 'bg-amber-500/15 border border-amber-500/50' : 'bg-slate-950/60 border border-slate-800/80'} text-center">
                <span class="block text-[8px] font-black uppercase ${idx === 0 ? 'text-amber-300' : 'text-slate-500'}">${idx + 1}º</span>
                <span class="block font-mono text-[11px] sm:text-xs font-black ${idx === 0 ? 'text-amber-200' : 'text-slate-200'}">${p || '----'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // 1. Renderiza o Card Superior Compacto
    const baseContainer = document.getElementById('puxadas-base-animal-content');
    if (baseContainer) {
      if (isDrawBase) {
        // MODO 1: Destaque do Bicho Sorteado no 1º Prêmio (COMPACTO & RESPONSIVO)
        baseContainer.innerHTML = `
          <div class="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-indigo-950/30 border border-emerald-500/40 shadow-lg space-y-2.5 animate-fade-in overflow-hidden max-w-full">
            <!-- Barra Superior do Card (Wrap responsivo sem estourar) -->
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase tracking-wider">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> 🎯 ÚLTIMO SORTEIO
                </span>
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 truncate">
                  📍 ${lotLabel} • ${slotFormatted} • ${drawDateFormatted}
                </span>
              </div>

              <!-- Seletor Discreto de Consulta Manual (Compacto, nunca vaza) -->
              <div class="flex items-center gap-1.5 shrink-0 max-w-full">
                <label for="puxadas-select-animal" class="text-[10px] uppercase font-bold text-slate-400 shrink-0">Trocar Bicho:</label>
                <select id="puxadas-select-animal" onchange="onPuxadasAnimalSelectChange(this.value)"
                  class="bg-slate-950 border border-slate-700 hover:border-violet-500 rounded-lg px-2 py-1 text-xs text-violet-200 font-bold focus:outline-none focus:border-violet-400 cursor-pointer shadow-inner max-w-[150px] sm:max-w-[190px] truncate">
                  ${animalOptions}
                </select>
              </div>
            </div>

            <!-- Grade Central Compacta: Bicho (Esq) + Milhar/Dezena (Dir) -->
            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
              <!-- Bicho Sorteado -->
              <div class="sm:col-span-7 flex items-center gap-3 min-w-0">
                <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br from-emerald-500/20 via-slate-800 to-emerald-950 border border-emerald-400/60 flex items-center justify-center text-3xl sm:text-4xl shadow-md shrink-0">
                  ${baseAnimal.emoji || '🐾'}
                </div>
                <div class="min-w-0 space-y-0.5">
                  <div class="flex items-center gap-1.5">
                    <span class="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-500/25 text-emerald-300">1º PRÊMIO</span>
                    <span class="text-base sm:text-lg font-black text-white uppercase tracking-wide truncate">${baseAnimal.animal}</span>
                  </div>
                  <div class="flex items-center gap-1.5 text-xs font-mono text-slate-300 flex-wrap">
                    <span class="font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">Gr. ${String(baseAnimal.group).padStart(2, '0')}</span>
                    <span class="text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">Dez: <strong class="text-amber-300 font-bold">${baseAnimal.tens?.join(' • ') || ''}</strong></span>
                  </div>
                </div>
              </div>

              <!-- Destaque da Milhar, Centena e Dezena (Compacto) -->
              <div class="sm:col-span-5 grid grid-cols-2 gap-2">
                <div class="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex flex-col justify-center text-center">
                  <span class="text-[8px] uppercase font-bold text-amber-400 flex items-center justify-center gap-1">
                    <span>👑</span> Milhar 1º
                  </span>
                  <span class="text-lg sm:text-xl font-mono font-black text-amber-300 tracking-wider mt-0.5">${milharPrize1}</span>
                </div>
                <div class="p-2 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col justify-center text-center">
                  <span class="text-[8px] uppercase font-bold text-slate-400">Dezena / Centena</span>
                  <div class="flex items-center justify-center gap-1 mt-0.5 font-mono">
                    <span class="text-base font-black text-emerald-400">${dezenaPrize1}</span>
                    <span class="text-xs text-slate-500">/</span>
                    <span class="text-xs font-bold text-cyan-300">${centenaPrize1}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Fita Compacta dos 7 Prêmios -->
            ${prizesStripHtml}
          </div>
        `;
      } else {
        // MODO 2: Consulta Manual (COMPACTO & RESPONSIVO)
        baseContainer.innerHTML = `
          <div class="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-violet-950/40 via-slate-900 to-slate-900 border border-violet-500/40 shadow-lg space-y-2.5 animate-fade-in overflow-hidden max-w-full">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/20 text-violet-300 border border-violet-500/40 text-[10px] font-black uppercase tracking-wider">
                  🔍 CONSULTA MANUAL
                </span>
                <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                  [${lotLabel}]
                </span>
              </div>

              <div class="flex items-center gap-1.5 flex-wrap shrink-0 max-w-full">
                <button type="button" onclick="loadPuxadasModalContent(null)"
                  class="px-2 py-1 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer">
                  <span>↺</span> <span>Voltar ao 1º Prêmio: ${baseAnimal.animal} (${milharPrize1})</span>
                </button>

                <select id="puxadas-select-animal" onchange="onPuxadasAnimalSelectChange(this.value)"
                  class="bg-slate-950 border border-slate-700 hover:border-violet-500 rounded-lg px-2 py-1 text-xs text-violet-200 font-bold focus:outline-none focus:border-violet-400 cursor-pointer shadow-inner max-w-[150px] sm:max-w-[190px] truncate">
                  ${animalOptions}
                </select>
              </div>
            </div>

            <!-- Bicho Consultado Compacto -->
            <div class="flex items-center gap-3 py-1">
              <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600/25 to-slate-800 border border-violet-400/50 flex items-center justify-center text-3xl shadow-md shrink-0">
                ${currentBaseInfo.emoji}
              </div>
              <div class="min-w-0 space-y-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">BICHO EM CONSULTA</span>
                  <span class="text-base sm:text-lg font-black text-white uppercase tracking-wide truncate">${currentBaseInfo.animal}</span>
                </div>
                <div class="flex items-center gap-2 text-xs font-mono text-slate-300 flex-wrap">
                  <span class="font-bold text-violet-300 bg-violet-950/70 px-2 py-0.5 rounded border border-violet-800/60">Gr. ${String(currentBaseInfo.group).padStart(2, '0')}</span>
                  <span class="text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">Dezenas: <strong class="text-amber-200 font-bold">${currentBaseInfo.tens?.join(' • ') || ''}</strong></span>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }

    // 2. Banner de Transição da Puxada (COMPACTO)
    const transitionBanner = document.getElementById('puxadas-transition-banner');
    const pulledAnimals = currentBaseInfo.pulled || [];
    if (transitionBanner) {
      transitionBanner.innerHTML = `
        <div class="p-2.5 px-3 rounded-xl bg-violet-950/40 border border-violet-500/30 flex items-center justify-between gap-2 flex-wrap animate-fade-in">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-base shrink-0">🧲</span>
            <div class="min-w-0">
              <span class="text-xs font-black text-white uppercase tracking-wider">
                Bichos que o ${currentBaseInfo.animal} Puxa:
              </span>
              <span class="text-[11px] text-violet-200/90 ml-1">
                (atrai <b>${pulledAnimals.length} animais</b> pela tradição)
              </span>
            </div>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" onclick="copyAllPuxadasThousands(this)"
              class="px-2 py-1 rounded-lg bg-amber-950/50 hover:bg-amber-900 border border-amber-700/50 text-amber-300 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer">
              <span>👑</span> <span>Copiar Milhares</span>
            </button>
            <button type="button" onclick="copyAllPuxadasHundreds(this)"
              class="px-2 py-1 rounded-lg bg-cyan-950/50 hover:bg-cyan-900 border border-cyan-700/50 text-cyan-300 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer">
              <span>💎</span> <span>Copiar Centenas</span>
            </button>
          </div>
        </div>
      `;
    }

    // Prepara listas de milhares e centenas para cópia global
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

    // 3. Renderiza a Lista de Animais Puxados (COMPACTA)
    const listContainer = document.getElementById('puxadas-animals-list');
    if (listContainer) {
      listContainer.innerHTML = pulledAnimals.map(anim => {
        const hList = anim.hundreds || [];
        const mList = anim.thousands || [];

        const hundredsPills = hList.map(h => `
          <button type="button" onclick="copySingleNumber(event, '${h}', 'Centena')"
            title="Clique para copiar a centena ${h}"
            class="px-2 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-700/60 hover:border-cyan-400 text-cyan-200 hover:text-cyan-100 font-mono text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95">
            ${h}
          </button>
        `).join(' ');

        const thousandsPills = mList.map(m => `
          <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')"
            title="Clique para copiar o milhar ${m}"
            class="px-2 py-0.5 rounded-md bg-amber-950/70 border border-amber-600/60 hover:border-amber-400 text-amber-200 hover:text-amber-100 font-mono text-xs font-bold transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95">
            ${m}
          </button>
        `).join(' ');

        const hStr = hList.join(', ');
        const mStr = mList.join(', ');

        const pulledBadge = isDrawBase
          ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
               🧲 Puxado pelo ${currentBaseInfo.animal}
             </span>`
          : `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
               🧲 Puxado pelo ${currentBaseInfo.animal}
             </span>`;

        return `
          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-violet-500/40 transition-all space-y-2 shadow-sm overflow-hidden max-w-full">
            <!-- Cabeçalho do Bicho Puxado -->
            <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 flex-wrap sm:flex-nowrap">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="w-9 h-9 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-xl shadow-inner shrink-0">
                  ${anim.emoji}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-sm font-black text-white truncate">${anim.animal.toUpperCase()}</span>
                    <span class="text-[11px] font-mono font-bold text-violet-300 bg-violet-950/60 px-1.5 py-0.2 rounded border border-violet-800/50">Gr. ${String(anim.group).padStart(2, '0')}</span>
                    ${pulledBadge}
                  </div>
                  <span class="text-[11px] text-slate-300 font-mono mt-0.5 block">Dezenas: <strong class="text-amber-300 font-bold">${anim.tens.join(', ')}</strong></span>
                </div>
              </div>
              <button type="button" onclick="copyCompleteAnimalCard(this, '${anim.emoji}', '${anim.animal}', ${anim.group}, '${anim.tens.join(', ')}', '${hStr}', '${mStr}')"
                class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm shrink-0">
                <span>📋</span> <span>Copiar Jogo</span>
              </button>
            </div>

            <!-- Grade Compacta: Centenas & Milhares Quentes -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <!-- Centenas Quentes -->
              <div class="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between space-y-1.5">
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[9px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                      <span>💎</span> Centenas Quentes
                    </span>
                    <span class="text-[8px] text-slate-500">3 Dígitos</span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    ${hundredsPills || '<span class="text-xs text-slate-500">-</span>'}
                  </div>
                </div>
                ${hList.length > 0 ? `
                <button type="button" onclick="copyCategoryList(this, '${hStr}', 'Centenas de ${anim.animal}')"
                  class="w-full mt-1 py-0.5 px-2 rounded bg-cyan-950/40 hover:bg-cyan-900/60 border border-cyan-800/50 text-cyan-300 text-[10px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1">
                  <span>📋</span> <span>Copiar Centenas</span>
                </button>` : ''}
              </div>

              <!-- Milhares Quentes -->
              <div class="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80 flex flex-col justify-between space-y-1.5">
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <span class="text-[9px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1">
                      <span>👑</span> Milhares Quentes
                    </span>
                    <span class="text-[8px] text-slate-500">4 Dígitos</span>
                  </div>
                  <div class="flex flex-wrap gap-1">
                    ${thousandsPills || '<span class="text-xs text-slate-500">-</span>'}
                  </div>
                </div>
                ${mList.length > 0 ? `
                <button type="button" onclick="copyCategoryList(this, '${mStr}', 'Milhares de ${anim.animal}')"
                  class="w-full mt-1 py-0.5 px-2 rounded bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/50 text-amber-300 text-[10px] font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1">
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

window.loadCruzModalContent = async function(forceDate = null) {
  const cruzDateInput = document.getElementById('cruz-target-date');
  const mainDateInput = document.getElementById('target-date');

  let dateVal = forceDate;
  if (!dateVal && cruzDateInput && cruzDateInput.value) {
    dateVal = cruzDateInput.value;
  }
  if (!dateVal && mainDateInput && mainDateInput.value) {
    dateVal = mainDateInput.value;
  }
  if (!dateVal) {
    dateVal = new Date().toISOString().split('T')[0];
  }

  if (cruzDateInput && cruzDateInput.value !== dateVal) {
    cruzDateInput.value = dateVal;
  }

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
            class="px-2 py-0.5 rounded-lg bg-cyan-950/70 border border-cyan-800/60 hover:border-cyan-400 text-cyan-200 font-mono text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm">
            ${m}
          </button>
        `).join(' ');

        return `
          <div class="p-3 sm:p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div class="flex items-center gap-3">
              <span class="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-2xl shrink-0">${anim.emoji}</span>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-black text-white">${anim.animal.toUpperCase()}</span>
                  <span class="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded">Grupo ${String(anim.group).padStart(2, '0')}</span>
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
                class="p-2 rounded-xl bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-300 text-xs transition-all shrink-0 cursor-pointer active:scale-95 shadow-sm" title="Copiar milhares de ${anim.animal}">
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


window.changeCruzDate = function(val) {
  if (typeof loadCruzModalContent === 'function') {
    loadCruzModalContent(val);
  }
};

window.setCruzDateToday = function() {
  const today = new Date().toISOString().split('T')[0];
  if (typeof loadCruzModalContent === 'function') {
    loadCruzModalContent(today);
  }
};

window.setCruzDateTomorrow = function() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toISOString().split('T')[0];
  if (typeof loadCruzModalContent === 'function') {
    loadCruzModalContent(tomorrow);
  }
};

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
    'LOOK': 'Look (LOOK)',
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


let currentReadyBetsData = null;
let readyBetsDrawerState = {
  main: false,
  duques: true
};

window.toggleReadyBetsDetails = function(targetKey) {
  const key = targetKey || 'main';
  readyBetsDrawerState[key] = !readyBetsDrawerState[key];
  
  const drawer = document.getElementById(`ready-bets-drawer-${key}`);
  const btnText = document.getElementById(`ready-bets-toggle-text-${key}`);
  const btnIcon = document.getElementById(`ready-bets-toggle-icon-${key}`);
  
  if (drawer) {
    if (readyBetsDrawerState[key]) {
      drawer.classList.remove('hidden');
      if (btnText) btnText.textContent = 'Recolher';
      if (btnIcon) btnIcon.textContent = '▲';
    } else {
      drawer.classList.add('hidden');
      if (btnText) btnText.textContent = 'Ver Detalhes';
      if (btnIcon) btnIcon.textContent = '▼';
    }
  }
};

function buildReadyBetsHtml(g0, g1, g2, key, defaultOpen) {
  const isOpen = defaultOpen || false;
  return `
    <div class="card-glass p-2.5 sm:p-3 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-indigo-950/40 shadow-md animate-fade-in mb-3">
      <!-- Linha 1: Resumo Inline Compacto & Acoes -->
      <div class="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div class="flex items-center gap-2 min-w-0 flex-wrap">
          <span class="text-base sm:text-lg shrink-0">👑</span>
          <div class="flex items-center gap-1.5 flex-wrap min-w-0">
            <span class="text-xs font-black text-amber-300 uppercase tracking-tight">Jogos Prontos</span>
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">1º ao 5º</span>

            <!-- Resumo Terno em Chips Compactos -->
            <div class="inline-flex items-center gap-1 bg-slate-950/90 px-2 py-0.5 rounded-lg border border-amber-500/25 text-xs">
              <span class="text-slate-400 font-bold text-[10px]">Terno:</span>
              <span class="font-bold text-amber-200">${g0.animal_emoji || '🐾'} ${g0.value}</span>
              <span class="text-slate-600">+</span>
              <span class="font-bold text-amber-200">${g1.animal_emoji || '🐾'} ${g1.value}</span>
              <span class="text-slate-600">+</span>
              <span class="font-bold text-amber-200">${g2.animal_emoji || '🐾'} ${g2.value}</span>
            </div>

            <!-- Resumo Passes em Chips Compactos -->
            <div class="hidden sm:inline-flex items-center gap-1 bg-slate-950/90 px-2 py-0.5 rounded-lg border border-indigo-500/25 text-[11px]">
              <span class="text-slate-400 font-bold text-[10px]">Passes:</span>
              <span class="font-mono text-indigo-200 font-bold">${g0.value}+${g1.value}</span>
              <span class="text-slate-600">•</span>
              <span class="font-mono text-indigo-200 font-bold">${g0.value}+${g2.value}</span>
              <span class="text-slate-600">•</span>
              <span class="font-mono text-indigo-200 font-bold">${g1.value}+${g2.value}</span>
            </div>
          </div>
        </div>

        <!-- Botoes de Acao: Copiar e Expandir -->
        <div class="flex items-center gap-1.5 shrink-0 ml-auto">
          <button type="button" onclick="copyReadyBetsToClipboard()"
            class="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm">
            <span>📋</span> <span>Copiar</span>
          </button>
          <button type="button" onclick="toggleReadyBetsDetails('${key}')" id="btn-toggle-ready-bets-${key}"
            class="px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer">
            <span id="ready-bets-toggle-text-${key}">${isOpen ? 'Recolher' : 'Ver Detalhes'}</span>
            <span id="ready-bets-toggle-icon-${key}">${isOpen ? '▲' : '▼'}</span>
          </button>
        </div>
      </div>

      <!-- Gaveta de Detalhes (Expansivel) -->
      <div id="ready-bets-drawer-${key}" class="${isOpen ? '' : 'hidden'} pt-2.5 mt-2 border-t border-amber-500/20 space-y-2 animate-fade-in">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <!-- Coluna 1: Terno de Grupo de Ouro -->
          <div class="bg-slate-950/70 p-2.5 rounded-lg border border-amber-500/25 space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-bold">
              <span class="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-1">
                <span>🏆</span> Terno de Ouro (1º ao 5º)
              </span>
              <span class="text-[10px] text-emerald-400 font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/30">
                Maior Probabilidade
              </span>
            </div>
            
            <div class="grid grid-cols-3 gap-1.5 text-center my-1">
              <div class="p-1.5 rounded-lg bg-slate-900/90 border border-amber-500/30 flex flex-col items-center justify-center">
                <span class="text-xl mb-0.5">${g0.animal_emoji || '🐾'}</span>
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Gr. ${g0.value}</span>
                <span class="text-xs font-black text-amber-200 truncate w-full">${g0.animal_name}</span>
              </div>
              <div class="p-1.5 rounded-lg bg-slate-900/90 border border-amber-500/30 flex flex-col items-center justify-center">
                <span class="text-xl mb-0.5">${g1.animal_emoji || '🐾'}</span>
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Gr. ${g1.value}</span>
                <span class="text-xs font-black text-amber-200 truncate w-full">${g1.animal_name}</span>
              </div>
              <div class="p-1.5 rounded-lg bg-slate-900/90 border border-amber-500/30 flex flex-col items-center justify-center">
                <span class="text-xl mb-0.5">${g2.animal_emoji || '🐾'}</span>
                <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Gr. ${g2.value}</span>
                <span class="text-xs font-black text-amber-200 truncate w-full">${g2.animal_name}</span>
              </div>
            </div>

            <p class="text-[10px] text-slate-400 text-center pt-0.5">💡 Cercado 1º ao 5º: Bancas pagam ate <strong class="text-amber-300">1.500x</strong> se os 3 sairem!</p>
          </div>

          <!-- Coluna 2: Passes / Duques de Grupo -->
          <div class="bg-slate-950/70 p-2.5 rounded-lg border border-indigo-500/25 space-y-1.5">
            <div class="flex items-center justify-between text-[11px] font-bold">
              <span class="text-xs font-black text-indigo-300 uppercase tracking-wider flex items-center gap-1">
                <span>🤝</span> Passes / Duques (1º ao 5º)
              </span>
              <span class="text-[10px] text-slate-400 font-semibold">Top 3 Duplas</span>
            </div>

            <div class="space-y-1.5">
              <div class="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm">${g0.animal_emoji || '🐾'} ${g1.animal_emoji || '🐾'}</span>
                  <span class="font-bold text-slate-200">${g0.animal_name} + ${g1.animal_name}</span>
                  <span class="text-[10px] font-mono text-indigo-300">(Gr. ${g0.value}+${g1.value})</span>
                </div>
                <span class="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">Top 1</span>
              </div>

              <div class="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm">${g0.animal_emoji || '🐾'} ${g2.animal_emoji || '🐾'}</span>
                  <span class="font-bold text-slate-200">${g0.animal_name} + ${g2.animal_name}</span>
                  <span class="text-[10px] font-mono text-indigo-300">(Gr. ${g0.value}+${g2.value})</span>
                </div>
                <span class="text-[9px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">Top 2</span>
              </div>

              <div class="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 flex items-center justify-between text-xs">
                <div class="flex items-center gap-1.5">
                  <span class="text-sm">${g1.animal_emoji || '🐾'} ${g2.animal_emoji || '🐾'}</span>
                  <span class="font-bold text-slate-200">${g1.animal_name} + ${g2.animal_name}</span>
                  <span class="text-[10px] font-mono text-indigo-300">(Gr. ${g1.value}+${g2.value})</span>
                </div>
                <span class="text-[9px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">Top 3</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderReadyBetsCard(groups, targetSlot, targetDate) {
  const container = document.getElementById('ready-bets-container');
  const duquesTabContainer = document.getElementById('duques-tab-ready-bets-container');
  
  if (!groups || groups.length < 3) {
    if (container) container.innerHTML = '';
    if (duquesTabContainer) duquesTabContainer.innerHTML = '';
    return;
  }

  const g0 = groups[0];
  const g1 = groups[1];
  const g2 = groups[2];

  currentReadyBetsData = {
    date: targetDate || document.getElementById('target-date')?.value || new Date().toISOString().split('T')[0],
    slot: targetSlot || document.getElementById('target-slot')?.value || 'LK-23',
    g0,
    g1,
    g2
  };

  // Na aba principal 'Por Bicho': comeca recolhido para manter a tela limpa e focar nas fichas dos animais
  if (container) {
    container.innerHTML = buildReadyBetsHtml(g0, g1, g2, 'main', readyBetsDrawerState.main);
  }

  // Na aba 'Duques': comeca aberto por ser a aba especializada em combinacoes
  if (duquesTabContainer) {
    duquesTabContainer.innerHTML = buildReadyBetsHtml(g0, g1, g2, 'duques', readyBetsDrawerState.duques);
  }
}

window.copyReadyBetsToClipboard = function () {
  if (!currentReadyBetsData) {
    showToast('Nenhum palpite de grupo disponível para cópia.', 'warning');
    return;
  }

  const { date, slot, g0, g1, g2 } = currentReadyBetsData;
  const msg = [
    `🎯 BICHO MASTER PRO - JOGOS PRONTOS DE GRUPO`,
    `📅 Data: ${date} | 🕒 Horário: ${slot}`,
    ``,
    `🏆 TERNO DE GRUPO DE OURO (1º ao 5º):`,
    `👉 Grupo ${g0.value} (${g0.animal_name}) + Grupo ${g1.value} (${g1.animal_name}) + Grupo ${g2.value} (${g2.animal_name})`,
    ``,
    `🤝 PASSES / DUQUES DE GRUPO (1º ao 5º):`,
    `1️⃣ Grupo ${g0.value} (${g0.animal_name}) + Grupo ${g1.value} (${g1.animal_name})`,
    `2️⃣ Grupo ${g0.value} (${g0.animal_name}) + Grupo ${g2.value} (${g2.animal_name})`,
    `3️⃣ Grupo ${g1.value} (${g1.animal_name}) + Grupo ${g2.value} (${g2.animal_name})`,
    ``,
    `🍀 Boa sorte nas apostas!`
  ].join('\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(msg).then(() => {
      showToast('Palpite de Terno e Duques copiado!', 'success');
    }).catch(() => {
      prompt('Copie o palpite abaixo:', msg);
    });
  } else {
    prompt('Copie o palpite abaixo:', msg);
  }
};

function renderDashboard(data) {
  // Informações do Topo
  const slotNameEl = document.getElementById('header-slot-name');
  if (slotNameEl) slotNameEl.textContent = data.target_slot_name || data.target_slot;

  const analyzedCountEl = document.getElementById('analyzed-draws-count');
  if (analyzedCountEl) analyzedCountEl.textContent = `${data.total_draws_analyzed} jogos`;

  // Atualiza também os dados na Tela HOME
  updateHomeScreenData();

  // 0. Fechamento Híbrido Anti-Aleatoriedade
  renderHybridSection(data.hybrid_combo);

  // 0.1 Radar de Quebra de Padrão & Proteção Contra-Banca
  renderPatternBreakSection(data.pattern_break);
  if (typeof window.loadAndRenderPatternBreaksHistory === 'function') {
    window.loadAndRenderPatternBreaksHistory(data.lottery || window.currentLottery || 'RJ');
  }

  // Transição Histórica
  renderTransitionMatrixSection(data.transition_data);

  // 1. Palpites Agrupados por Animal
  const currentSlotVal = document.getElementById('target-slot')?.value || 'LK-23';
  const currentDateVal = document.getElementById('target-date')?.value || new Date().toISOString().split('T')[0];
  renderReadyBetsCard(data.top_groups || [], currentSlotVal, currentDateVal);
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

  if (bcMeta && (bcMeta.is_last_winner || bcMeta.delay_draws_est === 0 || (typeof bcMeta.delay_text === 'string' && bcMeta.delay_text.includes('último')))) {
    const slotStr = bcMeta.last_slot ? ` (${bcMeta.last_slot})` : '';
    badges.push({ icon: '👑', label: `Saiu na cabeça anterior${slotStr}`, color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' });
  } else if (bcMeta && (bcMeta.is_today_winner || bcMeta.delay_days === 0)) {
    const slotStr = bcMeta.last_slot ? ` (${bcMeta.last_slot})` : '';
    badges.push({ icon: '✨', label: `Saiu hoje na cabeça${slotStr}`, color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' });
  } else if (bcMeta && bcMeta.delay_days >= 2) {
    points += 5;
    badges.push({ icon: '⏱️', label: `${bcMeta.delay_days}d sem sair na cabeça`, color: 'bg-rose-500/15 text-rose-300 border-rose-500/30' });
  } else if (bcMeta && bcMeta.delay_days === 1) {
    badges.push({ icon: '⏱️', label: `1d sem sair na cabeça`, color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' });
  }

  if (presencePct >= 10) {
    points += 4;
    badges.push({ icon: '📈', label: `${presencePct}% no 1º ao 5º recente`, color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' });
  }

  if (group.metadata?.matriz_dia?.is_confluent) {
    const matMeta = group.metadata.matriz_dia;
    const confVal = Math.round(matMeta?.confluence_score || 0);
    points += 6;
    badges.push({ icon: '⚡', label: `Chave Mestra (${confVal}% no Grid)`, color: 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm' });
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
    const matrizMeta = g.metadata?.matriz_dia;
    const matrizCentenas = matrizMeta?.top_centenas || [];
    const matrizMilhares = matrizMeta?.top_milhares || [];

    let animalHundreds = allHundreds
      .filter(h => h.group_number === grpNum || animalTens.includes(h.value.slice(-2)))
      .map(h => h.value);

    // Prioriza centenas da Chave Mestra no topo
    if (matrizCentenas.length > 0) {
      animalHundreds = Array.from(new Set([...matrizCentenas, ...animalHundreds]));
    }

    if (animalHundreds.length === 0 && animalTens.length > 0) {
      animalTens.forEach(t => {
        animalHundreds.push(`0${t}`);
        animalHundreds.push(`2${t}`);
      });
    }
    animalHundreds = Array.from(new Set(animalHundreds)).slice(0, 4);

    // 3. Milhares deste animal
    const cruzMeta = g.metadata?.cruz_do_dia;

    let animalThousands = allThousands
      .filter(m => m.group_number === grpNum || animalTens.includes(m.value.slice(-2)))
      .map(m => m.value);

    // Prioriza milhares da Chave Mestra e da Cruz no topo
    if (matrizMilhares.length > 0) {
      animalThousands = Array.from(new Set([...matrizMilhares, ...animalThousands]));
    }
    if (cruzMeta?.thousands && cruzMeta.thousands.length > 0) {
      animalThousands = Array.from(new Set([...cruzMeta.thousands, ...animalThousands]));
    }

    if (animalThousands.length === 0 && animalHundreds.length > 0) {
      animalHundreds.forEach(h => {
        animalThousands.push(`0${h}`);
        animalThousands.push(`1${h}`);
      });
    }
    animalThousands = Array.from(new Set(animalThousands)).slice(0, 4);

    const tensHtml = animalTens.length > 0
      ? animalTens.map(t => `<button type="button" onclick="copySingleNumber(event, '${t}', 'Dezena')" title="Clique para copiar a dezena ${t}" class="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 hover:border-indigo-400 text-indigo-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">${t}</button>`).join(' ')
      : '<span class="text-xs text-slate-500">-</span>';

    const hundredsHtml = animalHundreds.length > 0
      ? animalHundreds.map(h => {
          const isMatrizCentena = matrizCentenas.includes(h);
          const btnCls = isMatrizCentena
            ? 'bg-amber-950/90 border border-amber-500/80 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/30'
            : 'bg-cyan-950/80 border border-cyan-700/60 hover:border-cyan-400 text-cyan-200';
          return `<button type="button" onclick="copySingleNumber(event, '${h}', 'Centena')" title="Clique para copiar a centena ${h}${isMatrizCentena ? ' (⚡ Chave Mestra)' : ''}" class="px-2 py-0.5 rounded ${btnCls} font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer relative">${h}${isMatrizCentena ? '<span class="text-[9px] text-amber-300 ml-0.5" title="Chave Mestra">⚡</span>' : ''}</button>`;
        }).join(' ')
      : '<span class="text-xs text-slate-500">-</span>';

    const thousandsHtml = animalThousands.length > 0
      ? animalThousands.map(m => {
          const isMatrizMilhar = matrizMilhares.includes(m);
          const isCruzMilhar = cruzMeta?.thousands?.includes(m);
          let btnClass = 'bg-amber-950/80 border border-amber-600/60 text-amber-200';
          let badgeIcon = '';
          if (isMatrizMilhar) {
            btnClass = 'bg-amber-950/90 border border-amber-500/80 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/30';
            badgeIcon = '<span class="text-[9px] text-amber-300 ml-0.5" title="Chave Mestra">⚡</span>';
          } else if (isCruzMilhar) {
            btnClass = 'bg-cyan-950/80 border border-cyan-500/70 text-cyan-200';
            badgeIcon = '<span class="text-[9px] text-cyan-300 ml-0.5">✨</span>';
          }
          return `<button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')" title="Clique para copiar o milhar ${m}${isMatrizMilhar ? ' (⚡ Chave Mestra)' : (isCruzMilhar ? ' (Cruz do Dia)' : '')}" class="px-2 py-0.5 rounded ${btnClass} font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer relative">${m}${badgeIcon}</button>`;
        }).join(' ')
      : '<span class="text-xs text-slate-500">-</span>';

    const tensStr = animalTens.join(', ');
    const hundredsStr = animalHundreds.join(', ');
    const thousandsStr = animalThousands.join(', ');

    // Badges rápidos de convergência (máximo 2 mais importantes)
    const quickBadges = (therm.badges || []).slice(0, 2).map(b => `
      <span class="hidden md:inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${b.color}">
        ${b.icon} ${b.label}
      </span>
    `).join(' ');

    return `
      <div class="card-glass p-2.5 sm:p-3 rounded-xl border border-slate-800/90 hover:border-emerald-500/40 transition-all animate-fade-in space-y-2">
        <!-- Linha 1: Bicho + Força/Confiança + Ações (Horizontal Integrada) -->
        <div class="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div class="flex items-center gap-2 min-w-0 flex-wrap">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-lg animal-badge shrink-0 bg-emerald-500/15 border border-emerald-500/30 shadow-inner">
              ${animEmoji}
            </div>
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              <span class="text-[10px] font-black px-1.5 py-0.2 rounded ${idx === 0 ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm' : 'bg-slate-800 text-slate-300'}">
                #${idx + 1}
              </span>
              <h3 class="font-black text-sm sm:text-base text-white tracking-tight">${animName}</h3>
              <span class="text-[11px] font-mono font-bold text-slate-400 bg-slate-900/90 px-1.5 py-0.2 rounded border border-slate-800">Gr. ${grpStr}</span>

              <!-- Selo Único de Confiança (Sem duplicações) -->
              <span class="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md ${therm.levelColor} bg-slate-950/90 border border-slate-800">
                <span>${therm.flame}</span>
                <span>${therm.confidence}%</span>
                <span class="hidden sm:inline font-semibold text-[10px] text-slate-400">• ${therm.desc}</span>
              </span>

              <!-- Selos de Convergência Compactos -->
              ${quickBadges}
            </div>
          </div>

          <!-- Ações do Card -->
          <div class="flex items-center gap-1.5 shrink-0">
            <button type="button" onclick="copyCompleteAnimalCard(this, '${animEmoji}', '${animName}', '${grpStr}', '${tensStr}', '${hundredsStr}', '${thousandsStr}')"
              title="Copiar jogo completo deste animal"
              class="px-2.5 py-1 rounded-lg bg-indigo-600/25 hover:bg-indigo-600/45 border border-indigo-500/30 hover:border-indigo-400 text-indigo-200 hover:text-white text-xs font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm">
              <span>📋</span> <span>Copiar</span>
            </button>
            <button type="button" onclick="openFactorsModal('Grupo ${grpStr} - ${animName}', ${score}, ${JSON.stringify(g.factors || []).replace(/"/g, '&quot;')})"
              class="text-slate-400 hover:text-indigo-300 font-bold flex items-center gap-0.5 text-[11px] transition-colors cursor-pointer px-1 py-1">
              <span>Fatores</span> &rarr;
            </button>
          </div>
        </div>

        <!-- Linha 2: Fila Contínua de Números (Dezenas • Centenas • Milhares em Linha Única) -->
        <div class="p-2 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
          <!-- Dezenas -->
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1 shrink-0">
              <span>🔢</span> Dez:
            </span>
            <div class="flex items-center gap-1 flex-wrap">
              ${tensHtml}
            </div>
          </div>

          <span class="text-slate-800 hidden sm:inline">•</span>

          <!-- Centenas -->
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1 shrink-0">
              <span>💎</span> Cen:
            </span>
            <div class="flex items-center gap-1 flex-wrap">
              ${hundredsHtml}
            </div>
          </div>

          <span class="text-slate-800 hidden sm:inline">•</span>

          <!-- Milhares -->
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="text-[10px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1 shrink-0">
              <span>👑</span> Mil:
            </span>
            <div class="flex items-center gap-1 flex-wrap">
              ${thousandsHtml}
            </div>
          </div>
        </div>

        <!-- Linha 3: Rodapé Minimalista -->
        <div class="flex items-center justify-between text-[10px] text-slate-400 px-1 pt-0.5">
          <span>🛡️ <b class="text-amber-300">Sugestão:</b> Grupo ${grpStr} e Dezenas no 1º ao 5º</span>
          <span class="text-slate-500 hidden sm:inline">Toque em qualquer número para copiar avulso</span>
        </div>
      </div>
    `;
  }).join('');
}


/* ==========================================================================
   RADAR DE QUEBRA DE PADRÃO & PROTEÇÃO CONTRA-BANCA
   ========================================================================== */
function renderPatternBreakSection(pb) {
  const card = document.getElementById('pattern-break-card');
  if (!card) return;

  if (!pb || !pb.primary_break_animal) {
    card.classList.add('hidden');
    card.innerHTML = '';
    return;
  }

  card.classList.remove('hidden');

  // Atualiza badge de alerta na abinha Contra-Banca
  const contraTabBadge = document.getElementById('topic-contra-badge');
  if (contraTabBadge) {
    if (pb.risk_level === 'ALTO' || pb.risk_percentage >= 65) {
      contraTabBadge.classList.remove('hidden');
    } else {
      contraTabBadge.classList.add('hidden');
    }
  }

  let borderStyle = 'border-rose-500/40 bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-900 shadow-rose-950/20';
  let badgeStyle = 'bg-rose-500/20 text-rose-300 border-rose-500/40';

  if (pb.risk_level === 'MODERADO') {
    borderStyle = 'border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 shadow-amber-950/20';
    badgeStyle = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
  } else if (pb.risk_level === 'BAIXO') {
    borderStyle = 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-slate-900 to-slate-900 shadow-emerald-950/20';
    badgeStyle = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  }

  const b1 = pb.primary_break_animal;
  const b2 = pb.secondary_break_animal;
  const fav_name = (window.currentPrediction?.top_groups?.[0]?.animal_name) || 'Favorito';
  const hedges = pb.hedge_combos || [];
  const protTens = pb.protection_tens || [];
  const protHundreds = pb.protection_hundreds || [];

  const lastRef = pb.last_draw_reference || {};
  const lastAnim = lastRef.animal || 'Último Resultado';
  const lastGroup = lastRef.group ? `Gr. ${String(lastRef.group).padStart(2, '0')}` : '';
  const lastPrize = lastRef.prize_1 ? `1º Prêmio ${lastRef.prize_1}` : '';
  const lastSlot = lastRef.slot ? `${lastRef.slot}` : '';
  const lastEmoji = lastRef.emoji || '🐾';

  const hedgesHtml = hedges.map(h => `
    <div class="p-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <span class="text-xs font-mono font-black text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">${h.tens_formatted}</span>
        <div class="flex flex-col">
          <span class="text-[11px] font-bold text-slate-200 leading-tight">${h.label}</span>
          <span class="text-[9px] text-slate-400 leading-none">${h.strategy}</span>
        </div>
      </div>
      <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 shrink-0">${h.badge}</span>
    </div>
  `).join('');

  card.innerHTML = `
    <div class="card-glass p-3.5 sm:p-4 rounded-2xl border ${borderStyle} shadow-xl space-y-3">
      <!-- Topo: Título + Badge de Risco -->
      <div class="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-800/80">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-sm shadow-sm">
            🛡️
          </div>
          <div>
            <h3 class="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <span>Radar de Quebra de Padrão</span>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 uppercase tracking-widest">Contra-Banca</span>
              ${pb.assimilation?.has_empirical_learning ? '<span class="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">📊 RADAR CALIBRADO</span>' : ''}
            </h3>
            <p class="text-[10px] text-slate-400">Proteção estatística contra inversões e zebras calculadas</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full border ${badgeStyle} shadow-sm flex items-center gap-1 animate-pulse">
            ${pb.risk_badge} (${pb.risk_percentage}%)
          </span>
        </div>
      </div>

            <!-- Badge de Origem da Quebra: Último Resultado -->
      <div class="flex items-center justify-between flex-wrap gap-1.5 p-2 rounded-xl bg-slate-950/80 border border-amber-500/30 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-base">${lastEmoji}</span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] uppercase font-bold text-slate-400">Base da Quebra (Último Resultado):</span>
            <span class="font-black text-amber-300">${lastAnim} (${lastGroup})</span>
            ${lastPrize ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-200 border border-amber-500/20">${lastPrize}</span>` : ''}
            ${lastSlot ? `<span class="text-[10px] font-mono text-slate-400">(${lastSlot})</span>` : ''}
          </div>
        </div>
        <span class="text-[9px] font-bold text-cyan-300 bg-cyan-950/80 border border-cyan-500/30 px-2 py-0.5 rounded-full">Anti-Puxada Contra-Banca</span>
      </div>

      <!-- Explicação Contextual -->
      <p class="text-[11px] text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/60">
        ${pb.reason}
      </p>

      <!-- Grade dos Bichos de Quebra -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <!-- Bicho 1: Simetria Polar -->
        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 uppercase tracking-wider">🎯 Bicho da Contra (Zebra Principal)</span>
            <span class="text-lg leading-none">${b1.emoji || '🐾'}</span>
          </div>
          <div class="flex items-center gap-2">
            <h4 class="text-sm font-black text-white uppercase">${b1.name}</h4>
            <span class="text-xs font-bold text-slate-400 font-mono">Gr. ${String(b1.group).padStart(2, '0')}</span>
          </div>
          <div class="flex items-center gap-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Dezenas:</span>
            <span class="font-mono font-bold text-slate-200">${b1.tens.join(' • ')}</span>
          </div>
        </div>

        <!-- Bicho 2: Zebra de Pressão -->
        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
          <div class="flex items-center justify-between">
            <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 uppercase tracking-wider">⚡ Segunda Cobertura</span>
            <span class="text-lg leading-none">${b2.emoji || '🐾'}</span>
          </div>
          <div class="flex items-center gap-2">
            <h4 class="text-sm font-black text-white uppercase">${b2.name}</h4>
            <span class="text-xs font-bold text-slate-400 font-mono">Gr. ${String(b2.group).padStart(2, '0')}</span>
          </div>
          <div class="flex items-center gap-1 text-[10px] text-slate-400 pt-1 border-t border-slate-800/60">
            <span>Dezenas:</span>
            <span class="font-mono font-bold text-slate-200">${b2.tens.join(' • ')}</span>
          </div>
        </div>
      </div>

      <!-- Dezenas e Centenas de Cobertura -->
      <div class="grid grid-cols-2 gap-2 text-center">
        <div class="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Dezenas para Cercar</span>
          <div class="flex items-center justify-center gap-1.5">
            ${protTens.map(t => `<span class="text-xs font-mono font-black text-rose-300 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">${t}</span>`).join('')}
          </div>
        </div>
        <div class="p-2 rounded-xl bg-slate-950/70 border border-slate-800/80">
          <span class="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Centenas da Zebra</span>
          <div class="flex items-center justify-center gap-1.5">
            ${protHundreds.map(c => `<span class="text-xs font-mono font-black text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">${c}</span>`).join('')}
          </div>
        </div>
      </div>

      <!-- Duques de Cobertura (Hedge Bets) -->
      <div class="space-y-1.5 pt-1">
        <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 px-0.5">
          <span class="uppercase tracking-wider">Duques de Proteção (Último Resultado + Contra-Banca)</span>
          <span class="text-indigo-400">1º ao 5º Prêmio</span>
        </div>
        <div class="space-y-1.5">
          ${hedgesHtml}
        </div>
      </div>

      <!-- Dica Rápida de Aposta -->
      <div class="p-2.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 flex items-start gap-2 text-[10px] text-indigo-200 leading-relaxed">
        <span class="text-sm shrink-0">💡</span>
        <div>
          <strong class="text-white">Como lucrar com esta proteção:</strong>
          Se a banca tentar quebrar a puxada do último resultado (${lastAnim}), cubra com uma moeda no <strong>Bicho da Contra (${b1.name})</strong> ou faça os <strong>Duques de Proteção</strong> do 1º ao 5º. Se der a continuidade do favorito, você fatura; se a banca quebrar o padrão do último sorteio, você ganha na zebra!
        </div>
      </div>
    </div>
  `;
}



/* ==========================================================================
   CARREGAMENTO E AUDITORIA DO HISTÓRICO DE QUEBRAS DE PADRÃO
   ========================================================================== */
window.loadAndRenderPatternBreaksHistory = async function(lottery) {
  const container = document.getElementById('pattern-breaks-history-container');
  if (!container) return;

  const effLot = (lottery || window.currentLottery || 'RJ').toUpperCase();
  container.innerHTML = `
    <div class="p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400 animate-pulse">
      Carregando histórico de quebras da banca (${effLot})...
    </div>
  `;

  try {
    const clientApi = window.api || (typeof api !== 'undefined' ? api : null);
    const data = (clientApi && typeof clientApi.getPatternBreaks === 'function') ? await clientApi.getPatternBreaks(effLot, 20) : {};
    const totalBreaks = data.total_breaks || 0;
    const contraHits = data.contra_hits || 0;
    const rate = data.contra_protection_rate || 0;
    const zebras = data.top_escape_animals || [];
    const history = data.history || [];

    if (totalBreaks === 0 && history.length === 0) {
      container.innerHTML = `
        <div class="p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 text-center space-y-1">
          <p class="text-xs font-bold text-slate-300">Nenhuma quebra registrada ainda para ${effLot}</p>
          <p class="text-[10px] text-slate-500">As quebras são catalogadas automaticamente a cada sorteio apurado pela banca.</p>
        </div>
      `;
      return;
    }

    const zebrasHtml = zebras.map(z => `
      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
        <div class="flex items-center gap-1.5">
          <span class="w-5 h-5 rounded-full bg-rose-500/20 text-rose-300 font-black text-[10px] flex items-center justify-center">${z.group}</span>
          <span class="font-bold text-slate-200">${z.animal}</span>
        </div>
        <div class="flex items-center gap-2 text-[10px]">
          <span class="text-slate-400 font-medium">${z.count}x</span>
          <span class="font-bold text-amber-300 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">${z.percentage}%</span>
        </div>
      </div>
    `).join('');

    const historyHtml = history.map(h => {
      const hitBadge = h.hit_contra 
        ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center gap-1">🎯 Proteção Salvou</span>`
        : `<span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 border border-slate-700 text-slate-400">Zebra Catalogada</span>`;

      return `
        <div class="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition-all flex items-center justify-between flex-wrap gap-2 text-xs">
          <div class="flex items-center gap-2.5">
            <div class="flex flex-col">
              <span class="font-black text-amber-300 font-mono text-[11px]">${h.slot}</span>
              <span class="text-[9px] text-slate-500">${h.draw_date ? h.draw_date.split('-').reverse().slice(0, 2).join('/') : ''}</span>
            </div>
            <div class="h-6 w-[1px] bg-slate-800"></div>
            <div class="flex flex-col">
              <div class="flex items-center gap-1 text-[11px]">
                <span class="text-slate-400">Favorito:</span>
                <span class="font-bold text-slate-300">${h.favorite_animal}</span>
                <span class="text-[9px] text-slate-500">(Gr ${h.favorite_group})</span>
              </div>
              <div class="flex items-center gap-1 text-[11px]">
                <span class="text-rose-400 font-medium">Banca Deu:</span>
                <strong class="text-white font-black">${h.actual_winner_animal}</strong>
                <span class="text-[9px] text-amber-400 font-mono">1º: ${h.actual_prize_1 || ''}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            ${hitBadge}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="card-glass p-3.5 sm:p-4 rounded-2xl border border-slate-800 space-y-3.5">
        <!-- Cabeçalho de Métricas de Quebra -->
        <div class="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-800">
          <div>
            <h4 class="text-xs sm:text-sm font-black text-white flex items-center gap-1.5">
              <span>Auditoria Empírica de Quebras</span>
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">${effLot}</span>
            </h4>
            <p class="text-[10px] text-slate-400">Registro real de desvios da banca contra os favoritos matemáticos</p>
          </div>
          <div class="flex items-center gap-2">
            <div class="px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-center">
              <div class="text-[9px] text-slate-400">Total Quebras</div>
              <div class="text-xs font-black text-rose-400 font-mono">${totalBreaks}</div>
            </div>
            <div class="px-2 py-1 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-center">
              <div class="text-[9px] text-emerald-300">Proteção Ativa</div>
              <div class="text-xs font-black text-emerald-400 font-mono">${contraHits} acertos (${rate}%)</div>
            </div>
          </div>
        </div>

        <!-- Top Zebras da Banca -->
        ${zebras.length > 0 ? `
          <div class="space-y-1.5">
            <div class="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Zebras Mais Frequentes (Rotas de Fuga da ${effLot})</span>
              <span class="text-slate-500 text-[9px]">Histórico de Inversão</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              ${zebrasHtml}
            </div>
          </div>
        ` : ''}

        <!-- Feed Recente de Quebras -->
        <div class="space-y-1.5 pt-1">
          <div class="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Últimas Quebras Registradas & Auditadas</span>
            <span class="text-slate-500 text-[9px]">${history.length} mais recentes</span>
          </div>
          <div class="space-y-1 max-h-64 overflow-y-auto pr-1">
            ${historyHtml}
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Erro ao carregar histórico de quebras:', err);
    container.innerHTML = `
      <div class="p-3 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-300 text-xs text-center">
        Não foi possível carregar o histórico de quebras agora.
      </div>
    `;
  }
};


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
    <div class="card-glass p-3 sm:p-4 rounded-xl border border-slate-800 hover:border-indigo-500/40 transition-all space-y-3">
      <!-- Topo: Título, Descrição e Botão Copiar Tudo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-base shadow-inner shrink-0">
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
    <div class="card-glass p-3 sm:p-4 rounded-xl border border-amber-500/30 bg-gradient-to-b from-amber-950/10 via-slate-900/80 to-slate-900/90 shadow-lg space-y-3 relative overflow-hidden">
      <!-- Topo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/40 flex items-center justify-center text-base shadow-inner shrink-0">
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

      let bcBadge = '';
      if (g.metadata?.bichocerto) {
        const bc = g.metadata.bichocerto;
        if (bc.is_last_winner || bc.delay_draws_est === 0 || (typeof bc.delay_text === 'string' && bc.delay_text.includes('último'))) {
          bcBadge = `<div class="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
             <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30">
               <span>👑</span> Saiu na cabeça anterior (${bc.last_slot || 'recente'})
             </span>
           </div>`;
        } else if (bc.is_today_winner || bc.delay_days === 0) {
          bcBadge = `<div class="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
             <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30">
               <span>✨</span> Saiu hoje na cabeça (${bc.last_slot || 'recente'})
             </span>
           </div>`;
        } else if (bc.delay_days >= 1) {
          bcBadge = `<div class="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-rose-300">
             <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30">
               <span>🕒</span> ${bc.delay_days} dias sem sair (${bc.delay_draws_est} apurações)
             </span>
           </div>`;
        }
      }

      const presencePct = g.metadata?.presence_pct;
      const presenceBadge = (presencePct !== undefined && presencePct !== null)
        ? `<div class="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300">
             <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30">
               <span>📈</span> ${presencePct}% de presença no 1º ao 5º (últimos 30 sorteios)
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
          ? `<span class="inline-block text-[10px] text-emerald-400 font-semibold ml-1.5 px-1.5 py-0.2 rounded bg-emerald-950/40 border border-emerald-800/40" title="Presente em ${presencePct}% dos últimos 30 sorteios (1º ao 5º)">📈 ${presencePct}%</span>`
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
    `🛡️ Sugestão: Grupo ${group} e Dezenas no 1º ao 5º`
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

/* ==========================================================================
   TELA 6: RESULTADOS DAS EXTRAÇÕES (TABELA MODULAR & LOTERIAS UNIFICADAS)
   ========================================================================== */

const OFFICIAL_LOTTERY_SLOTS = {
  RJ: [
    { code: 'PPT', name: 'PPT - 09:20', time: '09:20' },
    { code: 'PTM', name: 'PTM - 11:20', time: '11:20' },
    { code: 'PT', name: 'PT - 14:20', time: '14:20' },
    { code: 'PTV', name: 'PTV - 16:20', time: '16:20' },
    { code: 'PTN', name: 'PTN - 18:20', time: '18:20' },
    { code: 'COR', name: 'Coruja - 21:20', time: '21:20' },
  ],
  SP: [
    { code: 'SP-08', name: 'PT-SP 08h20 - 08:20', time: '08:20' },
    { code: 'SP-10', name: 'PT-SP 10h - 10:00', time: '10:00' },
    { code: 'SP-13', name: 'PT-SP 13h - 13:00', time: '13:00' },
    { code: 'SP-15', name: 'BAND-SP 15h30 - 15:30', time: '15:30' },
    { code: 'SP-17', name: 'PT-SP 17h - 17:00', time: '17:00' },
    { code: 'SP-19', name: 'PT-SP 19h - 19:00', time: '19:00' },
    { code: 'SP-20', name: 'PTN-SP 20h - 20:00', time: '20:00' },
  ],
  LOOK: [
    { code: 'LK-07', name: 'Look 07h - 07:20', time: '07:20' },
    { code: 'LK-09', name: 'Look 09h - 09:20', time: '09:20' },
    { code: 'LK-11', name: 'Look 11h - 11:20', time: '11:20' },
    { code: 'LK-14', name: 'Look 14h - 14:20', time: '14:20' },
    { code: 'LK-16', name: 'Look 16h - 16:20', time: '16:20' },
    { code: 'LK-18', name: 'Look 18h - 18:20', time: '18:20' },
    { code: 'LK-21', name: 'Look 21h - 21:20', time: '21:20' },
    { code: 'LK-23', name: 'Look 23h - 23:20', time: '23:20' },
  ],
  NACIONAL: [
    { code: 'LN-02', name: 'Nacional 02h - 02:00', time: '02:00' },
    { code: 'LN-08', name: 'Nacional 08h - 08:00', time: '08:00' },
    { code: 'LN-10', name: 'Nacional 10h - 10:00', time: '10:00' },
    { code: 'LN-12', name: 'Nacional 12h - 12:00', time: '12:00' },
    { code: 'LN-15', name: 'Nacional 15h - 15:00', time: '15:00' },
    { code: 'LN-17', name: 'Nacional 17h - 17:00', time: '17:00' },
    { code: 'LN-19', name: 'Nacional 19h - 19:00', time: '19:00' },
    { code: 'LN-21', name: 'Nacional 21h - 21:00', time: '21:00' },
    { code: 'LN-23', name: 'Nacional 23h - 23:00', time: '23:00' },
  ],
  FEDERAL: [
    { code: 'FED', name: 'Federal (Quarta e Domingo)', time: '20:00' },
  ]
};

const RESULTS_LOTTERIES_CATALOG = [
  { code: 'RJ', name: 'Rio de Janeiro', state: 'RJ', icon: '🏛️' },
  { code: 'LOOK', name: 'Look', state: 'LK', icon: '🎯' },
  { code: 'SP', name: 'São Paulo', state: 'SP', icon: '🏙️' },
  { code: 'NACIONAL', name: 'Loteria Nacional', state: 'BR', icon: '🇧🇷' },
  { code: 'FEDERAL', name: 'Loteria Federal', state: 'FED', icon: '⚖️' },
];

window.selectResultLottery = async function (lotteryCode) {
  if (!lotteryCode) return;
  currentLottery = lotteryCode;
  localStorage.setItem('bicho_active_lottery', lotteryCode);
  updateLotteryButtonsUI();
  await loadDrawResults();
};

function getAnimalMetaForNumber(numStr) {
  if (!numStr) return { group: '-', name: '-', emoji: '🐾' };
  const clean = String(numStr).replace(/\D/g, '');
  if (!clean) return { group: '-', name: '-', emoji: '🐾' };
  const dezena = parseInt(clean.slice(-2), 10);
  const grp = dezena === 0 ? 25 : Math.floor((dezena - 1) / 4) + 1;
  const bicho = ALL_ANIMALS_CATALOG.find(a => a.group === grp);
  return {
    group: grp,
    name: bicho ? bicho.name : `Grupo ${grp}`,
    emoji: bicho ? bicho.emoji : '🐾',
  };
}

async function loadDrawResults(dateOverride = null) {
  const contentEl = document.getElementById('draw-results-content');
  const summaryEl = document.getElementById('results-day-summary');
  const pillsEl = document.getElementById('results-day-pills');
  const lotteryGridEl = document.getElementById('results-lottery-grid');
  if (!contentEl) return;

  // 1. Renderiza o grid de Loterias no topo da tela de Resultados
  if (lotteryGridEl) {
    lotteryGridEl.innerHTML = RESULTS_LOTTERIES_CATALOG.map(lot => {
      const isSelected = (currentLottery || 'RJ').toUpperCase() === lot.code;
      const activeClasses = isSelected
        ? 'bg-emerald-500 text-slate-950 font-black shadow-lg shadow-emerald-500/25 ring-1 ring-emerald-400'
        : 'bg-slate-900/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800 font-bold';
      return `
        <button type="button" onclick="selectResultLottery('${lot.code}')"
          class="px-3 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer ${activeClasses}">
          <span>${lot.icon}</span> <span>${lot.name}</span>
        </button>
      `;
    }).join('');
  }

  try {
    // 2. Busca os últimos sorteios da base para a loteria ativa
    const resData = await api.getResults(60, 0, currentLottery);
    const items = resData?.items || [];

    // Agrupa por data filtrando estritamente pela loteria ativa
    const activeLotKey = (currentLottery || 'RJ').toUpperCase();
    allRecentDrawsByDate = {};
    items.forEach((draw) => {
      // Federal corre estritamente às quartas-feiras e aos domingos
      if (activeLotKey === 'FEDERAL') {
        let isFedDay = false;
        try {
          const parts = draw.draw_date.split('-');
          if (parts.length === 3) {
            const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const dow = dt.getDay(); // 0 = Domingo, 3 = Quarta
            if (dow === 0 || dow === 3) isFedDay = true;
          }
        } catch (e) {}
        if (!isFedDay) return;
        if (draw.lottery && draw.lottery.toUpperCase() !== 'FEDERAL' && draw.slot !== 'FED') {
          return;
        }
      } else if (activeLotKey === 'RJ') {
        // No RJ, aceita sorteios do RJ e a Federal (FED) que substitui a extração das 18h às quartas
        if (draw.lottery && draw.lottery.toUpperCase() !== 'RJ' && draw.slot !== 'FED') {
          return;
        }
      } else {
        if (draw.lottery && draw.lottery.toUpperCase() !== activeLotKey) {
          return;
        }
      }
      const d = draw.draw_date;
      if (!allRecentDrawsByDate[d]) allRecentDrawsByDate[d] = {};
      allRecentDrawsByDate[d][draw.slot] = draw;
    });

    // Garante que a data de hoje esteja presente na lista apenas se for dia de sorteio
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const todayDow = today.getDay(); // 0 = Dom, 3 = Qua
    const datesSet = new Set(Object.keys(allRecentDrawsByDate));

    if (activeLotKey === 'FEDERAL') {
      if (todayDow === 0 || todayDow === 3) {
        datesSet.add(todayStr);
      }
      // Filtra para garantir que NENHUM sábado ou outro dia entre nas pills da Federal
      availableDatesList = Array.from(datesSet)
        .filter(dateStr => {
          try {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
              const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
              const dow = dt.getDay();
              return dow === 0 || dow === 3; // Somente Domingo e Quarta
            }
          } catch (e) {}
          return false;
        })
        .sort().reverse().slice(0, 8);
    } else {
      datesSet.add(todayStr);
      availableDatesList = Array.from(datesSet).sort().reverse().slice(0, 8);
    }

    // Determina a data ativa
    if (dateOverride && availableDatesList.includes(dateOverride)) {
      selectedResultDate = dateOverride;
    } else if (!selectedResultDate || !availableDatesList.includes(selectedResultDate)) {
      const todayHasDraws = allRecentDrawsByDate[todayStr] && Object.keys(allRecentDrawsByDate[todayStr]).length > 0;
      if (todayHasDraws && availableDatesList.includes(todayStr)) {
        selectedResultDate = todayStr;
      } else {
        const latestWithDraws = availableDatesList.find(d => allRecentDrawsByDate[d] && Object.keys(allRecentDrawsByDate[d]).length > 0);
        selectedResultDate = latestWithDraws || availableDatesList[0] || todayStr;
      }
    }

    // 3. Renderiza as Pills de Dias (Hoje, Ontem, etc.)
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
              class="px-2.5 py-1.5 rounded-lg text-xs transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer ${activeClasses}">
              <span>${label}</span>
              <span class="text-[9px]">${statusDot}</span>
            </button>
          `;
        })
        .join('');
    }

    // 4. Determina lista de horários EXCLUSIVA da loteria ativa
    const lotKey = (currentLottery || 'RJ').toUpperCase();
    const baseSlots = OFFICIAL_LOTTERY_SLOTS[lotKey] || OFFICIAL_LOTTERY_SLOTS.RJ;

    let isWed = false;
    try {
      const parts = selectedResultDate.split('-');
      if (parts.length === 3) {
        const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const dow = dt.getDay(); // 0 = Dom, 3 = Qua
        if (dow === 3) isWed = true;
      }
    } catch(e) {}

    let slots = baseSlots.map(s => {
      // No RJ às quartas, o sorteio das 18h é a Federal (FED às 20h)
      if (lotKey === 'RJ' && isWed && s.code === 'PTN') {
        return getFriendlySlotMeta('FED', selectedResultDate);
      }
      return { ...s };
    });

    if (lotKey === 'FEDERAL') {
      slots = [getFriendlySlotMeta('FED', selectedResultDate)];
    }

    // Inclui dinamicamente apenas slots que pertencem à loteria ativa
    const dayDraws = allRecentDrawsByDate[selectedResultDate] || {};
    Object.keys(dayDraws).forEach((drawSlotCode) => {
      const draw = dayDraws[drawSlotCode];
      if (draw && draw.lottery && draw.lottery.toUpperCase() !== lotKey && !(lotKey === 'RJ' && draw.slot === 'FED' && isWed)) {
        return;
      }
      if (!slots.some(s => s.code === drawSlotCode)) {
        slots.push(getFriendlySlotMeta(drawSlotCode, selectedResultDate));
      }
    });

    // Filtra estritamente para garantir que nenhum horário de outra loteria vaze
    slots = slots.filter(s => {
      if (lotKey === 'RJ') {
        if (s.code === 'FED') return isWed;
        if (s.code === 'PTN') return !isWed;
        return !s.code.startsWith('SP-') && !s.code.startsWith('LK-') && !s.code.startsWith('LN-');
      }
      if (lotKey === 'SP') return s.code.startsWith('SP-');
      if (lotKey === 'LOOK') return s.code.startsWith('LK-');
      if (lotKey === 'NACIONAL') return s.code.startsWith('LN-');
      if (lotKey === 'FEDERAL') return s.code === 'FED';
      return true;
    });

    // Ordena cronologicamente
    slots.sort((a, b) => getSlotMinutes(a, selectedResultDate) - getSlotMinutes(b, selectedResultDate));

    // 5. Atualiza o resumo no cabeçalho
    const drawnCount = slots.filter(s => dayDraws[s.code]).length;
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
  const allPrizes = [];

  for (let order = 1; order <= 7; order++) {
    const fromDetail = details.find(p => p.order === order);
    const rawNumber = fromDetail?.number || draw[`prize_${order}`] || '';
    if (!rawNumber && order > 5) continue;

    let animalName = fromDetail?.animal_name;
    let animalEmoji = fromDetail?.animal_emoji;
    let group = fromDetail?.group;

    if (!animalName || !animalEmoji || !group || group === '-') {
      const fallbackMeta = getAnimalMetaForNumber(rawNumber);
      group = fallbackMeta.group;
      animalName = fallbackMeta.name;
      animalEmoji = fallbackMeta.emoji;
    }

    allPrizes.push({
      order,
      number: rawNumber,
      group,
      animal_name: animalName,
      animal_emoji: animalEmoji
    });
  }

  const rowsHtml = allPrizes.map((p) => {
    let prizeCol = '';
    let rowBg = 'hover:bg-slate-800/40 transition-colors';
    let milharCol = `<span class="font-mono font-bold text-slate-100 text-xs sm:text-sm tracking-wide">${p.number || '-'}</span>`;

    if (p.order === 1) {
      prizeCol = `
        <div class="flex items-center gap-1 font-black text-amber-300 text-xs">
          <span>👑</span>
          <span>1º<span class="hidden sm:inline"> Pr.</span></span>
        </div>
      `;
      rowBg = 'bg-amber-500/10 hover:bg-amber-500/15 transition-colors border-l-2 border-amber-400';
      milharCol = `<span class="font-mono font-black text-amber-300 text-xs sm:text-base tracking-wider drop-shadow">${p.number || '-'}</span>`;
    } else if (p.order === 6) {
      prizeCol = `
        <div class="flex items-center gap-1">
          <span class="font-bold text-slate-200 text-xs">6º</span>
          <span class="text-[8px] font-black px-1 py-0.5 rounded bg-indigo-500/25 text-indigo-300 uppercase leading-none">SOMA</span>
        </div>
      `;
      rowBg = 'bg-indigo-950/20 hover:bg-indigo-950/35 transition-colors';
      milharCol = `<span class="font-mono font-bold text-indigo-200 text-xs sm:text-sm tracking-wide">${p.number || '-'}</span>`;
    } else if (p.order === 7) {
      prizeCol = `
        <div class="flex items-center gap-1">
          <span class="font-bold text-slate-200 text-xs">7º</span>
          <span class="text-[8px] font-black px-1 py-0.5 rounded bg-amber-500/25 text-amber-300 uppercase leading-none">MULT</span>
        </div>
      `;
      rowBg = 'bg-amber-950/20 hover:bg-amber-950/35 transition-colors';
      milharCol = `<span class="font-mono font-bold text-amber-200 text-xs sm:text-sm tracking-wide">${p.number || '-'}</span>`;
    } else {
      prizeCol = `<span class="font-bold text-slate-300 text-xs">${p.order}º<span class="hidden sm:inline"> Pr.</span></span>`;
    }

    const groupText = p.group !== '-' ? String(p.group).padStart(2, '0') : '-';

    return `
      <tr class="${rowBg}">
        <td class="py-2 sm:py-2.5 px-1.5 sm:px-3">${prizeCol}</td>
        <td class="py-2 sm:py-2.5 px-1 sm:px-2 text-center">${milharCol}</td>
        <td class="py-2 sm:py-2.5 px-1 sm:px-2 text-center">
          <span class="font-mono font-bold text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 inline-block">
            ${groupText}
          </span>
        </td>
        <td class="py-2 sm:py-2.5 px-1.5 sm:px-3">
          <div class="flex items-center gap-1 sm:gap-1.5 min-w-0">
            <span class="text-sm sm:text-base leading-none shrink-0">${p.animal_emoji || '🎯'}</span>
            <span class="font-black text-white text-[11px] sm:text-xs truncate uppercase tracking-tight">${p.animal_name || '-'}</span>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  return `
    <div class="card-glass p-2.5 sm:p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition-all animate-fade-in space-y-2.5 overflow-hidden shadow-xl bg-slate-900/90 flex flex-col justify-between">
      <div>
        <!-- Topo do Horário -->
        <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80 mb-2.5">
          <div class="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <span class="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-100 flex items-center gap-1.5 truncate">
              <span>🕐</span> ${slotInfo.name}
            </span>
            <span class="text-[9px] sm:text-[10px] font-bold px-1.5 sm:px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> APURADO
            </span>
          </div>
          <button type="button" onclick="selectSlotForPrediction('${slotInfo.code}', '${draw.draw_date}')" 
            class="px-2 sm:px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-500/60 text-[10px] sm:text-[11px] text-indigo-300 hover:text-white font-bold flex items-center gap-1 transition-all shadow-sm active:scale-95 cursor-pointer shrink-0">
            <span>🎯 Palpite</span> &rarr;
          </button>
        </div>

        <!-- Tabela Estruturada de Prêmios (100% responsiva, sem scroll horizontal no celular) -->
        <div class="w-full rounded-xl border border-slate-800 bg-slate-950/80 shadow-inner overflow-hidden">
          <table class="w-full table-fixed text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-900/90 text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-slate-800">
                <th class="py-2 px-1.5 sm:px-3 text-slate-300 w-[22%] sm:w-[24%]">Prêmio</th>
                <th class="py-2 px-1 sm:px-2 font-mono text-center text-slate-300 w-[26%] sm:w-[25%]">Milhar</th>
                <th class="py-2 px-1 sm:px-2 text-center text-slate-300 w-[18%] sm:w-[17%]">Grupo</th>
                <th class="py-2 px-1.5 sm:px-3 text-slate-300 w-[34%] sm:w-[34%]">Bicho</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-medium">
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function renderPendingSlotCard(slotInfo, isToday) {
  const statusText = isToday
    ? `Aguardando apuração às ${slotInfo.time}. Clique em "Puxar Resultados" no topo após o horário para sincronizar.`
    : `Nenhum resultado registrado para esta extração nesta data.`;

  return `
    <div class="card-glass p-3.5 sm:p-4 rounded-xl border border-dashed border-slate-800/80 bg-slate-900/40 flex flex-col justify-between gap-3 animate-fade-in opacity-85 hover:opacity-100 transition-opacity">
      <div class="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800/60">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-slate-300 flex items-center gap-1.5">
            <span>🕒</span> ${slotInfo.name}
          </span>
          <span class="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            AGUARDANDO
          </span>
        </div>
      </div>
      <div class="py-8 flex flex-col items-center justify-center text-center space-y-2">
        <div class="w-10 h-10 rounded-xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center text-base text-slate-400">
          ⏳
        </div>
        <p class="text-xs text-slate-400 max-w-xs leading-relaxed">${statusText}</p>
      </div>
      <div class="pt-2 border-t border-slate-800/60 flex items-center justify-end">
        <button type="button" onclick="selectSlotForPrediction('${slotInfo.code}')" 
          class="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 transition-colors cursor-pointer">
          <span>Gerar Palpite Prévio</span> &rarr;
        </button>
      </div>
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
  if (targetSlotEl) {
    targetSlotEl.value = slotCode;
    const selectedOpt = Array.from(targetSlotEl.options).find(o => o.value === slotCode);
    if (selectedOpt) selectedOpt.selected = true;
    const homeNextSlot = document.getElementById('home-next-slot-name');
    if (homeNextSlot && selectedOpt) homeNextSlot.textContent = selectedOpt.textContent;
    const currentSlotName = document.getElementById('current-slot-name');
    if (currentSlotName && selectedOpt) currentSlotName.textContent = selectedOpt.textContent;
  }
  if (dateStr) {
    const targetDateEl = document.getElementById('target-date');
    if (targetDateEl) targetDateEl.value = dateStr;
  }
  updateSlotPillsUI(slotCode);
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
   AUTENTICAÇÃO & SESSÃO MULTI-TENANT (GOOGLE & TESTE GRÁTIS DE 5 DIAS)
   ========================================================================== */
async function initTenantAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  let urlKey = urlParams.get('key');
  if (urlParams.has('admin')) {
    // Apenas direciona ou abre modal de login admin, nunca loga automaticamente
    urlKey = null;
  }
  if (urlKey && urlKey.trim()) {
    try {
      const tenant = await api.login(urlKey.trim());
      if (tenant) {
        document.documentElement.classList.add('is-authenticated');
        updateAuthUI();
        updateHomeScreenData();
        const displayName = (tenant.role === 'admin' || (tenant.name && tenant.name.includes('Vinicius'))) ? 'Kaique Vinicius (Master Admin)' : (tenant.name || 'Testador');
        showToast(`Olá, ${displayName}! Acesso ativado com sucesso.`, 'success');
        const cleanUrl = new URL(window.location);
        cleanUrl.searchParams.delete('key');
        cleanUrl.searchParams.delete('admin');
        window.history.replaceState({}, '', cleanUrl.toString());
      }
    } catch (err) {
      console.warn('Erro ao autenticar via chave de URL:', err);
      showToast('Chave de acesso inválida ou suspensa: ' + (err.message || ''), 'error');
    }
  } else {
    // Atualiza a interface instantaneamente com os dados salvos no navegador (sem travar a tela na tela de login)
    updateAuthUI();
    // Valida e sincroniza a sessão com o servidor em tempo real
    try {
      const session = await api.checkSession();
      if (session && session.authenticated) {
        updateAuthUI();
        updateHomeScreenData();
      }
    } catch (e) {
      console.warn('Verificação de sessão em segundo plano:', e);
    }
  }

  // Verifica se o usuário atual está com teste expirado
  const tenant = api.getCurrentTenant();
  if (tenant && tenant.role !== 'admin' && (tenant.subscription_status === 'expired' || (tenant.trial_days_remaining !== undefined && tenant.trial_days_remaining <= 0))) {
    showTrialExpiredModal();
    return;
  }

  updateAuthUI();
}

window.showTrialExpiredModal = async function() {
  const modal = document.getElementById('modal-trial-expired');
  if (modal) modal.classList.remove('hidden');

  const tenant = api.getCurrentTenant();
  const userIdentifier = (tenant && (tenant.email || tenant.name)) ? ` com o e-mail ${tenant.email || tenant.name}` : '';

  try {
    const settings = await api.getPublicSettings();
    const phone = (settings && settings.support_whatsapp) ? settings.support_whatsapp.replace(/\D/g, '') : '';
    const renewBtn = document.getElementById('btn-whatsapp-renew');
    if (renewBtn) {
      if (phone) {
        const msg = `Olá! Quero ativar meu plano no Bicho Master${userIdentifier} e quero continuar usando. Como faço para liberar meu acesso?`;
        renewBtn.href = `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
        renewBtn.target = '_blank';
        renewBtn.onclick = null;
      } else {
        renewBtn.href = '#';
        renewBtn.target = '_self';
        renewBtn.onclick = (e) => {
          e.preventDefault();
          alert('O WhatsApp de suporte ainda não foi configurado pelo administrador no painel master.');
        };
      }
    }
  } catch (e) {
    console.warn('Erro ao carregar link de WhatsApp:', e);
  }
};

function updateAuthUI() {
  const badgeContainer = document.getElementById('user-badge-desktop');
  // navAdminLink removed
  // mobAdminLink removed
  const appGate = document.getElementById('app-auth-gate');
  const mainContainer = document.getElementById('main-content-container');
  const mobBottomNav = document.getElementById('mob-bottom-nav');
  const drawerUserLabel = document.getElementById('drawer-user-label');
  // drawerAdminLink removed
  const mainHeader = document.getElementById('app-main-header');
  const btnHeaderPlans = document.getElementById('btn-header-plans');
  const tenant = api.getCurrentTenant();

  if (tenant) {
    document.documentElement.classList.add('is-authenticated');
    if (appGate) appGate.classList.add('hidden');
    if (mainHeader) mainHeader.classList.remove('hidden');
    if (mainContainer) mainContainer.classList.remove('hidden');
    if (mobBottomNav) mobBottomNav.classList.add('hidden');

    const userEmail = (tenant.email || '').toLowerCase();
    const isMasterAdmin = tenant.role === 'admin' || userEmail === 'k1qvinicius.cs@gmail.com' || userEmail === 'k1qvinicius@gmail.com';

    if (isMasterAdmin) {
      
      
      
      if (drawerUserLabel) drawerUserLabel.textContent = 'Kaique Vinicius (Master Vitalício)';
      if (btnHeaderPlans) btnHeaderPlans.classList.add('hidden');
      if (badgeContainer) {
        badgeContainer.innerHTML = `
          <div class="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] sm:text-xs px-2.5 py-1 rounded-full font-bold shadow-md shadow-amber-500/10">
            <span>👑</span>
            <span class="font-black tracking-wide">Admin</span>
            <span class="hidden sm:inline text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950">Vitalício</span>
            <button type="button" onclick="handleUserLogout()" class="ml-1 text-slate-400 hover:text-red-400 text-xs transition-colors cursor-pointer" title="Sair">✕</button>
          </div>
        `;
      }
    } else {
      // Modo Testador / Visitante
      
      
      
      if (btnHeaderPlans) {
        btnHeaderPlans.classList.remove('hidden');
        btnHeaderPlans.classList.add('hidden', 'sm:inline-flex');
      }

      const days = (tenant.trial_info && tenant.trial_info.days_remaining !== undefined)
        ? tenant.trial_info.days_remaining
        : (tenant.trial_days_remaining !== undefined ? tenant.trial_days_remaining : 5);

      if (drawerUserLabel) {
        drawerUserLabel.textContent = tenant.name || 'Testador Convidado';
      }

      if (badgeContainer) {
        badgeContainer.innerHTML = `
          <div class="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 text-slate-300 text-[11px] sm:text-xs px-2.5 py-1 rounded-full shadow-sm">
            <span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse"></span>
            <span class="font-bold text-amber-300 cursor-pointer hover:underline" onclick="openPlansModal()" title="Toque para ver Planos VIP">${days}d teste</span>
            <button type="button" onclick="handleUserLogout()" class="ml-1 px-1.5 py-0.5 rounded bg-slate-700/60 hover:bg-red-500/20 text-slate-400 hover:text-red-300 text-[10px] sm:text-[11px] font-bold transition-colors cursor-pointer" title="Sair desta conta">Sair 🚪</button>
          </div>
        `;
      }
    }
  } else {
    // Não autenticado: exibe tela de login/cadastro limpa
    document.documentElement.classList.remove('is-authenticated');
    if (mainHeader) mainHeader.classList.add('hidden');
    if (appGate) appGate.classList.remove('hidden');
    if (mainContainer) mainContainer.classList.add('hidden');
    if (mobBottomNav) mobBottomNav.classList.add('hidden');
    
    
    
    if (drawerUserLabel) drawerUserLabel.textContent = 'Não Conectado';
    if (badgeContainer) badgeContainer.innerHTML = '';
  }

  updateHomeScreenData();
}

window.switchGateTab = function(tab) {
  const tabTester = document.getElementById('gate-tab-tester');
  const tabAdmin = document.getElementById('gate-tab-admin');
  const formTester = document.getElementById('gate-form-tester');
  const formAdmin = document.getElementById('gate-form-admin');

  if (tab === 'admin') {
    if (tabAdmin) tabAdmin.className = 'py-2 rounded-lg bg-indigo-600 text-white shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer';
    if (tabTester) tabTester.className = 'py-2 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer';
    if (formAdmin) formAdmin.classList.remove('hidden');
    if (formTester) formTester.classList.add('hidden');
    const passInput = document.getElementById('gate-input-admin-pass');
    if (passInput) setTimeout(() => passInput.focus(), 50);
  } else {
    if (tabTester) tabTester.className = 'py-2 rounded-lg bg-indigo-600 text-white shadow transition-all flex items-center justify-center gap-1.5 cursor-pointer';
    if (tabAdmin) tabAdmin.className = 'py-2 rounded-lg text-slate-400 hover:text-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer';
    if (formTester) formTester.classList.remove('hidden');
    if (formAdmin) formAdmin.classList.add('hidden');
    const keyInput = document.getElementById('gate-input-key');
    if (keyInput) setTimeout(() => keyInput.focus(), 50);
  }
};

window.handleMainLogin = async function(event) {
  event.preventDefault();
  const userInput = document.getElementById('login-input-user') || document.getElementById('login-input-identity');
  const passInput = document.getElementById('login-input-password');
  const errEl = document.getElementById('login-error-msg');
  const btn = document.getElementById('btn-submit-main-login');

  const user = (userInput?.value || '').trim();
  const password = (passInput?.value || '').trim();

  if (!user || !password) {
    if (errEl) {
      errEl.textContent = 'Por favor, digite seu WhatsApp/usuário e senha.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (errEl) errEl.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Verificando...</span>';
  }

  try {
    const res = await api.login({
      username: user,
      phone: user,
      password: password,
      key: password
    });

    if (typeof showToast === 'function') {
      const isMaster = res && (res.role === 'admin' || (res.name && res.name.includes('Vinicius')));
      const msg = isMaster ? '👑 Bem-vindo, Administrador Master!' : 'Bem-vindo de volta ao Bicho Master Pro!';
      showToast(msg, 'success');
    }
    updateAuthUI();
    updateHomeScreenData();
    window.location.reload();
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'WhatsApp ou senha incorretos.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔓</span> <span>Entrar no Bicho Master Pro</span>';
    }
  }
};

window.openRegisterModal = function(prefillEmail = '') {
  const modal = document.getElementById('modal-google-signup');
  const nameInput = document.getElementById('input-register-name');
  const emailInput = document.getElementById('input-register-email');
  const phoneInput = document.getElementById('input-register-phone');
  const passInput = document.getElementById('input-register-password');
  const errEl = document.getElementById('register-error-msg');

  if (errEl) errEl.classList.add('hidden');

  // Preenche e-mail se passado ou se foi digitado no formulário principal de login
  if (!prefillEmail) {
    const mainIdentity = (document.getElementById('login-input-identity')?.value || '').trim();
    if (mainIdentity.includes('@')) {
      prefillEmail = mainIdentity;
    }
  }

  if (emailInput && prefillEmail) {
    emailInput.value = prefillEmail;
  }

  // Configura máscara amigável para telefone brasileiro: (XX) XXXXX-XXXX
  if (phoneInput && !phoneInput._maskConfigured) {
    phoneInput._maskConfigured = true;
    phoneInput.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '');
      if (v.length > 11) v = v.substring(0, 11);
      if (v.length > 6) {
        e.target.value = `(${v.substring(0, 2)}) ${v.substring(2, 7)}-${v.substring(7)}`;
      } else if (v.length > 2) {
        e.target.value = `(${v.substring(0, 2)}) ${v.substring(2)}`;
      } else if (v.length > 0) {
        e.target.value = `(${v}`;
      }
    });
  }

  if (modal) {
    modal.classList.remove('hidden');
    setTimeout(() => {
      if (nameInput && !nameInput.value) {
        nameInput.focus();
      } else if (emailInput && !emailInput.value) {
        emailInput.focus();
      } else if (phoneInput && !phoneInput.value) {
        phoneInput.focus();
      } else if (passInput) {
        passInput.focus();
      }
    }, 100);
  }
};

window.openGoogleSignupModal = window.openRegisterModal;

window.closeRegisterModal = function() {
  const modal = document.getElementById('modal-google-signup');
  if (modal) modal.classList.add('hidden');
};

window.closeGoogleSignupModal = window.closeRegisterModal;

window.handleProfileRegister = async function(event) {
  event.preventDefault();
  const nameInput = document.getElementById('input-register-name');
  const emailInput = document.getElementById('input-register-email');
  const phoneInput = document.getElementById('input-register-phone');
  const passInput = document.getElementById('input-register-password');
  const errEl = document.getElementById('register-error-msg');
  const btn = document.getElementById('btn-submit-register');

  const name = (nameInput?.value || '').trim();
  const email = (emailInput?.value || '').trim().toLowerCase();
  const phone = (phoneInput?.value || '').trim();
  const password = (passInput?.value || '').trim();

  if (!name) {
    if (errEl) {
      errEl.textContent = 'Por favor, informe seu nome completo.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (!email || !email.includes('@')) {
    if (errEl) {
      errEl.textContent = 'Por favor, informe um e-mail válido (ex: seu@email.com).';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (email === 'k1qvinicius@gmail.com' || email === 'admin') {
    if (errEl) {
      errEl.textContent = 'Esta é a conta Master. Faça login pelo formulário principal com sua senha master.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (!password || password.length < 6) {
    if (errEl) {
      errEl.textContent = 'A senha de acesso deve conter pelo menos 6 caracteres.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (errEl) errEl.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Criando seu perfil...</span>';
  }

  try {
    const tenant = await api.register({
      name: name,
      email: email,
      phone: phone,
      password: password
    });

    showToast(`🎉 Perfil criado com sucesso! Bem-vindo(a), ${tenant.name || 'Usuário'}!`, 'success');
    closeRegisterModal();
    updateAuthUI();
    await loadDashboardData();
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Erro ao realizar cadastro. Tente novamente.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🚀</span> <span>Criar Meu Perfil e Entrar</span>';
    }
  }
};

window.handleGoogleInstantSignup = window.handleProfileRegister;

window.handleGateTesterLogin = async function(event) {
  event.preventDefault();
  const input = document.getElementById('gate-input-key');
  const errDiv = document.getElementById('gate-tester-error');
  const btn = document.getElementById('gate-btn-tester-submit');
  const val = input ? input.value.trim() : '';

  if (!val) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Verificando...';
  }
  if (errDiv) {
    errDiv.textContent = '';
    errDiv.classList.add('hidden');
  }

  try {
    let tenant;
    if (val.includes('@')) {
      // Login com e-mail direto / Google com 7 dias grátis
      tenant = await api.loginGoogle({ email: val.toLowerCase(), name: val.split('@')[0] });
      showToast(`Bem-vindo, ${tenant.name}! Acesso liberado com sucesso.`, 'success');
    } else {
      // Login com chave de testador
      tenant = await api.login(val);
      showToast(`Bem-vindo, ${tenant.name || 'Testador'}! Acesso liberado.`, 'success');
    }
    updateAuthUI();
    await Promise.all([loadPrediction(), loadDrawResults()]);
  } catch (err) {
    if (errDiv) {
      errDiv.textContent = err.message || 'Chave ou e-mail inválido.';
      errDiv.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Iniciar Teste Grátis / Acessar';
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
    await Promise.all([loadPrediction(), loadDrawResults()]);
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
    let tenant;
    if (key.includes('@')) {
      tenant = await api.loginGoogle({ email: key.toLowerCase(), name: key.split('@')[0] });
    } else {
      tenant = await api.login(key);
    }
    closeAuthModal();
    updateAuthUI();
    showToast(`Bem-vindo, ${tenant.name || 'Usuário'}!`, 'success');
    await Promise.all([loadPrediction(), loadDrawResults()]);
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
  const expiredModal = document.getElementById('modal-trial-expired');
  if (expiredModal) expiredModal.classList.add('hidden');
  const plansModal = document.getElementById('modal-plans');
  if (plansModal) plansModal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
  api.logout();
  document.documentElement.classList.remove('is-authenticated');
  updateAuthUI();
  showToast('Desconectado com sucesso.', 'info');
  setTimeout(() => {
    window.location.href = '/';
  }, 350);
};

// =========================================================================
// CONTROLES DO MENU GAVETA LATERAL (SIDEBAR DRAWER)
// =========================================================================
window.openDrawer = function () {
  const drawer = document.getElementById('drawer-menu');
  const overlay = document.getElementById('drawer-overlay');
  const mobBtnMenu = document.getElementById('mob-btn-menu');
  if (mobBtnMenu) mobBtnMenu.classList.add('mob-nav-active');
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
  const mobBtnMenu = document.getElementById('mob-btn-menu');
  if (mobBtnMenu) mobBtnMenu.classList.remove('mob-nav-active');
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



window.switchPuxadasLottery = async function (lotteryCode) {
  if (!lotteryCode) return;
  currentLottery = lotteryCode;
  localStorage.setItem('bicho_active_lottery', lotteryCode);
  updateLotteryButtonsUI();
  _puxadasDataCache = null;
  await loadPuxadasModalContent(null);
  initSlotSelector(currentLottery);
  loadPrediction();
  loadDrawResults();
  updateHomeScreenData();
};


/* ==========================================================================
   TELA 7: MILHARES ATRASADAS & FREQUENTES (RADAR ESTATÍSTICO)
   ========================================================================== */
let _milharesDataCache = null;
let currentMilharesTab = 'rj_atrasadas';

window.loadMilharesAtrasadas = async function(forceRefresh = false) {
  const refreshBtn = document.getElementById('btn-refresh-milhares');
  const refreshIcon = document.getElementById('milhares-refresh-icon');
  const lastUpdatedEl = document.getElementById('milhares-last-updated');

  if (forceRefresh) {
    _milharesDataCache = null;
  }

  if (refreshBtn) refreshBtn.disabled = true;
  if (refreshIcon) refreshIcon.classList.add('animate-spin');

  try {
    if (!_milharesDataCache) {
      const res = await api.getMilharesRankings();
      _milharesDataCache = res.data || {};
    }

    if (lastUpdatedEl && _milharesDataCache.updated_at) {
      try {
        const dt = new Date(_milharesDataCache.updated_at);
        lastUpdatedEl.textContent = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        lastUpdatedEl.textContent = 'Hoje';
      }
    } else if (lastUpdatedEl) {
      lastUpdatedEl.textContent = 'Hoje';
    }

    renderMilharesTable(currentMilharesTab);
  } catch (err) {
    console.error('Erro ao carregar rankings de milhares:', err);
    const tbody = document.getElementById('milhares-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-rose-400">
            <div class="flex flex-col items-center justify-center gap-2">
              <span class="text-xl">⚠️</span>
              <p class="font-bold">Não foi possível sincronizar o ranking de milhares no momento.</p>
              <button onclick="loadMilharesAtrasadas(true)" class="px-3 py-1.5 rounded-lg bg-slate-800 text-amber-300 border border-slate-700 text-xs font-bold hover:bg-slate-700 transition-all cursor-pointer">
                Tentar novamente
              </button>
            </div>
          </td>
        </tr>
      `;
    }
    showToast('Falha ao carregar ranking de milhares.', 'error');
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
    if (refreshIcon) refreshIcon.classList.remove('animate-spin');
  }
};

window.switchMilharesTab = function(tabKey) {
  const validTabs = ['rj_atrasadas', 'rj_frequentes', 'federal_atrasadas', 'federal_frequentes'];
  if (!validTabs.includes(tabKey)) tabKey = 'rj_atrasadas';
  currentMilharesTab = tabKey;

  validTabs.forEach(t => {
    const btn = document.getElementById(`tab-milhares-${t}`);
    if (btn) {
      if (t === tabKey) {
        btn.className = 'milhares-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-amber-500 text-slate-950 shadow-sm cursor-pointer';
      } else {
        btn.className = 'milhares-tab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer';
      }
    }
  });

  const descEl = document.getElementById('milhares-tab-desc');
  if (descEl) {
    const descriptions = {
      rj_atrasadas: 'As milhares com maior quantidade de dias corridos sem aparição do 1º ao 5º prêmio na apuração do Rio de Janeiro.',
      rj_frequentes: 'As milhares que mais vezes foram sorteadas do 1º ao 5º prêmio na apuração do Rio de Janeiro.',
      federal_atrasadas: 'As milhares mais atrasadas na Loteria Federal (maior seca de extrações sem sair).',
      federal_frequentes: 'As milhares com maior histórico de saídas registradas na Loteria Federal.',
    };
    descEl.textContent = descriptions[tabKey] || '';
  }

  renderMilharesTable(tabKey);
};

function renderMilharesTable(tabKey) {
  const tbody = document.getElementById('milhares-table-body');
  const countBadge = document.getElementById('milhares-count-badge');
  if (!tbody) return;

  if (!_milharesDataCache) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-500">
          <div class="flex items-center justify-center gap-2">
            <span class="animate-spin text-amber-400">⏳</span> Carregando estatísticas das milhares...
          </div>
        </td>
      </tr>
    `;
    return;
  }

  const items = _milharesDataCache[tabKey] || [];
  if (countBadge) countBadge.textContent = items.length;

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-400">
          Nenhuma milhar registrada nesta categoria no momento.
        </td>
      </tr>
    `;
    return;
  }

  const isAtrasadas = tabKey.includes('atrasadas');

  tbody.innerHTML = items.map((item, idx) => {
    const rankNum = idx + 1;
    let rankBadge = `<span class="font-bold text-slate-400">${rankNum}º</span>`;
    if (rankNum === 1) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 font-black text-xs">🥇</span>`;
    else if (rankNum === 2) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-200 border border-slate-400/50 font-black text-xs">🥈</span>`;
    else if (rankNum === 3) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-500 border border-amber-700/50 font-black text-xs">🥉</span>`;

    const atrasoHtml = isAtrasadas
      ? `<span class="text-amber-400 font-black font-mono text-sm">${item.dias_atraso !== null && item.dias_atraso !== undefined ? item.dias_atraso + ' dias' : '--'}</span>`
      : `<span class="text-emerald-400 font-bold font-mono text-sm">${item.dias_atraso ? item.dias_atraso + ' dias atrás' : (item.vezes_sorteada || 'Alta')}</span>`;

    return `
      <tr class="hover:bg-slate-900/60 transition-colors">
        <td class="py-2.5 px-3 text-center">${rankBadge}</td>
        <td class="py-2.5 px-3">
          <span class="font-mono font-black text-amber-300 text-sm tracking-wider">${item.milhar}</span>
        </td>
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-2">
            <span class="text-lg">${item.icone || '🐾'}</span>
            <div>
              <div class="font-black text-white text-xs">${item.bicho || 'Bicho'}</div>
              <div class="text-[10px] text-slate-400">Grupo ${String(item.grupo).padStart(2, '0')} • Dz ${item.dezena || item.milhar.slice(-2)}</div>
            </div>
          </div>
        </td>
        <td class="py-2.5 px-3 text-slate-300 font-medium">${item.ultima_data || '--'}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px]">
            ${item.extracao || ''} ${item.premio ? '• ' + item.premio : ''}
          </span>
        </td>
        <td class="py-2.5 px-3 text-right">${atrasoHtml}</td>
        <td class="py-2.5 px-3 text-center">
          <button type="button" onclick="quickTrackMilhar('${item.milhar}')"
            class="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[10px] font-bold transition-all active:scale-95 cursor-pointer">
            🔍 Rastrear
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.handleMilharTrackSubmit = function() {
  const input = document.getElementById('input-milhar-search');
  const val = input ? input.value.trim() : '';
  if (!val) {
    showToast('Digite uma milhar de 0000 a 9999.', 'warning');
    return;
  }
  executeMilharTracking(val);
};

window.quickTrackMilhar = function(milhar) {
  const input = document.getElementById('input-milhar-search');
  if (input) input.value = milhar;
  executeMilharTracking(milhar);
};

async function executeMilharTracking(rawMilhar) {
  const clean = rawMilhar.replace(/\D/g, '');
  if (!clean) {
    showToast('Informe apenas números.', 'warning');
    return;
  }
  const formattedMilhar = clean.slice(-4).padStart(4, '0');

  const btn = document.getElementById('btn-track-milhar');
  const card = document.getElementById('milhar-tracker-card');
  const origBtnHtml = btn ? btn.innerHTML : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Buscando...';
  }

  try {
    const res = await api.rastrearMilhar(formattedMilhar);
    const data = res.data;

    if (card) {
      card.classList.remove('hidden');
    }

    const bichoIcon = document.getElementById('tracker-bicho-icon');
    const milharDisplay = document.getElementById('tracker-milhar-display');
    const bichoDisplay = document.getElementById('tracker-bicho-display');
    const grupoDisplay = document.getElementById('tracker-grupo-display');
    const dezenaEl = document.getElementById('tracker-dezena');
    const centenaEl = document.getElementById('tracker-centena');

    const vezesEl = document.getElementById('tracker-vezes');
    const vezesSubEl = document.getElementById('tracker-vezes-sub');
    const secaGeralEl = document.getElementById('tracker-seca-geral');
    const secaGeralSubEl = document.getElementById('tracker-seca-geral-sub');
    const secaCabecaEl = document.getElementById('tracker-seca-cabeca');
    const secaCabecaSubEl = document.getElementById('tracker-seca-cabeca-sub');
    const favoritoEl = document.getElementById('tracker-favorito');
    const favoritoSubEl = document.getElementById('tracker-favorito-sub');

    const alertaBox = document.getElementById('tracker-alerta-box');
    const alertaText = document.getElementById('tracker-alerta-text');

    if (bichoIcon) bichoIcon.textContent = data.icone || '🐾';
    if (milharDisplay) milharDisplay.textContent = data.milhar;
    if (bichoDisplay) bichoDisplay.textContent = data.bicho || '';
    if (grupoDisplay) grupoDisplay.textContent = `Grupo ${String(data.grupo).padStart(2, '0')}`;
    if (dezenaEl) dezenaEl.textContent = data.dezena || data.milhar.slice(-2);
    if (centenaEl) centenaEl.textContent = data.centena || data.milhar.slice(-3);

    if (vezesEl) vezesEl.textContent = data.vezes_sorteada || '--';
    if (vezesSubEl) vezesSubEl.textContent = data.vezes_sorteada_detalhes || 'Total histórico';
    if (secaGeralEl) secaGeralEl.textContent = data.ultima_vez || '--';
    if (secaGeralSubEl) secaGeralSubEl.textContent = data.ultima_vez_detalhes || 'Última saída';
    if (secaCabecaEl) secaCabecaEl.textContent = data.seca_primeiro_premio || '--';
    if (secaCabecaSubEl) secaCabecaSubEl.textContent = data.seca_primeiro_premio_detalhes || 'Seca no 1º prêmio';
    if (favoritoEl) favoritoEl.textContent = data.onde_mais_sai || 'Equilibrado';
    if (favoritoSubEl) favoritoSubEl.textContent = 'Horário mais frequente';

    if (alertaBox && alertaText) {
      if (data.alerta_seca) {
        alertaText.textContent = data.alerta_seca;
        alertaBox.classList.remove('hidden');
      } else {
        alertaBox.classList.add('hidden');
      }
    }

    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  } catch (err) {
    console.error('Erro ao rastrear milhar:', err);
    showToast(err.message || 'Falha ao buscar estatísticas da milhar.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnHtml;
    }
  }
}

window.copyTrackedMilhar = function(btn) {
  const display = document.getElementById('tracker-milhar-display');
  const milhar = display ? display.textContent.trim() : '';
  if (!milhar) return;

  navigator.clipboard.writeText(milhar).then(() => {
    if (btn) {
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<span>✅</span> <span>Copiado!</span>';
      setTimeout(() => {
        btn.innerHTML = origHtml;
      }, 1500);
    }
    showToast(`Milhar ${milhar} copiada!`, 'success');
  }).catch(() => {
    showToast(`Milhar: ${milhar}`);
  });
};

/* ==========================================================================
   RADAR DE TRANSIÇÃO HISTÓRICA
   ========================================================================== */
function renderTransitionMatrixSection(transitionData) {
  const container = document.getElementById('transition-matrix-card');
  if (!container) return;

  if (!transitionData || !transitionData.has_data || !transitionData.top_transitions || transitionData.top_transitions.length === 0) {
    container.className = 'hidden';
    return;
  }

  const fromAnimal = transitionData.from_animal || 'Animal';
  const fromEmoji = transitionData.from_emoji || '🎲';
  const fromGroup = transitionData.from_group ? String(transitionData.from_group).padStart(2, '0') : '--';
  const fromSlot = transitionData.from_slot || 'horário anterior';
  const targetSlot = transitionData.target_slot || 'próximo horário';
  const sampleSize = transitionData.sample_size || 0;
  const topList = transitionData.top_transitions || [];

  container.className = 'card-glass p-3 sm:p-4 rounded-xl border border-cyan-500/40 bg-gradient-to-br from-cyan-950/30 via-slate-900/90 to-slate-950/90 space-y-3 shadow-lg';

  const itemsHtml = topList.map((item, idx) => {
    const pct = Number(item.probability_pct || 0);
    const tensFormatted = (item.hot_tens || []).join(' • ');
    const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `<span class="text-slate-500 text-xs font-mono">#${idx + 1}</span>`));
    const isTop = idx === 0;

    return `
      <div class="p-2.5 rounded-lg ${isTop ? 'bg-cyan-500/10 border border-cyan-500/30 ring-1 ring-cyan-500/20' : 'bg-slate-900/60 border border-slate-800/80'} flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-base">${medal}</span>
          <span class="text-xl">${item.emoji || '🐾'}</span>
          <div>
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-black text-white uppercase tracking-wider">${item.animal}</span>
              <span class="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">Gr. ${String(item.group).padStart(2, '0')}</span>
              ${isTop ? '<span class="text-[9px] font-black px-1.5 py-0.2 rounded bg-cyan-500 text-slate-950 uppercase tracking-wide">Mais Frequente</span>' : ''}
            </div>
            <div class="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
              <span class="text-slate-500">Dezenas Quentes:</span>
              <span class="font-mono font-bold text-cyan-300">${tensFormatted}</span>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <div class="w-20 sm:w-28 bg-slate-800 rounded-full h-2 overflow-hidden border border-slate-700/60">
            <div class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-2 rounded-full" style="width: ${Math.min(pct * 6, 100)}%"></div>
          </div>
          <span class="font-mono font-black text-xs text-cyan-300 w-12 text-right">${pct}%</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex items-center justify-between gap-2 border-b border-cyan-500/20 pb-2">
      <div class="flex items-center gap-2 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
          <span class="text-sm">🎯</span>
        </div>
        <div class="min-w-0">
          <h3 class="text-xs font-black text-cyan-300 uppercase tracking-wider flex items-center gap-1.5 flex-wrap">
            <span>Padrão Histórico de Transição</span>
          </h3>
          <p class="text-[11px] text-slate-400 truncate">
            Dado o 1º prêmio anterior: <strong class="text-slate-200">${fromEmoji} ${fromAnimal} (Gr. ${fromGroup})</strong> no <span class="text-cyan-300 font-semibold">${fromSlot}</span>
          </p>
        </div>
      </div>
      <span class="text-[10px] text-slate-400 shrink-0 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800 font-mono" title="Amostras de sorteios analisadas">
        ${sampleSize}x histórico
      </span>
    </div>

    <div class="space-y-1.5">
      ${itemsHtml}
    </div>

    <div class="flex items-center justify-between text-[10px] text-slate-500 pt-1">
      <span>Probabilidade condicional empírica apurada sobre mais de 45.000 sorteios</span>
      <span class="text-cyan-400/80 font-medium">Projeção para ${targetSlot}</span>
    </div>
  `;
}


// ===================================================================
// CENTENA MASTER (ALGORITMO CHAVE 24)
// ===================================================================
window._currentCentenaMasterData = null;

window.loadCentenaMasterContent = async function(forceDate = null) {
  const cmDateInput = document.getElementById('centena-master-target-date');
  const mainDateInput = document.getElementById('target-date');

  let dateVal = forceDate;
  if (!dateVal && cmDateInput && cmDateInput.value) {
    dateVal = cmDateInput.value;
  }
  if (!dateVal && mainDateInput && mainDateInput.value) {
    dateVal = mainDateInput.value;
  }
  if (!dateVal) {
    dateVal = new Date().toISOString().split('T')[0];
  }

  if (cmDateInput && cmDateInput.value !== dateVal) {
    cmDateInput.value = dateVal;
  }

  const stepsGrid = document.getElementById('centena-master-steps-grid');
  const cardsGrid = document.getElementById('centena-master-cards-grid');
  const groupsContainer = document.getElementById('centena-master-groups-container');
  const tensContainer = document.getElementById('centena-master-tens-container');
  const badgeEl = document.getElementById('centena-master-summary-badge');
  const hitsCountEl = document.getElementById('centena-master-hits-count');

  if (cardsGrid) {
    cardsGrid.innerHTML = `
      <div class="col-span-full py-12 flex flex-col items-center justify-center text-center space-y-3">
        <div class="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <p class="text-xs text-slate-400 font-medium">Calculando Centena & Milhar Master pela Soma da Data...</p>
      </div>`;
  }

  try {
    const lot = currentLottery || 'RJ';
    const data = await api.getCentenaMaster(dateVal, lot);
    window._currentCentenaMasterData = data;

    if (badgeEl) {
      badgeEl.textContent = `Dia ${data.day} • Soma ${data.sum || ''}`;
    }

    if (hitsCountEl) {
      if (data.total_hits_today > 0) {
        hitsCountEl.innerHTML = `<span class="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold text-xs animate-pulse">🎯 ${data.total_hits_today} acerto(s) apurado(s) hoje!</span>`;
      } else {
        hitsCountEl.textContent = `Conferido em tempo real com ${data.lottery}`;
      }
    }

    // 1. Renderiza os 4 passos da escada
    if (stepsGrid && data.steps) {
      stepsGrid.innerHTML = data.steps.map(s => `
        <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-1">
          <div class="flex items-center justify-between">
            <span class="text-[10px] font-black uppercase tracking-wider text-amber-400">Passo ${s.step}</span>
            <span class="text-[9px] text-slate-400">${s.label}</span>
          </div>
          <div class="text-[11px] text-slate-300 font-mono space-y-0.5">
            <div>${s.left_calc}</div>
            <div>${s.right_calc}</div>
          </div>
          <div class="pt-1 border-t border-slate-800/80 flex items-center justify-between">
            <span class="text-[9px] text-slate-500 uppercase font-bold">Linha ${s.step}:</span>
            <span class="text-xs font-black font-mono text-amber-300 px-1.5 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">${s.result}</span>
          </div>
        </div>
      `).join('');
    }

    // 2. Renderiza os cards das 4 Milhares & Centenas
    if (cardsGrid && data.centenas) {
      cardsGrid.innerHTML = data.centenas.map(c => {
        const hitBadge = c.is_hit ? `
          <div class="mb-2 p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black flex items-center gap-1.5 animate-pulse">
            <span>🎯</span>
            <span>BINGO no ${c.hits[0].prize}º Prêmio (${c.hits[0].slot}: ${c.hits[0].milhar}${c.hits[0].type ? ` - ${c.hits[0].type}` : ''})</span>
          </div>` : '';

        const cardBorder = c.is_hit 
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 bg-slate-900/90' 
          : 'border-slate-800 hover:border-amber-500/50 bg-slate-900/70';

        const invertedPills = (c.inverted || []).slice(0, 5).map(inv => 
          `<span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-mono">${inv}</span>`
        ).join(' ');

        return `
          <div class="card-glass p-3.5 rounded-xl border ${cardBorder} transition-all duration-300 flex flex-col justify-between space-y-3 relative overflow-hidden group">
            <div class="absolute -right-4 -bottom-4 w-16 h-16 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-all"></div>
            <div>
              ${hitBadge}
              <div class="flex items-start justify-between">
                <div>
                  <span class="text-[10px] font-black uppercase tracking-wider text-slate-400">Milhar & Centena ${c.index}</span>
                  <div class="text-3xl font-black font-mono text-amber-300 tracking-wider group-hover:scale-105 transition-transform origin-left">
                    ${c.milhar}
                  </div>
                  <div class="text-xs font-bold text-amber-400/90 mt-0.5">
                    Centena: <span class="font-mono text-white">${c.centena}</span> <span class="text-slate-500">•</span> Frontal: <span class="font-mono text-slate-300">${c.centena_frontal || ''}</span>
                  </div>
                </div>
                <div class="text-right">
                  <div class="text-2xl">${c.emoji || '❓'}</div>
                  <div class="text-[11px] font-bold text-slate-200">${c.animal}</div>
                  <div class="text-[10px] font-bold text-amber-400">Grupo ${String(c.group).padStart(2, '0')}</div>
                </div>
              </div>

              <div class="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span class="text-slate-400">Dezena do Jogo:</span>
                <span class="font-mono font-bold text-slate-200 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">${c.ten}</span>
              </div>

              <div class="mt-2 flex flex-col space-y-1">
                <span class="text-[10px] text-slate-500 font-bold uppercase">Centenas Invertidas:</span>
                <div class="flex flex-wrap gap-1">
                  ${invertedPills}
                </div>
              </div>
            </div>

            <div class="pt-2 border-t border-slate-800/80">
              <button type="button" onclick="copyCentena('${c.milhar}', this)"
                class="w-full py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer">
                <span>📋</span> <span>Copiar Milhar ${c.milhar} (Ct ${c.centena})</span>
              </button>
            </div>
          </div>
        `;
      }).join('');
    }

    // 3. Renderiza Terno de Grupo e Passes
    if (groupsContainer && data.games) {
      const ternoHtml = (data.games.terno_grupo || []).map(g => `
        <span class="px-2 py-1 rounded-lg bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-xs font-bold flex items-center gap-1">
          <span>${g.emoji}</span>
          <span>${g.animal} (${String(g.group).padStart(2, '0')})</span>
        </span>
      `).join(' ');

      const duquesHtml = (data.games.duques_grupo || []).map(d => `
        <div class="px-2.5 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-between text-xs">
          <span class="text-slate-300 font-medium">${d.animals}</span>
          <span>${d.emojis}</span>
        </div>
      `).join('');

      groupsContainer.innerHTML = `
        <div class="space-y-1.5">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Terno de Grupo Fechado:</span>
          <div class="flex flex-wrap gap-1.5">
            ${ternoHtml || '<span class="text-xs text-slate-500">Nenhum grupo disponível</span>'}
          </div>
        </div>
        <div class="space-y-1 pt-1.5">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Passes / Duques de Grupo:</span>
          <div class="space-y-1">
            ${duquesHtml || '<span class="text-xs text-slate-500">Nenhum duque disponível</span>'}
          </div>
        </div>
      `;
    }

    // 4. Renderiza Terno e Duques de Dezenas
    if (tensContainer && data.games) {
      const duquesDezHtml = (data.games.duques_dezenas || []).map(d => `
        <span class="px-2 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 font-mono font-bold text-emerald-300 text-xs">${d}</span>
      `).join(' ');

      tensContainer.innerHTML = `
        <div class="space-y-1.5">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Terno de Dezenas:</span>
          <div class="p-2 rounded-lg bg-emerald-950/60 border border-emerald-800/60 font-mono font-black text-emerald-300 text-sm">
            ${data.games.terno_dezenas || 'Nenhum terno disponível'}
          </div>
        </div>
        <div class="space-y-1.5 pt-1.5">
          <span class="text-[11px] font-bold text-slate-400 uppercase">Duques de Dezenas Combinados:</span>
          <div class="flex flex-wrap gap-1.5">
            ${duquesDezHtml || '<span class="text-xs text-slate-500">Nenhum duque disponível</span>'}
          </div>
        </div>
      `;
    }

  } catch (err) {
    console.error('Erro ao carregar Centena Master:', err);
    if (cardsGrid) {
      cardsGrid.innerHTML = `
        <div class="col-span-full p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-center text-red-300 text-xs">
          Erro ao carregar dados do Centena Master. Tente novamente em instantes.
        </div>`;
    }
  }
};

window.changeCentenaMasterDate = function(val) {
  if (typeof loadCentenaMasterContent === 'function') {
    loadCentenaMasterContent(val);
  }
};

window.setCentenaMasterDateYesterday = function() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split('T')[0];
  const input = document.getElementById('centena-master-target-date');
  if (input) input.value = yesterday;
  if (typeof loadCentenaMasterContent === 'function') {
    loadCentenaMasterContent(yesterday);
  }
};

window.setCentenaMasterDateToday = function() {
  const today = new Date().toISOString().split('T')[0];
  const input = document.getElementById('centena-master-target-date');
  if (input) input.value = today;
  if (typeof loadCentenaMasterContent === 'function') {
    loadCentenaMasterContent(today);
  }
};

window.setCentenaMasterDateTomorrow = function() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toISOString().split('T')[0];
  const input = document.getElementById('centena-master-target-date');
  if (input) input.value = tomorrow;
  if (typeof loadCentenaMasterContent === 'function') {
    loadCentenaMasterContent(tomorrow);
  }
};

window.copyCentena = function(val, btn) {
  navigator.clipboard.writeText(val).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<span>✅</span> <span>Copiada!</span>';
    btn.classList.add('bg-emerald-600', 'text-white');
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.classList.remove('bg-emerald-600', 'text-white');
    }, 1800);
  }).catch(() => {
    alert(`Centena: ${val}`);
  });
};

window.copyAllCentenaMaster = function(btn) {
  if (!window._currentCentenaMasterData) return;
  const d = window._currentCentenaMasterData;

  const milharesList = (d.centenas || []).map(c => 
    `• Milhar ${c.milhar} (Centena ${c.centena} - ${c.animal} Gr.${String(c.group).padStart(2, '0')})`
  ).join('\n');

  const ternos = (d.games?.terno_grupo || []).map(g => 
    `${String(g.group).padStart(2, '0')} (${g.animal})`
  ).join(' - ');

  const duques = (d.games?.duques_grupo || []).map(p => 
    `• ${p.animals}`
  ).join('\n');

  const text = `🎯 *CENTENA & MILHAR MASTER* 🎯\n📅 Data: ${d.target_date} | Loteria: ${d.lottery}\n🔢 Cálculo da Data: Dia ${d.day} (Soma ${d.sum || ''})\n\n🪙 *4 MILHARES & CENTENAS DE OURO:*\n${milharesList}\n\n👑 *TERNO DE GRUPO:*\n${ternos}\n\n🤝 *DUQUES DE GRUPO (PASSE):*\n${duques}\n\n🔢 *DEZENAS FORTES:*\nTerno: ${d.games?.terno_dezenas || ''}\nDuques: ${(d.games?.duques_dezenas || []).join(' | ')}`;

  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<span>✅</span> <span>Palpites Copiados!</span>';
      btn.classList.add('bg-emerald-600', 'text-white');
      setTimeout(() => {
        btn.innerHTML = orig;
        btn.classList.remove('bg-emerald-600', 'text-white');
      }, 2000);
    }
  }).catch(() => {
    alert('Erro ao copiar palpites.');
  });
};


// ===================================================================
// AUTENTICAÇÃO PROFISSIONAL: ABAS, SENHA E CADASTRO 5 DIAS
// ===================================================================

window.switchAuthGateTab = function(tab) {
  const tabLogin = document.getElementById('tab-auth-login');
  const tabReg = document.getElementById('tab-auth-register');
  const panelLogin = document.getElementById('panel-auth-login');
  const panelReg = document.getElementById('panel-auth-register');

  const activeClass = 'py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 cursor-pointer select-none';
  const inactiveClass = 'py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 text-slate-400 hover:text-white cursor-pointer select-none';

  if (tab === 'login') {
    if (tabLogin) tabLogin.className = activeClass;
    if (tabReg) tabReg.className = inactiveClass;
    if (panelLogin) panelLogin.classList.remove('hidden');
    if (panelReg) panelReg.classList.add('hidden');
  } else {
    if (tabReg) tabReg.className = activeClass;
    if (tabLogin) tabLogin.className = inactiveClass;
    if (panelReg) panelReg.classList.remove('hidden');
    if (panelLogin) panelLogin.classList.add('hidden');
  }
};

window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
};

window.handleMainRegister = async function(event) {
  event.preventDefault();
  const nameInput = document.getElementById('reg-input-name');
  const emailInput = document.getElementById('reg-input-email');
  const phoneInput = document.getElementById('reg-input-phone');
  const passInput = document.getElementById('reg-input-password');
  const errEl = document.getElementById('register-error-msg');
  const btn = document.getElementById('btn-submit-main-register');

  const name = (nameInput?.value || '').trim();
  const email = (emailInput?.value || '').trim().toLowerCase();
  const phone = (phoneInput?.value || '').trim();
  const password = (passInput?.value || '').trim();

  if (email && !email.includes('@')) {
    if (errEl) {
      errEl.textContent = 'Por favor, digite um e-mail válido (ex: seu@email.com).';
      errEl.classList.remove('hidden');
    }
    return;
  }

  const phoneDigits = phone.replace(/\D/g, '');
  if (!phoneDigits || phoneDigits.length < 10) {
    if (errEl) {
      errEl.textContent = 'Por favor, digite seu WhatsApp completo com DDD (ex: 11 99999-9999).';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (!password || password.length < 4) {
    if (errEl) {
      errEl.textContent = 'A senha deve conter no mínimo 4 dígitos ou caracteres.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (errEl) errEl.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Ativando 5 Dias Grátis...</span>';
  }

  try {
    const res = await api.register({
      name: name || `Membro ${phoneDigits.slice(-4)}`,
      email: email,
      phone: phone,
      password: password
    });

    if (typeof showToast === 'function') {
      showToast('🎉 Bem-vindo! Seus 5 dias de Teste VIP foram ativados com sucesso.', 'success');
    }
    updateAuthUI();
    updateHomeScreenData();
    window.location.reload();
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Erro ao realizar cadastro. Verifique os dados.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🚀</span> <span>Ativar Meus 5 Dias Grátis Agora</span>';
    }
  }
};



// ===================================================================
// ASSINATURA E PLANOS VIP
// ===================================================================
window.openPlansModal = function() {
  const modal = document.getElementById('modal-plans');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }
};

window.closePlansModal = function() {
  const modal = document.getElementById('modal-plans');
  if (modal) {
    modal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
};

window.subscribePlan = async function(planKey) {
  const planNames = {
    'monthly': 'Plano Mensal (R$ 14,90)',
    'quarterly': 'Plano Trimestral (R$ 37,00)',
    'semiannual': 'Plano Semestral (R$ 67,00)',
    'yearly': 'Plano Anual (R$ 97,00)',
    'whatsapp': 'Assinatura VIP'
  };

  const planTitle = planNames[planKey] || 'Assinatura Bicho Master Pro';

  // Busca configurações públicas para links ou WhatsApp
  let settings = window._publicSettings;
  if (!settings) {
    try {
      const res = await fetch(`${API_BASE}/auth/settings`);
      if (res.ok) settings = await res.json();
      window._publicSettings = settings;
    } catch (e) {}
  }

  // 1. Se houver link de checkout configurado para este plano específico, abre ele
  const planConfig = settings?.plans?.[planKey];
  if (planConfig && planConfig.link && planConfig.link.startsWith('http')) {
    window.open(planConfig.link, '_blank');
    return;
  }

  // 2. Fallback WhatsApp com mensagem pré-formatada para Pix direto
  let whatsappNum = (settings?.support_whatsapp || '11941083720').replace(/\D/g, '');
  if (!whatsappNum.startsWith('55') && whatsappNum.length >= 10) {
    whatsappNum = '55' + whatsappNum;
  }

  const currentUser = api.getCurrentTenant();
  const userName = currentUser?.name ? ` Me chamo ${currentUser.name}.` : '';
  const userEmail = currentUser?.email ? ` Meu e-mail: ${currentUser.email}.` : '';

  const msg = `Olá! Quero assinar o *${planTitle}* do Bicho Master Pro.${userName}${userEmail} Pode me enviar a chave Pix para liberação imediata?`;
  const waUrl = `https://wa.me/${whatsappNum}?text=${encodeURIComponent(msg)}`;

  window.open(waUrl, '_blank');
};


/* ==========================================================================
   POP-UP E BANNER DE CELEBRAÇÃO: ACERTO COMPROVADO NO 1º PRÊMIO
   Texto e layout otimizados para alta credibilidade ("Nosso aplicativo acertou mais uma vez")
   ========================================================================== */
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
  if (lotEl) lotEl.textContent = b.lottery || 'Loteria Oficial';
  if (slotEl) slotEl.textContent = b.slot || 'Sorteio';
  if (dateEl) {
    const formattedDate = b.date ? b.date.split('-').reverse().slice(0, 2).join('/') : 'Hoje';
    dateEl.textContent = formattedDate;
  }
  if (badgeEl) {
    if (b.type === 'MILHAR_1ST') {
      badgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-yellow-400 animate-ping"></span> 💥 MILHAR NO 1º PRÊMIO!';
    } else if (b.type === 'CENTENA_1ST') {
      badgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> ⭐ CENTENA NO 1º PRÊMIO!';
    } else {
      badgeEl.innerHTML = '<span class="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></span> 🎯 MILHAR NO CERCADO!';
    }
  }
  if (descEl) {
    descEl.textContent = b.prize_desc || '1º Prêmio (Cabeça)';
  }

  // Vibração tátil no celular para marcar a vitória
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  } catch(e) {}

  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeBingoCelebrationModal = function() {
  const modal = document.getElementById('modal-bingo-celebration');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
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
  if (b) {
    const lot = b.lottery || 'RJ';
    const dt = b.date || '';
    const slot = b.slot || '';
    const hId = b.snapshot_id || b.draw_id || b.id || '';
    const num = b.hit_number || b.prize_1 || '';
    window.location.href = `/historico?lottery=${encodeURIComponent(lot)}&date=${encodeURIComponent(dt)}&slot=${encodeURIComponent(slot)}&highlight=${encodeURIComponent(hId)}&number=${encodeURIComponent(num)}&type=${encodeURIComponent(b.type || '')}`;
  } else {
    window.location.href = '/historico';
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

    // REGRA: Apenas para Centena e Milhar!
    const isAllowedType = (b.type === 'MILHAR_1ST' || b.type === 'CENTENA_1ST' || b.type === 'MILHAR_CERCADO');
    if (!isAllowedType) {
      container.classList.add('hidden');
      return;
    }

    // REGRA: Aparecer SOMENTE UMA VEZ por acerto!
    if (!forceShow) {
      if (localStorage.getItem(seenModalKey) !== '1') {
        // Marca IMEDIATAMENTE para garantir que NUNCA reabra na mesma sessão ou navegação
        try { localStorage.setItem(seenModalKey, '1'); } catch(e) {}
        setTimeout(() => {
          openBingoCelebrationModal(b);
        }, 800);
      }
    }

    // Se usuário já fechou o banner fixo nesta versão, respeita e não exibe o banner fixo
    if (!forceShow && localStorage.getItem(dismissedKey) === '1') {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    let gradientBg = 'from-amber-500/25 via-yellow-500/15 to-amber-600/25 border-amber-500/50 shadow-amber-500/10';
    let badgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    let icon = '🏆';
    let badgeLabel = '💥 1º PRÊMIO NA CABEÇA!';

    if (b.type === 'MILHAR_1ST') {
      gradientBg = 'from-amber-500/35 via-yellow-400/25 to-amber-600/35 border-amber-400/80 shadow-amber-400/20';
      badgeColor = 'bg-gradient-to-r from-amber-500/30 to-yellow-400/30 text-yellow-200 border-yellow-400/60';
      icon = '💥';
      badgeLabel = '💥 1º PRÊMIO NA CABEÇA!';
    } else if (b.type === 'MILHAR_CERCADO') {
      gradientBg = 'from-indigo-600/25 via-purple-600/15 to-indigo-700/25 border-indigo-500/50 shadow-indigo-500/10';
      badgeColor = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      icon = '🎯';
      badgeLabel = '🎯 MILHAR NO CERCADO!';
    } else if (b.type === 'CENTENA_1ST') {
      gradientBg = 'from-emerald-600/25 via-teal-600/15 to-emerald-700/25 border-emerald-500/50 shadow-emerald-500/10';
      badgeColor = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      icon = '⭐';
      badgeLabel = '⭐ CENTENA NO 1º PRÊMIO!';
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

/* ==========================================================================
   MÓDULO: MATRIZ 3X3 DO DIA (BASE DIA & MÊS)
   ========================================================================== */
window._currentMatrizData = null;
window._currentMatrizMode = 'dia'; // 'dia', 'mes', 'both'
window._currentMatrizSelectedGroup = null;

window.loadMatrizContent = async function(forceDate = null, forceMode = null) {
  const dateInput = document.getElementById('matriz-target-date');
  const mainDateInput = document.getElementById('target-date');

  let dateVal = forceDate;
  if (!dateVal && dateInput && dateInput.value) {
    dateVal = dateInput.value;
  }
  if (!dateVal && mainDateInput && mainDateInput.value) {
    dateVal = mainDateInput.value;
  }
  if (!dateVal) {
    dateVal = new Date().toISOString().split('T')[0];
  }

  if (dateInput && dateInput.value !== dateVal) {
    dateInput.value = dateVal;
  }

  if (forceMode) {
    window._currentMatrizMode = forceMode;
  }

  const gridContainer = document.getElementById('matriz-grid-visual-container');
  if (gridContainer) {
    gridContainer.innerHTML = `
      <div class="col-span-3 py-10 flex flex-col items-center justify-center text-center space-y-2">
        <div class="w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
        <span class="text-[11px] text-slate-400 font-medium">Calculando Chave Mestra da Data...</span>
      </div>`;
  }

  try {
    const data = await api.getMatrizDia(dateVal);
    window._currentMatrizData = data;
    renderMatrizView(data, window._currentMatrizMode);
  } catch (err) {
    console.error('Erro ao carregar Chave Mestra:', err);
    if (gridContainer) {
      gridContainer.innerHTML = `<div class="col-span-3 py-6 text-center text-rose-400 text-xs font-semibold">Falha ao carregar Matriz: ${err.message || 'Erro de conexão'}</div>`;
    }
  }
};

window.changeMatrizDate = function(val) {
  if (!val) return;
  loadMatrizContent(val);
};

window.setMatrizDateToday = function() {
  const today = new Date().toISOString().split('T')[0];
  loadMatrizContent(today);
};

window.setMatrizDateYesterday = function() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split('T')[0];
  loadMatrizContent(yesterday);
};

window.setMatrizDateTomorrow = function() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = d.toISOString().split('T')[0];
  loadMatrizContent(tomorrow);
};

window.switchMatrizMode = function(mode) {
  window._currentMatrizMode = mode;
  ['dia', 'mes', 'both'].forEach(m => {
    const btn = document.getElementById(`matriz-mode-${m}`);
    if (btn) {
      if (m === mode) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow-sm cursor-pointer';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition-all cursor-pointer';
      }
    }
  });

  if (window._currentMatrizData) {
    renderMatrizView(window._currentMatrizData, mode);
  }

  // Se já houver um bicho selecionado no Cruzador, recalcula para o novo modo (dia/mês/both)
  if (window._currentMatrizSelectedGroup) {
    selectMatrizAnimal(window._currentMatrizSelectedGroup);
  }
};

function renderMatrizView(data, mode) {
  if (!data) return;
  mode = mode || window._currentMatrizMode || 'dia';

  // 1. Pílulas de Dígitos Ativos
  const pillsContainer = document.getElementById('matriz-active-digits-pills');
  if (pillsContainer) {
    const activeDigits = (mode === 'mes') ? data.digits_mes : ((mode === 'both') ? data.all_digits : data.digits_dia);
    const labelDigits = (mode === 'mes') ? 'Dígitos Mês:' : ((mode === 'both') ? 'Dígitos (Dia + Mês):' : 'Dígitos Ativos:');
    pillsContainer.innerHTML = `
      <span class="font-bold text-slate-300">${labelDigits}</span>
      ${activeDigits.map(d => `<span class="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold text-xs flex items-center justify-center">${d}</span>`).join('')}
    `;
  }

  // 2. Grade 3x3 Visual
  const gridContainer = document.getElementById('matriz-grid-visual-container');
  const gridTitle = document.getElementById('matriz-grid-title');
  const gridCoords = document.getElementById('matriz-grid-coords');

  const activeGrid = (mode === 'mes') ? data.grid_mes : data.grid_dia;

  if (gridTitle) {
    gridTitle.innerHTML = (mode === 'mes')
      ? '<span>🗓️</span> <span>Grade 3x3 - Base Mês (' + String(data.month).padStart(2, '0') + ')</span>'
      : (mode === 'both' ? '<span>✨</span> <span>Grade 3x3 - Base Dia (' + String(data.day).padStart(2, '0') + ') & Mês</span>' : '<span>📅</span> <span>Grade 3x3 - Base Dia (' + String(data.day).padStart(2, '0') + ')</span>');
  }

  if (gridCoords) {
    gridCoords.textContent = (mode === 'mes') ? `Mês ${data.month}` : ((mode === 'both') ? `Dia ${data.day} & Mês ${data.month}` : `Dia ${data.day}`);
  }

  if (gridContainer && activeGrid) {
    let cellsHtml = '';
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const val = activeGrid[r][c];
        const isCorner = (r === 0 && c === 0) || (r === 0 && c === 2) || (r === 2 && c === 0) || (r === 2 && c === 2);
        const isCenter = (r === 1 && c === 1);
        
        let cellCls = 'bg-slate-950/90 border-slate-700/60 text-slate-100';
        let badge = '';
        if (isCorner) {
          cellCls = 'bg-amber-950/80 border-amber-500/80 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/30';
          badge = '<span class="absolute top-1 right-1 text-[8px] font-mono text-amber-400/80">V</span>';
        } else if (isCenter) {
          cellCls = 'bg-cyan-950/80 border-cyan-500/70 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/30';
          badge = '<span class="absolute top-1 right-1 text-[8px] font-mono text-cyan-400/80">C</span>';
        }

        cellsHtml += `
          <div class="relative rounded-xl border flex flex-col items-center justify-center font-mono font-black text-2xl sm:text-3xl transition-all hover:scale-105 select-none ${cellCls}">
            ${badge}
            <span>${val}</span>
          </div>
        `;
      }
    }
    gridContainer.innerHTML = cellsHtml;
  }

  // 3. Centenas Diretas da Grade
  const linesContainer = document.getElementById('matriz-direct-lines-container');
  const directCountEl = document.getElementById('matriz-direct-count');
  const linesData = (mode === 'mes') ? data.lines_mes : data.lines_dia;

  if (linesContainer) {
    if (mode === 'both') {
      const allDirect = data.all_direct_centenas || [];
      if (directCountEl) {
        directCountEl.textContent = `${allDirect.length} centenas (Dia + Mês)`;
      }
      linesContainer.innerHTML = `
        <div class="space-y-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 uppercase">
            <span>✨</span> <span>Centenas Diretas Combinadas (Dia & Mês):</span>
          </div>
          <div class="flex flex-wrap gap-1 max-h-40 overflow-y-auto custom-scrollbar p-1">
            ${allDirect.map(num => `
              <button type="button" onclick="copySingleNumber(event, '${num}', 'Centena')" title="Copiar centena ${num}"
                class="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400 text-amber-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
                ${num}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    } else if (linesData) {
      const totalLines = (linesData.horizontais || []).length + (linesData.verticais || []).length + (linesData.diagonais || []).length;
      if (directCountEl) {
        directCountEl.textContent = `${totalLines} centenas`;
      }

      linesContainer.innerHTML = `
        <div class="space-y-1.5">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
            <span>↔️</span> <span>Horizontais (Diretas & Inversas):</span>
          </div>
          <div class="flex flex-wrap gap-1">
            ${(linesData.horizontais || []).map(num => `
              <button type="button" onclick="copySingleNumber(event, '${num}', 'Centena')" title="Copiar centena ${num}"
                class="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-400 text-cyan-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
                ${num}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="space-y-1.5 pt-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
            <span>↕️</span> <span>Verticais (Colunas):</span>
          </div>
          <div class="flex flex-wrap gap-1">
            ${(linesData.verticais || []).map(num => `
              <button type="button" onclick="copySingleNumber(event, '${num}', 'Centena')" title="Copiar centena ${num}"
                class="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400 text-amber-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
                ${num}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="space-y-1.5 pt-1">
          <div class="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 uppercase">
            <span>↗️</span> <span>Diagonais (Cruzamentos):</span>
          </div>
          <div class="flex flex-wrap gap-1">
            ${(linesData.diagonais || []).map(num => `
              <button type="button" onclick="copySingleNumber(event, '${num}', 'Centena')" title="Copiar centena ${num}"
                class="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 hover:border-indigo-400 text-indigo-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
                ${num}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }
  }

  // 4. Atualiza Título e Subtítulo da Confluência conforme Modo
  const confTitleEl = document.getElementById('matriz-confluence-title');
  const confSubEl = document.getElementById('matriz-confluence-subtitle');
  if (confTitleEl) {
    confTitleEl.innerHTML = (mode === 'mes')
      ? '<span>🗓️</span> <span>Bichos com Máxima Confluência no Grid (Base Mês ' + String(data.month).padStart(2, '0') + ')</span>'
      : (mode === 'both'
        ? '<span>✨</span> <span>Bichos com Máxima Confluência (Visão Integrada Dia + Mês)</span>'
        : '<span>👑</span> <span>Bichos com Máxima Confluência no Grid (Base Dia ' + String(data.day).padStart(2, '0') + ')</span>');
  }
  if (confSubEl) {
    confSubEl.textContent = (mode === 'mes')
      ? 'Dezenas 100% no Grid do Mês + Centenas e Milhares Base Mês'
      : (mode === 'both'
        ? 'Sinergia Cruzada Grid Dia + Mês + Centenas e Milhares VIP'
        : 'Dezenas 100% no Grid do Dia + Centenas e Milhares VIP');
  }

  // Atualiza Subtítulo do Cruzador
  const cruzadorSubEl = document.getElementById('matriz-cruzador-subtitle');
  if (cruzadorSubEl) {
    cruzadorSubEl.textContent = (mode === 'mes')
      ? 'Selecione qualquer bicho para extrair centenas e milhares da grade do mês'
      : (mode === 'both'
        ? 'Selecione qualquer bicho para extrair centenas e milhares da visão integrada (Dia + Mês)'
        : 'Selecione qualquer um dos 25 animais para extrair suas centenas e milhares da grade de hoje');
  }

  // 5. Top Animais com Confluência específicos para o MODO ATUAL
  const confContainer = document.getElementById('matriz-confluence-animals-container');
  const animalsListSource = (mode === 'mes')
    ? (data.top_confluence_animals_mes || data.top_confluence_animals)
    : ((mode === 'both')
      ? (data.top_confluence_animals_both || data.top_confluence_animals)
      : (data.top_confluence_animals_dia || data.top_confluence_animals));

  if (confContainer && animalsListSource) {
    const displayedAnimals = animalsListSource.slice(0, 6);
    window._currentMatrizDisplayedAnimals = displayedAnimals;

    const modeTag = (mode === 'mes') ? 'no Grid Mês' : ((mode === 'both') ? 'Integrado' : 'no Grid Dia');
    const tensLabel = (mode === 'mes') ? 'Dezenas no Grid Mês:' : ((mode === 'both') ? 'Dezenas no Grid Integrado:' : 'Dezenas no Grid Dia:');
    const cLabel = (mode === 'mes') ? 'Centenas Mês:' : ((mode === 'both') ? 'Centenas Integradas:' : 'Centenas VIP:');
    const mLabel = (mode === 'mes') ? 'Milhares Mês:' : ((mode === 'both') ? 'Milhares Integradas:' : 'Milhares VIP:');

    confContainer.innerHTML = displayedAnimals.map(anim => {
      const matchTensStr = (anim.matching_tens && anim.matching_tens.length > 0)
        ? anim.matching_tens.map(t => `<span class="px-1.5 py-0.2 rounded bg-indigo-950/80 border border-indigo-700/50 text-indigo-200 font-mono font-bold text-[11px]">${t}</span>`).join(' ')
        : '<span class="text-slate-500 text-xs">-</span>';

      const centenasList = (anim.top_centenas || []).slice(0, 4);
      const milharesList = (anim.top_milhares || []).slice(0, 4);

      const centenasHtml = centenasList.map(c => `
        <button type="button" onclick="copySingleNumber(event, '${c}', 'Centena')" title="Copiar centena ${c}"
          class="px-2 py-0.5 rounded bg-amber-950/90 border border-amber-500/80 text-amber-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
          ${c}
        </button>
      `).join(' ');

      const milharesHtml = milharesList.map(m => `
        <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')" title="Copiar milhar ${m}"
          class="px-2 py-0.5 rounded bg-indigo-950/90 border border-indigo-500/80 text-indigo-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
          ${m}
        </button>
      `).join(' ');

      const cStr = centenasList.join(', ');
      const mStr = milharesList.join(', ');

      return `
        <div class="card-glass p-3 rounded-xl border border-slate-800 hover:border-amber-500/40 transition-all space-y-2">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="text-2xl">${anim.emoji || '🐾'}</span>
              <div>
                <h4 class="text-xs font-black text-white">${anim.animal}</h4>
                <span class="text-[10px] text-slate-400 font-mono">Grupo ${String(anim.group).padStart(2, '0')}</span>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
              ⚡ ${Math.round(anim.confluence_score)}% ${modeTag}
            </span>
          </div>

          <div class="space-y-1 pt-1 border-t border-slate-800/80">
            <div class="flex items-center justify-between text-[10px] text-slate-400">
              <span>${tensLabel}</span>
              <div class="flex items-center gap-1">${matchTensStr}</div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1">
              <span>${cLabel}</span>
              <div class="flex items-center gap-1">${centenasHtml}</div>
            </div>
            <div class="flex items-center justify-between text-[10px] text-slate-400 pt-1">
              <span>${mLabel}</span>
              <div class="flex items-center gap-1">${milharesHtml}</div>
            </div>
          </div>

          <!-- 2 Botões de Cópia: Centena e Milhares do Bicho -->
          <div class="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800/80">
            <button type="button" onclick="copyAnimalMatrizHundreds(this, '${anim.animal}', '${cStr}')"
              class="py-1 px-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/50 hover:border-cyan-400 text-cyan-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Copiar centenas da ${anim.animal}">
              <span>🎯</span> <span>Copiar Centenas</span>
            </button>
            <button type="button" onclick="copyAnimalMatrizThousands(this, '${anim.animal}', '${mStr}')"
              class="py-1 px-2 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/50 hover:border-amber-400 text-amber-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Copiar milhares da ${anim.animal}">
              <span>👑</span> <span>Copiar Milhares</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 6. Renderiza Ternos de Dezena de Alta Confluência
  const ternosTitleEl = document.getElementById('matriz-ternos-title');
  const ternosSubEl = document.getElementById('matriz-ternos-subtitle');
  if (ternosTitleEl) {
    ternosTitleEl.innerHTML = (mode === 'mes')
      ? '<span>🎯</span> <span>Ternos de Dezena da Chave Mestra (Base Mês ' + String(data.month).padStart(2, '0') + ')</span>'
      : (mode === 'both'
        ? '<span>✨</span> <span>Ternos de Dezena da Chave Mestra (Visão Integrada Dia + Mês)</span>'
        : '<span>🎯</span> <span>Ternos de Dezena da Chave Mestra (Base Dia ' + String(data.day).padStart(2, '0') + ')</span>');
  }
  if (ternosSubEl) {
    ternosSubEl.textContent = (mode === 'mes')
      ? 'Ternos de Dezena (1º ao 5º) formados pelas dezenas dos líderes do Mês'
      : (mode === 'both'
        ? 'Ternos de Dezena (1º ao 5º) com sinergia cruzada Dia + Mês'
        : 'Ternos de Dezena (1º ao 5º) formados pelas dezenas dos líderes do Dia');
  }

  const ternosContainer = document.getElementById('matriz-ternos-container');
  const ternosSource = (mode === 'mes')
    ? (data.ternos_de_dezena_mes || [])
    : ((mode === 'both')
      ? (data.ternos_de_dezena_both || [])
      : (data.ternos_de_dezena_dia || data.ternos_de_dezena || []));

  window._currentMatrizTernos = ternosSource;

  if (ternosContainer) {
    if (!ternosSource || ternosSource.length === 0) {
      ternosContainer.innerHTML = '<p class="text-xs text-slate-500 py-3 text-center col-span-3">Nenhum terno gerado para esta data.</p>';
    } else {
      ternosContainer.innerHTML = ternosSource.map(t => {
        const bichosHtml = (t.bichos || []).map(b => `
          <div class="flex-1 flex flex-col items-center justify-center p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 hover:border-amber-500/40 transition-all text-center">
            <span class="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 font-mono font-black text-sm flex items-center justify-center shadow-sm mb-1">
              ${b.dezena}
            </span>
            <span class="text-xs font-bold text-white flex items-center gap-0.5 truncate max-w-[90px]">
              <span>${b.emoji || '🐾'}</span> <span class="truncate">${b.name}</span>
            </span>
            <span class="text-[9px] text-slate-400 font-mono">Gr ${String(b.group).padStart(2, '0')}</span>
          </div>
        `).join('');

        return `
          <div class="card-glass p-3 rounded-xl border border-slate-800 hover:border-amber-500/40 transition-all space-y-2.5 flex flex-col justify-between">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5">
                <span class="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                  ${t.badge || '👑 Terno'}
                </span>
                <h4 class="text-xs font-bold text-white">${t.title}</h4>
              </div>
              <span class="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/60 border border-cyan-700/50 px-1.5 py-0.5 rounded">
                ⚡ ${Math.round(t.score || 85)}%
              </span>
            </div>

            <!-- As 3 Dezenas e seus bichos -->
            <div class="grid grid-cols-3 gap-1.5">
              ${bichosHtml}
            </div>

            <p class="text-[10px] text-slate-400 italic leading-tight">
              ${t.description || 'Palpite de alta assertividade para o 1º ao 5º prêmio'}
            </p>

            <!-- Botão de Cópia Individual do Terno -->
            <button type="button" onclick="copySingleTerno(this, '${t.copy_str}')"
              class="w-full py-1 px-2 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/50 hover:border-amber-400 text-amber-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Copiar terno de dezena ${t.copy_str}">
              <span>🎯</span> <span>Copiar Terno (${t.copy_str})</span>
            </button>
          </div>
        `;
      }).join('');
    }
  }

  // 7. Renderiza Seletor de Animais (25 bichos)
  renderMatrizAnimalsPicker(data);
}

function renderMatrizAnimalsPicker(data) {
  const picker = document.getElementById('matriz-animals-picker');
  if (!picker) return;

  const animalsList = [
    { g: 1, name: 'Avestruz', emoji: '🐦' }, { g: 2, name: 'Águia', emoji: '🦅' }, { g: 3, name: 'Burro', emoji: '🫏' },
    { g: 4, name: 'Borboleta', emoji: '🦋' }, { g: 5, name: 'Cachorro', emoji: '🐕' }, { g: 6, name: 'Cabra', emoji: '🐐' },
    { g: 7, name: 'Carneiro', emoji: '🐏' }, { g: 8, name: 'Camelo', emoji: '🐪' }, { g: 9, name: 'Cobra', emoji: '🐍' },
    { g: 10, name: 'Coelho', emoji: '🐇' }, { g: 11, name: 'Cavalo', emoji: '🐎' }, { g: 12, name: 'Elefante', emoji: '🐘' },
    { g: 13, name: 'Galo', emoji: '🐓' }, { g: 14, name: 'Gato', emoji: '🐈' }, { g: 15, name: 'Jacaré', emoji: '🐊' },
    { g: 16, name: 'Leão', emoji: '🦁' }, { g: 17, name: 'Macaco', emoji: '🐒' }, { g: 18, name: 'Porco', emoji: '🐖' },
    { g: 19, name: 'Pavão', emoji: '🦚' }, { g: 20, name: 'Peru', emoji: '🦃' }, { g: 21, name: 'Touro', emoji: '🐂' },
    { g: 22, name: 'Tigre', emoji: '🐅' }, { g: 23, name: 'Urso', emoji: '🐻' }, { g: 24, name: 'Veado', emoji: '🦌' },
    { g: 25, name: 'Vaca', emoji: '🐄' }
  ];

  picker.innerHTML = animalsList.map(a => {
    const isSelected = window._currentMatrizSelectedGroup === a.g;
    const btnCls = isSelected
      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
      : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700/60';

    return `
      <button type="button" onclick="selectMatrizAnimal(${a.g})"
        class="px-2 py-1 rounded-lg text-xs flex items-center gap-1 border transition-all cursor-pointer active:scale-95 ${btnCls}">
        <span>${a.emoji}</span>
        <span>${a.name}</span>
        <span class="text-[9px] opacity-75">(${String(a.g).padStart(2, '0')})</span>
      </button>
    `;
  }).join('');
}

window.selectMatrizAnimal = async function(groupNum) {
  window._currentMatrizSelectedGroup = groupNum;
  if (window._currentMatrizData) {
    renderMatrizAnimalsPicker(window._currentMatrizData);
  }

  const detailCard = document.getElementById('matriz-animal-detail-card');
  const badgeEl = document.getElementById('matriz-selected-animal-badge');
  const dateInput = document.getElementById('matriz-target-date');
  const dateVal = (dateInput && dateInput.value) ? dateInput.value : new Date().toISOString().split('T')[0];
  const mode = window._currentMatrizMode || 'dia';

  if (detailCard) {
    detailCard.classList.remove('hidden');
    detailCard.innerHTML = '<div class="py-6 flex justify-center"><div class="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div></div>';
  }

  try {
    const animData = await api.getMatrizAnimal(groupNum, dateVal, mode);
    if (badgeEl) {
      badgeEl.classList.remove('hidden');
      badgeEl.textContent = `${animData.emoji || '🐾'} ${animData.animal} (Gr ${String(animData.group).padStart(2, '0')})`;
    }

    if (detailCard) {
      const centenasHtml = (animData.top_centenas || []).map(c => `
        <button type="button" onclick="copySingleNumber(event, '${c}', 'Centena')" title="Copiar centena ${c}"
          class="px-2.5 py-1 rounded-lg bg-amber-950/90 border border-amber-500/80 text-amber-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
          ${c}
        </button>
      `).join(' ');

      const milharesHtml = (animData.top_milhares || []).map(m => `
        <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')" title="Copiar milhar ${m}"
          class="px-2.5 py-1 rounded-lg bg-indigo-950/90 border border-indigo-500/80 text-indigo-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
          ${m}
        </button>
      `).join(' ');

      const matchingStr = (animData.matching_tens && animData.matching_tens.length > 0)
        ? animData.matching_tens.map(t => `<span class="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 text-indigo-200 font-mono font-bold text-xs">${t}</span>`).join(' ')
        : '<span class="text-xs text-slate-500">Nenhuma dezena 100% contida</span>';

      const cAllStr = (animData.top_centenas || []).join(', ');
      const mAllStr = (animData.top_milhares || []).join(', ');

      detailCard.innerHTML = `
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div class="flex items-center gap-2">
            <span class="text-2xl">${animData.emoji || '🐾'}</span>
            <div>
              <h4 class="text-sm font-bold text-white">${animData.animal} (Grupo ${String(animData.group).padStart(2, '0')})</h4>
              <span class="text-[11px] text-slate-400">Confluência: ${Math.round(animData.confluence_score || 0)}% no Grid (${mode === 'mes' ? 'Base Mês' : (mode === 'both' ? 'Integrada' : 'Base Dia')})</span>
            </div>
          </div>
          <span class="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
            ${mode === 'mes' ? '🗓️ Chave Mês' : (mode === 'both' ? '✨ Chave Integrada' : '⚡ Chave Mestra')}
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div class="space-y-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800">
            <span class="text-[11px] font-bold text-slate-400 uppercase block">Dezenas no Grid:</span>
            <div class="flex flex-wrap gap-1">${matchingStr}</div>
          </div>

          <div class="space-y-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <span class="text-[11px] font-bold text-amber-400 uppercase block mb-1">Centenas de Ouro:</span>
              <div class="flex flex-wrap gap-1">${centenasHtml}</div>
            </div>
            <button type="button" onclick="copyAnimalMatrizHundreds(this, '${animData.animal}', '${cAllStr}')"
              class="w-full mt-2 py-1 px-2 rounded-lg bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/50 text-cyan-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm">
              <span>🎯</span> <span>Copiar Centenas</span>
            </button>
          </div>

          <div class="space-y-1.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
            <div>
              <span class="text-[11px] font-bold text-indigo-400 uppercase block mb-1">Milhares VIP:</span>
              <div class="flex flex-wrap gap-1">${milharesHtml}</div>
            </div>
            <button type="button" onclick="copyAnimalMatrizThousands(this, '${animData.animal}', '${mAllStr}')"
              class="w-full mt-2 py-1 px-2 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 border border-amber-700/50 text-amber-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm">
              <span>👑</span> <span>Copiar Milhares</span>
            </button>
          </div>
        </div>
      `;
    }
  } catch (err) {
    console.error('Erro ao cruzar bicho na matriz:', err);
    if (detailCard) {
      detailCard.innerHTML = `<p class="text-xs text-rose-400 py-2 text-center">Falha ao cruzar bicho: ${err.message || 'Erro'}</p>`;
    }
  }
};

window.copyAnimalMatrizHundreds = async function(btn, animalName, numbersStr) {
  if (!numbersStr) {
    showToast(`Nenhuma centena disponível para ${animalName}.`, 'warning');
    return;
  }
  const ok = await window.copyToClipboard(numbersStr, btn, 'Copiadas!');
  if (ok) {
    showToast(`Centenas de ${animalName} copiadas!`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};

window.copyAnimalMatrizThousands = async function(btn, animalName, numbersStr) {
  if (!numbersStr) {
    showToast(`Nenhuma milhar disponível para ${animalName}.`, 'warning');
    return;
  }
  const ok = await window.copyToClipboard(numbersStr, btn, 'Copiadas!');
  if (ok) {
    showToast(`Milhares de ${animalName} copiadas!`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};

window.copyAllMatrizThousands = async function(btn) {
  if (!window._currentMatrizData) {
    showToast('Carregando dados da Chave Mestra...', 'info');
    return;
  }
  const data = window._currentMatrizData;
  const animals = window._currentMatrizDisplayedAnimals || (data.top_confluence_animals || []).slice(0, 6);
  if (!animals || animals.length === 0) {
    showToast('Nenhum bicho disponível na Chave Mestra.', 'warning');
    return;
  }

  const mList = [];
  animals.forEach(a => {
    const list = (a.top_milhares || []).slice(0, 4);
    list.forEach(m => {
      if (m !== undefined && m !== null) {
        mList.push(String(m).trim().padStart(4, '0'));
      }
    });
  });

  const uniqueM = Array.from(new Set(mList)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  if (uniqueM.length === 0) {
    showToast('Nenhuma milhar encontrada nos bichos.', 'warning');
    return;
  }

  const text = uniqueM.join(', ');
  const ok = await window.copyToClipboard(text, btn, 'Copiadas!');
  if (ok) {
    showToast(`${uniqueM.length} Milhares dos bichos copiadas!`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};
window.copyAllMatrizMilhares = window.copyAllMatrizThousands;
window.copyAllMatrizConfluenceThousands = window.copyAllMatrizThousands;

window.copyAllMatrizHundreds = async function(btn) {
  if (!window._currentMatrizData) {
    showToast('Carregando dados da Chave Mestra...', 'info');
    return;
  }
  const data = window._currentMatrizData;
  const animals = window._currentMatrizDisplayedAnimals || (data.top_confluence_animals || []).slice(0, 6);
  if (!animals || animals.length === 0) {
    showToast('Nenhum bicho disponível na Chave Mestra.', 'warning');
    return;
  }

  const cList = [];
  animals.forEach(a => {
    const list = (a.top_centenas || []).slice(0, 4);
    list.forEach(c => {
      if (c !== undefined && c !== null) {
        cList.push(String(c).trim().padStart(3, '0'));
      }
    });
  });

  const uniqueC = Array.from(new Set(cList)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  if (uniqueC.length === 0) {
    showToast('Nenhuma centena encontrada nos bichos.', 'warning');
    return;
  }

  const text = uniqueC.join(', ');
  const ok = await window.copyToClipboard(text, btn, 'Copiadas!');
  if (ok) {
    showToast(`${uniqueC.length} Centenas dos bichos copiadas!`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};
window.copyAllMatrizCentenas = window.copyAllMatrizHundreds;
window.copyAllMatrizConfluenceHundreds = window.copyAllMatrizHundreds;

window.copyAllMatrizDirectCentenas = async function(btn) {
  if (!window._currentMatrizData) {
    showToast('Carregando dados da Chave Mestra...', 'info');
    return;
  }
  const mode = window._currentMatrizMode || 'dia';
  const data = window._currentMatrizData;
  const lines = (mode === 'mes') ? data.lines_mes : ((mode === 'both') ? null : data.lines_dia);

  const directList = (mode === 'both')
    ? (data.all_direct_centenas || [])
    : [
        ...((lines && lines.horizontais) || []),
        ...((lines && lines.verticais) || []),
        ...((lines && lines.diagonais) || [])
      ];

  const uniqueDirect = Array.from(new Set(directList.map(c => String(c).trim().padStart(3, '0'))))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  if (uniqueDirect.length === 0) {
    showToast('Nenhuma centena direta encontrada.', 'warning');
    return;
  }

  const text = uniqueDirect.join(', ');
  const ok = await window.copyToClipboard(text, btn, 'Copiadas!');
  if (ok) {
    showToast(`${uniqueDirect.length} centenas diretas copiadas!`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};

window.copySingleTerno = async function(btn, ternoStr) {
  if (!ternoStr) {
    showToast('Nenhum terno disponível para copiar.', 'warning');
    return;
  }
  const ok = await window.copyToClipboard(ternoStr, btn, 'Copiado!');
  if (ok) {
    showToast(`Terno de Dezena (${ternoStr}) copiado com sucesso!`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};

window.copyAllMatrizTernos = async function(btn) {
  const ternos = window._currentMatrizTernos;
  if (!ternos || ternos.length === 0) {
    showToast('Nenhum terno de dezena disponível.', 'warning');
    return;
  }

  const mode = window._currentMatrizMode || 'dia';
  const modeLabel = (mode === 'mes') ? 'BASE MÊS' : ((mode === 'both') ? 'VISÃO INTEGRADA' : 'BASE DIA');
  const lines = [
    `🎯 TERNOS DE DEZENA - CHAVE MESTRA (${modeLabel})`,
    ...ternos.map(t => `${t.copy_str} (${t.title} - ${(t.bichos || []).map(b => b.name).join(' + ')})`)
  ];

  const ok = await window.copyToClipboard(lines.join('\n'), btn, 'Copiados!');
  if (ok) {
    showToast(`${ternos.length} Ternos de Dezena copiados com sucesso!`, 'success');
  } else {
    showToast('Não foi possível copiar automaticamente.', 'warning');
  }
};
