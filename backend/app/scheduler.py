"""
Background polling jobs — Vercel, Render, GitHub, and uptime cleanup.
Writes normalized rows into the `events` table so Supabase Realtime
can push live updates to the frontend without page refreshes.
"""
import asyncio
import hashlib
import ipaddress
import json
import re
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


def _cache_evict() -> None:
    now = datetime.now(timezone.utc).timestamp()
    stale = [k for k, (ts, _) in _cache.items() if now - ts >= _CACHE_TTL]
    for k in stale:
        del _cache[k]
    if stale:
        logger.debug("Cache evicted %d stale entries (%d remaining)", len(stale), len(_cache))


# ── Helpers ────────────────────────────────────────────────────────────────

def _mark_service_unhealthy(user_id: str, service_type: str) -> None:
    try:
        supabase.table("connected_services") \
            .update({"health_status": "unhealthy"}) \
            .eq("user_id", user_id) \
            .eq("service_type", service_type) \
            .execute()
    except Exception as exc:
        logger.error("Failed to mark %s unhealthy user=%s: %s", service_type, user_id, exc)


_RENDER_TYPE_SLUG = {
    "web_service": "web", "static_site": "static",
    "cron_job": "cron", "background_worker": "worker", "private_service": "pserv",
}


def _render_url(svc_id: str, svc_type: str = "web_service", path: str = "") -> str:
    slug = _RENDER_TYPE_SLUG.get(svc_type, "web")
    base = f"https://dashboard.render.com/{slug}/{svc_id}"
    return f"{base}/{path}" if path else base


def _log_rate_limited(service: str, user_id: str, resp) -> bool:
    if resp.status_code == 429:
        retry_after = resp.headers.get("Retry-After", "unknown")
        logger.warning("Rate limited by %s user=%s retry-after=%s", service, user_id, retry_after)
        return True
    return False


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


_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[mGKHF]")


async def _fetch_vercel_build_errors(deployment_id: str, headers: dict, client: httpx.AsyncClient) -> list[str]:
    """Fetch Vercel build logs for a failed deployment and return error lines."""
    resp = await client.get(
        f"{VERCEL_API}/v2/deployments/{deployment_id}/events",
        headers=headers,
        params={"direction": "backward", "limit": 100},
    )
    if resp.status_code != 200:
        return []
    events = resp.json() if isinstance(resp.json(), list) else []
    lines = []
    for event in events:
        text = _ANSI_RE.sub("", event.get("text", "")).strip()
        if text and _is_error_line(text):
            lines.append(text[:200])
    return lines[:20]


async def _fetch_render_build_errors(svc_id: str, deploy_id: str, headers: dict, client: httpx.AsyncClient) -> list[str]:
    """Fetch Render build logs for a failed deploy and return error lines."""
    deploy_resp = await client.get(
        f"{RENDER_API}/services/{svc_id}/deploys/{deploy_id}",
        headers=headers,
    )
    if deploy_resp.status_code != 200:
        return []
    d = deploy_resp.json().get("deploy", deploy_resp.json())
    created_at = d.get("createdAt", "")
    finished_at = d.get("finishedAt", "")
    if not created_at:
        return []

    owners_resp = await client.get(f"{RENDER_API}/owners", headers=headers, params={"limit": 1})
    owner_id = None
    if owners_resp.status_code == 200 and owners_resp.json():
        owner_id = owners_resp.json()[0].get("owner", {}).get("id")

    params: dict = {"resource": svc_id, "limit": 100, "startTime": created_at}
    if finished_at:
        params["endTime"] = finished_at
    if owner_id:
        params["ownerId"] = owner_id

    logs_resp = await client.get(f"{RENDER_API}/logs", headers=headers, params=params)
    if logs_resp.status_code != 200:
        return []
    raw = logs_resp.json()
    entries = raw.get("logs", raw) if isinstance(raw, dict) else raw
    lines = []
    for entry in (entries if isinstance(entries, list) else []):
        text = (entry.get("message") or entry.get("text") or "").strip()
        if text and _is_error_line(text):
            lines.append(text[:200])
    return lines[:20]


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
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=vercel: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "vercel")
                continue
            try:
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
                    if _log_rate_limited("Vercel", user_id, resp):
                        break
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

                    subtitle = commit_msg or (f"Branch: {branch}" if branch else "")
                    error_lines: list[str] = []
                    if state == "ERROR" and uid:
                        try:
                            error_lines = await _fetch_vercel_build_errors(uid, headers, client)
                            if error_lines:
                                subtitle = error_lines[0]
                        except Exception:
                            pass

                    rows.append({
                        "user_id": user_id,
                        "project_id": project_map.get(project_id_vercel),
                        "service_type": "vercel",
                        "event_type": "deployment",
                        "title": name or "Deployment",
                        "subtitle": subtitle,
                        "status": state_map.get(state, "building"),
                        "external_url": external_url,
                        "external_id": uid,
                        "metadata": {
                            "branch": branch,
                            "commit_message": commit_msg,
                            "state": state,
                            **({"error_lines": error_lines} if error_lines else {}),
                        },
                        "occurred_at": _ms_to_iso(d.get("createdAt", 0)) if d.get("createdAt") else _now_iso(),
                    })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Vercel poll failed user=%s: %s", user_id, exc)


