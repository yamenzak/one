/**
 * Brand-editor controls.
 *
 * A raw `<input type="range">` and a raw `<input type="color">` are the two
 * ugliest elements the platform gives you: the browser draws them, they ignore
 * the theme completely, and `type="color"` renders as a bevelled grey box with a
 * hairline of your colour inside it. They were sitting in the middle of the one
 * screen whose entire job is convincing an owner the product has taste.
 *
 * Both are rebuilt here — same native elements underneath, so keyboard, focus and
 * the OS colour picker all still work, but drawn with the design tokens.
 */

import { useId, type ReactNode } from "react";
import { cn } from "./lib/utils.js";

/**
 * A range input drawn with the tokens: a filled track up to the thumb, a
 * brand-coloured thumb, and the value shown beside its label rather than left to
 * be guessed from the handle position.
 */
export function Slider({
  value, min, max, step = 1, onChange, label, display, className, hint,
}: {
  value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
  label: ReactNode; display?: ReactNode; className?: string; hint?: ReactNode;
}) {
  const id = useId();
  // Percentage of the way along, for the filled portion of the track.
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm text-muted-foreground">{label}</label>
        {display != null && <span className="numeral text-sm font-medium tabular-nums">{display}</span>}
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        // The filled track. A gradient stop at the thumb position is the only way
        // to fill a native range consistently across engines.
        style={{ background: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${pct}%, var(--surface-3) ${pct}%, var(--surface-3) 100%)` }}
        className={cn(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          // The thumb has to be styled per engine — there is no shared selector.
          "[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:ring-2 [&::-webkit-slider-thumb]:ring-card [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:active:scale-90",
          "[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary",
        )}
      />
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A colour swatch that opens the OS picker.
 *
 * The native input is stretched over the swatch at zero opacity, so the click
 * target, keyboard focus and the picker itself are all still the browser's — only
 * the appearance is ours. `null`/empty renders as an explicit "no colour set"
 * state rather than silently showing black.
 */
export function ColorSwatch({
  value, onChange, label, size = "md", className,
}: {
  /** Any CSS colour, or empty for "not set". */
  value: string;
  onChange: (hex: string) => void;
  /** Accessible name — this control has no visible text of its own. */
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const set = Boolean(value && value.trim());
  // The native picker only accepts #rrggbb, so a token value like `oklch(...)`
  // cannot seed it — fall back to a neutral rather than to black.
  const seed = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : "#808080";
  return (
    <span
      className={cn(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-surface-2 transition-transform active:scale-95",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
        size === "sm" ? "size-7" : "size-10",
        className,
      )}
    >
      {set
        ? <span aria-hidden className="size-full" style={{ background: value }} />
        // Not-set reads as a diagonal slash, the standard "none" affordance.
        : <span aria-hidden className="size-full bg-surface-3" style={{ backgroundImage: "linear-gradient(135deg, transparent 46%, var(--muted-foreground) 46%, var(--muted-foreground) 54%, transparent 54%)" }} />}
      <input
        type="color"
        aria-label={label}
        value={seed}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </span>
  );
}

/**
 * A chip row that previews what it is selecting.
 *
 * For choices where the WORD is not the information — "0.95rem" and "Bold" tell
 * an owner nothing, but a corner and a line do. Each option renders its own
 * preview above its label.
 */
export function PreviewPicker<T extends string | number>({
  options, value, onChange, label, hint, className,
}: {
  options: { value: T; label: string; preview: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.value)}
              className={cn(
                "flex min-w-16 flex-col items-center gap-1.5 rounded-xl border p-2.5 transition-all active:scale-95",
                on ? "border-primary bg-primary/5" : "border-border hover:border-border",
              )}
            >
              <span className="grid h-7 place-items-center">{o.preview}</span>
              <span className={cn("text-xs", on ? "font-semibold text-foreground" : "text-muted-foreground")}>{o.label}</span>
            </button>
          );
        })}
      </div>
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}
