/**
 * Core primitives — shadcn-style, CVA-driven, theme-token based. No emoji, no
 * hard-coded colors; everything follows the live tenant theme.
 */

import { Slot } from "@radix-ui/react-slot";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "./lib/utils.js";
import type { LucideIcon } from "./lib/icons.js";

export type Tone =
  | "activity" | "nutrition" | "sleep" | "cardio" | "hydration" | "supplement" | "lab"
  | "calories" | "protein" | "carbs" | "fat"
  | "success" | "warning" | "danger" | "primary" | "neutral";

export const toneText: Record<Tone, string> = {
  activity: "text-activity",
  nutrition: "text-nutrition",
  sleep: "text-sleep",
  cardio: "text-cardio",
  hydration: "text-hydration",
  supplement: "text-supplement",
  lab: "text-lab",
  calories: "text-calories",
  protein: "text-protein",
  carbs: "text-carbs",
  fat: "text-fat",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  primary: "text-primary",
  neutral: "text-muted-foreground",
};

export const toneSoft: Record<Tone, string> = {
  activity: "bg-activity-soft text-activity",
  nutrition: "bg-nutrition-soft text-nutrition",
  sleep: "bg-sleep-soft text-sleep",
  cardio: "bg-cardio-soft text-cardio",
  hydration: "bg-hydration-soft text-hydration",
  supplement: "bg-supplement-soft text-supplement",
  lab: "bg-lab-soft text-lab",
  calories: "bg-calories-soft text-calories",
  protein: "bg-protein-soft text-protein",
  carbs: "bg-carbs-soft text-carbs",
  fat: "bg-fat-soft text-fat",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  primary: "bg-primary/15 text-primary",
  neutral: "bg-secondary text-muted-foreground",
};

export const toneVar: Record<Tone, string> = {
  activity: "var(--activity)",
  nutrition: "var(--nutrition)",
  sleep: "var(--sleep)",
  cardio: "var(--cardio)",
  hydration: "var(--hydration)",
  supplement: "var(--supplement)",
  lab: "var(--lab)",
  calories: "var(--calories)",
  protein: "var(--protein)",
  carbs: "var(--carbs)",
  fat: "var(--fat)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  primary: "var(--primary)",
  neutral: "var(--muted-foreground)",
};

// ── Button ─────────────────────────────────────────────────────────────────
const buttonVariants = cva(
  "relative inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,box-shadow,filter] outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:opacity-45 disabled:pointer-events-none active:scale-[0.97] [&_svg]:shrink-0 select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:brightness-[1.08]",
        tonal: "bg-primary/15 text-primary hover:bg-primary/22",
        secondary: "bg-secondary text-secondary-foreground hover:bg-surface-3",
        outline: "border border-border bg-transparent text-foreground hover:bg-secondary",
        ghost: "text-foreground hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-110",
      },
      size: {
        sm: "h-9 rounded-lg px-3.5 text-sm [&_svg]:size-4",
        default: "h-11 rounded-xl px-5 text-sm [&_svg]:size-[1.05rem]",
        lg: "h-[3.25rem] rounded-2xl px-7 text-base [&_svg]:size-5",
        icon: "size-11 rounded-full [&_svg]:size-[1.15rem]",
        "icon-sm": "size-9 rounded-full [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

// ── Card ───────────────────────────────────────────────────────────────────
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { interactive?: boolean }>(
  ({ className, interactive, onClick, onKeyDown, role, tabIndex, ...props }, ref) => {
    // A clickable Card must be keyboard-reachable and named — otherwise the
    // click-only div is invisible to keyboard/switch/AT users. Give it button
    // semantics (role, focusability, Enter/Space activation) rather than nesting
    // a real <button>, so it can still contain interactive children.
    const clickable = !!onClick;
    return (
      <div
        ref={ref}
        onClick={onClick}
        role={clickable ? role ?? "button" : role}
        tabIndex={clickable ? tabIndex ?? 0 : tabIndex}
        onKeyDown={(e) => {
          onKeyDown?.(e);
          if (clickable && !e.defaultPrevented && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onClick?.(e as unknown as React.MouseEvent<HTMLDivElement>);
          }
        }}
        className={cn(
          "rounded-2xl bg-card p-5 text-card-foreground",
          interactive && "transition-all hover:bg-surface-2 active:scale-[0.99] cursor-pointer",
          clickable && "outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
          className,
        )}
        {...props}
      />
    );
  },
);
Card.displayName = "Card";

export function SubCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl bg-surface-2 p-4", className)} {...props} />;
}

