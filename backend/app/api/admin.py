"""
Endpoints Administrativos: Ajuste de Pesos do Algoritmo, Estatísticas de Sistema e Gestão de Multi-Tenants.
Todas as rotas exigem autenticação do Administrador Master.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from ..engine.weights import get_active_weights, update_active_weights
from ..engine.evaluator import reevaluate_all_snapshots
from ..models import WeightsConfigModel, TenantModel, TenantCreateModel, TenantUpdateModel, SystemSettingsModel
from ..database import get_db_connection, DB_PATH, get_system_setting, set_system_setting
from ..auth import require_admin, generate_clean_key
import os

router = APIRouter(prefix="/admin", tags=["Administração"], dependencies=[Depends(require_admin)])


@router.get("/weights", response_model=WeightsConfigModel)
def get_weights():
    """Retorna os pesos atualmente ativos no motor estatístico."""
    return get_active_weights()


@router.post("/weights", response_model=WeightsConfigModel)
def save_weights(weights: WeightsConfigModel):
    """
    Atualiza os pesos do algoritmo estatístico.
    Permite calibrar a influência de Atrasos, Frequências, Horários e Repetições
    sem necessidade de alterar código ou reiniciar o servidor.
    """
    updated = update_active_weights(weights)
    return updated


@router.post("/recalculate-evaluations")
def recalculate():
    """Dispara a reavaliação de todos os snapshots de predições contra os sorteios cadastrados."""
    count = reevaluate_all_snapshots()
    return {"message": f"{count} avaliações recalculadas com sucesso."}


@router.get("/system-stats")
def system_stats():
    """Retorna dados de diagnóstico e volume da base."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*), MIN(draw_date), MAX(draw_date) FROM draw_results")
        draw_count, min_date, max_date = cursor.fetchone()

        cursor.execute("SELECT COUNT(*) FROM analysis_snapshots")
        snap_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM analysis_evaluations")
        eval_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM tenants WHERE role != 'admin'")
        testers_count = cursor.fetchone()[0]

    db_size_kb = round(os.path.getsize(DB_PATH) / 1024, 1) if os.path.exists(DB_PATH) else 0

    return {
        "total_draws": draw_count or 0,
        "first_draw_date": min_date,
        "last_draw_date": max_date,
        "total_snapshots": snap_count,
        "total_evaluations": eval_count,
        "total_testers": testers_count,
        "database_size_kb": db_size_kb,
    }


# ============================================================================
# GESTÃO DE TESTADORES / MULTI-TENANTS
# ============================================================================

@router.get("/tenants", response_model=List[TenantModel])
def list_tenants():
    """Lista todos os testadores e administradores cadastrados com contagem de snapshots."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT t.*, 
                   COUNT(s.id) as snapshots_count
            FROM tenants t
            LEFT JOIN analysis_snapshots s ON s.tenant_id = t.id
            GROUP BY t.id
            ORDER BY CASE WHEN t.role = 'admin' THEN 0 ELSE 1 END, t.created_at DESC
        """)
        rows = cursor.fetchall()
        tenants = []
        from ..auth import calculate_trial_info
        for r in rows:
            trial_info = calculate_trial_info(dict(r))
            tenants.append(TenantModel(
                id=r["id"],
                name=r["name"],
                email=r.get("email"),
                phone=r.get("phone"),
                auth_provider=r.get("auth_provider", "key"),
                trial_started_at=str(r.get("trial_started_at") or ""),
                trial_expires_at=str(r.get("trial_expires_at") or ""),
                subscription_status=r.get("subscription_status", "active"),
                plan_type=r.get("plan_type", "free"),
                tenant_key=r["tenant_key"],
                role=r["role"],
                status=r["status"],
                notes=r["notes"],
                expires_at=r["expires_at"],
                last_active_at=str(r["last_active_at"] or ""),
                created_at=str(r["created_at"] or ""),
                snapshots_count=r["snapshots_count"] or 0,
                trial_days_remaining=trial_info["days_remaining"]
            ))
        return tenants


