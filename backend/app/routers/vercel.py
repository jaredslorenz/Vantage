import asyncio
import re
import json
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.logger import logger
from app.core.encryption import encrypt_token, decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[mGKHF]")

def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text).strip()


async def fetch_deployment_logs(deployment_id: str, token: str, client: httpx.AsyncClient) -> list[str]:
    """Fetch build log lines for a Vercel deployment via the events API."""
    resp = await client.get(
        f"{VERCEL_API}/v2/deployments/{deployment_id}/events",
        headers={"Authorization": f"Bearer {token}"},
        params={"direction": "forward", "limit": 100},
    )
    if resp.status_code == 200 and not resp.json():
        resp = await client.get(
            f"{VERCEL_API}/v2/deployments/{deployment_id}/events",
            headers={"Authorization": f"Bearer {token}"},
            params={"direction": "backward", "limit": 100},
        )
    if resp.status_code != 200:
        return []

    events = resp.json() if isinstance(resp.json(), list) else []
    lines = []
    for event in reversed(events):
        text = _strip_ansi(event.get("text", ""))
        if not text:
            continue
        event_type = event.get("type", "")
        if event_type in ("stderr", "command") or (event_type == "stdout" and text):
            lines.append(f"[{event_type}] {text}")

    return lines[-60:]

VERCEL_API = "https://api.vercel.com"


def _get_vercel_token(user_id: str) -> str:
    """Returns the API token if set, otherwise raises."""
    result = supabase.table("connected_services") \
        .select("api_token") \
        .eq("user_id", user_id) \
        .eq("service_type", "vercel") \
        .single() \
        .execute()

    if not result.data or not result.data.get("api_token"):
        raise HTTPException(status_code=404, detail="Vercel not connected")

    return decrypt_token(result.data["api_token"])

router = APIRouter(prefix="/api/vercel", tags=["vercel"])


class ConnectRequest(BaseModel):
    token: str


@router.post("/connect")
async def connect_vercel(body: ConnectRequest, user_id: str = Depends(get_user_id)):
    """Validate a Vercel Personal Access Token and store it."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{VERCEL_API}/v2/user",
            headers={"Authorization": f"Bearer {body.token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid token — could not authenticate with Vercel")

    user_data = resp.json().get("user", resp.json())
    vercel_user_id = user_data.get("id", "")
    vercel_username = user_data.get("defaultTeamSlug") or user_data.get("username") or user_data.get("name") or "Vercel"

    supabase.table("connected_services").upsert({
        "user_id": user_id,
        "service_type": "vercel",
        "service_id": vercel_user_id,
        "service_name": vercel_username,
        "api_token": encrypt_token(body.token),
        "is_active": True,
        "health_status": "healthy",
    }, on_conflict="user_id,service_type,service_id").execute()

    return {"status": "connected", "name": vercel_username}


@router.delete("/disconnect")
async def disconnect_vercel(user_id: str = Depends(get_user_id)):
    """Remove the user's Vercel connection."""
    supabase.table("connected_services") \
        .delete() \
        .eq("user_id", user_id) \
        .eq("service_type", "vercel") \
        .execute()

    return {"status": "disconnected"}



class RedeployRequest(BaseModel):
    deploymentId: str


@router.post("/redeploy")
async def redeploy(body: RedeployRequest, user_id: str = Depends(get_user_id)):
    """Redeploy an existing Vercel deployment."""
    token = _get_vercel_token(user_id)

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{VERCEL_API}/v13/deployments",
            headers={"Authorization": f"Bearer {token}"},
            json={"deploymentId": body.deploymentId},
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail="Failed to trigger redeploy on Vercel")

    d = resp.json()
    return {
        "id": d.get("id") or d.get("uid"),
        "status": d.get("readyState", "BUILDING"),
        "url": d.get("url"),
    }


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


