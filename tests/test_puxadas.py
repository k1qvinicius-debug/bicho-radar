"""
Testes automatizados para o Módulo de Puxadas Tradicionais do Jogo do Bicho.
"""

import unittest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.engine.puxadas_engine import (
    PUXADAS_TABLE,
    get_puxadas_for_group,
    get_all_puxadas_catalog,
    get_puxadas_analysis,
)
from backend.app.engine.statistical_engine import StatisticalEngine


class TestPuxadasEngine(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_puxadas_table_coverage(self):
        """Garante que todos os 25 grupos possuem puxadas válidas mapeadas."""
        self.assertEqual(len(PUXADAS_TABLE), 25)
        for g in range(1, 26):
            self.assertIn(g, PUXADAS_TABLE)
            pulled = PUXADAS_TABLE[g]
            self.assertTrue(len(pulled) >= 3, f"Grupo {g} deve puxar ao menos 3 animais")
            for target in pulled:
                self.assertTrue(1 <= target <= 25, f"Grupo puxado {target} fora do intervalo 1-25")

    def test_get_puxadas_for_group(self):
        """Verifica a estrutura retornada para puxadas de um grupo específico."""
        # Grupo 17 (Macaco) puxa Porco (18), Jacaré (15), Camelo (8), Cobra (9), Carneiro (7)
        macaco_pulled = get_puxadas_for_group(17)
        groups = [p["group"] for p in macaco_pulled]
        self.assertIn(18, groups)
        self.assertIn(15, groups)
        self.assertIn(8, groups)
        self.assertIn(9, groups)
        self.assertIn(7, groups)

        first = macaco_pulled[0]
        self.assertIn("animal", first)
        self.assertIn("emoji", first)
        self.assertIn("tens", first)
        self.assertIn("hundreds", first)
        self.assertIn("thousands", first)
        self.assertEqual(len(first["tens"]), 4)
        self.assertTrue(len(first["hundreds"]) >= 3)
        self.assertTrue(len(first["thousands"]) >= 3)

    def test_catalog(self):
        """Verifica se o catálogo completo contém os 25 grupos com dados estruturados."""
        catalog = get_all_puxadas_catalog()
        self.assertEqual(len(catalog), 25)
        for g in range(1, 26):
            self.assertIn(g, catalog)
            self.assertEqual(catalog[g]["group"], g)
            self.assertTrue(len(catalog[g]["pulled"]) >= 3)
            self.assertTrue(len(catalog[g]["hundreds"]) >= 3)
            self.assertTrue(len(catalog[g]["thousands"]) >= 3)

    def test_puxadas_analysis_structure(self):
        """Verifica o resultado da análise contextual de puxadas."""
        analysis = get_puxadas_analysis()
        self.assertIn("has_draw", analysis)
        self.assertIn("base_animal", analysis)
        self.assertIn("pulled_animals", analysis)
        self.assertIn("all_hundreds", analysis)
        self.assertIn("all_thousands", analysis)
        self.assertIn("catalog", analysis)
        self.assertTrue(len(analysis["pulled_animals"]) >= 3)
        self.assertTrue(len(analysis["all_hundreds"]) >= 3)
        self.assertTrue(len(analysis["all_thousands"]) >= 3)

    def test_api_endpoint_puxadas(self):
        """Verifica o endpoint HTTP GET /api/analysis/puxadas."""
        response = self.client.get("/api/analysis/puxadas")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("base_animal", data)
        self.assertIn("pulled_animals", data)
        self.assertIn("all_hundreds", data)
        self.assertIn("all_thousands", data)
        self.assertIn("catalog", data)

    def test_statistical_engine_puxada_integration(self):
        """Verifica se o motor estatístico adiciona metadados de puxada e fatores explicativos."""
        engine = StatisticalEngine()
        pred = engine.analyze(target_date="2026-09-11", target_slot="PT")
        self.assertTrue(len(pred.top_groups) > 0)

        # Procura se algum dos top_groups tem metadados de puxada
        has_puxada_metadata = False
        for g in pred.top_groups:
            if g.metadata and "puxada" in g.metadata:
                has_puxada_metadata = True
                break
        self.assertTrue(has_puxada_metadata, "Deve conter metadados de puxada nos grupos analisados")

    def test_puxadas_picks_latest_draw_of_day(self):
        """Garante que o Radar de Puxadas sempre selecione o último sorteio cronológico apurado do dia."""
        # LOOK em 2026-09-13: deve pegar o mais recente apurado (LK-18) e nunca o primeiro (LK-07)
        look_res = get_puxadas_analysis(lottery="LOOK", target_date="2026-09-13")
        self.assertTrue(look_res["has_draw"])
        self.assertIn("LK-18", look_res["base_animal"]["source_slot"])
        self.assertNotIn("LK-07", look_res["base_animal"]["source_slot"])

        # SP em 2026-09-13: deve pegar o mais recente apurado (SP-20) e nunca o primeiro (SP-08)
        sp_res = get_puxadas_analysis(lottery="SP", target_date="2026-09-13")
        self.assertTrue(sp_res["has_draw"])
        self.assertIn("SP-20", sp_res["base_animal"]["source_slot"])
        self.assertNotIn("SP-08", sp_res["base_animal"]["source_slot"])

        # NACIONAL em 2026-09-13: deve pegar o mais recente apurado (LN-17) e nunca o primeiro (LN-02)
        nac_res = get_puxadas_analysis(lottery="NACIONAL", target_date="2026-09-13")
        self.assertTrue(nac_res["has_draw"])
        self.assertIn("LN-17", nac_res["base_animal"]["source_slot"])
        self.assertNotIn("LN-02", nac_res["base_animal"]["source_slot"])

    def test_api_endpoint_puxadas_lotteries(self):
        """Verifica o endpoint GET /api/analysis/puxadas com parâmetro lottery para todas as loterias."""
        for lot in ["LOOK", "NACIONAL", "SP", "RJ", "FEDERAL"]:
            response = self.client.get(f"/api/analysis/puxadas?lottery={lot}")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertTrue(data["has_draw"])
            self.assertIn("base_animal", data)
            self.assertIsNotNone(data["base_animal"]["milhar"])


if __name__ == "__main__":
    unittest.main()
