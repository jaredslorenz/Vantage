from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.core.security import get_user_id
from app.core.supabase import supabase

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str
    description: str = ""


class LinkServiceRequest(BaseModel):
    service_type: str
    resource_id: str
    resource_name: str


@router.get("")
async def list_projects(user_id: str = Depends(get_user_id)):
    result = supabase.table("projects") \
        .select("*, project_services(*)") \
        .eq("user_id", user_id) \
        .order("created_at", desc=True) \
        .execute()
    return {"projects": result.data or []}


@router.post("")
async def create_project(body: CreateProjectRequest, user_id: str = Depends(get_user_id)):
    result = supabase.table("projects").insert({
        "user_id": user_id,
        "name": body.name,
        "description": body.description,
    }).execute()
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
    return {"project": result.data}


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
    return {"status": "deleted"}


@router.post("/{project_id}/services")
async def link_service(
    project_id: str,
    body: LinkServiceRequest,
    user_id: str = Depends(get_user_id),
):
    # Verify project belongs to user
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
    return {"service": result.data[0]}


@router.delete("/{project_id}/services/{service_id}")
async def unlink_service(
    project_id: str,
    service_id: str,
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

    supabase.table("project_services").delete().eq("id", service_id).execute()
    return {"status": "unlinked"}
