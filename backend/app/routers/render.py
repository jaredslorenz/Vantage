import asyncio
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.encryption import encrypt_token, decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase
from app.core import token_cache

RENDER_API = "https://api.render.com/v1"

router = APIRouter(prefix="/api/render", tags=["render"])


def _assert_owns_render_service(user_id: str, service_id: str) -> None:
    """Raise 403 if service_id is not linked to a project owned by this user."""
    projects = supabase.table("projects").select("id").eq("user_id", user_id).execute()
    project_ids = [p["id"] for p in (projects.data or [])]
    if not project_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    result = supabase.table("project_services") \
        .select("id") \
        .eq("resource_id", service_id) \
        .eq("service_type", "render") \
        .in_("project_id", project_ids) \
        .execute()
    if not result.data:
        raise HTTPException(status_code=403, detail="Access denied")


def _get_render_token(user_id: str) -> str:
    cached = token_cache.get(user_id, "render")
    if cached:
        return cached
    result = supabase.table("connected_services") \
        .select("api_token") \
        .eq("user_id", user_id) \
        .eq("service_type", "render") \
        .single() \
        .execute()
    if not result.data or not result.data.get("api_token"):
        raise HTTPException(status_code=404, detail="Render not connected")
    token = decrypt_token(result.data["api_token"])
    token_cache.set(user_id, "render", token)
    return token


class ConnectRequest(BaseModel):
    token: str


@router.post("/connect")
async def connect_render(body: ConnectRequest, user_id: str = Depends(get_user_id)):
    """Validate a Render API key and store it as a connected service."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{RENDER_API}/owners",
            headers={"Authorization": f"Bearer {body.token}", "Accept": "application/json"},
            params={"limit": 1},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid API key — could not authenticate with Render")

    owners = resp.json()
    owner = owners[0].get("owner", {}) if owners else {}
    owner_id = str(owner.get("id", ""))
    owner_name = owner.get("name") or owner.get("email", "Render")

    supabase.table("connected_services").upsert({
        "user_id": user_id,
        "service_type": "render",
        "service_id": owner_id,
        "service_name": owner_name,
        "api_token": encrypt_token(body.token),
        "is_active": True,
        "health_status": "healthy",
    }, on_conflict="user_id,service_type,service_id").execute()
    token_cache.invalidate(user_id, "render")

    return {"status": "connected", "name": owner_name}


@router.delete("/disconnect")
async def disconnect_render(user_id: str = Depends(get_user_id)):
    """Remove the Render connection."""
    supabase.table("connected_services") \
        .delete() \
        .eq("user_id", user_id) \
        .eq("service_type", "render") \
        .execute()

    return {"status": "disconnected"}


@router.get("/services")
async def get_services(user_id: str = Depends(get_user_id)):
    """List the user's Render services."""
    token = _get_render_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{RENDER_API}/services",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params={"limit": 50},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch services from Render")

    services = []
    for item in resp.json():
        svc = item.get("service", item)
        services.append({
            "id": svc["id"],
            "name": svc["name"],
            "type": svc.get("type", "web_service"),
            "suspended": svc.get("suspended", "not_suspended") == "suspended",
            "url": svc.get("serviceDetails", {}).get("url"),
            "branch": svc.get("branch", "main"),
            "updated_at": svc.get("updatedAt"),
        })

    return {"services": services}


