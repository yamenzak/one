/**
 * Date scope controls — `DatePill` and `DayNav`.
 *
 * These exist because the app had grown TWO hand-rolled date pills doing the
 * same job with different tokens: Today's day switcher (`rounded-xl`,
 * `bg-background/25`, `backdrop-blur-md`) and Progress's range endpoints
 * (`rounded-full`, `bg-secondary`). Neither was wrong on its own screen — the
 * first sits over the Shell's T0 atmosphere and the second does not — but the
 * difference was two people making the same call twice, not a decision. So the
 * decision now lives in one place, as `variant`, and both screens read from it.
 *
 * Product-agnostic on purpose: a date scope control names no client, workout or
 * meal, so it belongs in the shared package (see README.md).
 *
 * ── Three things `DayNav` fixes about the hand-rolled version ──
 *
 * 1. **The forward arrow disables, it does not vanish.** Today's version
 *    swapped it for an invisible `size-9` spacer at the max date, so the
 *    control silently lost a button and the user never learned where the
 *    boundary was. A disabled control teaches the edge; a missing one is just
 *    confusing.
 * 2. **Resetting does not move the page.** "Jump to today" used to be a second
 *    row that appeared only when you were off today, so every step backwards
 *    pushed the whole screen down and every step forward yanked it up. The
 *    reset now lives in a slot that is always reserved, so the control has one
 *    height for its whole life.
 * 3. **Chrome stays chrome (§1, T4).** The reset was `text-primary` — accent on
 *    a navigation control, which the tier rules forbid. It is muted now, and
 *    carries an icon so it still reads as an action.
 *
 * The centre is a real `<input type="date">` underneath a drawn surface, so the
 * OS picker, keyboard entry and form semantics all still work.
 */

import type { ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from "./lib/icons.js";

/** Solid for ordinary content; translucent where the control sits over the T0
 *  atmosphere and must let it through (§1: "T4 is translucent"). */
export type DateSurface = "solid" | "translucent";

const SURFACE: Record<DateSurface, string> = {
  solid: "bg-secondary",
  translucent: "bg-background/25 backdrop-blur-md",
};

/**
 * A date input drawn as a pill. `display` is what the user reads; the native
 * input keeps the real value, so callers format however their screen needs
 * ("Today", "Mon, 5 Jan", "5 Jan") without this component guessing.
 */
export function DatePill({
  value, onChange, min, max, label, display, surface = "solid", className,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  /** Accessible name — the visible text is `display`, which is often ambiguous. */
  label: string;
  display: ReactNode;
  surface?: DateSurface;
  className?: string;
}) {
  return (
    <label className={cn("relative flex-1", className)}>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <div
        className={cn(
          // rounded-full, not rounded-xl: tokens.css is explicit that radius-full
          // is the ACTION radius and radius-sm/xl the IDENTITY one, and "never
          // mix them". This pill IS an action — pressing it opens the picker —
          // and it sits between two round arrow buttons, so an xl here made one
          // row contain two pressable shapes. Today's original had it as xl and
          // the extraction inherited the defect; Progress's had it right.
          "pointer-events-none flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold [&_svg]:size-4",
          SURFACE[surface],
        )}
      >
        <Calendar className="text-muted-foreground" />
        {display}
      </div>
    </label>
  );
}

// size-11 (44px), not the size-9 this inherited: 36px is under any sane touch
// floor, and the rows in §4 are held to 48. It also makes the arrows exactly as
// tall as the pill, so the three controls read as one bar rather than a wide
// element with two small satellites.
const ARROW =
  "grid size-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors " +
  "enabled:hover:text-foreground disabled:opacity-30 [&_svg]:size-4";

/**
 * Previous / date / next, for a screen whose whole content is scoped to one day.
 *
 * `onShift` moves by a day in the caller's calendar — this component does no
 * date math, because the app's day is the CLIENT's local day (CLAUDE.md:
 * day-bucketed rows use `date_local` from the device) and a UTC-based shift
 * here would be off by one for anyone not on UTC.
 */
export function DayNav({
  value, onChange, onShift, min, max, display, resetTo, resetLabel = "Back to today", surface = "translucent", className,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Move one day. The caller owns the calendar; see the note above. */
  onShift: (days: -1 | 1) => void;
  min?: string;
  max?: string;
  display: ReactNode;
  /** When given and not equal to `value`, offers a one-tap way back. */
  resetTo?: string;
  resetLabel?: string;
  surface?: DateSurface;
  className?: string;
}) {
  const atMax = max != null && value >= max;
  const atMin = min != null && value <= min;
  const canReset = resetTo != null && resetTo !== value;
  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onShift(-1)}
          disabled={atMin}
          aria-label="Previous day"
          className={cn(ARROW, SURFACE[surface])}
        >
          <ChevronLeft />
        </button>
        <DatePill value={value} onChange={onChange} min={min} max={max} label="Pick a date" display={display} surface={surface} />
        <button
          type="button"
          onClick={() => onShift(1)}
          disabled={atMax}
          aria-label="Next day"
          className={cn(ARROW, SURFACE[surface])}
        >
          <ChevronRight />
        </button>
      </div>
      {/*
        Always rendered, even with nothing in it. This row is the difference
        between a control that stays put and one that shoves the screen down a
        line every time you step off today — see the header, point 2.
      */}
      <div className="flex h-6 items-center justify-center">
        {canReset && (
          <button
            type="button"
            onClick={() => onChange(resetTo)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&_svg]:size-3"
          >
            <RotateCcw />
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
}
