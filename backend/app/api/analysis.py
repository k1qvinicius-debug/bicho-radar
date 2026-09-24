"""
Endpoints de Análise Preditiva e Snapshots para Auditoria.
Gera previsões multi-fatoriais e congela análises antes do sorteio.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import json

from ..database import get_db_connection
from ..models import PredictionOutput, SnapshotCreateRequest, SnapshotEvaluationResponse
from ..engine.statistical_engine import StatisticalEngine
from ..engine.weights import get_active_weights
from ..domain import STANDARD_SLOTS
from ..auth import get_current_tenant_optional, require_tenant

router = APIRouter(prefix="/analysis", tags=["Análise Preditiva"])


def get_default_next_slot(lottery: str = "RJ") -> str:
    """
    Calcula o próximo horário pendente mais adequado.
    Verifica no banco quais sorteios já foram apurados hoje para a loteria
    e avança automaticamente para o primeiro horário pendente.
    """
    from ..domain import get_lottery_slots
    slots = get_lottery_slots(lottery)
    if not slots:
        return "PPT"

    today_str = datetime.now().strftime("%Y-%m-%d")
    drawn_slots = set()

    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            eff_lot = (lottery or "RJ").upper()
            if eff_lot == "FEDERAL":
                cursor.execute(
                    "SELECT DISTINCT slot FROM draw_results WHERE (lottery = 'FEDERAL' OR slot = 'FED') AND draw_date = ?",
                    (today_str,)
                )
            elif eff_lot == "RJ":
                cursor.execute(
                    "SELECT DISTINCT slot FROM draw_results WHERE (lottery = 'RJ' OR lottery IS NULL) AND draw_date = ?",
                    (today_str,)
                )
            else:
                cursor.execute(
                    "SELECT DISTINCT slot FROM draw_results WHERE lottery = ? AND draw_date = ?",
                    (eff_lot, today_str)
                )
            drawn_slots = {str(r[0]).strip().upper() for r in cursor.fetchall()}
    except Exception:
        drawn_slots = set()

    # 1. Procura o primeiro slot oficial que ainda NÃO foi apurado hoje
    for s in slots:
        if s["code"].upper() not in drawn_slots:
            return s["code"]

    # 2. Se todos os horários de hoje já foram apurados, retorna o primeiro horário de amanhã
    return slots[0]["code"]


@router.get("/predict", response_model=PredictionOutput)
def get_prediction(
    target_date: Optional[str] = Query(None, description="Data alvo (YYYY-MM-DD). Padrão: hoje"),
    target_slot: Optional[str] = Query(None, description="Horário alvo (PPT, PTM, PT, LK-11, LN-10, etc.)"),
    strategy: Optional[str] = Query("hybrid", description="Estratégia: hybrid, frequency, delay, puxada"),
    lottery: Optional[str] = Query("RJ", description="Código da loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)"),
    tenant: Dict[str, Any] = Depends(require_tenant),
):
    """
    Gera análise estatística multi-fatorial detalhada para o próximo horário da loteria selecionada.
    Retorna Grupos, Dezenas, Centenas e Milhares mais fortes com suas pontuações e fatores.
    """
    effective_date = target_date or datetime.now().strftime("%Y-%m-%d")
    effective_lottery = (lottery or "RJ").upper()
    effective_slot = (target_slot or get_default_next_slot(effective_lottery)).upper()
    effective_strat = (strategy or "hybrid").lower()

    engine = StatisticalEngine()
    prediction = engine.analyze(
        target_date=effective_date,
        target_slot=effective_slot,
        strategy=effective_strat,
        lottery=effective_lottery
    )
    return prediction


@router.get("/fixed-animal", response_model=Dict[str, Any])
def get_fixed_animal_closure(
    group: int = Query(..., ge=1, le=25, description="Número do grupo do bicho fixado (1 a 25)"),
    target_date: Optional[str] = Query(None, description="Data alvo (YYYY-MM-DD)"),
    target_slot: Optional[str] = Query(None, description="Horário alvo"),
    lottery: Optional[str] = Query("RJ", description="Código da loteria"),
    tenant: Dict[str, Any] = Depends(require_tenant),
):
    """
    Gera fechamento inteligente de Duque de Dezena com 1 animal fixado
    e 3 dezenas complementares calculadas pelo motor estatístico para a loteria escolhida.
    """
    effective_date = target_date or datetime.now().strftime("%Y-%m-%d")
    effective_lottery = (lottery or "RJ").upper()
    effective_slot = (target_slot or get_default_next_slot(effective_lottery)).upper()

    engine = StatisticalEngine()
    return engine.generate_fixed_animal_combo(
        group_number=group,
        target_date=effective_date,
        target_slot=effective_slot,
        lottery=effective_lottery
    )


@router.post("/snapshot", response_model=Dict[str, Any])
def create_snapshot(
    data: SnapshotCreateRequest,
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
):
    """
    Congela e salva a análise atual para uma data, horário e loteria antes da divulgação do resultado,
    permitindo auditoria e backtesting 100% transparentes e auditáveis vinculados ao testador/tenant.
    """
    lottery_code = (data.lottery or "RJ").upper()
    engine = StatisticalEngine()
    weights = get_active_weights()
    prediction = engine.analyze(
        target_date=data.target_date,
        target_slot=data.target_slot.upper(),
        lottery=lottery_code
    )

    pred_dict = prediction.model_dump()
    weights_dict = weights.model_dump()
    tenant_id = tenant["id"] if (isinstance(tenant, dict) and "id" in tenant) else 1

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Verifica se já existe snapshot pendente para este mesmo sorteio, loteria e tenant
        cursor.execute(
            "SELECT id FROM analysis_snapshots WHERE target_date = ? AND target_slot = ? AND (lottery = ? OR (lottery IS NULL AND ? = 'RJ')) AND tenant_id = ?",
            (data.target_date, data.target_slot.upper(), lottery_code, lottery_code, tenant_id)
        )
        existing = cursor.fetchone()

        if existing:
            snapshot_id = existing["id"]
            cursor.execute("""
                UPDATE analysis_snapshots SET
                    lottery = ?,
                    predictions_json = ?,
                    weights_used_json = ?,
                    status = 'PENDING'
                WHERE id = ?
            """, (
                lottery_code,
                json.dumps(pred_dict, ensure_ascii=False),
                json.dumps(weights_dict, ensure_ascii=False),
                snapshot_id
            ))
            msg = f"Snapshot de {lottery_code} atualizado com sucesso."
        else:
            cursor.execute("""
                INSERT INTO analysis_snapshots (
                    target_date, target_slot, lottery, status, tenant_id,
                    predictions_json, weights_used_json
                ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?)
            """, (
                data.target_date, data.target_slot.upper(), lottery_code, tenant_id,
                json.dumps(pred_dict, ensure_ascii=False),
                json.dumps(weights_dict, ensure_ascii=False)
            ))
            snapshot_id = cursor.lastrowid
            msg = f"Snapshot de {lottery_code} congelado e salvo com sucesso."

        # Se já existir resultado cadastrado para este sorteio, dispara a conferência imediata
        cursor.execute(
            "SELECT id FROM draw_results WHERE draw_date = ? AND slot = ? AND (lottery = ? OR (lottery IS NULL AND ? = 'RJ'))",
            (data.target_date, data.target_slot.upper(), lottery_code, lottery_code)
        )
        draw = cursor.fetchone()

    if draw:
        from ..engine.evaluator import evaluate_draw_against_snapshots
        evaluate_draw_against_snapshots(draw["id"])

    return {
        "snapshot_id": snapshot_id,
        "message": msg,
        "lottery": lottery_code,
        "target_date": data.target_date,
        "target_slot": data.target_slot.upper(),
    }


@router.get("/snapshots", response_model=List[Dict[str, Any]])
def list_snapshots(
    limit: int = Query(100, ge=1, le=200),
    offset: int = Query(0, ge=0),
    status: Optional[str] = Query(None),
    lottery: Optional[str] = Query(None),
    target_date: Optional[str] = Query(None),
    tenant_id: Optional[int] = Query(None),
    mine_only: Optional[bool] = Query(False, description="Exibir apenas análises do próprio usuário"),
    current_tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
):
    """Lista o histórico de análises salvas com status de conferência, incluindo auditorias oficiais da plataforma."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT s.id, s.target_date, s.target_slot, COALESCE(s.lottery, 'RJ') as lottery, s.status, s.created_at, s.tenant_id,
                   s.predictions_json,
                   t.name as tenant_name,
                   e.acerto_grupo_1, e.acertos_grupo_cercado,
                   e.acerto_dezena_1, e.acertos_dezena_cercado,
                   e.acerto_centena_1, e.acertos_centena_cercado,
                   e.acerto_milhar_1, e.acertos_milhar_cercado,
                   e.hit_rate_score, e.evaluated_at, e.details_json,
                   d.prize_1, d.prize_2, d.prize_3, d.prize_4, d.prize_5
            FROM analysis_snapshots s
            LEFT JOIN tenants t ON s.tenant_id = t.id
            LEFT JOIN analysis_evaluations e ON s.id = e.snapshot_id
            LEFT JOIN draw_results d ON e.draw_id = d.id
            WHERE 1=1
        """
        params = []
        if lottery:
            lot_code = lottery.upper()
            query += " AND (s.lottery = ? OR (s.lottery IS NULL AND ? = 'RJ'))"
            params.extend([lot_code, lot_code])
        if status:
            query += " AND s.status = ?"
            params.append(status)
        if target_date:
            query += " AND s.target_date = ?"
            params.append(target_date)

        # Regra de exibição:
        # 1. Se tenant_id foi solicitado explicitamente:
        if tenant_id:
            query += " AND s.tenant_id = ?"
            params.append(tenant_id)
        # 2. Se o usuário marcou 'apenas minhas análises':
        elif mine_only and isinstance(current_tenant, dict) and current_tenant.get("role") != "admin":
            query += " AND s.tenant_id = ?"
            params.append(current_tenant["id"])
        # 3. Para qualquer usuário logado (cliente/testador): exibe as auditorias oficiais da plataforma (tenant_id = 1 ou NULL) e as suas próprias
        elif isinstance(current_tenant, dict) and current_tenant.get("role") != "admin":
            query += " AND (s.tenant_id = 1 OR s.tenant_id = ? OR s.tenant_id IS NULL)"
            params.append(current_tenant["id"])

        query += " ORDER BY s.target_date DESC, s.id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()

        result = []
        for r in rows:
            d = dict(r)
            if d.get("predictions_json"):
                try:
                    preds = json.loads(d["predictions_json"])
                    d["top_groups"] = preds.get("top_groups", [])
                except Exception:
                    d["top_groups"] = []
                del d["predictions_json"]
            else:
                d["top_groups"] = []

            if d.get("details_json"):
                try:
                    d["evaluation_details"] = json.loads(d["details_json"])
                except Exception:
                    d["evaluation_details"] = None
                del d["details_json"]
            else:
                d["evaluation_details"] = None

            result.append(d)

        return result


@router.get("/snapshots/{snapshot_id}", response_model=Dict[str, Any])
def get_snapshot_details(snapshot_id: int):
    """Retorna detalhes completos de uma análise congelada com predições e conferência."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT s.*, e.hit_rate_score, e.evaluated_at, e.details_json,
                   d.prize_1, d.prize_2, d.prize_3, d.prize_4, d.prize_5
            FROM analysis_snapshots s
            LEFT JOIN analysis_evaluations e ON s.id = e.snapshot_id
            LEFT JOIN draw_results d ON e.draw_id = d.id
            WHERE s.id = ?
        """, (snapshot_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Snapshot não encontrado.")

        data = dict(row)
        data["predictions"] = json.loads(data["predictions_json"])
        data["weights_used"] = json.loads(data["weights_used_json"])
        data["evaluation_details"] = json.loads(data["details_json"]) if data.get("details_json") else None

        return data


@router.get("/cruz-do-dia", response_model=Dict[str, Any])
def get_cruz_do_dia_endpoint(
    target_date: Optional[str] = Query(None, description="Data da Cruz (YYYY-MM-DD). Padrão: hoje"),
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional),
):
    """
    Retorna a Cruz do Dia com dígitos cardeais, Bicho do Dia, animais formados
    e milhares sugeridas.
    """
    from ..engine.cruz_engine import get_cruz_do_dia
    effective_date = target_date or datetime.now().strftime("%Y-%m-%d")
    return get_cruz_do_dia(effective_date)


@router.get("/transition-matrix", response_model=Dict[str, Any])
def get_transition_matrix_endpoint(
    lottery: str = Query("RJ", description="Código da loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)"),
    from_slot: Optional[str] = Query(None, description="Horário anterior de origem"),
    from_group: Optional[int] = Query(None, ge=1, le=25, description="Grupo do 1º prêmio anterior (1 a 25)"),
    target_slot: Optional[str] = Query(None, description="Horário alvo"),
    limit: int = Query(5, ge=1, le=25, description="Quantidade de transições"),
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional),
):
    """
    Retorna a análise de transição empírica (Cadeias de Markov)
    calculada a partir de dezenas de milhares de sorteios reais da loteria especificada.
    """
    from ..engine.transition_matrix import get_transition_analysis

    # Se from_group não foi informado, descobre automaticamente o último apurado da banca
    if not from_group:
        from ..engine.puxadas_engine import get_puxadas_analysis
        pux = get_puxadas_analysis(target_slot=target_slot, lottery=lottery)
        base = pux.get("base_animal", {})
        from_group = base.get("group")
        from_slot = from_slot or base.get("slot")

    return get_transition_analysis(
        lottery=lottery,
        from_slot=from_slot,
        from_group=from_group,
        target_slot=target_slot,
        limit=limit
    )



@router.get("/puxadas", response_model=Dict[str, Any])
def get_puxadas_endpoint(
    target_date: Optional[str] = Query(None, description="Data alvo (YYYY-MM-DD). Padrão: hoje"),
    target_slot: Optional[str] = Query(None, description="Horário alvo"),
    lottery: str = Query("RJ", description="Código da loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)"),
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional),
):
    """
    Retorna a análise de Puxadas Tradicionais com base no último sorteio apurado da loteria escolhida
    e o catálogo completo das puxadas dos 25 grupos.
    """
    from ..engine.puxadas_engine import get_puxadas_analysis
    return get_puxadas_analysis(target_date=target_date, target_slot=target_slot, lottery=lottery or "RJ")


@router.get("/centena-master", response_model=Dict[str, Any])
def get_centena_master_endpoint(
    target_date: Optional[str] = Query(None, description="Data alvo (YYYY-MM-DD). Padrão: hoje"),
    lottery: str = Query("RJ", description="Código da loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)"),
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional),
):
    """
    Retorna a análise do Centena Master (Algoritmo Chave 24):
    6 centenas econômicas de alta precisão com conferência em tempo real contra sorteios apurados.
    """
    from ..engine.centena_master_engine import calculate_centena_master
    return calculate_centena_master(target_date=target_date, lottery=lottery or "RJ")


@router.get("/pattern-breaks", response_model=Dict[str, Any])
def get_pattern_breaks_endpoint(
    lottery: Optional[str] = Query("RJ", description="Código da loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)"),
    limit: int = Query(30, ge=1, le=100, description="Quantidade de quebras recentes"),
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional),
):
    """
    Retorna o histórico de Quebras de Padrão registradas, taxa de proteção
    da Contra-Banca e o ranking empírico das maiores zebras e rotas de fuga.
    """
    eff_lot = (lottery or "RJ").upper()
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Busca quebras recentes
        cursor.execute("""
            SELECT * FROM pattern_breaks_history
            WHERE lottery = ?
            ORDER BY draw_date DESC, id DESC
            LIMIT ?
        """, (eff_lot, limit))
        recent_rows = [dict(r) for r in cursor.fetchall()]

        # 2. Métricas agregadas
        cursor.execute("SELECT COUNT(*) as total, SUM(CASE WHEN hit_contra = 1 THEN 1 ELSE 0 END) as hits FROM pattern_breaks_history WHERE lottery = ?", (eff_lot,))
        agg_row = cursor.fetchone()
        total_breaks = (agg_row["total"] if agg_row else 0) or 0
        contra_hits = (agg_row["hits"] if agg_row else 0) or 0
        hit_rate = round((contra_hits / total_breaks * 100), 1) if total_breaks > 0 else 0.0

        # 3. Top rotas de fuga (zebras que mais ganharam quando o favorito falhou)
        cursor.execute("""
            SELECT actual_winner_group, actual_winner_animal, COUNT(*) as freq
            FROM pattern_breaks_history
            WHERE lottery = ?
            GROUP BY actual_winner_group, actual_winner_animal
            ORDER BY freq DESC
            LIMIT 5
        """, (eff_lot,))
        top_zebras = [
            {
                "group": int(r["actual_winner_group"]),
                "animal": r["actual_winner_animal"],
                "count": int(r["freq"]),
                "percentage": round(int(r["freq"]) / total_breaks * 100, 1) if total_breaks > 0 else 0.0
            }
            for r in cursor.fetchall()
        ]

        # 4. Formata as linhas recentes para a interface
        history = []
        for r in recent_rows:
            history.append({
                "id": r["id"],
                "draw_date": r["draw_date"],
                "slot": r["slot"],
                "lottery": r["lottery"],
                "favorite_group": r["favorite_group"],
                "favorite_animal": r["favorite_animal"],
                "favorite_score": r["favorite_score"],
                "contra_1": {
                    "group": r.get("contra_predicted_1_group"),
                    "animal": r.get("contra_predicted_1_animal")
                },
                "contra_2": {
                    "group": r.get("contra_predicted_2_group"),
                    "animal": r.get("contra_predicted_2_animal")
                },
                "actual_winner_group": r["actual_winner_group"],
                "actual_winner_animal": r["actual_winner_animal"],
                "actual_prize_1": r["actual_prize_1"],
                "risk_level": r["risk_level"],
                "hit_contra": bool(r.get("hit_contra", 0)),
                "created_at": str(r["created_at"]) if r.get("created_at") else None
            })

    return {
        "lottery": eff_lot,
        "total_breaks": total_breaks,
        "contra_hits": contra_hits,
        "contra_protection_rate": hit_rate,
        "top_escape_animals": top_zebras,
        "history": history
    }


@router.post("/pattern-breaks/backfill", response_model=Dict[str, Any])
def post_pattern_breaks_backfill(
    limit: int = Query(500, ge=10, le=1000),
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional),
):
    """
    Aciona o backfill retroativo de quebras de padrão a partir de todos os snapshots apurados no banco.
    """
    from ..engine.evaluator import backfill_pattern_breaks_from_snapshots
    total = backfill_pattern_breaks_from_snapshots(limit=limit)
    return {"status": "ok", "total_breaks_in_database": total}




