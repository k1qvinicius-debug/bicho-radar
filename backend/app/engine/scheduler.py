"""
Módulo do Agendador e Worker em Segundo Plano (Background Scraper Scheduler).
Monitora horários oficiais de extração de todas as loterias (RJ, Look, Nacional, SP e Federal),
dispara sincronizações inteligentes nos momentos de alta probabilidade de apuração,
gerencia janelas ativas vs ociosas para evitar bloqueios, e dispara auditorias automáticas.
"""

import asyncio
import random
import logging
from collections import deque
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional

from .scraper import fetch_and_sync_results
from ..domain import LOTTERIES, get_lottery_slots

logger = logging.getLogger("bicho_analytics.scheduler")


def parse_slot_time_today(time_str: str, base_dt: Optional[datetime] = None) -> datetime:
    """Converte '14:20' para objeto datetime correspondente na data de referência (hoje)."""
    now = base_dt or datetime.now()
    try:
        parts = time_str.strip().split(":")
        h = int(parts[0])
        m = int(parts[1]) if len(parts) > 1 else 0
        return datetime(now.year, now.month, now.day, h, m, 0)
    except Exception:
        return now


def get_all_scheduled_slots_for_today(base_dt: Optional[datetime] = None) -> List[Dict[str, Any]]:
    """
    Retorna todos os horários de sorteio programados para a data indicada,
    abrangendo RJ, LOOK, NACIONAL, SP e FEDERAL.
    """
    now = base_dt or datetime.now()
    date_str = now.strftime("%Y-%m-%d")
    scheduled = []

    for lot_code, lot_info in LOTTERIES.items():
        slots = get_lottery_slots(lot_code, target_date=date_str)
        for s in slots:
            t_str = s.get("time", "12:00")
            slot_dt = parse_slot_time_today(t_str, base_dt=now)
            scheduled.append({
                "lottery": lot_code,
                "lottery_name": lot_info["name"],
                "slot_code": s["code"],
                "slot_name": s["name"],
                "time_str": t_str,
                "slot_datetime": slot_dt,
            })

    # Ordena cronologicamente pelo horário do sorteio
    scheduled.sort(key=lambda x: x["slot_datetime"])
    return scheduled


