"""
Suíte de Testes Automatizados - Bicho Analytics.
Verifica regras canônicas de domínio, precisão do motor estatístico,
persistência no SQLite, calibração de pesos e auditoria de acertos.
"""

import sys
import os
import json
import unittest

# Adiciona o backend ao path
BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.domain import (
    ANIMALS, TEN_TO_GROUP,
    format_milhar, extract_dezena, extract_centena, extract_milhar,
    get_group_for_dezena, get_group_for_number, get_animal_info
)
from app.database import init_db, get_db_connection
from app.engine.statistical_engine import StatisticalEngine
from app.engine.weights import get_active_weights, update_active_weights
from app.engine.evaluator import evaluate_draw_against_snapshots
from app.api.analysis import create_snapshot
from app.models import SnapshotCreateRequest, WeightsConfigModel, DrawResultCreate
from app.api.results import create_result
from app.api.metrics import get_metrics_summary


class TestDomainRules(unittest.TestCase):
    def test_twenty_five_groups(self):
        """Valida se existem exatamente 25 grupos mapeados."""
        self.assertEqual(len(ANIMALS), 25)
        for g in range(1, 26):
            self.assertIn(g, ANIMALS)
            self.assertEqual(len(ANIMALS[g]["tens"]), 4)

    def test_one_hundred_tens(self):
        """Valida se todas as 100 dezenas (00 a 99) pertencem a um grupo válido."""
        self.assertEqual(len(TEN_TO_GROUP), 100)
        for i in range(100):
            d_str = str(i).zfill(2)
            self.assertIn(d_str, TEN_TO_GROUP)
            grp = get_group_for_dezena(d_str)
            self.assertTrue(1 <= grp <= 25)

    def test_milhar_extractions(self):
        """Valida extração precisa de milhar, centena, dezena e grupo."""
        test_num = "4821"
        self.assertEqual(extract_milhar(test_num), "4821")
        self.assertEqual(extract_centena(test_num), "821")
        self.assertEqual(extract_dezena(test_num), "21")
        # 21 pertence ao Grupo 06 (Cabra: 21, 22, 23, 24)
        self.assertEqual(get_group_for_number(test_num), 6)
        self.assertEqual(get_animal_info(6)["name"], "Cabra")

        # Dezena 00 pertence ao Grupo 25 (Vaca)
        self.assertEqual(get_group_for_number("1200"), 25)
        self.assertEqual(get_animal_info(25)["name"], "Vaca")


class TestStatisticalEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_engine_produces_ranked_output(self):
        """Valida se o motor estatístico gera pontuações e fatores explicativos válidos."""
        engine = StatisticalEngine()
        output = engine.analyze(target_date="2026-09-10", target_slot="PT")

        self.assertGreater(output.total_draws_analyzed, 0)
        self.assertGreater(len(output.top_groups), 0)
        self.assertGreater(len(output.top_tens), 0)
        self.assertGreater(len(output.top_hundreds), 0)
        self.assertGreater(len(output.top_thousands), 0)

        # Valida primeiro grupo
        top_g = output.top_groups[0]
        self.assertGreater(top_g.score, 0)
        self.assertTrue(1 <= top_g.group_number <= 25)
        self.assertIsNotNone(top_g.animal_name)
        self.assertEqual(len(top_g.tens), 4)

        # Fatores explicativos
        for factor in top_g.factors:
            self.assertIsInstance(factor.name, str)
            self.assertIsInstance(factor.description, str)
            self.assertGreater(factor.impact_points, 0)

        # Valida DDZ combos (Duque de Dezena Combinado)
        self.assertIsNotNone(output.ddz_combos)
        self.assertEqual(len(output.ddz_combos), 3)
        combo_4 = output.ddz_combos[0]
        self.assertEqual(combo_4["tens_count"], 4)
        self.assertEqual(combo_4["duques_count"], 6)
        self.assertEqual(len(combo_4["duques"]), 6)
        self.assertEqual(combo_4["investment_suggested_brl"], 6.0)
        self.assertEqual(combo_4["estimated_prize_brl"], 300.0)

        combo_5 = output.ddz_combos[1]
        self.assertEqual(combo_5["tens_count"], 5)
        self.assertEqual(combo_5["duques_count"], 10)

        combo_6 = output.ddz_combos[2]
        self.assertEqual(combo_6["tens_count"], 6)
        self.assertEqual(combo_6["duques_count"], 15)

        # Valida presence_pct no grupo e dezena
        self.assertIn("presence_pct", top_g.metadata)
        self.assertIsInstance(top_g.metadata["presence_pct"], (int, float))
        top_t = output.top_tens[0]
        self.assertIn("presence_pct", top_t.metadata)
        self.assertIsInstance(top_t.metadata["presence_pct"], (int, float))

    def test_weights_adjustment_affects_engine(self):
        """Valida que o ajuste dinâmico de pesos recalcula as prioridades do motor."""
        custom_weights = WeightsConfigModel(
            weight_delay=95.0,  # Prioriza muito o atraso
            weight_frequency_recent=5.0,
            weight_frequency_total=5.0,
            weight_slot_affinity=5.0,
            weight_repetition=0.0,
            weight_day_of_week=0.0,
        )
        engine = StatisticalEngine(weights=custom_weights)
        res_delay = engine.analyze(target_date="2026-09-10", target_slot="PT", custom_weights=custom_weights)
        self.assertGreater(len(res_delay.top_groups), 0)