@router.get("/deploys/{service_id}/{deploy_id}/logs")
async def get_deploy_logs(service_id: str, deploy_id: str, user_id: str = Depends(get_user_id)):
    """Fetch log lines for a Render deploy using the unified logs endpoint."""
    _assert_owns_render_service(user_id, service_id)
    token = _get_render_token(user_id)

    # First fetch the deploy and service to get time window + ownerId
    async with httpx.AsyncClient(timeout=30.0) as client:
        deploy_resp = await client.get(
            f"{RENDER_API}/services/{service_id}/deploys/{deploy_id}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        if deploy_resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch deploy details from Render")

        deploy = deploy_resp.json().get("deploy", deploy_resp.json())
        start = deploy.get("createdAt")
        end = deploy.get("finishedAt")

        svc_resp = await client.get(
            f"{RENDER_API}/services/{service_id}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        owner_id = svc_resp.json().get("service", svc_resp.json()).get("ownerId") if svc_resp.status_code == 200 else None

        params: dict = {"resource": service_id, "limit": 200}
        if owner_id:
            params["ownerId"] = owner_id
        if start:
            params["startTime"] = start
        if end:
            params["endTime"] = end

        logs_resp = await client.get(
            "https://api.render.com/v1/logs",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params=params,
        )

    if logs_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch logs from Render")

    raw = logs_resp.json()
    entries = raw.get("logs", raw) if isinstance(raw, dict) else raw

    lines = []
    for entry in (entries if isinstance(entries, list) else []):
        text = (entry.get("message") or entry.get("text") or "").strip()
        if not text:
            continue
        line_type = "stderr" if any(kw in text.lower() for kw in ("error", "err ", "failed", "exception", "fatal", "panic", "traceback")) else "stdout"
        lines.append({"type": line_type, "text": text})

    # Fallback: if logs are gone (expired), check events table for stored error lines
    if not lines:
        try:
            result = supabase.table("events") \
                .select("metadata") \
                .eq("user_id", user_id) \
                .eq("external_id", deploy_id) \
                .eq("event_type", "deploy") \
                .limit(1) \
                .execute()
            if result.data:
                stored = (result.data[0].get("metadata") or {}).get("error_lines", [])
                lines = [{"type": "stderr", "text": t} for t in stored]
        except Exception:
            pass

    return {"lines": lines}


@router.get("/logs/{service_id}/live")
async def get_live_logs(service_id: str, user_id: str = Depends(get_user_id), window: int = 30):
    """Fetch the last `window` seconds of logs for a service (for live streaming)."""
    _assert_owns_render_service(user_id, service_id)
    token = _get_render_token(user_id)

    now = datetime.now(timezone.utc)
    start = (now - timedelta(seconds=window)).strftime("%Y-%m-%dT%H:%M:%SZ")

    async with httpx.AsyncClient(timeout=20.0) as client:
        svc_resp = await client.get(
            f"{RENDER_API}/services/{service_id}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
        )
        owner_id = svc_resp.json().get("service", svc_resp.json()).get("ownerId") if svc_resp.status_code == 200 else None

        params: dict = {"resource": service_id, "limit": 200, "startTime": start}
        if owner_id:
            params["ownerId"] = owner_id

        logs_resp = await client.get(
            "https://api.render.com/v1/logs",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params=params,
        )

    if logs_resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Render logs API returned {logs_resp.status_code}")

    raw = logs_resp.json()
    entries = raw.get("logs", raw) if isinstance(raw, dict) else raw
    lines = []
    for entry in (entries if isinstance(entries, list) else []):
        text = (entry.get("message") or entry.get("text") or "").strip()
        if not text:
            continue
        line_type = "stderr" if any(kw in text.lower() for kw in ("error", "err ", "failed", "exception", "fatal", "panic", "traceback")) else "stdout"
        lines.append({"type": line_type, "text": text})

    return {"lines": lines}


@router.get("/metrics/{service_id}")
async def get_service_metrics(service_id: str, user_id: str = Depends(get_user_id)):
    """Fetch CPU, memory, and HTTP request metrics for a Render service (last 60 min)."""
    _assert_owns_render_service(user_id, service_id)
    token = _get_render_token(user_id)

    now = datetime.now(timezone.utc)
    params = {
        "resource": service_id,
        "startTime": (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "resolutionSeconds": 60,
    }
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        cpu_resp, mem_resp, req_resp = await asyncio.gather(
            client.get(f"{RENDER_API}/metrics/cpu", headers=headers, params=params),
            client.get(f"{RENDER_API}/metrics/memory", headers=headers, params=params),
            client.get(f"{RENDER_API}/metrics/http-requests", headers=headers, params={**params, "aggregateBy": "statusCode"}),
            return_exceptions=True,
        )

    def _parse_series(resp) -> list[dict]:
        if isinstance(resp, Exception) or resp.status_code != 200:
            return []
        data = resp.json()
        if not isinstance(data, list) or not data:
            return []
        return [{"t": v["timestamp"], "v": v["value"]} for v in data[0].get("values", [])]

    def _parse_http(resp) -> dict[str, list[dict]]:
        if isinstance(resp, Exception) or resp.status_code != 200:
            return {}
        data = resp.json()
        result: dict[str, list[dict]] = {}
        for series in (data if isinstance(data, list) else []):
            labels = {l["field"]: l["value"] for l in series.get("labels", [])}
            code = labels.get("statusCode", "other")
            result[code] = [{"t": v["timestamp"], "v": v["value"]} for v in series.get("values", [])]
        return result

    return {
        "cpu": _parse_series(cpu_resp),
        "memory": _parse_series(mem_resp),
        "http_by_status": _parse_http(req_resp),
    }


@router.get("/metrics/{service_id}/limits")
async def get_service_limits(service_id: str, user_id: str = Depends(get_user_id)):
    """Fetch the CPU and memory plan limits for a Render service.

    Limit endpoints return the same time-series format as usage endpoints but with
    constant values representing the plan's allocation (e.g. 0.1 cores, 536870912 bytes).
    """
    _assert_owns_render_service(user_id, service_id)
    token = _get_render_token(user_id)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    now = datetime.now(timezone.utc)
    params = {
        "resource": service_id,
        "startTime": (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "endTime": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "resolutionSeconds": 60,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        cpu_lim_resp, mem_lim_resp = await asyncio.gather(
            client.get(f"{RENDER_API}/metrics/cpu-limit", headers=headers, params=params),
            client.get(f"{RENDER_API}/metrics/memory-limit", headers=headers, params=params),
            return_exceptions=True,
        )

    def _extract_limit(resp) -> float | None:
        if isinstance(resp, Exception) or resp.status_code != 200:
            return None
        data = resp.json()
        if not isinstance(data, list) or not data:
            return None
        vals = [v["value"] for v in data[0].get("values", []) if v.get("value") is not None]
        return vals[0] if vals else None

    return {
        "cpu": _extract_limit(cpu_lim_resp),
        "memory": _extract_limit(mem_lim_resp),
    }


class TriggerDeployRequest(BaseModel):
    serviceId: str
    clearCache: bool = False
    commitId: str | None = None


@router.post("/deploy")
async def trigger_deploy(body: TriggerDeployRequest, user_id: str = Depends(get_user_id)):
    """Trigger a new deploy for a Render service. Pass commitId to roll back to a specific commit."""
    _assert_owns_render_service(user_id, body.serviceId)
    token = _get_render_token(user_id)

    payload: dict = {"clearCache": "clear"} if body.clearCache else {}
    if body.commitId:
        payload["commitId"] = body.commitId

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{RENDER_API}/services/{body.serviceId}/deploys",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            json=payload,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Failed to trigger deploy on Render")

    d = resp.json().get("deploy", resp.json())
    return {
        "id": d.get("id"),
        "status": d.get("status", "build_in_progress"),
        "created_at": d.get("createdAt"),
    }


@router.get("/deploys")
async def get_deploys(
    user_id: str = Depends(get_user_id),
    serviceId: str = Query(..., description="Render service ID"),
    limit: int = 20,
):
    """Fetch recent deploys for a Render service."""
    _assert_owns_render_service(user_id, serviceId)
    token = _get_render_token(user_id)

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=60.0, write=10.0, pool=10.0)) as client:
        resp = await client.get(
            f"{RENDER_API}/services/{serviceId}/deploys",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            params={"limit": limit},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch deploys from Render")

    deploys = []
    for item in resp.json():
        d = item.get("deploy", item)
        commit = d.get("commit") or {}
        deploys.append({
            "id": d["id"],
            "status": d.get("status", ""),
            "commit_message": commit.get("message", "").split("\n")[0] if commit.get("message") else None,
            "commit_id": commit.get("id", "")[:7] if commit.get("id") else None,
            "created_at": d.get("createdAt"),
            "finished_at": d.get("finishedAt"),
        })

    return {"deploys": deploys}
