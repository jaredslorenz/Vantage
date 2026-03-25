from fastapi import APIRouter, Depends
from app.core.encryption import decrypt_token
from app.core.security import get_user_id
from app.core.supabase import supabase

router = APIRouter(prefix="/api/services", tags=["services"])


@router.get("")
async def get_connected_services(user_id: str = Depends(get_user_id)):
    """Return all connected services for the current user."""
    result = supabase.table("connected_services") \
        .select("service_type, service_name, service_id, is_active, health_status, created_at, api_token") \
        .eq("user_id", user_id) \
        .execute()

    services = []
    for svc in (result.data or []):
        services.append({
            "service_type": svc["service_type"],
            "service_name": svc["service_name"],
            "service_id": svc["service_id"],
            "is_active": svc["is_active"],
            "health_status": svc["health_status"],
            "created_at": svc["created_at"],
            "has_api_token": bool(svc.get("api_token")),
        })

    return {"services": services}
