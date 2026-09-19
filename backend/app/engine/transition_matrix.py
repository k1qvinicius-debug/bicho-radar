"""
Motor de Matriz de Transição Histórica (Cadeias de Markov) para o Jogo do Bicho.
Analisa dezenas de milhares de sorteios reais para identificar padrões empíricos de transição:
Dado que saiu o Grupo A no horário anterior, qual a probabilidade condicional real
de sair o Grupo B no horário seguinte para a banca selecionada?
"""

from typing import Dict, List, Any, Optional, Tuple
from collections import Counter, defaultdict
import time
from datetime import datetime

from ..database import get_db_connection
from ..domain import ANIMALS, get_animal_info, get_group_for_number, extract_dezena, get_slot_order_weight

# Cache em memória da matriz calculada por loteria
_TRANSITION_CACHE: Dict[str, Dict[str, Any]] = {}
_CACHE_TIMESTAMP: Dict[str, float] = {}
CACHE_TTL = 300  # 5 minutos


def _build_transition_matrix_for_lottery(lottery: str = "RJ") -> Dict[str, Any]:
    """
    Varre todos os sorteios históricos ordenados cronologicamente e constrói:
    1. Transição direta por par de horários: (slot_origem, grupo_origem, slot_destino) -> Counter(grupos)
    2. Transição geral entre sorteios consecutivos: grupo_origem -> Counter(grupos)
    3. Dezenas mais quentes por transição: (grupo_origem, grupo_destino) -> Counter(dezenas)
    """
    effective_lottery = (lottery or "RJ").upper()

    with get_db_connection() as conn:
        cursor = conn.cursor()
        if effective_lottery == "FEDERAL":
            query = "SELECT draw_date, slot, prize_1 FROM draw_results WHERE (lottery = 'FEDERAL' OR slot = 'FED') ORDER BY draw_date ASC, id ASC"
            params: List[Any] = []
        elif effective_lottery == "RJ":
            query = "SELECT draw_date, slot, prize_1 FROM draw_results WHERE (lottery = 'RJ' OR lottery IS NULL OR slot = 'FED') ORDER BY draw_date ASC, id ASC"
            params = []
        else:
            query = "SELECT draw_date, slot, prize_1 FROM draw_results WHERE lottery = ? ORDER BY draw_date ASC, id ASC"
            params = [effective_lottery]

        cursor.execute(query, params)
        rows = cursor.fetchall()

    if not rows or len(rows) < 10:
        return {"transitions_slot": {}, "transitions_global": {}, "tens_matrix": {}, "total_pairs": 0}

    # Ordena rigorosamente por data e ordem de horário
    sorted_draws = [dict(r) for r in rows]
    sorted_draws.sort(key=lambda d: (d["draw_date"], get_slot_order_weight(d.get("slot"))))

    # Matrizes de contagem
    # chave: f"{slot_origem}_{grp_origem}_{slot_destino}"
    slot_transitions: Dict[str, Counter] = defaultdict(Counter)
    # chave: grp_origem
    global_transitions: Dict[int, Counter] = defaultdict(Counter)
    # chave: f"{grp_origem}_{grp_destino}" -> dezenas que saíram no 1º prêmio
    tens_transitions: Dict[str, Counter] = defaultdict(Counter)

    total_pairs = 0

    for i in range(len(sorted_draws) - 1):
        d_curr = sorted_draws[i]
        d_next = sorted_draws[i + 1]

        p1_curr = str(d_curr.get("prize_1", "")).strip().zfill(4)
        p1_next = str(d_next.get("prize_1", "")).strip().zfill(4)

        if len(p1_curr) < 2 or len(p1_next) < 2:
            continue

        g_curr = get_group_for_number(p1_curr)
        g_next = get_group_for_number(p1_next)
        dez_next = extract_dezena(p1_next)

        slot_curr = str(d_curr.get("slot", "")).strip().upper()
        slot_next = str(d_next.get("slot", "")).strip().upper()

        # 1. Transição específica por horário
        slot_key = f"{slot_curr}_{g_curr}_{slot_next}"
        slot_transitions[slot_key][g_next] += 1

        # 2. Transição geral (independente do horário)
        global_transitions[g_curr][g_next] += 1

        # 3. Dezenas mais comuns no grupo de destino
        pair_key = f"{g_curr}_{g_next}"
        tens_transitions[pair_key][dez_next] += 1

        total_pairs += 1

    result = {
        "transitions_slot": dict(slot_transitions),
        "transitions_global": dict(global_transitions),
        "tens_matrix": dict(tens_transitions),
        "total_pairs": total_pairs,
        "total_draws": len(sorted_draws)
    }

    _TRANSITION_CACHE[effective_lottery] = result
    _CACHE_TIMESTAMP[effective_lottery] = time.time()
    return result


