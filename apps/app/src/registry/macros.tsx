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
import { cn, toneVar, toneText, toneSoft } from "@4dl/ui";

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

/** The protein/carbs/fat triad, colored + iconed from the registry. */
export function MacroBar({ proteinG, carbsG, fatG, targets, className }: { proteinG: number; carbsG: number; fatG: number; targets?: { proteinG?: number; carbsG?: number; fatG?: number } | null; className?: string }) {
  const grams = { protein: proteinG, carbs: carbsG, fat: fatG };
  const tgt: Record<string, number | undefined> = { protein: targets?.proteinG, carbs: targets?.carbsG, fat: targets?.fatG };
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {MACRO_KEYS.map((k) => {
        const m = METRICS[k];
        const t = tgt[k];
        return (
          <div key={k} className={cn("relative flex items-center gap-2 overflow-hidden rounded-xl px-2.5 py-2", toneSoft[m.tone])}>
            {t ? <span aria-hidden className="absolute inset-y-0 left-0 bg-current opacity-[0.12]" style={{ width: `${Math.min(100, (grams[k] / t) * 100)}%` }} /> : null}
            <m.icon className="relative size-4 shrink-0" style={{ color: toneVar[m.tone] }} />
            {/* `truncate`, not wrap. "Protein / 165" in a third of a phone
                wrapped to two lines and pushed the chip taller than its two
                neighbours, so a row designed as three equal pills rendered as
                two pills and a box. Losing the tail of a target is a smaller
                cost than losing the rhythm of the row. */}
            <span className="relative min-w-0">
              <span className="numeral block text-sm font-bold leading-none">{Math.round(grams[k])}<span className="text-xs font-medium opacity-70"> g</span></span>
              <span className="block truncate text-xs font-medium leading-tight opacity-70">{m.label}{t ? ` / ${t}` : ""}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Sparkline (dot-line + optional dotted target) ────────────────────────────
