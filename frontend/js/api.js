/**
 * Cliente HTTP da API REST - Bicho Analytics
 * Gerencia requisições autenticadas, multi-tenancy e controle de sessão.
 */
const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('bicho_auth_token') || sessionStorage.getItem('bicho_auth_token');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-Access-Key'] = token;
  }
  return headers;
}

function notifyTrialExpiredIfForbidden(status, errData) {
  if (status === 403) {
    const detail = (errData && errData.detail) ? String(errData.detail) : '';
    if (detail.includes('TRIAL_EXPIRED') || detail.includes('expirou') || detail.includes('testeção') || detail.includes('dispositivo') || detail.includes('rede')) {
      if (typeof window.showTrialExpiredModal === 'function') {
        window.showTrialExpiredModal();
      } else if (typeof window.showVipPlansModal === 'function') {
        window.showVipPlansModal();
      }
    }
  }
}

function getOrCreateDeviceId() {
  let id = null;
  try {
    id = localStorage.getItem('bm_device_id');
    if (!id) {
      const match = document.cookie.match(/bm_device_id=([^;]+)/);
      if (match) id = match[1];
    }
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 12) + '_' + Date.now().toString(36);
      localStorage.setItem('bm_device_id', id);
      document.cookie = m_device_id=; max-age=31536000; path=/; SameSite=Lax;
    }
  } catch (e) {
    id = 'dev_fallback_' + Date.now();
  }
  return id;
}

