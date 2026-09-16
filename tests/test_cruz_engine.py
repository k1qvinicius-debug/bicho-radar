"""
Testes automatizados do Módulo da Cruz do Dia.
Valida o cálculo dos dígitos cardeais (regra do +3), dezenas, milhares e endpoint da API.
"""

import os
import unittest
from fastapi.testclient import TestClient

os.environ["BICHO_TEST_MODE"] = "1"

from backend.app.main import app
from backend.app.engine.cruz_engine import get_cruz_do_dia, _calculate_cruz_math


class TestCruzEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_cruz_math_day_11(self):
        """Valida a Cruz do Dia para o dia 11: 4, 7, 0, 3."""
        cruz = _calculate_cruz_math(11)
        digits = cruz["digits"]
        self.assertEqual(digits["top"], "4")
        self.assertEqual(digits["right"], "7")
        self.assertEqual(digits["bottom"], "0")
        self.assertEqual(digits["left"], "3")
        self.assertEqual(cruz["raw_digits"], ["4", "7", "0", "3"])

        # Valida que Cavalo (Grupo 11) com dezena 43 e milhares 0743, 7043 estão presentes
        animals_map = {a["group"]: a for a in cruz["animals"]}
        self.assertIn(11, animals_map)
        cavalo = animals_map[11]
        self.assertIn("43", cavalo["tens"])
        self.assertIn("0743", cavalo["thousands"])
        self.assertIn("7043", cavalo["thousands"])

        # Valida Avestruz (Grupo 1)
        self.assertIn(1, animals_map)
        avestruz = animals_map[1]
        self.assertIn("03", avestruz["tens"])
        self.assertIn("04", avestruz["tens"])
        self.assertIn("4703", avestruz["thousands"])
        self.assertIn("7403", avestruz["thousands"])

    def test_cruz_endpoint(self):
        """Valida endpoint GET /api/analysis/cruz-do-dia."""
        resp = self.client.get("/api/analysis/cruz-do-dia?target_date=2026-09-11")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["day"], 11)
        self.assertEqual(data["digits"]["top"], "4")
        self.assertIn("bicho_do_dia", data)
        bdd = data["bicho_do_dia"]
        self.assertIn("thousands", bdd)
        self.assertIn("hundreds", bdd)
        self.assertGreater(len(bdd["thousands"]), 0)
        self.assertGreater(len(bdd["hundreds"]), 0)
        for m in bdd["thousands"]:
            self.assertEqual(len(m), 4)
            self.assertIn(m[-2:], bdd["tens"])
        for c in bdd["hundreds"]:
            self.assertEqual(len(c), 3)
            self.assertIn(c[-2:], bdd["tens"])
        self.assertIn("animals", data)
        self.assertGreaterEqual(len(data["animals"]), 5)
        self.assertIn("all_thousands", data)
        self.assertGreaterEqual(len(data["all_thousands"]), 10)

    def test_statistical_engine_includes_cruz_factor(self):
        """Valida que o motor estatístico adiciona fatores da Cruz do Dia."""
        resp = self.client.get("/api/analysis/predict?target_date=2026-09-11&target_slot=PT")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        top_groups = data.get("top_groups", [])
        self.assertTrue(len(top_groups) > 0)

        # Cavalo (11) ou animais da cruz devem ter metadata de cruz_do_dia
        has_cruz_meta = any(g.get("metadata", {}).get("cruz_do_dia") for g in top_groups)
        self.assertTrue(has_cruz_meta)
