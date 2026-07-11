/**
 * MetricPill, StatCard, Sparkline, MiniBars, WeekDots — the fitness viz set.
 * Theme-driven, animated, icon-based (no emoji).
 */

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { toneSoft, toneVar, type Tone } from "./primitives.js";
import { Check, type LucideIcon } from "./lib/icons.js";

interface MetricPillProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: Tone;
  progress?: number; // 0..1 two-tone fill
  onClick?: () => void;
}

export function MetricPill({ icon: Icon, label, value, tone = "activity", progress, onClick }: MetricPillProps) {
  const pct = progress === undefined ? null : Math.min(1, Math.max(0, progress));
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      onClick={onClick}
      whileTap={onClick ? { scale: 0.98 } : undefined}
      className={cn("relative flex w-full items-center gap-3 overflow-hidden rounded-2xl p-3 text-left", toneSoft[tone])}
    >
      {pct !== null && (
        <motion.span aria-hidden className="absolute inset-y-0 left-0 rounded-2xl bg-current opacity-[0.12]" initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }} />
      )}
      <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-current/15 [&_svg]:size-[1.15rem]">
        <Icon style={{ color: toneVar[tone] }} />
      </span>
      <span className="relative min-w-0">
        <span className="block truncate text-xs font-medium opacity-80">{label}</span>
        <span className="numeral block text-lg font-bold leading-tight">{value}</span>
      </span>
    </Comp>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  badge?: ReactNode;
  chart?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
}

export function StatCard({ label, value, unit, badge, chart, icon: Icon, tone = "primary", onClick, className }: StatCardProps) {
  const Comp = onClick ? motion.button : motion.div;
  return (
    <Comp
      onClick={onClick}
      whileTap={onClick ? { scale: 0.99 } : undefined}
      className={cn("flex w-full items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5 text-left shadow-sm", className)}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {Icon && <Icon className="size-4" style={{ color: toneVar[tone] }} />}
          {label}
        </div>
        <div className="numeral mt-1.5 text-[2rem] font-semibold leading-none">
          {value}
          {unit && <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>}
        </div>
        {badge && <div className="mt-3">{badge}</div>}
      </div>
      {chart && <div className="shrink-0">{chart}</div>}
    </Comp>
  );
}

// ── Sparkline (dot-line + optional dotted target) ────────────────────────────
export function Sparkline({ values, width = 120, height = 52, tone = "activity", target, className }: { values: number[]; width?: number; height?: number; tone?: Tone; target?: number; className?: string }) {
  if (values.length < 2) return null;
  const all = target !== undefined ? [...values, target] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 6;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const area = `${line} L ${x(values.length - 1)} ${height} L ${x(0)} ${height} Z`;
  const color = toneVar[tone];
  const gid = `sl-${tone}-${width}`;
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      {target !== undefined && <line x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} stroke={color} strokeDasharray="2 5" strokeWidth={1.5} opacity={0.6} />}
      <motion.path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: "easeOut" }} />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1]!)} r={3.5} fill={color} />
    </svg>
  );
}

// ── MiniBars ─────────────────────────────────────────────────────────────────
export function MiniBars({ values, width = 130, height = 52, tone = "activity", target }: { values: number[]; width?: number; height?: number; tone?: Tone; target?: number }) {
  const max = Math.max(...values, target ?? 0, 1);
  const gap = 4;
  const bw = (width - gap * (values.length - 1)) / values.length;
  const color = toneVar[tone];
  return (
    <svg width={width} height={height} aria-hidden>
      {values.map((v, i) => {
        const h = (v / max) * (height - 4);
        return <motion.rect key={i} x={i * (bw + gap)} width={bw} rx={bw / 2} fill={color} initial={{ height: 0, y: height }} animate={{ height: Math.max(3, h), y: height - Math.max(3, h) }} transition={{ delay: i * 0.03, duration: 0.4 }} opacity={0.55 + 0.45 * (v / max)} />;
      })}
    </svg>
  );
}

// ── WeekDots ─────────────────────────────────────────────────────────────────
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
export function WeekDots({ days, todayIndex, tone = "activity", className }: { days: boolean[]; todayIndex?: number; tone?: Tone; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {DAY_LETTERS.map((letter, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.03, type: "spring", stiffness: 400, damping: 22 }}
            className={cn("grid size-7 place-items-center rounded-full text-[0.7rem] [&_svg]:size-3.5", days[i] ? toneSoft[tone] : "bg-surface-2 text-muted-foreground/40")}
          >
            {days[i] ? <Check strokeWidth={3} /> : ""}
          </motion.span>
          <span className={cn("text-[0.65rem]", i === todayIndex ? "font-bold text-foreground" : "text-muted-foreground")}>{letter}</span>
        </div>
      ))}
    </div>
  );
}