# ── Render ─────────────────────────────────────────────────────────────────

async def poll_render() -> None:
    users = _get_connected_users("render")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=render: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "render")
                continue
            try:
                project_map = _get_project_map(user_id, "render")
                headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

                svcs_resp = await client.get(f"{RENDER_API}/services", headers=headers, params={"limit": 20})
                if _log_rate_limited("Render", user_id, svcs_resp):
                    continue
                if svcs_resp.status_code != 200:
                    continue

                services = [
                    (
                        item.get("service", item).get("id"),
                        item.get("service", item).get("name", "Service"),
                        item.get("service", item).get("type", "web_service"),
                    )
                    for item in svcs_resp.json()
                    if item.get("service", item).get("id")
                ]

                async def _fetch_renders(svc_id: str, svc_name: str, svc_type: str) -> list[dict]:
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
                        deploy_id = d.get("id", "")
                        commit = d.get("commit") or {}
                        raw_status = d.get("status", "")
                        status = (
                            "success" if raw_status == "live"
                            else "error" if raw_status in ("build_failed", "deactivated", "canceled")
                            else "building"
                        )
                        msg = (commit.get("message") or "").split("\n")[0][:80]
                        subtitle = msg
                        build_error_lines: list[str] = []
                        if raw_status == "build_failed":
                            try:
                                build_error_lines = await _fetch_render_build_errors(svc_id, deploy_id, headers, client)
                                if build_error_lines:
                                    subtitle = build_error_lines[0]
                            except Exception:
                                pass
                        result.append({
                            "user_id": user_id,
                            "project_id": project_map.get(svc_id),
                            "service_type": "render",
                            "event_type": "deploy",
                            "title": svc_name,
                            "subtitle": subtitle,
                            "status": status,
                            "external_url": _render_url(svc_id, svc_type, f"deploys/{deploy_id}"),
                            "external_id": deploy_id,
                            "metadata": {
                                "raw_status": raw_status,
                                "commit_message": msg,
                                **({"error_lines": build_error_lines} if build_error_lines else {}),
                            },
                            "occurred_at": d.get("createdAt") or _now_iso(),
                        })
                    return result

                batches = await asyncio.gather(
                    *[_fetch_renders(sid, sname, stype) for sid, sname, stype in services],
                    return_exceptions=True,
                )
                rows = []
                for b in batches:
                    if isinstance(b, list):
                        rows.extend(b)
                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render poll failed user=%s: %s", user_id, exc)


# ── GitHub ─────────────────────────────────────────────────────────────────

