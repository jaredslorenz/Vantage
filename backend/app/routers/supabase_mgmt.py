import asyncio
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.encryption import encrypt_token, decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase

SUPABASE_API = "https://api.supabase.com/v1"

router = APIRouter(prefix="/api/supabase", tags=["supabase"])


def _get_token(user_id: str) -> str:
    result = (
        supabase.table("connected_services")
        .select("api_token")
        .eq("user_id", user_id)
        .eq("service_type", "supabase")
        .single()
        .execute()
    )
    if not result.data or not result.data.get("api_token"):
        raise HTTPException(status_code=404, detail="Supabase not connected")
    return decrypt_token(result.data["api_token"])


class ConnectRequest(BaseModel):
    token: str


@router.post("/connect")
async def connect_supabase(body: ConnectRequest, user_id: str = Depends(get_user_id)):
    async with httpx.AsyncClient(timeout=15.0) as client:
        orgs_resp = await client.get(
            f"{SUPABASE_API}/organizations",
            headers={"Authorization": f"Bearer {body.token}"},
        )

    if orgs_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid token — could not authenticate with Supabase")

    orgs = orgs_resp.json()
    org = orgs[0] if orgs else {}
    org_id = org.get("id", "default")
    org_name = org.get("name", "Supabase")

    supabase.table("connected_services").upsert(
        {
            "user_id": user_id,
            "service_type": "supabase",
            "service_id": org_id,
            "service_name": org_name,
            "api_token": encrypt_token(body.token),
            "is_active": True,
            "health_status": "healthy",
        },
        on_conflict="user_id,service_type,service_id",
    ).execute()

    return {"status": "connected", "name": org_name}


@router.delete("/disconnect")
async def disconnect_supabase(user_id: str = Depends(get_user_id)):
    supabase.table("connected_services") \
        .delete() \
        .eq("user_id", user_id) \
        .eq("service_type", "supabase") \
        .execute()
    return {"status": "disconnected"}


@router.get("/projects")
async def get_projects(user_id: str = Depends(get_user_id)):
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch projects from Supabase")

    projects = []
    for p in resp.json():
        projects.append({
            "id": p["id"],
            "ref": p["ref"],
            "name": p["name"],
            "region": p.get("region", ""),
            "status": p.get("status", ""),
            "created_at": p.get("created_at"),
        })

    return {"projects": projects}


@router.get("/projects/{ref}/health")
async def get_project_health(ref: str, user_id: str = Depends(get_user_id)):
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{ref}/health",
            headers={"Authorization": f"Bearer {token}"},
            params=[
                ("services", "auth"),
                ("services", "db"),
                ("services", "realtime"),
                ("services", "rest"),
                ("services", "storage"),
                ("services", "pooler"),
            ],
        )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Supabase health API returned {resp.status_code}: {resp.text[:200]}",
        )

    return {"services": resp.json()}


@router.get("/projects/{ref}/overview")
async def get_project_overview(ref: str, user_id: str = Depends(get_user_id)):
    """Fetch API stats, recent errors, and action history in one call."""
    token = _get_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(hours=24)).isoformat()

    async with httpx.AsyncClient(timeout=30.0) as client:
        stats_task = client.get(
            f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/usage.api-counts",
            headers=headers,
            params={"interval": "1day"},
        )
        logs_task = client.get(
            f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/logs.all",
            headers=headers,
            params={
                "sql": (
                    "select timestamp, event_message, metadata "
                    "from edge_logs "
                    "order by timestamp desc "
                    "limit 30"
                ),
                "iso_timestamp_start": day_ago,
            },
        )
        actions_task = client.get(
            f"{SUPABASE_API}/projects/{ref}/actions",
            headers=headers,
            params={"limit": 20},
        )

        stats_resp, logs_resp, actions_resp = await asyncio.gather(
            stats_task, logs_task, actions_task
        )

    # API request counts — daily buckets for last 7 days
    api_stats = []
    if stats_resp.status_code == 200:
        raw = stats_resp.json()
        data = raw.get("data", raw) if isinstance(raw, dict) else raw
        for point in (data if isinstance(data, list) else []):
            api_stats.append({
                "timestamp": point.get("timestamp", ""),
                "count": int(point.get("count", 0)),
            })

    # Recent logs — keep only error-level entries (status >= 400)
    error_logs = []
    if logs_resp.status_code == 200:
        raw = logs_resp.json()
        rows = raw.get("result", raw.get("data", []))
        for row in (rows if isinstance(rows, list) else []):
            msg = str(row.get("event_message", ""))
            meta = row.get("metadata", {})
            # Extract status code from various metadata shapes
            status = None
            if isinstance(meta, list) and meta:
                meta = meta[0]
            if isinstance(meta, dict):
                status = (
                    meta.get("status_code")
                    or meta.get("status")
                    or (meta.get("response") or {}).get("status_code")
                )
            try:
                status = int(status) if status is not None else None
            except (ValueError, TypeError):
                status = None

            if status is None or status >= 400:
                error_logs.append({
                    "timestamp": row.get("timestamp", ""),
                    "message": msg[:200],
                    "status": status,
                })
        error_logs = error_logs[:25]

    # Action / migration history
    actions = []
    if actions_resp.status_code == 200:
        raw = actions_resp.json()
        runs = raw.get("runs", [])
        for run in runs:
            actions.append({
                "id": run.get("id", ""),
                "status": run.get("status", ""),
                "created_at": run.get("created_at", ""),
                "updated_at": run.get("updated_at", ""),
                "error_message": run.get("error_message"),
            })

    return {
        "api_stats": api_stats,
        "error_logs": error_logs,
        "actions": actions,
        # surface which endpoints failed so the frontend can show partial data gracefully
        "available": {
            "api_stats": stats_resp.status_code == 200,
            "logs": logs_resp.status_code == 200,
            "actions": actions_resp.status_code == 200,
        },
    }
