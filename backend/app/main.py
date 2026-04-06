import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.config import settings
from app.core.logger import logger
from app.core.limiter import limiter
from app.routers import health, vercel, services, projects, github, render, insights, supabase_mgmt, events, uptime

app = FastAPI(title="Vantage API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PUT", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000)
    logger.info(
        "%s %s %s %dms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response

app.include_router(health.router, tags=["health"])
app.include_router(vercel.router)
app.include_router(services.router)
app.include_router(projects.router)
app.include_router(github.router)
app.include_router(render.router)
app.include_router(insights.router)
app.include_router(supabase_mgmt.router)
app.include_router(events.router)
app.include_router(uptime.router)
