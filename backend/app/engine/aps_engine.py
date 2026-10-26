"""
Módulo do Método APS (Apostando com Sabedoria) para Jogo do Bicho.
Baseado na metodologia analítica do canal Apostando com Sabedoria:
1. Grade APS 5x5 Canônica (25 Bichos em 5 Linhas e 5 Colunas)
2. Monitoramento de Linhas Ausentes e Linhas Saturadas
3. Análise do Ciclo D3 (Terceiro Dia) e Janela de 5 Dias
4. Identificação das Pedras de Centena Líderes (Dígitos 0 a 9)
5. Inversão de Milhares, Dezenas de Pontas e Dezenas do Meio
6. Geração de 12 Ternos de Dezena e Fechamento 60 MC (Milhar e Centena)
"""

import math
from collections import Counter, defaultdict
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta

from ..domain import (
    ANIMALS, TEN_TO_GROUP, extract_dezena, extract_centena, extract_milhar,
    get_group_for_dezena, get_group_for_number, get_animal_info, LOTTERIES
)
from ..database import get_db_connection

# Grade 5x5 Canônica dos 25 Bichos
APS_GRID_ROWS = {
    1: [1, 2, 3, 4, 5],       # Linha 1: Avestruz, Águia, Burro, Borboleta, Cachorro
    2: [6, 7, 8, 9, 10],      # Linha 2: Cabra, Carneiro, Camelo, Cobra, Coelho
    3: [11, 12, 13, 14, 15],  # Linha 3: Cavalo, Elefante, Galo, Gato, Jacaré
    4: [16, 17, 18, 19, 20],  # Linha 4: Leão, Macaco, Porco, Pavão, Peru
    5: [21, 22, 23, 24, 25]   # Linha 5: Touro, Tigre, Urso, Veado, Vaca
}

APS_GRID_COLS = {
    1: [1, 6, 11, 16, 21],    # Coluna 1
    2: [2, 7, 12, 17, 22],    # Coluna 2
    3: [3, 8, 13, 18, 23],    # Coluna 3
    4: [4, 9, 14, 19, 24],    # Coluna 4
    5: [5, 10, 15, 20, 25]    # Coluna 5
}

GROUP_TO_ROW = {}
GROUP_TO_COL = {}
for r_idx, groups in APS_GRID_ROWS.items():
    for g in groups:
        GROUP_TO_ROW[g] = r_idx
for c_idx, groups in APS_GRID_COLS.items():
    for g in groups:
        GROUP_TO_COL[g] = c_idx


def get_aps_grid_definition() -> Dict[str, Any]:
    """Retorna a estrutura da grade 5x5 com detalhes de cada bicho."""
    grid_rows = []
    for r in range(1, 6):
        row_items = []
        for g in APS_GRID_ROWS[r]:
            info = ANIMALS.get(g, {})
            row_items.append({
                "group": g,
                "name": info.get("name", ""),
                "emoji": info.get("emoji", ""),
                "tens": info.get("tens", []),
                "row": r,
                "col": GROUP_TO_COL[g]
            })
        grid_rows.append({"row_index": r, "animals": row_items})
    return {"grid_rows": grid_rows, "rows_count": 5, "cols_count": 5}


def fetch_recent_draws_for_aps(lottery: str = "NACIONAL", limit: int = 15, before_id: Optional[int] = None) -> List[Dict[str, Any]]:
    """Busca as extrações mais recentes da loteria especificada ordenadas da mais recente para a mais antiga, opcionalmente anteriores a before_id."""
    eff_lot = (lottery or "NACIONAL").upper()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        id_cond = " AND id < ?" if before_id is not None else ""
        if eff_lot == "FEDERAL":
            query = f"SELECT * FROM draw_results WHERE (lottery = 'FEDERAL' OR slot = 'FED'){id_cond} ORDER BY draw_date DESC, id DESC LIMIT ?"
            params = ([before_id, limit] if before_id is not None else [limit])
        elif eff_lot == "RJ":
            query = f"SELECT * FROM draw_results WHERE (lottery = 'RJ' OR lottery IS NULL OR slot = 'FED'){id_cond} ORDER BY draw_date DESC, id DESC LIMIT ?"
            params = ([before_id, limit] if before_id is not None else [limit])
        else:
            query = f"SELECT * FROM draw_results WHERE lottery = ?{id_cond} ORDER BY draw_date DESC, id DESC LIMIT ?"
            params = ([eff_lot, before_id, limit] if before_id is not None else [eff_lot, limit])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        return [dict(r) for r in rows]


