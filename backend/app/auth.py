"""
Módulo de Autenticação e Controle de Acesso Multi-Tenant.
Gerencia tokens de sessão, identificação de testadores e restrição de acesso ao Administrador Master.
"""

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
        if key.strip() in ("0203040", "admin123", "admin", "adminmaster"):
            cursor.execute("SELECT * FROM tenants WHERE role = 'admin' LIMIT 1")
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
            return tenant
    return None


def require_tenant(
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
) -> Dict[str, Any]:
    """Exige que a requisição venha de um tenant ativo (admin ou testador)."""
    if not tenant:
        raise HTTPException(
            status_code=401,
            detail="Acesso não autorizado. Informe sua Chave de Testador ou faça login para continuar."
        )
    if tenant.get("status") != "active":
        raise HTTPException(
            status_code=403,
            detail="Esta conta de teste está suspensa ou inativa. Contate o administrador."
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
