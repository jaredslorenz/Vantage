"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CTA() {
  const supabase = createClient();
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/auth/callback`,
      },
    });
  };

  return (
    <div className="relative z-10 px-12 pb-24">
      <div className="max-w-7xl mx-auto bg-linear-to-br from-brand-purple via-brand-purple-light to-brand-cyan rounded-3xl py-20 px-16 text-center">
        <h2 className="text-5xl font-medium text-white mb-5 tracking-tight">
          Ready to ship with clarity?
        </h2>
        <p className="text-xl text-white/90 mb-10">
          Connect your stack and get AI-powered insights in minutes
        </p>
        <button
          onClick={authed ? () => router.push("/dashboard") : handleSignIn}
          className="bg-white text-brand-purple px-12 py-4.5 rounded-[14px] text-lg font-medium shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 active:scale-95 transition-all"
        >
          {authed ? "Go to dashboard →" : "Get started free"}
        </button>
        <p className="text-sm text-white/80 mt-5">
          Free forever · No credit card required
        </p>
      </div>
    </div>
  );
}
