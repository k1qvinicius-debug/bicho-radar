"""
Módulo de Análise Estatística do Jogo do Bicho.
Processa histórico de sorteios, calcula frequências, atrasos, tendências ponderadas no tempo,
afinidades por horário e dia, gerando pontuações transparentes e explicabilidade para:
- Grupos (1 a 25)
- Dezenas (00 a 99)
- Centenas (000 a 999)
- Milhares (0000 a 9999)
"""

import math
import itertools
from copy import copy
from collections import defaultdict, Counter
from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime

from ..domain import (
    ANIMALS, TEN_TO_GROUP, STANDARD_SLOTS,
    extract_dezena, extract_centena, extract_milhar,
    get_group_for_dezena, get_group_for_number, get_animal_info
)
from ..models import RankedItem, FactorItem, PredictionOutput, WeightsConfigModel
from ..database import get_db_connection
from .weights import get_active_weights


class StatisticalEngine:
    def __init__(self, weights: Optional[WeightsConfigModel] = None):
        self.weights = weights or get_active_weights()

    def fetch_historical_draws(
        self,
        cutoff_date: Optional[str] = None,
        cutoff_slot: Optional[str] = None,
        lottery: Optional[str] = "RJ"
    ) -> List[Dict[str, Any]]:
        """
        Recupera sorteios históricos ordenados cronologicamente do mais antigo para o mais recente.
        Permite ponto de corte para testes retroativos (backtesting) e filtro estrito por loteria.
        """
        effective_lottery = (lottery or "RJ").upper()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if effective_lottery == "FEDERAL":
                query = "SELECT * FROM draw_results WHERE (lottery = 'FEDERAL' OR slot = 'FED')"
                params = []
            elif effective_lottery == "RJ":
                query = "SELECT * FROM draw_results WHERE (lottery = 'RJ' OR lottery IS NULL OR slot = 'FED')"
                params = []
            else:
                query = "SELECT * FROM draw_results WHERE lottery = ?"
                params = [effective_lottery]

            if cutoff_date:
                query += " AND draw_date <= ?"
                params.append(cutoff_date)

            query += " ORDER BY draw_date ASC"
            cursor.execute(query, params)
            rows = cursor.fetchall()
            from ..domain import get_slot_order_weight
            results = [dict(r) for r in rows]
            results.sort(key=lambda d: (d["draw_date"], get_slot_order_weight(d.get("slot"))))

            if cutoff_date and cutoff_slot:
                cutoff_weight = get_slot_order_weight(cutoff_slot)
                results = [
                    d for d in results
                    if d["draw_date"] < cutoff_date or (d["draw_date"] == cutoff_date and get_slot_order_weight(d.get("slot")) < cutoff_weight)
                ]

            return results

    def analyze(
        self,
        target_date: str,
        target_slot: str,
        custom_weights: Optional[WeightsConfigModel] = None,
        strategy: str = "hybrid",
        lottery: str = "RJ",
    ) -> PredictionOutput:
        """
        Executa a análise estatística completa para o próximo horário/data especificado,
        calibrada de acordo com o perfil/estratégia de jogo selecionado e loteria ativa:
        - hybrid: Portfólio equilibrado anti-aleatoriedade com fechamento multi-origem.
        - frequency: Foco extremo em frequência recente e momentum.
        - delay: Foco extremo em grupos e dezenas atrasadas.
        - puxada: Foco na reação em cadeia do último 1º prêmio apurado.
        """
        from ..domain import get_lottery_info, get_lottery_slots

        effective_lottery = (lottery or "RJ").upper()
        lot_info = get_lottery_info(effective_lottery)
        lot_slots = get_lottery_slots(effective_lottery)
        slot_info = next((s for s in lot_slots if s["code"] == target_slot), {"name": target_slot})

        weights = copy(custom_weights or self.weights)
        if strategy == "frequency":
            weights.weight_frequency_recent = 50.0
            weights.weight_frequency_total = 30.0
            weights.weight_delay = 10.0
            weights.weight_repetition = 10.0
        elif strategy == "delay":
            weights.weight_delay = 70.0
            weights.weight_frequency_recent = 15.0
            weights.weight_frequency_total = 10.0
            weights.weight_repetition = 5.0
        elif strategy == "puxada":
            weights.weight_repetition = 15.0
            weights.weight_delay = 20.0
            weights.weight_frequency_recent = 25.0

        draws = self.fetch_historical_draws(cutoff_date=target_date, cutoff_slot=target_slot, lottery=effective_lottery)
        total_draws = len(draws)

        # Dia da semana alvo (0=Segunda ... 6=Domingo)
        target_dt = datetime.strptime(target_date, "%Y-%m-%d")
        target_day_of_week = target_dt.weekday()

        if total_draws == 0:
            return PredictionOutput(
                target_date=target_date,
                target_slot=target_slot,
                target_slot_name=slot_info.get("name", target_slot),
                lottery=lot_info["code"],
                lottery_name=lot_info["name"],
                weights_summary={
                    "frequency_total": weights.weight_frequency_total,
                    "frequency_recent": weights.weight_frequency_recent,
                    "delay": weights.weight_delay,
                    "slot_affinity": weights.weight_slot_affinity,
                    "repetition": weights.weight_repetition,
                    "day_of_week": weights.weight_day_of_week,
                },
                total_draws_analyzed=0,
                top_groups=[],
                top_tens=[],
                top_hundreds=[],
                top_thousands=[],
                strategy=strategy,
            )

        # 1. Análise de Grupos
        top_groups = self._analyze_groups(draws, target_slot, target_day_of_week, weights, target_date, strategy=strategy)

        # 2. Análise de Dezenas
        top_tens = self._analyze_tens(draws, target_slot, target_day_of_week, weights, top_groups, target_date=target_date)

        # 3. Análise de Centenas
        top_hundreds = self._analyze_hundreds(draws, target_slot, weights, top_tens)

        # 4. Análise de Milhares
        top_thousands = self._analyze_thousands(draws, target_slot, weights, top_hundreds, top_tens, target_date)

        # 5. Gerador de Combinações de Duque de Dezena (DDZ Combinado)
        ddz_combos = self._generate_ddz_combinations(top_tens)

        # 6. Fechamento Híbrido Anti-Aleatoriedade
        hybrid_combo = self._generate_hybrid_combo(top_groups, top_tens, target_date, target_slot, draws)

        # 7. Resumo de Quadrantes das dezenas analisadas
        low_count = sum(1 for t in top_tens[:10] if int(t.value) < 50)
        high_count = sum(1 for t in top_tens[:10] if int(t.value) >= 50)
        quadrant_summary = {
            "low_tens_count": low_count,
            "high_tens_count": high_count,
            "balance_status": "Equilibrado (Baixa + Alta)" if (low_count >= 3 and high_count >= 3) else ("Predomínio Faixa Baixa (00-49)" if low_count > high_count else "Predomínio Faixa Alta (50-99)")
        }

        return PredictionOutput(
            target_date=target_date,
            target_slot=target_slot,
            target_slot_name=slot_info.get("name", target_slot),
            lottery=lot_info["code"],
            lottery_name=lot_info["name"],
            weights_summary={
                "frequency_total": weights.weight_frequency_total,
                "frequency_recent": weights.weight_frequency_recent,
                "delay": weights.weight_delay,
                "slot_affinity": weights.weight_slot_affinity,
                "repetition": weights.weight_repetition,
                "day_of_week": weights.weight_day_of_week,
            },
            total_draws_analyzed=total_draws,
            top_groups=top_groups[: weights.top_groups_count],
            top_tens=top_tens[: weights.top_tens_count],
            top_hundreds=top_hundreds[: weights.top_hundreds_count],
            top_thousands=top_thousands[: weights.top_thousands_count],
            ddz_combos=ddz_combos,
            strategy=strategy,
            hybrid_combo=hybrid_combo,
            quadrant_summary=quadrant_summary,
        )

    def _generate_ddz_combinations(self, top_tens: List[RankedItem]) -> List[Dict[str, Any]]:
        """
        Gera combinações estatísticas de Duque de Dezena Combinado (DDZ - 1º ao 5º).
        Monta cercos inteligentes com 4, 5 e 6 dezenas para máxima probabilidade de acerto.
        """
        import itertools
        if not top_tens:
            return []

        distinct_tens_items: List[RankedItem] = []
        seen_tens = set()
        for t in top_tens:
            if t.value not in seen_tens:
                seen_tens.add(t.value)
                distinct_tens_items.append(t)
            if len(distinct_tens_items) >= 6:
                break

        pool = [t.value for t in distinct_tens_items]
        if len(pool) < 4:
            return []

        combos = []

        # 1. Combo 4 Dezenas (Cerco Essencial - 6 Duques)
        c4_tens = pool[:4]
        c4_raw_pairs = list(itertools.combinations(c4_tens, 2))
        c4_duques = [[p[0], p[1]] for p in c4_raw_pairs]
        c4_pairs = [f"{p[0]}-{p[1]}" for p in c4_raw_pairs]
        c4_animals = list(dict.fromkeys([t.animal_name for t in distinct_tens_items[:4] if t.animal_name]))
        combos.append({
            "type": "c4",
            "name": "Cerco Essencial (4 Dezenas)",
            "short_name": "4 Dezenas (6 Duques)",
            "tens_count": 4,
            "duques_count": len(c4_duques),
            "tens": c4_tens,
            "tens_formatted": " - ".join(c4_tens),
            "duques": c4_duques,
            "pairs": c4_pairs,
            "pairs_formatted": ", ".join(c4_pairs),
            "animals": c4_animals,
            "animals_formatted": ", ".join(c4_animals),
            "investment_suggested_brl": round(len(c4_duques) * 1.0, 2),
            "estimated_prize_brl": 300.0,
            "suggested_bet": "R$ 1,00 / duque (R$ 6,00 total)",
            "prize_est": "R$ 300,00",
            "description": "Combina as 4 dezenas mais quentes em 6 duques fechados do 1º ao 5º.",
            "recommended": False
        })

        # 2. Combo 5 Dezenas (Super Cerco - 10 Duques - RECOMENDADO)
        if len(pool) >= 5:
            c5_tens = pool[:5]
            c5_raw_pairs = list(itertools.combinations(c5_tens, 2))
            c5_duques = [[p[0], p[1]] for p in c5_raw_pairs]
            c5_pairs = [f"{p[0]}-{p[1]}" for p in c5_raw_pairs]
            c5_animals = list(dict.fromkeys([t.animal_name for t in distinct_tens_items[:5] if t.animal_name]))
            combos.append({
                "type": "c5",
                "name": "Super Cerco (5 Dezenas)",
                "short_name": "5 Dezenas (10 Duques)",
                "tens_count": 5,
                "duques_count": len(c5_duques),
                "tens": c5_tens,
                "tens_formatted": " - ".join(c5_tens),
                "duques": c5_duques,
                "pairs": c5_pairs,
                "pairs_formatted": ", ".join(c5_pairs),
                "animals": c5_animals,
                "animals_formatted": ", ".join(c5_animals),
                "investment_suggested_brl": round(len(c5_duques) * 1.0, 2),
                "estimated_prize_brl": 300.0,
                "suggested_bet": "R$ 1,00 / duque (R$ 10,00 total)",
                "prize_est": "R$ 300,00",
                "description": "Super cerco equilibrado combinando as 5 dezenas mais quentes em 10 duques.",
                "recommended": True
            })

        # 3. Combo 6 Dezenas (Cerco Máximo - 15 Duques)
        if len(pool) >= 6:
            c6_tens = pool[:6]
            c6_raw_pairs = list(itertools.combinations(c6_tens, 2))
            c6_duques = [[p[0], p[1]] for p in c6_raw_pairs]
            c6_pairs = [f"{p[0]}-{p[1]}" for p in c6_raw_pairs]
            c6_animals = list(dict.fromkeys([t.animal_name for t in distinct_tens_items[:6] if t.animal_name]))
            combos.append({
                "type": "c6",
                "name": "Cerco Máximo (6 Dezenas)",
                "short_name": "6 Dezenas (15 Duques)",
                "tens_count": 6,
                "duques_count": len(c6_duques),
                "tens": c6_tens,
                "tens_formatted": " - ".join(c6_tens),
                "duques": c6_duques,
                "pairs": c6_pairs,
                "pairs_formatted": ", ".join(c6_pairs),
                "animals": c6_animals,
                "animals_formatted": ", ".join(c6_animals),
                "investment_suggested_brl": round(len(c6_duques) * 1.0, 2),
                "estimated_prize_brl": 300.0,
                "suggested_bet": "R$ 1,00 / duque (R$ 15,00 total)",
                "prize_est": "R$ 300,00",
                "description": "Cobertura máxima de cercado combinando as 6 dezenas de maior momentum em 15 duques.",
                "recommended": False
            })

        return combos

    def _generate_hybrid_combo(
        self,
        top_groups: List[RankedItem],
        top_tens: List[RankedItem],
        target_date: str,
        target_slot: str,
        draws: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Gera o Fechamento Híbrido Anti-Aleatoriedade.
        Combina dezenas de 4 origens estatísticas independentes:
        1. 🧲 Puxada Tradicional (animal atraído pelo último 1º prêmio)
        2. ✨ Cruz do Dia (numerologia da data)
        3. 🕒 Atraso Crítico (dezena mais atrasada)
        4. 🔥 Alta Frequência (dezena com maior momentum recente)
        5. ⚖️ Balanceamento de Quadrantes (garante Baixa [00-49] e Alta [50-99])
        """
        from .cruz_engine import get_cruz_do_dia
        from .puxadas_engine import PUXADAS_TABLE

        selected_items: List[Dict[str, Any]] = []
        used_tens = set()

        # 1. Puxada do último 1º prêmio
        puxada_ten = None
        if draws:
            last_p1 = draws[0].get("prize_1", "")
            if last_p1:
                last_g1 = get_group_for_number(last_p1)
                pulled_groups = PUXADAS_TABLE.get(last_g1, [])
                for t in top_tens:
                    if t.group_number in pulled_groups and t.value not in used_tens:
                        puxada_ten = t
                        break
                if not puxada_ten and pulled_groups:
                    target_g = pulled_groups[0]
                    anim_inf = get_animal_info(target_g)
                    t_val = anim_inf["tens"][0]
                    puxada_ten = RankedItem(
                        value=t_val,
                        display_name=f"Dezena {t_val} ({anim_inf['name']})",
                        score=60.0,
                        group_number=target_g,
                        animal_name=anim_inf["name"],
                        animal_emoji=anim_inf["emoji"]
                    )
        if puxada_ten:
            used_tens.add(puxada_ten.value)
            selected_items.append({
                "value": puxada_ten.value,
                "origin": "puxada",
                "badge": "🧲 Puxada",
                "group_number": puxada_ten.group_number,
                "animal_name": puxada_ten.animal_name,
                "animal_emoji": puxada_ten.animal_emoji or "🐾",
                "reason": f"Puxado pelo último 1º prêmio ({puxada_ten.animal_name})"
            })

        # 2. Cruz do Dia
        cruz_ten = None
        try:
            cruz_data = get_cruz_do_dia(target_date)
            cruz_animals = cruz_data.get("animals", [])
            cruz_groups = {a["group"] for a in cruz_animals}
            cruz_tens_set = set()
            for a in cruz_animals:
                for t_val in a.get("tens", []):
                    cruz_tens_set.add(t_val)
            for t in top_tens:
                if (t.group_number in cruz_groups or t.value in cruz_tens_set) and t.value not in used_tens:
                    cruz_ten = t
                    break
            if not cruz_ten and cruz_tens_set:
                avail_t = [t for t in cruz_tens_set if t not in used_tens]
                if avail_t:
                    t_val = avail_t[0]
                    grp = get_group_for_dezena(t_val)
                    anim_inf = get_animal_info(grp)
                    cruz_ten = RankedItem(
                        value=t_val,
                        display_name=f"Dezena {t_val} ({anim_inf['name']})",
                        score=60.0,
                        group_number=grp,
                        animal_name=anim_inf["name"],
                        animal_emoji=anim_inf["emoji"]
                    )
        except Exception:
            pass

        if cruz_ten:
            used_tens.add(cruz_ten.value)
            selected_items.append({
                "value": cruz_ten.value,
                "origin": "cruz",
                "badge": "✨ Cruz do Dia",
                "group_number": cruz_ten.group_number,
                "animal_name": cruz_ten.animal_name,
                "animal_emoji": cruz_ten.animal_emoji or "🐾",
                "reason": "Numerologia da data (Cruz do Dia)"
            })

        # 3. Atraso Crítico
        delay_ten = None
        sorted_by_delay = sorted(
            top_tens,
            key=lambda t: t.metadata.get("delay_draws_all", 0) if t.metadata else 0,
            reverse=True
        )
        for t in sorted_by_delay:
            if t.value not in used_tens:
                delay_ten = t
                break
        if delay_ten:
            used_tens.add(delay_ten.value)
            del_val = delay_ten.metadata.get("delay_draws_all", 0) if delay_ten.metadata else 0
            selected_items.append({
                "value": delay_ten.value,
                "origin": "delay",
                "badge": "🕒 Atraso Crítico",
                "group_number": delay_ten.group_number,
                "animal_name": delay_ten.animal_name,
                "animal_emoji": delay_ten.animal_emoji or "🐾",
                "reason": f"Alta pressão acumulada (~{del_val} sorteios sem sair)"
            })

        # 4. Alta Frequência
        freq_ten = None
        for t in top_tens:
            if t.value not in used_tens:
                freq_ten = t
                break
        if freq_ten:
            used_tens.add(freq_ten.value)
            pct = freq_ten.metadata.get("presence_pct", 0) if freq_ten.metadata else 0
            selected_items.append({
                "value": freq_ten.value,
                "origin": "frequency",
                "badge": "🔥 Alta Frequência",
                "group_number": freq_ten.group_number,
                "animal_name": freq_ten.animal_name,
                "animal_emoji": freq_ten.animal_emoji or "🐾",
                "reason": f"Líder de momentum recente ({pct}% no cercado)"
            })

        # 5. Balanceamento de Quadrantes (Baixa 00-49 vs Alta 50-99)
        lows = [it for it in selected_items if int(it["value"]) < 50]
        highs = [it for it in selected_items if int(it["value"]) >= 50]

        target_quadrant = None
        if not lows:
            target_quadrant = "low"
        elif not highs:
            target_quadrant = "high"

        quadrant_ten = None
        if target_quadrant:
            for t in top_tens:
                t_int = int(t.value)
                if t.value not in used_tens:
                    if target_quadrant == "low" and t_int < 50:
                        quadrant_ten = t
                        break
                    elif target_quadrant == "high" and t_int >= 50:
                        quadrant_ten = t
                        break

        if not quadrant_ten:
            for t in top_tens:
                if t.value not in used_tens:
                    quadrant_ten = t
                    break

        if quadrant_ten and len(selected_items) < 5:
            used_tens.add(quadrant_ten.value)
            q_label = "Baixa (00-49)" if int(quadrant_ten.value) < 50 else "Alta (50-99)"
            selected_items.append({
                "value": quadrant_ten.value,
                "origin": "quadrant",
                "badge": "⚖️ Quadrante " + q_label.split()[0],
                "group_number": quadrant_ten.group_number,
                "animal_name": quadrant_ten.animal_name,
                "animal_emoji": quadrant_ten.animal_emoji or "🐾",
                "reason": f"Equilíbrio de faixa ({q_label})"
            })

        for t in top_tens:
            if len(selected_items) >= 5:
                break
            if t.value not in used_tens:
                used_tens.add(t.value)
                selected_items.append({
                    "value": t.value,
                    "origin": "complementary",
                    "badge": "🎯 Apoio Técnico",
                    "group_number": t.group_number,
                    "animal_name": t.animal_name,
                    "animal_emoji": t.animal_emoji or "🐾",
                    "reason": "Reforço estatístico"
                })

        # Gera combinações de 2 (10 duques)
        pairs = list(itertools.combinations(selected_items, 2))
        duques = []
        for idx, (item1, item2) in enumerate(pairs, start=1):
            val1, val2 = item1["value"], item2["value"]
            i1, i2 = int(val1), int(val2)
            if (i1 < 50 and i2 >= 50) or (i1 >= 50 and i2 < 50):
                q_type = "Baixa + Alta"
                q_badge = "Equilíbrio Perfeito"
            elif i1 < 50 and i2 < 50:
                q_type = "Baixa + Baixa"
                q_badge = "Faixa 00-49"
            else:
                q_type = "Alta + Alta"
                q_badge = "Faixa 50-99"

            duques.append({
                "order": idx,
                "tens": [val1, val2],
                "tens_formatted": f"{val1} - {val2}",
                "origins": [item1["origin"], item2["origin"]],
                "origins_label": f"{item1['badge']} + {item2['badge']}",
                "animals_label": f"{item1['animal_emoji']} {item1['animal_name']} + {item2['animal_emoji']} {item2['animal_name']}",
                "quadrant_type": q_type,
                "quadrant_badge": q_badge
            })

        return {
            "name": "Fechamento Híbrido Anti-Aleatoriedade",
            "subtitle": "Diversificação estatística com dezenas de 4 fontes independentes",
            "tens_count": len(selected_items),
            "tens_items": selected_items,
            "tens": [it["value"] for it in selected_items],
            "tens_formatted": " - ".join([it["value"] for it in selected_items]),
            "duques_count": len(duques),
            "duques": duques,
            "investment_suggested_brl": round(len(duques) * 1.0, 2),
            "estimated_prize_brl": 300.0,
            "description": "Combina Puxada do último 1º prêmio, Cruz do Dia, Atraso Crítico e Alta Frequência, cruzando dezenas baixas e altas para máxima segurança contra quebras de padrão."
        }

    def generate_fixed_animal_combo(
        self,
        group_number: int,
        target_date: Optional[str] = None,
        target_slot: Optional[str] = None,
        lottery: str = "RJ",
    ) -> Dict[str, Any]:
        """
        Gera fechamento inteligente travando 1 animal escolhido pelo usuário
        e completando com as 3 melhores dezenas complementares (puxada/quadrante/frequência).
        """
        if not (1 <= group_number <= 25):
            group_number = 1

        date_str = target_date or datetime.now().strftime("%Y-%m-%d")
        slot_str = target_slot or "PT"
        pred = self.analyze(target_date=date_str, target_slot=slot_str, lottery=lottery)

        anim_fixed = get_animal_info(group_number)
        fixed_tens = anim_fixed["tens"]

        ranked_tens_for_grp = [t.value for t in pred.top_tens if t.group_number == group_number]
        chosen_fixed = []
        for t in ranked_tens_for_grp:
            if t not in chosen_fixed:
                chosen_fixed.append(t)
            if len(chosen_fixed) >= 2:
                break
        for t in fixed_tens:
            if t not in chosen_fixed:
                chosen_fixed.append(t)
            if len(chosen_fixed) >= 2:
                break

        is_fixed_low = any(int(t) < 50 for t in chosen_fixed)
        complementary: List[RankedItem] = []

        # 1. Pega 1 dezena do quadrante oposto
        for t in pred.top_tens:
            if t.group_number != group_number:
                t_int = int(t.value)
                if is_fixed_low and t_int >= 50:
                    complementary.append(t)
                    break
                elif not is_fixed_low and t_int < 50:
                    complementary.append(t)
                    break

        # 2. Pega 2 outras dezenas de maior pontuação
        for t in pred.top_tens:
            if t.group_number != group_number and t.value not in [c.value for c in complementary]:
                complementary.append(t)
            if len(complementary) >= 3:
                break

        all_selected_tens = chosen_fixed + [c.value for c in complementary]
        all_selected_tens = list(dict.fromkeys(all_selected_tens))[:5]

        raw_pairs = list(itertools.combinations(all_selected_tens, 2))
        duques = []
        for p in raw_pairs:
            has_fixed = any(t in chosen_fixed for t in p)
            duques.append({
                "tens": [p[0], p[1]],
                "tens_formatted": f"{p[0]} - {p[1]}",
                "has_fixed_animal": has_fixed
            })

        return {
            "fixed_group": group_number,
            "animal_name": anim_fixed["name"],
            "animal_emoji": anim_fixed["emoji"],
            "fixed_tens": chosen_fixed,
            "complementary_tens": [c.value for c in complementary],
            "all_tens": all_selected_tens,
            "tens_formatted": " - ".join(all_selected_tens),
            "duques": duques,
            "duques_count": len(duques),
            "investment_suggested_brl": round(len(duques) * 1.0, 2),
            "estimated_prize_brl": 300.0,
            "description": f"Fechamento com {anim_fixed['emoji']} {anim_fixed['name']} fixo + 3 dezenas complementares de alta probabilidade do 1º ao 5º."
        }

    def _analyze_groups(
        self,
        draws: List[Dict[str, Any]],
        target_slot: str,
        target_day: int,
        w: WeightsConfigModel,
        target_date: Optional[str] = None,
        strategy: str = "hybrid",
    ) -> List[RankedItem]:
        total_draws = len(draws)
        count_1st = Counter()
        count_all = Counter()
        slot_count_1st = Counter()
        slot_total_draws = 0
        day_count_1st = Counter()
        day_total_draws = 0

        reversed_draws = list(reversed(draws))
        last_seen_1st: Dict[int, int] = {}
        last_seen_all: Dict[int, int] = {}
        decay_scores: Dict[int, float] = defaultdict(float)
        recent_30_count_all: Counter = Counter()

        decay_rate = w.recent_decay_rate

        for idx, d in enumerate(reversed_draws):
            g1 = get_group_for_number(d["prize_1"])
            g_all = {
                get_group_for_number(d["prize_1"]),
                get_group_for_number(d["prize_2"]),
                get_group_for_number(d["prize_3"]),
                get_group_for_number(d["prize_4"]),
                get_group_for_number(d["prize_5"]),
            }

            if idx < 30:
                for g in g_all:
                    recent_30_count_all[g] += 1

            if g1 not in last_seen_1st:
                last_seen_1st[g1] = idx

            for g in g_all:
                if g not in last_seen_all:
                    last_seen_all[g] = idx

            time_weight = math.exp(-decay_rate * idx)
            decay_scores[g1] += time_weight * 1.5
            for g in g_all:
                decay_scores[g] += time_weight * 0.5

            count_1st[g1] += 1
            for g in g_all:
                count_all[g] += 1

            if d["slot"] == target_slot:
                slot_total_draws += 1
                slot_count_1st[g1] += 1

            if d.get("day_of_week") == target_day:
                day_total_draws += 1
                day_count_1st[g1] += 1

        last_draw = draws[-1] if draws else {}
        last_g1 = get_group_for_number(last_draw["prize_1"]) if last_draw else 0
        last_g_all = {get_group_for_number(last_draw[f"prize_{i}"]) for i in range(1, 6)} if last_draw else set()

        # Busca ranking oficial de atrasados do Bicho Certo RJ (dias x 6 sorteios)
        try:
            from .bichocerto_scraper import get_cached_bichocerto_atrasados
            bc_list = get_cached_bichocerto_atrasados()
            bc_data = {item["group_number"]: item for item in bc_list}
        except Exception:
            bc_data = {}

        # Busca Cruz do Dia para a data analisada
        try:
            from .cruz_engine import get_cruz_do_dia
            cruz_data = get_cruz_do_dia(target_date)
            cruz_animals_map = {a["group"]: a for a in cruz_data.get("animals", [])}
            cruz_bicho_dia = cruz_data.get("bicho_do_dia", {}).get("group")
        except Exception:
            cruz_animals_map = {}
            cruz_bicho_dia = None

        # Busca Puxadas Tradicionais do último 1º prêmio
        try:
            from .puxadas_engine import PUXADAS_TABLE
            puxados_pelo_ultimo = PUXADAS_TABLE.get(last_g1, [])
            last_g1_info = get_animal_info(last_g1) if last_g1 else None
        except Exception:
            puxados_pelo_ultimo = []
            last_g1_info = None

        group_items: List[RankedItem] = []

        for g in range(1, 26):
            bc_info = bc_data.get(g)
            if bc_info:
                # Utiliza o atraso oficial do Bicho Certo (dias * 6 sorteios diários)
                delay_1 = bc_info["delay_draws_est"]
            else:
                delay_1 = last_seen_1st.get(g, total_draws)
            delay_all = last_seen_all.get(g, total_draws)

            freq_1 = count_1st[g] / max(total_draws, 1)
            score_freq_tot = min(100.0, (freq_1 / 0.04) * 40.0)

            max_decay_theoretical = (1.5 + 0.5) / (1.0 - math.exp(-decay_rate)) if decay_rate > 0 else 10.0
            score_freq_rec = min(100.0, (decay_scores[g] / max_decay_theoretical) * 150.0)

            delay_ratio = delay_1 / 25.0
            score_delay = min(100.0, (delay_ratio * 45.0) + (delay_all / 5.0 * 15.0))

            if slot_total_draws > 0:
                slot_freq = slot_count_1st[g] / slot_total_draws
                score_slot = min(100.0, (slot_freq / 0.04) * 40.0)
            else:
                score_slot = 50.0

            score_rep = 0.0
            if g == last_g1:
                score_rep += 60.0
            elif g in last_g_all:
                score_rep += 35.0

            if day_total_draws > 0:
                day_freq = day_count_1st[g] / day_total_draws
                score_day = min(100.0, (day_freq / 0.04) * 40.0)
            else:
                score_day = 50.0

            total_weight = (
                w.weight_frequency_total +
                w.weight_frequency_recent +
                w.weight_delay +
                w.weight_slot_affinity +
                w.weight_repetition +
                w.weight_day_of_week
            ) or 1.0

            weighted_sum = (
                (score_freq_tot * w.weight_frequency_total) +
                (score_freq_rec * w.weight_frequency_recent) +
                (score_delay * w.weight_delay) +
                (score_slot * w.weight_slot_affinity) +
                (score_rep * w.weight_repetition) +
                (score_day * w.weight_day_of_week)
            )
            final_score = round(weighted_sum / total_weight, 1)

            factors: List[FactorItem] = []
            if bc_info and bc_info["delay_days"] >= 2:
                d_days = bc_info["delay_days"]
                d_draws = bc_info["delay_draws_est"]
                r_pos = bc_info["ranking_pos"]
                factors.append(FactorItem(
                    name=f"Animal Mais Atrasado (#{r_pos})",
                    description=f"Atrasado há {d_days} dias (~{d_draws} sorteios no 1º prêmio)",
                    impact_points=round(score_delay * (w.weight_delay / total_weight), 1),
                    type="positive" if d_draws >= 25 else "neutral"
                ))
            elif delay_1 >= 15:
                factors.append(FactorItem(
                    name="Atraso Elevado",
                    description=f"Atrasado há {delay_1} sorteios no 1º prêmio (esperado médio: 25)",
                    impact_points=round(score_delay * (w.weight_delay / total_weight), 1),
                    type="positive" if delay_1 >= 25 else "neutral"
                ))
            if score_slot >= 55.0 and slot_total_draws >= 5:
                factors.append(FactorItem(
                    name=f"Afinidade com {target_slot}",
                    description=f"{slot_count_1st[g]} ocorrências no 1º prêmio neste horário ({round(slot_count_1st[g]/slot_total_draws*100, 1)}%)",
                    impact_points=round(score_slot * (w.weight_slot_affinity / total_weight), 1),
                    type="positive"
                ))
            if decay_scores[g] >= 1.2:
                factors.append(FactorItem(
                    name="Tendência Recente Forte",
                    description="Presença frequente e concentrada nos últimos sorteios",
                    impact_points=round(score_freq_rec * (w.weight_frequency_recent / total_weight), 1),
                    type="positive"
                ))
            if g == last_g1:
                factors.append(FactorItem(
                    name="Repetição Consecutiva",
                    description="Saiu no 1º prêmio do sorteio anterior (ciclo de repetição)",
                    impact_points=round(score_rep * (w.weight_repetition / total_weight), 1),
                    type="neutral"
                ))
            elif g in last_g_all:
                factors.append(FactorItem(
                    name="Ciclo de Cercado Ativo",
                    description="Saiu entre o 2º e 5º prêmio no último sorteio",
                    impact_points=round(score_rep * (w.weight_repetition / total_weight), 1),
                    type="neutral"
                ))

            anim = get_animal_info(g)

            # Bônus de Cruz do Dia e Bicho do Dia
            is_bicho_dia = (g == cruz_bicho_dia)
            cruz_item = cruz_animals_map.get(g)
            if is_bicho_dia or cruz_item:
                if is_bicho_dia:
                    bonus = 35.0
                    tens_str = ", ".join(cruz_item["tens"]) if cruz_item else ", ".join(anim["tens"])
                    final_score = round(final_score + bonus, 1)
                    factors.append(FactorItem(
                        name="Bicho do Dia (Cruz)",
                        description=f"Destaque Máximo do Dia pela Cruz numerológica (+{bonus} pts) - Dezenas: {tens_str}",
                        impact_points=bonus,
                        type="positive"
                    ))
                elif cruz_item:
                    bonus = 5.0
                    cruz_tens_str = ", ".join(cruz_item["tens"])
                    final_score = round(final_score + bonus, 1)
                    factors.append(FactorItem(
                        name="Cruz do Dia",
                        description=f"Presente na Cruz do Dia tradicional (+{bonus} pts) - Dezenas: {cruz_tens_str}",
                        impact_points=bonus,
                        type="positive"
                    ))

            # Bônus de Puxada Tradicional do último 1º prêmio
            is_pulled = (g in puxados_pelo_ultimo)
            if is_pulled and last_g1_info:
                pux_bonus = 28.0 if strategy == "puxada" else 22.0
                final_score = round(final_score + pux_bonus, 1)
                factors.append(FactorItem(
                    name="Puxada Tradicional",
                    description=f"Reação em Cadeia (+{pux_bonus} pts): Puxado pelo 1º prêmio anterior ({last_g1_info['emoji']} {last_g1_info['name']})",
                    impact_points=pux_bonus,
                    type="positive"
                ))

            window_size = min(total_draws, 30) or 1
            presence_pct = round((recent_30_count_all[g] / window_size) * 100, 1)

            item = RankedItem(
                value=str(g).zfill(2),
                display_name=f"Grupo {str(g).zfill(2)} - {anim['name']}",
                score=final_score,
                group_number=g,
                animal_name=anim["name"],
                animal_emoji=anim["emoji"],
                tens=anim["tens"],
                factors=factors,
                metadata={
                    "presence_pct": presence_pct,
                    "presence_count_recent": recent_30_count_all[g],
                    "presence_window": window_size,
                    "delay_1st": delay_1,
                    "delay_all": delay_all,
                    "total_1st": count_1st[g],
                    "total_all": count_all[g],
                    "slot_1st": slot_count_1st[g],
                    "bichocerto": {
                        "ranking_pos": bc_info["ranking_pos"],
                        "delay_days": bc_info["delay_days"],
                        "delay_draws_est": bc_info["delay_draws_est"],
                        "delay_text": bc_info["delay_text"]
                    } if bc_info else None,
                    "cruz_do_dia": {
                        "is_present": bool(cruz_item or is_bicho_dia),
                        "is_bicho_dia": is_bicho_dia,
                        "tens": cruz_item["tens"] if cruz_item else anim["tens"],
                        "thousands": cruz_item["thousands"] if cruz_item else []
                    } if (cruz_item or is_bicho_dia) else None,
                    "puxada": {
                        "is_pulled": is_pulled,
                        "pulled_by_group": last_g1 if is_pulled else None,
                        "pulled_by_name": last_g1_info["name"] if is_pulled and last_g1_info else None,
                        "pulled_by_emoji": last_g1_info["emoji"] if is_pulled and last_g1_info else None,
                    } if is_pulled else None
                }
            )
            group_items.append(item)

        group_items.sort(key=lambda x: x.score, reverse=True)
        return group_items

    def _analyze_tens(
        self,
        draws: List[Dict[str, Any]],
        target_slot: str,
        target_day: int,
        w: WeightsConfigModel,
        top_groups: List[RankedItem],
        target_date: Optional[str] = None
    ) -> List[RankedItem]:
        total_draws = len(draws)
        count_1st = Counter()
        count_all = Counter()
        slot_count = Counter()
        slot_total = 0

        reversed_draws = list(reversed(draws))
        last_seen_1st: Dict[str, int] = {}
        last_seen_all: Dict[str, int] = {}
        decay_scores: Dict[str, float] = defaultdict(float)
        recent_30_ten_count: Counter = Counter()
        decay_rate = w.recent_decay_rate

        for idx, d in enumerate(reversed_draws):
            d1 = extract_dezena(d["prize_1"])
            d_all = [extract_dezena(d[f"prize_{i}"]) for i in range(1, 6)]

            if idx < 30:
                for de in d_all:
                    recent_30_ten_count[de] += 1

            if d1 not in last_seen_1st:
                last_seen_1st[d1] = idx
            for de in d_all:
                if de not in last_seen_all:
                    last_seen_all[de] = idx

            time_weight = math.exp(-decay_rate * idx)
            decay_scores[d1] += time_weight * 2.0
            for de in d_all:
                decay_scores[de] += time_weight * 0.5

            count_1st[d1] += 1
            for de in d_all:
                count_all[de] += 1

            if d["slot"] == target_slot:
                slot_total += 1
                slot_count[d1] += 1

        # Mapeia dezenas da Cruz do Dia e do Bicho do Dia
        cruz_tens_set = set()
        bicho_dia_tens_set = set()
        if target_date:
            try:
                from .cruz_engine import get_cruz_do_dia
                c_data = get_cruz_do_dia(target_date)
                for a in c_data.get("animals", []):
                    for t_val in a.get("tens", []):
                        cruz_tens_set.add(t_val)
                b_dia_grp = c_data.get("bicho_do_dia", {}).get("group")
                if b_dia_grp:
                    for t_val in get_animal_info(b_dia_grp)["tens"]:
                        bicho_dia_tens_set.add(t_val)
            except Exception:
                pass

        group_scores = {g.group_number: g.score for g in top_groups}
        tens_items: List[RankedItem] = []

        for val in range(100):
            d_str = str(val).zfill(2)
            grp = get_group_for_dezena(d_str)
            anim = get_animal_info(grp)

            delay_1 = last_seen_1st.get(d_str, total_draws)
            delay_all = last_seen_all.get(d_str, total_draws)

            score_freq_tot = min(100.0, (count_1st[d_str] / max(total_draws * 0.01, 0.5)) * 40.0)
            score_freq_rec = min(100.0, (decay_scores[d_str] / 4.0) * 80.0)
            score_delay = min(100.0, (delay_1 / 100.0 * 50.0) + (delay_all / 20.0 * 20.0))
            score_slot = min(100.0, (slot_count[d_str] / max(slot_total * 0.01, 0.5)) * 40.0) if slot_total > 0 else 50.0

            parent_grp_score = group_scores.get(grp, 50.0)

            total_weight = (
                w.weight_frequency_total +
                w.weight_frequency_recent +
                w.weight_delay +
                w.weight_slot_affinity
            ) or 1.0

            raw_score = (
                (score_freq_tot * w.weight_frequency_total) +
                (score_freq_rec * w.weight_frequency_recent) +
                (score_delay * w.weight_delay) +
                (score_slot * w.weight_slot_affinity)
            ) / total_weight

            final_score = round((raw_score * 0.70) + (parent_grp_score * 0.30), 1)

            factors: List[FactorItem] = []
            if d_str in bicho_dia_tens_set:
                final_score = round(final_score + 14.0, 1)
                factors.append(FactorItem(
                    name="Dezena do Bicho do Dia",
                    description="Dezena do Bicho do Dia na Cruz (+14.0 pts)",
                    impact_points=14.0,
                    type="positive"
                ))
            elif d_str in cruz_tens_set:
                final_score = round(final_score + 6.0, 1)
                factors.append(FactorItem(
                    name="Dezena da Cruz",
                    description="Formada diretamente pelos dígitos da Cruz (+6.0 pts)",
                    impact_points=6.0,
                    type="positive"
                ))

            if parent_grp_score >= 40.0:
                factors.append(FactorItem(
                    name=f"Força do Grupo {grp} ({anim['name']})",
                    description=f"Grupo classificado no topo com {parent_grp_score} pts",
                    impact_points=round(parent_grp_score * 0.30, 1),
                    type="positive"
                ))
            if delay_1 >= 50:
                factors.append(FactorItem(
                    name="Atraso da Dezena",
                    description=f"Não sai na cabeça há {delay_1} sorteios (esperado: 100)",
                    impact_points=round(score_delay * (w.weight_delay / total_weight), 1),
                    type="positive"
                ))
            if slot_count[d_str] >= 2 and slot_total >= 10:
                factors.append(FactorItem(
                    name=f"Presença em {target_slot}",
                    description=f"{slot_count[d_str]} saídas no 1º prêmio só neste horário",
                    impact_points=round(score_slot * (w.weight_slot_affinity / total_weight), 1),
                    type="positive"
                ))

            t_window = min(total_draws, 30) or 1
            ten_presence_pct = round((recent_30_ten_count[d_str] / t_window) * 100, 1)

            tens_items.append(RankedItem(
                value=d_str,
                display_name=f"Dezena {d_str} ({anim['name']})",
                score=final_score,
                group_number=grp,
                animal_name=anim["name"],
                animal_emoji=anim["emoji"],
                factors=factors,
                metadata={
                    "presence_pct": ten_presence_pct,
                    "presence_count_recent": recent_30_ten_count[d_str],
                    "presence_window": t_window,
                    "delay_1st": delay_1,
                    "delay_all": delay_all,
                    "count_1st": count_1st[d_str]
                }
            ))

        tens_items.sort(key=lambda x: x.score, reverse=True)
        return tens_items

    def _analyze_hundreds(
        self,
        draws: List[Dict[str, Any]],
        target_slot: str,
        w: WeightsConfigModel,
        top_tens: List[RankedItem]
    ) -> List[RankedItem]:
        digit_count = Counter()
        digit_slot_count = Counter()
        reversed_draws = list(reversed(draws))
        last_seen_digit: Dict[str, int] = {}

        for idx, d in enumerate(reversed_draws):
            c1 = extract_centena(d["prize_1"])
            first_digit = c1[0]
            if first_digit not in last_seen_digit:
                last_seen_digit[first_digit] = idx
            digit_count[first_digit] += 1
            if d["slot"] == target_slot:
                digit_slot_count[first_digit] += 1

        digit_scores: Dict[str, float] = {}
        for dig in "0123456789":
            delay = last_seen_digit.get(dig, len(draws))
            score = (delay / 10.0 * 40.0) + (digit_slot_count[dig] * 6.0)
            digit_scores[dig] = min(100.0, score)

        sorted_digits = sorted(digit_scores.keys(), key=lambda k: digit_scores[k], reverse=True)
        hundreds_candidates: List[RankedItem] = []
        top_tens_slice = top_tens[:15]

        for ten_item in top_tens_slice:
            d_val = ten_item.value
            grp = ten_item.group_number
            anim = get_animal_info(grp or 1)

            for d_idx, dig in enumerate(sorted_digits[:3]):
                centena_str = f"{dig}{d_val}"
                d_score = digit_scores[dig]
                combined_score = round((ten_item.score * 0.7) + (d_score * 0.3), 1)

                factors = [
                    FactorItem(
                        name="Base da Dezena Forte",
                        description=f"Dezena {d_val} com pontuação de relevância {ten_item.score}",
                        impact_points=round(ten_item.score * 0.7, 1),
                        type="positive"
                    ),
                    FactorItem(
                        name=f"Dígito Centena '{dig}'",
                        description=f"Atraso de {last_seen_digit.get(dig, len(draws))} sorteios como dígito inicial da centena",
                        impact_points=round(d_score * 0.3, 1),
                        type="positive"
                    )
                ]

                hundreds_candidates.append(RankedItem(
                    value=centena_str,
                    display_name=f"Centena {centena_str} ({anim['name']})",
                    score=combined_score,
                    group_number=grp,
                    animal_name=anim["name"],
                    animal_emoji=anim["emoji"],
                    factors=factors,
                    metadata={"ten": d_val, "digit": dig}
                ))

        hundreds_candidates.sort(key=lambda x: x.score, reverse=True)
        return hundreds_candidates

    def _analyze_thousands(
        self,
        draws: List[Dict[str, Any]],
        target_slot: str,
        w: WeightsConfigModel,
        top_hundreds: List[RankedItem],
        top_tens: List[RankedItem],
        target_date: Optional[str] = None
    ) -> List[RankedItem]:
        first_digit_count = Counter()
        last_seen_m_digit: Dict[str, int] = {}
        reversed_draws = list(reversed(draws))

        for idx, d in enumerate(reversed_draws):
            m1 = extract_milhar(d["prize_1"])
            f_digit = m1[0]
            if f_digit not in last_seen_m_digit:
                last_seen_m_digit[f_digit] = idx
            first_digit_count[f_digit] += 1

        m_digit_scores: Dict[str, float] = {}
        for dig in "0123456789":
            delay = last_seen_m_digit.get(dig, len(draws))
            score = min(100.0, (delay / 10.0 * 50.0) + (first_digit_count[dig] * 3.0))
            m_digit_scores[dig] = score

        best_m_digits = sorted(m_digit_scores.keys(), key=lambda k: m_digit_scores[k], reverse=True)
        thousands_candidates: List[RankedItem] = []
        top_hundreds_slice = top_hundreds[:15]

        for h_item in top_hundreds_slice:
            c_val = h_item.value
            grp = h_item.group_number
            anim = get_animal_info(grp or 1)

            for d_idx, dig in enumerate(best_m_digits[:2]):
                milhar_str = f"{dig}{c_val}"
                m_score = m_digit_scores[dig]
                final_score = round((h_item.score * 0.75) + (m_score * 0.25), 1)

                factors = [
                    FactorItem(
                        name="Centena de Alta Pontuação",
                        description=f"Centena {c_val} avaliada com pontuação {h_item.score}",
                        impact_points=round(h_item.score * 0.75, 1),
                        type="positive"
                    ),
                    FactorItem(
                        name=f"Dígito Milhar '{dig}'",
                        description=f"Pressão estatística no dígito inicial da milhar (score {round(m_score, 1)})",
                        impact_points=round(m_score * 0.25, 1),
                        type="positive"
                    )
                ]

                thousands_candidates.append(RankedItem(
                    value=milhar_str,
                    display_name=f"Milhar {milhar_str} ({anim['name']})",
                    score=final_score,
                    group_number=grp,
                    animal_name=anim["name"],
                    animal_emoji=anim["emoji"],
                    factors=factors,
                    metadata={"centena": c_val, "milhar_digit": dig}
                ))

        # Incorporar e priorizar milhares da Cruz do Dia
        try:
            from .cruz_engine import get_cruz_do_dia
            cruz_data = get_cruz_do_dia(target_date)
            cruz_thousands = set(cruz_data.get("all_thousands", []))

            # Eleva pontuação de milhares da cruz já geradas
            for item in thousands_candidates:
                if item.value in cruz_thousands:
                    item.score = round(item.score + 6.0, 1)
                    item.factors.append(FactorItem(
                        name="Cruz do Dia",
                        description=f"Milhar {item.value} formada pelos 4 dígitos da Cruz do Dia",
                        impact_points=6.0,
                        type="positive"
                    ))
                    if item.metadata is not None:
                        item.metadata["is_cruz"] = True

            # Insere milhares exclusivas da cruz para os animais da cruz se ainda não estiverem na lista
            top_group_nums = {g.group_number for g in top_tens[:6]}
            existing_milhares = {m.value for m in thousands_candidates}
            for a in cruz_data.get("animals", []):
                if a["group"] in top_group_nums:
                    for m_val in a.get("thousands", []):
                        if m_val not in existing_milhares:
                            anim = get_animal_info(a["group"])
                            thousands_candidates.append(RankedItem(
                                value=m_val,
                                display_name=f"Milhar {m_val} ({anim['name']})",
                                score=72.0,
                                group_number=a["group"],
                                animal_name=anim["name"],
                                animal_emoji=anim["emoji"],
                                factors=[
                                    FactorItem(
                                        name="Milhar da Cruz do Dia",
                                        description=f"Milhar {m_val} projetada pelos dígitos da Cruz do Dia para {anim['name']}",
                                        impact_points=72.0,
                                        type="positive"
                                    )
                                ],
                                metadata={"centena": m_val[-3:], "is_cruz": True}
                            ))
                            existing_milhares.add(m_val)
        except Exception:
            pass

        thousands_candidates.sort(key=lambda x: x.score, reverse=True)
        return thousands_candidates
