"""
Integracao com Mercado Pago - Geracao de links de pagamento e recebimento de webhooks.
Permite pagamento 100% automatico e direto via Pix (QR Code e Copia e Cola) e Cartao de Credito.
Sem intervencao manual e sem redirecionamento para WhatsApp.
"""

import os
import time
import secrets
import httpx
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from ..database import get_db_connection, get_system_setting, set_system_setting
from ..auth import get_current_tenant_optional, create_token_for_tenant

router = APIRouter(prefix="/payments", tags=["Pagamentos"])

MP_API_BASE = "https://api.mercadopago.com"
APP_URL = "https://bichomasterpro.tech"
DEFAULT_MP_TOKEN = "APP_USR-2313405427574357-093013-34a63e8babcacc1388ca84cd2ab7a623-109701431"

PLANS = {
    "monthly":    {"name": "Radar 5x5 Pro - Mensal",     "price": 14.90, "days": 30},
    "quarterly":  {"name": "Radar 5x5 Pro - Trimestral", "price": 37.00, "days": 90},
    "semiannual": {"name": "Radar 5x5 Pro - Semestral",  "price": 67.00, "days": 180},
    "yearly":     {"name": "Radar 5x5 Pro - Anual",      "price": 97.00, "days": 365},
    "lifetime":   {"name": "Radar 5x5 Pro - Vitalicio",  "price": 147.00, "days": 3650},
}


def get_mp_token() -> str:
    token = get_system_setting("mp_access_token", "")
    if not token:
        token = os.getenv("MP_ACCESS_TOKEN", DEFAULT_MP_TOKEN)
        try:
            set_system_setting("mp_access_token", token)
        except Exception:
            pass
    if not token:
        raise HTTPException(status_code=500, detail="Token do Mercado Pago nao configurado no painel admin.")
    return token


@router.get("/plans")
def get_plans():
    return PLANS


@router.post("/create-preference")
async def create_preference(
    request: Request,
    plan: Optional[str] = Query(None),
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
):
    """
    Cria uma preferencia de pagamento no Mercado Pago.
    Permite checkout direto tanto para usuarios logados (ativos ou expirados) quanto para novos visitantes.
    """
    selected_plan = plan
    if not selected_plan:
        try:
            body = await request.json()
            selected_plan = body.get("plan")
        except Exception:
            pass
    if not selected_plan:
        selected_plan = "monthly"

    plan_info = PLANS.get(selected_plan)
    if not plan_info:
        raise HTTPException(status_code=400, detail=f"Plano invalido: '{selected_plan}'.")

    token = get_mp_token()
    
    tenant_id = tenant.get("id") if tenant else None
    tenant_key = tenant.get("tenant_key", "") if tenant else ""
    payer_email = None
    if tenant and tenant.get("email"):
        em = str(tenant["email"]).strip()
        if "@" in em and not em.endswith("@bichomaster.app") and not em.endswith("@bicho.app"):
            payer_email = em

    ref_prefix = f"tenant_{tenant_id}" if tenant_id else "guest"
    external_ref = f"{ref_prefix}_{selected_plan}_{int(time.time())}_{secrets.token_hex(3)}"

    payload = {
        "items": [{
            "id": selected_plan,
            "title": plan_info["name"],
            "description": f"Acesso VIP {plan_info['name']} - Radar 5x5 Pro",
            "picture_url": f"{APP_URL}/img/logo_bichopro.jpg",
            "quantity": 1,
            "unit_price": plan_info["price"],
            "currency_id": "BRL"
        }],
        "back_urls": {
            "success": f"{APP_URL}/?payment=success&plan={selected_plan}&ref={external_ref}",
            "failure": f"{APP_URL}/?payment=failed",
            "pending": f"{APP_URL}/?payment=pending&plan={selected_plan}&ref={external_ref}",
        },
        "auto_return": "approved",
        "notification_url": f"{APP_URL}/api/payments/webhook",
        "external_reference": external_ref,
        "metadata": {
            "tenant_id": tenant_id,
            "tenant_key": tenant_key,
            "plan": selected_plan,
            "plan_days": plan_info["days"],
            "external_reference": external_ref
        },
        "statement_descriptor": "RADAR5X5",
    }

    if payer_email:
        payload["payer"] = {"email": payer_email}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{MP_API_BASE}/checkout/preferences",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro de conexao com Mercado Pago: {str(e)}")

    if not resp.is_success:
        raise HTTPException(status_code=500, detail=f"Erro Mercado Pago: {resp.text[:300]}")

    data = resp.json()
    return {
        "checkout_url": data["init_point"],
        "preference_id": data["id"],
        "plan": selected_plan,
        "price": plan_info["price"],
        "days": plan_info["days"],
        "external_reference": external_ref
    }


