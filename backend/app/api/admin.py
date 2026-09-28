"""
Endpoints Administrativos: Ajuste de Pesos do Algoritmo, Estatísticas de Sistema e Gestão de Multi-Tenants.
Todas as rotas exigem autenticação do Administrador Master.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, List, Optional
from ..engine.weights import get_active_weights, update_active_weights
from ..engine.evaluator import reevaluate_all_snapshots
from ..models import WeightsConfigModel, TenantModel, TenantCreateModel, TenantUpdateModel, SystemSettingsModel, PaymentCreateModel
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
                password=r.get("password"),
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
            password=row.get("password"),
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
        if data.trial_expires_at is not None:
            updates.append("trial_expires_at = ?")
            params.append(data.trial_expires_at)
        if data.subscription_status is not None:
            updates.append("subscription_status = ?")
            params.append(data.subscription_status)
        if data.plan_type is not None:
            updates.append("plan_type = ?")
            params.append(data.plan_type)

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
            password=updated.get("password"),
            tenant_key=updated["tenant_key"],
            role=updated["role"],
            status=updated["status"],
            notes=updated["notes"],
            expires_at=updated["expires_at"],
            trial_expires_at=updated.get("trial_expires_at"),
            subscription_status=updated.get("subscription_status", "active"),
            plan_type=updated.get("plan_type", "free"),
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


@router.post("/tenants/{tenant_id}/expire-trial")
def expire_tenant_trial(tenant_id: int):
    """Encerra imediatamente o período de teste do usuário, bloqueando acesso e exibindo tela de planos."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")

        expired_date = "2026-09-27 12:00:00"
        cursor.execute("""
            UPDATE tenants 
            SET trial_expires_at = ?, subscription_status = 'expired'
            WHERE id = ?
        """, (expired_date, tenant_id))

        return {
            "message": f"Período de teste de '{row['name']}' encerrado com sucesso. O usuário foi bloqueado e será direcionado à tela de planos.",
            "subscription_status": "expired",
            "trial_expires_at": expired_date
        }


@router.post("/tenants/{tenant_id}/add-trial")
def add_trial_days(tenant_id: int, days: int = 7):
    """Adiciona mais dias de teste ao usuário selecionado."""
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
def activate_subscription(tenant_id: int, days: int = 30, plan_type: str = "monthly"):
    """Ativa a assinatura do usuário por X dias (Mensal: 30d, Trimestral: 90d, Semestral: 180d, Anual: 365d, etc.) e registra faturamento."""
    import time
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Usuário não encontrado.")

        now_ts = time.time()
        start_ts = now_ts
        current_expire_str = row["trial_expires_at"]
        if current_expire_str and row.get("subscription_status") == "active":
            try:
                cur_ts = time.mktime(time.strptime(current_expire_str, "%Y-%m-%d %H:%M:%S"))
                if cur_ts > now_ts:
                    start_ts = cur_ts
            except Exception:
                pass

        new_expire_ts = start_ts + (days * 86400)
        new_expire_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(new_expire_ts))

        cursor.execute("""
            UPDATE tenants 
            SET trial_expires_at = ?, subscription_status = 'active', plan_type = ?, status = 'active'
            WHERE id = ?
        """, (new_expire_str, plan_type, tenant_id))

        # Registra a transação financeira
        plan_prices = {
            "monthly": 14.90,
            "quarterly": 37.00,
            "semiannual": 67.00,
            "yearly": 97.00,
            "lifetime": 297.00,
        }
        amount = plan_prices.get(plan_type, round((14.90 / 30.0) * days, 2))
        created_now = time.strftime("%Y-%m-%d %H:%M:%S")
        try:
            cursor.execute("""
                INSERT INTO subscription_payments (tenant_id, customer_name, plan_type, amount, days, payment_method, status, created_at)
                VALUES (?, ?, ?, ?, ?, 'activation', 'completed', ?)
            """, (tenant_id, row["name"], plan_type, amount, days, created_now))
        except Exception as pay_err:
            print(f"Aviso ao registrar pagamento: {pay_err}")

        plan_labels = {
            "monthly": "Mensal (30 dias)",
            "quarterly": "Trimestral (90 dias)",
            "semiannual": "Semestral (180 dias)",
            "yearly": "Anual (365 dias)",
            "custom": f"{days} dias"
        }
        label = plan_labels.get(plan_type, f"{days} dias")

        return {
            "message": f"Assinatura {label} ativada com sucesso para '{row['name']}'.",
            "subscription_expires_at": new_expire_str,
            "days_added": days,
            "plan_type": plan_type,
            "amount": amount
        }


