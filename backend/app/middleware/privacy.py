"""
Privacy middleware — strips tracking headers, adds privacy headers,
blocks known scanner/bot patterns.  Logs blocked requests without IPs.
"""

import logging
import re
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger("cryptalk.privacy")

# Headers that leak client identity to upstreams / load-balancers
_STRIP_HEADERS = frozenset({
    "x-forwarded-for",
    "x-real-ip",
    "x-forwarded-host",
    "x-forwarded-proto",
    "forwarded",
    "x-client-ip",
    "cf-connecting-ip",
    "true-client-ip",
    "x-cluster-client-ip",
})

# Patterns that indicate vulnerability scanners / automated crawling
_SCANNER_PATTERNS = [
    re.compile(r"sqlmap", re.I),
    re.compile(r"nikto", re.I),
    re.compile(r"nmap", re.I),
    re.compile(r"masscan", re.I),
    re.compile(r"zgrab", re.I),
    re.compile(r"nessus", re.I),
    re.compile(r"openvas", re.I),
    re.compile(r"acunetix", re.I),
    re.compile(r"burpsuite", re.I),
    re.compile(r"dirbuster", re.I),
    re.compile(r"gobuster", re.I),
    re.compile(r"owasp", re.I),
    re.compile(r"w3af", re.I),
    re.compile(r"whatweb", re.I),
    re.compile(r"zoomeye", re.I),
    re.compile(r"censys", re.I),
    re.compile(r"wpscan", re.I),
    re.compile(r"joomla", re.I),
    re.compile(r"phpmyadmin", re.I),
    re.compile(r"\.env$", re.I),
    re.compile(r"\.git/", re.I),
    re.compile(r"/wp-admin", re.I),
    re.compile(r"/wp-login", re.I),
    re.compile(r"xmlrpc\.php", re.I),
    re.compile(r"actuator", re.I),
    re.compile(r"swagger", re.I),
]

# Suspicious path probes that no real user would hit
_BLOCKED_PATHS = frozenset({
    "/.env",
    "/.git/config",
    "/.git/HEAD",
    "/wp-login.php",
    "/wp-admin",
    "/xmlrpc.php",
    "/phpmyadmin",
    "/admin",
    "/.htaccess",
    "/.well-known/security.txt",
    "/server-status",
    "/server-info",
    "/cgi-bin",
    "/actuator",
    "/actuator/env",
    "/actuator/health",
    "/swagger-ui.html",
    "/debug",
    "/.DS_Store",
    "/robots.txt",  # only if we want total stealth
})

_PRIVACY_RESPONSE_HEADERS = {
    "X-Permitted-Cross-Domain-Policies": "none",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Expect-CT": "max-age=86400, enforce",
    "X-Download-Options": "noopen",
    "X-DNS-Prefetch-Control": "off",
}


class PrivacyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        ua = request.headers.get("user-agent", "")

        # --- path traversal attempts ---
        if ".." in path or "%2e%2e" in path.lower():
            logger.warning("[privacy] blocked traversal path=%s", path[:120])
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Resource not found"},
            )

        # --- scanner / probe detection ---
        if path.lower() in _BLOCKED_PATHS:
            logger.warning(
                "[privacy] blocked probe path=%s ua=%s",
                path,
                ua[:80],
            )
            return JSONResponse(
                status_code=404,
                content={"error": "not_found", "message": "Resource not found"},
            )

        for pattern in _SCANNER_PATTERNS:
            if pattern.search(ua) or pattern.search(path):
                logger.warning(
                    "[privacy] blocked scanner ua=%s path=%s",
                    ua[:80],
                    path,
                )
                return JSONResponse(
                    status_code=404,
                    content={"error": "not_found", "message": "Resource not found"},
                )

        # --- strip tracking / identity headers before they reach app logic ---
        for h in _STRIP_HEADERS:
            if h in request.headers:
                # Starlette headers are immutable; we remove via scope manipulation
                request.scope["headers"] = [
                    (k, v)
                    for k, v in request.scope["headers"]
                    if k.decode("latin-1").lower() not in _STRIP_HEADERS
                ]
                break  # rebuilt once

        # --- process request ---
        start = time.monotonic()
        response = await call_next(request)
        elapsed = time.monotonic() - start

        # --- add privacy response headers ---
        for k, v in _PRIVACY_RESPONSE_HEADERS.items():
            response.headers[k] = v

        # Remove server-identifying headers
        response.headers.pop("server", None)
        response.headers.pop("x-powered-by", None)

        # Slow-response logging (possible abuse / DoS)
        if elapsed > 5.0:
            logger.warning(
                "[privacy] slow response elapsed=%.1fs path=%s", elapsed, path
            )

        return response
