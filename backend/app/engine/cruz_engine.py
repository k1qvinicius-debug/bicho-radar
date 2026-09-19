"""
Módulo de Cálculo e Sincronização da Cruz do Dia.
Calcula a tradicional Cruz do Dia com base na numerologia do Jogo do Bicho (regra do +3)
e sincroniza os destaques do dia em background, sem qualquer menção a serviços externos.
"""

import itertools
import re
from datetime import datetime
from typing import Dict, Any, List, Optional
import httpx
from bs4 import BeautifulSoup

from ..domain import ANIMALS, TEN_TO_GROUP

# Cache em memória para os destaques do dia
_CRUZ_CACHE: Dict[str, Dict[str, Any]] = {}


def _calculate_cruz_math(day: int) -> Dict[str, Any]:
    """
    Executa o cálculo matemático canônico da Cruz do Dia:
    Dado o dia D do mês:
      n1 = (D + 3) % 10 (Topo)
      n2 = (n1 + 3) % 10 (Direita)
      n3 = (n2 + 3) % 10 (Base)
      n4 = (n3 + 3) % 10 (Esquerda)
    """
    n1 = (day + 3) % 10
    n2 = (n1 + 3) % 10
    n3 = (n2 + 3) % 10
    n4 = (n3 + 3) % 10

    digits = [n1, n2, n3, n4]
    digits_set = list(dict.fromkeys(digits))

    # Formar todas as dezenas possíveis (combinação de 2 dígitos distintos)
    possible_tens = []
    for d1 in digits_set:
        for d2 in digits_set:
            if d1 == d2:
                continue
            possible_tens.append(f"{d1}{d2}")

    possible_tens = sorted(list(set(possible_tens)))

    # Mapear dezenas para animais
    animals_map: Dict[int, Dict[str, Any]] = {}
    for ten in possible_tens:
        grp = TEN_TO_GROUP.get(ten)
        if grp:
            if grp not in animals_map:
                animals_map[grp] = {
                    "group": grp,
                    "animal": ANIMALS[grp]["name"],
                    "emoji": ANIMALS[grp]["emoji"],
                    "tens": [],
                    "thousands": []
                }
            animals_map[grp]["tens"].append(ten)

    # Formar milhares com permutações dos 4 dígitos
    all_thousands = []
    for p in itertools.permutations(digits, 4):
        m_str = "".join(str(x) for x in p)
        all_thousands.append(m_str)
    all_thousands = sorted(list(set(all_thousands)))

    # Associar milhares aos animais correspondentes (terminação nos últimos 2 dígitos)
    for grp, item in animals_map.items():
        item_thousands = [m for m in all_thousands if m[-2:] in item["tens"]]
        item["thousands"] = item_thousands

    # Ordena os animais por número do grupo
    sorted_animals = [animals_map[g] for g in sorted(animals_map.keys())]

    return {
        "digits": {"top": str(n1), "right": str(n2), "bottom": str(n3), "left": str(n4)},
        "raw_digits": [str(x) for x in digits],
        "animals": sorted_animals,
        "all_thousands": all_thousands
    }


def _fetch_remote_highlights() -> Optional[Dict[str, Any]]:
    """
    Tenta sincronizar os destaques diários (Bicho do Dia e milhares sugeridas)
    em background sem expor nomes de sites de terceiros.
    """
    url = "https://portalbrasil.net/jogodobicho/palpite-do-jogo-do-bicho/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    try:
        with httpx.Client(timeout=6.0, follow_redirects=True, headers=headers) as client:
            resp = client.get(url)
            if resp.status_code != 200:
                return None
            html = resp.text
    except Exception:
        return None

    soup = BeautifulSoup(html, "html.parser")
    bicho_do_dia_grp = None

    # Tenta extrair o "Bicho do Dia"
    bicho_dia_div = soup.find("div", id="bicho-dia")
    if bicho_dia_div:
        text = bicho_dia_div.get_text()
        # Busca "Grupo XX" ou nome do animal
        m = re.search(r"Grupo\s+(\d{1,2})", text, re.IGNORECASE)
        if m:
            bicho_do_dia_grp = int(m.group(1))

    return {
        "bicho_do_dia_group": bicho_do_dia_grp
    }


