"use client";

import { useEffect, useRef, useState } from "react";

export type ChartItem = { label: string; duration: number; status: string; commit: string; ts?: number };

function fmtTs(ts: number): string {
  const d = new Date(ts);
  const diffDays = Math.floor((Date.now() - ts) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/ (AM|PM)/, (m) => m.trim().toLowerCase());
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dotColor(status: string): string {
  if (status === "READY" || status === "live" || status === "deactivated") return "#34d399";
  if (status === "ERROR" || status === "build_failed") return "#f87171";
  if (status === "canceled" || status === "pre_deploy_failed") return "#d1d5db";
  return "#fbbf24";
}

function statusLabel(status: string): string {
  if (status === "READY" || status === "live" || status === "deactivated") return "✓ ok";
  if (status === "ERROR" || status === "build_failed") return "✗ fail";
  if (status === "canceled") return "— canceled";
  if (status === "pre_deploy_failed") return "✗ pre-deploy";
  return "~ building";
}

export function BuildTrendChart({ items }: { items: ChartItem[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [vw, setVw] = useState(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setVw(el.offsetWidth);
    const obs = new ResizeObserver(([e]) => setVw(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (items.length < 2) return null;

  // All units are real pixels — no scaling issues
  const CHART_H = 56;
  const PAD_TOP = 10;
  const PAD_BOT = 20; // space for timestamp labels
  const TOTAL_H = PAD_TOP + CHART_H + PAD_BOT;

  const n = items.length;
  const rawMax = Math.max(...items.map(i => i.duration));
  const rawMin = Math.min(...items.map(i => i.duration));
  // Add vertical breathing room so the curve isn't squashed at edges
  const pad = Math.max((rawMax - rawMin) * 0.25, 5);
  const yMax = rawMax + pad;
  const yMin = Math.max(0, rawMin - pad);
  const yRange = yMax - yMin;

  const PAD_X = 42;
  const toX = (i: number) => PAD_X + (i / (n - 1)) * (vw - PAD_X * 2);
  const toY = (dur: number) => PAD_TOP + (1 - (dur - yMin) / yRange) * CHART_H;

  const xs = items.map((_, i) => toX(i));
  const ys = items.map(item => toY(item.duration));

  let linePath = `M ${xs[0]},${ys[0]}`;
  for (let i = 1; i < n; i++) {
    const cpx = (xs[i - 1] + xs[i]) / 2;
    linePath += ` C ${cpx},${ys[i - 1]} ${cpx},${ys[i]} ${xs[i]},${ys[i]}`;
  }
  const areaPath = `${linePath} L ${toX(n - 1)},${PAD_TOP + CHART_H} L ${toX(0)},${PAD_TOP + CHART_H} Z`;

  const labelEvery = Math.max(1, Math.ceil(n / 6));
  const showLabel = (i: number) => i === 0 || i === n - 1 || i % labelEvery === 0;

  // Y-axis reference values
  const midDur = Math.round((rawMax + rawMin) / 2);

  // Tooltip
  const tipW = 148;
  const item = hover !== null ? items[hover] : null;
  const tipLines = item ? [true, !!item.ts, !!item.commit].filter(Boolean).length : 0;
  const tipH = 12 + tipLines * 14 + 8;

  return (
    <div ref={containerRef} className="border-b border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Build Time Trend</p>
        <span className="text-[10px] text-gray-400 font-mono">{rawMin}s – {rawMax}s</span>
      </div>
      <svg
        viewBox={`0 0 ${vw} ${TOTAL_H}`}
        width={vw}
        height={TOTAL_H}
        style={{ display: "block", overflow: "visible" }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6f7bf7" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#6f7bf7" stopOpacity="0" />
          </linearGradient>
          <clipPath id="chartClip">
            <rect x="0" y="0" width={vw} height={TOTAL_H} />
          </clipPath>
        </defs>

        {/* Gridlines */}
        <line x1={0} y1={PAD_TOP} x2={vw} y2={PAD_TOP} stroke="#f3f4f6" strokeWidth="1" />
        <line x1={0} y1={toY(midDur)} x2={vw} y2={toY(midDur)} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4 4" />
        <line x1={0} y1={PAD_TOP + CHART_H} x2={vw} y2={PAD_TOP + CHART_H} stroke="#f3f4f6" strokeWidth="1" />

        {/* Area + line clipped to chart bounds */}
        <g clipPath="url(#chartClip)">
          <path d={areaPath} fill="url(#sparkFill)" />
          <path d={linePath} fill="none" stroke="#6f7bf7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Failure markers — vertical red line + label */}
        {items.map((it, i) => {
          const isFail = it.status === "ERROR" || it.status === "build_failed" || it.status === "pre_deploy_failed";
          if (!isFail) return null;
          return (
            <g key={`fail-${i}`}>
              <line x1={xs[i]} y1={PAD_TOP} x2={xs[i]} y2={PAD_TOP + CHART_H} stroke="#f87171" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.7" />
              {/* Pin drop */}
              <circle cx={xs[i]} cy={PAD_TOP - 6} r={5} fill="#f87171" />
              <line x1={xs[i]} y1={PAD_TOP - 1} x2={xs[i]} y2={PAD_TOP} stroke="#f87171" strokeWidth="1.5" />
            </g>
          );
        })}

        {/* Hover crosshair */}
        {hover !== null && (
          <line x1={xs[hover]} y1={PAD_TOP} x2={xs[hover]} y2={PAD_TOP + CHART_H} stroke="#e5e7eb" strokeWidth="1" strokeDasharray="3 3" />
        )}

        {/* Dots */}
        {items.map((it, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: "crosshair" }}>
            <circle cx={xs[i]} cy={ys[i]} r={12} fill="transparent" />
            <circle
              cx={xs[i]} cy={ys[i]}
              r={hover === i ? 5 : 3.5}
              fill={dotColor(it.status)}
              stroke="white"
              strokeWidth={2}
              style={{ transition: "r 0.12s ease" }}
            />
          </g>
        ))}

        {/* Y-axis labels — overlaid left, HTML-sharp */}
        {[
          { val: rawMax, y: toY(rawMax) },
          { val: midDur, y: toY(midDur) },
          { val: rawMin, y: toY(rawMin) },
        ].map(({ val, y }) => (
          <g key={val} pointerEvents="none">
            <rect x={0} y={y - 7} width={PAD_X - 4} height={11} fill="white" fillOpacity="0.9" rx="2" />
            <text x={PAD_X - 14} y={y + 1} fill="#9ca3af" fontSize="9" fontFamily="ui-monospace,monospace" dominantBaseline="middle" textAnchor="end">{val}s</text>
          </g>
        ))}

        {/* Timestamp labels */}
        {items.map((it, i) => {
          if (!showLabel(i)) return null;
          const x = xs[i];
          const anchor = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
          return (
            <text key={i} x={x} y={PAD_TOP + CHART_H + 13} textAnchor={anchor}
              fill={hover === i ? "#6f7bf7" : "#9ca3af"} fontSize="9" fontFamily="system-ui,sans-serif">
              {it.ts ? (i === 0 || i === n - 1 ? fmtTs(it.ts) : new Date(it.ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).replace(/ (AM|PM)/, (m) => m.trim().toLowerCase())) : it.label}
            </text>
          );
        })}

        {/* Tooltip */}
        {hover !== null && item && (() => {
          const tx = Math.min(Math.max(xs[hover] - tipW / 2, 4), vw - tipW - 4);
          const ty = Math.max(4, ys[hover] - tipH - 10);
          let ly = ty + 14;
          return (
            <g pointerEvents="none">
              <rect x={tx} y={ty} width={tipW} height={tipH} rx="6" fill="#111827" opacity="0.93" />
              <text x={tx + 10} y={ly} fill="white" fontSize="11.5" fontWeight="700" fontFamily="ui-monospace,monospace">{item.duration}s</text>
              <text x={tx + tipW - 10} y={ly} textAnchor="end" fill={dotColor(item.status)} fontSize="10" fontWeight="600" fontFamily="system-ui,sans-serif">
                {statusLabel(item.status)}
              </text>
              {item.ts && <text x={tx + 10} y={ly += 14} fill="#9ca3af" fontSize="9.5" fontFamily="system-ui,sans-serif">{fmtTs(item.ts)}</text>}
              {item.commit && <text x={tx + 10} y={ly + 14} fill="#6b7280" fontSize="9" fontFamily="system-ui,sans-serif">{item.commit.length > 22 ? item.commit.slice(0, 22) + "…" : item.commit}</text>}
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