@router.post("/tenants", response_model=TenantModel)
def create_tenant(data: TenantCreateModel):
    """Cria um novo testador gerando chave de acesso única para compartilhamento."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="O nome do testador é obrigatório.")

    # Se chave não for informada, gera uma chave limpa (ex: teste-7a8b9c)
    key = data.tenant_key.strip() if data.tenant_key and data.tenant_key.strip() else generate_clean_key()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tenants WHERE tenant_key = ?", (key,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail=f"A chave '{key}' já está em uso por outro testador.")

        cursor.execute("""
            INSERT INTO tenants (name, email, phone, tenant_key, role, status, notes, expires_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
        """, (
            name,
            data.email.strip().lower() if data.email else None,
            data.phone.strip() if data.phone else None,
            key,
            data.role or "tester",
            data.notes.strip() if data.notes else None,
            data.expires_at
        ))
        new_id = cursor.lastrowid

        cursor.execute("SELECT * FROM tenants WHERE id = ?", (new_id,))
        row = cursor.fetchone()

        return TenantModel(
            id=row["id"],
            name=row["name"],
            email=row.get("email"),
            phone=row.get("phone"),
            tenant_key=row["tenant_key"],
            role=row["role"],
            status=row["status"],
            notes=row["notes"],
            expires_at=row["expires_at"],
            last_active_at=row["last_active_at"],
            created_at=row["created_at"] or "",
            snapshots_count=0
        )


@router.patch("/tenants/{tenant_id}", response_model=TenantModel)
def update_tenant(tenant_id: int, data: TenantUpdateModel):
    """Atualiza o status (ativo/inativo), nome, telefone ou notas de um testador."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Testador não encontrado.")

        # Impede desativar o Administrador Master se for o único
        if row["role"] == "admin" and data.status == "inactive":
            raise HTTPException(status_code=400, detail="Não é permitido desativar a conta do Administrador Master.")

        updates = []
        params = []
        if data.name is not None:
            updates.append("name = ?")
            params.append(data.name.strip())
        if data.phone is not None:
            updates.append("phone = ?")
            params.append(data.phone.strip())
        if data.status is not None:
            if data.status not in ["active", "inactive", "suspended"]:
                raise HTTPException(status_code=400, detail="Status deve ser 'active', 'inactive' ou 'suspended'.")
            updates.append("status = ?")
            params.append(data.status)
        if data.notes is not None:
            updates.append("notes = ?")
            params.append(data.notes.strip())
        if data.expires_at is not None:
            updates.append("expires_at = ?")
            params.append(data.expires_at)

        if updates:
            params.append(tenant_id)
            cursor.execute(f"UPDATE tenants SET {', '.join(updates)} WHERE id = ?", tuple(params))

        cursor.execute("""
            SELECT t.*, COUNT(s.id) as snapshots_count
            FROM tenants t
            LEFT JOIN analysis_snapshots s ON s.tenant_id = t.id
            WHERE t.id = ?
            GROUP BY t.id
        """, (tenant_id,))
        updated = cursor.fetchone()

        return TenantModel(
            id=updated["id"],
            name=updated["name"],
            email=updated.get("email"),
            phone=updated.get("phone"),
            tenant_key=updated["tenant_key"],
            role=updated["role"],
            status=updated["status"],
            notes=updated["notes"],
            expires_at=updated["expires_at"],
            last_active_at=updated["last_active_at"],
            created_at=updated["created_at"] or "",
            snapshots_count=updated["snapshots_count"] or 0
        )


