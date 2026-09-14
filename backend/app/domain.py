"""
Módulo de Domínio do Jogo do Bicho
Define regras canônicas dos 25 grupos, dezenas, animais e horários padrão.
"""

from datetime import datetime
from typing import Dict, List, Any, Optional
import re

# Definição canônica dos 25 animais do Jogo do Bicho
ANIMALS: Dict[int, Dict[str, Any]] = {
    1: {"name": "Avestruz", "emoji": "🐦", "group": 1, "tens": ["01", "02", "03", "04"]},
    2: {"name": "Águia", "emoji": "🦅", "group": 2, "tens": ["05", "06", "07", "08"]},
    3: {"name": "Burro", "emoji": "🐴", "group": 3, "tens": ["09", "10", "11", "12"]},
    4: {"name": "Borboleta", "emoji": "🦋", "group": 4, "tens": ["13", "14", "15", "16"]},
    5: {"name": "Cachorro", "emoji": "🐕", "group": 5, "tens": ["17", "18", "19", "20"]},
    6: {"name": "Cabra", "emoji": "🐐", "group": 6, "tens": ["21", "22", "23", "24"]},
    7: {"name": "Carneiro", "emoji": "🐏", "group": 7, "tens": ["25", "26", "27", "28"]},
    8: {"name": "Camelo", "emoji": "🐪", "group": 8, "tens": ["29", "30", "31", "32"]},
    9: {"name": "Cobra", "emoji": "🐍", "group": 9, "tens": ["33", "34", "35", "36"]},
    10: {"name": "Coelho", "emoji": "🐇", "group": 10, "tens": ["37", "38", "39", "40"]},
    11: {"name": "Cavalo", "emoji": "🐎", "group": 11, "tens": ["41", "42", "43", "44"]},
    12: {"name": "Elefante", "emoji": "🐘", "group": 12, "tens": ["45", "46", "47", "48"]},
    13: {"name": "Galo", "emoji": "🐓", "group": 13, "tens": ["49", "50", "51", "52"]},
    14: {"name": "Gato", "emoji": "🐈", "group": 14, "tens": ["53", "54", "55", "56"]},
    15: {"name": "Jacaré", "emoji": "🐊", "group": 15, "tens": ["57", "58", "59", "60"]},
    16: {"name": "Leão", "emoji": "🦁", "group": 16, "tens": ["61", "62", "63", "64"]},
    17: {"name": "Macaco", "emoji": "🐒", "group": 17, "tens": ["65", "66", "67", "68"]},
    18: {"name": "Porco", "emoji": "🐖", "group": 18, "tens": ["69", "70", "71", "72"]},
    19: {"name": "Pavão", "emoji": "🦚", "group": 19, "tens": ["73", "74", "75", "76"]},
    20: {"name": "Peru", "emoji": "🦃", "group": 20, "tens": ["77", "78", "79", "80"]},
    21: {"name": "Touro", "emoji": "🐂", "group": 21, "tens": ["81", "82", "83", "84"]},
    22: {"name": "Tigre", "emoji": "🐅", "group": 22, "tens": ["85", "86", "87", "88"]},
    23: {"name": "Urso", "emoji": "🐻", "group": 23, "tens": ["89", "90", "91", "92"]},
    24: {"name": "Veado", "emoji": "🦌", "group": 24, "tens": ["93", "94", "95", "96"]},
    25: {"name": "Vaca", "emoji": "🐄", "group": 25, "tens": ["97", "98", "99", "00"]},
}

# Mapa reverso de dezena para grupo (00 -> 25, 01 -> 1, ..., 99 -> 25)
TEN_TO_GROUP: Dict[str, int] = {}
for grp, data in ANIMALS.items():
    for ten in data["tens"]:
        TEN_TO_GROUP[ten] = grp

# Horários canônicos padrão (extrações regulares do RJ - 6 sorteios diários)
STANDARD_SLOTS: List[Dict[str, Any]] = [
    {"code": "PPT", "name": "PPT - 09:20", "time": "09:20", "order": 1},
    {"code": "PTM", "name": "PTM - 11:20", "time": "11:20", "order": 2},
    {"code": "PT", "name": "PT - 14:20", "time": "14:20", "order": 3},
    {"code": "PTV", "name": "PTV - 16:20", "time": "16:20", "order": 4},
    {"code": "PTN", "name": "PTN - 18:20", "time": "18:20", "order": 5},
    {"code": "COR", "name": "Coruja - 21:20", "time": "21:20", "order": 6},
]

SLOT_CODES = [s["code"] for s in STANDARD_SLOTS]

