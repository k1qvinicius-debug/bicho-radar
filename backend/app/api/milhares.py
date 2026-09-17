"""
Módulo de Milhares Atrasadas & Estatísticas - Bicho Master.
Coleta e disponibiliza o ranking das milhares mais atrasadas (maior seca),
mais sorteadas e permite o rastreamento individual de qualquer milhar de 0000 a 9999.
"""

import re
import time
import logging
from datetime import datetime, date
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger("bicho_master.milhares")

router = APIRouter(prefix="/milhares", tags=["Milhares Atrasadas"])

# Mapeamento oficial dos 25 Bichos
BICHOS_INFO = [
    {"grupo": 1, "nome": "Avestruz", "icone": "🪶", "dezenas": ["01", "02", "03", "04"]},
    {"grupo": 2, "nome": "Águia", "icone": "🦅", "dezenas": ["05", "06", "07", "08"]},
    {"grupo": 3, "nome": "Burro", "icone": "🐴", "dezenas": ["09", "10", "11", "12"]},
    {"grupo": 4, "nome": "Borboleta", "icone": "🦋", "dezenas": ["13", "14", "15", "16"]},
    {"grupo": 5, "nome": "Cachorro", "icone": "🐶", "dezenas": ["17", "18", "19", "20"]},
    {"grupo": 6, "nome": "Cabra", "icone": "🐐", "dezenas": ["21", "22", "23", "24"]},
    {"grupo": 7, "nome": "Carneiro", "icone": "🐑", "dezenas": ["25", "26", "27", "28"]},
    {"grupo": 8, "nome": "Camelo", "icone": "🐪", "dezenas": ["29", "30", "31", "32"]},
    {"grupo": 9, "nome": "Cobra", "icone": "🐍", "dezenas": ["33", "34", "35", "36"]},
    {"grupo": 10, "nome": "Coelho", "icone": "🐇", "dezenas": ["37", "38", "39", "40"]},
    {"grupo": 11, "nome": "Cavalo", "icone": "🐎", "dezenas": ["41", "42", "43", "44"]},
    {"grupo": 12, "nome": "Elefante", "icone": "🐘", "dezenas": ["45", "46", "47", "48"]},
    {"grupo": 13, "nome": "Galo", "icone": "🐓", "dezenas": ["49", "50", "51", "52"]},
    {"grupo": 14, "nome": "Gato", "icone": "🐱", "dezenas": ["53", "54", "55", "56"]},
    {"grupo": 15, "nome": "Jacaré", "icone": "🐊", "dezenas": ["57", "58", "59", "60"]},
    {"grupo": 16, "nome": "Leão", "icone": "🦁", "dezenas": ["61", "62", "63", "64"]},
    {"grupo": 17, "nome": "Macaco", "icone": "🐒", "dezenas": ["65", "66", "67", "68"]},
    {"grupo": 18, "nome": "Porco", "icone": "🐷", "dezenas": ["69", "70", "71", "72"]},
    {"grupo": 19, "nome": "Pavão", "icone": "🦚", "dezenas": ["73", "74", "75", "76"]},
    {"grupo": 20, "nome": "Peru", "icone": "🦃", "dezenas": ["77", "78", "79", "80"]},
    {"grupo": 21, "nome": "Touro", "icone": "🐂", "dezenas": ["81", "82", "83", "84"]},
    {"grupo": 22, "nome": "Tigre", "icone": "🐅", "dezenas": ["85", "86", "87", "88"]},
    {"grupo": 23, "nome": "Urso", "icone": "🐻", "dezenas": ["89", "90", "91", "92"]},
    {"grupo": 24, "nome": "Veado", "icone": "🦌", "dezenas": ["93", "94", "95", "96"]},
    {"grupo": 25, "nome": "Vaca", "icone": "🐄", "dezenas": ["97", "98", "99", "00"]},
]