@router.delete("/tenants/{tenant_id}")
def delete_tenant(tenant_id: int):
    """Exclui um testador (não permite excluir o Administrador Master)."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Testador não encontrado.")

        if row["role"] == "admin":
            raise HTTPException(status_code=400, detail="Não é permitido excluir o Administrador Master.")

        # Cascading: remove avaliações e snapshots do testador excluído
        cursor.execute("""
            DELETE FROM analysis_evaluations 
            WHERE snapshot_id IN (SELECT id FROM analysis_snapshots WHERE tenant_id = ?)
        """, (tenant_id,))
        cursor.execute("DELETE FROM analysis_snapshots WHERE tenant_id = ?", (tenant_id,))
        cursor.execute("DELETE FROM tenants WHERE id = ?", (tenant_id,))
        return {"message": f"Testador '{row['name']}' removido com sucesso."}


@router.post("/tenants/{tenant_id}/add-trial")
def add_trial_days(tenant_id: int, days: int = 7):
    """Adiciona mais dias de degustação ao usuário selecionado."""
    import time
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")

        # Novo prazo: time.time() + (days * 86400)
        new_expire_ts = time.time() + (days * 86400)
        new_expire_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(new_expire_ts))

        cursor.execute("""
            UPDATE tenants 
            SET trial_expires_at = ?, subscription_status = 'trial', status = 'active'
            WHERE id = ?
        """, (new_expire_str, tenant_id))

        return {
            "message": f"{days} dias de teste adicionados com sucesso para '{row['name']}'.",
            "trial_expires_at": new_expire_str
        }


@router.post("/tenants/{tenant_id}/activate-subscription")
def activate_subscription(tenant_id: int, days: int = 30):
    """Ativa a assinatura do usuário por X dias (padrão: 30 dias)."""
    import time
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")

        new_expire_ts = time.time() + (days * 86400)
        new_expire_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(new_expire_ts))

        cursor.execute("""
            UPDATE tenants 
            SET trial_expires_at = ?, subscription_status = 'active', plan_type = 'monthly', status = 'active'
            WHERE id = ?
        """, (new_expire_str, tenant_id))

        return {
            "message": f"Assinatura de 30 dias ativada com sucesso para '{row['name']}'.",
            "subscription_expires_at": new_expire_str
        }


@router.get("/settings", response_model=SystemSettingsModel)
def get_settings():
    """Retorna as configurações do sistema para o painel de administração."""
    return SystemSettingsModel(
        support_whatsapp=get_system_setting("support_whatsapp", ""),
        trial_days=int(get_system_setting("trial_days", "5")),
        app_name=get_system_setting("app_name", "Bicho Master Pro"),
        google_client_id=get_system_setting("google_client_id", ""),
        plan_link_monthly=get_system_setting("plan_link_monthly", ""),
        plan_link_quarterly=get_system_setting("plan_link_quarterly", ""),
        plan_link_semiannual=get_system_setting("plan_link_semiannual", ""),
        plan_link_yearly=get_system_setting("plan_link_yearly", ""),
        plan_link_lifetime=get_system_setting("plan_link_lifetime", ""),
    )


@router.post("/settings")
def save_settings(data: SystemSettingsModel):
    """Salva configurações do sistema (WhatsApp, dias de teste, Google Client ID e links dos planos)."""
    if data.support_whatsapp is not None:
        set_system_setting("support_whatsapp", data.support_whatsapp.strip())
    if data.trial_days is not None:
        set_system_setting("trial_days", str(data.trial_days))
    if data.google_client_id is not None:
        set_system_setting("google_client_id", data.google_client_id.strip())
    if data.plan_link_monthly is not None:
        set_system_setting("plan_link_monthly", data.plan_link_monthly.strip())
    if data.plan_link_quarterly is not None:
        set_system_setting("plan_link_quarterly", data.plan_link_quarterly.strip())
    if data.plan_link_semiannual is not None:
        set_system_setting("plan_link_semiannual", data.plan_link_semiannual.strip())
    if data.plan_link_yearly is not None:
        set_system_setting("plan_link_yearly", data.plan_link_yearly.strip())
    if data.plan_link_lifetime is not None:
        set_system_setting("plan_link_lifetime", data.plan_link_lifetime.strip())
    return {"message": "Configurações salvas com sucesso."}


@router.get("/scraper/status")
def get_scraper_status():
    """Retorna o estado operacional do robô em segundo plano e histórico de sincronizações."""
    from ..engine.scheduler import scraper_worker
    return scraper_worker.get_status()


@router.post("/scraper/toggle")
def toggle_scraper(enable: Optional[bool] = None):
    """Ativa ou pausa as sincronizações automáticas em segundo plano."""
    from ..engine.scheduler import scraper_worker
    status = scraper_worker.toggle(enable)
    return {"auto_sync_enabled": status, "status": "active" if status else "paused"}


@router.post("/scraper/run-now")
async def run_scraper_now(lottery: Optional[str] = None):
    """Força um ciclo imediato de sincronização para todas as bancas ou uma específica."""
    from ..engine.scheduler import scraper_worker
    result = await scraper_worker.run_now(lottery)
    return result

