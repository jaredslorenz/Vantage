"use client";

import { useState } from "react";

export const STATE_COLOR: Record<string, string> = {
  READY: "#34d399", ERROR: "#f87171", BUILDING: "#fbbf24", CANCELED: "#d1d5db",
};
export const STATE_LABEL: Record<string, string> = {
  READY: "Ready", ERROR: "Failed", BUILDING: "Building", CANCELED: "Canceled",
};
export const STATE_BG: Record<string, string> = {
  READY: "text-emerald-600 bg-emerald-50",
  ERROR: "text-red-500 bg-red-50",
  BUILDING: "text-amber-500 bg-amber-50",
  CANCELED: "text-gray-400 bg-gray-100",
};

// Render deploy status mappings
export const RENDER_COLOR: Record<string, string> = {
  live: "#34d399", build_failed: "#f87171", build_in_progress: "#fbbf24",
  update_in_progress: "#fbbf24", canceled: "#d1d5db", deactivated: "#d1d5db",
  pre_deploy_in_progress: "#fbbf24",
};
export const RENDER_LABEL: Record<string, string> = {
  live: "Live", build_failed: "Failed", build_in_progress: "Building",
  update_in_progress: "Updating", canceled: "Canceled", deactivated: "Deactivated",
  pre_deploy_in_progress: "Pre-deploy",
};
export const RENDER_BG: Record<string, string> = {
  live: "text-emerald-600 bg-emerald-50",
  build_failed: "text-red-500 bg-red-50",
  build_in_progress: "text-amber-500 bg-amber-50",
  update_in_progress: "text-amber-500 bg-amber-50",
  canceled: "text-gray-400 bg-gray-100",
  deactivated: "text-gray-400 bg-gray-100",
  pre_deploy_in_progress: "text-amber-500 bg-amber-50",
};

export function StatusDot({ state }: { state: string }) {
  const color = STATE_COLOR[state] ?? "#d1d5db";
  return (
    <span className="relative flex items-center justify-center w-1.5 h-1.5 shrink-0">
      {state === "BUILDING" && (
        <span className="absolute inline-flex w-full h-full rounded-full opacity-75 animate-ping" style={{ background: color }} />
      )}
      <span className="relative inline-flex w-1.5 h-1.5 rounded-full" style={{ background: color }} />
    </span>
  );
}

// --- Copy button ---
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      title="Copy"
      className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 shrink-0"
    >
      {copied
        ? <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
        : <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
      }
    </button>
  );
}
