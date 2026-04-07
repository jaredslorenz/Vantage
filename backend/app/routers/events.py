import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, Query

from app.core.encryption import decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase

VERCEL_API = "https://api.vercel.com"
RENDER_API = "https://api.render.com/v1"
GITHUB_API = "https://api.github.com"

router = APIRouter(prefix="/api/events", tags=["events"])


def _get_token(user_id: str, service_type: str) -> str | None:
    result = (
        supabase.table("connected_services")
        .select("api_token")
        .eq("user_id", user_id)
        .eq("service_type", service_type)
        .single()
        .execute()
    )
    if result.data and result.data.get("api_token"):
        return decrypt_token(result.data["api_token"])
    return None


def _ms_to_iso(ms: int | float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


async def _fetch_vercel(client: httpx.AsyncClient, token: str) -> list:
    events = []
    resp = await client.get(
        f"{VERCEL_API}/v6/deployments",
        headers={"Authorization": f"Bearer {token}"},
        params={"limit": 25},
    )
    if resp.status_code != 200:
        return events

    state_map = {"READY": "success", "ERROR": "error", "BUILDING": "building", "CANCELED": "canceled"}
    for d in resp.json().get("deployments", []):
        meta = d.get("meta", {})
        branch = meta.get("githubCommitRef", "main")
        msg = (meta.get("githubCommitMessage") or "")[:70]
        events.append({
            "id": f"vercel-{d.get('uid', '')}",
            "type": "deployment",
            "service": "vercel",
            "title": d.get("name", "Deployment"),
            "subtitle": f"{branch} • {msg}" if msg else branch,
            "status": state_map.get(d.get("readyState", ""), "building"),
            "timestamp": _ms_to_iso(d.get("createdAt", 0)),
            "url": f"https://{d['url']}" if d.get("url") else "https://vercel.com/dashboard",
        })
    return events


async def _fetch_render(client: httpx.AsyncClient, token: str) -> list:
    events = []
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    svcs_resp = await client.get(f"{RENDER_API}/services", headers=headers, params={"limit": 10})
    if svcs_resp.status_code != 200:
        return events

    services = [
        (item.get("service", item).get("id"), item.get("service", item).get("name", "Service"))
        for item in svcs_resp.json()
        if item.get("service", item).get("id")
    ][:5]

    async def _svc_deploys(svc_id: str, svc_name: str) -> list:
        resp = await client.get(
            f"{RENDER_API}/services/{svc_id}/deploys",
            headers=headers,
            params={"limit": 6},
        )
        results = []
        if resp.status_code != 200:
            return results
        for item in resp.json():
            d = item.get("deploy", item)
            commit = d.get("commit") or {}
            raw = d.get("status", "")
            status = (
                "success" if raw == "live"
                else "error" if raw in ("build_failed", "deactivated", "canceled")
                else "building"
            )
            msg = (commit.get("message") or "").split("\n")[0][:70]
            results.append({
                "id": f"render-{d.get('id', '')}",
                "type": "deploy",
                "service": "render",
                "title": svc_name,
                "subtitle": msg,
                "status": status,
                "timestamp": d.get("createdAt", ""),
                "url": "https://dashboard.render.com",
            })
        return results

    all_deploys = await asyncio.gather(
        *[_svc_deploys(sid, sname) for sid, sname in services],
        return_exceptions=True,
    )
    for deploys in all_deploys:
        if isinstance(deploys, list):
            events.extend(deploys)
    return events


async def _fetch_github(client: httpx.AsyncClient, token: str) -> list:
    events = []
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    repos_resp = await client.get(
        f"{GITHUB_API}/user/repos",
        headers=headers,
        params={"sort": "updated", "per_page": 5, "affiliation": "owner,collaborator"},
    )
    if repos_resp.status_code != 200:
        return events

    repos = [r["full_name"] for r in repos_resp.json()[:5]]

    async def _repo_events(repo: str) -> list:
        results = []
        commits_resp, prs_resp, actions_resp = await asyncio.gather(
            client.get(f"{GITHUB_API}/repos/{repo}/commits", headers=headers, params={"per_page": 8}),
            client.get(f"{GITHUB_API}/repos/{repo}/pulls", headers=headers, params={"state": "all", "per_page": 5, "sort": "updated"}),
            client.get(f"{GITHUB_API}/repos/{repo}/actions/runs", headers=headers, params={"per_page": 5}),
            return_exceptions=True,
        )

        if not isinstance(commits_resp, Exception) and commits_resp.status_code == 200:
            for c in commits_resp.json():
                results.append({
                    "id": f"github-commit-{c['sha'][:7]}-{repo.replace('/', '-')}",
                    "type": "commit",
                    "service": "github",
                    "title": c["commit"]["message"].split("\n")[0][:80],
                    "subtitle": f"{repo} • {c['commit']['author']['name']}",
                    "status": "success",
                    "timestamp": c["commit"]["author"]["date"],
                    "url": c["html_url"],
                })

        if not isinstance(prs_resp, Exception) and prs_resp.status_code == 200:
            for p in prs_resp.json():
                status = "merged" if p.get("merged_at") else ("draft" if p.get("draft") else p["state"])
                results.append({
                    "id": f"github-pr-{p['number']}-{repo.replace('/', '-')}",
                    "type": "pull_request",
                    "service": "github",
                    "title": f"#{p['number']} {p['title'][:60]}",
                    "subtitle": f"{repo} • {p['head']['ref']} → {p['base']['ref']}",
                    "status": status,
                    "timestamp": p["updated_at"],
                    "url": p["html_url"],
                })

        if not isinstance(actions_resp, Exception) and actions_resp.status_code == 200:
            for r in actions_resp.json().get("workflow_runs", []):
                conclusion = r.get("conclusion") or ""
                status = (
                    "success" if conclusion == "success"
                    else "error" if conclusion in ("failure", "cancelled", "timed_out")
                    else "building"
                )
                results.append({
                    "id": f"github-action-{r['id']}",
                    "type": "ci_run",
                    "service": "github",
                    "title": r["name"],
                    "subtitle": f"{repo} • {r['head_branch']}",
                    "status": status,
                    "timestamp": r["created_at"],
                    "url": r["html_url"],
                })

        return results

    all_results = await asyncio.gather(
        *[_repo_events(repo) for repo in repos],
        return_exceptions=True,
    )
    for r in all_results:
        if isinstance(r, list):
            events.extend(r)
    return events


def _db_event_to_response(row: dict) -> dict:
    """Normalize an events-table row to the frontend Event shape."""
    event_type = row.get("event_type", "")
    # Map DB event_type to frontend type
    type_map = {
        "deployment.created": "deployment",
        "deployment.succeeded": "deployment",
        "deployment.ready": "deployment",
        "deployment.error": "deployment",
        "deployment.canceled": "deployment",
        "deploy": "deploy",
        "commit": "commit",
        "pull_request": "pull_request",
        "ci_run": "ci_run",
    }
    return {
        "id": row.get("external_id") or str(row.get("id", "")),
        "type": type_map.get(event_type, event_type),
        "service": row.get("service_type", ""),
        "title": row.get("title", ""),
        "subtitle": row.get("subtitle", ""),
        "status": row.get("status", "building"),
        "timestamp": row.get("occurred_at", ""),
        "url": row.get("external_url") or "",
    }


@router.get("")
async def get_events(
    user_id: str = Depends(get_user_id),
    limit: int = Query(default=60, le=100),
):
    services_result = (
        supabase.table("connected_services")
        .select("service_type")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .execute()
    )
    connected = {s["service_type"] for s in (services_result.data or [])}

    events: list = []

    # Read Vercel and Render events from DB (populated by webhooks / background jobs)
    db_services = connected & {"vercel", "render"}
    if db_services:
        db_result = (
            supabase.table("events")
            .select("*")
            .eq("user_id", user_id)
            .in_("service_type", list(db_services))
            .order("occurred_at", desc=True)
            .limit(limit)
            .execute()
        )
        for row in db_result.data or []:
            events.append(_db_event_to_response(row))

    # Fetch GitHub live (no webhook integration yet)
    if "github" in connected:
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=20.0, write=10.0, pool=10.0)
        ) as client:
            token = _get_token(user_id, "github")
            if token:
                try:
                    gh_events = await _fetch_github(client, token)
                    events.extend(gh_events)
                except Exception:
                    pass

    events.sort(key=lambda e: e.get("timestamp") or "", reverse=True)

    return {"events": events[:limit], "connected": sorted(connected)}
