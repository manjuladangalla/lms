import httpx

from app.core.config import settings


def is_configured() -> bool:
    return bool(settings.paypal_client_id and settings.paypal_client_secret)


async def _get_access_token() -> str:
    auth = (settings.paypal_client_id, settings.paypal_client_secret)
    data = {"grant_type": "client_credentials"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.paypal_api_base}/v1/oauth2/token", data=data, auth=auth
        )
        resp.raise_for_status()
        return resp.json()["access_token"]


async def create_order(amount: float, currency: str, description: str) -> dict:
    token = await _get_access_token()
    payload = {
        "intent": "CAPTURE",
        "purchase_units": [
            {
                "description": description,
                "amount": {"currency_code": currency, "value": f"{amount:.2f}"},
            }
        ],
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.paypal_api_base}/v2/checkout/orders",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def capture_order(order_id: str) -> dict:
    token = await _get_access_token()
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.paypal_api_base}/v2/checkout/orders/{order_id}/capture",
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json()


async def verify_webhook(headers: dict, raw_body: bytes) -> bool:
    if not settings.paypal_webhook_id:
        return True
    token = await _get_access_token()
    payload = {
        "auth_algo": headers.get("paypal-auth-algo", ""),
        "cert_url": headers.get("paypal-cert-url", ""),
        "transmission_id": headers.get("paypal-transmission-id", ""),
        "transmission_sig": headers.get("paypal-transmission-sig", ""),
        "transmission_time": headers.get("paypal-transmission-time", ""),
        "webhook_id": settings.paypal_webhook_id,
        "webhook_event": __import__("json").loads(raw_body),
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.paypal_api_base}/v1/notifications/verify-webhook-signature",
            json=payload,
            headers={"Authorization": f"Bearer {token}"},
        )
        resp.raise_for_status()
        return resp.json().get("verification_status") == "SUCCESS"
