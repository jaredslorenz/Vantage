"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuLayoutDashboard, LuFolderKanban, LuPlug, LuActivity, LuSettings2 } from "react-icons/lu";
import { VantageIcon } from "@/components/VantageLogo";

const NAV_ITEMS = [
  { href: "/dashboard",           label: "Overview",  Icon: LuLayoutDashboard },
  { href: "/dashboard/projects",  label: "Projects",  Icon: LuFolderKanban },
  { href: "/dashboard/services",  label: "Services",  Icon: LuPlug },
  { href: "/dashboard/events",    label: "Events",    Icon: LuActivity },
  { href: "/dashboard/settings",  label: "Settings",  Icon: LuSettings2 },
];

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();

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