def analyze_aps_grid(recent_draws: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analisa a Grade 5x5 em relação aos sorteios recentes.
    Calcula ausências de linhas, ausências de colunas e saturações.
    """
    if not recent_draws:
        return {
            "rows_status": {r: {"absent_draws": 0, "status": "NEUTRO", "recent_hits": 0, "animals": [ANIMALS[g]["name"] for g in APS_GRID_ROWS[r]], "groups": APS_GRID_ROWS[r]} for r in range(1, 6)},
            "cols_status": {c: {"absent_draws": 0, "status": "NEUTRO", "recent_hits": 0, "groups": APS_GRID_COLS[c]} for c in range(1, 6)},
            "animals_status": {},
            "alert_rows": [],
            "saturated_rows": [],
            "alert_cols": []
        }

    # Contagem de hits e ausências
    row_last_seen = {r: 999 for r in range(1, 6)}
    col_last_seen = {c: 999 for c in range(1, 6)}
    row_hit_counts = Counter()
    col_hit_counts = Counter()
    animal_hit_counts = Counter()
    animal_last_seen = {g: 999 for g in range(1, 26)}

    for draw_idx, draw in enumerate(recent_draws):
        groups_in_draw = set()
        for p in range(1, 6):
            m_key = f"prize_{p}"
            val = str(draw.get(m_key) or "")
            if val and len(val) >= 2:
                g = get_group_for_number(val)
                if g:
                    groups_in_draw.add(g)
                    animal_hit_counts[g] += 1
                    if animal_last_seen[g] == 999:
                        animal_last_seen[g] = draw_idx

        rows_in_draw = {GROUP_TO_ROW[g] for g in groups_in_draw if g in GROUP_TO_ROW}
        cols_in_draw = {GROUP_TO_COL[g] for g in groups_in_draw if g in GROUP_TO_COL}

        for r in rows_in_draw:
            row_hit_counts[r] += 1
            if row_last_seen[r] == 999:
                row_last_seen[r] = draw_idx

        for c in cols_in_draw:
            col_hit_counts[c] += 1
            if col_last_seen[c] == 999:
                col_last_seen[c] = draw_idx

    total_draws = len(recent_draws)
    rows_status = {}
    alert_rows = []
    saturated_rows = []

    for r in range(1, 6):
        absent = row_last_seen[r]
        hits = row_hit_counts[r]
        if absent >= 2:
            status = "ALERTA_MAXIMO" if absent >= 3 else "ALERTA"
            alert_rows.append(r)
        elif hits >= (total_draws * 0.65):
            status = "SATURADO"
            saturated_rows.append(r)
        elif hits > 0:
            status = "QUENTE"
        else:
            status = "NEUTRO"
            
        rows_status[r] = {
            "row_index": r,
            "absent_draws": absent,
            "recent_hits": hits,
            "status": status,
            "animals": [ANIMALS[g]["name"] for g in APS_GRID_ROWS[r]],
            "groups": APS_GRID_ROWS[r]
        }

    cols_status = {}
    alert_cols = []
    for c in range(1, 6):
        absent = col_last_seen[c]
        hits = col_hit_counts[c]
        if absent >= 2:
            status = "ALERTA"
            alert_cols.append(c)
        else:
            status = "NORMAL"
        cols_status[c] = {
            "col_index": c,
            "absent_draws": absent,
            "recent_hits": hits,
            "status": status,
            "groups": APS_GRID_COLS[c]
        }

    animals_status = {}
    for g in range(1, 26):
        animals_status[g] = {
            "group": g,
            "name": ANIMALS[g]["name"],
            "emoji": ANIMALS[g]["emoji"],
            "row": GROUP_TO_ROW[g],
            "col": GROUP_TO_COL[g],
            "absent_draws": animal_last_seen[g],
            "recent_hits": animal_hit_counts[g],
            "in_alert_row": GROUP_TO_ROW[g] in alert_rows,
            "in_alert_col": GROUP_TO_COL[g] in alert_cols
        }

    return {
        "rows_status": rows_status,
        "cols_status": cols_status,
        "animals_status": animals_status,
        "alert_rows": alert_rows,
        "saturated_rows": saturated_rows,
        "alert_cols": alert_cols
    }


def analyze_pedras_centena(recent_draws: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analisa as Pedras de Centena (dígitos de 0 a 9 na 3ª casa da milhar)
    seguindo o método APS autêntico (Vácuo Diário, Atraso de Rodízio, Ciclo D3 e Anti-Saturação).
    
    Regras APS:
    1. Vácuo do Dia (Hoje): Pedras que NÃO saíram hoje têm prioridade máxima de rodízio.
    2. Histórico 3 Dias (D3 anteontem -> D2 ontem -> D1 hoje): Mostra a trajetória completa de cada pedra.
    3. Atraso Consecutivo: Quanto maior o número de sorteios sem sair no 1º ao 5º, maior a pressão estatística de retorno.
    4. Anti-Saturação: Pedras que já saíram 2+ vezes hoje sofrem penalidade por já terem pago a cota do dia.
    """
    if not recent_draws:
        return {
            "pedras_ranking": [],
            "top_pedras": [6, 8, 3],
            "pedras_frias": [],
            "pedras_quentes": [],
            "pedras_neutras": [],
            "total_analyzed": 0,
            "today_date": None,
            "d1_date": None,
            "d2_date": None,
            "d3_date": None
        }

    # Separar sorteios por data (D1 hoje, D2 ontem, D3 anteontem)
    draws_by_date = {}
    for dr in recent_draws:
        d_str = dr.get("draw_date")
        if d_str:
            draws_by_date.setdefault(d_str, []).append(dr)
    
    sorted_dates = sorted(draws_by_date.keys(), reverse=True)
    d1_date = sorted_dates[0] if len(sorted_dates) > 0 else None
    d2_date = sorted_dates[1] if len(sorted_dates) > 1 else None
    d3_date = sorted_dates[2] if len(sorted_dates) > 2 else None

    d1_counts = Counter()
    d2_counts = Counter()
    d3_counts = Counter()
    today_p1_counts = Counter()
    total_counts = Counter()
    total_p1_counts = Counter()
    absent_draws = {d: 0 for d in range(10)}
    absent_p1_draws = {d: 0 for d in range(10)}

    for dr in draws_by_date.get(d1_date, []):
        for p in range(1, 6):
            m_val = str(dr.get(f"prize_{p}") or "")
            if len(m_val) >= 3:
                pedra = int(m_val[-3])
                d1_counts[pedra] += 1
                if p == 1:
                    today_p1_counts[pedra] += 1

    for dr in draws_by_date.get(d2_date, []):
        for p in range(1, 6):
            m_val = str(dr.get(f"prize_{p}") or "")
            if len(m_val) >= 3:
                d2_counts[int(m_val[-3])] += 1

    for dr in draws_by_date.get(d3_date, []):
        for p in range(1, 6):
            m_val = str(dr.get(f"prize_{p}") or "")
            if len(m_val) >= 3:
                d3_counts[int(m_val[-3])] += 1

    # Atrasos consecutivos em sorteios
    for d in range(10):
        delay = 0
        for dr in recent_draws:
            found = False
            for p in range(1, 6):
                m_val = str(dr.get(f"prize_{p}") or "")
                if len(m_val) >= 3 and int(m_val[-3]) == d:
                    found = True
                    break
            if found:
                break
            delay += 1
        absent_draws[d] = delay

        delay_p1 = 0
        for dr in recent_draws:
            m_val = str(dr.get("prize_1") or "")
            if len(m_val) >= 3 and int(m_val[-3]) == d:
                break
            delay_p1 += 1
        absent_p1_draws[d] = delay_p1

    for dr in recent_draws:
        for p in range(1, 6):
            m_val = str(dr.get(f"prize_{p}") or "")
            if len(m_val) >= 3:
                pedra = int(m_val[-3])
                total_counts[pedra] += 1
                if p == 1:
                    total_p1_counts[pedra] += 1

    total_pedras = sum(total_counts.values()) or 1

    pedras_data = []
    for d in range(10):
        c1 = d1_counts[d]
        c2 = d2_counts[d]
        c3 = d3_counts[d]
        ad = absent_draws[d]
        ad_p1 = absent_p1_draws[d]
        pct = round((total_counts[d] / total_pedras) * 100, 1)

        # Regra de classificação D3 / D2 / D1
        if c1 == 0:
            category = "fria"
            # Se também esteve quieta no D2 ou D3, ganha bônus de vácuo acumulado
            accum_bonus = 20 if c2 <= 3 else 0
            score = 100 + (ad * 10) + ad_p1 + accum_bonus
            if c2 <= 2 and c3 <= 2:
                status = f"Super Fria ({ad} atrasos)"
            else:
                status = f"Vácuo Hoje ({ad} atrasos)"
            badge = "🧊 VÁCUO HOJE"
            recommendation = "Alvo de Rodízio / Jogar"
        elif c1 == 1:
            category = "neutra"
            score = 40 + (ad * 5)
            status = "Equilibrada (1x hoje)"
            badge = "⚪ EQUILIBRADA"
            recommendation = "Atenção Moderada"
        else:
            category = "quente"
            score = max(0, 20 - (c1 * 8))
            status = f"Saturada ({c1}x hoje)"
            badge = "🔥 SATURADA"
            recommendation = "Cota Paga / Evitar"

        pedras_data.append({
            "digit": d,
            "category": category,
            "status": status,
            "badge": badge,
            "recommendation": recommendation,
            "score": score,
            "today_count": c1,
            "today_p1_count": today_p1_counts[d],
            "d1_count": c1,
            "d2_count": c2,
            "d3_count": c3,
            "absent_draws": ad,
            "absent_p1_draws": ad_p1,
            "count": total_counts[d],
            "p1_count": total_p1_counts[d],
            "percentage": pct
        })

    pedras_ranked = sorted(pedras_data, key=lambda x: x["score"], reverse=True)
    top_pedras = [p["digit"] for p in pedras_ranked[:3]]
    
    pedras_frias = [p for p in pedras_ranked if p["category"] == "fria"]
    if not pedras_frias:
        pedras_frias = sorted(pedras_data, key=lambda x: x["absent_draws"], reverse=True)[:3]

    pedras_quentes = sorted([p for p in pedras_data if p["category"] == "quente"], key=lambda x: x["today_count"], reverse=True)
    pedras_neutras = [p for p in pedras_data if p["category"] == "neutra"]
    pedra_alerta = [p["digit"] for p in pedras_quentes[:2]] if pedras_quentes else [p["digit"] for p in pedras_ranked[-2:]]

    return {
        "pedras_ranking": pedras_ranked,
        "top_pedras": top_pedras,
        "pedras_frias": pedras_frias,
        "pedras_quentes": pedras_quentes,
        "pedras_neutras": pedras_neutras,
        "pedras_alerta": pedra_alerta,
        "total_analyzed": total_pedras,
        "today_date": d1_date,
        "d1_date": d1_date,
        "d2_date": d2_date,
        "d3_date": d3_date
    }


def analyze_d3_cycle(recent_draws: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analisa o ciclo de 3 dias (D1 hoje, D2 ontem, D3 anteontem) e 5 dias.
    Identifica bichos que apareceram no D3 e estão em ciclo de retorno.
    """
    draws_by_date = defaultdict(list)
    for draw in recent_draws:
        d_str = draw.get("draw_date")
        if d_str:
            draws_by_date[d_str].append(draw)

    sorted_dates = sorted(draws_by_date.keys(), reverse=True)
    d1_date = sorted_dates[0] if len(sorted_dates) > 0 else None
    d2_date = sorted_dates[1] if len(sorted_dates) > 1 else None
    d3_date = sorted_dates[2] if len(sorted_dates) > 2 else None

    def get_groups_for_date(date_str):
        if not date_str:
            return set()
        grps = set()
        for drw in draws_by_date[date_str]:
            for p in range(1, 6):
                val = str(drw.get(f"prize_{p}") or "")
                if len(val) >= 2:
                    g = get_group_for_number(val)
                    if g: grps.add(g)
        return grps

    d1_groups = get_groups_for_date(d1_date)
    d2_groups = get_groups_for_date(d2_date)
    d3_groups = get_groups_for_date(d3_date)

    d3_candidates = [g for g in d3_groups if g not in d1_groups]
    d3_candidates.sort()

    return {
        "d1_date": d1_date,
        "d2_date": d2_date,
        "d3_date": d3_date,
        "d3_candidates": [
            {"group": g, "name": ANIMALS[g]["name"], "emoji": ANIMALS[g]["emoji"]}
            for g in d3_candidates
        ],
        "d3_total_candidates": len(d3_candidates)
    }


def generate_aps_inversion_and_ternos(prizes: List[str], top_pedras: List[int]) -> Dict[str, Any]:
    """
    Inversão de milhares (1º ao 4º prêmio), extração de dezenas pontas/meio,
    12 Ternos de Dezena e Fechamento 60 MC.
    """
    clean_prizes = []
    for p in prizes[:4]:
        digits = "".join(filter(str.isdigit, str(p)))
        if len(digits) >= 4:
            clean_prizes.append(digits[-4:])
        elif len(digits) == 3:
            clean_prizes.append("0" + digits)

    if len(clean_prizes) < 4:
        clean_prizes += ["2050", "2560", "3643", "4384"][:4 - len(clean_prizes)]

    inverted_milhares = [m[::-1] for m in clean_prizes]

    pontas_tens = set()
    meio_tens = set()

    for m in inverted_milhares + clean_prizes:
        d_ponta_1 = m[0] + m[3]
        d_ponta_2 = m[0] + m[1]
        d_ponta_3 = m[2] + m[3]
        d_meio = m[1] + m[2]
        
        for d in [d_ponta_1, d_ponta_2, d_ponta_3]:
            if len(d) == 2:
                pontas_tens.add(d)
        if len(d_meio) == 2:
            meio_tens.add(d_meio)

    key_tens = sorted(list(pontas_tens.union(meio_tens)))

    ternos = []
    all_tens = sorted(list(pontas_tens)) + sorted(list(meio_tens))
    unique_tens = sorted(list(set(all_tens)))
    if len(unique_tens) >= 3:
        for i in range(12):
            idx1 = i % len(unique_tens)
            idx2 = (i * 2 + 1) % len(unique_tens)
            idx3 = (i * 3 + 2) % len(unique_tens)
            t_set = [unique_tens[idx1]]
            if unique_tens[idx2] not in t_set:
                t_set.append(unique_tens[idx2])
            if unique_tens[idx3] not in t_set:
                t_set.append(unique_tens[idx3])

            offset = 1
            while len(t_set) < 3 and offset < len(unique_tens) * 2:
                cand = unique_tens[(i + offset) % len(unique_tens)]
                if cand not in t_set:
                    t_set.append(cand)
                offset += 1

            fallback_tens = ["02", "34", "52", "46", "83", "05", "63"]
            for fb in fallback_tens:
                if len(t_set) >= 3:
                    break
                if fb not in t_set:
                    t_set.append(fb)

            t_set = sorted(t_set[:3])
            ternos.append(f"{t_set[0]} - {t_set[1]} - {t_set[2]}")
    else:
        ternos = [
            "02 - 34 - 52", "50 - 46 - 83", "34 - 05 - 63", "48 - 65 - 02",
            "02 - 34 - 50", "46 - 52 - 83", "02 - 50 - 83", "34 - 46 - 65",
            "06 - 48 - 52", "05 - 50 - 63", "02 - 46 - 63", "34 - 50 - 83"
        ]

    mc_list = []
    for m in inverted_milhares + clean_prizes:
        if m not in mc_list:
            mc_list.append(m)

    pedra_prefixes = [str(d) for d in top_pedras] if top_pedras else ["8", "6", "3"]
    extra_prefixes = ["0", "1", "2", "4", "5", "7", "9"]
    all_prefixes = pedra_prefixes + [p for p in extra_prefixes if p not in pedra_prefixes]

    key_centenas = set()
    for m in inverted_milhares + clean_prizes:
        key_centenas.add(m[-3:])
        key_centenas.add(m[:3])

    for c in sorted(list(key_centenas)):
        for p in all_prefixes:
            candidate = f"{p}{c}"
            if candidate not in mc_list and len(mc_list) < 60:
                mc_list.append(candidate)

    counter = 0
    while len(mc_list) < 60 and counter < 100:
        pref = all_prefixes[counter % len(all_prefixes)]
        dez = key_tens[counter % len(key_tens)] if key_tens else "50"
        cand = f"{pref}{counter % 10}{dez}"
        if cand not in mc_list:
            mc_list.append(cand)
        counter += 1

    mc_list = mc_list[:60]

    return {
        "clean_prizes": clean_prizes,
        "inverted_milhares": inverted_milhares,
        "dezenas_pontas": sorted(list(pontas_tens)),
        "dezenas_meio": sorted(list(meio_tens)),
        "ternos_12": ternos[:12],
        "fechamento_60_mc": mc_list
    }


def calculate_full_aps_analysis(lottery: str = "NACIONAL", target_date: Optional[str] = None, before_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Executa a análise completa do Método APS integrando:
    Grade 5x5, Ausências, D3, Pedras de Centena, Seleção de Elite,
    Centenas Cirúrgicas, 12 Ternos e 60 MC.
    """
    recent_draws = fetch_recent_draws_for_aps(lottery=lottery, limit=20, before_id=before_id)
    grid_analysis = analyze_aps_grid(recent_draws)
    pedras_analysis = analyze_pedras_centena(recent_draws)
    d3_analysis = analyze_d3_cycle(recent_draws)

    animal_scores = []
    top_pedras = pedras_analysis["top_pedras"]

    for g in range(1, 26):
        score = 0.0
        reasons = []
        anim_data = grid_analysis["animals_status"].get(g, {})
        row = anim_data.get("row")
        col = anim_data.get("col")

        if row in grid_analysis["alert_rows"]:
            absent_row = grid_analysis["rows_status"][row]["absent_draws"]
            pts = 35.0 + (absent_row * 3.0)
            score += pts
            reasons.append(f"Linha {row} em Alerta ({absent_row} extrações ausente)")

        d3_cand_groups = [c["group"] for c in d3_analysis["d3_candidates"]]
        if g in d3_cand_groups:
            score += 25.0
            reasons.append("Presente no ciclo do 3º Dia (D3)")

        if col in grid_analysis["alert_cols"]:
            score += 15.0
            reasons.append(f"Coluna {col} em Alerta")

        if row in grid_analysis["saturated_rows"]:
            score -= 20.0

        absent_anim = anim_data.get("absent_draws", 0)
        if absent_anim >= 5:
            score += min(15.0, absent_anim * 1.5)
            reasons.append(f"Atraso individual ({absent_anim} extrações)")

        tens = ANIMALS[g]["tens"]
        score += 10.0

        animal_scores.append({
            "group": g,
            "name": ANIMALS[g]["name"],
            "emoji": ANIMALS[g]["emoji"],
            "tens": tens,
            "row": row,
            "col": col,
            "aps_score": round(score, 1),
            "reasons": reasons
        })

    animal_scores.sort(key=lambda x: x["aps_score"], reverse=True)
    elite_animals = animal_scores[:5]

    p1 = str(top_pedras[0]) if len(top_pedras) > 0 else '8'
    p2 = str(top_pedras[1]) if len(top_pedras) > 1 else '6'
    p3 = str(top_pedras[2]) if len(top_pedras) > 2 else '3'

    centenas_cirurgicas = []
    milhares_cirurgicas = []
    for anim in elite_animals:
        tens = anim["tens"]
        anim_centenas = []
        for pedra in top_pedras:
            for d in tens:
                anim_centenas.append(f"{pedra}{d}")
        centenas_cirurgicas.append({
            "group": anim["group"],
            "name": anim["name"],
            "emoji": anim["emoji"],
            "pedras": top_pedras,
            "centenas": anim_centenas
        })

        # 4 Milhares de Elite Principais (1 por dezena cruzando com as pedras líderes do radar)
        main_milhares = [
            f"{p1}{p2}{tens[0]}",
            f"{p2}{p1}{tens[1]}",
            f"{p1}{p3}{tens[2]}",
            f"{p3}{p2}{tens[3]}"
        ]
        anim["main_milhares"] = main_milhares

        # Fechamento Completo de 8 Milhares Cirúrgicas para este bicho
        anim_milhares = []
        for pref in [f"{p1}{p2}", f"{p2}{p1}"]:
            for d in tens:
                anim_milhares.append(f"{pref}{d}")
        anim["milhares"] = anim_milhares

        milhares_cirurgicas.append({
            "group": anim["group"],
            "name": anim["name"],
            "emoji": anim["emoji"],
            "pedras": top_pedras,
            "main_milhares": main_milhares,
            "milhares": anim_milhares
        })

    last_prizes = []
    if recent_draws:
        last_d = recent_draws[0]
        for p in range(1, 5):
            val = last_d.get(f"prize_{p}")
            if val: last_prizes.append(str(val))

    inversion_data = generate_aps_inversion_and_ternos(last_prizes, top_pedras)

    return {
        "lottery": lottery,
        "target_date": target_date or datetime.now().strftime("%Y-%m-%d"),
        "grid_definition": get_aps_grid_definition(),
        "grid_analysis": grid_analysis,
        "pedras_analysis": pedras_analysis,
        "d3_cycle": d3_analysis,
        "elite_animals": elite_animals,
        "centenas_cirurgicas": centenas_cirurgicas,
        "milhares_cirurgicas": milhares_cirurgicas,
        "ternos_de_dezena_12": inversion_data["ternos_12"],
        "fechamento_60_mc": inversion_data["fechamento_60_mc"],
        "inversion_summary": {
            "clean_prizes": inversion_data["clean_prizes"],
            "inverted_milhares": inversion_data["inverted_milhares"],
            "dezenas_pontas": inversion_data["dezenas_pontas"],
            "dezenas_meio": inversion_data["dezenas_meio"]
        }
    }
