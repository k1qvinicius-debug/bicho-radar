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
// GESTÃO DE TESTADORES / MULTI-TENANTS
// =========================================================================

window.loadTenantsTable = async function() {
  const container = document.getElementById('tenants-table-container');
  const countEl = document.getElementById('tenants-count');
  if (!container) return;

  try {
    const tenants = await api.getTenants();
    if (countEl) countEl.textContent = tenants.length;

    if (tenants.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400 py-6 text-center">Nenhum testador cadastrado ainda.</p>';
      return;
    }

    container.innerHTML = tenants.map(t => {
      const isAdmin = t.role === 'admin';
      const isActive = t.status === 'active';
      const isGoogle = t.auth_provider === 'google';
      const isSubscriber = t.subscription_status === 'active' && t.plan_type === 'subscriber';
      const isExpired = !isAdmin && (t.subscription_status === 'expired' || (t.trial_days_remaining !== undefined && t.trial_days_remaining <= 0));

      const roleBadge = isAdmin
        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">👑 MASTER ADMIN</span>'
        : isSubscriber
        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">⭐ ASSINANTE</span>'
        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">DEGUSTAÇÃO</span>';

      const statusBadge = isActive
        ? (isExpired
            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">🔒 TESTE EXPIRADO (0d)</span>'
            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">${isAdmin ? 'ATIVO' : `ATIVO (${t.trial_days_remaining !== undefined ? t.trial_days_remaining : 7}d restantes)`}</span>`)
        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">SUSPENSO</span>';

      const providerBadge = isGoogle
        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1">🌐 Gmail / Google</span>'
        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">Chave / Manual</span>';

      const actionsHtml = isAdmin
        ? '<span class="text-[11px] text-slate-500 italic">Conta Principal de Acesso</span>'
        : `
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" onclick="extendTenantTrial(${t.id})"
              class="px-2.5 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900/90 text-indigo-300 border border-indigo-800/80 font-bold text-xs transition-all cursor-pointer shadow-sm"
              title="Renovar acesso para este usuário (+30 dias)">
              <span>+30 Dias</span>
            </button>
            <button type="button" onclick="activateTenantSubscription(${t.id})"
              class="px-2.5 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900/90 text-emerald-300 border border-emerald-800/80 font-bold text-xs transition-all cursor-pointer shadow-sm"
              title="Ativar assinatura por 30 dias">
              <span>⭐ Ativar</span>
            </button>
            <button type="button" onclick="copyTenantWhatsApp('${t.tenant_key}', '${t.name.replace(/'/g, "\\'")}', this, '${t.phone || ''}')"
              class="px-2.5 py-1.5 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold text-xs transition-all flex items-center gap-1 shadow-sm active:scale-95 cursor-pointer"
              title="${t.phone ? 'Abrir conversa direta no WhatsApp do usuário' : 'Copiar link e senha para envio no WhatsApp'}">
              <span>📲</span> <span>WhatsApp</span>
            </button>
            <button type="button" onclick="toggleTenantStatus(${t.id}, '${t.status}')"
              class="px-2 py-1.5 rounded-lg ${isActive ? 'bg-amber-950/60 text-amber-300 border border-amber-800/60 hover:bg-amber-900/60' : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 hover:bg-emerald-900/60'} font-bold text-xs transition-all cursor-pointer">
              ${isActive ? '⏸️' : '▶️'}
            </button>
            <button type="button" onclick="deleteTenantAccount(${t.id}, '${t.name.replace(/'/g, "\\'")}')"
              class="px-2 py-1.5 rounded-lg bg-rose-950/60 text-rose-300 border border-rose-800/60 hover:bg-rose-900/60 font-bold text-xs transition-all cursor-pointer" title="Excluir">
              🗑️
            </button>
          </div>
        `;

      return `
        <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="space-y-1.5">
            <div class="flex items-center gap-2 flex-wrap">
              <h4 class="font-black text-sm text-white">${t.name}</h4>
              ${t.email ? `<span class="text-xs text-indigo-300 font-mono bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-900/50">${t.email}</span>` : ''}
              ${t.phone ? `<a href="https://wa.me/55${t.phone.replace(/\D/g, '')}" target="_blank" class="text-xs text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/80 hover:bg-emerald-900/60 transition-colors inline-flex items-center gap-1 font-bold" title="Conversar no WhatsApp">📱 ${t.phone}</a>` : '<span class="text-[10px] text-slate-500 font-mono italic">Sem telefone</span>'}
              ${providerBadge}
              ${roleBadge}
              ${statusBadge}
            </div>
            <div class="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
              <span>Chave: <button type="button" onclick="copySimpleText('${t.tenant_key}', 'Chave')" title="Copiar chave" class="font-mono font-bold text-amber-300 bg-slate-950 px-2 py-0.5 rounded border border-slate-800 hover:border-amber-400 transition-colors">${t.tenant_key} 📋</button></span>
              <span>Análises salvas: <strong class="text-indigo-300 font-mono">${t.snapshots_count}</strong></span>
              <span>Último acesso: <span class="font-mono text-slate-300">${t.last_active_at || 'Nunca'}</span></span>
            </div>
            ${t.notes ? `<p class="text-[11px] text-slate-400 italic">Notas: ${t.notes}</p>` : ''}
          </div>

          <div class="pt-2 md:pt-0 border-t md:border-t-0 border-slate-800 shrink-0">
            ${actionsHtml}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = `<p class="text-xs text-rose-400 py-6 text-center">Erro ao carregar testadores: ${err.message}</p>`;
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
  const btn = document.getElementById('btn-create-tenant');

  if (!name) return;
  btn.disabled = true;
  btn.textContent = 'Gerando...';

  try {
    const payload = { name };
    if (phone && phone.trim()) payload.phone = phone.trim();
    if (key && key.trim()) payload.tenant_key = key.trim();
    if (notes && notes.trim()) payload.notes = notes.trim();

    const created = await api.createTenant(payload);
    showToast(`Testador '${created.name}' criado com sucesso!`, 'success');
    document.getElementById('form-add-tenant').reset();
    await loadTenantsTable();
  } catch (err) {
    showToast('Erro ao criar testador: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gerar Acesso e Link de Teste';
  }
};

window.copyTenantWhatsApp = async function(key, name, btn, phone = '') {
  const link = `${window.location.origin}/?key=${encodeURIComponent(key)}`;
  const text = `Olá, ${name}!\n\nSegue seu link e dados de acesso exclusivo ao BICHO MASTER PRO:\n${link}\n\nSua Senha / Chave de Acesso: ${key}\n\nBasta clicar no link para entrar automaticamente no sistema. Bons palpites!`;

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
