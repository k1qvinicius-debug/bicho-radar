"""
Módulo de Puxadas Tradicionais do Jogo do Bicho.
Define a tabela clássica de puxadas dos 25 grupos e identifica os animais
atraídos pelo último resultado apurado no banco de dados, projetando Centenas e Milhares Quentes.
"""

from typing import Dict, List, Any, Optional, Tuple
from collections import Counter
from datetime import datetime

from ..domain import (
    ANIMALS, TEN_TO_GROUP, get_animal_info, get_group_for_number,
    STANDARD_SLOTS, get_slot_order_weight
)
from ..database import get_db_connection

# Tabela tradicional canônica das puxadas dos 25 grupos do Jogo do Bicho
# Mapeia cada grupo (1 a 25) para a lista de grupos que ele tradicionalmente puxa
PUXADAS_TABLE: Dict[int, List[int]] = {
    1: [25, 2, 13, 19, 20],      # Avestruz puxa: Vaca, Águia, Galo, Pavão, Peru
    2: [10, 1, 13, 19, 20],      # Águia puxa: Coelho, Avestruz, Galo, Pavão, Peru
    3: [11, 12, 21, 24, 10, 9],  # Burro puxa: Cavalo, Elefante, Touro, Veado, Coelho, Cobra
    4: [6, 12, 14, 16, 5, 13],   # Borboleta puxa: Cabra, Elefante, Gato, Leão, Cachorro, Galo
    5: [13, 14, 8, 17, 18, 19],  # Cachorro puxa: Galo, Gato, Camelo, Macaco, Porco, Pavão
    6: [7, 17, 12, 21, 22, 23],  # Cabra puxa: Carneiro, Macaco, Elefante, Touro, Tigre, Urso
    7: [6, 10, 25],              # Carneiro puxa: Cabra, Coelho, Vaca
    8: [5, 12, 23],              # Camelo puxa: Cachorro, Elefante, Urso
    9: [15, 18, 3, 14],          # Cobra puxa: Jacaré, Porco, Burro, Gato
    10: [7, 2, 3],               # Coelho puxa: Carneiro, Águia, Burro
    11: [3, 6, 21],              # Cavalo puxa: Burro, Cabra, Touro
    12: [7, 5, 6, 19],           # Elefante puxa: Carneiro, Cachorro, Cabra, Pavão
    13: [10, 1, 19, 22],         # Galo puxa: Coelho, Avestruz, Pavão, Tigre
    14: [7, 21, 13, 4],          # Gato puxa: Carneiro, Touro, Galo, Borboleta
    15: [7, 22, 6, 20],          # Jacaré puxa: Carneiro, Tigre, Cabra, Peru
    16: [2, 22, 15, 9],          # Leão puxa: Águia, Tigre, Jacaré, Cobra
    17: [18, 15, 8, 9, 7],       # Macaco puxa: Porco, Jacaré, Camelo, Cobra, Carneiro
    18: [5, 2, 3, 11],           # Porco puxa: Cachorro, Águia, Burro, Cavalo
    19: [22, 13, 2, 6],          # Pavão puxa: Tigre, Galo, Águia, Cabra
    20: [18, 17, 16, 24],        # Peru puxa: Porco, Macaco, Leão, Veado
    21: [22, 7, 18, 25],         # Touro puxa: Tigre, Carneiro, Porco, Vaca
    22: [19, 7, 14, 20],         # Tigre puxa: Pavão, Carneiro, Gato, Peru
    23: [2, 11, 7, 3],           # Urso puxa: Águia, Cavalo, Carneiro, Burro
    24: [3, 10, 20, 22, 6],      # Veado puxa: Burro, Coelho, Peru, Tigre, Cabra
    25: [11, 21, 4, 1],          # Vaca puxa: Cavalo, Touro, Borboleta, Avestruz
}


def _get_hot_leading_digits(conn, lottery: str = "RJ") -> Tuple[List[str], List[str]]:
    """
    Retorna os dígitos líderes mais quentes e frequentes nos sorteios recentes da loteria especificada:
    - top_hundred_digits (posição 2)
    - top_thousand_digits (posição 1)
    """
    cursor = conn.cursor()
    lot_code = (lottery or "RJ").upper()
    if lot_code == "FEDERAL":
        cursor.execute("SELECT prize_1 FROM draw_results WHERE (lottery = 'FEDERAL' OR slot = 'FED') ORDER BY draw_date DESC, id DESC LIMIT 60")
    elif lot_code == "RJ":
        cursor.execute("SELECT prize_1 FROM draw_results WHERE (lottery = 'RJ' OR lottery IS NULL OR slot = 'FED') ORDER BY draw_date DESC, id DESC LIMIT 60")
    else:
        cursor.execute("SELECT prize_1 FROM draw_results WHERE lottery = ? ORDER BY draw_date DESC, id DESC LIMIT 60", (lot_code,))
    rows = cursor.fetchall()

    hundred_counts = Counter()
    thousand_counts = Counter()
    for r in rows:
        m = str(r[0]).strip().zfill(4)[-4:]
        thousand_counts[m[0]] += 1
        hundred_counts[m[1]] += 1

    top_hundred = [d for d, _ in hundred_counts.most_common()] or ["7", "3", "0", "5"]
    top_thousand = [d for d, _ in thousand_counts.most_common()] or ["1", "0", "9", "8"]

    for d in "7305912468":
        if d not in top_hundred:
            top_hundred.append(d)
        if d not in top_thousand:
            top_thousand.append(d)

    return top_hundred[:4], top_thousand[:4]


