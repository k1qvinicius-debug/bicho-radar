function escapeJsString(str) {
  if (!str) return '';
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/**
 * Lógica do Painel Administrativo - Bicho Analytics
 * Gerencia autenticação master, multi-tenants, resultados e calibração de pesos.
 */
const ANIMAL_NAMES = {
  1: 'Avestruz', 2: 'Águia', 3: 'Burro', 4: 'Borboleta', 5: 'Cachorro',
  6: 'Cabra', 7: 'Carneiro', 8: 'Camelo', 9: 'Cobra', 10: 'Coelho',
  11: 'Cavalo', 12: 'Elefante', 13: 'Galo', 14: 'Gato', 15: 'Jacaré',
  16: 'Leão', 17: 'Macaco', 18: 'Porco', 19: 'Pavão', 20: 'Peru',
  21: 'Touro', 22: 'Tigre', 23: 'Urso', 24: 'Veado', 25: 'Vaca'
};

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  initDateDefaults();
  setupPrizeLivePreview();
  setupResultForm();
  setupImportForm();

  const isAuth = await checkAdminAuth();
  if (isAuth) {
    await loadInitialData();
  }
});

async function checkAdminAuth() {
  const gate = document.getElementById('admin-auth-gate');
  const container = document.getElementById('admin-dashboard-container');

  // Suporte a login automático via URL ?key= ou ?admin=
  const urlParams = new URLSearchParams(window.location.search);
  const urlKey = urlParams.get('key') || urlParams.get('admin');
  if (urlKey && urlKey.trim()) {
    try {
      const res = await api.login(urlKey.trim());
      if (res && res.role === 'admin') {
        const cleanUrl = new URL(window.location);
        cleanUrl.searchParams.delete('key');
        cleanUrl.searchParams.delete('admin');
        window.history.replaceState({}, '', cleanUrl.toString());
      }
    } catch (e) {
      console.warn('Erro ao autenticar admin via URL:', e);
    }
  }

  const isMaster = api.isAdmin();

  if (!isMaster) {
    if (gate) gate.classList.remove('hidden');
    if (container) container.classList.add('hidden');
    return false;
  }

  if (gate) gate.classList.add('hidden');
  if (container) container.classList.remove('hidden');
  return true;
}

async function loadInitialData() {
  await Promise.all([
    loadAdminSettings(),
    loadTenantsTable(),
    loadFinancialDashboard(),
    loadWeights(),
    loadResultsTable(),
    loadScraperMonitor()
  ]);
  setupWeightsEvents();
}

window.loadAdminSettings = async function() {
  try {
    const s = await api.getAdminSettings();
    const inputW = document.getElementById('admin-whatsapp-input');
    if (inputW && s.support_whatsapp) {
      inputW.value = s.support_whatsapp;
    }
    const inputG = document.getElementById('admin-google-client-id-input');
    if (inputG && s.google_client_id) {
      inputG.value = s.google_client_id;
    }
    const inputMP = document.getElementById('admin-mp-token-input');
    if (inputMP && s.mp_access_token) {
      inputMP.value = s.mp_access_token;
    }
  } catch (err) {
    console.warn('Erro ao carregar settings:', err);
  }
};

window.saveAdminGoogleSettings = async function() {
  const input = document.getElementById('admin-google-client-id-input');
  const badge = document.getElementById('google-saved-badge');
  const btn = document.getElementById('btn-save-google-settings');
  const val = input ? input.value.trim() : '';

  if (btn) btn.disabled = true;
  try {
    await api.saveAdminSettings({ google_client_id: val });
    showToast('Google Client ID salvo com sucesso!', 'success');
    if (badge) {
      badge.classList.remove('hidden');
      setTimeout(() => badge.classList.add('hidden'), 3000);
    }
  } catch (err) {
    showToast('Erro ao salvar Client ID: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.saveAdminMPSettings = async function() {
  const input = document.getElementById('admin-mp-token-input');
  const badge = document.getElementById('mp-saved-badge');
  const btn = document.getElementById('btn-save-mp-settings');
  const val = input ? input.value.trim() : '';

  if (btn) btn.disabled = true;
  try {
    await api.saveAdminSettings({ mp_access_token: val });
    showToast('Token do Mercado Pago salvo com sucesso!', 'success');
    if (badge) {
      badge.classList.remove('hidden');
      setTimeout(() => badge.classList.add('hidden'), 3000);
    }
  } catch (err) {
    showToast('Erro ao salvar token Mercado Pago: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};


window.saveAdminSettings = async function() {
  const input = document.getElementById('admin-whatsapp-input');
  const badge = document.getElementById('whatsapp-saved-badge');
  const btn = document.getElementById('btn-save-settings');
  const val = input ? input.value.trim() : '';

  if (btn) btn.disabled = true;
  try {
    await api.saveAdminSettings({ support_whatsapp: val });
    showToast('Número de WhatsApp salvo com sucesso!', 'success');
    if (badge) {
      badge.classList.remove('hidden');
      setTimeout(() => badge.classList.add('hidden'), 3000);
    }
  } catch (err) {
    showToast('Erro ao salvar WhatsApp: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
};

window.handleAdminLogin = async function(event) {
  event.preventDefault();
  const userInput = document.getElementById('input-admin-username');
  const passInput = document.getElementById('input-admin-password');
  const errEl = document.getElementById('admin-login-error');
  const btn = document.getElementById('btn-submit-admin-login');
  if (!passInput) return;

  const rawUser = userInput ? userInput.value.trim() : '';
  const username = rawUser || 'k1qvinicius@gmail.com';
  const password = passInput.value.trim();

  if (!password) {
    if (errEl) {
      errEl.textContent = 'Digite a senha master do administrador.';
      errEl.classList.remove('hidden');
    }
    return;
  }

  if (errEl) errEl.classList.add('hidden');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Verificando...';
  }

  try {
    const res = await api.login({ username, email: username, password, key: password });
    const role = res.role || (res.tenant && res.tenant.role);
    if (role !== 'admin') {
      api.logout();
      throw new Error('Esta conta não possui privilégios de Administrador Master.');
    }
    showToast('Administrador autenticado com sucesso!', 'success');
    const gate = document.getElementById('admin-auth-gate');
    const container = document.getElementById('admin-dashboard-container');
    if (gate) gate.classList.add('hidden');
    if (container) container.classList.remove('hidden');

    try {
      await loadInitialData();
    } catch (loadErr) {
      console.warn('Aviso no carregamento inicial:', loadErr);
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = err.message || 'Senha master incorreta.';
      errEl.classList.remove('hidden');
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Entrar no Painel Master';
    }
  }
};

window.adminLogout = function() {
  api.logout();
  window.location.reload();
};

function setupTabs() {
  const tabBtns = document.querySelectorAll('[data-tab-target]');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab-target');

      tabBtns.forEach((b) => {
        b.classList.remove('bg-indigo-600', 'text-white', 'shadow');
        b.classList.add('text-slate-400', 'hover:text-slate-200');
      });
      btn.classList.add('bg-indigo-600', 'text-white', 'shadow');
      btn.classList.remove('text-slate-400');

      tabContents.forEach((tc) => {
        if (tc.id === targetId) {
          tc.classList.remove('hidden');
        } else {
          tc.classList.add('hidden');
        }
      });
      if (targetId === 'tab-financial') {
        loadFinancialDashboard();
      }
    });
  });
}

function initDateDefaults() {
  const dateInput = document.getElementById('admin-draw-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
}

function getGroupForNumber(numStr) {
  if (!numStr) return null;
  const digits = numStr.replace(/\D/g, '');
  if (!digits) return null;
  const d = parseInt(digits.slice(-2).padStart(2, '0'), 10);
  if (d === 0) return 25;
  return Math.floor((d - 1) / 4) + 1;
}

function setupPrizeLivePreview() {
  for (let i = 1; i <= 5; i++) {
    const input = document.getElementById(`prize-${i}`);
    const badge = document.getElementById(`badge-prize-${i}`);
    if (input && badge) {
      input.addEventListener('input', () => {
        const grp = getGroupForNumber(input.value);
        if (grp && ANIMAL_NAMES[grp]) {
          badge.textContent = `Gr. ${grp} (${ANIMAL_NAMES[grp]})`;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      });
    }
  }
}

function setupResultForm() {
  const form = document.getElementById('form-add-result');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const drawDate = document.getElementById('admin-draw-date').value;
    const slot = document.getElementById('admin-draw-slot').value;

    const prize1 = document.getElementById('prize-1').value.trim();
    const prize2 = document.getElementById('prize-2').value.trim();
    const prize3 = document.getElementById('prize-3').value.trim();
    const prize4 = document.getElementById('prize-4').value.trim();
    const prize5 = document.getElementById('prize-5').value.trim();
    const prize6 = document.getElementById('prize-6').value.trim() || null;
    const prize7 = document.getElementById('prize-7').value.trim() || null;

    if (!prize1 || !prize2 || !prize3 || !prize4 || !prize5) {
      showToast('Preencha pelo menos do 1º ao 5º prêmio.', 'error');
      return;
    }

    try {
      const payload = {
        draw_date: drawDate,
        slot,
        prize_1: prize1,
        prize_2: prize2,
        prize_3: prize3,
        prize_4: prize4,
        prize_5: prize5,
        prize_6: prize6,
        prize_7: prize7,
      };

      await api.createResult(payload);
      showToast('Resultado gravado e conferência automática executada!', 'success');
      form.reset();
      initDateDefaults();
      for (let i = 1; i <= 5; i++) {
        const badge = document.getElementById(`badge-prize-${i}`);
        if (badge) badge.classList.add('hidden');
      }
      await loadResultsTable();
      await loadScraperMonitor();
    } catch (err) {
      showToast('Erro: ' + err.message, 'error');
    }
  });
}

function setupImportForm() {
  const form = document.getElementById('form-import');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('import-file');
    if (!fileInput || !fileInput.files.length) {
      showToast('Selecione um arquivo para importar.', 'error');
      return;
    }

    try {
      const res = await api.importResults(fileInput.files[0]);
      showToast(res.message, 'success');
      form.reset();
      await loadResultsTable();
      await loadScraperMonitor();
    } catch (err) {
      showToast('Erro na importação: ' + err.message, 'error');
    }
  });
}

