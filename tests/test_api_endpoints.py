"""
Testes de Integração dos Endpoints HTTP via TestClient.
"""

import sys
import os
import unittest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

os.environ["BICHO_TEST_MODE"] = "1"

from app.main import app

client = TestClient(app)


class TestAPIEndpoints(unittest.TestCase):
    def test_get_slots(self):
        """Valida se a rota de horários retorna a lista padrão com códigos esperados."""
        response = client.get("/api/results/slots")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        codes = [s["code"] for s in data]
        self.assertIn("PTM", codes)
        self.assertIn("PT", codes)
        self.assertIn("COR", codes)

    def test_get_results_with_prizes_detail(self):
        """Valida se a rota de listagem de resultados retorna prizes_detail completo."""
        response = client.get("/api/results?limit=5")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("items", data)
        if data["items"]:
            first = data["items"][0]
            self.assertIn("prizes_detail", first)
            self.assertIsInstance(first["prizes_detail"], list)
            if first["prizes_detail"]:
                p1 = first["prizes_detail"][0]
                self.assertIn("number", p1)
                self.assertIn("animal_name", p1)
                self.assertIn("animal_emoji", p1)
                self.assertIn("group", p1)

    def test_get_predict(self):
        """Valida endpoint de análise preditiva."""
        response = client.get("/api/analysis/predict?target_slot=PT")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["target_slot"], "PT")
        self.assertIn("top_groups", data)
        self.assertIn("top_tens", data)
        self.assertIn("top_hundreds", data)
        self.assertIn("top_thousands", data)
        self.assertGreater(len(data["top_groups"]), 0)

    def test_get_metrics(self):
        """Valida endpoint de métricas de acerto."""
        response = client.get("/api/metrics/summary")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("total_draws", data)
        self.assertIn("evaluated_snapshots", data)

    def test_get_metrics_by_slot(self):
        """Valida métricas estratificadas por horário."""
        response = client.get("/api/metrics/by-slot")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)

    def test_admin_weights(self):
        """Valida proteção de segurança e persistência de pesos na rota de administração."""
        # Sem autenticação deve retornar 401
        unauth_res = client.get("/api/admin/weights")
        self.assertEqual(unauth_res.status_code, 401)

        # Com autenticação do Master Admin deve retornar 200
        headers = {"Authorization": "Bearer 0203040"}
        response = client.get("/api/admin/weights", headers=headers)
        self.assertEqual(response.status_code, 200)
        cfg = response.json()
        self.assertIn("weight_delay", cfg)
        self.assertIn("weight_frequency_recent", cfg)

        # Atualiza pesos
        cfg["weight_delay"] = 30.0
        update_res = client.post("/api/admin/weights", json=cfg, headers=headers)
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["weight_delay"], 30.0)

    def test_sync_web_results(self):
        """Valida endpoint de sincronização em tempo real com o site Deu no Poste."""
        response = client.post("/api/results/sync-web")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("success"))
        self.assertGreater(data.get("draws_synced", 0), 0)
        self.assertIn("today_date", data)

    def test_frontend_pages_served(self):
        """Valida se as páginas HTML e rotas estáticas estão sendo servidas corretamente."""
        res_home = client.get("/")
        self.assertEqual(res_home.status_code, 200)
        self.assertIn("BICHO MASTER", res_home.text)

        res_hist = client.get("/historico")
        self.assertEqual(res_hist.status_code, 200)
        self.assertIn("Auditoria", res_hist.text)

        res_admin = client.get("/admin")
        self.assertEqual(res_admin.status_code, 200)
        self.assertIn("Painel Administrativo", res_admin.text)


if __name__ == "__main__":
    unittest.main()
