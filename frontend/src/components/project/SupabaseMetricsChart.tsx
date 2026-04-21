"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SupabaseMetrics } from "@/types/project";

function fmtBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

function fmtNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function GaugeBar({ pct, warn, goodBelow, label, sublabel, value }: {
  pct: number | null; warn: number; goodBelow?: number; label: string; sublabel: string; value?: string;
}) {
  const isWarn = pct !== null && pct > warn;
  const isGood = pct !== null && goodBelow !== undefined && pct <= goodBelow;
  const filled = Math.min(pct ?? 0, 100);
  const barColor = isWarn ? "bg-red-400" : isGood ? "bg-emerald-400" : "bg-brand-purple/70";
  const bg = isWarn ? "bg-red-50/70 border border-red-200/60" : isGood ? "bg-emerald-50/40" : "bg-gray-50/80";

  return (
    <div className={`rounded-xl p-4 ${bg}`}>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="text-right">
          <span className={`text-[18px] font-bold leading-none ${isWarn ? "text-red-500" : isGood ? "text-emerald-600" : "text-gray-900"}`}>
            {pct !== null ? `${pct}%` : "—"}
          </span>
          {isWarn && <span className="ml-1.5 text-[9px] font-bold text-red-400 uppercase">high</span>}
        </div>
      </div>
      <div className="h-2 bg-gray-200/80 rounded-full overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${filled}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">{sublabel}</span>
        {value && <span className="text-[10px] font-medium text-gray-500">{value}</span>}
      </div>
    </div>
  );
}

function StatRow({ label, value, sub, warn }: { label: string; value: string | null; sub?: string; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-[11px] text-gray-500">{label}</span>
      <div className="text-right">
        <span className={`text-[12px] font-semibold ${warn ? "text-red-500" : "text-gray-800"}`}>{value ?? "—"}</span>
        {sub && <span className="ml-1.5 text-[10px] text-gray-400">{sub}</span>}
      </div>
    </div>
  );
}

