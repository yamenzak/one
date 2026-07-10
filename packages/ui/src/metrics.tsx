/**
 * MetricPill + StatCard + WeekDots (DESIGN.md §2.2).
 */

import { clsx } from "clsx";
import type { ReactNode } from "react";
import { toneContainer, toneText, type Tone } from "./primitives.js";

interface MetricPillProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  tone?: Tone;
  /** 0..1 — renders the two-tone fill ("3 of 5" effect). */
  progress?: number;
  onClick?: () => void;
  className?: string;
}

/** Stadium pill: squircle icon container + label + value, domain-tinted. */
export function MetricPill({ icon, label, value, tone = "activity", progress, onClick, className }: MetricPillProps) {
  const Comp = onClick ? "button" : "div";
  const pct = progress === undefined ? null : Math.min(1, Math.max(0, progress));
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        "relative flex w-full items-center gap-3 overflow-hidden rounded-full px-3 py-2.5 text-left",
        toneContainer[tone],
        onClick && "active:scale-[0.99] transition-transform",
        className,
      )}
    >
      {pct !== null && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-white/10"
          style={{ width: `${pct * 100}%` }}
        />
      )}
      <span className="relative grid size-11 shrink-0 place-items-center rounded-[38%] bg-black/25 text-lg">
        {icon}
      </span>
      <span className="relative min-w-0">
        <span className="block truncate text-sm font-medium opacity-90">{label}</span>
        <span className="numeral block text-xl font-bold leading-tight">{value}</span>
      </span>
    </Comp>
  );
}

interface StatCardProps {
  label: string;
  value: ReactNode;
  unit?: string;
  chip?: ReactNode;
  /** Right-side mini chart slot. */
  chart?: ReactNode;
  onClick?: () => void;
  className?: string;
}

/** Label, huge value+unit, status chip bottom, mini chart right. */
export function StatCard({ label, value, unit, chip, chart, onClick, className }: StatCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={clsx(
        "flex w-full items-center justify-between gap-4 rounded-[--radius-card] bg-surface-1 p-5 text-left",
        onClick && "active:scale-[0.99] transition-transform",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-sm text-fg-muted">{label}</div>
        <div className="numeral mt-1 text-4xl font-semibold leading-none">
          {value}
          {unit && <span className="ml-1 text-lg font-medium text-fg-muted">{unit}</span>}
        </div>
        {chip && <div className="mt-3">{chip}</div>}
      </div>
      {chart && <div className="shrink-0">{chart}</div>}
    </Comp>
  );
}

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

interface WeekDotsProps {
  /** 7 flags, Monday-first. */
  days: boolean[];
  /** 0-6 index of today (highlighted). */
  todayIndex?: number;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
}

/** 7 circles M-S; filled + icon on active days, today emphasized. */
export function WeekDots({ days, todayIndex, tone = "activity", icon = "✓", className }: WeekDotsProps) {
  return (
    <div className={clsx("flex items-center justify-between gap-1", className)}>
      {DAY_LETTERS.map((letter, i) => (
        <div key={i} className="flex flex-col items-center gap-1.5">
          <span
            className={clsx(
              "grid size-9 place-items-center rounded-full text-sm",
              days[i] ? clsx(toneContainer[tone], "font-bold") : "bg-surface-2 text-fg-muted/40",
            )}
          >
            {days[i] ? icon : ""}
          </span>
          <span
            className={clsx(
              "text-xs",
              i === todayIndex
                ? "grid size-5 place-items-center rounded-full bg-surface-3 font-bold text-fg"
                : "text-fg-muted",
            )}
          >
            {letter}
          </span>
        </div>
      ))}
    </div>
  );
}

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  tone?: Tone;
  /** Dotted target line value. */
  target?: number;
  className?: string;
}

/** Dot-line sparkline with optional dotted target (DESIGN.md stat cards). */
export function Sparkline({ values, width = 120, height = 56, tone = "activity", target, className }: SparklineProps) {
  if (values.length < 2) return null;
  const all = target !== undefined ? [...values, target] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const span = max - min || 1;
  const pad = 6;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const path = values.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const color = `var(--color-${tone})`;
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      {target !== undefined && (
        <line x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} stroke={color} strokeDasharray="2 5" strokeWidth={2} opacity={0.7} />
      )}
      <path d={path} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={color} />
      ))}
    </svg>
  );
}