const api = {
  // =========================================================================
  // AUTENTICAÇÃO E SESSÃO
  // =========================================================================

  async login(credentialsOrKey) {
    let payload;
    if (typeof credentialsOrKey === 'string') {
      payload = { key: credentialsOrKey.trim() };
    } else if (credentialsOrKey && typeof credentialsOrKey === 'object') {
      payload = credentialsOrKey;
    } else {
      payload = { key: '' };
    }
    payload.device_id = getOrCreateDeviceId();

    const res = await fetch(${API_BASE}/auth/login, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Falha ao autenticar.' }));
      notifyTrialExpiredIfForbidden(res.status, err);
      throw new Error(err.detail || 'Credenciais ou chave de acesso inválidas.');
    }
    const data = await res.json();
    localStorage.setItem('bicho_auth_token', data.token);
    localStorage.setItem('bicho_tenant', JSON.stringify(data.tenant));

    const result = { ...data.tenant, token: data.token };
    result.tenant = result;
    return result;
  },

  async loginGoogle(payload) {
    payload = payload || {};
    payload.device_id = getOrCreateDeviceId();
    const res = await fetch(${API_BASE}/auth/google, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Falha ao logar com Google.' }));
      notifyTrialExpiredIfForbidden(res.status, err);
      throw new Error(err.detail || 'Falha ao autenticar conta Google.');
    }
    const data = await res.json();
    localStorage.setItem('bicho_auth_token', data.token);
    localStorage.setItem('bicho_tenant', JSON.stringify(data.tenant));

    const result = { ...data.tenant, token: data.token };
    result.tenant = result;
    return result;
  },

  async register(payload) {
    payload = payload || {};
    payload.device_id = getOrCreateDeviceId();
    const res = await fetch(${API_BASE}/auth/register, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Falha ao cadastrar perfil.' }));
      notifyTrialExpiredIfForbidden(res.status, err);
      throw new Error(err.detail || 'Falha ao cadastrar perfil.');
    }
    const data = await res.json();
    localStorage.setItem('bicho_auth_token', data.token);
    localStorage.setItem('bicho_tenant', JSON.stringify(data.tenant));

    const result = { ...data.tenant, token: data.token };
    result.tenant = result;
    return result;
  },

  async getPublicSettings() {
    try {
      const res = await fetch(`${API_BASE}/auth/settings`);
      if (!res.ok) return { support_whatsapp: '', trial_days: 7, app_name: 'Bicho Master' };
      return await res.json();
    } catch {
      return { support_whatsapp: '', trial_days: 7, app_name: 'Bicho Master' };
    }
  },

  async getMe() {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Sessão expirada.' }));
      notifyTrialExpiredIfForbidden(res.status, err);
      throw new Error('Sessão expirada ou inválida.');
    }
    return await res.json();
  },

  async checkSession() {
    try {
      const res = await fetch(`${API_BASE}/auth/check`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Erro' }));
        notifyTrialExpiredIfForbidden(res.status, err);
        return { authenticated: false };
      }
      return await res.json();
    } catch {
      return { authenticated: false };
    }
  },

  logout() {
    localStorage.removeItem('bicho_auth_token');
    localStorage.removeItem('bicho_tenant');
    sessionStorage.removeItem('bicho_auth_token');
    sessionStorage.removeItem('bicho_tenant');
  },

  getCurrentTenant() {
    try {
      const str = localStorage.getItem('bicho_tenant') || sessionStorage.getItem('bicho_tenant');
      return str ? JSON.parse(str) : null;
    } catch {
      return null;
    }
  },

  isAdmin() {
    const t = this.getCurrentTenant();
    return t && t.role === 'admin';
  },

  isLoggedIn() {
    const token = localStorage.getItem('bicho_auth_token') || sessionStorage.getItem('bicho_auth_token');
    const tenant = this.getCurrentTenant();
    return Boolean(token || tenant);
  },

  // =========================================================================
  // GESTÃO DE TESTADORES / MULTI-TENANTS (EXCLUSIVO MASTER ADMIN)
  // =========================================================================
  async getTenants() {
    const res = await fetch(`${API_BASE}/admin/tenants`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao listar testadores.' }));
      throw new Error(err.detail || 'Acesso negado.');
    }
    return await res.json();
  },

  async createTenant(data) {
    const res = await fetch(`${API_BASE}/admin/tenants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao criar testador.' }));
      throw new Error(err.detail || 'Erro ao criar testador.');
    }
    return await res.json();
  },

  async updateTenant(id, data) {
    const res = await fetch(`${API_BASE}/admin/tenants/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao atualizar testador.' }));
      throw new Error(err.detail || 'Erro ao atualizar testador.');
    }
    return await res.json();
  },

  async deleteTenant(id) {
    const res = await fetch(`${API_BASE}/admin/tenants/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao excluir testador.' }));
      throw new Error(err.detail || 'Erro ao excluir testador.');
    }
    return await res.json();
  },

  async getAdminSettings() {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Falha ao carregar configurações.');
    return await res.json();
  },

  async saveAdminSettings(data) {
    const res = await fetch(`${API_BASE}/admin/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Falha ao salvar configurações.');
    return await res.json();
  },

  async addTenantTrial(tenantId) {
    const res = await fetch(`${API_BASE}/admin/tenants/${tenantId}/add-trial`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao estender período de teste.' }));
      throw new Error(err.detail || 'Erro ao estender dias.');
    }
    return await res.json();
  },

  async activateTenantSubscription(tenantId) {
    const res = await fetch(`${API_BASE}/admin/tenants/${tenantId}/activate-subscription`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao ativar assinatura.' }));
      throw new Error(err.detail || 'Erro ao ativar assinatura.');
    }
    return await res.json();
  },

  // =========================================================================
  // LOTERIAS, RESULTADOS E PUXADAS
  // =========================================================================
  async getLotteries() {
    const res = await fetch(`${API_BASE}/results/lotteries`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar loterias.');
    return await res.json();
  },

  async getSlots(lottery = 'RJ', targetDate = null) {
    const params = new URLSearchParams();
    if (lottery) params.append('lottery', lottery);
    if (targetDate) params.append('target_date', targetDate);
    const qs = params.toString();
    const url = `${API_BASE}/results/slots${qs ? `?${qs}` : ''}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar horários.');
    return await res.json();
  },

  async syncWebResults(lottery = null) {
    const url = lottery
      ? `${API_BASE}/results/sync-web?lottery=${encodeURIComponent(lottery)}`
      : `${API_BASE}/results/sync-web`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao conectar ao site de resultados.' }));
      throw new Error(err.detail || 'Erro na sincronização web.');
    }
    return await res.json();
  },

  async getBichoCertoAtrasados(lottery = 'RJ') {
    const url = lottery
      ? `${API_BASE}/results/bichocerto-atrasados?lottery=${encodeURIComponent(lottery)}`
      : `${API_BASE}/results/bichocerto-atrasados`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Erro ao buscar atrasados.');
    return await res.json();
  },

  async syncBichoCerto(lottery = 'RJ') {
    const url = lottery
      ? `${API_BASE}/results/sync-bichocerto?lottery=${encodeURIComponent(lottery)}`
      : `${API_BASE}/results/sync-bichocerto`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao sincronizar atrasados.' }));
      throw new Error(err.detail || 'Erro na sincronização de atrasados.');
    }
    return await res.json();
  },

  async getCentenaMaster(date = null, lottery = 'RJ') {
    let url = `${API_BASE}/analysis/centena-master?lottery=${encodeURIComponent(lottery || 'RJ')}`;
    if (date) url += `&target_date=${encodeURIComponent(date)}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao carregar Centena Master.');
    return await res.json();
  },

  async getCruzDoDia(date = null) {
    let url = `${API_BASE}/analysis/cruz-do-dia`;
    if (date) url += `?target_date=${encodeURIComponent(date)}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao carregar Cruz do Dia.');
    return await res.json();
  },

  async getPuxadas(date = null, slot = null, lottery = 'RJ') {
    let url = `${API_BASE}/analysis/puxadas`;
    const params = new URLSearchParams();
    if (date) params.append('target_date', date);
    if (slot) params.append('target_slot', slot);
    if (lottery) params.append('lottery', lottery);
    if (params.toString()) url += `?${params.toString()}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao carregar Puxadas.');
    return await res.json();
  },

  async getPrediction(date = null, slot = null, strategy = 'hybrid', lottery = 'RJ') {
    let url = `${API_BASE}/analysis/predict`;
    const params = new URLSearchParams();
    if (date) params.append('target_date', date);
    if (slot) params.append('target_slot', slot);
    if (strategy) params.append('strategy', strategy);
    if (lottery) params.append('lottery', lottery);
    if (params.toString()) url += `?${params.toString()}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao carregar análise preditiva.');
    return await res.json();
  },

  async getFixedAnimalCombo(group, date = null, slot = null, lottery = 'RJ') {
    let url = `${API_BASE}/analysis/fixed-animal`;
    const params = new URLSearchParams();
    params.append('group', group);
    if (date) params.append('target_date', date);
    if (slot) params.append('target_slot', slot);
    if (lottery) params.append('lottery', lottery);
    url += `?${params.toString()}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao carregar fechamento com bicho fixo.');
    return await res.json();
  },

  async createSnapshot(targetDate, targetSlot, lottery = 'RJ') {
    const res = await fetch(`${API_BASE}/analysis/snapshot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ target_date: targetDate, target_slot: targetSlot, lottery }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao salvar snapshot.' }));
      throw new Error(err.detail || 'Erro ao salvar análise.');
    }
    return await res.json();
  },

  async getSnapshots(limit = 50, offset = 0, status = null, targetDate = null, lottery = null) {
    let url = `${API_BASE}/analysis/snapshots?limit=${limit}&offset=${offset}`;
    if (lottery) url += `&lottery=${encodeURIComponent(lottery)}`;
    if (status) url += `&status=${status}`;
    if (targetDate) url += `&target_date=${targetDate}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar histórico de análises.');
    return await res.json();
  },

  async getSnapshotDetails(id) {
    const res = await fetch(`${API_BASE}/analysis/snapshots/${id}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar detalhes da análise.');
    return await res.json();
  },

  async getMetricsSummary(lottery = null) {
    let url = `${API_BASE}/metrics/summary`;
    if (lottery && lottery !== 'all') {
      url += `?lottery=${encodeURIComponent(lottery)}`;
    }
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar métricas de desempenho.');
    return await res.json();
  },

  async getMetricsByLottery() {
    const res = await fetch(`${API_BASE}/metrics/by-lottery`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar ranking de assertividade por loteria.');
    return await res.json();
  },

  async getMetricsBySlot(lottery = null) {
    let url = `${API_BASE}/metrics/by-slot`;
    if (lottery && lottery !== 'all') {
      url += `?lottery=${encodeURIComponent(lottery)}`;
    }
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar métricas por horário.');
    return await res.json();
  },

  async getResults(limit = 20, offset = 0, slotOrLottery = null, startDate = null, endDate = null, lottery = null) {
    let slot = null;
    let lot = lottery;
    const knownLotteries = ['RJ', 'LOOK', 'NACIONAL', 'SP', 'FEDERAL'];
    if (slotOrLottery && knownLotteries.includes(slotOrLottery)) {
      lot = slotOrLottery;
    } else if (slotOrLottery) {
      slot = slotOrLottery;
    }
    let url = `${API_BASE}/results?limit=${limit}&offset=${offset}`;
    if (lot) url += `&lottery=${encodeURIComponent(lot)}`;
    if (slot) url += `&slot=${encodeURIComponent(slot)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    const res = await fetch(url, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar resultados.');
    return await res.json();
  },

  async createResult(resultData) {
    const res = await fetch(`${API_BASE}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(resultData),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao cadastrar resultado.' }));
      throw new Error(err.detail || 'Erro ao cadastrar resultado.');
    }
    return await res.json();
  },

  async deleteResult(id) {
    const res = await fetch(`${API_BASE}/results/${id}`, {
      method: 'DELETE',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao excluir resultado.' }));
      throw new Error(err.detail || 'Erro ao excluir resultado.');
    }
    return await res.json();
  },

  async importResults(file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/results/import`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Erro ao importar arquivo.' }));
      throw new Error(err.detail || 'Erro na importação.');
    }
    return await res.json();
  },

  async getWeights() {
    const res = await fetch(`${API_BASE}/admin/weights`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao buscar pesos do algoritmo.');
    return await res.json();
  },

  async saveWeights(weights) {
    const res = await fetch(`${API_BASE}/admin/weights`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify(weights),
    });
    if (!res.ok) throw new Error('Erro ao salvar pesos.');
    return await res.json();
  },

  async recalculateEvaluations() {
    const res = await fetch(`${API_BASE}/admin/recalculate-evaluations`, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao recalcular avaliações.');
    return await res.json();
  },

  async getSystemStats() {
    const res = await fetch(`${API_BASE}/admin/system-stats`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao carregar status do sistema.');
    return await res.json();
  },

  // =========================================================================
  // MONITORAMENTO DO ROBÔ SCRAPER EM SEGUNDO PLANO
  // =========================================================================
  async getScraperStatus() {
    const res = await fetch(`${API_BASE}/admin/scraper/status`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao obter status do robô de sincronização.');
    return await res.json();
  },

  async toggleScraper(enable = null) {
    const url = enable !== null
      ? `${API_BASE}/admin/scraper/toggle?enable=${enable}`
      : `${API_BASE}/admin/scraper/toggle`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao alternar status do robô.');
    return await res.json();
  },

  async runScraperNow(lottery = null) {
    const url = lottery
      ? `${API_BASE}/admin/scraper/run-now?lottery=${encodeURIComponent(lottery)}`
      : `${API_BASE}/admin/scraper/run-now`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao disparar sincronização manual do robô.');
    return await res.json();
  },
  // =========================================================================
  // MILHARES ATRASADAS & RASTREADOR ESTATISTICO
  // =========================================================================
  async getMilharesRankings() {
    const res = await fetch(`${API_BASE}/milhares/rankings`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) throw new Error('Erro ao obter ranking de milhares.');
    return await res.json();
  },

  async rastrearMilhar(milhar) {
    const res = await fetch(`${API_BASE}/milhares/rastreador/${encodeURIComponent(milhar)}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Erro ao rastrear milhar.');
    }
    return await res.json();
  },
};

window.api = api;
