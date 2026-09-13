"""
Testes automatizados da integração do Bicho Certo e remoção da Federal.
"""

import unittest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.domain import STANDARD_SLOTS, SLOT_CODES
from backend.app.database import init_db, get_db_connection
from backend.app.engine.bichocerto_scraper import (
    fetch_and_sync_bichocerto_atrasados,
    get_cached_bichocerto_atrasados
)
from backend.app.engine.statistical_engine import StatisticalEngine


class TestBichoCertoIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app)

    def test_federal_removed_from_rj_standard_slots(self):
        """Valida que a Federal (FED) foi removida dos horários regulares do RJ."""
        codes = [s["code"] for s in STANDARD_SLOTS]
        self.assertNotIn("FED", codes)
        self.assertNotIn("FED", SLOT_CODES)
        self.assertEqual(len(codes), 6)
        self.assertEqual(codes, ["PPT", "PTM", "PT", "PTV", "PTN", "COR"])

    def test_bichocerto_cached_delay_draws_calculation(self):
        """Valida que o cálculo de sorteios estimados é exatamente dias * 6."""
        items = get_cached_bichocerto_atrasados()
        self.assertGreaterEqual(len(items), 25)
        for item in items:
            expected_draws = item["delay_days"] * 6
            self.assertEqual(item["delay_draws_est"], expected_draws)
            self.assertIn("ranking_pos", item)
            self.assertIn("animal_name", item)

    def test_api_bichocerto_atrasados_endpoint(self):
        """Valida endpoint GET /api/results/bichocerto-atrasados."""
        response = self.client.get("/api/results/bichocerto-atrasados")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 25)
        # Primeiro colocado deve ser o mais atrasado
        self.assertGreaterEqual(data[0]["delay_days"], data[-1]["delay_days"])

    def test_api_bichocerto_sync_endpoint(self):
        """Valida endpoint POST /api/results/sync-bichocerto."""
        response = self.client.post("/api/results/sync-bichocerto")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("total_animals"), 25)

    def test_engine_factors_mention_bichocerto(self):
        """Valida que o motor estatístico inclui o fator explicativo do Bicho Certo."""
        engine = StatisticalEngine()
        pred = engine.analyze(target_date="2026-09-10", target_slot="PTM")
        
        # Pelo menos um dos grupos fortes deve trazer a informação de atraso do Bicho Certo
        all_factors = [f.name for g in pred.top_groups for f in g.factors]
        has_delay_factor = any("Bicho Certo" in name or "Atrasad" in name for name in all_factors)
        self.assertTrue(has_delay_factor)


if __name__ == "__main__":
    unittest.main()
