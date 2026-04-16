"use client";

import { useState } from "react";
import type { Investigation, RuntimeError } from "@/types/project";

function ErrorsModal({ errors, onClose }: { errors: RuntimeError[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="text-[13px] font-semibold text-gray-900">Runtime Errors</span>
            <span className="text-[11px] text-gray-400 font-normal">{errors.length} detected</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {errors.map((err) => {
            const svc = err.metadata?.service_name || err.service || "unknown";
            const message = err.subtitle || err.title || "Runtime error";
            return (
              <div key={err.id} className="px-5 py-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-semibold text-red-500">{svc}</span>
                  <span className="text-[10px] text-gray-400">
                    {new Date(err.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p className="text-[12px] text-gray-700">{message}</p>
                {err.metadata?.errors && err.metadata.errors.length > 1 && (
                  <div className="mt-2 bg-red-50 rounded-lg px-3 py-2 font-mono text-[10px] text-red-600 space-y-0.5">
                    {err.metadata.errors.slice(0, 4).map((line, i) => (
                      <div key={i} className="truncate">{line}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function InvestigationModal({ investigation, onClose }: { investigation: Investigation; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="text-[13px] font-semibold text-gray-900">
              Investigation — {investigation.service}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider block mb-1">Error</span>
            <span className="text-[12px] text-red-700">{investigation.error}</span>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block mb-1">Root Cause</span>
            <span className="text-[12px] text-gray-700">{investigation.root_cause}</span>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3">
            <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider block mb-1">Suggested Fix</span>
            <span className="text-[12px] text-gray-700">{investigation.fix}</span>
          </div>
          {investigation.key_logs.length > 0 && (
            <div className="bg-gray-950 rounded-xl p-3 space-y-0.5 max-h-32 overflow-y-auto">
              {investigation.key_logs.map((line, i) => (
                <p key={i} className="text-[11px] font-mono text-gray-300 leading-relaxed">{line}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function IssuesStrip({
  runtimeErrors,
  investigation,
  investigating,
  onInvestigate,
}: {
  runtimeErrors: RuntimeError[];
  investigation: Investigation | null;
  investigating: boolean;
  onInvestigate: (serviceType: string) => void;
}) {
  const [errorsOpen, setErrorsOpen] = useState(false);
  const [investigationOpen, setInvestigationOpen] = useState(false);

  const hasIssues = runtimeErrors.length > 0 || investigation !== null || investigating;
  if (!hasIssues) return null;

  // Derive the service type to investigate (first error's service type)
  const serviceType = runtimeErrors[0]?.service || "render";

  // Unique service names for the summary label
  const serviceNames = [...new Set(runtimeErrors.map((e) => e.metadata?.service_name || e.service).filter(Boolean))];
  const serviceLabel = serviceNames.slice(0, 2).join(", ") + (serviceNames.length > 2 ? ` +${serviceNames.length - 2}` : "");

  return (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-3 bg-red-500/15 border border-red-400/40 rounded-xl px-4 py-3">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
          <span className="text-[12px] font-semibold text-white shrink-0">
            {runtimeErrors.length} {runtimeErrors.length === 1 ? "error" : "errors"} detected
          </span>
          {serviceLabel && (
            <span className="text-[12px] text-red-200/80 truncate flex-1">{serviceLabel}</span>
          )}

          <div className="flex items-center gap-3 shrink-0">
            {runtimeErrors.length > 0 && (
              <button
                onClick={() => setErrorsOpen(true)}
                className="text-[12px] font-medium text-red-200 hover:text-white transition-colors"
              >
                View errors →
              </button>
            )}

            {investigating ? (
              <span className="flex items-center gap-1.5 text-[12px] text-white/60">
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Investigating…
              </span>
            ) : investigation ? (
              <button
                onClick={() => setInvestigationOpen(true)}
                className="text-[12px] font-semibold text-white hover:text-red-100 transition-colors"
              >
                View fix →
              </button>
            ) : (
              <button
                onClick={() => onInvestigate(serviceType)}
                className="text-[12px] font-semibold text-white hover:text-red-100 transition-colors"
              >
                Investigate →
              </button>
            )}
          </div>
        </div>
      </div>

      {errorsOpen && <ErrorsModal errors={runtimeErrors} onClose={() => setErrorsOpen(false)} />}
      {investigationOpen && investigation && (
        <InvestigationModal investigation={investigation} onClose={() => setInvestigationOpen(false)} />
      )}
    </>
  );
}
