"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, Tooltip, ResponsiveContainer, YAxis } from "recharts";
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

function Sparkline({ data, color, unit }: { data: DataPoint[]; color: string; unit: "cores" | "bytes" }) {
  if (!data.length) return <div className="h-12 flex items-center justify-center text-[11px] text-gray-300">No data</div>;
  const max = Math.max(...data.map((d) => d.v), 1);
  const min = Math.min(...data.map((d) => d.v), 0);
  const latest = data[data.length - 1]?.v ?? 0;

  return (
    <div>
      <div className="text-[13px] font-semibold text-gray-900 mb-1">{fmt(latest, unit)}</div>
      <ResponsiveContainer width="100%" height={48}>
        <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis domain={[0, max * 1.1]} hide />
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
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#grad-${color.replace("#", "")})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="text-[9px] font-mono text-gray-400 mt-1">{fmt(min, unit)} — {fmt(max, unit)}</div>
    </div>
  );
}

export function RenderMetricsChart({ serviceId }: { serviceId: string }) {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch(`/api/render/metrics/${serviceId}`)
      .then((r) => r.json())
      .then(setMetrics)
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

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3 animate-pulse">
        {[0, 1, 2].map((i) => <div key={i} className="bg-gray-50 rounded-lg p-3 h-20" />)}
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div>
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Performance — last 60 min</div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">CPU</div>
          <Sparkline data={metrics.cpu} color="#6f7bf7" unit="cores" />
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">Memory</div>
          <Sparkline data={metrics.memory} color="#34d399" unit="bytes" />
        </div>
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">HTTP errors</div>
          {errorRate !== null ? (
            <>
              <div className={`text-[13px] font-semibold mb-1 ${parseFloat(errorRate) > 1 ? "text-red-500" : "text-gray-900"}`}>
                {errorRate}%
              </div>
              <div className="text-[10px] text-gray-400">{Math.round(fivexx)} 5xx / {Math.round(total)} req</div>
            </>
          ) : (
            <div className="text-[11px] text-gray-400 mt-2">No traffic tracked</div>
          )}
        </div>
      </div>
    </div>
  );
}
