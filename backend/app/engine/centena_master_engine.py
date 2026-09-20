"""
Módulo Centena Master (Algoritmo Chave 24).
Calcula as 6 centenas econômicas de alta assertividade a partir da data do dia e da chave matemática 24,
com conferência automática em tempo real com os resultados apurados da banca.
"""

import itertools
from datetime import datetime
from typing import Dict, Any, List, Optional

from ..domain import ANIMALS, TEN_TO_GROUP
from ..database import get_db_connection


def calculate_centena_master(target_date: Optional[str] = None, lottery: str = "RJ") -> Dict[str, Any]:
    """
    Executa o algoritmo matemático do Centena Master:
    1. Obtém o dia do mês (1 a 31) formatado com 2 dígitos (ex: '16', '20').
    2. Aplica a Chave Fixa '24' em 4 etapas descendentes, somando dígito a dígito (módulo 10, sem vai-um):
       - Linha 1 = Dia + Chave
       - Linha 2 = Chave + Linha 1
       - Linha 3 = Chave + Linha 2
       - Linha 4 = Chave + Linha 3
    3. Forma as 6 centenas combinando os 2 dígitos da linha superior com a dezena da linha inferior:
       - C1 = L1[0] + L2
       - C2 = L1[1] + L2
       - C3 = L2[0] + L3
       - C4 = L2[1] + L3
       - C5 = L3[0] + L4
       - C6 = L3[1] + L4
    4. Mapeia animais, grupos e gera jogos derivados (Terno de Grupo, Duques de Grupo, Terno e Duques de Dezenas).
    5. Confere automaticamente se alguma centena já foi sorteada no dia para a loteria.
    """
    eff_date = target_date or datetime.now().strftime("%Y-%m-%d")
    try:
        dt = datetime.strptime(eff_date, "%Y-%m-%d")
    except Exception:
        dt = datetime.now()
        eff_date = dt.strftime("%Y-%m-%d")

    day_int = dt.day
    day_str = f"{day_int:02d}"

    # Chave Fixa Universal
    KEY_D1, KEY_D2 = 2, 4
    key_str = "24"

    # Etapa 1: Dia + Chave
    d_left, d_right = int(day_str[0]), int(day_str[1])
    l1_d1 = (d_left + KEY_D1) % 10
    l1_d2 = (d_right + KEY_D2) % 10
    l1_str = f"{l1_d1}{l1_d2}"

    # Etapa 2: Chave + Linha 1
    l2_d1 = (KEY_D1 + l1_d1) % 10
    l2_d2 = (KEY_D2 + l1_d2) % 10
    l2_str = f"{l2_d1}{l2_d2}"

    # Etapa 3: Chave + Linha 2
    l3_d1 = (KEY_D1 + l2_d1) % 10
    l3_d2 = (KEY_D2 + l2_d2) % 10
    l3_str = f"{l3_d1}{l3_d2}"

    # Etapa 4: Chave + Linha 3
    l4_d1 = (KEY_D1 + l3_d1) % 10
    l4_d2 = (KEY_D2 + l3_d2) % 10
    l4_str = f"{l4_d1}{l4_d2}"

    # As 6 Centenas
    raw_centenas = [
        f"{l1_d1}{l2_str}",  # C1
        f"{l1_d2}{l2_str}",  # C2
        f"{l2_d1}{l3_str}",  # C3
        f"{l2_d2}{l3_str}",  # C4
        f"{l3_d1}{l4_str}",  # C5
        f"{l3_d2}{l4_str}",  # C6
    ]

    # Dezenas geradas
    tens_list = [l2_str, l3_str, l4_str]
    unique_tens = sorted(list(dict.fromkeys(tens_list)))

    # Conferência em tempo real no banco de dados para a data e loteria
    hits_map: Dict[str, List[Dict[str, Any]]] = {}
    drawn_results = []
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            eff_lot = (lottery or "RJ").upper()
            if eff_lot == "FEDERAL":
                cursor.execute(
                    "SELECT slot, prize_1, prize_2, prize_3, prize_4, prize_5 FROM draw_results WHERE (lottery = 'FEDERAL' OR slot = 'FED') AND draw_date = ?",
                    (eff_date,)
                )
            elif eff_lot == "RJ":
                cursor.execute(
                    "SELECT slot, prize_1, prize_2, prize_3, prize_4, prize_5 FROM draw_results WHERE (lottery = 'RJ' OR lottery IS NULL) AND draw_date = ?",
                    (eff_date,)
                )
            else:
                cursor.execute(
                    "SELECT slot, prize_1, prize_2, prize_3, prize_4, prize_5 FROM draw_results WHERE lottery = ? AND draw_date = ?",
                    (eff_lot, eff_date)
                )
            drawn_results = cursor.fetchall()
            for row in drawn_results:
                slot_code = row["slot"]
                for p_idx, p_col in enumerate(["prize_1", "prize_2", "prize_3", "prize_4", "prize_5"], start=1):
                    val = str(row[p_col] or "").strip()
                    if len(val) >= 3:
                        centena_drawn = val[-3:]
                        for c in raw_centenas:
                            if c == centena_drawn:
                                if c not in hits_map:
                                    hits_map[c] = []
                                hits_map[c].append({
                                    "slot": slot_code,
                                    "prize": p_idx,
                                    "milhar": val,
                                    "centena": centena_drawn
                                })
    except Exception:
        hits_map = {}

    # Detalhar cada uma das 6 centenas
    centenas_details = []
    groups_present = []

    for idx, c in enumerate(raw_centenas, start=1):
        ten = c[-2:]
        grp = TEN_TO_GROUP.get(ten)
        animal_info = ANIMALS.get(grp, {"name": "Desconhecido", "emoji": "❓"}) if grp else {"name": "Desconhecido", "emoji": "❓"}
        if grp and grp not in groups_present:
            groups_present.append(grp)

        # Invertidas únicas
        perms = sorted(list(set(["".join(p) for p in itertools.permutations(c, 3)])))
        inverted = [p for p in perms if p != c]

        hit_list = hits_map.get(c, [])
        is_hit = len(hit_list) > 0

        centenas_details.append({
            "index": idx,
            "centena": c,
            "ten": ten,
            "group": grp,
            "animal": animal_info.get("name"),
            "emoji": animal_info.get("emoji"),
            "inverted": inverted,
            "is_hit": is_hit,
            "hits": hit_list
        })

    # Ordenar grupos únicos
    unique_groups = sorted(list(set(groups_present)))

    # Terno de Grupo Fechado
    terno_grupo = [
        {
            "group": g,
            "animal": ANIMALS[g]["name"],
            "emoji": ANIMALS[g]["emoji"]
        }
        for g in unique_groups
    ]

    # Duques de Grupo / Passe (todos os pares dos grupos únicos)
    duques_grupo = []
    for g1, g2 in itertools.combinations(unique_groups, 2):
        duques_grupo.append({
            "pair": [g1, g2],
            "animals": f"{ANIMALS[g1]['name']} ({g1:02d}) + {ANIMALS[g2]['name']} ({g2:02d})",
            "emojis": f"{ANIMALS[g1]['emoji']} {ANIMALS[g2]['emoji']}"
        })

    # Duques de Dezenas
    duques_dezenas = []
    for d1, d2 in itertools.combinations(unique_tens, 2):
        duques_dezenas.append(f"{d1} - {d2}")

    # Terno de Dezenas
    terno_dezenas = " - ".join(unique_tens) if len(unique_tens) >= 3 else None

    return {
        "title": "Centena Master",
        "target_date": eff_date,
        "lottery": (lottery or "RJ").upper(),
        "day": day_str,
        "key": key_str,
        "steps": [
            {
                "step": 1,
                "label": "Dia + Chave 24",
                "left_calc": f"{day_str[0]} + 2 = {l1_d1}",
                "right_calc": f"{day_str[1]} + 4 = {l1_d2}",
                "result": l1_str
            },
            {
                "step": 2,
                "label": "Chave 24 + Linha 1",
                "left_calc": f"2 + {l1_d1} = {l2_d1}",
                "right_calc": f"4 + {l1_d2} = {l2_d2}",
                "result": l2_str
            },
            {
                "step": 3,
                "label": "Chave 24 + Linha 2",
                "left_calc": f"2 + {l2_d1} = {l3_d1}",
                "right_calc": f"4 + {l2_d2} = {l3_d2}",
                "result": l3_str
            },
            {
                "step": 4,
                "label": "Chave 24 + Linha 3",
                "left_calc": f"2 + {l3_d1} = {l4_d1}",
                "right_calc": f"4 + {l3_d2} = {l4_d2}",
                "result": l4_str
            }
        ],
        "lines": [l1_str, l2_str, l3_str, l4_str],
        "centenas": centenas_details,
        "total_hits_today": sum(len(hits_map.get(c, [])) for c in raw_centenas),
        "games": {
            "terno_grupo": terno_grupo,
            "duques_grupo": duques_grupo,
            "duques_dezenas": duques_dezenas,
            "terno_dezenas": terno_dezenas
        }
    }
