"use client";

export function Features() {
  const features = [
    {
      icon: (
        <svg width="24" height="24" fill="#6f7bf7" viewBox="0 0 24 24">
          <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zM3 14h7v7H3v-7z" />
        </svg>
      ),
      title: "Unified dashboard",
      description:
        "Every deploy, commit, and service event across Vercel, Render, and GitHub in one place. No more tab switching.",
    },
    {
      icon: (
        <svg width="24" height="24" fill="#6f7bf7" viewBox="0 0 24 24">
          <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
      ),
      title: "AI failure analysis",
      description:
        "When builds fail, AI parses the logs and tells you exactly what broke and why — no more digging through stack traces.",
    },
    {
      icon: (
        <svg width="24" height="24" fill="#6f7bf7" viewBox="0 0 24 24">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: "Trigger deploys",
      description:
        "Redeploy to Vercel or trigger a new Render build directly from the dashboard — without leaving the page.",
    },
    {
      icon: (
        <svg width="24" height="24" fill="#6f7bf7" viewBox="0 0 24 24">
          <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
        </svg>
      ),
      title: "Project health at a glance",
      description:
        "AI summarizes the health of each project automatically — healthy, warning, or critical — so you know where to look first.",
    },
    {
      icon: (
        <svg width="24" height="24" fill="#6f7bf7" viewBox="0 0 24 24">
          <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
        </svg>
      ),
      title: "PR and commit tracking",
      description:
        "See open pull requests, recent commits, and who pushed what — all correlated with your deployment history.",
    },
    {
      icon: (
        <svg width="24" height="24" fill="#6f7bf7" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3" /><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14" />
        </svg>
      ),
      title: "Real-time polling",
      description:
        "Build status updates automatically while a deploy is in progress. Insight refreshes the moment it settles.",
    },
  ];

  return (
    <div id="features" className="relative z-10 bg-[#fafbfc] py-24 mt-8">
      <div className="max-w-7xl mx-auto px-12">
        <div className="text-center mb-20">
          <h2 className="text-5xl font-medium text-[#0f172a] mb-4 tracking-tight">
            Everything you need
          </h2>
          <p className="text-lg text-[#64748b] max-w-150 mx-auto">
            Built for developers who want real visibility into their stack without the enterprise overhead.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white border border-black/5 rounded-2xl p-8 hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(0,0,0,0.08)] transition-all duration-300"
            >
              <div className="w-12 h-12 bg-linear-to-br from-[rgba(111,123,247,0.1)] to-[rgba(198,248,255,0.1)] rounded-xl flex items-center justify-center mb-5">
                {feature.icon}
              </div>
              <h3 className="text-xl font-medium text-[#0f172a] mb-3">{feature.title}</h3>
              <p className="text-[15px] text-[#64748b] leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
