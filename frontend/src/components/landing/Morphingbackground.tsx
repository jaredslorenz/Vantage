"use client";

export function MorphingBackground() {
  return (
    <svg
      viewBox="0 0 1000 1000"
      className="fixed inset-0 w-full h-full -z-10 opacity-40 pointer-events-none"
      style={{ zIndex: 0 }}
    >
      <defs>
        <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop
            offset="0%"
            style={{ stopColor: "#6f7bf7", stopOpacity: 0.15 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: "#c6f8ff", stopOpacity: 0.1 }}
          />
        </linearGradient>
      </defs>

      <circle cx="200" cy="300" r="150" fill="url(#bg-grad)">
        <animate
          attributeName="cx"
          values="200;700;200"
          dur="25s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="cy"
          values="300;600;300"
          dur="20s"
          repeatCount="indefinite"
        />
      </circle>

      <circle cx="700" cy="400" r="180" fill="url(#bg-grad)">
        <animate
          attributeName="cx"
          values="700;400;700"
          dur="22s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="cy"
          values="400;200;400"
          dur="28s"
          repeatCount="indefinite"
        />
      </circle>

      <circle cx="500" cy="700" r="200" fill="url(#bg-grad)">
        <animate
          attributeName="cx"
          values="500;600;500"
          dur="30s"
          repeatCount="indefinite"
        />
        <animate
          attributeName="cy"
          values="700;300;700"
          dur="25s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}
