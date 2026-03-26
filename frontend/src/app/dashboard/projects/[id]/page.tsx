"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { SiRender } from "react-icons/si";

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

interface VercelProject { id: string; name: string; }
interface GitHubRepo { id: number; full_name: string; name: string; }
interface RenderService { id: string; name: string; type: string; suspended: boolean; url: string | null; }

interface RenderDeploy {
  id: string; status: string; commit_message: string | null;
  commit_id: string | null; created_at: string; finished_at: string | null;
}

interface Deployment {
  id: string; name: string; url: string; state: string;
  target: string; branch: string; commit_message: string; created_at: number;
}

interface Commit {
  sha: string; message: string; author: string;
  author_avatar: string | null; date: string; url: string;
}

interface PullRequest {
  number: number; title: string; state: string; author: string;
  author_avatar: string; branch: string; base: string;
  created_at: string; updated_at: string; url: string;
  draft: boolean; labels: string[];
}

const STATE_COLOR: Record<string, string> = {
  READY: "#34d399", ERROR: "#f87171", BUILDING: "#fbbf24", CANCELED: "#d1d5db",
};
const STATE_LABEL: Record<string, string> = {
  READY: "Ready", ERROR: "Failed", BUILDING: "Building", CANCELED: "Canceled",
};
const STATE_BG: Record<string, string> = {
  READY: "text-emerald-600 bg-emerald-50",
  ERROR: "text-red-500 bg-red-50",
  BUILDING: "text-amber-500 bg-amber-50",
  CANCELED: "text-gray-400 bg-gray-100",
};

// Render deploy status mappings
const RENDER_COLOR: Record<string, string> = {
  live: "#34d399", build_failed: "#f87171", build_in_progress: "#fbbf24",
  update_in_progress: "#fbbf24", canceled: "#d1d5db", deactivated: "#d1d5db",
  pre_deploy_in_progress: "#fbbf24",
};
const RENDER_LABEL: Record<string, string> = {
  live: "Live", build_failed: "Failed", build_in_progress: "Building",
  update_in_progress: "Updating", canceled: "Canceled", deactivated: "Deactivated",
  pre_deploy_in_progress: "Pre-deploy",
};
const RENDER_BG: Record<string, string> = {
  live: "text-emerald-600 bg-emerald-50",
  build_failed: "text-red-500 bg-red-50",
  build_in_progress: "text-amber-500 bg-amber-50",
  update_in_progress: "text-amber-500 bg-amber-50",
  canceled: "text-gray-400 bg-gray-100",
  deactivated: "text-gray-400 bg-gray-100",
  pre_deploy_in_progress: "text-amber-500 bg-amber-50",
};

