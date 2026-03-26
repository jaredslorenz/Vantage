import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.encryption import encrypt_token, decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase

RENDER_API = "https://api.render.com/v1"

router = APIRouter(prefix="/api/render", tags=["render"])


def _get_render_token(user_id: str) -> str:
    result = supabase.table("connected_services") \
        .select("api_token") \
        .eq("user_id", user_id) \
        .eq("service_type", "render") \
        .single() \
        .execute()

    if not result.data or not result.data.get("api_token"):
        raise HTTPException(status_code=404, detail="Render not connected")

    return decrypt_token(result.data["api_token"])


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


class TriggerDeployRequest(BaseModel):
    serviceId: str
    clearCache: bool = False


@router.post("/deploy")
async def trigger_deploy(body: TriggerDeployRequest, user_id: str = Depends(get_user_id)):
    """Trigger a new deploy for a Render service."""
    token = _get_render_token(user_id)

    payload = {"clearCache": "clear"} if body.clearCache else {}

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
    token = _get_render_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
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
