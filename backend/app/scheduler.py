"""
Background polling jobs — Vercel, Render, GitHub, and uptime cleanup.
Writes normalized rows into the `events` table so Supabase Realtime
can push live updates to the frontend without page refreshes.
"""
import asyncio
from datetime import datetime, timezone, timedelta

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.encryption import decrypt_token
from app.core.logger import logger
from app.core.supabase import supabase

VERCEL_API = "https://api.vercel.com"
RENDER_API = "https://api.render.com/v1"
GITHUB_API = "https://api.github.com"

scheduler = AsyncIOScheduler()


# ── Helpers ────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ms_to_iso(ms: int | float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _get_connected_users(service_type: str) -> list[dict]:
    """Return all active connections for a service type."""
    result = supabase.table("connected_services") \
        .select("user_id, api_token") \
        .eq("service_type", service_type) \
        .eq("is_active", True) \
        .execute()
    return result.data or []


def _get_project_map(user_id: str, service_type: str) -> dict[str, str]:
    """Return {resource_id: project_id} for a user's linked services."""
    result = supabase.table("project_services") \
        .select("resource_id, project_id") \
        .eq("user_id", user_id) \
        .eq("service_type", service_type) \
        .execute()
    return {row["resource_id"]: row["project_id"] for row in (result.data or [])}


def _upsert_events(rows: list[dict]) -> None:
    if not rows:
        return
    try:
        supabase.table("events").upsert(
            rows, on_conflict="external_id,event_type"
        ).execute()
    except Exception as exc:
        logger.error("events upsert failed: %s", exc)


# ── Vercel ─────────────────────────────────────────────────────────────────