function timeAgo(val: number | string): string {
  const ms = typeof val === "number" ? val : new Date(val).getTime();
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusDot({ state }: { state: string }) {
  const color = STATE_COLOR[state] ?? "#d1d5db";
  return (
    <span className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
      {state === "BUILDING" && (
        <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping" style={{ background: color }} />
      )}
      <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

// --- Copy button ---
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      title="Copy"
      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 shrink-0"
    >
      {copied
        ? <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      }
    </button>
  );
}

// --- Render card ---
function RenderCard({ service, deploys, selected, onClick, onUnlink }: {
  service: ProjectService; deploys: RenderDeploy[]; selected: boolean; onClick: () => void; onUnlink: () => void;
}) {
  const latest = deploys[0];
  const liveCount = deploys.filter((d) => d.status === "live").length;
  const successRate = deploys.length ? Math.round((liveCount / deploys.length) * 100) : null;
  const isBuilding = latest?.status === "build_in_progress" || latest?.status === "update_in_progress";

  return (
    <div
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-card p-5 shadow-card transition-all duration-300 overflow-hidden
        ${selected
          ? "bg-white border-2 border-brand-purple shadow-[0_0_0_4px_rgba(111,123,247,0.12)]"
          : "bg-white/95 border border-white/60 hover:border-brand-purple/50 hover:shadow-xl hover:-translate-y-0.5"
        }`}
    >
      {selected && <div className="absolute inset-0 bg-linear-to-br from-brand-purple/5 to-brand-cyan/5 pointer-events-none" />}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all duration-300 ${selected ? "bg-linear-to-br from-brand-purple to-brand-cyan shadow-button" : "bg-[#46E3B7]"}`}>
            <SiRender className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-gray-900">Render</div>
            <div className="text-[11px] text-gray-400">{service.resource_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latest && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
                {isBuilding && <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping" style={{ background: RENDER_COLOR[latest.status] }} />}
                <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ background: RENDER_COLOR[latest.status] ?? "#d1d5db" }} />
              </span>
              <span className="text-[11px] font-medium" style={{ color: RENDER_COLOR[latest.status] ?? "#d1d5db" }}>{RENDER_LABEL[latest.status] ?? latest.status}</span>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onUnlink(); }}
            title="Unlink"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Deploys", value: String(deploys.length) },
          { label: "Success", value: successRate !== null ? `${successRate}%` : "—" },
          { label: "Last", value: latest ? timeAgo(latest.created_at) : "—" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
            <div className="text-[15px] font-bold text-gray-900">{stat.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
      {latest && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" />
          </svg>
          <span className="text-[11px] text-gray-500 truncate">{latest.commit_message ?? "No commit message"}</span>
        </div>
      )}
      <div className={`flex items-center justify-center gap-1 mt-3 text-[11px] font-medium transition-all duration-200 ${selected ? "text-brand-purple" : "text-gray-300 group-hover:text-brand-purple/60"}`}>
        <span>{selected ? "Hide details" : "View details"}</span>
        <svg className={`w-3 h-3 transition-transform duration-300 ${selected ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// --- Render deploy row ---
function RenderDeployRow({ deploy, index }: { deploy: RenderDeploy; index: number }) {
  const color = RENDER_COLOR[deploy.status] ?? "#d1d5db";
  const isBuilding = deploy.status === "build_in_progress" || deploy.status === "update_in_progress";
  return (
    <div className="animate-slide-up flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 last:border-0 border-l-[3px]" style={{ borderLeftColor: color, animationDelay: `${index * 30}ms` }}>
      <span className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
        {isBuilding && <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping" style={{ background: color }} />}
        <span className="relative inline-flex w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-medium text-gray-900 truncate">{deploy.commit_message ?? "No commit message"}</span>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${RENDER_BG[deploy.status] ?? "text-gray-500 bg-gray-100"}`}>
            {RENDER_LABEL[deploy.status] ?? deploy.status}
          </span>
        </div>
        {deploy.commit_id && <div className="text-[11px] font-mono text-gray-400">{deploy.commit_id}</div>}
      </div>
      <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(deploy.created_at)}</span>
    </div>
  );
}

