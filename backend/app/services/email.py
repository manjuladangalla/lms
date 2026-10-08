"""Email delivery: SMTP when configured (DB/env), console log otherwise."""
from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.system_config import get_system_config


async def is_configured() -> bool:
    mail = (await get_system_config())["mail"]
    return bool(mail.get("enabled") and mail.get("host") and (mail.get("username") or mail.get("from_email")))


def _send_sync(cfg: dict, to: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = cfg.get("from_email") or cfg.get("username") or "noreply@localhost"
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))
    host = cfg["host"]
    port = int(cfg.get("port") or 587)
    with smtplib.SMTP(host, port, timeout=30) as server:
        if cfg.get("tls"):
            server.starttls()
        if cfg.get("username"):
            server.login(cfg["username"], cfg.get("password") or "")
        server.sendmail(msg["From"], [to], msg.as_string())


async def send_email(to: str, subject: str, html: str) -> bool:
    """Send email. Returns True if delivered via SMTP, False if not configured/failed."""
    mail = (await get_system_config())["mail"]
    configured = bool(mail.get("enabled") and mail.get("host") and (mail.get("username") or mail.get("from_email")))
    print(f"[email] to={to} subject={subject!r} configured={configured}")
    if not configured:
        return False
    try:
        await asyncio.to_thread(_send_sync, mail, to, subject, html)
        return True
    except Exception as exc:
        print(f"[email] send failed: {exc}")
        return False


def otp_email_html(code: str, site_name: str, ttl_min: int) -> str:
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;border:1px solid #eee;border-radius:12px">
      <h2 style="margin:0 0 8px">{site_name}</h2>
      <p>Your verification code is:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;
                 background:#f4f4fb;padding:16px;border-radius:8px">{code}</p>
      <p style="color:#666;font-size:13px">This code expires in {ttl_min} minutes. If you did not request this, ignore this email.</p>
    </div>
    """