def generate_projections_for_group(
    group: int,
    hundred_digits: Optional[List[str]] = None,
    thousand_digits: Optional[List[str]] = None,
    target_date: Optional[str] = None,
) -> Dict[str, List[str]]:
    """
    Gera Centenas e Milhares Quentes para o animal especificado.
    Combina as 4 dezenas do animal com os dígitos líderes de maior pressão
    e incorpora milhares da Cruz do Dia se pertencerem ao grupo.
    """
    info = get_animal_info(group)
    tens = info["tens"]
    h_digits = hundred_digits or ["7", "3", "0", "5"]
    m_digits = thousand_digits or ["1", "0", "9", "8"]

    # 1. Centenas Quentes: combina dezenas com os 3 dígitos líderes mais fortes
    hundreds = []
    for h_dig in h_digits[:3]:
        for t in tens:
            hundreds.append(f"{h_dig}{t}")
    hundreds = sorted(list(dict.fromkeys(hundreds)))[:4]

    # 2. Milhares Quentes: combina dígitos líderes de milhar com as centenas quentes
    thousands = []
    # Incorpora milhares da Cruz do Dia para este grupo se existirem
    if target_date:
        try:
            from .cruz_engine import get_cruz_do_dia
            c_data = get_cruz_do_dia(target_date)
            for anim in c_data.get("animals", []):
                if anim["group"] == group:
                    thousands.extend(anim.get("thousands", []))
        except Exception:
            pass

    for m_dig in m_digits[:3]:
        for c in hundreds[:3]:
            thousands.append(f"{m_dig}{c}")

    thousands = sorted(list(dict.fromkeys(thousands)))[:6]

    return {
        "hundreds": hundreds,
        "thousands": thousands
    }


