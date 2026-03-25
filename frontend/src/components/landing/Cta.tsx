"use client";

export function CTA() {
  return (
    <div className="relative z-10 px-12 pb-24">
      <div className="max-w-7xl mx-auto bg-gradient-to-br from-[#6f7bf7] via-[#8b9ef9] to-[#c6f8ff] rounded-3xl py-20 px-16 text-center">
        <h2 className="text-5xl font-medium text-white mb-5 tracking-tight">
          Ready to simplify your DevOps?
        </h2>
        <p className="text-xl text-white/90 mb-10">
          Connect your GitHub and start monitoring in 2 minutes
        </p>
        <button className="bg-white text-[#6f7bf7] px-12 py-4.5 rounded-[14px] text-lg font-medium shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] hover:-translate-y-0.5 active:scale-95 transition-all">
          Get started free
        </button>
        <p className="text-sm text-white/80 mt-5">
          Free forever · No credit card required
        </p>
      </div>
    </div>
  );
}
