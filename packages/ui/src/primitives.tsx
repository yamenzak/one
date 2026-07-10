/**
 * Restyled primitives (DESIGN.md §2.2): pill Button, tonal Chip, Card ladder,
 * outlined Field, Skeleton. No borders, no shadows — tone does the work.
 */

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export type Tone =
  | "primary"
  | "activity"
  | "nutrition"
  | "sleep"
  | "cardio"
  | "hydration"
  | "good"
  | "warn"
  | "bad"
  | "neutral";

export const toneText: Record<Tone, string> = {
  primary: "text-primary",
  activity: "text-activity",
  nutrition: "text-nutrition",
  sleep: "text-sleep",
  cardio: "text-cardio",
  hydration: "text-hydration",
  good: "text-good",
  warn: "text-warn",
  bad: "text-bad",
  neutral: "text-fg-muted",
};

export const toneContainer: Record<Tone, string> = {
  primary: "bg-primary-container text-on-primary-container",
  activity: "bg-activity-container text-activity",
  nutrition: "bg-nutrition-container text-nutrition",
  sleep: "bg-sleep-container text-sleep",
  cardio: "bg-cardio-container text-cardio",
  hydration: "bg-hydration-container text-hydration",
  good: "bg-good-container text-good",
  warn: "bg-warn-container text-warn",
  bad: "bg-bad-container text-bad",
  neutral: "bg-surface-2 text-fg-muted",
};

/** CSS var color for SVG strokes/fills by tone. */
export const toneVar: Record<Tone, string> = {
  primary: "var(--color-primary)",
  activity: "var(--color-activity)",
  nutrition: "var(--color-nutrition)",
  sleep: "var(--color-sleep)",
  cardio: "var(--color-cardio)",
  hydration: "var(--color-hydration)",
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  neutral: "var(--color-fg-muted)",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "tonal" | "filled" | "outline" | "ghost" | "circle";
  size?: "md" | "lg";
}

export function Button({ variant = "tonal", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors select-none",
        "disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]",
        size === "lg" ? "h-14 px-8 text-base" : "h-11 px-5 text-sm",
        variant === "tonal" && "bg-primary-container text-on-primary-container hover:bg-primary-container/80",
        variant === "filled" && "bg-primary text-bg hover:opacity-90",
        variant === "outline" && "border border-fg-muted/30 text-fg hover:bg-surface-2",
        variant === "ghost" && "text-fg-muted hover:bg-surface-2",
        variant === "circle" && "size-11 rounded-full bg-surface-2 text-fg px-0",
        className,
      )}
      {...props}
    />
  );
}

interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

/** Status chip — always text-in-a-tonal-container, never color alone. */
export function Chip({ tone = "neutral", className, ...props }: ChipProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
        toneContainer[tone],
        className,
      )}
      {...props}
    />
  );
}

interface SuggestionChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/** Suggestion chip (forms + log sheet): selected = filled + check. */
export function SuggestionChip({ selected, className, children, ...props }: SuggestionChipProps) {
  return (
    <button
      className={clsx(
        "inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
        selected
          ? "bg-primary-container text-on-primary-container"
          : "bg-surface-2 text-fg hover:bg-surface-3",
        className,
      )}
      {...props}
    >
      {selected && <span aria-hidden>✓</span>}
      {children}
    </button>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-[--radius-card] bg-surface-1 p-5", className)} {...props} />;
}

export function SubCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("rounded-3xl bg-surface-2 p-4", className)} {...props} />;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={clsx("animate-pulse rounded-3xl bg-surface-2", className)} {...props} />;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  helper?: string;
}

/** Outlined-notch Material field: fieldset/legend carries the label. */
export function Field({ label, icon, helper, className, ...props }: FieldProps) {
  return (
    <div className={className}>
      <fieldset className="rounded-[--radius-field] border border-fg-muted/40 px-4 pb-3 pt-1 focus-within:border-primary">
        <legend className="px-1 text-xs text-fg-muted">{label}</legend>
        <div className="flex items-center gap-3">
          {icon && <span className="text-fg-muted">{icon}</span>}
          <input
            className="w-full bg-transparent text-base text-fg outline-none placeholder:text-fg-muted/60"
            {...props}
          />
        </div>
      </fieldset>
      {helper && <p className="mt-1 px-4 text-xs text-fg-muted">{helper}</p>}
    </div>
  );
}
