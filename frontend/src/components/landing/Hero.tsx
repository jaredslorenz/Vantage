"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FloatingShapes } from "./Floatingshapes";
import { createClient } from "@/lib/supabase/client";

function HeroContent() {
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    return () => clearTimeout(t);
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
    <div className="relative z-10 max-w-7xl mx-auto px-12">
      <div className="grid grid-cols-[1.2fr_1fr] gap-20 items-center">
        {/* Left: Text */}
        <div>
          <div
            className={`transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
            style={{ transitionDelay: "200ms" }}
          >
            <div className="inline-block bg-brand-purple/8 border border-brand-purple/20 px-5 py-2 rounded-full text-[13px] text-brand-purple mb-10 font-medium">
              AI-powered DevOps hub
            </div>
          </div>

          <h1
            className={`text-[96px] font-medium text-[#0f172a] leading-[0.95] tracking-[-4px] mb-8 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
            style={{ transitionDelay: "400ms" }}
          >
            Ship with
            <br />
            <span className="italic bg-linear-to-br from-brand-purple to-brand-cyan bg-clip-text text-transparent">
              clarity
            </span>
          </h1>

          <p
            className={`text-xl text-[#64748b] leading-relaxed mb-12 max-w-135 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
            style={{ transitionDelay: "600ms" }}
          >
            Connect your stack, monitor every deploy, and let AI surface what
            actually matters — all in one place.
          </p>

          <div
            className={`flex gap-4 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"}`}
            style={{ transitionDelay: "800ms" }}
          >
            <button
              onClick={authed ? () => router.push("/dashboard") : handleSignIn}
              className="bg-linear-to-br from-brand-purple to-brand-purple-light text-white px-10 py-4.5 rounded-2xl text-base font-medium shadow-[0_8px_32px_rgba(111,123,247,0.4)] hover:shadow-[0_12px_48px_rgba(111,123,247,0.5)] hover:scale-95 active:scale-90 transition-all"
            >
              {authed ? "Go to dashboard →" : "Get started free"}
            </button>
            <a
              href="#features"
              className="bg-white text-[#0f172a] border border-black/10 px-10 py-4.5 rounded-2xl text-base font-medium hover:bg-black/2 active:scale-95 transition-all flex items-center"
            >
              See how it works
            </a>
          </div>
        </div>

        {/* Right */}
        <FloatingShapes />
      </div>
    </div>
  );
}

export function Hero() {
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const increment = () => setAnimKey((k) => k + 1);
    window.addEventListener("popstate", increment);
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) increment();
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("popstate", increment);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return (
    <section className="pb-8">
      <HeroContent key={animKey} />
    </section>
  );
}
