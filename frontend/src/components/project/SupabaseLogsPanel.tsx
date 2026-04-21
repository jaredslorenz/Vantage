"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { SupabaseLogRow } from "@/types/project";

type Source = "postgres" | "edge" | "auth" | "functions";

const SOURCE_LABELS: Record<Source, string> = {
  postgres: "Postgres",
  edge: "API (5xx)",
  auth: "Auth",
  functions: "Functions",
};

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-10 gap-2">
      <span className="w-2 h-2 rounded-full bg-emerald-400" />
      <p className="text-[12px] text-gray-400">No errors found</p>
    </div>
  );
}

function LogRow({ row }: { row: SupabaseLogRow; source: Source }) {
  const ts = row.f0_ ?? row.timestamp ?? "";
  const msg = row.event_message ?? row.msg ?? "";
  const severity = row.error_severity;
  const status = row.status_code;
  const method = row.method;
  const path = row.path;

  return (
    <div className="px-5 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/40 transition-colors">
      <div className="flex items-center gap-2 mb-1">
        {severity && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
            severity === "FATAL" ? "text-red-700 bg-red-100" : "text-red-600 bg-red-50"
          }`}>
            {severity}
          </span>
        )}
        {status && (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 text-red-600 bg-red-50">
            {status}
          </span>
        )}
        {method && (
          <span className="text-[10px] font-mono text-gray-500 shrink-0">{method}</span>
        )}
        {ts && (
          <span suppressHydrationWarning className="text-[11px] text-gray-400 shrink-0 ml-auto">
            {new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      {path && <p className="text-[11px] font-mono text-gray-500 truncate mb-0.5">{path}</p>}
      {msg && <p className="text-[12px] text-gray-700 font-mono truncate">{msg}</p>}
      {row.sql_state_code && (
        <p className="text-[10px] text-gray-400 mt-0.5">SQL state: {row.sql_state_code}</p>
      )}
    </div>
  );
}

export function SupabaseLogsPanel({ projectRef }: { projectRef: string }) {
  const [source, setSource] = useState<Source>("postgres");
  const [rows, setRows] = useState<SupabaseLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!projectRef) return;
    setLoading(true);
    setUnavailable(false);
    apiFetch(`/api/supabase/projects/${projectRef}/logs/${source}`)
      .then((r) => {
        if (!r.ok) { setUnavailable(true); return null; }
        return r.json();
      })
      .then((d) => { if (d) setRows(d.rows ?? []); })
      .catch(() => setUnavailable(true))
      .finally(() => setLoading(false));
  }, [projectRef, source]);

  return (
    <div>
      {/* Source tabs */}
      <div className="flex gap-1 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
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

      {loading ? (
        <div className="space-y-2 px-5 py-4 animate-pulse">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 bg-gray-50 rounded" />)}
        </div>
      ) : unavailable ? (
        <p className="text-[12px] text-gray-400 text-center py-10">Log access unavailable for this project</p>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        rows.map((row, i) => <LogRow key={i} row={row} source={source} />)
      )}
    </div>
  );
}