async def poll_vercel() -> None:
    users = _get_connected_users("vercel")
    if not users:
        return

    state_map = {
        "READY": "success", "ERROR": "error",
        "BUILDING": "building", "CANCELED": "canceled",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users:
            try:
                token = decrypt_token(user["api_token"])
                user_id = user["user_id"]
                project_map = _get_project_map(user_id, "vercel")
                headers = {"Authorization": f"Bearer {token}"}

                # Fetch across all team scopes
                teams_resp = await client.get(f"{VERCEL_API}/v2/teams", headers=headers)
                team_ids: list[str | None] = []
                team_slug_map: dict[str | None, str | None] = {None: None}
                if teams_resp.status_code == 200:
                    for t in teams_resp.json().get("teams", []):
                        team_ids.append(t["id"])
                        team_slug_map[t["id"]] = t.get("slug")
                team_ids.append(None)

                all_deps: list[dict] = []
                seen: set[str] = set()
                for team_id in team_ids:
                    params: dict = {"limit": 25}
                    if team_id:
                        params["teamId"] = team_id
                    resp = await client.get(f"{VERCEL_API}/v6/deployments", headers=headers, params=params)
                    if resp.status_code != 200:
                        continue
                    for d in resp.json().get("deployments", []):
                        uid = d.get("uid", "")
                        if uid and uid not in seen:
                            seen.add(uid)
                            d["_team_slug"] = team_slug_map.get(team_id)
                            all_deps.append(d)

                rows = []
                for d in all_deps:
                    uid = d.get("uid", "")
                    name = d.get("name", "")
                    meta = d.get("meta", {})
                    branch = meta.get("githubCommitRef", "")
                    commit_msg = (meta.get("githubCommitMessage") or "")[:80]
                    state = d.get("readyState", "BUILDING")
                    team_slug = d.get("_team_slug")
                    project_id_vercel = d.get("projectId", "")

                    external_url = None
                    if team_slug and name:
                        external_url = f"https://vercel.com/{team_slug}/{name}/deployments/{uid}"

                    rows.append({
                        "user_id": user_id,
                        "project_id": project_map.get(project_id_vercel),
                        "service_type": "vercel",
                        "event_type": "deployment",
                        "title": name or "Deployment",
                        "subtitle": commit_msg or (f"Branch: {branch}" if branch else ""),
                        "status": state_map.get(state, "building"),
                        "external_url": external_url,
                        "external_id": uid,
                        "metadata": {
                            "branch": branch,
                            "commit_message": commit_msg,
                            "state": state,
                        },
                        "occurred_at": _ms_to_iso(d.get("createdAt", 0)) if d.get("createdAt") else _now_iso(),
                    })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Vercel poll failed user=%s: %s", user["user_id"], exc)


# ── Render ─────────────────────────────────────────────────────────────────

async def poll_render() -> None:
    users = _get_connected_users("render")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users:
            try:
                token = decrypt_token(user["api_token"])
                user_id = user["user_id"]
                project_map = _get_project_map(user_id, "render")
                headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

                svcs_resp = await client.get(f"{RENDER_API}/services", headers=headers, params={"limit": 20})
                if svcs_resp.status_code != 200:
                    continue

                services = [
                    (item.get("service", item).get("id"), item.get("service", item).get("name", "Service"))
                    for item in svcs_resp.json()
                    if item.get("service", item).get("id")
                ]

                async def _fetch_renders(svc_id: str, svc_name: str) -> list[dict]:
                    resp = await client.get(
                        f"{RENDER_API}/services/{svc_id}/deploys",
                        headers=headers,
                        params={"limit": 10},
                    )
                    if resp.status_code != 200:
                        return []
                    result = []
                    for item in resp.json():
                        d = item.get("deploy", item)
                        commit = d.get("commit") or {}
                        raw_status = d.get("status", "")
                        status = (
                            "success" if raw_status == "live"
                            else "error" if raw_status in ("build_failed", "deactivated", "canceled")
                            else "building"
                        )
                        msg = (commit.get("message") or "").split("\n")[0][:80]
                        result.append({
                            "user_id": user_id,
                            "project_id": project_map.get(svc_id),
                            "service_type": "render",
                            "event_type": "deploy",
                            "title": svc_name,
                            "subtitle": msg,
                            "status": status,
                            "external_url": "https://dashboard.render.com",
                            "external_id": d.get("id", ""),
                            "metadata": {"raw_status": raw_status, "commit_message": msg},
                            "occurred_at": d.get("createdAt") or _now_iso(),
                        })
                    return result

                batches = await asyncio.gather(
                    *[_fetch_renders(sid, sname) for sid, sname in services],
                    return_exceptions=True,
                )
                rows = []
                for b in batches:
                    if isinstance(b, list):
                        rows.extend(b)
                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render poll failed user=%s: %s", user["user_id"], exc)


# ── GitHub ─────────────────────────────────────────────────────────────────

async def poll_github() -> None:
    users = _get_connected_users("github")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=20.0, write=8.0, pool=8.0)) as client:
        for user in users:
            try:
                token = decrypt_token(user["api_token"])
                user_id = user["user_id"]
                project_map = _get_project_map(user_id, "github")
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
                    continue

                repos = [r["full_name"] for r in repos_resp.json()[:5]]

                async def _fetch_repo(repo: str) -> list[dict]:
                    commits_resp, prs_resp, actions_resp = await asyncio.gather(
                        client.get(f"{GITHUB_API}/repos/{repo}/commits", headers=headers, params={"per_page": 10}),
                        client.get(f"{GITHUB_API}/repos/{repo}/pulls", headers=headers, params={"state": "all", "per_page": 5, "sort": "updated"}),
                        client.get(f"{GITHUB_API}/repos/{repo}/actions/runs", headers=headers, params={"per_page": 5}),
                        return_exceptions=True,
                    )
                    result = []
                    proj_id = project_map.get(repo)

                    if not isinstance(commits_resp, Exception) and commits_resp.status_code == 200:
                        for c in commits_resp.json():
                            result.append({
                                "user_id": user_id,
                                "project_id": proj_id,
                                "service_type": "github",
                                "event_type": "commit",
                                "title": c["commit"]["message"].split("\n")[0][:80],
                                "subtitle": f"{repo} • {c['commit']['author']['name']}",
                                "status": "success",
                                "external_url": c["html_url"],
                                "external_id": c["sha"],
                                "metadata": {"repo": repo, "author": c["commit"]["author"]["name"]},
                                "occurred_at": c["commit"]["author"]["date"],
                            })

                    if not isinstance(prs_resp, Exception) and prs_resp.status_code == 200:
                        for p in prs_resp.json():
                            status = "merged" if p.get("merged_at") else ("draft" if p.get("draft") else p["state"])
                            result.append({
                                "user_id": user_id,
                                "project_id": proj_id,
                                "service_type": "github",
                                "event_type": "pull_request",
                                "title": f"#{p['number']} {p['title'][:60]}",
                                "subtitle": f"{repo} • {p['head']['ref']} → {p['base']['ref']}",
                                "status": status,
                                "external_url": p["html_url"],
                                "external_id": f"{repo}-pr-{p['number']}",
                                "metadata": {"repo": repo, "pr_number": p["number"]},
                                "occurred_at": p["updated_at"],
                            })

                    if not isinstance(actions_resp, Exception) and actions_resp.status_code == 200:
                        for r in actions_resp.json().get("workflow_runs", []):
                            conclusion = r.get("conclusion") or ""
                            status = (
                                "success" if conclusion == "success"
                                else "error" if conclusion in ("failure", "cancelled", "timed_out")
                                else "building"
                            )
                            result.append({
                                "user_id": user_id,
                                "project_id": proj_id,
                                "service_type": "github",
                                "event_type": "ci_run",
                                "title": r["name"],
                                "subtitle": f"{repo} • {r['head_branch']}",
                                "status": status,
                                "external_url": r["html_url"],
                                "external_id": str(r["id"]),
                                "metadata": {"repo": repo, "branch": r["head_branch"]},
                                "occurred_at": r["created_at"],
                            })
                    return result

                batches = await asyncio.gather(
                    *[_fetch_repo(repo) for repo in repos],
                    return_exceptions=True,
                )
                rows = []
                for b in batches:
                    if isinstance(b, list):
                        rows.extend(b)
                _upsert_events(rows)

            except Exception as exc:
                logger.error("GitHub poll failed user=%s: %s", user["user_id"], exc)


# ── Uptime cleanup ─────────────────────────────────────────────────────────

def cleanup_uptime_checks() -> None:
    """Delete uptime_checks rows older than 7 days."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    try:
        supabase.table("uptime_checks").delete().lt("checked_at", cutoff).execute()
    except Exception as exc:
        logger.error("Uptime cleanup failed: %s", exc)


# ── Scheduler setup ────────────────────────────────────────────────────────

def start_scheduler() -> None:
    scheduler.add_job(poll_vercel, "interval", seconds=60, id="poll_vercel", max_instances=1)
    scheduler.add_job(poll_render, "interval", seconds=30, id="poll_render", max_instances=1)
    scheduler.add_job(poll_github, "interval", minutes=2, id="poll_github", max_instances=1)
    scheduler.add_job(cleanup_uptime_checks, "interval", hours=6, id="cleanup_uptime", max_instances=1)
    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
