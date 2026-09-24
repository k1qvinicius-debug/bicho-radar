"""
Endpoints de Resultados de Sorteios.
Permite listar, criar, editar, excluir e importar em massa resultados do Jogo do Bicho.
"""

from fastapi import APIRouter, HTTPException, Query, UploadFile, File, Depends
from typing import List, Optional, Dict, Any
from datetime import datetime
import csv
import io
import json

from ..database import get_db_connection
from ..models import DrawResultCreate, DrawResultResponse
from ..domain import STANDARD_SLOTS, format_milhar, get_group_for_number
from ..engine.evaluator import evaluate_draw_against_snapshots, ensure_snapshots_and_evaluate_for_draw
from ..engine.scraper import fetch_and_sync_results
from ..engine.bichocerto_scraper import fetch_and_sync_bichocerto_atrasados, get_cached_bichocerto_atrasados
from ..auth import require_admin

router = APIRouter(prefix="/results", tags=["Resultados"])


@router.post("/sync-web")
def sync_results_from_web(lottery: Optional[str] = Query(None)):
    """
    Puxa e sincroniza automaticamente os últimos resultados em tempo real
    diretamente dos sites oficiais (Deu no Poste e Bicho Certo) para todas as bancas:
    Rio de Janeiro (RJ), Look (LOOK), São Paulo (SP), Loteria Nacional (NACIONAL) e Federal (FEDERAL).
    """
    try:
        res = fetch_and_sync_results(lottery)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar com os sites: {e}")


@router.get("/bichocerto-atrasados", response_model=List[Dict[str, Any]])
def get_bichocerto_atrasados(lottery: Optional[str] = Query("RJ")):
    """
    Retorna o ranking oficial dos 25 animais mais atrasados para a loteria indicada
    (Rio de Janeiro, Look, São Paulo, Loteria Nacional ou Federal).
    Inclui dias de atraso e sorteios equivalentes estimados.
    """
    return get_cached_bichocerto_atrasados(lottery)


@router.post("/sync-bichocerto")
def sync_bichocerto_atrasados(lottery: Optional[str] = Query("RJ")):
    """
    Dispara a sincronização e apuração em tempo real dos atrasados para a loteria indicada.
    """
    try:
        res = fetch_and_sync_bichocerto_atrasados(lottery)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar atrasados: {e}")


@router.get("/lotteries", response_model=List[Dict[str, Any]])
def list_lotteries():
    """Retorna a lista de todas as loterias e bancas suportadas com seus horários."""
    from ..domain import LOTTERIES
    return list(LOTTERIES.values())


@router.get("/slots", response_model=List[Dict[str, Any]])
def get_slots(lottery: Optional[str] = Query("RJ"), target_date: Optional[str] = Query(None)):
    """Retorna a lista de horários suportados para a loteria indicada."""
    from ..domain import get_lottery_slots
    return get_lottery_slots(lottery, target_date=target_date)


@router.get("", response_model=Dict[str, Any])
def list_results(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    slot: Optional[str] = Query(None),
    lottery: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """Lista os resultados cadastrados com paginação e filtros opcionais."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        query = "SELECT * FROM draw_results WHERE 1=1"
        count_query = "SELECT COUNT(*) FROM draw_results WHERE 1=1"
        params: List[Any] = []

        if lottery:
            lot_code = lottery.upper()
            if lot_code == "FEDERAL":
                query += " AND (lottery = 'FEDERAL' OR slot = 'FED')"
                count_query += " AND (lottery = 'FEDERAL' OR slot = 'FED')"
            elif lot_code == "RJ":
                # No Rio de Janeiro, a extração das 18h às quartas é a Loteria Federal (FED)
                query += " AND (lottery = 'RJ' OR (slot = 'FED' AND day_of_week = 2) OR (lottery IS NULL AND ? = 'RJ'))"
                count_query += " AND (lottery = 'RJ' OR (slot = 'FED' AND day_of_week = 2) OR (lottery IS NULL AND ? = 'RJ'))"
                params.append(lot_code)
            else:
                query += " AND lottery = ?"
                count_query += " AND lottery = ?"
                params.append(lot_code)
        if slot:
            query += " AND slot = ?"
            count_query += " AND slot = ?"
            params.append(slot)
        if start_date:
            query += " AND draw_date >= ?"
            count_query += " AND draw_date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND draw_date <= ?"
            count_query += " AND draw_date <= ?"
            params.append(end_date)

        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]

        query += " ORDER BY draw_date DESC, id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        rows = cursor.fetchall()
        items = [DrawResultResponse.from_row(dict(r)) for r in rows]

        return {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": items,
        }


@router.get("/{draw_id}", response_model=DrawResultResponse)
def get_result(draw_id: int):
    """Busca um resultado específico pelo ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM draw_results WHERE id = ?", (draw_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Resultado não encontrado.")
        return DrawResultResponse.from_row(dict(row))


