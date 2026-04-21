import asyncio
import re
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.encryption import encrypt_token, decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase
from app.core import token_cache

SUPABASE_API = "https://api.supabase.com/v1"

# Allowlist for log sources — never interpolate client input into SQL
_TRAFFIC_SQL = (
    "select"
    "  case"
    "    when r.path like '/auth/%' then 'auth'"
    "    when r.path like '/rest/%' then 'database'"
    "    when r.path like '/storage/%' then 'storage'"
    "    when r.path like '/functions/%' then 'functions'"
    "    when r.path like '/realtime/%' then 'realtime'"
    "    else 'other'"
    "  end as service,"
    "  count(*) as total,"
    "  countif(resp.status_code >= 400) as errors"
    " from edge_logs"
    " cross join unnest(metadata) as m"
    " cross join unnest(m.request) as r"
    " cross join unnest(m.response) as resp"
    " where timestamp > timestamp_sub(current_timestamp(), interval 24 hour)"
    " group by 1"
    " order by total desc"
    " limit 10"
)

_TRAFFIC_DAILY_SQL = (
    "select"
    "  case"
    "    when r.path like '/auth/%' then 'auth'"
    "    when r.path like '/rest/%' then 'database'"
    "    when r.path like '/storage/%' then 'storage'"
    "    when r.path like '/functions/%' then 'functions'"
    "    when r.path like '/realtime/%' then 'realtime'"
    "    else 'other'"
    "  end as service,"
    "  format_timestamp('%Y-%m-%d', timestamp) as day,"
    "  count(*) as total,"
    "  countif(resp.status_code >= 400) as errors"
    " from edge_logs"
    " cross join unnest(metadata) as m"
    " cross join unnest(m.request) as r"
    " cross join unnest(m.response) as resp"
    " where timestamp > timestamp_sub(current_timestamp(), interval 7 day)"
    " group by 1, 2"
    " order by service, day"
)

_LOG_SOURCES = {
    "postgres": (
        "select datetime(timestamp), event_message,"
        " m.parsed.error_severity, m.parsed.sql_state_code, m.parsed.user_name"
        " from postgres_logs"
        " cross join unnest(metadata) as m"
        " where m.parsed.error_severity in ('ERROR', 'FATAL', 'WARNING')"
        " and timestamp > timestamp_sub(current_timestamp(), interval 24 hour)"
        " order by timestamp desc limit 50"
    ),
    "edge": (
        "select datetime(timestamp), r.method, r.path, resp.status_code"
        " from edge_logs"
        " cross join unnest(metadata) as m"
        " cross join unnest(m.request) as r"
        " cross join unnest(m.response) as resp"
        " where resp.status_code >= 500"
        " and timestamp > timestamp_sub(current_timestamp(), interval 1 hour)"
        " order by timestamp desc limit 50"
    ),
    "auth": (
        "select datetime(timestamp), event_message, m.level, m.msg, m.path, m.status"
        " from auth_logs"
        " cross join unnest(metadata) as m"
        " where m.level in ('error', 'warning')"
        " and timestamp > timestamp_sub(current_timestamp(), interval 24 hour)"
        " order by timestamp desc limit 50"
    ),
    "functions": (
        "select datetime(timestamp), event_message, m.level, m.function_id"
        " from function_logs"
        " cross join unnest(metadata) as m"
        " where m.level in ('error', 'warning')"
        " and timestamp > timestamp_sub(current_timestamp(), interval 24 hour)"
        " order by timestamp desc limit 50"
    ),
}

# Prometheus metric names we care about — ignore everything else
_METRIC_ALLOWLIST = {
    "pg_stat_database_numbackends",
    "pg_settings_max_connections",
    "pg_database_size_bytes",
    "node_filesystem_avail_bytes",
    "node_filesystem_size_bytes",
    "node_cpu_seconds_total",
    "node_memory_MemAvailable_bytes",
    "node_memory_MemTotal_bytes",
    "pg_stat_bgwriter_buffers_alloc_total",
    "pg_stat_database_xact_commit",
    "pg_stat_database_xact_rollback",
    "pg_stat_database_blks_hit",
    "pg_stat_database_blks_read",
    "pg_stat_database_deadlocks",
    "pg_stat_database_temp_bytes",
    "pg_stat_database_tup_returned",
    "pg_stat_database_tup_fetched",
    "pg_stat_database_tup_inserted",
    "pg_stat_database_tup_updated",
    "pg_stat_database_tup_deleted",
    "pg_stat_database_conflicts",
    "supabase_active_connections",
    "pg_stat_activity_count",
}

