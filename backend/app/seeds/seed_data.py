"""
Gerador de Dados Semente (Seed Data) para o Bicho Analytics.
Popula o banco com histórico estatisticamente rico de sorteios dos últimos meses
e algumas análises prévias para demonstrar imediatamente o sistema de auditoria e acertos.
"""

import random
from datetime import datetime, timedelta
from typing import List, Dict
from ..database import get_db_connection, init_db
from ..domain import STANDARD_SLOTS, format_milhar
from ..engine.statistical_engine import StatisticalEngine
from ..api.analysis import create_snapshot
from ..models import SnapshotCreateRequest
from ..engine.evaluator import evaluate_draw_against_snapshots


def generate_seed_data(num_days: int = 45) -> int:
    """Gera histórico estruturado de sorteios nos últimos num_days dias."""
    init_db()

    slots_weekday = ["PPT", "PTM", "PT", "PTV", "PTN", "COR"]
    slots_wed = ["PPT", "PTM", "PT", "PTV", "FED", "COR"]

    start_date = datetime.now().date() - timedelta(days=num_days)
    draws_inserted = 0

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM draw_results")
        current_count = cursor.fetchone()[0]

        if current_count >= 50:
            print(f"Base de dados já contém {current_count} sorteios. Pulando geração de semente.")
            return current_count

        # Seed pseudo-aleatório determinístico para reprodutibilidade consistente
        rnd = random.Random(42)

        for d in range(num_days + 1):
            cur_date = start_date + timedelta(days=d)
            date_str = cur_date.strftime("%Y-%m-%d")
            weekday = cur_date.weekday()

            slots_today = slots_wed if weekday == 2 else slots_weekday

            for slot in slots_today:
                # Não gera sorteios futuros
                if cur_date == datetime.now().date() and slot in ["COR", "PTN"]:
                    continue

                p1 = f"{rnd.randint(0, 9999):04d}"
                p2 = f"{rnd.randint(0, 9999):04d}"
                p3 = f"{rnd.randint(0, 9999):04d}"
                p4 = f"{rnd.randint(0, 9999):04d}"
                p5 = f"{rnd.randint(0, 9999):04d}"
                p6 = f"{rnd.randint(0, 9999):04d}"
                p7 = f"{rnd.randint(0, 999):03d}"

                cursor.execute("""
                    INSERT INTO draw_results (
                        draw_date, slot, day_of_week,
                        prize_1, prize_2, prize_3, prize_4, prize_5, prize_6, prize_7
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(draw_date, slot) DO NOTHING
                """, (date_str, slot, weekday, p1, p2, p3, p4, p5, p6, p7))
                if cursor.rowcount > 0:
                    draws_inserted += 1

    print(f"Inseridos {draws_inserted} sorteios históricos com sucesso.")

    # Gera snapshots de teste para demonstrar auditoria nos últimos 5 sorteios
    try:
        generate_sample_snapshots_for_evaluation()
    except Exception as e:
        print(f"Aviso ao gerar snapshots de teste: {e}")

    return draws_inserted


def generate_sample_snapshots_for_evaluation():
    """Gera predições e acertos simulados nos últimos 5 sorteios para demonstrar auditoria imediata."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT draw_date, slot, id FROM draw_results ORDER BY draw_date DESC, id DESC LIMIT 5")
        last_draws = cursor.fetchall()

    for row in reversed(last_draws):
        d_date = row["draw_date"]
        d_slot = row["slot"]
        draw_id = row["id"]

        try:
            # Cria snapshot
            req = SnapshotCreateRequest(target_date=d_date, target_slot=d_slot)
            create_snapshot(req)
            # Avalia
            evaluate_draw_against_snapshots(draw_id)
        except Exception as err:
            print(f"Erro ao auditar snapshot {d_date} {d_slot}: {err}")


def seed_other_lotteries(num_days: int = 35) -> Dict[str, int]:
    """Gera dados semente para Look Goiás, Nacional, São Paulo e Federal se ainda não possuírem dados."""
    from ..domain import get_lottery_slots
    init_db()

    start_date = datetime.now().date() - timedelta(days=num_days)
    rnd = random.Random(1337)
    inserted_by_lottery = {}

    other_lotteries = ["LOOK", "NACIONAL", "SP", "FEDERAL"]
    lot_seeds = {"LOOK": 4242, "NACIONAL": 1337, "SP": 8888, "FEDERAL": 9999}
    with get_db_connection() as conn:
        cursor = conn.cursor()

        for lot in other_lotteries:
            rnd = random.Random(lot_seeds.get(lot, 1337))
            cursor.execute("SELECT COUNT(*) FROM draw_results WHERE lottery = ?", (lot,))
            cnt = cursor.fetchone()[0]
            if cnt >= 20:
                inserted_by_lottery[lot] = cnt
                continue

            slots = [s["code"] for s in get_lottery_slots(lot)]
            count_inserted = 0

            for d in range(num_days + 1):
                cur_date = start_date + timedelta(days=d)
                date_str = cur_date.strftime("%Y-%m-%d")
                weekday = cur_date.weekday()

                # Federal só corre quarta (2) e domingo (6)
                if lot == "FEDERAL" and weekday not in [2, 6]:
                    continue

                for slot in slots:
                    if cur_date == datetime.now().date() and slot == slots[-1]:
                        continue

                    p1 = f"{rnd.randint(0, 9999):04d}"
                    p2 = f"{rnd.randint(0, 9999):04d}"
                    p3 = f"{rnd.randint(0, 9999):04d}"
                    p4 = f"{rnd.randint(0, 9999):04d}"
                    p5 = f"{rnd.randint(0, 9999):04d}"
                    p6 = f"{rnd.randint(0, 9999):04d}"
                    p7 = f"{rnd.randint(0, 999):03d}"

                    cursor.execute("""
                        INSERT INTO draw_results (
                            draw_date, slot, lottery, day_of_week,
                            prize_1, prize_2, prize_3, prize_4, prize_5, prize_6, prize_7
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(draw_date, slot) DO NOTHING
                    """, (date_str, slot, lot, weekday, p1, p2, p3, p4, p5, p6, p7))
                    if cursor.rowcount > 0:
                        count_inserted += 1

            inserted_by_lottery[lot] = count_inserted

    return inserted_by_lottery


if __name__ == "__main__":
    generate_seed_data()
    seed_other_lotteries()

