"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiRender, SiSupabase } from "react-icons/si";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

interface ConnectedService {
  service_type: string;
  service_name: string;
  is_active: boolean;
  health_status: string;
}

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  vercel: (
    <svg viewBox="0 0 76 65" className="w-3.5 h-3.5" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  ),
  github: (
    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  ),
  render: <SiRender className="w-3.5 h-3.5" />,
  supabase: <SiSupabase className="w-3.5 h-3.5" />,
};

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [services, setServices] = useState<ConnectedService[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const username = user?.user_metadata?.user_name ?? "—";
  const email = user?.email ?? "—";
  const avatarUrl = user?.user_metadata?.avatar_url;
  const initials = username.slice(0, 2).toUpperCase();
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : "—";

  useEffect(() => {
    apiFetch("/api/services")
      .then((r) => r.json())
      .then((d) => setServices(d.services ?? []))
      .catch(() => {})
      .finally(() => setLoadingServices(false));
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Delete your account? This will remove all your projects, services, and insights. This cannot be undone.")) return;
    if (!confirm("Are you sure? This is permanent.")) return;
    setDeleting(true);
    try {
      await supabase.auth.signOut();
      router.push("/");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1.5">Settings</h1>
        <p className="text-sm text-white/75">Manage your account and connected services</p>
      </div>

      <div className="max-w-xl space-y-4">
        {/* Profile */}
        <section className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-5 shadow-card">
          <h2 className="text-[13px] font-semibold text-gray-700 mb-4">Profile</h2>
          <div className="flex items-center gap-4 mb-4">
            {avatarUrl ? (
              <img src={avatarUrl} alt={username} className="w-12 h-12 rounded-full" />
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
          <div className="space-y-0 divide-y divide-gray-100">
            <Row label="Plan" value="Free" />
            <Row label="Member since" value={memberSince} />
          </div>
        </section>

        {/* Connected services */}
        <section className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card p-5 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold text-gray-700">Connected Services</h2>
            <Link
              href="/dashboard/services"
              className="text-[11px] text-brand-purple hover:underline"
            >
              Manage →
            </Link>
          </div>

          {loadingServices ? (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-[12px] text-gray-400 mb-2">No services connected yet</p>
              <Link href="/dashboard/services" className="text-[12px] text-brand-purple hover:underline">
                Connect a service →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {services.map((svc) => (
                <div key={svc.service_type} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center shrink-0">
                    {SERVICE_ICONS[svc.service_type]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-900 capitalize">{svc.service_type}</div>
                    <div className="text-[11px] text-gray-400 truncate">{svc.service_name}</div>
                  </div>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Danger zone */}
        <section className="bg-white/95 backdrop-blur-[10px] border border-red-100 rounded-card p-5 shadow-card">
          <h2 className="text-[13px] font-semibold text-red-500 mb-4">Danger Zone</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <div>
                <div className="text-[13px] font-medium text-gray-800">Sign out</div>
                <div className="text-[12px] text-gray-400">You&apos;ll be redirected to the home page</div>
              </div>
              <button
                onClick={handleSignOut}
                className="text-[12px] font-medium px-3 py-1.5 rounded-button border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Sign out
              </button>
            </div>
            <div className="flex items-center justify-between py-2">
              <div>
                <div className="text-[13px] font-medium text-gray-800">Delete account</div>
                <div className="text-[12px] text-gray-400">Permanently remove your account and all data</div>
              </div>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="text-[12px] font-medium px-3 py-1.5 rounded-button border border-red-200 text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
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
