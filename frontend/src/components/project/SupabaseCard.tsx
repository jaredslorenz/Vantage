"use client";

import { SiSupabase } from "react-icons/si";
import type { ProjectService, SupabaseServiceHealth, SupabaseOverview } from "@/types/project";

// --- Supabase health status helpers ---
export const SB_COLOR: Record<string, string> = {
  ACTIVE_HEALTHY: "#34d399",
  ACTIVE_UNHEALTHY: "#f87171",
  COMING_UP: "#fbbf24",
  INACTIVE: "#d1d5db",
  UNKNOWN: "#d1d5db",
};

// --- Supabase card ---
export function SupabaseCard({ service, health, overview, selected, onClick, onUnlink, onInvestigate }: {
  service: ProjectService; health: SupabaseServiceHealth[]; overview: SupabaseOverview | null;
  selected: boolean; onClick: () => void; onUnlink: () => void; onInvestigate?: () => void;
}) {
  const healthyCount = health.filter((s) => s.status === "ACTIVE_HEALTHY").length;
  const anyUnhealthy = health.some((s) => s.status === "ACTIVE_UNHEALTHY");
  const hasIssue = anyUnhealthy && health.length > 0;
  const overallColor = anyUnhealthy ? "#f87171" : health.length > 0 ? "#34d399" : "#fbbf24";
  const overallLabel = anyUnhealthy ? "Unhealthy" : health.length > 0 ? "Healthy" : "Starting";
  const totalRequests = overview?.api_stats.reduce((sum, p) => sum + p.count, 0) ?? null;
  const errorCount = overview?.error_logs.length ?? null;

  return (
    <div
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-card p-5 shadow-card transition-all duration-300 overflow-hidden
        ${selected
          ? "bg-white border-2 border-brand-purple shadow-[0_0_0_4px_rgba(111,123,247,0.12)]"
          : hasIssue
          ? "bg-linear-to-br from-red-50/80 to-white/95 border border-red-300 shadow-[0_0_0_4px_rgba(239,68,68,0.10)] hover:shadow-[0_0_0_4px_rgba(239,68,68,0.18)]"
          : "bg-white/95 border border-white/60 hover:border-brand-purple/50 hover:shadow-xl hover:-translate-y-0.5"
        }`}
    >
      {selected && <div className="absolute inset-0 bg-linear-to-br from-brand-purple/5 to-brand-cyan/5 pointer-events-none" />}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${selected ? "bg-linear-to-br from-brand-purple to-brand-cyan shadow-button text-white" : "bg-[#1c1c1c] text-[#3ECF8E]"}`}>
            <SiSupabase className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-gray-900">Supabase</div>
            <div className="text-[11px] text-gray-400 truncate max-w-32">{service.resource_name}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasIssue ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Issue Detected
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: overallColor }} />
              <span className="text-[11px] font-medium" style={{ color: overallColor }}>{overallLabel}</span>
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
          { label: "Services", value: health.length > 0 ? `${healthyCount}/${health.length}` : "—" },
          { label: "Requests", value: totalRequests !== null ? (totalRequests >= 1000 ? `${(totalRequests / 1000).toFixed(1)}k` : String(totalRequests)) : "—" },
          { label: "Errors", value: errorCount !== null ? String(errorCount) : "—" },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
            <div className={`text-[15px] font-bold ${stat.label === "Errors" && errorCount ? "text-red-500" : "text-gray-900"}`}>{stat.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {health.map((s) => (
          <span key={s.name} className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 capitalize">
            <span className="w-1 h-1 rounded-full shrink-0" style={{ background: SB_COLOR[s.status] ?? "#d1d5db" }} />
            {s.name.replace(/_/g, " ")}
          </span>
        ))}
      </div>

      {hasIssue && (
        <div className="mt-2.5 space-y-1.5">
          {health.filter(s => s.status === "ACTIVE_UNHEALTHY").map(s => (
            <div key={s.name} className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <svg className="w-3 h-3 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span className="text-[11px] text-red-600 capitalize">{s.name.replace(/_/g, " ")} unhealthy</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between mt-3">
        <a
          href={`https://supabase.com/dashboard/project/${service.resource_id}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-gray-300 hover:text-brand-purple transition-colors"
        >
          Open in Supabase ↗
        </a>
        {hasIssue && onInvestigate ? (
          <button
            onClick={(e) => { e.stopPropagation(); onInvestigate(); }}
            className="text-[11px] font-semibold px-3 py-1.5 rounded-button bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm"
          >
            Investigate
          </button>
        ) : (
          <div className={`flex items-center gap-1 text-[11px] font-medium transition-all duration-200 ${selected ? "text-brand-purple" : "text-gray-300 group-hover:text-brand-purple/60"}`}>
            <span>{selected ? "Hide details" : "View details"}</span>
            <svg className={`w-3 h-3 transition-transform duration-300 ${selected ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