def get_bicho_for_milhar(milhar_str: str) -> Dict[str, Any]:
    """Determina o Grupo e Bicho baseado nos 2 últimos dígitos (dezena)."""
    clean_m = milhar_str.zfill(4)
    dezena = int(clean_m[-2:])
    if dezena == 0:
        grupo = 25
    else:
        grupo = ((dezena - 1) // 4) + 1
    info = BICHOS_INFO[grupo - 1]
    return {
        "grupo": grupo,
        "bicho": info["nome"],
        "icone": info["icone"],
        "dezena": clean_m[-2:],
        "centena": clean_m[-3:],
    }


def parse_days_ago(date_str: str) -> Optional[int]:
    """Calcula quantidade aproximada de dias decorridos desde a data informada."""
    if not date_str:
        return None
    date_clean = date_str.strip().replace("/", "-")
    for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d-%m-%y"):
        try:
            dt = datetime.strptime(date_clean, fmt).date()
            diff = (date.today() - dt).days
            return max(0, diff)
        except ValueError:
            continue
    return None


# Cache em memória para os rankings de milhares (TTL: 1 hora)
_CACHE_RANKINGS: Dict[str, Any] = {
    "data": None,
    "expires_at": 0.0,
}

# Cache de busca individual (TTL: 30 minutos por milhar)
_CACHE_MILHARES: Dict[str, Dict[str, Any]] = {}

HTTP_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
}


def _parse_table_rows(table) -> List[Dict[str, Any]]:
    """Extrai linhas da tabela com enriquecimento estatístico."""
    results = []
    rows = table.find_all("tr")
    if len(rows) < 2:
        return results

    for tr in rows[1:]:
        tds = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
        if len(tds) >= 4:
            milhar = tds[0].zfill(4)
            bicho_data = get_bicho_for_milhar(milhar)
            dias_atraso = parse_days_ago(tds[1])
            results.append({
                "milhar": milhar,
                "ultima_data": tds[1],
                "extracao": tds[2],
                "premio": tds[3],
                "dias_atraso": dias_atraso,
                "grupo": bicho_data["grupo"],
                "bicho": bicho_data["bicho"],
                "icone": bicho_data["icone"],
                "centena": bicho_data["centena"],
                "dezena": bicho_data["dezena"],
            })
    return results


async def fetch_rankings_data() -> Dict[str, Any]:
    """Realiza o scraping dos rankings gerais (RJ e Federal) com cache automático."""
    now = time.time()
    if _CACHE_RANKINGS["data"] and now < _CACHE_RANKINGS["expires_at"]:
        return _CACHE_RANKINGS["data"]

    data: Dict[str, Any] = {
        "rj_atrasadas": [],
        "rj_frequentes": [],
        "federal_atrasadas": [],
        "federal_frequentes": [],
        "updated_at": datetime.now().isoformat(),
    }

    async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=15.0, follow_redirects=True) as client:
        # 1. Scraping RJ (Geral)
        try:
            r_rj = await client.get("https://www.ojogodobicho.com/milhar.htm")
            if r_rj.status_code == 200:
                soup = BeautifulSoup(r_rj.text, "html.parser")
                tables = soup.find_all("table")
                if len(tables) >= 2:
                    data["rj_frequentes"] = _parse_table_rows(tables[0])
                    data["rj_atrasadas"] = _parse_table_rows(tables[1])
        except Exception as e:
            logger.warning(f"Aviso ao consultar milhares RJ: {e}")

        # 2. Scraping Federal
        try:
            r_fed = await client.get("https://www.ojogodobicho.com/milharf.htm")
            if r_fed.status_code == 200:
                soup_fed = BeautifulSoup(r_fed.text, "html.parser")
                tables_fed = soup_fed.find_all("table")
                if len(tables_fed) >= 2:
                    data["federal_frequentes"] = _parse_table_rows(tables_fed[0])
                    data["federal_atrasadas"] = _parse_table_rows(tables_fed[1])
        except Exception as e:
            logger.warning(f"Aviso ao consultar milhares Federal: {e}")

    # Atualiza cache (1 hora)
    if data["rj_atrasadas"] or data["federal_atrasadas"]:
        _CACHE_RANKINGS["data"] = data
        _CACHE_RANKINGS["expires_at"] = now + 3600

    return data or _CACHE_RANKINGS["data"] or {}


@router.get("/rankings")
async def get_milhares_rankings():
    """Retorna os rankings consolidados de milhares mais atrasadas e mais sorteadas."""
    data = await fetch_rankings_data()
    return {
        "success": True,
        "data": data,
        "total_rj_atrasadas": len(data.get("rj_atrasadas", [])),
        "total_federal_atrasadas": len(data.get("federal_atrasadas", [])),
    }