class TestAuditorAndEvaluation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def test_snapshot_freezing_and_evaluation(self):
        """Valida o ciclo completo de congelamento pré-sorteio e conferência pós-sorteio."""
        test_date = "2029-01-01"
        test_slot = "PT"

        # 1. Congela snapshot antes do sorteio
        req = SnapshotCreateRequest(target_date=test_date, target_slot=test_slot)
        snap_res = create_snapshot(req)
        snap_id = snap_res["snapshot_id"]
        self.assertIsNotNone(snap_id)

        # 2. Insere resultado real correspondente
        # 1º: 3521 (Grupo 6 Cabra, Dezena 21, Centena 521, Milhar 3521)
        draw_data = DrawResultCreate(
            draw_date=test_date,
            slot=test_slot,
            prize_1="3521",
            prize_2="1408",
            prize_3="9944",
            prize_4="7233",
            prize_5="6018",
        )
        created_draw = create_result(draw_data)
        self.assertIsNotNone(created_draw.id)

        # 3. Verifica se a avaliação foi gerada
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM analysis_evaluations WHERE snapshot_id = ?", (snap_id,))
            eval_row = cursor.fetchone()
            self.assertIsNotNone(eval_row)
            self.assertEqual(eval_row["draw_id"], created_draw.id)

            # Limpa registro de teste
            cursor.execute("DELETE FROM draw_results WHERE id = ?", (created_draw.id,))
            cursor.execute("DELETE FROM analysis_snapshots WHERE id = ?", (snap_id,))

    def test_metrics_summary(self):
        """Valida se o endpoint de métricas agrega dados sem erros."""
        metrics = get_metrics_summary()
        self.assertIn("total_draws", metrics)
        self.assertIn("group_1st_hit_rate", metrics)
        self.assertIn("average_performance_score", metrics)


class TestHybridEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app.main import app
        cls.client = TestClient(app)
        cls.engine = StatisticalEngine()

    def test_hybrid_combo_generation(self):
        """Valida geração do fechamento híbrido multi-origem."""
        pred = self.engine.analyze(target_date="2026-09-11", target_slot="PT", strategy="hybrid")
        self.assertIsNotNone(pred.hybrid_combo)
        combo = pred.hybrid_combo
        self.assertEqual(combo["name"], "Fechamento Híbrido Anti-Aleatoriedade")
        self.assertGreaterEqual(combo["tens_count"], 4)
        self.assertGreaterEqual(combo["duques_count"], 6)
        self.assertIsNotNone(combo["duques"])

        # Verifica origens presentes
        origins = {item["origin"] for item in combo["tens_items"]}
        self.assertTrue(len(origins) >= 2)

        # Verifica resumo de quadrantes
        self.assertIsNotNone(pred.quadrant_summary)
        self.assertIn("balance_status", pred.quadrant_summary)

    def test_strategy_parameter_variations(self):
        """Valida seletor de estratégias (frequency, delay, puxada)."""
        pred_freq = self.engine.analyze(target_date="2026-09-11", target_slot="PT", strategy="frequency")
        self.assertEqual(pred_freq.strategy, "frequency")

        pred_del = self.engine.analyze(target_date="2026-09-11", target_slot="PT", strategy="delay")
        self.assertEqual(pred_del.strategy, "delay")

        pred_pux = self.engine.analyze(target_date="2026-09-11", target_slot="PT", strategy="puxada")
        self.assertEqual(pred_pux.strategy, "puxada")

    def test_fixed_animal_combo_camelo(self):
        """Valida fechamento travando o Camelo (Grupo 8)."""
        res = self.engine.generate_fixed_animal_combo(group_number=8, target_date="2026-09-11", target_slot="PT")
        self.assertEqual(res["fixed_group"], 8)
        self.assertEqual(res["animal_name"], "Camelo")
        self.assertTrue(res["animal_emoji"] in ["🐪", "🐫"])
        self.assertEqual(len(res["fixed_tens"]), 2)
        self.assertEqual(len(res["all_tens"]), 5)
        self.assertEqual(res["duques_count"], 10)

        fixed_count = sum(1 for d in res["duques"] if d.get("has_fixed_animal"))
        self.assertGreater(fixed_count, 0)

    def test_fixed_animal_endpoint(self):
        """Valida endpoint /api/analysis/fixed-animal."""
        response = self.client.get("/api/analysis/fixed-animal?group=17")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["fixed_group"], 17)
        self.assertEqual(data["animal_name"], "Macaco")
        self.assertEqual(data["duques_count"], 10)

    def test_predict_with_strategy_endpoint(self):
        """Valida endpoint /api/analysis/predict com estratégia."""
        response = self.client.get("/api/analysis/predict?slot=PT&strategy=hybrid")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["strategy"], "hybrid")
        self.assertIn("hybrid_combo", data)
        self.assertIsNotNone(data["hybrid_combo"])


if __name__ == "__main__":
    unittest.main()
