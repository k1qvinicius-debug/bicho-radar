"""
Integracao com Mercado Pago - Geracao de links de pagamento e recebimento de webhooks.
Quando o cliente paga, o acesso e liberado automaticamente no sistema.
"""

import os
import time
import httpx
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, Request, Depends, Query
from ..database import get_db_connection, get_system_setting, set_system_setting
from ..auth import require_tenant

router = APIRouter(prefix="/payments", tags=["Pagamentos"])

MP_API_BASE = "https://api.mercadopago.com"
APP_URL = "https://bichomasterpro.tech"
DEFAULT_MP_TOKEN = "APP_USR-2313405427574357-093013-34a63e8babcacc1388ca84cd2ab7a623-109701431"

PLANS = {
    "monthly":    {"name": "Bicho Pro - Mensal",     "price": 14.90, "days": 30},
    "quarterly":  {"name": "Bicho Pro - Trimestral", "price": 37.00, "days": 90},
    "semiannual": {"name": "Bicho Pro - Semestral",  "price": 67.00, "days": 180},
    "yearly":     {"name": "Bicho Pro - Anual",      "price": 97.00, "days": 365},
    "lifetime":   {"name": "Bicho Pro - Vitalicio",  "price": 147.00, "days": 3650},
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
async def create_preference(request: Request, plan: Optional[str] = Query(None), tenant=Depends(require_tenant)):
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
    tenant_id = tenant["id"]
    tenant_key = tenant.get("tenant_key", "")
    payer_email = tenant.get("email") or f"cliente{tenant_id}@bicho.app"
    if "@bichomaster.app" in payer_email:
        payer_email = f"cliente{tenant_id}@bicho.app"

    external_ref = f"tenant_{tenant_id}_{selected_plan}_{int(time.time())}"

    payload = {
        "items": [{
            "id": selected_plan,
            "title": plan_info["name"],
            "description": f"Assinatura {plan_info['name']} - Bicho Master Pro",
            "picture_url": f"{APP_URL}/img/logo_bichopro.jpg",
            "quantity": 1,
            "unit_price": plan_info["price"],
            "currency_id": "BRL"
        }],
        "payer": {"email": payer_email},
        "back_urls": {
            "success": f"{APP_URL}/?payment=success&plan={selected_plan}",
            "failure": f"{APP_URL}/?payment=failed",
            "pending": f"{APP_URL}/?payment=pending",
        },
        "auto_return": "approved",
        "notification_url": f"{APP_URL}/api/payments/webhook",
        "external_reference": external_ref,
        "metadata": {
            "tenant_id": tenant_id,
            "tenant_key": tenant_key,
            "plan": selected_plan,
            "plan_days": plan_info["days"]
        },
        "statement_descriptor": "BICHOPRO",
    }

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
        "days": plan_info["days"]
    }


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

    token = get_mp_token()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"{MP_API_BASE}/v1/payments/{resource_id}",
                headers={"Authorization": f"Bearer {token}"}
            )
    except Exception as e:
        return {"status": "fetch_error", "detail": str(e)}

    if not resp.is_success:
        return {"status": "payment_not_found"}

    payment = resp.json()
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

    if not tenant_id:
        payer_email = (payment.get("payer") or {}).get("email")
        if payer_email:
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id FROM tenants WHERE email = ?", (payer_email.lower(),))
                row = cursor.fetchone()
                if row:
                    tenant_id = row[0]

    if not tenant_id:
        return {"status": "tenant_not_found"}

    now = datetime.now()
    expiry_str = (now + timedelta(days=plan_days)).strftime("%Y-%m-%d %H:%M:%S")
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")
    amount = payment.get("transaction_amount", 0)

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM tenants WHERE id = ?", (tenant_id,))
        if not cursor.fetchone():
            return {"status": "tenant_not_in_db"}
        cursor.execute("""
            UPDATE tenants SET subscription_status='active', plan_type=?, trial_expires_at=?, status='active', last_active_at=?
            WHERE id=?
        """, (plan, expiry_str, now_str, tenant_id))
        try:
            cursor.execute("""
                INSERT INTO subscription_payments (tenant_id, amount, plan_type, mp_payment_id, status, created_at)
                VALUES (?, ?, ?, ?, 'approved', ?)
            """, (tenant_id, amount, plan, str(resource_id), now_str))
        except Exception:
            pass

    print(f"[MP WEBHOOK] Pagamento aprovado! Tenant #{tenant_id} | Plano: {plan} | R${amount:.2f} | Expira: {expiry_str}")
    return {"status": "activated", "tenant_id": tenant_id, "plan": plan, "expires_at": expiry_str}
