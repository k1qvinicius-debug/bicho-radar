"""
Modulo de Calculo da Matriz 3x3 Diaria de Centenas e Milhares.
Gera a grade numerologica estruturada a partir da data (Base Dia e Base Mes)
e cruza os digitos ativos com os bichos para produzir centenas e milhares de alta assertividade.
"""

from typing import Dict, List, Any, Set, Tuple
from datetime import datetime
from ..domain import get_animal_info, ANIMALS

def build_grid(d1: int, d2: int) -> List[List[int]]:
    """Constroi a matriz 3x3 calculando os digitos e os intermediarios de distancia."""
    grid = []
    for i in range(3):
        l = (d1 + i) % 10
        r = (d2 + i) % 10
        if r > l:
            mid = (r - l - 1) % 10
        elif r < l:
            mid = ((r + 10) - l - 1) % 10
        else:
            mid = 0
        grid.append([l, mid, r])
    return grid

def extract_lines(grid: List[List[int]]) -> Dict[str, List[str]]:
    """Extrai centenas diretas e invertidas das linhas horizontais, verticais e diagonais."""
    lines = {
        "horizontais": [],
        "verticais": [],
        "diagonais": []
    }
    # Horizontais
    for r in grid:
        num = f"{r[0]}{r[1]}{r[2]}"
        inv = f"{r[2]}{r[1]}{r[0]}"
        if num not in lines["horizontais"]:
            lines["horizontais"].append(num)
        if inv not in lines["horizontais"]:
            lines["horizontais"].append(inv)

    # Verticais
    for c in range(3):
        num = f"{grid[0][c]}{grid[1][c]}{grid[2][c]}"
        inv = f"{grid[2][c]}{grid[1][c]}{grid[0][c]}"
        if num not in lines["verticais"]:
            lines["verticais"].append(num)
        if inv not in lines["verticais"]:
            lines["verticais"].append(inv)

    # Diagonais
    d1 = f"{grid[0][0]}{grid[1][1]}{grid[2][2]}"
    d1_inv = f"{grid[2][2]}{grid[1][1]}{grid[0][0]}"
    if d1 not in lines["diagonais"]:
        lines["diagonais"].append(d1)
    if d1_inv not in lines["diagonais"]:
        lines["diagonais"].append(d1_inv)

    d2 = f"{grid[0][2]}{grid[1][1]}{grid[2][0]}"
    d2_inv = f"{grid[2][0]}{grid[1][1]}{grid[0][2]}"
    if d2 not in lines["diagonais"]:
        lines["diagonais"].append(d2)
    if d2_inv not in lines["diagonais"]:
        lines["diagonais"].append(d2_inv)

    return lines

def get_matriz_dia(target_date: str = None) -> Dict[str, Any]:
    """Calcula a Matriz 3x3 completa da Data (Base Dia e Base Mes) com confluencia dos bichos."""
    if not target_date:
        target_date = datetime.now().strftime("%Y-%m-%d")

    try:
        dt = datetime.strptime(target_date, "%Y-%m-%d")
    except Exception:
        dt = datetime.now()
        target_date = dt.strftime("%Y-%m-%d")

    day_int = dt.day
    month_int = dt.month

    day_str = f"{day_int:02d}"
    month_str = f"{month_int:02d}"

    # Grid 1: Base Dia
    d1_day, d2_day = int(day_str[0]), int(day_str[1])
    grid_dia = build_grid(d1_day, d2_day)
    lines_dia = extract_lines(grid_dia)

    # Grid 2: Base Mes (Reforco)
    d1_mon, d2_mon = int(month_str[0]), int(month_str[1])
    grid_mes = build_grid(d1_mon, d2_mon)
    lines_mes = extract_lines(grid_mes)

    # Digitos unicos presentes
    digits_dia = sorted(list({digit for row in grid_dia for digit in row}))
    digits_mes = sorted(list({digit for row in grid_mes for digit in row}))
    all_digits = sorted(list(set(digits_dia + digits_mes)))

    # Centenas diretas combinadas
    direct_centenas_dia = sorted(list(set(lines_dia["horizontais"] + lines_dia["verticais"] + lines_dia["diagonais"])))
    direct_centenas_mes = sorted(list(set(lines_mes["horizontais"] + lines_mes["verticais"] + lines_mes["diagonais"])))
    all_direct_centenas = sorted(list(set(direct_centenas_dia + direct_centenas_mes)))

    # Confluência dos animais calculada para os 3 modos: Dia, Mês e Visão Integrada
    confluence_animals_dia = []
    confluence_animals_mes = []
    confluence_animals_both = []

    for grp in range(1, 26):
        confluence_animals_dia.append(_calculate_animal_matriz(
            grp, grid_dia, grid_mes, digits_dia, digits_mes, all_direct_centenas, target_date,
            mode="dia", lines_dia=lines_dia, lines_mes=lines_mes
        ))
        confluence_animals_mes.append(_calculate_animal_matriz(
            grp, grid_dia, grid_mes, digits_dia, digits_mes, all_direct_centenas, target_date,
            mode="mes", lines_dia=lines_dia, lines_mes=lines_mes
        ))
        confluence_animals_both.append(_calculate_animal_matriz(
            grp, grid_dia, grid_mes, digits_dia, digits_mes, all_direct_centenas, target_date,
            mode="both", lines_dia=lines_dia, lines_mes=lines_mes
        ))

    confluence_animals_dia.sort(key=lambda x: x["confluence_score"], reverse=True)
    confluence_animals_mes.sort(key=lambda x: x["confluence_score"], reverse=True)
    confluence_animals_both.sort(key=lambda x: x["confluence_score"], reverse=True)

    return {
        "date": target_date,
        "day": day_int,
        "month": month_int,
        "grid_dia": grid_dia,
        "grid_mes": grid_mes,
        "digits_dia": digits_dia,
        "digits_mes": digits_mes,
        "all_digits": all_digits,
        "lines_dia": lines_dia,
        "lines_mes": lines_mes,
        "direct_centenas_dia": direct_centenas_dia,
        "direct_centenas_mes": direct_centenas_mes,
        "all_direct_centenas": all_direct_centenas,
        "top_confluence_animals": confluence_animals_dia[:8],
        "all_animals_confluence": confluence_animals_dia,
        "top_confluence_animals_dia": confluence_animals_dia[:8],
        "all_animals_confluence_dia": confluence_animals_dia,
        "top_confluence_animals_mes": confluence_animals_mes[:8],
        "all_animals_confluence_mes": confluence_animals_mes,
        "top_confluence_animals_both": confluence_animals_both[:8],
        "all_animals_confluence_both": confluence_animals_both
    }

