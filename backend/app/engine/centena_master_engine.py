"""
Módulo Centena Master (Algoritmo Matemático da Data).
Calcula as 4 milhares e centenas econômicas de alta assertividade a partir da data do dia,
com conferência automática em tempo real com os resultados apurados da banca.
"""

import itertools
from datetime import datetime
from typing import Dict, Any, List, Optional

from ..domain import ANIMALS, TEN_TO_GROUP
from ..database import get_db_connection


def calculate_centena_master(target_date: Optional[str] = None, lottery: str = "RJ") -> Dict[str, Any]:
    """
    Executa o algoritmo matemático da data:
    1. Obtém o dia do mês formatado com 2 dígitos (ex: '24', '22', '01').
    2. Soma os 2 dígitos do dia (ex: 2 + 4 = 6 -> '06', dígitos '0' e '6').
    3. Monta as 4 Milhares e Centenas:
       - M1: s1 + DD + s2 (ex: 0 + 24 + 6 = 0246)
       - M2: s2 + DD + s1 (ex: 6 + 24 + 0 = 6240)
       - M3: soma_str + DD (ex: 06 + 24 = 0624)
       - M4: s2 + s1 + DD (ex: 60 + 24 = 6024)
    4. Mapeia animais, grupos, dezenas e gera jogos derivados (Terno de Grupo, Duques de Grupo, Terno e Duques de Dezenas).
    5. Confere automaticamente se alguma milhar ou centena já foi sorteada no dia para a loteria (1º ao 5º prêmio).
    """
    eff_date = target_date or datetime.now().strftime("%Y-%m-%d")
    try:
        dt = datetime.strptime(eff_date, "%Y-%m-%d")
    except Exception:
        dt = datetime.now()
        eff_date = dt.strftime("%Y-%m-%d")

    day_int = dt.day
    day_str = f"{day_int:02d}"

    # Cálculo da Data
    d1, d2 = int(day_str[0]), int(day_str[1])
    soma = d1 + d2
    soma_str = f"{soma:02d}"
    s1, s2 = soma_str[0], soma_str[1]

    # As 4 Milhares
    m1 = f"{s1}{day_str}{s2}"
    m2 = f"{s2}{day_str}{s1}"
    m3 = f"{soma_str}{day_str}"
    m4 = f"{s2}{s1}{day_str}"

    raw_milhares = [m1, m2, m3, m4]

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
                        for m in raw_milhares:
                            c_seca = m[-3:]
                            c_frente = m[:3]
                            is_milhar_hit = (val == m)
                            is_centena_hit = (centena_drawn == c_seca)
                            is_frente_hit = (centena_drawn == c_frente or (len(val) == 4 and val[:3] == c_seca))

                            if is_milhar_hit or is_centena_hit or is_frente_hit:
                                if m not in hits_map:
                                    hits_map[m] = []
                                hit_type = "Milhar Exata" if is_milhar_hit else ("Centena Seca" if is_centena_hit else "Centena Frontal")
                                hits_map[m].append({
                                    "slot": slot_code,
                                    "prize": p_idx,
                                    "milhar": val,
                                    "centena": centena_drawn,
                                    "type": hit_type
                                })
    except Exception:
        hits_map = {}

    # Detalhar cada uma das 4 Milhares / Centenas
    items_details = []
    groups_present = []
    tens_present = []

    for idx, m in enumerate(raw_milhares, start=1):
        centena = m[-3:]
        centena_frontal = m[:3]
        ten = m[-2:]
        if ten not in tens_present:
            tens_present.append(ten)

        grp = TEN_TO_GROUP.get(ten)
        animal_info = ANIMALS.get(grp, {"name": "Desconhecido", "emoji": "❓"}) if grp else {"name": "Desconhecido", "emoji": "❓"}
        if grp and grp not in groups_present:
            groups_present.append(grp)

        # Invertidas únicas da centena
        perms = sorted(list(set(["".join(p) for p in itertools.permutations(centena, 3)])))
        inverted = [p for p in perms if p != centena]

        hit_list = hits_map.get(m, [])
        is_hit = len(hit_list) > 0

        items_details.append({
            "index": idx,
            "milhar": m,
            "centena": centena,
            "centena_frontal": centena_frontal,
            "ten": ten,
            "group": grp,
            "animal": animal_info.get("name"),
            "emoji": animal_info.get("emoji"),
            "inverted": inverted,
            "is_hit": is_hit,
            "hits": hit_list
        })

    unique_groups = sorted(list(set(groups_present)))
    unique_tens = sorted(list(set(tens_present)))

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

    steps = [
        {
            "step": 1,
            "label": "Data do Dia",
            "left_calc": f"Dia: {day_str}",
            "right_calc": f"{d1} + {d2} = {soma}",
            "result": f"Soma: {soma_str}"
        },
        {
            "step": 2,
            "label": "Milhar 1 (Central)",
            "left_calc": f"Extremos: {s1} ... {s2}",
            "right_calc": f"Meio: {day_str}",
            "result": m1
        },
        {
            "step": 3,
            "label": "Milhar 2 (Invertida)",
            "left_calc": f"Extremos: {s2} ... {s1}",
            "right_calc": f"Meio: {day_str}",
            "result": m2
        },
        {
            "step": 4,
            "label": "Milhares 3 e 4 (Frontais)",
            "left_calc": f"{soma_str} + {day_str} = {m3}",
            "right_calc": f"{s2}{s1} + {day_str} = {m4}",
            "result": f"{m3} | {m4}"
        }
    ]

    return {
        "title": "Centena Master",
        "target_date": eff_date,
        "lottery": (lottery or "RJ").upper(),
        "day": day_str,
        "sum": soma_str,
        "key": f"Data {day_str}",
        "steps": steps,
        "centenas": items_details,
        "milhares": raw_milhares,
        "total_hits_today": sum(len(hits_map.get(m, [])) for m in raw_milhares),
        "games": {
            "terno_grupo": terno_grupo,
            "duques_grupo": duques_grupo,
            "duques_dezenas": duques_dezenas,
            "terno_dezenas": terno_dezenas
        }
    }
