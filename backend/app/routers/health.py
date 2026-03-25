from fastapi import APIRouter, Depends
from app.core.security import get_user_id

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/health/auth")
async def health_auth(user_id: str = Depends(get_user_id)):
    """Confirms Next.js → FastAPI JWT verification is working."""
    return {"status": "ok", "user_id": user_id}
