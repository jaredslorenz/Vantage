"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { apiFetch } from "@/lib/api";

interface DataPoint { t: string; v: number }
interface MetricsData {
  cpu: DataPoint[];
  memory: DataPoint[];
  http_by_status: Record<string, DataPoint[]>;
}

function fmt(v: number, unit: "cores" | "bytes"): string {
  if (unit === "cores") return v < 0.01 ? `${(v * 1000).toFixed(1)} mCPU` : `${v.toFixed(3)} CPU`;
  const mb = v / 1e6;
  return mb >= 1000 ? `${(mb / 1000).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

function Sparkline({
  data, color, warnColor, unit, warnThreshold, limitValue,
}: {
  data: DataPoint[];
  color: string;
  warnColor: string;
  unit: "cores" | "bytes";
  warnThreshold?: number;
  limitValue?: number;
}) {
  if (!data.length) return <div className="h-12 flex items-center justify-center text-[11px] text-gray-300">No data</div>;

  const latest = data[data.length - 1]?.v ?? 0;
  const isWarning = warnThreshold !== undefined && latest > warnThreshold;
  const activeColor = isWarning ? warnColor : color;
  const domainMax = Math.max(...data.map((d) => d.v), limitValue ?? 0);

  return (
    <div>
      <div className={`text-[13px] font-semibold mb-2 ${isWarning ? "text-red-500" : "text-gray-900"}`}>
        {fmt(latest, unit)}
        {isWarning && <span className="ml-1.5 text-[10px] font-semibold text-red-400">HIGH</span>}
      </div>
      {/* Y-axis labels as HTML overlay — avoids recharts wrapping issues */}
      <div className="flex gap-1.5 items-stretch">
        <div className="flex flex-col justify-between text-right shrink-0 py-0.5">
          <span className="text-[9px] font-mono text-gray-400 leading-none">{fmt(domainMax, unit)}</span>
          <span className="text-[9px] font-mono text-gray-400 leading-none">0</span>
        </div>
        <div className="flex-1 min-w-0">
          <ResponsiveContainer width="100%" height={52}>
            <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${activeColor.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={activeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={activeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              {limitValue !== undefined && (
                <ReferenceLine y={limitValue} stroke={warnColor} strokeDasharray="3 3" strokeOpacity={0.5} />
              )}
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow">
                      {fmt(payload[0].value as number, unit)}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone" dataKey="v"
                stroke={activeColor} strokeWidth={1.5}
                fill={`url(#grad-${activeColor.replace("#", "")})`}
                dot={false}
                isAnimationActive={false}
                baseValue={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function RenderMetricsChart({ serviceId }: { serviceId: string }) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [limits, setLimits] = useState<{ cpu: number | null; memory: number | null }>({ cpu: null, memory: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/render/metrics/${serviceId}`).then((r) => r.json()),
      apiFetch(`/api/render/metrics/${serviceId}/limits`).then((r) => r.json()).catch(() => null),
    ])
      .then(([m, l]) => {
        setMetrics(m);
        if (l) setLimits({ cpu: l.cpu ?? null, memory: l.memory ?? null });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [serviceId]);

  const fivexx = metrics
    ? Object.entries(metrics.http_by_status)
        .filter(([code]) => code.startsWith("5"))
        .flatMap(([, pts]) => pts)
        .reduce((sum, pt) => sum + pt.v, 0)
    : 0;

  const total = metrics
    ? Object.values(metrics.http_by_status).flatMap((pts) => pts).reduce((sum, pt) => sum + pt.v, 0)
    : 0;

  const hasHttpData = total > 0;
  const errorRate = hasHttpData ? ((fivexx / total) * 100).toFixed(1) : null;

  // Thresholds: 85% of limit, falling back to free-tier constants
  const cpuLimit = limits.cpu ?? 0.1;
  const memLimit = limits.memory ?? 512 * 1024 * 1024;
  const cpuWarn = cpuLimit * 0.85;
  const memWarn = memLimit * 0.85;

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => <div key={i} className="bg-gray-50 rounded-lg p-3 h-24" />)}
        </div>
        <div className="bg-gray-50 rounded-lg h-8" />
      </div>
    );
  }

  if (!metrics) return null;

  const latestMem = metrics.memory[metrics.memory.length - 1]?.v ?? 0;
  const latestCpu = metrics.cpu[metrics.cpu.length - 1]?.v ?? 0;
  const memPct = latestMem / memLimit;
  const cpuPct = latestCpu / cpuLimit;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Performance — last 60 min</div>
        {(memPct > 0.85 || cpuPct > 0.85) && (
          <div className="flex items-center gap-1 text-[10px] font-semibold text-red-500">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            Resource pressure
          </div>
        )}
      </div>

      {/* CPU + Memory — 50/50 */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className={`rounded-lg p-3 ${cpuPct > 0.85 ? "bg-red-50/60 border border-red-200/60" : "bg-gray-50"}`}>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">CPU</div>
          <Sparkline
            data={metrics.cpu} color="#6f7bf7" warnColor="#ef4444"
            unit="cores" warnThreshold={cpuWarn} limitValue={cpuLimit}
          />
        </div>
        <div className={`rounded-lg p-3 ${memPct > 0.85 ? "bg-red-50/60 border border-red-200/60" : "bg-gray-50"}`}>
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Memory</div>
          <Sparkline
            data={metrics.memory} color="#34d399" warnColor="#ef4444"
            unit="bytes" warnThreshold={memWarn} limitValue={memLimit}
          />
        </div>
      </div>

      {/* HTTP errors footer */}
      <div className="bg-gray-50 rounded-lg px-3 py-2.5">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">HTTP Errors</div>
        {errorRate !== null ? (
          <div className="flex items-end justify-between">
            <div>
              <span className={`text-[22px] font-bold leading-none ${parseFloat(errorRate) > 1 ? "text-red-500" : "text-gray-800"}`}>
                {errorRate}%
              </span>
              <span className="text-[11px] text-gray-400 ml-2">error rate</span>
            </div>
            <span className="text-[11px] text-gray-400 mb-0.5">{Math.round(fivexx)} 5xx / {Math.round(total)} req</span>
          </div>
        ) : (
          <p className="text-[12px] text-gray-400">No traffic tracked</p>
        )}
      </div>
    </div>
  );
}
