"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/api";
import type { User } from "@supabase/supabase-js";

interface SearchResult {
  type: "project" | "service";
  label: string;
  sub: string;
  href: string;
  icon: React.ReactNode;
}

interface RawProject {
  id: string;
  name: string;
  description: string;
  project_services: { service_type: string }[];
}

interface RawService {
  service_type: string;
  service_name: string;
  is_active: boolean;
}

const SERVICE_ICON: Record<string, React.ReactNode> = {
  vercel: (
    <svg viewBox="0 0 76 65" className="w-3 h-3" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  render: (
    <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4a8 8 0 110 16A8 8 0 0112 4z" />
    </svg>
  ),
};

function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const [projects, setProjects] = useState<RawProject[]>([]);
  const [services, setServices] = useState<RawService[]>([]);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (loaded) return;
    Promise.all([
      apiFetch("/api/projects").then((r) => r.json()).catch(() => ({ projects: [] })),
      apiFetch("/api/services").then((r) => r.json()).catch(() => ({ services: [] })),
    ]).then(([p, s]) => {
      setProjects(p.projects ?? []);
      setServices(s.services ?? []);
      setLoaded(true);
    });
  }, [loaded]);

  // Keyboard shortcut: "/" to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const results: SearchResult[] = (() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const out: SearchResult[] = [];

    projects
      .filter((p) => p.name.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
      .slice(0, 5)
      .forEach((p) => {
        const types = p.project_services.map((s) => s.service_type).join(", ");
        out.push({
          type: "project",
          label: p.name,
          sub: types || "No services linked",
          href: `/dashboard/projects/${p.id}`,
          icon: (
            <div className="w-5 h-5 rounded bg-linear-to-br from-brand-purple to-brand-cyan flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </div>
          ),
        });
      });

    services
      .filter(
        (s) =>
          s.service_type.toLowerCase().includes(q) ||
          s.service_name?.toLowerCase().includes(q)
      )
      .slice(0, 3)
      .forEach((s) => {
        out.push({
          type: "service",
          label: s.service_type.charAt(0).toUpperCase() + s.service_type.slice(1),
          sub: s.service_name ?? "",
          href: "/dashboard/services",
          icon: (
            <div className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center">
              {SERVICE_ICON[s.service_type]}
            </div>
          ),
        });
      });

    return out;
  })();

  const navigate = (href: string) => {
    router.push(href);
    setOpen(false);
    setQuery("");
    setCursor(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, -1));
    } else if (e.key === "Enter" && cursor >= 0 && results[cursor]) {
      navigate(results[cursor].href);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  const projectResults = results.filter((r) => r.type === "project");
  const serviceResults = results.filter((r) => r.type === "service");
  let globalIndex = -1;

  return (
    <div ref={containerRef} className="relative flex-1 max-w-120">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
        fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
      >
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Search projects, services…"
        autoComplete="off"
        className="w-full py-2 pl-9 pr-8 border border-black/8 rounded-button text-[13px] outline-none bg-white/95 focus:border-brand-purple/40 focus:ring-2 focus:ring-brand-purple/10 transition-all"
        onChange={(e) => { setQuery(e.target.value); setCursor(-1); }}
        onFocus={() => { setOpen(true); load(); }}
        onKeyDown={onKeyDown}
      />
      {/* "/" hint */}
      {!open && !query && (
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 border border-gray-200 rounded px-1 py-0.5 font-mono pointer-events-none">
          /
        </kbd>
      )}

      {/* Dropdown */}
      {open && query.trim() && (
        <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-card shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <div className="px-4 py-6 text-center text-[13px] text-gray-400">No results for &ldquo;{query}&rdquo;</div>
          ) : (
            <>
              {projectResults.length > 0 && (
                <div>
                  <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Projects</div>
                  {projectResults.map((r) => {
                    globalIndex++;
                    const idx = globalIndex;
                    return (
                      <div
                        key={r.href + r.label}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => navigate(r.href)}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${cursor === idx ? "bg-brand-purple/5" : "hover:bg-gray-50"}`}
                      >
                        {r.icon}
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-gray-900 truncate">{r.label}</div>
                          <div className="text-[11px] text-gray-400 truncate">{r.sub}</div>
                        </div>
                        <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              )}
              {serviceResults.length > 0 && (
                <div className={projectResults.length > 0 ? "border-t border-gray-100" : ""}>
                  <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Services</div>
                  {serviceResults.map((r) => {
                    globalIndex++;
                    const idx = globalIndex;
                    return (
                      <div
                        key={r.href + r.label}
                        onMouseEnter={() => setCursor(idx)}
                        onClick={() => navigate(r.href)}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${cursor === idx ? "bg-brand-purple/5" : "hover:bg-gray-50"}`}
                      >
                        {r.icon}
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium text-gray-900 truncate">{r.label}</div>
                          <div className="text-[11px] text-gray-400 truncate">{r.sub}</div>
                        </div>
                        <svg className="w-3 h-3 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Header({ user }: { user: User | null }) {
  const router = useRouter();
  const supabase = createClient();

  const username = user?.user_metadata?.user_name ?? "User";
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = username.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <div className="glass-header border-b border-white/30 px-7 h-16 flex items-center gap-4 shadow-sm">
      <SearchBar />

      {/* User */}
      <div className="flex items-center gap-3 ml-auto">
        <div className="flex items-center gap-2.5">
          {avatarUrl ? (
            <img src={avatarUrl} alt={username} className="w-7 h-7 rounded-full" />
          ) : (
            <div className="w-7 h-7 rounded-full bg-linear-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-[11px] font-medium text-white">
              {initials}
            </div>
          )}
          <div>
            <div className="text-[13px] font-medium text-gray-700 leading-tight">{username}</div>
            <div className="text-[10px] text-gray-400">Free</div>
          </div>
        </div>

        <button
          onClick={handleSignOut}
          title="Sign out"
          className="p-1.5 rounded-button text-gray-400 hover:text-red-400 hover:bg-black/5 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" />
          </svg>
        </button>
      </div>
    </div>
  );
}