async def poll_github() -> None:
    users = _get_connected_users("github")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=20.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=github: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "github")
                continue
            try:
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
                logger.error("GitHub poll failed user=%s: %s", user_id, exc)


# ── Vercel log scanning ────────────────────────────────────────────────────

async def scan_vercel_logs() -> None:
    """Scan runtime logs of recent Vercel READY deployments for errors."""
    users = _get_connected_users("vercel")
    if not users:
        return

    now = datetime.now(timezone.utc)
    cutoff_ms = (now - timedelta(minutes=3)).timestamp() * 1000

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=vercel: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "vercel")
                continue
            try:
                project_map = _get_project_map(user_id, "vercel")
                headers = {"Authorization": f"Bearer {token}"}

                # Collect recent READY deployments across all scopes
                teams_resp = await client.get(f"{VERCEL_API}/v2/teams", headers=headers)
                team_ids: list[str | None] = []
                if teams_resp.status_code == 200:
                    team_ids = [t["id"] for t in teams_resp.json().get("teams", [])]
                team_ids.append(None)

                seen_deps: set[str] = set()
                recent_deps: list[dict] = []
                for team_id in team_ids:
                    params: dict = {"limit": 10, "state": "READY"}
                    if team_id:
                        params["teamId"] = team_id
                    resp = await client.get(f"{VERCEL_API}/v6/deployments", headers=headers, params=params)
                    if _log_rate_limited("Vercel", user_id, resp):
                        break
                    if resp.status_code != 200:
                        continue
                    for d in resp.json().get("deployments", []):
                        uid = d.get("uid", "")
                        if uid and uid not in seen_deps:
                            seen_deps.add(uid)
                            recent_deps.append(d)

                rows = []
                for dep in recent_deps:
                    dep_id = dep.get("uid", "")
                    project_id_vercel = dep.get("projectId", "")
                    dep_name = dep.get("name", "deployment")
                    if not dep_id:
                        continue

                    try:
                        async with client.stream(
                            "GET",
                            f"{VERCEL_API}/v1/deployments/{dep_id}/runtime-logs",
                            headers=headers,
                            timeout=httpx.Timeout(connect=8.0, read=8.0, write=5.0, pool=5.0),
                        ) as stream:
                            if stream.status_code != 200:
                                continue
                            error_lines = []
                            async for raw_line in stream.aiter_lines():
                                raw_line = raw_line.strip()
                                if not raw_line:
                                    continue
                                try:
                                    entry = json.loads(raw_line)
                                    ts = entry.get("timestampInMs", 0)
                                    if ts and ts < cutoff_ms:
                                        continue
                                    text = (entry.get("message") or entry.get("text") or "").strip()
                                    if _is_error_line(text):
                                        error_lines.append(text)
                                except Exception:
                                    continue

                            if not error_lines:
                                continue

                            first = error_lines[0][:200]
                            error_id = hashlib.md5(f"vercel:{dep_id}:{first[:100]}".encode()).hexdigest()
                            rows.append({
                                "user_id": user_id,
                                "project_id": project_map.get(project_id_vercel),
                                "service_type": "vercel",
                                "event_type": "runtime_error",
                                "title": f"Runtime error in {dep_name}",
                                "subtitle": first[:120],
                                "status": "error",
                                "external_url": f"https://vercel.com/deployments/{dep_id}",
                                "external_id": error_id,
                                "metadata": {"errors": error_lines[:10], "deployment_id": dep_id, "service_name": dep_name},
                                "occurred_at": _now_iso(),
                            })
                    except (httpx.ReadTimeout, asyncio.TimeoutError):
                        continue
                    except Exception as exc:
                        logger.error("Vercel log scan dep=%s failed: %s", dep_id, exc)
                        continue

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Vercel log scan failed user=%s: %s", user_id, exc)


# Free-tier fallbacks — used when the limit endpoint returns nothing
_CPU_LIMIT_FALLBACK = 0.1    # 100 mCPU
_MEM_LIMIT_FALLBACK = 512 * 1024 * 1024  # 512 MB


