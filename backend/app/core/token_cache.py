"""
Short-lived in-memory cache for decrypted API tokens.
Prevents repeated Supabase lookups on every API route call.
TTL is intentionally short (2 min) so token revocations take effect quickly.
"""
from datetime import datetime, timezone

_cache: dict[str, tuple[float, str]] = {}
_TTL = 120  # 2 minutes


def get(user_id: str, service_type: str) -> str | None:
    key = f"{user_id}:{service_type}"
    entry = _cache.get(key)
    if entry and (datetime.now(timezone.utc).timestamp() - entry[0]) < _TTL:
        return entry[1]
    return None


def set(user_id: str, service_type: str, token: str) -> None:
    _cache[f"{user_id}:{service_type}"] = (datetime.now(timezone.utc).timestamp(), token)


def invalidate(user_id: str, service_type: str) -> None:
    _cache.pop(f"{user_id}:{service_type}", None)
