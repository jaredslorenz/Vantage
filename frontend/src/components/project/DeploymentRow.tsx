"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import type { Deployment, DeployAnalysis, LighthouseScores } from "@/types/project";
import { StatusDot, CopyButton, STATE_COLOR, STATE_LABEL, STATE_BG } from "@/components/project/StatusDot";

function scoreColor(score: number | null) {
  if (score == null) return "text-gray-400 bg-gray-100";
  if (score >= 90) return "text-emerald-700 bg-emerald-50";
  if (score >= 50) return "text-amber-700 bg-amber-50";
  return "text-red-600 bg-red-50";
}

export function DeploymentRow({ deployment, index, maxBuildDuration, onRedeploy, onViewLogs, githubRepo, initialAnalysis, projectId }: {
  deployment: Deployment; index: number; maxBuildDuration: number;
  onRedeploy: (id: string) => void; onViewLogs?: (id: string, name: string) => void;
  githubRepo?: string; initialAnalysis?: DeployAnalysis; projectId?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<DeployAnalysis | null>(initialAnalysis ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [lighthouse, setLighthouse] = useState<LighthouseScores | null>(null);

  useEffect(() => {
    if (!expanded || lighthouse !== null || !projectId) return;
    apiFetch(`/api/vercel/deployments/${deployment.id}/checks?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => { if (d.lighthouse) setLighthouse(d.lighthouse); })
      .catch(() => {});
  }, [expanded]);

  const analyzeFailure = async () => {
    setAnalyzing(true);
    try {
      const res = await apiFetch(`/api/insights/deployment/${deployment.id}`, { method: "POST" });
      if (res.ok) setAnalysis(await res.json());
    } catch { /* silent */ }
    finally { setAnalyzing(false); }
  };

  const barPct = deployment.build_duration && maxBuildDuration
    ? Math.max(8, Math.round((deployment.build_duration / maxBuildDuration) * 100))
    : 0;

  return (
    <div className="animate-slide-up border-l-[3px] transition-all" style={{ borderLeftColor: STATE_COLOR[deployment.state] ?? "#d1d5db", animationDelay: `${index * 30}ms` }}>
      <div onClick={() => setExpanded((e) => !e)} className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors cursor-pointer group">
        <StatusDot state={deployment.state} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[13px] font-medium text-gray-900 truncate">{deployment.commit_message ?? deployment.name}</span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${STATE_BG[deployment.state] ?? "text-gray-500 bg-gray-100"}`}>
              {STATE_LABEL[deployment.state] ?? deployment.state}
            </span>
            {deployment.pr_id && (
              githubRepo ? (
                <a
                  href={`https://github.com/${githubRepo}/pull/${deployment.pr_id}`}
                  target="_blank" rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 text-violet-600 bg-violet-50 hover:bg-violet-100 transition-colors"
                >
                  PR #{deployment.pr_id}
                </a>
              ) : (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 text-violet-600 bg-violet-50">
                  PR #{deployment.pr_id}
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">{deployment.branch ?? "—"}</span>
            {deployment.commit_sha && (
              <span className="text-[10px] font-mono text-gray-300">{deployment.commit_sha}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {barPct > 0 && (
            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${barPct}%`,
                    background: STATE_COLOR[deployment.state] ?? "#d1d5db",
                    opacity: 0.6,
                  }}
                />
              </div>
              <span className="text-[10px] text-gray-400 tabular-nums font-mono">{deployment.build_duration}s</span>
            </div>
          )}
          <CopyButton text={deployment.id} />
          <span className="text-[11px] text-gray-400 tabular-nums">{deployment.created_at ? timeAgo(deployment.created_at) : "—"}</span>
          {deployment.url && (
            <a href={`https://${deployment.url}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-[11px] text-brand-purple opacity-0 group-hover:opacity-100 transition-opacity hover:underline">↗</a>
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
              { label: "Commit", value: deployment.commit_sha ?? "—", mono: true },
              { label: "Build time", value: deployment.build_duration ? `${deployment.build_duration}s` : "—" },
              { label: "Created", value: deployment.created_at ? new Date(deployment.created_at).toLocaleString() : "—" },
            ].map((d) => (
              <div key={d.label}>
                <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{d.label}</div>
                <div className={`text-[12px] text-gray-700 truncate ${d.mono ? "font-mono" : ""}`}>{d.value}</div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {deployment.url && (
              <a href={`https://${deployment.url}`} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium px-3.5 py-1.5 rounded-button bg-gray-900 text-white hover:bg-gray-700 transition-colors">
                Open deployment ↗
              </a>
            )}
            {onViewLogs && (
              <button
                onClick={() => onViewLogs(deployment.id, deployment.name)}
                className="text-[12px] font-medium px-3.5 py-1.5 rounded-button border border-gray-200 text-gray-600 hover:border-brand-purple hover:text-brand-purple transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                View logs
              </button>
            )}
            {deployment.state === "ERROR" && !analysis && (
              <button
                onClick={analyzeFailure}
                disabled={analyzing}
                className="text-[12px] font-medium px-3.5 py-1.5 rounded-button border border-red-200 text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {analyzing ? (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                )}
                {analyzing ? "Analyzing…" : "Why did this fail?"}
              </button>
            )}
            <button
              onClick={() => onRedeploy(deployment.id)}
              className="text-[12px] font-medium px-3.5 py-1.5 rounded-button border border-gray-200 text-gray-600 hover:border-brand-purple hover:text-brand-purple transition-colors"
            >
              Redeploy this
            </button>
          </div>

          {lighthouse && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-gray-400 uppercase tracking-wider mr-1">Lighthouse</span>
              {([
                { label: "Perf", value: lighthouse.performance },
                { label: "A11y", value: lighthouse.accessibility },
                { label: "SEO", value: lighthouse.seo },
                { label: "BP", value: lighthouse.best_practices },
              ] as { label: string; value: number | null }[]).map((s) => (
                <span key={s.label} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${scoreColor(s.value)}`}>
                  {s.label} {s.value ?? "—"}
                </span>
              ))}
            </div>
          )}

          {analysis && (
            <div className="mt-4 rounded-lg border border-red-100 bg-red-50/40 p-3.5 animate-fade-in space-y-2.5">
              {analysis.error_lines.length > 0 && (
                <div className="bg-[#0d1117] rounded-lg px-3 py-2.5 overflow-x-auto">
                  {analysis.error_lines.map((line, i) => (
                    <div key={i} className="text-[11px] font-mono text-red-400 leading-relaxed">{line}</div>
                  ))}
                </div>
              )}
              <p className="text-[12px] text-red-700">{analysis.reason}</p>
              {analysis.fix && (
                <div className="flex items-start gap-1.5 pt-1 border-t border-red-100">
                  <svg className="w-3 h-3 text-brand-purple mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  <p className="text-[11px] text-gray-600">{analysis.fix}</p>
                </div>
              )}
              <button onClick={() => setAnalysis(null)} className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors">Dismiss</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
