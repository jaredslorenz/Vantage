"use client";

export default function Header() {
  return (
    <div className="glass-header border-b border-white/30 px-7 py-3.5 flex items-center gap-4 shadow-sm">
      <div className="flex-1 max-w-120">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.75 h-3.75 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="7.5" cy="7.5" r="6" />
            <path d="M13 13l3 3" />
          </svg>
          <input
            type="text"
            placeholder="Search events, services..."
            className="w-full py-2 pl-9 pr-3 border border-black/8 rounded-button text-[13px] outline-none bg-white/95"
          />
        </div>
      </div>
    </div>
  );
}
