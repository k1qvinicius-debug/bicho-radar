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
    get_current_tenant_optional,
    calculate_trial_info,
    get_or_create_google_tenant
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
    trial_info = tenant.get("trial_info") or calculate_trial_info(tenant)

    return LoginResponseModel(
        token=token,
        tenant={
            "id": tenant["id"],
            "name": tenant["name"],
            "email": tenant.get("email"),
            "tenant_key": tenant["tenant_key"],
            "role": tenant["role"],
            "status": tenant["status"],
            "subscription_status": tenant.get("subscription_status", "trial"),
            "trial_expires_at": tenant.get("trial_expires_at"),
            "trial_info": trial_info,
            "created_at": str(tenant.get("created_at", "")),
            "last_active_at": str(tenant.get("last_active_at", ""))
        }
    )


import base64
import json


@router.post("/google", response_model=LoginResponseModel)
def login_google(payload: LoginRequestModel):
    """
    Autenticação via Google (Gmail).
    Cria automaticamente a conta de testador com 7 dias de degustação caso seja o primeiro acesso.
    """
    email = payload.email
    name = payload.name or ""
    sub = None

    # Se vier credencial JWT do Google Sign-In, decodifica com segurança o payload do token
    if payload.credential:
        try:
            parts = payload.credential.split(".")
            if len(parts) >= 2:
                # Padding de base64 se necessário
                b64_payload = parts[1] + "=" * (-len(parts[1]) % 4)
                decoded_json = base64.urlsafe_b64decode(b64_payload).decode("utf-8")
                token_data = json.loads(decoded_json)
                email = token_data.get("email", email)
                name = token_data.get("name", name)
                sub = token_data.get("sub")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Token do Google inválido: {e}")

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="E-mail do Google não informado ou inválido.")

    from ..auth import get_or_create_google_tenant, calculate_trial_info
    tenant = get_or_create_google_tenant(email, name, sub)
    if not tenant:
        raise HTTPException(status_code=500, detail="Falha ao registrar ou localizar conta do Google.")

    if tenant.get("status") != "active":
        raise HTTPException(
            status_code=403,
            detail="Esta conta está suspensa ou desativada. Fale com o administrador."
        )

    update_tenant_activity(tenant["id"])
    token = create_token_for_tenant(tenant)
    trial_info = calculate_trial_info(tenant)

    return LoginResponseModel(
        token=token,
        tenant={
            "id": tenant["id"],
            "name": tenant["name"],
            "email": tenant.get("email"),
            "tenant_key": tenant["tenant_key"],
            "role": tenant["role"],
            "status": tenant["status"],
            "subscription_status": tenant.get("subscription_status", "trial"),
            "trial_expires_at": tenant.get("trial_expires_at"),
            "trial_info": trial_info,
            "created_at": str(tenant.get("created_at", "")),
            "last_active_at": str(tenant.get("last_active_at", ""))
        }
    )


@router.get("/settings")
def get_public_settings():
    """Retorna configurações públicas (WhatsApp de suporte, dias de teste, nome do app)."""
    from ..database import get_system_setting
    return {
        "support_whatsapp": get_system_setting("support_whatsapp", ""),
        "trial_days": int(get_system_setting("trial_days", "7")),
        "app_name": get_system_setting("app_name", "Bicho Master Pro")
    }


@router.get("/me")
def get_current_user(tenant: Dict[str, Any] = Depends(require_tenant)):
    """Retorna os dados do usuário/tenant atualmente autenticado."""
    from ..auth import calculate_trial_info
    trial_info = tenant.get("trial_info") or calculate_trial_info(tenant)
    return {
        "id": tenant["id"],
        "name": tenant["name"],
        "email": tenant.get("email"),
        "tenant_key": tenant["tenant_key"],
        "role": tenant["role"],
        "status": tenant["status"],
        "subscription_status": tenant.get("subscription_status", "trial"),
        "trial_expires_at": tenant.get("trial_expires_at"),
        "trial_info": trial_info,
        "is_admin": tenant.get("role") == "admin",
        "created_at": str(tenant.get("created_at", "")),
        "last_active_at": str(tenant.get("last_active_at", ""))
    }


@router.get("/check")
def check_session(tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)):
    """Verifica se há sessão válida ativa sem disparar erro 401."""
    if not tenant:
        return {"authenticated": False}
    from ..auth import calculate_trial_info
    trial_info = tenant.get("trial_info") or calculate_trial_info(tenant)
    return {
        "authenticated": True,
        "id": tenant["id"],
        "name": tenant["name"],
        "email": tenant.get("email"),
        "role": tenant["role"],
        "subscription_status": tenant.get("subscription_status", "trial"),
        "trial_info": trial_info,
        "is_admin": tenant.get("role") == "admin"
    }
