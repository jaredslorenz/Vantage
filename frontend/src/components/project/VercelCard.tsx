"use client";

import { timeAgo } from "@/lib/utils";
import type { Deployment, ProjectService, UptimeStatus } from "@/types/project";
import { StatusDot, STATE_COLOR, STATE_LABEL } from "@/components/project/StatusDot";

export function VercelCard({ service, deployments, selected, onClick, onUnlink, uptime, onInvestigate, hasRuntimeErrors }: {
  service: ProjectService; deployments: Deployment[]; selected: boolean; onClick: () => void; onUnlink: () => void;
  uptime?: UptimeStatus; onInvestigate?: () => void; hasRuntimeErrors?: boolean;
}) {
  const latest = deployments[0];
  const readyCount = deployments.filter((d) => d.state === "READY").length;
  const successRate = deployments.length ? Math.round((readyCount / deployments.length) * 100) : null;
  const weekFails = deployments.filter((d) => d.state === "ERROR" && Date.now() - d.created_at < 7 * 86400000).length;
  const hasIssue = successRate !== null && successRate < 50 && deployments.length >= 3 && latest?.state === "ERROR";
  const hasAnyError = hasIssue || hasRuntimeErrors || latest?.state === "ERROR";

  return (
    <div
      onClick={onClick}
      className={`group relative w-full cursor-pointer rounded-card p-5 shadow-card transition-all duration-300 overflow-hidden flex flex-col
        ${selected
          ? "bg-white border-2 border-brand-purple shadow-[0_0_0_4px_rgba(111,123,247,0.12)]"
          : hasAnyError
          ? "bg-linear-to-br from-red-50/80 to-white/95 border border-red-300 shadow-[0_0_0_4px_rgba(239,68,68,0.10)] hover:shadow-[0_0_0_4px_rgba(239,68,68,0.18)]"
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
          {hasIssue ? (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              Issue Detected
            </span>
          ) : latest ? (
            <div className="flex items-center gap-1.5">
              <StatusDot state={latest.state} />
              <span className="text-[11px] font-medium" style={{ color: STATE_COLOR[latest.state] }}>{STATE_LABEL[latest.state]}</span>
            </div>
          ) : null}
          <button
            onClick={(e) => { e.stopPropagation(); onUnlink(); }}
            title="Unlink"
            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "Deploys", value: String(deployments.length) },
          { label: "Success", value: successRate !== null ? `${successRate}%` : "—" },
          { label: "Last", value: latest ? timeAgo(latest.created_at) : "—" },
        ].map((s) => (
          <div key={s.label} className="bg-gray-50 rounded-lg px-2.5 py-2 text-center">
            <div className="text-[15px] font-bold text-gray-900">{s.value}</div>
            <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">{s.label}</div>
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
      {hasIssue && (
        <div className="mt-2.5 space-y-1.5">
          {weekFails > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span className="text-[11px] text-amber-700">{weekFails} failed deploy{weekFails !== 1 ? "s" : ""} this week</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <svg className="w-3 h-3 text-red-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span className="text-[11px] text-red-600">{successRate}% success rate — below threshold</span>
          </div>
        </div>
      )}
      {uptime && (
        <div className="flex-1 flex items-center gap-2 mt-3 border-t border-gray-100 py-3">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${uptime.is_up ? "bg-emerald-400" : "bg-red-400"}`} />
          <span className={`text-[10px] font-medium ${uptime.is_up ? "text-emerald-600" : "text-red-500"}`}>
            {uptime.is_up ? "Online" : "Down"}
          </span>
          <span className="text-[10px] text-gray-400">{uptime.latency_ms}ms</span>
          {uptime.uptime_pct != null && (
            <span className="text-[10px] text-gray-400 ml-auto">{uptime.uptime_pct}% uptime</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-100">
        <a
          href={latest?.team_slug ? `https://vercel.com/${latest.team_slug}/${latest.name || service.resource_name}` : "https://vercel.com/dashboard"}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[11px] text-gray-300 hover:text-brand-purple transition-colors"
        >
          Open in Vercel ↗
        </a>
        {hasAnyError && onInvestigate ? (
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
