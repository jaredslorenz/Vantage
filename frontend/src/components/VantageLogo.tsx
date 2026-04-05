interface VantageLogoProps {
  size?: number;
}

export function VantageIcon({ size = 28 }: VantageLogoProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: "linear-gradient(135deg, #6f7bf7 0%, #c6f8ff 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <svg
        width={size * 0.75}
        height={size * 0.69}
        viewBox="0 0 24 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <polygon points="12,1 23,7 12,13 1,7" fill="white" fillOpacity="0.95" />
        <polygon points="1,7 1,15 12,21 12,13" fill="white" fillOpacity="0.5" />
        <polygon points="23,7 23,15 12,21 12,13" fill="white" fillOpacity="0.25" />
        <polyline points="1,7 12,1 23,7 12,13 1,7" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeLinejoin="round" />
        <line x1="1" y1="7" x2="1" y2="15" stroke="#FFFFFF" strokeWidth="1" />
        <line x1="23" y1="7" x2="23" y2="15" stroke="#FFFFFF" strokeWidth="1" />
        <line x1="12" y1="13" x2="12" y2="21" stroke="#FFFFFF" strokeWidth="1" />
        <polyline points="1,15 12,21 23,15" fill="none" stroke="#FFFFFF" strokeWidth="1" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
