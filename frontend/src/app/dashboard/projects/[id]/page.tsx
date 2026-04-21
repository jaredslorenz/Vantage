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
  SupabaseProject, SupabaseServiceHealth, SupabaseOverview, SupabaseFunction, SupabaseStorage, SupabaseConfig, SupabaseTraffic, SupabaseTrafficDaily,
  DeployAnalysis, UptimeStatus, EnvVar, LogLine, RuntimeError,
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
import { SupabaseMetricsChart } from "@/components/project/SupabaseMetricsChart";
import { SupabaseLogsPanel } from "@/components/project/SupabaseLogsPanel";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

// --- Log drawer ---
function LogDrawer({ logsUrl, title, subtitle, isLive, onClose }: {
  logsUrl: string | null; title: string; subtitle: string; isLive?: boolean; onClose: () => void;
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    if (!logsUrl) return;
    setLines([]);
    setLive(!!isLive);
    setLoading(true);

    if (isLive) {
      // SSE streaming for live logs
      const controller = new AbortController();
      apiFetch(logsUrl, { signal: controller.signal }).then(async (resp) => {
        if (!resp.ok || !resp.body) { setLoading(false); return; }
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        setLoading(false);
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
              const dataLine = part.split("\n").find(l => l.startsWith("data:"));
              if (!dataLine) continue;
              try {
                const entry = JSON.parse(dataLine.slice(5).trim());
                if (entry.text) setLines(prev => [...prev, entry]);
              } catch { /* ignore malformed */ }
            }
          }
        } catch { /* aborted */ }
      }).catch(() => setLoading(false));
      return () => controller.abort();
    } else {
      // JSON fetch for static logs
      apiFetch(logsUrl)
        .then((r) => r.json())
        .then((d) => { setLines(d.lines ?? []); setLoading(false); })
        .catch(() => setLoading(false));
    }
  }, [logsUrl, isLive]);

  // Track scroll position to know if user is at bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onScroll = () => { atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Auto-scroll: on initial load go to first error; when live and at bottom, follow tail
  useEffect(() => {
    if (!loading && lines.length > 0) {
      setTimeout(() => {
        if (!live && errorRef.current) {
          errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (live && atBottomRef.current) {
          containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
        } else if (!live) {
          containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: "smooth" });
        }
      }, 100);
    }
  }, [loading, lines, live]);

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
            {live && (
              <span className="flex items-center gap-1.5 text-[11px] text-red-400">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                Live
              </span>
            )}
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

// --- Error modal ---
type ErrorModalData = { id: string; label: string; fullTime: string; commit?: string; type: "runtime" | "build"; details?: string[]; logsUrl?: string; };
type AIErrorResult = { error: string; root_cause: string; fix: string };
const _errorAICache = new Map<string, AIErrorResult>();
function _getAICache(id: string): AIErrorResult | undefined {
  if (_errorAICache.has(id)) return _errorAICache.get(id);
  try { const s = sessionStorage.getItem(`vai_${id}`); if (s) { const r = JSON.parse(s); _errorAICache.set(id, r); return r; } } catch {}
}
function _setAICache(id: string, r: AIErrorResult) {
  _errorAICache.set(id, r);
  try { sessionStorage.setItem(`vai_${id}`, JSON.stringify(r)); } catch {}
}

