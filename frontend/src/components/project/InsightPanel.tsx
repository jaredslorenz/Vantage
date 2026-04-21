"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Insight, RuntimeError } from "@/types/project";

const HEALTH_CONFIG: Record<string, { dot: string; label: string; pill: string; card: string }> = {
  healthy:  { dot: "bg-emerald-400", label: "Healthy",  pill: "bg-emerald-100 text-emerald-700",  card: "bg-emerald-50/60 border-emerald-200/50" },
  warning:  { dot: "bg-amber-400",   label: "Warning",  pill: "bg-amber-100 text-amber-700",    card: "bg-amber-50/60 border-amber-200/60" },
  critical: { dot: "bg-red-400",     label: "Critical", pill: "bg-red-100 text-red-700",       card: "bg-red-50/60 border-red-200/60" },
};

export function InsightPanel({
  projectId,
  runtimeErrors,
}: {
  projectId: string;
  runtimeErrors: RuntimeError[];
}) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

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

  const hasErrors = runtimeErrors.length > 0;
  const serviceNames = [...new Set(runtimeErrors.map((e) => e.service ? e.service.charAt(0).toUpperCase() + e.service.slice(1) : null).filter(Boolean))];
  const serviceLabel = serviceNames.slice(0, 3).join(", ");

  if (loading) return <div className="h-14 bg-white/40 rounded-card animate-pulse mb-6" />;

  const health = insight?.health ?? "healthy";
  const cfg = HEALTH_CONFIG[health];
  const showCard = insight || hasErrors || generating;
  if (!showCard) return null;

  return (
    <div className={`mb-4 rounded-card border shadow-card px-4 py-3 flex items-center gap-3 ${cfg.card}`}>
      {generating && !insight ? (
        <>
          <svg className="w-3.5 h-3.5 animate-spin text-brand-purple shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <span className="text-[13px] text-gray-400">Analyzing project health…</span>
        </>
      ) : insight ? (
        <>
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${cfg.pill}`}>
            {cfg.label}
          </span>
          <p className="text-[12px] text-gray-500 leading-snug flex-1 min-w-0 truncate">{insight.summary}</p>
          {hasErrors && (
            <div className="flex items-center gap-1.5 shrink-0 bg-red-50 border border-red-200/70 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse shrink-0" />
              <span className="text-[11px] font-semibold text-red-500">
                {runtimeErrors.length} {runtimeErrors.length === 1 ? "error" : "errors"}
              </span>
              {serviceLabel && (
                <span className="text-[11px] text-red-400/70">· {serviceLabel}</span>
              )}
            </div>
          )}
          <button
            onClick={() => generate(true)}
            disabled={generating}
            className="text-[11px] text-gray-400 hover:text-brand-purple transition-colors disabled:opacity-40 shrink-0"
          >
            {generating ? "Analyzing…" : "Re-analyze"}
          </button>
        </>
      ) : null}
    </div>
  );
}