def _parse_metric_series(resp) -> list[float]:
    """Extract values from a Render metrics response (time-series or scalar)."""
    if isinstance(resp, Exception) or resp.status_code != 200:
        return []
    data = resp.json()
    # Time-series format: [{values: [{timestamp, value}, ...]}]
    if isinstance(data, list) and data and isinstance(data[0], dict) and "values" in data[0]:
        return [v["value"] for v in data[0]["values"] if v.get("value") is not None]
    # Scalar format: {"value": 0.5} or [{"value": 0.5}]
    if isinstance(data, dict) and "value" in data:
        return [data["value"]]
    if isinstance(data, list) and data and isinstance(data[0], dict) and "value" in data[0]:
        return [data[0]["value"]]
    return []


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
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=render: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "render")
                continue
            try:
                project_map = _get_project_map(user_id, "render")
                headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

                svcs_resp = await client.get(f"{RENDER_API}/services", headers=headers, params={"limit": 20})
                if _log_rate_limited("Render", user_id, svcs_resp):
                    continue
                if svcs_resp.status_code != 200:
                    continue

                rows = []
                for item in svcs_resp.json():
                    svc = item.get("service", item)
                    svc_id = svc.get("id", "")
                    svc_name = svc.get("name", "")
                    svc_type = svc.get("type", "web_service")
                    if not svc_id:
                        continue

                    # Limit endpoints accept the same params as usage — they return constant
                    # plan-allocation values repeated across the time range.
                    shared_params: dict = {"resource": svc_id, "startTime": start_time, "endTime": end_time, "resolutionSeconds": 60}

                    cpu_resp, mem_resp, cpu_lim_resp, mem_lim_resp = await asyncio.gather(
                        client.get(f"{RENDER_API}/metrics/cpu", headers=headers, params=shared_params),
                        client.get(f"{RENDER_API}/metrics/memory", headers=headers, params=shared_params),
                        client.get(f"{RENDER_API}/metrics/cpu-limit", headers=headers, params=shared_params),
                        client.get(f"{RENDER_API}/metrics/memory-limit", headers=headers, params=shared_params),
                        return_exceptions=True,
                    )

                    # Average of the last 3 samples to confirm sustained usage (not a spike)
                    cpu_vals = _parse_metric_series(cpu_resp)
                    mem_vals = _parse_metric_series(mem_resp)
                    cpu_lim_vals = _parse_metric_series(cpu_lim_resp)
                    mem_lim_vals = _parse_metric_series(mem_lim_resp)

                    cpu_avg = sum(cpu_vals[-3:]) / len(cpu_vals[-3:]) if cpu_vals else None
                    mem_avg = sum(mem_vals[-3:]) / len(mem_vals[-3:]) if mem_vals else None
                    cpu_limit = cpu_lim_vals[0] if cpu_lim_vals else _CPU_LIMIT_FALLBACK
                    mem_limit = mem_lim_vals[0] if mem_lim_vals else _MEM_LIMIT_FALLBACK

                    if cpu_avg is not None:
                        pct = cpu_avg / cpu_limit
                        if pct > 0.85:
                            rows.append({
                                "user_id": user_id,
                                "project_id": project_map.get(svc_id),
                                "service_type": "render",
                                "event_type": "runtime_error",
                                "title": f"High CPU on {svc_name}",
                                "subtitle": f"{round(pct * 100)}% of CPU limit sustained over 10 min",
                                "status": "error",
                                "external_url": _render_url(svc_id, svc_type, "metrics"),
                                "external_id": f"metric-cpu-{svc_id}",
                                "metadata": {
                                    "alert_type": "cpu",
                                    "cpu_pct": round(pct * 100),
                                    "cpu_mcpu": round(cpu_avg * 1000),
                                    "service_name": svc_name,
                                },
                                "occurred_at": end_time,
                            })

                    if mem_avg is not None:
                        pct = mem_avg / mem_limit
                        if pct > 0.85:
                            mem_mb = round(mem_avg / 1024 / 1024)
                            limit_mb = round(mem_limit / 1024 / 1024)
                            rows.append({
                                "user_id": user_id,
                                "project_id": project_map.get(svc_id),
                                "service_type": "render",
                                "event_type": "runtime_error",
                                "title": f"High memory on {svc_name}",
                                "subtitle": f"{mem_mb} MB / {limit_mb} MB ({round(pct * 100)}%) — approaching limit",
                                "status": "error",
                                "external_url": _render_url(svc_id, svc_type, "metrics"),
                                "external_id": f"metric-mem-{svc_id}",
                                "metadata": {
                                    "alert_type": "memory",
                                    "mem_pct": round(pct * 100),
                                    "mem_mb": mem_mb,
                                    "limit_mb": limit_mb,
                                    "service_name": svc_name,
                                },
                                "occurred_at": end_time,
                            })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render metrics poll failed user=%s: %s", user_id, exc)