@router.post("/create-subscription")
async def create_subscription(
    request: Request,
    tenant: Optional[Dict[str, Any]] = Depends(get_current_tenant_optional)
):
    """
    Cria uma assinatura recorrente com debito automatico mensal no cartao via Mercado Pago Preapproval.
    """
    token = get_mp_token()
    if not tenant:
        raise HTTPException(
            status_code=400,
            detail="Para assinatura recorrente, faça login com seu e-mail ou utilize o pagamento avulso via Pix/Cartão."
        )

    tenant_id = tenant["id"]
    payer_email = tenant.get("email") or f"cliente{tenant_id}@bicho.app"
    if "@bichomaster.app" in payer_email:
        payer_email = f"cliente{tenant_id}@bicho.app"

    external_ref = f"tenant_{tenant_id}_monthly_sub_{int(time.time())}"

    payload = {
        "reason": "Radar 5x5 Pro - Assinatura Mensal VIP",
        "auto_recurring": {
            "frequency": 1,
            "frequency_type": "months",
            "transaction_amount": 14.90,
            "currency_id": "BRL"
        },
        "payer_email": payer_email,
        "back_url": f"{APP_URL}/?payment=success&subscription=active",
        "external_reference": external_ref,
        "status": "pending"
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{MP_API_BASE}/preapproval",
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro de conexao com Mercado Pago: {str(e)}")

    if not resp.is_success:
        raise HTTPException(status_code=500, detail=f"Erro Mercado Pago: {resp.text[:300]}")

    data = resp.json()
    return {
        "checkout_url": data["init_point"],
        "subscription_id": data["id"],
        "plan": "monthly_recurring",
        "price": 14.90,
        "mode": "recurring"
    }


@router.get("/version")
def payments_version():
    return {"version": "v3_db_schema_fix", "status": "active"}


def process_approved_payment(payment: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ativa ou renova o plano VIP com base nos dados de um pagamento aprovado do Mercado Pago.
    - Se o assinante ja tiver dias ativos, SOMA os novos dias ao vencimento atual (nao perde dias restantes!).
    - Evita processamento duplicado se o pagamento ja tiver sido registrado em subscription_payments.
    """
    resource_id = str(payment.get("id", ""))
    status = payment.get("status")
    if status != "approved":
        return {"status": f"payment_{status}"}

    metadata = payment.get("metadata") or {}
    ext_ref = payment.get("external_reference", "")
    tenant_id = metadata.get("tenant_id")
    plan = metadata.get("plan", "monthly")
    plan_days = int(metadata.get("plan_days", 30))

    if not tenant_id and ext_ref.startswith("tenant_"):
        parts = ext_ref.split("_")
        try:
            tenant_id = int(parts[1])
            plan = parts[2] if len(parts) > 2 else "monthly"
            plan_days = PLANS.get(plan, {}).get("days", 30)
        except (ValueError, IndexError):
            pass

    payer = payment.get("payer") or {}
    payer_email = (payer.get("email") or "").strip().lower()
    fn = (payer.get("first_name") or "").strip()
    ln = (payer.get("last_name") or "").strip()
    p_name = f"{fn} {ln}".strip()
    payer_name = p_name if p_name and p_name not in ("None None", "None") else ""

    if not tenant_id and payer_email:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM tenants WHERE email = ?", (payer_email,))
            row = cursor.fetchone()
            if row:
                tenant_id = row[0]

    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Verifica se este pagamento ja foi registrado anteriormente para evitar duplicacoes
        try:
            cursor.execute("""
                SELECT id, tenant_id FROM subscription_payments 
                WHERE notes LIKE ? OR (notes IS NOT NULL AND notes LIKE ?)
            """, (f"%MP_ID:{resource_id}%", f"%{ext_ref}%"))
            existing_pay = cursor.fetchone()
            if existing_pay:
                return {"status": "already_processed", "tenant_id": existing_pay[1], "payment_id": resource_id}
        except Exception as check_err:
            print(f"[CHECK EXISTING PAY ERROR] {check_err}")

        now = datetime.now()
        now_str = now.strftime("%Y-%m-%d %H:%M:%S")
        amount = float(payment.get("transaction_amount", 0))

        # Se for um pagamento direto de visitante que ainda nao existia na base de dados:
        if not tenant_id:
            phone_data = payer.get("phone")
            payer_phone = ""
            if isinstance(phone_data, dict):
                payer_phone = f"{phone_data.get('area_code', '')}{phone_data.get('number', '')}".strip()

            clean_email = payer_email or f"cliente_{int(time.time())}@bicho.app"
            unique_key = f"vip-{secrets.token_hex(4)}"
            expiry_str = (now + timedelta(days=plan_days)).strftime("%Y-%m-%d %H:%M:%S")

            cursor.execute("""
                INSERT INTO tenants (
                    name, email, phone, password, tenant_key, role, status,
                    auth_provider, trial_started_at, trial_expires_at,
                    subscription_status, plan_type, notes, created_at, last_active_at
                ) VALUES (?, ?, ?, ?, ?, 'subscriber', 'active', 'mercadopago', ?, ?, 'active', ?, ?, ?, ?)
            """, (payer_name, clean_email, payer_phone, unique_key, unique_key, now_str, expiry_str, plan, f"Pagamento MP Ref: {ext_ref}", now_str, now_str))

            tenant_id = cursor.lastrowid
            if not tenant_id:
                cursor.execute("SELECT id FROM tenants WHERE tenant_key = ?", (unique_key,))
                r = cursor.fetchone()
                if r:
                    tenant_id = r[0]

        if not tenant_id:
            return {"status": "tenant_creation_failed"}

        # Se o nome do pagador nao veio preenchido pelo MP, usa o nome cadastrado do tenant
        if not payer_name or payer_name in ("None None", "None"):
            cursor.execute("SELECT name FROM tenants WHERE id = ?", (tenant_id,))
            r_name = cursor.fetchone()
            if r_name and r_name[0]:
                payer_name = r_name[0]
        if not payer_name or payer_name in ("None None", "None"):
            payer_name = "Assinante VIP"

        # Calcula a nova data de vencimento: se ja tiver dias restantes ativos, SOMA os dias!
        cursor.execute("SELECT trial_expires_at FROM tenants WHERE id = ?", (tenant_id,))
        row = cursor.fetchone()
        base_time = now
        if row and row[0]:
            try:
                current_exp = datetime.strptime(str(row[0]).strip()[:19], "%Y-%m-%d %H:%M:%S")
                if current_exp > now:
                    base_time = current_exp
            except Exception:
                pass

        new_expiry_str = (base_time + timedelta(days=plan_days)).strftime("%Y-%m-%d %H:%M:%S")

        cursor.execute("""
            UPDATE tenants 
            SET subscription_status='active', plan_type=?, trial_expires_at=?, status='active', last_active_at=?
            WHERE id=?
        """, (plan, new_expiry_str, now_str, tenant_id))

        try:
            cursor.execute("""
                INSERT INTO subscription_payments (
                    tenant_id, customer_name, plan_type, amount, days,
                    payment_method, status, notes, created_at
                ) VALUES (?, ?, ?, ?, ?, 'mercadopago', 'completed', ?, ?)
            """, (tenant_id, payer_name, plan, amount, plan_days, f"MP_ID:{resource_id} | Ref:{ext_ref}", now_str))
        except Exception as insert_err:
            print(f"[INSERT PAYMENT ERROR] {insert_err}")

    print(f"[MP WEBHOOK] Pagamento aprovado! Tenant #{tenant_id} | Plano: {plan} | R${amount:.2f} | Expira: {new_expiry_str}")
    return {"status": "activated", "tenant_id": tenant_id, "plan": plan, "expires_at": new_expiry_str}


@router.get("/verify-status")
async def verify_status(ref: Optional[str] = Query(None)):
    """
    Verifica se o pagamento referenciado ja foi aprovado e retorna dados de autenticacao para login automatico imediato do comprador.
    Tambem consulta ativamente o Mercado Pago para ativacao instantanea caso o webhook ainda nao tenha chegado.
    """
    if not ref:
        return {"status": "no_ref"}

    tenant_id = None
    if ref.startswith("tenant_"):
        parts = ref.split("_")
        try:
            tenant_id = int(parts[1])
        except (ValueError, IndexError):
            pass

    # 1. Consulta ativamente a API do Mercado Pago pelo external_reference para ativacao em tempo real
    token = get_mp_token()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            search_resp = await client.get(
                f"{MP_API_BASE}/v1/payments/search",
                params={"external_reference": ref},
                headers={"Authorization": f"Bearer {token}"}
            )
        if search_resp.is_success:
            s_data = search_resp.json()
            results = s_data.get("results") or []
            for p in results:
                if p.get("status") == "approved":
                    process_approved_payment(p)
                    break
    except Exception as e:
        print(f"[VERIFY STATUS MP SEARCH ERROR] {e}")

    # 2. Busca o tenant no banco de dados
    with get_db_connection() as conn:
        cursor = conn.cursor()
        tenant = None
        if tenant_id:
            cursor.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,))
            row = cursor.fetchone()
            if row:
                tenant = dict(row)
        else:
            cursor.execute("""
                SELECT t.* FROM tenants t
                JOIN subscription_payments p ON p.tenant_id = t.id
                WHERE p.notes LIKE ? OR t.tenant_key = ? OR t.notes LIKE ?
                ORDER BY t.id DESC LIMIT 1
            """, (f"%{ref}%", ref, f"%{ref}%"))
            row = cursor.fetchone()
            if row:
                tenant = dict(row)

        if tenant and tenant.get("subscription_status") == "active":
            token = create_token_for_tenant(tenant)
            from ..auth import calculate_trial_info
            trial_info = calculate_trial_info(tenant)
            return {
                "status": "approved",
                "subscription_status": "active",
                "plan": tenant.get("plan_type", "monthly"),
                "token": token,
                "tenant": {
                    "id": tenant["id"],
                    "name": tenant.get("name"),
                    "email": tenant.get("email"),
                    "phone": tenant.get("phone"),
                    "role": tenant.get("role", "tester"),
                    "subscription_status": tenant.get("subscription_status", "active"),
                    "plan_type": tenant.get("plan_type", "monthly"),
                    "trial_expires_at": tenant.get("trial_expires_at"),
                    "trial_info": trial_info,
                    "trial_days_remaining": trial_info.get("days_remaining", 30),
                    "is_expired": False
                }
            }

    return {"status": "pending_or_not_found"}


@router.api_route("/webhook", methods=["GET", "POST"])
async def mp_webhook(request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}

    topic = body.get("type") or body.get("topic") or request.query_params.get("topic") or request.query_params.get("type", "")
    resource_id = (body.get("data") or {}).get("id") or body.get("id") or request.query_params.get("data.id") or request.query_params.get("id", "")

    if request.method == "GET" and not resource_id:
        return {"status": "ok"}

    if not resource_id:
        return {"status": "ignored_no_id"}

    resource_id = str(resource_id).strip()
    topic = str(topic).strip()
    token = get_mp_token()

    # 1. Notificacao de assinatura recorrente (preapproval)
    if topic in ("subscription_preapproval", "preapproval"):
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{MP_API_BASE}/preapproval/{resource_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
            if resp.is_success:
                sub_data = resp.json()
                sub_status = sub_data.get("status")
                ext_ref = sub_data.get("external_reference", "")
                tenant_id = None
                if ext_ref and ext_ref.startswith("tenant_"):
                    try:
                        tenant_id = int(ext_ref.split("_")[1])
                    except (ValueError, IndexError):
                        pass

                if not tenant_id:
                    payer_email = sub_data.get("payer_email")
                    if payer_email:
                        with get_db_connection() as conn:
                            cursor = conn.cursor()
                            cursor.execute("SELECT id FROM tenants WHERE email = ?", (payer_email.lower(),))
                            row = cursor.fetchone()
                            if row:
                                tenant_id = row[0]

                if tenant_id and sub_status == "authorized":
                    now = datetime.now()
                    expiry_str = (now + timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
                    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
                    with get_db_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute("""
                            UPDATE tenants 
                            SET subscription_status='active', plan_type='monthly_recurring', 
                                trial_expires_at=?, status='active', last_active_at=?
                            WHERE id=?
                        """, (expiry_str, now_str, tenant_id))
                    print(f"[MP PREAPPROVAL] Assinatura autorizada para Tenant #{tenant_id} ate {expiry_str}")
                    return {"status": "subscription_activated", "tenant_id": tenant_id}
        except Exception as e:
            return {"status": "preapproval_exception", "error": str(e)}

    # 2. Notificacao de Checkout Pro (merchant_order) - Padrao oficial do MP quando pago via Pix ou Cartao no Checkout Pro!
    if topic in ("merchant_order", "merchant_orders"):
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                mo_resp = await client.get(
                    f"{MP_API_BASE}/merchant_orders/{resource_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
            if mo_resp.is_success:
                mo_data = mo_resp.json()
                payments_list = mo_data.get("payments") or []
                for p in payments_list:
                    if p.get("status") == "approved":
                        async with httpx.AsyncClient(timeout=15.0) as client:
                            pay_resp = await client.get(
                                f"{MP_API_BASE}/v1/payments/{p['id']}",
                                headers={"Authorization": f"Bearer {token}"}
                            )
                        if pay_resp.is_success:
                            return process_approved_payment(pay_resp.json())
                return {"status": "merchant_order_pending", "order_id": resource_id, "payments": payments_list}
            else:
                return {"status": "merchant_order_not_ok", "code": mo_resp.status_code, "body": mo_resp.text[:200]}
        except Exception as e:
            return {"status": "merchant_order_exception", "error": str(e)}

    # 3. Notificacao direta de pagamento (/v1/payments)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{MP_API_BASE}/v1/payments/{resource_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
    except Exception as e:
        return {"status": "fetch_error", "detail": str(e)}

    # Se retornou 404, pode ser que resource_id seja um merchant_order enviado sem o parametro topic
    if not resp.is_success:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                mo_resp = await client.get(
                    f"{MP_API_BASE}/merchant_orders/{resource_id}",
                    headers={"Authorization": f"Bearer {token}"}
                )
            if mo_resp.is_success:
                mo_data = mo_resp.json()
                payments_list = mo_data.get("payments") or []
                for p in payments_list:
                    if p.get("status") == "approved":
                        async with httpx.AsyncClient(timeout=15.0) as client:
                            pay_resp = await client.get(
                                f"{MP_API_BASE}/v1/payments/{p['id']}",
                                headers={"Authorization": f"Bearer {token}"}
                            )
                        if pay_resp.is_success:
                            return process_approved_payment(pay_resp.json())
                return {"status": "merchant_order_fallback_pending", "order_id": resource_id}
        except Exception:
            pass
        return {
            "status": "payment_not_found",
            "topic": topic,
            "resource_id": resource_id,
            "pay_code": resp.status_code,
            "pay_body": resp.text[:150]
        }

    payment = resp.json()
    return process_approved_payment(payment)
