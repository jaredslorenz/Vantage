"use client";

import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const username = user?.user_metadata?.user_name ?? "—";
  const email = user?.email ?? "—";
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = username.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1.5">
          Settings
        </h1>
        <p className="text-sm text-white/75">Manage your account</p>
      </div>

      <div className="max-w-xl space-y-4">
        {/* Profile */}
        <section className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-5 shadow-card">
          <h2 className="text-[13px] font-semibold text-gray-700 mb-4">Profile</h2>
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={username}
                className="w-12 h-12 rounded-full"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-linear-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-sm font-medium text-white">
                {initials}
              </div>
            )}
            <div>
              <div className="text-[14px] font-medium text-gray-900">{username}</div>
              <div className="text-[12px] text-gray-400">{email}</div>
            </div>
          </div>
        </section>

        {/* Account */}
        <section className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-5 shadow-card">
          <h2 className="text-[13px] font-semibold text-gray-700 mb-4">Account</h2>
          <div className="space-y-3">
            <Row label="GitHub username" value={`@${username}`} />
            <Row label="Email" value={email} />
            <Row label="Plan" value="Free" />
          </div>
        </section>

        {/* Danger zone */}
        <section className="bg-white/95 backdrop-blur-[10px] border border-red-100 rounded-card p-5 shadow-card">
          <h2 className="text-[13px] font-semibold text-red-500 mb-4">Danger Zone</h2>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-medium text-gray-800">Sign out</div>
              <div className="text-[12px] text-gray-400">
                You&apos;ll be redirected to the home page
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="text-[12px] font-medium px-3 py-1.5 rounded-button border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-[12px] text-gray-500">{label}</span>
      <span className="text-[12px] font-medium text-gray-800">{value}</span>
    </div>
  );
}
