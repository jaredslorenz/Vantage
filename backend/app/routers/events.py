from fastapi import APIRouter, Depends, Query

from app.core.security import get_user_id
from app.core.supabase import supabase

router = APIRouter(prefix="/api/events", tags=["events"])


def _db_event_to_response(row: dict) -> dict:
    event_type = row.get("event_type", "")
    type_map = {
        "deployment.created": "deployment",
        "deployment.succeeded": "deployment",
        "deployment.ready": "deployment",
        "deployment.error": "deployment",
        "deployment.canceled": "deployment",
        "deployment": "deployment",
        "deploy": "deploy",
        "commit": "commit",
        "pull_request": "pull_request",
        "ci_run": "ci_run",
    }
    return {
        "id": row.get("external_id") or str(row.get("id", "")),
        "type": type_map.get(event_type, event_type),
        "service": row.get("service_type", ""),
        "project_id": row.get("project_id"),
        "title": row.get("title", ""),
        "subtitle": row.get("subtitle", ""),
        "status": row.get("status", "building"),
        "timestamp": row.get("occurred_at", ""),
        "url": row.get("external_url") or "",
        "metadata": row.get("metadata"),
    }


@router.get("")
async def get_events(
    user_id: str = Depends(get_user_id),
    limit: int = Query(default=60, le=100),
    project_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
):
    services_result = (
        supabase.table("connected_services")
        .select("service_type")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    connected = {s["service_type"] for s in (services_result.data or [])}

    query = (
        supabase.table("events")
        .select("*")
        .eq("user_id", user_id)
        .order("occurred_at", desc=True)
        .limit(limit)
    )
    if project_id:
        query = query.eq("project_id", project_id)
    if event_type:
        query = query.eq("event_type", event_type)

    db_result = query.execute()
    events = [_db_event_to_response(row) for row in (db_result.data or [])]

    projects_result = (
        supabase.table("projects")
        .select("id, name")
        .eq("user_id", user_id)
        .order("name")
        .execute()
    )
    projects = [{"id": p["id"], "name": p["name"]} for p in (projects_result.data or [])]

    return {"events": events, "connected": sorted(connected), "projects": projects}
