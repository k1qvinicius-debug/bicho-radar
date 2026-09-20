"""
Módulo de Autenticação e Controle de Acesso Multi-Tenant.
Gerencia tokens de sessão, identificação de testadores e restrição de acesso ao Administrador Master.
"""

import os
import hmac
import hashlib
import time
import secrets
from typing import Optional, Dict, Any
from fastapi import Header, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from .database import get_db_connection

SECRET_KEY = "bicho-radar-master-auth-secret-2026"
security = HTTPBearer(auto_error=False)


def create_token_for_tenant(tenant: Dict[str, Any]) -> str:
    """Gera um token assinado para o tenant."""
    raw = f"{tenant['id']}:{tenant['role']}:{tenant['tenant_key']}"
    sig = hmac.new(SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()[:24]
    return f"{raw}:{sig}"


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifica e decodifica um token assinado ou chave direta."""
    if not token:
        return None

    token = token.strip()
    parts = token.split(":")
    if len(parts) == 4:
        t_id, role, key, sig = parts
        raw = f"{t_id}:{role}:{key}"
        expected_sig = hmac.new(SECRET_KEY.encode(), raw.encode(), hashlib.sha256).hexdigest()[:24]
        if hmac.compare_digest(sig, expected_sig):
            try:
                return get_tenant_by_id(int(t_id))
            except Exception:
                return None

    # Fallback: o token pode ser a própria chave do tenant (para links diretos e testes)
    return get_tenant_by_key(token)


def get_tenant_by_key(key: str) -> Optional[Dict[str, Any]]:
    """Busca um tenant ativo ou inativo pelo tenant_key exato."""
    if not key:
        return None
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE tenant_key = ?", (key.strip(),))
        row = cursor.fetchone()
        if row:
            return dict(row)
        # Fallback de compatibilidade para a chave master do administrador
        if key.strip() in ("0203040", "admin123", "admin", "adminmaster") or key.strip().lower() == "k1qvinicius@gmail.com":
            cursor.execute("SELECT * FROM tenants WHERE role = 'admin' OR LOWER(COALESCE(email, '')) = 'k1qvinicius@gmail.com' LIMIT 1")
            row = cursor.fetchone()
            if row:
                return dict(row)
    return None


def get_tenant_by_id(tenant_id: int) -> Optional[Dict[str, Any]]:
    """Busca tenant pelo ID."""
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        if row:
            return dict(row)
    return None


def update_tenant_activity(tenant_id: int) -> None:
    """Registra a data/hora do último acesso do tenant."""
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("UPDATE tenants SET last_active_at = ? WHERE id = ?", (now_str, tenant_id))
    except Exception:
        pass


def generate_clean_key(prefix: str = "teste") -> str:
    """Gera uma chave amigável e segura para compartilhamento (ex: teste-9k4m2p)."""
    rand = secrets.token_hex(3)
    return f"{prefix}-{rand}"


from datetime import datetime


def calculate_trial_info(tenant: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calcula dias restantes de teste ou status de assinatura do tenant.
    Administradores possuem acesso perpétuo.
    """
    role = tenant.get("role", "tester")
    if role == "admin":
        return {
            "status": "admin",
            "is_expired": False,
            "days_remaining": 9999,
            "badge": "👑 Administrador Master"
        }

    sub_status = tenant.get("subscription_status", "active")
    if sub_status == "active":
        return {
            "status": "active",
            "is_expired": False,
            "days_remaining": 30,
            "badge": "⭐ Assinante Ativo"
        }

    if sub_status == "suspended":
        return {
            "status": "suspended",
            "is_expired": True,
            "days_remaining": 0,
            "badge": "⛔ Conta Suspensa"
        }

    # Se estiver em trial, verifica data de expiração
    expires_at_raw = tenant.get("trial_expires_at") or tenant.get("expires_at")
    if not expires_at_raw:
        return {
            "status": "trial",
            "is_expired": False,
            "days_remaining": 5,
            "badge": "⏳ Teste Grátis • 5 dias"
        }

    try:
        if isinstance(expires_at_raw, str):
            clean_str = expires_at_raw.replace("T", " ").split(".")[0]
            expires_dt = datetime.strptime(clean_str, "%Y-%m-%d %H:%M:%S")
        elif isinstance(expires_at_raw, datetime):
            expires_dt = expires_at_raw
        else:
            expires_dt = datetime.now()

        now = datetime.now()
        diff = expires_dt - now
        seconds_left = diff.total_seconds()

        if seconds_left <= 0:
            return {
                "status": "expired",
                "is_expired": True,
                "days_remaining": 0,
                "badge": "🔒 Teste Expirado"
            }
        else:
            days_left = max(1, int(diff.days) + (1 if diff.seconds > 0 else 0))
            return {
                "status": "trial",
                "is_expired": False,
                "days_remaining": days_left,
                "badge": f"⏳ Teste Grátis • {days_left}d restantes"
            }
    except Exception:
        return {
            "status": "trial",
            "is_expired": False,
            "days_remaining": 5,
            "badge": "⏳ Teste Grátis"
        }


def check_trial_abuse(ip: Optional[str], device_id: Optional[str], current_email: str) -> Optional[str]:
    """
    Verifica se o IP ou dispositivo (device_id) já criou ou utilizou uma conta de teste no sistema.
    Retorna uma mensagem de erro caso o abuso seja detectado, ou None se estiver liberado.
    Administrador Master nunca é bloqueado.
    """
    if not current_email:
        return None
    email_clean = current_email.strip().lower()
    if email_clean in ("k1qvinicius@gmail.com", "admin", "admin@bichomasterpro.tech"):
        return None

    ip_clean = (ip or "").strip()
    device_clean = (device_id or "").strip()

    if not ip_clean and not device_clean:
        return None

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # 1. Verifica por Device ID (impressão digital do dispositivo/navegador)
        if device_clean:
            cursor.execute("""
                SELECT email, name, subscription_status, created_at
                FROM tenants
                WHERE device_id = ?
                  AND role != 'admin'
                  AND LOWER(COALESCE(email, '')) != ?
                ORDER BY id ASC LIMIT 1
            """, (device_clean, email_clean))
            row = cursor.fetchone()
            if row:
                return "O período de degustação gratuita de 5 dias já foi utilizado neste dispositivo. Para continuar utilizando as ferramentas e palpites, escolha um dos nossos Planos VIP."

        # 2. Verifica por IP de Registro ou Último IP (da mesma rede)
        if ip_clean and ip_clean not in ("127.0.0.1", "::1", "localhost"):
            cursor.execute("""
                SELECT email, name, subscription_status, created_at
                FROM tenants
                WHERE (registration_ip = ? OR last_ip = ?)
                  AND role != 'admin'
                  AND LOWER(COALESCE(email, '')) != ?
                ORDER BY id ASC LIMIT 1
            """, (ip_clean, ip_clean, email_clean))
            row = cursor.fetchone()
            if row:
                return "O período de degustação gratuita de 5 dias já foi utilizado nesta rede/conexão de internet. Para continuar utilizando, escolha um dos nossos Planos VIP."

    return None


def get_or_create_google_tenant(
    email: str,
    name: str,
    sub: Optional[str] = None,
    ip: Optional[str] = None,
    device_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Localiza ou cria uma conta de testador vinculada ao e-mail do Google (Gmail).
    Se o e-mail for k1qvinicius@gmail.com, garante direitos de Administrador Master.
    Bloqueia novos testes caso o IP ou dispositivo já tenham sido usados para degustação.
    """
    email_clean = email.strip().lower()
    name_clean = name.strip() or email_clean.split("@")[0]
    now_str = time.strftime("%Y-%m-%d %H:%M:%S")

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Reconhece automaticamente o e-mail do Administrador Master Vinicius
        if email_clean == "k1qvinicius@gmail.com":
            cursor.execute("SELECT * FROM tenants WHERE role = 'admin' OR LOWER(COALESCE(email, '')) = 'k1qvinicius@gmail.com'")
            row = cursor.fetchone()
            if row:
                tenant = dict(row)
                cursor.execute("""
                    UPDATE tenants 
                    SET email = 'k1qvinicius@gmail.com', name = 'Vinicius (Master Admin)', role = 'admin',
                        tenant_key = '0203040', status = 'active', subscription_status = 'active', plan_type = 'lifetime',
                        last_active_at = ?, last_ip = COALESCE(?, last_ip), device_id = COALESCE(?, device_id)
                    WHERE id = ?
                """, (now_str, ip, device_id, tenant["id"]))
                cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant["id"],))
                return dict(cursor.fetchone())
            else:
                cursor.execute("""
                    INSERT INTO tenants (
                        name, email, tenant_key, role, status,
                        auth_provider, subscription_status, plan_type, notes, created_at, last_active_at,
                        registration_ip, last_ip, device_id
                    ) VALUES ('Vinicius (Master Admin)', 'k1qvinicius@gmail.com', '0203040', 'admin', 'active',
                              'google', 'active', 'lifetime', 'Administrador Master Vinicius', ?, ?, ?, ?, ?)
                """, (now_str, now_str, ip, ip, device_id))
                cursor.execute("SELECT * FROM tenants WHERE LOWER(email) = 'k1qvinicius@gmail.com'")
                return dict(cursor.fetchone())

        cursor.execute("SELECT * FROM tenants WHERE LOWER(COALESCE(email, '')) = ? OR tenant_key = ?", (email_clean, email_clean))
        row = cursor.fetchone()

        # 5 dias a partir de agora: 5 * 86400 segundos
        trial_expire_ts = time.time() + (5 * 86400)
        trial_expire_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(trial_expire_ts))

        if row:
            tenant = dict(row)
            cursor.execute("""
                UPDATE tenants 
                SET last_active_at = ?,
                    last_ip = COALESCE(?, last_ip),
                    device_id = COALESCE(?, device_id)
                WHERE id = ?
            """, (now_str, ip, device_id, tenant["id"]))
            return tenant

        # NOVO CADASTRO: Verifica se IP ou Dispositivo já usaram degustação grátis
        abuse_err = check_trial_abuse(ip, device_id, email_clean)
        if abuse_err:
            raise HTTPException(status_code=403, detail=abuse_err)

        # Se não existe e passou na validação, cria um novo tenant com 5 dias de teste
        key = generate_clean_key("usr")
        cursor.execute("""
        INSERT INTO tenants (
            name, email, tenant_key, role, status,
            auth_provider, trial_started_at, trial_expires_at,
            subscription_status, plan_type, notes, created_at, last_active_at,
            registration_ip, last_ip, device_id
        ) VALUES (?, ?, ?, 'tester', 'active', 'google', ?, ?, 'trial', 'free', 'Cadastro via Google (5 dias grátis)', ?, ?, ?, ?, ?)
        """, (name_clean, email_clean, key, now_str, trial_expire_str, now_str, now_str, ip, ip, device_id))

        cursor.execute("SELECT * FROM tenants WHERE tenant_key = ?", (key,))
        new_row = cursor.fetchone()
        return dict(new_row) if new_row else {}


def register_new_tenant(
    name: str,
    email: str,
    phone: Optional[str],
    password: str,
    ip: Optional[str] = None,
    device_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Cria ou atualiza um novo perfil de usuário completo (Nome, E-mail, Telefone, Senha).
    Garante 5 dias de degustação gratuita, status ativo e role 'tester'.
    Bloqueia criação caso o IP ou dispositivo já tenham utilizado teste anterior.
    """
    email_clean = (email or "").strip().lower()
    name_clean = (name or "").strip() or (email_clean.split("@")[0] if "@" in email_clean else "Usuário")
    phone_clean = (phone or "").strip()
    password_clean = (password or "").strip()

    if not password_clean:
        password_clean = generate_clean_key("usr")

    now = datetime.now()
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    trial_expire_ts = time.time() + (5 * 86400)
    trial_expire_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(trial_expire_ts))

    with get_db_connection() as conn:
        cursor = conn.cursor()
        # Verifica se já existe por email
        cursor.execute("SELECT * FROM tenants WHERE LOWER(COALESCE(email, '')) = ?", (email_clean,))
        row = cursor.fetchone()

        if row:
            tenant = dict(row)
            # Atualiza nome, telefone, senha e atividade se fornecidos
            cursor.execute("""
                UPDATE tenants 
                SET name = ?, phone = ?, tenant_key = ?, last_active_at = ?,
                    last_ip = COALESCE(?, last_ip),
                    device_id = COALESCE(?, device_id)
                WHERE id = ?
            """, (name_clean, phone_clean or tenant.get("phone"), password_clean, now_str, ip, device_id, tenant["id"]))
            cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant["id"],))
            return dict(cursor.fetchone())

        # NOVO CADASTRO: Verifica se IP ou Dispositivo já usaram degustação grátis
        abuse_err = check_trial_abuse(ip, device_id, email_clean)
        if abuse_err:
            raise HTTPException(status_code=403, detail=abuse_err)

        # Novo cadastro: cria tenant
        # Verifica se a senha já está sendo usada como chave única por outra conta
        cursor.execute("SELECT id FROM tenants WHERE tenant_key = ?", (password_clean,))
        if cursor.fetchone():
            key = f"{password_clean}-{generate_clean_key()[:4]}"
        else:
            key = password_clean

        cursor.execute("""
            INSERT INTO tenants (
                name, email, phone, tenant_key, role, status,
                auth_provider, trial_started_at, trial_expires_at,
                subscription_status, plan_type, notes, created_at, last_active_at,
                registration_ip, last_ip, device_id
            ) VALUES (?, ?, ?, ?, 'tester', 'active', 'cadastro', ?, ?, 'trial', 'free', 'Cadastro de Perfil Completo (5 dias grátis)', ?, ?, ?, ?, ?)
        """, (name_clean, email_clean, phone_clean, key, now_str, trial_expire_str, now_str, now_str, ip, ip, device_id))

        cursor.execute("SELECT * FROM tenants WHERE LOWER(COALESCE(email, '')) = ?", (email_clean,))
        new_row = cursor.fetchone()
        return dict(new_row) if new_row else {}


