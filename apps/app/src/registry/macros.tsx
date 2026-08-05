/**
 * Macronutrient and metric readouts.
 *
 * These were in `@4dl/ui`, where they were the only components that knew what
 * protein is. A design system may own "a bar with segments"; it may not own
 * which three segments, in which order, in which colours — that is a nutrition
 * app's opinion. They live beside the registry they read from.
 */

import { METRICS, MACRO_KEYS, type MetricKey } from "./metrics.js";
import type { ReactNode } from "react";
import { kcalToDisplay } from "@kova/domain";
import { cn, toneVar, toneText, toneSoft, Meter } from "@4dl/ui";
import { useUnits } from "../units.js";

export function MetricChip({ metric, value, className }: { metric: MetricKey; value: ReactNode; className?: string }) {
  const m = METRICS[metric];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", toneSoft[m.tone], className)}>
      <m.icon className="size-3.5" />
      <span className="numeral">{value}</span>
    </span>
  );
}

/** Compact inline macros — a colored icon + grams for protein/carbs/fat. */
export function MacroInline({ proteinG, carbsG, fatG, className }: { proteinG: number; carbsG: number; fatG: number; className?: string }) {
  const grams = { protein: proteinG, carbs: carbsG, fat: fatG };
  return (
    <span className={cn("numeral inline-flex items-center gap-2 font-medium", className)}>
      {MACRO_KEYS.map((k) => {
        const M = METRICS[k];
        return (
          <span key={k} className={cn("inline-flex items-center gap-1", toneText[M.tone])}>
            <M.icon className="size-3.5" />{Math.round(grams[k])}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The protein/carbs/fat triad, coloured + iconed from the registry.
 *
 * TWO LAYOUTS, and the choice is about WIDTH, not taste.
 *
 *   row      three equal pills across. Correct when the triad owns the full
 *            column — under an anchor, across a card.
 *   stacked  three full-width meters, one per line. Correct anywhere the triad
 *            shares its row with something else.
 *
 * `stacked` exists because `row` was being used in a `flex-1` beside a 104px
 * ring in the meal builder: ~85px per pill, so "Protein" rendered as "Pro…",
 * "Carbs" as "Ca…" and "Fat / 70" as "Fat…". Three macro chips whose labels are
 * all ellipses is a readout that has stopped reading. The old comment below
 * anticipated truncation and mispriced it — it assumed the loss would be the
 * TARGET's tail, and the actual loss was the macro's name.
 *
 * Stacked also upgrades the target from a 12%-opacity wash behind the text to a
 * real `Meter`: the same grammar the rest of the product grades a value against
 * a maximum with, and readable at a glance rather than by inspection.
 */
export function MacroBar({ proteinG, carbsG, fatG, targets, layout = "row", className }: {
  proteinG: number; carbsG: number; fatG: number;
  targets?: { proteinG?: number; carbsG?: number; fatG?: number } | null;
  layout?: "row" | "stacked";
  className?: string;
}) {
  const grams: Record<string, number> = { protein: proteinG, carbs: carbsG, fat: fatG };
  const tgt: Record<string, number | undefined> = { protein: targets?.proteinG, carbs: targets?.carbsG, fat: targets?.fatG };

  if (layout === "stacked") {
    return (
      <div className={cn("space-y-2.5", className)}>
        {MACRO_KEYS.map((k) => {
          const m = METRICS[k];
          const t = tgt[k];
          const g = Math.round(grams[k]!);
          return (
            <Meter
              key={k}
              value={g}
              // No target → a full bar would claim completion against nothing,
              // so the meter draws the value against ITSELF and reads as a
              // label with a rule under it.
              max={t ?? g ?? 1}
              tone={m.tone}
              label={<span className="inline-flex items-center gap-1.5"><m.icon className="size-3.5" style={{ color: toneVar[m.tone] }} />{m.label}</span>}
              valueLabel={<>{g}{t ? <span className="text-muted-foreground"> / {t}</span> : null} g</>}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {MACRO_KEYS.map((k) => {
        const m = METRICS[k];
        const t = tgt[k];
        return (
          <div key={k} className={cn("relative flex items-center gap-2 overflow-hidden rounded-xl px-2.5 py-2", toneSoft[m.tone])}>
            {t ? <span aria-hidden className="absolute inset-y-0 left-0 bg-current opacity-[0.12]" style={{ width: `${Math.min(100, (grams[k]! / t) * 100)}%` }} /> : null}
            <m.icon className="relative size-4 shrink-0" style={{ color: toneVar[m.tone] }} />
            {/* `truncate`, not wrap. "Protein / 165" in a third of a phone
                wrapped to two lines and pushed the chip taller than its two
                neighbours, so a row designed as three equal pills rendered as
                two pills and a box. Losing the tail of a target is a smaller
                cost than losing the rhythm of the row — but if the pill is so
                narrow that the macro's NAME goes too, the answer is `stacked`,
                not a narrower pill. */}
            <span className="relative min-w-0">
              <span className="numeral block text-sm font-bold leading-none">{Math.round(grams[k]!)}<span className="text-xs font-medium opacity-70"> g</span></span>
              <span className="block truncate text-xs font-medium leading-tight opacity-70">{m.label}{t ? ` / ${t}` : ""}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The four-up energy + macro readout of a PORTION: what this food, this meal,
 * this entry actually delivers.
 *
 * `MacroBar` is a different question — it grades three macros against targets —
 * and this is the flat answer, calories first. It was hand-written identically
 * in the food detail sheet, the meal-option sheet and the diary entry sheet,
 * with the tile padding and the label drifting between them.
 *
 * The tiles carry no label because the ICON is the label: every metric's glyph
 * and tone come from one registry, so the flame is calories everywhere in the
 * app. `label` turns the words on where the surface has room and the reader may
 * be seeing the group for the first time.
 */
export function MacroTiles({ calories, proteinG, carbsG, fatG, label = false, className }: {
  calories: number; proteinG: number; carbsG: number; fatG: number;
  label?: boolean; className?: string;
}) {
  const units = useUnits();
  const grams: Record<string, number> = { protein: proteinG, carbs: carbsG, fat: fatG };
  return (
    <div className={cn("grid grid-cols-4 gap-2", className)}>
      {(["calories", ...MACRO_KEYS] as const).map((k) => {
        const m = METRICS[k];
        const v = k === "calories" ? kcalToDisplay(calories, units) : grams[k]!;
        return (
          <div key={k} className={cn("flex flex-col items-center gap-1 rounded-xl p-2.5", toneSoft[m.tone])}>
            <m.icon className="size-4" />
            <span className="numeral text-lg font-semibold leading-none">{Math.round(v).toLocaleString()}</span>
            {label && <span className="text-micro uppercase opacity-70">{m.label}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** The micronutrients a food or meal happens to carry — two columns, and only
 *  the rows with a value. A zero here means "not recorded" far more often than
 *  it means zero, and printing forty dashes is not a nutrition panel. */
export function MicroGrid({ rows, className }: { rows: readonly (readonly [string, number, string])[]; className?: string }) {
  const present = rows.filter(([, v]) => v > 0);
  if (present.length === 0) return null;
  return (
    <div className={cn("grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-xl bg-surface-2 p-3 text-sm", className)}>
      {present.map(([l, v, u]) => (
        <div key={l} className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-muted-foreground">{l}</span>
          <span className="numeral shrink-0">{Math.round(v * 10) / 10} {u}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sparkline (dot-line + optional dotted target) ────────────────────────────
