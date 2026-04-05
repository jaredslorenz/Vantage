import time
import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from app.core.security import get_user_id
from app.core.supabase import supabase

router = APIRouter(prefix="/api/uptime", tags=["uptime"])


class CheckRequest(BaseModel):
    url: str
    service_type: str
    service_id: str


@router.post("/check")
async def check_uptime(body: CheckRequest, user_id: str = Depends(get_user_id)):
    """Ping a URL, store the result, and return the outcome."""
    url = body.url if body.url.startswith("http") else f"https://{body.url}"

    start = time.monotonic()
    is_up = False
    status_code = None

    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.head(url)
            if resp.status_code == 405:
                resp = await client.get(url)
        status_code = resp.status_code
        is_up = resp.status_code < 500  # 4xx = server up but auth/not-found; 5xx = actually down
    except Exception:
        pass

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
    except Exception:
        pass  # Don't fail the check if storage fails

    return {"is_up": is_up, "status_code": status_code, "latency_ms": latency_ms, "url": url}


@router.get("/history")
async def get_uptime_history(
    service_type: str = Query(...),
    service_id: str = Query(...),
    limit: int = 60,
    user_id: str = Depends(get_user_id),
):
    """Return the last N uptime checks for a service with aggregate stats."""
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
    except Exception:
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
