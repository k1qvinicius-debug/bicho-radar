"""
Módulo de Avaliação e Auditoria de Desempenho.
Compara predições salvas previamente com resultados reais cadastrados,
apurando acertos de Grupo, Dezena, Centena e Milhar (na cabeça e no cercado 1º ao 5º).
"""

import json
from typing import Dict, Any, List, Optional
from ..database import get_db_connection
from ..domain import (
    format_milhar, extract_dezena, extract_centena, extract_milhar,
    get_group_for_number, get_animal_info, infer_lottery_from_slot
)


def evaluate_draw_against_snapshots(draw_id: int) -> List[Dict[str, Any]]:
    """
    Localiza todos os snapshots pendentes para a data e horário do sorteio recém-cadastrado
    e executa a conferência detalhada de acertos.
    """
    evaluations_created = []

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Busca dados do sorteio
        cursor.execute("SELECT * FROM draw_results WHERE id = ?", (draw_id,))
        draw_row = cursor.fetchone()
        if not draw_row:
            return []

        draw = dict(draw_row)
        target_date = draw["draw_date"]
        target_slot = draw["slot"]

        target_lottery = infer_lottery_from_slot(target_slot, draw.get("lottery") or "RJ")

        # Busca snapshots pendentes ou existentes para esta data e horário
        cursor.execute(
            "SELECT * FROM analysis_snapshots WHERE target_date = ? AND target_slot = ? AND lottery = ?",
            (target_date, target_slot, target_lottery)
        )
        snapshots = cursor.fetchall()

        if not snapshots:
            return []

        # Extrai valores reais ocorridos no sorteio
        p1 = draw["prize_1"]
        act_g1 = str(get_group_for_number(p1)).zfill(2)
        act_d1 = extract_dezena(p1)
        act_c1 = extract_centena(p1)
        act_m1 = extract_milhar(p1)

        act_all_g = [str(get_group_for_number(draw[f"prize_{i}"])).zfill(2) for i in range(1, 6)]
        act_all_d = [extract_dezena(draw[f"prize_{i}"]) for i in range(1, 6)]
        act_all_c = [extract_centena(draw[f"prize_{i}"]) for i in range(1, 6)]
        act_all_m = [extract_milhar(draw[f"prize_{i}"]) for i in range(1, 6)]

        for snap_row in snapshots:
            snap = dict(snap_row)
            snap_id = snap["id"]
            predictions = json.loads(snap["predictions_json"])

            top_groups = [g["value"] for g in predictions.get("top_groups", [])]
            top_tens = [t["value"] for t in predictions.get("top_tens", [])]
            top_hundreds = [c["value"] for c in predictions.get("top_hundreds", [])]
            top_thousands = [m["value"] for m in predictions.get("top_thousands", [])]

            # 1. Grupo
            hit_g1 = 1 if act_g1 in top_groups else 0
            hits_g_cercado = sum(1 for g in act_all_g if g in top_groups)

            # 2. Dezena
            hit_d1 = 1 if act_d1 in top_tens else 0
            hits_d_cercado = sum(1 for d in act_all_d if d in top_tens)

            # 3. Centena
            hit_c1 = 1 if act_c1 in top_hundreds else 0
            hits_c_cercado = sum(1 for c in act_all_c if c in top_hundreds)

            # 4. Milhar
            hit_m1 = 1 if act_m1 in top_thousands else 0
            hits_m_cercado = sum(1 for m in act_all_m if m in top_thousands)

            # Cálculo de pontuação agregada de desempenho do palpite
            # Grupo cabeça: 40 pts, Dezena cabeça: 60 pts, Centena cabeça: 80 pts, Milhar cabeça: 100 pts
            # Cercado: 10 pts por grupo, 15 por dezena, 20 por centena, 30 por milhar
            hit_score = (
                (hit_g1 * 40.0) + (hits_g_cercado * 10.0) +
                (hit_d1 * 60.0) + (hits_d_cercado * 15.0) +
                (hit_c1 * 80.0) + (hits_c_cercado * 20.0) +
                (hit_m1 * 100.0) + (hits_m_cercado * 30.0)
            )

            # Detalhamento para exibio na interface
            details = {
                "grupo": {
                    "actual_1st": act_g1,
                    "actual_1_to_5": act_all_g,
                    "predicted": top_groups,
                    "hit_1st": bool(hit_g1),
                    "hits_cercado_count": hits_g_cercado,
                },
                "dezena": {
                    "actual_1st": act_d1,
                    "actual_1_to_5": act_all_d,
                    "predicted": top_tens,
                    "hit_1st": bool(hit_d1),
                    "hits_cercado_count": hits_d_cercado,
                },
                "centena": {
                    "actual_1st": act_c1,
                    "actual_1_to_5": act_all_c,
                    "predicted": top_hundreds,
                    "hit_1st": bool(hit_c1),
                    "hits_cercado_count": hits_c_cercado,
                },
                "milhar": {
                    "actual_1st": act_m1,
                    "actual_1_to_5": act_all_m,
                    "predicted": top_thousands,
                    "hit_1st": bool(hit_m1),
                    "hits_cercado_count": hits_m_cercado,
                },
            }

            # Insere ou atualiza avaliao
            cursor.execute("""
                INSERT INTO analysis_evaluations (
                    snapshot_id, draw_id, evaluated_at,
                    acerto_grupo_1, acertos_grupo_cercado,
                    acerto_dezena_1, acertos_dezena_cercado,
                    acerto_centena_1, acertos_centena_cercado,
                    acerto_milhar_1, acertos_milhar_cercado,
                    hit_rate_score, details_json
                ) VALUES (?, ?, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(snapshot_id, draw_id) DO UPDATE SET
                    evaluated_at = CURRENT_TIMESTAMP,
                    acerto_grupo_1 = excluded.acerto_grupo_1,
                    acertos_grupo_cercado = excluded.acertos_grupo_cercado,
                    acerto_dezena_1 = excluded.acerto_dezena_1,
                    acertos_dezena_cercado = excluded.acertos_dezena_cercado,
                    acerto_centena_1 = excluded.acerto_centena_1,
                    acertos_centena_cercado = excluded.acertos_centena_cercado,
                    acerto_milhar_1 = excluded.acerto_milhar_1,
                    acertos_milhar_cercado = excluded.acertos_milhar_cercado,
                    hit_rate_score = excluded.hit_rate_score,
                    details_json = excluded.details_json
            """, (
                snap_id, draw_id,
                hit_g1, hits_g_cercado,
                hit_d1, hits_d_cercado,
                hit_c1, hits_c_cercado,
                hit_m1, hits_m_cercado,
                hit_score, json.dumps(details, ensure_ascii=False)
            ))

            # Atualiza status do snapshot para EVALUATED
            cursor.execute("UPDATE analysis_snapshots SET status = 'EVALUATED' WHERE id = ?", (snap_id,))

            # ==============================================================
            # AUDITORIA E REGISTRO DE QUEBRA DE PADRÃO (CONTRA-BANCA)
            # ==============================================================
            if top_groups:
                fav_group_str = top_groups[0]
                try:
                    fav_group_int = int(fav_group_str)
                    act_g1_int = int(act_g1)

                    if act_g1_int != fav_group_int:
                        # Quebra de padrão confirmada: o favorito nº 1 não levou o 1º prêmio
                        pb = predictions.get("pattern_break") or {}
                        b1 = pb.get("primary_break_animal") or {}
                        b2 = pb.get("secondary_break_animal") or {}
                        c1_group = b1.get("group")
                        c1_animal = b1.get("name")
                        c2_group = b2.get("group")
                        c2_animal = b2.get("name")
                        risk_level = pb.get("risk_level", "NORMAL")

                        fav_item = predictions.get("top_groups", [{}])[0]
                        fav_animal = fav_item.get("label") or get_animal_info(fav_group_int)["name"]
                        fav_score = float(fav_item.get("score", 0.0))

                        act_animal = get_animal_info(act_g1_int)["name"]
                        hit_contra = 1 if ((c1_group and act_g1_int == c1_group) or (c2_group and act_g1_int == c2_group)) else 0

                        cursor.execute("""
                            INSERT INTO pattern_breaks_history (
                                draw_id, draw_date, slot, lottery,
                                favorite_group, favorite_animal, favorite_score,
                                contra_predicted_1_group, contra_predicted_1_animal,
                                contra_predicted_2_group, contra_predicted_2_animal,
                                actual_winner_group, actual_winner_animal, actual_prize_1,
                                risk_level, hit_contra
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ON CONFLICT (draw_date, slot, lottery) DO UPDATE SET
                                draw_id = excluded.draw_id,
                                favorite_group = excluded.favorite_group,
                                favorite_animal = excluded.favorite_animal,
                                favorite_score = excluded.favorite_score,
                                contra_predicted_1_group = excluded.contra_predicted_1_group,
                                contra_predicted_1_animal = excluded.contra_predicted_1_animal,
                                contra_predicted_2_group = excluded.contra_predicted_2_group,
                                contra_predicted_2_animal = excluded.contra_predicted_2_animal,
                                actual_winner_group = excluded.actual_winner_group,
                                actual_winner_animal = excluded.actual_winner_animal,
                                actual_prize_1 = excluded.actual_prize_1,
                                risk_level = excluded.risk_level,
                                hit_contra = excluded.hit_contra
                        """, (
                            draw_id, target_date, target_slot, target_lottery,
                            fav_group_int, fav_animal, fav_score,
                            c1_group, c1_animal,
                            c2_group, c2_animal,
                            act_g1_int, act_animal, p1,
                            risk_level, hit_contra
                        ))
                    else:
                        # Se o favorito ganhou na cabeça, remove qualquer registro antigo de quebra
                        cursor.execute(
                            "DELETE FROM pattern_breaks_history WHERE draw_date = ? AND slot = ? AND lottery = ?",
                            (target_date, target_slot, target_lottery)
                        )
                except Exception as pb_err:
                    print(f"Aviso ao registrar quebra de padrão: {pb_err}")

            evaluations_created.append({
                "snapshot_id": snap_id,
                "draw_id": draw_id,
                "hit_score": hit_score,
                "hit_g1": bool(hit_g1),
                "hit_d1": bool(hit_d1),
                "hit_c1": bool(hit_c1),
                "hit_m1": bool(hit_m1),
            })

    return evaluations_created


