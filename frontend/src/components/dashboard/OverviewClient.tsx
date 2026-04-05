"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiRender, SiSupabase } from "react-icons/si";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";

interface ConnectedService {
  service_type: string;
  service_name: string;
  is_active: boolean;
  health_status: string;
}

interface Deployment {
  id: string;
  name: string;
  url: string;
  state: string;
  target: string;
  branch: string;
  commit_message: string;
  created_at: number;
}

interface Project {
  id: string;
  name: string;
  description: string;
  project_services: { service_type: string; resource_id: string }[];
}

interface ProjectInsight {
  health: "healthy" | "warning" | "critical";
  summary: string;
}

const STATE_STYLES: Record<string, string> = {
  READY: "text-emerald-600 bg-emerald-50",
  ERROR: "text-red-500 bg-red-50",
  BUILDING: "text-amber-500 bg-amber-50",
  CANCELED: "text-gray-400 bg-gray-100",
};

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  vercel: (
    <svg viewBox="0 0 76 65" className="w-4 h-4" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  render: <SiRender className="w-4 h-4" />,
  supabase: <SiSupabase className="w-4 h-4" />,
};

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ProjectInsightCard({ project }: { project: Project }) {
  const [insight, setInsight] = useState<ProjectInsight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (project.project_services.length === 0) { setLoading(false); return; }

    apiFetch(`/api/insights/${project.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.insight) {
          setInsight(data.insight);
          setLoading(false);
        } else {
          // No cached insight — generate one in the background
          return apiFetch(`/api/insights/${project.id}/generate`, { method: "POST" })
            .then((r) => r.json())
            .then((d) => { if (d.insight) setInsight(d.insight); })
            .finally(() => setLoading(false));
        }
      })
      .catch(() => setLoading(false));
  }, [project.id]);

  const serviceTypes = project.project_services.map((s) => s.service_type);

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-4 shadow-card hover:shadow-xl hover:-translate-y-0.5 transition-all block"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="font-semibold text-[14px] text-gray-900 truncate">{project.name}</div>
        {loading ? (
          <div className="w-2 h-2 rounded-full bg-gray-200 animate-pulse shrink-0 mt-1" />
        ) : insight ? (
          <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${HEALTH_DOT[insight.health]}`} />
        ) : null}
      </div>

      {loading ? (
        <div className="h-3 bg-gray-100 rounded animate-pulse w-3/4" />
      ) : insight ? (
        <p className="text-[12px] text-gray-500 line-clamp-2">{insight.summary}</p>
      ) : (
        <p className="text-[12px] text-gray-400">No services linked</p>
      )}

      {serviceTypes.length > 0 && (
        <div className="flex items-center gap-1.5 mt-3">
          {serviceTypes.map((type) => (
            <div key={type} className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center">
              {SERVICE_ICONS[type]}
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}

export default function OverviewClient() {
  const { user } = useAuth();
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [openPRCount, setOpenPRCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const username = user?.user_metadata?.user_name ?? "there";
  const vercelConnected = services.some((s) => s.service_type === "vercel");
  const readyCount = deployments.filter((d) => d.state === "READY").length;

  useEffect(() => {
    Promise.all([
      apiFetch("/api/services").then((r) => r.json()),
      apiFetch("/api/projects").then((r) => r.json()),
    ])
      .then(([svcData, projData]) => {
        const svcs: ConnectedService[] = svcData.services ?? [];
        const projs: Project[] = projData.projects ?? [];
        setServices(svcs);
        setProjects(projs);

        const fetches: Promise<void>[] = [];

        if (svcs.some((s) => s.service_type === "vercel")) {
          fetches.push(
            apiFetch("/api/vercel/deployments?limit=5")
              .then((r) => r.json())
              .then((d) => setDeployments(d.deployments ?? []))
              .catch(() => {})
          );
        }

        // Fetch open PRs for all unique GitHub repos across projects
        const githubRepos = [
          ...new Set(
            projs
              .flatMap((p) => p.project_services)
              .filter((s) => s.service_type === "github")
              .map((s) => s.resource_id)
              .filter(Boolean)
          ),
        ];

        if (githubRepos.length > 0) {
          fetches.push(
            Promise.all(
              githubRepos.map((repo) =>
                apiFetch(`/api/github/pulls?repo=${repo}&state=open`)
                  .then((r) => r.json())
                  .then((d) => (d.pulls ?? []).length)
                  .catch(() => 0)
              )
            ).then((counts) => setOpenPRCount(counts.reduce((a, b) => a + b, 0)))
          );
        }

        return Promise.all(fetches);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      {/* Page header */}
      <div className="mb-7">
        <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1">
          Welcome back, {username}
        </h1>
        <p className="text-sm text-white/70">
          Here&apos;s an overview of your connected services
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5 mb-7">
        <StatCard
          label="Connected Services"
          value={loading ? "—" : String(services.length)}
          sub={services.length === 0 ? "None yet" : services.map((s) => s.service_type).join(", ")}
        />
        <StatCard
          label="Projects"
          value={loading ? "—" : String(projects.length)}
          sub={projects.length === 0 ? "None yet" : `${projects.filter((p) => p.project_services.length > 0).length} with services`}
        />
        <StatCard
          label="Recent Deployments"
          value={loading ? "—" : String(deployments.length)}
          sub={vercelConnected ? `${readyCount} successful` : "Connect Vercel to track"}
        />
        <StatCard
          label="Open PRs"
          value={loading ? "—" : openPRCount !== null ? String(openPRCount) : "—"}
          sub={openPRCount === null ? "Connect GitHub to track" : openPRCount === 0 ? "All clear" : "across linked repos"}
        />
      </div>

      {/* Projects with AI health */}
      {!loading && projects.length > 0 && (
        <>
          <div className="mb-2.5 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Projects</h2>
            <Link href="/dashboard/projects" className="text-[11px] text-white/40 hover:text-white/70 transition-colors">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5 mb-7">
            {projects.map((p) => <ProjectInsightCard key={p.id} project={p} />)}
          </div>
        </>
      )}

      {/* Services status */}
      <div className="mb-2.5">
        <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Services</h2>
      </div>

      {!loading && services.length === 0 ? (
        <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-6 shadow-card text-center">
          <p className="text-sm text-gray-500 mb-3">No services connected yet</p>
          <Link
            href="/dashboard/services"
            className="inline-block text-[13px] font-medium px-4 py-2 rounded-button bg-linear-to-br from-brand-purple to-brand-cyan text-white shadow-button"
          >
            Connect a service
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3.5 mb-7">
          {services.map((svc) => (
            <div
              key={svc.service_type}
              className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-4 shadow-card flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                {SERVICE_ICONS[svc.service_type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-gray-900 capitalize">{svc.service_type}</div>
                <div className="text-[11px] text-gray-400 truncate">{svc.service_name}</div>
              </div>
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            </div>
          ))}
          {loading &&
            Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="bg-white/60 rounded-card p-4 shadow-card h-16 animate-pulse" />
            ))}
        </div>
      )}

      {/* Recent deployments */}
      {vercelConnected && (
        <>
          <div className="mb-2.5">
            <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Recent Deployments</h2>
          </div>
          <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-14 border-b border-gray-100 last:border-0 animate-pulse bg-gray-50" />
              ))
            ) : deployments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No deployments found</p>
            ) : (
              deployments.map((d) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATE_STYLES[d.state] ?? "text-gray-500 bg-gray-100"}`}>
                    {d.state}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 truncate">{d.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">
                      {d.branch ? `${d.branch} — ` : ""}{d.commit_message ?? "No commit message"}
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-400 shrink-0">
                    {d.created_at ? timeAgo(d.created_at) : "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-4 shadow-card">
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-semibold text-gray-900 mb-0.5">{value}</div>
      <div className="text-[11px] text-gray-400 truncate">{sub}</div>
    </div>
  );
}