# ============================================================================
# RELATÓRIOS FINANCEIROS E FATURAMENTO (AGRUPAMENTO POR DIA, SEMANA E MÊS)
# ============================================================================

@router.post("/financial/payments")
def create_payment(data: PaymentCreateModel):
    """Registra uma transação/venda manual no sistema."""
    import time
    with get_db_connection() as conn:
        cursor = conn.cursor()
        customer_name = data.customer_name or "Cliente Direto"
        if data.tenant_id:
            cursor.execute("SELECT name FROM tenants WHERE id = ?", (data.tenant_id,))
            t_row = cursor.fetchone()
            if t_row:
                customer_name = t_row["name"]

        created_at = data.created_at or time.strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO subscription_payments (tenant_id, customer_name, plan_type, amount, days, payment_method, status, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?)
        """, (data.tenant_id, customer_name, data.plan_type, float(data.amount), data.days, data.payment_method or "pix", data.notes, created_at))

        # Se tenant_id foi informado, estende o acesso do usuário
        if data.tenant_id:
            now_ts = time.time()
            cursor.execute("SELECT trial_expires_at, subscription_status FROM tenants WHERE id = ?", (data.tenant_id,))
            tr = cursor.fetchone()
            start_ts = now_ts
            if tr and tr["trial_expires_at"] and tr.get("subscription_status") == "active":
                try:
                    cur_ts = time.mktime(time.strptime(tr["trial_expires_at"], "%Y-%m-%d %H:%M:%S"))
                    if cur_ts > now_ts:
                        start_ts = cur_ts
                except Exception:
                    pass
            new_expire = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(start_ts + (data.days * 86400)))
            cursor.execute("""
                UPDATE tenants 
                SET trial_expires_at = ?, subscription_status = 'active', plan_type = ?, status = 'active'
                WHERE id = ?
            """, (new_expire, data.plan_type, data.tenant_id))

        return {"message": "Venda registrada com sucesso."}


@router.delete("/financial/payments/{payment_id}")
def delete_payment(payment_id: int):
    """Exclui um registro de pagamento/venda."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM subscription_payments WHERE id = ?", (payment_id,))
        return {"message": "Pagamento excluído com sucesso."}


