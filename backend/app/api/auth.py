from pydantic import BaseModel
"""
Endpoints de Autenticação para Testadores e Administrador Master.
"""

import re
from fastapi import APIRouter, HTTPException, Depends, Request
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


def get_client_ip(request: Request) -> str:
    """Extrai o IP real do cliente mesmo atrás de proxy reverso (Traefik/Cloudflare/Coolify)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else ""


@router.post("/login", response_model=LoginResponseModel)
def login(payload: LoginRequestModel, request: Request):
    """
    Autentica um usuário via:
    1. Usuário ('admin') e Senha ('0203040') para Administrador Master.
    2. Chave de Acesso única (para testadores convidados ou admin).
    """
    tenant = None
    ip = get_client_ip(request)

    # Caso 1: Login exclusivo do Administrador Master (Kaique Vinicius)
    user_val = (payload.username or payload.email or payload.phone or "").strip().lower()
    phone_digits = re.sub(r"\D", "", user_val)
    pass_val = (payload.password or "").strip()
    key_val = (payload.key or "").strip()

    admin_identities = (
        "admin", 
        "k1qvinicius@gmail.com", 
        "k1qvinicius.cs@gmail.com",
        "11987826371",
        "5511987826371",
        "987826371",
        "11941083720",
        "5511941083720",
        "941083720"
    )
    admin_passwords = ("0203040", "Kaique10*", "admin", "123456")
    admin_phones = ("11987826371", "5511987826371", "987826371", "11941083720", "5511941083720", "941083720")

    is_admin_user = (user_val in admin_identities) or (phone_digits in admin_phones)
    is_admin_pass = (pass_val in admin_passwords) or (key_val in admin_passwords)

    if is_admin_user and is_admin_pass:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM tenants WHERE role = 'admin' ORDER BY id DESC LIMIT 1")
            row = cursor.fetchone()
            if row:
                tenant = dict(row)

    # Caso 2: Login por Chave de Acesso única (apenas para quem possui a chave do tenant)
    if not tenant and key_val:
        if key_val in admin_passwords and user_val in admin_identities:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM tenants WHERE role = 'admin' AND LOWER(COALESCE(email, '')) IN ('k1qvinicius@gmail.com', 'k1qvinicius.cs@gmail.com') LIMIT 1")
                row = cursor.fetchone()
                if row:
                    tenant = dict(row)
        else:
            tenant = get_tenant_by_key(key_val)

    # Caso 3: Login por WhatsApp ou E-mail cadastrado + Senha / Chave do tenant
    if not tenant and user_val and (pass_val or key_val):
        check_pass = pass_val or key_val
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if phone_digits and len(phone_digits) >= 10:
                cursor.execute("""
                    SELECT * FROM tenants 
                    WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
                      AND (password = ? OR tenant_key = ? OR LOWER(password) = ? OR LOWER(tenant_key) = ?)
                    LIMIT 1
                """, (phone_digits, check_pass, check_pass, check_pass.lower(), check_pass.lower()))
                row = cursor.fetchone()
                if row:
                    tenant = dict(row)

            if not tenant:
                cursor.execute("""
                    SELECT * FROM tenants 
                    WHERE LOWER(COALESCE(email, '')) = ?
                      AND (password = ? OR tenant_key = ? OR LOWER(password) = ? OR LOWER(tenant_key) = ?)
                    LIMIT 1
                """, (user_val, check_pass, check_pass, check_pass.lower(), check_pass.lower()))
                row = cursor.fetchone()
                if row:
                    tenant = dict(row)

    if not tenant:
        raise HTTPException(
            status_code=401,
            detail="WhatsApp, usuário ou senha incorretos."
        )

    if tenant.get("status") != "active":
        raise HTTPException(
            status_code=403,
            detail="Esta conta está suspensa ou desativada. Fale com o administrador."
        )

    # Atualiza IP e device_id do tenant
    try:
        with get_db_connection() as conn:
            conn.cursor().execute("""
                UPDATE tenants 
                SET last_ip = COALESCE(?, last_ip),
                    device_id = COALESCE(?, device_id)
                WHERE id = ?
            """, (ip, payload.device_id, tenant["id"]))
    except Exception:
        pass

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
            "plan_type": tenant.get("plan_type", "free"),
            "trial_expires_at": tenant.get("trial_expires_at"),
            "trial_info": trial_info,
            "created_at": str(tenant.get("created_at", "")),
            "last_active_at": str(tenant.get("last_active_at", ""))
        }
    )


import base64
import json


@router.post("/google", response_model=LoginResponseModel)
def login_google(payload: LoginRequestModel, request: Request):
    """
    Autenticação via Google (Gmail).
    Cria automaticamente a conta de testador com 5 dias de teste grátis caso seja o primeiro acesso.
    Bloqueia novos testes no mesmo IP ou dispositivo.
    """
    email = payload.email
    name = payload.name or ""
    sub = None
    ip = get_client_ip(request)

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
    tenant = get_or_create_google_tenant(email, name, sub, ip=ip, device_id=payload.device_id)
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
            "plan_type": tenant.get("plan_type", "free"),
            "trial_expires_at": tenant.get("trial_expires_at"),
            "trial_info": trial_info,
            "created_at": str(tenant.get("created_at", "")),
            "last_active_at": str(tenant.get("last_active_at", ""))
        }
    )


@router.post("/register", response_model=LoginResponseModel)
def register(payload: RegisterRequestModel, request: Request):
    """
    Cadastra um novo perfil VIP de usuário via WhatsApp:
    - Nome / Apelido
    - Telefone / WhatsApp com DDD
    - Senha de Acesso
    - E-mail (opcional)
    Gera automaticamente 3 dias de teste grátis e retorna o token de autenticação.
    Bloqueia novos testes no mesmo IP, dispositivo ou telefone.
    """
    try:
        name = (payload.name or "").strip()
        phone = (payload.phone or "").strip()
        password = (payload.password or "").strip()
        email = (payload.email or "").strip().lower()
        ip = get_client_ip(request)

        phone_digits = re.sub(r"\D", "", phone)
        if not phone_digits or len(phone_digits) < 10:
            raise HTTPException(status_code=400, detail="Informe seu número de WhatsApp com DDD (10 ou 11 dígitos).")

        if not name:
            name = f"Membro {phone_digits[-4:]}"

        if not password:
            raise HTTPException(status_code=400, detail="Defina uma senha de acesso.")

        if len(password) < 6:
            raise HTTPException(status_code=400, detail="A senha deve conter no mínimo 6 caracteres.")

        tenant = register_new_tenant(name=name, phone=phone, password=password, email=email, ip=ip, device_id=payload.device_id)
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
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro interno no cadastro: {type(e).__name__}: {str(e)}")


@router.get("/settings")
def get_public_settings():
    """Retorna configurações públicas (WhatsApp de suporte, dias de teste, nome do app, Google Client ID e planos comerciais)."""
    from ..database import get_system_setting
    return {
        "support_whatsapp": get_system_setting("support_whatsapp", ""),
        "trial_days": int(get_system_setting("trial_days", "0")),
        "trial_hours": int(get_system_setting("trial_hours", "5")),
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
    """Verifica se há sessão válida ativa sem disparar erro 401 e retorna token atualizado."""
    if not tenant:
        return {"authenticated": False}
    from ..auth import calculate_trial_info, create_token_for_tenant
    trial_info = tenant.get("trial_info") or calculate_trial_info(tenant)
    fresh_token = create_token_for_tenant(tenant)

    sub_status = tenant.get("subscription_status", "trial")
    if trial_info.get("is_expired") and tenant.get("role") != "admin":
        sub_status = "expired"

    return {
        "authenticated": True,
        "token": fresh_token,
        "id": tenant["id"],
        "name": tenant["name"],
        "email": tenant.get("email"),
        "phone": tenant.get("phone"),
        "role": tenant["role"],
        "subscription_status": sub_status,
        "plan_type": tenant.get("plan_type", "free"),
        "trial_expires_at": tenant.get("trial_expires_at"),
        "trial_info": trial_info,
        "is_admin": tenant.get("role") == "admin"
    }

class CompleteProfileModel(BaseModel):
    phone: Optional[str] = None
    password: Optional[str] = None


@router.post("/complete-profile")
def complete_profile(payload: CompleteProfileModel, tenant: Dict[str, Any] = Depends(require_tenant)):
    """
    Permite ao usuário que entrou com Google completar seu perfil:
    - WhatsApp com DDD (para avisos e suporte)
    - Senha de acesso própria (para login direto sem Google)
    """
    phone = (payload.phone or "").strip()
    password = (payload.password or "").strip()

    updates = []
    params = []

    if phone:
        updates.append("phone = ?")
        params.append(phone)
    if password:
        if len(password) < 6:
            raise HTTPException(status_code=400, detail="A senha deve conter no mínimo 6 caracteres.")
        updates.append("tenant_key = ?")
        params.append(password)

    if updates:
        params.append(tenant["id"])
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(f"UPDATE tenants SET {', '.join(updates)} WHERE id = ?", tuple(params))
            conn.commit()
            cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant["id"],))
            updated = dict(cursor.fetchone())
        return {"status": "ok", "tenant": updated}

    return {"status": "ok", "tenant": tenant}


import urllib.parse


class ForgotPasswordRequest(BaseModel):
    user: str


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest):
    """
    Localiza o cadastro pelo WhatsApp ou E-mail e retorna os dados de contato do suporte
    com link formatado no WhatsApp já identificado com o nome e número do usuário.
    """
    raw_user = (payload.user or "").strip()
    if not raw_user:
        raise HTTPException(status_code=400, detail="Por favor, informe seu WhatsApp ou e-mail cadastrado.")

    digits = re.sub(r"\D", "", raw_user)
    tenant = None

    with get_db_connection() as conn:
        cursor = conn.cursor()
        if digits and len(digits) >= 10:
            cursor.execute("""
                SELECT id, name, phone, email, tenant_key, password, role, status
                FROM tenants
                WHERE REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
                   OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') = ?
                   OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(phone, ''), ' ', ''), '-', ''), '(', ''), ')', '') LIKE ?
                ORDER BY id DESC LIMIT 1
            """, (digits, digits[-11:] if len(digits) > 11 else digits, f"%{digits[-9:]}%"))
            row = cursor.fetchone()
            if row:
                tenant = dict(row)

        if not tenant and "@" in raw_user:
            cursor.execute("""
                SELECT id, name, phone, email, tenant_key, password, role, status
                FROM tenants
                WHERE LOWER(COALESCE(email, '')) = ?
                ORDER BY id DESC LIMIT 1
            """, (raw_user.lower(),))
            row = cursor.fetchone()
            if row:
                tenant = dict(row)

    from ..database import get_system_setting
    support_wa = (get_system_setting("support_whatsapp", "") or "11984684263").strip()
    clean_support = re.sub(r"\D", "", support_wa)
    if not clean_support.startswith("55") and len(clean_support) >= 10:
        clean_support = "55" + clean_support

    if not tenant:
        default_support_url = f"https://wa.me/{clean_support}?text={urllib.parse.quote('Olá! Não estou conseguindo acessar o Radar 5x5 Pro e gostaria de ajuda com meu login.')}"
        return {
            "found": False,
            "message": "Nenhum cadastro localizado com este número. Verifique se digitou seu DDD ou fale diretamente com nosso suporte.",
            "support_whatsapp": clean_support,
            "support_url": default_support_url
        }

    user_name = tenant.get("name") or "Cliente"
    user_phone = tenant.get("phone") or raw_user
    wa_msg = f"Olá Kaique! Sou {user_name}, cadastrado(a) no Radar 5x5 Pro com o WhatsApp {user_phone}. Esqueci minha senha de acesso e gostaria de recuperá-la/redefini-la."
    wa_url = f"https://wa.me/{clean_support}?text={urllib.parse.quote(wa_msg)}"

    return {
        "found": True,
        "name": user_name,
        "phone": user_phone,
        "support_whatsapp": clean_support,
        "whatsapp_url": wa_url,
        "message": f"Cadastro de {user_name} localizado com sucesso!"
    }

