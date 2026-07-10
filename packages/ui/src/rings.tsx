/**
 * ProgressRing + TargetRing (DESIGN.md §2.2) — the hero visualization.
 * SVG, thick rounded stroke, huge center numeral, optional curved arc labels.
 */

import type { ReactNode } from "react";
import { toneVar, type Tone } from "./primitives.js";

interface ProgressRingProps {
  /** 0..1 (clamped). */
  progress: number;
  size?: number;
  strokeWidth?: number;
  tone?: Tone;
  /** Big center content (value) + small sub-label. */
  value: ReactNode;
  valueLabel?: string;
  subLabel?: string;
  /** Curved labels riding the arc (e.g. "Steps" / "of 20,000"). */
  arcLabelTop?: string;
  arcLabelBottom?: string;
  className?: string;
}

export function ProgressRing({
  progress,
  size = 200,
  strokeWidth,
  tone = "activity",
  value,
  valueLabel,
  subLabel,
  arcLabelTop,
  arcLabelBottom,
  className,
}: ProgressRingProps) {
  const sw = strokeWidth ?? Math.round(size * 0.13);
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const gapStart = 0.62; // arc starts bottom-left like the reference
  const textR = r - sw / 2 - size * 0.02;

  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={valueLabel}>
        <g transform={`rotate(${gapStart * 360} ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-surface-3)"
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={toneVar[tone]}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${c * p} ${c * (1 - p)}`}
            style={{ transition: "stroke-dasharray 600ms ease" }}
          />
        </g>
        {arcLabelTop && (
          <>
            <defs>
              <path
                id={`arc-top-${size}`}
                d={`M ${size / 2 - textR} ${size / 2} A ${textR} ${textR} 0 0 1 ${size / 2 + textR} ${size / 2}`}
              />
            </defs>
            <text fontSize={size * 0.075} fontWeight={600} fill="var(--color-fg)">
              <textPath href={`#arc-top-${size}`} startOffset="50%" textAnchor="middle">
                {arcLabelTop}
              </textPath>
            </text>
          </>
        )}
        {arcLabelBottom && (
          <>
            <defs>
              <path
                id={`arc-bot-${size}`}
                d={`M ${size / 2 - textR} ${size / 2} A ${textR} ${textR} 0 0 0 ${size / 2 + textR} ${size / 2}`}
              />
            </defs>
            <text fontSize={size * 0.07} fontWeight={600} fill={toneVar[tone]}>
              <textPath href={`#arc-bot-${size}`} startOffset="50%" textAnchor="middle">
                {arcLabelBottom}
              </textPath>
            </text>
          </>
        )}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="numeral font-semibold" style={{ fontSize: size * 0.21, lineHeight: 1 }}>
          {value}
        </div>
        {subLabel && (
          <div className="text-fg-muted" style={{ fontSize: size * 0.07, marginTop: size * 0.02 }}>
            {subLabel}
          </div>
        )}
      </div>
    </div>
  );
}

interface TargetRingProps extends Omit<ProgressRingProps, "value" | "subLabel"> {
  current: number;
  target: number;
  /** e.g. "+79" week-over-week delta badge. */
  deltaBadge?: string;
}

/** The weekly "213 of 360" ring with a floating delta badge. */
export function TargetRing({ current, target, deltaBadge, ...rest }: TargetRingProps) {
  const pct = target > 0 ? current / target : 0;
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <ProgressRing
        {...rest}
        progress={pct}
        value={`${Math.round(pct * 100)}%`}
        subLabel={`${current} of ${target}`}
      />
      {deltaBadge && (
        <span
          className="numeral absolute rounded-full bg-cardio-container px-3 py-1 text-sm font-bold text-cardio"
          style={{ top: "6%", right: "2%" }}
        >
          {deltaBadge}
        </span>
      )}
    </div>
  );
}
