"""
Módulo Scraper de Resultados em Tempo Real Multi-Loteria.
Extrai e sincroniza os últimos resultados oficiais:
- Rio de Janeiro (RJ) e Federal: Deu no Poste (ojogodobicho.com/deu_no_poste.htm)
- Look Loterias (Goiás): Bicho Certo (bichocerto.com/resultados/lk/look)
- Loteria Nacional: Bicho Certo (bichocerto.com/resultados/ln/loteria-nacional)
- São Paulo (Bandeirantes/PT-SP): Bicho Certo (bichocerto.com/resultados/sp/pt-band)
"""

import re
from datetime import datetime
from typing import Dict, Any, List, Optional
import httpx
from bs4 import BeautifulSoup

from ..database import get_db_connection
from ..domain import format_milhar
from .evaluator import evaluate_draw_against_snapshots, ensure_snapshots_and_evaluate_for_draw

TARGET_URL_RJ = "https://www.ojogodobicho.com/deu_no_poste.htm"
URL_LOOK_OJOGODOBICHO = "https://www.ojogodobicho.com/look/deu-no-poste.htm"

BICHOCERTO_LOTTERY_URLS = {
    "LOOK": "https://bichocerto.com/resultados/lk/look/",
    "NACIONAL": "https://bichocerto.com/resultados/ln/loteria-nacional/",
    "SP": "https://bichocerto.com/resultados/sp/pt-band/",
}

MONTHS_PT = {
    "janeiro": 1, "fevereiro": 2, "março": 3, "marco": 3,
    "abril": 4, "maio": 5, "junho": 6, "julho": 7,
    "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12
}

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
}


def clean_number(text: str) -> str:
    """Extrai apenas a milhar de um texto como '7155-14' -> '7155'. Retorna vazio se não houver dígitos."""
    if not text:
        return ""
    part = text.split("-")[0].strip()
    digits = re.sub(r"\D", "", part)
    if not digits:
        return ""
    return format_milhar(digits)


def parse_date_from_text(title_text: str, caption_text: str) -> str:
    """Extrai data no formato YYYY-MM-DD a partir do título ou caption."""
    m_title = re.search(r"(\d{2})/(\d{2})/(\d{4})", title_text)
    if m_title:
        d, m, y = m_title.groups()
        return f"{y}-{m}-{d}"

    m_cap = re.search(r"(\d{1,2})\s+de\s+([A-Za-zç]+)\s+de\s+(\d{4})", caption_text, re.IGNORECASE)
    if m_cap:
        d_str, month_name, y_str = m_cap.groups()
        month_num = MONTHS_PT.get(month_name.lower(), datetime.now().month)
        return f"{int(y_str):04d}-{month_num:02d}-{int(d_str):02d}"

    return datetime.now().strftime("%Y-%m-%d")


