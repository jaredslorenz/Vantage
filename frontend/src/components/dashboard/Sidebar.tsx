export default function Sidebar() {
  return (
    <div className="w-[200px] glass border-r border-white/40 flex flex-col shadow-glass">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-black/5">
        <div className="text-base font-medium text-gray-900 tracking-tight">
          Vantage
        </div>
        <div className="text-[11px] text-brand-purple font-medium mt-1">
          DevOps Hub
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-3 flex-1">
        <a
          href="/"
          className="flex items-center gap-2 px-2.5 py-2 rounded-button bg-white/50 text-brand-purple text-[13px] font-medium mb-1"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
          Overview
        </a>
        <a
          href="/services"
          className="flex items-center gap-2 px-2.5 py-2 rounded-button text-gray-600 text-[13px] mb-1 hover:bg-white/30"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          Services
        </a>
        <a
          href="/events"
          className="flex items-center gap-2 px-2.5 py-2 rounded-button text-gray-600 text-[13px] mb-1 hover:bg-white/30"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M13 2L3 14l10 1-2-13z" />
          </svg>
          Events
        </a>
        <a
          href="/settings"
          className="flex items-center gap-2 px-2.5 py-2 rounded-button text-gray-600 text-[13px] hover:bg-white/30"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v6m0 6v6M5.64 5.64l4.24 4.24m4.24 4.24l4.24 4.24M1 12h6m6 0h6M5.64 18.36l4.24-4.24m4.24-4.24l4.24-4.24" />
          </svg>
          Settings
        </a>
      </nav>

      {/* User Profile */}
      <div className="p-2.5 border-t border-black/5">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-button bg-black/2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-cyan flex items-center justify-center text-[11px] font-medium text-white">
            JL
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-gray-900 truncate">
              yourname
            </div>
            <div className="text-[10px] text-gray-500">Free</div>
          </div>
        </div>
      </div>
    </div>
  );
}
