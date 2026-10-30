
window.isUserVip = function() {
  const tenant = (typeof api !== 'undefined' && api.getCurrentTenant) ? api.getCurrentTenant() : null;
  if (!tenant) return false;
  if (tenant.role === 'admin') return true;
  const userEmail = (tenant.email || '').toLowerCase();
  if (userEmail === 'k1qvinicius.cs@gmail.com' || userEmail === 'k1qvinicius@gmail.com') return true;

  // 1. Assinante ativo (mensal, vip, anual ou com status ativo não expirado)
  if (tenant.subscription_status === 'active') {
    if (tenant.plan_type && tenant.plan_type !== 'free') return true;
    if (tenant.trial_days_remaining !== undefined && tenant.trial_days_remaining !== null && tenant.trial_days_remaining > 0) return true;
    if (tenant.trial_info && tenant.trial_info.is_expired === false) return true;
    if (!tenant.is_expired) return true;
  }
  if (tenant.plan_type === 'monthly' || tenant.plan_type === 'vip' || tenant.plan_type === 'anual' || tenant.plan_type === 'trimestral' || tenant.plan_type === 'semestral') {
    if (tenant.subscription_status !== 'expired' && tenant.subscription_status !== 'suspended') return true;
  }

  // 2. Dias restantes > 0 e não expirado
  const days = (tenant.trial_info && tenant.trial_info.days_remaining !== undefined)
    ? tenant.trial_info.days_remaining
    : (tenant.trial_days_remaining !== undefined ? tenant.trial_days_remaining : 0);
  if (days > 0 && tenant.subscription_status !== 'expired' && tenant.subscription_status !== 'suspended') {
    return true;
  }

  // 3. Verificação de expiração explícita
  if (tenant.is_expired === true || tenant.subscription_status === 'expired' || tenant.subscription_status === 'suspended') {
    return false;
  }

  // 4. Se tiver trial_info calculado pelo backend
  if (tenant.trial_info) {
    if (tenant.trial_info.is_expired === true || tenant.trial_info.status === 'expired') {
      return false;
    }
    if (tenant.trial_info.seconds_remaining > 0 || tenant.trial_info.hours_remaining > 0 || tenant.trial_info.days_remaining > 0) {
      return true;
    }
    if (tenant.trial_info.status === 'trial' || tenant.trial_info.status === 'active') {
      return !tenant.trial_info.is_expired;
    }
  }

  // 5. Verificação direta pela data trial_expires_at
  if (tenant.trial_expires_at) {
    try {
      const expDate = new Date(tenant.trial_expires_at.replace(' ', 'T'));
      if (!isNaN(expDate.getTime())) {
        return expDate.getTime() > Date.now();
      }
    } catch (e) {}
  }

  return false;
};

window.showAuthGateModal = function(tab) {
  const gate = document.getElementById('app-auth-gate');
  if (gate) {
    gate.classList.add('is-open');
    gate.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (tab === 'login' && typeof window.switchAuthGateTab === 'function') {
      window.switchAuthGateTab('login');
    } else if (tab === 'register' && typeof window.switchAuthGateTab === 'function') {
      window.switchAuthGateTab('register');
    }
  }
};

window.closeAuthGateModal = function() {
  const gate = document.getElementById('app-auth-gate');
  if (gate) {
    gate.classList.remove('is-open');
    gate.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
  }
};

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
  let num = (window._publicSettings?.support_whatsapp || '11984684263').replace(/\D/g, '');
  if (!num.startsWith('55') && num.length >= 10) num = '55' + num;
  const text = encodeURIComponent(msg || 'Olá! Gostaria de ajuda com meu acesso no Radar 5×5 Pro.');
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
      showToast('🎉 Perfil concluído com sucesso!', 'success');
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
window.currentLottery = currentLottery;

document.addEventListener('DOMContentLoaded', async () => {
  document.body.classList.remove('overflow-hidden');
  await initTenantAuth();
  await setupGoogleIdentity();

  // 1. Suporte prioritário a parâmetros diretos de navegação (?lottery=...&slot=...&date=...&hit=...&group=...)
  const urlParams = new URLSearchParams(window.location.search);
  const paramLottery = urlParams.get('lottery');
  const paramSlot = urlParams.get('slot');
  const paramDate = urlParams.get('date');
  const paramHit = urlParams.get('hit');
  const paramGroup = urlParams.get('group');
  const paramDrawId = urlParams.get('draw_id');
  if (paramDrawId) {
    window.currentApsDrawId = parseInt(paramDrawId, 10);
  }
  const hash = window.location.hash.replace('#', '');

  if (paramHit) {
    window._targetHitCentena = paramHit;
  }
  if (paramGroup) {
    window._targetHitGroup = paramGroup;
  }

  // Ativação e confirmação pós-pagamento Mercado Pago
  const paramPayment = urlParams.get('payment');
  const paramRef = urlParams.get('ref');
  if (paramPayment === 'success') {
    setTimeout(async () => {
      showToast('🎉 Pagamento confirmado pelo Mercado Pago! Verificando seu acesso VIP...', 'success');
      try {
        if (paramRef) {
          const vRes = await fetch(`${API_BASE}/payments/verify-status?ref=${encodeURIComponent(paramRef)}`);
          if (vRes.ok) {
            const vData = await vRes.json();
            if (vData.token) {
              api.setToken(vData.token);
              if (vData.tenant) api.setCurrentTenant(vData.tenant);
            }
          }
        }
        if (typeof api.checkSession === 'function') {
          await api.checkSession();
        }
        if (typeof closePlansModal === 'function') closePlansModal();
        updateAuthUI();
        updateHomeScreenData();
        showToast('👑 Seu Acesso VIP está 100% liberado! Boas apostas.', 'success');
      } catch (e) {
        console.warn('Erro ao atualizar sessão pós-pagamento:', e);
      }
    }, 1200);
  } else if (paramPayment === 'pending') {
    setTimeout(() => {
      showToast('⏳ Pagamento Pix em processamento. Assim que o Mercado Pago compensar, seu VIP será liberado automaticamente!', 'info');
    }, 1500);
  }

  const validLots = ['RJ', 'LOOK', 'NACIONAL', 'SP', 'FEDERAL', 'BAHIA', 'MINAS'];
  if (paramLottery && validLots.includes(paramLottery.toUpperCase())) {
    currentLottery = paramLottery.toUpperCase();
    localStorage.setItem('bicho_active_lottery', currentLottery);
    window.currentLottery = currentLottery;
    window.currentApsLottery = currentLottery;
  } else {
    const savedLot = localStorage.getItem('bicho_active_lottery');
    if (savedLot && validLots.includes(savedLot.toUpperCase())) {
      currentLottery = savedLot.toUpperCase();
    } else {
      currentLottery = 'LOOK';
      localStorage.setItem('bicho_active_lottery', currentLottery);
    }
    window.currentLottery = currentLottery;
  }

  setDefaultDate();
  if (paramDate) {
    const targetDateEl = document.getElementById('target-date');
    if (targetDateEl) targetDateEl.value = paramDate;
  }

  if (paramSlot) {
    window._userSelectedSlot = paramSlot.toUpperCase();
  } else {
    window._userSelectedSlot = null; // Garante que ao recarregar ou navegar calcule o próximo sorteio
  }

  // LIMPEZA DA URL: Se a página foi aberta com parâmetros de busca (?date=, ?lottery=, ?slot=), limpa para que o F5 não fique preso no dia ou loteria anterior
  if (paramLottery || paramSlot || paramDate) {
    try {
      const cleanUrl = new URL(window.location);
      cleanUrl.searchParams.delete('lottery');
      cleanUrl.searchParams.delete('slot');
      cleanUrl.searchParams.delete('date');
      window.history.replaceState({}, '', cleanUrl.pathname + cleanUrl.search + (hash ? '#' + hash : ''));
    } catch (e) {}
  }

  updateLotteryButtonsUI();
  await initSlotSelector(currentLottery, window._userSelectedSlot, paramDate);

  // 2. Determina tela alvo antes do carregamento inicial (mantém na mesma tela ao atualizar com F5)
  const validScreens = ['home', 'palpites', 'aps', 'coluna-data', 'cruz', 'puxadas', 'atrasados', 'resultados', 'milhares-atrasadas', 'centena-master', 'matriz'];
  let savedScreen = null;
  try { savedScreen = localStorage.getItem('bicho_active_screen'); } catch(e) {}

  let targetScreen = 'home';
  // Prioridade 1: Hash na URL (ex: #coluna-data, #resultados, #cruz, #palpites)
  if (hash && validScreens.includes(hash)) {
    targetScreen = hash;
  // Prioridade 2: Parâmetro explícito de tab (ex: ?tab=coluna-data)
  } else if (urlParams.get('tab') && validScreens.includes(urlParams.get('tab'))) {
    targetScreen = urlParams.get('tab');
  } else if (paramDrawId) {
    targetScreen = 'aps';
  // Prioridade 3: Tela salva no localStorage da navegação anterior do usuário
  } else if (savedScreen && validScreens.includes(savedScreen)) {
    targetScreen = savedScreen;
  // Prioridade 4: Se o usuário veio por link com parâmetros de loteria/slot sem hash explícito
  } else if ((paramLottery || paramSlot || paramDate) && (!hash || hash === 'palpites')) {
    targetScreen = 'palpites';
  }

  switchScreen(targetScreen, true);
  setupEventListeners();

  try {
    await Promise.all([loadPrediction(), loadDrawResults()]);
    checkAndRenderMilharBingoBanner();
    if (paramSlot || paramDate) {
      showAuditedPredictionBanner(currentLottery, window._userSelectedSlot || paramSlot, paramDate);
    }
  } catch (err) {
    console.warn('Erro ao carregar dados iniciais:', err);
    try { await loadDrawResults(); } catch(e) {}
  }

  // Inicia monitor em tempo real para detecção instantânea de novos resultados (a cada 25 segundos)
  startInstantResultsMonitor();
});

// Suporte ao botão voltar/avançar do navegador entre as telas
window.addEventListener('hashchange', () => {
  const validScreens = ['home', 'palpites', 'aps', 'coluna-data', 'cruz', 'puxadas', 'atrasados', 'resultados', 'milhares-atrasadas', 'centena-master', 'matriz'];
  const hash = window.location.hash.replace('#', '');
  if (validScreens.includes(hash)) {
    switchScreen(hash, false);
  }
});

/* ==========================================================================
   NAVEGAÇÃO PRINCIPAL EM TELAS NORMAIS (SINGLE PAGE VIEWS)
   Telas: 'home', 'palpites', 'cruz', 'puxadas', 'atrasados', 'resultados'
   ========================================================================== */
/* Helper para validar se o slot pertence a respectiva loteria */
function doesSlotBelongToLottery(slotCode, lotteryCode) {
  if (!slotCode || !lotteryCode) return false;
  const s = slotCode.toUpperCase().trim();
  const lot = lotteryCode.toUpperCase().trim();
  if (lot === 'FEDERAL') return s === 'FED' || s.startsWith('FED');
  if (lot === 'SP') return s.startsWith('SP-') || s.startsWith('BAND') || s.includes('SP');
  if (lot === 'LOOK') return s.startsWith('LK-') || s.startsWith('LOOK');
  if (lot === 'NACIONAL') return s.startsWith('LN-') || s.startsWith('NAC');
  if (lot === 'BAHIA') return s.startsWith('BA-') || s.includes('BAHIA');
  if (lot === 'MINAS') return s.startsWith('MG-') || s.includes('MINAS') || s === 'ALV' || s === 'MALV';
  if (lot === 'RJ') return ['PPT', 'PTM', 'PT', 'PTV', 'PTN', 'COR'].includes(s) || s.startsWith('RJ');
  return true;
}
window.doesSlotBelongToLottery = doesSlotBelongToLottery;
window._userSelectedSlot = null;
window.switchScreen = switchScreen;

