import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.core.encryption import encrypt_token, decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase
from app.core import token_cache

GITHUB_API = "https://api.github.com"

router = APIRouter(prefix="/api/github", tags=["github"])


def _get_github_token(user_id: str) -> str:
    """Returns the stored PAT for the user, or raises."""
    cached = token_cache.get(user_id, "github")
    if cached:
        return cached
    result = supabase.table("connected_services") \
        .select("api_token") \
        .eq("user_id", user_id) \
        .eq("service_type", "github") \
        .single() \
        .execute()
    if not result.data or not result.data.get("api_token"):
        raise HTTPException(status_code=404, detail="GitHub not connected")
    token = decrypt_token(result.data["api_token"])
    token_cache.set(user_id, "github", token)
    return token


class ConnectRequest(BaseModel):
    token: str


@router.post("/connect")
async def connect_github(body: ConnectRequest, user_id: str = Depends(get_user_id)):
    """Validate a GitHub PAT and store it as a connected service."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/user",
            headers={
                "Authorization": f"Bearer {body.token}",
                "Accept": "application/vnd.github+json",
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid token — could not authenticate with GitHub")

    gh_user = resp.json()
    github_id = str(gh_user.get("id", ""))
    github_username = gh_user.get("login", "")

    supabase.table("connected_services").upsert({
        "user_id": user_id,
        "service_type": "github",
        "service_id": github_id,
        "service_name": github_username,
        "api_token": encrypt_token(body.token),
        "is_active": True,
        "health_status": "healthy",
    }, on_conflict="user_id,service_type,service_id").execute()
    token_cache.invalidate(user_id, "github")

    return {"status": "connected", "username": github_username}


@router.delete("/disconnect")
async def disconnect_github(user_id: str = Depends(get_user_id)):
    """Remove the GitHub connection."""
    supabase.table("connected_services") \
        .delete() \
        .eq("user_id", user_id) \
        .eq("service_type", "github") \
        .execute()

    return {"status": "disconnected"}


@router.get("/repos")
async def get_repos(user_id: str = Depends(get_user_id)):
    """List the user's GitHub repositories."""
    token = _get_github_token(user_id)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/user/repos",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            params={"sort": "updated", "per_page": 50, "affiliation": "owner,collaborator"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch repos from GitHub")

    repos = []
    for r in resp.json():
        repos.append({
            "id": r["id"],
            "name": r["name"],
            "full_name": r["full_name"],
            "description": r.get("description"),
            "private": r["private"],
            "default_branch": r.get("default_branch", "main"),
            "updated_at": r.get("updated_at"),
            "language": r.get("language"),
            "stars": r.get("stargazers_count", 0),
            "open_issues": r.get("open_issues_count", 0),
        })

    return {"repos": repos}


@router.get("/commits")
async def get_commits(
    user_id: str = Depends(get_user_id),
    repo: str = Query(..., description="owner/repo format"),
    limit: int = 20,
):
    """Fetch recent commits for a repository."""
    token = _get_github_token(user_id)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{repo}/commits",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            params={"per_page": limit},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch commits from GitHub")

    commits = []
    for c in resp.json():
        commits.append({
            "sha": c["sha"][:7],
            "message": c["commit"]["message"].split("\n")[0],
            "author": c["commit"]["author"]["name"],
            "author_avatar": c.get("author", {}).get("avatar_url") if c.get("author") else None,
            "date": c["commit"]["author"]["date"],
            "url": c["html_url"],
        })

    return {"commits": commits}


@router.get("/pulls")
async def get_pull_requests(
    user_id: str = Depends(get_user_id),
    repo: str = Query(..., description="owner/repo format"),
    state: str = Query("open"),
    limit: int = 20,
):
    """Fetch pull requests for a repository."""
    token = _get_github_token(user_id)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{repo}/pulls",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            params={"state": state, "per_page": limit, "sort": "updated"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch pull requests from GitHub")

    pulls = []
    for p in resp.json():
        pulls.append({
            "number": p["number"],
            "title": p["title"],
            "state": p["state"],
            "author": p["user"]["login"],
            "author_avatar": p["user"]["avatar_url"],
            "branch": p["head"]["ref"],
            "base": p["base"]["ref"],
            "created_at": p["created_at"],
            "updated_at": p["updated_at"],
            "url": p["html_url"],
            "draft": p.get("draft", False),
            "labels": [l["name"] for l in p.get("labels", [])],
        })

    return {"pulls": pulls}


@router.get("/actions")
async def get_actions(
    user_id: str = Depends(get_user_id),
    repo: str = Query(..., description="owner/repo format"),
    limit: int = 10,
):
    """Fetch recent GitHub Actions workflow runs."""
    token = _get_github_token(user_id)

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{repo}/actions/runs",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
            params={"per_page": limit},
        )

    if resp.status_code != 200:
        return {"runs": []}

    runs = []
    for r in resp.json().get("workflow_runs", []):
        runs.append({
            "id": r["id"],
            "name": r["name"],
            "status": r["status"],
            "conclusion": r.get("conclusion"),
            "branch": r["head_branch"],
            "commit_message": r["head_commit"]["message"].split("\n")[0] if r.get("head_commit") else None,
            "created_at": r["created_at"],
            "url": r["html_url"],
        })

    return {"runs": runs}
