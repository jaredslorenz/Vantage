"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface ProjectService {
  id: string;
  service_type: string;
  resource_id: string;
  resource_name: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  project_services: ProjectService[];
}

interface VercelProject {
  id: string;
  name: string;
}

interface Deployment {
  id: string;
  name: string;
  url: string;
  state: string;
  branch: string;
  commit_message: string;
  created_at: number;
}

const STATE_STYLES: Record<string, string> = {
  READY: "text-emerald-600 bg-emerald-50",
  ERROR: "text-red-500 bg-red-50",
  BUILDING: "text-amber-500 bg-amber-50",
  CANCELED: "text-gray-400 bg-gray-100",
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    apiFetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setProject(d.project);
        return d.project;
      })
      .then((p: Project) => {
        const vercelService = p.project_services.find(
          (s) => s.service_type === "vercel"
        );
        if (vercelService) {
          return apiFetch(`/api/vercel/deployments?limit=10&projectId=${vercelService.resource_id}`)
            .then((r) => r.json())
            .then((d) => setDeployments(d.deployments ?? []))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const openLinkPanel = () => {
    apiFetch("/api/vercel/projects")
      .then((r) => r.json())
      .then((d) => setVercelProjects(d.projects ?? []))
      .catch(() => {});
    setShowLinkPanel(true);
  };

  const handleLinkVercel = async (vp: VercelProject) => {
    setLinking(true);
    try {
      await apiFetch(`/api/projects/${id}/services`, {
        method: "POST",
        body: JSON.stringify({
          service_type: "vercel",
          resource_id: vp.id,
          resource_name: vp.name,
        }),
      });
      const res = await apiFetch(`/api/projects/${id}`);
      const data = await res.json();
      setProject(data.project);
      setShowLinkPanel(false);

      // Fetch deployments for newly linked project
      const deploysRes = await apiFetch(`/api/vercel/deployments?limit=10&projectId=${vp.id}`);
      const deploysData = await deploysRes.json();
      setDeployments(deploysData.deployments ?? []);
    } catch {
      /* silent */
    } finally {
      setLinking(false);
    }
  };

  const handleUnlink = async (serviceId: string) => {
    await apiFetch(`/api/projects/${id}/services/${serviceId}`, { method: "DELETE" });
    setProject((prev) =>
      prev
        ? { ...prev, project_services: prev.project_services.filter((s) => s.id !== serviceId) }
        : prev
    );
    setDeployments([]);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete project "${project?.name}"? This cannot be undone.`)) return;
    await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/dashboard/projects");
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-48 bg-white/40 rounded-card animate-pulse" />
        <div className="h-32 bg-white/40 rounded-card animate-pulse" />
      </div>
    );
  }

  if (!project) return null;

  const linkedVercel = project.project_services.find((s) => s.service_type === "vercel");

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1">
            {project.name}
          </h1>
          {project.description && (
            <p className="text-sm text-white/70">{project.description}</p>
          )}
        </div>
        <button
          onClick={handleDelete}
          className="text-[12px] font-medium px-3 py-1.5 rounded-button border border-red-400 text-red-400 hover:bg-red-400 hover:text-white transition-all mt-1"
        >
          Delete project
        </button>
      </div>

      {/* Linked services */}
      <div className="mb-2.5">
        <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Linked Services
        </h2>
      </div>

      <div className="flex flex-wrap gap-2.5 mb-7">
        {project.project_services.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-2 bg-white/95 border border-white/60 rounded-card px-3.5 py-2 shadow-card text-[13px] text-gray-700"
          >
            <span className="font-medium capitalize">{s.service_type}</span>
            <span className="text-gray-400">/</span>
            <span>{s.resource_name}</span>
            <button
              onClick={() => handleUnlink(s.id)}
              className="ml-1 text-gray-300 hover:text-red-400 transition-colors text-xs"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={openLinkPanel}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-card border border-white/40 border-dashed text-white/70 text-[13px] hover:bg-white/10 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Link service
        </button>
      </div>

      {/* Deployments */}
      <div className="mb-2.5">
        <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
          Deployments
        </h2>
      </div>

      <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
        {!linkedVercel ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <p className="text-sm text-gray-500 mb-2">No Vercel project linked</p>
            <p className="text-xs text-gray-400">
              Link a Vercel project above to see deployments
            </p>
          </div>
        ) : deployments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No deployments found</p>
        ) : (
          deployments.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0"
            >
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATE_STYLES[d.state] ?? "text-gray-500 bg-gray-100"}`}
              >
                {d.state}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-gray-900 truncate">{d.name}</div>
                <div className="text-[11px] text-gray-400 truncate">
                  {d.branch ? `${d.branch} — ` : ""}{d.commit_message ?? "No commit message"}
                </div>
              </div>
              {d.url && (
                <a
                  href={`https://${d.url}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-brand-purple hover:underline shrink-0"
                >
                  Visit ↗
                </a>
              )}
              <div className="text-[11px] text-gray-400 shrink-0">
                {d.created_at ? timeAgo(d.created_at) : "—"}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Link panel modal */}
      {showLinkPanel && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-card shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-[16px] font-semibold text-gray-900 mb-1">Link a Service</h2>
            <p className="text-[12px] text-gray-400 mb-4">
              Select a Vercel project to link to {project.name}
            </p>

            {vercelProjects.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No Vercel projects found
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {vercelProjects
                  .filter((vp) => !project.project_services.some((s) => s.resource_id === vp.id))
                  .map((vp) => (
                    <button
                      key={vp.id}
                      onClick={() => handleLinkVercel(vp)}
                      disabled={linking}
                      className="w-full text-left px-3.5 py-2.5 rounded-button border border-gray-200 hover:border-brand-purple hover:bg-brand-purple/5 transition-colors text-[13px] text-gray-800 disabled:opacity-50"
                    >
                      {vp.name}
                    </button>
                  ))}
              </div>
            )}

            <button
              onClick={() => setShowLinkPanel(false)}
              className="mt-4 w-full py-2 rounded-button border border-gray-200 text-gray-500 text-[13px] hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