# ── Render log scanning ────────────────────────────────────────────────────

_ERROR_PATTERNS = ["error", "exception", "traceback", "fatal", "panic", "crash", "unhandled rejection", "segfault"]
_NOISE_PATTERNS = [
    "health check", "healthcheck", "GET /health", "200 ok",
    "http request:", "httpx -",
    "api.render.com", "api.vercel.com", "api.github.com", "api.supabase.com",
    "log scan failed", "poll failed", "metrics poll failed",
    "apscheduler", "uvicorn", "info:     ",
    " vantage - ",  # Vantage's own Python logger format: "LEVEL vantage - message"
]


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
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=render: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "render")
                continue
            try:
                project_map = _get_project_map(user_id, "render")
                headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

                svcs_resp = await client.get(f"{RENDER_API}/services", headers=headers, params={"limit": 20})
                if _log_rate_limited("Render", user_id, svcs_resp):
                    continue
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
                    svc_type = svc.get("type", "web_service")
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
                        "external_url": _render_url(svc_id, svc_type, "logs"),
                        "external_id": error_id,
                        "metadata": {"errors": error_lines[:10], "service_id": svc_id, "service_name": svc_name},
                        "occurred_at": end_time,
                    })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render log scan failed user=%s: %s", user_id, exc)


# ── Render service health ──────────────────────────────────────────────────

async def check_render_service_health() -> None:
    users = _get_connected_users("render")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=render: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "render")
                continue
            try:
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
                    svc_type = svc.get("type", "web_service")
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
                        "external_url": _render_url(svc_id, svc_type),
                        "external_id": f"suspended-{svc_id}",
                        "metadata": {"service_id": svc_id, "service_name": svc_name},
                        "occurred_at": _now_iso(),
                    })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Render health check failed user=%s: %s", user_id, exc)


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
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=vercel: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "vercel")
                continue
            try:
                project_map = _get_project_map(user_id, "vercel")
                headers = {"Authorization": f"Bearer {token}"}

                resp = await client.get(f"{VERCEL_API}/v9/projects", headers=headers)
                if resp.status_code != 200:
                    continue
                for p in resp.json().get("projects", []):
                    deps = p.get("latestDeployments", [])
                    # Only ping production deployments — previews can legitimately be slow or down
                    prod_dep = next((d for d in deps if d.get("target") == "production"), None)
                    if not prod_dep or not prod_dep.get("url"):
                        continue
                    url = f"https://{prod_dep['url']}"
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
                logger.error("Endpoint collect vercel failed user=%s: %s", user_id, exc)

        for user in users_render:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=render: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "render")
                continue
            try:
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
                logger.error("Endpoint collect render failed user=%s: %s", user_id, exc)

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


