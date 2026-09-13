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
from ..domain import ANIMALS, get_animal_info

SOURCE_URL = "https://www.bichocerto.com/atrasados/rj/"

ANIMAL_NAME_TO_GROUP = {
    "avestruz": 1, "águia": 2, "aguia": 2, "burro": 3, "borboleta": 4,
    "cachorro": 5, "cabra": 6, "carneiro": 7, "camelo": 8, "cobra": 9,
    "coelho": 10, "cavalo": 11, "elefante": 12, "galo": 13, "gato": 14,
    "jacaré": 15, "jacare": 15, "leão": 16, "leao": 16, "macaco": 17,
    "porco": 18, "pavão": 19, "pavao": 19, "peru": 20, "touro": 21,
    "tigre": 22, "urso": 23, "veado": 24, "vaca": 25
}


def fetch_and_sync_bichocerto_atrasados() -> Dict[str, Any]:
    """
    Conecta a https://www.bichocerto.com/atrasados/rj/,
    extrai os 25 grupos com suas posições de ranking e dias de atraso,
    calcula os sorteios equivalentes (dias * 6) e persiste no banco SQLite.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    try:
        with httpx.Client(timeout=15.0, follow_redirects=True, headers=headers) as client:
            resp = client.get(SOURCE_URL)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        raise RuntimeError(f"Falha ao acessar {SOURCE_URL}: {str(e)}")

    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    if len(tables) < 2:
        raise ValueError(f"Estrutura inesperada na página do Bicho Certo. Tabelas encontradas: {len(tables)}")

    # A tabela com os atrasados é a segunda tabela (índice 1)
    target_table = tables[1]
    rows = target_table.find_all("tr")[1:]  # Pula o cabeçalho '1º Prêmio no Geral'

    parsed_items: List[Dict[str, Any]] = []

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

        # Extrai os dias de atraso
        days = 0
        if "hoje" in delay_text.lower():
            days = 0
        elif "ontem" in delay_text.lower():
            days = 1
        else:
            match = re.search(r"(\d+)", delay_text)
            if match:
                days = int(match.group(1))

        # 6 sorteios diários no RJ (PPT, PTM, PT, PTV, PTN, COR)
        draws_est = days * 6

        grp = ANIMAL_NAME_TO_GROUP.get(animal_name.lower().strip())
        if not grp:
            # Fallback pela imagem se necessário
            img = tds[1].find("img")
            if img and img.get("src"):
                src_match = re.search(r"/(\d+)\.png", img["src"])
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

    if not parsed_items:
        raise ValueError("Nenhum bicho atrasado pôde ser extraído da página.")

    # Salva / atualiza no SQLite
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
        "source": SOURCE_URL,
        "total_animals": len(parsed_items),
        "items": parsed_items,
        "message": f"{len(parsed_items)} bichos atrasados sincronizados com sucesso!"
    }


def get_cached_bichocerto_atrasados() -> List[Dict[str, Any]]:
    """
    Retorna o ranking de atrasados armazenado no banco,
    ordenado pela posição no ranking (do mais atrasado para o menos atrasado).
    Se o banco estiver vazio, dispara a sincronização automática.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM bichocerto_atrasados ORDER BY ranking_pos ASC")
        rows = cursor.fetchall()

    if not rows:
        try:
            res = fetch_and_sync_bichocerto_atrasados()
            return res.get("items", [])
        except Exception:
            return []

    result = []
    for r in rows:
        grp = r["group_number"]
        anim_info = get_animal_info(grp)
        result.append({
            "group_number": grp,
            "ranking_pos": r["ranking_pos"],
            "animal_name": r["animal_name"],
            "delay_text": r["delay_text"],
            "delay_days": r["delay_days"],
            "delay_draws_est": r["delay_draws_est"],
            "animal_emoji": anim_info["emoji"],
            "tens": anim_info["tens"]
        })
    return result
