"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface ProjectService {
  id: string;
  service_type: string;
  resource_name: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  project_services: ProjectService[];
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  vercel: (
    <svg viewBox="0 0 76 65" className="w-3 h-3" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiFetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await apiFetch("/api/projects", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      const data = await res.json();
      router.push(`/dashboard/projects/${data.project.id}`);
    } catch {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1.5">
            Projects
          </h1>
          <p className="text-sm text-white/75">
            Scope your services to individual apps
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="text-[13px] font-medium px-4 py-2 rounded-button bg-linear-to-br from-brand-purple to-brand-cyan text-white shadow-button hover:shadow-lg transition-shadow"
        >
          New Project
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-card shadow-xl p-6 w-full max-w-md mx-4">
            <h2 className="text-[16px] font-semibold text-gray-900 mb-4">New Project</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-[12px] font-medium text-gray-600 block mb-1">
                  Name
                </label>
                <input
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Cognify"
                  className="w-full px-3 py-2 border border-gray-200 rounded-button text-[13px] outline-none focus:border-brand-purple"
                />
              </div>
              <div>
                <label className="text-[12px] font-medium text-gray-600 block mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does this project do?"
                  className="w-full px-3 py-2 border border-gray-200 rounded-button text-[13px] outline-none focus:border-brand-purple"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="flex-1 py-2 rounded-button bg-linear-to-br from-brand-purple to-brand-cyan text-white text-[13px] font-medium disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Project"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-button border border-gray-200 text-gray-600 text-[13px] hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Project grid */}
      {!loading && projects.length === 0 ? (
        <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-10 shadow-card text-center">
          <p className="text-sm text-gray-500 mb-3">No projects yet</p>
          <button
            onClick={() => setShowForm(true)}
            className="text-[13px] font-medium px-4 py-2 rounded-button bg-linear-to-br from-brand-purple to-brand-cyan text-white shadow-button"
          >
            Create your first project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/projects/${p.id}`}
              className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-5 shadow-card hover:shadow-lg transition-shadow block"
            >
              <div className="text-[15px] font-semibold text-gray-900 mb-1">{p.name}</div>
              {p.description && (
                <p className="text-[12px] text-gray-400 mb-3 truncate">{p.description}</p>
              )}
              {p.project_services.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {p.project_services.map((s) => (
                    <span
                      key={s.id}
                      className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"
                    >
                      {SERVICE_ICONS[s.service_type]}
                      {s.resource_name}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-gray-400">No services linked yet</span>
              )}
            </Link>
          ))}
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white/60 rounded-card h-28 animate-pulse" />
            ))}
        </div>
      )}
    </>
  );
}