async function loadWeights() {
  try {
    const w = await api.getWeights();

    setSlider('weight-freq-tot', w.weight_frequency_total);
    setSlider('weight-freq-rec', w.weight_frequency_recent);
    setSlider('weight-delay', w.weight_delay);
    setSlider('weight-slot', w.weight_slot_affinity);
    setSlider('weight-rep', w.weight_repetition);
    setSlider('weight-day', w.weight_day_of_week);
    setSlider('weight-decay', w.recent_decay_rate);
  } catch (err) {
    showToast('Erro ao carregar pesos: ' + err.message, 'error');
  }
}

function setSlider(id, val) {
  const el = document.getElementById(id);
  const valEl = document.getElementById(`${id}-val`);
  if (el) el.value = val;
  if (valEl) valEl.textContent = val;
}

function setupWeightsEvents() {
  const sliders = [
    'weight-freq-tot', 'weight-freq-rec', 'weight-delay',
    'weight-slot', 'weight-rep', 'weight-day', 'weight-decay'
  ];

  sliders.forEach((sId) => {
    const el = document.getElementById(sId);
    const valEl = document.getElementById(`${sId}-val`);
    if (el && valEl) {
      el.addEventListener('input', () => {
        valEl.textContent = el.value;
      });
    }
  });

  const formWeights = document.getElementById('form-weights');
  if (formWeights) {
    formWeights.addEventListener('submit', async (e) => {
      e.preventDefault();

      const payload = {
        name: 'Configuração Personalizada',
        weight_frequency_total: parseFloat(document.getElementById('weight-freq-tot').value),
        weight_frequency_recent: parseFloat(document.getElementById('weight-freq-rec').value),
        weight_delay: parseFloat(document.getElementById('weight-delay').value),
        weight_slot_affinity: parseFloat(document.getElementById('weight-slot').value),
        weight_repetition: parseFloat(document.getElementById('weight-rep').value),
        weight_day_of_week: parseFloat(document.getElementById('weight-day').value),
        recent_decay_rate: parseFloat(document.getElementById('weight-decay').value),
      };

      try {
        await api.saveWeights(payload);
        showToast('Pesos atualizados com sucesso!', 'success');
      } catch (err) {
        showToast('Erro ao salvar pesos: ' + err.message, 'error');
      }
    });
  }

  const btnRecalc = document.getElementById('btn-recalc');
  if (btnRecalc) {
    btnRecalc.addEventListener('click', async () => {
      try {
        const res = await api.recalculateEvaluations();
        showToast(res.message, 'success');
      } catch (err) {
        showToast('Erro ao recalcular: ' + err.message, 'error');
      }
    });
  }
}

