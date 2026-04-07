"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { groupByDate, timeAgo } from "@/lib/utils";
import type {
  Project, ProjectService, Deployment, Commit, PullRequest,
  RenderDeploy, VercelProject, GitHubRepo, RenderService,
  SupabaseProject, SupabaseServiceHealth, SupabaseOverview,
  DeployAnalysis, UptimeStatus, EnvVar, LogLine, Investigation, RuntimeError,
} from "@/types/project";
import { InsightPanel } from "@/components/project/InsightPanel";
import { BuildTrendChart } from "@/components/project/BuildTrendChart";
import { DORAMetrics } from "@/components/project/DORAMetrics";
import { DeploymentRow } from "@/components/project/DeploymentRow";
import { VercelCard } from "@/components/project/VercelCard";
import { RenderCard, RenderDeployRow } from "@/components/project/RenderCard";
import { RenderMetricsChart } from "@/components/project/RenderMetricsChart";
import { GitHubCard, CommitRow, PRRow } from "@/components/project/GitHubCard";
import { SupabaseCard, SB_COLOR } from "@/components/project/SupabaseCard";

// --- Log drawer ---
function LogDrawer({ logsUrl, title, subtitle, onClose }: {
  logsUrl: string | null; title: string; subtitle: string; onClose: () => void;
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!logsUrl) return;
    setLines([]);
    setLoading(true);
    apiFetch(logsUrl)
      .then((r) => r.json())
      .then((d) => setLines(d.lines ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [logsUrl]);

  // Auto-scroll to first error after load
  useEffect(() => {
    if (!loading && lines.length > 0) {
      setTimeout(() => {
        if (errorRef.current) {
          errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
        }
      }, 100);
    }
  }, [loading, lines]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!logsUrl) return null;

  let firstErrorSet = false;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Scrim */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Drawer */}
      <div
        className="relative w-full max-w-2xl h-full bg-[#0d1117] flex flex-col shadow-2xl animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-white/10 rounded-lg flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-white/60" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-white/90">{title}</div>
              <div className="text-[11px] text-white/40 font-mono">{subtitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-white/30"></span>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white/90 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Log body */}
        <div ref={containerRef} className="flex-1 overflow-y-auto px-5 py-4 font-mono text-[12px] leading-relaxed">
          {loading ? (
            <div className="flex items-center gap-2 text-white/40">
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Fetching logs…
            </div>
          ) : lines.length === 0 ? (
            <span className="text-white/30">No log output available for this deployment.</span>
          ) : (
            lines.map((line, i) => {
              const isError = line.type === "stderr";
              const isCmd = line.type === "command";
              const ref = isError && !firstErrorSet ? (firstErrorSet = true, true) : false;
              return (
                <div
                  key={i}
                  ref={ref ? (el) => { errorRef.current = el; } : undefined}
                  className={`flex gap-3 py-0.5 ${isError ? "bg-red-950/40 -mx-5 px-5 rounded" : ""}`}
                >
                  <span className="text-white/20 select-none w-8 text-right shrink-0">{i + 1}</span>
                  <span className={
                    isError ? "text-red-400" :
                    isCmd ? "text-emerald-400" :
                    "text-white/75"
                  }>
                    {isCmd && <span className="text-white/30 mr-1">$</span>}
                    {line.text}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {!loading && lines.length > 0 && (
          <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4 text-[11px] text-white/30">
              <span>{lines.length} lines</span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-red-400/60" />
                stderr
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm bg-emerald-400/60" />
                command
              </span>
            </div>
            <span className="text-[11px] text-white/20">ESC to close</span>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main page ---
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [renderDeploys, setRenderDeploys] = useState<RenderDeploy[]>([]);
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([]);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [renderServices, setRenderServices] = useState<RenderService[]>([]);
  const [supabaseProjects, setSupabaseProjects] = useState<SupabaseProject[]>([]);
  const [supabaseHealth, setSupabaseHealth] = useState<SupabaseServiceHealth[]>([]);
  const [supabaseOverview, setSupabaseOverview] = useState<SupabaseOverview | null>(null);
  const [supabaseTab, setSupabaseTab] = useState<"overview" | "logs" | "history">("overview");
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkTab, setLinkTab] = useState<"vercel" | "github" | "render" | "supabase">("vercel");
  const [githubTab, setGithubTab] = useState<"commits" | "prs">("commits");
  const [linking, setLinking] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [insightRefreshKey, setInsightRefreshKey] = useState(0);
  const [logDrawer, setLogDrawer] = useState<{ logsUrl: string; title: string; subtitle: string } | null>(null);
  const [vercelFilter, setVercelFilter] = useState<"all" | "production" | "failures" | "preview">("all");
  const [vercelDetailTab, setVercelDetailTab] = useState<"deployments" | "env">("deployments");
  const [uptimeData, setUptimeData] = useState<Record<string, UptimeStatus>>({});
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);
  const [proactiveAlerts, setProactiveAlerts] = useState<Record<string, DeployAnalysis>>({});
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [investigating, setInvestigating] = useState(false);
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeError[]>([]);
  const prevVercelStates = useRef<Record<string, string>>({});
  const prevRenderStates = useRef<Record<string, string>>({});
  const autoInvestigated = useRef(false);

  useEffect(() => {
    apiFetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setProject(d.project);
        return d.project;
      })
      .then((p: Project) => {
        const vercelSvc = p.project_services.find((s) => s.service_type === "vercel");
        const githubSvc = p.project_services.find((s) => s.service_type === "github");
        const renderSvc = p.project_services.find((s) => s.service_type === "render");
        const supabaseSvc = p.project_services.find((s) => s.service_type === "supabase");
        const first = vercelSvc ?? githubSvc ?? renderSvc ?? supabaseSvc;
        if (first) setSelectedService(first.id);

        const fetches: Promise<void>[] = [];
        if (vercelSvc) {
          fetches.push(
            apiFetch(`/api/vercel/deployments?limit=20&projectId=${vercelSvc.resource_id}`)
              .then((r) => r.json()).then((d) => setDeployments(d.deployments ?? [])).catch(() => {})
          );
        }
        if (githubSvc) {
          fetches.push(
            apiFetch(`/api/github/commits?repo=${githubSvc.resource_id}&limit=20`)
              .then((r) => r.json()).then((d) => setCommits(d.commits ?? [])).catch(() => {}),
            apiFetch(`/api/github/pulls?repo=${githubSvc.resource_id}`)
              .then((r) => r.json()).then((d) => setPulls(d.pulls ?? [])).catch(() => {})
          );
        }
        if (renderSvc) {
          fetches.push(
            apiFetch(`/api/render/deploys?serviceId=${renderSvc.resource_id}&limit=20`)
              .then((r) => r.json()).then((d) => setRenderDeploys(d.deploys ?? [])).catch(() => {})
          );
          fetches.push(
            apiFetch(`/api/events?event_type=runtime_error&project_id=${p.id}&limit=20`)
              .then((r) => r.json()).then((d) => setRuntimeErrors(d.events ?? [])).catch(() => {})
          );
        }
        if (supabaseSvc) {
          fetches.push(
            apiFetch(`/api/supabase/projects/${supabaseSvc.resource_id}/health`)
              .then((r) => r.json()).then((d) => setSupabaseHealth(d.services ?? [])).catch(() => {}),
            apiFetch(`/api/supabase/projects/${supabaseSvc.resource_id}/overview`)
              .then((r) => r.json()).then((d) => setSupabaseOverview(d)).catch(() => {})
          );
        }
        return Promise.all(fetches);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Supabase Realtime — refresh data when scheduler writes new events for this project
  const projectRef = useRef<Project | null>(null);
  useEffect(() => { projectRef.current = project; }, [project]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project-events-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events", filter: `project_id=eq.${id}` },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const svcType = row.service_type as string;
          const p = projectRef.current;
          if (!p) return;

          if (svcType === "vercel") {
            const svc = p.project_services.find((s) => s.service_type === "vercel");
            if (svc) {
              apiFetch(`/api/vercel/deployments?limit=20&projectId=${svc.resource_id}`)
                .then((r) => r.json()).then((d) => setDeployments(d.deployments ?? [])).catch(() => {});
            }
          } else if (svcType === "render") {
            const svc = p.project_services.find((s) => s.service_type === "render");
            if (svc) {
              apiFetch(`/api/render/deploys?serviceId=${svc.resource_id}&limit=20`)
                .then((r) => r.json()).then((d) => setRenderDeploys(d.deploys ?? [])).catch(() => {});
            }
          } else if (svcType === "github") {
            const svc = p.project_services.find((s) => s.service_type === "github");
            if (svc) {
              apiFetch(`/api/github/commits?repo=${svc.resource_id}&limit=20`)
                .then((r) => r.json()).then((d) => setCommits(d.commits ?? [])).catch(() => {});
              apiFetch(`/api/github/pulls?repo=${svc.resource_id}`)
                .then((r) => r.json()).then((d) => setPulls(d.pulls ?? [])).catch(() => {});
            }
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // Auto-poll when a deploy is in-progress; trigger insight refresh when build settles
  useEffect(() => {
    const buildingVercel = deployments.some((d) => d.state === "BUILDING");
    const buildingRender = renderDeploys.some((d) => ["build_in_progress", "update_in_progress", "pre_deploy_in_progress"].includes(d.status));
    if (!buildingVercel && !buildingRender) return;

    const interval = setInterval(() => {
      if (buildingVercel) {
        const svc = project?.project_services.find((s) => s.service_type === "vercel");
        if (svc) apiFetch(`/api/vercel/deployments?limit=20&projectId=${svc.resource_id}`)
          .then((r) => r.json())
          .then((d) => {
            const newDeploys = d.deployments ?? [];
            // Auto-investigate when a build goes BUILDING → ERROR
            const justFailed = (newDeploys as { id: string; state: string }[]).some(
              (dep) => prevVercelStates.current[dep.id] === "BUILDING" && dep.state === "ERROR"
            );
            if (justFailed) {
              setInvestigating(true);
              setInvestigation(null);
              apiFetch("/api/insights/investigate", {
                method: "POST",
                body: JSON.stringify({ project_id: project?.id, service_type: "vercel" }),
              })
                .then((r) => r.json())
                .then((data) => setInvestigation(data))
                .catch(() => {})
                .finally(() => setInvestigating(false));
            }
            const settled = newDeploys.some(
              (dep: { id: string; state: string }) =>
                prevVercelStates.current[dep.id] === "BUILDING" &&
                (dep.state === "READY" || dep.state === "ERROR")
            );
            prevVercelStates.current = Object.fromEntries(newDeploys.map((dep: { id: string; state: string }) => [dep.id, dep.state]));
            setDeployments(newDeploys);
            if (settled) setInsightRefreshKey((k) => k + 1);
          })
          .catch(() => {});
      }
      if (buildingRender) {
        const svc = project?.project_services.find((s) => s.service_type === "render");
        if (svc) apiFetch(`/api/render/deploys?serviceId=${svc.resource_id}&limit=20`)
          .then((r) => r.json())
          .then((d) => {
            const newDeploys = d.deploys ?? [];
            const settledStatuses = ["live", "build_failed", "canceled", "deactivated"];
            const justFailed = newDeploys.some(
              (dep: { id: string; status: string }) =>
                ["build_in_progress", "update_in_progress", "pre_deploy_in_progress"].includes(prevRenderStates.current[dep.id]) &&
                dep.status === "build_failed"
            );
            const settled = newDeploys.some(
              (dep: { id: string; status: string }) =>
                ["build_in_progress", "update_in_progress", "pre_deploy_in_progress"].includes(prevRenderStates.current[dep.id]) &&
                settledStatuses.includes(dep.status)
            );
            prevRenderStates.current = Object.fromEntries(newDeploys.map((dep: { id: string; status: string }) => [dep.id, dep.status]));
            setRenderDeploys(newDeploys);
            if (justFailed) {
              setInvestigating(true);
              setInvestigation(null);
              apiFetch("/api/insights/investigate", {
                method: "POST",
                body: JSON.stringify({ project_id: project?.id, service_type: "render" }),
              })
                .then((r) => r.json())
                .then((data) => setInvestigation(data))
                .catch(() => {})
                .finally(() => setInvestigating(false));
            }
            if (settled) setInsightRefreshKey((k) => k + 1);
          })
          .catch(() => {});
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [deployments, renderDeploys, project]);

  // Auto-investigate on page load if failures detected
  useEffect(() => {
    if (loading || autoInvestigated.current || !project) return;
    const renderSvc = project.project_services.find((s) => s.service_type === "render");
    const vercelSvc = project.project_services.find((s) => s.service_type === "vercel");
    const supabaseSvc = project.project_services.find((s) => s.service_type === "supabase");
    let failingService: string | null = null;
    if (renderSvc && renderDeploys.length >= 3 && renderDeploys[0]?.status === "build_failed") {
      const rate = Math.round(renderDeploys.filter((d) => d.status === "live").length / renderDeploys.length * 100);
      if (rate < 50) failingService = "render";
    }
    if (!failingService && vercelSvc && deployments.length >= 3 && deployments[0]?.state === "ERROR") {
      const rate = Math.round(deployments.filter((d) => d.state === "READY").length / deployments.length * 100);
      if (rate < 50) failingService = "vercel";
    }
    if (!failingService && supabaseSvc && supabaseHealth.some((s) => s.status === "ACTIVE_UNHEALTHY")) {
      failingService = "supabase";
    }
    if (!failingService) return;
    autoInvestigated.current = true;
    setInvestigating(true);
    setInvestigation(null);
    apiFetch("/api/insights/investigate", {
      method: "POST",
      body: JSON.stringify({ project_id: project.id, service_type: failingService }),
    })
      .then((r) => r.json())
      .then((data) => setInvestigation(data))
      .catch(() => {})
      .finally(() => setInvestigating(false));
  }, [loading, deployments, renderDeploys, supabaseHealth, project]);

  // Uptime checks — fire once when we have deployment URLs to ping
  useEffect(() => {
    if (!project) return;
    const runCheck = async (serviceType: string, serviceId: string, url: string) => {
      const key = `${serviceType}:${serviceId}`;
      try {
        const checkRes = await apiFetch("/api/uptime/check", {
          method: "POST",
          body: JSON.stringify({ url, service_type: serviceType, service_id: serviceId }),
        });
        const check = await checkRes.json();
        setUptimeData((prev) => ({ ...prev, [key]: { ...check, uptime_pct: null, avg_latency_ms: null, checks: [] } }));
        const histRes = await apiFetch(`/api/uptime/history?service_type=${serviceType}&service_id=${serviceId}`);
        const hist = await histRes.json();
        setUptimeData((prev) => ({ ...prev, [key]: { ...prev[key], ...hist } }));
      } catch { /* silent */ }
    };

    const vercelSvc = project.project_services.find((s) => s.service_type === "vercel");
    if (vercelSvc && deployments[0]?.url) {
      runCheck("vercel", vercelSvc.resource_id, `https://${deployments[0].url}`);
    }
    const renderSvc = project.project_services.find((s) => s.service_type === "render");
    if (renderSvc) {
      apiFetch(`/api/render/services`)
        .then((r) => r.json())
        .then((d) => {
          const svc = (d.services ?? []).find((s: { id: string; url: string | null }) => s.id === renderSvc.resource_id);
          if (svc?.url) runCheck("render", renderSvc.resource_id, svc.url);
        })
        .catch(() => {});
    }
  }, [project, deployments.length > 0 ? deployments[0]?.url : null]);

  // Env vars — lazy-load when user switches to the env tab
  useEffect(() => {
    if (vercelDetailTab !== "env") return;
    const vercelSvc = project?.project_services.find((s) => s.service_type === "vercel");
    if (!vercelSvc || envVarsLoaded) return;
    apiFetch(`/api/vercel/projects/${vercelSvc.resource_id}/env`)
      .then((r) => r.json())
      .then((d) => { setEnvVars(d.envs ?? []); setEnvVarsLoaded(true); })
      .catch(() => setEnvVarsLoaded(true));
  }, [vercelDetailTab, project]);

  const openLinkPanel = () => {
    setShowLinkPanel(true);
    apiFetch("/api/vercel/projects").then((r) => r.json()).then((d) => setVercelProjects(d.projects ?? [])).catch(() => {});
    apiFetch("/api/github/repos").then((r) => r.json()).then((d) => setGithubRepos(d.repos ?? [])).catch(() => {});
    apiFetch("/api/render/services").then((r) => r.json()).then((d) => setRenderServices(d.services ?? [])).catch(() => {});
    apiFetch("/api/supabase/projects").then((r) => r.json()).then((d) => setSupabaseProjects(d.projects ?? [])).catch(() => {});
  };

  const handleLink = async (serviceType: string, resourceId: string, resourceName: string) => {
    setLinking(true);
    try {
      await apiFetch(`/api/projects/${id}/services`, {
        method: "POST",
        body: JSON.stringify({ service_type: serviceType, resource_id: resourceId, resource_name: resourceName }),
      });
      const res = await apiFetch(`/api/projects/${id}`);
      const data = await res.json();
      setProject(data.project);
      const newSvc = data.project.project_services.find((s: ProjectService) => s.resource_id === resourceId);
      if (newSvc) {
        setSelectedService(newSvc.id);
        if (serviceType === "github") {
          await Promise.all([
            apiFetch(`/api/github/commits?repo=${resourceId}&limit=20`).then((r) => r.json()).then((d) => setCommits(d.commits ?? [])).catch(() => {}),
            apiFetch(`/api/github/pulls?repo=${resourceId}`).then((r) => r.json()).then((d) => setPulls(d.pulls ?? [])).catch(() => {}),
          ]);
        } else if (serviceType === "render") {
          await apiFetch(`/api/render/deploys?serviceId=${resourceId}&limit=20`).then((r) => r.json()).then((d) => setRenderDeploys(d.deploys ?? [])).catch(() => {});
        } else if (serviceType === "supabase") {
          await Promise.all([
            apiFetch(`/api/supabase/projects/${resourceId}/health`).then((r) => r.json()).then((d) => setSupabaseHealth(d.services ?? [])).catch(() => {}),
            apiFetch(`/api/supabase/projects/${resourceId}/overview`).then((r) => r.json()).then((d) => setSupabaseOverview(d)).catch(() => {}),
          ]);
        } else {
          await apiFetch(`/api/vercel/deployments?limit=20&projectId=${resourceId}`).then((r) => r.json()).then((d) => setDeployments(d.deployments ?? [])).catch(() => {});
        }
      }
      setShowLinkPanel(false);
    } catch { /* silent */ }
    finally { setLinking(false); }
  };

  const handleDeploy = async () => {
    if (!activeService || deploying) return;
    setDeploying(true);
    try {
      if (activeService.service_type === "render") {
        const res = await apiFetch("/api/render/deploy", {
          method: "POST",
          body: JSON.stringify({ serviceId: activeService.resource_id }),
        });
        if (res.ok) {
          const newDeploy: RenderDeploy = await res.json();
          setRenderDeploys((prev) => [{ ...newDeploy, commit_message: "Triggered manually", commit_id: null, finished_at: null }, ...prev]);
        }
      } else if (activeService.service_type === "vercel") {
        const latest = deployments[0];
        if (!latest) return;
        const res = await apiFetch("/api/vercel/redeploy", {
          method: "POST",
          body: JSON.stringify({ deploymentId: latest.id }),
        });
        if (res.ok) {
          const newDeploy = await res.json();
          setDeployments((prev) => [{ ...latest, id: newDeploy.id, state: "BUILDING", created_at: Date.now() }, ...prev]);
        }
      }
    } catch { /* silent */ }
    finally { setDeploying(false); }
  };

  const handleUnlink = async (serviceId: string, serviceType: string) => {
    await apiFetch(`/api/projects/${id}/services/${serviceId}`, { method: "DELETE" });
    setProject((prev) => prev ? { ...prev, project_services: prev.project_services.filter((s) => s.id !== serviceId) } : prev);
    if (selectedService === serviceId) setSelectedService(null);
    if (serviceType === "vercel") setDeployments([]);
    if (serviceType === "github") { setCommits([]); setPulls([]); }
    if (serviceType === "render") setRenderDeploys([]);
    if (serviceType === "supabase") { setSupabaseHealth([]); setSupabaseOverview(null); }
  };


  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-9 w-44 bg-white/40 rounded-card" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-44 bg-white/40 rounded-card" />
          <div className="h-44 bg-white/40 rounded-card" />
        </div>
      </div>
    );
  }

  if (!project) return null;

  const activeService = project.project_services.find((s) => s.id === selectedService);

  return (
    <>
      {/* Header */}
      <div className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-white/95 tracking-tight mb-1">{project.name}</h1>
          {project.description && <p className="text-sm text-white/60">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button onClick={openLinkPanel} className="text-[12px] font-medium px-3.5 py-1.5 rounded-button bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-all border border-white/30">
            + Link service
          </button>
          <Link
            href={`/dashboard/projects/${id}/settings`}
            className="text-[12px] font-medium px-3.5 py-1.5 rounded-button bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-all border border-white/30 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
            Settings
          </Link>
        </div>
      </div>

      {/* Alert banner — surfaces critical service issues at a glance */}
      {(() => {
        const alerts: { service: string; message: string; svcId: string }[] = [];
        const renderSvc = project.project_services.find(s => s.service_type === "render");
        if (renderSvc && renderDeploys.length >= 3 && renderDeploys[0]?.status === "build_failed") {
          const live = renderDeploys.filter(d => d.status === "live").length;
          const rate = Math.round(live / renderDeploys.length * 100);
          if (rate < 50) alerts.push({ service: "Render", message: `Render has a ${rate}% success rate in the last ${renderDeploys.length} deploys. Investigate immediately.`, svcId: renderSvc.id });
        }
        const vercelSvc = project.project_services.find(s => s.service_type === "vercel");
        if (vercelSvc && deployments.length >= 3 && deployments[0]?.state === "ERROR") {
          const ready = deployments.filter(d => d.state === "READY").length;
          const rate = Math.round(ready / deployments.length * 100);
          if (rate < 50) alerts.push({ service: "Vercel", message: `Vercel has a ${rate}% success rate across recent deployments. Investigate immediately.`, svcId: vercelSvc.id });
        }
        const supabaseSvc = project.project_services.find(s => s.service_type === "supabase");
        if (supabaseSvc && supabaseHealth.some(s => s.status === "ACTIVE_UNHEALTHY")) {
          const unhealthy = supabaseHealth.filter(s => s.status === "ACTIVE_UNHEALTHY").map(s => s.name.replace(/_/g, " ")).join(", ");
          alerts.push({ service: "Supabase", message: `Supabase reports unhealthy services: ${unhealthy}. Investigate immediately.`, svcId: supabaseSvc.id });
        }
        if (alerts.length === 0) return null;
        const alert = alerts[0];
        return (
          <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-card px-5 py-4 shadow-card animate-slide-up">
            <span className="text-xl shrink-0">⚠️</span>
            <div>
              <p className="text-[13px] font-semibold text-amber-900">Deployment Issue Detected</p>
              <p className="text-[12px] text-amber-700 mt-0.5">{alert.message}</p>
            </div>
          </div>
        );
      })()}

      {/* AI Insight + Investigation (unified) */}
      {project.project_services.length > 0 && (
        <InsightPanel
          projectId={project.id}
          refreshKey={insightRefreshKey}
          investigation={investigation}
          investigating={investigating}
          onDismiss={() => setInvestigation(null)}
        />
      )}

      {/* Service cards */}
      {project.project_services.length === 0 ? (
        <div className="bg-white/95 border border-white/60 rounded-card p-12 shadow-card text-center animate-fade-in">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4" /></svg>
          </div>
          <p className="text-sm font-medium text-gray-600 mb-1">No services linked</p>
          <p className="text-xs text-gray-400 mb-4">Connect a service to start monitoring this project</p>
          <button onClick={openLinkPanel} className="text-[13px] font-medium px-4 py-2 rounded-button bg-linear-to-br from-brand-purple to-brand-cyan text-white shadow-button">
            Link a service
          </button>
        </div>
      ) : (
        <div
          className="grid gap-3.5 mb-6"
          style={{ gridTemplateColumns: `repeat(${Math.min(project.project_services.length, 4)}, minmax(0, 1fr))` }}
        >
          {project.project_services.map((svc) => {
            if (svc.service_type === "vercel") {
              return <VercelCard key={svc.id} service={svc} deployments={deployments} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} uptime={uptimeData[`vercel:${svc.resource_id}`]} />;
            }
            if (svc.service_type === "github") {
              return <GitHubCard key={svc.id} service={svc} commits={commits} pulls={pulls} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} />;
            }
            if (svc.service_type === "render") {
              return <RenderCard key={svc.id} service={svc} deploys={renderDeploys} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} />;
            }
            if (svc.service_type === "supabase") {
              return <SupabaseCard key={svc.id} service={svc} health={supabaseHealth} overview={supabaseOverview} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} />;
            }
            return null;
          })}
        </div>
      )}

      {/* Detail panel */}
      {activeService && (
        <div className="animate-slide-up">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {activeService.service_type === "github" ? (
                <div className="flex gap-1 bg-white/20 rounded-button p-0.5">
                  {(["commits", "prs"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setGithubTab(tab)}
                      className={`text-[11px] font-medium px-3 py-1 rounded-button transition-all ${githubTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-white/60 hover:text-white"}`}
                    >
                      {tab === "commits" ? `Commits (${commits.length})` : `PRs (${pulls.length})`}
                    </button>
                  ))}
                </div>
              ) : activeService.service_type === "supabase" ? (
                <div className="flex gap-1 bg-white/20 rounded-button p-0.5">
                  {(["overview", "logs", "history"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setSupabaseTab(tab)}
                      className={`text-[11px] font-medium px-3 py-1 rounded-button transition-all capitalize ${supabaseTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-white/60 hover:text-white"}`}
                    >
                      {tab === "logs" ? `Errors` : tab === "history" ? "Actions" : "Overview"}
                    </button>
                  ))}
                </div>
              ) : activeService.service_type === "vercel" ? (
                <div className="flex gap-1 bg-white/20 rounded-button p-0.5">
                  {(["deployments", "env"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setVercelDetailTab(tab)}
                      className={`text-[11px] font-medium px-3 py-1 rounded-button transition-all capitalize ${vercelDetailTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-white/60 hover:text-white"}`}
                    >
                      {tab === "env" ? "Env Vars" : "Deployments"}
                    </button>
                  ))}
                </div>
              ) : (
                <div>
                  <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Deploys</h2>
                  <p className="text-[11px] text-white/40 mt-0.5">{activeService.resource_name}</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {(activeService.service_type === "vercel" || activeService.service_type === "render") && (
                <button
                  onClick={handleDeploy}
                  disabled={deploying}
                  className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1 rounded-button bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-all border border-white/30 disabled:opacity-50"
                >
                  {deploying ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Deploying...
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      {activeService.service_type === "vercel" ? "Redeploy" : "Deploy"}
                    </>
                  )}
                </button>
              )}
              <button onClick={() => handleUnlink(activeService.id, activeService.service_type)} className="text-[11px] text-white/30 hover:text-red-300 transition-colors">
                Unlink
              </button>
            </div>
          </div>

          {/* Stats strip for Vercel */}
          {activeService.service_type === "vercel" && deployments.length > 0 && (() => {
            const week = deployments.filter(d => Date.now() - d.created_at < 7 * 86400000).length;
            const ready = deployments.filter(d => d.state === "READY").length;
            const rate = Math.round(ready / deployments.length * 100);
            const withDur = deployments.filter(d => d.build_duration != null);
            const avg = withDur.length ? Math.round(withDur.reduce((s, d) => s + d.build_duration!, 0) / withDur.length) : null;
            let streak = 0;
            for (const d of deployments) { if (d.state === "READY") streak++; else break; }
            const chips = [
              { label: "This week", value: String(week) },
              { label: "Success rate", value: `${rate}%`, color: rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-500" },
              { label: "Avg build", value: avg != null ? `${avg}s` : "—" },
              { label: "Streak", value: streak > 0 ? `${streak} ✓` : "—", color: streak >= 3 ? "text-emerald-600" : undefined },
            ];
            return (
              <div className="flex items-center gap-2 mb-2.5">
                {chips.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5 bg-white/60 border border-white/60 rounded-lg px-3 py-1.5 shadow-sm">
                    <span className={`text-[13px] font-semibold ${c.color ?? "text-gray-800"}`}>{c.value}</span>
                    <span className="text-[10px] text-gray-400">{c.label}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Stats strip for Render */}
          {activeService.service_type === "render" && renderDeploys.length > 0 && (() => {
            const week = renderDeploys.filter(d => Date.now() - new Date(d.created_at).getTime() < 7 * 86400000).length;
            const live = renderDeploys.filter(d => d.status === "live").length;
            const rate = Math.round(live / renderDeploys.length * 100);
            const withDur = renderDeploys.filter(d => d.finished_at);
            const avg = withDur.length ? Math.round(withDur.reduce((s, d) => s + (new Date(d.finished_at!).getTime() - new Date(d.created_at).getTime()) / 1000, 0) / withDur.length) : null;
            let streak = 0;
            for (const d of renderDeploys) { if (d.status === "live") streak++; else break; }
            const chips = [
              { label: "This week", value: String(week) },
              { label: "Success rate", value: `${rate}%`, color: rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-500" },
              { label: "Avg build", value: avg != null ? `${avg}s` : "—" },
              { label: "Streak", value: streak > 0 ? `${streak} ✓` : "—", color: streak >= 3 ? "text-emerald-600" : undefined },
            ];
            return (
              <div className="flex items-center gap-2 mb-2.5">
                {chips.map((c) => (
                  <div key={c.label} className="flex items-center gap-1.5 bg-white/60 border border-white/60 rounded-lg px-3 py-1.5 shadow-sm">
                    <span className={`text-[13px] font-semibold ${c.color ?? "text-gray-800"}`}>{c.value}</span>
                    <span className="text-[10px] text-gray-400">{c.label}</span>
                  </div>
                ))}
              </div>
            );
          })()}

          <>
            {activeService.service_type === "vercel" && (() => {
              const githubSvc = project.project_services.find(s => s.service_type === "github");
              const vercelUptime = uptimeData[`vercel:${activeService.resource_id}`];

              // --- Env vars tab ---
              if (vercelDetailTab === "env") {
                return (
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Environment Variables</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Values are redacted — names only</p>
                    </div>
                    {!envVarsLoaded && envVars.length === 0 ? (
                      <div className="px-5 py-8 text-[12px] text-gray-400 text-center">Loading…</div>
                    ) : envVars.length === 0 ? (
                      <div className="px-5 py-8 text-[12px] text-gray-400 text-center">No environment variables found</div>
                    ) : (
                      envVars.map((v, i) => (
                        <div key={i} className="flex items-center justify-between px-5 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/40 transition-colors group">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-[12px] font-mono font-medium text-gray-800 truncate">{v.key}</span>
                            <span className="text-[10px] font-mono text-gray-300 shrink-0">••••••••</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-4">
                            {(Array.isArray(v.target) ? v.target : [v.target]).map((t: string) => (
                              <span key={t} className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                                t === "production" ? "text-emerald-600 bg-emerald-50" :
                                t === "preview" ? "text-blue-500 bg-blue-50" :
                                "text-gray-500 bg-gray-100"
                              }`}>{t}</span>
                            ))}
                            {v.git_branch && (
                              <span className="text-[9px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{v.git_branch}</span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                );
              }

              // --- Deployments tab ---
              const filtered = deployments.filter(d => {
                if (vercelFilter === "production") return d.target === "production";
                if (vercelFilter === "preview") return d.target !== "production";
                if (vercelFilter === "failures") return d.state === "ERROR";
                return true;
              });
              const maxBuildDuration = Math.max(...filtered.map(d => d.build_duration ?? 0), 1);
              const groups = groupByDate(filtered);
              const FILTERS = [
                { key: "all",        label: "All" },
                { key: "production", label: "Production" },
                { key: "preview",    label: "Preview" },
                { key: "failures",   label: "Failures", count: deployments.filter(d => d.state === "ERROR").length },
              ] as const;

              return (
                <>
                  {/* Chart card */}
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100 mb-3">
                    <BuildTrendChart items={deployments.filter(d => d.build_duration != null).slice(0, 12).reverse().map(d => ({
                      label: d.commit_sha?.slice(0, 5) ?? "—",
                      duration: d.build_duration!,
                      status: d.state,
                      commit: d.commit_message ?? "",
                      ts: d.created_at,
                    }))} />
                    <DORAMetrics deployments={deployments} />
                    {vercelUptime && vercelUptime.checks.length > 0 && (
                      <div className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Uptime</p>
                          <div className="flex items-center gap-3 text-[10px] text-gray-400">
                            {vercelUptime.uptime_pct != null && <span className="font-medium text-gray-600">{vercelUptime.uptime_pct}%</span>}
                            {vercelUptime.avg_latency_ms != null && <span>{vercelUptime.avg_latency_ms}ms avg</span>}
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          {vercelUptime.checks.map((c, i) => (
                            <div key={i} title={`${c.is_up ? "Up" : "Down"} — ${new Date(c.checked_at).toLocaleString()}`}
                              className={`flex-1 h-5 rounded-sm ${c.is_up ? "bg-emerald-400/70" : "bg-red-400/80"}`} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Proactive failure alerts */}
                  {Object.entries(proactiveAlerts).map(([depId, alert]) => (
                    <div key={depId} className="mb-3 rounded-card border border-red-200 bg-red-50/60 px-4 py-3 animate-slide-up">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <svg className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <div>
                            <p className="text-[11px] font-semibold text-red-700 mb-0.5">Build failed — {alert.reason}</p>
                            {alert.fix && <p className="text-[11px] text-gray-600">{alert.fix}</p>}
                          </div>
                        </div>
                        <button onClick={() => setProactiveAlerts((prev) => { const n = { ...prev }; delete n[depId]; return n; })}
                          className="text-[10px] text-gray-400 hover:text-gray-600 shrink-0 transition-colors">✕</button>
                      </div>
                    </div>
                  ))}

                  {/* Deployment history card */}
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
                    <div className="flex items-center gap-1 px-5 py-2.5">
                      <span className="text-[11px] font-semibold text-gray-700 mr-2">Deployment History</span>
                      {FILTERS.map(f => (
                        <button
                          key={f.key}
                          onClick={() => setVercelFilter(f.key)}
                          className={`text-[11px] font-medium px-2.5 py-1 rounded-button transition-all ${
                            vercelFilter === f.key ? "bg-gray-900 text-white" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {"count" in f && f.count > 0 ? `${f.label} (${f.count})` : f.label}
                        </button>
                      ))}
                    </div>
                    {filtered.length === 0
                      ? <p className="text-sm text-gray-400 text-center py-12">No deployments match this filter</p>
                      : groups.map((group) => (
                          <div key={group.label}>
                            <div className="px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
                            </div>
                            {group.items.map((d, i) => (
                              <DeploymentRow
                                key={d.id}
                                deployment={d}
                                index={i}
                                maxBuildDuration={maxBuildDuration}
                                githubRepo={githubSvc?.resource_id}
                                initialAnalysis={proactiveAlerts[d.id]}
                                logsHref={d.team_slug ? `https://vercel.com/${d.team_slug}/${d.name || activeService?.resource_name}/deployments/${d.id}` : undefined}
                                onRedeploy={async (depId) => {
                                  setDeploying(true);
                                  try {
                                    const res = await apiFetch("/api/vercel/redeploy", { method: "POST", body: JSON.stringify({ deploymentId: depId }) });
                                    if (res.ok) {
                                      const nd = await res.json();
                                      setDeployments((prev) => [{ ...d, id: nd.id, state: "BUILDING", created_at: Date.now() }, ...prev]);
                                    }
                                  } finally { setDeploying(false); }
                                }}
                              />
                            ))}
                          </div>
                        ))
                    }
                  </div>
                </>
              );
            })()}
            {activeService.service_type === "github" && (
              <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
                {githubTab === "commits" && (
                  commits.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-12">No commits found</p>
                    : commits.map((c, i) => <CommitRow key={c.sha} commit={c} index={i} />)
                )}
                {githubTab === "prs" && (
                  pulls.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-12">No pull requests found</p>
                    : pulls.map((p, i) => <PRRow key={p.number} pr={p} index={i} />)
                )}
              </div>
            )}
            {activeService.service_type === "render" && (() => {
              const groups = groupByDate(renderDeploys);
              return (
                <>
                  {/* Chart card */}
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100 mb-3">
                    <BuildTrendChart items={renderDeploys.filter(d => d.finished_at).slice(0, 12).reverse().map(d => ({
                      label: d.commit_id?.slice(0, 5) ?? "—",
                      duration: Math.round((new Date(d.finished_at!).getTime() - new Date(d.created_at).getTime()) / 1000),
                      status: d.status,
                      commit: d.commit_message ?? "",
                      ts: new Date(d.created_at).getTime(),
                    }))} />
                  </div>
                  {/* Metrics card */}
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card p-4 mb-3">
                    <RenderMetricsChart serviceId={activeService.resource_id} />
                  </div>
                  {/* Runtime errors */}
                  {runtimeErrors.length > 0 && (
                    <div className="bg-white/95 backdrop-blur-[10px] border border-red-200/60 rounded-card shadow-card overflow-hidden divide-y divide-red-50 mb-3">
                      <div className="px-5 py-2.5 border-b border-red-100 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-[11px] font-semibold text-red-700">Runtime Errors</span>
                        <span className="ml-auto text-[10px] text-red-400">{runtimeErrors.length} detected</span>
                      </div>
                      {runtimeErrors.slice(0, 5).map((err) => (
                        <div key={err.id} className="px-5 py-3">
                          <div className="flex items-start justify-between gap-3 mb-1.5">
                            <span className="text-[12px] font-medium text-gray-800 truncate">{err.subtitle || err.title}</span>
                            <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">
                              {new Date(err.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          {err.metadata?.errors && err.metadata.errors.length > 1 && (
                            <div className="mt-1.5 bg-red-50 rounded px-2.5 py-2 font-mono text-[10px] text-red-600 space-y-0.5">
                              {err.metadata.errors.slice(0, 3).map((line, i) => (
                                <div key={i} className="truncate">{line}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Deploy history card */}
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
                    <div className="px-5 py-2.5 border-b border-gray-100">
                      <span className="text-[11px] font-semibold text-gray-700">Deployment History</span>
                    </div>
                    {renderDeploys.length === 0
                      ? <p className="text-sm text-gray-400 text-center py-12">No deploys found</p>
                      : groups.map((group) => (
                          <div key={group.label}>
                            <div className="px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{group.label}</span>
                            </div>
                            {group.items.map((d, i) => (
                              <RenderDeployRow
                                key={d.id}
                                deploy={d}
                                index={i}
                                serviceId={activeService.resource_id}
                                onViewLogs={(url, subtitle) => setLogDrawer({ logsUrl: url, title: "Deploy Logs", subtitle })}
                                onRedeploy={async (svcId) => {
                                  setDeploying(true);
                                  try {
                                    const res = await apiFetch("/api/render/deploy", { method: "POST", body: JSON.stringify({ serviceId: svcId }) });
                                    if (res.ok) { const nd = await res.json(); setRenderDeploys((prev) => [{ ...d, id: nd.id, status: "build_in_progress", created_at: nd.created_at }, ...prev]); }
                                  } finally { setDeploying(false); }
                                }}
                              />
                            ))}
                          </div>
                        ))
                    }
                  </div>
                </>
              );
            })()}
            {activeService.service_type === "supabase" && (
              <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
                {supabaseTab === "overview" && (
                  <>
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Services</p>
                      <div className="flex flex-wrap gap-3">
                        {supabaseHealth.length === 0
                          ? <p className="text-[12px] text-gray-400">Loading…</p>
                          : supabaseHealth.map((s) => (
                              <div key={s.name} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: SB_COLOR[s.status] ?? "#d1d5db" }} />
                                <span className="text-[12px] text-gray-600 capitalize">{s.name.replace(/_/g, " ")}</span>
                              </div>
                            ))
                        }
                      </div>
                    </div>
                    {supabaseOverview?.available.api_stats === false ? (
                      <div className="px-5 py-4 text-[12px] text-gray-400">API stats not available for this plan</div>
                    ) : !supabaseOverview ? (
                      <div className="px-5 py-4 text-[12px] text-gray-400">Loading…</div>
                    ) : supabaseOverview.api_stats.length === 0 ? (
                      <div className="px-5 py-4 text-[12px] text-gray-400">No API traffic data yet</div>
                    ) : (
                      <div className="px-5 pt-3 pb-1">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">API Requests — Last 7 Days</p>
                        <div className="flex items-end gap-1 h-16">
                          {(() => {
                            const max = Math.max(...supabaseOverview.api_stats.map((p) => p.count), 1);
                            return supabaseOverview.api_stats.slice(-7).map((point, i) => (
                              <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative">
                                <div
                                  className="w-full rounded-sm bg-brand-purple/40 hover:bg-brand-purple/70 transition-colors"
                                  style={{ height: `${Math.max(4, (point.count / max) * 56)}px` }}
                                />
                                <span className="text-[9px] text-gray-400 tabular-nums">
                                  {point.count >= 1000 ? `${(point.count / 1000).toFixed(1)}k` : point.count}
                                </span>
                                <div suppressHydrationWarning className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                                  {new Date(point.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}: {point.count.toLocaleString()}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {supabaseTab === "logs" && (
                  !supabaseOverview ? (
                    <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
                  ) : supabaseOverview.available.logs === false ? (
                    <p className="text-sm text-gray-400 text-center py-12">Log access not available for this plan</p>
                  ) : supabaseOverview.error_logs.length === 0 ? (
                    <div className="flex flex-col items-center py-12 gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <p className="text-sm text-gray-400">No errors in the last 24h</p>
                    </div>
                  ) : supabaseOverview.error_logs.map((log, i) => (
                    <div key={i} className="px-5 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/40 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        {log.status && (
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${log.status >= 500 ? "text-red-600 bg-red-50" : "text-amber-600 bg-amber-50"}`}>
                            {log.status}
                          </span>
                        )}
                        <span suppressHydrationWarning className="text-[11px] text-gray-400 shrink-0">
                          {new Date(log.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[12px] text-gray-700 font-mono truncate">{log.message || "—"}</p>
                    </div>
                  ))
                )}
                {supabaseTab === "history" && (
                  !supabaseOverview ? (
                    <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
                  ) : supabaseOverview.available.actions === false ? (
                    <p className="text-sm text-gray-400 text-center py-12">Action history not available</p>
                  ) : supabaseOverview.actions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-12">No actions found</p>
                  ) : supabaseOverview.actions.map((action) => (
                    <div key={action.id} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                          action.status === "COMPLETED" ? "text-emerald-600 bg-emerald-50" :
                          action.status === "FAILED" ? "text-red-500 bg-red-50" :
                          action.status === "IN_PROGRESS" ? "text-amber-500 bg-amber-50" :
                          "text-gray-500 bg-gray-100"
                        }`}>{action.status}</span>
                        {action.error_message && (
                          <span className="text-[12px] text-gray-500 truncate max-w-50">{action.error_message}</span>
                        )}
                      </div>
                      <span suppressHydrationWarning className="text-[11px] text-gray-400 shrink-0">{timeAgo(new Date(action.created_at).getTime())}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        </div>
      )}

      {/* Log drawer */}
      <LogDrawer
        logsUrl={logDrawer?.logsUrl ?? null}
        title={logDrawer?.title ?? ""}
        subtitle={logDrawer?.subtitle ?? ""}
        onClose={() => setLogDrawer(null)}
      />

      {/* Link panel modal */}
      {showLinkPanel && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-card shadow-2xl p-6 w-full max-w-md mx-4 animate-slide-up">
            <h2 className="text-[16px] font-semibold text-gray-900 mb-0.5">Link a Service</h2>
            <p className="text-[12px] text-gray-400 mb-4">Choose a service to link to <span className="font-medium text-gray-600">{project.name}</span></p>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-button p-0.5 mb-4">
              {(["vercel", "github", "render", "supabase"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setLinkTab(tab)}
                  className={`flex-1 text-[12px] font-medium py-1.5 rounded-button transition-all capitalize ${linkTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {tab === "vercel" ? "Vercel" : tab === "github" ? "GitHub" : tab === "render" ? "Render" : "Supabase"}
                </button>
              ))}
            </div>

            {linkTab === "vercel" && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {vercelProjects.filter((vp) => !project.project_services.some((s) => s.resource_id === vp.id)).length === 0
                  ? <p className="text-sm text-gray-400 text-center py-6">No Vercel projects available</p>
                  : vercelProjects
                      .filter((vp) => !project.project_services.some((s) => s.resource_id === vp.id))
                      .map((vp) => (
                        <button key={vp.id} onClick={() => handleLink("vercel", vp.id, vp.name)} disabled={linking} className="w-full text-left px-4 py-3 rounded-button border border-gray-200 hover:border-brand-purple hover:bg-brand-purple/5 transition-all text-[13px] text-gray-800 font-medium disabled:opacity-50">
                          {vp.name}
                        </button>
                      ))
                }
              </div>
            )}

            {linkTab === "github" && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {githubRepos.filter((r) => !project.project_services.some((s) => s.resource_id === r.full_name)).length === 0
                  ? <p className="text-sm text-gray-400 text-center py-6">No GitHub repos available</p>
                  : githubRepos
                      .filter((r) => !project.project_services.some((s) => s.resource_id === r.full_name))
                      .map((r) => (
                        <button key={r.id} onClick={() => handleLink("github", r.full_name, r.full_name)} disabled={linking} className="w-full text-left px-4 py-3 rounded-button border border-gray-200 hover:border-brand-purple hover:bg-brand-purple/5 transition-all text-[13px] text-gray-800 font-medium disabled:opacity-50">
                          {r.full_name}
                        </button>
                      ))
                }
              </div>
            )}

            {linkTab === "render" && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {renderServices.filter((r) => !project.project_services.some((s) => s.resource_id === r.id)).length === 0
                  ? <p className="text-sm text-gray-400 text-center py-6">No Render services available</p>
                  : renderServices
                      .filter((r) => !project.project_services.some((s) => s.resource_id === r.id))
                      .map((r) => (
                        <button key={r.id} onClick={() => handleLink("render", r.id, r.name)} disabled={linking} className="w-full text-left px-4 py-3 rounded-button border border-gray-200 hover:border-brand-purple hover:bg-brand-purple/5 transition-all disabled:opacity-50">
                          <div className="text-[13px] text-gray-800 font-medium">{r.name}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{r.type.replace("_", " ")} {r.suspended ? "· suspended" : ""}</div>
                        </button>
                      ))
                }
              </div>
            )}

            {linkTab === "supabase" && (
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {supabaseProjects.filter((p) => !project.project_services.some((s) => s.resource_id === p.ref)).length === 0
                  ? <p className="text-sm text-gray-400 text-center py-6">No Supabase projects available</p>
                  : supabaseProjects
                      .filter((p) => !project.project_services.some((s) => s.resource_id === p.ref))
                      .map((p) => (
                        <button key={p.ref} onClick={() => handleLink("supabase", p.ref, p.name)} disabled={linking} className="w-full text-left px-4 py-3 rounded-button border border-gray-200 hover:border-brand-purple hover:bg-brand-purple/5 transition-all disabled:opacity-50">
                          <div className="text-[13px] text-gray-800 font-medium">{p.name}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{p.region} · {p.status === "ACTIVE_HEALTHY" ? "Healthy" : p.status}</div>
                        </button>
                      ))
                }
              </div>
            )}

            <button onClick={() => setShowLinkPanel(false)} className="mt-3 w-full py-2.5 rounded-button border border-gray-200 text-gray-500 text-[13px] hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
