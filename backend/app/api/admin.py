"""
Endpoints Administrativos: Ajuste de Pesos do Algoritmo, Estatísticas de Sistema e Gestão de Multi-Tenants.
Todas as rotas exigem autenticação do Administrador Master.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List
from ..engine.weights import get_active_weights, update_active_weights
from ..engine.evaluator import reevaluate_all_snapshots
from ..models import WeightsConfigModel, TenantModel, TenantCreateModel, TenantUpdateModel
from ..database import get_db_connection, DB_PATH
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
        for r in rows:
            tenants.append(TenantModel(
                id=r["id"],
                name=r["name"],
                tenant_key=r["tenant_key"],
                role=r["role"],
                status=r["status"],
                notes=r["notes"],
                expires_at=r["expires_at"],
                last_active_at=r["last_active_at"],
                created_at=r["created_at"] or "",
                snapshots_count=r["snapshots_count"] or 0
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
            INSERT INTO tenants (name, tenant_key, role, status, notes, expires_at)
            VALUES (?, ?, ?, 'active', ?, ?)
        """, (
            name, key, data.role or "tester",
            data.notes.strip() if data.notes else None,
            data.expires_at
        ))
        new_id = cursor.lastrowid

        cursor.execute("SELECT * FROM tenants WHERE id = ?", (new_id,))
        row = cursor.fetchone()

        return TenantModel(
            id=row["id"],
            name=row["name"],
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
    """Atualiza o status (ativo/inativo), nome ou notas de um testador."""
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
