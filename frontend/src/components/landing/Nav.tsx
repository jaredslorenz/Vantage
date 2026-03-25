"use client";

import { createClient } from "@/lib/supabase/client";

export function Nav() {
  const supabase = createClient();
  const handleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) console.error("Error signing in:", error);
  };

  return (
    <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/5">
      <div className="max-w-7xl mx-auto px-12 py-5 flex justify-between items-center">
        <div className="text-xl font-medium text-[#0f172a]">Vantage</div>

        <div className="flex gap-10 items-center">
          <a
            href="about"
            className="text-[15px] text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            About
          </a>
          <a
            href="#features"
            className="text-[15px] text-[#64748b] hover:text-[#0f172a] transition-colors"
          >
            Features
          </a>
          <button
            onClick={handleSignIn}
            className="bg-gradient-to-br from-[#6f7bf7] to-[#8b9ef9] text-white px-6 py-2.5 rounded-xl text-[15px] font-medium shadow-[0_4px_12px_rgba(111,123,247,0.25)] hover:shadow-[0_6px_20px_rgba(111,123,247,0.35)] hover:-translate-y-0.5 transition-all cursor-pointer"
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    </nav>
  );
}