function ErrorModal({ data, onClose }: { data: ErrorModalData; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>(data.details ?? []);
  const [loading, setLoading] = useState(false);
  const [ai, setAi] = useState<AIErrorResult | null>(_getAICache(data.id) ?? null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Load logs
  useEffect(() => {
    if (data.details) { setLines(data.details); return; }
    if (!data.logsUrl) return;
    setLoading(true);
    apiFetch(data.logsUrl)
      .then(r => r.json())
      .then(d => {
        const raw: unknown[] = d.lines ?? [];
        const parsed = raw.map(l =>
          typeof l === "string" ? l : (l as { text?: string; message?: string }).text ?? (l as { message?: string }).message ?? ""
        ).filter(Boolean);
        setLines(parsed.length ? parsed : []);
      })
      .catch(() => setLines([]))
      .finally(() => setLoading(false));
  }, [data.logsUrl, data.details]);

  // Fire AI analysis once logs are ready, skip if cached
  useEffect(() => {
    if (_getAICache(data.id)) return;
    if (loading) return;
    if (lines.length === 0) return;
    setAiLoading(true);
    apiFetch("/api/insights/analyze-error", {
      method: "POST",
      body: JSON.stringify({ lines: lines.slice(0, 80), error_type: data.type }),
    })
      .then(r => r.json())
      .then((result: AIErrorResult) => {
        _setAICache(data.id, result);
        setAi(result);
      })
      .catch(() => {})
      .finally(() => setAiLoading(false));
  }, [loading, lines, data.id, data.type]);

  const errorLines = lines.filter(l => /error|fatal|exception|traceback/i.test(l));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${data.type === "build" ? "text-red-600 bg-red-50" : "text-red-600 bg-red-50"}`}>{data.type} error</span>
            <h2 className="text-[14px] font-semibold text-gray-900 truncate">{data.label}</h2>
          </div>
          <button onClick={onClose} className="ml-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-4 px-6 py-3 bg-gray-50/60 border-b border-gray-100 flex-wrap">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 mb-0.5">When</div>
            <div className="text-[12px] text-gray-700">{data.fullTime}</div>
          </div>
          {data.commit && (
            <div className="min-w-0">
              <div className="text-[9px] uppercase tracking-wider text-gray-400 mb-0.5">Commit</div>
              <div className="text-[12px] text-gray-700 truncate max-w-xs">{data.commit}</div>
            </div>
          )}
          {errorLines.length > 0 && (
            <div className="ml-auto">
              <span className="text-[10px] font-medium text-red-500">{errorLines.length} error line{errorLines.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* AI insight */}
          <div className="px-6 py-4 border-b border-gray-100">
            {aiLoading || loading ? (
              <div className="flex items-center gap-2 text-[12px] text-gray-400">
                <svg className="w-3.5 h-3.5 animate-spin text-brand-purple" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                Analyzing with AI…
              </div>
            ) : ai ? (
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 mb-3">
                  <svg className="w-3.5 h-3.5 text-brand-purple" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
                  <span className="text-[10px] font-semibold text-brand-purple uppercase tracking-wider">AI Analysis</span>
                </div>
                <div>
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Error</div>
                  <p className="text-[12px] text-gray-800 font-medium">{ai.error}</p>
                </div>
                <div>
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Root Cause</div>
                  <p className="text-[12px] text-gray-700">{ai.root_cause}</p>
                </div>
                <div>
                  <div className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Fix</div>
                  <p className="text-[12px] text-emerald-700 font-medium">{ai.fix}</p>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-gray-400">No AI analysis available</p>
            )}
          </div>

          {/* Log output */}
          <div className="bg-gray-950 p-4 min-h-30">
            {loading ? (
              <p className="text-[12px] text-gray-500 text-center py-6">Loading logs…</p>
            ) : lines.length === 0 ? (
              <p className="text-[12px] text-gray-600 text-center py-6">No log output available</p>
            ) : (
              <div className="font-mono text-[11px] space-y-0.5">
                {lines.map((line, i) => {
                  const isErr = /error|fatal|exception|traceback/i.test(line);
                  return (
                    <div key={i} className={`whitespace-pre-wrap break-all leading-5 ${isErr ? "text-red-400 font-medium" : "text-gray-400"}`}>
                      {line}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-2.5 border-t border-gray-100 bg-gray-50/60">
          <span className="text-[10px] text-gray-400">{lines.length} lines · ESC to close</span>
        </div>
      </div>
    </div>
  );
}

// --- Error row ---
function ErrorRow({ id, label, time, fullTime, commit, type, details, logsUrl, onOpen }: {
  id: string; label: string; time: string; fullTime?: string; commit?: string;
  type: "runtime" | "build"; details?: string[]; logsUrl?: string;
  onOpen: (data: ErrorModalData) => void;
}) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => onOpen({ id, label, fullTime: fullTime ?? time, commit, type, details, logsUrl })}
        className="w-full px-5 py-3 text-left hover:bg-gray-50/60 transition-colors group"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${type === "build" ? "text-red-600 bg-red-50" : "text-red-600 bg-red-50"}`}>{type}</span>
          <span className="text-[10px] text-gray-400 ml-auto">{time}</span>
          <svg className="w-3 h-3 text-gray-300 group-hover:text-brand-purple transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6" /></svg>
        </div>
        <p className="text-[12px] font-medium text-gray-800 truncate">{label}</p>
        {commit && <p className="text-[11px] text-gray-400 truncate mt-0.5">{commit}</p>}
      </button>
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
  const [supabaseFunctions, setSupabaseFunctions] = useState<SupabaseFunction[]>([]);
  const [supabaseStorage, setSupabaseStorage] = useState<SupabaseStorage | null>(null);
  const [supabaseConfig, setSupabaseConfig] = useState<SupabaseConfig | null>(null);
  const [supabaseTraffic, setSupabaseTraffic] = useState<SupabaseTraffic | null>(null);
  const [supabaseTrafficDaily, setSupabaseTrafficDaily] = useState<SupabaseTrafficDaily | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkTab, setLinkTab] = useState<"vercel" | "github" | "render" | "supabase">("vercel");
  const [githubTab, setGithubTab] = useState<"commits" | "prs">("commits");
  const [linking, setLinking] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const [logDrawer, setLogDrawer] = useState<{ logsUrl: string; title: string; subtitle: string; isLive?: boolean } | null>(null);
  const [errorModal, setErrorModal] = useState<ErrorModalData | null>(null);
  const [vercelFilter, setVercelFilter] = useState<"all" | "production" | "failures" | "preview">("all");
  const [vercelDetailTab, setVercelDetailTab] = useState<"deployments" | "env">("deployments");
  const [uptimeData, setUptimeData] = useState<Record<string, UptimeStatus>>({});
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [envVarsLoaded, setEnvVarsLoaded] = useState(false);
  const [proactiveAlerts, setProactiveAlerts] = useState<Record<string, DeployAnalysis>>({});
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeError[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const [showAllDeploys, setShowAllDeploys] = useState(false);
  const [showAllVercel, setShowAllVercel] = useState(false);
  const [showAllCommits, setShowAllCommits] = useState(false);
  const [showAllPRs, setShowAllPRs] = useState(false);
  const prevVercelStates = useRef<Record<string, string>>({});
  const prevRenderStates = useRef<Record<string, string>>({});

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
              .then((r) => r.json()).then((d) => setSupabaseOverview(d)).catch(() => {}),
            apiFetch(`/api/supabase/projects/${supabaseSvc.resource_id}/functions`)
              .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseFunctions(d.functions ?? []); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${supabaseSvc.resource_id}/storage`)
              .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseStorage(d); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${supabaseSvc.resource_id}/config`)
              .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseConfig(d); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${supabaseSvc.resource_id}/traffic`)
              .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseTraffic(d); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${supabaseSvc.resource_id}/traffic/daily`)
              .then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseTrafficDaily(d); }).catch(() => {})
          );
        }
        return Promise.all(fetches);
      })
      .catch(() => {})
      .finally(() => { setLoading(false); setLastFetchedAt(Date.now()); });
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
          if ((row.event_type as string) === "runtime_error") {
            apiFetch(`/api/events?event_type=runtime_error&project_id=${p.id}&limit=20`)
              .then((r) => r.json()).then((d) => setRuntimeErrors(d.events ?? [])).catch(() => {});
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
            const settled = newDeploys.some(
              (dep: { id: string; state: string }) =>
                prevVercelStates.current[dep.id] === "BUILDING" &&
                (dep.state === "READY" || dep.state === "ERROR")
            );
            prevVercelStates.current = Object.fromEntries(newDeploys.map((dep: { id: string; state: string }) => [dep.id, dep.state]));
            setDeployments(newDeploys);
          })
          .catch(() => {});
      }
      if (buildingRender) {
        const svc = project?.project_services.find((s) => s.service_type === "render");
        if (svc) apiFetch(`/api/render/deploys?serviceId=${svc.resource_id}&limit=20`)
          .then((r) => r.json())
          .then((d) => {
            const newDeploys = d.deploys ?? [];
            prevRenderStates.current = Object.fromEntries(newDeploys.map((dep: { id: string; status: string }) => [dep.id, dep.status]));
            setRenderDeploys(newDeploys);
          })
          .catch(() => {});
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [deployments, renderDeploys, project]);


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
          if (svc?.url) runCheck("render", renderSvc.resource_id, svc.url.replace(/\/$/, "") + "/health");
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
            apiFetch(`/api/supabase/projects/${resourceId}/functions`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseFunctions(d.functions ?? []); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${resourceId}/storage`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseStorage(d); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${resourceId}/config`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseConfig(d); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${resourceId}/traffic`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseTraffic(d); }).catch(() => {}),
            apiFetch(`/api/supabase/projects/${resourceId}/traffic/daily`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setSupabaseTrafficDaily(d); }).catch(() => {}),
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
          body: JSON.stringify({ deploymentId: latest.id, projectId: activeService.resource_id }),
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
    if (serviceType === "supabase") { setSupabaseHealth([]); setSupabaseOverview(null); setSupabaseFunctions([]); setSupabaseStorage(null); setSupabaseConfig(null); setSupabaseTraffic(null); setSupabaseTrafficDaily(null); }
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
      <div className="mb-4 flex items-start justify-between">
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
          const live = renderDeploys.filter(d => d.status === "live" || d.status === "deactivated").length;
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
          <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-card px-5 py-4 shadow-card animate-slide-up">
            <span className="text-xl shrink-0">⚠️</span>
            <div>
              <p className="text-[13px] font-semibold text-amber-900">Deployment Issue Detected</p>
              <p className="text-[12px] text-amber-700 mt-0.5">{alert.message}</p>
            </div>
          </div>
        );
      })()}

      {/* AI health insight + errors */}
      {project.project_services.length > 0 && (
        <InsightPanel
          projectId={project.id}
          runtimeErrors={runtimeErrors}
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
          className="grid gap-3.5 mb-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(project.project_services.length, 4)}, minmax(0, 1fr))` }}
        >
          {project.project_services.map((svc) => {
            if (svc.service_type === "vercel") {
              return <VercelCard key={svc.id} service={svc} deployments={deployments} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} uptime={uptimeData[`vercel:${svc.resource_id}`]} hasRuntimeErrors={runtimeErrors.some(e => e.service === "vercel")} onInvestigate={() => setSelectedService(svc.id)} />;
            }
            if (svc.service_type === "github") {
              return <GitHubCard key={svc.id} service={svc} commits={commits} pulls={pulls} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} />;
            }
            if (svc.service_type === "render") {
              return <RenderCard key={svc.id} service={svc} deploys={renderDeploys} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} hasRuntimeErrors={runtimeErrors.some(e => e.service === "render")} uptime={uptimeData[`render:${svc.resource_id}`]} onInvestigate={() => setSelectedService(svc.id)} />;
            }
            if (svc.service_type === "supabase") {
              return <SupabaseCard key={svc.id} service={svc} health={supabaseHealth} overview={supabaseOverview} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} hasRuntimeErrors={runtimeErrors.some(e => e.service === "supabase")} />;
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
                <div>
                  <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">Supabase</h2>
                  <p className="text-[11px] text-white/40 mt-0.5">{activeService.resource_name}</p>
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
              {lastFetchedAt && (
                <span className="text-[10px] text-white/40 tabular-nums">{timeAgo(lastFetchedAt)}</span>
              )}
              {(activeService.service_type === "vercel" || activeService.service_type === "render") && (
                confirmDeploy ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-white/70">Sure?</span>
                    <button
                      onClick={() => { setConfirmDeploy(false); handleDeploy(); }}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-button bg-white/30 text-white hover:bg-white/40 transition-all border border-white/40"
                    >Yes</button>
                    <button
                      onClick={() => setConfirmDeploy(false)}
                      className="text-[11px] font-medium px-2.5 py-1 rounded-button text-white/60 hover:text-white transition-colors"
                    >Cancel</button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeploy(true)}
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
                )
              )}
              <button onClick={() => handleUnlink(activeService.id, activeService.service_type)} className="text-[11px] font-medium px-3 py-1 rounded-button border border-red-400/60 text-red-400 hover:bg-red-400/10 transition-all">
                Unlink
              </button>
            </div>
          </div>


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
              const vercelWeek = deployments.filter(d => Date.now() - d.created_at < 7 * 86400000).length;
              const vercelReady = deployments.filter(d => d.state === "READY").length;
              const vercelRate = deployments.length ? Math.round(vercelReady / deployments.length * 100) : 0;
              const vercelWithDur = deployments.filter(d => d.build_duration != null);
              const vercelAvg = vercelWithDur.length ? Math.round(vercelWithDur.reduce((s, d) => s + d.build_duration!, 0) / vercelWithDur.length) : null;
              let vercelStreak = 0;
              for (const d of deployments) { if (d.state === "READY") vercelStreak++; else break; }
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
                    <div className="flex items-center justify-between px-5 py-2 bg-gray-50/60 border-t border-gray-100 gap-6">
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stats</span>
                        {([
                          { label: "This week", value: String(vercelWeek) },
                          { label: "Success", value: `${vercelRate}%`, color: vercelRate >= 80 ? "text-emerald-600" : vercelRate >= 50 ? "text-amber-600" : "text-red-500" },
                          { label: "Avg build", value: vercelAvg != null ? `${vercelAvg}s` : "—" },
                          ...(vercelStreak >= 2 ? [{ label: "Streak", value: `${vercelStreak} ✓`, color: "text-emerald-600" }] : []),
                        ] as { label: string; value: string; color?: string }[]).map((s, i) => (
                          <span key={s.label} className="flex items-center gap-1.5">
                            {i > 0 && <span className="text-gray-200">·</span>}
                            <span className={`text-[11px] font-semibold ${s.color ?? "text-gray-900"}`}>{s.value}</span>
                            <span className="text-[10px] text-gray-400">{s.label}</span>
                          </span>
                        ))}
                      </div>
                      <DORAMetrics deployments={deployments} inline />
                    </div>
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

                  {/* Deploy history + Errors 2-col grid */}
                  <div className="grid grid-cols-2 gap-3">
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
                      : (() => {
                          const visibleFiltered = showAllVercel ? filtered : filtered.slice(0, 5);
                          const visibleGroups = groupByDate(visibleFiltered);
                          return (
                            <>
                              {visibleGroups.map((group) => (
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
                                      projectId={activeService?.resource_id}
                                      onRedeploy={async (depId) => {
                                        setDeploying(true);
                                        try {
                                          const res = await apiFetch("/api/vercel/redeploy", { method: "POST", body: JSON.stringify({ deploymentId: depId, projectId: activeService?.resource_id }) });
                                          if (res.ok) {
                                            const nd = await res.json();
                                            setDeployments((prev) => [{ ...d, id: nd.id, state: "BUILDING", created_at: Date.now() }, ...prev]);
                                          }
                                        } finally { setDeploying(false); }
                                      }}
                                    />
                                  ))}
                                </div>
                              ))}
                              {filtered.length > 5 && (
                                <button
                                  onClick={() => setShowAllVercel((v) => !v)}
                                  className="w-full py-2.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border-t border-gray-100"
                                >
                                  {showAllVercel ? "Show less" : `View all ${filtered.length} deployments`}
                                </button>
                              )}
                            </>
                          );
                        })()
                    }
                  </div>
                  {/* Vercel Errors card */}
                  {(() => {
                    const vercelRuntimeErrors = runtimeErrors.filter(e => e.service === "vercel");
                    const vercelBuildErrors = deployments.filter(d => d.state === "ERROR").slice(0, 5);
                    const hasErrors = vercelRuntimeErrors.length > 0 || vercelBuildErrors.length > 0;
                    return (
                      <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            Errors {hasErrors && <span className="text-red-500 ml-1">{vercelRuntimeErrors.length + vercelBuildErrors.length}</span>}
                          </p>
                        </div>
                        {!hasErrors ? (
                          <div className="px-5 py-8 text-center">
                            <p className="text-[12px] text-gray-400">No errors detected</p>
                          </div>
                        ) : (
                          <>
                            {vercelRuntimeErrors.length > 0 && (
                              <>
                                <div className="px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Runtime</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {vercelRuntimeErrors.slice(0, 5).map((e) => (
                                    <ErrorRow
                                      key={e.id} id={e.id}
                                      type="runtime"
                                      label={e.subtitle || e.title}
                                      time={new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      fullTime={new Date(e.timestamp).toLocaleString()}
                                      details={e.metadata?.errors}
                                      onOpen={setErrorModal}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                            {vercelBuildErrors.length > 0 && (
                              <>
                                <div className="px-5 py-1.5 bg-gray-50/80 border-b border-gray-100 border-t border-t-gray-100">
                                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Build</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {vercelBuildErrors.map((d) => (
                                    <ErrorRow
                                      key={d.id} id={d.id}
                                      type="build"
                                      label="Build failed"
                                      commit={d.commit_message ?? undefined}
                                      time={new Date(d.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      fullTime={new Date(d.created_at).toLocaleString()}
                                      logsUrl={`/api/vercel/deployments/${d.id}/logs?projectId=${activeService?.resource_id}`}
                                      onOpen={setErrorModal}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                  </div>{/* end deploy+errors grid */}
                </>
              );
            })()}
            {activeService.service_type === "github" && (
              <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
                {githubTab === "commits" && (
                  commits.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-12">No commits found</p>
                    : <>
                        {(showAllCommits ? commits : commits.slice(0, 5)).map((c, i) => <CommitRow key={c.sha} commit={c} index={i} />)}
                        {commits.length > 5 && (
                          <button
                            onClick={() => setShowAllCommits((v) => !v)}
                            className="w-full py-2.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border-t border-gray-100"
                          >
                            {showAllCommits ? "Show less" : `View all ${commits.length} commits`}
                          </button>
                        )}
                      </>
                )}
                {githubTab === "prs" && (
                  pulls.length === 0
                    ? <p className="text-sm text-gray-400 text-center py-12">No pull requests found</p>
                    : <>
                        {(showAllPRs ? pulls : pulls.slice(0, 5)).map((p, i) => <PRRow key={p.number} pr={p} index={i} />)}
                        {pulls.length > 5 && (
                          <button
                            onClick={() => setShowAllPRs((v) => !v)}
                            className="w-full py-2.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border-t border-gray-100"
                          >
                            {showAllPRs ? "Show less" : `View all ${pulls.length} pull requests`}
                          </button>
                        )}
                      </>
                )}
              </div>
            )}
            {activeService.service_type === "render" && (() => {
              const week = renderDeploys.filter(d => Date.now() - new Date(d.created_at).getTime() < 7 * 86400000).length;
              const maxRenderBuildDuration = Math.max(...renderDeploys.filter(d => d.finished_at).map(d => Math.round((new Date(d.finished_at!).getTime() - new Date(d.created_at).getTime()) / 1000)), 1);
              const live = renderDeploys.filter(d => d.status === "live" || d.status === "deactivated").length;
              const rate = renderDeploys.length ? Math.round(live / renderDeploys.length * 100) : 0;
              const withDur = renderDeploys.filter(d => d.finished_at);
              const avg = withDur.length ? Math.round(withDur.reduce((s, d) => s + (new Date(d.finished_at!).getTime() - new Date(d.created_at).getTime()) / 1000, 0) / withDur.length) : null;
              let streak = 0;
              for (const d of renderDeploys) { if (d.status === "live" || d.status === "deactivated") streak++; else break; }
              const renderUptime = uptimeData[`render:${activeService.resource_id}`];
              return (
                <>
                  {/* 2 cards side by side */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {/* Build trend card */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                      <BuildTrendChart items={renderDeploys.filter(d => d.finished_at).slice(0, 12).reverse().map(d => ({
                        label: d.commit_id?.slice(0, 5) ?? "—",
                        duration: Math.round((new Date(d.finished_at!).getTime() - new Date(d.created_at).getTime()) / 1000),
                        status: d.status,
                        commit: d.commit_message ?? "",
                        ts: new Date(d.created_at).getTime(),
                      }))} />
                      <div className={`grid ${streak >= 2 ? "grid-cols-4" : "grid-cols-3"} divide-x divide-gray-100 border-t border-gray-100`}>
                        <div className="px-4 py-2.5 text-center">
                          <div className="text-[13px] font-semibold text-gray-900">{week}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">This week</div>
                        </div>
                        <div className="px-4 py-2.5 text-center">
                          <div className={`text-[13px] font-semibold ${rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-500"}`}>{rate}%</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Success</div>
                        </div>
                        <div className="px-4 py-2.5 text-center">
                          <div className="text-[13px] font-semibold text-gray-900">{avg != null ? `${avg}s` : "—"}</div>
                          <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Avg build</div>
                        </div>
                        {streak >= 2 && (
                          <div className="px-4 py-2.5 text-center">
                            <div className="text-[13px] font-semibold text-emerald-600">{streak} ✓</div>
                            <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Streak</div>
                          </div>
                        )}
                      </div>
                      {renderUptime && renderUptime.checks.length > 0 && (
                        <div className="px-5 py-3 border-t border-gray-100">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Uptime</p>
                            <div className="flex items-center gap-3 text-[10px] text-gray-400">
                              {renderUptime.uptime_pct != null && <span className="font-medium text-gray-600">{renderUptime.uptime_pct}%</span>}
                              {renderUptime.avg_latency_ms != null && <span>{renderUptime.avg_latency_ms}ms avg</span>}
                            </div>
                          </div>
                          <div className="flex gap-0.5">
                            {renderUptime.checks.map((c, i) => (
                              <div key={i} title={`${c.is_up ? "Up" : "Down"} — ${new Date(c.checked_at).toLocaleString()}`}
                                className={`flex-1 h-5 rounded-sm ${c.is_up ? "bg-emerald-400/70" : "bg-red-400/80"}`} />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Metrics card */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card p-4">
                      <RenderMetricsChart serviceId={activeService.resource_id} />
                    </div>
                  </div>

                  {/* Deploy history + Errors */}
                  <div className="grid grid-cols-2 gap-3">
                  {/* Deploy history card */}
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Deployment History</p>
                    </div>
                    {renderDeploys.length === 0
                      ? <p className="text-sm text-gray-400 text-center py-12">No deploys found</p>
                      : (() => {
                          const visibleDeploys = showAllDeploys ? renderDeploys : renderDeploys.slice(0, 5);
                          const visibleGroups = groupByDate(visibleDeploys);
                          return (
                            <>
                              {visibleGroups.map((group) => (
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
                                      maxBuildDuration={maxRenderBuildDuration}
                                      onViewLogs={(url, subtitle, isLive) => setLogDrawer({ logsUrl: url, title: "Deploy Logs", subtitle, isLive })}
                                      onRedeploy={async (svcId, commitId) => {
                                        setDeploying(true);
                                        try {
                                          const res = await apiFetch("/api/render/deploy", { method: "POST", body: JSON.stringify({ serviceId: svcId, ...(commitId ? { commitId } : {}) }) });
                                          if (res.ok) { const nd = await res.json(); setRenderDeploys((prev) => [{ ...d, id: nd.id, status: "build_in_progress", created_at: nd.created_at }, ...prev]); }
                                        } finally { setDeploying(false); }
                                      }}
                                    />
                                  ))}
                                </div>
                              ))}
                              {renderDeploys.length > 5 && (
                                <button
                                  onClick={() => setShowAllDeploys((v) => !v)}
                                  className="w-full py-2.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors border-t border-gray-100"
                                >
                                  {showAllDeploys ? "Show less" : `View all ${renderDeploys.length} deploys`}
                                </button>
                              )}
                            </>
                          );
                        })()
                    }
                  </div>
                  {/* Errors card */}
                  {(() => {
                    const buildErrors = renderDeploys.filter(d => d.status === "build_failed").slice(0, 5);
                    const allRenderErrors = runtimeErrors.filter(e => e.service === "render");
                    const metricAlerts = allRenderErrors.filter(e => e.metadata?.alert_type);
                    const renderRuntimeErrors = allRenderErrors.filter(e => !e.metadata?.alert_type);
                    const hasErrors = buildErrors.length > 0 || allRenderErrors.length > 0;
                    return (
                      <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            Errors {hasErrors && <span className="text-red-500 ml-1">{buildErrors.length + allRenderErrors.length}</span>}
                          </p>
                        </div>
                        {!hasErrors ? (
                          <div className="px-5 py-8 text-center">
                            <p className="text-[12px] text-gray-400">No errors detected</p>
                          </div>
                        ) : (
                          <>
                            {metricAlerts.length > 0 && (
                              <>
                                <div className="px-5 py-1.5 bg-amber-50/80 border-b border-amber-100">
                                  <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Resource Alerts</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {metricAlerts.map((e) => (
                                    <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                                      <span className="text-base shrink-0">{e.metadata?.alert_type === "memory" ? "🧠" : "⚡"}</span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-[12px] font-medium text-gray-800">{e.title}</p>
                                        <p className="text-[11px] text-gray-500 truncate">{e.subtitle}</p>
                                      </div>
                                      {e.metadata?.mem_pct !== undefined && (
                                        <div className="shrink-0 text-right">
                                          <div className={`text-[13px] font-bold ${e.metadata.mem_pct > 90 ? "text-red-500" : "text-amber-500"}`}>{e.metadata.mem_pct}%</div>
                                          <div className="text-[9px] text-gray-400 uppercase">{e.metadata.mem_mb} MB / {e.metadata.limit_mb} MB</div>
                                        </div>
                                      )}
                                      {e.metadata?.cpu_pct !== undefined && (
                                        <div className="shrink-0 text-right">
                                          <div className={`text-[13px] font-bold ${e.metadata.cpu_pct > 90 ? "text-red-500" : "text-amber-500"}`}>{e.metadata.cpu_pct}%</div>
                                          <div className="text-[9px] text-gray-400 uppercase">{e.metadata.cpu_mcpu} mCPU</div>
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            {renderRuntimeErrors.length > 0 && (
                              <>
                                <div className="px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Runtime</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {renderRuntimeErrors.slice(0, 5).map((e) => (
                                    <ErrorRow
                                      key={e.id} id={e.id}
                                      type="runtime"
                                      label={e.subtitle || e.title}
                                      time={new Date(e.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                      fullTime={new Date(e.timestamp).toLocaleString()}
                                      details={e.metadata?.errors}
                                      onOpen={setErrorModal}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                            {buildErrors.length > 0 && (
                              <>
                                <div className="px-5 py-1.5 bg-gray-50/80 border-b border-gray-100 border-t border-t-gray-100">
                                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Build</span>
                                </div>
                                <div className="divide-y divide-gray-100">
                                  {buildErrors.map((d) => (
                                    <ErrorRow
                                      key={d.id} id={d.id}
                                      type="build"
                                      label="Build failed"
                                      commit={d.commit_message ?? undefined}
                                      time={timeAgo(d.created_at)}
                                      fullTime={new Date(d.created_at).toLocaleString()}
                                      logsUrl={`/api/render/deploys/${activeService.resource_id}/${d.id}/logs`}
                                      onOpen={setErrorModal}
                                    />
                                  ))}
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                  </div>{/* end deploy+errors grid */}
                </>
              );
            })()}
            {activeService.service_type === "supabase" && (() => {
              const supabaseSvc = project.project_services.find((s) => s.service_type === "supabase");
              const healthyCount = supabaseHealth.filter((s) => s.status === "ACTIVE_HEALTHY").length;
              const totalRequests = supabaseOverview?.api_stats.reduce((sum, p) => sum + p.count, 0) ?? null;
              const errorCount = supabaseOverview?.error_logs.length ?? null;
              const PROVIDER_ICONS: Record<string, string> = {
                email: "✉", phone: "📱", google: "G", github: "⌥", gitlab: "🦊",
                discord: "◎", apple: "⌘", twitter: "𝕏", facebook: "f", slack: "s",
                spotify: "♪", twitch: "t", azure: "Az", bitbucket: "⚙", notion: "N",
                zoom: "z", keycloak: "🔑",
              };
              return (
                <div className="space-y-3">
                  {/* Row 0: Project config + Auth providers */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Project details */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Project</p>
                      </div>
                      {!supabaseConfig ? (
                        <div className="space-y-2 px-5 py-3 animate-pulse">{[0,1,2].map(i => <div key={i} className="h-5 bg-gray-50 rounded" />)}</div>
                      ) : (
                        <div className="px-5 py-3 space-y-2.5">
                          {[
                            { label: "Region", value: supabaseConfig.project?.region ?? null },
                            { label: "DB Host", value: supabaseConfig.project?.db_host ?? null, mono: true },
                            { label: "Status", value: supabaseConfig.project?.status?.replace(/_/g, " ") ?? null },
                            { label: "Created", value: supabaseConfig.project?.created_at ? new Date(supabaseConfig.project.created_at).toLocaleDateString() : null },
                          ].map(({ label, value, mono }) => (
                            <div key={label} className="flex items-center justify-between gap-3">
                              <span className="text-[10px] text-gray-400 uppercase tracking-wider shrink-0">{label}</span>
                              <span className={`text-[11px] text-gray-700 truncate ${mono ? "font-mono" : "font-medium"}`}>{value ?? "—"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Auth providers */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Auth</p>
                        {supabaseConfig?.auth && (
                          <div className="flex items-center gap-2">
                            {supabaseConfig.auth.mfa_enabled && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-purple/10 text-brand-purple">MFA</span>}
                            {supabaseConfig.auth.anonymous_sign_ins && <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">Anon</span>}
                          </div>
                        )}
                      </div>
                      {!supabaseConfig ? (
                        <div className="space-y-2 px-5 py-3 animate-pulse">{[0,1].map(i => <div key={i} className="h-8 bg-gray-50 rounded" />)}</div>
                      ) : (
                        <div className="px-5 py-3 space-y-3">
                          {supabaseConfig.auth?.site_url && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-gray-400 uppercase tracking-wider shrink-0">Site URL</span>
                              <span className="text-[11px] text-gray-600 font-mono truncate">{supabaseConfig.auth.site_url}</span>
                            </div>
                          )}
                          {supabaseConfig.auth?.min_password_length != null && (
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] text-gray-400 uppercase tracking-wider shrink-0">Min Password</span>
                              <span className="text-[11px] text-gray-700 font-medium">{supabaseConfig.auth.min_password_length} chars</span>
                            </div>
                          )}
                          <div>
                            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1.5">Providers</p>
                            {(supabaseConfig.auth?.providers ?? []).length === 0 ? (
                              <p className="text-[11px] text-gray-400">No external providers enabled</p>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {(supabaseConfig.auth?.providers ?? []).map((p) => (
                                  <span key={p} className="flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600 capitalize">
                                    <span className="text-[9px]">{PROVIDER_ICONS[p] ?? "○"}</span>
                                    {p}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 1: Services + Infrastructure */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Services — enriched with per-service traffic breakdown */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden flex flex-col">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Services</p>
                        {supabaseHealth.length > 0 && (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${healthyCount === supabaseHealth.length ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                            {healthyCount}/{supabaseHealth.length} healthy
                          </span>
                        )}
                      </div>
                      <div className="divide-y divide-gray-100 flex-1">
                        {supabaseHealth.length === 0
                          ? <div className="px-5 py-3 animate-pulse space-y-2">{[0,1,2,3].map(i => <div key={i} className="h-10 bg-gray-50 rounded-lg" />)}</div>
                          : (() => {
                              return supabaseHealth.map((s) => {
                                const slug = s.name === "db" ? "database" : s.name;
                                const traffic = supabaseTraffic?.breakdown.find(t => t.service === slug);
                                const errRate = traffic && traffic.total > 0 ? Math.round((traffic.errors / traffic.total) * 100) : 0;
                                return (
                                  <div key={s.name} className={`px-4 py-3 ${s.status === "ACTIVE_UNHEALTHY" ? "bg-red-50/40" : ""}`}>
                                    <div className="flex items-center gap-2.5 mb-1.5">
                                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: SB_COLOR[s.status] ?? "#d1d5db" }} />
                                      <span className="text-[12px] font-semibold text-gray-700 capitalize flex-1">{s.name.replace(/_/g, " ")}</span>
                                      {traffic ? (
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="text-[11px] font-semibold text-gray-800">
                                            {traffic.total >= 1000 ? `${(traffic.total/1000).toFixed(1)}k` : traffic.total}
                                            <span className="text-[9px] font-normal text-gray-400 ml-0.5">req</span>
                                          </span>
                                          {traffic.errors > 0 ? (
                                            <span className="text-[10px] font-semibold text-red-500 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-full">
                                              {errRate > 0 ? `${errRate}%` : traffic.errors} err
                                            </span>
                                          ) : (
                                            <span className="text-[10px] text-emerald-500">✓</span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className={`text-[10px] font-medium shrink-0 ${
                                          s.status === "ACTIVE_HEALTHY" ? "text-emerald-500" :
                                          s.status === "ACTIVE_UNHEALTHY" ? "text-red-500" :
                                          s.status === "COMING_UP" ? "text-amber-500" : "text-gray-400"
                                        }`}>{s.status === "ACTIVE_HEALTHY" ? "healthy" : s.status === "ACTIVE_UNHEALTHY" ? "unhealthy" : s.status === "COMING_UP" ? "starting" : "inactive"}</span>
                                      )}
                                    </div>
                                    {(() => {
                                      // Scaffold last 7 days so chart always fills the full width
                                      const last7 = Array.from({ length: 7 }, (_, i) => {
                                        const d = new Date();
                                        d.setDate(d.getDate() - (6 - i));
                                        return d.toISOString().slice(0, 10);
                                      });
                                      const dailyMap = Object.fromEntries(
                                        (supabaseTrafficDaily?.services?.[slug] ?? []).map((r) => [r.day, r])
                                      );
                                      const sparkData = last7.map((iso) => ({
                                        day: new Date(iso + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" }),
                                        total: dailyMap[iso]?.total ?? 0,
                                        errors: dailyMap[iso]?.errors ?? 0,
                                      }));
                                      const hasAny = sparkData.some((d) => d.total > 0);
                                      if (!hasAny) return null;
                                      return (
                                        <div className="ml-4 mt-1.5">
                                          <ResponsiveContainer width="100%" height={52}>
                                            <BarChart data={sparkData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }} barCategoryGap="25%">
                                              <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                              <Bar dataKey="total" stackId="s" fill="#6f7bf7" fillOpacity={0.4} radius={[0,0,0,0]} />
                                              <Bar dataKey="errors" stackId="s" fill="#f87171" fillOpacity={0.85} radius={[2,2,0,0]} />
                                              <Tooltip
                                                contentStyle={{ fontSize: 10, borderRadius: 6, border: "1px solid #e5e7eb", padding: "2px 8px" }}
                                                formatter={(v, name) => [Number(v).toLocaleString(), name === "errors" ? "Errors" : "Requests"]}
                                                labelFormatter={(l) => l}
                                              />
                                            </BarChart>
                                          </ResponsiveContainer>
                                        </div>
                                      );
                                    })()}
                                  </div>
                                );
                              });
                            })()
                        }
                      </div>
                      {supabaseTraffic?.available && supabaseTraffic.breakdown.length > 0 && (
                        <div className="px-5 py-2.5 border-t border-gray-100 bg-gray-50/40 flex items-center justify-between">
                          <span className="text-[10px] text-gray-400">Total (24h)</span>
                          <span className="text-[11px] font-semibold text-gray-700">
                            {(() => { const t = supabaseTraffic.breakdown.reduce((s, r) => s + r.total, 0); return t >= 1000 ? `${(t/1000).toFixed(1)}k` : t; })()} req
                            {supabaseTraffic.breakdown.some(r => r.errors > 0) && (
                              <span className="ml-2 text-red-500">
                                / {supabaseTraffic.breakdown.reduce((s, r) => s + r.errors, 0)} err
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Infrastructure */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card p-5 overflow-y-auto">
                      {supabaseSvc
                        ? <SupabaseMetricsChart projectRef={supabaseSvc.resource_id} />
                        : <p className="text-[12px] text-gray-400">No Supabase project linked</p>
                      }
                    </div>
                  </div>

                  {/* Row 2: API Traffic + Error Logs */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* API Traffic */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden flex flex-col">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">API Traffic</p>
                        <span className="text-[10px] text-gray-400">
                          {supabaseTraffic?.available ? "Last 24h by service" : "Last 7 days"}
                        </span>
                      </div>
                      <div className="px-4 py-3 flex-1">
                        {/* Primary: per-service 24h breakdown from /traffic */}
                        {supabaseTraffic?.available && supabaseTraffic.breakdown.length > 0 ? (() => {
                          const chartData = supabaseTraffic.breakdown.map((r) => ({
                            service: r.service.charAt(0).toUpperCase() + r.service.slice(1),
                            requests: r.total,
                            errors: r.errors,
                          }));
                          return (
                            <ResponsiveContainer width="100%" height={180}>
                              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="sbBarGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6f7bf7" stopOpacity={0.9} />
                                    <stop offset="100%" stopColor="#6f7bf7" stopOpacity={0.4} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="service" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
                                <Tooltip
                                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", padding: "4px 10px" }}
                                  formatter={(v, name) => [Number(v).toLocaleString(), name === "errors" ? "Errors" : "Requests"]}
                                />
                                <Bar dataKey="requests" stackId="a" fill="url(#sbBarGrad)" radius={[0, 0, 0, 0]} barSize={48} />
                                <Bar dataKey="errors" stackId="a" fill="#f87171" radius={[3, 3, 0, 0]} barSize={48} />
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })()
                        /* Fallback: daily totals from overview if traffic isn't available */
                        : !supabaseTraffic ? (
                          <div className="h-32 bg-gray-50 rounded-lg animate-pulse" />
                        ) : supabaseOverview?.api_stats && supabaseOverview.api_stats.length > 0 ? (() => {
                          const chartData = supabaseOverview.api_stats.slice(-7).map((p) => ({
                            day: new Date(p.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
                            requests: p.count,
                          }));
                          return (
                            <ResponsiveContainer width="100%" height={160}>
                              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="sbBarGrad2" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6f7bf7" stopOpacity={0.9} />
                                    <stop offset="100%" stopColor="#6f7bf7" stopOpacity={0.4} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                <XAxis dataKey="day" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(1)}k` : String(v)} />
                                <Tooltip
                                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e5e7eb", padding: "4px 10px" }}
                                  formatter={(v) => [Number(v).toLocaleString(), "Requests"]}
                                />
                                <Bar dataKey="requests" fill="url(#sbBarGrad2)" radius={[3, 3, 0, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          );
                        })() : (
                          <p className="text-[12px] text-gray-400 py-4 text-center">No traffic data yet</p>
                        )}
                      </div>
                    </div>

                    {/* Error Logs */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Error Logs</p>
                      </div>
                      <SupabaseLogsPanel projectRef={supabaseSvc?.resource_id ?? ""} />
                    </div>
                  </div>

                  {/* Row 3: Edge Functions + Storage side by side */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Edge Functions */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Edge Functions</p>
                        {supabaseFunctions.length > 0 && (
                          <span className="text-[10px] text-gray-400">{supabaseFunctions.length} deployed</span>
                        )}
                      </div>
                      {supabaseFunctions.length === 0 ? (
                        <div className="flex flex-col items-center py-8 gap-1.5">
                          <svg className="w-6 h-6 text-gray-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                          <p className="text-[12px] text-gray-400">No functions deployed</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {supabaseFunctions.map((fn) => (
                            <div key={fn.id} className="flex items-center gap-3 px-4 py-2.5">
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${fn.status === "ACTIVE" ? "bg-emerald-400" : fn.status === "INACTIVE" ? "bg-gray-300" : "bg-amber-400"}`} />
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium text-gray-800 truncate">{fn.name}</div>
                                <div className="text-[10px] text-gray-400 font-mono truncate">{fn.slug}</div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!fn.verify_jwt && (
                                  <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600" title="JWT verification disabled">No JWT</span>
                                )}
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${fn.status === "ACTIVE" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"}`}>{fn.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Storage Buckets */}
                    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Storage</p>
                        {supabaseStorage?.available && supabaseStorage.buckets.length > 0 && (
                          <span className="text-[10px] text-gray-400">{supabaseStorage.buckets.length} bucket{supabaseStorage.buckets.length !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                      {!supabaseStorage ? (
                        <div className="space-y-2 px-4 py-3 animate-pulse">{[0,1,2].map(i => <div key={i} className="h-10 bg-gray-50 rounded-lg" />)}</div>
                      ) : !supabaseStorage.available ? (
                        <div className="flex flex-col items-center py-8 gap-1.5">
                          <p className="text-[12px] text-gray-400">Storage unavailable</p>
                        </div>
                      ) : supabaseStorage.buckets.length === 0 ? (
                        <div className="flex flex-col items-center py-8 gap-1.5">
                          <svg className="w-6 h-6 text-gray-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M5 8a7 7 0 0114 0v8a2 2 0 01-2 2H7a2 2 0 01-2-2V8z"/></svg>
                          <p className="text-[12px] text-gray-400">No storage buckets</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {supabaseStorage.buckets.map((b) => (
                            <div key={b.id} className="flex items-center gap-3 px-4 py-2.5">
                              <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M20 7H4a2 2 0 00-2 2v6a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 3H8L4 7h16l-4-4z"/></svg>
                              <div className="flex-1 min-w-0">
                                <div className="text-[12px] font-medium text-gray-800 truncate">{b.name}</div>
                                {b.file_size_limit && (
                                  <div className="text-[10px] text-gray-400">limit {b.file_size_limit >= 1e6 ? `${(b.file_size_limit/1e6).toFixed(0)} MB` : `${b.file_size_limit} B`}</div>
                                )}
                              </div>
                              <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${b.public ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                                {b.public ? "Public" : "Private"}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 4: Actions full width */}
                  <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Actions</p>
                      {supabaseOverview && supabaseOverview.actions.length > 0 && (
                        <span className="text-[10px] text-gray-400">{supabaseOverview.actions.length} total</span>
                      )}
                    </div>
                    {!supabaseOverview ? (
                      <p className="text-[12px] text-gray-400 text-center py-8">Loading…</p>
                    ) : supabaseOverview.available.actions === false ? (
                      <p className="text-[12px] text-gray-400 text-center py-8">Action history not available</p>
                    ) : supabaseOverview.actions.length === 0 ? (
                      <p className="text-[12px] text-gray-400 text-center py-8">No actions found</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {supabaseOverview.actions.map((action) => (
                          <div key={action.id} className="flex items-center gap-3 px-5 py-3">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              action.status === "COMPLETED" ? "bg-emerald-400" :
                              action.status === "FAILED" ? "bg-red-400" :
                              action.status === "IN_PROGRESS" ? "bg-amber-400 animate-pulse" :
                              "bg-gray-300"
                            }`} />
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                              action.status === "COMPLETED" ? "text-emerald-600 bg-emerald-50" :
                              action.status === "FAILED" ? "text-red-500 bg-red-50" :
                              action.status === "IN_PROGRESS" ? "text-amber-500 bg-amber-50" :
                              "text-gray-500 bg-gray-100"
                            }`}>{action.status}</span>
                            {action.error_message && (
                              <span className="text-[12px] text-gray-500 truncate flex-1">{action.error_message}</span>
                            )}
                            <span suppressHydrationWarning className="text-[11px] text-gray-400 shrink-0 ml-auto">{timeAgo(new Date(action.created_at).getTime())}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        </div>
      )}

      {/* Error modal */}
      {errorModal && <ErrorModal data={errorModal} onClose={() => setErrorModal(null)} />}

      {/* Log drawer */}
      <LogDrawer
        logsUrl={logDrawer?.logsUrl ?? null}
        title={logDrawer?.title ?? ""}
        subtitle={logDrawer?.subtitle ?? ""}
        isLive={logDrawer?.isLive}
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
