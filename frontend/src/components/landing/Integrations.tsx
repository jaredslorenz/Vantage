"use client";

export function Integrations() {
  return (
    <div className="relative z-10 py-24">
      <div className="max-w-7xl mx-auto px-12 text-center">
        <p className="text-[13px] text-[#94a3b8] uppercase tracking-[1.5px] mb-8 font-medium">
          Works with
        </p>

        <div className="flex justify-center items-center gap-16 flex-wrap opacity-60">
          {/* GitHub */}
          <div className="flex items-center gap-2.5">
            <svg width="32" height="32" fill="#24292f">
              <path d="M16 0C7.16 0 0 7.16 0 16c0 7.07 4.58 13.07 10.94 15.18.8.15 1.09-.35 1.09-.77v-2.71c-4.45.97-5.39-2.15-5.39-2.15-.73-1.85-1.78-2.34-1.78-2.34-1.45-1 .11-.98.11-.98 1.6.11 2.45 1.65 2.45 1.65 1.43 2.45 3.75 1.74 4.66 1.33.15-1.03.56-1.74 1.02-2.14-3.55-.4-7.29-1.78-7.29-7.92 0-1.75.63-3.18 1.65-4.3-.17-.4-.72-2.03.16-4.23 0 0 1.35-.43 4.41 1.65A15.4 15.4 0 0116 7.75c1.37.01 2.75.19 4.04.55 3.06-2.08 4.41-1.65 4.41-1.65.88 2.2.33 3.83.16 4.23 1.02 1.12 1.65 2.55 1.65 4.3 0 6.15-3.74 7.51-7.31 7.91.58.5 1.09 1.48 1.09 2.98v4.42c0 .43.29.93 1.1.77C27.42 29.06 32 23.06 32 16c0-8.84-7.16-16-16-16z" />
            </svg>
            <span className="text-base font-medium text-[#0f172a]">GitHub</span>
          </div>

          {/* Vercel */}
          <div className="flex items-center gap-2.5">
            <svg width="28" height="28" fill="#000">
              <path d="M14 0l14 28H0L14 0z" />
            </svg>
            <span className="text-base font-medium text-[#0f172a]">Vercel</span>
          </div>

          {/* Render */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-gradient-to-br from-[#6f7bf7] to-[#8b9ef9] rounded-md" />
            <span className="text-base font-medium text-[#0f172a]">Render</span>
          </div>

          {/* Supabase */}
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#3ecf8e] rounded-md" />
            <span className="text-base font-medium text-[#0f172a]">
              Supabase
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
