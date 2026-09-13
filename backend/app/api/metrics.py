"""
Endpoints de Métricas e Indicadores de Desempenho.
Calcula taxas de acerto, desempenho por horário, estatísticas agregadas e distribuições.
"""

from fastapi import APIRouter
from typing import Dict, Any, List
from ..database import get_db_connection
from ..domain import STANDARD_SLOTS, ANIMALS, get_animal_info

router = APIRouter(prefix="/metrics", tags=["Métricas"])


@router.get("/summary", response_model=Dict[str, Any])
def get_metrics_summary():
    """Retorna o resumo global de métricas de acertos do sistema."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Total de sorteios cadastrados
        cursor.execute("SELECT COUNT(*) FROM draw_results")
        total_draws = cursor.fetchone()[0]

        # Total de snapshots
        cursor.execute("SELECT COUNT(*) FROM analysis_snapshots")
        total_snapshots = cursor.fetchone()[0]

        # Snapshots avaliados
        cursor.execute("""
            SELECT
                COUNT(*) as total_evals,
                SUM(acerto_grupo_1) as sum_g1,
                SUM(acertos_grupo_cercado) as sum_g_cercado,
                SUM(acerto_dezena_1) as sum_d1,
                SUM(acertos_dezena_cercado) as sum_d_cercado,
                SUM(acerto_centena_1) as sum_c1,
                SUM(acertos_centena_cercado) as sum_c_cercado,
                SUM(acerto_milhar_1) as sum_m1,
                SUM(acertos_milhar_cercado) as sum_m_cercado,
                AVG(hit_rate_score) as avg_score
            FROM analysis_evaluations
        """)
        row = cursor.fetchone()
        evals_count = row["total_evals"] or 0

        if evals_count > 0:
            rate_g1 = round((row["sum_g1"] or 0) / evals_count * 100, 1)
            rate_g_cercado = round((row["sum_g_cercado"] or 0) / (evals_count * 5) * 100, 1)
            rate_d1 = round((row["sum_d1"] or 0) / evals_count * 100, 1)
            rate_d_cercado = round((row["sum_d_cercado"] or 0) / (evals_count * 5) * 100, 1)
            rate_c1 = round((row["sum_c1"] or 0) / evals_count * 100, 1)
            rate_c_cercado = round((row["sum_c_cercado"] or 0) / (evals_count * 5) * 100, 1)
            rate_m1 = round((row["sum_m1"] or 0) / evals_count * 100, 1)
            rate_m_cercado = round((row["sum_m_cercado"] or 0) / (evals_count * 5) * 100, 1)
            avg_score = round(row["avg_score"] or 0.0, 1)
        else:
            rate_g1 = rate_g_cercado = rate_d1 = rate_d_cercado = 0.0
            rate_c1 = rate_c_cercado = rate_m1 = rate_m_cercado = 0.0
            avg_score = 0.0

        return {
            "total_draws": total_draws,
            "total_snapshots": total_snapshots,
            "evaluated_snapshots": evals_count,
            "pending_snapshots": total_snapshots - evals_count,
            "group_1st_hit_rate": rate_g1,
            "group_cercado_hit_rate": rate_g_cercado,
            "ten_1st_hit_rate": rate_d1,
            "ten_cercado_hit_rate": rate_d_cercado,
            "hundred_1st_hit_rate": rate_c1,
            "hundred_cercado_hit_rate": rate_c_cercado,
            "thousand_1st_hit_rate": rate_m1,
            "thousand_cercado_hit_rate": rate_m_cercado,
            "average_performance_score": avg_score,
        }


@router.get("/by-slot", response_model=List[Dict[str, Any]])
def get_metrics_by_slot():
    """Desempenho estratificado por horário de extração (PTM, PT, PTV, PTN, COR, FED)."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                s.target_slot as slot,
                COUNT(e.id) as total_evals,
                SUM(e.acerto_grupo_1) as hits_g1,
                SUM(e.acertos_grupo_cercado) as hits_g_cercado,
                SUM(e.acerto_dezena_1) as hits_d1,
                SUM(e.acertos_dezena_cercado) as hits_d_cercado,
                SUM(e.acerto_centena_1) as hits_c1,
                SUM(e.acerto_milhar_1) as hits_m1,
                AVG(e.hit_rate_score) as avg_score
            FROM analysis_snapshots s
            INNER JOIN analysis_evaluations e ON s.id = e.snapshot_id
            GROUP BY s.target_slot
            ORDER BY total_evals DESC
        """)
        rows = cursor.fetchall()

        result = []
        for r in rows:
            evs = r["total_evals"] or 1
            result.append({
                "slot": r["slot"],
                "total_evals": r["total_evals"],
                "group_1st_rate": round((r["hits_g1"] or 0) / evs * 100, 1),
                "group_cercado_rate": round((r["hits_g_cercado"] or 0) / (evs * 5) * 100, 1),
                "ten_1st_rate": round((r["hits_d1"] or 0) / evs * 100, 1),
                "hundred_1st_rate": round((r["hits_c1"] or 0) / evs * 100, 1),
                "thousand_1st_rate": round((r["hits_m1"] or 0) / evs * 100, 1),
                "average_score": round(r["avg_score"] or 0.0, 1),
            })

        return result


@router.get("/distribution", response_model=Dict[str, Any])
def get_distribution():
    """Frequência de ocorrência de cada um dos 25 grupos no histórico."""
    from ..domain import get_group_for_number
    from collections import Counter

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT prize_1, prize_2, prize_3, prize_4, prize_5 FROM draw_results")
        rows = cursor.fetchall()

    count_1st = Counter()
    count_all = Counter()

    for r in rows:
        g1 = get_group_for_number(r["prize_1"])
        count_1st[g1] += 1
        for i in range(1, 6):
            g = get_group_for_number(r[f"prize_{i}"])
            count_all[g] += 1

    group_data = []
    for g in range(1, 26):
        anim = get_animal_info(g)
        group_data.append({
            "group": g,
            "name": anim["name"],
            "emoji": anim["emoji"],
            "count_1st": count_1st[g],
            "count_all": count_all[g],
        })

    return {
        "total_draws": len(rows),
        "groups": group_data
    }
