"""SMTP email service with retry logic, HTML/text support, and structured logging."""

import logging
import smtplib
import time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings

logger = logging.getLogger("cryptalk.email")

_MAX_RETRIES = 3
_RETRY_DELAY = 1.0


def _build_verification_url(token: str) -> str:
    base = settings.CORS_ORIGINS.split(",")[0].strip().rstrip("/")
    if not base or base == "*":
        base = "http://localhost:3000"
    return f"{base}/verify-email?token={token}"


def _build_reset_url(token: str) -> str:
    base = settings.CORS_ORIGINS.split(",")[0].strip().rstrip("/")
    if not base or base == "*":
        base = "http://localhost:3000"
    return f"{base}/reset-password?token={token}"


# ---------------------------------------------------------------------------
# Email templates
# ---------------------------------------------------------------------------

def _welcome_html(name: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0B0F17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F17;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#10B981,#0D9488);padding:32px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:24px;">Welcome to Cryptalk</h1>
</td></tr>
<tr><td style="padding:32px;color:#D1D5DB;font-size:15px;line-height:1.6;">
<p style="margin:0 0 16px;">Hi {name},</p>
<p style="margin:0 0 16px;">Your account is ready. Cryptalk gives you private, end-to-end encrypted messaging with no phone number required.</p>
<p style="margin:0 0 8px;">What you can do:</p>
<ul style="margin:0 0 16px;padding-left:20px;">
<li>Send E2EE messages in real time</li>
<li>Create groups that auto-expire</li>
<li>Share files securely with size limits</li>
</ul>
<p style="margin:0;color:#6B7280;font-size:13px;">This is a transactional email for your Cryptalk account.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>"""


def _verification_html(name: str, url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0B0F17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F17;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#10B981,#0D9488);padding:32px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:24px;">Verify Your Email</h1>
</td></tr>
<tr><td style="padding:32px;color:#D1D5DB;font-size:15px;line-height:1.6;">
<p style="margin:0 0 16px;">Hi {name},</p>
<p style="margin:0 0 24px;">Click the button below to verify your email address and unlock all Cryptalk features.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="background:linear-gradient(135deg,#10B981,#0D9488);border-radius:12px;">
<a href="{url}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:16px;font-weight:600;text-decoration:none;">Verify Email</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#6B7280;font-size:13px;">If the button doesn't work, paste this link into your browser:<br><a href="{url}" style="color:#10B981;">{url}</a></p>
</td></tr>
</table>
</td></tr></table>
</body></html>"""


def _reset_html(name: str, url: str) -> str:
    return f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0B0F17;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0F17;padding:40px 20px;">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#F59E0B,#D97706);padding:32px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:24px;">Reset Your Password</h1>
</td></tr>
<tr><td style="padding:32px;color:#D1D5DB;font-size:15px;line-height:1.6;">
<p style="margin:0 0 16px;">Hi {name},</p>
<p style="margin:0 0 24px;">We received a password reset request. Click the button below to set a new password. This link expires in 1 hour.</p>
<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="background:linear-gradient(135deg,#F59E0B,#D97706);border-radius:12px;">
<a href="{url}" style="display:inline-block;padding:14px 32px;color:#fff;font-size:16px;font-weight:600;text-decoration:none;">Reset Password</a>
</td></tr></table>
<p style="margin:24px 0 0;color:#6B7280;font-size:13px;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>"""


# ---------------------------------------------------------------------------
# SMTP transport
# ---------------------------------------------------------------------------

def _send_raw(to_email: str, subject: str, html_body: str, text_body: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    last_error: Optional[Exception] = None
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            if settings.SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
            else:
                server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15)
                server.ehlo()
                if settings.SMTP_USE_TLS:
                    server.starttls()
                    server.ehlo()
            try:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL, [to_email], msg.as_string())
            finally:
                server.quit()
            logger.info("email_sent to=%s subject=%s attempt=%d", to_email, subject, attempt)
            return
        except Exception as exc:
            last_error = exc
            logger.warning("email_send_failed to=%s attempt=%d error=%s", to_email, attempt, exc)
            if attempt < _MAX_RETRIES:
                time.sleep(_RETRY_DELAY * attempt)

    logger.error("email_send_failed_permanent to=%s subject=%s", to_email, subject)
    raise last_error  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def send_welcome_email(to_email: str, name: str) -> None:
    if not settings.has_smtp:
        logger.debug("smtp_not_configured skipping welcome email to=%s", to_email)
        return
    _send_raw(
        to_email,
        subject="Welcome to Cryptalk",
        html_body=_welcome_html(name),
        text_body=f"Hi {name},\n\nWelcome to Cryptalk! Your account is ready.\n",
    )


def send_verification_email(to_email: str, name: str, token: str) -> None:
    if not settings.has_smtp:
        logger.debug("smtp_not_configured skipping verification email to=%s", to_email)
        return
    url = _build_verification_url(token)
    _send_raw(
        to_email,
        subject="Verify your Cryptalk email",
        html_body=_verification_html(name, url),
        text_body=(
            f"Hi {name},\n\n"
            f"Verify your email by visiting:\n{url}\n\n"
            f"This link will expire in 24 hours.\n"
        ),
    )


def send_password_reset_email(to_email: str, name: str, token: str) -> None:
    if not settings.has_smtp:
        logger.debug("smtp_not_configured skipping password reset email to=%s", to_email)
        return
    url = _build_reset_url(token)
    _send_raw(
        to_email,
        subject="Cryptalk — Reset Your Password",
        html_body=_reset_html(name, url),
        text_body=(
            f"Hi {name},\n\n"
            f"Reset your password by visiting:\n{url}\n\n"
            f"This link expires in 1 hour. If you didn't request this, ignore this email.\n"
        ),
    )