@router.get("/deployments/{deployment_id}/logs")
async def get_deployment_logs(
    deployment_id: str,
    user_id: str = Depends(get_user_id),
    projectId: str = Query(None),
):
    """Fetch structured build log lines for a Vercel deployment."""
    token = _get_vercel_token(user_id)

    lines = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Try runtime-logs streaming endpoint first (requires projectId)
        if projectId:
            try:
                async with client.stream(
                    "GET",
                    f"{VERCEL_API}/v1/projects/{projectId}/deployments/{deployment_id}/runtime-logs",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=httpx.Timeout(connect=10.0, read=5.0, write=5.0, pool=5.0),
                ) as stream:
                    if stream.status_code == 200:
                        try:
                            async for raw_line in stream.aiter_lines():
                                raw_line = raw_line.strip()
                                if not raw_line:
                                    continue
                                if raw_line.startswith("data:"):
                                    raw_line = raw_line[5:].strip()
                                try:
                                    entry = json.loads(raw_line)
                                    text = _strip_ansi(entry.get("message") or entry.get("text") or "").strip()
                                    if text:
                                        lines.append({"type": entry.get("level", "stdout"), "text": text})
                                except json.JSONDecodeError:
                                    if raw_line:
                                        lines.append({"type": "stdout", "text": _strip_ansi(raw_line)})
                        except (httpx.ReadTimeout, asyncio.TimeoutError):
                            pass  # Collected what we could before stream timed out
            except Exception:
                pass  # Fall through to events endpoint

        # Fall back to events endpoint
        if not lines:
            resp = await client.get(
                f"{VERCEL_API}/v2/deployments/{deployment_id}/events",
                headers={"Authorization": f"Bearer {token}"},
                params={"direction": "forward", "limit": 200},
            )
            if resp.status_code == 200 and not resp.json():
                resp = await client.get(
                    f"{VERCEL_API}/v2/deployments/{deployment_id}/events",
                    headers={"Authorization": f"Bearer {token}"},
                    params={"direction": "backward", "limit": 200},
                )
            if resp.status_code == 200:
                body = resp.json()
                raw_events = body if isinstance(body, list) else body.get("events", body.get("data", []))
                for event in reversed(raw_events if isinstance(raw_events, list) else []):
                    text = _strip_ansi(event.get("text", "")).strip()
                    if text and event.get("type") in ("stderr", "command", "stdout"):
                        lines.append({"type": event.get("type"), "text": text})

    if not lines:
        raise HTTPException(status_code=404, detail="No logs available for this deployment")

    return {"lines": lines, "deployment_id": deployment_id}


@router.get("/projects/{project_id}/env")
async def get_env_vars(project_id: str, user_id: str = Depends(get_user_id)):
    """Fetch environment variable names (values redacted) for a Vercel project."""
    token = _get_vercel_token(user_id)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{VERCEL_API}/v9/projects/{project_id}/env",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch env vars from Vercel")

    envs = resp.json().get("envs", [])
    return {
        "envs": [
            {
                "key": e["key"],
                "target": e.get("target", []),
                "type": e.get("type", "encrypted"),
                "git_branch": e.get("gitBranch"),
            }
            for e in envs
        ]
    }


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
        team_ids: list[str | None] = []
        team_slug_map: dict[str | None, str | None] = {None: None}
        if teams_resp.status_code == 200:
            for t in teams_resp.json().get("teams", []):
                team_ids.append(t["id"])
                team_slug_map[t["id"]] = t.get("slug")
        team_ids.append(None)  # personal scope last so team slugs win deduplication

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
                batch = resp.json().get("deployments", [])
                for dep in batch:
                    dep["_team_slug"] = team_slug_map.get(team_id)
                all_deployments += batch

    # Sort by creation time descending and deduplicate
    seen: set[str] = set()
    deployments = []
    for d in sorted(all_deployments, key=lambda x: x.get("createdAt", 0), reverse=True):
        if d["uid"] not in seen:
            seen.add(d["uid"])
            building_at = d.get("buildingAt")
            ready_at = d.get("ready")
            build_duration = None
            if building_at and ready_at:
                build_duration = round((ready_at - building_at) / 1000)  # seconds

            deployments.append({
                "id": d["uid"],
                "name": d.get("name"),
                "url": d.get("url"),
                "state": d.get("readyState"),
                "target": d.get("target"),
                "branch": d.get("meta", {}).get("githubCommitRef"),
                "commit_message": d.get("meta", {}).get("githubCommitMessage"),
                "commit_sha": d.get("meta", {}).get("githubCommitSha", "")[:7],
                "pr_id": d.get("meta", {}).get("githubPrId"),
                "created_at": d.get("createdAt"),
                "ready_at": ready_at,
                "build_duration": build_duration,
                "team_slug": d.get("_team_slug"),
            })

    return {"deployments": deployments[:limit]}
