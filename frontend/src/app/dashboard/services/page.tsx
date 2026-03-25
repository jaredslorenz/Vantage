"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface ConnectedService {
  service_type: string;
  service_name: string;
  service_id: string;
  is_active: boolean;
  health_status: string;
  created_at: string;
  has_api_token: boolean;
}

const SERVICE_META: Record<string, { label: string; description: string; logo: React.ReactNode }> = {
  vercel: {
    label: "Vercel",
    description: "Deployments, build logs, and preview URLs",
    logo: (
      <svg viewBox="0 0 76 65" className="w-5 h-5" fill="currentColor">
        <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
      </svg>
    ),
  },
  github: {
    label: "GitHub",
    description: "Repositories, commits, and pull requests",
    logo: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
  },
};

const AVAILABLE_SERVICES = ["vercel", "github"];

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Authorization was denied or failed. Please try again.",
  invalid_state: "Session expired during authorization. Please try again.",
  token_exchange_failed: "Could not complete the connection. Please try again.",
};

function VercelApiTokenForm({
  hasToken,
  onSaved,
  onRemoved,
}: {
  hasToken: boolean;
  onSaved: () => void;
  onRemoved: () => void;
}) {
  const [token, setToken] = useState("");
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSave = async () => {
    if (!token.trim()) return;
    setStatus("saving");
    setErrorMsg("");
    try {
      const res = await apiFetch("/api/vercel/api-token", {
        method: "POST",
        body: JSON.stringify({ token: token.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.detail ?? "Invalid token");
        setStatus("error");
        return;
      }
      setToken("");
      setStatus("idle");
      onSaved();
    } catch {
      setErrorMsg("Could not reach the server");
      setStatus("error");
    }
  };

  const handleRemove = async () => {
    await apiFetch("/api/vercel/api-token", { method: "DELETE" });
    onRemoved();
  };

  if (hasToken) {
    return (
      <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-[12px] text-gray-500">API access enabled</span>
        </div>
        <button
          onClick={handleRemove}
          className="text-[11px] text-gray-400 hover:text-red-400 transition-colors"
        >
          Remove token
        </button>
      </div>
    );
  }

  return (
    <div className="pt-3 mt-3 border-t border-gray-100">
      <p className="text-[12px] text-gray-500 mb-1.5">
        Add a{" "}
        <a
          href="https://vercel.com/account/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-purple underline underline-offset-2"
        >
          Personal Access Token
        </a>{" "}
        for read-only access to your deployments and projects.
        No special scope required.
      </p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={visible ? "text" : "password"}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="paste token here"
            autoComplete="off"
            className="w-full px-3 py-1.5 pr-8 border border-gray-200 rounded-button text-[12px] outline-none focus:border-brand-purple font-mono"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            tabIndex={-1}
          >
            {visible ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={!token.trim() || status === "saving"}
          className="px-3 py-1.5 rounded-button bg-linear-to-br from-brand-purple to-brand-cyan text-white text-[12px] font-medium shadow-button disabled:opacity-50"
        >
          {status === "saving" ? "Verifying..." : "Save"}
        </button>
      </div>
      {status === "error" && (
        <p className="text-[11px] text-red-500 mt-1.5">{errorMsg}</p>
      )}
    </div>
  );
}

export default function ServicesPage() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMessage = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? "Something went wrong. Please try again.")
    : null;

  const [connected, setConnected] = useState<ConnectedService[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    apiFetch("/api/services")
      .then((r) => r.json())
      .then((data) => setConnected(data.services ?? []))
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, []);

  const connectedTypes = new Set(connected.map((s) => s.service_type));

  const updateService = (serviceType: string, patch: Partial<ConnectedService>) => {
    setConnected((prev) =>
      prev.map((s) => (s.service_type === serviceType ? { ...s, ...patch } : s))
    );
  };

  const handleDisconnect = async (serviceType: string) => {
    if (serviceType !== "vercel") return;
    await apiFetch("/api/vercel/disconnect", { method: "DELETE" });
    setConnected((prev) => prev.filter((s) => s.service_type !== serviceType));
  };

  const handleConnect = async (serviceType: string) => {
    if (serviceType !== "vercel") return;
    try {
      setConnecting(true);
      const res = await apiFetch("/api/vercel/connect");
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setConnecting(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1.5">
          Services
        </h1>
        <p className="text-sm text-white/75">
          Connect your DevOps tools to start monitoring
        </p>
      </div>

      {(errorMessage || fetchError) && (
        <div className="mb-5 px-4 py-3 rounded-card bg-red-50 border border-red-200 text-red-700 text-sm">
          {fetchError
            ? "Could not reach the server. Make sure the backend is running."
            : errorMessage}
        </div>
      )}

      {connected.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">
            Connected
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-3.5">
            {connected.map((svc) => {
              const meta = SERVICE_META[svc.service_type];
              return (
                <div
                  key={svc.service_type}
                  className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-4.5 shadow-card"
                >
                  {/* Service header */}
                  <div className="flex items-start gap-3 mb-0.5">
                    <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                      {meta?.logo}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[14px] font-medium text-gray-900">
                          {meta?.label ?? svc.service_type}
                        </span>
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                          Connected
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{svc.service_name || svc.service_id}</p>
                    </div>
                    <button
                      onClick={() => handleDisconnect(svc.service_type)}
                      className="text-[11px] text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                    >
                      Disconnect
                    </button>
                  </div>

                  {/* API token step for Vercel */}
                  {svc.service_type === "vercel" && (
                    <VercelApiTokenForm
                      hasToken={svc.has_api_token}
                      onSaved={() => updateService("vercel", { has_api_token: true })}
                      onRemoved={() => updateService("vercel", { has_api_token: false })}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-semibold text-white/80 uppercase tracking-wider mb-3">
          {connected.length > 0 ? "Add More" : "Available Services"}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3.5">
          {AVAILABLE_SERVICES.filter((t) => !connectedTypes.has(t)).map((type) => {
            const meta = SERVICE_META[type];
            const isVercel = type === "vercel";
            return (
              <div
                key={type}
                className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-4.5 shadow-card flex items-start gap-3.5"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                  {meta?.logo}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-gray-900 mb-0.5">{meta?.label}</div>
                  <p className="text-xs text-gray-500 mb-3">{meta?.description}</p>
                  <button
                    onClick={() => handleConnect(type)}
                    disabled={connecting || !isVercel}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-button bg-linear-to-br from-brand-purple to-brand-cyan text-white shadow-button hover:shadow-lg transition-shadow disabled:opacity-50"
                  >
                    {connecting && isVercel ? "Connecting..." : isVercel ? "Connect" : "Coming soon"}
                  </button>
                </div>
              </div>
            );
          })}

          {AVAILABLE_SERVICES.every((t) => connectedTypes.has(t)) && (
            <p className="text-sm text-white/60 col-span-full">
              All available services are connected.
            </p>
          )}
        </div>
      </div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </>
  );
}
