/**
 * LAYOUT — the five-tier spine, as components. UI-LANGUAGE §1, §2, §3, §7.
 *
 * These are the pieces every screen is built from. The value is not that they
 * save typing (they barely do) — it is that the hierarchy becomes structural.
 * You cannot accidentally give a screen two anchors, because `<Anchor>` is a
 * thing you place once, and a reviewer can see it in the diff.
 *
 * The spine, top to bottom, always:
 *
 *   Atmosphere   the brand wash, behind everything, scrolls away
 *   Anchor       the one thing the screen is about
 *   ActionCluster what you came here to do
 *   Section/Group/Row   what you came here to read
 *   (chrome)     supplied by the shell, animates last
 *
 * ── The rule that does the most work ────────────────────────────────────────
 *
 * **A component never decides its own importance — its container does.** That
 * is why `Anchor`, `Row` and `Stat` are three components rather than one with a
 * `size` prop: the same value is a display numeral on its own screen, a
 * right-aligned value in a row, and a caption in a summary. Encoding that as a
 * prop invites screens to promote things that should not be promoted.
 */

import { forwardRef, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "./lib/utils.js";
import { anchorIn, atmosphereIn, contentIn, contentStagger, pressProps, rowIn, rowStagger, stepPanelVariants } from "./lib/animation.js";
import { ChevronRight, type LucideIcon } from "./lib/icons.js";
import { toneVar, type Tone } from "./primitives.js";

// ── T0 · Atmosphere ─────────────────────────────────────────────────────────

export type AtmosphereTone = "brand" | "quiet" | "state";

/**
 * The brand wash — the single most identifiable surface in the language (§3).
 *
 * A saturated wash at the top of the SCROLL CONTAINER decaying to canvas by
 * ~55% height. Three properties are load-bearing and easy to get wrong:
 *
 *  • **It belongs to the scroll container, not the viewport.** It scrolls away.
 *    A fixed backdrop reads as a wallpaper; this reads as the top of a space.
 *  • **Content sits on canvas, not on the wash.** The wash lives behind the
 *    anchor and nothing else. That contrast is exactly what makes the anchor
 *    read as the anchor — put cards on it and the whole hierarchy flattens.
 *  • **One per screen.** Nested washes are noise, and two brand colours in one
 *    viewport is the fastest way to look unfinished.
 *
 * `state` replaces the brand tone when the whole screen is degraded (read-only,
 * offline, expired). It is the only case where T0 carries meaning, and it must
 * always be accompanied by a T3 explanation in words — nobody reads colour as a
 * sentence.
 */
export function Atmosphere({ tone = "brand", className }: { tone?: AtmosphereTone; className?: string }) {
  // Two stacked layers rather than one gradient: a broad vertical fade that
  // establishes the field, and a soft radial bloom behind where the anchor sits.
  // One gradient can do the fade or the bloom, not both, and the bloom is what
  // stops the top of the screen reading as a flat colour band.
  const color = tone === "state" ? "var(--warning)" : "var(--primary)";
  const strength = tone === "quiet" ? 0.3 : 1;
  return (
    <motion.div
      aria-hidden
      variants={atmosphereIn}
      style={{ opacity: "var(--atmosphere-opacity, 1)" }}
      className={cn("pointer-events-none absolute inset-x-0 top-0 -z-10 h-[62vh] max-h-[560px]", className)}
    >
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(180deg,
            color-mix(in oklch, ${color} ${34 * strength}%, transparent) 0%,
            color-mix(in oklch, ${color} ${14 * strength}%, transparent) 38%,
            transparent 78%)`,
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-[70%]"
        style={{
          background: `radial-gradient(78% 62% at 50% 12%,
            color-mix(in oklch, ${color} ${26 * strength}%, transparent) 0%,
            transparent 70%)`,
        }}
      />
    </motion.div>
  );
}

// ── Screen ──────────────────────────────────────────────────────────────────

/**
 * A screen: the scroll container, the safe areas, the column, and the
 * choreography that runs the four tiers in order (§8).
 *
 * `center` is for the doorway screens (sign-in, signposts, empty rooms) where
 * there is no scrolling content and the column should sit in the middle of the
 * viewport rather than at the top of it.
 */
export function Screen({
  children,
  atmosphere = "brand",
  center = false,
  width = "column",
  className,
}: {
  children: ReactNode;
  atmosphere?: AtmosphereTone | false;
  center?: boolean;
  /** `column` = the standard content column; `narrow` = doorways and forms. */
  width?: "column" | "narrow";
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={contentStagger}
      className={cn("relative isolate min-h-dvh w-full overflow-x-clip", className)}
    >
      {atmosphere && <Atmosphere tone={atmosphere} />}
      <div
        className={cn(
          "relative mx-auto flex w-full flex-col px-4 md:px-6",
          width === "narrow" ? "max-w-md" : "column",
          center ? "min-h-dvh justify-center py-10" : "pb-16 pt-6",
        )}
      >
        {children}
      </div>
    </motion.div>
  );
}

// ── T1 · Anchor ─────────────────────────────────────────────────────────────

/**
 * The one thing this screen is about (§1). **Exactly one per screen.**
 *
 * If you cannot name it in one noun, the screen has more than one job and
 * should be more than one screen. It is also the transform origin the rest of
 * the content settles toward, which is why it is the only element that scales
 * on entrance.
 *
 * ── Why this exists twice over ──────────────────────────────────────────────
 *
 * This component shipped early and then sixteen screens hand-rolled
 * `<TierAnchor className="flex flex-col items-center gap-1 pb-1 pt-2 ...">`
 * around three `<p>`s instead of using it — which is the worst outcome
 * available: a primitive that exists, is exported, and is bypassed. It was
 * bypassed for two concrete reasons, both now fixed. Its spacing was stale
 * (`gap-2 pb-2 pt-6`, from before the anchor sat under the app bar) while the
 * screens had all converged on the tighter set; and it spread no props, so a
 * screen needing its own attributes had no way in.
 *
 * The lesson is in the file header: the value of these components is that the
 * hierarchy becomes structural. That only holds while they are the path of
 * least resistance — a primitive nobody adopts enforces nothing.
 */
export function Anchor({
  eyebrow,
  children,
  word,
  sub,
  below,
  className,
  ...props
}: Omit<HTMLMotionProps<"div">, "children"> & {
  /** A short label above the value. Muted, `caption`. */
  eyebrow?: ReactNode;
  /** The value. Rendered at `display`, tabular. */
  children?: ReactNode;
  /**
   * The anchor's value when it is **words, not a number** — "Not scored yet",
   * "No access". Rendered at `title-1`, because a sentence at `display` either
   * wraps to three lines or gets truncated, and §5 forbids the third option
   * (a dash where a number belongs). Takes precedence over `children`.
   */
  word?: ReactNode;
  /** A quiet line under the value. The SECOND fact — never the value restated. */
  sub?: ReactNode;
  /** A pill or small control directly beneath — the Revolut "Accounts" slot. */
  below?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={anchorIn} className={cn("flex flex-col items-center gap-1 pb-1 pt-2 text-center", className)} {...props}>
      {eyebrow && <p className="text-caption text-muted-foreground">{eyebrow}</p>}
      {word != null ? <p className="text-title-1">{word}</p> : <p className="numeral text-display">{children}</p>}
      {sub && <p className="text-caption text-muted-foreground">{sub}</p>}
      {below && <div className="pt-2">{below}</div>}
    </motion.div>
  );
}

/**
 * The unit beside an anchor value. Subordinate by construction: ~55% of the
 * value's size and muted, on the same baseline (§5). Rendering a unit at the
 * value's size is the most common way a beautiful number stops being one.
 */
export function Unit({ children }: { children: ReactNode }) {
  return <span className="align-baseline text-[0.55em] font-semibold text-muted-foreground">{children}</span>;
}

// ── T2 · Action cluster ─────────────────────────────────────────────────────

export interface ActionItem {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
}

/**
 * The primary actions (§1 T2): circular icon buttons with a label beneath,
 * evenly distributed under the anchor.
 *
 * **Three to five, and the fifth is "More".** The circle-vs-squircle
 * distinction is deliberate and carries meaning (§6): a circle is something you
 * press, a squircle is something a row is about. Do not use this component for
 * navigation — it is for verbs.
 */
export function ActionCluster({ items, className }: { items: ActionItem[]; className?: string }) {
  // The cap is a language rule (§1), so it is enforced where it can actually be
  // seen: in the console, at the moment someone adds a sixth. A type-level cap
  // would be stricter and far more annoying to work around legitimately.
  if (items.length > 5) {
    console.warn(`ActionCluster: ${items.length} actions. The language caps this at 5 — the 5th should be "More". (UI-LANGUAGE §1)`);
  }
  return (
    <motion.div variants={contentIn} className={cn("flex items-start justify-center gap-6 py-2", className)}>
      {items.map((a) => {
        const Icon = a.icon;
        const inner = (
          <>
            <span className="grid size-12 place-items-center rounded-full bg-surface-2 transition-colors group-hover:bg-surface-3">
              <Icon aria-hidden className="size-5" />
            </span>
            <span className="text-caption text-muted-foreground">{a.label}</span>
          </>
        );
        const cls = "group flex min-w-14 flex-col items-center gap-2 disabled:opacity-40";
        return a.href ? (
          <motion.a key={a.label} href={a.href} className={cls} {...pressProps}>{inner}</motion.a>
        ) : (
          <motion.button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled} className={cls} {...pressProps}>
            {inner}
          </motion.button>
        );
      })}
    </motion.div>
  );
}

// ── T3 · Section / Group / Row ──────────────────────────────────────────────

/**
 * A titled block of content, with the section rhythm (§2: `space-8` below).
 *
 * The trailing `action` is for one quiet affordance — "See all", "Edit". It is
 * never a primary action; those live in the cluster.
 */
export function Section({
  title,
  action,
  children,
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.section variants={contentIn} className={cn("mb-8 last:mb-0", className)}>
      {(title || action) && (
        <div className="mb-3 flex min-h-8 items-center justify-between gap-3 px-1">
          {title && <h2 className="text-title-3">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </motion.section>
  );
}

/**
 * The grouped container that rows live in (§7).
 *
 * Carries no padding of its own — rows own their own height and inset, which is
 * what makes a list have a rhythm you can feel while scrolling. Separators are
 * inset to the text origin, never full-bleed, so the icon column reads as a
 * column rather than a series of interruptions.
 */
export function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={rowStagger} className={cn("overflow-hidden rounded-2xl bg-card", className)}>
      {children}
    </motion.div>
  );
}

export interface RowProps {
  /** A squircle identity container — what this row is ABOUT (§6). */
  icon?: LucideIcon;
  /**
   * Tint the icon container. Use it when the KIND of the row is meaningful and
   * repeated — a feed of mixed event types, a settings index, a picker — so the
   * list is scannable by colour as well as by word.
   *
   * It exists because the alternative was being reached for: a screen that
   * wanted a tinted glyph passed `leading={<IconBadge …/>}` instead, which is a
   * different container at a different size and pushes the row to its 72px
   * avatar height. Two row heights in one list is the thing §4 fixed heights
   * are for preventing.
   */
  iconTone?: Tone;
  /** Anything custom in the leading slot: an avatar, a logo, a colour swatch. */
  leading?: ReactNode;
  /** The primary line. A noun the user recognises (§10). */
  children: ReactNode;
  /** The secondary line. A fact, not a category. */
  sub?: ReactNode;
  /** Right-aligned value. Numbers get `tabular-nums` automatically. */
  value?: ReactNode;
  /** A quiet line under the value. */
  valueSub?: ReactNode;
  /** Custom trailing content (a switch, a badge). Replaces value/chevron. */
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  /** Show the chevron. Defaults on when the row navigates. */
  chevron?: boolean;
  /** Hide the hairline (last row in a group, or a standalone row). */
  divider?: boolean;
  tone?: "default" | "danger";
  disabled?: boolean;
  className?: string;
}

/**
 * The most repeated element in the product (§2).
 *
 * Fixed heights (56 / 64 / 72 by content) rather than padding, because a list
 * whose rows are all slightly different heights never feels engineered no
 * matter how correct the spacing is. The whole row is the tap target.
 */
export const Row = forwardRef<HTMLElement, RowProps>(function Row(
  { icon: Icon, iconTone, leading, children, sub, value, valueSub, trailing, onClick, href, chevron, divider = true, tone = "default", disabled, className },
  ref,
) {
  const navigates = Boolean(onClick || href);
  const showChevron = chevron ?? (navigates && !trailing && value === undefined);
  const twoLine = Boolean(sub);

  const body = (
    <>
      {(Icon || leading) && (
        <span className="grid shrink-0 place-items-center">
          {leading ?? (
            <span
              className={cn("grid size-9 place-items-center rounded-sm", !iconTone && "bg-surface-2")}
              style={iconTone ? { backgroundColor: `color-mix(in oklch, ${toneVar[iconTone]} 15%, transparent)` } : undefined}
            >
              {Icon && (
                <Icon
                  aria-hidden
                  className={cn("size-[18px]", !iconTone && (tone === "danger" ? "text-danger" : "text-muted-foreground"))}
                  style={iconTone ? { color: toneVar[iconTone] } : undefined}
                />
              )}
            </span>
          )}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-body-lg", tone === "danger" && "text-danger")}>{children}</span>
        {sub && <span className="mt-0.5 block truncate text-caption text-muted-foreground">{sub}</span>}
      </span>
      {trailing ?? (
        <>
          {value !== undefined && (
            <span className="shrink-0 text-right">
              <span className="numeral block text-body-lg">{value}</span>
              {valueSub && <span className="mt-0.5 block text-caption text-muted-foreground">{valueSub}</span>}
            </span>
          )}
          {showChevron && <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
        </>
      )}
    </>
  );

  const cls = cn(
    "relative flex w-full items-center gap-3 px-4 text-left",
    twoLine ? "min-h-16" : "min-h-14",
    leading ? "min-h-[72px]" : "",
    navigates && !disabled && "transition-colors hover:bg-surface-2 active:bg-surface-2",
    disabled && "opacity-40",
    // The hairline is inset to the text origin, and drawn on the row rather than
    // between rows so the last one can drop it without the group knowing.
    divider && "after:absolute after:bottom-0 after:right-0 after:h-px after:bg-border after:content-['']",
    divider && (Icon || leading ? "after:left-16" : "after:left-4"),
    "last:after:hidden",
    className,
  );

  if (href) {
    return <motion.a ref={ref as never} variants={rowIn} href={href} className={cls} {...pressProps}>{body}</motion.a>;
  }
  if (onClick) {
    return (
      <motion.button ref={ref as never} variants={rowIn} type="button" onClick={onClick} disabled={disabled} className={cls} {...pressProps}>
        {body}
      </motion.button>
    );
  }
  return <motion.div ref={ref as never} variants={rowIn} className={cls}>{body}</motion.div>;
});

/**
 * A square-ish card for a 2-up or 3-up grid — the profile screen's "Your plan" /
 * "Invite friends" pattern.
 *
 * Deliberately not a Row: a tile is browsed, a row is scanned. Using tiles for
 * a list is how a screen ends up with no scannable left edge (§9).
 */
export function Tile({
  icon: Icon,
  label,
  value,
  onClick,
  href,
  className,
}: {
  icon?: LucideIcon;
  label: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}) {
  const cls = cn(
    "flex min-h-[104px] flex-col justify-between rounded-2xl bg-card p-4 text-left transition-colors",
    (onClick || href) && "hover:bg-surface-2",
    className,
  );
  const body = (
    <>
      {Icon && <Icon aria-hidden className="size-5 text-muted-foreground" />}
      <span className="mt-3 block">
        <span className="block truncate text-body-lg">{label}</span>
        {value && <span className="mt-0.5 block truncate text-caption text-muted-foreground">{value}</span>}
      </span>
    </>
  );
  if (href) return <motion.a variants={rowIn} href={href} className={cls} {...pressProps}>{body}</motion.a>;
  if (onClick) return <motion.button variants={rowIn} type="button" onClick={onClick} className={cls} {...pressProps}>{body}</motion.button>;
  return <motion.div variants={rowIn} className={cls}>{body}</motion.div>;
}

/** A 2-up tile grid. Three-up at `md` and above, where there is room for it. */
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.div variants={rowStagger} className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", className)}>{children}</motion.div>;
}

/**
 * The quiet helper line that sits under a group (§7).
 *
 * Centred, `caption`, muted — the "Want to reactivate a terminated card?"
 * slot. Never a paragraph: if it needs two sentences it is a `Callout`.
 */
export function GroupNote({ children, className }: { children: ReactNode; className?: string }) {
  return <motion.p variants={contentIn} className={cn("px-4 pt-3 text-center text-caption text-muted-foreground", className)}>{children}</motion.p>;
}

// ── Wizard chrome ───────────────────────────────────────────────────────────

/**
 * The header for a multi-step flow.
 *
 * Progress is a **track, not a badge**: "Step 2 of 3" tells you where you are,
 * a filling bar tells you how much is left, and people read the bar. Both are
 * present because the sentence is what a screen reader gets.
 *
 * Deliberately not an `Anchor` (§1): in a wizard the anchor is whatever the step
 * is producing — the studio taking shape, the plan being chosen — and the step
 * title is chrome around it. Making the title the anchor is the easy mistake,
 * and it leaves the screen anchored on a piece of navigation.
 */
export function StepHeader({
  steps,
  current,
  eyebrow,
  className,
}: {
  steps: readonly string[];
  /** Zero-based. */
  current: number;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <motion.header variants={contentIn} className={cn("space-y-3 pb-2", className)}>
      <div className="flex items-baseline justify-between gap-3">
        {eyebrow && <p className="text-micro uppercase text-primary">{eyebrow}</p>}
        <p className="text-caption text-muted-foreground">
          Step {current + 1} of {steps.length}
        </p>
      </div>
      <h1 className="text-title-1">{steps[current]}</h1>
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={current + 1}
        aria-label={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
      >
        {steps.map((s, i) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors duration-300", i <= current ? "bg-primary" : "bg-surface-2")} />
        ))}
      </div>
    </motion.header>
  );
}

/**
 * The action bar at the bottom of a flow — one primary, one quiet way back.
 *
 * Sticky, because a wizard step can be taller than the viewport and a Continue
 * button you have to scroll to find is the most common reason people abandon
 * one. The blur is what keeps it legible over content passing beneath it.
 */
export function StepActions({ back, children, escape, className }: {
  back?: ReactNode;
  children: ReactNode;
  /**
   * The quiet way PAST this step — "Skip for now", "I'll do this later".
   *
   * Its own line under the primary, never beside it, and that placement is the
   * whole point of the slot existing. Putting it in `children` alongside the
   * button turns the row into a stack and the back arrow ends up floating
   * against the primary's left edge; putting it IN the row makes a dismissal
   * look like an equal alternative to finishing.
   *
   * A flow that gates something a person needs should have one. It is not a
   * convenience — if the step cannot be completed for any reason, the person is
   * not inconvenienced, they are stuck outside the product.
   */
  escape?: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={contentIn}
      className={cn(
        "sticky bottom-0 z-10 -mx-4 mt-6 border-t border-border/60 bg-background/85 px-4 pt-3 backdrop-blur-xl md:-mx-6 md:px-6",
        className,
      )}
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-center gap-3">
        {back}
        <div className="flex-1">{children}</div>
      </div>
      {escape && <div className="mt-2 flex justify-center">{escape}</div>}
    </motion.div>
  );
}

/**
 * One step's content, keyed so it remounts and re-runs its entrance.
 *
 * ── Why this exists rather than a `motion.div` in the screen ─────────────────
 *
 * Variant propagation flows down through motion components by LABEL. The moment
 * an intermediate component sets `animate` to an OBJECT instead of a label, the
 * chain stops: descendants still inherit `initial="hidden"` from the `Screen`,
 * but nothing ever hands them `"show"`, so they mount invisible and stay that
 * way. The wrapper animates beautifully and its contents never appear.
 *
 * That is not a hypothetical — it silently hid the anchor on a wizard step while
 * the rest of the step rendered, which is far worse than a whole blank screen
 * because it looks deliberate. The fix is that the wrapper must animate with
 * LABELS too, so the chain continues through it.
 *
 * Also deliberately not wrapped in `AnimatePresence`: `mode="wait"` holds the
 * incoming step until the outgoing one reports finished, and any descendant with
 * its own presence animation that never resolves leaves the flow on a blank
 * screen with a working button bar. A step does not need a cross-fade.
 */
export function StepPanel({ step, children, className }: { step: string | number; children: ReactNode; className?: string }) {
  return (
    <motion.div
      key={step}
      initial="hidden"
      animate="show"
      variants={stepPanelVariants}
      className={cn("flex-1 pb-6 pt-2", className)}
    >
      {children}
    </motion.div>
  );
}