# Catálogo oficial de Loterias e Bancas suportadas
LOTTERIES: Dict[str, Dict[str, Any]] = {
    "RJ": {
        "code": "RJ",
        "name": "Rio de Janeiro (RJ)",
        "short_name": "Rio de Janeiro",
        "badge": "🎲 RJ",
        "icon": "🎲",
        "color": "indigo",
        "slots": STANDARD_SLOTS
    },
    "LOOK": {
        "code": "LOOK",
        "name": "Look Loterias (Goiás)",
        "short_name": "Look Goiás",
        "badge": "🌾 Look GO",
        "icon": "🌾",
        "color": "amber",
        "slots": [
            {"code": "LK-07", "name": "Look 07h - 07:20", "time": "07:20", "order": 1},
            {"code": "LK-09", "name": "Look 09h - 09:20", "time": "09:20", "order": 2},
            {"code": "LK-11", "name": "Look 11h - 11:20", "time": "11:20", "order": 3},
            {"code": "LK-14", "name": "Look 14h - 14:20", "time": "14:20", "order": 4},
            {"code": "LK-16", "name": "Look 16h - 16:20", "time": "16:20", "order": 5},
            {"code": "LK-18", "name": "Look 18h - 18:20", "time": "18:20", "order": 6},
            {"code": "LK-21", "name": "Look 21h - 21:20", "time": "21:20", "order": 7},
            {"code": "LK-23", "name": "Look 23h - 23:20", "time": "23:20", "order": 8},
        ]
    },
    "NACIONAL": {
        "code": "NACIONAL",
        "name": "Loteria Nacional",
        "short_name": "Nacional",
        "badge": "🇧🇷 Nacional",
        "icon": "🇧🇷",
        "color": "emerald",
        "slots": [
            {"code": "LN-02", "name": "Nacional 02h - 02:00", "time": "02:00", "order": 1},
            {"code": "LN-08", "name": "Nacional 08h - 08:00", "time": "08:00", "order": 2},
            {"code": "LN-10", "name": "Nacional 10h - 10:00", "time": "10:00", "order": 3},
            {"code": "LN-12", "name": "Nacional 12h - 12:00", "time": "12:00", "order": 4},
            {"code": "LN-15", "name": "Nacional 15h - 15:00", "time": "15:00", "order": 5},
            {"code": "LN-17", "name": "Nacional 17h - 17:00", "time": "17:00", "order": 6},
            {"code": "LN-19", "name": "Nacional 19h - 19:00", "time": "19:00", "order": 7},
            {"code": "LN-21", "name": "Nacional 21h - 21:00", "time": "21:00", "order": 8},
            {"code": "LN-23", "name": "Nacional 23h - 23:00", "time": "23:00", "order": 9},
        ]
    },
    "SP": {
        "code": "SP",
        "name": "São Paulo (Bandeirantes/PT-SP)",
        "short_name": "São Paulo",
        "badge": "🏙️ SP",
        "icon": "🏙️",
        "color": "cyan",
        "slots": [
            {"code": "SP-08", "name": "Bandeirantes 08h - 08:00", "time": "08:00", "order": 1},
            {"code": "SP-10", "name": "Bandeirantes 10h - 10:00", "time": "10:00", "order": 2},
            {"code": "SP-12", "name": "Bandeirantes 12h - 12:00", "time": "12:00", "order": 3},
            {"code": "SP-13", "name": "Bandeirantes 13h - 13:00", "time": "13:00", "order": 4},
            {"code": "SP-14", "name": "PT-SP 14h - 14:00", "time": "14:00", "order": 5},
            {"code": "SP-15", "name": "Bandeirantes 15h - 15:00", "time": "15:00", "order": 6},
            {"code": "SP-16", "name": "Bandeirantes 16h - 16:00", "time": "16:00", "order": 7},
            {"code": "SP-17", "name": "Bandeirantes 17h - 17:00", "time": "17:00", "order": 8},
            {"code": "SP-18", "name": "Bandeirantes 18h - 18:00", "time": "18:00", "order": 9},
            {"code": "SP-19", "name": "Bandeirantes 19h - 19:00", "time": "19:00", "order": 10},
            {"code": "SP-20", "name": "PT-SP 20h - 20:00", "time": "20:00", "order": 11},
        ]
    },
    "FEDERAL": {
        "code": "FEDERAL",
        "name": "Loteria Federal",
        "short_name": "Federal",
        "badge": "🏛️ Federal",
        "icon": "🏛️",
        "color": "purple",
        "slots": [
            {"code": "FED", "name": "Federal 19h (Quarta) • 11h (Domingo)", "time": "19:00", "order": 1},
        ]
    }
}