def sync_rj_and_federal(url: str = TARGET_URL_RJ) -> Dict[str, Any]:
    """
    Busca o HTML ao vivo de deu_no_poste.htm, extrai os sorteios do dia e sorteios anteriores (RJ e Federal),
    persiste na tabela draw_results e dispara auditorias automáticas.
    """
    try:
        response = httpx.get(url, timeout=12.0, headers=DEFAULT_HEADERS, follow_redirects=True)
        response.raise_for_status()
    except Exception as e:
        return {"updated_slots": [], "evaluations": 0, "error": f"Erro RJ/Federal: {e}"}

    soup = BeautifulSoup(response.text, "html.parser")
    tables = soup.find_all("table")
    if not tables:
        return {"updated_slots": [], "evaluations": 0, "error": "Nenhuma tabela encontrada no RJ"}

    title_text = soup.title.string if soup.title else ""
    draw_ids_to_evaluate: List[int] = []
    updated_slots = []

    # 1. PROCESSA TABELA DO DIA (Tabela 0)
    t0 = tables[0]
    cap0 = t0.find("caption")
    caption_text = cap0.get_text(strip=True) if cap0 else ""
    today_date = parse_date_from_text(title_text, caption_text)
    today_dt = datetime.strptime(today_date, "%Y-%m-%d")
    today_dow = today_dt.weekday()

    thead = t0.find("thead")
    th_elements = thead.find_all("th") if thead else []
    slot_headers = [th.get_text(strip=True).upper() for th in th_elements]

    col_to_slot: Dict[int, str] = {}
    for idx, h in enumerate(slot_headers):
        if h in ["PPT", "PTM", "PT", "PTV", "PTN", "FED", "COR"]:
            col_to_slot[idx] = h

    today_prizes: Dict[str, Dict[int, str]] = {s: {} for s in col_to_slot.values()}

    tbody = t0.find("tbody")
    if tbody:
        for tr in tbody.find_all("tr"):
            tds = tr.find_all("td")
            if not tds:
                continue
            premio_str = tds[0].get_text(strip=True)
            premio_digits = re.sub(r"\D", "", premio_str)
            if not premio_digits:
                continue
            premio_num = int(premio_digits)

            for col_idx, td in enumerate(tds):
                if col_idx in col_to_slot:
                    slot_name = col_to_slot[col_idx]
                    val = clean_number(td.get_text(strip=True))
                    today_prizes[slot_name][premio_num] = val

    with get_db_connection() as conn:
        cursor = conn.cursor()
        for slot, p_map in today_prizes.items():
            p1 = p_map.get(1, "")
            p2 = p_map.get(2, "")
            p3 = p_map.get(3, "")
            p4 = p_map.get(4, "")
            p5 = p_map.get(5, "")
            p6 = p_map.get(6) or None
            p7 = p_map.get(7) or None

            if (p1 and p2 and p3 and p4 and p5 and
                len(p1) == 4 and len(p2) == 4 and len(p3) == 4 and len(p4) == 4 and len(p5) == 4 and
                not (p1 == "0000" and p2 == "0000" and p3 == "0000" and p4 == "0000" and p5 == "0000")):

                lottery_val = "FEDERAL" if slot == "FED" else "RJ"

                cursor.execute("""
                    INSERT INTO draw_results (
                        draw_date, slot, day_of_week,
                        prize_1, prize_2, prize_3, prize_4, prize_5, prize_6, prize_7,
                        lottery
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(draw_date, slot) DO UPDATE SET
                        prize_1 = excluded.prize_1,
                        prize_2 = excluded.prize_2,
                        prize_3 = excluded.prize_3,
                        prize_4 = excluded.prize_4,
                        prize_5 = excluded.prize_5,
                        prize_6 = excluded.prize_6,
                        prize_7 = excluded.prize_7,
                        lottery = excluded.lottery
                """, (today_date, slot, today_dow, p1, p2, p3, p4, p5, p6, p7, lottery_val))

                cursor.execute("SELECT id FROM draw_results WHERE draw_date = ? AND slot = ?", (today_date, slot))
                row = cursor.fetchone()
                if row:
                    draw_ids_to_evaluate.append(row[0])
                    updated_slots.append(f"{lottery_val}: {slot} ({today_date})")

    # 2. PROCESSA TABELA DE RESULTADOS ANTERIORES (Tabela 1)
    if len(tables) > 1:
        t1 = tables[1]
        t1_tbody = t1.find("tbody")
        if t1_tbody:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                year = today_dt.year

                for tr in t1_tbody.find_all("tr"):
                    tds = [td.get_text(strip=True) for td in tr.find_all("td")]
                    if len(tds) >= 7 and "/" in tds[0]:
                        try:
                            d_parts = tds[0].split("/")
                            day_p = int(d_parts[0])
                            month_p = int(d_parts[1])
                            prev_date = f"{year:04d}-{month_p:02d}-{day_p:02d}"
                            prev_dt = datetime.strptime(prev_date, "%Y-%m-%d")
                            prev_dow = prev_dt.weekday()

                            prev_slot = tds[1].strip().upper()
                            p1 = clean_number(tds[2])
                            p2 = clean_number(tds[3])
                            p3 = clean_number(tds[4])
                            p4 = clean_number(tds[5])
                            p5 = clean_number(tds[6])

                            lottery_val = "FEDERAL" if prev_slot == "FED" else "RJ"

                            cursor.execute("""
                                INSERT INTO draw_results (
                                    draw_date, slot, day_of_week,
                                    prize_1, prize_2, prize_3, prize_4, prize_5,
                                    lottery
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ON CONFLICT(draw_date, slot) DO UPDATE SET
                                    prize_1 = excluded.prize_1,
                                    prize_2 = excluded.prize_2,
                                    prize_3 = excluded.prize_3,
                                    prize_4 = excluded.prize_4,
                                    prize_5 = excluded.prize_5,
                                    lottery = excluded.lottery
                            """, (prev_date, prev_slot, prev_dow, p1, p2, p3, p4, p5, lottery_val))

                            cursor.execute("SELECT id FROM draw_results WHERE draw_date = ? AND slot = ?", (prev_date, prev_slot))
                            row = cursor.fetchone()
                            if row:
                                draw_ids_to_evaluate.append(row[0])
                                updated_slots.append(f"{lottery_val}: {prev_slot} ({prev_date})")
                        except Exception:
                            continue

    evaluations_count = 0
    unique_draw_ids = list(set(draw_ids_to_evaluate))
    for d_id in unique_draw_ids:
        try:
            evals = ensure_snapshots_and_evaluate_for_draw(d_id)
            evaluations_count += len(evals)
        except Exception:
            pass

    return {
        "updated_slots": updated_slots,
        "evaluations": evaluations_count
    }