# Strict alphanumeric + hyphen ref validation — prevents SSRF via crafted ref
_REF_RE = re.compile(r"^[a-z0-9][a-z0-9\-]{4,30}$")

router = APIRouter(prefix="/api/supabase", tags=["supabase"])


def _validate_ref(ref: str) -> None:
    if not _REF_RE.match(ref):
        raise HTTPException(status_code=400, detail="Invalid project ref")


def _get_token(user_id: str) -> str:
    cached = token_cache.get(user_id, "supabase")
    if cached:
        return cached
    result = (
        supabase.table("connected_services")
        .select("api_token")
        .eq("user_id", user_id)
        .eq("service_type", "supabase")
        .single()
        .execute()
    )
    if not result.data or not result.data.get("api_token"):
        raise HTTPException(status_code=404, detail="Supabase not connected")
    token = decrypt_token(result.data["api_token"])
    token_cache.set(user_id, "supabase", token)
    return token


def _assert_owns_supabase_project(user_id: str, ref: str) -> None:
    """Raise 403 if ref is not linked to a project owned by this user."""
    projects = supabase.table("projects").select("id").eq("user_id", user_id).execute()
    project_ids = [p["id"] for p in (projects.data or [])]
    if not project_ids:
        raise HTTPException(status_code=403, detail="Access denied")
    result = (
        supabase.table("project_services")
        .select("id")
        .eq("resource_id", ref)
        .eq("service_type", "supabase")
        .in_("project_id", project_ids)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="Access denied")


