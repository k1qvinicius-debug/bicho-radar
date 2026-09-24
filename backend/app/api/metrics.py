"""
Endpoints de Métricas e Indicadores de Desempenho.
Calcula taxas de acerto, desempenho por horário, estatísticas agregadas e distribuições.
"""

from fastapi import APIRouter, Query
from typing import Dict, Any, List, Optional
from ..database import get_db_connection
from ..domain import STANDARD_SLOTS, ANIMALS, get_animal_info

router = APIRouter(prefix="/metrics", tags=["Métricas"])


@router.get("/summary", response_model=Dict[str, Any])
def get_metrics_summary(lottery: Optional[str] = None):
    """Retorna o resumo global de métricas de acertos do sistema, opcionalmente filtrado por loteria."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Total de sorteios cadastrados
        if lottery and isinstance(lottery, str) and lottery.lower() != 'all':
            lot_code = lottery.upper()
            cursor.execute("SELECT COUNT(*) FROM draw_results WHERE lottery = ?", (lot_code,))
            total_draws = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM analysis_snapshots WHERE lottery = ?", (lot_code,))
            total_snapshots = cursor.fetchone()[0]

            cursor.execute("""
                SELECT
                    COUNT(e.id) as total_evals,
                    SUM(e.acerto_grupo_1) as sum_g1,
                    SUM(e.acertos_grupo_cercado) as sum_g_cercado,
                    SUM(e.acerto_dezena_1) as sum_d1,
                    SUM(e.acertos_dezena_cercado) as sum_d_cercado,
                    SUM(e.acerto_centena_1) as sum_c1,
                    SUM(e.acertos_centena_cercado) as sum_c_cercado,
                    SUM(e.acerto_milhar_1) as sum_m1,
                    SUM(e.acertos_milhar_cercado) as sum_m_cercado,
                    AVG(e.hit_rate_score) as avg_score
                FROM analysis_evaluations e
                INNER JOIN analysis_snapshots s ON e.snapshot_id = s.id
                WHERE s.lottery = ?
            """, (lot_code,))
            row = cursor.fetchone()
        else:
            cursor.execute("SELECT COUNT(*) FROM draw_results")
            total_draws = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM analysis_snapshots")
            total_snapshots = cursor.fetchone()[0]

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
            "lottery": lottery.upper() if lottery else "ALL",
        }


@router.get("/by-lottery", response_model=List[Dict[str, Any]])
def get_metrics_by_lottery():
    """Desempenho comparativo estratificado por praça/loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                s.lottery as lottery,
                COUNT(e.id) as total_evals,
                SUM(CASE WHEN e.hit_rate_score > 0 THEN 1 ELSE 0 END) as total_hits,
                SUM(e.acerto_grupo_1) as hits_g1,
                SUM(e.acertos_grupo_cercado) as hits_g_cercado,
                SUM(e.acerto_dezena_1) as hits_d1,
                SUM(e.acertos_dezena_cercado) as hits_d_cercado,
                SUM(e.acerto_centena_1) as hits_c1,
                SUM(e.acerto_milhar_1) as hits_m1,
                AVG(e.hit_rate_score) as avg_score
            FROM analysis_snapshots s
            INNER JOIN analysis_evaluations e ON s.id = e.snapshot_id
            WHERE s.lottery IS NOT NULL
            GROUP BY s.lottery
            ORDER BY avg_score DESC, total_evals DESC
        """)
        rows = cursor.fetchall()

        lottery_meta = {
            "LOOK": {"name": "Look Goiás", "emoji": "🌾", "color": "emerald", "badge": "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"},
            "RJ": {"name": "Rio de Janeiro", "emoji": "🌴", "color": "amber", "badge": "bg-amber-500/20 text-amber-300 border-amber-500/40"},
            "NACIONAL": {"name": "Loteria Nacional", "emoji": "🇧🇷", "color": "cyan", "badge": "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"},
            "SP": {"name": "São Paulo", "emoji": "🏙️", "color": "purple", "badge": "bg-purple-500/20 text-purple-300 border-purple-500/40"},
            "FEDERAL": {"name": "Loteria Federal", "emoji": "🏛️", "color": "amber", "badge": "bg-amber-500/20 text-amber-300 border-amber-500/40"},
        }

        result = []
        for r in rows:
            evs = r["total_evals"] or 1
            lot_code = str(r["lottery"]).upper()
            meta = lottery_meta.get(lot_code, {"name": lot_code, "emoji": "🎲", "color": "indigo", "badge": "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"})
            
            result.append({
                "lottery": lot_code,
                "name": meta["name"],
                "emoji": meta["emoji"],
                "color": meta["color"],
                "badge": meta["badge"],
                "total_evals": r["total_evals"],
                "total_hits": r["total_hits"] or 0,
                "hit_rate_pct": round(((r["total_hits"] or 0) / evs) * 100, 1),
                "group_1st_rate": round((r["hits_g1"] or 0) / evs * 100, 1),
                "group_cercado_rate": round((r["hits_g_cercado"] or 0) / (evs * 5) * 100, 1),
                "ten_1st_rate": round((r["hits_d1"] or 0) / evs * 100, 1),
                "hundred_1st_rate": round((r["hits_c1"] or 0) / evs * 100, 1),
                "thousand_1st_rate": round((r["hits_m1"] or 0) / evs * 100, 1),
                "average_score": round(r["avg_score"] or 0.0, 1),
            })

        return result


@router.get("/by-slot", response_model=List[Dict[str, Any]])
def get_metrics_by_slot(lottery: Optional[str] = None):
    """Desempenho estratificado por horário de extração, opcionalmente filtrado por loteria."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT
                s.lottery as lottery,
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
        """
        params = []
        if lottery and isinstance(lottery, str) and lottery.lower() != 'all':
            lot_code = lottery.upper()
            query += " WHERE s.lottery = ?"
            params.append(lot_code)

        query += " GROUP BY s.lottery, s.target_slot ORDER BY total_evals DESC, avg_score DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()

        result = []
        for r in rows:
            evs = r["total_evals"] or 1
            result.append({
                "lottery": str(r["lottery"]).upper(),
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
