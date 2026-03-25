import hashlib
import secrets
import httpx
from base64 import urlsafe_b64encode
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from app.core.config import settings
from app.core.encryption import encrypt_token, decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase

VERCEL_API = "https://api.vercel.com"


def _get_vercel_token(user_id: str) -> str:
    """Returns the API token if set, otherwise raises."""
    result = supabase.table("connected_services") \
        .select("api_token") \
        .eq("user_id", user_id) \
        .eq("service_type", "vercel") \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Vercel not connected")

    if not result.data.get("api_token"):
        raise HTTPException(status_code=403, detail="Vercel API token not configured")

    return decrypt_token(result.data["api_token"])

router = APIRouter(prefix="/api/vercel", tags=["vercel"])

VERCEL_AUTH_URL = "https://vercel.com/oauth/authorize"
VERCEL_TOKEN_URL = "https://api.vercel.com/login/oauth/token"


def _generate_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return urlsafe_b64encode(digest).rstrip(b"=").decode()


@router.get("/connect")
async def connect_vercel(user_id: str = Depends(get_user_id)):
    """
    Step 1: Redirect user to Vercel OAuth consent screen.
    Called from Next.js when user clicks 'Connect Vercel'.
    """
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(43)
    code_challenge = _generate_code_challenge(code_verifier)

    supabase.table("oauth_states").insert({
        "user_id": user_id,
        "state": state,
        "provider": "vercel",
        "code_verifier": code_verifier,
        "nonce": nonce,
    }).execute()

    params = urlencode({
        "client_id": settings.vercel_client_id,
        "response_type": "code",
        "redirect_uri": "http://localhost:8000/api/vercel/callback",
        "state": state,
        "nonce": nonce,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    })

    return {"url": f"{VERCEL_AUTH_URL}?{params}"}


