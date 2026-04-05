"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { VantageIcon } from "@/components/VantageLogo";

export function Nav() {
  const supabase = createClient();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
    });
  }, []);

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/5">
      <div className="max-w-7xl mx-auto px-12 py-5 flex justify-between items-center">
        <a href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <VantageIcon size={38} />
          <div>
            <div className="text-[18px] font-semibold text-[#0f172a] leading-tight">Vantage</div>
            <div className="text-[11px] text-brand-purple font-medium">DevOps Hub</div>
          </div>
        </a>

        <div className="flex gap-10 items-center">
          <a href="#features" className="text-[15px] text-[#64748b] hover:text-[#0f172a] transition-colors">
            Features
          </a>
          <a href="#integrations" className="text-[15px] text-[#64748b] hover:text-[#0f172a] transition-colors">
            Integrations
          </a>
          {authed ? (
            <button
              onClick={() => router.push("/dashboard")}
              className="bg-linear-to-br from-brand-purple to-brand-purple-light text-white px-6 py-2.5 rounded-xl text-[15px] font-medium shadow-[0_4px_12px_rgba(111,123,247,0.25)] hover:shadow-[0_6px_20px_rgba(111,123,247,0.35)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              Go to dashboard →
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              className="bg-linear-to-br from-brand-purple to-brand-purple-light text-white px-6 py-2.5 rounded-xl text-[15px] font-medium shadow-[0_4px_12px_rgba(111,123,247,0.25)] hover:shadow-[0_6px_20px_rgba(111,123,247,0.35)] hover:-translate-y-0.5 transition-all cursor-pointer"
            >
              Sign in with GitHub
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