def ensure_snapshots_and_evaluate_for_draw(draw_id: int) -> List[Dict[str, Any]]:
    """
    Garante que exista um snapshot de predição para o sorteio informado.
    Se nenhum snapshot foi salvo manualmente pelo usuário antes do sorteio,
    gera automaticamente a análise retroativa do motor estatístico e apura a conferência.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM draw_results WHERE id = ?", (draw_id,))
        draw_row = cursor.fetchone()
        if not draw_row:
            return []
        draw = dict(draw_row)
        target_date = draw["draw_date"]
        target_slot = draw["slot"]

        target_lottery = infer_lottery_from_slot(target_slot, draw.get("lottery") or "RJ")

        cursor.execute(
            "SELECT id FROM analysis_snapshots WHERE target_date = ? AND target_slot = ? AND lottery = ?",
            (target_date, target_slot, target_lottery)
        )
        existing = cursor.fetchone()

    if not existing:
        from .statistical_engine import StatisticalEngine
        from .weights import get_active_weights
        engine = StatisticalEngine()
        weights = get_active_weights()
        pred = engine.analyze(target_date=target_date, target_slot=target_slot, lottery=target_lottery)
        pred_dict = pred.model_dump()
        weights_dict = weights.model_dump()

        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO analysis_snapshots (
                    target_date, target_slot, lottery, status,
                    predictions_json, weights_used_json
                ) VALUES (?, ?, ?, 'PENDING', ?, ?)
            """, (
                target_date, target_slot, target_lottery,
                json.dumps(pred_dict, ensure_ascii=False),
                json.dumps(weights_dict, ensure_ascii=False)
            ))

    return evaluate_draw_against_snapshots(draw_id)


def reevaluate_all_snapshots(limit_recent: int = 60) -> int:
    """Reavalia todos os snapshots contra os sorteios existentes no banco e gera auditorias para sorteios recentes."""
    count = 0
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM draw_results ORDER BY draw_date DESC, id DESC LIMIT ?", (limit_recent,))
        draw_ids = [r["id"] for r in cursor.fetchall()]

    for d_id in reversed(draw_ids):
        results = ensure_snapshots_and_evaluate_for_draw(d_id)
        count += len(results)

    return count


def backfill_pattern_breaks_from_snapshots(limit: int = 500) -> int:
    """
    Varre os sorteios apurados e retroalimenta a tabela pattern_breaks_history
    com todas as quebras históricas ocorridas, gerando base estatística empírica.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM draw_results ORDER BY draw_date DESC, id DESC LIMIT ?", (limit,))
        draw_ids = [r["id"] for r in cursor.fetchall()]

    for d_id in reversed(draw_ids):
        try:
            evaluate_draw_against_snapshots(d_id)
        except Exception:
            pass

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as c FROM pattern_breaks_history")
        row = cursor.fetchone()
        total_breaks = row["c"] if row else 0

    return total_breaks

