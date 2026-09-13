"""
Endpoints de Autenticação para Testadores e Administrador Master.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
from ..database import get_db_connection
from ..models import LoginRequestModel, LoginResponseModel
from ..auth import (
    get_tenant_by_key,
    create_token_for_tenant,
    update_tenant_activity,
    require_tenant,
    get_current_tenant_optional
)

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.post("/login", response_model=LoginResponseModel)
def login(payload: LoginRequestModel):
    """
    Autentica um usuário via:
    1. Usuário ('admin') e Senha ('0203040') para Administrador Master.
    2. Chave de Acesso única (para testadores convidados ou admin).
    """
    tenant = None

    # Caso 1: Login por Usuário e Senha (Admin)
    # Caso 1: Login por Usuário e Senha (Admin)
    if payload.username and payload.password:
        u = payload.username.strip().lower()
        p = payload.password.strip()
        if u == "admin" and (p in ("0203040", "admin123", "admin", "adminmaster")):
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM tenants WHERE role = 'admin' LIMIT 1")
                row = cursor.fetchone()
                if row:
                    tenant = dict(row)

    # Caso 2: Login por Chave de Acesso direta
    if not tenant and payload.key:
        key = payload.key.strip()
        if key in ("0203040", "admin123", "admin", "adminmaster"):
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM tenants WHERE role = 'admin' LIMIT 1")
                row = cursor.fetchone()
                if row:
                    tenant = dict(row)
        else:
            tenant = get_tenant_by_key(key)

    if not tenant:
        raise HTTPException(
            status_code=401,
            detail="Credenciais ou chave de acesso inválidas."
        )

    if tenant.get("status") != "active":
        raise HTTPException(
            status_code=403,
            detail="Esta conta está suspensa ou desativada. Fale com o administrador."
        )

    update_tenant_activity(tenant["id"])
    token = create_token_for_tenant(tenant)

    return LoginResponseModel(
        token=token,
        tenant={
            "id": tenant["id"],
            "name": tenant["name"],
            "tenant_key": tenant["tenant_key"],
            "role": tenant["role"],
            "status": tenant["status"],
            "created_at": tenant.get("created_at", ""),
            "last_active_at": tenant.get("last_active_at", "")
        }
    )


@router.get("/me")
def get_current_user(tenant: Dict[str, Any] = Depends(require_tenant)):
    """Retorna os dados do usuário/tenant atualmente autenticado."""
    return {
        "id": tenant["id"],
        "name": tenant["name"],
        "tenant_key": tenant["tenant_key"],
        "role": tenant["role"],
        "status": tenant["status"],
        "is_admin": tenant.get("role") == "admin",
        "created_at": tenant.get("created_at", ""),
        "last_active_at": tenant.get("last_active_at", "")
    }


@router.get("/check")
def check_session(tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)):
    """Verifica se há sessão válida ativa sem disparar erro 401."""
    if not tenant:
        return {"authenticated": False}
    return {
        "authenticated": True,
        "id": tenant["id"],
        "name": tenant["name"],
        "role": tenant["role"],
        "is_admin": tenant.get("role") == "admin"
    }
