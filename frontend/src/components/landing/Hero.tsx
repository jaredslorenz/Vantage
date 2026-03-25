"use client";

import { useState, useEffect } from "react";
import { FloatingShapes } from "./Floatingshapes";

// Separated so that changing `key` forces a true DOM remount,
// resetting `mounted` to false and replaying the entrance animation.
function HeroContent() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative z-10 max-w-7xl mx-auto px-12">
      <div className="grid grid-cols-[1.2fr_1fr] gap-20 items-center">
        {/* Left: Text */}
        <div>
          <div
            className={`transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            <div className="inline-block bg-brand-purple/8 border border-brand-purple/20 px-5 py-2 rounded-full text-[13px] text-brand-purple mb-10 font-medium">
              New approach to DevOps
            </div>
          </div>

          <h1
            className={`text-[108px] font-medium text-[#0f172a] leading-[0.95] tracking-[-4px] mb-8 transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
            style={{ transitionDelay: "400ms" }}
          >
            Think
            <br />
            <span className="italic bg-linear-to-br from-brand-purple to-brand-cyan bg-clip-text text-transparent">
              different
            </span>
          </h1>

          <p
            className={`text-xl text-[#64748b] leading-relaxed mb-12 max-w-135 transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
            style={{ transitionDelay: "600ms" }}
          >
            Deploy, monitor, analyze. All in one beautifully crafted platform
            that actually makes sense.
          </p>

          <div
            className={`flex gap-4 transition-all duration-700 ${
              mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
            }`}
            style={{ transitionDelay: "800ms" }}
          >
            <button className="bg-linear-to-br from-brand-purple to-brand-purple-light text-white px-10 py-4.5 rounded-2xl text-base font-medium shadow-[0_8px_32px_rgba(111,123,247,0.4)] hover:shadow-[0_12px_48px_rgba(111,123,247,0.5)] hover:scale-95 active:scale-90 transition-all">
              Get started
            </button>
            <button className="bg-white text-[#0f172a] border border-black/10 px-10 py-4.5 rounded-2xl text-base font-medium hover:bg-black/2 active:scale-95 transition-all">
              See how it works
            </button>
          </div>
        </div>

        {/* Right */}
        <FloatingShapes />
      </div>

      {/* Stats */}
      <div
        className={`mt-36 flex gap-20 justify-center transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
        }`}
        style={{ transitionDelay: "1000ms" }}
      >
        {/* same content as before */}
      </div>
    </div>
  );
}

export function Hero() {
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    const increment = () => setAnimKey((k) => k + 1);

    // SPA back/forward navigation
    window.addEventListener("popstate", increment);
    // bfcache restore
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) increment();
    };
    window.addEventListener("pageshow", handlePageShow);

    return () => {
      window.removeEventListener("popstate", increment);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  return <HeroContent key={animKey} />;
}