def sync_bichocerto_lottery(lottery_code: str, url: str) -> Dict[str, Any]:
    """
    Extrai e persiste sorteios apurados em tempo real para Look Goiás, Nacional ou SP do Bicho Certo.
    """
    updated_slots = []
    draw_ids_to_evaluate = []

    try:
        r = httpx.get(url, headers=DEFAULT_HEADERS, follow_redirects=True, timeout=12.0)
        r.raise_for_status()
    except Exception as e:
        return {"updated_slots": [], "evaluations": 0, "error": f"Erro {lottery_code}: {e}"}

    soup = BeautifulSoup(r.text, "html.parser")
    cards = soup.find_all("div", id=lambda x: x and x.startswith("div_display_"))

    with get_db_connection() as conn:
        cursor = conn.cursor()
        for card in cards:
            header_el = card.find("div", class_=lambda c: c and "bg-secondary" in c)
            header_text = header_el.get_text(" ", strip=True) if header_el else ""

            # Extrai hora da extração
            m_time = re.search(r"(\d{1,2})[:h](\d{2})", header_text)
            hour_num = 0
            if m_time:
                hour_num = int(m_time.group(1))
            else:
                m_h = re.search(r"(\d{1,2})h", header_text)
                if m_h:
                    hour_num = int(m_h.group(1))

            # Extrai data da extração
            m_date = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", header_text)
            if m_date:
                d, m, y = m_date.groups()
                draw_date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
            else:
                draw_date = datetime.now().strftime("%Y-%m-%d")

            draw_dt = datetime.strptime(draw_date, "%Y-%m-%d")
            draw_dow = draw_dt.weekday()

            if lottery_code == "LOOK":
                slot_code = f"LK-{hour_num:02d}"
            elif lottery_code == "NACIONAL":
                slot_code = f"LN-{hour_num:02d}"
            elif lottery_code == "SP":
                # SP suporta estritamente os 7 horários oficiais:
                # 08:20 (SP-08), 10:00 (SP-10), 13:00 (SP-13), 15:30 (SP-15), 17:00 (SP-17), 19:00 (SP-19), 20:00 (SP-20)
                if hour_num not in [8, 10, 13, 15, 17, 19, 20]:
                    continue
                slot_code = f"SP-{hour_num:02d}"
            else:
                slot_code = f"{lottery_code}-{hour_num:02d}"

            table = card.find("table")
            if not table:
                continue

            prizes = {}
            for tr in table.find_all("tr"):
                tds = tr.find_all("td")
                if not tds:
                    continue
                ord_txt = tds[0].get_text(strip=True)
                digits = re.sub(r"\D", "", ord_txt)
                if not digits:
                    continue
                p_ord = int(digits)
                if p_ord in prizes or p_ord > 7:
                    continue

                for td in tds[1:]:
                    txt = td.get_text(strip=True)
                    clean_d = re.sub(r"\D", "", txt)
                    if len(clean_d) in [3, 4]:
                        prizes[p_ord] = format_milhar(clean_d)
                        break

            p1 = prizes.get(1, "")
            p2 = prizes.get(2, "")
            p3 = prizes.get(3, "")
            p4 = prizes.get(4, "")
            p5 = prizes.get(5, "")
            p6 = prizes.get(6) or None
            p7 = prizes.get(7) or None

            if (p1 and p2 and p3 and p4 and p5 and
                len(p1) == 4 and len(p2) == 4 and len(p3) == 4 and len(p4) == 4 and len(p5) == 4 and
                not (p1 == "0000" and p2 == "0000" and p3 == "0000" and p4 == "0000" and p5 == "0000")):

                cursor.execute("""
                    INSERT INTO draw_results (
                        draw_date, slot, day_of_week,
                        prize_1, prize_2, prize_3, prize_4, prize_5, prize_6, prize_7,
                        lottery
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(draw_date, slot) DO UPDATE SET
                        prize_1 = excluded.prize_1,
                        prize_2 = excluded.prize_2,
                        prize_3 = excluded.prize_3,
                        prize_4 = excluded.prize_4,
                        prize_5 = excluded.prize_5,
                        prize_6 = excluded.prize_6,
                        prize_7 = excluded.prize_7,
                        lottery = excluded.lottery
                """, (draw_date, slot_code, draw_dow, p1, p2, p3, p4, p5, p6, p7, lottery_code))

                cursor.execute("SELECT id FROM draw_results WHERE draw_date = ? AND slot = ?", (draw_date, slot_code))
                row = cursor.fetchone()
                if row:
                    draw_ids_to_evaluate.append(row[0])
                    updated_slots.append(f"{lottery_code}: {slot_code} ({draw_date})")

    evaluations_count = 0
    unique_draw_ids = list(set(draw_ids_to_evaluate))
    for d_id in unique_draw_ids:
        try:
            evals = ensure_snapshots_and_evaluate_for_draw(d_id)
            evaluations_count += len(evals)
        except Exception:
            pass

    return {
        "updated_slots": updated_slots,
        "evaluations": evaluations_count
    }