def get_lottery_info(lottery_code: Optional[str] = "RJ") -> Dict[str, Any]:
    """Retorna os metadados de uma loteria ou os padrões do Rio de Janeiro se inválido."""
    code = (lottery_code or "RJ").upper()
    return LOTTERIES.get(code, LOTTERIES["RJ"])


def get_lottery_slots(lottery_code: Optional[str] = "RJ", target_date: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retorna a lista de horários de uma loteria específica adaptando horários da Federal conforme o dia."""
    info = get_lottery_info(lottery_code)
    slots = list(info["slots"])
    if (lottery_code or "").upper() == "FEDERAL":
        ref_date = target_date or datetime.now().strftime("%Y-%m-%d")
        try:
            dt = datetime.strptime(str(ref_date)[:10], "%Y-%m-%d")
            if dt.weekday() == 6:  # Domingo às 11h00
                return [{"code": "FED", "name": "Federal 11h (Domingo) - 11:00", "time": "11:00", "order": 1}]
            elif dt.weekday() == 2:  # Quarta-feira às 19h00
                return [{"code": "FED", "name": "Federal 19h (Quarta) - 19:00", "time": "19:00", "order": 1}]
            else:
                return [{"code": "FED", "name": "Federal 19h (Quarta) • 11h (Domingo)", "time": "19:00", "order": 1}]
        except Exception:
            pass
    return slots


def get_slot_order_weight(slot: Optional[str], draw_date: Optional[str] = None) -> int:
    """Calcula os minutos aproximados desde 00:00 para ordenação cronológica precisa do sorteio."""
    if not slot:
        return 0
    slot_upper = slot.upper().strip()
    if slot_upper in ["FED", "FEDERAL"]:
        # Federal corre às quartas-feiras (19h) e aos domingos (11h)
        if draw_date:
            try:
                dt = datetime.strptime(str(draw_date)[:10], "%Y-%m-%d")
                if dt.weekday() == 6:  # Domingo
                    return 11 * 60
            except Exception:
                pass
        elif datetime.now().weekday() == 6:
            return 11 * 60
        return 19 * 60

    fixed_weights = {
        "ALV": 8 * 60,
        "PPT": 9 * 60 + 20,
        "PTM": 11 * 60 + 20,
        "PT": 14 * 60 + 20,
        "PTV": 16 * 60 + 20,
        "PTN": 18 * 60 + 20,
        "COR": 21 * 60 + 20,
        "LK-07": 7 * 60 + 20,
        "LK-09": 9 * 60 + 20,
        "LK-11": 11 * 60 + 20,
        "LK-14": 14 * 60 + 20,
        "LK-16": 16 * 60 + 20,
        "LK-18": 18 * 60 + 20,
        "LK-21": 21 * 60 + 20,
        "LK-23": 23 * 60 + 20,
    }
    if slot_upper in fixed_weights:
        return fixed_weights[slot_upper]
    m = re.search(r"(\d{1,2})", slot_upper)
    if m:
        h = int(m.group(1))
        # Se for slot da Look (LK), apurações ocorrem aos 20 min passados da hora
        if slot_upper.startswith("LK"):
            return h * 60 + 20
        return h * 60
    return 0


def format_milhar(value: Any) -> str:
    """Garante que a milhar possua exatamente 4 dígitos formatados em string."""
    if value is None:
        return "0000"
    num_str = str(value).strip()
    digits = "".join([c for c in num_str if c.isdigit()])
    if not digits:
        return "0000"
    return digits[-4:].zfill(4)


def extract_dezena(number: Any) -> str:
    """Extrai a dezena (últimos 2 dígitos) de um número."""
    m = format_milhar(number)
    return m[-2:]


def extract_centena(number: Any) -> str:
    """Extrai a centena (últimos 3 dígitos) de um número."""
    m = format_milhar(number)
    return m[-3:]


def extract_milhar(number: Any) -> str:
    """Extrai a milhar completa (4 dígitos)."""
    return format_milhar(number)


def get_group_for_dezena(dezena: Any) -> int:
    """Retorna o número do grupo (1 a 25) para uma dezena dada."""
    d_str = str(dezena).strip().zfill(2)[-2:]
    return TEN_TO_GROUP.get(d_str, 25 if d_str == "00" else 1)


def get_group_for_number(number: Any) -> int:
    """Retorna o grupo correspondente a um prêmio (pela dezena final)."""
    d = extract_dezena(number)
    return get_group_for_dezena(d)


def get_animal_info(group_number: int) -> Dict[str, Any]:
    """Retorna dados do animal para o grupo especificado (1 a 25)."""
    return ANIMALS.get(group_number, ANIMALS[1])
