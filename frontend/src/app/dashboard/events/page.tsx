"use client";

export default function EventsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-medium text-white/95 tracking-tight mb-1.5">
          Events
        </h1>
        <p className="text-sm text-white/75">
          A unified activity feed across all connected services
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-5">
        {["All", "Vercel", "GitHub"].map((f) => (
          <button
            key={f}
            className={`px-3 py-1.5 rounded-button text-[12px] font-medium transition-colors ${
              f === "All"
                ? "bg-white text-brand-purple shadow-sm"
                : "bg-white/30 text-white/80 hover:bg-white/40"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Empty state */}
      <div className="bg-white/95 backdrop-blur-[10px] border border-white/60 rounded-card shadow-card">
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center mb-3">
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700 mb-1">No events yet</p>
          <p className="text-xs text-gray-400 max-w-xs">
            Events will appear here once your connected services start sending activity.
          </p>
        </div>
      </div>
    </>
  );
}