// --- Vercel card ---
function VercelCard({ service, deployments, selected, onClick, onUnlink }: {
  service: ProjectService; deployments: Deployment[]; selected: boolean; onClick: () => void; onUnlink: () => void;
}) {
  const latest = deployments[0];
  const readyCount = deployments.filter((d) => d.state === "READY").length;
  const successRate = deployments.length ? Math.round((readyCount / deployments.length) * 100) : null;

  return (
    <div
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-card p-5 shadow-card transition-all duration-300 overflow-hidden
        ${selected
          ? "bg-white border-2 border-brand-purple shadow-[0_0_0_4px_rgba(111,123,247,0.12)]"
          : "bg-white/95 border border-white/60 hover:border-brand-purple/50 hover:shadow-xl hover:-translate-y-0.5"
        }`}
    >
      {selected && <div className="absolute inset-0 bg-linear-to-br from-brand-purple/5 to-brand-cyan/5 pointer-events-none" />}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all duration-300 ${selected ? "bg-linear-to-br from-brand-purple to-brand-cyan shadow-button" : "bg-gray-900"}`}>
            <svg viewBox="0 0 76 65" className="w-3.5 h-3.5" fill="currentColor"><path d="M37.5274 0L75.0548 65H0L37.5274 0Z" /></svg>
          </div>
          <div>
            <div className="text-[14px] font-semibold text-gray-900">Vercel</div>
            <div className="text-[11px] text-gray-400">{service.resource_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latest && (
            <div className="flex items-center gap-1.5">
              <StatusDot state={latest.state} />
              <span className="text-[11px] font-medium" style={{ color: STATE_COLOR[latest.state] }}>{STATE_LABEL[latest.state]}</span>
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onUnlink(); }}
            title="Unlink"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Deploys", value: String(deployments.length) },
          { label: "Success", value: successRate !== null ? `${successRate}%` : "—" },
          { label: "Last", value: latest ? timeAgo(latest.created_at) : "—" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
            <div className="text-[15px] font-bold text-gray-900">{stat.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
      {latest && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" />
          </svg>
          <span className="text-[11px] text-gray-500 truncate">{latest.commit_message ?? "No commit message"}</span>
        </div>
      )}
      <div className={`flex items-center justify-center gap-1 mt-3 text-[11px] font-medium transition-all duration-200 ${selected ? "text-brand-purple" : "text-gray-300 group-hover:text-brand-purple/60"}`}>
        <span>{selected ? "Hide details" : "View details"}</span>
        <svg className={`w-3 h-3 transition-transform duration-300 ${selected ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

// --- GitHub card ---
function GitHubCard({ service, commits, pulls, selected, onClick, onUnlink }: {
  service: ProjectService; commits: Commit[]; pulls: PullRequest[]; selected: boolean; onClick: () => void; onUnlink: () => void;
}) {
  const latestCommit = commits[0];
  const openPRs = pulls.filter((p) => p.state === "open").length;

  return (
    <div
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-card p-5 shadow-card transition-all duration-300 overflow-hidden
        ${selected
          ? "bg-white border-2 border-brand-purple shadow-[0_0_0_4px_rgba(111,123,247,0.12)]"
          : "bg-white/95 border border-white/60 hover:border-brand-purple/50 hover:shadow-xl hover:-translate-y-0.5"
        }`}
    >
      {selected && <div className="absolute inset-0 bg-linear-to-br from-brand-purple/5 to-brand-cyan/5 pointer-events-none" />}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all duration-300 ${selected ? "bg-linear-to-br from-brand-purple to-brand-cyan shadow-button" : "bg-gray-900"}`}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </div>
          <div>
            <div className="text-[14px] font-semibold text-gray-900">GitHub</div>
            <div className="text-[11px] text-gray-400">{service.resource_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {openPRs > 0 && (
            <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
              {openPRs} open PR{openPRs !== 1 ? "s" : ""}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onUnlink(); }}
            title="Unlink"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: "Commits", value: String(commits.length) },
          { label: "Open PRs", value: String(openPRs) },
          { label: "Last push", value: latestCommit ? timeAgo(latestCommit.date) : "—" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
            <div className="text-[15px] font-bold text-gray-900">{stat.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
      {latestCommit && (
        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
          <svg className="w-3 h-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" />
          </svg>
          <span className="text-[11px] text-gray-500 truncate">{latestCommit.message}</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-3">
        <a
          href={`https://dashboard.render.com/web/${service.resource_id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-gray-300 hover:text-brand-purple transition-colors"
        >
          Open in Render ↗
        </a>
        <div className={`flex items-center gap-1 text-[11px] font-medium transition-all duration-200 ${selected ? "text-brand-purple" : "text-gray-300 group-hover:text-brand-purple/60"}`}>
          <span>{selected ? "Hide details" : "View details"}</span>
          <svg className={`w-3 h-3 transition-transform duration-300 ${selected ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

// --- Deployment row ---
function DeploymentRow({ deployment, index, onRedeploy }: { deployment: Deployment; index: number; onRedeploy: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="animate-slide-up border-l-[3px] transition-all" style={{ borderLeftColor: STATE_COLOR[deployment.state] ?? "#d1d5db", animationDelay: `${index * 30}ms` }}>
      <div onClick={() => setExpanded((e) => !e)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer group">
        <StatusDot state={deployment.state} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-medium text-gray-900 truncate">{deployment.commit_message ?? deployment.name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATE_BG[deployment.state] ?? "text-gray-500 bg-gray-100"}`}>
              {STATE_LABEL[deployment.state] ?? deployment.state}
            </span>
          </div>
          <div className="text-[11px] text-gray-400">{deployment.branch ?? "—"}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <CopyButton text={deployment.id} />
          <span className="text-[11px] text-gray-400">{deployment.created_at ? timeAgo(deployment.created_at) : "—"}</span>
          {deployment.url && (
            <a href={`https://${deployment.url}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity hover:underline">Visit ↗</a>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-300 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" /></svg>
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-4 pt-2 border-t border-gray-100 bg-gray-50/60 animate-fade-in">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 mb-4">
            {[
              { label: "Deployment ID", value: deployment.id, mono: true },
              { label: "Target", value: deployment.target ?? "—" },
              { label: "Branch", value: deployment.branch ?? "—" },
              { label: "Created", value: deployment.created_at ? new Date(deployment.created_at).toLocaleString() : "—" },
            ].map((d) => (
              <div key={d.label}>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{d.label}</div>
                <div className={`text-[12px] text-gray-700 truncate ${d.mono ? "font-mono" : ""}`}>{d.value}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {deployment.url && (
              <a href={`https://${deployment.url}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium px-3.5 py-1.5 rounded-button bg-gray-900 text-white hover:bg-gray-700 transition-colors">
                Open deployment ↗
              </a>
            )}
            <button
              onClick={() => onRedeploy(deployment.id)}
              className="text-[12px] font-medium px-3.5 py-1.5 rounded-button border border-gray-200 text-gray-600 hover:border-brand-purple hover:text-brand-purple transition-colors"
            >
              Redeploy this
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Commit row ---
function CommitRow({ commit, index }: { commit: Commit; index: number }) {
  return (
    <div className="animate-slide-up flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-0 group" style={{ animationDelay: `${index * 30}ms` }}>
      {commit.author_avatar ? (
        <img src={commit.author_avatar} alt={commit.author} className="w-5 h-5 rounded-full shrink-0" />
      ) : (
        <div className="w-5 h-5 rounded-full bg-gray-200 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-900 truncate">{commit.message}</div>
        <div className="text-[11px] text-gray-400">{commit.author}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[11px] font-mono text-gray-300">{commit.sha}</span>
        <CopyButton text={commit.sha} />
        <span className="text-[11px] text-gray-400">{timeAgo(commit.date)}</span>
        <a href={commit.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity hover:underline">View ↗</a>
      </div>
    </div>
  );
}

// --- PR row ---
function PRRow({ pr, index }: { pr: PullRequest; index: number }) {
  return (
    <div className="animate-slide-up flex items-center gap-3 px-5 py-3 border-b border-gray-100 last:border-0 group" style={{ animationDelay: `${index * 30}ms` }}>
      <img src={pr.author_avatar} alt={pr.author} className="w-5 h-5 rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13px] font-medium text-gray-900 truncate">{pr.title}</span>
          {pr.draft && <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full shrink-0">Draft</span>}
        </div>
        <div className="text-[11px] text-gray-400">{pr.branch} → {pr.base}</div>
      </div>
      <div className="flex items-center gap-2.5 shrink-0">
        <span className="text-[11px] text-gray-400">#{pr.number}</span>
        <span className="text-[11px] text-gray-400">{timeAgo(pr.updated_at)}</span>
        <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity hover:underline">View ↗</a>
      </div>
    </div>
  );
}

// --- Main page ---
export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [renderDeploys, setRenderDeploys] = useState<RenderDeploy[]>([]);
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([]);
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [renderServices, setRenderServices] = useState<RenderService[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkTab, setLinkTab] = useState<"vercel" | "github" | "render">("vercel");
  const [githubTab, setGithubTab] = useState<"commits" | "prs">("commits");
  const [linking, setLinking] = useState(false);
  const [deploying, setDeploying] = useState(false);

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
        const first = vercelSvc ?? githubSvc ?? renderSvc;
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
        }
        return Promise.all(fetches);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  // Auto-poll when a deploy is in-progress
  useEffect(() => {
    const buildingVercel = deployments.some((d) => d.state === "BUILDING");
    const buildingRender = renderDeploys.some((d) => ["build_in_progress", "update_in_progress", "pre_deploy_in_progress"].includes(d.status));
    if (!buildingVercel && !buildingRender) return;

    const interval = setInterval(() => {
      if (buildingVercel) {
        const svc = project?.project_services.find((s) => s.service_type === "vercel");
        if (svc) apiFetch(`/api/vercel/deployments?limit=20&projectId=${svc.resource_id}`)
          .then((r) => r.json()).then((d) => setDeployments(d.deployments ?? [])).catch(() => {});
      }
      if (buildingRender) {
        const svc = project?.project_services.find((s) => s.service_type === "render");
        if (svc) apiFetch(`/api/render/deploys?serviceId=${svc.resource_id}&limit=20`)
          .then((r) => r.json()).then((d) => setRenderDeploys(d.deploys ?? [])).catch(() => {});
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [deployments, renderDeploys, project]);

  const openLinkPanel = () => {
    setShowLinkPanel(true);
    apiFetch("/api/vercel/projects").then((r) => r.json()).then((d) => setVercelProjects(d.projects ?? [])).catch(() => {});
    apiFetch("/api/github/repos").then((r) => r.json()).then((d) => setGithubRepos(d.repos ?? [])).catch(() => {});
    apiFetch("/api/render/services").then((r) => r.json()).then((d) => setRenderServices(d.services ?? [])).catch(() => {});
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
  };

  const handleDelete = async () => {
    if (!confirm(`Delete project "${project?.name}"? This cannot be undone.`)) return;
    await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
    router.push("/dashboard/projects");
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
          <button onClick={handleDelete} className="text-[12px] font-medium px-3.5 py-1.5 rounded-button border border-red-400/60 text-red-300 hover:bg-red-400 hover:text-white hover:border-red-400 transition-all">
            Delete
          </button>
        </div>
      </div>

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
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3.5 mb-6">
          {project.project_services.map((svc) => {
            if (svc.service_type === "vercel") {
              return <VercelCard key={svc.id} service={svc} deployments={deployments} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} />;
            }
            if (svc.service_type === "github") {
              return <GitHubCard key={svc.id} service={svc} commits={commits} pulls={pulls} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} />;
            }
            if (svc.service_type === "render") {
              return <RenderCard key={svc.id} service={svc} deploys={renderDeploys} selected={selectedService === svc.id} onClick={() => setSelectedService(selectedService === svc.id ? null : svc.id)} onUnlink={() => handleUnlink(svc.id, svc.service_type)} />;
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
              ) : (
                <div>
                  <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider">
                    {activeService.service_type === "render" ? "Deploys" : "Deployments"}
                  </h2>
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

          <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden divide-y divide-gray-100">
            {activeService.service_type === "vercel" && (
              deployments.length === 0
                ? <p className="text-sm text-gray-400 text-center py-12">No deployments found</p>
                : deployments.map((d, i) => <DeploymentRow key={d.id} deployment={d} index={i} onRedeploy={async (depId) => {
                    setDeploying(true);
                    try {
                      const res = await apiFetch("/api/vercel/redeploy", { method: "POST", body: JSON.stringify({ deploymentId: depId }) });
                      if (res.ok) {
                        const nd = await res.json();
                        setDeployments((prev) => [{ ...d, id: nd.id, state: "BUILDING", created_at: Date.now() }, ...prev]);
                      }
                    } finally { setDeploying(false); }
                  }} />)
            )}
            {activeService.service_type === "github" && githubTab === "commits" && (
              commits.length === 0
                ? <p className="text-sm text-gray-400 text-center py-12">No commits found</p>
                : commits.map((c, i) => <CommitRow key={c.sha} commit={c} index={i} />)
            )}
            {activeService.service_type === "github" && githubTab === "prs" && (
              pulls.length === 0
                ? <p className="text-sm text-gray-400 text-center py-12">No pull requests found</p>
                : pulls.map((p, i) => <PRRow key={p.number} pr={p} index={i} />)
            )}
            {activeService.service_type === "render" && (
              renderDeploys.length === 0
                ? <p className="text-sm text-gray-400 text-center py-12">No deploys found</p>
                : renderDeploys.map((d, i) => <RenderDeployRow key={d.id} deploy={d} index={i} />)
            )}
          </div>
        </div>
      )}

      {/* Link panel modal */}
      {showLinkPanel && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-card shadow-2xl p-6 w-full max-w-md mx-4 animate-slide-up">
            <h2 className="text-[16px] font-semibold text-gray-900 mb-0.5">Link a Service</h2>
            <p className="text-[12px] text-gray-400 mb-4">Choose a service to link to <span className="font-medium text-gray-600">{project.name}</span></p>

            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 rounded-button p-0.5 mb-4">
              {(["vercel", "github", "render"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setLinkTab(tab)}
                  className={`flex-1 text-[12px] font-medium py-1.5 rounded-button transition-all capitalize ${linkTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {tab === "vercel" ? "Vercel" : tab === "github" ? "GitHub" : "Render"}
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

            <button onClick={() => setShowLinkPanel(false)} className="mt-3 w-full py-2.5 rounded-button border border-gray-200 text-gray-500 text-[13px] hover:bg-gray-50 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
