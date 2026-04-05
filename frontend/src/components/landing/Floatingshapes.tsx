"use client";

import { useEffect, useState } from "react";

export function FloatingShapes() {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX - window.innerWidth / 2) / 50,
        y: (e.clientY - window.innerHeight / 2) / 50,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <div className="relative h-[600px]">
      {/* Large percentage circle */}
      <div
        suppressHydrationWarning
        className="absolute top-[60px] right-[100px] w-[280px] h-[280px] bg-gradient-to-br from-[rgba(111,123,247,0.1)] to-[rgba(198,248,255,0.1)] rounded-full border border-[rgba(111,123,247,0.2)] flex items-center justify-center backdrop-blur-sm cursor-pointer transition-all duration-500 hover:scale-110 hover:shadow-[0_30px_80px_rgba(0,0,0,0.15)]"
        style={{
          transform: `translate(${mousePos.x * 2}px, ${mousePos.y * 2}px)`,
          animation: "float1 8s ease-in-out infinite",
        }}
      >
        <div className="text-7xl font-semibold bg-gradient-to-br from-[#6f7bf7] to-[#c6f8ff] bg-clip-text text-transparent">
          3.2e4
        </div>
      </div>

      {/* GitHub card */}
      <div
        suppressHydrationWarning
        className="absolute bottom-[120px] left-[40px] w-[220px] bg-white rounded-[40px] border border-black/5 p-7 shadow-[0_20px_60px_rgba(0,0,0,0.08)] cursor-pointer transition-all duration-500 hover:scale-110 hover:shadow-[0_30px_80px_rgba(0,0,0,0.15)] hover:rotate-0"
        style={{
          transform: `translate(${mousePos.x * 1}px, ${mousePos.y * 1}px) rotate(-8deg)`,
          animation: "float2 10s ease-in-out infinite",
        }}
      >
        <div className="w-12 h-12 bg-[#24292f] rounded-xl flex items-center justify-center mb-5">
          <svg width="24" height="24" fill="white">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.75.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0112 5.8c1.02 0 2.05.14 3.01.41 2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </div>
        <div className="text-sm font-medium text-[#0f172a] mb-1.5">GitHub</div>
        <div className="text-xs text-[#64748b]">Connected</div>
      </div>

      {/* AI insight card */}
      <div
        suppressHydrationWarning
        className="absolute top-[280px] right-[40px] w-[200px] bg-gradient-to-br from-[rgba(111,123,247,0.08)] to-[rgba(198,248,255,0.08)] border border-[rgba(111,123,247,0.2)] rounded-3xl p-6 backdrop-blur-sm cursor-pointer transition-all duration-500 hover:scale-110"
        style={{
          transform: `translate(${mousePos.x * 1.5}px, ${mousePos.y * 1.5}px)`,
          animation: "float3 12s ease-in-out infinite",
        }}
      >
        <div className="text-[11px] text-[#64748b] mb-2 uppercase tracking-wide">
          AI Insight
        </div>
        <div className="text-sm text-[#0f172a] leading-relaxed mb-3">
          Build success rate up{" "}
          <span className="text-[#10b981] font-semibold">23%</span>
        </div>
        <div className="h-1 bg-black/5 rounded-full overflow-hidden">
          <div className="h-full w-[76%] bg-gradient-to-r from-[#6f7bf7] to-[#10b981] rounded-full" />
        </div>
      </div>

      {/* Connecting lines */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width="100%"
        height="100%"
      >
        <line
          x1="50%"
          y1="30%"
          x2="70%"
          y2="60%"
          stroke="rgba(111, 123, 247, 0.2)"
          strokeWidth="2"
          strokeDasharray="5,5"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-20"
            dur="2s"
            repeatCount="indefinite"
          />
        </line>
        <line
          x1="30%"
          y1="70%"
          x2="60%"
          y2="50%"
          stroke="rgba(111, 123, 247, 0.2)"
          strokeWidth="2"
          strokeDasharray="5,5"
        >
          <animate
            attributeName="stroke-dashoffset"
            from="0"
            to="-20"
            dur="3s"
            repeatCount="indefinite"
          />
        </line>
      </svg>

      <style jsx>{`
        @keyframes float1 {
          0%,
          100% {
            transform: translate(0, 0) rotate(0deg);
          }
          25% {
            transform: translate(10px, -20px) rotate(5deg);
          }
          50% {
            transform: translate(-10px, -10px) rotate(-5deg);
          }
          75% {
            transform: translate(15px, 10px) rotate(3deg);
          }
        }

        @keyframes float2 {
          0%,
          100% {
            transform: translate(0, 0) rotate(-8deg);
          }
          25% {
            transform: translate(-15px, 20px) rotate(-12deg);
          }
          50% {
            transform: translate(10px, 10px) rotate(-4deg);
          }
          75% {
            transform: translate(-10px, -15px) rotate(-10deg);
          }
        }

        @keyframes float3 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          25% {
            transform: translate(20px, -10px) scale(1.05);
          }
          50% {
            transform: translate(-10px, 15px) scale(0.95);
          }
          75% {
            transform: translate(15px, 5px) scale(1.02);
          }
        }
      `}</style>
    </div>
  );
}
