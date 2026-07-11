/**
 * ProgressRing + TargetRing — the hero viz. Animated stroke draw-in on mount,
 * gradient stroke, big center numeral. Theme-driven, no emoji.
 */

import { motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { toneVar, type Tone } from "./primitives.js";
import { cn } from "./lib/utils.js";

interface ProgressRingProps {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  tone?: Tone;
  value: ReactNode;
  label?: string;
  sublabel?: string;
  className?: string;
}

export function ProgressRing({ progress, size = 200, strokeWidth, tone = "activity", value, label, sublabel, className }: ProgressRingProps) {
  const sw = strokeWidth ?? Math.max(8, Math.round(size * 0.1));
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, progress));
  const gradId = useId();
  const color = toneVar[tone];

  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" role="img" aria-label={label}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.65} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={sw} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - p) }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <div className="text-xs font-medium text-muted-foreground" style={{ fontSize: size * 0.065 }}>{label}</div>}
        <motion.div
          className="numeral font-semibold leading-none"
          style={{ fontSize: size * 0.2 }}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.4 }}
        >
          {value}
        </motion.div>
        {sublabel && <div className="mt-1 text-muted-foreground" style={{ fontSize: size * 0.062 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

interface TargetRingProps extends Omit<ProgressRingProps, "value" | "sublabel"> {
  current: number;
  target: number;
  unit?: string;
  deltaBadge?: string;
}

export function TargetRing({ current, target, unit, deltaBadge, label = "This week", ...rest }: TargetRingProps) {
  const pct = target > 0 ? current / target : 0;
  return (
    <div className="relative inline-block">
      <ProgressRing {...rest} label={label} progress={pct} value={`${Math.round(pct * 100)}%`} sublabel={`${current}${unit ? ` ${unit}` : ""} of ${target}`} />
      {deltaBadge && (
        <span className="numeral absolute right-1 top-2 rounded-full bg-cardio-soft px-2.5 py-1 text-xs font-bold text-cardio">{deltaBadge}</span>
      )}
    </div>
  );
}