def sync_look_from_ojogodobicho() -> Dict[str, Any]:
    """
    Extrai e sincroniza em tempo real todas as 8 extrações diárias da Look Goiás
    diretamente de https://www.ojogodobicho.com/look/deu-no-poste.htm.
    Cobre LK-07, LK-09, LK-11, LK-14, LK-16, LK-18, LK-21 e LK-23.
    """
    updated_slots = []
    draw_ids_to_evaluate = []

    try:
        r = httpx.get(URL_LOOK_OJOGODOBICHO, headers=DEFAULT_HEADERS, follow_redirects=True, timeout=12.0)
        r.raise_for_status()
    except Exception as e:
        return {"updated_slots": [], "evaluations": 0, "error": f"Erro Look (ojogodobicho): {e}"}

    soup = BeautifulSoup(r.text, "html.parser")

    # Extrai data de apuração da página (ex: 13/09/2026)
    draw_date = datetime.now().strftime("%Y-%m-%d")
    m_date = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", r.text[:3000])
    if m_date:
        d, m, y = m_date.groups()
        draw_date = f"{int(y):04d}-{int(m):02d}-{int(d):02d}"

    draw_dt = datetime.strptime(draw_date, "%Y-%m-%d")
    draw_dow = draw_dt.weekday()

    results_by_slot: Dict[str, Dict[str, Any]] = {}

    # Método 1: Tabela resumo com todas as colunas de horários
    table0 = soup.find("table")
    if table0:
        rows = table0.find_all("tr")
        if len(rows) >= 6:
            header_cols = [td.get_text(strip=True) for td in rows[0].find_all(["td", "th"])]
            slot_map = {}
            for col_idx, col_text in enumerate(header_cols):
                m_h = re.search(r"(\d{1,2})[:h](\d{2})?", col_text)
                if m_h:
                    hour = int(m_h.group(1))
                    slot_map[col_idx] = f"LK-{hour:02d}"

            for s_code in slot_map.values():
                results_by_slot[s_code] = {"draw_date": draw_date, "slot": s_code, "prizes": {}}

            for r_idx, row in enumerate(rows[1:8], start=1):
                tds = row.find_all(["td", "th"])
                for col_idx, s_code in slot_map.items():
                    if col_idx < len(tds):
                        cell_txt = tds[col_idx].get_text(strip=True)
                        m_num = re.search(r"^(\d{3,4})", cell_txt)
                        if m_num:
                            results_by_slot[s_code]["prizes"][r_idx] = format_milhar(m_num.group(1))

    # Método 2: Tabelas individuais de cada horário
    for table in soup.find_all("table")[1:]:
        prev_h = table.find_previous(["h2", "h3", "h4", "strong"])
        if not prev_h:
            continue
        h_text = prev_h.get_text(" ", strip=True)
        m_time = re.search(r"LOOK\s+(\d{1,2})[:h](\d{2})?", h_text, re.IGNORECASE)
        if not m_time:
            continue
        hour = int(m_time.group(1))
        slot_code = f"LK-{hour:02d}"

        if slot_code not in results_by_slot:
            results_by_slot[slot_code] = {"draw_date": draw_date, "slot": slot_code, "prizes": {}}

        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) >= 2:
                ord_m = re.search(r"(\d)", tds[0].get_text(strip=True))
                num_m = re.search(r"(\d{3,4})", tds[1].get_text(strip=True))
                if ord_m and num_m:
                    p_ord = int(ord_m.group(1))
                    if p_ord not in results_by_slot[slot_code]["prizes"]:
                        results_by_slot[slot_code]["prizes"][p_ord] = format_milhar(num_m.group(1))

    with get_db_connection() as conn:
        cursor = conn.cursor()
        for slot_code, s_data in results_by_slot.items():
            pz = s_data["prizes"]
            p1 = pz.get(1, "")
            p2 = pz.get(2, "")
            p3 = pz.get(3, "")
            p4 = pz.get(4, "")
            p5 = pz.get(5, "")
            p6 = pz.get(6) or None
            p7 = pz.get(7) or None

            if (p1 and p2 and p3 and p4 and p5 and
                len(p1) == 4 and len(p2) == 4 and len(p3) == 4 and len(p4) == 4 and len(p5) == 4 and
                not (p1 == "0000" and p2 == "0000" and p3 == "0000" and p4 == "0000" and p5 == "0000")):

                cursor.execute("""
                    INSERT INTO draw_results (
                        draw_date, slot, day_of_week,
                        prize_1, prize_2, prize_3, prize_4, prize_5, prize_6, prize_7,
                        lottery
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(draw_date, slot) DO UPDATE SET
                        prize_1 = excluded.prize_1,
                        prize_2 = excluded.prize_2,
                        prize_3 = excluded.prize_3,
                        prize_4 = excluded.prize_4,
                        prize_5 = excluded.prize_5,
                        prize_6 = excluded.prize_6,
                        prize_7 = excluded.prize_7,
                        lottery = excluded.lottery
                """, (draw_date, slot_code, draw_dow, p1, p2, p3, p4, p5, p6, p7, "LOOK"))

                cursor.execute("SELECT id FROM draw_results WHERE draw_date = ? AND slot = ?", (draw_date, slot_code))
                row = cursor.fetchone()
                if row:
                    draw_ids_to_evaluate.append(row[0])
                    updated_slots.append(f"LOOK: {slot_code} ({draw_date})")

    evaluations_count = 0
    unique_draw_ids = list(set(draw_ids_to_evaluate))
    for d_id in unique_draw_ids:
        try:
            evals = ensure_snapshots_and_evaluate_for_draw(d_id)
            evaluations_count += len(evals)
        except Exception:
            pass

    return {
        "updated_slots": updated_slots,
        "evaluations": evaluations_count
    }


