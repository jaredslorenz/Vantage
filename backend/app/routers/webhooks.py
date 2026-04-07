import hashlib
import hmac
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from app.core.config import settings
from app.core.logger import logger
from app.core.supabase import supabase

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _verify_vercel_signature(body: bytes, signature: str) -> bool:
    """Verify Vercel webhook HMAC-SHA1 signature."""
    secret = settings.vercel_webhook_secret
    if not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha1).hexdigest()
    return hmac.compare_digest(expected, signature)


def _map_state(event_type: str) -> str:
    return {
        "deployment.created": "BUILDING",
        "deployment.succeeded": "READY",
        "deployment.ready": "READY",
        "deployment.error": "ERROR",
        "deployment.canceled": "CANCELED",
    }.get(event_type, "UNKNOWN")


@router.post("/vercel")
async def vercel_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("x-vercel-signature", "")

    if not _verify_vercel_signature(body, signature):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    event_type = payload.get("type", "")
    if not event_type.startswith("deployment."):
        return {"status": "ignored"}

    deployment = payload.get("payload", {}).get("deployment", payload.get("payload", {}))
    project_id_vercel = deployment.get("projectId") or payload.get("payload", {}).get("projectId", "")
    deployment_id = deployment.get("id") or deployment.get("uid", "")
    deployment_url = deployment.get("url", "")
    deployment_name = deployment.get("name", "")
    branch = deployment.get("meta", {}).get("githubCommitRef", "")
    commit_message = deployment.get("meta", {}).get("githubCommitMessage", "")
    team_id = payload.get("teamId") or payload.get("payload", {}).get("teamId")
    created_at_ms = deployment.get("createdAt") or payload.get("createdAt")
    occurred_at = (
        datetime.fromtimestamp(created_at_ms / 1000, tz=timezone.utc).isoformat()
        if created_at_ms else datetime.now(timezone.utc).isoformat()
    )

    # Find which user + project owns this Vercel project
    # Join with projects to get user_id (project_services has no user_id column)
    svc_result = supabase.table("project_services") \
        .select("project_id, projects(user_id)") \
        .eq("service_type", "vercel") \
        .eq("resource_id", project_id_vercel) \
        .execute()

    if not svc_result.data:
        # Try matching by resource_name (project name) as fallback
        svc_result = supabase.table("project_services") \
            .select("project_id, projects(user_id)") \
            .eq("service_type", "vercel") \
            .eq("resource_name", deployment_name) \
            .execute()

    if not svc_result.data:
        logger.info("Vercel webhook: no matching project for vercel project %s", project_id_vercel)
        return {"status": "no_match"}

    state = _map_state(event_type)
    status_label = {
        "BUILDING": "building",
        "READY": "success",
        "ERROR": "error",
        "CANCELED": "canceled",
    }.get(state, "unknown")

    title_map = {
        "deployment.created": "Deployment started",
        "deployment.succeeded": "Deployment succeeded",
        "deployment.ready": "Deployment ready",
        "deployment.error": "Deployment failed",
        "deployment.canceled": "Deployment canceled",
    }
    title = title_map.get(event_type, event_type)
    subtitle = commit_message or (f"Branch: {branch}" if branch else deployment_name)

    # Resolve team slug for external URL
    team_slug = None
    if team_id:
        cs_result = supabase.table("connected_services") \
            .select("service_name") \
            .eq("service_id", team_id) \
            .eq("service_type", "vercel") \
            .execute()
        if cs_result.data:
            team_slug = cs_result.data[0].get("service_name")

    external_url = None
    if team_slug and deployment_name:
        external_url = f"https://vercel.com/{team_slug}/{deployment_name}/deployments/{deployment_id}"
    elif deployment_url:
        external_url = f"https://{deployment_url}"

    rows = []
    for svc in svc_result.data:
        rows.append({
            "user_id": (svc.get("projects") or {}).get("user_id"),
            "project_id": svc["project_id"],
            "service_type": "vercel",
            "event_type": event_type,
            "title": title,
            "subtitle": subtitle,
            "status": status_label,
            "external_url": external_url,
            "external_id": deployment_id,
            "metadata": {
                "branch": branch,
                "commit_message": commit_message,
                "deployment_url": deployment_url,
                "state": state,
            },
            "occurred_at": occurred_at,
        })

    if rows:
        supabase.table("events").upsert(
            rows,
            on_conflict="external_id,event_type",
        ).execute()

    return {"status": "ok"}