def get_upcoming_and_active_slots(base_dt: Optional[datetime] = None) -> Dict[str, Any]:
    """
    Calcula:
    1. Se estamos em uma 'Janela Ativa' (até 35 minutos após a extração oficial de qualquer banca).
    2. O próximo sorteio programado mais próximo.
    3. O sorteio mais recente que acabou de ocorrer.
    """
    now = base_dt or datetime.now()
    slots = get_all_scheduled_slots_for_today(base_dt=now)

    active_draws = []
    upcoming_draw = None
    most_recent_draw = None

    for s in slots:
        diff_seconds = (now - s["slot_datetime"]).total_seconds()
        # Janela Ativa: de 0 a 40 minutos após o horário da extração (momento que os sites postam os números)
        if 0 <= diff_seconds <= (40 * 60):
            active_draws.append(s)

        if diff_seconds > 0:
            most_recent_draw = s
        elif diff_seconds <= 0 and upcoming_draw is None:
            upcoming_draw = s

    is_in_active_window = len(active_draws) > 0

    return {
        "is_in_active_window": is_in_active_window,
        "active_draws": [
            {
                "lottery": a["lottery"],
                "slot_code": a["slot_code"],
                "slot_name": a["slot_name"],
                "time": a["time_str"],
                "minutes_ago": int((now - a["slot_datetime"]).total_seconds() // 60)
            } for a in active_draws
        ],
        "upcoming_draw": {
            "lottery": upcoming_draw["lottery"],
            "slot_code": upcoming_draw["slot_code"],
            "slot_name": upcoming_draw["slot_name"],
            "time": upcoming_draw["time_str"],
            "minutes_until": max(0, int((upcoming_draw["slot_datetime"] - now).total_seconds() // 60))
        } if upcoming_draw else None,
        "most_recent_draw": {
            "lottery": most_recent_draw["lottery"],
            "slot_code": most_recent_draw["slot_code"],
            "time": most_recent_draw["time_str"],
            "minutes_ago": int((now - most_recent_draw["slot_datetime"]).total_seconds() // 60)
        } if most_recent_draw else None
    }


def calculate_next_sleep_interval(base_dt: Optional[datetime] = None) -> int:
    """
    Determina o tempo de espera (em segundos) até a próxima raspagem:
    - Janela Ativa (pós-sorteio imediato): 120s (2 min) + jitter aleatório.
    - Janela Pré-Sorteio (15 min antes): 180s (3 min) + jitter aleatório.
    - Diurno sem sorteio iminente: 600s (10 min) + jitter aleatório.
    - Madrugada (23:30 às 06:30): 1800s (30 min).
    """
    now = base_dt or datetime.now()
    hour = now.hour

    info = get_upcoming_and_active_slots(base_dt=now)

    # 1. Se estamos em janela ativa (sorteio acabou de correr e resultado está saindo):
    if info["is_in_active_window"]:
        # 120s a 150s (2 a 2.5 minutos)
        return random.randint(45, 75)

    # 2. Se há sorteio nos próximos 15 minutos:
    upcoming = info.get("upcoming_draw")
    if upcoming and upcoming.get("minutes_until", 999) <= 15:
        # 180s a 240s (3 a 4 minutos)
        return random.randint(180, 240)

    # 3. Madrugada (repouso)
    if hour >= 23 or hour < 7:
        return random.randint(1800, 2400)

    # 4. Dia regular entre sorteios (07h às 23h): checagem leve
    return random.randint(120, 180)


class BackgroundScraperWorker:
    """
    Worker autônomo assíncrono para execução contínua de raspagem em background.
    """
    def __init__(self):
        self.enabled: bool = True
        self.is_running: bool = False
        self._task: Optional[asyncio.Task] = None
        self._stop_event = asyncio.Event()

        self.last_run_at: Optional[str] = None
        self.next_run_at: Optional[str] = None
        self.last_results_count: int = 0
        self.last_evaluations_count: int = 0
        self.last_updated_slots: List[str] = []
        self.last_error: Optional[str] = None
        self.total_cycles: int = 0
        self.successful_cycles: int = 0
        self.error_cycles: int = 0

        # Buffer circular em memória das últimas 25 sincronizações
        self.sync_history: deque = deque(maxlen=25)

    def start(self) -> None:
        """Inicia a rotina assíncrona caso ainda não esteja em execução."""
        if self.is_running:
            return
        self.is_running = True
        self._stop_event.clear()
        self._task = asyncio.create_task(self._worker_loop())
        logger.info("BackgroundScraperWorker iniciado com sucesso.")

    def stop(self) -> None:
        """Para graciosamente o loop assíncrono."""
        if not self.is_running:
            return
        self.is_running = False
        self._stop_event.set()
        if self._task and not self._task.done():
            self._task.cancel()
        logger.info("BackgroundScraperWorker parado.")

    def toggle(self, enable: Optional[bool] = None) -> bool:
        """Ativa ou pausa as sincronizações automáticas."""
        if enable is not None:
            self.enabled = bool(enable)
        else:
            self.enabled = not self.enabled
        return self.enabled

    async def run_now(self, target_lottery: Optional[str] = None) -> Dict[str, Any]:
        """Executa imediatamente um ciclo de sincronização sob demanda."""
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        try:
            # Executa a raspagem em thread separada para não bloquear o loop do FastAPI
            result = await asyncio.to_thread(fetch_and_sync_results, target_lottery)
            
            draws_count = result.get("draws_synced", 0)
            evals_count = result.get("evaluations_triggered", 0)
            updated_slots = result.get("updated_slots", [])

            self.last_run_at = now_str
            self.last_results_count = draws_count
            self.last_evaluations_count = evals_count
            self.last_updated_slots = updated_slots
            self.last_error = None
            self.total_cycles += 1
            self.successful_cycles += 1

            log_entry = {
                "timestamp": now_str,
                "type": "manual" if target_lottery else "auto",
                "lottery": target_lottery or "ALL",
                "draws_synced": draws_count,
                "evaluations": evals_count,
                "updated_slots": updated_slots,
                "success": True,
                "message": result.get("message", "Sincronizado")
            }
            self.sync_history.appendleft(log_entry)
            return result
        except Exception as e:
            self.total_cycles += 1
            self.error_cycles += 1
            self.last_error = str(e)
            log_entry = {
                "timestamp": now_str,
                "type": "manual" if target_lottery else "auto",
                "lottery": target_lottery or "ALL",
                "draws_synced": 0,
                "evaluations": 0,
                "updated_slots": [],
                "success": False,
                "message": f"Erro: {e}"
            }
            self.sync_history.appendleft(log_entry)
            return {"success": False, "error": str(e), "draws_synced": 0}

    async def _worker_loop(self) -> None:
        """Loop contínuo com janelas inteligentes de espera."""
        # Pequeno atraso inicial de 8 segundos na inicialização para permitir inicialização total do FastAPI
        try:
            await asyncio.sleep(8)
        except asyncio.CancelledError:
            return

        while self.is_running and not self._stop_event.is_set():
            if self.enabled:
                try:
                    await self.run_now()
                except Exception as loop_err:
                    logger.error(f"Erro no ciclo do worker de scraping: {loop_err}")

            # Calcula tempo até a próxima execução inteligente
            sleep_secs = calculate_next_sleep_interval()
            next_dt = datetime.now() + timedelta(seconds=sleep_secs)
            self.next_run_at = next_dt.strftime("%Y-%m-%d %H:%M:%S")

            try:
                # Aguarda com suporte a cancelamento imediato caso receba sinal de parada
                await asyncio.wait_for(self._stop_event.wait(), timeout=sleep_secs)
                break
            except asyncio.TimeoutError:
                # Timeout normal esperado: avança para o próximo ciclo
                pass
            except asyncio.CancelledError:
                break

    def get_status(self) -> Dict[str, Any]:
        """Retorna o status completo e métricas operacionais do worker."""
        now = datetime.now()
        schedule_info = get_upcoming_and_active_slots(base_dt=now)

        return {
            "worker_active": self.is_running,
            "auto_sync_enabled": self.enabled,
            "status": "running" if (self.is_running and self.enabled) else ("paused" if not self.enabled else "stopped"),
            "last_run_at": self.last_run_at,
            "next_run_at": self.next_run_at,
            "last_results_count": self.last_results_count,
            "last_evaluations_count": self.last_evaluations_count,
            "last_updated_slots": self.last_updated_slots,
            "last_error": self.last_error,
            "metrics": {
                "total_cycles": self.total_cycles,
                "successful_cycles": self.successful_cycles,
                "error_cycles": self.error_cycles,
            },
            "schedule": schedule_info,
            "sync_history": list(self.sync_history)
        }


# Instância única global do worker
scraper_worker = BackgroundScraperWorker()
