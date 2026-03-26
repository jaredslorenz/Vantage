"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuLayoutDashboard, LuFolderKanban, LuPlug, LuActivity, LuSettings2 } from "react-icons/lu";

const NAV_ITEMS = [
  { href: "/dashboard",           label: "Overview",  Icon: LuLayoutDashboard },
  { href: "/dashboard/projects",  label: "Projects",  Icon: LuFolderKanban },
  { href: "/dashboard/services",  label: "Services",  Icon: LuPlug },
  { href: "/dashboard/events",    label: "Events",    Icon: LuActivity },
  { href: "/dashboard/settings",  label: "Settings",  Icon: LuSettings2 },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <div
      className={`${
        collapsed ? "w-20" : "w-55"
      } min-w-20 overflow-visible glass border-r border-white/40 flex flex-col shadow-glass transition-all duration-300`}
    >
      {/* Header */}
      <div className="px-3 h-16 border-b border-black/5 flex items-center justify-between">
        {!collapsed && (
          <div>
            <div className="text-base font-medium text-gray-900 tracking-tight">
              Vantage
            </div>
            <div className="text-[11px] text-brand-purple font-medium mt-1">
              DevOps Hub
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-2 rounded-lg hover:bg-white/40 transition-colors flex items-center justify-center"
        >
          <svg
            className={`w-5 h-5 text-gray-600 transition-transform ${
              collapsed ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="p-3 flex-1 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`relative flex items-center ${
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
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
