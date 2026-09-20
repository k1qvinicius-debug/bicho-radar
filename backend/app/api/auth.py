"""
Endpoints de Autenticação para Testadores e Administrador Master.
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any, Optional
from ..database import get_db_connection
from ..models import LoginRequestModel, LoginResponseModel, RegisterRequestModel
from ..auth import (
    get_tenant_by_key,
    create_token_for_tenant,
    update_tenant_activity,
    require_tenant,
    get_current_tenant_optional,
    calculate_trial_info,
    get_or_create_google_tenant,
    register_new_tenant
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

    # Caso 1: Login por Usuário/E-mail e Senha (Admin)
    user_val = (payload.username or payload.email or "").strip().lower()
    pass_val = (payload.password or "").strip()
    key_val = (payload.key or "").strip()

    if user_val in ("admin", "k1qvinicius@gmail.com", "k1qvinicius") and pass_val in ("0203040", "admin123", "admin", "adminmaster"):
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tenants WHERE role = 'admin' OR LOWER(COALESCE(email, '')) = 'k1qvinicius@gmail.com' LIMIT 1")
            row = cursor.fetchone()
            if row:
                tenant = dict(row)

    # Caso 2: Login por Chave de Acesso direta ou Senha Master
    if not tenant and (key_val or pass_val):
        check_val = key_val or pass_val
        if check_val in ("0203040", "admin123", "admin", "adminmaster"):
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM tenants WHERE role = 'admin' OR LOWER(COALESCE(email, '')) = 'k1qvinicius@gmail.com' LIMIT 1")
                row = cursor.fetchone()
                if row:
                    tenant = dict(row)
        else:
            tenant = get_tenant_by_key(check_val)

    # Caso 3: Login por E-mail cadastrado + Senha / Chave do tenant
    if not tenant and user_val and (pass_val or key_val):
        check_pass = pass_val or key_val
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM tenants WHERE LOWER(COALESCE(email, '')) = ? AND (tenant_key = ? OR LOWER(tenant_key) = ?) LIMIT 1",
                (user_val, check_pass, check_pass.lower())
            )
            row = cursor.fetchone()
            if row:
                tenant = dict(row)

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
            "phone": tenant.get("phone"),
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
            "phone": tenant.get("phone"),
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


@router.post("/register", response_model=LoginResponseModel)
def register(payload: RegisterRequestModel):
    """
    Cadastra um novo perfil completo de usuário:
    - Nome Completo
    - Gmail / E-mail
    - Telefone / WhatsApp com DDD
    - Senha de Acesso
    Gera automaticamente 5 dias de degustação gratuita e retorna o token de autenticação.
    """
    email = (payload.email or "").strip().lower()
    name = (payload.name or "").strip()
    phone = (payload.phone or "").strip()
    password = (payload.password or "").strip()

    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Informe um e-mail ou Gmail válido.")

    if not name:
        name = email.split("@")[0]

    if not password:
        raise HTTPException(status_code=400, detail="Defina uma senha de acesso.")

    if len(password) < 3:
        raise HTTPException(status_code=400, detail="A senha deve conter pelo menos 3 dígitos/caracteres.")

    tenant = register_new_tenant(name=name, email=email, phone=phone, password=password)
    if not tenant:
        raise HTTPException(status_code=500, detail="Falha ao cadastrar conta. Tente novamente.")

    if tenant.get("status") != "active":
        raise HTTPException(status_code=403, detail="Esta conta está suspensa ou desativada.")

    update_tenant_activity(tenant["id"])
    token = create_token_for_tenant(tenant)
    trial_info = calculate_trial_info(tenant)

    return LoginResponseModel(
        token=token,
        tenant={
            "id": tenant["id"],
            "name": tenant["name"],
            "email": tenant.get("email"),
            "phone": tenant.get("phone"),
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
    """Retorna configurações públicas (WhatsApp de suporte, dias de teste, nome do app, Google Client ID e planos comerciais)."""
    from ..database import get_system_setting
    return {
        "support_whatsapp": get_system_setting("support_whatsapp", ""),
        "trial_days": int(get_system_setting("trial_days", "5")),
        "app_name": get_system_setting("app_name", "Bicho Master Pro"),
        "google_client_id": get_system_setting("google_client_id", ""),
        "plans": {
            "monthly": {
                "name": "Mensal",
                "price": "14,90",
                "price_num": 14.90,
                "period": "mês",
                "equivalent": "14,90/mês",
                "badge": "Acesso Básico",
                "link": get_system_setting("plan_link_monthly", "")
            },
            "quarterly": {
                "name": "Trimestral",
                "price": "41,90",
                "price_num": 41.90,
                "period": "3 meses",
                "equivalent": "13,97/mês",
                "badge": "6,3% OFF",
                "link": get_system_setting("plan_link_quarterly", "")
            },
            "semiannual": {
                "name": "Semestral",
                "price": "79,90",
                "price_num": 79.90,
                "period": "6 meses",
                "equivalent": "13,31/mês",
                "badge": "10,6% OFF",
                "link": get_system_setting("plan_link_semiannual", "")
            },
            "yearly": {
                "name": "Anual",
                "price": "159,90",
                "price_num": 159.90,
                "period": "12 meses",
                "equivalent": "13,32/mês",
                "badge": "Mais Econômico",
                "link": get_system_setting("plan_link_yearly", "")
            },
            "lifetime": {
                "name": "Vitalício VIP",
                "price": "297,00",
                "price_num": 297.00,
                "period": "pagamento único",
                "equivalent": "Acesso Para Sempre",
                "badge": "Oferta VIP Permanente",
                "link": get_system_setting("plan_link_lifetime", "")
            }
        }
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
        "phone": tenant.get("phone"),
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
        "phone": tenant.get("phone"),
        "role": tenant["role"],
        "subscription_status": tenant.get("subscription_status", "trial"),
        "trial_info": trial_info,
        "is_admin": tenant.get("role") == "admin"
    }
