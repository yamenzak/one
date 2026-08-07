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

/**
 * ── TONE ────────────────────────────────────────────────────────────────────
 *
 * The five STATUS tones are universal: every product has a success, a warning,
 * a danger, its brand primary, and a neutral. Those are closed, spelled out,
 * and typo-checked.
 *
 * Everything else is an ACCENT the app owns. This used to be a closed union
 * carrying `nutrition | sleep | cardio | hydration | supplement | lab |
 * calories | protein | carbs | fat` — a warehouse app has none of those, and
 * adding an eleventh meant editing the design system. So an accent is now any
 * name, resolved by CONVENTION:
 *
 *     tone "foo"  →  text-foo · bg-foo-soft text-foo · var(--foo)
 *
 * Two things an app does to register one, and both are in the app:
 *
 *   1. define `--foo` and `--foo-soft` for both modes, and map them in its own
 *      `@theme` block (Kova: `apps/app/src/tokens.accents.css`).
 *   2. make the class LITERALS visible to its Tailwind scan, or Tailwind never
 *      generates `text-foo` — a utility built by string concatenation at
 *      runtime is invisible to a scanner. Kova does this in
 *      `apps/app/src/registry/tones.ts`, which is also where the accents are
 *      documented. This is the whole reason the literals cannot live here.
 */
export type StatusTone = "success" | "warning" | "danger" | "primary" | "neutral";

/** A status tone, or any accent the app has registered. */
// eslint-disable-next-line @typescript-eslint/ban-types
export type Tone = StatusTone | (string & {});

const STATUS_TEXT: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  primary: "text-primary",
  neutral: "text-muted-foreground",
};

const STATUS_SOFT: Record<StatusTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  primary: "bg-primary/15 text-primary",
  neutral: "bg-secondary text-muted-foreground",
};

const STATUS_VAR: Record<StatusTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  primary: "var(--primary)",
  neutral: "var(--muted-foreground)",
};

/**
 * Look up a tone, falling back to the naming convention.
 *
 * A Proxy rather than a function so the ~56 existing `toneText[tone]` and
 * `toneVar.danger` call sites read exactly as they always did. It encodes a
 * convention, which is what the hand-written map already was — every one of its
 * entries followed the same rule.
 */
const toneMap = (status: Record<StatusTone, string>, accent: (t: string) => string): Record<Tone, string> =>
  new Proxy({} as Record<Tone, string>, {
    get: (_t, key: string | symbol) =>
      typeof key === "string" ? (status[key as StatusTone] ?? accent(key)) : undefined,
    has: () => true,
  });

const STATUS_FILL: Record<StatusTone, string> = {
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-danger text-danger-foreground",
  primary: "bg-primary text-primary-foreground",
  neutral: "bg-surface-3 text-foreground",
};

export const toneText: Record<Tone, string> = toneMap(STATUS_TEXT, (t) => `text-${t}`);
export const toneSoft: Record<Tone, string> = toneMap(STATUS_SOFT, (t) => `bg-${t}-soft text-${t}`);
export const toneVar: Record<Tone, string> = toneMap(STATUS_VAR, (t) => `var(--${t})`);

/**
 * A tone as a SOLID fill, with ink that is readable on it.
 *
 * `toneSoft` is the pale tint with the tone as text; this is the inverse — the
 * tone at full strength with a foreground chosen for it. The distinction
 * matters because the ink cannot be one shared value:
 *
 * There used to be a single `--tone-foreground` per theme mode (near-dark in
 * dark mode, near-white in light), which works only while every accent in a
 * mode happens to sit at a similar lightness. Kova's hand-tuned defaults do —
 * and the moment a studio generates its palette from its own brand colour, or
 * an app registers an accent at a different lightness, that assumption breaks
 * and a pill renders dark-on-dark. Each tone now carries `--<tone>-foreground`,
 * picked by MEASURED WCAG contrast (`bestForeground`, lib/theme.ts): whichever
 * of near-white or near-black actually wins against that specific colour.
 *
 * ⚠️ Like `toneText` and `toneSoft`, this builds its class names by
 * CONCATENATION, which a Tailwind scanner cannot follow. An app's accent
 * registry must spell `bg-<tone> text-<tone>-foreground` out as a literal (Kova:
 * `ACCENT_CLASSES` in `registry/tones.ts`, asserted by `tokens.accents.test.ts`)
 * or the utility is never emitted and the fill renders unstyled.
 *
 * `--tone-foreground` survives for the RUNTIME path — `BottomTabs` and Kova's
 * `Shell` build `var(--${tone}-foreground, var(--tone-foreground))`, where a
 * tone registered without its own on-colour falls back to the old shared value
 * instead of to `inherit`.
 */