async def _get_service_role_key(ref: str, token: str, client: httpx.AsyncClient) -> str:
    """Exchange the management access token for this project's service role key.

    The key is used exclusively server-side for the Prometheus metrics endpoint.
    It is never stored in the database and never returned to the client.
    """
    cache_key = f"svckey:{ref}"
    cached = token_cache.get("__supabase_svckeys__", cache_key)
    if cached:
        return cached

    resp = await client.get(
        f"{SUPABASE_API}/projects/{ref}/api-keys",
        headers={"Authorization": f"Bearer {token}"},
        params={"reveal": "true"},
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to retrieve project credentials")

    for key in resp.json():
        if key.get("name") == "service_role":
            value = key.get("api_key") or key.get("token", "")
            if value:
                token_cache.set("__supabase_svckeys__", cache_key, value)
                return value

    raise HTTPException(status_code=502, detail="Service role key not found for project")


def _parse_prometheus(text: str) -> dict[str, float]:
    """Parse Prometheus text format and return only allowlisted metric names.

    Sums multiple label variants (e.g. multiple databases) into a single value
    for metrics where aggregation is the right behaviour, and keeps the first
    value for settings/limits (max_connections, filesystem size).
    """
    result: dict[str, list[float]] = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        # Split off the value (and optional timestamp) from the metric + labels
        parts = line.rsplit(" ", 1)
        if len(parts) != 2:
            continue
        metric_part, value_str = parts[0], parts[1]
        metric_name = metric_part.split("{")[0]
        if metric_name not in _METRIC_ALLOWLIST:
            continue
        try:
            value = float(value_str)
        except ValueError:
            continue
        result.setdefault(metric_name, []).append(value)

    # Aggregate: sum connections/activity/cache/tx, keep first for settings/sizes,
    # use max for per-database size (picks the largest/user DB over small templates)
    _sum_metrics = {
        "pg_stat_database_numbackends", "pg_stat_database_xact_commit",
        "pg_stat_database_xact_rollback", "pg_stat_bgwriter_buffers_alloc_total",
        "pg_stat_database_blks_hit", "pg_stat_database_blks_read",
        "pg_stat_database_deadlocks", "pg_stat_database_temp_bytes",
        "pg_stat_database_tup_returned", "pg_stat_database_tup_fetched",
        "pg_stat_database_tup_inserted", "pg_stat_database_tup_updated",
        "pg_stat_database_tup_deleted", "pg_stat_database_conflicts",
        "supabase_active_connections", "pg_stat_activity_count",
    }
    _max_metrics = {"pg_database_size_bytes"}
    out: dict[str, float] = {}
    for name, values in result.items():
        if name in _sum_metrics:
            out[name] = sum(values)
        elif name in _max_metrics:
            out[name] = max(values)
        else:
            out[name] = values[0]
    return out


class ConnectRequest(BaseModel):
    token: str


@router.post("/connect")
async def connect_supabase(body: ConnectRequest, user_id: str = Depends(get_user_id)):
    async with httpx.AsyncClient(timeout=15.0) as client:
        orgs_resp = await client.get(
            f"{SUPABASE_API}/organizations",
            headers={"Authorization": f"Bearer {body.token}"},
        )

    if orgs_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Invalid token — could not authenticate with Supabase")

    orgs = orgs_resp.json()
    org = orgs[0] if orgs else {}
    org_id = org.get("id", "default")
    org_name = org.get("name", "Supabase")

    supabase.table("connected_services").upsert(
        {
            "user_id": user_id,
            "service_type": "supabase",
            "service_id": org_id,
            "service_name": org_name,
            "api_token": encrypt_token(body.token),
            "is_active": True,
            "health_status": "healthy",
        },
        on_conflict="user_id,service_type,service_id",
    ).execute()
    token_cache.invalidate(user_id, "supabase")

    return {"status": "connected", "name": org_name}


@router.delete("/disconnect")
async def disconnect_supabase(user_id: str = Depends(get_user_id)):
    supabase.table("connected_services") \
        .delete() \
        .eq("user_id", user_id) \
        .eq("service_type", "supabase") \
        .execute()
    token_cache.invalidate(user_id, "supabase")
    return {"status": "disconnected"}


@router.get("/projects")
async def get_projects(user_id: str = Depends(get_user_id)):
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch projects from Supabase")

    return {
        "projects": [
            {
                "id": p["id"],
                "ref": p["ref"],
                "name": p["name"],
                "region": p.get("region", ""),
                "status": p.get("status", ""),
                "created_at": p.get("created_at"),
            }
            for p in resp.json()
        ]
    }


@router.get("/projects/{ref}/traffic")
async def get_project_traffic(ref: str, user_id: str = Depends(get_user_id)):
    """Return per-service request and error counts for the last 24 hours."""
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/logs.all",
            headers={"Authorization": f"Bearer {token}"},
            params={"sql": _TRAFFIC_SQL},
        )

    if resp.status_code != 200:
        return {"breakdown": [], "available": False}

    raw = resp.json()
    rows = raw.get("result", raw.get("data", []))
    return {
        "available": True,
        "breakdown": [
            {
                "service": row.get("service", "other"),
                "total": int(row.get("total", 0)),
                "errors": int(row.get("errors", 0)),
            }
            for row in (rows if isinstance(rows, list) else [])
            if row.get("service") != "other"
        ],
    }


@router.get("/projects/{ref}/traffic/daily")
async def get_project_traffic_daily(ref: str, user_id: str = Depends(get_user_id)):
    """Return per-service daily request counts for the last 7 days."""
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/logs.all",
            headers={"Authorization": f"Bearer {token}"},
            params={"sql": _TRAFFIC_DAILY_SQL},
        )

    if resp.status_code != 200:
        return {"available": False, "services": {}}

    raw = resp.json()
    rows = raw.get("result", raw.get("data", []))

    # Build { service: [{ day, total, errors }, ...] }
    services: dict[str, list[dict]] = {}
    for row in (rows if isinstance(rows, list) else []):
        svc = row.get("service", "other")
        if svc == "other":
            continue
        services.setdefault(svc, []).append({
            "day": row.get("day", ""),
            "total": int(row.get("total", 0)),
            "errors": int(row.get("errors", 0)),
        })

    return {"available": True, "services": services}


