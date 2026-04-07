"""
Background polling jobs — Vercel, Render, GitHub, and uptime cleanup.
Writes normalized rows into the `events` table so Supabase Realtime
can push live updates to the frontend without page refreshes.
"""
import asyncio
import hashlib
import ipaddress
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.core.encryption import decrypt_token
from app.core.logger import logger
from app.core.supabase import supabase

VERCEL_API = "https://api.vercel.com"
RENDER_API = "https://api.render.com/v1"
GITHUB_API = "https://api.github.com"

scheduler = AsyncIOScheduler()

# ── Simple TTL cache ────────────────────────────────────────────────────────

_cache: dict[str, tuple[float, object]] = {}
_CACHE_TTL = 300  # 5 minutes


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and (datetime.now(timezone.utc).timestamp() - entry[0]) < _CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, value: object) -> None:
    _cache[key] = (datetime.now(timezone.utc).timestamp(), value)


# ── Helpers ────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ms_to_iso(ms: int | float) -> str:
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def _get_connected_users(service_type: str) -> list[dict]:
    """Return all active connections for a service type (cached 5 min)."""
    key = f"connected_users:{service_type}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore
    try:
        result = supabase.table("connected_services") \
            .select("user_id, api_token") \
            .eq("service_type", service_type) \
            .eq("is_active", True) \
            .execute()
        data = result.data or []
        _cache_set(key, data)
        return data
    except Exception as exc:
        logger.error("_get_connected_users failed service=%s: %s", service_type, exc)
        return []


def _get_project_map(user_id: str, service_type: str) -> dict[str, str]:
    """Return {resource_id: project_id} for a user's linked services (cached 5 min)."""
    key = f"project_map:{user_id}:{service_type}"
    cached = _cache_get(key)
    if cached is not None:
        return cached  # type: ignore
    try:
        projects = supabase.table("projects").select("id").eq("user_id", user_id).execute()
    except Exception as exc:
        logger.error("_get_project_map projects query failed: %s", exc)
        return {}
    project_ids = [p["id"] for p in (projects.data or [])]
    if not project_ids:
        _cache_set(key, {})
        return {}
    try:
        result = supabase.table("project_services") \
            .select("resource_id, project_id") \
            .in_("project_id", project_ids) \
            .eq("service_type", service_type) \
            .execute()
    except Exception as exc:
        logger.error("_get_project_map project_services query failed: %s", exc)
        return {}
    mapping = {row["resource_id"]: row["project_id"] for row in (result.data or [])}
    _cache_set(key, mapping)
    return mapping


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

                # Only poll repos explicitly linked to a Vantage project
                repos = list(project_map.keys())
                if not repos:
                    continue

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


# ── Render metrics alerting ────────────────────────────────────────────────