@router.get("/financial/report")
def get_financial_report(group_by: str = "week", range_days: int = 90):
    """
    Retorna o relatório financeiro agrupado por dia, semana ou mês.
    Ideal para visualização de faturamento sem poluição visual no gráfico.
    """
    from datetime import datetime, timedelta
    from collections import defaultdict

    group_by = group_by.lower()
    if group_by not in ["day", "week", "month"]:
        group_by = "week"

    now = datetime.now()
    cutoff_date = None
    if range_days and range_days > 0:
        cutoff_date = (now - timedelta(days=range_days)).strftime("%Y-%m-%d 00:00:00")

    with get_db_connection() as conn:
        cursor = conn.cursor()

        query = "SELECT * FROM subscription_payments"
        params = []
        if cutoff_date:
            query += " WHERE created_at >= ?"
            params.append(cutoff_date)
        query += " ORDER BY created_at ASC"
        cursor.execute(query, tuple(params))
        payments = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT COUNT(*) FROM tenants WHERE subscription_status = 'active' AND role != 'admin'")
        active_subscribers = cursor.fetchone()[0] or 0

    total_rev = 0.0
    month_rev = 0.0
    week_rev = 0.0
    today_rev = 0.0
    today_str = now.strftime("%Y-%m-%d")
    current_month_str = now.strftime("%Y-%m")
    current_week_str = f"{now.isocalendar().year}-W{now.isocalendar().week:02d}"

    plan_counts = defaultdict(int)
    plan_amounts = defaultdict(float)

    groups = {}

    for p in payments:
        amt = float(p.get("amount") or 0.0)
        c_at = str(p.get("created_at") or "")[:19]
        p_type = p.get("plan_type") or "monthly"

        total_rev += amt
        plan_counts[p_type] += 1
        plan_amounts[p_type] += amt

        try:
            dt = datetime.strptime(c_at, "%Y-%m-%d %H:%M:%S")
        except Exception:
            try:
                dt = datetime.strptime(c_at[:10], "%Y-%m-%d")
            except Exception:
                dt = now

        p_date_str = dt.strftime("%Y-%m-%d")
        p_month_str = dt.strftime("%Y-%m")
        p_week_str = f"{dt.isocalendar().year}-W{dt.isocalendar().week:02d}"

        if p_date_str == today_str:
            today_rev += amt
        if p_month_str == current_month_str:
            month_rev += amt
        if p_week_str == current_week_str:
            week_rev += amt

        if group_by == "day":
            g_key = p_date_str
            g_label = dt.strftime("%d/%m")
            d_start = p_date_str
            d_end = p_date_str
        elif group_by == "week":
            g_key = p_week_str
            first_day = datetime(dt.isocalendar().year, 1, 4)
            w_start = first_day + timedelta(weeks=dt.isocalendar().week - 1, days=-first_day.weekday())
            w_end = w_start + timedelta(days=6)
            g_label = f"Semana {dt.isocalendar().week} ({w_start.strftime('%d/%m')} - {w_end.strftime('%d/%m')})"
            d_start = w_start.strftime("%Y-%m-%d")
            d_end = w_end.strftime("%Y-%m-%d")
        else:  # month
            g_key = p_month_str
            months_pt = {
                1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
                7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
            }
            g_label = f"{months_pt.get(dt.month, dt.strftime('%b'))}/{dt.year}"
            d_start = f"{p_month_str}-01"
            d_end = f"{p_month_str}-28"

        if g_key not in groups:
            groups[g_key] = {
                "key": g_key,
                "label": g_label,
                "amount": 0.0,
                "count": 0,
                "plans": defaultdict(int),
                "date_start": d_start,
                "date_end": d_end
            }

        groups[g_key]["amount"] += amt
        groups[g_key]["count"] += 1
        groups[g_key]["plans"][p_type] += 1

    sorted_keys = sorted(groups.keys())
    chart_labels = [groups[k]["label"] for k in sorted_keys]
    chart_revenues = [round(groups[k]["amount"], 2) for k in sorted_keys]
    chart_counts = [groups[k]["count"] for k in sorted_keys]

    table_data = []
    for k in reversed(sorted_keys):
        g = groups[k]
        table_data.append({
            "key": g["key"],
            "label": g["label"],
            "amount": round(g["amount"], 2),
            "count": g["count"],
            "avg_ticket": round(g["amount"] / g["count"], 2) if g["count"] > 0 else 0.0,
            "plans": dict(g["plans"]),
            "date_start": g["date_start"],
            "date_end": g["date_end"]
        })

    recent = []
    for p in reversed(payments[-25:]):
        recent.append({
            "id": p["id"],
            "tenant_id": p.get("tenant_id"),
            "customer_name": p.get("customer_name") or "Cliente",
            "plan_type": p.get("plan_type"),
            "amount": round(float(p.get("amount") or 0.0), 2),
            "days": p.get("days"),
            "payment_method": p.get("payment_method") or "pix",
            "created_at": str(p.get("created_at") or "")[:19]
        })

    avg_ticket = round(total_rev / len(payments), 2) if payments else 0.0

    return {
        "group_by": group_by,
        "range_days": range_days,
        "summary": {
            "total_revenue": round(total_rev, 2),
            "month_revenue": round(month_rev, 2),
            "week_revenue": round(week_rev, 2),
            "today_revenue": round(today_rev, 2),
            "total_transactions": len(payments),
            "active_subscribers": active_subscribers,
            "average_ticket": avg_ticket,
            "plans_distribution": {
                k: {"count": plan_counts[k], "amount": round(plan_amounts[k], 2)}
                for k in plan_counts
            }
        },
        "chart": {
            "labels": chart_labels,
            "revenues": chart_revenues,
            "counts": chart_counts
        },
        "table": table_data,
        "recent_payments": recent
    }