export function SupabaseMetricsChart({ projectRef }: { projectRef: string }) {
  const [metrics, setMetrics] = useState<SupabaseMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    apiFetch(`/api/supabase/projects/${projectRef}/metrics`)
      .then((r) => { if (!r.ok) { setUnavailable(true); return null; } return r.json(); })
      .then((d) => { if (d) setMetrics(d); })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, [projectRef]);

  if (loading) return (
    <div className="space-y-3 animate-pulse">
      {[0,1,2,3].map(i => <div key={i} className="h-20 bg-gray-50 rounded-xl" />)}
    </div>
  );

  if (unavailable || !metrics) return (
    <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
      <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M9 17H7A5 5 0 017 7h2M15 7h2a5 5 0 010 10h-2M8 12h8"/></svg>
      <p className="text-[12px] text-gray-400">Metrics unavailable</p>
      <p className="text-[10px] text-gray-300">Service role key could not be retrieved</p>
    </div>
  );

  const { connections, database, disk, memory, cache, transactions, rows, deadlocks, temp_bytes } = metrics;

  const connSublabel = connections.active !== null && connections.max !== null
    ? `${connections.active} active / ${connections.max} max`
    : "No connection data";
  const diskSublabel = disk.total_bytes && disk.avail_bytes
    ? `${fmtBytes(disk.total_bytes - disk.avail_bytes)} used`
    : "No disk data";
  const memSublabel = memory.total_bytes && memory.avail_bytes
    ? `${fmtBytes(memory.total_bytes - memory.avail_bytes)} used`
    : "No memory data";
  const cacheSublabel = cache?.blks_hit != null && cache?.blks_read != null
    ? `${fmtNum(cache.blks_hit)} hits, ${fmtNum(cache.blks_read)} misses`
    : "No cache data";
  const dbSublabel = database.size_bytes && database.limit_bytes
    ? `${fmtBytes(database.size_bytes)} of ${fmtBytes(database.limit_bytes)}`
    : database.size_bytes ? fmtBytes(database.size_bytes) : "No data";

  const anyPressure = (connections.pct ?? 0) > 80 || (disk.used_pct ?? 0) > 80 || (memory.used_pct ?? 0) > 80;
  const cacheLow = cache?.hit_pct !== null && (cache?.hit_pct ?? 100) < 85;
  const seqScanRatio = rows?.returned != null && rows.fetched != null && rows.fetched > 0
    ? Math.round((rows.returned / rows.fetched) * 100) / 100
    : null;

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Infrastructure</span>
        <div className="flex items-center gap-1.5">
          {(anyPressure || cacheLow) && (
            <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              Pressure
            </span>
          )}
          {database.size_bytes && (
            <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">{fmtBytes(database.size_bytes)}</span>
          )}
        </div>
      </div>

      {/* 2×2 gauge grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <GaugeBar
          pct={connections.pct} warn={80} label="Connections" sublabel={connSublabel}
          value={connections.active != null ? `${connections.active} / ${connections.max}` : undefined}
        />
        <GaugeBar
          pct={disk.used_pct} warn={80} label="Disk" sublabel={diskSublabel}
          value={disk.total_bytes ? fmtBytes(disk.total_bytes) : undefined}
        />
        <GaugeBar
          pct={memory.used_pct} warn={80} label="Memory" sublabel={memSublabel}
          value={memory.total_bytes ? fmtBytes(memory.total_bytes) : undefined}
        />
        <GaugeBar
          pct={cache?.hit_pct ?? null} warn={85} goodBelow={95} label="Cache Hit" sublabel={cacheSublabel}
        />
        <div className="col-span-2">
          {database.used_pct != null ? (
            <div>
              <GaugeBar
                pct={database.used_pct} warn={80} label="Database Size" sublabel={dbSublabel}
                value={database.limit_bytes ? fmtBytes(database.limit_bytes) + " limit" : undefined}
              />
              {database.limit_is_plan_default && (
                <p className="text-[10px] text-gray-400 mt-1 text-right">limit estimated from plan tier</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl p-4 bg-gray-50/80">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Database Size</span>
                <span className="text-[18px] font-bold text-gray-900 leading-none">
                  {database.size_bytes ? fmtBytes(database.size_bytes) : "—"}
                </span>
              </div>
              <div className="h-2 bg-gray-200/80 rounded-full overflow-hidden mb-2">
                <div className="h-full w-0 rounded-full bg-brand-purple/70" />
              </div>
              <span className="text-[10px] text-gray-400">No plan limit available</span>
            </div>
          )}
        </div>
      </div>

      {/* Transactions + deadlocks */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Transactions</p>
        <div className="bg-gray-50/80 rounded-xl px-4 divide-y divide-gray-100">
          <StatRow label="Commits" value={transactions?.commit != null ? fmtNum(transactions.commit) : null} />
          <StatRow
            label="Rollbacks"
            value={transactions?.rollback != null ? fmtNum(transactions.rollback) : null}
            sub={transactions?.rollback_pct != null ? `${transactions.rollback_pct}%` : undefined}
            warn={(transactions?.rollback_pct ?? 0) > 5}
          />
          <StatRow label="Deadlocks" value={deadlocks != null ? String(deadlocks) : null} warn={(deadlocks ?? 0) > 0} />
          {(rows?.conflicts ?? 0) > 0 && (
            <StatRow label="Conflicts" value={fmtNum(rows!.conflicts!)} warn />
          )}
        </div>
      </div>

      {/* Row activity */}
      {rows && (rows.inserted != null || rows.updated != null || rows.deleted != null) && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Row Activity</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Inserted", value: rows.inserted, color: "text-emerald-600" },
              { label: "Updated", value: rows.updated, color: "text-brand-purple" },
              { label: "Deleted", value: rows.deleted, color: "text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-gray-50/80 rounded-xl p-3 text-center">
                <div className={`text-[15px] font-bold ${color}`}>{value != null ? fmtNum(value) : "—"}</div>
                <div className="text-[9px] uppercase tracking-wider text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
          {seqScanRatio != null && seqScanRatio > 10 && (
            <div className="mt-2 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span className="text-[11px] text-amber-700">High sequential scan ratio ({seqScanRatio}×) — consider adding indexes</span>
            </div>
          )}
        </div>
      )}

      {/* Temp file warning */}
      {temp_bytes != null && temp_bytes > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span className="text-[11px] text-amber-700">Temp files: <span className="font-semibold">{fmtBytes(temp_bytes)}</span> — queries spilling to disk</span>
        </div>
      )}
    </div>
  );
}
