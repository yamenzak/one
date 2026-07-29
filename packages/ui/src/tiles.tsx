/**
 * Dashboard tiles — the shapes a placed widget can take in a hero grid.
 *
 * The grid is 2 columns × 3 rows. Every form below declares a fixed footprint
 * in that grid, which is the point: a layout cannot ask for a shape the grid
 * cannot draw, and the builder can show a true preview because the footprint is
 * known before any data arrives.
 *
 * | form    | footprint | what it is for |
 * |---------|-----------|----------------|
 * | `card`  | 1 × 1     | a compact labelled number |
 * | `stat`  | 1 × 2     | a number with NO denominator |
 * | `ring`  | 1 × 3     | a value against a target |
 * | `trend` | 2 × 1     | a direction over time |
 * | `bars`  | 2 × 1     | a handful of discrete periods |
 * | `week`  | 2 × 1     | which days of a week are done |
 *
 * ── Why `stat` exists ──
 * Every target-less metric used to be drawn as a ring with `progress={0.001}` —
 * weight change, calories burned, sets logged, body fat. A ring is a claim that
 * there is a whole to fill; an always-empty one reads as 0% of something, and
 * the user cannot tell it apart from a real target the client is failing. So
 * numbers that have no denominator get a form that doesn't draw one.
 *
 * Product-agnostic by design (README.md): a tile knows about values, tones and
 * footprints, never about meals or workouts.
 */

import type { ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { toneText, toneVar, type Tone } from "./primitives.js";
import { MetricPill, Sparkline, MiniBars, WeekDots, NoData } from "./metrics.js";
import { ProgressRing } from "./rings.js";
import type { LucideIcon } from "./lib/icons.js";

export type TileForm = "card" | "stat" | "ring" | "trend" | "bars" | "week";

export interface TileFootprint {
  cols: 1 | 2;
  rows: 1 | 2 | 3;
}

/** The single source of truth for how much grid each form occupies. The packer,
 *  the renderer and the builder's preview all read this, so they cannot drift. */
export const TILE_FOOTPRINT: Record<TileForm, TileFootprint> = {
  card: { cols: 1, rows: 1 },
  stat: { cols: 1, rows: 2 },
  ring: { cols: 1, rows: 3 },
  trend: { cols: 2, rows: 1 },
  bars: { cols: 2, rows: 1 },
  week: { cols: 2, rows: 1 },
};

export const TILE_FORMS = Object.keys(TILE_FOOTPRINT) as TileForm[];

/** Human labels for the form picker. */
export const TILE_FORM_LABEL: Record<TileForm, string> = {
  card: "Card",
  stat: "Number",
  ring: "Ring",
  trend: "Trend",
  bars: "Bars",
  week: "Week",
};

const SHELL = "flex h-full w-full flex-col justify-center rounded-2xl bg-surface-2 px-3.5 py-2.5";

/** 1×1 — the compact pill. Delegates to `MetricPill` so a tile and a pill
 *  elsewhere in the app are the same object. */
export function TileCard(props: {
  icon: LucideIcon; tone: Tone; label: string; value: ReactNode; unit?: string; progress?: number; onClick?: () => void;
}) {
  return <MetricPill {...props} className="h-full" />;
}

/**
 * 1×2 — a number and its label, with no implied whole.
 * `delta` is the optional second line: signed, tone-coded by `deltaGood`.
 */
export function TileStat({ icon: Icon, tone, label, value, unit, delta, deltaGood, onClick }: {
  icon: LucideIcon; tone: Tone; label: string; value: ReactNode; unit?: string;
  delta?: string | null; deltaGood?: boolean | null; onClick?: () => void;
}) {
  const Root = onClick ? "button" : "div";
  return (
    <Root onClick={onClick} className={cn(SHELL, "gap-0.5 text-left", onClick && "transition-transform active:scale-[0.98]")}>
      <span className="flex items-center gap-1.5 text-caption text-muted-foreground [&_svg]:size-3.5">
        <Icon style={{ color: toneVar[tone] }} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex items-baseline gap-1">
        {value == null || value === "" ? (
          <NoData className="text-title-2" />
        ) : (
          <>
            <span className={cn("numeral text-title-1 leading-none", toneText[tone])}>{value}</span>
            {unit && <span className="text-caption text-muted-foreground">{unit}</span>}
          </>
        )}
      </span>
      {delta != null && delta !== "" && (
        <span className={cn("text-caption", deltaGood == null ? "text-muted-foreground" : deltaGood ? "text-success" : "text-warning")}>
          {delta}
        </span>
      )}
    </Root>
  );
}

/** 1×3 — a value against a target. Bare, no card around it: the ring IS the
 *  surface. Only use it when `progress` means something. */
export function TileRing({ tone, value, label, sublabel, progress }: {
  tone: Tone; value: ReactNode; label: string; sublabel?: string; progress: number;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <ProgressRing size={152} strokeWidth={17} tone={tone} progress={progress} value={value} label={label} sublabel={sublabel} softTrack tintValue />
    </div>
  );
}

/** Shared head for the three 2×1 forms: label + current value on the left, the
 *  drawing on the right. One row is not enough space for both to be big, so the
 *  value stays small and the shape carries the meaning. */
function WideShell({ icon: Icon, tone, label, value, unit, children, onClick }: {
  icon: LucideIcon; tone: Tone; label: string; value?: ReactNode; unit?: string; children: ReactNode; onClick?: () => void;
}) {
  const Root = onClick ? "button" : "div";
  return (
    <Root onClick={onClick} className={cn(SHELL, "flex-row items-center gap-3 text-left", onClick && "transition-transform active:scale-[0.98]")}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-caption text-muted-foreground [&_svg]:size-3.5">
          <Icon style={{ color: toneVar[tone] }} />
          <span className="truncate">{label}</span>
        </span>
        {value != null && (
          <span className="flex items-baseline gap-1">
            {value === "" ? <NoData className="text-body" /> : <span className={cn("numeral text-body-lg font-semibold leading-tight", toneText[tone])}>{value}</span>}
            {unit && <span className="text-caption text-muted-foreground">{unit}</span>}
          </span>
        )}
      </span>
      <span className="shrink-0">{children}</span>
    </Root>
  );
}

/** 2×1 — direction over time. */
export function TileTrend({ values, target, ...head }: {
  icon: LucideIcon; tone: Tone; label: string; value?: ReactNode; unit?: string; onClick?: () => void;
  values: number[]; target?: number;
}) {
  return (
    <WideShell {...head}>
      {values.length >= 2 ? <Sparkline values={values} tone={head.tone} target={target} width={96} height={34} /> : <NoData className="text-caption" />}
    </WideShell>
  );
}

/** 2×1 — a handful of discrete periods. */
export function TileBars({ values, target, ...head }: {
  icon: LucideIcon; tone: Tone; label: string; value?: ReactNode; unit?: string; onClick?: () => void;
  values: number[]; target?: number;
}) {
  return (
    <WideShell {...head}>
      {values.length ? <MiniBars values={values} tone={head.tone} target={target} width={104} height={34} /> : <NoData className="text-caption" />}
    </WideShell>
  );
}

/** 2×1 — which days of the week are done. */
export function TileWeek({ days, todayIndex, ...head }: {
  icon: LucideIcon; tone: Tone; label: string; value?: ReactNode; unit?: string; onClick?: () => void;
  days: boolean[]; todayIndex?: number;
}) {
  return (
    <WideShell {...head}>
      <WeekDots days={days} todayIndex={todayIndex} tone={head.tone} fill />
    </WideShell>
  );
}
