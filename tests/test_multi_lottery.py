import sys, os, unittest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
client = TestClient(app)

class TestMultiLottery(unittest.TestCase):
    def test_get_lotteries(self):
        res = client.get("/api/results/lotteries")
        self.assertEqual(res.status_code, 200)
        codes = [item["code"] for item in res.json()]
        for expected in ["RJ", "LOOK", "NACIONAL", "SP", "FEDERAL"]:
            self.assertIn(expected, codes)

    def test_slots_by_lottery(self):
        res = client.get("/api/results/slots?lottery=LOOK")
        self.assertEqual(res.status_code, 200)
        codes = [s["code"] for s in res.json()]
        self.assertIn("LK-07", codes)
        self.assertIn("LK-09", codes)
        self.assertIn("LK-11", codes)
        self.assertEqual(len(codes), 8)

        res_fed = client.get("/api/results/slots?lottery=FEDERAL")
        self.assertEqual(res_fed.status_code, 200)
        self.assertEqual([s["code"] for s in res_fed.json()], ["FED"])

    def test_results_filtered_by_lottery(self):
        for lot in ["RJ", "LOOK", "NACIONAL", "SP"]:
            res = client.get(f"/api/results?lottery={lot}&limit=10")
            self.assertEqual(res.status_code, 200)
            items = res.json().get("items", [])
            self.assertGreater(len(items), 0)
            for item in items:
                if lot == "RJ":
                    self.assertIn(item.get("lottery") or "RJ", ["RJ", "FEDERAL"])
                else:
                    self.assertEqual(item.get("lottery") or "RJ", lot)

    def test_predict_by_lottery(self):
        res = client.get("/api/analysis/predict?lottery=LOOK&target_slot=LK-14")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["target_slot"], "LK-14")
        self.assertEqual(data["lottery"], "LOOK")
        self.assertGreater(len(data["top_groups"]), 0)

    def test_fixed_animal_by_lottery(self):
        res = client.get("/api/analysis/fixed-animal?group=8&lottery=SP&target_slot=SP-16")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["fixed_group"], 8)
        self.assertEqual(len(data["duques"]), 10)

if __name__ == "__main__":
    unittest.main()