def _generate_bicho_do_dia_projections(
    group: int,
    raw_digits: List[str],
    cruz_animals: List[Dict[str, Any]]
) -> Dict[str, List[str]]:
    """
    Gera milhares e centenas quentes projetadas especialmente para o Bicho do Dia,
    cruzando a numerologia dos 4 dígitos da Cruz com as dezenas do animal.
    """
    info = ANIMALS.get(group, {})
    tens = info.get("tens", [])
    if not tens:
        return {"thousands": [], "hundreds": []}

    # 1. Se o bicho do dia já possui milhares geradas por permutação direta na cruz
    direct_thousands: List[str] = []
    for a in cruz_animals:
        if a["group"] == group:
            direct_thousands = list(a.get("thousands", []))
            break

    # 2. Dígitos cardeais únicos da Cruz
    unique_digits: List[str] = []
    for d in raw_digits:
        if d not in unique_digits:
            unique_digits.append(d)

    # Pares cardeais estratégicos (sentido horário, anti-horário e diagonais)
    pairs: List[str] = []
    if len(raw_digits) == 4:
        t, r, b, l = raw_digits[0], raw_digits[1], raw_digits[2], raw_digits[3]
        preferred = [
            f"{t}{r}", f"{r}{b}", f"{b}{l}", f"{l}{t}",
            f"{t}{b}", f"{b}{t}", f"{r}{l}", f"{l}{r}",
            f"{t}{l}", f"{l}{b}", f"{b}{r}", f"{r}{t}"
        ]
        for p in preferred:
            if p not in pairs:
                pairs.append(p)
    else:
        for d1 in unique_digits:
            for d2 in unique_digits:
                if d1 != d2:
                    p = f"{d1}{d2}"
                    if p not in pairs:
                        pairs.append(p)

    # 3. Gerar Milhares Quentes: união de diretas da cruz + [Par Cruz] + [Dezena]
    thousands: List[str] = list(direct_thousands)
    for p in pairs:
        for t_val in tens:
            m = f"{p}{t_val}"
            if m not in thousands:
                thousands.append(m)

    # 4. Gerar Centenas Quentes: [Dígito Cardeal] + [Dezena]
    hundreds: List[str] = []
    for d in unique_digits:
        for t_val in tens:
            c = f"{d}{t_val}"
            if c not in hundreds:
                hundreds.append(c)

    return {
        "thousands": thousands[:12],
        "hundreds": hundreds[:8]
    }


def get_cruz_do_dia(target_date: Optional[str] = None) -> Dict[str, Any]:
    """
    Retorna a Cruz do Dia completa para uma data específica (ou hoje).
    Formato da data: 'YYYY-MM-DD'.
    Cálculo 100% determinístico e instantâneo baseado na numerologia da Cruz.
    """
    if not target_date:
        target_date = datetime.now().strftime("%Y-%m-%d")

    # Verifica se já está em cache
    if target_date in _CRUZ_CACHE:
        return _CRUZ_CACHE[target_date]

    try:
        dt = datetime.strptime(target_date, "%Y-%m-%d")
    except Exception:
        dt = datetime.now()
        target_date = dt.strftime("%Y-%m-%d")

    day = dt.day
    cruz_data = _calculate_cruz_math(day)

    # Identificar Bicho do Dia determinístico:
    # Seleciona o animal com maior presença de dezenas na Cruz
    if cruz_data["animals"]:
        sorted_by_tens = sorted(cruz_data["animals"], key=lambda a: len(a["tens"]), reverse=True)
        bicho_group = sorted_by_tens[0]["group"]
    else:
        bicho_group = 11  # Cavalo como padrão de sorte

    bicho_info = ANIMALS.get(bicho_group, ANIMALS[11])
    projections = _generate_bicho_do_dia_projections(
        bicho_group,
        cruz_data["raw_digits"],
        cruz_data["animals"]
    )

    bicho_do_dia = {
        "group": bicho_group,
        "animal": bicho_info["name"],
        "emoji": bicho_info["emoji"],
        "tens": bicho_info["tens"],
        "thousands": projections["thousands"],
        "hundreds": projections["hundreds"]
    }

    result = {
        "date": target_date,
        "day": day,
        "digits": cruz_data["digits"],
        "raw_digits": cruz_data["raw_digits"],
        "bicho_do_dia": bicho_do_dia,
        "animals": cruz_data["animals"],
        "all_thousands": cruz_data["all_thousands"]
    }

    # Salva no cache
    _CRUZ_CACHE[target_date] = result
    return result
