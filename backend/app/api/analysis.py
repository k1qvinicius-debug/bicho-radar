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
    """Calcula o horário padrão mais adequado com base na hora atual e na loteria selecionada."""
    from ..domain import get_lottery_slots
    slots = get_lottery_slots(lottery)
    if not slots:
        return "PPT"

    now = datetime.now()
    cur_min = now.hour * 60 + now.minute

    # Procura o primeiro slot que ocorra após o minuto atual
    for s in slots:
        t_parts = s.get("time", "").split(":")
        if len(t_parts) == 2:
            slot_min = int(t_parts[0]) * 60 + int(t_parts[1])
            if cur_min <= slot_min:
                return s["code"]

    # Se já passaram todos os horários de hoje, retorna o primeiro horário do dia seguinte
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
    current_tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
):
    """Lista o histórico de análises salvas com status de conferência, isoladas por testador e loteria."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = """
            SELECT s.id, s.target_date, s.target_slot, COALESCE(s.lottery, 'RJ') as lottery, s.status, s.created_at, s.tenant_id,
                   t.name as tenant_name,
                   e.acerto_grupo_1, e.acertos_grupo_cercado,
                   e.acerto_dezena_1, e.acertos_dezena_cercado,
                   e.acerto_centena_1, e.acertos_centena_cercado,
                   e.acerto_milhar_1, e.acertos_milhar_cercado,
                   e.hit_rate_score, e.evaluated_at,
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

        # Se for um testador comum (não admin), exibe apenas os seus próprios snapshots
        if isinstance(current_tenant, dict) and current_tenant.get("role") != "admin":
            query += " AND s.tenant_id = ?"
            params.append(current_tenant["id"])
        elif tenant_id:
            query += " AND s.tenant_id = ?"
            params.append(tenant_id)

        query += " ORDER BY s.target_date DESC, s.id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()

        result = []
        for r in rows:
            d = dict(r)
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
    tenant: Dict[str, Any] = Depends(require_tenant),
):
    """
    Retorna a Cruz do Dia com dígitos cardeais, Bicho do Dia, animais formados
    e milhares sugeridas.
    """
    from ..engine.cruz_engine import get_cruz_do_dia
    effective_date = target_date or datetime.now().strftime("%Y-%m-%d")
    return get_cruz_do_dia(effective_date)


@router.get("/puxadas", response_model=Dict[str, Any])
def get_puxadas_endpoint(
    target_date: Optional[str] = Query(None, description="Data alvo (YYYY-MM-DD). Padrão: hoje"),
    target_slot: Optional[str] = Query(None, description="Horário alvo"),
    lottery: Optional[str] = Query("RJ", description="Código da loteria (RJ, LOOK, NACIONAL, SP, FEDERAL)"),
    tenant: Dict[str, Any] = Depends(require_tenant),
):
    """
    Retorna a análise de Puxadas Tradicionais com base no último sorteio apurado da loteria escolhida
    e o catálogo completo das puxadas dos 25 grupos.
    """
    from ..engine.puxadas_engine import get_puxadas_analysis
    return get_puxadas_analysis(target_date=target_date, target_slot=target_slot, lottery=lottery)


