"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { SiRender } from "react-icons/si";

type EventStatus = "success" | "error" | "building" | "canceled" | "open" | "closed" | "merged" | "draft";
type EventType = "deployment" | "deploy" | "commit" | "pull_request" | "ci_run";
type ServiceType = "vercel" | "github" | "render" | "supabase";

interface Event {
  id: string;
  type: EventType;
  service: ServiceType;
  title: string;
  subtitle: string;
  status: EventStatus;
  timestamp: string;
  url: string;
}

// ── Icons ──────────────────────────────────────────────────────────────────

const SERVICE_ICONS: Record<ServiceType, React.ReactNode> = {
  vercel: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
      <path d="M12 2L24 22H0L12 2Z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  render: <SiRender className="w-3.5 h-3.5" />,
  supabase: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
      <path d="M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C.131 12.88.71 14.09 1.762 14.09h9.823l.315 8.873c.015.986 1.26 1.41 1.874.637l9.262-11.652c.633-.829.054-2.04-.998-2.04h-9.823L11.9 1.036z" />
    </svg>
  ),
};

const TYPE_ICONS: Record<EventType, React.ReactNode> = {
  deployment: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  deploy: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
    </svg>
  ),
  commit: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <line x1="1.05" y1="12" x2="7" y2="12" />
      <line x1="17.01" y1="12" x2="22.96" y2="12" />
    </svg>
  ),
  pull_request: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 012 2v7" />
      <line x1="6" y1="9" x2="6" y2="21" />
    </svg>
  ),
  ci_run: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  ),
};

// ── Status badge ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  success: { label: "Success", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  error:   { label: "Failed",  classes: "bg-red-50 text-red-700 border-red-200" },
  building:{ label: "Building",classes: "bg-amber-50 text-amber-700 border-amber-200" },
  canceled:{ label: "Canceled",classes: "bg-gray-100 text-gray-500 border-gray-200" },
  open:    { label: "Open",    classes: "bg-blue-50 text-blue-700 border-blue-200" },
  closed:  { label: "Closed",  classes: "bg-gray-100 text-gray-500 border-gray-200" },
  merged:  { label: "Merged",  classes: "bg-purple-50 text-purple-700 border-purple-200" },
  draft:   { label: "Draft",   classes: "bg-gray-100 text-gray-500 border-gray-200" },
};

const SERVICE_COLORS: Record<ServiceType, string> = {
  vercel:   "bg-black text-white",
  github:   "bg-[#24292f] text-white",
  render:   "bg-gray-900 text-white",
  supabase: "bg-[#3ecf8e] text-white",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Main component ─────────────────────────────────────────────────────────

const FILTERS = ["All", "vercel", "github", "render", "supabase"] as const;
type Filter = (typeof FILTERS)[number];

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [connected, setConnected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("All");

  useEffect(() => {
    apiFetch("/api/events")
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events ?? []);
        setConnected(data.connected ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = filter === "All" ? events : events.filter((e) => e.service === filter);

  const filterLabel: Record<string, string> = {
    vercel: "Vercel",
    github: "GitHub",
    render: "Render",
    supabase: "Supabase",
  };

  const availableFilters: Filter[] = ["All", ...connected.filter((s) => FILTERS.includes(s as Filter))] as Filter[];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1.5">
          Events
        </h1>
        <p className="text-sm text-white/75">
          Unified activity feed across all connected services
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-5">
        {availableFilters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-button text-[12px] font-medium transition-colors capitalize ${
              filter === f
                ? "bg-white text-brand-purple shadow-sm"
                : "bg-white/30 text-white/80 hover:bg-white/40"
            }`}
          >
            {f === "All" ? "All" : filterLabel[f] ?? f}
          </button>
        ))}
      </div>

      <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card overflow-hidden">
        {loading ? (
          <div className="flex flex-col gap-0 divide-y divide-black/4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-7 h-7 rounded-lg bg-gray-100 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="h-3.5 bg-gray-100 rounded w-2/5 mb-2" />
                  <div className="h-3 bg-gray-50 rounded w-3/5" />
                </div>
                <div className="h-5 w-16 bg-gray-100 rounded-full" />
                <div className="h-3 w-14 bg-gray-50 rounded" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">
              {connected.length === 0 ? "No services connected" : "No events yet"}
            </p>
            <p className="text-xs text-gray-400 max-w-xs">
              {connected.length === 0
                ? "Connect a service on the Services page to start seeing activity."
                : "Events will appear here as your connected services send activity."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-black/4">
            {visible.map((event) => {
              const statusCfg = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.canceled;
              return (
                <a
                  key={event.id}
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 px-5 py-3.5 hover:bg-black/1.5 transition-colors group"
                >
                  {/* Service icon */}
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${SERVICE_COLORS[event.service]}`}>
                    {SERVICE_ICONS[event.service]}
                  </div>

                  {/* Event type icon + content */}
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-gray-400 shrink-0">{TYPE_ICONS[event.type]}</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate leading-snug">
                        {event.title}
                      </p>
                      {event.subtitle && (
                        <p className="text-[11px] text-gray-400 truncate mt-0.5">{event.subtitle}</p>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${statusCfg.classes}`}>
                    {statusCfg.label}
                  </span>

                  {/* Time */}
                  <span suppressHydrationWarning className="text-[11px] text-gray-400 whitespace-nowrap w-16 text-right shrink-0">
                    {timeAgo(event.timestamp)}
                  </span>

                  {/* External link arrow */}
                  <svg className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-500 transition-colors shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                </a>
              );
            })}
          </div>
        )}
      </div>

      {/* Event count */}
      {!loading && visible.length > 0 && (
        <p className="text-xs text-white/50 mt-3 text-center">
          Showing {visible.length} event{visible.length !== 1 ? "s" : ""}
          {filter !== "All" ? ` from ${filterLabel[filter] ?? filter}` : ""}
        </p>
      )}
    </>
  );
}
