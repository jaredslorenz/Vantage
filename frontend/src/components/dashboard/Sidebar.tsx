"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuLayoutDashboard, LuFolderKanban, LuPlug, LuActivity, LuSettings2, LuChevronDown } from "react-icons/lu";
import { VantageIcon } from "@/components/VantageLogo";
import { apiFetch } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/dashboard",           label: "Overview",  Icon: LuLayoutDashboard },
  { href: "/dashboard/projects",  label: "Projects",  Icon: LuFolderKanban, hasDropdown: true },
  { href: "/dashboard/services",  label: "Services",  Icon: LuPlug },
  { href: "/dashboard/events",    label: "Events",    Icon: LuActivity },
  { href: "/dashboard/settings",  label: "Settings",  Icon: LuSettings2 },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const isOnProjects = pathname.startsWith("/dashboard/projects");
  const activeProjectId = pathname.match(/\/dashboard\/projects\/([^/]+)/)?.[1];

  useEffect(() => {
    if (isOnProjects && !collapsed) setProjectsOpen(true);
  }, [isOnProjects, collapsed]);

  useEffect(() => {
    if (!projectsOpen || projects.length > 0) return;
    apiFetch("/api/projects")
      .then((r) => r.json())
      .then((d) => setProjects(d.projects ?? []))
      .catch(() => {});
  }, [projectsOpen]);

  return (
    <div
      className={`${
        collapsed ? "w-20" : "w-55"
      } shrink-0 overflow-hidden glass border-r border-white/40 flex flex-col shadow-glass transition-all duration-300`}
    >
      {/* Header */}
      <div className={`px-3 h-16 border-b border-black/5 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <Link href="/" className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
            <VantageIcon size={34} />
            <div className="min-w-0">
              <div className="text-[16px] font-semibold text-gray-900 leading-tight">Vantage</div>
              <div className="text-[11px] text-brand-purple font-medium">DevOps Hub</div>
            </div>
          </Link>
        )}
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-white/40 transition-colors flex items-center justify-center"
        >
          <svg
            className={`w-5 h-5 text-gray-600 transition-transform ${collapsed ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-3 flex-1 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isProjects = !!item.hasDropdown;
          // When on a specific project, dim the Projects row so only the project item is highlighted
          const active = isProjects
            ? isOnProjects && !activeProjectId
            : pathname === item.href;

          return (
            <div key={item.href}>
              <div className="flex items-center gap-1">
                <Link
                  href={item.href}
                  title={item.label}
                  className={`relative flex flex-1 items-center ${
                    collapsed ? "justify-center" : "gap-3"
                  } px-3 py-2 rounded-button text-[13px] transition-all ${
                    active
                      ? "bg-white/70 text-brand-purple font-medium shadow-sm"
                      : "text-gray-500 hover:bg-white/40 hover:text-gray-800"
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-linear-to-b from-brand-purple to-brand-cyan rounded-full" />
                  )}
                  <div className="w-6 h-6 flex items-center justify-center shrink-0 text-[18px]">
                    <item.Icon />
                  </div>
                  {!collapsed && <span className="flex-1">{item.label}</span>}
                </Link>
                {isProjects && !collapsed && (
                  <button
                    onClick={() => setProjectsOpen((o) => !o)}
                    className="p-1.5 rounded-button text-gray-400 hover:text-gray-700 hover:bg-white/40 transition-all"
                  >
                    <LuChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${projectsOpen ? "rotate-180" : ""}`} />
                  </button>
                )}
              </div>

              {/* Project dropdown */}
              {isProjects && !collapsed && projectsOpen && (
                <div className="mt-0.5 ml-3 pl-6 border-l border-white/40 space-y-0.5">
                  {projects.length === 0 ? (
                    <p className="text-[11px] text-gray-400 py-1 px-2">No projects yet</p>
                  ) : (
                    projects.map((p) => (
                      <Link
                        key={p.id}
                        href={`/dashboard/projects/${p.id}`}
                        className={`block text-[12px] px-2 py-1.5 rounded-button truncate transition-all ${
                          activeProjectId === p.id
                            ? "text-brand-purple font-medium bg-white/60"
                            : "text-gray-500 hover:text-gray-800 hover:bg-white/40"
                        }`}
                      >
                        {p.name}
                      </Link>
                    ))
                  )}
                  <Link
                    href="/dashboard/projects"
                    className="block text-[11px] px-2 py-1 text-gray-400 hover:text-brand-purple transition-colors"
                  >
                    View all →
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