async def poll_render_metrics() -> None:
    """Check CPU/memory metrics for all Render services and alert on sustained anomalies."""
    users = _get_connected_users("render")
    if not users:
        return

    now = datetime.now(timezone.utc)
    start_time = (now - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_time = now.strftime("%Y-%m-%dT%H:%M:%SZ")

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

                rows = []
                for item in svcs_resp.json():
                    svc = item.get("service", item)
                    svc_id = svc.get("id", "")
                    svc_name = svc.get("name", "")
                    if not svc_id:
                        continue

                    params: dict = {"resource": svc_id, "startTime": start_time, "endTime": end_time, "resolutionSeconds": 60}

                    cpu_resp, mem_resp, cpu_lim_resp, mem_lim_resp = await asyncio.gather(
                        client.get(f"{RENDER_API}/metrics/cpu", headers=headers, params=params),
                        client.get(f"{RENDER_API}/metrics/memory", headers=headers, params=params),
                        client.get(f"{RENDER_API}/metrics/cpu-limit", headers=headers, params=params),
                        client.get(f"{RENDER_API}/metrics/memory-limit", headers=headers, params=params),
                        return_exceptions=True,
                    )

                    def _avg(resp) -> float | None:
                        if isinstance(resp, Exception) or resp.status_code != 200:
                            return None
                        data = resp.json()
                        if not isinstance(data, list) or not data:
                            return None
                        vals = [v.get("value", 0) for v in data[0].get("values", []) if v.get("value") is not None]
                        return sum(vals) / len(vals) if vals else None

                    cpu_avg = _avg(cpu_resp)
                    mem_avg = _avg(mem_resp)
                    cpu_limit = _avg(cpu_lim_resp)
                    mem_limit = _avg(mem_lim_resp)

                    if cpu_avg is not None and cpu_limit and cpu_limit > 0:
                        pct = cpu_avg / cpu_limit
                        if pct > 0.85:
                            rows.append({
                                "user_id": user_id,
                                "project_id": project_map.get(svc_id),
                                "service_type": "render",
                                "event_type": "metric_alert",
                                "title": f"High CPU on {svc_name}",
                                "subtitle": f"{round(pct * 100)}% CPU usage sustained over 10 min",
                                "status": "error",
                                "external_url": "https://dashboard.render.com",
                                "external_id": f"metric-cpu-{svc_id}",
                                "metadata": {"cpu_pct": round(pct * 100), "service_id": svc_id},
                                "occurred_at": end_time,
                            })

                    if mem_avg is not None and mem_limit and mem_limit > 0:
                        pct = mem_avg / mem_limit
                        if pct > 0.90:
                            rows.append({
                                "user_id": user_id,
                                "project_id": project_map.get(svc_id),
                                "service_type": "render",
                                "event_type": "metric_alert",
                                "title": f"High memory on {svc_name}",
                                "subtitle": f"{round(pct * 100)}% memory usage sustained over 10 min",
                                "status": "error",
                                "external_url": "https://dashboard.render.com",
                                "external_id": f"metric-mem-{svc_id}",
                                "metadata": {"mem_pct": round(pct * 100), "service_id": svc_id},
                                "occurred_at": end_time,
                            })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render metrics poll failed user=%s: %s", user["user_id"], exc)


# ── Render log scanning ────────────────────────────────────────────────────

_ERROR_PATTERNS = ["error", "exception", "traceback", "fatal", "panic", "crash", "unhandled rejection", "segfault"]
_NOISE_PATTERNS = ["health check", "healthcheck", "GET /health", "200 ok"]


def _is_error_line(text: str) -> bool:
    low = text.lower()
    if any(n in low for n in _NOISE_PATTERNS):
        return False
    return any(p in low for p in _ERROR_PATTERNS)


async def scan_render_logs() -> None:
    users = _get_connected_users("render")
    if not users:
        return

    now = datetime.now(timezone.utc)
    start_time = (now - timedelta(seconds=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end_time = now.strftime("%Y-%m-%dT%H:%M:%SZ")

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

                owners_resp = await client.get(f"{RENDER_API}/owners", headers=headers, params={"limit": 1})
                owner_id = None
                if owners_resp.status_code == 200 and owners_resp.json():
                    owner_id = owners_resp.json()[0].get("owner", {}).get("id")

                rows = []
                for item in svcs_resp.json():
                    svc = item.get("service", item)
                    svc_id = svc.get("id", "")
                    svc_name = svc.get("name", "")
                    if not svc_id:
                        continue

                    params: dict = {"resource": svc_id, "limit": 100, "startTime": start_time, "endTime": end_time}
                    if owner_id:
                        params["ownerId"] = owner_id

                    logs_resp = await client.get(f"{RENDER_API}/logs", headers=headers, params=params)
                    if logs_resp.status_code != 200:
                        continue

                    raw = logs_resp.json()
                    entries = raw.get("logs", raw) if isinstance(raw, dict) else raw
                    error_lines = [
                        (entry.get("message") or entry.get("text") or "").strip()
                        for entry in (entries if isinstance(entries, list) else [])
                        if _is_error_line(entry.get("message") or entry.get("text") or "")
                    ]

                    if not error_lines:
                        continue

                    first = error_lines[0][:200]
                    error_id = hashlib.md5(f"{svc_id}:{first[:100]}".encode()).hexdigest()

                    rows.append({
                        "user_id": user_id,
                        "project_id": project_map.get(svc_id),
                        "service_type": "render",
                        "event_type": "runtime_error",
                        "title": f"Runtime error in {svc_name}",
                        "subtitle": first[:120],
                        "status": "error",
                        "external_url": "https://dashboard.render.com",
                        "external_id": error_id,
                        "metadata": {"errors": error_lines[:10], "service_id": svc_id, "service_name": svc_name},
                        "occurred_at": end_time,
                    })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render log scan failed user=%s: %s", user["user_id"], exc)


# ── Render service health ──────────────────────────────────────────────────

async def check_render_service_health() -> None:
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

                rows = []
                for item in svcs_resp.json():
                    svc = item.get("service", item)
                    svc_id = svc.get("id", "")
                    svc_name = svc.get("name", "")
                    suspended = svc.get("suspended") == "suspended"
                    if not svc_id or not suspended:
                        continue

                    rows.append({
                        "user_id": user_id,
                        "project_id": project_map.get(svc_id),
                        "service_type": "render",
                        "event_type": "service_health",
                        "title": f"{svc_name} is suspended",
                        "subtitle": "Service has been suspended on Render",
                        "status": "error",
                        "external_url": "https://dashboard.render.com",
                        "external_id": f"suspended-{svc_id}",
                        "metadata": {"service_id": svc_id, "service_name": svc_name},
                        "occurred_at": _now_iso(),
                    })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render health check failed user=%s: %s", user["user_id"], exc)


# ── Endpoint health checks ─────────────────────────────────────────────────

def _is_safe_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False
        host = parsed.hostname or ""
        try:
            addr = ipaddress.ip_address(host)
            return not any([addr.is_private, addr.is_loopback, addr.is_link_local, addr.is_reserved])
        except ValueError:
            return True
    except Exception:
        return False


async def check_endpoints() -> None:
    """Ping deployment URLs for all users and record response time + status."""
    users_vercel = _get_connected_users("vercel")
    users_render = _get_connected_users("render")

    targets: list[dict] = []  # {user_id, project_id, service_type, service_id, name, url}

    # Collect Vercel deployment URLs
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users_vercel:
            try:
                token = decrypt_token(user["api_token"])
                user_id = user["user_id"]
                project_map = _get_project_map(user_id, "vercel")
                headers = {"Authorization": f"Bearer {token}"}

                resp = await client.get(f"{VERCEL_API}/v9/projects", headers=headers)
                if resp.status_code != 200:
                    continue
                for p in resp.json().get("projects", []):
                    deps = p.get("latestDeployments", [])
                    if not deps or not deps[0].get("url"):
                        continue
                    url = f"https://{deps[0]['url']}"
                    if _is_safe_url(url):
                        targets.append({
                            "user_id": user_id,
                            "project_id": project_map.get(p["id"]),
                            "service_type": "vercel",
                            "service_id": p["id"],
                            "name": p["name"],
                            "url": url,
                        })
            except Exception as exc:
                logger.error("Endpoint collect vercel failed user=%s: %s", user["user_id"], exc)

        for user in users_render:
            try:
                token = decrypt_token(user["api_token"])
                user_id = user["user_id"]
                project_map = _get_project_map(user_id, "render")
                headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

                resp = await client.get(f"{RENDER_API}/services", headers=headers, params={"limit": 20})
                if resp.status_code != 200:
                    continue
                for item in resp.json():
                    svc = item.get("service", item)
                    url = svc.get("serviceDetails", {}).get("url")
                    if not url or not _is_safe_url(url):
                        continue
                    targets.append({
                        "user_id": user["user_id"],
                        "project_id": project_map.get(svc["id"]),
                        "service_type": "render",
                        "service_id": svc["id"],
                        "name": svc.get("name", ""),
                        "url": url,
                    })
            except Exception as exc:
                logger.error("Endpoint collect render failed user=%s: %s", user["user_id"], exc)

        # Ping all targets
        uptime_rows = []
        event_rows = []

        async def _ping(target: dict) -> None:
            import time
            url = target["url"]
            start = time.monotonic()
            is_up = False
            status_code = None
            try:
                resp = await client.head(url, follow_redirects=True)
                if resp.status_code == 405:
                    resp = await client.get(url, follow_redirects=True)
                status_code = resp.status_code
                is_up = status_code < 500
            except Exception:
                pass
            latency_ms = round((time.monotonic() - start) * 1000)

            uptime_rows.append({
                "user_id": target["user_id"],
                "service_type": target["service_type"],
                "service_id": target["service_id"],
                "url": url,
                "is_up": is_up,
                "status_code": status_code,
                "latency_ms": latency_ms,
            })

            # Write error event if returning 5xx
            if status_code and status_code >= 500:
                error_id = hashlib.md5(f"endpoint-{target['service_id']}-5xx".encode()).hexdigest()
                event_rows.append({
                    "user_id": target["user_id"],
                    "project_id": target["project_id"],
                    "service_type": target["service_type"],
                    "event_type": "endpoint_error",
                    "title": f"{target['name']} returning {status_code}",
                    "subtitle": url,
                    "status": "error",
                    "external_url": url,
                    "external_id": error_id,
                    "metadata": {"status_code": status_code, "latency_ms": latency_ms, "url": url},
                    "occurred_at": _now_iso(),
                })

        await asyncio.gather(*[_ping(t) for t in targets], return_exceptions=True)

        if uptime_rows:
            try:
                supabase.table("uptime_checks").insert(uptime_rows).execute()
            except Exception as exc:
                logger.error("Uptime insert failed: %s", exc)

        _upsert_events(event_rows)


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
    scheduler.add_job(poll_vercel, "interval", minutes=2, id="poll_vercel", max_instances=1)
    scheduler.add_job(poll_render, "interval", minutes=2, id="poll_render", max_instances=1)
    scheduler.add_job(poll_github, "interval", minutes=5, id="poll_github", max_instances=1)
    scheduler.add_job(poll_render_metrics, "interval", minutes=10, id="render_metrics", max_instances=1)
    scheduler.add_job(scan_render_logs, "interval", minutes=2, id="scan_render_logs", max_instances=1)
    scheduler.add_job(check_render_service_health, "interval", minutes=10, id="render_health", max_instances=1)
    scheduler.add_job(check_endpoints, "interval", minutes=10, id="check_endpoints", max_instances=1)
    scheduler.add_job(cleanup_uptime_checks, "interval", hours=6, id="cleanup_uptime", max_instances=1)
    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