def get_transition_analysis(
    lottery: str = "RJ",
    from_slot: Optional[str] = None,
    from_group: Optional[int] = None,
    target_slot: Optional[str] = None,
    limit: int = 5
) -> Dict[str, Any]:
    """
    Retorna os grupos e dezenas com maior probabilidade empírica de transição
    a partir do grupo e horário anterior.
    """
    effective_lottery = (lottery or "RJ").upper()

    now = time.time()
    if (
        effective_lottery not in _TRANSITION_CACHE
        or (now - _CACHE_TIMESTAMP.get(effective_lottery, 0)) > CACHE_TTL
    ):
        data = _build_transition_matrix_for_lottery(effective_lottery)
    else:
        data = _TRANSITION_CACHE[effective_lottery]

    if not from_group or from_group < 1 or from_group > 25:
        return {
            "lottery": effective_lottery,
            "has_data": False,
            "from_group": None,
            "from_slot": from_slot,
            "target_slot": target_slot,
            "top_transitions": [],
            "confidence_level": "none"
        }

    from_info = get_animal_info(from_group)

    # 1. Tenta transição específica de horário: from_slot -> target_slot
    slot_counter = Counter()
    slot_key = f"{str(from_slot).upper()}_{from_group}_{str(target_slot).upper()}"
    if from_slot and target_slot and slot_key in data.get("transitions_slot", {}):
        slot_counter = data["transitions_slot"][slot_key]

    # 2. Transição global como base principal ou suavização
    global_counter = data.get("transitions_global", {}).get(from_group, Counter())

    total_slot_samples = sum(slot_counter.values())
    total_global_samples = sum(global_counter.values())

    # Se houver pelo menos 8 amostras específicas do par de horários, combina com peso maior
    combined_scores: Dict[int, float] = {}
    for g in range(1, 26):
        # Probabilidade condicional de Poisson/Laplace smoothing
        prob_global = (global_counter[g] + 1) / (total_global_samples + 25) if total_global_samples > 0 else (1 / 25)
        if total_slot_samples >= 8:
            prob_slot = (slot_counter[g] + 1) / (total_slot_samples + 25)
            # 60% peso no horário específico + 40% histórico geral daquele animal
            p_final = (prob_slot * 0.60) + (prob_global * 0.40)
        else:
            p_final = prob_global
        combined_scores[g] = p_final

    # Ordena os grupos pela maior probabilidade de transição
    sorted_groups = sorted(combined_scores.items(), key=lambda x: x[1], reverse=True)[:limit]

    top_items = []
    tens_matrix = data.get("tens_matrix", {})

    for grp_num, prob in sorted_groups:
        anim = get_animal_info(grp_num)
        pct = round(prob * 100, 1)

        # Dezenas mais prováveis dessa transição
        pair_key = f"{from_group}_{grp_num}"
        pair_tens_counter = tens_matrix.get(pair_key, Counter())
        top_tens = [t for t, _ in pair_tens_counter.most_common(2)]
        for t in anim["tens"]:
            if t not in top_tens:
                top_tens.append(t)
        top_tens = top_tens[:3]

        occurrences = slot_counter[grp_num] if total_slot_samples >= 8 else global_counter[grp_num]

        top_items.append({
            "group": grp_num,
            "animal": anim["name"],
            "emoji": anim["emoji"],
            "probability_pct": pct,
            "occurrences": occurrences,
            "tens": anim["tens"],
            "hot_tens": top_tens,
        })

    confidence = "high" if total_slot_samples >= 15 else ("medium" if total_global_samples >= 20 else "low")

    return {
        "lottery": effective_lottery,
        "has_data": True,
        "from_group": from_group,
        "from_animal": from_info["name"],
        "from_emoji": from_info["emoji"],
        "from_slot": from_slot,
        "target_slot": target_slot,
        "sample_size": total_slot_samples if total_slot_samples >= 8 else total_global_samples,
        "confidence_level": confidence,
        "top_transitions": top_items,
        "description": f"Historicamente, após {from_info['emoji']} {from_info['name']} no {from_slot or 'sorteio anterior'}, os grupos com maior frequência no {target_slot or 'próximo'} são:"
    }