@router.get("/rastreador/{milhar}")
async def rastrear_milhar(milhar: str):
    """
    Rastreia qualquer milhar de 0000 a 9999.
    Retorna métricas históricas de atraso, frequência, última aparição e seca de 1º prêmio.
    Totalmente white-label (sem referências a marcas externas).
    """
    clean_digits = re.sub(r"\D", "", milhar)
    if not clean_digits:
        raise HTTPException(status_code=400, detail="Milhar inválida. Digite de 1 a 4 dígitos numéricos.")

    m_str = clean_digits[-4:].zfill(4)
    now = time.time()

    # Verifica cache individual
    if m_str in _CACHE_MILHARES:
        cache_entry = _CACHE_MILHARES[m_str]
        if now < cache_entry["expires_at"]:
            return cache_entry["data"]

    bicho_data = get_bicho_for_milhar(m_str)

    result_data: Dict[str, Any] = {
        "milhar": m_str,
        "grupo": bicho_data["grupo"],
        "bicho": bicho_data["bicho"],
        "icone": bicho_data["icone"],
        "centena": bicho_data["centena"],
        "dezena": bicho_data["dezena"],
        "vezes_sorteada": "Em análise",
        "vezes_sorteada_detalhes": "",
        "ultima_vez": "Não localizada recentemente",
        "ultima_vez_detalhes": "",
        "seca_primeiro_premio": "Dados estatísticos em processamento",
        "seca_primeiro_premio_detalhes": "",
        "onde_mais_sai": "Distribuição homogênea",
        "alerta_seca": None,
        "historico_recente": [],
    }

    try:
        url = f"https://www.ojogodobicho.com/milhar/{m_str}/"
        async with httpx.AsyncClient(headers=HTTP_HEADERS, timeout=12.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                soup = BeautifulSoup(resp.text, "html.parser")

                cards = soup.find_all("div", class_="mx-card")
                for c in cards:
                    h = c.find("div", class_="h")
                    v = c.find("div", class_="v")
                    m = c.find("div", class_="m")

                    title = h.get_text(strip=True).lower() if h else ""
                    val = v.get_text(" ", strip=True) if v else ""
                    meta = m.get_text(" ", strip=True) if m else ""

                    if "vezes" in title:
                        result_data["vezes_sorteada"] = val
                        result_data["vezes_sorteada_detalhes"] = meta
                    elif "última" in title or "ultima" in title:
                        result_data["ultima_vez"] = val
                        result_data["ultima_vez_detalhes"] = meta
                    elif "seca" in title:
                        result_data["seca_primeiro_premio"] = val
                        result_data["seca_primeiro_premio_detalhes"] = meta
                    elif "onde mais" in title:
                        result_data["onde_mais_sai"] = val

                # Alerta de seca no topo
                seca_el = soup.find("div", class_="mx-seca")
                if seca_el:
                    raw_text = seca_el.get_text(" ", strip=True)
                    # Limpeza para garantir formato neutro e white-label
                    clean_text = raw_text.replace("oJogodoBicho.com", "Bicho Master").replace("ojogodobicho.com", "Bicho Master")
                    clean_text = clean_text.replace("🏆", "🎯").strip()
                    result_data["alerta_seca"] = clean_text

                # Tabela de aparições recentes
                table = soup.find("table", class_="mx-tb")
                if table:
                    for tr in table.find_all("tr")[1:8]:
                        cols = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
                        if len(cols) >= 3:
                            result_data["historico_recente"].append({
                                "data": cols[0],
                                "extracao": cols[1] if len(cols) > 1 else "",
                                "premio": cols[2] if len(cols) > 2 else "",
                                "detalhe": cols[3] if len(cols) > 3 else "",
                            })
    except Exception as e:
        logger.warning(f"Aviso ao consultar milhar {m_str}: {e}")

    response_payload = {
        "success": True,
        "data": result_data,
    }

    # Salva no cache por 30 minutos
    _CACHE_MILHARES[m_str] = {
        "data": response_payload,
        "expires_at": now + 1800,
    }

    return response_payload
