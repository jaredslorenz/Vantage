"use client";

import type { Deployment } from "@/types/project";

export type DORATier = { label: "Elite" | "High" | "Medium" | "Low"; color: string; bg: string };

export function doraTier(metric: "freq" | "cfr" | "mttr", value: number): DORATier {
  const tiers: DORATier[] = [
    { label: "Elite",  color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "High",   color: "text-blue-500",    bg: "bg-blue-50"    },
    { label: "Medium", color: "text-amber-500",   bg: "bg-amber-50"   },
    { label: "Low",    color: "text-red-500",      bg: "bg-red-50"     },
  ];
  const idx =
    metric === "freq"  ? (value >= 1 ? 0 : value >= 1/7 ? 1 : value >= 1/30 ? 2 : 3) :
    metric === "cfr"   ? (value <= 5 ? 0 : value <= 10  ? 1 : value <= 15   ? 2 : 3) :
    /* mttr mins */      (value <= 60 ? 0 : value <= 1440 ? 1 : value <= 10080 ? 2 : 3);
  return tiers[idx];
}

export function fmtMTTR(mins: number): string {
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export function DORAMetrics({ deployments }: { deployments: Deployment[] }) {
  if (deployments.length < 3) return null;

  // Deployment frequency — deploys in last 30 days / 30
  const thirtyDays = deployments.filter(d => Date.now() - d.created_at < 30 * 86400000);
  const freqPerDay = thirtyDays.length / 30;

  // Change failure rate
  const terminal = deployments.filter(d => d.state === "READY" || d.state === "ERROR");
  const cfr = terminal.length
    ? Math.round(deployments.filter(d => d.state === "ERROR").length / terminal.length * 100)
    : 0;

  // MTTR — time from an ERROR to the next READY (deployments sorted newest→oldest)
  const mttrSamples: number[] = [];
  for (let i = 0; i < deployments.length; i++) {
    if (deployments[i].state === "ERROR") {
      const recovery = deployments.slice(0, i).find(d => d.state === "READY");
      if (recovery) mttrSamples.push((recovery.created_at - deployments[i].created_at) / 60000);
    }
  }
  const mttr = mttrSamples.length
    ? Math.round(mttrSamples.reduce((a, b) => a + b, 0) / mttrSamples.length)
    : null;

  const freqLabel = freqPerDay >= 1
    ? `${freqPerDay.toFixed(1)}/day`
    : freqPerDay >= 1/7
    ? `${(freqPerDay * 7).toFixed(1)}/wk`
    : `${(freqPerDay * 30).toFixed(1)}/mo`;

  const stats = [
    { label: "Deploy Freq",   value: freqLabel,                   tier: doraTier("freq", freqPerDay), tooltip: "How often you ship to production" },
    { label: "Failure Rate",  value: `${cfr}%`,                  tier: doraTier("cfr", cfr),         tooltip: "% of deploys that ended in ERROR" },
    { label: "MTTR",          value: mttr != null ? fmtMTTR(mttr) : "—", tier: mttr != null ? doraTier("mttr", mttr) : null, tooltip: "Avg time from failure to recovery" },
  ];

  return (
    <div className="px-5 py-3.5 border-b border-gray-100">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5">DORA Metrics</p>
      <div className="flex gap-5">
        {stats.map((s) => (
          <div key={s.label} className="group relative">
            <div className={`text-[15px] font-bold ${s.tier?.color ?? "text-gray-700"}`}>{s.value}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{s.label}</div>
            {s.tier && (
              <span className={`inline-block text-[9px] font-semibold px-1 py-0.5 rounded mt-0.5 ${s.tier.color} ${s.tier.bg}`}>
                {s.tier.label}
              </span>
            )}
            <div className="absolute bottom-full left-0 mb-1.5 hidden group-hover:block z-10 pointer-events-none">
              <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap">{s.tooltip}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