def _calculate_animal_matriz(
    group_number: int,
    grid_dia: List[List[int]],
    grid_mes: List[List[int]],
    digits_dia: List[int],
    digits_mes: List[int],
    all_direct_centenas: List[str],
    target_date: str,
    mode: str = "dia",
    lines_dia: Dict[str, List[str]] = None,
    lines_mes: Dict[str, List[str]] = None
) -> Dict[str, Any]:
    digits_dia_set = set(digits_dia)
    digits_mes_set = set(digits_mes)
    all_digits_set = digits_dia_set | digits_mes_set

    anim_info = get_animal_info(group_number)
    animal_name = anim_info["name"]
    animal_emoji = anim_info.get("emoji", "🐾")
    tens = [str(d).zfill(2) for d in anim_info["tens"]]

    if mode == "mes":
        active_grid = grid_mes
        active_digits = digits_mes
        target_digits_set = digits_mes_set
        badge_name = "🗓️ Matriz Base Mês"
        if lines_mes:
            direct_centenas_set = set(lines_mes["horizontais"] + lines_mes["verticais"] + lines_mes["diagonais"])
        else:
            direct_centenas_set = set(all_direct_centenas)

        matching_tens = []
        partial_tens = []
        for dz in tens:
            d_ten, d_unit = int(dz[0]), int(dz[1])
            if d_ten in target_digits_set and d_unit in target_digits_set:
                matching_tens.append(dz)
            elif d_ten in target_digits_set or d_unit in target_digits_set or (d_ten in all_digits_set and d_unit in all_digits_set):
                partial_tens.append(dz)

        confluence_score = (len(matching_tens) * 25.0) + (len(partial_tens) * 10.0)
        vertices = {grid_mes[0][0], grid_mes[0][2], grid_mes[2][0], grid_mes[2][2]}
        polar_main = (grid_mes[2][2], grid_mes[0][0])
        side_axis = (grid_mes[1][0], grid_mes[1][2])

    elif mode == "both":
        active_grid = grid_dia
        active_digits = sorted(list(all_digits_set))
        target_digits_set = all_digits_set
        badge_name = "✨ Matriz Integrada"
        direct_centenas_set = set(all_direct_centenas)

        matching_dia = [dz for dz in tens if int(dz[0]) in digits_dia_set and int(dz[1]) in digits_dia_set]
        matching_mes = [dz for dz in tens if int(dz[0]) in digits_mes_set and int(dz[1]) in digits_mes_set]
        matching_tens = list(dict.fromkeys(matching_dia + matching_mes))

        partial_tens = []
        for dz in tens:
            if dz not in matching_tens:
                d_ten, d_unit = int(dz[0]), int(dz[1])
                if d_ten in target_digits_set and d_unit in target_digits_set:
                    partial_tens.append(dz)
                elif d_ten in target_digits_set or d_unit in target_digits_set:
                    partial_tens.append(dz)

        # Sinergia integrada: valoriza quem conecta com ambas as matrizes simultaneamente
        base_score = (len(matching_dia) * 20.0) + (len(matching_mes) * 20.0) + (len(partial_tens) * 8.0)
        if matching_dia and matching_mes:
            base_score += 25.0  # Pontuação de ponte harmônica Dia + Mês
        confluence_score = base_score

        vertices = {
            grid_dia[0][0], grid_dia[0][2], grid_dia[2][0], grid_dia[2][2],
            grid_mes[0][0], grid_mes[0][2], grid_mes[2][0], grid_mes[2][2]
        }
        polar_main = (grid_dia[2][2], grid_dia[0][0], grid_mes[2][2], grid_mes[0][0])
        side_axis = (grid_dia[1][0], grid_dia[1][2], grid_mes[1][0], grid_mes[1][2])

    else:  # mode == "dia"
        active_grid = grid_dia
        active_digits = digits_dia
        target_digits_set = digits_dia_set
        badge_name = "⚡ Matriz Base Dia"
        if lines_dia:
            direct_centenas_set = set(lines_dia["horizontais"] + lines_dia["verticais"] + lines_dia["diagonais"])
        else:
            direct_centenas_set = set(all_direct_centenas)

        matching_tens = []
        partial_tens = []
        for dz in tens:
            d_ten, d_unit = int(dz[0]), int(dz[1])
            if d_ten in target_digits_set and d_unit in target_digits_set:
                matching_tens.append(dz)
            elif d_ten in target_digits_set or d_unit in target_digits_set or (d_ten in all_digits_set and d_unit in all_digits_set):
                partial_tens.append(dz)

        confluence_score = (len(matching_tens) * 25.0) + (len(partial_tens) * 10.0)
        vertices = {grid_dia[0][0], grid_dia[0][2], grid_dia[2][0], grid_dia[2][2]}
        polar_main = (grid_dia[2][2], grid_dia[0][0])
        side_axis = (grid_dia[1][0], grid_dia[1][2])

    centenas_by_dz: Dict[str, List[Dict[str, Any]]] = {dz: [] for dz in tens}
    all_centenas_scored = []

    grids_to_check = [active_grid] if mode != "both" else [grid_dia, grid_mes]

    for dz in tens:
        d_ten, d_unit = int(dz[0]), int(dz[1])
        is_full = dz in matching_tens
        is_partial = dz in partial_tens

        # Verifica se d_ten e d_unit estao alinhados na mesma linha ou coluna do grid
        is_aligned = False
        for g in grids_to_check:
            for r_idx in range(3):
                if d_ten in g[r_idx] and d_unit in g[r_idx]:
                    is_aligned = True
                    break
            if not is_aligned:
                for c_idx in range(3):
                    col_vals = [g[r_idx][c_idx] for r_idx in range(3)]
                    if d_ten in col_vals and d_unit in col_vals:
                        is_aligned = True
                        break
            if is_aligned:
                break

        for pref in active_digits:
            cent = f"{pref}{dz}"
            score = 15.0
            reasons = []

            if cent in direct_centenas_set:
                score += 50.0
                reasons.append("Alinhamento Direto na Matriz")

            if is_full:
                score += 25.0
                reasons.append("Dezena Formada no Grid")
            elif is_partial:
                score += 10.0
                reasons.append("Dezena Parcial no Grid")

            if is_aligned:
                score += 15.0
                reasons.append("Dezena Alinhada no Grid")

            if pref in vertices:
                score += 15.0
                reasons.append("Prefixo de Vértice")

            if pref in polar_main:
                score += 5.0
                reasons.append("Vértice Polar Principal")

            # Conexao geometrica: se o prefixo compartilha linha/coluna com os digitos da dezena
            shares_line = False
            for g in grids_to_check:
                for r_idx in range(3):
                    if pref in g[r_idx] and (d_ten in g[r_idx] or d_unit in g[r_idx]):
                        shares_line = True
                        break
                if not shares_line:
                    for c_idx in range(3):
                        col_vals = [g[r_idx][c_idx] for r_idx in range(3)]
                        if pref in col_vals and (d_ten in col_vals or d_unit in col_vals):
                            shares_line = True
                            break
                if shares_line:
                    break

            if shares_line:
                score += 12.0
                reasons.append("Conexão Geométrica no Grid")

            item = {
                "centena": cent,
                "score": score,
                "dezena": dz,
                "prefix": pref,
                "is_direct_line": cent in direct_centenas_set,
                "badge": badge_name,
                "reason": " • ".join(reasons) if reasons else "Dígitos do Grid"
            }
            centenas_by_dz[dz].append(item)
            all_centenas_scored.append(item)

    # Garante diversidade selecionando primeiro a melhor centena de cada dezena (round-robin)
    for dz in tens:
        centenas_by_dz[dz].sort(key=lambda x: x["score"], reverse=True)

    round_robin_centenas = []
    # Rodada 1: melhor de cada dezena
    for dz in tens:
        if centenas_by_dz[dz]:
            round_robin_centenas.append(centenas_by_dz[dz][0])

    # Rodada 2: segunda melhor de cada dezena
    for dz in tens:
        if len(centenas_by_dz[dz]) > 1:
            round_robin_centenas.append(centenas_by_dz[dz][1])

    round_robin_centenas.sort(key=lambda x: x["score"], reverse=True)
    unique_centenas = {}
    for c in round_robin_centenas:
        if c["centena"] not in unique_centenas:
            unique_centenas[c["centena"]] = c

    top_centenas_list = list(unique_centenas.values())[:6]

    # Gerar milhares com equilibrio entre centenas
    thousands_by_centena: Dict[str, List[Dict[str, Any]]] = {}
    for c_obj in top_centenas_list:
        c_str = c_obj["centena"]
        c_pref = int(c_str[0])
        base_score = c_obj["score"]
        c_thousands = []

        for m_pref in active_digits:
            milh = f"{m_pref}{c_str}"
            m_score = base_score + 10.0
            reasons_m = []
            if m_pref in vertices:
                m_score += 10.0
                reasons_m.append("Milhar Vértice")
            if m_pref in active_digits:
                m_score += 10.0
            if m_pref in side_axis:
                m_score += 8.0
                reasons_m.append("Eixo Central")
            # Eco da dezena na milhar (ex: 3734 - digito 3 repete dezena 34)
            if m_pref == int(c_str[1]):
                m_score += 12.0
                reasons_m.append("Eco da Dezena")
            # Sinergia milhar + centena
            if (m_pref, c_pref) in [(3, 7), (7, 3), (2, 7), (7, 2), (2, 4), (4, 2), (5, 6), (6, 5), (0, 8), (8, 0), (1, 9), (9, 1)]:
                m_score += 15.0
                reasons_m.append("Harmonia Polar")

            c_thousands.append({
                "milhar": milh,
                "centena": c_str,
                "score": m_score,
                "is_direct": c_obj["is_direct_line"]
            })

        c_thousands.sort(key=lambda x: x["score"], reverse=True)
        thousands_by_centena[c_str] = c_thousands

    selected_milhares = []
    # Pega os 2 melhores milhares de cada centena selecionada
    for c_str, m_list in thousands_by_centena.items():
        selected_milhares.extend(m_list[:2])

    selected_milhares.sort(key=lambda x: x["score"], reverse=True)
    unique_milhares = {}
    for m in selected_milhares:
        if m["milhar"] not in unique_milhares:
            unique_milhares[m["milhar"]] = m

    top_milhares_list = list(unique_milhares.values())[:8]

    return {
        "group": group_number,
        "animal": animal_name,
        "emoji": animal_emoji,
        "date": target_date,
        "mode": mode,
        "confluence_score": round(confluence_score, 1),
        "matching_tens": matching_tens,
        "partial_tens": partial_tens,
        "top_centenas": [c["centena"] for c in top_centenas_list],
        "top_centenas_details": top_centenas_list,
        "top_milhares": [m["milhar"] for m in top_milhares_list],
        "top_milhares_details": top_milhares_list,
    }

def get_animal_matriz_centenas(group_number: int, target_date: str = None, mode: str = "dia") -> Dict[str, Any]:
    """Retorna os dados da matriz para um bicho especifico de acordo com o modo (dia, mes, both)."""
    matriz = get_matriz_dia(target_date)
    mode = (mode or "dia").lower()

    if mode == "mes":
        pool = matriz.get("all_animals_confluence_mes", [])
    elif mode == "both":
        pool = matriz.get("all_animals_confluence_both", [])
    else:
        pool = matriz.get("all_animals_confluence_dia", matriz.get("all_animals_confluence", []))

    for anim in pool:
        if anim["group"] == group_number:
            anim["matriz_grid_dia"] = matriz["grid_dia"]
            anim["matriz_grid_mes"] = matriz["grid_mes"]
            anim["mode"] = mode
            return anim

    # Fallback
    return _calculate_animal_matriz(
        group_number,
        matriz["grid_dia"],
        matriz["grid_mes"],
        matriz["digits_dia"],
        matriz["digits_mes"],
        matriz["all_direct_centenas"],
        matriz["date"],
        mode=mode,
        lines_dia=matriz.get("lines_dia"),
        lines_mes=matriz.get("lines_mes")
    )
