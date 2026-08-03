/**
 * Date scope controls — `DatePill`, `DayNav` and `RangePicker`.
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

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { Calendar, Check, ChevronLeft, ChevronRight, RotateCcw } from "./lib/icons.js";
import { Button, Chip } from "./primitives.js";
import { Group, Row } from "./layout.js";
import { Sheet } from "./overlays.js";

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

// ── RangePicker ──────────────────────────────────────────────────────────────

/**
 * THE RANGE IS ONE CONTROL, AND IT SITS IN THE HEADER.
 *
 * Three versions of this shipped before this one, and each failed differently:
 *
 *   7/30/90 AND NOTHING ELSE.  A coach who wanted "since the phase started"
 *                              could not ask.
 *   A FOURTH CELL THAT GREW A ROW.  Pressing "custom" revealed two date pills
 *                              underneath, pushing the whole screen down and
 *                              appearing under the reader.
 *   A BAR THAT WRAPPED.        Presets + a calendar button is ~200px of chrome.
 *                              Next to a lens rail on a 390px phone it wrapped
 *                              to a second line, so the screen opened with two
 *                              rows of controls stacked above any content.
 *
 * So there is no bar. The control is ONE chip in the section header — the slot
 * `Eyebrow`/`Section` already reserves for a quiet affordance — showing the
 * window currently in force, and everything else is in the sheet it opens:
 * the presets as rows (each with the dates it covers), and a custom start→end
 * under them with whole-calendar shortcuts.
 *
 * The cost is a tap to change range. It buys back a whole row of the viewport
 * on every screen that scopes itself to a window, the presets get READABLE
 * names instead of "90d", and adding a fourth preset is free. A range is
 * something you set and then read from for a while; it is not a switch you flip
 * every few seconds, which is the case the segmented control was right for.
 *
 * ── Dates in, dates out ─────────────────────────────────────────────────────
 *
 * `today` is a REQUIRED prop and every date is a `YYYY-MM-DD` string. The app's
 * day is the user's local day, so a component that read the clock here would be
 * a day out for anyone whose device is not on the machine's timezone — the same
 * reason `DayNav` refuses to do date math. The arithmetic below is on UTC
 * midnights of already-local dates, which is the one safe way to add days to a
 * calendar date without a timezone entering it.
 */
export interface RangePresetDef {
  value: string;
  /** The readable name — "Last 30 days". This is what the chip and the menu
   *  show, so write it as words rather than as an axis label. */
  label: string;
  /** Window length INCLUDING today, so 7 means today and the six before it. */
  days: number;
}

const MS_DAY = 86_400_000;
const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const shiftDays = (iso: string, days: number) => new Date(utc(iso) + days * MS_DAY).toISOString().slice(0, 10);

/** Days in an inclusive `start`→`end` window. */
export function rangeLength(start: string, end: string): number {
  return Math.round((utc(end) - utc(start)) / MS_DAY) + 1;
}

/** The window a preset covers, ending today. */
export function presetWindow(preset: RangePresetDef, today: string): { start: string; end: string } {
  return { start: shiftDays(today, -(Math.max(1, preset.days) - 1)), end: today };
}

const monthDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function RangePicker({
  presets,
  preset,
  start,
  end,
  today,
  onPreset,
  onCustom,
  maxDays = 366,
  format = monthDay,
  className,
}: {
  presets: readonly RangePresetDef[];
  /** The selected preset, or `"custom"` when `start`/`end` are in force. */
  preset: string;
  /** The custom window. Ignored unless `preset === "custom"`. */
  start?: string;
  end?: string;
  /** The user's local today — the ceiling, and the anchor every preset counts back from. */
  today: string;
  onPreset: (value: string) => void;
  onCustom: (start: string, end: string) => void;
  maxDays?: number;
  format?: (iso: string) => string;
  className?: string;
}) {
  const custom = preset === "custom";
  const [open, setOpen] = useState(false);
  // Drafted, not applied: a sheet you close without pressing anything must
  // leave the screen it was opened from exactly as it was.
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const windowOf = (value: string) =>
    presetWindow(presets.find((p) => p.value === value) ?? presets[0] ?? { value, label: value, days: 30 }, today);

  useEffect(() => {
    if (!open) return;
    const fallback = windowOf(preset);
    setFrom(custom && start ? start : fallback.start);
    setTo(custom && end ? end : fallback.end);
    // `windowOf` is derived from props already in this list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, custom, start, end, preset, presets, today]);

  const draftDays = from <= to ? rangeLength(from, to) : 0;
  const tooLong = draftDays > maxDays;
  const valid = draftDays > 0 && !tooLong;

  /** What the chip says: the window in force, in the fewest words that are true. */
  const chipLabel = custom && start && end
    ? `${format(start)} – ${format(end)}`
    : presets.find((p) => p.value === preset)?.label ?? "Range";

  /** Whole-calendar shortcuts. These are the windows people name out loud, and
   *  none of them is expressible as "N days back from today". */
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const firstOf = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const prevY = m === 1 ? y - 1 : y, prevM = m === 1 ? 12 : m - 1;
  const jumps: { label: string; from: string; to: string }[] = [
    { label: "This month", from: firstOf(y, m), to: today },
    { label: "Last month", from: firstOf(prevY, prevM), to: shiftDays(firstOf(y, m), -1) },
    { label: "Year to date", from: `${y}-01-01`, to: today },
  ];

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className={cn("shrink-0", className)}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Calendar aria-hidden />
        <span className="sr-only">Date range: </span>
        {chipLabel}
      </Button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Date range"
        footer={
          <Button
            size="lg"
            className="w-full"
            disabled={!valid}
            onClick={() => { onCustom(from, to); setOpen(false); }}
          >
            {valid ? `Show these ${draftDays} ${draftDays === 1 ? "day" : "days"}` : "Pick a range"}
          </Button>
        }
      >
        <div className="space-y-4">
          {/* The presets APPLY ON TAP and close. They are the common case, and
              a preset that needed the footer button too would make the footer
              mean two different things depending on what you touched last. */}
          <Group>
            {presets.map((p) => {
              const w = presetWindow(p, today);
              return (
                <Row
                  key={p.value}
                  onClick={() => { onPreset(p.value); setOpen(false); }}
                  sub={`${format(w.start)} – ${format(w.end)}`}
                  chevron={false}
                  trailing={!custom && p.value === preset
                    ? <Check aria-label="Current range" className="size-4 text-primary" />
                    : undefined}
                >
                  {p.label}
                </Row>
              );
            })}
          </Group>

          <div className="space-y-3">
            <p className="px-1 text-micro uppercase text-muted-foreground">Custom range</p>
            <div className="flex flex-wrap gap-2">
              {jumps.map((j) => (
                <Chip
                  key={j.label}
                  selected={from === j.from && to === (j.to > today ? today : j.to)}
                  onClick={() => { setFrom(j.from); setTo(j.to > today ? today : j.to); }}
                >
                  {j.label}
                </Chip>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <DatePill value={from} max={to} label="Start date" display={format(from)}
                onChange={(v) => { setFrom(v); if (v > to) setTo(v); }} />
              <span aria-hidden className="shrink-0 text-sm text-muted-foreground">→</span>
              <DatePill value={to} min={from} max={today} label="End date" display={format(to)}
                onChange={(v) => { setTo(v); if (v < from) setFrom(v); }} />
            </div>

            {/* The consequence of the two pills above, in words — a range is two
                dates and a LENGTH, and the length is the thing being chosen. */}
            <p className={cn("px-1 text-caption", tooLong ? "text-warning" : "text-muted-foreground")} role={tooLong ? "alert" : undefined}>
              {tooLong
                ? `That is ${draftDays} days. The longest range is ${maxDays} — move the start date forward.`
                : `${draftDays} ${draftDays === 1 ? "day" : "days"}`}
            </p>
          </div>
        </div>
      </Sheet>
    </>
  );
}

/**
 * The range as STATE — the half of `RangePicker` a screen has to hold.
 *
 * Two screens held it by hand and both held it slightly differently: one kept
 * `range` plus a `customStart`/`customEnd` pair and rebuilt its query string
 * from a ternary at the fetch site; the other kept a preset and had no custom
 * window at all. A query string built next to the fetch and a control rendered
 * two hundred lines above it is a pair that can silently disagree — which is
 * exactly what a hook removes: `props` and `query` are computed from the same
 * value, so a chip reading "45 days" cannot be fetching thirty.
 */
export function useDateRange(presets: readonly RangePresetDef[], today: string, initial?: string) {
  const first = initial ?? presets[0]?.value ?? "30d";
  const fallback: RangePresetDef = { value: first, label: first, days: 30 };
  const windowOf = (value: string) => presetWindow(presets.find((p) => p.value === value) ?? presets[0] ?? fallback, today);

  const [preset, setPreset] = useState<string>(first);
  const [custom, setCustom] = useState(() => windowOf(first));

  const window = preset === "custom" ? custom : windowOf(preset);
  return {
    preset,
    /** The resolved `start`/`end`, whichever way it was chosen. */
    window,
    /** Ready to concatenate into a request — never built twice. */
    query: preset === "custom" ? `start=${custom.start}&end=${custom.end}` : `range=${preset}`,
    /** Spread into `<RangePicker />`. */
    props: {
      presets, preset, today,
      start: custom.start,
      end: custom.end,
      onPreset: setPreset,
      onCustom: (start: string, end: string) => { setCustom({ start, end }); setPreset("custom"); },
    },
  };
}
