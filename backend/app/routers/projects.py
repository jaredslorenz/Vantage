from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.core.security import get_user_id
from app.core.supabase import supabase
from app.core.logger import logger

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field("", max_length=500)


class LinkServiceRequest(BaseModel):
    service_type: str = Field(..., max_length=50)
    resource_id: str = Field(..., max_length=200)
    resource_name: str = Field(..., max_length=200)


def _enrich_services(project_services: list, connected: list) -> list:
    """Merge service_name from connected_services into project_services."""
    name_map = {svc["service_type"]: svc["service_name"] for svc in connected}
    for svc in project_services:
        svc["service_name"] = name_map.get(svc["service_type"], "")
    return project_services


@router.get("")
async def list_projects(user_id: str = Depends(get_user_id)):
    result = supabase.table("projects") \
        .select("*, project_services(*)") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .execute()
    connected = supabase.table("connected_services") \
        .select("service_type, service_name") \
        .eq("user_id", user_id) \
        .execute().data or []
    projects = result.data or []
    for p in projects:
        _enrich_services(p.get("project_services", []), connected)
    return {"projects": projects}


@router.post("")
async def create_project(body: CreateProjectRequest, user_id: str = Depends(get_user_id)):
    result = supabase.table("projects").insert({
        "user_id": user_id,
        "name": body.name,
        "description": body.description,
    }).execute()
    logger.info("Project created user_id=%s project_id=%s", user_id, result.data[0]["id"])
    return {"project": result.data[0]}


@router.get("/{project_id}")
async def get_project(project_id: str, user_id: str = Depends(get_user_id)):
    result = supabase.table("projects") \
        .select("*, project_services(*)") \
        .eq("id", project_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    connected = supabase.table("connected_services") \
        .select("service_type, service_name") \
        .eq("user_id", user_id) \
        .execute().data or []
    _enrich_services(result.data.get("project_services", []), connected)
    return {"project": result.data}


class UpdateProjectRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: str = Field("", max_length=500)
    alert_threshold: int = Field(50, ge=0, le=100)


@router.patch("/{project_id}")
async def update_project(project_id: str, body: UpdateProjectRequest, user_id: str = Depends(get_user_id)):
    result = supabase.table("projects") \
        .select("id") \
        .eq("id", project_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    updated = supabase.table("projects").update({
        "name": body.name,
        "description": body.description,
        "alert_threshold": body.alert_threshold,
    }).eq("id", project_id).execute()
    logger.info("Project updated user_id=%s project_id=%s", user_id, project_id)
    return {"project": updated.data[0]}


@router.delete("/{project_id}")
async def delete_project(project_id: str, user_id: str = Depends(get_user_id)):
    result = supabase.table("projects") \
        .select("id") \
        .eq("id", project_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    supabase.table("projects").delete().eq("id", project_id).execute()
    logger.info("Project deleted user_id=%s project_id=%s", user_id, project_id)
    return {"status": "deleted"}


@router.post("/{project_id}/services")
async def link_service(
    project_id: str,
    body: LinkServiceRequest,
    user_id: str = Depends(get_user_id),
):
    result = supabase.table("projects") \
        .select("id") \
        .eq("id", project_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Project not found")

    result = supabase.table("project_services").upsert({
        "project_id": project_id,
        "service_type": body.service_type,
        "resource_id": body.resource_id,
        "resource_name": body.resource_name,
    }, on_conflict="project_id,service_type,resource_id").execute()
    logger.info("Service linked user_id=%s project_id=%s service_type=%s", user_id, project_id, body.service_type)
    return {"service": result.data[0]}


@router.delete("/{project_id}/services/{service_id}")
async def unlink_service(
    project_id: str,
    service_id: str,
    user_id: str = Depends(get_user_id),
):
    # Verify project belongs to user AND service belongs to that project
    project = supabase.table("projects") \
        .select("id") \
        .eq("id", project_id) \
        .eq("user_id", user_id) \
        .single() \
        .execute()
    if not project.data:
        raise HTTPException(status_code=404, detail="Project not found")

    service = supabase.table("project_services") \
        .select("id") \
        .eq("id", service_id) \
        .eq("project_id", project_id) \
        .single() \
        .execute()
    if not service.data:
        raise HTTPException(status_code=404, detail="Service not found")

    supabase.table("project_services").delete().eq("id", service_id).execute()
    logger.info("Service unlinked user_id=%s project_id=%s service_id=%s", user_id, project_id, service_id)
    return {"status": "unlinked"}