export const toneFill: Record<Tone, string> = toneMap(STATUS_FILL, (t) => `bg-${t} text-${t}-foreground`);

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
        // The ladder is `caption` → `body` → `body-lg`, not xs → sm → base:
        // the three sizes are three ROLES, so a button label sits on the same
        // scale as the text around it instead of on Tailwind's parallel one.
        sm: "h-9 rounded-lg px-3.5 text-caption [&_svg]:size-4",
        default: "h-11 rounded-xl px-5 text-body [&_svg]:size-[1.05rem]",
        lg: "h-[3.25rem] rounded-2xl px-7 text-body-lg [&_svg]:size-5",
        icon: "size-11 rounded-full [&_svg]:size-[1.15rem]",
        "icon-sm": "size-9 rounded-full [&_svg]:size-4",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

/**
 * AN ICON BUTTON MUST BE NAMED, AND THE TYPE SYSTEM SAYS SO.
 *
 * `size="icon"` renders a glyph and nothing else, so its accessible name is
 * whatever `aria-label` says — there is no text node to fall back on. Without
 * one it announces as "button", it cannot be reached by voice control ("click
 * delete" matches nothing), and it is invisible in an accessibility tree audit.
 *
 * This was 36 buttons out of 101 across the three apps, which is the shape of a
 * rule that exists in the document and nowhere in the code (§12). A lint could
 * find it, but a TYPE stops it being written — the error arrives in the editor
 * rather than in CI, and it cannot be forgotten by an app that never opted in.
 *
 * A tooltip is NOT a name. `Tooltip` wraps its child in Radix's trigger, which
 * sets `aria-describedby` — supplementary text, announced after the name if at
 * all, and absent entirely while the tooltip is closed. Fourteen widget-palette
 * buttons relied on exactly that.
 *
 * `title` is not accepted either. It is a name of last resort in the HTML
 * accessibility mapping, never surfaced on touch, and inconsistently announced.
 * Where a control wants a hover hint AND a name, it takes both.
 */
type ButtonSize = "sm" | "default" | "lg" | "icon" | "icon-sm";
type Named = { "aria-label": string } | { "aria-labelledby": string };

/*
  Two branches, and the second is deliberately wider than "size is icon".

  `Filters` picks its size at RUNTIME — `size={active > 0 ? "sm" : "icon"}` —
  because the control is icon-only until a facet turns on and then shows its
  count. Its size is `"sm" | "icon"`, which fits neither a strictly-icon branch
  nor a strictly-text one, so a narrower rule would have rejected a button that
  is correctly labelled. Requiring a name for any size that is not STATICALLY
  known to be a text button is both the fix and the honest rule: if the compiler
  cannot see that this button has words in it, neither can a screen reader.
*/
type SizeProps =
  | { size?: "sm" | "default" | "lg" | null }
  | ({ size: ButtonSize | null } & Named);

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "size"> &
  Omit<VariantProps<typeof buttonVariants>, "size"> & {
    asChild?: boolean;
  } & SizeProps;

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

// ── Badge / Chip / StatusDot ───────────────────────────────────────────────
export function Badge({ tone = "neutral", solid, className, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  /**
   * The tone at FULL strength with ink chosen for it, instead of the pale tint.
   *
   * For the one badge on a screen that has to win against a photograph or a
   * busy row — a "Live" pill over a video thumbnail. `toneFill` picks the
   * foreground by measured contrast, so it stays readable on a tenant's own
   * brand colour where a shared on-colour would not.
   */
  solid?: boolean;
}) {
  return (
    <span
      // `micro` IS the badge role (§5: "overline, badge") and it already carries
      // 600 and +0.02em, so `font-semibold` here was the weight said twice.
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-micro [&_svg]:size-3.5", (solid ? toneFill : toneSoft)[tone], className)}
      {...props}
    />
  );
}

/**
 * A small state dot — live, online, healthy, off.
 *
 * Genuinely missing from the system: Scena had one, and having it there rather
 * than here is what let a whole parallel tone vocabulary grow around it (see
 * the note on `Tone` above). It is two elements and no logic, which is exactly
 * the size of thing an app reimplements rather than asks for.
 *
 * `ping` is the live pulse. It is decorative and marked `aria-hidden`; the
 * MEANING must be in the text beside it, because a colour is not a label.
 */
