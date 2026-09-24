"""
Módulo Raspador de Bichos Atrasados do Bicho Certo (RJ).
Extrai os dados oficiais de atraso do site oficial:
https://www.bichocerto.com/atrasados/rj/
e calcula o atraso acumulado em dias e em sorteios equivalentes (dias * 6 sorteios diários).
"""

import re
from datetime import datetime
from typing import Dict, Any, List, Optional
import httpx
from bs4 import BeautifulSoup

from ..database import get_db_connection
from ..domain import ANIMALS, get_animal_info, get_group_for_number

SOURCE_URL = "https://www.bichocerto.com/atrasados/rj/"

ANIMAL_NAME_TO_GROUP = {
    "avestruz": 1, "águia": 2, "aguia": 2, "burro": 3, "borboleta": 4,
    "cachorro": 5, "cabra": 6, "carneiro": 7, "camelo": 8, "cobra": 9,
    "coelho": 10, "cavalo": 11, "elefante": 12, "galo": 13, "gato": 14,
    "jacaré": 15, "jacare": 15, "leão": 16, "leao": 16, "macaco": 17,
    "porco": 18, "pavão": 19, "pavao": 19, "peru": 20, "touro": 21,
    "tigre": 22, "urso": 23, "veado": 24, "vaca": 25
}