@router.post("/financial/clear")
def clear_financial_data():
    """Zera todo o histórico financeiro, transações de teste e assinaturas demonstrativas."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM subscription_payments")
        # Também reseta usuários de teste que foram ativados como demonstração
        cursor.execute("""
            UPDATE tenants 
            SET subscription_status = 'expired', plan_type = 'free', trial_expires_at = '2026-09-27 12:00:00'
            WHERE role != 'admin' AND plan_type != 'lifetime' AND (subscription_status = 'active' OR id = 185)
        """)
        return {
            "message": "Histórico de faturamento e vendas zerado com sucesso. Tudo limpo para as vendas reais!"
        }


@router.post("/financial/seed-demo")
def seed_financial_demo():
    """Popula dados realistas de demonstração para visualização imediata do dashboard financeiro."""
    import time
    from datetime import datetime, timedelta

    demo_sales = [
        # Julho
        ("Carlos Eduardo", "monthly", 14.90, 30, "pix", -75),
        ("Marcos Roberto", "quarterly", 37.00, 90, "pix", -70),
        ("Juliana Mendes", "monthly", 14.90, 30, "cartao", -65),
        ("Felipe Antunes", "yearly", 97.00, 365, "pix", -62),
        # Agosto
        ("Rodrigo Lima", "monthly", 14.90, 30, "pix", -50),
        ("Lucas Silveira", "quarterly", 37.00, 90, "pix", -45),
        ("Fabio Henrique", "semiannual", 67.00, 180, "pix", -40),
        ("Rafael Santos", "monthly", 14.90, 30, "cartao", -38),
        ("Bruno Martins", "yearly", 97.00, 365, "pix", -32),
        ("Anderson Costa", "monthly", 14.90, 30, "pix", -30),
        # Setembro
        ("Diego Ferreira", "quarterly", 37.00, 90, "pix", -25),
        ("Thiago Barbosa", "monthly", 14.90, 30, "pix", -21),
        ("Leandro Pires", "semiannual", 67.00, 180, "pix", -18),
        ("Vinicius Mendes", "yearly", 97.00, 365, "cartao", -14),
        ("Fernando Gomes", "monthly", 14.90, 30, "pix", -10),
        ("Guilherme Neves", "quarterly", 37.00, 90, "pix", -7),
        ("Eduardo Moreira", "monthly", 14.90, 30, "pix", -4),
        ("Matheus Souza", "semiannual", 67.00, 180, "pix", -2),
        ("Gustavo Carvalho", "monthly", 14.90, 30, "pix", 0),
    ]

    now = datetime.now()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for name, plan, amt, days, method, day_offset in demo_sales:
            sale_date = (now + timedelta(days=day_offset)).strftime("%Y-%m-%d %H:%M:%S")
            cursor.execute("""
                INSERT INTO subscription_payments (customer_name, plan_type, amount, days, payment_method, status, notes, created_at)
                VALUES (?, ?, ?, ?, ?, 'completed', 'Venda Demonstrativa', ?)
            """, (name, plan, amt, days, method, sale_date))

    return {"message": f"{len(demo_sales)} vendas demonstrativas inseridas com sucesso."}


@router.delete("/financial/clear-demo")
def clear_financial_demo():
    """Remove vendas demonstrativas."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM subscription_payments WHERE notes = 'Venda Demonstrativa'")
        return {"message": "Dados de demonstração removidos com sucesso."}



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