@router.get("/projects/{ref}/config")
async def get_project_config(ref: str, user_id: str = Depends(get_user_id)):
    """Return project details and auth provider configuration."""
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    async with httpx.AsyncClient(timeout=15.0) as client:
        project_resp, auth_resp = await asyncio.gather(
            client.get(f"{SUPABASE_API}/projects/{ref}", headers=headers),
            client.get(f"{SUPABASE_API}/projects/{ref}/config/auth", headers=headers),
            return_exceptions=True,
        )

    project: dict = {}
    if not isinstance(project_resp, Exception) and project_resp.status_code == 200:
        p = project_resp.json()
        project = {
            "name": p.get("name"),
            "region": p.get("region"),
            "db_host": p.get("db_host"),
            "status": p.get("status"),
            "created_at": p.get("created_at"),
        }

    auth: dict = {}
    if not isinstance(auth_resp, Exception) and auth_resp.status_code == 200:
        a = auth_resp.json()
        _provider_keys = [
            "email", "phone", "google", "github", "gitlab", "discord",
            "apple", "twitter", "facebook", "slack", "spotify", "twitch",
            "azure", "bitbucket", "notion", "zoom", "keycloak",
        ]
        auth = {
            "site_url": a.get("site_url"),
            "providers": [p for p in _provider_keys if a.get(f"external_{p}_enabled")],
            "anonymous_sign_ins": a.get("anonymous_sign_ins_enabled", False),
            "mfa_enabled": bool(a.get("mfa_totp_enroll_enabled") or a.get("mfa_phone_enroll_enabled")),
            "min_password_length": a.get("password_min_length"),
        }

    return {"project": project, "auth": auth}


@router.get("/projects/{ref}/health")
async def get_project_health(ref: str, user_id: str = Depends(get_user_id)):
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{ref}/health",
            headers={"Authorization": f"Bearer {token}"},
            params=[
                ("services", "auth"),
                ("services", "db"),
                ("services", "realtime"),
                ("services", "rest"),
                ("services", "storage"),
                ("services", "pooler"),
            ],
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch project health from Supabase")

    return {"services": resp.json()}


@router.get("/projects/{ref}/overview")
async def get_project_overview(ref: str, user_id: str = Depends(get_user_id)):
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}
    now = datetime.now(timezone.utc)
    day_ago = (now - timedelta(hours=24)).isoformat()

    async with httpx.AsyncClient(timeout=30.0) as client:
        stats_resp, logs_resp, actions_resp = await asyncio.gather(
            client.get(
                f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/usage.api-counts",
                headers=headers,
                params={"interval": "1day"},
            ),
            client.get(
                f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/logs.all",
                headers=headers,
                params={
                    "sql": _LOG_SOURCES["edge"],
                    "iso_timestamp_start": day_ago,
                },
            ),
            client.get(
                f"{SUPABASE_API}/projects/{ref}/actions",
                headers=headers,
                params={"limit": 20},
            ),
        )

    api_stats = []
    if stats_resp.status_code == 200:
        raw = stats_resp.json()
        data = raw.get("data", raw) if isinstance(raw, dict) else raw
        for point in (data if isinstance(data, list) else []):
            api_stats.append({"timestamp": point.get("timestamp", ""), "count": int(point.get("count", 0))})

    error_logs = []
    if logs_resp.status_code == 200:
        raw = logs_resp.json()
        rows = raw.get("result", raw.get("data", []))
        for row in (rows if isinstance(rows, list) else [])[:25]:
            error_logs.append({
                "timestamp": row.get("f0_", row.get("timestamp", "")),
                "method": row.get("method", ""),
                "path": row.get("path", ""),
                "status": row.get("status_code"),
            })

    actions = []
    if actions_resp.status_code == 200:
        for run in actions_resp.json().get("runs", []):
            actions.append({
                "id": run.get("id", ""),
                "status": run.get("status", ""),
                "created_at": run.get("created_at", ""),
                "updated_at": run.get("updated_at", ""),
                "error_message": run.get("error_message"),
            })

    return {
        "api_stats": api_stats,
        "error_logs": error_logs,
        "actions": actions,
        "available": {
            "api_stats": stats_resp.status_code == 200,
            "logs": logs_resp.status_code == 200,
            "actions": actions_resp.status_code == 200,
        },
    }