def cleanup_events() -> None:
    """Delete events rows older than 30 days."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    try:
        supabase.table("events").delete().lt("created_at", cutoff).execute()
    except Exception as exc:
        logger.error("Events cleanup failed: %s", exc)


# ── Vercel token health ────────────────────────────────────────────────────

async def check_vercel_service_health() -> None:
    """Validate all connected Vercel tokens and mark expired/revoked ones unhealthy."""
    users = _get_connected_users("vercel")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=vercel: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "vercel")
                continue
            try:
                resp = await client.get(
                    f"{VERCEL_API}/v2/user",
                    headers={"Authorization": f"Bearer {token}"},
                )
                if resp.status_code in (401, 403):
                    logger.warning("Vercel token invalid/expired user=%s status=%d", user_id, resp.status_code)
                    _mark_service_unhealthy(user_id, "vercel")
                elif resp.status_code == 200:
                    try:
                        supabase.table("connected_services") \
                            .update({"health_status": "healthy"}) \
                            .eq("user_id", user_id) \
                            .eq("service_type", "vercel") \
                            .execute()
                    except Exception:
                        pass
            except Exception as exc:
                logger.error("Vercel health check failed user=%s: %s", user_id, exc)


# ── Supabase ───────────────────────────────────────────────────────────────

SUPABASE_API = "https://api.supabase.com/v1"

_SUPABASE_LOG_SQL = (
    "select datetime(timestamp), event_message,"
    " m.parsed.error_severity, m.parsed.sql_state_code, m.parsed.user_name"
    " from postgres_logs"
    " cross join unnest(metadata) as m"
    " where m.parsed.error_severity in ('ERROR', 'FATAL')"
    " and timestamp > timestamp_sub(current_timestamp(), interval 1 hour)"
    " order by timestamp desc limit 50"
)

_METRIC_ALLOWLIST = {
    "pg_stat_database_numbackends", "pg_settings_max_connections",
    "pg_database_size_bytes", "node_filesystem_avail_bytes",
    "node_filesystem_size_bytes", "node_memory_MemAvailable_bytes",
    "node_memory_MemTotal_bytes", "supabase_active_connections",
}
_METRIC_SUM = {"pg_stat_database_numbackends", "supabase_active_connections"}


def _parse_prometheus(text: str) -> dict[str, float]:
    result: dict[str, list[float]] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.rsplit(" ", 1)
        if len(parts) != 2:
            continue
        name = parts[0].split("{")[0]
        if name not in _METRIC_ALLOWLIST:
            continue
        try:
            result.setdefault(name, []).append(float(parts[1]))
        except ValueError:
            continue
    return {k: (sum(v) if k in _METRIC_SUM else v[0]) for k, v in result.items()}


async def poll_supabase() -> None:
    """Poll Supabase project health and write service_health events."""
    users = _get_connected_users("supabase")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=15.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=supabase: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "supabase")
                continue
            try:
                project_map = _get_project_map(user_id, "supabase")
                if not project_map:
                    continue
                headers = {"Authorization": f"Bearer {token}"}

                rows = []
                for ref, project_id in project_map.items():
                    resp = await client.get(
                        f"{SUPABASE_API}/projects/{ref}/health",
                        headers=headers,
                        params=[
                            ("services", "auth"), ("services", "db"),
                            ("services", "realtime"), ("services", "rest"),
                            ("services", "storage"), ("services", "pooler"),
                        ],
                    )
                    if _log_rate_limited("Supabase", user_id, resp):
                        break
                    if resp.status_code != 200:
                        continue

                    unhealthy = [s for s in resp.json() if s.get("status") != "ACTIVE_HEALTHY"]
                    if not unhealthy:
                        continue

                    for svc in unhealthy:
                        name = svc.get("name", "unknown")
                        status = svc.get("status", "unknown")
                        rows.append({
                            "user_id": user_id,
                            "project_id": project_id,
                            "service_type": "supabase",
                            "event_type": "service_health",
                            "title": f"{name} is {status}",
                            "subtitle": f"Supabase service degraded: {name}",
                            "status": "error",
                            "external_url": f"https://supabase.com/dashboard/project/{ref}",
                            "external_id": f"health-{ref}-{name}",
                            "metadata": {"service": name, "status": status, "ref": ref},
                            "occurred_at": _now_iso(),
                        })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Supabase poll failed user=%s: %s", user_id, exc)


async def scan_supabase_logs() -> None:
    """Scan postgres_logs for ERROR/FATAL entries and write runtime_error events."""
    users = _get_connected_users("supabase")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=20.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=supabase: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "supabase")
                continue
            try:
                project_map = _get_project_map(user_id, "supabase")
                if not project_map:
                    continue
                headers = {"Authorization": f"Bearer {token}"}

                rows = []
                for ref, project_id in project_map.items():
                    resp = await client.get(
                        f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/logs.all",
                        headers=headers,
                        params={"sql": _SUPABASE_LOG_SQL},
                    )
                    if _log_rate_limited("Supabase", user_id, resp):
                        break
                    if resp.status_code != 200:
                        continue

                    raw = resp.json()
                    log_rows = raw.get("result", raw.get("data", []))
                    if not log_rows:
                        continue

                    errors = []
                    for row in (log_rows if isinstance(log_rows, list) else []):
                        msg = str(row.get("event_message", "")).strip()
                        severity = row.get("error_severity", "ERROR")
                        if msg:
                            errors.append(f"[{severity}] {msg[:200]}")

                    if not errors:
                        continue

                    first = errors[0]
                    error_id = hashlib.md5(f"supabase:{ref}:{first[:100]}".encode()).hexdigest()
                    rows.append({
                        "user_id": user_id,
                        "project_id": project_id,
                        "service_type": "supabase",
                        "event_type": "runtime_error",
                        "title": f"Database error in {ref}",
                        "subtitle": first[:120],
                        "status": "error",
                        "external_url": f"https://supabase.com/dashboard/project/{ref}/logs/postgres-logs",
                        "external_id": error_id,
                        "metadata": {"errors": errors[:10], "ref": ref},
                        "occurred_at": _now_iso(),
                    })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Supabase log scan failed user=%s: %s", user_id, exc)


async def check_supabase_metrics() -> None:
    """Scrape Prometheus metrics and alert on connection saturation or disk pressure."""
    users = _get_connected_users("supabase")
    if not users:
        return

    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=8.0, read=20.0, write=8.0, pool=8.0)) as client:
        for user in users:
            user_id = user["user_id"]
            try:
                token = decrypt_token(user["api_token"])
            except Exception as exc:
                logger.warning("Token decryption failed user=%s service=supabase: %s", user_id, exc)
                _mark_service_unhealthy(user_id, "supabase")
                continue
            try:
                project_map = _get_project_map(user_id, "supabase")
                if not project_map:
                    continue
                headers = {"Authorization": f"Bearer {token}"}

                rows = []
                for ref, project_id in project_map.items():
                    # Exchange access token for service role key
                    keys_resp = await client.get(
                        f"{SUPABASE_API}/projects/{ref}/api-keys",
                        headers=headers,
                        params={"reveal": "true"},
                    )
                    if keys_resp.status_code != 200:
                        continue
                    svc_key = next(
                        (k.get("api_key") or k.get("token", "") for k in keys_resp.json() if k.get("name") == "service_role"),
                        None,
                    )
                    if not svc_key:
                        continue

                    metrics_resp = await client.get(
                        f"https://{ref}.supabase.co/customer/v1/privileged/metrics",
                        auth=("service_role", svc_key),
                    )
                    if metrics_resp.status_code != 200:
                        continue

                    m = _parse_prometheus(metrics_resp.text)
                    connections = m.get("pg_stat_database_numbackends") or m.get("supabase_active_connections")
                    max_conn = m.get("pg_settings_max_connections")
                    fs_avail = m.get("node_filesystem_avail_bytes")
                    fs_total = m.get("node_filesystem_size_bytes")

                    if connections and max_conn and max_conn > 0:
                        pct = connections / max_conn
                        if pct > 0.80:
                            rows.append({
                                "user_id": user_id,
                                "project_id": project_id,
                                "service_type": "supabase",
                                "event_type": "runtime_error",
                                "title": f"High connection usage on {ref}",
                                "subtitle": f"{int(connections)} / {int(max_conn)} connections ({round(pct * 100)}%)",
                                "status": "error",
                                "external_url": f"https://supabase.com/dashboard/project/{ref}/reports/database",
                                "external_id": f"metric-conn-{ref}",
                                "metadata": {
                                    "alert_type": "connections",
                                    "conn_pct": round(pct * 100),
                                    "connections": int(connections),
                                    "max_connections": int(max_conn),
                                    "ref": ref,
                                },
                                "occurred_at": _now_iso(),
                            })

                    if fs_avail and fs_total and fs_total > 0:
                        used_pct = (fs_total - fs_avail) / fs_total
                        if used_pct > 0.80:
                            used_gb = round((fs_total - fs_avail) / 1e9, 1)
                            total_gb = round(fs_total / 1e9, 1)
                            rows.append({
                                "user_id": user_id,
                                "project_id": project_id,
                                "service_type": "supabase",
                                "event_type": "runtime_error",
                                "title": f"High disk usage on {ref}",
                                "subtitle": f"{used_gb} GB / {total_gb} GB used ({round(used_pct * 100)}%)",
                                "status": "error",
                                "external_url": f"https://supabase.com/dashboard/project/{ref}/reports/database",
                                "external_id": f"metric-disk-{ref}",
                                "metadata": {
                                    "alert_type": "disk",
                                    "disk_pct": round(used_pct * 100),
                                    "used_gb": used_gb,
                                    "total_gb": total_gb,
                                    "ref": ref,
                                },
                                "occurred_at": _now_iso(),
                            })

                _upsert_events(rows)

            except Exception as exc:
                logger.error("Supabase metrics check failed user=%s: %s", user_id, exc)


# ── Scheduler setup ────────────────────────────────────────────────────────

def start_scheduler() -> None:
    scheduler.add_job(poll_vercel, "interval", minutes=2, id="poll_vercel", max_instances=1, jitter=30)
    scheduler.add_job(poll_render, "interval", minutes=2, id="poll_render", max_instances=1, jitter=30)
    scheduler.add_job(poll_github, "interval", minutes=5, id="poll_github", max_instances=1, jitter=45)
    scheduler.add_job(poll_render_metrics, "interval", minutes=10, id="render_metrics", max_instances=1, jitter=60)
    scheduler.add_job(scan_render_logs, "interval", minutes=2, id="scan_render_logs", max_instances=1, jitter=30)
    scheduler.add_job(scan_vercel_logs, "interval", minutes=2, id="scan_vercel_logs", max_instances=1, jitter=30)
    scheduler.add_job(check_render_service_health, "interval", minutes=10, id="render_health", max_instances=1, jitter=60)
    scheduler.add_job(check_vercel_service_health, "interval", minutes=10, id="vercel_health", max_instances=1, jitter=60)
    scheduler.add_job(poll_supabase, "interval", minutes=5, id="poll_supabase", max_instances=1, jitter=45)
    scheduler.add_job(scan_supabase_logs, "interval", minutes=5, id="scan_supabase_logs", max_instances=1, jitter=45)
    scheduler.add_job(check_supabase_metrics, "interval", minutes=10, id="supabase_metrics", max_instances=1, jitter=60)
    scheduler.add_job(check_endpoints, "interval", minutes=10, id="check_endpoints", max_instances=1, jitter=60)
    scheduler.add_job(cleanup_uptime_checks, "interval", hours=6, id="cleanup_uptime", max_instances=1)
    scheduler.add_job(cleanup_events, "interval", hours=6, id="cleanup_events", max_instances=1)
    scheduler.add_job(_cache_evict, "interval", minutes=10, id="cache_evict", max_instances=1)
    scheduler.start()
    logger.info("Scheduler started")


def stop_scheduler() -> None:
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")