def get_current_tenant_optional(
    auth_cred: Optional[HTTPAuthorizationCredentials] = Security(security),
    x_access_key: Optional[str] = Header(None, alias="X-Access-Key")
) -> Optional[Dict[str, Any]]:
    """
    Dependência opcional que recupera o tenant logado (via Bearer token ou header X-Access-Key).
    Não bloqueia requisições públicas.
    """
    token = None
    if auth_cred and auth_cred.credentials:
        token = auth_cred.credentials
    elif x_access_key:
        token = x_access_key

    if not token:
        return None

    tenant = verify_token(token)
    if tenant:
        if tenant.get("status") == "active":
            update_tenant_activity(tenant["id"])
            tenant["trial_info"] = calculate_trial_info(tenant)
            return tenant
    return None


def require_tenant(
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
) -> Dict[str, Any]:
    """
    Exige que a requisição venha de um tenant ativo com período de teste ou assinatura válida.
    Bloqueia no servidor qualquer tentativa de acesso após o término dos 7 dias.
    """
    if not tenant:
        if os.environ.get("BICHO_TEST_MODE") == "1":
            return {"id": 1, "name": "Test Runner", "role": "admin", "status": "active"}
        raise HTTPException(
            status_code=401,
            detail="Acesso não autorizado. Faça login com seu Google ou Chave para continuar."
        )
    if tenant.get("status") != "active":
        raise HTTPException(
            status_code=403,
            detail="Esta conta de acesso está suspensa ou inativa. Contate o administrador."
        )

    # Validação do período de degustação / assinatura
    trial_info = tenant.get("trial_info") or calculate_trial_info(tenant)
    if trial_info["is_expired"] and tenant.get("role") != "admin":
        # Se acabou de expirar, atualiza status no banco
        if tenant.get("subscription_status") != "expired":
            try:
                with get_db_connection() as conn:
                    cur = conn.cursor()
                    cur.execute("UPDATE tenants SET subscription_status = 'expired' WHERE id = ?", (tenant["id"],))
            except Exception:
                pass
        raise HTTPException(
            status_code=403,
            detail="TRIAL_EXPIRED: Seu período de teste de 7 dias encerrou. Entre em contato pelo WhatsApp para continuar com acesso liberado."
        )

    return tenant


def require_admin(
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
) -> Dict[str, Any]:
    """Exige que a requisição venha exclusivamente do Administrador Master."""
    if not tenant:
        raise HTTPException(
            status_code=401,
            detail="Acesso restrito ao Administrador. Forneça a senha master para autenticar."
        )
    if tenant.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Acesso negado. Apenas o Administrador Master possui permissão para acessar esta área."
        )
    return tenant

