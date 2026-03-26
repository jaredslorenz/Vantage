"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

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
      {/* Search */}
      <div className="flex-1 max-w-120">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.75 h-3.75 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="7.5" cy="7.5" r="6" />
            <path d="M13 13l3 3" />
          </svg>
          <input
            type="text"
            placeholder="Search events, services..."
            autoComplete="nope"
            className="w-full py-2 pl-9 pr-3 border border-black/8 rounded-button text-[13px] outline-none bg-white/95"
          />
        </div>
      </div>

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