export function StatusDot({ tone = "neutral", ping, className }: { tone?: Tone; ping?: boolean; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: toneVar[tone] }}
      aria-hidden
    >
      {ping && <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ backgroundColor: toneVar[tone] }} />}
    </span>
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
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-body font-medium transition-all active:scale-95 [&_svg]:size-4",
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
/**
 * ⚠️ THE DATE/TIME CLASSES ARE NOT DECORATION — they stop the input escaping
 * its card.
 *
 * `w-full` is not enough for `type="date"` / `time` / `datetime-local`. Those
 * are replaced elements: the browser gives them an INTRINSIC width from the
 * widest value they could hold plus the picker button, and an intrinsic
 * `min-width: auto` that `w-full` cannot shrink past. Inside a `Card` — or any
 * flex or grid child — the field renders WIDER than its container and hangs off
 * the right edge, which is exactly what a client photographed on the profile
 * form. It is worst on iOS Safari, where the value is laid out right-aligned in
 * a `-webkit-date-and-time-value` box that adds its own padding.
 *
 * The three fixes, each necessary:
 *   `min-w-0`                        overrides the intrinsic minimum so `w-full` wins.
 *   `appearance-none`                drops the platform chrome that carries the extra width.
 *   `::-webkit-date-and-time-value`  left-aligns the value and gives it a normal
 *                                    line box, so iOS stops reserving space for
 *                                    its own alignment.
 *
 * All four are inert on every other input type, which is why they live in the
 * base class rather than in each caller — a date field is added by writing
 * `type="date"`, and nobody remembers a rule attached to a type.
 */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      // iOS Safari auto-zooms the viewport when a focused field is under 16px,
      // and `body` is 15. The zoom is not undone on blur, so one tap on one
      // input leaves the whole app scaled — the one place a size beats a role.
      // type-scale-exempt: 16px is a PLATFORM THRESHOLD, not a style choice.
      "h-11 w-full min-w-0 appearance-none rounded-xl border border-input bg-secondary/50 px-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/70 focus:bg-secondary disabled:opacity-50",
      "[&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left",
      "[&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
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
      // type-scale-exempt: the iOS auto-zoom threshold, same as `Input` above.
      "w-full rounded-xl border border-input bg-secondary/50 p-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/70 focus:bg-secondary",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return <LabelPrimitive.Root className={cn("text-caption font-medium text-muted-foreground", className)} {...props} />;
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  /**
   * Keep the label for assistive tech, hide it from sight.
   *
   * For a search box under a section header that already names the thing —
   * "Exercise library" / "Search exercises" / "Search the library…" was the
   * same instruction three times inside 80px. The label is never optional,
   * because an input with no accessible name is unusable by voice control and
   * announced as "edit text"; only its *visibility* is negotiable.
   */
  labelHidden?: boolean;
  icon?: LucideIcon;
  hint?: string;
  error?: string;
}

/** Labeled input with an optional leading icon + hint. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(({ label, labelHidden, icon: Icon, hint, error, className, id, ...props }, ref) => {
  // A stable, guaranteed-unique fallback id so repeated labels (e.g. superset
  // round rows) never collide into duplicate DOM ids. Explicit `id` still wins.
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    // `min-w-0` on the WRAPPER as well as the input: a grid or flex child gets
    // `min-width: auto`, so the two-column height row (`grid-cols-2`) would let
    // a wide intrinsic input push its own track past the container even after
    // the input itself agreed to shrink.
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={fieldId} className={labelHidden ? "sr-only" : "mb-1.5 block"}>
        {label}
      </Label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-[1.1rem] -translate-y-1/2 text-muted-foreground" />}
        <Input id={fieldId} ref={ref} className={cn(Icon && "pl-10", error && "border-danger focus:border-danger")} {...props} />
      </div>
      {error ? <p className="mt-1.5 text-caption text-danger">{error}</p> : hint ? <p className="mt-1.5 text-caption text-muted-foreground">{hint}</p> : null}
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

/**
 * A hairline.
 *
 * `orientation` is not a Scena quirk that leaked upward — a vertical rule
 * between groups of controls in one toolbar is the same separator turned
 * ninety degrees, and any app with a toolbar wants it. The default stays
 * horizontal, so every existing call is unchanged.
 */
export function Separator({ className, orientation = "horizontal" }: { className?: string; orientation?: "horizontal" | "vertical" }) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(orientation === "vertical" ? "h-full w-px self-stretch" : "h-px w-full", "shrink-0 bg-border", className)}
    />
  );
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
      className={cn("flex items-start gap-2 rounded-2xl p-3 text-caption leading-relaxed", toneSoft[tone], className)}
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
      <h2 className="text-body-lg">{children}</h2>
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
      {count != null && <span className="numeral shrink-0 rounded-full bg-secondary px-2 py-0.5 text-micro text-muted-foreground">{count}</span>}
      {action}
    </div>
  );
}

export { buttonVariants };
