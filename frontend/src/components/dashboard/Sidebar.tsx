"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </>
    ),
  },
  {
    href: "/dashboard/projects",
    label: "Projects",
    icon: (
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    ),
  },
  {
    href: "/dashboard/services",
    label: "Services",
    icon: (
      <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    ),
  },
  {
    href: "/dashboard/events",
    label: "Events",
    icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a7.97 7.97 0 000-6l2.1-1.6-2-3.4-2.5 1a8.12 8.12 0 00-2.6-1.5L14 1h-4l-.4 2.5a8.12 8.12 0 00-2.6 1.5l-2.5-1-2 3.4L4.6 9a7.97 7.97 0 000 6l-2.1 1.6 2 3.4 2.5-1a8.12 8.12 0 002.6 1.5L10 23h4l.4-2.5a8.12 8.12 0 002.6-1.5l2.5 1 2-3.4L19.4 15z" />
      </>
    ),
  },
];

export default function Sidebar({ user }: { user: User | null }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const username = user?.user_metadata?.user_name ?? "User";
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div
      className={`${
        collapsed ? "w-20" : "w-55"
      } min-w-20 overflow-visible glass border-r border-white/40 flex flex-col shadow-glass transition-all duration-300`}
    >
      {/* Header */}
      <div className="px-3 py-5 border-b border-black/5 flex items-center justify-between">
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
              className={`flex items-center ${
                collapsed ? "justify-center" : "gap-3"
              } px-3 py-2 rounded-button text-[13px] transition-all ${
                active
                  ? "bg-white/50 text-brand-purple font-medium"
                  : "text-gray-600 hover:bg-white/30"
              }`}
            >
              <div className="w-6 h-6 flex items-center justify-center shrink-0">
                <svg
                  className="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  {item.icon}
                </svg>
              </div>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-2.5 border-t border-black/5">
        <div
          className={`flex items-center ${
            collapsed ? "justify-center" : "gap-2"
          } px-2.5 py-2 rounded-button bg-black/2 mb-2`}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={username}
              className="w-7 h-7 rounded-full"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-linear-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-[11px] font-medium text-white">
              {initials}
            </div>
          )}

          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-900 truncate">
                {username}
              </div>
              <div className="text-[10px] text-gray-500">Free</div>
            </div>
          )}
        </div>

        <button
          onClick={handleSignOut}
          className={`w-full flex items-center ${
            collapsed ? "justify-center" : "gap-3"
          } px-2.5 py-2 rounded-button text-red-600 text-[13px] hover:bg-black/2 transition-colors`}
        >
          <div className="w-6 h-6 flex items-center justify-center">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9" />
            </svg>
          </div>
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}
