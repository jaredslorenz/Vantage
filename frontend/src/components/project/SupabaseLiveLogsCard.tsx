"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SupabaseLogRow } from "@/types/project";

type Source = "postgres" | "edge" | "auth" | "functions";

const SOURCE_LABELS: Record<Source, string> = {
  postgres: "Postgres",
  edge: "Edge / API",
  auth: "Auth",
  functions: "Functions",
};

const LEVEL_COLOR: Record<string, string> = {
  ERROR: "text-red-600 bg-red-50",
  FATAL: "text-red-700 bg-red-100",
  WARNING: "text-amber-600 bg-amber-50",
  WARN: "text-amber-600 bg-amber-50",
  LOG: "text-gray-500 bg-gray-100",
  INFO: "text-blue-600 bg-blue-50",
  DEBUG: "text-gray-400 bg-gray-50",
};

function statusColor(code: number) {
  if (code >= 500) return "text-red-600 bg-red-50";
  if (code >= 400) return "text-amber-600 bg-amber-50";
  return "text-emerald-600 bg-emerald-50";
}

function toLocalDate(raw: string): Date | null {
  if (!raw) return null;
  // BigQuery datetime() returns "YYYY-MM-DD HH:MM:SS" without tz — treat as UTC
  const normalized = raw.includes("T") ? raw : raw.replace(" ", "T");
  const iso = normalized.endsWith("Z") ? normalized : normalized + "Z";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function LogEntry({ row }: { row: SupabaseLogRow }) {
  const rawTs = row.ts ?? row.f0_ ?? row.timestamp ?? "";
  const tsDate = toLocalDate(rawTs);
  const msg = row.event_message ?? row.msg ?? "";
  const severity = row.error_severity?.toUpperCase();
  const level = row.level?.toUpperCase();
  const badge = severity ?? level;
  const status = row.status_code;
  const method = row.method;
  const path = row.path;

  return (
    <div className="px-5 py-2.5 border-b border-gray-100 last:border-0 hover:bg-gray-50/40 transition-colors">
      <div className="flex items-center gap-2 mb-0.5">
        {badge && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0 ${LEVEL_COLOR[badge] ?? "text-gray-500 bg-gray-100"}`}>
            {badge}
          </span>
        )}
        {status !== undefined && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0 ${statusColor(status ?? 0)}`}>
            {status}
          </span>
        )}
        {method && <span className="text-[10px] font-mono text-gray-400 shrink-0">{method}</span>}
        {path && <span className="text-[10px] font-mono text-gray-500 truncate flex-1">{path}</span>}
        {tsDate && (
          <span suppressHydrationWarning className="text-[10px] text-gray-400 shrink-0 ml-auto">
            {tsDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
        )}
      </div>
      {msg && !path && <p className="text-[11px] font-mono text-gray-600 truncate">{msg}</p>}
      {row.sql_state_code && <p className="text-[10px] text-gray-400 mt-0.5">SQL: {row.sql_state_code}</p>}
    </div>
  );
}

export function LiveLogsCard({ projectRef }: { projectRef: string }) {
  const [source, setSource] = useState<Source>("edge");
  const [rows, setRows] = useState<SupabaseLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLogs = (src: Source) => {
    apiFetch(`/api/supabase/projects/${projectRef}/logs/${src}/live`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d) => { setRows(d.rows ?? []); setLastUpdated(new Date()); setError(false); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    setRows([]);
    fetchLogs(source);
    intervalRef.current = setInterval(() => fetchLogs(source), 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [projectRef, source]);

  return (
    <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Live Logs</p>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-500 font-semibold">live</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span suppressHydrationWarning className="text-[10px] text-gray-400">
              updated {lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Source tabs */}
      <div className="flex gap-1 px-5 py-2 border-b border-gray-100 bg-gray-50/40">
        {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`text-[11px] font-medium px-2.5 py-1 rounded-button transition-all ${
              source === s ? "bg-white text-gray-900 shadow-sm border border-gray-200" : "text-gray-400 hover:text-gray-700"
            }`}
          >
            {SOURCE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Log rows */}
      <div className="max-h-72 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 px-5 py-4 animate-pulse">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 bg-gray-50 rounded" />)}
          </div>
        ) : error ? (
          <p className="text-[12px] text-gray-400 text-center py-10">Could not load logs</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <p className="text-[12px] text-gray-400">No log entries found</p>
          </div>
        ) : (
          rows.map((row, i) => <LogEntry key={i} row={row} />)
        )}
      </div>
    </div>
  );
}