async function loadResultsTable() {
  const container = document.getElementById('results-table-container');
  if (!container) return;

  try {
    const res = await api.getResults(30, 0);
    const items = res.items || [];

    if (items.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">Nenhum resultado cadastrado.</p>';
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-slate-300">
          <thead class="text-[11px] uppercase bg-slate-900 border-b border-slate-800 text-slate-400 font-bold">
            <tr>
              <th class="p-2.5">Data</th>
              <th class="p-2.5">Horário</th>
              <th class="p-2.5">1º Prêmio</th>
              <th class="p-2.5">2º ao 5º</th>
              <th class="p-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 font-mono">
            ${items.map((r) => `
              <tr class="hover:bg-slate-900/50 transition-colors">
                <td class="p-2.5 font-semibold text-slate-200">${r.draw_date}</td>
                <td class="p-2.5 font-bold text-indigo-400">${r.slot}</td>
                <td class="p-2.5 text-amber-300 font-bold">
                  ${r.prize_1}
                  <span class="text-[10px] text-slate-400 ml-1 font-sans">(${ANIMAL_NAMES[getGroupForNumber(r.prize_1)] || ''})</span>
                </td>
                <td class="p-2.5 text-slate-400 text-[11px]">
                  ${r.prize_2} - ${r.prize_3} - ${r.prize_4} - ${r.prize_5}
                </td>
                <td class="p-2.5 text-right font-sans">
                  <button type="button" onclick="deleteDraw(${r.id})" class="text-rose-400 hover:text-rose-300 text-xs font-semibold px-2 py-1 rounded bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/60 transition-colors">
                    Excluir
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-rose-400 py-6 text-center">Erro ao listar resultados: ${err.message}</p>`;
  }
}

window.deleteDraw = async function (id) {
  if (!confirm('Deseja realmente excluir este resultado? As avaliações de auditoria associadas serão removidas.')) {
    return;
  }
  try {
    await api.deleteResult(id);
    showToast('Resultado excluído com sucesso.', 'success');
    await loadResultsTable();
    await loadScraperMonitor();
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
};

// =========================================================================
// GESTÃO PROFISSIONAL DE CLIENTES & ASSINANTES (SAAS)
// =========================================================================

let allTenantsList = [];
let currentTenantFilter = 'all'; // 'all' | 'subscribers' | 'trial' | 'expired'
let currentTenantSearch = '';

window.setTenantFilter = function(filterType, btnEl) {
  currentTenantFilter = filterType;
  
  // Atualiza classes visuais dos botões de filtro
  document.querySelectorAll('.btn-tenant-filter').forEach(btn => {
    btn.classList.remove('bg-indigo-600', 'text-white', 'shadow');
    btn.classList.add('bg-slate-800', 'text-slate-300');
  });
  if (btnEl) {
    btnEl.classList.remove('bg-slate-800', 'text-slate-300');
    btnEl.classList.add('bg-indigo-600', 'text-white', 'shadow');
  }
  
  window.renderFilteredClientsList();
};

window.handleClientSearch = function(query) {
  currentTenantSearch = (query || '').toLowerCase().trim();
  window.renderFilteredClientsList();
};

window.loadTenantsTable = async function() {
  const container = document.getElementById('tenants-table-container');
  const adminsContainer = document.getElementById('admins-list-container');
  const countEl = document.getElementById('tenants-count');
  if (!container) return;

  try {
    const tenants = await api.getTenants();
    allTenantsList = tenants || [];

    // 1. Separar Administradores Master dos Clientes Comuns
    const admins = allTenantsList.filter(t => t.role === 'admin');
    const clients = allTenantsList.filter(t => t.role !== 'admin');

    // 2. Renderizar Administradores Master na seção de topo exclusiva
    if (adminsContainer) {
      if (admins.length === 0) {
        adminsContainer.innerHTML = '<p class="text-xs text-amber-200/60 py-2">Nenhum administrador adicional configurado.</p>';
      } else {
        adminsContainer.innerHTML = admins.map(adm => {
          const userPass = adm.password || adm.tenant_key || '---';
          const isGoogle = adm.auth_provider === 'google';
          return `
            <div class="p-3 rounded-xl bg-slate-950/75 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md hover:border-amber-500/50 transition-all">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-lg shadow-md shrink-0">
                  👑
                </div>
                <div class="space-y-0.5 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-black text-sm text-amber-200 truncate">${adm.name}</h4>
                    <span class="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      👑 MASTER ADMIN
                    </span>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      ATIVO
                    </span>
                    ${isGoogle ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">🌐 Google</span>' : '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">Manual</span>'}
                  </div>
                  <div class="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
                    ${adm.email ? `<span class="text-slate-300 font-mono text-[11px]">${adm.email}</span>` : ''}
                    ${adm.phone ? `<span class="text-slate-400 font-mono text-[11px]">📱 ${adm.phone}</span>` : ''}
                    <span class="text-slate-600">•</span>
                    <span class="inline-flex items-center gap-1">
                      <span class="text-amber-400 font-bold">Senha Master:</span>
                      <button type="button" onclick="copySimpleText('${userPass}', 'Senha Master')" title="Copiar senha master"
                        class="font-mono font-black text-amber-200 bg-slate-900 px-2 py-0.5 rounded border border-amber-500/40 hover:border-amber-300 hover:text-white transition-colors cursor-pointer text-xs shadow-sm">
                        ${userPass} 📋
                      </button>
                    </span>
                    <span class="text-slate-600">•</span>
                    <span>Análises: <strong class="text-indigo-300 font-mono">${adm.snapshots_count}</strong></span>
                    <span class="text-slate-600">•</span>
                    <span>Último Acesso: <span class="font-mono text-slate-300">${adm.last_active_at ? adm.last_active_at.replace(/^2026-/, '') : 'Nunca'}</span></span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-[11px] font-bold text-amber-400/90 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/20 flex items-center gap-1">
                  <span>🛡️</span> <span>Conta Master Protegida</span>
                </span>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // 3. Atualizar KPIs de Clientes
    const totalClients = clients.length;
    const subscribers = clients.filter(t => t.subscription_status === 'active' && t.plan_type !== 'free');
    const expired = clients.filter(t => t.subscription_status === 'expired' || (t.trial_days_remaining !== undefined && t.trial_days_remaining !== null && t.trial_days_remaining <= 0));
    const trial = clients.filter(t => !expired.includes(t) && !subscribers.includes(t));

    const statTotalEl = document.getElementById('stat-total-clients');
    const statSubEl = document.getElementById('stat-subscribers');
    const statTrialEl = document.getElementById('stat-trial-clients');
    const statExpEl = document.getElementById('stat-expired-clients');

    if (statTotalEl) statTotalEl.textContent = totalClients;
    if (statSubEl) statSubEl.textContent = subscribers.length;
    if (statTrialEl) statTrialEl.textContent = trial.length;
    if (statExpEl) statExpEl.textContent = expired.length;

    // Atualizar badges dos filtros
    const fcAll = document.getElementById('filter-count-all');
    const fcSub = document.getElementById('filter-count-subscribers');
    const fcTrial = document.getElementById('filter-count-trial');
    const fcExp = document.getElementById('filter-count-expired');
    const fcAct = document.getElementById('filter-count-active-today');
    const fcNev = document.getElementById('filter-count-never-logged');

    const activeToday = clients.filter(t => {
      if (!t.last_active_at) return false;
      const d = new Date(t.last_active_at.replace(' ', 'T'));
      return (new Date() - d) <= (24 * 60 * 60 * 1000);
    });
    const neverLogged = clients.filter(t => !t.last_active_at || t.snapshots_count === 0);

    if (fcAll) fcAll.textContent = totalClients;
    if (fcSub) fcSub.textContent = subscribers.length;
    if (fcTrial) fcTrial.textContent = trial.length;
    if (fcExp) fcExp.textContent = expired.length;
    if (fcAct) fcAct.textContent = activeToday.length;
    if (fcNev) fcNev.textContent = neverLogged.length;

    // 4. Renderizar Lista de Clientes com Filtros Ativos
    window.renderFilteredClientsList();

  } catch (err) {
    if (container) {
      container.innerHTML = `<p class="text-xs text-rose-400 py-6 text-center">Erro ao carregar clientes: ${err.message}</p>`;
    }
  }
};

window.renderFilteredClientsList = function() {
  const container = document.getElementById('tenants-table-container');
  const countEl = document.getElementById('tenants-count');
  if (!container) return;

  const clients = allTenantsList.filter(t => t.role !== 'admin');

  // Filtragem por status/categoria
  let filtered = clients.filter(t => {
    const isSub = t.subscription_status === 'active' && t.plan_type !== 'free';
    const isExp = t.subscription_status === 'expired' || (t.trial_days_remaining !== undefined && t.trial_days_remaining !== null && t.trial_days_remaining <= 0);
    const isTrial = !isExp && !isSub;

    if (currentTenantFilter === 'subscribers') return isSub;
    if (currentTenantFilter === 'trial') return isTrial;
    if (currentTenantFilter === 'expired') return isExp;
    if (currentTenantFilter === 'active_today') {
      if (!t.last_active_at) return false;
      const d = new Date(t.last_active_at.replace(' ', 'T'));
      return (new Date() - d) <= (24 * 60 * 60 * 1000);
    }
    if (currentTenantFilter === 'never_logged') {
      return (!t.last_active_at || t.snapshots_count === 0);
    }
    return true; // 'all'
  });

  // Filtragem por busca em tempo real
  if (currentTenantSearch) {
    filtered = filtered.filter(t => {
      const q = currentTenantSearch;
      const matchName = (t.name || '').toLowerCase().includes(q);
      const matchPhone = (t.phone || '').toLowerCase().includes(q);
      const matchEmail = (t.email || '').toLowerCase().includes(q);
      const matchNotes = (t.notes || '').toLowerCase().includes(q);
      const matchKey = (t.tenant_key || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchEmail || matchNotes || matchKey;
    });
  }

  if (countEl) {
    countEl.textContent = `${filtered.length} de ${clients.length}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-8 text-center bg-slate-900/40 rounded-xl border border-slate-800">
        <span class="text-2xl block mb-2">🔍</span>
        <p class="text-xs text-slate-400 font-semibold">Nenhum cliente encontrado com os filtros atuais.</p>
        <p class="text-[11px] text-slate-500 mt-1">Experimente mudar o filtro acima ou limpar o campo de busca.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(t => {
    const isActive = t.status === 'active';
    const isGoogle = t.auth_provider === 'google';
    const isSubscriber = t.subscription_status === 'active' && t.plan_type !== 'free';
    const isExpired = t.subscription_status === 'expired' || (t.trial_days_remaining !== undefined && t.trial_days_remaining !== null && t.trial_days_remaining <= 0);
    const userPass = t.password || t.tenant_key || '---';

    let planBadge = '';
    if (isSubscriber) {
      const planName = t.plan_type === 'monthly' ? 'MENSAL' : (t.plan_type === 'trimestral' ? 'TRIMESTRAL' : (t.plan_type === 'semestral' ? 'SEMESTRAL' : (t.plan_type === 'anual' ? 'ANUAL' : 'VIP')));
      planBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">⭐ ASSINANTE ${planName}</span>`;
    } else if (isExpired) {
      planBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">🔒 TESTE EXPIRADO</span>';
    } else {
      const days = t.trial_days_remaining !== undefined && t.trial_days_remaining !== null ? t.trial_days_remaining : 5;
      planBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">⏳ TESTE VIP (${days}d restantes)</span>`;
    }

    const statusBadge = isActive
      ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">ATIVO</span>'
      : '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">SUSPENSO</span>';

    let engagementBadge = '';
    if (!t.last_active_at) {
      engagementBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">💤 Nunca Entrou</span>';
    } else {
      const lastDate = new Date(t.last_active_at.replace(' ', 'T'));
      const diffHours = (new Date() - lastDate) / (1000 * 60 * 60);
      if (isNaN(diffHours) || diffHours < 0) {
        engagementBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">🟢 Ativo Recente</span>';
      } else if (diffHours <= 24) {
        engagementBadge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse">🟢 Ativo Hoje</span>';
      } else if (diffHours <= 72) {
        const daysAgo = Math.max(1, Math.round(diffHours / 24));
        engagementBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">🟡 Visto há ${daysAgo}d</span>`;
      } else {
        const daysAgo = Math.round(diffHours / 24);
        engagementBadge = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800/80 text-slate-400 border border-slate-700">⚪ Inativo (${daysAgo}d)</span>`;
      }
    }

    let usageBadge = '';
    if (t.snapshots_count > 10) {
      usageBadge = `<span class="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/40" title="Usuário super engajado">🔥 ${t.snapshots_count} palpites</span>`;
    } else if (t.snapshots_count > 0) {
      usageBadge = `<span class="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">${t.snapshots_count} palpites</span>`;
    } else {
      usageBadge = `<span class="px-1.5 py-0.2 rounded text-[10px] text-slate-500 bg-slate-900 border border-slate-800">0 palpites</span>`;
    }

    const providerBadge = isGoogle
      ? '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30">🌐 Google</span>'
      : '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700">Manual</span>';

    return `
      <div class="p-3 sm:p-3.5 rounded-xl bg-slate-900/85 border ${isSubscriber ? 'border-emerald-500/30 bg-emerald-950/10' : (isExpired ? 'border-rose-500/30 bg-rose-950/10' : 'border-slate-800')} hover:border-slate-700 flex flex-col lg:flex-row lg:items-center justify-between gap-3 transition-all shadow-sm">
        <div class="space-y-1.5 min-w-0">
          <!-- Linha 1: Nome, Contatos e Badges -->
          <div class="flex items-center gap-1.5 flex-wrap min-w-0">
            <h4 class="font-black text-xs sm:text-sm text-white truncate max-w-[200px]">${t.name}</h4>
            ${t.email ? `<span class="text-[11px] text-indigo-300 font-mono bg-indigo-950/40 px-1.5 py-0.2 rounded border border-indigo-900/50 truncate max-w-[220px]">${t.email}</span>` : ''}
            ${t.phone ? `<a href="https://wa.me/55${t.phone.replace(/\D/g, '')}" target="_blank" class="text-[11px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.2 rounded border border-emerald-800/80 hover:bg-emerald-900/60 transition-colors inline-flex items-center gap-0.5 font-bold" title="Conversar no WhatsApp">📱 ${t.phone}</a>` : '<span class="text-[10px] text-slate-500 font-mono italic">Sem tel</span>'}
            ${providerBadge}
            ${planBadge}
            ${engagementBadge}
            ${statusBadge}
          </div>

          <!-- Linha 2: Senha Real, Análises, Último Acesso e Notas -->
          <div class="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
            <span class="inline-flex items-center gap-1">
              <span class="text-amber-400 font-bold">🔑 Senha:</span>
              <button type="button" onclick="copySimpleText('${userPass}', 'Senha')" title="Clique para copiar a senha deste cliente"
                class="font-mono font-black text-amber-200 bg-slate-950 px-2 py-0.5 rounded border border-amber-500/40 hover:border-amber-300 hover:text-white transition-colors cursor-pointer text-xs shadow-sm">
                ${userPass} 📋
              </button>
            </span>
            ${(t.tenant_key && t.password && t.tenant_key !== t.password) ? `<span class="text-[10px] text-slate-600 font-mono hidden sm:inline" title="Chave Técnica">(${t.tenant_key})</span>` : ''}

            <span class="text-slate-700">•</span>
            <span>Uso: ${usageBadge}</span>

            <span class="text-slate-700">•</span>
            <span>Último Acesso: <strong class="font-mono text-slate-200">${t.last_active_at ? t.last_active_at.replace(/^2026-/, '') : 'Nunca acessou'}</strong></span>

            ${t.notes ? `
              <span class="text-slate-700">•</span>
              <span class="text-[10px] text-slate-500 italic truncate max-w-[200px]" title="${t.notes}">📝 ${t.notes}</span>
            ` : ''}
          </div>
        </div>

        <!-- Linha 3 / Ações Rápidas -->
        <div class="pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-800 shrink-0 flex items-center gap-1.5 flex-wrap">
          <button type="button" onclick="openPlanActivationModal(${t.id}, '${escapeJsString(t.name)}', '${t.phone || ''}', '${userPass}')"
            class="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
            title="Ativar plano VIP pago (Mensal, Trimestral, Semestral, Anual) e registrar venda">
            <span>⭐</span> <span>Ativar Plano</span>
          </button>

          ${(!isExpired && !isSubscriber) ? `
            <button type="button" onclick="expireTenantTrial(${t.id}, '${escapeJsString(t.name)}')"
              class="px-2 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900/90 text-rose-300 border border-rose-800/80 font-bold text-xs transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
              title="Encerrar período de teste imediatamente (bloquear cliente e direcionar para tela de planos)">
              <span>🔒</span> <span>Expirar</span>
            </button>
          ` : ''}

          ${(!isSubscriber) ? `
            <button type="button" onclick="renewTenantTrialDays(${t.id}, '${escapeJsString(t.name)}', 5)"
              class="px-2 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900/90 text-cyan-300 border border-cyan-800/80 font-bold text-xs transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
              title="Liberar mais 5 dias de teste grátis para este cliente">
              <span>⏳</span> <span>+5d Teste</span>
            </button>
          ` : ''}

          <button type="button" onclick="copyTenantWhatsApp('${t.tenant_key}', '${escapeJsString(t.name)}', this, '${t.phone || ''}', '${userPass}')"
            class="px-2.5 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold text-xs transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
            title="${t.phone ? 'Abrir conversa direta no WhatsApp do cliente com dados de login' : 'Copiar link e senha para envio no WhatsApp'}">
            <span>📲</span> <span>WhatsApp</span>
          </button>

          <button type="button" onclick="toggleTenantStatus(${t.id}, '${t.status}')"
            class="px-2 py-1.5 rounded-lg ${isActive ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900/60' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'} font-bold text-xs transition-all cursor-pointer" title="${isActive ? 'Suspender cliente' : 'Reativar cliente'}">
            ${isActive ? '⏸️' : '▶️'}
          </button>

          <button type="button" onclick="deleteTenantAccount(${t.id}, '${escapeJsString(t.name)}')"
            class="px-2 py-1.5 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60 font-bold text-xs transition-all cursor-pointer" title="Excluir cliente">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');
};

window.renewTenantTrialDays = async function(tenantId, tenantName, days = 5) {
  if (!confirm(`Deseja conceder mais ${days} dias de Teste VIP para o cliente '${tenantName}'?`)) return;
  try {
    const res = await api.addTenantTrial(tenantId, days);
    showToast(res.message || `Teste VIP renovado por mais ${days} dias para ${tenantName}!`, 'success');
    await window.loadTenantsTable();
  } catch (err) {
    showToast('Erro ao renovar teste: ' + err.message, 'error');
  }
};

// =========================================================================
// CONTROLE DE ATIVAÇÃO DE PLANOS (MENSAL, TRIMESTRAL, SEMESTRAL, ANUAL)
// =========================================================================

let currentActivatingTenant = null;
let selectedPlanDays = 30;
let selectedPlanType = 'monthly';
let selectedPlanLabel = 'Mensal (30 dias)';

window.openPlanActivationModal = function(id, name, phone, password) {
  currentActivatingTenant = { id, name, phone, password };
  selectedPlanDays = 30;
  selectedPlanType = 'monthly';
  selectedPlanLabel = 'Mensal (30 dias)';

  const modal = document.getElementById('modal-activate-plan');
  const nameEl = document.getElementById('modal-act-tenant-name');
  const infoEl = document.getElementById('modal-act-tenant-info');
  const labelSelected = document.getElementById('act-plan-label-selected');
  const successBox = document.getElementById('act-plan-success-actions');
  const customInput = document.getElementById('input-custom-days');

  if (nameEl) nameEl.textContent = `Ativar Plano para: ${name}`;
  if (infoEl) infoEl.textContent = phone ? `WhatsApp: ${phone}` : 'Sem WhatsApp cadastrado';
  if (labelSelected) labelSelected.textContent = selectedPlanLabel;
  if (successBox) successBox.classList.add('hidden');
  if (customInput) customInput.value = '';

  resetPlanOptionButtons();
  const defaultBtn = document.querySelector('.plan-opt-btn');
  if (defaultBtn) {
    defaultBtn.classList.remove('border-slate-700', 'bg-slate-950/70');
    defaultBtn.classList.add('border-emerald-500', 'bg-emerald-950/40');
  }

  if (modal) modal.classList.remove('hidden');
};

window.closeActivatePlanModal = function() {
  const modal = document.getElementById('modal-activate-plan');
  if (modal) modal.classList.add('hidden');
  currentActivatingTenant = null;
};

window.selectPlanOption = function(days, planType, label, btnEl) {
  selectedPlanDays = days;
  selectedPlanType = planType;
  selectedPlanLabel = label;

  const labelSelected = document.getElementById('act-plan-label-selected');
  if (labelSelected) labelSelected.textContent = label;

  const customInput = document.getElementById('input-custom-days');
  if (customInput) customInput.value = '';

  resetPlanOptionButtons();
  if (btnEl) {
    btnEl.classList.remove('border-slate-700', 'bg-slate-950/70');
    btnEl.classList.add('border-emerald-500', 'bg-emerald-950/40');
  }
};

window.handleCustomDaysInput = function(val) {
  const num = parseInt(val);
  if (num && num > 0) {
    selectedPlanDays = num;
    selectedPlanType = 'custom';
    selectedPlanLabel = `Personalizado (${num} dias)`;
    const labelSelected = document.getElementById('act-plan-label-selected');
    if (labelSelected) labelSelected.textContent = selectedPlanLabel;
    resetPlanOptionButtons();
  }
};

function resetPlanOptionButtons() {
  document.querySelectorAll('.plan-opt-btn').forEach(btn => {
    btn.classList.remove('border-emerald-500', 'bg-emerald-950/40', 'border-indigo-500', 'bg-indigo-950/40', 'border-cyan-500', 'bg-cyan-950/40');
    btn.classList.add('border-slate-700', 'bg-slate-950/70');
  });
}

window.confirmPlanActivation = async function() {
  if (!currentActivatingTenant) return;
  const btn = document.getElementById('btn-confirm-plan-activation');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Ativando no banco...</span>';
  }

  try {
    const res = await api.activateTenantSubscription(currentActivatingTenant.id, selectedPlanDays, selectedPlanType);
    showToast(res.message || 'Assinatura ativada com sucesso!', 'success');
    await loadTenantsTable();

    // Mostra botao de enviar WhatsApp com dados completos
    const successBox = document.getElementById('act-plan-success-actions');
    const waBtn = document.getElementById('btn-act-plan-whatsapp');
    if (successBox && waBtn && currentActivatingTenant.phone) {
      successBox.classList.remove('hidden');
      const tenant = currentActivatingTenant;
      const expireDate = res.subscription_expires_at ? res.subscription_expires_at.split(' ')[0] : '';
      waBtn.onclick = function() {
        const link = `${window.location.origin}/?key=${encodeURIComponent(tenant.password || '')}`;
        const msg = `Olá, ${tenant.name}!

Sua assinatura *${selectedPlanLabel}* no BICHO MASTER PRO foi ativada com sucesso!

📅 Validade: até ${expireDate}
🔑 Sua Senha de Acesso: *${tenant.password}*
🔗 Link Direto: ${link}

Bons palpites e boas apostas!`;
        const waUrl = `https://wa.me/55${tenant.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');
      };
    } else {
      setTimeout(() => closeActivatePlanModal(), 1200);
    }
  } catch (err) {
    showToast('Erro ao ativar plano: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>⭐</span> <span>Confirmar e Ativar Acesso</span>';
    }
  }
};



window.expireTenantTrial = async function(id, name) {
  if (!confirm(`Deseja realmente encerrar o período de teste de "${name}" agora?\n\nO usuário será bloqueado no aplicativo e verá imediatamente a tela para assinar um plano.`)) {
    return;
  }
  try {
    const res = await api.expireTenantTrial(id);
    showToast(res.message || 'Período de teste encerrado com sucesso!', 'success');
    await loadTenantsTable();
  } catch (err) {
    showToast('Erro ao encerrar teste: ' + err.message, 'error');
  }
};

window.extendTenantTrial = async function(id) {
  try {
    const res = await api.addTenantTrial(id);
    showToast(res.message || 'Acesso estendido com sucesso!', 'success');
    await loadTenantsTable();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
};

window.activateTenantSubscription = async function(id) {
  try {
    const res = await api.activateTenantSubscription(id);
    showToast(res.message || 'Assinatura ativada por 30 dias!', 'success');
    await loadTenantsTable();
  } catch (err) {
    showToast('Erro: ' + err.message, 'error');
  }
};

window.handleCreateTenant = async function(event) {
  event.preventDefault();
  const name = document.getElementById('tenant-name')?.value;
  const phone = document.getElementById('tenant-phone')?.value;
  const key = document.getElementById('tenant-key')?.value;
  const notes = document.getElementById('tenant-notes')?.value;
  const planVal = document.getElementById('tenant-plan-select')?.value || 'free:5';
  const btn = document.getElementById('btn-create-tenant');

  if (!name || !name.trim()) return;
  btn.disabled = true;
  btn.textContent = 'Cadastrando...';

  const [planType, daysStr] = planVal.split(':');
  const days = parseInt(daysStr, 10) || 5;

  try {
    const payload = {
      name: name.trim(),
      plan_type: planType,
      days: days
    };
    if (phone && phone.trim()) payload.phone = phone.trim();
    if (key && key.trim()) payload.tenant_key = key.trim();
    if (notes && notes.trim()) payload.notes = notes.trim();

    const created = await api.createTenant(payload);
    showToast(`Cliente '${created.name}' cadastrado com sucesso!`, 'success');
    document.getElementById('form-add-tenant').reset();
    await window.loadTenantsTable();
  } catch (err) {
    showToast('Erro ao cadastrar cliente: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Cadastrar e Liberar Acesso';
  }
};

window.copyTenantWhatsApp = async function(key, name, btn, phone = '', password = '') {
  const effectivePass = password || key;
  const link = `${window.location.origin}/?key=${encodeURIComponent(key)}`;
  const text = `Olá, ${name}!\n\nSegue seu link e dados de acesso exclusivo ao BICHO MASTER PRO:\n${link}\n\nSua Senha de Acesso: ${effectivePass}\n\nBasta clicar no link para entrar automaticamente no sistema. Bons palpites!`;

  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length >= 8) {
      const waUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');
      showToast(`Abrindo WhatsApp de ${name}...`, 'success');
      return;
    }
  }

  const ok = await copyToClipboard(text, btn, 'Copiado!');
  if (ok) {
    showToast('Mensagem pronta para WhatsApp copiada!', 'success');
  }
};

window.copySimpleText = async function(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(`${label} copiada!`, 'success');
  } catch {
    showToast('Erro ao copiar', 'error');
  }
};

window.toggleTenantStatus = async function(id, currentStatus) {
  const nextStatus = currentStatus === 'active' ? 'inactive' : 'active';
  try {
    await api.updateTenant(id, { status: nextStatus });
    showToast(`Testador ${nextStatus === 'active' ? 'Reativado' : 'Suspenso'} com sucesso!`, 'success');
    await loadTenantsTable();
  } catch (err) {
    showToast('Erro ao alterar status: ' + err.message, 'error');
  }
};

window.deleteTenantAccount = async function(id, name) {
  if (!confirm(`Tem certeza que deseja excluir o testador '${name}'? As análises salvas dele serão apagadas.`)) {
    return;
  }
  try {
    await api.deleteTenant(id);
    showToast(`Testador '${name}' excluído.`, 'success');
    await loadTenantsTable();
  } catch (err) {
    showToast('Erro ao excluir: ' + err.message, 'error');
  }
};

async function copyToClipboard(text, btnElement, feedbackText = 'Copiado!') {
  try {
    await navigator.clipboard.writeText(text);
    if (btnElement) {
      const original = btnElement.innerHTML;
      btnElement.innerHTML = `<span>✅</span> <span>${feedbackText}</span>`;
      btnElement.classList.add('bg-emerald-600', 'text-white');
      setTimeout(() => {
        btnElement.innerHTML = original;
        btnElement.classList.remove('bg-emerald-600', 'text-white');
      }, 2000);
    }
    return true;
  } catch (err) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textarea);
      if (btnElement) {
        const original = btnElement.innerHTML;
        btnElement.innerHTML = `<span>✅</span> <span>${feedbackText}</span>`;
        setTimeout(() => { btnElement.innerHTML = original; }, 2000);
      }
      return true;
    } catch (e) {
      document.body.removeChild(textarea);
      showToast('Erro ao copiar para a área de transferência', 'error');
      return false;
    }
  }
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  const colors = {
    success: 'bg-emerald-600 text-white shadow-emerald-500/20',
    error: 'bg-rose-600 text-white shadow-rose-500/20',
    info: 'bg-indigo-600 text-white shadow-indigo-500/20',
  };

  toast.className = `fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl font-bold text-xs transition-all transform duration-300 translate-y-5 opacity-0 flex items-center gap-2 ${colors[type] || colors.info}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> <span>${msg}</span>`;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-5', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// =========================================================================
// ROBÔ DE SINCRONIZAÇÃO EM SEGUNDO PLANO (AUTO-SYNC)
// =========================================================================
window.loadScraperMonitor = async function() {
  try {
    const data = await api.getScraperStatus();
    
    // Status Badge
    const badge = document.getElementById('scraper-badge-status');
    const toggleBtn = document.getElementById('btn-toggle-scraper');
    const toggleLabel = document.getElementById('label-toggle-scraper');

    if (badge) {
      if (data.status === 'running') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span><span class="text-emerald-400 font-bold">Ativo & Monitorando</span>';
        if (toggleLabel) toggleLabel.textContent = 'Pausar Robô';
      } else if (data.status === 'paused') {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span><span class="text-amber-400 font-bold">Pausado</span>';
        if (toggleLabel) toggleLabel.textContent = 'Ativar Robô';
      } else {
        badge.innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span><span class="text-slate-400 font-bold">Parado</span>';
        if (toggleLabel) toggleLabel.textContent = 'Iniciar Robô';
      }
    }

    // Próximo sorteio
    const upcomingEl = document.getElementById('scraper-upcoming-slot');
    if (upcomingEl) {
      const up = data.schedule && data.schedule.upcoming_draw;
      if (up) {
        upcomingEl.textContent = `${up.lottery} • ${up.slot_code} (${up.time}) em ${up.minutes_until}m`;
      } else {
        upcomingEl.textContent = 'Nenhum sorteio iminente';
      }
    }

    // Última execução
    const lastRunEl = document.getElementById('scraper-last-run');
    if (lastRunEl) {
      lastRunEl.textContent = data.last_run_at ? data.last_run_at.split(' ')[1] : 'Aguardando 1º ciclo';
    }

    // Ciclos
    const cyclesEl = document.getElementById('scraper-total-cycles');
    if (cyclesEl) {
      cyclesEl.textContent = `${data.metrics ? data.metrics.total_cycles : 0} ciclos`;
    }

    // Tabela de Histórico
    const tbody = document.getElementById('scraper-history-tbody');
    if (tbody && data.sync_history) {
      if (data.sync_history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-3 py-4 text-center text-slate-500">Nenhum ciclo registrado no histórico recente.</td></tr>';
      } else {
        tbody.innerHTML = data.sync_history.map(item => {
          const typeBadge = item.type === 'auto'
            ? '<span class="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold">Auto</span>'
            : '<span class="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[10px] font-bold">Manual</span>';
          
          const statusBadge = item.success
            ? '<span class="text-emerald-400 font-bold">✓ OK</span>'
            : '<span class="text-rose-400 font-bold">✗ Erro</span>';

          return `
            <tr class="hover:bg-slate-900/50 transition-colors">
              <td class="px-3 py-2 text-slate-400 font-mono">${(item.timestamp || '').split(' ')[1] || item.timestamp}</td>
              <td class="px-3 py-2">${typeBadge}</td>
              <td class="px-3 py-2 font-bold text-slate-200">${item.lottery}</td>
              <td class="px-3 py-2 text-center font-bold text-indigo-300">${item.draws_synced || 0}</td>
              <td class="px-3 py-2 text-center font-bold text-amber-300">${item.evaluations || 0}</td>
              <td class="px-3 py-2">${statusBadge}</td>
            </tr>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar monitor de scraping:', err);
  }
};

window.handleToggleScraper = async function() {
  try {
    const res = await api.toggleScraper();
    showToast(res.auto_sync_enabled ? 'Robô de sincronização ativado!' : 'Robô de sincronização pausado.', 'info');
    await loadScraperMonitor();
  } catch (err) {
    showToast('Erro ao alternar robô: ' + err.message, 'error');
  }
};

window.handleRunScraperNow = async function() {
  const btn = document.getElementById('btn-run-scraper-now');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span> <span>Sincronizando...</span>';
  }
  try {
    const res = await api.runScraperNow();
    showToast(`Sincronização concluída! ${res.draws_synced || 0} sorteios atualizados.`, 'success');
    await loadScraperMonitor();
    if (typeof loadResultsTable === 'function') await loadResultsTable();
    await loadScraperMonitor();
  } catch (err) {
    showToast('Erro ao sincronizar: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>⚡</span> <span>Sincronizar Agora</span>';
    }
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

// ============================================================================
// DASHBOARD DE FATURAMENTO E RELATÓRIOS FINANCEIROS
// ============================================================================

let currentFinancialGroupBy = 'week'; // 'day', 'week', 'month'
let currentFinancialRange = 90; // 30, 90, 180, 365, 0 (all)
let financialChartInstance = null;
let currentTenantsCache = [];

function formatBRL(value) {
  const num = typeof value === 'number' ? value : parseFloat(value) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getGroupLabelTitle(group) {
  if (group === 'day') return 'Por Dia';
  if (group === 'month') return 'Por Mês';
  return 'Por Semana';
}

window.loadFinancialDashboard = async function() {
  const tableBody = document.getElementById('fin-table-body');
  const recentBox = document.getElementById('fin-recent-container');

  try {
    const report = await api.getFinancialReport(currentFinancialGroupBy, currentFinancialRange);
    if (!report) return;

    // 1. Atualiza KPIs
    const kpiTotal = document.getElementById('fin-kpi-total');
    const kpiCount = document.getElementById('fin-kpi-trans-count');
    const kpiMonth = document.getElementById('fin-kpi-month');
    const kpiSubs = document.getElementById('fin-kpi-subscribers');
    const kpiTicket = document.getElementById('fin-kpi-ticket');

    if (kpiTotal) kpiTotal.textContent = formatBRL(report.summary.total_revenue);
    if (kpiCount) kpiCount.textContent = `${report.summary.total_transactions} vendas realizadas`;
    if (kpiMonth) kpiMonth.textContent = formatBRL(report.summary.month_revenue);
    if (kpiSubs) kpiSubs.textContent = report.summary.active_subscribers;
    if (kpiTicket) kpiTicket.textContent = formatBRL(report.summary.average_ticket);

    // 2. Atualiza Títulos
    const chartTitle = document.getElementById('fin-chart-title');
    const tableGroupName = document.getElementById('fin-table-group-name');
    if (chartTitle) chartTitle.textContent = `Evolução do Faturamento (${getGroupLabelTitle(currentFinancialGroupBy)})`;
    if (tableGroupName) tableGroupName.textContent = getGroupLabelTitle(currentFinancialGroupBy);

    // 3. Renderiza Gráfico
    renderFinancialChart(report.chart.labels, report.chart.revenues, report.chart.counts, currentFinancialGroupBy);

    // 4. Renderiza Tabela Detalhada
    renderFinancialTable(report.table);

    // 5. Renderiza Vendas Recentes
    renderFinancialRecent(report.recent_payments);

  } catch (err) {
    console.error('Erro ao carregar dashboard financeiro:', err);
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-rose-400 font-sans">Erro ao carregar dados financeiros: ${err.message}</td></tr>`;
    }
  }
};

window.setFinancialGroupBy = function(mode) {
  currentFinancialGroupBy = mode;

  // Atualiza visual dos botões de agrupamento
  const btnDay = document.getElementById('btn-group-day');
  const btnWeek = document.getElementById('btn-group-week');
  const btnMonth = document.getElementById('btn-group-month');

  [btnDay, btnWeek, btnMonth].forEach(b => {
    if (b) {
      b.classList.remove('bg-indigo-600', 'text-white', 'shadow');
      b.classList.add('text-slate-400', 'hover:text-slate-200');
    }
  });

  const activeBtn = mode === 'day' ? btnDay : (mode === 'month' ? btnMonth : btnWeek);
  if (activeBtn) {
    activeBtn.classList.remove('text-slate-400', 'hover:text-slate-200');
    activeBtn.classList.add('bg-indigo-600', 'text-white', 'shadow');
  }

  loadFinancialDashboard();
};

window.setFinancialRange = function(rangeValue) {
  currentFinancialRange = parseInt(rangeValue) || 90;
  loadFinancialDashboard();
};

function renderFinancialChart(labels, revenues, counts, groupBy) {
  const canvas = document.getElementById('financial-chart');
  if (!canvas) return;

  // Se Chart.js não estiver disponível, exibe aviso limpo
  if (typeof Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<div class="h-full flex items-center justify-center text-xs text-slate-400">Biblioteca de gráficos carregando...</div>';
    return;
  }

  const ctx = canvas.getContext('2d');
  if (financialChartInstance) {
    financialChartInstance.destroy();
  }

  // Gradiente de preenchimento moderno
  const gradient = ctx.createLinearGradient(0, 0, 0, 300);
  gradient.addColorStop(0, 'rgba(16, 185, 129, 0.40)');
  gradient.addColorStop(0.8, 'rgba(16, 185, 129, 0.02)');
  gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');

  // Se não houver dados, exibe vazio
  if (!labels || labels.length === 0) {
    financialChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Sem dados'],
        datasets: [{
          data: [0],
          borderColor: '#10B981',
          borderWidth: 2,
          fill: true,
          backgroundColor: gradient
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        }
      }
    });
    return;
  }

  financialChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Faturamento (R$)',
        data: revenues,
        countsData: counts,
        borderColor: '#10B981',
        borderWidth: 2.5,
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#0f172a',
        pointBorderWidth: 2,
        pointRadius: labels.length > 25 ? 2.5 : 4.5,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: '#34d399',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#f8fafc',
          bodyColor: '#e2e8f0',
          borderColor: 'rgba(16, 185, 129, 0.4)',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          callbacks: {
            label: function(context) {
              const val = context.parsed.y || 0;
              const idx = context.dataIndex;
              const qtd = counts[idx] || 0;
              return [
                ` Faturamento: ${formatBRL(val)}`,
                ` Assinaturas: ${qtd}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false,
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 10, family: 'monospace' },
            maxRotation: labels.length > 15 ? 45 : 0,
            autoSkip: true,
            maxTicksLimit: 14
          }
        },
        y: {
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.05)',
            drawBorder: false,
          },
          ticks: {
            color: '#94a3b8',
            font: { size: 10, family: 'monospace' },
            callback: function(value) {
              return 'R$ ' + value;
            }
          }
        }
      }
    }
  });
}

function renderFinancialTable(tableData) {
  const tbody = document.getElementById('fin-table-body');
  if (!tbody) return;

  if (!tableData || tableData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-500 font-sans">Nenhum dado financeiro para o período selecionado.</td></tr>';
    return;
  }

  const planBadges = {
    monthly: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">Mensal</span>',
    quarterly: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">Trimestral</span>',
    semiannual: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">Semestral</span>',
    yearly: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Anual</span>',
    lifetime: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">Vitalício</span>',
  };

  tbody.innerHTML = tableData.map(row => {
    let plansHtml = '';
    if (row.plans && Object.keys(row.plans).length > 0) {
      plansHtml = Object.entries(row.plans).map(([p, count]) => {
        const badge = planBadges[p] || `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">${p}</span>`;
        return `<span class="inline-flex items-center gap-1">${badge} <strong class="text-white text-[10px]">x${count}</strong></span>`;
      }).join(' ');
    } else {
      plansHtml = '<span class="text-slate-500 text-[10px]">---</span>';
    }

    return `
      <tr class="hover:bg-slate-900/50 transition-colors">
        <td class="py-2.5 px-3">
          <div class="font-bold text-white text-xs">${row.label}</div>
          <div class="text-[10px] text-slate-500 font-sans">${row.date_start} a ${row.date_end}</div>
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-xs font-bold font-mono">
            ${row.count}
          </span>
        </td>
        <td class="py-2.5 px-3 text-right">
          <span class="font-bold text-emerald-400 text-xs sm:text-sm">
            ${formatBRL(row.amount)}
          </span>
        </td>
        <td class="py-2.5 px-3 text-right text-slate-300 text-xs">
          ${formatBRL(row.avg_ticket)}
        </td>
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${plansHtml}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderFinancialRecent(recentList) {
  const container = document.getElementById('fin-recent-container');
  if (!container) return;

  if (!recentList || recentList.length === 0) {
    container.innerHTML = '<p class="text-xs text-slate-500 py-4 text-center">Nenhuma transação recente encontrada.</p>';
    return;
  }

  const planLabels = {
    monthly: 'Mensal',
    quarterly: 'Trimestral',
    semiannual: 'Semestral',
    yearly: 'Anual',
    lifetime: 'Vitalício VIP'
  };

  const methodBadges = {
    pix: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-teal-500/20 text-teal-300 border border-teal-500/40">📱 PIX</span>',
    cartao: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">💳 Cartão</span>',
    boleto: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">📄 Boleto</span>',
    activation: '<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">👑 Ativação Admin</span>',
  };

  container.innerHTML = recentList.map(p => {
    const pLabel = planLabels[p.plan_type] || p.plan_type;
    const mBadge = methodBadges[p.payment_method] || `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-700">${p.payment_method}</span>`;

    return `
      <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-3 transition-all">
        <div class="min-w-0 space-y-0.5">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-black text-xs text-white truncate max-w-[180px] sm:max-w-none">${p.customer_name}</h4>
            <span class="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">${pLabel} (${p.days}d)</span>
            ${mBadge}
          </div>
          <div class="text-[10px] text-slate-400 font-mono">
            <span>📅 ${p.created_at}</span>
          </div>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <div class="text-right">
            <span class="font-black text-emerald-400 text-xs sm:text-sm font-mono">${formatBRL(p.amount)}</span>
          </div>
          <button type="button" onclick="deleteFinancialPayment(${p.id})"
            class="px-2 py-1 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 font-bold text-[10px] transition-all cursor-pointer" title="Excluir Transação">
            🗑️
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.openManualPaymentModal = async function() {
  const modal = document.getElementById('modal-manual-payment');
  const tenantSelect = document.getElementById('modal-pay-tenant-id');
  if (!modal) return;

  // Carrega opções de testadores cadastrados
  if (tenantSelect) {
    tenantSelect.innerHTML = '<option value="">-- Cliente Avulso / Não cadastrado --</option>';
    try {
      if (!currentTenantsCache || currentTenantsCache.length === 0) {
        currentTenantsCache = await api.getTenants();
      }
      currentTenantsCache.forEach(t => {
        if (t.role !== 'admin') {
          const opt = document.createElement('option');
          opt.value = t.id;
          opt.textContent = `${t.name} (${t.phone || t.email || 'Sem contato'})`;
          tenantSelect.appendChild(opt);
        }
      });
    } catch (e) {
      console.warn('Aviso ao carregar testadores no modal:', e);
    }
  }

  modal.classList.remove('hidden');
};

window.closeManualPaymentModal = function() {
  const modal = document.getElementById('modal-manual-payment');
  if (modal) modal.classList.add('hidden');
};

window.handleSelectTenantForPayment = function(select) {
  const tenantId = select.value;
  const nameInput = document.getElementById('modal-pay-customer-name');
  if (!tenantId) return;

  const found = (currentTenantsCache || []).find(t => String(t.id) === String(tenantId));
  if (found && nameInput) {
    nameInput.value = found.name;
  }
};

window.handleSelectPlanTypeChange = function(select) {
  const pType = select.value;
  const amountInput = document.getElementById('modal-pay-amount');
  const daysInput = document.getElementById('modal-pay-days');

  const prices = {
    monthly: { amount: 14.90, days: 30 },
    quarterly: { amount: 37.00, days: 90 },
    semiannual: { amount: 67.00, days: 180 },
    yearly: { amount: 97.00, days: 365 },
  };

  if (prices[pType]) {
    if (amountInput) amountInput.value = prices[pType].amount.toFixed(2);
    if (daysInput) daysInput.value = prices[pType].days;
  }
};

window.handleManualPaymentSubmit = async function(event) {
  event.preventDefault();
  const btn = document.getElementById('btn-submit-manual-payment');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Salvando...';
  }

  const tenantIdVal = document.getElementById('modal-pay-tenant-id')?.value;
  const tenantId = tenantIdVal ? parseInt(tenantIdVal) : null;
  const customerName = document.getElementById('modal-pay-customer-name')?.value?.trim();
  const planType = document.getElementById('modal-pay-plan-type')?.value;
  const amount = parseFloat(document.getElementById('modal-pay-amount')?.value) || 0;
  const days = parseInt(document.getElementById('modal-pay-days')?.value) || 30;
  const method = document.getElementById('modal-pay-method')?.value || 'pix';
  const notes = document.getElementById('modal-pay-notes')?.value?.trim() || '';

  try {
    await api.createFinancialPayment({
      tenant_id: tenantId,
      customer_name: customerName,
      plan_type: planType,
      amount: amount,
      days: days,
      payment_method: method,
      notes: notes
    });

    showToast('Venda registrada com sucesso!', 'success');
    closeManualPaymentModal();
    await loadFinancialDashboard();
    if (tenantId && typeof loadTenantsTable === 'function') {
      await loadTenantsTable();
    }
  } catch (err) {
    showToast('Erro ao registrar venda: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Salvar Venda';
    }
  }
};

window.deleteFinancialPayment = async function(paymentId) {
  if (!confirm('Deseja realmente excluir esta transação?')) return;
  try {
    await api.deleteFinancialPayment(paymentId);
    showToast('Transação excluída com sucesso!', 'success');
    await loadFinancialDashboard();
  } catch (err) {
    showToast('Erro ao excluir transação: ' + err.message, 'error');
  }
};

window.seedFinancialDemo = async function() {
  try {
    await api.seedFinancialDemo();
    showToast('Vendas de demonstração inseridas com sucesso!', 'success');
    await loadFinancialDashboard();
  } catch (err) {
    showToast('Erro ao inserir dados: ' + err.message, 'error');
  }
};

window.clearFinancialDemo = async function() {
  if (!confirm('Deseja remover todas as vendas de demonstração?')) return;
  try {
    await api.clearFinancialDemo();
    showToast('Dados de demonstração removidos!', 'success');
    await loadFinancialDashboard();
  } catch (err) {
    showToast('Erro ao limpar demonstração: ' + err.message, 'error');
  }
};


window.clearFinancialData = async function() {
  if (!confirm("Tem certeza que deseja ZERAR todo o relatório de faturamento e vendas de teste?\n\nEsta ação limpará o histórico para que você comece do zero com as vendas reais.")) {
    return;
  }
  try {
    const res = await api.clearFinancialData();
    showToast(res.message || "Histórico financeiro zerado com sucesso!", "success");
    await loadFinancialDashboard();
    await loadTenantsTable();
  } catch (err) {
    showToast("Erro ao zerar dados: " + err.message, "error");
  }
};
