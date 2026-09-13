"""
Testes Automatizados para Multi-Tenancy e Segurança de Acesso do Administrador Master.
"""

import sys
import os
import unittest
from fastapi.testclient import TestClient

BACKEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
from app.database import get_db_connection, init_db

client = TestClient(app)


class TestAuthAndMultiTenancy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def setUp(self):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM tenants WHERE tenant_key LIKE 'test-%' OR tenant_key LIKE 'alfa-%' OR tenant_key LIKE 'beta-%'")

    def test_01_unauthenticated_admin_access_rejected(self):
        """Valida que requisições sem autenticação nas rotas administrativas são bloqueadas com 401."""
        res_weights = client.get("/api/admin/weights")
        self.assertEqual(res_weights.status_code, 401)

        res_stats = client.get("/api/admin/system-stats")
        self.assertEqual(res_stats.status_code, 401)

        res_tenants = client.get("/api/admin/tenants")
        self.assertEqual(res_tenants.status_code, 401)

    def test_02_master_admin_login(self):
        """Valida login do Administrador Master com usuário 'admin' e senha '0203040'."""
        # 1. Login com Usuário e Senha
        res = client.post("/api/auth/login", json={"username": "admin", "password": "0203040"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("token", data)
        self.assertIn("tenant", data)
        self.assertEqual(data["tenant"]["role"], "admin")
        self.assertEqual(data["tenant"]["tenant_key"], "0203040")
        self.assertTrue(bool(data["token"]))

        # 2. Login direto com a chave/senha
        res_key = client.post("/api/auth/login", json={"key": "0203040"})
        self.assertEqual(res_key.status_code, 200)
        self.assertEqual(res_key.json()["tenant"]["role"], "admin")

        # Testa /auth/me
        headers = {"Authorization": f"Bearer {data['token']}"}
        res_me = client.get("/api/auth/me", headers=headers)
        self.assertEqual(res_me.status_code, 200)
        self.assertEqual(res_me.json()["role"], "admin")

        # Testa /auth/check
        res_check = client.get("/api/auth/check", headers=headers)
        self.assertEqual(res_check.status_code, 200)
        self.assertTrue(res_check.json()["authenticated"])
        self.assertEqual(res_check.json()["role"], "admin")

    def test_03_invalid_login_rejected(self):
        """Valida que chave inexistente é rejeitada com 401."""
        res = client.post("/api/auth/login", json={"key": "chave-que-nao-existe-999"})
        self.assertEqual(res.status_code, 401)

    def test_04_tenant_crud_by_admin(self):
        """Valida fluxo de criação, listagem, suspensão, reativação e exclusão de testadores pelo Admin."""
        admin_headers = {"Authorization": "Bearer 0203040"}

        # 1. Cria um novo testador
        test_key = "test-carlos-101"
        res_create = client.post(
            "/api/admin/tenants",
            json={
                "name": "Carlos Testador VIP",
                "tenant_key": test_key,
                "role": "tester",
                "notes": "Testador convidado pelo WhatsApp"
            },
            headers=admin_headers
        )
        self.assertEqual(res_create.status_code, 200)
        created_tenant = res_create.json()
        tenant_id = created_tenant["id"]
        self.assertEqual(created_tenant["tenant_key"], test_key)
        self.assertEqual(created_tenant["role"], "tester")
        self.assertEqual(created_tenant["status"], "active")

        # 2. Testa login do novo testador
        res_login = client.post("/api/auth/login", json={"key": test_key})
        self.assertEqual(res_login.status_code, 200)
        tester_token = res_login.json()["token"]

        # 3. Testa que o testador NÃO tem permissão nas rotas de admin (403 Forbidden)
        tester_headers = {"Authorization": f"Bearer {tester_token}"}
        res_admin_blocked = client.get("/api/admin/weights", headers=tester_headers)
        self.assertEqual(res_admin_blocked.status_code, 403)

        res_tenants_blocked = client.get("/api/admin/tenants", headers=tester_headers)
        self.assertEqual(res_tenants_blocked.status_code, 403)

        # 4. Admin lista os testadores e encontra o recém criado
        res_list = client.get("/api/admin/tenants", headers=admin_headers)
        self.assertEqual(res_list.status_code, 200)
        tenants = res_list.json()
        found = any(t["id"] == tenant_id for t in tenants)
        self.assertTrue(found)

        # 5. Admin suspende o testador
        res_suspend = client.patch(
            f"/api/admin/tenants/{tenant_id}",
            json={"status": "suspended"},
            headers=admin_headers
        )
        self.assertEqual(res_suspend.status_code, 200)
        self.assertEqual(res_suspend.json()["status"], "suspended")

        # 6. Testador suspenso tenta logar -> 403
        res_login_suspended = client.post("/api/auth/login", json={"key": test_key})
        self.assertEqual(res_login_suspended.status_code, 403)

        # 7. Admin reativa o testador
        res_reactivate = client.patch(
            f"/api/admin/tenants/{tenant_id}",
            json={"status": "active"},
            headers=admin_headers
        )
        self.assertEqual(res_reactivate.status_code, 200)
        self.assertEqual(res_reactivate.json()["status"], "active")

        # 8. Testador volta a conseguir logar
        res_login_ok = client.post("/api/auth/login", json={"key": test_key})
        self.assertEqual(res_login_ok.status_code, 200)

        # 9. Admin exclui o testador
        res_del = client.delete(f"/api/admin/tenants/{tenant_id}", headers=admin_headers)
        self.assertEqual(res_del.status_code, 200)

        # 10. Login não existe mais -> 401
        res_login_deleted = client.post("/api/auth/login", json={"key": test_key})
        self.assertEqual(res_login_deleted.status_code, 401)

    def test_05_snapshot_data_isolation_between_tenants(self):
        """Valida que cada testador visualiza apenas seus próprios snapshots, enquanto o Admin vê todos."""
        admin_headers = {"Authorization": "Bearer 0203040"}

        # Cria Testador A e Testador B
        res_a = client.post(
            "/api/admin/tenants",
            json={"name": "Testador Alfa", "tenant_key": "alfa-key-1", "role": "tester"},
            headers=admin_headers
        )
        self.assertEqual(res_a.status_code, 200)
        tenant_a = res_a.json()

        res_b = client.post(
            "/api/admin/tenants",
            json={"name": "Testador Beta", "tenant_key": "beta-key-2", "role": "tester"},
            headers=admin_headers
        )
        self.assertEqual(res_b.status_code, 200)
        tenant_b = res_b.json()

        token_a = client.post("/api/auth/login", json={"key": "alfa-key-1"}).json()["token"]
        token_b = client.post("/api/auth/login", json={"key": "beta-key-2"}).json()["token"]

        headers_a = {"Authorization": f"Bearer {token_a}"}
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # Testador Alfa cria um snapshot
        snap_a_res = client.post(
            "/api/analysis/snapshot",
            json={"target_date": "2026-09-12", "target_slot": "PTM"},
            headers=headers_a
        )
        self.assertEqual(snap_a_res.status_code, 200)
        snap_a_id = snap_a_res.json()["snapshot_id"]

        # Testador Beta lista snapshots -> NÃO deve conter o snapshot de Alfa
        snaps_b = client.get("/api/analysis/snapshots", headers=headers_b).json()
        b_ids = [s["id"] for s in snaps_b]
        self.assertNotIn(snap_a_id, b_ids)

        # Testador Alfa lista snapshots -> DEVE conter seu snapshot
        snaps_a = client.get("/api/analysis/snapshots", headers=headers_a).json()
        a_ids = [s["id"] for s in snaps_a]
        self.assertIn(snap_a_id, a_ids)

        # Admin lista snapshots -> DEVE visualizar tudo
        snaps_admin = client.get("/api/analysis/snapshots", headers=admin_headers).json()
        admin_ids = [s["id"] for s in snaps_admin]
        self.assertIn(snap_a_id, admin_ids)

        # Limpeza
        client.delete(f"/api/admin/tenants/{tenant_a['id']}", headers=admin_headers)
        client.delete(f"/api/admin/tenants/{tenant_b['id']}", headers=admin_headers)


if __name__ == "__main__":
    unittest.main()