@router.get("/projects/{ref}/metrics")
async def get_project_metrics(ref: str, user_id: str = Depends(get_user_id)):
    """Scrape the Prometheus metrics endpoint and return key health series."""
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)

    # Known DB size limits by Supabase plan tier (bytes)
    _PLAN_DB_LIMITS: dict[str, int] = {
        "tier_free": 500 * 1024 * 1024,          # 500 MB
        "free": 500 * 1024 * 1024,
        "tier_pro": 8 * 1024 * 1024 * 1024,      # 8 GB
        "pro": 8 * 1024 * 1024 * 1024,
        "tier_team": 8 * 1024 * 1024 * 1024,
        "team": 8 * 1024 * 1024 * 1024,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        svc_key = await _get_service_role_key(ref, token, client)
        prom_resp, usage_resp, project_resp = await asyncio.gather(
            client.get(
                f"https://{ref}.supabase.co/customer/v1/privileged/metrics",
                auth=("service_role", svc_key),
            ),
            client.get(
                f"{SUPABASE_API}/projects/{ref}/usage",
                headers={"Authorization": f"Bearer {token}"},
            ),
            client.get(
                f"{SUPABASE_API}/projects/{ref}",
                headers={"Authorization": f"Bearer {token}"},
            ),
            return_exceptions=True,
        )

    if isinstance(prom_resp, Exception) or prom_resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch metrics from Supabase")

    raw = _parse_prometheus(prom_resp.text)

    # Extract DB size and limit from usage API.
    # Supabase uses different metric names across plan tiers; try all known variants.
    db_size_from_usage: int | None = None
    db_size_limit: int | None = None
    if not isinstance(usage_resp, Exception) and usage_resp.status_code == 200:
        _DB_METRICS = {"db_size", "database_size", "disk_volume_size_gb", "db_egress"}
        for item in usage_resp.json().get("usages", []):
            metric = item.get("metric", "")
            if metric not in _DB_METRICS:
                continue
            raw_usage = item.get("usage")
            raw_limit = item.get("limit")
            # disk_volume_size_gb is in GB, convert to bytes
            multiplier = int(1e9) if "gb" in metric else 1
            if raw_usage not in (None, 0):
                db_size_from_usage = int(float(raw_usage) * multiplier)
            if raw_limit not in (None, 0):
                db_size_limit = int(float(raw_limit) * multiplier)
            break

    # Fall back to plan-tier limit if usage API didn't return one
    db_limit_from_api = db_size_limit is not None
    if db_size_limit is None and not isinstance(project_resp, Exception) and project_resp.status_code == 200:
        sub_id = project_resp.json().get("subscription_id", "")
        db_size_limit = _PLAN_DB_LIMITS.get(sub_id.lower())

    connections = raw.get("pg_stat_database_numbackends") or raw.get("supabase_active_connections") or raw.get("pg_stat_activity_count")
    max_conn = raw.get("pg_settings_max_connections")
    db_size = raw.get("pg_database_size_bytes")
    fs_avail = raw.get("node_filesystem_avail_bytes")
    fs_total = raw.get("node_filesystem_size_bytes")
    mem_avail = raw.get("node_memory_MemAvailable_bytes")
    mem_total = raw.get("node_memory_MemTotal_bytes")
    blks_hit = raw.get("pg_stat_database_blks_hit")
    blks_read = raw.get("pg_stat_database_blks_read")
    xact_commit = raw.get("pg_stat_database_xact_commit")
    xact_rollback = raw.get("pg_stat_database_xact_rollback")
    deadlocks = raw.get("pg_stat_database_deadlocks")
    temp_bytes = raw.get("pg_stat_database_temp_bytes")
    tup_returned = raw.get("pg_stat_database_tup_returned")
    tup_fetched = raw.get("pg_stat_database_tup_fetched")
    tup_inserted = raw.get("pg_stat_database_tup_inserted")
    tup_updated = raw.get("pg_stat_database_tup_updated")
    tup_deleted = raw.get("pg_stat_database_tup_deleted")
    conflicts = raw.get("pg_stat_database_conflicts")

    total_blks = (blks_hit or 0) + (blks_read or 0)
    cache_hit_pct = round((blks_hit / total_blks) * 100) if blks_hit and total_blks > 0 else None

    total_tx = (xact_commit or 0) + (xact_rollback or 0)
    rollback_pct = round((xact_rollback / total_tx) * 100) if xact_rollback and total_tx > 0 else None

    # node_cpu_seconds_total sums all modes; idle fraction ≈ idle / total
    # We can't derive a reliable % from a counter without two scrapes, so omit CPU.

    return {
        "connections": {
            "active": int(connections) if connections is not None else None,
            "max": int(max_conn) if max_conn is not None else None,
            "pct": round((connections / max_conn) * 100) if connections and max_conn else None,
        },
        "database": {
            "size_bytes": db_size_from_usage or (int(db_size) if db_size is not None else None),
            "limit_bytes": db_size_limit,
            "used_pct": round(((db_size_from_usage or db_size or 0) / db_size_limit) * 100) if (db_size_from_usage or db_size) and db_size_limit else None,
            "limit_is_plan_default": db_size_limit is not None and not db_limit_from_api,
        },
        "disk": {
            "avail_bytes": int(fs_avail) if fs_avail is not None else None,
            "total_bytes": int(fs_total) if fs_total is not None else None,
            "used_pct": round(((fs_total - fs_avail) / fs_total) * 100) if fs_total and fs_avail else None,
        },
        "memory": {
            "avail_bytes": int(mem_avail) if mem_avail is not None else None,
            "total_bytes": int(mem_total) if mem_total is not None else None,
            "used_pct": round(((mem_total - mem_avail) / mem_total) * 100) if mem_total and mem_avail else None,
        },
        "cache": {
            "hit_pct": cache_hit_pct,
            "blks_hit": int(blks_hit) if blks_hit is not None else None,
            "blks_read": int(blks_read) if blks_read is not None else None,
        },
        "transactions": {
            "commit": int(xact_commit) if xact_commit is not None else None,
            "rollback": int(xact_rollback) if xact_rollback is not None else None,
            "rollback_pct": rollback_pct,
        },
        "deadlocks": int(deadlocks) if deadlocks is not None else None,
        "temp_bytes": int(temp_bytes) if temp_bytes is not None else None,
        "rows": {
            "inserted": int(tup_inserted) if tup_inserted is not None else None,
            "updated": int(tup_updated) if tup_updated is not None else None,
            "deleted": int(tup_deleted) if tup_deleted is not None else None,
            "returned": int(tup_returned) if tup_returned is not None else None,
            "fetched": int(tup_fetched) if tup_fetched is not None else None,
            "conflicts": int(conflicts) if conflicts is not None else None,
        },
    }


@router.get("/projects/{ref}/logs/{source}")
async def get_project_logs(ref: str, source: str, user_id: str = Depends(get_user_id)):
    """Query a specific Supabase log source for recent errors."""
    _validate_ref(ref)
    if source not in _LOG_SOURCES:
        raise HTTPException(status_code=400, detail=f"Invalid log source. Must be one of: {', '.join(_LOG_SOURCES)}")
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{ref}/analytics/endpoints/logs.all",
            headers={"Authorization": f"Bearer {token}"},
            params={"sql": _LOG_SOURCES[source]},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch logs from Supabase")

    raw = resp.json()
    rows = raw.get("result", raw.get("data", []))
    return {"source": source, "rows": rows if isinstance(rows, list) else []}


@router.get("/projects/{ref}/storage")
async def get_project_storage(ref: str, user_id: str = Depends(get_user_id)):
    """List Storage buckets for this project."""
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=15.0) as client:
        svc_key = await _get_service_role_key(ref, token, client)
        resp = await client.get(
            f"https://{ref}.supabase.co/storage/v1/bucket",
            headers={"Authorization": f"Bearer {svc_key}", "apikey": svc_key},
        )

    if resp.status_code != 200:
        return {"buckets": [], "available": False}

    return {
        "available": True,
        "buckets": [
            {
                "id": b.get("id"),
                "name": b.get("name"),
                "public": b.get("public", False),
                "file_size_limit": b.get("file_size_limit"),
                "created_at": b.get("created_at"),
                "updated_at": b.get("updated_at"),
            }
            for b in resp.json()
        ],
    }


@router.get("/projects/{ref}/functions")
async def get_project_functions(ref: str, user_id: str = Depends(get_user_id)):
    """List Edge Functions for this project."""
    _validate_ref(ref)
    _assert_owns_supabase_project(user_id, ref)
    token = _get_token(user_id)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            f"{SUPABASE_API}/projects/{ref}/functions",
            headers={"Authorization": f"Bearer {token}"},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch functions from Supabase")

    return {
        "functions": [
            {
                "id": f.get("id"),
                "slug": f.get("slug"),
                "name": f.get("name"),
                "status": f.get("status"),
                "created_at": f.get("created_at"),
                "updated_at": f.get("updated_at"),
                "verify_jwt": f.get("verify_jwt", True),
            }
            for f in resp.json()
        ]
    }