// ── Badge / Chip ───────────────────────────────────────────────────────────
export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold [&_svg]:size-3.5", toneSoft[tone], className)}
      {...props}
    />
  );
}

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: LucideIcon;
}

/** Selectable chip (filters, choices) with a check when selected. */
export function Chip({ selected, icon: Icon, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all active:scale-95 [&_svg]:size-4",
        selected ? "bg-primary text-primary-foreground shadow-sm" : "bg-secondary text-foreground hover:bg-surface-3",
        className,
      )}
      {...props}
    >
      {Icon && <Icon />}
      {children}
    </button>
  );
}

// ── Inputs ─────────────────────────────────────────────────────────────────
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-input bg-secondary/50 px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/70 focus:bg-secondary disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-input bg-secondary/50 p-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/70 focus:bg-secondary",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-sm font-medium text-muted-foreground", className)} {...props} />;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: LucideIcon;
  hint?: string;
  error?: string;
}

/** Labeled input with an optional leading icon + hint. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, icon: Icon, hint, error, className, id, ...props }, ref) => {
  // A stable, guaranteed-unique fallback id so repeated labels (e.g. superset
  // round rows) never collide into duplicate DOM ids. Explicit `id` still wins.
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={className}>
      <Label htmlFor={fieldId} className="mb-1.5 block">
        {label}
      </Label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted-foreground" />}
        <Input id={fieldId} ref={ref} className={cn(Icon && "pl-10", error && "border-danger focus:border-danger")} {...props} />
      </div>
      {error ? <p className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
});
Field.displayName = "Field";

// ── Switch ─────────────────────────────────────────────────────────────────
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=unchecked]:bg-surface-3",
        className,
      )}
      {...props}
    >
      {/* design-tokens-exempt: a switch thumb is white in BOTH modes, like the platform control it imitates — the track carries the brand (bg-input unchecked, bg-primary checked) and the thumb has to stay legible on both. */}
      <SwitchPrimitive.Thumb className="pointer-events-none block size-5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[1.35rem] data-[state=unchecked]:translate-x-0.5" />
    </SwitchPrimitive.Root>
  );
}

// ── Skeleton / Separator / Spinner ─────────────────────────────────────────
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-xl", className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn("size-5 animate-spin rounded-full border-2 border-current border-t-transparent text-muted-foreground", className)}
      role="status"
      aria-label="Loading"
    />
  );
}

// ── Icon badge (squircle glyph container) ──────────────────────────────────
export function IconBadge({ icon: Icon, tone = "primary", className, size = "md" }: { icon: LucideIcon; tone?: Tone; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl",
        size === "sm" ? "size-9 [&_svg]:size-4" : size === "lg" ? "size-14 [&_svg]:size-6 rounded-xl" : "size-11 [&_svg]:size-[1.15rem]",
        toneSoft[tone],
        className,
      )}
    >
      <Icon />
    </span>
  );
}

// ── Callout (inline tone-coded notice) ─────────────────────────────────────
/**
 * An inline notice: soft tone container + optional leading glyph + the aria role
 * that matches its purpose. This shape was being hand-rolled everywhere
 * (`rounded-xl bg-danger-soft p-3 text-danger` + `role="alert"`), which is how
 * notices drifted apart and how some ended up with no role at all. `live`
 * decides the announcement: `"alert"` for a failure the user must see now,
 * `"status"` (polite) for the result of something they just did.
 */
export function Callout({ tone = "neutral", icon: Icon, live, children, className }: {
  tone?: Tone;
  icon?: LucideIcon;
  live?: "alert" | "status";
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={live}
      aria-live={live === "status" ? "polite" : undefined}
      className={cn("flex items-start gap-2 rounded-2xl p-3 text-sm leading-relaxed", toneSoft[tone], className)}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}

// ── Section heading ────────────────────────────────────────────────────────
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

/** A tone-coded section header: squircle icon + title (+ optional count badge
 *  and a trailing action). The polished pattern used across cards app-wide. */
export function SectionHeader({ icon, tone = "primary", title, count, action, className }: { icon?: LucideIcon; tone?: Tone; title: ReactNode; count?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {icon && <IconBadge icon={icon} tone={tone} size="sm" />}
      <h2 className="min-w-0 flex-1 truncate font-semibold">{title}</h2>
      {count != null && <span className="numeral shrink-0 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>}
      {action}
    </div>
  );
}

export { buttonVariants };