@router.get("/callback")
async def vercel_callback(
    state: str = Query(...),
    code: str = Query(None),
    error: str = Query(None),
    error_description: str = Query(None),
):
    """
    Step 2: Vercel redirects here after user authorizes.
    Exchange code for access token and store it.
    """
    result = supabase.table("oauth_states") \
        .select("*") \
        .eq("state", state) \
        .eq("provider", "vercel") \
        .single() \
        .execute()

    if error or not code:
        return RedirectResponse(url=f"{settings.frontend_url}/dashboard/services?error=oauth_failed")

    if not result.data:
        return RedirectResponse(url=f"{settings.frontend_url}/dashboard/services?error=invalid_state")

    user_id = result.data["user_id"]
    code_verifier = result.data["code_verifier"]

    supabase.table("oauth_states").delete().eq("state", state).execute()

    async with httpx.AsyncClient() as client:
        response = await client.post(
            VERCEL_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "client_id": settings.vercel_client_id,
                "client_secret": settings.vercel_client_secret,
                "code": code,
                "code_verifier": code_verifier,
                "redirect_uri": "http://localhost:8000/api/vercel/callback",
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    if response.status_code != 200:
        return RedirectResponse(url=f"{settings.frontend_url}/dashboard/services?error=token_exchange_failed")

    token_data = response.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in")

    # Fetch Vercel user info to get their user ID
    async with httpx.AsyncClient() as client:
        user_resp = await client.post(
            "https://api.vercel.com/login/oauth/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )

    vercel_user = user_resp.json() if user_resp.status_code == 200 else {}
    vercel_user_id = vercel_user.get("sub", "")
    vercel_username = vercel_user.get("preferred_username", "")

    supabase.table("connected_services").upsert({
        "user_id": user_id,
        "service_type": "vercel",
        "service_id": vercel_user_id,
        "service_name": vercel_username or "Vercel",
        "oauth_access_token": encrypt_token(access_token),
        "oauth_refresh_token": encrypt_token(refresh_token) if refresh_token else None,
        "config": {"expires_in": expires_in},
        "is_active": True,
        "health_status": "healthy",
    }, on_conflict="user_id,service_type,service_id").execute()

    return RedirectResponse(url=f"{settings.frontend_url}/dashboard/services")


@router.delete("/disconnect")
async def disconnect_vercel(user_id: str = Depends(get_user_id)):
    """Remove the user's Vercel connection."""
    supabase.table("connected_services") \
        .delete() \
        .eq("user_id", user_id) \
        .eq("service_type", "vercel") \
        .execute()

    return {"status": "disconnected"}


class ApiTokenRequest(BaseModel):
    token: str


@router.post("/api-token")
async def save_api_token(body: ApiTokenRequest, user_id: str = Depends(get_user_id)):
    """Validate and store a Vercel Personal Access Token."""
    # Verify the token works before storing it
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{VERCEL_API}/v2/user",
            headers={"Authorization": f"Bearer {body.token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid token — could not authenticate with Vercel")

    supabase.table("connected_services") \
        .update({"api_token": encrypt_token(body.token)}) \
        .eq("user_id", user_id) \
        .eq("service_type", "vercel") \
        .execute()

    return {"status": "saved"}


@router.delete("/api-token")
async def remove_api_token(user_id: str = Depends(get_user_id)):
    """Remove the stored Vercel Personal Access Token."""
    supabase.table("connected_services") \
        .update({"api_token": None}) \
        .eq("user_id", user_id) \
        .eq("service_type", "vercel") \
        .execute()

    return {"status": "removed"}


@router.get("/projects")
async def get_vercel_projects(user_id: str = Depends(get_user_id)):
    """Fetch the user's Vercel projects across personal and team scopes."""
    token = _get_vercel_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient() as client:
        teams_resp = await client.get(f"{VERCEL_API}/v2/teams", headers=headers)
        team_ids: list[str | None] = [None]
        if teams_resp.status_code == 200:
            team_ids += [t["id"] for t in teams_resp.json().get("teams", [])]

        all_projects: list[dict] = []
        for team_id in team_ids:
            params: dict = {}
            if team_id:
                params["teamId"] = team_id

            resp = await client.get(
                f"{VERCEL_API}/v9/projects",
                headers=headers,
                params=params,
            )
            if resp.status_code == 200:
                all_projects += resp.json().get("projects", [])

    seen: set[str] = set()
    projects = []
    for p in all_projects:
        if p["id"] not in seen:
            seen.add(p["id"])
            projects.append({
                "id": p["id"],
                "name": p["name"],
                "framework": p.get("framework"),
                "updated_at": p.get("updatedAt"),
                "latest_deployment": {
                    "url": p.get("latestDeployments", [{}])[0].get("url"),
                    "state": p.get("latestDeployments", [{}])[0].get("readyState"),
                    "created_at": p.get("latestDeployments", [{}])[0].get("createdAt"),
                } if p.get("latestDeployments") else None,
            })

    return {"projects": projects}


@router.get("/deployments")
async def get_vercel_deployments(
    user_id: str = Depends(get_user_id),
    limit: int = 20,
    projectId: str = Query(None),
):
    """Fetch the user's recent Vercel deployments across personal and team scopes."""
    token = _get_vercel_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient() as client:
        # Get teams so we can query each scope
        teams_resp = await client.get(f"{VERCEL_API}/v2/teams", headers=headers)
        team_ids: list[str | None] = [None]  # None = personal scope
        if teams_resp.status_code == 200:
            team_ids += [t["id"] for t in teams_resp.json().get("teams", [])]

        all_deployments: list[dict] = []
        for team_id in team_ids:
            params: dict = {"limit": limit}
            if team_id:
                params["teamId"] = team_id
            if projectId:
                params["projectId"] = projectId

            resp = await client.get(
                f"{VERCEL_API}/v6/deployments",
                headers=headers,
                params=params,
            )
            if resp.status_code == 200:
                all_deployments += resp.json().get("deployments", [])

    # Sort by creation time descending and deduplicate
    seen: set[str] = set()
    deployments = []
    for d in sorted(all_deployments, key=lambda x: x.get("createdAt", 0), reverse=True):
        if d["uid"] not in seen:
            seen.add(d["uid"])
            deployments.append({
                "id": d["uid"],
                "name": d.get("name"),
                "url": d.get("url"),
                "state": d.get("readyState"),
                "target": d.get("target"),
                "branch": d.get("meta", {}).get("githubCommitRef"),
                "commit_message": d.get("meta", {}).get("githubCommitMessage"),
                "created_at": d.get("createdAt"),
            })

    return {"deployments": deployments[:limit]}