function switchScreen(screenName, updateHash = true) {
  window.switchScreen = switchScreen;
  const screens = ['home', 'palpites', 'aps', 'coluna-data', 'cruz', 'puxadas', 'atrasados', 'resultados', 'milhares-atrasadas', 'centena-master', 'matriz'];
  if (!screens.includes(screenName)) screenName = 'home';

  const currentTenant = api.getCurrentTenant();
  const isExpired = currentTenant && currentTenant.role !== 'admin' && typeof window.isUserVip === 'function' && !window.isUserVip();
  // Modo Degustação: permite navegar nas telas para conhecer as funcionalidades e ver o valor do app
  /* if (isExpired && screenName !== 'home' && screenName !== 'resultados') {
    showTrialExpiredModal();
    return;
  } */

  currentScreen = screenName;
  window.currentScreen = screenName;

  // Persiste a tela ativa no localStorage para manter a mesma tela ao recarregar a página
  try {
    localStorage.setItem('bicho_active_screen', screenName);
  } catch(e) {}
  document.documentElement.removeAttribute('data-initial-screen');

  // Oculta todas as telas e exibe a selecionada
  if (screenName === 'aps') {
    if (typeof window.renderApsScreen === 'function') {
      window.renderApsScreen();
    }
  }
  if (screenName === 'coluna-data') {
    if (typeof window.renderColunaDataScreen === 'function') {
      window.renderColunaDataScreen();
    }
  }

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
    if (screenName === 'cruz' || screenName === 'home' || screenName === 'aps' || screenName === 'coluna-data' || screenName === 'milhares-atrasadas' || screenName === 'centena-master' || screenName === 'matriz') {
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
      // Sincronização garantida: se a tela aberta for Palpites e os horários no DOM pertencerem a outra banca, sincroniza imediatamente
      const firstPill = document.querySelector('#lottery-slots-pills .slot-pill-btn');
      const pillSlot = firstPill ? firstPill.getAttribute('data-slot') : null;
      const hasMismatch = !firstPill || !doesSlotBelongToLottery(pillSlot, currentLottery);
      if (hasMismatch) {
        initSlotSelector(currentLottery, window._userSelectedSlot).then(() => {
          if (typeof loadPrediction === 'function') loadPrediction();
        });
      }
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
  const navBtnAps = document.getElementById('nav-btn-aps');
  if (navBtnAps) {
    navBtnAps.className = (screenName === 'aps')
      ? 'px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold transition-all'
      : 'px-2.5 py-1.5 rounded-lg text-xs font-semibold text-amber-400 hover:text-white hover:bg-slate-800 transition-all border border-amber-500/30';
  }
  
  if (navBtnCruz) navBtnCruz.className = (screenName === 'cruz') ? activeDesktopClass : inactiveDesktopClass;
  if (navBtnResultados) navBtnResultados.className = (screenName === 'resultados') ? activeDesktopClass : inactiveDesktopClass;
  const navBtnColunaData = document.getElementById('nav-btn-coluna-data');
  if (navBtnColunaData) navBtnColunaData.className = (screenName === 'coluna-data') ? activeDesktopClass : inactiveDesktopClass;
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

  const mobBtnAps = document.getElementById('mob-btn-aps');
  setMobBtnActive(mobBtnHome, screenName === 'home');
  setMobBtnActive(mobBtnAps, screenName === 'aps');
  setMobBtnActive(mobBtnPalpites, screenName === 'palpites');
  setMobBtnActive(mobBtnCruz, screenName === 'cruz');
  setMobBtnActive(mobBtnResultados, screenName === 'resultados');
  setMobBtnActive(mobBtnMenu, false);
  document.body.classList.remove('overflow-hidden');

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
    const today = getLocalDateStr();
    const cruzDateInput = document.getElementById('cruz-target-date');
    if (cruzDateInput && (!cruzDateInput.value || cruzDateInput.value !== today)) {
      cruzDateInput.value = today;
    }
    loadCruzModalContent(cruzDateInput ? cruzDateInput.value : today);
  } else if (screenName === 'puxadas') {
    _puxadasDataCache = null;
        _predictionCache.clear();
    loadPuxadasModalContent();
  } else if (screenName === 'atrasados') {
    loadAtrasadosModalList();
  } else if (screenName === 'resultados') {
    loadDrawResults();
  } else if (screenName === 'coluna-data') {
    const colBtn = document.getElementById('sidebar-btn-coluna-data');
    if (colBtn) colBtn.classList.add('sidebar-item-active');
  } else if (screenName === 'home') {
    updateHomeScreenData();
        checkAndRenderMilharBingoBanner(false);
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
        btn.className = 'py-1 px-1 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 bg-indigo-600 text-white shadow-sm active:scale-95 cursor-pointer';
      } else {
        btn.className = 'py-1 px-1 rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-1 text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 cursor-pointer';
      }
    }

    if (content) {
      content.classList.toggle('hidden', t !== topicName);
    }
  });

  if (topicName === 'contra' && typeof window.loadAndRenderPatternBreaksHistory === 'function') {
    const activeLot = (currentLottery || window.currentLottery || localStorage.getItem('bicho_active_lottery') || 'RJ').toUpperCase();
    window.loadAndRenderPatternBreaksHistory(activeLot);
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

/* ==========================================================================
   COLUNA DA DATA & FECHAMENTO DIÁRIO (MÉTODO CLÁSSICO DOS 5 BICHOS)
   Tela exclusiva (view-coluna-data) e item direto na Navegação Principal
   ========================================================================== */

const COLUNA_ANIMAL_MAP = {
  1: { name: 'Avestruz', emoji: '🪶', tens: ['01', '02', '03', '04'] },
  2: { name: 'Águia', emoji: '🦅', tens: ['05', '06', '07', '08'] },
  3: { name: 'Burro', emoji: '🐴', tens: ['09', '10', '11', '12'] },
  4: { name: 'Borboleta', emoji: '🦋', tens: ['13', '14', '15', '16'] },
  5: { name: 'Cachorro', emoji: '🐕', tens: ['17', '18', '19', '20'] },
  6: { name: 'Cabra', emoji: '🐐', tens: ['21', '22', '23', '24'] },
  7: { name: 'Carneiro', emoji: '🐑', tens: ['25', '26', '27', '28'] },
  8: { name: 'Camelo', emoji: '🐫', tens: ['29', '30', '31', '32'] },
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

let _currentColunaDataCache = null;
let _colunaScreenTargetDate = null;
let _colunaScreenCustomDezena = '52';

function getAnimalByDezena(dezVal) {
  const n = parseInt(dezVal, 10);
  if (isNaN(n) || n < 0 || n > 99) return null;
  const g = (n === 0) ? 25 : Math.floor((n - 1) / 4) + 1;
  return COLUNA_ANIMAL_MAP[g] ? { group: g, ...COLUNA_ANIMAL_MAP[g] } : null;
}

/**
 * Calcula os dados da coluna de uma data específica
 */
let _colunaSelectedLottery = localStorage.getItem('bicho_coluna_lottery') || 'RJ';
window._colunaSelectedLottery = _colunaSelectedLottery;

window.setColunaLotteryFilter = function(lotCode) {
  _colunaSelectedLottery = lotCode;
  window._colunaSelectedLottery = lotCode;
  try {
    localStorage.setItem('bicho_coluna_lottery', lotCode);
  } catch(e) {}
  if (typeof window.renderColunaDataScreen === 'function') {
    window.renderColunaDataScreen();
  }
};

/**
 * Calcula os dados da coluna de uma data específica
 */
window.getColunaDataInfo = async function(dateOverride) {
  let targetDate = new Date();
  if (dateOverride) {
    if (typeof dateOverride === 'string') {
      const parts = dateOverride.split('-');
      if (parts.length === 3) {
        targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
    } else if (dateOverride instanceof Date) {
      targetDate = dateOverride;
    }
  } else if (_colunaScreenTargetDate) {
    const parts = _colunaScreenTargetDate.split('-');
    if (parts.length === 3) {
      targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
  }

  const day = targetDate.getDate();
  const unit = day % 10;

  let colNumber = 1;
  let groups = [];
  if (unit === 1 || unit === 6) {
    colNumber = 1;
    groups = [1, 6, 11, 16, 21];
  } else if (unit === 2 || unit === 7) {
    colNumber = 2;
    groups = [2, 7, 12, 17, 22];
  } else if (unit === 3 || unit === 8) {
    colNumber = 3;
    groups = [3, 8, 13, 18, 23];
  } else if (unit === 4 || unit === 9) {
    colNumber = 4;
    groups = [4, 9, 14, 19, 24];
  } else {
    colNumber = 5;
    groups = [5, 10, 15, 20, 25];
  }

  const d1 = unit;
  const d2 = (unit + 5) % 10;
  const d3 = (unit + 2) % 10;
  const d4 = (unit + 7) % 10;

  // Prefixo mestre da data (ex: 27 no dia 02; 38 no dia 03)
  const masterPrefix = `${d1}${d2}`;
  const invPrefix = `${d2}${d1}`;
  const supPrefix1 = `${d1}${d3}`;
  const supPrefix2 = `${d3}${d1}`;

  const pad2 = n => String(n).padStart(2, '0');
  const dateStr = `${targetDate.getFullYear()}-${pad2(targetDate.getMonth() + 1)}-${pad2(targetDate.getDate())}`;

  // Busca apurações do dia
  const groupHits = {};
  groups.forEach(g => { groupHits[g] = []; });

  try {
    const res = await fetch(`${API_BASE}/results?limit=100`);
    if (res.ok) {
      const data = await res.json();
      const items = (data && data.items) ? data.items : (Array.isArray(data) ? data : []);
      items.forEach(it => {
        if (it.draw_date === dateStr || !it.draw_date) {
          const lot = (it.lottery || '').toUpperCase().trim();
          const slot = (it.slot || '').trim();
          if (Array.isArray(it.prizes_detail)) {
            it.prizes_detail.forEach(p => {
              const g = p.group;
              if (g && groupHits[g] !== undefined) {
                const lbl = (p.label || '').trim();
                const isHead = Boolean(lbl && (lbl.includes('1º') || lbl.toLowerCase().includes('cabeça')));
                groupHits[g].push({
                  lottery: lot,
                  slot: slot,
                  label: lbl,
                  number: (p.number || '').trim(),
                  isHead: isHead
                });
              }
            });
          } else if (Array.isArray(it.groups_1_to_5)) {
            it.groups_1_to_5.forEach((g, idx) => {
              if (g && groupHits[g] !== undefined) {
                const isHead = (idx === 0);
                groupHits[g].push({
                  lottery: lot,
                  slot: slot,
                  label: `${idx + 1}º Prêmio`,
                  number: '',
                  isHead: isHead
                });
              }
            });
          }
        }
      });
    }
  } catch (e) {
    console.warn('Erro ao consultar resultados do dia para Coluna da Data:', e);
  }

  const animals = groups.map(gNum => {
    const a = COLUNA_ANIMAL_MAP[gNum];
    const tens = a.tens;
    const rawHits = groupHits[gNum] || [];

    // Ordenação inteligente:
    // 1º: 1º Prêmio (Cabeça 🏆)
    // 2º: Rio de Janeiro (RJ)
    // 3º: Demais bancas
    const hits = [...rawHits].sort((x, y) => {
      if (x.isHead !== y.isHead) return y.isHead ? 1 : -1;
      if (x.lottery === 'RJ' && y.lottery !== 'RJ') return -1;
      if (y.lottery === 'RJ' && x.lottery !== 'RJ') return 1;
      return 0;
    });

    const isHit = hits.length > 0;

    const goldCentenas = [
      `${d2}${tens[0]}`,
      `${d2}${tens[1]}`,
      `${d2}${tens[2]}`,
      `${d2}${tens[3]}`
    ];
    const supportCentenas = [
      `${d1}${tens[0]}`,
      `${d1}${tens[1]}`,
      `${d3}${tens[2]}`,
      `${d4}${tens[3]}`
    ];

    const goldMilhares = [
      `${masterPrefix}${tens[0]}`,
      `${masterPrefix}${tens[1]}`,
      `${masterPrefix}${tens[2]}`,
      `${masterPrefix}${tens[3]}`
    ];

    const supportMilhares = [
      `${supPrefix1}${tens[0]}`,
      `${invPrefix}${tens[1]}`,
      `${supPrefix2}${tens[2]}`,
      `${d4}${d1}${tens[3]}`
    ];

    return {
      group: gNum,
      name: a.name,
      emoji: a.emoji,
      tens: tens,
      goldCentenas: goldCentenas,
      supportCentenas: supportCentenas,
      centenas: [...goldCentenas, ...supportCentenas.slice(0, 2)],
      goldMilhares: goldMilhares,
      supportMilhares: supportMilhares,
      milhares: [...goldMilhares, ...supportMilhares.slice(0, 2)],
      hits: hits,
      isHit: isHit,
      hitDetail: hits.length > 0 ? `${hits[0].lottery} ${hits[0].slot} ${hits[0].label} (${hits[0].number})`.trim() : null
    };
  });

  const hitCount = animals.filter(a => a.isHit).length;
  const pendingCount = animals.length - hitCount;

  _currentColunaDataCache = {
    dateStr,
    day,
    unit,
    colNumber,
    d1, d2, d3, d4,
    masterPrefix,
    invPrefix,
    supPrefix1,
    supPrefix2,
    animals,
    hitCount,
    pendingCount
  };

  return _currentColunaDataCache;
};

/**
 * Renderiza a tela completa da Coluna da Data
 */
window.renderColunaDataScreen = async function(dateOverride) {
  const container = document.getElementById('coluna-data-screen-content');
  if (!container) return;

  if (dateOverride) {
    _colunaScreenTargetDate = dateOverride;
  } else if (!_colunaScreenTargetDate) {
    const today = new Date();
    _colunaScreenTargetDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  const data = await window.getColunaDataInfo(_colunaScreenTargetDate);
  if (!data) return;

  const selectedLottery = window._colunaSelectedLottery || window.currentLottery || 'RJ';

  const lotteryLabels = {
    'RJ': 'Rio de Janeiro',
    'ALL': 'Todas as Bancas',
    'SP': 'São Paulo',
    'LOOK': 'Look Goiás',
    'NACIONAL': 'Nacional',
    'BAHIA': 'Bahia',
    'MINAS': 'Minas Gerais',
    'FEDERAL': 'Federal'
  };

  const selectedLotteryName = lotteryLabels[selectedLottery] || selectedLottery;

  // Enriquece os dados com base na banca selecionada
  const animalsWithLottery = data.animals.map(a => {
    const lotHits = (selectedLottery === 'ALL') ? a.hits : a.hits.filter(h => h.lottery === selectedLottery);
    const otherHits = (selectedLottery === 'ALL') ? [] : a.hits.filter(h => h.lottery !== selectedLottery);
    const otherLots = Array.from(new Set(otherHits.map(h => h.lottery)));
    const isHitInSelected = lotHits.length > 0;
    return {
      ...a,
      lotHits,
      otherHits,
      otherLots,
      isHitInSelected
    };
  });

  const pendingAnimals = animalsWithLottery.filter(a => !a.isHitInSelected);
  const hotPending = pendingAnimals.length > 0 ? pendingAnimals[0] : null;
  const hitCount = animalsWithLottery.filter(a => a.isHitInSelected).length;
  const pendingCount = animalsWithLottery.length - hitCount;

  const now = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const todayStr = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  const yestStr = `${yest.getFullYear()}-${pad2(yest.getMonth() + 1)}-${pad2(yest.getDate())}`;

  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const tomStr = `${tom.getFullYear()}-${pad2(tom.getMonth() + 1)}-${pad2(tom.getDate())}`;

  const isToday = (data.dateStr === todayStr);
  const isTomorrow = (data.dateStr === tomStr);
  const isYesterday = (data.dateStr === yestStr);

  const activeDateBtnClass = "px-2.5 py-1.5 rounded-xl bg-amber-600/40 hover:bg-amber-600/60 text-amber-200 text-xs font-black border border-amber-500/70 shadow-sm transition-all cursor-pointer";
  const inactiveDateBtnClass = "px-2.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-800 transition-all cursor-pointer";

  const activeLotteryBtnClass = "px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs shadow-md border border-amber-400 transition-all cursor-pointer flex items-center gap-1.5 shrink-0";
  const inactiveLotteryBtnClass = "px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white font-semibold text-xs border border-slate-700/80 transition-all cursor-pointer flex items-center gap-1.5 shrink-0";

  let html = `
    <!-- 1. CARD SUPERIOR DE CONTROLE, DATA E BANCA -->
    <div class="card-glass p-3.5 sm:p-5 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-950/30 via-slate-900/95 to-slate-950 shadow-xl shadow-amber-500/5 space-y-3.5 relative overflow-hidden">
      <div class="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>

      <!-- Topo: Título + Botão WhatsApp -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl text-amber-400 shrink-0 shadow-inner">
            ⚡
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-base sm:text-xl font-black uppercase tracking-wider text-slate-100">
                Coluna da Data • Fechamento Diário
              </h1>
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-black uppercase shadow-sm">
                Coluna ${data.colNumber}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Ciclo dos 5 bichos da data • Milhares de Ouro (MC), Centenas e Dezenas
            </p>
          </div>
        </div>

        <button type="button" onclick="copyColunaDataGames()"
          class="h-9 px-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer self-start sm:self-auto">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
          <span>Copiar Fechamento Completo</span>
        </button>
      </div>

      <!-- Linha 2: Seletor de Data + Chave Mestre + Status ao Vivo -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 flex-wrap">
        <!-- Controles de Data -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <div class="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-sm">
            <label for="coluna-screen-target-date" class="text-[10px] font-bold text-slate-400 uppercase">Data:</label>
            <input type="date" id="coluna-screen-target-date" value="${data.dateStr}" onchange="renderColunaDataScreen(this.value)"
              class="bg-transparent text-amber-300 font-mono text-xs font-bold focus:outline-none cursor-pointer">
          </div>
          <button type="button" onclick="setColunaDateYesterday()"
            class="${isYesterday ? activeDateBtnClass : inactiveDateBtnClass}">Ontem</button>
          <button type="button" onclick="setColunaDateToday()"
            class="${isToday ? activeDateBtnClass : inactiveDateBtnClass}">Hoje</button>
          <button type="button" onclick="setColunaDateTomorrow()"
            class="${isTomorrow ? activeDateBtnClass : inactiveDateBtnClass}">Amanhã</button>
        </div>

        <!-- Chave Mestre e Status de Apuração -->
        <div class="flex items-center gap-2 flex-wrap">
          <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold flex items-center gap-1.5 shadow-inner">
            <span>Prefixo Mestre:</span>
            <strong class="text-amber-200 text-sm font-black font-mono">${data.masterPrefix}</strong>
            <span class="text-slate-500 font-normal">| Inv: ${data.invPrefix}</span>
          </div>

          <div class="px-3 py-1.5 rounded-xl ${
            isTomorrow
              ? 'bg-indigo-950/60 border border-indigo-500/50 text-indigo-300'
              : pendingCount === 0
                ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-300'
                : 'bg-amber-950/60 border border-amber-500/50 text-amber-300'
          } text-xs font-bold flex items-center gap-2 shadow-inner">
            <span class="w-2 h-2 rounded-full ${
              isTomorrow
                ? 'bg-indigo-400 animate-pulse'
                : pendingCount === 0
                  ? 'bg-emerald-400'
                  : 'bg-amber-400 animate-pulse'
            }"></span>
            <span>${
              isTomorrow
                ? `🔮 Ciclo de Amanhã (Coluna ${data.colNumber})`
                : pendingCount === 0
                  ? (selectedLottery === 'ALL' ? '🏆 5/5 Já Premiaram no Brasil Hoje!' : `🏆 5/5 Já Premiaram no ${selectedLotteryName}!`)
                  : (selectedLottery === 'ALL'
                      ? `⚡ ${hitCount} de 5 já saíram (${pendingCount} pendente${pendingCount > 1 ? 's' : ''})`
                      : `⚡ No ${selectedLotteryName}: ${hitCount} de 5 saíram (${pendingCount} pendente${pendingCount > 1 ? 's' : ''})`
                    )
            }</span>
          </div>
        </div>
      </div>

      <!-- Linha 3: Seletor de Banca / Loteria para Apuração da Coluna -->
      <div class="pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
          <span class="text-[10px] font-bold text-slate-400 uppercase shrink-0 mr-1 flex items-center gap-1">
            <span>🎯</span> <span>Apuração por Banca:</span>
          </span>
          <button type="button" onclick="setColunaLotteryFilter('RJ')"
            class="${selectedLottery === 'RJ' ? activeLotteryBtnClass : inactiveLotteryBtnClass}">
            <span>🌴 Rio de Janeiro</span>
          </button>
          <button type="button" onclick="setColunaLotteryFilter('ALL')"
            class="${selectedLottery === 'ALL' ? activeLotteryBtnClass : inactiveLotteryBtnClass}">
            <span>🌐 Todas as Bancas</span>
          </button>
          <button type="button" onclick="setColunaLotteryFilter('SP')"
            class="${selectedLottery === 'SP' ? activeLotteryBtnClass : inactiveLotteryBtnClass}">
            <span>🏙️ São Paulo</span>
          </button>
          <button type="button" onclick="setColunaLotteryFilter('LOOK')"
            class="${selectedLottery === 'LOOK' ? activeLotteryBtnClass : inactiveLotteryBtnClass}">
            <span>🎯 Look Goiás</span>
          </button>
          <button type="button" onclick="setColunaLotteryFilter('NACIONAL')"
            class="${selectedLottery === 'NACIONAL' ? activeLotteryBtnClass : inactiveLotteryBtnClass}">
            <span>🇧🇷 Nacional</span>
          </button>
          <button type="button" onclick="setColunaLotteryFilter('BAHIA')"
            class="${selectedLottery === 'BAHIA' ? activeLotteryBtnClass : inactiveLotteryBtnClass}">
            <span>☀️ Bahia</span>
          </button>
          <button type="button" onclick="setColunaLotteryFilter('MINAS')"
            class="${selectedLottery === 'MINAS' ? activeLotteryBtnClass : inactiveLotteryBtnClass}">
            <span>⛰️ Minas</span>
          </button>
        </div>
        <span class="text-[11px] text-slate-400 shrink-0">
          Vendo resultados de: <strong class="text-amber-300 font-bold">${selectedLotteryName}</strong>
        </span>
      </div>
    </div>
  `;

  const isVip = window.isUserVip();
  if (!isVip) {
    html += `
      <div onclick="openPlansModal()" class="card-glass p-6 sm:p-8 rounded-3xl border-2 border-amber-500/60 bg-gradient-to-br from-amber-950/40 via-slate-900/95 to-slate-950 text-center shadow-2xl space-y-4 cursor-pointer group hover:border-amber-400 transition-all my-3">
        <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-3xl text-amber-300 shadow-lg shadow-amber-500/20">
          ⚡ 🔒
        </div>
        <div>
          <h3 class="text-base sm:text-lg font-black text-white">Fechamento da Coluna da Data Bloqueado</h3>
          <p class="text-xs text-slate-300 mt-1 max-w-md mx-auto leading-relaxed">
            A lista dos 5 animais da coluna, centenas e milhares do fechamento diário são 100% exclusivos para membros VIP.
          </p>
        </div>
        <div class="pt-1">
          <button type="button" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs shadow-md group-hover:scale-105 transition-transform">
            Desbloquear Coluna VIP (R$ 14,90/mês) ⭐
          </button>
        </div>
      </div>
    `;
    container.innerHTML = html;
    return;
  }

  // 2. CARD DESTAQUE: O BICHO DA VEZ (PENDENTE COM MAIOR PRESSÃO)
  if (hotPending) {
    html += `
      <div class="card-glass p-4 sm:p-5 rounded-2xl border-2 border-amber-400/80 bg-gradient-to-br from-amber-950/40 via-slate-900/95 to-slate-950 shadow-2xl shadow-amber-500/10 space-y-4 relative overflow-hidden">
        <div class="absolute -top-12 -right-12 w-40 h-40 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"></div>

        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-amber-500/30">
          <div class="flex items-center gap-3">
            <span class="text-3xl sm:text-4xl">${hotPending.emoji}</span>
            <div>
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-base sm:text-lg font-black text-amber-200 uppercase">
                  ${isTomorrow ? 'Bicho em Destaque para Amanhã:' : (selectedLottery === 'ALL' ? 'Bicho da Vez na Coluna:' : `Bicho da Vez no ${selectedLotteryName}:`)} ${hotPending.name} (Grupo ${String(hotPending.group).padStart(2, '0')})
                </h2>
                <span class="px-2.5 py-0.5 rounded-full ${
                  isTomorrow ? 'bg-indigo-600 text-white' : 'bg-amber-500 text-slate-950 animate-pulse font-black'
                } text-[10px] font-black uppercase shadow-sm">
                  ${isTomorrow ? `🔮 Ciclo de Amanhã (Coluna ${data.colNumber})` : (selectedLottery === 'ALL' ? '🔥 Pendente Geral' : `🔥 Pendente no ${selectedLotteryName}`)}
                </span>
              </div>
              <p class="text-xs text-slate-300 mt-0.5">
                Dezenas do Bicho: <span class="font-mono text-amber-300 font-bold">${hotPending.tens.join(', ')}</span>
                ${hotPending.otherLots && hotPending.otherLots.length > 0 ? `
                  <span class="ml-2 text-emerald-400 font-semibold">• ⚡ Já premiou hoje em: <strong class="text-emerald-300">${hotPending.otherLots.join(', ')}</strong></span>
                ` : ''}
              </p>
            </div>
          </div>

          <button type="button" onclick="copySingleAnimalColunaGames(${hotPending.group})"
            class="h-8 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 text-amber-200 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer self-start sm:self-auto">
            <span>📋</span> <span>Copiar Jogo de ${hotPending.name}</span>
          </button>
        </div>

        <!-- Milhares de Ouro (MC) em destaque gigante -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span>👑</span> <span>Milhares de Ouro (Prefixo Mestre ${data.masterPrefix} + Dezenas) - Jogar MC 1º ao 5º:</span>
            </span>
            <span class="text-[11px] text-slate-400">Toque em qualquer milhar para copiar</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            ${hotPending.goldMilhares.map(m => `
              <button type="button" onclick="navigator.clipboard.writeText('${m}'); showToast('Milhar ${m} copiada!', 'success')"
                class="py-2.5 px-3 bg-gradient-to-r from-amber-500/25 to-amber-600/15 hover:from-amber-500/35 hover:to-amber-600/25 border border-amber-500/70 rounded-xl text-center cursor-pointer transition-all active:scale-95 shadow-sm group">
                <span class="text-base sm:text-lg font-black font-mono text-amber-200 tracking-wider group-hover:text-amber-100">${m}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Milhares de Apoio / Inversão -->
        <div>
          <div class="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <span>🛡️</span> <span>Milhares de Apoio / Inversão:</span>
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
            ${hotPending.supportMilhares.map(m => `
              <button type="button" onclick="navigator.clipboard.writeText('${m}'); showToast('Milhar ${m} copiada!', 'success')"
                class="py-2 px-3 bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-center cursor-pointer transition-all active:scale-95">
                <span class="text-sm font-bold font-mono text-slate-200 tracking-wider">${m}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Centenas da Data -->
        <div>
          <div class="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
            <span>⚡</span> <span>Centenas da Data (Dígitos ${data.d2} e ${data.d1}):</span>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            ${hotPending.goldCentenas.map(c => `
              <span class="px-2.5 py-1 bg-indigo-950/60 border border-indigo-500/50 rounded-lg text-xs sm:text-sm font-mono font-bold text-indigo-200">${c}</span>
            `).join('')}
            <span class="text-slate-600 text-xs">|</span>
            ${hotPending.supportCentenas.map(c => `
              <span class="px-2.5 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs sm:text-sm font-mono text-slate-300">${c}</span>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  } else if (!isTomorrow && hitCount === 5) {
    html += `
      <div class="card-glass p-4 sm:p-5 rounded-2xl border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-950/40 via-slate-900/95 to-slate-950 shadow-xl space-y-2">
        <div class="flex items-center gap-3">
          <span class="text-3xl">🏆</span>
          <div>
            <h2 class="text-base sm:text-lg font-black text-emerald-300 uppercase">
              Ciclo Completo: Todos os 5 Bichos Premiaram no ${selectedLotteryName}!
            </h2>
            <p class="text-xs text-slate-300">
              Fechamento com 100% de aproveitamento na Coluna ${data.colNumber} hoje. Veja os detalhes de cada saída nos cards abaixo.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  // 3. GRADE COMPLETA DOS 5 BICHOS DA COLUNA
  html += `
    <div class="space-y-3">
      <div class="flex items-center justify-between px-1">
        <div class="flex items-center gap-2">
          <span class="text-amber-400 font-bold text-base">🐾</span>
          <h2 class="text-sm font-black uppercase tracking-wider text-slate-200">
            Todos os 5 Bichos da Coluna ${data.colNumber}
          </h2>
        </div>
        <span class="text-xs text-slate-400">Jogos completos e apuração detalhada</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
        ${animalsWithLottery.map(a => {
          const isHit = a.isHitInSelected;
          const hitsList = a.lotHits;
          const hasHead = hitsList.some(h => h.isHead);

          let badgeHtml = '';
          if (selectedLottery === 'ALL') {
            if (a.hits.length > 0) {
              const headCount = a.hits.filter(h => h.isHead).length;
              badgeHtml = `<span class="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ✅ ${a.hits.length} acerto${a.hits.length > 1 ? 's' : ''}${headCount > 0 ? ' 🏆' : ''}
              </span>`;
            } else {
              badgeHtml = `<span class="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 animate-pulse font-black">🔥 Pendente</span>`;
            }
          } else {
            if (isHit) {
              badgeHtml = `<span class="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                ✅ Saiu no ${selectedLottery}${hasHead ? ' 🏆' : ''}
              </span>`;
            } else {
              badgeHtml = `<span class="shrink-0 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 animate-pulse font-black">🔥 Pendente</span>`;
            }
          }

          let hitsDetailHtml = '';
          if (selectedLottery === 'ALL') {
            if (a.hits.length > 0) {
              const topHits = a.hits.slice(0, 3);
              const extraCount = a.hits.length - topHits.length;
              hitsDetailHtml = `
                <div class="space-y-1">
                  <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Saídas no Brasil:</div>
                  <div class="flex flex-col gap-1">
                    ${topHits.map(h => `
                      <div class="text-[10px] px-2 py-1 rounded flex items-center justify-between ${
                        h.isHead 
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-500/50 font-black shadow-sm' 
                          : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/20'
                      }">
                        <span class="truncate">${h.isHead ? '🏆 ' : ''}${h.lottery} ${h.slot || ''} ${h.label}</span>
                        <strong class="font-mono ${h.isHead ? 'text-amber-300 font-black' : 'text-slate-200'} ml-1 shrink-0">${h.number}</strong>
                      </div>
                    `).join('')}
                    ${extraCount > 0 ? `
                      <div class="text-[9px] text-slate-400 text-right px-1">
                        +${extraCount} outro${extraCount > 1 ? 's' : ''} prêmio${extraCount > 1 ? 's' : ''} hoje
                      </div>
                    ` : ''}
                  </div>
                </div>
              `;
            } else {
              hitsDetailHtml = `
                <div class="text-[10px] text-amber-400/90 font-medium bg-amber-950/30 px-2 py-1 rounded border border-amber-500/20 text-center">
                  ⏳ Ainda não premiou hoje
                </div>
              `;
            }
          } else {
            if (isHit) {
              hitsDetailHtml = `
                <div class="space-y-1">
                  <div class="text-[10px] font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1">
                    <span>🎯 Onde saiu no ${selectedLotteryName}:</span>
                  </div>
                  <div class="flex flex-col gap-1">
                    ${hitsList.map(h => `
                      <div class="text-[10px] px-2 py-1 rounded flex items-center justify-between ${
                        h.isHead 
                          ? 'bg-amber-500/25 text-amber-200 border border-amber-500/50 font-black shadow-sm' 
                          : 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 font-semibold'
                      }">
                        <span class="truncate">${h.isHead ? '🏆 ' : ''}${h.slot ? h.slot + ' • ' : ''}${h.label}</span>
                        <strong class="font-mono ${h.isHead ? 'text-amber-300 font-black' : 'text-slate-200'} ml-1 shrink-0">${h.number}</strong>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `;
            } else {
              hitsDetailHtml = `
                <div class="text-[10px] text-amber-300 bg-amber-950/40 p-2 rounded-xl border border-amber-500/30 space-y-1">
                  <div class="font-bold flex items-center gap-1">
                    <span>🔥</span> <span>Pendente no ${selectedLotteryName}</span>
                  </div>
                  ${a.otherLots.length > 0 ? `
                    <div class="text-[9px] text-slate-300 leading-tight">
                      ⚡ Já premiou hoje em: <strong class="text-amber-200 font-bold">${a.otherLots.join(', ')}</strong>
                    </div>
                  ` : `
                    <div class="text-[9px] text-slate-400">
                      Aguardando apuração dos horários
                    </div>
                  `}
                </div>
              `;
            }
          }

          return `
            <div class="card-glass p-3.5 rounded-2xl border ${
              isHit
                ? 'border-emerald-500/40 bg-slate-950/70'
                : 'border-amber-500/60 bg-gradient-to-b from-amber-950/30 to-slate-950/90 shadow-md shadow-amber-500/5'
            } space-y-2.5 flex flex-col justify-between">
              <div class="space-y-2">
                <!-- Cabeçalho do Bicho (Sem truncar nome!) -->
                <div class="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-800">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <span class="text-2xl shrink-0">${a.emoji}</span>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs sm:text-sm font-black text-white leading-tight">${a.name}</div>
                      <div class="text-[10px] text-slate-400 font-mono">Grupo ${String(a.group).padStart(2, '0')}</div>
                    </div>
                  </div>
                  ${badgeHtml}
                </div>

                <!-- Detalhes de Onde Saiu / Onde Está Pendente -->
                ${hitsDetailHtml}

                <!-- Dezenas -->
                <div class="text-[11px] text-slate-400">
                  Dezenas: <strong class="font-mono text-slate-200">${a.tens.join(', ')}</strong>
                </div>

                <!-- Milhares de Ouro (MC) -->
                <div class="space-y-1 pt-1 border-t border-slate-800/80">
                  <div class="text-[10px] font-bold text-amber-400 flex items-center gap-1">
                    <span>👑</span> <span>Milhares de Ouro (Prefixo ${data.masterPrefix}):</span>
                  </div>
                  <div class="grid grid-cols-2 gap-1">
                    ${a.goldMilhares.map(m => `
                      <button type="button" onclick="navigator.clipboard.writeText('${m}'); showToast('Milhar ${m} copiada!', 'success')"
                        class="py-1 px-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 rounded text-center cursor-pointer transition-all active:scale-95">
                        <span class="font-mono font-bold text-xs text-amber-200">${m}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>

                <!-- Centenas -->
                <div class="space-y-0.5 pt-1">
                  <div class="text-[10px] font-semibold text-slate-400">Centenas da Data:</div>
                  <div class="flex items-center gap-1 flex-wrap font-mono text-[11px] text-indigo-300">
                    ${a.goldCentenas.map(c => `<span class="bg-indigo-950/40 px-1 rounded">${c}</span>`).join(' ')}
                  </div>
                </div>
              </div>

              <!-- Botão Copiar Jogo -->
              <button type="button" onclick="copySingleAnimalColunaGames(${a.group})"
                class="w-full mt-2 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-bold text-slate-200 hover:text-white cursor-pointer transition-colors active:scale-95 flex items-center justify-center gap-1.5">
                <span>📋</span> <span>Copiar Jogo</span>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  // 4. DESDOBRADOR RÁPIDO COM QUALQUER DEZENA (EX: 52 DO GALO)
  html += `
    <div class="card-glass p-4 sm:p-5 rounded-2xl border border-slate-800 space-y-3 bg-[#0B0F19]">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-slate-800">
        <div>
          <div class="flex items-center gap-2">
            <span class="text-lg">💡</span>
            <h3 class="text-sm font-black text-white uppercase tracking-wider">
              Desdobrador da Chave Mestre com Qualquer Dezena
            </h3>
          </div>
          <p class="text-xs text-slate-400 mt-0.5">
            Gere instantaneamente as milhares de ouro e centenas para qualquer dezena que você goste usando o prefixo da data (${data.masterPrefix}).
          </p>
        </div>

        <div class="flex items-center gap-2">
          <input type="number" id="input-coluna-screen-custom-dezena" value="${_colunaScreenCustomDezena}" placeholder="Ex: 52" min="0" max="99"
            class="w-20 h-9 bg-slate-900 border border-amber-500/60 rounded-xl px-2 text-center text-sm font-mono font-black text-amber-300 focus:outline-none focus:border-amber-400 shadow-inner"
            oninput="onColunaScreenCustomDezenaInput(this.value)" />
          <span class="text-xs text-slate-400">Digite a dezena</span>
        </div>
      </div>

      <div id="coluna-screen-custom-dezena-output" class="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <!-- Renderizado dinamicamente via updateColunaScreenCustomDezenaOutput -->
      </div>
    </div>
  `;

  // 5. METODOLOGIA TRADICIONAL
  html += `
    <div class="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 space-y-1.5 leading-relaxed">
      <div class="flex items-center gap-2 font-bold text-amber-300">
        <span>📖</span> <span>Como funciona a Coluna da Data tradicional:</span>
      </div>
      <p>
        No método tradicional dos 5 bichos, cada dia do mês possui uma coluna de 5 animais que ciclam juntos (ex: dias com final 2 e 7 acionam a Coluna 2: Águia, Carneiro, Elefante, Macaco e Tigre).
        O <strong>Prefixo Mestre da Milhar</strong> cruza os dígitos do dia e da contra-data.
        Estatisticamente, em mais de <strong>87% dos dias</strong> saem ao menos 3 a 5 desses bichos nas extrações oficiais.
      </p>
    </div>
  `;

  container.innerHTML = html;
  updateColunaScreenCustomDezenaOutput(_colunaScreenCustomDezena);
};

window.setColunaDateToday = function() {
  const d = new Date();
  _colunaScreenTargetDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  window.renderColunaDataScreen(_colunaScreenTargetDate);
};

window.setColunaDateTomorrow = function() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  _colunaScreenTargetDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  window.renderColunaDataScreen(_colunaScreenTargetDate);
};

window.setColunaDateYesterday = function() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  _colunaScreenTargetDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  window.renderColunaDataScreen(_colunaScreenTargetDate);
};

window.onColunaScreenCustomDezenaInput = function(val) {
  _colunaScreenCustomDezena = val;
  updateColunaScreenCustomDezenaOutput(val);
};

function updateColunaScreenCustomDezenaOutput(val) {
  const container = document.getElementById('coluna-screen-custom-dezena-output');
  if (!container) return;

  const d = _currentColunaDataCache || { masterPrefix: '27', invPrefix: '72', d1: 2, d2: 7, d3: 4, d4: 9 };
  const clean = String(val || '').replace(/\D/g, '').slice(0, 2);

  if (clean.length === 0) {
    container.innerHTML = `<span class="text-slate-500 text-xs">Digite uma dezena de 00 a 99 para desdobrar.</span>`;
    return;
  }

  const padded = clean.padStart(2, '0');
  const animal = getAnimalByDezena(padded);
  const animalStr = animal ? `${animal.emoji} ${animal.name} (${String(animal.group).padStart(2, '0')})` : '';

  const goldM = `${d.masterPrefix}${padded}`;
  const invM = `${d.invPrefix}${padded}`;
  const sup1 = `${d.d3}${d.d4}${padded}`;
  const sup2 = `${d.d4}${d.d3}${padded}`;
  const c1 = `${d.d2}${padded}`;
  const c2 = `${d.d1}${padded}`;

  container.innerHTML = `
    <div class="space-y-1.5">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="text-amber-300 font-bold text-sm">Dezena ${padded}</span>
        ${animalStr ? `<span class="text-slate-300 font-semibold text-xs">(${animalStr})</span>` : ''}
        <span class="text-slate-600">•</span>
        <span class="text-slate-300 font-bold">Milhar de Ouro Master:</span>
        <span class="px-2.5 py-0.5 bg-amber-500/25 border border-amber-500/60 rounded-lg text-amber-200 font-mono font-black text-sm">${goldM}</span>
      </div>
      <div class="flex items-center gap-3 flex-wrap text-slate-300 text-xs">
        <div>Inversão: <strong class="font-mono text-amber-200">${invM}</strong></div>
        <span class="text-slate-600">|</span>
        <div>Apoio: <strong class="font-mono text-slate-200">${sup1}, ${sup2}</strong></div>
        <span class="text-slate-600">|</span>
        <div>Centenas: <strong class="font-mono text-indigo-300">${c1}, ${c2}</strong></div>
      </div>
    </div>
    <button type="button" onclick="copyColunaScreenCustomDezenaGames('${padded}', '${goldM}', '${invM}', '${sup1}', '${sup2}', '${c1}', '${c2}')"
      class="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer shrink-0">
      <span>📋</span> <span>Copiar Milhares</span>
    </button>
  `;
}

window.copyColunaScreenCustomDezenaGames = async function(padded, goldM, invM, sup1, sup2, c1, c2) {
  const d = _currentColunaDataCache || { colNumber: 2, masterPrefix: '27' };
  const animal = getAnimalByDezena(padded);
  const animalName = animal ? `${animal.emoji} ${animal.name.toUpperCase()}` : `DEZENA ${padded}`;

  const text = `🎯 BICHO MASTER PRO - DESDOBRAMENTO ${animalName}
Dezena: ${padded} • Prefixo da Data: ${d.masterPrefix}
👑 Milhar de Ouro Master: ${goldM}
🛡️ Milhar Invertida: ${invM}
🛡️ Milhares de Apoio: ${sup1} • ${sup2}
⚡ Centenas: ${c1} • ${c2}
👉 https://bichomasterpro.tech`;

  try {
    await navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') {
      showToast(`Jogos da dezena ${padded} copiados!`, 'success');
    }
  } catch (e) {
    console.warn('Erro ao copiar:', e);
  }
};

window.updateColunaDataHomeCard = async function() {
  // Mantido para compatibilidade retroativa
};

window.copyColunaDataGames = async function() {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Fechamento da Coluna exclusivo para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
  const d = _currentColunaDataCache || await window.getColunaDataInfo();
  if (!d) return;

  const selectedLottery = window._colunaSelectedLottery || window.currentLottery || 'RJ';
  const lotteryLabels = {
    'RJ': 'Rio de Janeiro',
    'ALL': 'Todas as Bancas',
    'SP': 'São Paulo',
    'LOOK': 'Look Goiás',
    'NACIONAL': 'Nacional',
    'BAHIA': 'Bahia',
    'MINAS': 'Minas Gerais',
    'FEDERAL': 'Federal'
  };
  const lotName = lotteryLabels[selectedLottery] || selectedLottery;

  let text = `🎯 BICHO MASTER PRO - COLUNA ${d.colNumber} DA DATA (DIA ${String(d.day).padStart(2, '0')})
👑 Prefixo Mestre: ${d.masterPrefix} (Inversão: ${d.invPrefix})
🎯 Apuração: ${lotName}

`;

  d.animals.forEach(a => {
    const hits = (selectedLottery === 'ALL') ? a.hits : a.hits.filter(h => h.lottery === selectedLottery);
    const isHit = hits.length > 0;
    const hitInfo = isHit ? `[✅ SAIU - ${hits.map(h => (h.slot ? h.slot + ' ' : '') + h.label + ' ' + h.number).join(', ')}]` : '[🔥 PENDENTE]';
    text += `${a.emoji} ${a.name.toUpperCase()} (GRUPO ${String(a.group).padStart(2, '0')}) ${hitInfo}
`;
    text += `Dezenas: ${a.tens.join(', ')}
`;
    text += `Centenas da Data: ${a.centenas.join(' • ')}
`;
    text += `Milhares (MC): ${a.goldMilhares.join(' • ')}

`;
  });

  text += `👉 Confira os fechamentos completos em: https://bichomasterpro.tech`;

  try {
    await navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') {
      showToast('Jogos da Coluna copiados com sucesso!', 'success');
    }
  } catch (e) {
    console.warn('Erro ao copiar:', e);
  }
};

window.copySingleAnimalColunaGames = async function(groupNum) {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Jogos da Coluna exclusivos para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
  const d = _currentColunaDataCache || await window.getColunaDataInfo();
  if (!d) return;
  const a = d.animals.find(an => an.group === groupNum);
  if (!a) return;

  let text = `🎯 BICHO MASTER PRO - ${a.emoji} ${a.name.toUpperCase()} (GRUPO ${String(a.group).padStart(2, '0')})
Dezenas: ${a.tens.join(', ')}
Centenas da Data: ${a.centenas.join(' • ')}
Milhares de Ouro (MC): ${a.goldMilhares.join(' • ')}
Milhares de Apoio: ${a.supportMilhares.join(' • ')}
👉 https://bichomasterpro.tech`;

  try {
    await navigator.clipboard.writeText(text);
    if (typeof showToast === 'function') {
      showToast(`Jogos de ${a.name} copiados!`, 'success');
    }
  } catch (e) {
    console.warn('Erro ao copiar:', e);
  }
};

window.goToColunaDataScreen = function() {
  switchScreen('coluna-data');
};
window.goToPalpitesColuna = function() {
  switchScreen('coluna-data');
};
window.openColunaDataModal = function() {
  switchScreen('coluna-data');
};
window.closeColunaDataModal = function() {
  const m = document.getElementById('modal-coluna-data');
  if (m) m.classList.add('hidden');
};

function updateHomeScreenData() {
  if (typeof window.updateColunaDataHomeCard === "function") window.updateColunaDataHomeCard();
  const tenant = api.getCurrentTenant();
  const userNameEl = document.getElementById('home-user-name');
  const userEmail = (tenant && tenant.email ? tenant.email : '').toLowerCase();
  const userName = (tenant && tenant.name ? tenant.name : '');
  const isMaster = (tenant && tenant.role === 'admin') || userEmail === 'k1qvinicius.cs@gmail.com' || userEmail === 'k1qvinicius@gmail.com' || userName.includes('Vinicius') || userName.includes('Master');

  if (userNameEl) {
    if (isMaster) {
      userNameEl.innerHTML = `Administrador <span class="ml-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold font-sans align-middle shadow-sm">👑 Master</span>`;
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

  // Atualiza o Termômetro da Banca Mais Quente na Home
  if (typeof updateHomeDailyRankingUI === 'function') {
    updateHomeDailyRankingUI();
  }
}

/* ==========================================================================
   TERMÔMETRO DA BANCA MAIS QUENTE DE HOJE (RANKING DIÁRIO DE ACERTOS)
   ========================================================================== */
window.navigateToHottestLottery = function() {
  const lot = window.currentHottestLotteryCode || 'NACIONAL';
  if (typeof window.navigateTo === 'function') {
    window.navigateTo(lot, 'palpites');
  }
};

window.updateHomeDailyRankingUI = async function() {
  const pillsContainer = document.getElementById('home-daily-ranking-pills');
  if (!pillsContainer) return;

  try {
    const res = await fetch(`${API_BASE}/metrics/daily-ranking`);
    if (!res.ok) return;
    const data = await res.json();
    if (!data) return;

    const top = data.top_lottery;
    if (top) {
      window.currentHottestLotteryCode = top.lottery;
      const nameEl = document.getElementById('hottest-lottery-name');
      const btnNameEl = document.getElementById('hottest-lottery-btn-name');
      const emojiEl = document.getElementById('hottest-lottery-emoji');
      const hitsCountEl = document.getElementById('hottest-lottery-hits-count');
      const hitsDescEl = document.getElementById('hottest-lottery-hits-desc');
      const badgeTitleEl = document.getElementById('hottest-card-badge-title');
      const dateBadgeEl = document.getElementById('hottest-card-date-badge');

      if (nameEl) nameEl.textContent = top.name;
      if (btnNameEl) btnNameEl.textContent = top.short_name || top.name;
      if (emojiEl) emojiEl.textContent = top.emoji;
      if (hitsCountEl) hitsCountEl.textContent = `${top.total_hits} ${top.total_hits === 1 ? 'acerto' : 'acertos'}`;
      if (hitsDescEl) {
        if (top.hits_m1 > 0) {
          hitsDescEl.textContent = 'Milhar na Cabeça cravada! 💥';
        } else if (top.hits_c1 > 0) {
          hitsDescEl.textContent = 'Centena no 1º Prêmio 🎯';
        } else if (top.total_hits > 0) {
          hitsDescEl.textContent = 'Assertividade máxima nas extrações';
        } else {
          hitsDescEl.textContent = 'Aguardando próximos resultados';
        }
      }
      if (badgeTitleEl && data.highlight_title) {
        badgeTitleEl.textContent = data.highlight_title;
      }
      if (dateBadgeEl) {
        dateBadgeEl.textContent = data.is_today ? 'Tempo Real' : (data.formatted_date || 'Recente');
      }
    }

    if (Array.isArray(data.ranking) && data.ranking.length > 0) {
      let html = '';
      data.ranking.forEach((item) => {
        const isSelectedTop = item.lottery === (top?.lottery);
        const activeStyles = isSelectedTop
          ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/10'
          : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80';
        const hitColor = item.total_hits > 0 ? 'text-emerald-400 font-extrabold' : 'text-slate-500 font-medium';

        html += `
          <button type="button" onclick="navigateTo('${item.lottery}', 'palpites')"
            class="px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 border transition-all cursor-pointer select-none active:scale-95 shrink-0 ${activeStyles}">
            <span class="text-sm">${item.emoji}</span>
            <span class="text-white">${item.short_name || item.name}</span>
            <span class="${hitColor}">(${item.total_hits})</span>
          </button>
        `;
      });
      pillsContainer.innerHTML = html;
    }
  } catch (err) {
    console.error('Erro ao carregar ranking diário da Home:', err);
  }
};

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
        btn.className = 'px-1.5 py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1 bg-indigo-600 text-white border-indigo-500 shadow-sm cursor-pointer';
      } else {
        btn.className = 'px-1.5 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-slate-200 bg-slate-900/90 border border-slate-800 transition-all flex items-center justify-center gap-1 cursor-pointer';
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
  const today = getLocalDateStr();
  const dateInput = document.getElementById('target-date');
  if (dateInput) {
    dateInput.value = today;
  }
  const cruzDateInput = document.getElementById('cruz-target-date');
  if (cruzDateInput) {
    cruzDateInput.value = today;
  }
}

function getSlotMinutes(slot, dateStr = null) {
  if (!slot) return 9999;
  const code = (slot.code || (typeof slot === 'string' ? slot : '')).toUpperCase().trim();

  if (code === 'FED' || code === 'FEDERAL') {
    const dStr = dateStr || document.getElementById('target-date')?.value || getLocalDateStr();
    if (dStr === '2026-10-03' || dStr === '2026-10-24') return 20 * 60;
    try {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        if (d.getDay() === 0 && dStr !== '2026-10-04' && dStr !== '2026-10-25') {
          return 11 * 60; // Domingo regular 11h
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

function isFederalDrawDate(dateStr) {
  if (!dateStr) return false;
  // Exceções do Calendário de Eleições 2026:
  // 1º Turno: Sábado 03/10 teve Federal; Domingo 04/10 NÃO teve Federal!
  // 2º Turno: Sábado 24/10 terá Federal; Domingo 25/10 NÃO terá Federal!
  if (dateStr === '2026-10-04' || dateStr === '2026-10-25') return false;
  if (dateStr === '2026-10-03' || dateStr === '2026-10-24') return true;

  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const dow = dt.getDay(); // 0 = Domingo, 3 = Quarta
      return dow === 0 || dow === 3;
    }
  } catch (e) {}
  return false;
}

function getFriendlySlotMeta(drawSlotCode, dateStr = null) {
  const code = (drawSlotCode || '').toUpperCase().trim();
  if (code === 'FED' || code === 'FEDERAL') {
    const dStr = dateStr || document.getElementById('target-date')?.value || getLocalDateStr();
    if (dStr === '2026-10-03' || dStr === '2026-10-24') {
      return { code: 'FED', name: 'Federal 20h (Sábado - Eleições) - 20:00', time: '20:00' };
    }
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

    if (isSunday && dStr !== '2026-10-04' && dStr !== '2026-10-25') {
      return { code: 'FED', name: 'Federal 11h (Domingo) - 11:00', time: '11:00' };
    } else if (isWednesday) {
      return { code: 'FED', name: 'Federal 20h (Quarta) - 20:00', time: '20:00' };
    } else {
      return { code: 'FED', name: 'Federal 20h (Quarta) • 11h (Domingo)', time: '20:00' };
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
      'SP-09': { code: 'SP-09', name: 'PT-SP 09h - 09:00', time: '09:00' },
      'SP-10': { code: 'SP-10', name: 'PT-SP 10h - 10:00', time: '10:00' },
      'SP-12': { code: 'SP-12', name: 'PT-SP 12h20 - 12:20', time: '12:20' },
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
  if (code.startsWith('BA-')) {
    const baMetas = {
      'BA-10': { code: 'BA-10', name: 'PT Bahia 10h - 10:00', time: '10:00' },
      'BA-11': { code: 'BA-11', name: 'Federal Bahia 11h - 11:00', time: '11:00' },
      'BA-12': { code: 'BA-12', name: 'PT Bahia 12h - 12:00', time: '12:00' },
      'BA-15': { code: 'BA-15', name: 'PT Bahia 15h - 15:00', time: '15:00' },
      'BA-19': { code: 'BA-19', name: 'PT Bahia 19h - 19:00', time: '19:00' },
      'BA-21': { code: 'BA-21', name: 'Coruja Bahia - 21:00', time: '21:00' },
    };
    if (baMetas[code]) return baMetas[code];
    const h = parseInt(code.replace('BA-', ''), 10);
    const hStr = String(h).padStart(2, '0');
    return { code, name: `PT Bahia ${hStr}h - ${hStr}:00`, time: `${hStr}:00` };
  }
  if (code.startsWith('MG-')) {
    const mgMetas = {
      'MG-12': { code: 'MG-12', name: 'Alvorada 11h - 11:00', time: '11:00' },
      'MG-14': { code: 'MG-14', name: 'Salvação 13h40 - 13:40', time: '13:40' },
      'MG-15': { code: 'MG-15', name: 'Minas Dia 15h - 15:00', time: '15:00' },
      'MG-19': { code: 'MG-19', name: 'Minas Noite 19h - 19:00', time: '19:00' },
      'MG-21': { code: 'MG-21', name: 'Preferida 21h - 21:00', time: '21:00' },
    };
    if (mgMetas[code]) return mgMetas[code];
    const h = parseInt(code.replace('MG-', ''), 10);
    const hStr = String(h).padStart(2, '0');
    return { code, name: `Minas ${hStr}h - ${hStr}:00`, time: `${hStr}:00` };
  }
  return { code, name: drawSlotCode, time: '' };
}

async function initSlotSelector(lottery = currentLottery, preferredSlot = null, forceDate = null) {
  const slotSelect = document.getElementById('target-slot');
  if (!slotSelect) return;

  try {
    const dateInput = document.getElementById('target-date');
    const todayStr = getLocalDateStr();
    if (forceDate && dateInput) {
      dateInput.value = forceDate;
    } else if (dateInput && !dateInput.value) {
      dateInput.value = todayStr;
    }
    const targetDate = (dateInput && dateInput.value) ? dateInput.value : (forceDate || todayStr);
    let slots = [];
    try {
      const rawSlots = await api.getSlots(lottery, targetDate);
      slots = (rawSlots || []).slice();
    } catch (e) {
      console.warn('Falha ao buscar slots via API, usando fallback:', e);
    }

    // Fallback garantido se a API retornar vazio ou falhar
    if (!slots || slots.length === 0) {
      if (lottery === 'FEDERAL') {
        const dStr = targetDate || getLocalDateStr();
        if (dStr === '2026-10-03' || dStr === '2026-10-24') {
          slots = [{ code: 'FED', name: 'Federal 20h (Sábado - Eleições) - 20:00', time: '20:00', order: 1 }];
        } else {
          let dow = new Date().getDay();
          if (targetDate) {
            try {
              const parts = targetDate.split('-');
              if (parts.length === 3) dow = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay();
            } catch (e) {}
          }
          if (dow === 0 && dStr !== '2026-10-04' && dStr !== '2026-10-25') {
            slots = [{ code: 'FED', name: 'Federal 11h (Domingo) - 11:00', time: '11:00', order: 1 }];
          } else {
            slots = [{ code: 'FED', name: 'Federal 20h (Quarta) - 20:00', time: '20:00', order: 1 }];
          }
        }
      } else if (lottery === 'BAHIA') {
        const now = new Date();
        let dow = now.getDay();
        if (targetDate) {
          try {
            const parts = targetDate.split('-');
            if (parts.length === 3) dow = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay();
          } catch (e) {}
        }
        if (dow === 0) {
          slots = [
            { code: 'BA-10', name: 'PT Bahia 10h - 10:00', time: '10:00', order: 1 },
            { code: 'BA-11', name: 'Federal Bahia 11h - 11:00', time: '11:00', order: 2 },
            { code: 'BA-12', name: 'PT Bahia 12h - 12:00', time: '12:00', order: 3 },
            { code: 'BA-15', name: 'PT Bahia 15h - 15:00', time: '15:00', order: 4 },
          ];
        } else {
          slots = [
            { code: 'BA-10', name: 'PT Bahia 10h - 10:00', time: '10:00', order: 1 },
            { code: 'BA-12', name: 'PT Bahia 12h - 12:00', time: '12:00', order: 2 },
            { code: 'BA-15', name: 'PT Bahia 15h - 15:00', time: '15:00', order: 3 },
            { code: 'BA-19', name: 'PT Bahia 19h - 19:00', time: '19:00', order: 4 },
            { code: 'BA-21', name: 'Coruja Bahia - 21:00', time: '21:00', order: 5 },
          ];
        }
      } else if (lottery === 'MINAS') {
        const now = new Date();
        let dow = now.getDay();
        if (targetDate) {
          try {
            const parts = targetDate.split('-');
            if (parts.length === 3) dow = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay();
          } catch (e) {}
        }
        if (dow === 0) {
          slots = [
            { code: 'MG-14', name: 'Salvação 13h40 - 13:40', time: '13:40', order: 1 },
          ];
        } else {
          slots = [
            { code: 'MG-12', name: 'Alvorada 11h - 11:00', time: '11:00', order: 1 },
            { code: 'MG-15', name: 'Minas Dia 15h - 15:00', time: '15:00', order: 2 },
            { code: 'MG-19', name: 'Minas Noite 19h - 19:00', time: '19:00', order: 3 },
            { code: 'MG-21', name: 'Preferida 21h - 21:00', time: '21:00', order: 4 },
          ];
        }
      } else if (lottery === 'SP') {
        slots = [
          { code: 'SP-08', name: 'PT-SP 08h20 - 08:20', time: '08:20', order: 1 },
          { code: 'SP-10', name: 'PT-SP 10h - 10:00', time: '10:00', order: 2 },
          { code: 'SP-12', name: 'PT-SP 12h20 - 12:20', time: '12:20', order: 3 },
          { code: 'SP-13', name: 'PT-SP 13h - 13:00', time: '13:00', order: 4 },
          { code: 'SP-15', name: 'BAND-SP 15h30 - 15:30', time: '15:30', order: 5 },
          { code: 'SP-17', name: 'PT-SP 17h - 17:00', time: '17:00', order: 6 },
          { code: 'SP-19', name: 'PT-SP 19h - 19:00', time: '19:00', order: 7 },
          { code: 'SP-20', name: 'PTN-SP 20h - 20:00', time: '20:00', order: 8 },
        ];
      } else {
        slots = [
          { code: 'PPT', name: 'PPT - 09:20', time: '09:20' },
          { code: 'PTM', name: 'PTM - 11:20', time: '11:20' },
          { code: 'PT', name: 'PT - 14:20', time: '14:20' },
          { code: 'PTV', name: 'PTV - 16:20', time: '16:20' },
          { code: 'PTN', name: 'PTN - 18:20', time: '18:20' },
          { code: 'COR', name: 'Coruja - 21:20', time: '21:20' }
        ];
      }
    }

    // Isolamento estrito de praças: Federal NUNCA recebe slots do RJ e outras praças NUNCA recebem FED
    if (lottery === 'FEDERAL') {
      slots = slots.filter(s => s.code === 'FED');
      if (slots.length === 0) {
        slots = [{ code: 'FED', name: 'Federal 20h (Quarta e Sábado) - 20:00', time: '20:00', order: 1 }];
      }
    } else {
      slots = slots.filter(s => s.code !== 'FED');
    }

    slots.sort((a, b) => getSlotMinutes(a, targetDate) - getSlotMinutes(b, targetDate));
    standardSlotsList = slots;
    slotSelect.innerHTML = '';

    if (!slots || slots.length === 0) {
      renderSlotPillsUI([], null);
      return;
    }

    // Determina horário alvo automático com precisão em tempo real
    const now = new Date();
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

    // Se houver preferredSlot explícito e pertencer a esta banca
    if (preferredSlot && slots.some(s => s.code === preferredSlot)) {
      defaultSlot = preferredSlot;
    } else if (window._userSelectedSlot && slots.some(s => s.code === window._userSelectedSlot)) {
      defaultSlot = window._userSelectedSlot;
    } else if (isToday) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      // Encontra o PRÓXIMO SORTEIO: não apurado hoje e cujo horário é o próximo a correr
      const upcomingSlot = slots.find(s => {
        const isDrawn = drawnCodes.has(s.code.toUpperCase());
        if (isDrawn) return false;
        const sMin = getSlotMinutes(s, todayStr);
        return sMin >= (currentMinutes - 10);
      });

      if (upcomingSlot) {
        defaultSlot = upcomingSlot.code;
      } else {
        const anyPending = slots.find(s => !drawnCodes.has(s.code.toUpperCase()));
        if (anyPending) {
          defaultSlot = anyPending.code;
        } else {
          defaultSlot = slots[slots.length - 1].code;
        }
      }
    }
    window._userSelectedSlot = defaultSlot;

    slots.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.code;
      opt.textContent = `${s.name}`;
      if (s.code === defaultSlot) opt.selected = true;
      slotSelect.appendChild(opt);
    });

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

    const headerSlotName = document.getElementById('header-slot-name');
    if (headerSlotName && selectedOpt) {
      headerSlotName.textContent = selectedOpt.textContent;
    }

    renderSlotPillsUI(slots, defaultSlot);
  } catch (err) {
    console.error('Erro ao inicializar horários:', err);
    if (lottery === 'FEDERAL') {
      const fallbackFed = [{ code: 'FED', name: 'Federal 20h (Oficial Caixa)', time: '20:00' }];
      renderSlotPillsUI(fallbackFed, 'FED');
    }
  }
}

window.initSlotSelector = initSlotSelector;

/* ==========================================================================
   MONITOR EM TEMPO REAL: DETECÇÃO INSTANTÂNEA DE NOVAS APURAÇÕES
   ========================================================================== */
let _lastKnownDrawId = null;
let _resultsMonitorInterval = null;

function startInstantResultsMonitor() {
  if (_resultsMonitorInterval) return;

  // Monitora novos resultados de forma leve a cada 45 segundos, sem travar o app
  _resultsMonitorInterval = setInterval(async () => {
    try {
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

        // 3. Atualiza o seletor de horários
        if (!window._userSelectedSlot) {
          await initSlotSelector(currentLottery);
          if (api.isLoggedIn()) {
            await loadPrediction(true);
          }
        } else {
          if (api.isLoggedIn()) {
            await loadPrediction(true);
          }
        }

        // 4. Se puxadas estiver aberto, atualiza
        const viewPuxadas = document.getElementById('view-puxadas');
        if (viewPuxadas && !viewPuxadas.classList.contains('hidden')) {
          await loadPuxadasModalContent(null, true);
        }

        // 5. Atualiza dados na Home
        updateHomeScreenData();

        // 6. Notifica o usuário
        const p1 = latest.prize_1 || '----';
        const animalInfo = latest.animal ? `(${latest.animal.toUpperCase()})` : '';
        showToast(`⚡ Novo resultado apurado: ${latest.slot} - ${p1} ${animalInfo}! Palpites atualizados.`, 'success');
      }
    } catch (e) {
      // Silencioso em caso de oscilação momentânea de rede
    }
  }, 45000);
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
  window._userSelectedSlot = slotCode; // Crava o horário selecionado pelo usuário
  const slotSelect = document.getElementById('target-slot');
  if (slotSelect) {
    let selectedOpt = Array.from(slotSelect.options).find(o => o.value === slotCode);
    if (!selectedOpt) {
      selectedOpt = document.createElement('option');
      selectedOpt.value = slotCode;
      selectedOpt.textContent = slotCode;
      slotSelect.appendChild(selectedOpt);
    }
    slotSelect.value = slotCode;
    selectedOpt.selected = true;

    const homeNextSlot = document.getElementById('home-next-slot-name');
    if (homeNextSlot && selectedOpt) {
      homeNextSlot.textContent = selectedOpt.textContent;
    }

    const currentSlotName = document.getElementById('current-slot-name');
    if (currentSlotName && selectedOpt) {
      currentSlotName.textContent = selectedOpt.textContent;
    }

    const headerSlotName = document.getElementById('header-slot-name');
    if (headerSlotName && selectedOpt) {
      headerSlotName.textContent = selectedOpt.textContent;
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
      btn.className = 'slot-pill-btn px-2.5 py-1 rounded-lg text-[11px] font-black transition-all bg-[#00e676] text-slate-950 border border-[#00e676] shadow-sm shadow-[#00e676]/20 cursor-pointer flex items-center gap-1';
    } else {
      btn.className = 'slot-pill-btn px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all bg-slate-950/80 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 cursor-pointer flex items-center gap-1';
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
    btn.setAttribute('data-slot-code', s.code);
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
    'FEDERAL': 'Loteria Federal',
    'BAHIA': 'Bahia (Paratodos)',
    'MINAS': 'Minas Gerais'
  };
  const pureNames = {
    'RJ': 'Rio de Janeiro',
    'LOOK': 'Look',
    'NACIONAL': 'Loteria Nacional',
    'SP': 'São Paulo',
    'FEDERAL': 'Loteria Federal',
    'BAHIA': 'Bahia',
    'MINAS': 'Minas Gerais'
  };
  const lotIcons = {
    'RJ': '🌴',
    'LOOK': '🌾',
    'NACIONAL': '🇧🇷',
    'SP': '🏙️',
    'FEDERAL': '🏛️',
    'BAHIA': '☀️',
    'MINAS': '🔺'
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
  if (lotteryCode) {
    window._userSelectedSlot = null; // Sempre limpa seleção manual anterior para buscar o PRÓXIMO SORTEIO
    await switchLottery(lotteryCode.toUpperCase(), true);
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

  if (screenName === 'coluna-data') {
    const colBtn = document.getElementById('sidebar-btn-coluna-data');
    if (colBtn) colBtn.classList.add('sidebar-item-active');
  } else if (screenName === 'home') {
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
  } else if (screenName === 'matriz') {
    const matrizBtn = document.getElementById('sidebar-btn-matriz');
    if (matrizBtn) matrizBtn.classList.add('sidebar-item-active');
  } else if (lotteryCode && screenName) {
    window.toggleLotteryAccordion(lotteryCode, true);
    const subBtn = document.getElementById(`subnav-${lotteryCode}-${screenName}`);
    if (subBtn) subBtn.classList.add('subitem-btn-active');
  }

  const screenTitles = {
    'home': 'Visão Geral',
    'palpites': 'Jogos Prontos',
    'coluna-data': 'Coluna da Data (Fechamento Diário)',
    'centena-master': 'Centena Master',
    'matriz': 'Chave Mestra (Matriz 3x3)',
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

window.switchLottery = async function(lotteryCode, force = false) {
  if (!lotteryCode) return;
  const targetLot = lotteryCode.toUpperCase();

  // Garante que a data ao trocar de banca seja SEMPRE a data de HOJE
  const dateInput = document.getElementById('target-date');
  if (dateInput) {
    dateInput.value = getLocalDateStr();
  }

  // Verifica se o estado visual das pílulas de horário bate com a loteria desejada
  const firstPill = document.querySelector('#lottery-slots-pills .slot-pill-btn');
  const pillSlot = firstPill ? firstPill.getAttribute('data-slot') : null;
  const hasMismatch = !firstPill || !doesSlotBelongToLottery(pillSlot, targetLot);

  if (!force && !hasMismatch && targetLot === currentLottery) {
    return;
  }
  window._userSelectedSlot = null; // Reseta seleção cravada ao mudar de banca para buscar o PRÓXIMO SORTEIO
  currentLottery = targetLot;
  window.currentLottery = targetLot;
  localStorage.setItem('bicho_active_lottery', targetLot);
  _lastKnownDrawId = null; // Reseta cache de ID para evitar falsos alertas de novo sorteio ao trocar de banca
  updateLotteryButtonsUI();

  // ATUALIZAÇÃO INSTANTÂNEA: Renderiza imediatamente o slot da Federal para que o usuário veja a mudança sem delay
  if (lotteryCode === 'FEDERAL') {
    const isSun = new Date().getDay() === 0;
    const fedSlotMeta = isSun
      ? { code: 'FED', name: 'Federal 11h (Domingo) - 11:00', time: '11:00' }
      : { code: 'FED', name: 'Federal 20h (Quarta e Sábado) - 20:00', time: '20:00' };
    standardSlotsList = [fedSlotMeta];
    const slotSelect = document.getElementById('target-slot');
    if (slotSelect) {
      slotSelect.innerHTML = `<option value="FED" selected>${fedSlotMeta.name}</option>`;
      slotSelect.value = 'FED';
    }
    const headerSlotName = document.getElementById('header-slot-name');
    if (headerSlotName) headerSlotName.textContent = fedSlotMeta.name;
    const homeNextSlot = document.getElementById('home-next-slot-name');
    if (homeNextSlot) homeNextSlot.textContent = fedSlotMeta.name;
    renderSlotPillsUI([fedSlotMeta], 'FED');
  }

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
    'FEDERAL': 'Federal',
    'BAHIA': 'Bahia',
    'MINAS': 'Minas Gerais'
  };
  showToast(`Loteria alterada para ${lotLabels[lotteryCode] || lotteryCode}!`, 'info');
};


window.stepTargetDate = async function(days) {
  const dateInput = document.getElementById('target-date');
  if (!dateInput) return;
  const currentVal = dateInput.value || getLocalDateStr();
  const parts = currentVal.split('-');
  if (parts.length === 3) {
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    d.setDate(d.getDate() + days);
    const newDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dateInput.value = newDateStr;
    showToast(`Carregando análise e palpites de ${newDateStr.split('-').reverse().join('/')}...`, 'info');
    await initSlotSelector(currentLottery, null, newDateStr);
    await loadPrediction(true);
    await loadDrawResults();
    updateHomeScreenData();
  }
};

function setupEventListeners() {
  const btnRefresh = document.getElementById('btn-refresh');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      btnRefresh.classList.add('animate-spin');
      try {
        const dateVal = document.getElementById('target-date')?.value || getLocalDateStr();
        showToast(`Recalculando palpites de ${dateVal.split('-').reverse().join('/')}...`, 'info');
        try {
          await fetch(`${API_BASE}/results/sync-web?lottery=${currentLottery}`, { method: 'POST' });
        } catch (e) {}
        await initSlotSelector(currentLottery, null, dateVal);
        await Promise.all([loadPrediction(true), loadDrawResults()]);
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
      window._userSelectedSlot = slotSelect.value;
      updateSlotPillsUI(slotSelect.value);
      loadPrediction();
      loadDrawResults();
      updateHomeScreenData();
    });
  }

  const dateInput = document.getElementById('target-date');
  if (dateInput) {
    dateInput.addEventListener('change', async () => {
      const chosenDate = dateInput.value;
      if (!chosenDate) return;
      showToast(`Carregando análise e palpites de ${chosenDate.split('-').reverse().join('/')}...`, 'info');
      await initSlotSelector(currentLottery, null, chosenDate);
      await loadPrediction(true);
      await loadDrawResults();
      updateHomeScreenData();
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
  // Desativado loop pesado em background para manter o app ultraleve e sem travamento
  return;
}

async function loadPrediction(forceRefresh = false) {
  if (!api.isLoggedIn()) return;
  const loadingEl = document.getElementById('loading-state');
  const contentEl = document.getElementById('content-state');
  const dateVal = document.getElementById('target-date')?.value || '';
  let slotVal = document.getElementById('target-slot')?.value || '';
  if (currentLottery === 'FEDERAL' && (!slotVal || slotVal !== 'FED')) {
    slotVal = 'FED';
    const targetSlotEl = document.getElementById('target-slot');
    if (targetSlotEl) targetSlotEl.value = 'FED';
  }
  const cacheKey = getPredictionCacheKey(currentLottery, dateVal, slotVal, currentStrategy);

  // 1. Resposta INSTANTÂNEA via Cache (0ms - sem travar a tela)
  if (!forceRefresh && _predictionCache.has(cacheKey)) {
    currentPrediction = _predictionCache.get(cacheKey);
    renderDashboard(currentPrediction);
    if (contentEl) // contentEl non-blocking
    if (loadingEl) loadingEl.classList.add('hidden');
    prefetchAdjacentSlots(currentLottery, slotVal);
    return;
  }

  const reqSeq = ++_activePredictionReqSeq;

  // Feedback visual imediato: esmaece o dashboard e bloqueia cliques duplicados durante a consulta
  if (contentEl) {
    // contentEl non-blocking
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
      const msg = err && err.message ? err.message : '';
      if (msg.includes('TRIAL_EXPIRED') || msg.includes('período de teste') || msg.includes('encerrou') || msg.includes('expirou')) {
        // Modo degustação: não interrompe a tela com modal invasivo
      } else if (msg.includes('não autorizado') || msg.includes('login') || msg.includes('Chave')) {
        showToast('Sua sessão expirou. Faça login para continuar.', 'warning');
      } else {
        showToast('Erro ao carregar análise: ' + msg, 'error');
      }
    }
  } finally {
    if (loadingEl) loadingEl.classList.add('hidden');
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
  const today = getLocalDateStr();

  let dateVal = forceDate;
  if (!dateVal && cruzDateInput && cruzDateInput.value) {
    dateVal = cruzDateInput.value;
  }
  if (!dateVal) {
    dateVal = today;
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

      const isVip = window.isUserVip();
      let milharesBichoHtml = '';
      let centenasBichoHtml = '';

      if (!isVip) {
        milharesBichoHtml = `
          <div onclick="openPlansModal()" class="w-full p-2.5 rounded-xl bg-slate-950/80 border border-amber-500/40 text-center cursor-pointer group hover:border-amber-400 transition-all select-none">
            <span class="text-xs font-bold text-amber-300">🔒 Milhares da Cruz do Dia (Exclusivo VIP)</span>
            <span class="block text-[10px] text-slate-400 mt-0.5">Toque para desbloquear no Plano Mensal (R$ 14,90)</span>
          </div>
        `;
        centenasBichoHtml = `
          <div onclick="openPlansModal()" class="w-full p-2 rounded-xl bg-slate-950/80 border border-amber-500/40 text-center cursor-pointer group hover:border-amber-400 transition-all select-none">
            <span class="text-xs font-bold text-amber-300">🔒 Centenas da Cruz do Dia (Exclusivo VIP)</span>
          </div>
        `;
      } else {
        milharesBichoHtml = (b.thousands || []).map(m => `
          <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')"
            title="Clique para copiar a milhar ${m}"
            class="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 border border-amber-500/40 hover:border-amber-400 text-amber-200 hover:text-amber-100 font-mono text-xs font-black transition-all cursor-pointer shadow-sm hover:scale-105 active:scale-95">
            ${m}
          </button>
        `).join(' ');

        centenasBichoHtml = (b.hundreds || []).map(c => `
          <button type="button" onclick="copySingleNumber(event, '${c}', 'Centena')"
            title="Clique para copiar a centena ${c}"
            class="px-2 py-0.5 rounded-lg bg-slate-800/90 hover:bg-amber-950/60 border border-slate-700/80 hover:border-amber-500/50 text-slate-200 hover:text-amber-200 font-mono text-xs font-bold transition-all cursor-pointer hover:scale-105 active:scale-95">
            ${c}
          </button>
        `).join(' ');
      }

      bichoContent.innerHTML = `
        <div class="flex items-center gap-2.5">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0 shadow-inner">
            ${b.emoji}
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <h4 class="font-black text-white text-sm tracking-wide">${b.animal.toUpperCase()}</h4>
              <span class="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded">Grupo ${String(b.group).padStart(2, '0')}</span>
              <span class="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/50">Dez. ${b.tens.join(', ')}</span>
            </div>
            <p class="text-[10px] text-amber-300/80 mt-0.5 font-medium leading-tight">Regente principal da data extraído pela numerologia da Cruz</p>
          </div>
        </div>

        <!-- Milhares Quentes do Bicho do Dia -->
        <div class="space-y-1 pt-0.5">
          <div class="flex items-center justify-between text-[10px]">
            <span class="font-bold text-amber-300 flex items-center gap-1">
              <span>🔥</span> <span>MILHARES QUENTES</span>
            </span>
            <span class="text-[10px] text-slate-400">Toque para copiar</span>
          </div>
          <div class="flex items-center gap-1 flex-wrap">
            ${milharesBichoHtml}
          </div>
        </div>

        <!-- Centenas Quentes do Bicho do Dia -->
        <div class="space-y-1 pt-0.5">
          <div class="flex items-center justify-between text-[10px]">
            <span class="font-bold text-amber-400/90 flex items-center gap-1">
              <span>💎</span> <span>CENTENAS QUENTES</span>
            </span>
            <button type="button" onclick="copyCategoryList(this, '${(b.hundreds || []).join(', ')}', 'Centenas de ${b.animal}')"
              class="text-[10px] text-amber-300 hover:text-amber-200 underline cursor-pointer">
              Copiar Centenas
            </button>
          </div>
          <div class="flex items-center gap-1 flex-wrap">
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
            class="px-1.5 py-0.5 rounded-lg bg-cyan-950/70 border border-cyan-800/60 hover:border-cyan-400 text-cyan-200 font-mono text-[11px] font-bold transition-all cursor-pointer hover:scale-105 active:scale-95 shadow-sm">
            ${m}
          </button>
        `).join(' ');

        return `
          <div class="p-2.5 sm:p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 hover:border-cyan-500/40 transition-all flex flex-col justify-between space-y-2 shadow-sm">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <span class="w-8 h-8 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-xl shrink-0">${anim.emoji}</span>
                <div class="min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs font-black text-white uppercase">${anim.animal}</span>
                    <span class="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1 py-0.5 rounded">G${String(anim.group).padStart(2, '0')}</span>
                  </div>
                  <div class="flex items-center gap-1 mt-0.5">
                    <span class="text-[9px] uppercase font-bold text-slate-500">Dez:</span>
                    <span class="text-[10px] font-mono font-bold text-cyan-300">${anim.tens.join(', ')}</span>
                  </div>
                </div>
              </div>
              <button type="button" onclick="copyCategoryList(this, '${anim.thousands.join(', ')}', 'Milhares de ${anim.animal}')"
                class="px-2 py-1 rounded-lg bg-slate-800 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-cyan-300 text-[10px] font-bold transition-all shrink-0 cursor-pointer active:scale-95 shadow-sm flex items-center gap-1" title="Copiar milhares de ${anim.animal}">
                <span>📋</span> <span>Copiar</span>
              </button>
            </div>
            <div class="pt-1.5 border-t border-slate-800/80">
              <div class="flex items-center gap-1 flex-wrap">
                ${milharesHtml}
              </div>
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
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Milhares da Cruz exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
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
  const isVip = window.isUserVip ? window.isUserVip() : false;

  const ternoChipHtml = isVip
    ? `
      <span class="font-bold text-amber-200">${g0.animal_emoji || '🐾'} ${g0.value}</span>
      <span class="text-slate-600">+</span>
      <span class="font-bold text-amber-200">${g1.animal_emoji || '🐾'} ${g1.value}</span>
      <span class="text-slate-600">+</span>
      <span class="font-bold text-amber-200">${g2.animal_emoji || '🐾'} ${g2.value}</span>
    `
    : `
      <span class="font-bold text-amber-200">${g0.animal_emoji || '🐾'} ${g0.value}</span>
      <span class="text-slate-600">+</span>
      <span onclick="openPlansModal()" class="cursor-pointer font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5"><span>🔒</span> VIP</span>
      <span class="text-slate-600">+</span>
      <span onclick="openPlansModal()" class="cursor-pointer font-bold text-amber-400 hover:text-amber-300 inline-flex items-center gap-0.5"><span>🔒</span> VIP</span>
    `;

  const passesChipHtml = isVip
    ? `
      <span class="font-mono text-indigo-200 font-bold">${g0.value}+${g1.value}</span>
      <span class="text-slate-600">•</span>
      <span class="font-mono text-indigo-200 font-bold">${g0.value}+${g2.value}</span>
      <span class="text-slate-600">•</span>
      <span class="font-mono text-indigo-200 font-bold">${g1.value}+${g2.value}</span>
    `
    : `
      <span class="font-mono text-indigo-200 font-bold">${g0.value}+🔒</span>
      <span class="text-slate-600">•</span>
      <span class="font-mono text-indigo-200 font-bold">${g0.value}+🔒</span>
      <span class="text-slate-600">•</span>
      <span class="font-mono text-slate-500 font-bold">🔒+🔒</span>
    `;

  const ternoGridHtml = isVip
    ? `
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
    `
    : `
      <div class="grid grid-cols-3 gap-1.5 text-center my-1">
        <div class="p-1.5 rounded-lg bg-slate-900/90 border border-emerald-500/40 flex flex-col items-center justify-center">
          <span class="text-xl mb-0.5">${g0.animal_emoji || '🐾'}</span>
          <span class="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Gr. ${g0.value}</span>
          <span class="text-xs font-black text-white truncate w-full">${g0.animal_name}</span>
        </div>
        <div onclick="openPlansModal()" class="p-1.5 rounded-lg bg-slate-900/90 border border-amber-500/40 flex flex-col items-center justify-center cursor-pointer group hover:border-amber-400 transition-all">
          <span class="text-xl mb-0.5 group-hover:scale-110 transition-transform">🔒</span>
          <span class="text-[9px] text-amber-400 font-bold uppercase tracking-wider">Gr. ??</span>
          <span class="text-[10px] font-black text-amber-300 truncate w-full group-hover:underline">Bicho VIP</span>
        </div>
        <div onclick="openPlansModal()" class="p-1.5 rounded-lg bg-slate-900/90 border border-amber-500/40 flex flex-col items-center justify-center cursor-pointer group hover:border-amber-400 transition-all">
          <span class="text-xl mb-0.5 group-hover:scale-110 transition-transform">🔒</span>
          <span class="text-[9px] text-amber-400 font-bold uppercase tracking-wider">Gr. ??</span>
          <span class="text-[10px] font-black text-amber-300 truncate w-full group-hover:underline">Bicho VIP</span>
        </div>
      </div>
      <button type="button" onclick="openPlansModal()" class="w-full mt-1.5 py-1 px-2 rounded-lg bg-gradient-to-r from-amber-500/25 to-amber-600/35 hover:from-amber-500/40 hover:to-amber-600/50 border border-amber-500/50 text-amber-200 text-[10px] font-black flex items-center justify-center gap-1 cursor-pointer transition-all">
        <span>👑</span> <span>Liberar Terno Completo (R$ 14,90/mês)</span>
      </button>
    `;

  const passesGridHtml = isVip
    ? `
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
    `
    : `
      <div onclick="openPlansModal()" class="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/50 flex items-center justify-between text-xs cursor-pointer group transition-all">
        <div class="flex items-center gap-1.5">
          <span class="text-sm">${g0.animal_emoji || '🐾'} 🔒</span>
          <span class="font-bold text-slate-200">${g0.animal_name} + <span class="text-amber-300 group-hover:underline">Bicho VIP</span></span>
          <span class="text-[10px] font-mono text-indigo-300">(Gr. ${g0.value}+🔒)</span>
        </div>
        <span class="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">Top 1</span>
      </div>

      <div onclick="openPlansModal()" class="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/50 flex items-center justify-between text-xs cursor-pointer group transition-all">
        <div class="flex items-center gap-1.5">
          <span class="text-sm">${g0.animal_emoji || '🐾'} 🔒</span>
          <span class="font-bold text-slate-200">${g0.animal_name} + <span class="text-amber-300 group-hover:underline">Bicho VIP</span></span>
          <span class="text-[10px] font-mono text-indigo-300">(Gr. ${g0.value}+🔒)</span>
        </div>
        <span class="text-[9px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">Top 2</span>
      </div>

      <div onclick="openPlansModal()" class="p-1.5 rounded-lg bg-slate-900/90 border border-slate-800/80 hover:border-indigo-500/50 flex items-center justify-between text-xs cursor-pointer group transition-all">
        <div class="flex items-center gap-1.5">
          <span class="text-sm">🔒 🔒</span>
          <span class="font-bold text-slate-400"><span class="text-amber-300 group-hover:underline">Bicho VIP</span> + <span class="text-amber-300 group-hover:underline">Bicho VIP</span></span>
          <span class="text-[10px] font-mono text-slate-500">(Gr. 🔒+🔒)</span>
        </div>
        <span class="text-[9px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded">Top 3</span>
      </div>
      <button type="button" onclick="openPlansModal()" class="w-full mt-1.5 py-1 px-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-200 text-[10px] font-black flex items-center justify-center gap-1 cursor-pointer transition-all">
        <span>👑</span> <span>Liberar Todos os Passes (R$ 14,90/mês)</span>
      </button>
    `;

  return `
    <div class="card-glass p-2 sm:p-2.5 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-slate-900/90 to-indigo-950/40 shadow-sm animate-fade-in mb-2">
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
              ${ternoChipHtml}
            </div>

            <!-- Resumo Passes em Chips Compactos -->
            <div class="hidden sm:inline-flex items-center gap-1 bg-slate-950/90 px-2 py-0.5 rounded-lg border border-indigo-500/25 text-[11px]">
              <span class="text-slate-400 font-bold text-[10px]">Passes:</span>
              ${passesChipHtml}
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
            
            ${ternoGridHtml}

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
              ${passesGridHtml}
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
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Jogos Prontos exclusivos para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
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
    const activeLot = (data.lottery || currentLottery || window.currentLottery || localStorage.getItem('bicho_active_lottery') || 'RJ').toUpperCase();
    window.loadAndRenderPatternBreaksHistory(activeLot);
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

  const isVip = window.isUserVip ? window.isUserVip() : false;
  const allTens = data.top_tens || [];
  const allHundreds = data.top_hundreds || [];
  const allThousands = data.top_thousands || [];

  container.innerHTML = topGroups.map((g, idx) => {
    // Para nao-assinantes: Mostra o Bicho #1 liberado (degustacao) e os demais com CADEADO!
    if (!isVip && idx > 0) {
      return `
        <div onclick="openPlansModal()" class="card-glass p-3 sm:p-4 rounded-xl border border-amber-500/40 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/20 hover:border-amber-400 text-left space-y-2 cursor-pointer group transition-all relative overflow-hidden shadow-lg animate-fade-in">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl flex items-center justify-center text-xl bg-amber-500/20 border border-amber-500/50 text-amber-300 group-hover:scale-110 group-hover:rotate-6 transition-transform shadow-inner shrink-0">
                🔒
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">#${idx + 1}</span>
                  <h3 class="font-bold text-xs sm:text-sm text-white flex items-center gap-1.5">
                    <span>Palpite VIP #${idx + 1}</span>
                    <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30">Cadeado Ativo</span>
                  </h3>
                </div>
                <p class="text-[11px] text-slate-400 mt-0.5">Bicho complementar com Dezenas, Centenas e Milhares filtradas pela inteligência.</p>
              </div>
            </div>
            <button type="button" class="shrink-0 px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-md group-hover:brightness-110 transition-all flex items-center gap-1 cursor-pointer">
              <span>👑</span> <span>Liberar (R$ 14,90)</span>
            </button>
          </div>
        </div>
      `;
    }

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
    animalHundreds = Array.from(new Set(animalHundreds));
    const visibleHundreds = animalHundreds.slice(0, 4);
    const extraHundreds = animalHundreds.slice(4);

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
    animalThousands = Array.from(new Set(animalThousands));
    const visibleThousands = animalThousands.slice(0, 4);
    const extraThousands = animalThousands.slice(4);

    const tensHtml = animalTens.length > 0
      ? animalTens.map(t => `<button type="button" onclick="copySingleNumber(event, '${t}', 'Dezena')" title="Clique para copiar a dezena ${t}" class="px-2 py-0.5 rounded bg-indigo-950/80 border border-indigo-700/60 hover:border-indigo-400 text-indigo-200 font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">${t}</button>`).join(' ')
      : '<span class="text-xs text-slate-500">-</span>';

    const makeHundredBtn = (h) => {
      const isMatrizCentena = matrizCentenas.includes(h);
      const isAuditedHit = window._targetHitCentena && (h === window._targetHitCentena || h.endsWith(window._targetHitCentena));
      let btnCls = isMatrizCentena
        ? 'bg-amber-950/90 border border-amber-500/80 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/30'
        : 'bg-cyan-950/80 border border-cyan-700/60 hover:border-cyan-400 text-cyan-200';
      if (isAuditedHit) {
        btnCls = 'audited-hit-hundred bg-emerald-600 text-white border-2 border-yellow-300 shadow-[0_0_16px_rgba(16,185,129,0.9)] ring-2 ring-yellow-400 font-black animate-pulse scale-105';
      }
      return `<button type="button" onclick="copySingleNumber(event, '${h}', 'Centena')" title="Clique para copiar a centena ${h}${isMatrizCentena ? ' (⚡ Chave Mestra)' : ''}${isAuditedHit ? ' 🎯 ACERTO AUDITADO!' : ''}" class="px-2 py-0.5 rounded ${btnCls} font-mono font-bold text-xs shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer relative">${h}${isMatrizCentena ? '<span class="text-[9px] text-amber-300 ml-0.5" title="Chave Mestra">⚡</span>' : ''}${isAuditedHit ? '<span class="text-[9px] text-yellow-300 ml-1 font-black">🎯 BATEU!</span>' : ''}</button>`;
    };

    const hasHitInExtraHundreds = extraHundreds.some(h => window._targetHitCentena && (h === window._targetHitCentena || h.endsWith(window._targetHitCentena)));
    let hundredsHtml = visibleHundreds.map(makeHundredBtn).join(' ');
    if (extraHundreds.length > 0) {
      hundredsHtml += ` <span id="extra-hundreds-${idx}" class="${hasHitInExtraHundreds ? '' : 'hidden'} inline-flex items-center gap-1 flex-wrap">${extraHundreds.map(makeHundredBtn).join(' ')}</span>
      <button type="button" onclick="toggleExtraGroupNumbers('extra-hundreds-${idx}', this, ${extraHundreds.length})" class="px-1.5 py-0.5 rounded-md bg-cyan-900/60 hover:bg-cyan-800 border border-cyan-600/60 text-cyan-300 font-bold text-[11px] shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-0.5">
        <span>${hasHitInExtraHundreds ? '▲ recolher' : `+${extraHundreds.length} mais`}</span>
      </button>`;
    }
    if (!hundredsHtml) hundredsHtml = '<span class="text-xs text-slate-500">-</span>';

    const makeThousandBtn = (m) => {
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
    };

    let thousandsHtml = visibleThousands.map(makeThousandBtn).join(' ');
    if (extraThousands.length > 0) {
      thousandsHtml += ` <span id="extra-thousands-${idx}" class="hidden inline-flex items-center gap-1 flex-wrap">${extraThousands.map(makeThousandBtn).join(' ')}</span>
      <button type="button" onclick="toggleExtraGroupNumbers('extra-thousands-${idx}', this, ${extraThousands.length})" class="px-1.5 py-0.5 rounded-md bg-amber-900/60 hover:bg-amber-800 border border-amber-600/60 text-amber-300 font-bold text-[11px] shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer inline-flex items-center gap-0.5">
        <span>+${extraThousands.length} mais</span>
      </button>`;
    }
    if (!thousandsHtml) thousandsHtml = '<span class="text-xs text-slate-500">-</span>';

    const tensStr = animalTens.join(', ');
    const hundredsStr = animalHundreds.join(', ');
    const thousandsStr = animalThousands.join(', ');

    // Badges rápidos de convergência (máximo 2 mais importantes)
    const quickBadges = (therm.badges || []).slice(0, 2).map(b => `
      <span class="hidden md:inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${b.color}">
        ${b.icon} ${b.label}
      </span>
    `).join(' ');

    const isWinningGroup = window._targetHitGroup && (parseInt(window._targetHitGroup, 10) === grpNum);
    return `
      <div id="animal-card-${grpNum}" class="card-glass p-2 sm:p-2.5 rounded-xl border ${isWinningGroup ? 'border-amber-500/90 shadow-[0_0_14px_rgba(245,158,11,0.25)] ring-1 ring-amber-400/40' : 'border-slate-800/90 hover:border-emerald-500/40'} transition-all animate-fade-in space-y-1.5">
        <!-- Linha 1: Bicho + Força/Confiança + Ações (Horizontal Integrada) -->
        <div class="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div class="flex items-center gap-2 min-w-0 flex-wrap">
            <div class="w-7 h-7 rounded-lg flex items-center justify-center text-base animal-badge shrink-0 bg-emerald-500/15 border border-emerald-500/30 shadow-inner">
              ${animEmoji}
            </div>
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              <span class="text-[10px] font-black px-1.5 py-0.2 rounded ${idx === 0 ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm' : 'bg-slate-800 text-slate-300'}">
                #${idx + 1}
              </span>
              <h3 class="font-bold text-xs sm:text-sm text-white tracking-tight">${animName}</h3>
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
        <div class="p-1.5 rounded-lg bg-slate-950/70 border border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
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

  if (window._targetHitGroup || window._targetHitCentena) {
    setTimeout(() => {
      const hitEl = document.querySelector('.audited-hit-hundred') || 
                    (window._targetHitGroup ? document.getElementById(`animal-card-${window._targetHitGroup}`) : null);
      if (hitEl) {
        hitEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 350);
  }
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

  const effLot = (lottery || currentLottery || window.currentLottery || localStorage.getItem('bicho_active_lottery') || 'RJ').toUpperCase();
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

  const isVip = window.isUserVip ? window.isUserVip() : false;
  if (!isVip) {
    container.innerHTML = `
      <div onclick="openPlansModal()" class="card-glass p-5 rounded-2xl border border-indigo-500/40 bg-gradient-to-b from-slate-900 to-indigo-950/30 text-center space-y-3 cursor-pointer group hover:border-indigo-400 transition-all shadow-xl animate-fade-in">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/20 border border-indigo-500/50 flex items-center justify-center text-2xl text-indigo-300 shadow-inner group-hover:scale-110 transition-transform">
          🔒 🎯
        </div>
        <div>
          <h3 class="text-sm sm:text-base font-black text-white">Duque de Dezena Combinado (DDZ - 1º ao 5º)</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Fechamentos matemáticos com as melhores combinações de dezenas para cercar do 1º ao 5º prêmio. Exclusivo para assinantes VIP.
          </p>
        </div>
        <div>
          <button type="button" class="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-md group-hover:brightness-110 transition-all cursor-pointer">
            👑 Liberar Fechamento DDZ (R$ 14,90/mês)
          </button>
        </div>
      </div>
    `;
    return;
  }

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

  const isVip = window.isUserVip ? window.isUserVip() : false;
  container.innerHTML = groups
    .map((g, idx) => {
      if (!isVip && idx > 0) {
        return `
          <div onclick="openPlansModal()" class="card-glass p-3 rounded-xl border border-amber-500/30 bg-slate-900/70 flex items-center justify-between gap-2 cursor-pointer group hover:border-amber-400 transition-all animate-fade-in">
            <div class="flex items-center gap-2.5">
              <span class="text-lg">🔒</span>
              <div>
                <span class="text-xs font-bold text-white group-hover:text-amber-300">Grupo #${idx + 1} (Exclusivo VIP)</span>
                <p class="text-[10px] text-slate-400">Score, dezenas e fatores bloqueados.</p>
              </div>
            </div>
            <button type="button" class="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold group-hover:bg-amber-500/30">Liberar ➔</button>
          </div>
        `;
      }
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

  const isVip = window.isUserVip ? window.isUserVip() : false;
  container.innerHTML = tens
    .map(
      (t, idx) => {
        if (!isVip && idx >= 4) {
          return `
            <div onclick="openPlansModal()" class="card-glass p-3 flex items-center justify-between border border-amber-500/25 bg-slate-900/60 cursor-pointer group hover:border-amber-400 transition-all animate-fade-in">
              <div class="flex items-center gap-2.5">
                <span class="text-sm">🔒</span>
                <span class="text-xs font-bold text-slate-400 group-hover:text-amber-300">Dezena VIP #${idx + 1}</span>
              </div>
              <span class="text-[10px] text-amber-400 font-bold">Liberar ➔</span>
            </div>
          `;
        }
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
  if (!window.isUserVip() && (type === 'Centena' || type === 'Milhar' || type === 'Duque' || type === 'Terno')) {
    openPlansModal();
    showToast(`${type} exclusivo para membros VIP! Assine por apenas R$ 14,90/mês.`, 'warning');
    return;
  }
  const ok = await window.copyToClipboard(num);
  if (ok) {
    showToast(`${type} ${num} copiado!`, 'success');
  }
};

window.copyCompleteAnimalCard = async function (btn, emoji, name, group, tens, hundreds, thousands) {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Ficha Completa exclusiva para assinantes VIP! Assine por apenas R$ 14,90/mês.', 'warning');
    return;
  }
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

function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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
    { code: 'SP-09', name: 'PT-SP 09h - 09:00', time: '09:00' },
    { code: 'SP-10', name: 'PT-SP 10h - 10:00', time: '10:00' },
    { code: 'SP-12', name: 'PT-SP 12h20 - 12:20', time: '12:20' },
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
  ],
  BAHIA: [
    { code: 'BA-10', name: 'PT Bahia 10h - 10:00', time: '10:00' },
    { code: 'BA-12', name: 'PT Bahia 12h - 12:00', time: '12:00' },
    { code: 'BA-15', name: 'PT Bahia 15h - 15:00', time: '15:00' },
    { code: 'BA-19', name: 'PT Bahia 19h - 19:00', time: '19:00' },
    { code: 'BA-21', name: 'Coruja Bahia - 21:00', time: '21:00' },
  ],
  MINAS: [
    { code: 'MG-12', name: 'Alvorada 11h - 11:00', time: '11:00' },
    { code: 'MG-15', name: 'Minas Dia 15h - 15:00', time: '15:00' },
    { code: 'MG-19', name: 'Minas Noite 19h - 19:00', time: '19:00' },
    { code: 'MG-21', name: 'Preferida 21h - 21:00', time: '21:00' },
  ]
};

const RESULTS_LOTTERIES_CATALOG = [
  { code: 'RJ', name: 'Rio de Janeiro', state: 'RJ', icon: '🏛️' },
  { code: 'LOOK', name: 'Look', state: 'LK', icon: '🎯' },
  { code: 'SP', name: 'São Paulo', state: 'SP', icon: '🏙️' },
  { code: 'NACIONAL', name: 'Loteria Nacional', state: 'BR', icon: '🇧🇷' },
  { code: 'FEDERAL', name: 'Loteria Federal', state: 'FED', icon: '🏛️' },
  { code: 'BAHIA', name: 'Bahia', state: 'BA', icon: '☀️' },
  { code: 'MINAS', name: 'Minas Gerais', state: 'MG', icon: '🔺' },
];

window.selectResultLottery = async function (lotteryCode) {
  if (!lotteryCode) return;
  const targetLot = lotteryCode.toUpperCase();
  currentLottery = targetLot;
  window.currentLottery = targetLot;
  localStorage.setItem('bicho_active_lottery', targetLot);
  window._userSelectedSlot = null;
  _lastKnownDrawId = null;
  updateLotteryButtonsUI();
  await initSlotSelector(currentLottery);
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
  const customDateInput = document.getElementById('results-custom-date');
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
    // 2. Busca os últimos sorteios da base para a loteria ativa (até 200 sorteios para histórico farto)
    const activeLotKey = (currentLottery || 'RJ').toUpperCase();
    const resData = await api.getResults(200, 0, activeLotKey);
    const items = resData?.items || [];

    // Agrupa por data filtrando estritamente pela loteria ativa
    allRecentDrawsByDate = {};
    items.forEach((draw) => {
      if (activeLotKey === 'FEDERAL') {
        if (!isFederalDrawDate(draw.draw_date)) return;
        if (draw.lottery && draw.lottery.toUpperCase() !== 'FEDERAL' && draw.slot !== 'FED') {
          return;
        }
      } else if (activeLotKey === 'RJ') {
        // No RJ, aceita sorteios do RJ e a Federal (FED)
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

    // Se dateOverride for informado e não estiver nos resultados recentes (ou estiver vazio), busca pontualmente
    if (dateOverride && (!allRecentDrawsByDate[dateOverride] || Object.keys(allRecentDrawsByDate[dateOverride]).length === 0)) {
      try {
        const specificRes = await api.getResults(50, 0, activeLotKey, dateOverride, dateOverride);
        const specificItems = specificRes?.items || [];
        specificItems.forEach((draw) => {
          if (activeLotKey !== 'FEDERAL' && draw.lottery && draw.lottery.toUpperCase() !== activeLotKey && draw.slot !== 'FED') {
            return;
          }
          const d = draw.draw_date;
          if (!allRecentDrawsByDate[d]) allRecentDrawsByDate[d] = {};
          allRecentDrawsByDate[d][draw.slot] = draw;
        });
      } catch (errDate) {
        console.warn('Erro ao buscar resultados da data específica:', errDate);
      }
    }

    // Garante data de hoje precisa (fuso horário local)
    const todayStr = getLocalDateStr();
    const today = new Date();
    const todayDow = today.getDay(); // 0 = Dom, 3 = Qua
    const datesSet = new Set(Object.keys(allRecentDrawsByDate));

    if (activeLotKey === 'FEDERAL') {
      if (isFederalDrawDate(todayStr)) {
        datesSet.add(todayStr);
      }
      availableDatesList = Array.from(datesSet)
        .filter(dateStr => isFederalDrawDate(dateStr))
        .sort().reverse().slice(0, 14);
    } else {
      datesSet.add(todayStr);
      availableDatesList = Array.from(datesSet).sort().reverse().slice(0, 14);
    }

    // Determina a data ativa
    if (dateOverride) {
      selectedResultDate = dateOverride;
      if (!availableDatesList.includes(dateOverride)) {
        availableDatesList.push(dateOverride);
        availableDatesList.sort().reverse();
      }
    } else if (!selectedResultDate || !availableDatesList.includes(selectedResultDate)) {
      const todayHasDraws = allRecentDrawsByDate[todayStr] && Object.keys(allRecentDrawsByDate[todayStr]).length > 0;
      if (todayHasDraws && availableDatesList.includes(todayStr)) {
        selectedResultDate = todayStr;
      } else {
        const latestWithDraws = availableDatesList.find(d => allRecentDrawsByDate[d] && Object.keys(allRecentDrawsByDate[d]).length > 0);
        selectedResultDate = latestWithDraws || availableDatesList[0] || todayStr;
      }
    }

    // Sincroniza o seletor de calendário customizado
    if (customDateInput) {
      customDateInput.value = selectedResultDate || todayStr;
      customDateInput.max = todayStr;
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
    const lotKey = activeLotKey;
    const baseSlots = OFFICIAL_LOTTERY_SLOTS[lotKey] || OFFICIAL_LOTTERY_SLOTS.RJ;

    let isWed = false;
    let isSun = false;
    try {
      const parts = selectedResultDate.split('-');
      if (parts.length === 3) {
        const dt = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        const dow = dt.getDay(); // 0 = Dom, 3 = Qua
        if (dow === 3) isWed = true;
        if (dow === 0) isSun = true;
      }
    } catch(e) {}

    let slots = [];
    if (lotKey === 'RJ') {
      if (isSun) {
        slots = [
          getFriendlySlotMeta('FED', selectedResultDate),
          { code: 'PT', name: 'PT - 14:20', time: '14:20' },
          { code: 'PTV', name: 'PTV - 16:20', time: '16:20' }
        ];
      } else if (isWed) {
        slots = baseSlots.map(s => {
          if (s.code === 'PTN') return getFriendlySlotMeta('FED', selectedResultDate);
          return { ...s };
        });
      } else {
        slots = baseSlots.map(s => ({ ...s }));
      }
    } else if (lotKey === 'FEDERAL') {
      slots = [getFriendlySlotMeta('FED', selectedResultDate)];
    } else if (lotKey === 'BAHIA') {
      if (isSun) {
        slots = ['BA-10', 'BA-11', 'BA-12', 'BA-15'].map(c => getFriendlySlotMeta(c, selectedResultDate));
      } else {
        slots = baseSlots.map(s => ({ ...s }));
      }
    } else if (lotKey === 'MINAS') {
      if (isSun) {
        slots = [getFriendlySlotMeta('MG-14', selectedResultDate)];
      } else {
        slots = baseSlots.filter(s => s.code !== 'MG-14').map(s => ({ ...s }));
      }
    } else if (lotKey === 'SP') {
      if (isSun) {
        slots = ['SP-08', 'SP-09', 'SP-10', 'SP-12', 'SP-13', 'SP-15', 'SP-17'].map(c => getFriendlySlotMeta(c, selectedResultDate));
      } else {
        slots = baseSlots.filter(s => !['SP-09'].includes(s.code)).map(s => ({ ...s }));
      }
    } else {
      slots = baseSlots.map(s => ({ ...s }));
    }

    // Inclui dinamicamente qualquer slot que já foi apurado na base para este dia e loteria
    const dayDraws = allRecentDrawsByDate[selectedResultDate] || {};
    Object.keys(dayDraws).forEach((drawSlotCode) => {
      const draw = dayDraws[drawSlotCode];
      if (draw && draw.lottery && draw.lottery.toUpperCase() !== lotKey) {
        if (!(lotKey === 'RJ' && draw.slot === 'FED' && (isWed || isSun))) {
          return;
        }
      }
      if (!slots.some(s => s.code === drawSlotCode)) {
        slots.push(getFriendlySlotMeta(drawSlotCode, selectedResultDate));
      }
    });

    // Filtra estritamente para garantir que nenhum horário de outra loteria vaze
    slots = slots.filter(s => {
      if (lotKey === 'RJ') {
        if (s.code === 'FED') return isWed || isSun;
        if (s.code === 'PTN') return !isWed && !isSun;
        if (isSun) return s.code === 'FED' || s.code === 'PT' || s.code === 'PTV';
        return !s.code.startsWith('SP-') && !s.code.startsWith('LK-') && !s.code.startsWith('LN-') && !s.code.startsWith('BA-') && !s.code.startsWith('MG-');
      }
      if (lotKey === 'SP') return s.code.startsWith('SP-');
      if (lotKey === 'LOOK') return s.code.startsWith('LK-');
      if (lotKey === 'NACIONAL') return s.code.startsWith('LN-');
      if (lotKey === 'FEDERAL') return s.code === 'FED';
      if (lotKey === 'BAHIA') return s.code.startsWith('BA-');
      if (lotKey === 'MINAS') return s.code.startsWith('MG-');
      return true;
    });

    // Ordena cronologicamente
    slots.sort((a, b) => getSlotMinutes(a, selectedResultDate) - getSlotMinutes(b, selectedResultDate));

    // Se for data passada e tiver sorteios apurados, renderiza apenas os apurados para não poluir com slots inexistentes
    const isViewingToday = (selectedResultDate === todayStr);
    let slotsToRender = slots;
    if (!isViewingToday && Object.keys(dayDraws).length > 0) {
      slotsToRender = slots.filter(s => dayDraws[s.code]);
    }

    // 5. Atualiza o resumo no cabeçalho
    const drawnCount = slots.filter(s => dayDraws[s.code]).length;
    const dateFormatted = formatDateBR(selectedResultDate);
    const dayOfWeekName = getDayOfWeekName(selectedResultDate);

    if (summaryEl) {
      summaryEl.textContent = `${dayOfWeekName}, ${dateFormatted} • ${drawnCount} de ${slotsToRender.length} extrações apuradas`;
    }

    if (slotsToRender.length === 0 || (Object.keys(dayDraws).length === 0 && !isViewingToday)) {
      contentEl.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-6 my-2">
          <div class="text-3xl mb-2">📅</div>
          <p class="text-sm font-semibold text-slate-300">Nenhum resultado registrado para esta data (${dateFormatted}).</p>
          <p class="text-xs text-slate-500 mt-1">Utilize o seletor rápido ou o calendário acima para navegar entre os dias com extrações apuradas.</p>
        </div>
      `;
    } else {
      contentEl.innerHTML = slotsToRender
        .map((slotInfo) => {
          const draw = dayDraws[slotInfo.code];
          if (draw) {
            return renderDrawSlotCard(draw, slotInfo);
          } else {
            return renderPendingSlotCard(slotInfo, isViewingToday, selectedResultDate);
          }
        })
        .join('');
    }
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

function renderPendingSlotCard(slotInfo, isToday, targetDateStr = null) {
  const effDate = targetDateStr || selectedResultDate || getLocalDateStr();
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
        <button type="button" onclick="selectSlotForPrediction('${slotInfo.code}', '${effDate}')" 
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
  window._userSelectedSlot = slotCode;
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
  const effDate = dateStr || getLocalDateStr();
  const targetDateEl = document.getElementById('target-date');
  if (targetDateEl) {
    targetDateEl.value = effDate;
  }
  updateSlotPillsUI(slotCode);
  _predictionCache.clear();
  loadPrediction(true);
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
   AUTENTICAÇÃO & SESSÃO MULTI-TENANT (GOOGLE & TESTE GRÁTIS DE 3 DIAS)
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
        const displayName = (tenant.role === 'admin' || (tenant.name && tenant.name.includes('Vinicius'))) ? 'Administrador Master' : (tenant.name || 'Testador');
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

  // Sempre atualiza a interface autenticada e os dados da Home
  updateAuthUI();
  updateHomeScreenData();

  // Verifica se o usuário atual está com teste expirado
  const tenant = api.getCurrentTenant();
  const isExpired = tenant && tenant.role !== 'admin' && typeof window.isUserVip === 'function' && !window.isUserVip();

  if (isExpired) {
    if (typeof window.renderExpiredBasicBanner === 'function') {
      window.renderExpiredBasicBanner();
    }
    // Não abre o modal de planos automaticamente no reload da página.
    // O usuário navega livremente e acessa o modal apenas quando clicar no Modo VIP ou em recursos bloqueados.
  }
}

window.showTrialExpiredModal = async function() {
  const modal = document.getElementById('modal-plans');
  if (!modal) return;

  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');

  // Adiciona ou exibe o banner de aviso em destaque no modal de planos
  let expiredAlert = document.getElementById('trial-expired-alert');
  if (!expiredAlert) {
    const cardGlass = modal.querySelector('.card-glass');
    if (cardGlass) {
      expiredAlert = document.createElement('div');
      expiredAlert.id = 'trial-expired-alert';
      expiredAlert.className = 'p-3.5 sm:p-4 rounded-2xl bg-rose-500/20 border-2 border-rose-500/60 text-rose-200 text-xs font-semibold flex flex-col sm:flex-row items-center justify-between gap-3 text-left shadow-lg shadow-rose-950/50 mb-3';
      expiredAlert.innerHTML = `
        <div class="flex items-center gap-3 w-full">
          <span class="text-2xl shrink-0">🔒</span>
          <div>
            <div class="font-black text-rose-300 text-sm sm:text-base">Ative seu Plano VIP para Liberar o Acesso!</div>
            <div class="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
              Para acessar os palpites matemáticos, Chave Mestra, Cruz do Dia e fechamentos matemáticos, escolha um plano abaixo para liberar seu acesso imediato:
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <button type="button" onclick="closePlansModal()" class="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-[11px] font-black shrink-0 transition-all cursor-pointer shadow-md text-center">
            Ver Modo Básico ➔
          </button>
          <button type="button" onclick="handleUserLogout()" class="w-full sm:w-auto px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[11px] font-bold shrink-0 transition-colors cursor-pointer border border-slate-700 text-center">
            Sair
          </button>
        </div>
      `;
      const grid = cardGlass.querySelector('.grid');
      if (grid) {
        cardGlass.insertBefore(expiredAlert, grid);
      } else {
        cardGlass.insertBefore(expiredAlert, cardGlass.firstChild);
      }
    }
  } else {
    expiredAlert.classList.remove('hidden');
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
    if (mainContainer) { mainContainer.classList.remove('hidden'); mainContainer.style.pointerEvents = 'auto'; }
    if (mobBottomNav) mobBottomNav.classList.remove('hidden');

    const userEmail = (tenant.email || '').toLowerCase();
    const isMasterAdmin = tenant.role === 'admin' || userEmail === 'k1qvinicius.cs@gmail.com' || userEmail === 'k1qvinicius@gmail.com';

    if (isMasterAdmin) {
      
      
      
      if (drawerUserLabel) drawerUserLabel.textContent = 'Administrador Master';
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
        : (tenant.trial_days_remaining !== undefined ? tenant.trial_days_remaining : 0);

      // Usuário que pagou (30 dias ou plano ativo) é identificado como Assinante VIP
      const isSubscriber = (tenant.subscription_status === 'active' && tenant.plan_type && tenant.plan_type !== 'free') ||
                           tenant.plan_type === 'monthly' ||
                           tenant.plan_type === 'vip' ||
                           tenant.plan_type === 'anual' ||
                           days > 5;

      // Determina se o teste está ativo e calcula tempo amigável
      let isTrialActive = false;
      let timeText = '';

      if (!isSubscriber) {
        if (tenant.trial_info && tenant.trial_info.is_expired === false) {
          isTrialActive = true;
          const h = tenant.trial_info.hours_remaining || 0;
          const m = tenant.trial_info.minutes_remaining || 0;
          const d = tenant.trial_info.days_remaining || 0;
          if (d >= 1) {
            timeText = `${d}d`;
          } else if (h > 0) {
            timeText = `${h}h ${m}m`;
          } else {
            timeText = `${m}m`;
          }
        } else if (tenant.trial_expires_at && tenant.subscription_status !== 'expired' && tenant.subscription_status !== 'suspended') {
          try {
            const exp = new Date(tenant.trial_expires_at.replace(' ', 'T'));
            const diffMs = exp.getTime() - Date.now();
            if (diffMs > 0) {
              isTrialActive = true;
              const totalH = Math.floor(diffMs / (1000 * 60 * 60));
              const totalM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
              if (totalH >= 24) {
                timeText = `${Math.floor(totalH / 24)}d`;
              } else if (totalH > 0) {
                timeText = `${totalH}h ${totalM}m`;
              } else {
                timeText = `${totalM}m`;
              }
            }
          } catch (e) {}
        }
      }

      const isExpired = !isSubscriber && !isTrialActive;

      if (btnHeaderPlans) {
        if (isSubscriber) {
          btnHeaderPlans.classList.add('hidden');
          btnHeaderPlans.classList.remove('sm:inline-flex', 'inline-flex', 'flex');
        } else {
          btnHeaderPlans.classList.remove('hidden');
          btnHeaderPlans.classList.add('hidden', 'sm:inline-flex');
        }
      }

      // Oculta botões de planos e login no menu gaveta para assinantes
      const drawerPlansBtn = document.getElementById('drawer-plans-btn');
      const drawerLoginBtn = document.getElementById('drawer-login-btn');
      const drawerPlansLink = document.getElementById('drawer-plans-link');
      if (drawerLoginBtn) drawerLoginBtn.classList.add('hidden');
      if (isSubscriber) {
        if (drawerPlansBtn) drawerPlansBtn.classList.add('hidden');
        if (drawerPlansLink) drawerPlansLink.classList.add('hidden');
      } else {
        if (drawerPlansBtn) drawerPlansBtn.classList.remove('hidden');
        if (drawerPlansLink) drawerPlansLink.classList.remove('hidden');
      }

      if (drawerUserLabel) {
        if (isSubscriber) {
          drawerUserLabel.textContent = (tenant.name || 'Assinante') + ` (VIP • ${days}d)`;
        } else if (isTrialActive) {
          drawerUserLabel.textContent = (tenant.name || 'Visitante') + ` (Teste • ${timeText})`;
        } else {
          drawerUserLabel.textContent = (tenant.name || 'Visitante') + ' (Básico)';
        }
      }

      if (badgeContainer) {
        if (isSubscriber) {
          badgeContainer.innerHTML = `
            <div class="flex items-center gap-1.5 shrink-0">
              <div class="flex items-center gap-1 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-bold shadow-md shadow-emerald-500/10 shrink-0">
                <span class="text-[10px] sm:text-xs">⭐</span>
                <span class="font-black tracking-wide"><span class="hidden sm:inline">Assinante </span>VIP (${days}d)</span>
              </div>
              <button type="button" onclick="handleUserLogout()" class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-300 flex items-center justify-center text-[10px] sm:text-xs transition-colors cursor-pointer shrink-0" title="Sair desta conta">
                🚪
              </button>
            </div>
          `;
        } else if (isTrialActive) {
          badgeContainer.innerHTML = `
            <div class="flex items-center gap-1.5 shrink-0">
              <div class="flex items-center gap-1 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] sm:text-xs px-2.5 py-1 rounded-full font-bold shadow-md shadow-amber-500/10 shrink-0">
                <span class="text-[10px] sm:text-xs">⚡</span>
                <span class="font-black tracking-wide"><span class="hidden sm:inline">Teste </span>VIP (${timeText})</span>
              </div>
              <button type="button" onclick="openPlansModal()" class="px-2 sm:px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-[10px] sm:text-xs shadow-md shadow-amber-500/20 hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer shrink-0" title="Assinar Plano Definitivo">
                <span>⭐</span> <span><span class="hidden sm:inline">Virar </span>VIP</span>
              </button>
              <button type="button" onclick="handleUserLogout()" class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-300 flex items-center justify-center text-[10px] sm:text-xs transition-colors cursor-pointer shrink-0" title="Sair desta conta">
                🚪
              </button>
            </div>
          `;
        } else {
          badgeContainer.innerHTML = `
            <div class="flex items-center gap-1.5 shrink-0">
              <div onclick="openPlansModal()" class="flex items-center bg-slate-900/90 hover:bg-slate-800 border border-amber-500/40 hover:border-amber-400 rounded-full p-0.5 pl-2 gap-1.5 shadow-md shadow-amber-500/10 active:scale-95 transition-all cursor-pointer select-none shrink-0" title="Toque para Assinar o Radar VIP">
                <span class="text-[10px] sm:text-xs font-bold text-amber-300 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  <span class="hidden sm:inline">Modo </span>Básico
                </span>
                <span class="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 font-black text-[10px] sm:text-xs tracking-wide shadow-sm flex items-center gap-0.5 uppercase">
                  <span>⭐</span> <span><span class="hidden sm:inline">Assinar </span>VIP</span>
                </span>
              </div>
              <button type="button" onclick="handleUserLogout()" class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-800/80 hover:bg-red-500/20 text-slate-400 hover:text-red-300 flex items-center justify-center text-[10px] sm:text-xs transition-colors cursor-pointer shrink-0" title="Sair desta conta">
                🚪
              </button>
            </div>
          `;
        }
      }
    }
  } else {
    // Modo Degustação / Visitante: visualização livre da plataforma
    document.documentElement.classList.remove('is-authenticated');
    if (mainHeader) mainHeader.classList.remove('hidden');
    if (appGate) appGate.classList.add('hidden');
    if (mainContainer) { mainContainer.classList.remove('hidden'); mainContainer.style.pointerEvents = 'auto'; }
    if (mobBottomNav) mobBottomNav.classList.remove('hidden');
    
    if (drawerUserLabel) drawerUserLabel.textContent = 'Visitante (Degustação)';
    if (badgeContainer) {
      badgeContainer.innerHTML = `
        <div class="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button type="button" onclick="openPlansModal()" class="px-2 sm:px-3 py-1 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-[10px] sm:text-xs shadow-md shadow-amber-500/20 hover:scale-105 transition-transform flex items-center gap-1 cursor-pointer shrink-0">
            <span>⭐</span> <span><span class="hidden sm:inline">Ativar </span>VIP<span class="hidden sm:inline"> (R$ 14,90)</span></span>
          </button>
          <button type="button" onclick="showAuthGateModal('login')" class="px-2.5 sm:px-3 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-white border border-amber-500/40 text-[10px] sm:text-xs font-bold transition-colors cursor-pointer shrink-0 shadow-sm flex items-center gap-1" title="Já é cadastrado? Entrar">
            <span>🔐</span> <span>Entrar</span>
          </button>
        </div>
      `;
    }
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
      const msg = isMaster ? '👑 Bem-vindo, Administrador Master!' : 'Bem-vindo de volta ao Radar 5×5 Pro!';
      showToast(msg, 'success');
    }
    updateAuthUI();
    updateHomeScreenData();
    window.location.reload();
  } catch (err) {
    if (errEl) {
      errEl.innerHTML = `
        <div class="space-y-1">
          <div>${err.message || 'WhatsApp ou senha incorretos.'}</div>
          <button type="button" onclick="openForgotPasswordModal()" class="text-amber-400 hover:text-amber-300 underline font-bold cursor-pointer text-[11px] block mx-auto pt-0.5">
            🔑 Esqueceu sua senha? Clique aqui para recuperar
          </button>
        </div>
      `;
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>🔓</span> <span>Entrar no Radar 5×5 Pro</span>';
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
  window.currentLottery = currentLottery;
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

// Estado do Radar de Milhares Multi-Bancas
let currentMilharesLottery = localStorage.getItem('bicho_active_lottery') || 'LOOK';
let currentMilharesType = 'atrasadas';
let _milharesLotteryCache = {};

window.switchMilharesLottery = async function(lotKey) {
  currentMilharesLottery = (lotKey || 'LOOK').toUpperCase();
  updateMilharesLotteryButtons();
  await window.loadMilharesAtrasadas();
};

window.switchMilharesType = function(typeKey) {
  currentMilharesType = (typeKey === 'frequentes') ? 'frequentes' : 'atrasadas';
  updateMilharesTypeButtons();
  updateMilharesTabDesc();
  renderMilharesTable();
};

function updateMilharesLotteryButtons() {
  const lotteries = ['LOOK', 'NACIONAL', 'RJ', 'FEDERAL', 'MINAS', 'BAHIA', 'SP'];
  lotteries.forEach(lot => {
    const btn = document.getElementById(`btn-milhares-lot-${lot}`);
    if (btn) {
      if (lot === currentMilharesLottery) {
        btn.className = 'milhares-lot-btn px-2.5 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap bg-amber-500 text-slate-950 shadow-sm cursor-pointer';
      } else {
        btn.className = 'milhares-lot-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer';
      }
    }
  });
}

function updateMilharesTypeButtons() {
  const btnAtrasadas = document.getElementById('btn-milhares-type-atrasadas');
  const btnFrequentes = document.getElementById('btn-milhares-type-frequentes');

  if (btnAtrasadas) {
    if (currentMilharesType === 'atrasadas') {
      btnAtrasadas.className = 'milhares-type-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-indigo-600 text-white shadow-sm cursor-pointer';
    } else {
      btnAtrasadas.className = 'milhares-type-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer';
    }
  }

  if (btnFrequentes) {
    if (currentMilharesType === 'frequentes') {
      btnFrequentes.className = 'milhares-type-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-amber-500 text-slate-950 shadow-sm cursor-pointer';
    } else {
      btnFrequentes.className = 'milhares-type-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer';
    }
  }
}

function updateMilharesTabDesc() {
  const descEl = document.getElementById('milhares-tab-desc');
  const badgeEl = document.getElementById('milhares-lottery-badge');
  const lotNames = {
    LOOK: 'Look Goiás',
    NACIONAL: 'Loto Nacional',
    RJ: 'Rio de Janeiro',
    FEDERAL: 'Loteria Federal',
    MINAS: 'Minas Gerais',
    BAHIA: 'Bahia',
    SP: 'São Paulo',
  };
  const activeName = lotNames[currentMilharesLottery] || currentMilharesLottery;
  if (badgeEl) badgeEl.textContent = activeName;

  if (descEl) {
    if (currentMilharesType === 'atrasadas') {
      descEl.textContent = `As milhares com maior seca (dias decorridos sem aparição do 1º ao 5º prêmio) na apuração de ${activeName}.`;
    } else {
      descEl.textContent = `As milhares com maior número de saídas registradas do 1º ao 5º prêmio na apuração de ${activeName}.`;
    }
  }
}

// Retrocompatibilidade
window.switchMilharesTab = function(tabKey) {
  if (tabKey.startsWith('federal_')) {
    currentMilharesLottery = 'FEDERAL';
    currentMilharesType = tabKey.includes('atrasadas') ? 'atrasadas' : 'frequentes';
  } else if (tabKey.startsWith('rj_')) {
    currentMilharesLottery = 'RJ';
    currentMilharesType = tabKey.includes('atrasadas') ? 'atrasadas' : 'frequentes';
  }
  updateMilharesLotteryButtons();
  updateMilharesTypeButtons();
  updateMilharesTabDesc();
  window.loadMilharesAtrasadas();
};

window.loadMilharesAtrasadas = async function(forceRefresh = false) {
  const refreshBtn = document.getElementById('btn-refresh-milhares');
  const refreshIcon = document.getElementById('milhares-refresh-icon');
  const lastUpdatedEl = document.getElementById('milhares-last-updated');
  const badgeEl = document.getElementById('milhares-lottery-badge');

  if (forceRefresh) {
    delete _milharesLotteryCache[currentMilharesLottery];
  }

  if (refreshBtn) refreshBtn.disabled = true;
  if (refreshIcon) refreshIcon.classList.add('animate-spin');

  try {
    if (!_milharesLotteryCache[currentMilharesLottery]) {
      const res = await api.getMilharesRankings(currentMilharesLottery);
      _milharesLotteryCache[currentMilharesLottery] = res.data || {};
    }

    const data = _milharesLotteryCache[currentMilharesLottery] || {};
    if (badgeEl && data.lottery_name) {
      badgeEl.textContent = data.lottery_name;
    }

    if (lastUpdatedEl && data.updated_at) {
      try {
        const dt = new Date(data.updated_at);
        lastUpdatedEl.textContent = dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      } catch {
        lastUpdatedEl.textContent = 'Hoje';
      }
    } else if (lastUpdatedEl) {
      lastUpdatedEl.textContent = 'Hoje';
    }

    updateMilharesLotteryButtons();
    updateMilharesTypeButtons();
    updateMilharesTabDesc();
    renderMilharesTable();
  } catch (err) {
    console.error('Erro ao carregar rankings de milhares:', err);
    const tbody = document.getElementById('milhares-table-body');
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-8 text-center text-rose-400">
            <div class="flex flex-col items-center justify-center gap-2">
              <span class="text-xl">⚠️</span>
              <p class="font-bold">Não foi possível sincronizar o ranking de milhares para ${currentMilharesLottery}.</p>
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

function renderMilharesTable() {
  const tbody = document.getElementById('milhares-table-body');
  const countBadge = document.getElementById('milhares-count-badge');
  if (!tbody) return;

  const data = _milharesLotteryCache[currentMilharesLottery] || {};
  let items = data[currentMilharesType] || [];
  
  // Fallback caso seja formato legado
  if ((!items || items.length === 0) && data[`${currentMilharesLottery.toLowerCase()}_${currentMilharesType}`]) {
    items = data[`${currentMilharesLottery.toLowerCase()}_${currentMilharesType}`];
  }

  if (countBadge) countBadge.textContent = items.length;

  if (!items || items.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-400">
          Nenhuma milhar registrada nesta categoria para ${currentMilharesLottery} no momento.
        </td>
      </tr>
    `;
    return;
  }

  const isAtrasadas = currentMilharesType === 'atrasadas';
  const isVip = window.isUserVip();
  const visibleItems = isVip ? items : items.slice(0, 2);

  let rowsHtml = visibleItems.map((item, idx) => {
    const rankNum = idx + 1;
    let rankBadge = `<span class="font-bold text-slate-400">${rankNum}º</span>`;
    if (rankNum === 1) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 font-black text-xs">🥇</span>`;
    else if (rankNum === 2) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-200 border border-slate-400/50 font-black text-xs">🥈</span>`;
    else if (rankNum === 3) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-500 border border-amber-700/50 font-black text-xs">🥉</span>`;

    const atrasoHtml = isAtrasadas
      ? `<span class="text-amber-400 font-black font-mono text-sm">${item.dias_atraso !== null && item.dias_atraso !== undefined ? item.dias_atraso + ' dias' : '--'}</span>`
      : `<span class="text-emerald-400 font-bold font-mono text-sm">${item.vezes_sorteada ? item.vezes_sorteada + ' vezes' : (item.dias_atraso ? item.dias_atraso + ' dias atrás' : 'Alta')}</span>`;

    return `
      <tr class="hover:bg-slate-900/60 transition-colors">
        <td class="py-2.5 px-3 text-center">${rankBadge}</td>
        <td class="py-2.5 px-3">
          <span class="font-mono font-black text-amber-300 text-sm tracking-wider">${item.milhar}</span>
        </td>
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-2">
            <span class="text-base">${item.icone || '🎯'}</span>
            <div>
              <div class="font-bold text-white">${item.bicho || 'Bicho'}</div>
              <div class="text-[10px] text-slate-400">Grupo ${String(item.grupo).padStart(2, '0')}</div>
            </div>
          </div>
        </td>
        <td class="py-2.5 px-3 text-slate-300 font-mono text-xs">
          ${item.ultima_data || '--'}
        </td>
        <td class="py-2.5 px-3 text-slate-400 text-xs">
          ${item.extracao || currentMilharesLottery} <span class="text-slate-500">(${item.premio || '1º ao 5º'})</span>
        </td>
        <td class="py-2.5 px-3 text-right">
          ${atrasoHtml}
        </td>
        <td class="py-2.5 px-3 text-center">
          <button type="button" onclick="quickTrackMilhar('${item.milhar}')"
            class="px-2 py-1 rounded bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-300 text-[11px] font-bold border border-slate-700 transition-all cursor-pointer"
            title="Rastrear esta milhar detalhadamente">
            🔍 Rastrear
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (!isVip) {
    rowsHtml += `
      <tr>
        <td colspan="7" class="py-6 px-3 text-center">
          <div onclick="openPlansModal()" class="max-w-md mx-auto p-5 rounded-2xl bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/50 shadow-2xl space-y-2.5 cursor-pointer group hover:border-amber-400 transition-all">
            <div class="text-2xl">👑 🔒</div>
            <div class="text-xs sm:text-sm font-black text-white">Ranking Completo de Milhares Atrasadas e Viciadas</div>
            <p class="text-[11px] text-slate-300 leading-relaxed">
              Milhar paga até <strong>4.000x</strong>. Acesse a lista completa das milhares mais quentes e atrasadas de todas as loterias no plano VIP por <strong>R$ 14,90/mês</strong>.
            </p>
            <button type="button" class="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs shadow-md group-hover:scale-105 transition-transform">
              Desbloquear Milhares VIP ⭐
            </button>
          </div>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = rowsHtml;

  // Renderizar Cards Mobile (100% responsivos, sem barra de rolagem horizontal)
  const mobileContainer = document.getElementById('milhares-mobile-cards');
  if (mobileContainer) {
    if (!items || items.length === 0) {
      mobileContainer.innerHTML = `
        <div class="p-6 text-center text-slate-400 bg-slate-950/60 rounded-xl border border-slate-800">
          Nenhuma milhar registrada nesta categoria para ${currentMilharesLottery} no momento.
        </div>
      `;
    } else {
      let cardsHtml = visibleItems.map((item, idx) => {
        const rankNum = idx + 1;
        let rankBadge = `<span class="font-bold text-slate-400 text-xs">${rankNum}º</span>`;
        if (rankNum === 1) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50 font-black text-xs">🥇</span>`;
        else if (rankNum === 2) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-400/20 text-slate-200 border border-slate-400/50 font-black text-xs">🥈</span>`;
        else if (rankNum === 3) rankBadge = `<span class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/20 text-amber-500 border border-amber-700/50 font-black text-xs">🥉</span>`;

        const atrasoBadge = isAtrasadas
          ? `<span class="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 font-black font-mono text-xs">${item.dias_atraso !== null && item.dias_atraso !== undefined ? item.dias_atraso + 'd sem sair' : '--'}</span>`
          : `<span class="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold font-mono text-xs">${item.vezes_sorteada ? item.vezes_sorteada + ' saídas' : 'Alta freq.'}</span>`;

        return `
          <div class="p-3 rounded-2xl bg-slate-900/90 border border-slate-800/90 hover:border-amber-500/40 shadow-sm space-y-2.5 transition-all">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                ${rankBadge}
                <span class="font-mono font-black text-amber-300 text-lg tracking-wider">${item.milhar}</span>
                <span class="text-base">${item.icone || '🎯'}</span>
                <div>
                  <div class="font-bold text-white text-xs">${item.bicho || 'Bicho'}</div>
                  <div class="text-[10px] text-slate-400">Grupo ${String(item.grupo).padStart(2, '0')}</div>
                </div>
              </div>
              <div>
                ${atrasoBadge}
              </div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px] text-slate-400">
              <div>
                <span>Última:</span> <strong class="text-slate-200 font-mono">${item.ultima_data || '--'}</strong>
                <span class="text-slate-500">· ${item.extracao || currentMilharesLottery}</span>
              </div>
              <button type="button" onclick="quickTrackMilhar('${item.milhar}')"
                class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-[11px] font-bold border border-slate-700/80 transition-all flex items-center gap-1 active:scale-95 cursor-pointer">
                <span>🔍</span> <span>Rastrear</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      if (!isVip) {
        cardsHtml += `
          <div onclick="openPlansModal()" class="w-full p-4 rounded-2xl bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950 border border-amber-500/50 shadow-2xl space-y-2 text-center cursor-pointer group hover:border-amber-400 transition-all">
            <div class="text-2xl">👑 🔒</div>
            <div class="text-xs sm:text-sm font-black text-white">Ranking Completo de Milhares Atrasadas e Viciadas</div>
            <p class="text-[11px] text-slate-300 leading-relaxed">
              Milhar paga até <strong>4.000x</strong>. Acesse a lista completa no plano VIP por <strong>R$ 14,90/mês</strong>.
            </p>
            <button type="button" class="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs shadow-md group-hover:scale-102 transition-transform">
              Desbloquear Milhares VIP ⭐
            </button>
          </div>
        `;
      }

      mobileContainer.innerHTML = cardsHtml;
    }
  }
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

  container.className = 'card-glass p-2.5 sm:p-3 rounded-xl border border-cyan-500/35 bg-gradient-to-br from-cyan-950/25 via-slate-900/90 to-slate-950/90 space-y-2 shadow-md';

  const itemsHtml = topList.map((item, idx) => {
    const pct = Number(item.probability_pct || 0);
    const tensFormatted = (item.hot_tens || []).join(' • ');
    const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `<span class="text-slate-500 text-[10px] font-mono">#${idx + 1}</span>`));
    const isTop = idx === 0;

    return `
      <div class="py-1 px-2 rounded-lg ${isTop ? 'bg-cyan-500/10 border border-cyan-500/30 ring-1 ring-cyan-500/20' : 'bg-slate-900/50 border border-slate-800/70'} flex items-center justify-between gap-2">
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-xs shrink-0">${medal}</span>
          <span class="text-base shrink-0">${item.emoji || '🐾'}</span>
          <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
            <span class="text-xs font-bold text-white uppercase tracking-wider">${item.animal}</span>
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-slate-800 text-slate-300">Gr. ${String(item.group).padStart(2, '0')}</span>
            ${isTop ? '<span class="text-[9px] font-black px-1.5 py-0.2 rounded bg-cyan-500 text-slate-950 uppercase tracking-wide">Mais Frequente</span>' : ''}
            <span class="text-[10px] text-slate-400 hidden sm:inline ml-1">Dezenas: <b class="font-mono text-cyan-300">${tensFormatted}</b></span>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <div class="w-16 sm:w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden border border-slate-700/60">
            <div class="bg-gradient-to-r from-cyan-500 to-emerald-400 h-1.5 rounded-full" style="width: ${Math.min(pct * 6, 100)}%"></div>
          </div>
          <span class="font-mono font-bold text-xs text-cyan-300 w-10 text-right">${pct}%</span>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="flex items-center justify-between gap-2 border-b border-cyan-500/20 pb-1.5">
      <div class="flex items-center gap-1.5 min-w-0">
        <div class="w-6 h-6 rounded-md bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center shrink-0">
          <span class="text-xs">🎯</span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <h3 class="text-xs font-black text-cyan-300 uppercase tracking-wider">Padrão Histórico de Transição</h3>
            <span class="text-[9px] text-slate-400 bg-slate-900/80 px-1.5 py-0.2 rounded border border-slate-800 font-mono">${sampleSize}x hist.</span>
          </div>
          <p class="text-[10px] text-slate-400 truncate">
            1º prêmio anterior: <strong class="text-slate-200">${fromEmoji} ${fromAnimal} (Gr. ${fromGroup})</strong> no <span class="text-cyan-300 font-semibold">${fromSlot}</span>
          </p>
        </div>
      </div>
    </div>

    <div class="space-y-1">
      ${itemsHtml}
    </div>

    <div class="flex items-center justify-between text-[9px] text-slate-500 pt-0.5">
      <span class="truncate">Probabilidade condicional empírica (+45.000 sorteios)</span>
      <span class="text-cyan-400/80 font-medium shrink-0 ml-1">Projeção: ${targetSlot}</span>
    </div>
  `;
}

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
// AUTENTICAÇÃO PROFISSIONAL: ABAS, SENHA E CADASTRO 3 DIAS
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

  if (!password || password.length < 6) {
    if (errEl) {
      errEl.textContent = 'A senha deve conter no mínimo 6 caracteres.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (errEl) errEl.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Liberando 5 horas de teste...</span>';
  }

  try {
    const res = await api.register({
      name: name || `Membro ${phoneDigits.slice(-4)}`,
      email: email,
      phone: phone,
      password: password
    });

    if (typeof showToast === 'function') {
      showToast('🎉 Bem-vindo! Suas 5 horas de Teste VIP foram ativadas com sucesso.', 'success');
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
      btn.innerHTML = '<span>🚀</span> <span>Ativar Minhas 5 Horas Grátis</span>';
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
    if (typeof window.startPaymentApprovalWatcher === 'function') {
      window.startPaymentApprovalWatcher();
    }
  }
};

window.closePlansModal = function() {
  const modal = document.getElementById('modal-plans');
  if (modal) {
    modal.classList.add('hidden');
  }
  document.body.classList.remove('overflow-hidden');

  const tenant = api.getCurrentTenant();
  const isExpired = tenant && tenant.role !== 'admin' && typeof window.isUserVip === 'function' && !window.isUserVip();

  // Se o usuário estiver no modo básico (expirado) e em uma tela VIP exclusiva, volta suavemente para Início
  if (isExpired && typeof window.currentScreen === 'string' && window.currentScreen !== 'home' && window.currentScreen !== 'resultados') {
    switchScreen('home');
  }
};

window.subscribePlan = async function(planKey, method = 'mercadopago') {
  const planNames = {
    'monthly': 'Plano Mensal (R$ 14,90)',
    'quarterly': 'Plano Trimestral (R$ 37,00)',
    'semiannual': 'Plano Semestral (R$ 67,00)',
    'yearly': 'Plano Anual (R$ 97,00)',
    'whatsapp': 'Assinatura VIP'
  };

  const planTitle = planNames[planKey] || 'Assinatura Radar 5×5 Pro';

  // Se o usuario clicou especificamente no botao de suporte do WhatsApp
  if (planKey === 'whatsapp') {
    let settings = window._publicSettings;
    if (!settings) {
      try {
        const res = await fetch(`${API_BASE}/auth/settings`);
        if (res.ok) settings = await res.json();
      } catch (e) {}
    }
    let whatsappNum = (settings?.support_whatsapp || '11984684263').replace(/\D/g, '');
    if (!whatsappNum.startsWith('55') && whatsappNum.length >= 10) whatsappNum = '55' + whatsappNum;
    const currentUser = api.getCurrentTenant();
    const userName = currentUser?.name ? ` Me chamo ${currentUser.name}.` : '';
    const userEmail = currentUser?.email ? ` Meu e-mail: ${currentUser.email}.` : '';
    const msg = `Olá! Tenho dúvidas sobre a assinatura do Radar 5×5 Pro.${userName}${userEmail} Pode me ajudar?`;
    window.open(`https://wa.me/${whatsappNum}?text=${encodeURIComponent(msg)}`, '_blank');
    return;
  }

  // Busca configurações públicas para links manuais personalizados (Kiwify, Hotmart, etc.)
  let settings = window._publicSettings;
  if (!settings) {
    try {
      const res = await fetch(`${API_BASE}/auth/settings`);
      if (res.ok) settings = await res.json();
      window._publicSettings = settings;
    } catch (e) {}
  }

  // 1. Se houver link externo manual configurado pelo admin
  const planConfig = settings?.plans?.[planKey];
  if (planConfig && planConfig.link && planConfig.link.startsWith('http')) {
    window.open(planConfig.link, '_blank');
    return;
  }

  // 2. Checkout 100% Automático e Direto via Mercado Pago (Pix QR Code, Copia e Cola ou Cartão)
  try {
    const isRecurring = method === 'subscription';
    const toastMsg = isRecurring 
      ? 'Gerando assinatura com débito automático no Mercado Pago...' 
      : 'Iniciando pagamento seguro no Mercado Pago (Pix e Cartão)...';
    showToast(toastMsg, 'info');

    const token = localStorage.getItem('bicho_auth_token') || sessionStorage.getItem('bicho_auth_token');
    const authHeaders = token ? {
      'Authorization': `Bearer ${token}`,
      'X-Access-Key': token
    } : {};

    const endpointUrl = isRecurring 
      ? `${API_BASE}/payments/create-subscription` 
      : `${API_BASE}/payments/create-preference?plan=${encodeURIComponent(planKey)}`;

    const res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      }
    });

    if (res.ok) {
      const data = await res.json();
      if (data && data.checkout_url) {
        // Redireciona DIRETAMENTE para a página oficial do Mercado Pago (Pix QR Code e Cartão)
        window.location.href = data.checkout_url;
        return;
      }
    }

    const errData = await res.json().catch(() => ({}));
    const errMsg = errData.detail || 'Não foi possível iniciar o checkout do Mercado Pago no momento. Tente novamente em instantes.';
    console.error('Falha ao gerar checkout Mercado Pago:', errData);
    showToast(errMsg, 'error');
  } catch (err) {
    console.error('Falha de conexão ao gerar checkout Mercado Pago:', err);
    showToast('Erro de conexão ao abrir o Mercado Pago. Verifique sua internet e tente novamente.', 'error');
  }
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

  const originEl = document.getElementById('bingo-modal-origin-text');
  const originDescEl = document.getElementById('bingo-modal-origin-desc');
  if (originEl) {
    const isChave = b.origin === 'CHAVE_MESTRA';
    originEl.textContent = b.origin_label || (isChave ? '⚡ Chave Mestra (Matriz 3x3)' : `🎯 Radar do Horário (${b.lottery} ${b.slot})`);
    originEl.className = isChave ? 'text-xs font-black text-amber-300' : 'text-xs font-black text-cyan-300';
  }
  if (originDescEl) {
    const isChave = b.origin === 'CHAVE_MESTRA';
    originDescEl.textContent = b.origin_desc || (isChave 
      ? 'Centena de Ouro projetada pela confluência da Chave Mestra e Matriz 3x3 do Dia.'
      : `Centena gerada pelos algoritmos estatísticos de frequência e atraso específicos da banca ${b.lottery} (${b.slot}).`);
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
    if (b.origin === 'CHAVE_MESTRA') {
      if (typeof window.switchScreen === 'function') {
        window.switchScreen('matriz');
      }
      const num = String(b.hit_number || b.prize_1 || '');
      const d2 = parseInt(num.slice(-2), 10);
      let grp = 0;
      if (!isNaN(d2)) {
        grp = d2 === 0 ? 25 : Math.ceil(d2 / 4);
      }
      if (grp > 0 && typeof window.selectMatrizAnimal === 'function') {
        setTimeout(() => {
          window.selectMatrizAnimal(grp);
          const el = document.getElementById('matriz-animal-detail-card');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
      return;
    }
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

    // REGRA: Modal apenas sob demanda do usuário (clique no banner), sem travar a navegação inicial
    if (!forceShow) {
      try { localStorage.setItem(seenModalKey, '1'); } catch(e) {}
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
      <div class="relative overflow-hidden rounded-2xl bg-gradient-to-r ${gradientBg} border backdrop-blur-md p-3.5 sm:p-4 shadow-xl pr-12 sm:pr-14">
        <!-- Brilho animado de fundo -->
        <div class="absolute -top-12 -right-12 w-36 h-36 bg-yellow-400/15 rounded-full blur-2xl pointer-events-none animate-pulse"></div>

        <!-- Botao Fechar elegante no canto superior direito (sem vazar a borda) -->
        <button type="button" onclick="dismissMilharBingoBanner('${b.id}')" title="Fechar este aviso"
          class="absolute top-3 right-3 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-slate-950/70 hover:bg-slate-900 text-slate-400 hover:text-white border border-slate-700/60 hover:border-slate-500 flex items-center justify-center transition-all active:scale-90 cursor-pointer z-20 shadow-md backdrop-blur-sm">
          <svg class="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>

        <div class="relative flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
          <!-- Lado Esquerdo: Icone + Titulo + Info -->
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-slate-950/85 border border-amber-500/40 flex items-center justify-center text-2xl shadow-inner shrink-0 cursor-pointer hover:scale-105 transition-transform" onclick="openBingoCelebrationModal()">
              ${icon}
            </div>
            <div class="space-y-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${badgeColor} shadow-sm flex items-center gap-1">
                  <span>${badgeLabel}</span>
                </span>
                <span class="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${b.origin === 'CHAVE_MESTRA' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'} shadow-sm flex items-center gap-1">
                  ${b.origin === 'CHAVE_MESTRA' ? '⚡ Chave Mestra 3x3' : '🎯 Radar de Horário'}
                </span>
              </div>
              <h4 class="text-xs sm:text-sm font-black text-white leading-snug">
                🔥 BINGO! Nossa análise cravou em cheio!
              </h4>
              <div class="flex items-center gap-1.5 pt-0.5 flex-wrap text-[11px] text-slate-300">
                <span class="font-semibold">
                  Extração: <b class="text-amber-200">${b.lottery}</b> (${b.slot}) - ${formattedDate}
                </span>
                <span class="text-slate-500">•</span>
                <span class="font-medium text-slate-300">${b.prize_desc}</span>
                <span class="text-slate-500 hidden sm:inline">•</span>
                <span class="text-[10px] sm:text-[11px] font-bold ${b.origin === 'CHAVE_MESTRA' ? 'text-amber-300 bg-amber-950/70 border-amber-500/40' : 'text-cyan-300 bg-cyan-950/70 border-cyan-500/40'} px-2 py-0.5 rounded-md border shadow-sm">
                  Origem: ${b.origin_label || (b.origin === 'CHAVE_MESTRA' ? 'Chave Mestra (Matriz 3x3)' : 'Radar do Horário')}
                </span>
              </div>
            </div>
          </div>

          <!-- Lado Direito: O Numero Cravado + Botao Ver Detalhes -->
          <div class="flex items-center gap-2.5 sm:gap-3 shrink-0 self-end md:self-center">
            <div class="flex flex-col items-center justify-center bg-slate-950/90 border border-amber-500/50 rounded-xl px-3.5 py-1.5 shadow-lg shadow-black/40 cursor-pointer hover:border-amber-400 transition-colors" onclick="openBingoCelebrationModal()" title="Ver celebração completa">
              <span class="text-[9px] uppercase tracking-widest text-amber-400 font-bold leading-none mb-0.5">Número Premiado</span>
              <span class="font-mono text-xl sm:text-2xl font-black text-yellow-300 tracking-wider leading-none drop-shadow-[0_2px_8px_rgba(253,224,71,0.6)]">
                ${b.hit_number}
              </span>
            </div>

            <button type="button" onclick="goToBingoDetails()" title="Ver detalhes do acerto"
              class="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs shadow-md shadow-amber-500/25 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shrink-0">
              <span>Ver Detalhes</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
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
    container.innerHTML = '';
  }
  const idToSave = bingoId || (window._latestBingoData ? window._latestBingoData.id : null) || 'current';
  try {
    localStorage.setItem('bicho_dismissed_bingo_' + idToSave, '1');
    localStorage.setItem('bicho_seen_bingo_modal_' + idToSave, '1');
  } catch(e) {}
};

/* ==========================================================================
   MÓDULO: MATRIZ 3X3 DO DIA (BASE DIA & MÊS)
   ========================================================================== */
window._currentMatrizData = null;
window._currentMatrizMode = 'dia'; // 'dia', 'mes', 'both'
window._currentMatrizSelectedGroup = null;

window.navigateToLotteryPrediction = async function(event, lottery, slot) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  showToast(`Abrindo palpites oficiais de ${lottery}...`, 'info');
  if (window.navigateTo) {
    await window.navigateTo(lottery, 'palpites');
  } else if (window.switchLottery) {
    await window.switchLottery(lottery);
    if (window.switchScreen) window.switchScreen('palpites');
  }
  if (slot) {
    setTimeout(() => {
      const slotBtn = document.querySelector(`[data-slot="${slot}"], [data-slot-code="${slot}"]`);
      if (slotBtn) slotBtn.click();
    }, 250);
  }
};

window.getAnimalActiveLotteries = function(groupNum) {
  const picks = window._currentActiveLotteryPicks || {};
  const matches = [];
  const order = ['RJ', 'LOOK', 'NACIONAL', 'SP', 'FEDERAL', 'BAHIA', 'MINAS'];
  
  order.forEach(lot => {
    const lotData = picks[lot];
    if (lotData && lotData.top_groups) {
      const match = lotData.top_groups.find(g => Number(g.group) === Number(groupNum));
      if (match) {
        matches.push({
          lottery: lot,
          lottery_name: lotData.lottery_name || lot,
          slot: lotData.slot,
          slot_name: lotData.slot_name || lotData.slot,
          rank: match.rank,
          score: match.score
        });
      }
    }
  });
  return matches;
};


window.switchMatrizSubTab = function(tabName) {
  const tabs = ['confluence', 'ternos', 'cruzador'];
  tabs.forEach(t => {
    const pane = document.getElementById('matriz-subtab-' + t);
    const btn = document.getElementById('matriz-subtab-btn-' + t);
    if (pane) {
      if (t === tabName) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tabName) {
        btn.className = 'matriz-subtab-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow-sm cursor-pointer';
      } else {
        btn.className = 'matriz-subtab-btn px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all cursor-pointer';
      }
    }
  });
};

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
    const [data, picks] = await Promise.all([
      api.getMatrizDia(dateVal),
      (typeof api.getActiveLotteryPicks === 'function')
        ? api.getActiveLotteryPicks(dateVal).catch(() => ({}))
        : Promise.resolve({})
    ]);
    window._currentMatrizData = data;
    window._currentActiveLotteryPicks = picks || {};
    window._currentActiveLotteryPicksDate = dateVal;
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

  const isVip = window.isUserVip();

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
          <div class="relative rounded-xl border flex flex-col items-center justify-center font-mono font-black text-xl sm:text-2xl transition-all hover:scale-105 select-none ${cellCls}">
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
  if (!isVip) {
    if (linesContainer) {
      linesContainer.innerHTML = `
        <div onclick="openPlansModal()" class="p-4 rounded-xl bg-slate-900/90 border border-amber-500/40 text-center cursor-pointer group hover:border-amber-400 transition-all select-none">
          <div class="text-xs font-bold text-amber-300">🔒 Centenas do Grid 3x3 Bloqueadas</div>
          <div class="text-[10px] text-slate-400 mt-0.5">Exclusivo para membros VIP (R$ 14,90/mês)</div>
        </div>
      `;
    }
    const confluenceContainer = document.getElementById('matriz-subtab-confluence');
    if (confluenceContainer) {
      confluenceContainer.innerHTML = `
        <div onclick="openPlansModal()" class="p-6 rounded-2xl bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950 border-2 border-amber-500/60 text-center shadow-2xl space-y-3 cursor-pointer group hover:border-amber-400 transition-all my-3">
          <div class="text-3xl">🔑 🔒</div>
          <div class="text-sm sm:text-base font-black text-white">Bichos de Máxima Confluência e Milhares Bloqueados</div>
          <p class="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
            Os 6 animais com dezenas 100% no Grid, centenas cirúrgicas e milhares são exclusivos para assinantes VIP.
          </p>
          <button type="button" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs shadow-md group-hover:scale-105 transition-transform">
            Liberar Chave Mestra VIP (R$ 14,90/mês) ⭐
          </button>
        </div>
      `;
    }
    return;
  }
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
        ? anim.matching_tens.map(t => `<span class="px-1.5 py-0.5 rounded bg-indigo-950/90 border border-indigo-700/60 text-indigo-200 font-mono font-bold text-xs">${t}</span>`).join(' ')
        : '<span class="text-slate-500 text-xs">-</span>';

      const centenasList = (anim.top_centenas || []).slice(0, 4);
      const milharesList = (anim.top_milhares || []).slice(0, 4);

      const centenasHtml = centenasList.map(c => `
        <button type="button" onclick="copySingleNumber(event, '${c}', 'Centena')" title="Toque para copiar a centena ${c}"
          class="px-2 py-0.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-500/70 hover:border-amber-400 text-amber-200 font-mono font-bold text-xs tracking-wider shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
          ${c}
        </button>
      `).join(' ');

      const milharesHtml = milharesList.map(m => `
        <button type="button" onclick="copySingleNumber(event, '${m}', 'Milhar')" title="Toque para copiar a milhar ${m}"
          class="px-2 py-0.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/70 hover:border-indigo-400 text-indigo-200 font-mono font-bold text-xs tracking-wider shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer">
          ${m}
        </button>
      `).join(' ');

      const cStr = centenasList.join(', ');
      const mStr = milharesList.join(', ');

      // Sinergia com Loterias em Micro-Chips de Linha Única
      const activeMatches = (typeof window.getAnimalActiveLotteries === 'function')
        ? window.getAnimalActiveLotteries(anim.group)
        : [];

      let lotteriesRowHtml = '';
      if (activeMatches && activeMatches.length > 0) {
        const chips = activeMatches.map(m => {
          const displayLot = m.lottery === 'FEDERAL' ? 'FED' : (m.lottery === 'NACIONAL' ? 'NAC' : m.lottery);
          return `
            <button type="button" onclick="navigateToLotteryPrediction(event, '${m.lottery}', '${m.slot}')"
              class="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 hover:border-emerald-400 text-emerald-300 text-[10px] font-bold tracking-tight transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Palpite ativo em ${m.lottery_name} (${m.slot_name || m.slot}) - Toque para abrir">
              ${displayLot}
            </button>
          `;
        }).join('');

        lotteriesRowHtml = `
          <div class="flex items-center justify-between gap-1 text-[11px] pt-1">
            <span class="font-bold text-emerald-400 flex items-center gap-1 shrink-0 text-[10px]">
              <span>🔥</span> <span>Ativo (${activeMatches.length}):</span>
            </span>
            <div class="flex items-center gap-1 flex-wrap justify-end">
              ${chips}
            </div>
          </div>
        `;
      } else {
        lotteriesRowHtml = `
          <div class="flex items-center gap-1 text-[10px] text-slate-500 pt-1">
            <span>⚡</span> <span>Oportunidade Exclusiva Chave Mestra</span>
          </div>
        `;
      }

      return `
        <div class="card-glass p-3 sm:p-3.5 rounded-2xl border border-slate-800 hover:border-amber-500/40 bg-gradient-to-b from-slate-900/90 to-slate-950/90 transition-all shadow-md flex flex-col justify-between space-y-2.5">
          <!-- 1. TOPO: Animal, Grupo, Dezenas integradas e Confluência -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-2xl sm:text-3xl shrink-0 p-1 rounded-xl bg-slate-800/60 border border-slate-700/50 shadow-inner">${anim.emoji || '🐾'}</span>
              <div class="min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <h4 class="text-xs sm:text-sm font-black text-white leading-tight">${anim.animal}</h4>
                  <span class="text-[10px] text-slate-400 font-mono font-bold bg-slate-800/80 px-1.5 py-0.2 rounded border border-slate-700/40">Gr. ${String(anim.group).padStart(2, '0')}</span>
                </div>
                <!-- Dezenas integradas logo abaixo do nome -->
                <div class="flex items-center gap-1 mt-1 flex-wrap">
                  <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Dez:</span>
                  <div class="flex items-center gap-1">${matchTensStr}</div>
                </div>
              </div>
            </div>

            <div class="shrink-0 text-right">
              <span class="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-black inline-flex items-center gap-0.5 shadow-sm whitespace-nowrap">
                <span>⚡</span> ${Math.round(anim.confluence_score)}%
              </span>
              <span class="block text-[8px] text-slate-500 font-medium uppercase mt-0.5">${modeTag}</span>
            </div>
          </div>

          <!-- 2. NÚMEROS: Bandeja Unificada (Centenas VIP e Milhares VIP) -->
          <div class="bg-slate-950/70 rounded-xl p-2 border border-slate-800/80 space-y-1.5 shadow-inner">
            <!-- Linha Centenas -->
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-black text-amber-400 uppercase tracking-wide shrink-0">Centenas:</span>
              <div class="flex items-center gap-1 flex-wrap justify-end">
                ${centenasHtml}
              </div>
            </div>

            <!-- Divisória suave -->
            <div class="border-t border-slate-800/80"></div>

            <!-- Linha Milhares -->
            <div class="flex items-center justify-between gap-2">
              <span class="text-[10px] font-black text-indigo-400 uppercase tracking-wide shrink-0">Milhares:</span>
              <div class="flex items-center gap-1 flex-wrap justify-end">
                ${milharesHtml}
              </div>
            </div>
          </div>

          <!-- 3. SINERGIA DE LOTERIAS (MICRO-CHIPS) -->
          <div class="pt-0.5 border-t border-slate-800/70">
            ${lotteriesRowHtml}
          </div>

          <!-- 4. BOTÕES DE CÓPIA: Modernos e Refinados -->
          <div class="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-slate-800/80">
            <button type="button" onclick="copyAnimalMatrizHundreds(this, '${anim.animal}', '${cStr}')"
              class="py-1.5 px-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 hover:border-cyan-500/50 text-cyan-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
              title="Copiar centenas da ${anim.animal}">
              <span>🎯</span> <span>Copiar Centenas</span>
            </button>
            <button type="button" onclick="copyAnimalMatrizThousands(this, '${anim.animal}', '${mStr}')"
              class="py-1.5 px-2 rounded-xl bg-slate-800/90 hover:bg-slate-700/90 border border-slate-700/60 hover:border-amber-500/50 text-amber-300 text-[10px] font-bold flex items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer shadow-sm"
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

            <!-- Sinergia do Terno com Palpites das Loterias -->
            ${(function() {
              const tMatches = [];
              (t.bichos || []).forEach(b => {
                const ml = (typeof window.getAnimalActiveLotteries === 'function') ? window.getAnimalActiveLotteries(b.group) : [];
                ml.forEach(m => tMatches.push({ ...m, bichoName: b.name }));
              });
              const seenL = new Set();
              const uniqueL = [];
              tMatches.forEach(m => {
                if (!seenL.has(m.lottery)) {
                  seenL.add(m.lottery);
                  uniqueL.push(m);
                }
              });
              if (uniqueL.length === 0) return '';
              return `
                <div class="pt-1.5 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span class="font-bold text-emerald-400 flex items-center gap-1">
                    <span>🔥</span> <span>Palpite em:</span>
                  </span>
                  <div class="flex flex-wrap gap-1">
                    ${uniqueL.map(m => `
                      <button type="button" onclick="navigateToLotteryPrediction(event, '${m.lottery}', '${m.slot}')"
                        class="px-1.5 py-0.5 rounded bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 hover:border-emerald-400 text-emerald-300 text-[9px] font-bold flex items-center gap-0.5 transition-all active:scale-95 cursor-pointer"
                        title="Bicho ${m.bichoName} é palpite em ${m.lottery} (${m.slot_name || m.slot})">
                        <span>🎰</span> <span>${m.lottery}</span>
                      </button>
                    `).join('')}
                  </div>
                </div>
              `;
            })()}

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
    const activeLots = (typeof window.getAnimalActiveLotteries === 'function')
      ? window.getAnimalActiveLotteries(a.g)
      : [];
    const hasActivePicks = activeLots.length > 0;

    const btnCls = isSelected
      ? 'bg-amber-500 text-slate-950 font-bold border-amber-400 shadow-sm'
      : (hasActivePicks
        ? 'bg-slate-800/90 hover:bg-slate-700 text-emerald-300 border-emerald-500/50 shadow-[0_0_8px_rgba(16,185,129,0.15)]'
        : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700/60');

    const fireBadge = hasActivePicks
      ? `<span class="text-[10px] text-emerald-400" title="Palpite ativo em: ${activeLots.map(l => l.lottery).join(', ')}">🔥</span>`
      : '';

    return `
      <button type="button" onclick="selectMatrizAnimal(${a.g})"
        class="px-2 py-1 rounded-lg text-xs flex items-center gap-1 border transition-all cursor-pointer active:scale-95 ${btnCls}">
        <span>${a.emoji}</span>
        <span>${a.name}</span>
        <span class="text-[9px] opacity-75">(${String(a.g).padStart(2, '0')})</span>
        ${fireBadge}
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

        <!-- Card Explicativo: Inteligência do Cruzamento Mestre -->
        <div class="p-3 rounded-xl bg-gradient-to-r from-amber-950/40 via-indigo-950/30 to-slate-900/60 border border-amber-500/30 flex items-start gap-2.5 shadow-sm">
          <span class="text-xl shrink-0 mt-0.5">🧠</span>
          <div class="space-y-0.5">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-bold text-amber-300">Inteligência do Cruzamento Mestre</span>
              <span class="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-200 text-[9px] font-mono uppercase tracking-wider font-bold">Alta Precisão</span>
            </div>
            <p class="text-[11px] text-slate-300 leading-relaxed">
              O algoritmo extrai os <strong>prefixos de maior força da Matriz</strong> (cabeças da centena e milhar) e cruza estrategicamente com as <strong>dezenas oficiais do ${animData.animal}</strong>. Conectando a energia do Dia e do Mês, cravamos milhares no 1º Prêmio com máxima assertividade!
            </p>
          </div>
        </div>

        <!-- Presença nos Palpites Oficiais das Loterias (Bancas Diárias & Federal Separada) -->
        ${(function() {
          const animalMatches = (typeof window.getAnimalActiveLotteries === 'function')
            ? window.getAnimalActiveLotteries(groupNum)
            : [];

          const dailyLots = ['RJ', 'LOOK', 'NACIONAL', 'SP', 'BAHIA', 'MINAS'];
          const fedMatch = animalMatches.find(m => m.lottery === 'FEDERAL');
          const dailyMatchesCount = animalMatches.filter(m => m.lottery !== 'FEDERAL').length;

          return `
            <div class="pt-3 border-t border-slate-800/80 space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>🎰</span> <span>Presença nos Palpites das Bancas Diárias:</span>
                </span>
                <span class="text-[11px] text-slate-400">
                  ${dailyMatchesCount > 0
                    ? `<span class="text-emerald-400 font-bold">🔥 Palpite Ativo no próximo horário</span>`
                    : '<span class="text-slate-500">Exclusivo na Chave Mestra</span>'}
                </span>
              </div>

              <!-- 4 Bancas Diárias (RJ, LOOK, NACIONAL, SP) -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                ${dailyLots.map(lot => {
                  const match = animalMatches.find(m => m.lottery === lot);
                  const lotData = (window._currentActiveLotteryPicks || {})[lot];
                  const slotName = (lotData && (lotData.slot_name || lotData.slot)) || 'Próximo';

                  if (match) {
                    return `
                      <div class="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/60 flex flex-col justify-between space-y-1.5 shadow-sm">
                        <div>
                          <div class="flex items-center justify-between">
                            <span class="text-xs font-black text-emerald-300">${lot}</span>
                            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">#${match.rank}</span>
                          </div>
                          <span class="text-[10px] text-emerald-400/90 block truncate font-medium">${match.slot_name || match.slot}</span>
                        </div>
                        <button type="button" onclick="navigateToLotteryPrediction(event, '${lot}', '${match.slot}')"
                          class="w-full py-1 px-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-[10px] flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm cursor-pointer">
                          <span>🚀</span> <span>Jogar ${lot}</span>
                        </button>
                      </div>
                    `;
                  } else {
                    return `
                      <div class="p-2 rounded-xl bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between space-y-1 opacity-60">
                        <div>
                          <div class="flex items-center justify-between">
                            <span class="text-xs font-bold text-slate-400">${lot}</span>
                            <span class="text-[9px] text-slate-500">-</span>
                          </div>
                          <span class="text-[10px] text-slate-500 block truncate">${slotName}</span>
                        </div>
                        <span class="text-[9px] text-slate-500 text-center py-1 italic">Fora do Top 5</span>
                      </div>
                    `;
                  }
                }).join('')}
              </div>

              <!-- Card Separado: Loteria Federal (Oficial Caixa) -->
              <div class="p-2.5 rounded-xl border ${fedMatch ? 'bg-amber-950/40 border-amber-500/60 shadow-sm' : 'bg-slate-950/40 border-slate-800/60 opacity-80'} flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex items-center gap-2.5">
                  <span class="text-xl">🏛️</span>
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="text-xs font-black text-white">Loteria Federal (Oficial Caixa)</span>
                      ${fedMatch ? `<span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Top #${fedMatch.rank} Recomendação</span>` : '<span class="text-[9px] text-slate-400 font-mono">Quarta e Sábado</span>'}
                    </div>
                    <span class="text-[10px] ${fedMatch ? 'text-amber-200/90 font-medium' : 'text-slate-400'} block">
                      ${fedMatch ? `🔥 Este bicho é recomendação oficial no sorteio da Federal (${fedMatch.slot_name || 'FED'})!` : 'Sorteios oficiais da Caixa Econômica Federal'}
                    </span>
                  </div>
                </div>
                <button type="button" onclick="navigateToLotteryPrediction(event, 'FEDERAL', 'FED')"
                  class="py-1 px-3 rounded-lg ${fedMatch ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold'} text-[10px] flex items-center justify-center gap-1 transition-all active:scale-95 shadow-sm cursor-pointer shrink-0">
                  <span>🏛️</span> <span>Ver Palpites da Federal</span>
                </button>
              </div>
            </div>
          `;
        })()}
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
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Centenas exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
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
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Milhares exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
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
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Milhares da Chave Mestra exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
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
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Centenas da Chave Mestra exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
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
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Centenas Diretas exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
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

/* ==========================================================================
   NAVEGAÇÃO DIRETA DE AUDITORIA & EXIBIÇÃO DE NÚMEROS EXTRAS NO CARD
   ========================================================================== */
window.toggleExtraGroupNumbers = function(containerId, btn, count) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const isHidden = container.classList.contains('hidden');
  if (isHidden) {
    container.classList.remove('hidden');
    if (btn) btn.innerHTML = '<span>▲ recolher</span>';
  } else {
    container.classList.add('hidden');
    if (btn) btn.innerHTML = `<span>+${count} mais</span>`;
  }
};

window.showAuditedPredictionBanner = function(lottery, slot, date) {
  const banner = document.getElementById('audited-prediction-banner');
  const label = document.getElementById('audited-banner-lottery-slot');
  if (banner && label) {
    const dtFormatted = date ? date.split('-').reverse().join('/') : 'Hoje';
    label.textContent = `${lottery} • ${slot} (${dtFormatted})`;
    banner.classList.remove('hidden');
  }
};

window.navigateToAuditedPredictionSpa = async function(lottery, slot, date, hitHundred = '', hitGroup = '') {
  const modal = document.getElementById('snapshot-modal');
  if (modal) modal.classList.add('hidden');
  const bingoModal = document.getElementById('modal-bingo-celebration');
  if (bingoModal) bingoModal.classList.add('hidden');
  const backdrop = document.getElementById('modal-bingo-backdrop');
  if (backdrop) backdrop.remove();

  const lot = (lottery || 'LOOK').toUpperCase();
  const slt = (slot || '').toUpperCase();

  if (hitHundred) window._targetHitCentena = hitHundred;
  if (hitGroup) window._targetHitGroup = hitGroup;

  currentLottery = lot;
  window.currentLottery = lot;
  localStorage.setItem('bicho_active_lottery', lot);
  window._userSelectedSlot = slt;

  if (date) {
    const targetDateEl = document.getElementById('target-date');
    if (targetDateEl) targetDateEl.value = date;
  }

  updateLotteryButtonsUI();
  await initSlotSelector(lot, slt, date);

  if (typeof window.switchScreen === 'function') {
    window.switchScreen('palpites', true);
  }

  const targetSlotEl = document.getElementById('target-slot');
  if (targetSlotEl && slt) {
    targetSlotEl.value = slt;
    const opt = Array.from(targetSlotEl.options).find(o => o.value === slt);
    if (opt) {
      opt.selected = true;
      const headerSlotName = document.getElementById('header-slot-name');
      if (headerSlotName) headerSlotName.textContent = opt.textContent;
      const homeNextSlot = document.getElementById('home-next-slot-name');
      if (homeNextSlot) homeNextSlot.textContent = opt.textContent;
    }
  }
  updateSlotPillsUI(slt);

  await loadPrediction(true);
  showAuditedPredictionBanner(lot, slt, date);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
window.navigateToAuditedPrediction = window.navigateToAuditedPredictionSpa;

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const plansModal = document.getElementById('modal-plans');
    if (plansModal && !plansModal.classList.contains('hidden')) {
      closePlansModal();
    }
  }
});


// =============================================================================
// IMPLEMENTAÇÃO COMPLETA DO RADAR 5x5 PRO
// =============================================================================

window.currentApsLottery = 'NACIONAL';
window.currentApsData = null;

function switchApsLottery(lottery) {
  window.currentApsLottery = lottery || 'NACIONAL';
  window.currentApsDrawId = null;
  
  // Atualiza pílulas do seletor
  const pills = document.querySelectorAll('.aps-lot-pill');
  pills.forEach(p => {
    const lot = p.getAttribute('data-aps-lot');
    if (lot === window.currentApsLottery) {
      p.className = 'aps-lot-pill px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer bg-amber-500 text-slate-950 border-amber-400 shadow-sm';
    } else {
      p.className = 'aps-lot-pill px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer bg-slate-800/90 text-slate-300 border-slate-700 hover:text-white';
    }
  });

  // Atualiza imediatamente o card da próxima extração
  if (typeof updateApsNextSlotUI === 'function') {
    updateApsNextSlotUI(window.currentApsLottery);
  }

  renderApsScreen(true);
}
window.switchApsLottery = switchApsLottery;

function refreshApsAnalysis() {
  renderApsScreen(true);
}
window.refreshApsAnalysis = refreshApsAnalysis;

function toggleApsLiveSimulator() {
  const panel = document.getElementById('aps-live-simulator-panel');
  if (panel) {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      const p1 = document.getElementById('sim-p1');
      if (p1) p1.focus();
    }
  }
}
window.toggleApsLiveSimulator = toggleApsLiveSimulator;

async function executeApsSimulation() {
  const p1 = document.getElementById('sim-p1')?.value?.trim();
  const p2 = document.getElementById('sim-p2')?.value?.trim();
  const p3 = document.getElementById('sim-p3')?.value?.trim();
  const p4 = document.getElementById('sim-p4')?.value?.trim();

  const prizes = [p1, p2, p3, p4].filter(p => p && p.length >= 3);
  if (prizes.length === 0) {
    showToast('Informe ao menos 1 milhar válida (ex: 2050)', 'error');
    return;
  }

  const topPedras = window.currentApsData?.pedras_analysis?.top_pedras || [8, 6, 3];

  try {
    const btn = document.querySelector('#aps-live-simulator-panel button');
    if (btn) btn.innerText = 'Calculando...';

    const simRes = await api.simulateAps(prizes, topPedras);
    
    // Atualiza 12 Ternos e 60 MC com o resultado simulado
    if (simRes && simRes.ternos_12) {
      renderApsTernos(simRes.ternos_12);
    }
    if (simRes && simRes.fechamento_60_mc) {
      renderAps60MC(simRes.fechamento_60_mc);
    }

    showToast('Simulação calculada com sucesso! Ternos e 60 MC atualizados.', 'success');
  } catch (err) {
    showToast(err.message || 'Erro na simulação.', 'error');
  } finally {
    const btn = document.querySelector('#aps-live-simulator-panel button');
    if (btn) btn.innerText = '🚀 Calcular Inversão, 12 Ternos e 60 MC';
  }
}
window.executeApsSimulation = executeApsSimulation;

window.currentApsDrawId = null;

async function renderApsScreen(forceRefresh = false) {
  const container = document.getElementById('view-aps');
  if (!container) return;

  const refreshBtn = document.getElementById('btn-aps-refresh');
  if (refreshBtn) refreshBtn.innerHTML = '<span>⏳</span> Carregando...';

  try {
    const data = await api.getApsMethod(window.currentApsLottery, null, window.currentApsDrawId);
    window.currentApsData = data;

    // 0. Renderiza Timeline / Seletor de Histórico do Radar 5x5
    renderApsDrawTimeline(data);

    // 1. Renderiza Alertas de Linha e Saturação
    renderApsQuickTarget(data);
    renderApsAlerts(data);

    // 2. Renderiza a Grade 5x5 Canônica
    renderApsGrid5x5(data);

    // 3. Renderiza Pedras de Centena Líderes
    renderApsPedras(data.pedras_analysis);

    // 4. Renderiza Ciclo D3
    renderApsD3(data.d3_cycle);

    // 5. Renderiza Bichos de Elite Selecionados
    renderApsEliteAnimals(data.elite_animals);

    // 6. Renderiza Centenas Cirúrgicas
    renderApsCentenas(data.centenas_cirurgicas);

    // 6.1. Renderiza Milhares Cirúrgicas por Bicho (MC de Elite)
    renderApsMilhares(data.milhares_cirurgicas);

    // 7. Renderiza 12 Ternos de Dezena
    renderApsTernos(data.ternos_de_dezena_12);

    // 8. Renderiza Fechamento 60 MC
    renderAps60MC(data.fechamento_60_mc);

  } catch (err) {
    console.error('Erro ao renderizar tela APS:', err);
    showToast('Erro ao carregar análise do Radar 5x5: ' + err.message, 'error');
  } finally {
    if (refreshBtn) refreshBtn.innerHTML = '<span>🔄</span> Atualizar Leitura';
  }
}
window.renderApsScreen = renderApsScreen;

function renderApsDrawTimeline(data) {
  const container = document.getElementById('aps-draws-timeline');
  const banner = document.getElementById('aps-historical-banner');
  const indicator = document.getElementById('aps-mode-indicator');
  if (!container) return;

  const draws = data.recent_draws_list || [];
  const selected = data.selected_draw || {};
  const isHistorical = !selected.is_live && selected.id;

  if (indicator) {
    if (isHistorical) {
      indicator.className = 'text-[10px] font-black text-amber-300 bg-amber-950/90 border border-amber-500/60 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm';
      indicator.innerHTML = `<span>🕒</span> <span>Histórico: ${selected.slot}</span>`;
    } else {
      indicator.className = 'text-[10px] font-black text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-sm';
      indicator.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> <span>Ao Vivo (Próximo)</span>`;
    }
  }

  let pillsHtml = `
    <button type="button" onclick="resetApsToLive()" class="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${!isHistorical ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black' : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:text-white hover:border-slate-500'}">
      <span class="w-2 h-2 rounded-full ${!isHistorical ? 'bg-slate-950 animate-pulse' : 'bg-emerald-400'}"></span>
      <span>Ao Vivo (Próximo)</span>
    </button>
  `;

  draws.forEach(d => {
    const isThisSelected = isHistorical && Number(selected.id) === Number(d.id);
    pillsHtml += `
      <button type="button" onclick="selectApsHistoricalDraw('${data.lottery}', ${d.id})" class="px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5 ${isThisSelected ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black ring-2 ring-amber-400/50' : 'bg-slate-900/90 text-slate-300 border-slate-700/80 hover:border-slate-500 hover:text-white'}">
        <span class="${isThisSelected ? 'text-slate-950 font-black' : 'text-amber-400'}">${d.slot}</span>
        <span class="font-mono text-[11px] ${isThisSelected ? 'text-slate-900 font-bold' : 'text-slate-200'}">${d.prize_1}</span>
        <span>${d.animal_emoji || '🐾'}</span>
      </button>
    `;
  });

  container.innerHTML = pillsHtml;

  if (banner) {
    if (isHistorical) {
      banner.classList.remove('hidden');
      banner.innerHTML = `
        <div class="flex items-start sm:items-center gap-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-lg shrink-0">
            🕒
          </div>
          <div class="space-y-0.5">
            <div class="text-xs font-black text-amber-200 flex items-center gap-2 flex-wrap">
              <span>Leitura Histórica do Radar 5×5 para: <strong class="text-white">${selected.lottery} (${selected.slot}) • ${selected.draw_date}</strong></span>
              <span class="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">Auditado Antes do Sorteio</span>
            </div>
            <div class="text-[11px] text-slate-300 flex items-center gap-1.5 flex-wrap">
              <span>Resultado Ocorrido:</span>
              <span class="font-mono font-black text-white bg-slate-950 px-1.5 py-0.5 rounded border border-slate-700">1º: ${selected.prize_1}</span>
              <span class="text-amber-300 font-bold">${selected.animal_1?.emoji || ''} ${selected.animal_1?.name || ''}</span>
              <span class="text-slate-500">•</span>
              <span class="text-slate-400">2º ${selected.prize_2} • 3º ${selected.prize_3} • 4º ${selected.prize_4} • 5º ${selected.prize_5}</span>
            </div>
          </div>
        </div>
        <button type="button" onclick="resetApsToLive()" class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-md transition-all cursor-pointer whitespace-nowrap self-end sm:self-center active:scale-95">
          🔄 Voltar p/ Ao Vivo
        </button>
      `;
    } else {
      banner.classList.add('hidden');
      banner.innerHTML = '';
    }
  }
}
window.renderApsDrawTimeline = renderApsDrawTimeline;

window.selectApsHistoricalDraw = function(lottery, drawId) {
  if (lottery) {
    window.currentApsLottery = lottery;
    const pills = document.querySelectorAll('.aps-lot-pill');
    pills.forEach(p => {
      const lot = p.getAttribute('data-aps-lot');
      if (lot === window.currentApsLottery) {
        p.className = 'aps-lot-pill px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer bg-amber-500 text-slate-950 border-amber-400 shadow-sm';
      } else {
        p.className = 'aps-lot-pill px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer bg-slate-800/90 text-slate-300 border-slate-700 hover:text-white';
      }
    });
  }
  window.currentApsDrawId = drawId;
  const viewAps = document.getElementById('view-aps');
  if (viewAps && viewAps.classList.contains('hidden') && typeof window.switchScreen === 'function') {
    window.switchScreen('aps');
  }
  renderApsScreen(true);
};

window.resetApsToLive = function() {
  window.currentApsDrawId = null;
  renderApsScreen(true);
};

window.openRadar5x5ForDraw = function(lottery, drawId, slot, date) {
  if (typeof window.closeSnapshotModal === 'function') {
    window.closeSnapshotModal();
  }
  const modal = document.getElementById('snapshot-modal');
  if (modal) modal.classList.add('hidden');

  if (typeof window.switchScreen === 'function') {
    window.switchScreen('aps');
  }
  if (typeof window.selectApsHistoricalDraw === 'function') {
    window.selectApsHistoricalDraw(lottery, drawId);
  }
};

function renderApsAlerts(data) {
  const container = document.getElementById('aps-alerts-container');
  if (!container) return;

  const grid = data.grid_analysis || {};
  const alertRows = grid.alert_rows || [];
  const saturatedRows = grid.saturated_rows || [];
  const alertCols = grid.alert_cols || [];

  let html = '';

  if (alertRows.length > 0) {
    alertRows.forEach(r => {
      const rData = grid.rows_status[r] || {};
      const animalsText = (rData.animals || []).join(', ');
      html += `
        <div class="rounded-xl p-3 bg-gradient-to-r from-rose-950/70 via-rose-900/30 to-slate-900 border border-rose-500/50 shadow-lg flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="text-xl">🚨</span>
            <div>
              <div class="text-xs font-black text-rose-300 tracking-wide uppercase">
                ALERTA MÁXIMO • LINHA ${r} ABERTA (${rData.absent_draws} rodadas ausente)
              </div>
              <div class="text-[11px] text-slate-300">
                Brecha de compensação na Linha ${r}: <strong>${animalsText}</strong>
              </div>
            </div>
          </div>
          <span class="text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-500 text-white shadow-sm shrink-0">FOCO TOTAL</span>
        </div>
      `;
    });
  }

  if (saturatedRows.length > 0) {
    const sList = saturatedRows.map(r => `Linha ${r}`).join(' e ');
    html += `
      <div class="rounded-xl p-3 bg-slate-900/90 border border-indigo-500/40 flex items-center justify-between gap-3">
        <div class="flex items-center gap-2.5">
          <span class="text-xl">⚡</span>
          <div>
            <div class="text-xs font-bold text-indigo-300 uppercase">
              SATURAÇÃO DETECTADA: ${sList}
            </div>
            <div class="text-[11px] text-slate-400">
              Concentração excessiva de saídas recentes. Alta probabilidade estatística de rotação para as linhas restantes.
            </div>
          </div>
        </div>
        <span class="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 shrink-0">ROTAÇÃO</span>
      </div>
    `;
  }

  if (alertCols.length > 0) {
    html += `
      <div class="rounded-xl p-2.5 bg-slate-900/80 border border-amber-500/30 flex items-center gap-2">
        <span class="text-sm">⚠️</span>
        <span class="text-[11px] text-amber-200">
          <strong>Colunas em Observação:</strong> Coluna(s) ${alertCols.join(', ')} sem premiação recente.
        </span>
      </div>
    `;
  }

  if (!html) {
    html = `
      <div class="rounded-xl p-2.5 bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-center gap-2">
        <span>✅</span> Grade em equilíbrio dinâmico. Monitorando movimentações da rodada.
      </div>
    `;
  }

  container.innerHTML = html;
}

function renderApsGrid5x5(data) {
  const container = document.getElementById('aps-grid-5x5-table');
  if (!container) return;

  const def = data.grid_definition || {};
  const analysis = data.grid_analysis || {};
  const rows = def.grid_rows || [];
  const alertRows = analysis.alert_rows || [];
  const saturatedRows = analysis.saturated_rows || [];
  const eliteGroups = (data.elite_animals || []).map(a => a.group);

  let html = '';

  rows.forEach(r => {
    const rIdx = r.row_index;
    const isAlert = alertRows.includes(rIdx);
    const isSat = saturatedRows.includes(rIdx);
    const rStatus = analysis.rows_status ? analysis.rows_status[rIdx] : {};
    
    let rowBorder = 'border-slate-800 bg-slate-950/40';
    let rowBadge = '<span class="text-[10px] text-slate-400 font-medium">Equilíbrio</span>';

    if (isAlert) {
      rowBorder = 'border-rose-500/50 bg-rose-950/20 shadow-md shadow-rose-950/30';
      rowBadge = `<span class="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/40">⚠️ ALERTA (${rStatus.absent_draws || 0} ausências)</span>`;
    } else if (isSat) {
      rowBorder = 'border-indigo-500/40 bg-indigo-950/20';
      rowBadge = `<span class="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-semibold border border-indigo-500/30">🔥 Saturada</span>`;
    }

    html += `
      <div class="rounded-xl border ${rowBorder} p-2.5 transition-all">
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-black text-amber-300 uppercase">Linha ${rIdx}</span>
            <span class="text-[11px] text-slate-400">(Grupos ${r.animals[0].group} a ${r.animals[4].group})</span>
          </div>
          <div>${rowBadge}</div>
        </div>

        <div class="grid grid-cols-5 gap-1.5 sm:gap-2">
    `;

    r.animals.forEach(anim => {
      const g = anim.group;
      const animStatus = analysis.animals_status ? analysis.animals_status[g] : {};
      const isElite = eliteGroups.includes(g);
      const isHit = animStatus && animStatus.absent_draws === 0;

      let cardStyle = 'bg-slate-900 border-slate-800 text-slate-300';
      let eliteTag = '';

      if (isElite) {
        cardStyle = 'bg-gradient-to-b from-amber-500/20 to-slate-900 border-amber-500/60 text-white shadow-lg shadow-amber-500/10 ring-1 ring-amber-400/40';
        eliteTag = '<span class="absolute -top-1 -right-1 text-[9px] bg-amber-500 text-slate-950 font-black px-1 rounded-full">⭐</span>';
      } else if (isHit) {
        cardStyle = 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200';
      } else if (isAlert) {
        cardStyle = 'bg-rose-950/20 border-rose-500/30 text-rose-100 hover:border-rose-400';
      }

      html += `
        <div class="relative rounded-lg border p-1.5 sm:p-2 text-center transition-all ${cardStyle}">
          ${eliteTag}
          <div class="text-base sm:text-lg mb-0.5">${anim.emoji || '🐾'}</div>
          <div class="text-[11px] sm:text-xs font-bold truncate">${anim.name}</div>
          <div class="text-[10px] text-amber-400 font-mono font-semibold">G${String(g).padStart(2, '0')}</div>
          <div class="text-[9px] text-slate-400 font-mono mt-0.5 truncate">${(anim.tens || []).join(' ')}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function renderApsPedras(pedrasData) {
  const podium = document.getElementById('aps-pedras-podium');
  const tbody = document.getElementById('aps-pedras-table-body');
  if (!podium || !pedrasData) return;

  const topPedras = pedrasData.top_pedras || [6, 8, 3];
  const ranking = pedrasData.pedras_ranking || [];

  // 1. Pódio compacto com as 3 pedras frias líderes
  let phtml = '';
  const medals = ['🥇', '🥈', '🥉'];
  topPedras.forEach((d, idx) => {
    const item = ranking.find(r => r.digit === d) || { digit: d, count: 0, absent_draws: 0, status: 'Vácuo' };
    phtml += `
      <div class="rounded-xl bg-gradient-to-b from-cyan-950/40 via-slate-900 to-slate-950 border border-cyan-500/40 p-2 text-center shadow-lg hover:border-cyan-400 transition-all">
        <div class="text-[11px] mb-0.5">${medals[idx] || '⭐'}</div>
        <div class="text-xl font-black text-cyan-300 font-mono tracking-tight">${d}</div>
        <div class="text-[9px] font-bold text-white uppercase mt-0.5">Pedra ${d}</div>
        <div class="text-[8px] text-cyan-400/90 font-mono font-semibold">${item.status || 'Vácuo Hoje'}</div>
      </div>
    `;
  });
  podium.innerHTML = phtml;

  // 2. Tabela Compacta dos 10 Dígitos (D3 -> D2 -> D1)
  if (tbody) {
    const sortedDigits = [...ranking].sort((a, b) => a.digit - b.digit);
    let rowsHtml = '';
    sortedDigits.forEach(item => {
      const isTop = topPedras.includes(item.digit);
      const isFria = item.category === 'fria';
      const isQuente = item.category === 'quente';

      const digitBadge = isTop 
        ? `<span class="inline-block w-5 h-5 rounded-full bg-cyan-500 text-slate-950 font-bold font-mono text-[10px] leading-5 text-center shadow-sm">${item.digit}</span>`
        : `<span class="font-mono font-bold ${isFria ? 'text-cyan-300' : isQuente ? 'text-rose-400' : 'text-slate-300'} text-[11px]">${item.digit}</span>`;

      const d1Badge = item.d1_count === 0 
        ? `<span class="font-mono text-cyan-300 font-bold">0x</span>`
        : item.d1_count >= 2
        ? `<span class="font-mono text-rose-400 font-bold">${item.d1_count}x</span>`
        : `<span class="font-mono text-slate-400">${item.d1_count}x</span>`;

      let diagBadge = '';
      if (isFria) {
        diagBadge = `<span class="inline-flex items-center gap-1 text-[9px] bg-cyan-950 text-cyan-300 border border-cyan-800/60 px-2 py-0.5 rounded-full font-mono font-semibold">🧊 ${item.status}</span>`;
      } else if (isQuente) {
        diagBadge = `<span class="inline-flex items-center gap-1 text-[9px] bg-rose-950 text-rose-300 border border-rose-800/60 px-2 py-0.5 rounded-full font-mono font-semibold">🔥 ${item.status}</span>`;
      } else {
        diagBadge = `<span class="inline-flex items-center gap-1 text-[9px] text-slate-400 font-mono">⚪ Equilibrada (1x)</span>`;
      }

      rowsHtml += `
        <tr class="hover:bg-slate-900/40 transition-colors">
          <td class="py-1 px-3 text-center">${digitBadge}</td>
          <td class="py-1 px-2 text-center font-mono text-slate-400">${item.d3_count !== undefined ? item.d3_count : '-'}x</td>
          <td class="py-1 px-2 text-center font-mono text-slate-400">${item.d2_count !== undefined ? item.d2_count : '-'}x</td>
          <td class="py-1 px-2 text-center">${d1Badge}</td>
          <td class="py-1 px-3 text-right">${diagBadge}</td>
        </tr>
      `;
    });
    tbody.innerHTML = rowsHtml;
  }
}

function renderApsD3(d3Data) {
  const container = document.getElementById('aps-d3-candidates-list');
  if (!container || !d3Data) return;

  const candidates = d3Data.d3_candidates || [];
  if (candidates.length === 0) {
    container.innerHTML = '<span class="text-xs text-slate-500">Nenhum bicho acumulado no ciclo D3.</span>';
    return;
  }

  let html = '';
  candidates.forEach(c => {
    html += `
      <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-950/60 text-indigo-200 border border-indigo-500/30">
        <span>${c.emoji || '🐾'}</span>
        <span>${c.name}</span>
        <span class="text-[10px] text-indigo-400 font-mono">(G${String(c.group).padStart(2, '0')})</span>
      </span>
    `;
  });
  container.innerHTML = html;
}

function renderApsEliteAnimals(eliteAnimals) {
  const container = document.getElementById('aps-elite-animals-container');
  if (!container || !eliteAnimals) return;

  const selDraw = window.currentApsData && window.currentApsData.selected_draw && !window.currentApsData.selected_draw.is_live ? window.currentApsData.selected_draw : null;
  const isVip = window.isUserVip();
  let html = '';
  eliteAnimals.forEach((anim, idx) => {
    const isWinningGroup = selDraw && selDraw.group === anim.group;
    // Se não for VIP, os animais a partir do 2º aparecem bloqueados com convite para assinar
    if (!isVip && idx > 0) {
      html += `
        <div onclick="openPlansModal()" class="rounded-xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-amber-500/40 p-3 shadow-xl relative overflow-hidden flex flex-col justify-between text-center cursor-pointer group hover:border-amber-400 transition-all select-none">
          <div class="w-8 h-8 mx-auto rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-base mb-1 text-amber-300">
            🔒
          </div>
          <div class="text-[9px] font-black uppercase text-amber-400 tracking-wider">#${idx + 1} DE ELITE</div>
          <div class="text-xs font-black text-white mt-0.5 filter blur-[3px]">🐾 Bicho VIP</div>
          <p class="text-[10px] text-slate-400 mt-1 leading-tight">
            Animal com alta pontuação de ciclo.
          </p>
          <button type="button" class="mt-2 w-full py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-[10px] shadow-sm group-hover:scale-102 transition-transform">
            Liberar VIP ⭐
          </button>
        </div>
      `;
      return;
    }

    const reasonsHtml = (anim.reasons || []).map(r => `
      <div class="text-[9px] text-slate-400 flex items-start gap-1 leading-snug">
        <span class="text-amber-400 shrink-0">•</span>
        <span>${r}</span>
      </div>
    `).join('');

    html += `
      <div class="rounded-xl bg-gradient-to-b ${isWinningGroup ? 'from-emerald-950/40 via-slate-900 to-slate-950 border-2 border-emerald-400 shadow-emerald-950/50 ring-2 ring-emerald-500/40' : 'from-slate-800/90 to-slate-950 border border-amber-500/40'} p-3 shadow-xl relative overflow-hidden flex flex-col justify-between hover:border-amber-400 transition-all">
        <div class="absolute top-0 right-0 w-16 h-16 ${isWinningGroup ? 'bg-emerald-500/20' : 'bg-amber-500/10'} rounded-full blur-xl pointer-events-none"></div>
        <div>
          <!-- Topo: Badge compacta e Score alinhados sem quebrar -->
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-[9px] font-black px-1.5 py-0.5 rounded ${isWinningGroup ? 'bg-emerald-500 text-slate-950 ring-1 ring-emerald-300 shadow animate-pulse' : 'bg-amber-500 text-slate-950'} tracking-tight uppercase">
              ${isWinningGroup ? '🎯 1º PRÊMIO DEU ELE!' : '#' + (idx + 1) + ' ELITE'}
            </span>
            <span class="text-[11px] font-mono font-bold text-amber-300">
              ${anim.aps_score} pts
            </span>
          </div>

          <!-- Animal: Emoji + Nome + Grupo -->
          <div class="flex items-center gap-2 mb-2">
            <span class="text-2xl">${anim.emoji || '🐾'}</span>
            <div class="min-w-0">
              <div class="text-sm font-black text-white truncate leading-tight">${anim.name}</div>
              <div class="text-[10px] text-amber-400 font-mono font-bold truncate">G${String(anim.group).padStart(2, '0')} • Linha ${anim.row}</div>
            </div>
          </div>

          <!-- Dezenas: linha limpa -->
          <div class="text-[11px] font-mono text-slate-300 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 mb-2 flex items-center justify-between">
            <span class="text-[9px] text-slate-400 font-sans uppercase font-bold">Dezenas:</span>
            <strong class="text-slate-100 tracking-wider">${(anim.tens || []).join(' • ')}</strong>
          </div>

          <!-- Milhares de Elite (MC): Grade compacta e direta -->
          <div class="bg-amber-500/10 border border-amber-500/30 rounded-lg p-1.5 mb-1.5">
            <div class="flex items-center justify-between text-[10px] text-amber-300 font-bold mb-1">
              <span class="flex items-center gap-1"><span>🎯</span> <span>Milhares (MC):</span></span>
              <span class="text-[9px] text-slate-400 font-normal">copiar</span>
            </div>
            <div class="grid grid-cols-2 gap-1 font-mono text-center">
              ${(anim.main_milhares || []).map(m => `
                <button type="button" onclick="copyTextToClipboard('${m}', 'Milhar ${m} copiada!')" class="py-1 px-1 bg-slate-900 border border-amber-500/30 hover:border-amber-400 hover:bg-amber-500 hover:text-slate-950 text-amber-300 rounded text-xs font-bold transition-all cursor-pointer select-all shadow-sm">
                  ${m}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Motivo colapsável (não polui a tela, mas fica acessível) -->
          <details class="text-[10px] text-slate-400 group pt-0.5">
            <summary class="cursor-pointer text-[9px] text-slate-500 hover:text-amber-400 flex items-center gap-1 select-none">
              <span>ℹ️</span> <span>Por que este bicho?</span>
            </summary>
            <div class="space-y-0.5 mt-1 text-[9px] text-slate-300 pl-1 border-l border-slate-800">
              ${reasonsHtml}
            </div>
          </details>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
function renderApsCentenas(centenasData) {
  const container = document.getElementById('aps-centenas-cirurgicas-container');
  if (!container || !centenasData) return;

  const selDraw = window.currentApsData && window.currentApsData.selected_draw && !window.currentApsData.selected_draw.is_live ? window.currentApsData.selected_draw : null;
  const winC1 = selDraw && selDraw.prize_1 ? String(selDraw.prize_1).slice(-3) : null;

  const isVip = window.isUserVip();
  if (!isVip) {
    container.innerHTML = `
      <div onclick="openPlansModal()" class="rounded-2xl bg-gradient-to-b from-amber-500/10 via-slate-900/95 to-slate-950 border-2 border-amber-500/50 p-5 sm:p-6 text-center shadow-xl space-y-3 cursor-pointer group hover:border-amber-400 transition-all col-span-full">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
          🔒
        </div>
        <div>
          <div class="text-sm sm:text-base font-black text-white">Centenas Cirúrgicas Bloqueadas</div>
          <p class="text-xs text-slate-300 mt-1 max-w-md mx-auto leading-relaxed">
            As centenas armadas nas <strong>Pedras Frias</strong> dos bichos de elite são exclusivas para membros VIP.
          </p>
        </div>
        <div class="flex items-center justify-center gap-1.5 filter blur-[4px] select-none opacity-40">
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">057</span>
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">958</span>
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">359</span>
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">029</span>
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">930</span>
        </div>
        <div class="pt-1">
          <button type="button" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black text-xs shadow-lg shadow-emerald-950/50 group-hover:scale-105 transition-transform">
            Desbloquear Centenas VIP (R$ 14,90/mês) ➔
          </button>
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  centenasData.forEach(item => {
    const hasHitCentena = winC1 && (item.centenas || []).includes(winC1);
    const centenasBadges = (item.centenas || []).map(c => {
      const isHit = winC1 && c === winC1;
      return `<span class="font-mono text-xs ${isHit ? 'font-black px-2.5 py-1 rounded bg-emerald-500 text-slate-950 border border-emerald-300 ring-2 ring-emerald-400 select-all shadow-lg animate-pulse' : 'font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800'} select-all hover:border-amber-400/50 transition-all">${isHit ? '🎯 ' + c : c}</span>`;
    }).join('');

    html += `
      <div class="rounded-xl ${hasHitCentena ? 'bg-emerald-950/30 border-2 border-emerald-500/80 shadow-emerald-950/40 ring-1 ring-emerald-500/30' : 'bg-slate-950/60 border border-slate-800'} p-3.5 flex flex-col justify-between transition-all">
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <span class="text-lg">${item.emoji || '🐾'}</span>
              <span class="text-xs font-black text-white">${item.name} (G${String(item.group).padStart(2, '0')})</span>
              ${hasHitCentena ? '<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 uppercase tracking-tight shadow">🎯 CRAVADA!</span>' : ''}
            </div>
            <span class="text-[10px] text-slate-400">Pedras: <strong class="text-amber-300">${(item.pedras || []).join(', ')}</strong></span>
          </div>

          <div class="flex flex-wrap gap-1.5 mb-2">
            ${centenasBadges}
          </div>
        </div>

        <button type="button" onclick="copyTextToClipboard('${(item.centenas || []).join(', ')}', 'Centenas do ${item.name} copiadas!')" class="mt-2 w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-bold transition-all cursor-pointer">
          📋 Copiar Centenas do ${item.name}
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
}

function copyApsCentenas() {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Centenas Cirúrgicas exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
  if (!window.currentApsData || !window.currentApsData.centenas_cirurgicas) return;

  const lines = [
    `⚡ CENTENAS CIRÚRGICAS - RADAR 5X5`,
    `Loteria: ${window.currentApsLottery || 'NACIONAL'}`,
    ''
  ];

  window.currentApsData.centenas_cirurgicas.forEach(item => {
    lines.push(`${item.emoji || '🐾'} ${item.name} (Grupo ${String(item.group).padStart(2, '0')}):`);
    lines.push((item.centenas || []).join(', '));
    lines.push('');
  });

  copyTextToClipboard(lines.join('\n').trim(), 'Centenas Cirúrgicas copiadas para WhatsApp!');
}
window.copyApsCentenas = copyApsCentenas;

function renderApsMilhares(milharesData) {
  const container = document.getElementById('aps-milhares-cirurgicas-container');
  if (!container || !milharesData) return;

  const selDraw = window.currentApsData && window.currentApsData.selected_draw && !window.currentApsData.selected_draw.is_live ? window.currentApsData.selected_draw : null;
  const winM1 = selDraw && selDraw.prize_1 ? String(selDraw.prize_1).padStart(4, '0') : null;
  const isVip = window.isUserVip();
  if (!isVip) {
    container.innerHTML = `
      <div onclick="openPlansModal()" class="rounded-2xl bg-gradient-to-b from-amber-500/10 via-slate-900/95 to-slate-950 border-2 border-amber-500/50 p-5 sm:p-6 text-center shadow-xl space-y-3 cursor-pointer group hover:border-amber-400 transition-all col-span-full">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
          🔒
        </div>
        <div>
          <div class="text-sm sm:text-base font-black text-white">Milhares Cirúrgicas por Bicho Bloqueadas</div>
          <p class="text-xs text-slate-300 mt-1 max-w-md mx-auto leading-relaxed">
            As milhares armadas nas <strong>Pedras Líderes</strong> de cada animal de elite são 100% exclusivas para membros VIP.
          </p>
        </div>
        <div class="flex items-center justify-center gap-1.5 filter blur-[4px] select-none opacity-40">
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">1033</span>
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">0134</span>
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">1235</span>
          <span class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800">2036</span>
        </div>
        <div class="pt-1">
          <button type="button" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-950/50 group-hover:scale-105 transition-transform">
            Desbloquear Milhares VIP (R$ 14,90/mês) ➔
          </button>
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  milharesData.forEach(item => {
    const hasHitMilhar = winM1 && (item.milhares || []).includes(winM1);
    const milharesBadges = (item.milhares || []).map(m => `
      <span onclick="copyTextToClipboard('${m}', 'Milhar ${m} copiada!')" class="font-mono text-xs font-bold px-2 py-1 rounded bg-slate-950 text-amber-300 border border-slate-800 select-all hover:border-amber-400 hover:text-amber-200 transition-all cursor-pointer" title="Clique para copiar">${m}</span>
    `).join('');

    const formattedCopy = `${item.emoji || '🐾'} ${item.name} (G${String(item.group).padStart(2, '0')}): ${(item.milhares || []).join(', ')}`;

    html += `
      <div class="rounded-xl ${hasHitMilhar ? 'bg-emerald-950/30 border-2 border-emerald-500/80 shadow-emerald-950/40 ring-1 ring-emerald-500/30' : 'bg-slate-950/60 border border-slate-800'} p-3.5 flex flex-col justify-between transition-all">
        <div>
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-1.5">
              <span class="text-lg">${item.emoji || '🐾'}</span>
              <span class="text-xs font-black text-white">${item.name} (G${String(item.group).padStart(2, '0')})</span>
              ${hasHitMilhar ? '<span class="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 uppercase tracking-tight shadow">🎯 CRAVADA!</span>' : ''}
            </div>
            <span class="text-[10px] text-slate-400">Pedras: <strong class="text-amber-300">${(item.pedras || []).join(', ')}</strong></span>
          </div>

          <div class="flex flex-wrap gap-1.5 mb-2">
            ${milharesBadges}
          </div>
        </div>

        <button type="button" onclick="copyTextToClipboard('${formattedCopy}', 'Milhares do ${item.name} copiadas!')" class="mt-2 w-full py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[11px] font-bold border border-slate-700 flex items-center justify-center gap-1.5 transition-all cursor-pointer">
          <span>📋</span> Copiar Milhares (${(item.milhares || []).length})
        </button>
      </div>
    `;
  });

  container.innerHTML = html;
}
window.renderApsMilhares = renderApsMilhares;
function switchApsModalidade(tab) {
  const modalidadeTabs = ['milhares', 'centenas', 'ternos', '60mc'];
  modalidadeTabs.forEach(t => {
    const el = document.getElementById(`aps-modalidade-${t}`);
    const btn = document.getElementById(`tab-btn-aps-${t}`);
    if (el) {
      if (t === tab) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
    if (btn) {
      if (t === tab) {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow-sm cursor-pointer whitespace-nowrap';
      } else {
        btn.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-400 hover:text-white cursor-pointer whitespace-nowrap';
      }
    }
  });
}
window.switchApsModalidade = switchApsModalidade;

function copyApsTernos() {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('12 Ternos de Dezena exclusivos para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
  if (!window.currentApsData || !window.currentApsData.ternos_de_dezena_12) return;

  const lines = [
    `🎲 12 TERNOS DE DEZENA - RADAR 5X5`,
    `Loteria: ${window.currentApsLottery || 'NACIONAL'}`,
    ''
  ];

  window.currentApsData.ternos_de_dezena_12.forEach((t, idx) => {
    const arr = t.terno || t || [];
    lines.push(`Terno #${idx + 1}: ${arr.join(' - ')}`);
  });

  copyTextToClipboard(lines.join('\n').trim(), '12 Ternos copiados para WhatsApp!');
}
window.copyApsTernos = copyApsTernos;


function copyAllApsMilhares() {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Milhares de Elite exclusivas para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
  if (!window.currentApsData || !window.currentApsData.milhares_cirurgicas) return;

  const lines = [
    `🎯 MILHARES CIRÚRGICAS - RADAR 5X5`,
    `Loteria: ${window.currentApsLottery || 'NACIONAL'}`,
    ''
  ];

  window.currentApsData.milhares_cirurgicas.forEach(item => {
    lines.push(`${item.emoji || '🐾'} ${item.name} (Grupo ${String(item.group).padStart(2, '0')}):`);
    lines.push((item.milhares || []).join(', '));
    lines.push('');
  });

  copyTextToClipboard(lines.join('\n').trim(), 'Todas as Milhares do Radar copiadas para WhatsApp!');
}
window.copyAllApsMilhares = copyAllApsMilhares;

function renderApsTernos(ternos) {
  const container = document.getElementById('aps-ternos-list');
  if (!container || !ternos) return;

  const isVip = window.isUserVip();
  if (!isVip) {
    container.innerHTML = `
      <div onclick="openPlansModal()" class="p-6 rounded-2xl bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950 border-2 border-amber-500/50 text-center shadow-xl space-y-3 cursor-pointer group hover:border-amber-400 transition-all col-span-full select-none">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-2xl text-amber-300 shadow-lg shadow-amber-500/20">
          🔒
        </div>
        <div>
          <div class="text-sm sm:text-base font-black text-white">12 Ternos de Dezena Bloqueados</div>
          <p class="text-xs text-slate-300 mt-1 max-w-sm mx-auto leading-relaxed">
            As combinações de dezenas dos animais em alerta são 100% exclusivas para membros VIP.
          </p>
        </div>
        <div class="pt-1">
          <button type="button" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs shadow-md group-hover:scale-105 transition-transform">
            Desbloquear Ternos VIP (R$ 14,90/mês) ⭐
          </button>
        </div>
      </div>
    `;
    return;
  }

  let html = '';
  ternos.forEach((t, idx) => {
    html += `
      <div class="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/40 transition-all">
        <span class="text-[10px] font-mono text-slate-500 font-bold">#${String(idx + 1).padStart(2, '0')}</span>
        <span class="font-mono text-xs font-bold text-amber-300 tracking-wider">${t}</span>
        <button type="button" onclick="copyTextToClipboard('${t}', 'Terno copiado!')" class="text-[10px] text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 cursor-pointer">📋</button>
      </div>
    `;
  });

  container.innerHTML = html;
}

function getAnimalForMC(mc) {
  const s = String(mc).padStart(4, '0').trim();
  const dezena = parseInt(s.slice(-2), 10);
  const grp = dezena === 0 ? 25 : Math.floor((dezena - 1) / 4) + 1;
  const bicho = (typeof ALL_ANIMALS_CATALOG !== 'undefined')
    ? ALL_ANIMALS_CATALOG.find(a => a.group === grp)
    : null;
  return {
    group: grp,
    name: bicho ? bicho.name : `Grupo ${grp}`,
    emoji: bicho ? bicho.emoji : '🐾'
  };
}

function groupMCsByAnimal(mcList) {
  const map = new Map();
  (mcList || []).forEach(m => {
    const s = String(m).padStart(4, '0').trim();
    if (!s) return;
    const a = getAnimalForMC(s);
    if (!map.has(a.group)) {
      map.set(a.group, {
        animal: a,
        mcs: []
      });
    }
    map.get(a.group).mcs.push(s);
  });
  const sorted = Array.from(map.values()).sort((a, b) => a.animal.group - b.animal.group);
  sorted.forEach(g => {
    g.mcs.sort((x, y) => parseInt(x, 10) - parseInt(y, 10));
  });
  return sorted;
}

// RESTAURADO: Visual original idêntico da grade compacta de 60 MC
function renderAps60MC(mcList) {
  const container = document.getElementById('aps-60mc-container');
  const countEl = document.getElementById('aps-60mc-count');
  if (!container || !mcList) return;

  if (countEl) countEl.innerText = mcList.length;

  const isVip = window.isUserVip();
  if (!isVip) {
    container.innerHTML = `
      <div onclick="openPlansModal()" class="w-full p-6 rounded-2xl bg-gradient-to-b from-amber-500/15 via-slate-900 to-slate-950 border-2 border-amber-500/50 text-center shadow-xl space-y-3 cursor-pointer group hover:border-amber-400 transition-all select-none">
        <div class="w-12 h-12 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/60 flex items-center justify-center text-2xl text-amber-300 shadow-lg shadow-amber-500/20">
          🔒
        </div>
        <div>
          <div class="text-sm sm:text-base font-black text-white">Fechamento Completo 60 MC Bloqueado</div>
          <p class="text-xs text-slate-300 mt-1 max-w-sm mx-auto leading-relaxed">
            Todas as 60 Milhares e Centenas fechadas são 100% exclusivas para assinantes VIP.
          </p>
        </div>
        <div class="pt-1">
          <button type="button" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs shadow-md group-hover:scale-105 transition-transform">
            Desbloquear 60 MC no VIP (R$ 14,90/mês) ⭐
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = mcList.map(m => `
    <span class="inline-block px-1.5 py-0.5 m-0.5 rounded bg-slate-900 border border-slate-800 font-mono font-bold text-amber-300 hover:border-amber-400/60 select-all cursor-pointer" onclick="copyTextToClipboard('${m}', 'MC copiada!')">${m}</span>
  `).join('');
}
window.renderAps60MC = renderAps60MC;

// Copiar 60 MC: ao copiar, já vem separado por bicho com mensagem 'MC RADAR 5X5'
function copyAps60MC() {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Fechamento 60 MC exclusivo para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
  if (!window.currentApsData || !window.currentApsData.fechamento_60_mc) return;

  const mcList = window.currentApsData.fechamento_60_mc || [];
  const grouped = groupMCsByAnimal(mcList);

  const lines = [
    `💥 MC RADAR 5X5`,
    ''
  ];

  grouped.forEach(g => {
    lines.push(`${g.animal.emoji} ${g.animal.name} (G${String(g.animal.group).padStart(2, '0')}):`);
    lines.push(g.mcs.join(' - '));
    lines.push('');
  });

  copyTextToClipboard(lines.join('\n').trim(), '60 MC copiadas separadas por bicho!');
}
window.copyAps60MC = copyAps60MC;

function copyTextToClipboard(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg || 'Copiado para a área de transferência!', 'success');
    }).catch(() => {
      fallbackCopy(text, successMsg);
    });
  } else {
    fallbackCopy(text, successMsg);
  }
}
window.copyTextToClipboard = copyTextToClipboard;

function fallbackCopy(text, successMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast(successMsg || 'Copiado para a área de transferência!', 'success');
  } catch(e) {
    showToast('Falha ao copiar.', 'error');
  }
  document.body.removeChild(ta);
}

// =============================================================================
// SUB-ABAS E CARD RÁPIDO DO RADAR 5x5
// =============================================================================

function switchApsSubTab(tab) {
  const tabs = ['apostas', 'grade', 'pedras'];
  tabs.forEach(t => {
    const el = document.getElementById(`aps-subtab-${t}`);
    const btn = document.getElementById(`subtab-btn-${t}`);
    if (el) {
      if (t === tab) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
    if (btn) {
      if (t === tab) {
        btn.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow-md';
      } else {
        btn.className = 'flex-1 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition-all';
      }
    }
  });
}
window.switchApsSubTab = switchApsSubTab;

function renderApsQuickTarget(data) {
  const container = document.getElementById('aps-quick-target-content');
  if (!container || !data) return;

  // Atualiza indicador e contagem regressiva da próxima extração
  if (typeof updateApsNextSlotUI === 'function') {
    updateApsNextSlotUI(data.lottery || window.currentApsLottery);
  }

  const top3 = (data.elite_animals || []).slice(0, 3);
  const topPedras = data.pedras_analysis?.top_pedras || [8, 6, 3];
  const p1 = topPedras[0] !== undefined ? topPedras[0] : 8;
  // Terno de Ouro: Puxa 1 dezena forte de cada um dos 3 Bichos de Ouro da rodada
  let topTerno = '';
  if (top3.length >= 3) {
    const d1 = (top3[0].tens || [])[0] || '';
    const d2 = (top3[1].tens || [])[0] || '';
    const d3 = (top3[2].tens || [])[0] || '';
    topTerno = `${d1} - ${d2} - ${d3}`;
  } else {
    const ternos = data.ternos_de_dezena_12 || [];
    topTerno = ternos[0] || '02 - 34 - 52';
  }

  const isVip = window.isUserVip();

  let bichosHtml = '';
  if (!isVip) {
    const a1 = top3[0];
    bichosHtml = `
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 text-xs font-bold">
        <span>${a1?.emoji || '🐾'}</span>
        <span>${a1?.name || 'Bicho #1'}</span>
        <span class="text-[10px] text-amber-400 font-mono font-normal">G${String(a1?.group || 1).padStart(2, '0')}</span>
      </span>
      <span onclick="openPlansModal()" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 border border-amber-500/40 text-amber-400 text-xs font-bold cursor-pointer hover:border-amber-400 select-none">
        <span>🔒</span> <span>Bicho #2 (VIP)</span>
      </span>
      <span onclick="openPlansModal()" class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900 border border-amber-500/40 text-amber-400 text-xs font-bold cursor-pointer hover:border-amber-400 select-none">
        <span>🔒</span> <span>Bicho #3 (VIP)</span>
      </span>
    `;
  } else {
    bichosHtml = top3.map((a, idx) => `
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 text-xs font-bold">
        <span>${a.emoji || '🐾'}</span>
        <span>${a.name}</span>
        <span class="text-[10px] text-amber-400 font-mono font-normal">G${String(a.group).padStart(2, '0')}</span>
      </span>
    `).join('');
  }

  // Centenas de Ouro
  let centenasHtml = '';
  if (!isVip) {
    centenasHtml = `
      <div onclick="openPlansModal()" class="cursor-pointer text-amber-400 text-xs font-bold py-1 select-none flex items-center gap-1">
        <span>🔒</span> <span>Centenas Cirúrgicas (Exclusivo VIP)</span>
      </div>
    `;
  } else {
    const goldCentenas = [];
    top3.forEach(a => {
      (a.tens || []).slice(0, 2).forEach(d => goldCentenas.push(`${p1}${d}`));
    });
    centenasHtml = `
      <div class="flex flex-wrap gap-1 font-mono text-xs font-black text-amber-300">
        ${goldCentenas.map(c => `<span class="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">${c}</span>`).join('')}
      </div>
    `;
  }

  // Terno de Ouro
  let ternoHtml = '';
  if (!isVip) {
    ternoHtml = `
      <div onclick="openPlansModal()" class="cursor-pointer text-amber-400 text-xs font-bold py-1 select-none flex items-center gap-1">
        <span>🔒</span> <span>Terno de Ouro (Exclusivo VIP)</span>
      </div>
    `;
  } else {
    ternoHtml = `
      <div class="font-mono text-xs font-black text-emerald-300 tracking-wider pt-0.5">
        ${topTerno}
      </div>
      <div class="text-[10px] text-slate-400 mt-1">1 dezena chave de cada Bicho de Ouro (#1, #2 e #3)</div>
    `;
  }

  container.innerHTML = `
    <!-- COLUNA 1: BICHOS DE OURO -->
    <div class="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <span>🥇</span> Bichos de Ouro da Rodada
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${bichosHtml}
      </div>
    </div>

    <!-- COLUNA 2: CENTENAS DE OURO -->
    <div class="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <span>💎</span> Centenas Cirúrgicas (Pedra ${p1})
      </div>
      ${centenasHtml}
    </div>

    <!-- COLUNA 3: TERNO PRINCIPAL -->
    <div class="rounded-xl bg-slate-950/70 border border-slate-800 p-3">
      <div class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <span>🎲</span> Terno de Ouro
      </div>
      ${ternoHtml}
    </div>
  `;
}
window.renderApsQuickTarget = renderApsQuickTarget;

function copyApsQuickTarget() {
  if (!window.isUserVip()) {
    openPlansModal();
    showToast('Palpite de Ouro exclusivo para assinantes VIP! Assine por R$ 14,90/mês.', 'warning');
    return;
  }
  if (!window.currentApsData) {
    showToast('Aguarde o carregamento do Radar 5x5', 'error');
    return;
  }

  const d = window.currentApsData;
  const top3 = (d.elite_animals || []).slice(0, 3);
  const topPedras = d.pedras_analysis?.top_pedras || [8, 6, 3];
  const p1 = topPedras[0];
  
  let terno = '';
  if (top3.length >= 3) {
    const d1 = (top3[0].tens || [])[0] || '';
    const d2 = (top3[1].tens || [])[0] || '';
    const d3 = (top3[2].tens || [])[0] || '';
    terno = `${d1} - ${d2} - ${d3}`;
  } else {
    terno = (d.ternos_de_dezena_12 || [])[0] || '';
  }

  const goldCentenas = [];
  top3.forEach(a => {
    (a.tens || []).slice(0, 2).forEach(dez => goldCentenas.push(`${p1}${dez}`));
  });

  const lotCode = window.currentApsLottery || d.lottery || 'NACIONAL';
  let slotLine = '';
  if (typeof getApsUpcomingSlotInfo === 'function') {
    const slotInfo = getApsUpcomingSlotInfo(lotCode);
    if (slotInfo) {
      slotLine = `⏰ EXTRAÇÃO ALVO: ${slotInfo.targetTime} (${slotInfo.targetName} - ${slotInfo.lotteryName}) • ${slotInfo.countdown}`;
    }
  }

  const msg = [
    `🎯 RADAR 5x5 • PALPITE DE OURO (${(d.lottery || lotCode).toUpperCase()})`,
    ...(slotLine ? [slotLine] : []),
    `🐾 Bichos: ${top3.map(a => `${a.name} (G${String(a.group).padStart(2,'0')})`).join(', ')}`,
    `💎 Centenas Fortes: ${goldCentenas.join(' - ')}`,
    `🎲 Terno de Dezena: ${terno}`,
    '',
    '📊 Gerado por: Radar 5×5 Pro'
  ].join('\n');

  copyTextToClipboard(msg, 'Palpite de Ouro copiado com horário do sorteio alvo!');
}
window.copyApsQuickTarget = copyApsQuickTarget;


// =============================================================================
// CRONOGRAMA OFICIAL DAS LOTERIAS & INDICADOR DA PRÓXIMA EXTRAÇÃO
// =============================================================================

const APS_LOTTERY_SCHEDULES = {
  'RJ': {
    name: 'Rio de Janeiro',
    shortName: 'RJ',
    slots: [
      { code: 'PPT', name: 'PPT', time: '09:20' },
      { code: 'PTM', name: 'PTM', time: '11:20' },
      { code: 'PT',  name: 'PT',  time: '14:20' },
      { code: 'PTV', name: 'PTV', time: '16:20' },
      { code: 'PTN', name: 'PTN', time: '18:20' },
      { code: 'COR', name: 'Coruja', time: '21:20' }
    ]
  },
  'LOOK': {
    name: 'Look Loterias',
    shortName: 'LOOK',
    slots: [
      { code: 'LK-07', name: '07h', time: '07:20' },
      { code: 'LK-09', name: '09h', time: '09:20' },
      { code: 'LK-11', name: '11h', time: '11:20' },
      { code: 'LK-14', name: '14h', time: '14:20' },
      { code: 'LK-16', name: '16h', time: '16:20' },
      { code: 'LK-18', name: '18h', time: '18:20' },
      { code: 'LK-21', name: '21h', time: '21:20' },
      { code: 'LK-23', name: '23h', time: '23:20' }
    ]
  },
  'NACIONAL': {
    name: 'Loteria Nacional',
    shortName: 'Nacional',
    slots: [
      { code: 'LN-02', name: '02h', time: '02:00' },
      { code: 'LN-08', name: '08h', time: '08:00' },
      { code: 'LN-10', name: '10h', time: '10:00' },
      { code: 'LN-12', name: '12h', time: '12:00' },
      { code: 'LN-15', name: '15h', time: '15:00' },
      { code: 'LN-17', name: '17h', time: '17:00' },
      { code: 'LN-19', name: '19h', time: '19:00' },
      { code: 'LN-21', name: '21h', time: '21:00' },
      { code: 'LN-23', name: '23h', time: '23:00' }
    ]
  },
  'SP': {
    name: 'São Paulo',
    shortName: 'SP',
    slots: [
      { code: 'SP-08', name: 'PT 08h', time: '08:20' },
      { code: 'SP-09', name: 'PT 09h', time: '09:00' },
      { code: 'SP-10', name: 'PT 10h', time: '10:00' },
      { code: 'SP-12', name: 'PT 12h', time: '12:20' },
      { code: 'SP-13', name: 'PT 13h', time: '13:00' },
      { code: 'SP-15', name: 'BAND 15h', time: '15:30' },
      { code: 'SP-17', name: 'PT 17h', time: '17:00' },
      { code: 'SP-19', name: 'PT 19h', time: '19:00' },
      { code: 'SP-20', name: 'PTN 20h', time: '20:00' }
    ]
  },
  'BAHIA': {
    name: 'Bahia (Paratodos)',
    shortName: 'Bahia',
    slots: [
      { code: 'BA-10', name: 'PT 10h', time: '10:00' },
      { code: 'BA-12', name: 'PT 12h', time: '12:00' },
      { code: 'BA-15', name: 'PT 15h', time: '15:00' },
      { code: 'BA-19', name: 'PT 19h', time: '19:00' },
      { code: 'BA-21', name: 'Coruja 21h', time: '21:00' }
    ]
  },
  'MINAS': {
    name: 'Minas Gerais',
    shortName: 'Minas',
    slots: [
      { code: 'MG-12', name: 'Alvorada 11h', time: '11:00' },
      { code: 'MG-15', name: 'Minas Dia 15h', time: '15:00' },
      { code: 'MG-19', name: 'Minas Noite 19h', time: '19:00' },
      { code: 'MG-21', name: 'Pref. 21h', time: '21:00' }
    ]
  },
  'FEDERAL': {
    name: 'Loteria Federal',
    shortName: 'Federal',
    slots: [
      { code: 'FED-11', name: 'Federal 11h', time: '11:00' },
      { code: 'FED-19', name: 'Federal 19h', time: '19:00' }
    ]
  }
};
window.APS_LOTTERY_SCHEDULES = APS_LOTTERY_SCHEDULES;

function getBrazilDate() {
  try {
    const s = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    return new Date(s);
  } catch (e) {
    return new Date();
  }
}
window.getBrazilDate = getBrazilDate;

function getApsUpcomingSlotInfo(lotteryCode) {
  const normCode = (lotteryCode || 'NACIONAL').toUpperCase();
  const sched = APS_LOTTERY_SCHEDULES[normCode] || APS_LOTTERY_SCHEDULES['RJ'];
  const now = getBrazilDate();
  const curHours = now.getHours();
  const curMins = now.getMinutes();
  const curTotalMins = curHours * 60 + curMins;
  const dayOfWeek = now.getDay(); // 0 = Dom, 1 = Seg, 2 = Ter, 3 = Qua, 4 = Qui, 5 = Sex, 6 = Sab

  // Trata caso especial de Loteria Federal (com suporte a Domingos e Calendário Eleitoral)
  if (normCode === 'FEDERAL') {
    const isFederalDay = (dayOfWeek === 3 || dayOfWeek === 6 || dayOfWeek === 0);
    
    // Identifica horários de hoje se for dia de Federal
    if (isFederalDay) {
      // Domingo pode ter sorteio às 11h e/ou 19h
      const potentialTimes = (dayOfWeek === 0) ? [11 * 60, 19 * 60] : [19 * 60];
      let targetMins = null;
      for (const t of potentialTimes) {
        if (t > (curTotalMins + 2)) {
          targetMins = t;
          break;
        }
      }

      if (targetMins !== null) {
        const diff = targetMins - curTotalMins;
        const h = Math.floor(diff / 60);
        const m = diff % 60;
        const targetTimeStr = targetMins === 11 * 60 ? '11:00' : '19:00';
        const targetNameStr = targetMins === 11 * 60 ? 'Federal 11h (Domingo)' : (dayOfWeek === 0 ? 'Federal 19h (Domingo)' : (dayOfWeek === 3 ? 'Federal (Quarta)' : 'Federal (Sábado)'));
        return {
          lotteryCode: normCode,
          lotteryName: sched.name,
          shortName: sched.shortName,
          targetTime: targetTimeStr,
          targetName: targetNameStr,
          targetCode: targetMins === 11 * 60 ? 'FED-11' : 'FED-19',
          countdown: h === 0 ? `Faltam ${m} min` : (m > 0 ? `Faltam ${h}h ${m}m` : `Faltam ${h}h`),
          diffMinutes: diff,
          isToday: true,
          isTomorrow: false,
          allSlots: sched.slots,
          currentTotalMins: curTotalMins
        };
      }
    }

    // Se já passou hoje ou não corre hoje:
    // Semana que vem: Sábado 24/10 corre Federal (Eleições no Domingo 25/10)
    let nextDayName = 'Quarta';
    if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2) {
      nextDayName = 'Quarta';
    } else {
      nextDayName = 'Sábado';
    }
    return {
      lotteryCode: normCode,
      lotteryName: sched.name,
      shortName: sched.shortName,
      targetTime: '19:00',
      targetName: `Federal (${nextDayName})`,
      targetCode: 'FED-19',
      countdown: `Próximo: ${nextDayName} às 19:00`,
      diffMinutes: 9999,
      isToday: false,
      isTomorrow: false,
      allSlots: sched.slots,
      currentTotalMins: curTotalMins
    };
  }

  // Loterias regulares
  let targetSlot = null;
  let diffMinutes = 0;
  let isTomorrow = false;

  for (const s of sched.slots) {
    const [hStr, mStr] = s.time.split(':');
    const sMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    // 2 minutos de margem após o horário do sorteio antes de mudar para o próximo
    if (sMins > (curTotalMins + 2)) {
      targetSlot = s;
      diffMinutes = sMins - curTotalMins;
      break;
    }
  }

  if (!targetSlot) {
    isTomorrow = true;
    targetSlot = sched.slots[0];
    const [hStr, mStr] = targetSlot.time.split(':');
    const sMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    diffMinutes = (24 * 60 - curTotalMins) + sMins;
  }

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;
  let countdown = '';
  if (isTomorrow) {
    countdown = `Amanhã às ${targetSlot.time} (em ${hours}h ${mins}m)`;
  } else if (hours === 0) {
    countdown = `Faltam ${mins} min`;
  } else {
    countdown = mins > 0 ? `Faltam ${hours}h ${mins}m` : `Faltam ${hours}h`;
  }

  return {
    lotteryCode: normCode,
    lotteryName: sched.name,
    shortName: sched.shortName,
    targetTime: targetSlot.time,
    targetName: targetSlot.name,
    targetCode: targetSlot.code,
    countdown: countdown,
    diffMinutes: diffMinutes,
    isToday: !isTomorrow,
    isTomorrow: isTomorrow,
    allSlots: sched.slots,
    currentTotalMins: curTotalMins
  };
}
window.getApsUpcomingSlotInfo = getApsUpcomingSlotInfo;

function updateApsNextSlotUI(lotteryCode) {
  const lot = (lotteryCode || window.currentApsLottery || 'NACIONAL').toUpperCase();
  const info = getApsUpcomingSlotInfo(lot);
  if (!info) return;

  // 1. Pílula do cabeçalho
  const pillEl = document.getElementById('aps-next-slot-name');
  if (pillEl) {
    pillEl.textContent = `Próxima: ${info.targetTime} (${info.targetName} - ${info.shortName || lot})`;
  }

  // 2. Título e contagem na barra do alvo
  const titleEl = document.getElementById('aps-target-slot-title');
  if (titleEl) {
    titleEl.textContent = `${info.targetTime} • ${info.targetName} (${info.lotteryName})`;
  }

  const countdownEl = document.getElementById('aps-target-slot-countdown');
  if (countdownEl) {
    countdownEl.innerHTML = `⏳ ${info.countdown}`;
  }

  const badgeEl = document.getElementById('aps-target-slot-live-badge');
  if (badgeEl) {
    if (info.isTomorrow) {
      badgeEl.textContent = 'ENCERRADO HOJE';
      badgeEl.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-slate-700 text-slate-300 uppercase tracking-wide';
    } else if (info.diffMinutes && info.diffMinutes <= 30) {
      badgeEl.textContent = 'ÚLTIMOS MINUTOS';
      badgeEl.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-amber-500 text-slate-950 uppercase tracking-wide animate-pulse';
    } else {
      badgeEl.textContent = 'EM ABERTO';
      badgeEl.className = 'px-1.5 py-0.5 rounded text-[9px] font-black bg-emerald-500 text-slate-950 uppercase tracking-wide animate-pulse';
    }
  }

  const lotNameEl = document.getElementById('aps-today-lot-name');
  if (lotNameEl) {
    lotNameEl.textContent = info.shortName || lot;
  }

  // 3. Renderiza lista de horários do dia
  const slotsListEl = document.getElementById('aps-today-slots-list');
  if (slotsListEl && info.allSlots) {
    const curMins = info.currentTotalMins || 0;
    slotsListEl.innerHTML = info.allSlots.map(s => {
      const [hStr, mStr] = s.time.split(':');
      const sMins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
      const isTarget = (s.code === info.targetCode && info.isToday);
      const isPassed = !info.isTomorrow && (sMins <= curMins + 2);

      if (isTarget) {
        return `<span class="px-2 py-0.5 rounded-lg text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400 shadow-sm flex items-center gap-1 shrink-0 animate-pulse" title="Próxima extração alvo">
          <span>⭐</span> <span>${s.time}</span> <span class="text-[9px] opacity-80 uppercase">${s.name}</span>
        </span>`;
      } else if (isPassed) {
        return `<span class="px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-900/60 text-slate-500 border border-slate-800 line-through shrink-0" title="Extração já realizada">
          ${s.time}
        </span>`;
      } else {
        return `<span class="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-900/90 text-slate-300 border border-slate-800 hover:border-slate-700 shrink-0" title="Extração posterior">
          ${s.time}
        </span>`;
      }
    }).join('');
  }
}
window.updateApsNextSlotUI = updateApsNextSlotUI;

// Inicia ticker automático a cada 30 segundos para atualizar contagem regressiva
if (!window.apsNextSlotTimer) {
  window.apsNextSlotTimer = setInterval(() => {
    try {
      const viewAps = document.getElementById('view-aps');
      if (viewAps && !viewAps.classList.contains('hidden')) {
        updateApsNextSlotUI(window.currentApsLottery || 'NACIONAL');
      }
    } catch (e) {
      // ticker silencioso
    }
  }, 30000);
}

// Execução inicial preventiva
try {
  if (typeof updateApsNextSlotUI === 'function') {
    updateApsNextSlotUI(window.currentApsLottery || 'NACIONAL');
  }
} catch (e) {}


// ===================================================================
// SINCRONIZAÇÃO INSTANTÂNEA PÓS-PAGAMENTO E FOCO DA JANELA
// ===================================================================
window.reRenderActiveScreen = function() {
  const scr = window.currentScreen || 'home';
  if (scr === 'home') {
    if (typeof updateHomeScreenData === 'function') updateHomeScreenData();
    if (typeof loadCurrentPredictions === 'function') loadCurrentPredictions();
    if (typeof loadHomeApsData === 'function') loadHomeApsData();
  } else if (scr === 'palpites') {
    if (typeof renderPicks === 'function') renderPicks();
  } else if (scr === 'aps') {
    if (typeof renderApsView === 'function') renderApsView();
  } else if (scr === 'coluna-data') {
    if (typeof renderColunaDataView === 'function') renderColunaDataView();
  } else if (scr === 'cruz') {
    if (typeof renderCruzDoDia === 'function') renderCruzDoDia();
  } else if (scr === 'milhares-atrasadas') {
    if (typeof renderMilharesAtrasadas === 'function') renderMilharesAtrasadas();
  } else if (scr === 'matriz') {
    if (typeof renderMatrizScreen === 'function') renderMatrizScreen();
  }
};

let _lastCheckSessionTs = 0;
async function syncSessionAfterPaymentOrFocus(force = false) {
  const now = Date.now();
  if (!force && (now - _lastCheckSessionTs < 2500)) return;
  _lastCheckSessionTs = now;

  const prevIsVip = typeof window.isUserVip === 'function' ? window.isUserVip() : false;
  try {
    if (typeof api !== 'undefined' && typeof api.checkSession === 'function') {
      const session = await api.checkSession();
      if (session && session.authenticated) {
        updateAuthUI();
        const newIsVip = typeof window.isUserVip === 'function' ? window.isUserVip() : false;
        
        if (!prevIsVip && newIsVip) {
          if (typeof closePlansModal === 'function') closePlansModal();
          showToast('🎉 Pagamento aprovado! Seu Acesso VIP está 100% liberado.', 'success');
          window.reRenderActiveScreen();
        }
      }
    }
  } catch (e) {
    console.warn('Erro ao sincronizar sessão:', e);
  }
}

let _paymentWatcherInterval = null;
window.startPaymentApprovalWatcher = function() {
  if (_paymentWatcherInterval) clearInterval(_paymentWatcherInterval);
  let attempts = 0;
  _paymentWatcherInterval = setInterval(async () => {
    attempts++;
    if (attempts > 50 || (typeof window.isUserVip === 'function' && window.isUserVip())) {
      clearInterval(_paymentWatcherInterval);
      _paymentWatcherInterval = null;
      return;
    }
    await syncSessionAfterPaymentOrFocus(true);
  }, 3000);
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    syncSessionAfterPaymentOrFocus();
  }
});

window.addEventListener('focus', () => {
  syncSessionAfterPaymentOrFocus();
});

// ============================================================================
// MODAL DE RECUPERAÇÃO DE SENHA DO USUÁRIO
// ============================================================================
window.openForgotPasswordModal = function() {
  const modal = document.getElementById('modal-forgot-password');
  const input = document.getElementById('forgot-input-user');
  const statusMsg = document.getElementById('forgot-status-msg');
  const actions = document.getElementById('forgot-action-container');
  const btn = document.getElementById('btn-submit-forgot');

  // Prefill phone from login input if already typed
  const loginUser = (document.getElementById('login-input-user')?.value || '').trim();
  if (input) {
    if (loginUser && /^\d/.test(loginUser)) {
      input.value = loginUser;
    }
  }

  if (statusMsg) {
    statusMsg.className = 'hidden p-3 rounded-xl text-xs font-medium';
    statusMsg.textContent = '';
  }
  if (actions) {
    actions.classList.add('hidden');
    actions.innerHTML = '';
  }
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = '<span>🔍</span> <span>Localizar Meu Cadastro</span>';
  }

  if (modal) {
    modal.classList.remove('hidden');
    if (input) setTimeout(() => input.focus(), 100);
  }
};

window.closeForgotPasswordModal = function() {
  const modal = document.getElementById('modal-forgot-password');
  if (modal) modal.classList.add('hidden');
};

window.handleForgotPasswordSubmit = async function(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('forgot-input-user');
  const statusMsg = document.getElementById('forgot-status-msg');
  const actions = document.getElementById('forgot-action-container');
  const btn = document.getElementById('btn-submit-forgot');

  const val = (input?.value || '').trim();
  if (!val) {
    if (statusMsg) {
      statusMsg.className = 'p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-medium';
      statusMsg.textContent = 'Por favor, digite seu WhatsApp ou e-mail cadastrado.';
      statusMsg.classList.remove('hidden');
    }
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Localizando cadastro...</span>';
  }
  if (statusMsg) statusMsg.classList.add('hidden');
  if (actions) actions.classList.add('hidden');

  try {
    const res = await api.forgotPassword(val);
    if (res.found) {
      if (statusMsg) {
        statusMsg.className = 'p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 text-xs space-y-1';
        statusMsg.innerHTML = `
          <div class="font-bold flex items-center gap-1 text-emerald-300">
            <span>✅</span> <span>Cadastro Localizado com Sucesso!</span>
          </div>
          <div>Olá, <strong>${res.name}</strong>! Localizamos seu registro (${res.phone || val}).</div>
          <div class="text-[11px] text-emerald-400/90 pt-1">
            Toque no botão abaixo para receber sua senha e redefinição instantânea com nosso suporte no WhatsApp:
          </div>
        `;
        statusMsg.classList.remove('hidden');
      }

      if (actions) {
        actions.innerHTML = `
          <a href="${res.whatsapp_url}" target="_blank"
            class="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-500/30 active:scale-98 transition-all flex items-center justify-center gap-2 cursor-pointer text-center no-underline">
            <span>📲</span> <span>Solicitar Senha no WhatsApp do Suporte</span>
          </a>
        `;
        actions.classList.remove('hidden');
      }

      if (btn) {
        btn.innerHTML = '<span>🔄</span> <span>Buscar Outro Número</span>';
        btn.disabled = false;
      }
    } else {
      if (statusMsg) {
        statusMsg.className = 'p-3 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs space-y-1.5';
        statusMsg.innerHTML = `
          <div class="font-bold flex items-center gap-1 text-amber-300">
            <span>⚠️</span> <span>Nenhum cadastro encontrado</span>
          </div>
          <div>Não encontramos uma conta com este WhatsApp/e-mail (${val}). Verifique se digitou o DDD corretamente.</div>
        `;
        statusMsg.classList.remove('hidden');
      }

      if (actions && res.support_url) {
        actions.innerHTML = `
          <a href="${res.support_url}" target="_blank"
            class="w-full py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 font-bold text-xs active:scale-98 transition-all flex items-center justify-center gap-1.5 cursor-pointer text-center no-underline">
            <span>💬</span> <span>Falar com o Suporte Humano no WhatsApp</span>
          </a>
        `;
        actions.classList.remove('hidden');
      }

      if (btn) {
        btn.innerHTML = '<span>🔍</span> <span>Tentar Novamente</span>';
        btn.disabled = false;
      }
    }
  } catch (err) {
    if (statusMsg) {
      statusMsg.className = 'p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-medium';
      statusMsg.textContent = err.message || 'Erro ao consultar cadastro. Tente novamente.';
      statusMsg.classList.remove('hidden');
    }
    if (btn) {
      btn.innerHTML = '<span>🔍</span> <span>Localizar Meu Cadastro</span>';
      btn.disabled = false;
    }
  }
};

