"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Insight } from "@/types/project";

const HEALTH_DOT: Record<string, string> = {
  healthy: "bg-emerald-400",
  warning: "bg-amber-400",
  critical: "bg-red-400",
};
const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};
const HEALTH_BANNER: Record<string, string> = {
  healthy: "border-emerald-200 bg-emerald-50/60",
  warning: "border-amber-200 bg-amber-50/60",
  critical: "border-red-200 bg-red-50/60",
};
const SEVERITY_BADGE: Record<string, string> = {
  high: "text-red-600 bg-red-50",
  medium: "text-amber-600 bg-amber-50",
  low: "text-gray-500 bg-gray-100",
};

export function InsightPanel({ projectId, refreshKey }: { projectId: string; refreshKey: number }) {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const generate = async (force = false) => {
    setGenerating(true);
    try {
      const url = `/api/insights/${projectId}/generate${force ? "?force=true" : ""}`;
      const res = await apiFetch(url, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setInsight(data.insight);
      }
    } catch { /* silent */ }
    finally { setGenerating(false); }
  };

  useEffect(() => {
    apiFetch(`/api/insights/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.insight) {
          setInsight(data.insight);
          setLoading(false);
        } else {
          setLoading(false);
          generate();
        }
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  // Auto-regenerate when a build settles
  useEffect(() => {
    if (refreshKey === 0) return;
    generate();
  }, [refreshKey]);

  if (loading) {
    return <div className="h-24 bg-white/40 rounded-card animate-pulse mb-6" />;
  }

  if (generating && !insight) {
    return (
      <div className="mb-6 bg-white/95 border border-white/60 rounded-card p-4 shadow-card flex items-center gap-3">
        <svg className="w-4 h-4 animate-spin text-brand-purple shrink-0" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-[13px] text-gray-500">Analyzing project health…</span>
      </div>
    );
  }

  if (!insight) return null;

  return (
    <div className={`mb-6 rounded-card border p-4 shadow-card ${HEALTH_BANNER[insight.health]}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[insight.health]}`} />
          <span className="text-[13px] font-semibold text-gray-800">{HEALTH_LABEL[insight.health]}</span>
          <span className="text-[13px] text-gray-500">— {insight.summary}</span>
        </div>
        <button
          onClick={() => generate(true)}
          disabled={generating}
          className="text-[11px] text-gray-400 hover:text-brand-purple transition-colors disabled:opacity-40 shrink-0"
        >
          {generating ? "Analyzing…" : "Re-analyze"}
        </button>
      </div>

      {/* High severity issues — prominent */}
      {insight.issues.filter(i => i.severity === "high").map((issue, i) => (
        <div key={i} className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mb-2">
          <svg className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block mb-0.5">{issue.service}</span>
            <span className="text-[12px] text-red-700">{issue.description}</span>
          </div>
        </div>
      ))}

      {/* Recommendation / fix */}
      {insight.recommendation && (
        <div className="flex items-start gap-2.5 bg-brand-purple/5 border border-brand-purple/20 rounded-lg px-3 py-2.5 mb-2">
          <svg className="w-3.5 h-3.5 text-brand-purple mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div>
            <span className="text-[10px] font-bold text-brand-purple uppercase tracking-wider block mb-0.5">Suggested fix</span>
            <span className="text-[12px] text-gray-700">{insight.recommendation}</span>
          </div>
        </div>
      )}

      {/* Medium + low issues */}
      {insight.issues.filter(i => i.severity !== "high").length > 0 && (
        <div className="space-y-1.5 mb-2">
          {insight.issues.filter(i => i.severity !== "high").map((issue, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 capitalize ${SEVERITY_BADGE[issue.severity]}`}>
                {issue.severity}
              </span>
              <span className="text-[12px] text-gray-600">{issue.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Highlights */}
      {insight.highlights.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-black/5">
          {insight.highlights.map((h, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <svg className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-[12px] text-gray-500">{h}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