def calculate_atrasados_from_db(lottery_code: str = "RJ") -> List[Dict[str, Any]]:
    """
    Calcula em tempo real o atraso exato de todos os 25 grupos de animais
    diretamente a partir do histórico de sorteios (draw_results) para qualquer banca.
    """
    lot_code = (lottery_code or "RJ").upper()
    multiplier = 6
    if lot_code in ["LOOK", "NACIONAL"]:
        multiplier = 8
    elif lot_code == "SP":
        multiplier = 5
    elif lot_code == "FEDERAL":
        multiplier = 2

    with get_db_connection() as conn:
        cursor = conn.cursor()
        if lot_code == "FEDERAL":
            cursor.execute(
                "SELECT draw_date, slot, prize_1 FROM draw_results WHERE (lottery = 'FEDERAL' OR slot = 'FED') ORDER BY draw_date DESC, id DESC"
            )
        elif lot_code == "RJ":
            cursor.execute(
                "SELECT draw_date, slot, prize_1 FROM draw_results WHERE (lottery = 'RJ' OR lottery IS NULL OR slot = 'FED') ORDER BY draw_date DESC, id DESC"
            )
        else:
            cursor.execute(
                "SELECT draw_date, slot, prize_1 FROM draw_results WHERE lottery = ? ORDER BY draw_date DESC, id DESC",
                (lot_code,)
            )
        rows = cursor.fetchall()

    last_seen_draws: Dict[int, int] = {}
    last_seen_date: Dict[int, str] = {}
    last_seen_slot: Dict[int, str] = {}
    for idx, r in enumerate(rows):
        g = get_group_for_number(r["prize_1"])
        if g not in last_seen_draws:
            last_seen_draws[g] = idx
            last_seen_date[g] = r["draw_date"]
            last_seen_slot[g] = r["slot"]

    today = datetime.now().date()
    ranking: List[Dict[str, Any]] = []
    total_draws = len(rows)

    for g in range(1, 26):
        raw_draws = last_seen_draws.get(g, total_draws)
        dt_str = last_seen_date.get(g)
        slot_name = last_seen_slot.get(g, "")
        if dt_str:
            try:
                d_obj = datetime.strptime(dt_str, "%Y-%m-%d").date()
                diff_days = (today - d_obj).days
            except Exception:
                diff_days = max(1, raw_draws // multiplier)

            if raw_draws == 0:
                delay_days = 0
                delay_text = f"Saiu no último sorteio ({slot_name})" if slot_name else "Saiu no último sorteio"
            elif diff_days <= 0:
                delay_days = 0
                delay_text = f"Saiu hoje ({slot_name})" if slot_name else "Saiu hoje"
            elif diff_days == 1:
                delay_days = 1
                delay_text = f"Saiu ontem ({slot_name})" if slot_name else f"Saiu ontem ({raw_draws} apurações)"
            else:
                delay_days = diff_days
                delay_text = f"a {diff_days} dias ({raw_draws} apurações)"
        else:
            delay_days = max(15, raw_draws // multiplier) if raw_draws > 0 else 15
            delay_text = f"a {delay_days} dias"

        draws_est = raw_draws

        anim = get_animal_info(g)
        ranking.append({
            "group_number": g,
            "animal_name": anim["name"],
            "animal_emoji": anim["emoji"],
            "tens": anim["tens"],
            "delay_days": delay_days,
            "delay_draws_est": draws_est,
            "delay_text": delay_text,
            "last_slot": slot_name,
            "last_date": dt_str or "",
            "is_last_winner": raw_draws == 0,
            "is_today_winner": delay_days == 0 and raw_draws > 0,
        })

    # Ordena pelo maior atraso (dias e sorteios)
    ranking.sort(key=lambda x: (x["delay_days"], x["delay_draws_est"]), reverse=True)
    for rank_pos, item in enumerate(ranking, 1):
        item["ranking_pos"] = rank_pos

    return ranking


def fetch_and_sync_bichocerto_atrasados(lottery_code: Optional[str] = "RJ") -> Dict[str, Any]:
    """
    Sincroniza os atrasados dos 25 animais para a loteria indicada.
    Para RJ: tenta conexão com o Bicho Certo e, caso indisponível (403/timeout),
    calcula confiavelmente a partir do histórico de sorteios.
    Para outras bancas: calcula diretamente do banco para a banca solicitada.
    """
    lot_code = (lottery_code or "RJ").upper()

    if lot_code != "RJ":
        db_items = calculate_atrasados_from_db(lot_code)
        return {
            "success": True,
            "lottery": lot_code,
            "source": f"database_{lot_code}",
            "total_animals": len(db_items),
            "items": db_items,
            "message": f"Ranking de atrasados da banca {lot_code} calculado com sucesso!"
        }

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    parsed_items: List[Dict[str, Any]] = []

    try:
        with httpx.Client(timeout=6.0, follow_redirects=True, headers=headers) as client:
            resp = client.get(SOURCE_URL)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")
                tables = soup.find_all("table")
                if len(tables) >= 2:
                    rows = tables[1].find_all("tr")[1:]
                    for tr in rows:
                        tds = tr.find_all("td")
                        if len(tds) < 3:
                            continue
                        rank_text = tds[0].get_text(strip=True).replace("º", "").replace("°", "")
                        if not rank_text.isdigit():
                            continue
                        rank = int(rank_text)

                        b_animal = tds[2].find("b", class_="text-success")
                        animal_name = b_animal.get_text(strip=True) if b_animal else ""

                        b_delay = tds[2].find("b", class_="text-danger")
                        delay_text = b_delay.get_text(strip=True) if b_delay else ""

                        days = 0
                        if "hoje" in delay_text.lower():
                            days = 0
                        elif "ontem" in delay_text.lower():
                            days = 1
                        else:
                            m = re.search(r"(\d+)", delay_text)
                            if m:
                                days = int(m.group(1))

                        draws_est = days * 6
                        grp = ANIMAL_NAME_TO_GROUP.get(animal_name.lower().strip())
                        if not grp:
                            img = tds[1].find("img")
                            if img and img.get("src"):
                                src_val = str(img.get("src") or "")
                                src_match = re.search(r"/(\d+)\.png", src_val)
                                if src_match:
                                    grp = int(src_match.group(1))

                        if grp:
                            anim_info = get_animal_info(grp)
                            parsed_items.append({
                                "group_number": grp,
                                "ranking_pos": rank,
                                "animal_name": anim_info["name"],
                                "delay_text": delay_text,
                                "delay_days": days,
                                "delay_draws_est": draws_est,
                                "animal_emoji": anim_info["emoji"],
                                "tens": anim_info["tens"]
                            })
    except Exception:
        parsed_items = []

    # Se o scraping externo falhar ou retornar incompleto, calcula confiavelmente do banco
    if len(parsed_items) < 25:
        parsed_items = calculate_atrasados_from_db("RJ")

    # Salva / atualiza no SQLite na tabela bichocerto_atrasados
    with get_db_connection() as conn:
        cursor = conn.cursor()
        for item in parsed_items:
            cursor.execute("""
                INSERT INTO bichocerto_atrasados (
                    group_number, ranking_pos, animal_name,
                    delay_text, delay_days, delay_draws_est, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(group_number) DO UPDATE SET
                    ranking_pos = excluded.ranking_pos,
                    animal_name = excluded.animal_name,
                    delay_text = excluded.delay_text,
                    delay_days = excluded.delay_days,
                    delay_draws_est = excluded.delay_draws_est,
                    updated_at = CURRENT_TIMESTAMP
            """, (
                item["group_number"],
                item["ranking_pos"],
                item["animal_name"],
                item["delay_text"],
                item["delay_days"],
                item["delay_draws_est"]
            ))

    return {
        "success": True,
        "lottery": "RJ",
        "source": "bichocerto_or_database",
        "total_animals": len(parsed_items),
        "items": parsed_items,
        "message": f"{len(parsed_items)} bichos atrasados sincronizados com sucesso!"
    }


def get_cached_bichocerto_atrasados(lottery_code: Optional[str] = "RJ") -> List[Dict[str, Any]]:
    """
    Retorna o ranking de atrasados em tempo real para qualquer loteria (RJ, LOOK, SP, NACIONAL, FEDERAL),
    calculando diretamente a partir dos resultados apurados mais recentes no banco de dados.
    """
    lot_code = (lottery_code or "RJ").upper()
    return calculate_atrasados_from_db(lot_code)
