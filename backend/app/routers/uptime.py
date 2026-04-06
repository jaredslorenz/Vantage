import ipaddress
import time
import httpx
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from app.core.security import get_user_id
from app.core.supabase import supabase
from app.core.logger import logger
from app.core.limiter import limiter

router = APIRouter(prefix="/api/uptime", tags=["uptime"])

# Cloud metadata endpoints commonly targeted in SSRF attacks
_BLOCKED_HOSTS = {
    "169.254.169.254",       # AWS/GCP/Azure instance metadata
    "metadata.google.internal",
    "metadata.goog",
}


def _validate_url(url: str) -> str:
    """Reject private IPs, loopback, and known metadata endpoints."""
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL")

    host = parsed.hostname or ""
    if not host:
        raise HTTPException(status_code=400, detail="Invalid URL")

    if host.lower() in _BLOCKED_HOSTS:
        raise HTTPException(status_code=400, detail="URL not allowed")

    try:
        addr = ipaddress.ip_address(host)
        if any([addr.is_private, addr.is_loopback, addr.is_link_local, addr.is_reserved, addr.is_multicast]):
            raise HTTPException(status_code=400, detail="URL not allowed")
    except ValueError:
        pass  # hostname, not an IP — fine

    return url


class CheckRequest(BaseModel):
    url: str
    service_type: str
    service_id: str


@router.post("/check")
@limiter.limit("30/minute")
async def check_uptime(request: Request, body: CheckRequest, user_id: str = Depends(get_user_id)):
    """Ping a URL, store the result, and return the outcome."""
    url = _validate_url(body.url)

    start = time.monotonic()
    is_up = False
    status_code = None

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.head(url)
            if resp.status_code == 405:
                resp = await client.get(url)
        status_code = resp.status_code
        is_up = resp.status_code < 500
    except Exception as exc:
        logger.warning("Uptime check failed url=%s error=%s", url, exc)

    latency_ms = round((time.monotonic() - start) * 1000)

    try:
        supabase.table("uptime_checks").insert({
            "user_id": user_id,
            "service_type": body.service_type,
            "service_id": body.service_id,
            "url": url,
            "is_up": is_up,
            "status_code": status_code,
            "latency_ms": latency_ms,
        }).execute()
    except Exception as exc:
        logger.error("Failed to store uptime check url=%s error=%s", url, exc)

    return {"is_up": is_up, "status_code": status_code, "latency_ms": latency_ms, "url": url}


@router.get("/history")
async def get_uptime_history(
    service_type: str = Query(...),
    service_id: str = Query(...),
    limit: int = Query(60, ge=1, le=200),
    user_id: str = Depends(get_user_id),
):
    try:
        result = supabase.table("uptime_checks") \
            .select("is_up,status_code,latency_ms,checked_at") \
            .eq("user_id", user_id) \
            .eq("service_type", service_type) \
            .eq("service_id", service_id) \
            .order("checked_at", desc=True) \
            .limit(limit) \
            .execute()
        checks = list(reversed(result.data or []))
    except Exception as exc:
        logger.error("Failed to fetch uptime history error=%s", exc)
        checks = []

    total = len(checks)
    up_count = sum(1 for c in checks if c["is_up"])
    uptime_pct = round(up_count / total * 100, 1) if total else None
    latencies = [c["latency_ms"] for c in checks if c.get("latency_ms") is not None]
    avg_latency = round(sum(latencies) / len(latencies)) if latencies else None

    return {
        "checks": checks,
        "uptime_pct": uptime_pct,
        "avg_latency_ms": avg_latency,
        "total": total,
    }