def fetch_and_sync_results(target_lottery: Optional[str] = None) -> Dict[str, Any]:
    """
    Sincroniza os resultados de todas as loterias suportadas (ou da loteria indicada).
    Abrange Rio de Janeiro (RJ), Loteria Federal, Look Goiás, Loteria Nacional e São Paulo.
    """
    lot_filter = (target_lottery or "ALL").upper()
    all_updated_slots = []
    total_evaluations = 0

    # 1. Rio de Janeiro e Federal (Deu no Poste)
    if lot_filter in ["ALL", "RJ", "FEDERAL"]:
        rj_res = sync_rj_and_federal()
        all_updated_slots.extend(rj_res.get("updated_slots", []))
        total_evaluations += rj_res.get("evaluations", 0)

    # 2. Look Goiás (Multi-fonte: O Jogo do Bicho + Bicho Certo)
    if lot_filter in ["ALL", "LOOK"]:
        # Fonte 1: O Jogo do Bicho (robusto e não bloqueia datacenters)
        look_res1 = sync_look_from_ojogodobicho()
        all_updated_slots.extend(look_res1.get("updated_slots", []))
        total_evaluations += look_res1.get("evaluations", 0)

        # Fonte 2: Bicho Certo (complementar)
        look_res2 = sync_bichocerto_lottery("LOOK", BICHOCERTO_LOTTERY_URLS["LOOK"])
        all_updated_slots.extend(look_res2.get("updated_slots", []))
        total_evaluations += look_res2.get("evaluations", 0)

    # 3. Loteria Nacional
    if lot_filter in ["ALL", "NACIONAL"]:
        nac_res = sync_bichocerto_lottery("NACIONAL", BICHOCERTO_LOTTERY_URLS["NACIONAL"])
        all_updated_slots.extend(nac_res.get("updated_slots", []))
        total_evaluations += nac_res.get("evaluations", 0)

    # 4. São Paulo
    if lot_filter in ["ALL", "SP"]:
        sp_res = sync_bichocerto_lottery("SP", BICHOCERTO_LOTTERY_URLS["SP"])
        all_updated_slots.extend(sp_res.get("updated_slots", []))
        total_evaluations += sp_res.get("evaluations", 0)

    unique_slots = list(dict.fromkeys(all_updated_slots))

    return {
        "success": True,
        "target_lottery": lot_filter,
        "today_date": datetime.now().strftime("%Y-%m-%d"),
        "draws_synced": len(unique_slots),
        "updated_slots": unique_slots,
        "evaluations_triggered": total_evaluations,
        "message": f"Resultados sincronizados com sucesso! {len(unique_slots)} extrações atualizadas (RJ, Federal, Look, Nacional, SP).",
    }