@router.post("", response_model=DrawResultResponse)
def create_result(data: DrawResultCreate, _admin=Depends(require_admin)):
    """
    Cadastra um novo resultado de sorteio.
    Valida prêmios, calcula dia da semana e dispara automaticamente a auditoria de acertos.
    """
    try:
        dt = datetime.strptime(data.draw_date, "%Y-%m-%d")
        day_of_week = dt.weekday()
    except Exception:
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")

    lottery_code = (data.lottery or "RJ").upper()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        try:
            cursor.execute("""
                INSERT INTO draw_results (
                    draw_date, slot, lottery, day_of_week,
                    prize_1, prize_2, prize_3, prize_4, prize_5, prize_6, prize_7
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                data.draw_date, data.slot, lottery_code, day_of_week,
                data.prize_1, data.prize_2, data.prize_3, data.prize_4, data.prize_5,
                data.prize_6, data.prize_7
            ))
            new_id = cursor.lastrowid
        except Exception as e:
            err_str = str(e).upper()
            if "UNIQUE" in err_str or "DUPLICATE KEY" in err_str:
                raise HTTPException(
                    status_code=409,
                    detail=f"Já existe resultado cadastrado para a data {data.draw_date} no horário {data.slot}."
                )
            raise HTTPException(status_code=500, detail=str(e))

    # Executa conferência automática com análises salvas
    ensure_snapshots_and_evaluate_for_draw(new_id)

    return get_result(new_id)


@router.put("/{draw_id}", response_model=DrawResultResponse)
def update_result(
    draw_id: int,
    data: DrawResultCreate,
    admin: Dict[str, Any] = Depends(require_admin)
):
    """Atualiza um resultado de sorteio existente e reavalia acertos."""
    try:
        dt = datetime.strptime(data.draw_date, "%Y-%m-%d")
        day_of_week = dt.weekday()
    except Exception:
        raise HTTPException(status_code=400, detail="Data inválida. Use YYYY-MM-DD.")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM draw_results WHERE id = ?", (draw_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Resultado não encontrado.")

        cursor.execute("""
            UPDATE draw_results SET
                draw_date = ?, slot = ?, day_of_week = ?,
                prize_1 = ?, prize_2 = ?, prize_3 = ?, prize_4 = ?, prize_5 = ?,
                prize_6 = ?, prize_7 = ?
            WHERE id = ?
        """, (
            data.draw_date, data.slot, day_of_week,
            data.prize_1, data.prize_2, data.prize_3, data.prize_4, data.prize_5,
            data.prize_6, data.prize_7, draw_id
        ))

    # Reavalia acertos
    ensure_snapshots_and_evaluate_for_draw(draw_id)
    return get_result(draw_id)


@router.delete("/{draw_id}")
def delete_result(
    draw_id: int,
    admin: Dict[str, Any] = Depends(require_admin)
):
    """Exclui um resultado de sorteio e suas avaliações vinculadas."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM draw_results WHERE id = ?", (draw_id,))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Resultado não encontrado.")

        cursor.execute("DELETE FROM draw_results WHERE id = ?", (draw_id,))

    return {"message": f"Resultado {draw_id} excluído com sucesso."}


@router.post("/import")
async def import_results(
    file: UploadFile = File(...),
    admin: Dict[str, Any] = Depends(require_admin)
):
    """
    Importação em massa de resultados via arquivo CSV ou JSON.
    Formato esperado:
    - CSV: colunas draw_date, slot, prize_1, prize_2, prize_3, prize_4, prize_5
    - JSON: lista de objetos com essas mesmas chaves
    """
    contents = await file.read()
    filename = (file.filename or "").lower()
    imported_count = 0
    errors = []

    rows_to_insert = []

    if filename.endswith(".json"):
        try:
            data = json.loads(contents.decode("utf-8"))
            if isinstance(data, dict) and "results" in data:
                data = data["results"]
            if not isinstance(data, list):
                raise ValueError("JSON deve ser uma lista de objetos.")
            rows_to_insert = data
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao ler JSON: {e}")
    else:
        # Tenta interpretar como CSV
        try:
            text = contents.decode("utf-8-sig")
            reader = csv.DictReader(io.StringIO(text), delimiter="," if "," in text else ";")
            for r in reader:
                rows_to_insert.append(r)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Erro ao ler CSV: {e}")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        for idx, row in enumerate(rows_to_insert):
            try:
                date_val = str(row.get("draw_date") or row.get("data") or "").strip()
                slot_val = str(row.get("slot") or row.get("horario") or "PT").strip().upper()
                p1 = format_milhar(row.get("prize_1") or row.get("1_premio") or row.get("p1"))
                p2 = format_milhar(row.get("prize_2") or row.get("2_premio") or row.get("p2"))
                p3 = format_milhar(row.get("prize_3") or row.get("3_premio") or row.get("p3"))
                p4 = format_milhar(row.get("prize_4") or row.get("4_premio") or row.get("p4"))
                p5 = format_milhar(row.get("prize_5") or row.get("5_premio") or row.get("p5"))
                p6 = format_milhar(row.get("prize_6") or row.get("p6")) if row.get("prize_6") or row.get("p6") else None
                p7 = str(row.get("prize_7") or row.get("p7") or "")[:4] if row.get("prize_7") or row.get("p7") else None

                if not date_val:
                    continue

                dt = datetime.strptime(date_val, "%Y-%m-%d")
                day_of_week = dt.weekday()

                cursor.execute("""
                    INSERT INTO draw_results (
                        draw_date, slot, day_of_week,
                        prize_1, prize_2, prize_3, prize_4, prize_5, prize_6, prize_7
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(draw_date, slot) DO UPDATE SET
                        prize_1 = excluded.prize_1,
                        prize_2 = excluded.prize_2,
                        prize_3 = excluded.prize_3,
                        prize_4 = excluded.prize_4,
                        prize_5 = excluded.prize_5,
                        prize_6 = excluded.prize_6,
                        prize_7 = excluded.prize_7
                """, (date_val, slot_val, day_of_week, p1, p2, p3, p4, p5, p6, p7))
                imported_count += 1
            except Exception as item_err:
                errors.append(f"Linha {idx+1}: {item_err}")

    return {
        "imported_count": imported_count,
        "errors_count": len(errors),
        "errors_sample": errors[:5] if errors else [],
    }