def get_puxadas_for_group(
    group: int,
    hundred_digits: Optional[List[str]] = None,
    thousand_digits: Optional[List[str]] = None,
    target_date: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Retorna a lista estruturada de animais puxados por um grupo específico,
    incluindo suas Centenas e Milhares Quentes.
    """
    pulled_groups = PUXADAS_TABLE.get(group, [])
    result = []
    for g in pulled_groups:
        info = get_animal_info(g)
        proj = generate_projections_for_group(g, hundred_digits, thousand_digits, target_date)
        result.append({
            "group": g,
            "animal": info["name"],
            "emoji": info["emoji"],
            "tens": info["tens"],
            "hundreds": proj["hundreds"],
            "thousands": proj["thousands"],
        })
    return result


def get_all_puxadas_catalog(
    hundred_digits: Optional[List[str]] = None,
    thousand_digits: Optional[List[str]] = None,
    target_date: Optional[str] = None,
) -> Dict[int, Dict[str, Any]]:
    """
    Retorna o catálogo completo das puxadas de todos os 25 grupos
    com Centenas e Milhares Quentes projetadas para cada um.
    """
    catalog = {}
    for g in range(1, 26):
        info = get_animal_info(g)
        pulled = get_puxadas_for_group(g, hundred_digits, thousand_digits, target_date)
        proj = generate_projections_for_group(g, hundred_digits, thousand_digits, target_date)
        catalog[g] = {
            "group": g,
            "animal": info["name"],
            "emoji": info["emoji"],
            "tens": info["tens"],
            "hundreds": proj["hundreds"],
            "thousands": proj["thousands"],
            "pulled": pulled,
            "pulled_summary": ", ".join([f"{p['emoji']} {p['animal']}" for p in pulled]),
        }
    return catalog


def get_puxadas_analysis(
    target_date: Optional[str] = None,
    target_slot: Optional[str] = None,
    lottery: str = "RJ"
) -> Dict[str, Any]:
    """
    Identifica o último sorteio apurado anterior ao horário alvo e calcula
    os animais que foram 'puxados' pelo 1º prêmio na loteria especificada,
    gerando Centenas e Milhares Quentes.
    """
    from ..domain import get_lottery_info
    effective_date = target_date or datetime.now().strftime("%Y-%m-%d")
    effective_lottery = (lottery or "RJ").upper()
    lot_info = get_lottery_info(effective_lottery)

    # Busca os dígitos líderes mais quentes e o último sorteio no banco
    with get_db_connection() as conn:
        h_digits, m_digits = _get_hot_leading_digits(conn, effective_lottery)

        cursor = conn.cursor()
        if effective_lottery == "FEDERAL":
            lot_filter = "(lottery = 'FEDERAL' OR slot = 'FED')"
            lot_params: List[Any] = []
        elif effective_lottery == "RJ":
            lot_filter = "(lottery = 'RJ' OR lottery IS NULL OR slot = 'FED')"
            lot_params = []
        else:
            lot_filter = "lottery = ?"
            lot_params = [effective_lottery]

        last_draw = None

        if target_slot and target_date:
            target_weight = get_slot_order_weight(target_slot)
            query = f"SELECT * FROM draw_results WHERE {lot_filter} AND draw_date <= ? ORDER BY draw_date DESC"
            cursor.execute(query, lot_params + [target_date])
            candidates = [dict(r) for r in cursor.fetchall()]

            valid_candidates = [
                d for d in candidates
                if d["draw_date"] < target_date or (d["draw_date"] == target_date and get_slot_order_weight(d.get("slot")) < target_weight)
            ]

            if valid_candidates:
                valid_candidates.sort(key=lambda d: (d["draw_date"], get_slot_order_weight(d.get("slot"))), reverse=True)
                last_draw = valid_candidates[0]

        if not last_draw:
            if target_date:
                cursor.execute(f"SELECT MAX(draw_date) FROM draw_results WHERE {lot_filter} AND draw_date <= ?", lot_params + [target_date])
            else:
                cursor.execute(f"SELECT MAX(draw_date) FROM draw_results WHERE {lot_filter}", lot_params)
            row = cursor.fetchone()
            latest_date = row[0] if row else None

            if latest_date:
                cursor.execute(f"SELECT * FROM draw_results WHERE {lot_filter} AND draw_date = ?", lot_params + [latest_date])
                draws_on_date = [dict(r) for r in cursor.fetchall()]
                if draws_on_date:
                    draws_on_date.sort(key=lambda d: get_slot_order_weight(d.get("slot")), reverse=True)
                    last_draw = draws_on_date[0]

    if not last_draw:
        default_group = 17  # Macaco
        info = get_animal_info(default_group)
        pulled = get_puxadas_for_group(default_group, h_digits, m_digits, effective_date)
        all_h = []
        all_m = []
        for p in pulled:
            all_h.extend(p["hundreds"])
            all_m.extend(p["thousands"])

        return {
            "has_draw": False,
            "lottery": effective_lottery,
            "lottery_name": lot_info["name"],
            "last_draw": None,
            "base_animal": {
                "group": default_group,
                "animal": info["name"],
                "emoji": info["emoji"],
                "tens": info["tens"],
                "hundreds": ["765", "766", "367", "368"],
                "thousands": ["1765", "0766", "9367", "8368"],
                "milhar": "2568",
                "source_slot": None,
                "lottery": effective_lottery,
                "lottery_name": lot_info["name"]
            },
            "pulled_animals": pulled,
            "all_hundreds": sorted(list(dict.fromkeys(all_h))),
            "all_thousands": sorted(list(dict.fromkeys(all_m))),
            "catalog": get_all_puxadas_catalog(h_digits, m_digits, effective_date)
        }

    last_draw_dict = dict(last_draw)
    prize_1 = str(last_draw_dict.get("prize_1", "0000"))
    g1 = get_group_for_number(prize_1)
    base_info = get_animal_info(g1)
    base_proj = generate_projections_for_group(g1, h_digits, m_digits, effective_date)

    pulled = get_puxadas_for_group(g1, h_digits, m_digits, effective_date)

    all_h = []
    all_m = []
    for p in pulled:
        all_h.extend(p["hundreds"])
        all_m.extend(p["thousands"])

    return {
        "has_draw": True,
        "lottery": effective_lottery,
        "lottery_name": lot_info["name"],
        "last_draw": {
            "id": last_draw_dict["id"],
            "draw_date": last_draw_dict["draw_date"],
            "slot": last_draw_dict["slot"],
            "lottery": last_draw_dict.get("lottery") or effective_lottery,
            "prize_1": prize_1,
            "prizes": [last_draw_dict.get(f"prize_{i}") for i in range(1, 8)],
        },
        "base_animal": {
            "group": g1,
            "animal": base_info["name"],
            "emoji": base_info["emoji"],
            "tens": base_info["tens"],
            "hundreds": base_proj["hundreds"],
            "thousands": base_proj["thousands"],
            "milhar": prize_1,
            "source_slot": f"{last_draw_dict['slot']} ({last_draw_dict['draw_date']})",
            "lottery": effective_lottery,
            "lottery_name": lot_info["name"]
        },
        "pulled_animals": pulled,
        "all_hundreds": sorted(list(dict.fromkeys(all_h))),
        "all_thousands": sorted(list(dict.fromkeys(all_m))),
        "catalog": get_all_puxadas_catalog(h_digits, m_digits, effective_date)
    }
