"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Insight, Investigation, RuntimeError } from "@/types/project";

const HEALTH_CONFIG: Record<string, { dot: string; label: string; pill: string; card: string }> = {
  healthy:  { dot: "bg-emerald-400", label: "Healthy",  pill: "bg-emerald-100 text-emerald-700",  card: "bg-emerald-50/60 border-emerald-200/50" },
  warning:  { dot: "bg-amber-400",   label: "Warning",  pill: "bg-amber-100 text-amber-700",    card: "bg-amber-50/60 border-amber-200/60" },
  critical: { dot: "bg-red-400",     label: "Critical", pill: "bg-red-100 text-red-700",       card: "bg-red-50/60 border-red-200/60" },
};

function ErrorsModal({ errors, onClose }: { errors: RuntimeError[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="text-[13px] font-semibold text-gray-900">Runtime Errors</span>
            <span className="text-[11px] text-gray-400">{errors.length} detected</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {errors.map((err) => {
            const svc = err.metadata?.service_name || err.service || "unknown";
            return (
              <div key={err.id} className="px-5 py-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-semibold text-red-500">{svc}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(err.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-[12px] text-gray-700">{err.subtitle || err.title}</p>
                {err.metadata?.errors && err.metadata.errors.length > 1 && (
                  <div className="mt-2 bg-red-50 rounded-lg px-3 py-2 font-mono text-[10px] text-red-600 space-y-0.5">
                    {err.metadata.errors.slice(0, 4).map((line, i) => <div key={i} className="truncate">{line}</div>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InvestigationModal({ investigation, onClose }: { investigation: Investigation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="text-[13px] font-semibold text-gray-900">Investigation — {investigation.service}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block mb-1">Error</span>
            <span className="text-[12px] text-red-700">{investigation.error}</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block mb-1">Root Cause</span>
            <span className="text-[12px] text-gray-700">{investigation.root_cause}</span>
          </div>
          <div className="bg-brand-purple/5 border border-brand-purple/20 rounded-xl px-4 py-3">
            <span className="text-[10px] font-bold text-brand-purple uppercase tracking-wider block mb-1">Suggested Fix</span>
            <span className="text-[12px] text-gray-700">{investigation.fix}</span>
          </div>
          {investigation.key_logs.length > 0 && (
            <div className="bg-gray-950 rounded-xl p-3 space-y-0.5 max-h-32 overflow-y-auto">
              {investigation.key_logs.map((line, i) => (
                <p key={i} className="text-[11px] font-mono text-gray-300 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function InsightPanel({
  projectId,
  runtimeErrors,
  investigation,
  investigating,
  onInvestigate,
}: {
  projectId: string;
  runtimeErrors: RuntimeError[];
  investigation: Investigation | null;
  investigating: boolean;
  onInvestigate: (serviceType: string) => void;
}) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [investigationOpen, setInvestigationOpen] = useState(false);

  const generate = async (force = false) => {
    setGenerating(true);
    try {
      const res = await apiFetch(`/api/insights/${projectId}/generate${force ? "?force=true" : ""}`, { method: "POST" });
      if (res.ok) setInsight((await res.json()).insight);
    } catch { /* silent */ }
    finally { setGenerating(false); }
  };

  useEffect(() => {
    apiFetch(`/api/insights/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setInsight(data.insight ?? null);
        setLoading(false);
        if (!data.insight) generate();
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  const hasErrors = runtimeErrors.length > 0 || investigation !== null || investigating;
  const serviceNames = [...new Set(runtimeErrors.map((e) => e.service ? e.service.charAt(0).toUpperCase() + e.service.slice(1) : null).filter(Boolean))];
  const serviceLabel = serviceNames.slice(0, 3).join(", ");
  const serviceType = runtimeErrors[0]?.service || "render";

  if (loading) return <div className="h-14 bg-white/40 rounded-card animate-pulse mb-6" />;

  const health = insight?.health ?? "healthy";
  const cfg = HEALTH_CONFIG[health];
  const showCard = insight || hasErrors || generating;
  if (!showCard) return null;

  return (
    <>
      <div className={`mb-4 rounded-card border shadow-card overflow-hidden ${cfg.card}`}>

        {/* Insight body */}
        {generating && !insight ? (
          <div className="px-5 py-4 flex items-center gap-2.5">
            <svg className="w-3.5 h-3.5 animate-spin text-brand-purple shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            <span className="text-[13px] text-gray-400">Analyzing project health…</span>
          </div>
        ) : insight ? (
          <div className="px-4 py-3 flex items-center gap-3">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${cfg.pill}`}>
              {cfg.label}
            </span>
            <p className="text-[12px] text-gray-600 leading-snug flex-1 min-w-0 truncate">{insight.summary}</p>
            {insight.issues.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                {insight.issues.slice(0, 2).map((issue, i) => (
                  <span key={i} className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                    issue.severity === "high" ? "bg-red-100 text-red-600" :
                    issue.severity === "medium" ? "bg-amber-100 text-amber-700" :
                    "bg-gray-100 text-gray-500"
                  }`} title={issue.description}>
                    {issue.service}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => generate(true)}
              disabled={generating}
              className="text-[11px] text-gray-400 hover:text-brand-purple transition-colors disabled:opacity-40 shrink-0"
            >
              {generating ? "Analyzing…" : "Re-analyze"}
            </button>
          </div>
        ) : null}

        {/* Errors footer */}
        {hasErrors && (
            <div className="px-5 py-3 flex items-center gap-3 border-t border-black/5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
              <span className="text-[12px] font-semibold text-red-600 shrink-0">
                {runtimeErrors.length} {runtimeErrors.length === 1 ? "error" : "errors"} detected
              </span>
              {serviceLabel && (
                <span className="text-[12px] text-gray-400 shrink-0">{serviceLabel}</span>
              )}
              <div className="flex items-center gap-4 shrink-0 ml-auto">
                {runtimeErrors.length > 0 && (
                  <button onClick={() => setErrorsOpen(true)} className="text-[12px] text-gray-500 hover:text-gray-800 transition-colors">
                    View errors →
                  </button>
                )}
                {investigating ? (
                  <span className="flex items-center gap-1.5 text-[12px] text-gray-400">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Investigating…
                  </span>
                ) : investigation ? (
                  <button onClick={() => setInvestigationOpen(true)} className="text-[12px] font-semibold text-brand-purple hover:text-brand-purple/70 transition-colors">
                    View fix →
                  </button>
                ) : (
                  <button onClick={() => onInvestigate(serviceType)} className="text-[12px] font-semibold text-brand-purple hover:text-brand-purple/70 transition-colors">
                    Investigate →
                  </button>
                )}
              </div>
            </div>
        )}
      </div>

      {errorsOpen && <ErrorsModal errors={runtimeErrors} onClose={() => setErrorsOpen(false)} />}
      {investigationOpen && investigation && <InvestigationModal investigation={investigation} onClose={() => setInvestigationOpen(false)} />}
    </>
  );
}
