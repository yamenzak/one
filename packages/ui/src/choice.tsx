/**
 * CHOICE — "pick exactly one of these", as a first-class component.
 *
 * Every product has this and every product reinvents it: a plan picker, a
 * delivery option, a unit preference. Each reinvention gets the visuals roughly
 * right and the semantics wrong — a `<div onClick>` with a tick, no radio role,
 * no arrow-key navigation, nothing announced when the selection changes.
 *
 * So it lives here once, with the accessibility built in rather than
 * remembered:
 *
 *  • the group is a real `radiogroup` and each option a real `radio`
 *  • **arrow keys move the selection**, which is what a radio group does and
 *    what a list of clickable divs never does
 *  • roving tabindex, so the group is ONE tab stop rather than N
 *  • the selected state is carried by `aria-checked`, not by colour alone (§4)
 *
 * Visually it is a `Group` of rows (§7) with a selection indicator, not a stack
 * of cards. Cards imply browsing; this is a decision, and a decision should be
 * scannable down a single left edge (§9).
 */

import { createContext, useContext, useId, useRef, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "./lib/utils.js";
import { pressPropsSubtle, rowIn, rowStagger } from "./lib/animation.js";
import { Check } from "./lib/icons.js";

interface ChoiceCtx {
  name: string;
  value: string | null;
  onChange: (v: string) => void;
  register: (el: HTMLButtonElement | null, value: string) => void;
  move: (from: string, delta: number) => void;
}

const Ctx = createContext<ChoiceCtx | null>(null);

export function ChoiceGroup({
  label,
  value,
  onChange,
  children,
  className,
}: {
  /** Announced as the group's name. Required — an unlabelled radiogroup is a
   *  list of unexplained options to anyone not looking at the screen. */
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  const name = useId();
  // Insertion-ordered so arrow keys follow the visual order rather than the
  // order React happened to mount things in.
  const items = useRef<{ el: HTMLButtonElement; value: string }[]>([]);

  const register = (el: HTMLButtonElement | null, v: string) => {
    items.current = items.current.filter((i) => i.value !== v);
    if (el) items.current.push({ el, value: v });
    items.current.sort((a, b) =>
      a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
  };

  const move = (from: string, delta: number) => {
    const list = items.current;
    const i = list.findIndex((x) => x.value === from);
    if (i === -1 || !list.length) return;
    // Wraps, because a radio group wraps.
    const next = list[(i + delta + list.length) % list.length]!;
    onChange(next.value);
    next.el.focus();
  };

  return (
    <Ctx.Provider value={{ name, value, onChange, register, move }}>
      <motion.div
        role="radiogroup"
        aria-label={label}
        variants={rowStagger}
        className={cn("overflow-hidden rounded-2xl bg-card", className)}
      >
        {children}
      </motion.div>
    </Ctx.Provider>
  );
}

export function Choice({
  value,
  label,
  title,
  badge,
  sub,
  meta,
  metaSub,
  tags,
  disabled,
  className,
}: {
  value: string;
  /**
   * The name announced to assistive tech. Supply it whenever the option carries
   * `tags`: the computed name would otherwise be the title PLUS the badge PLUS
   * the price PLUS every tag, so "Light" becomes forty words and comparing two
   * options by ear is impossible. Visual users skim the chips; a screen-reader
   * user needs the decision in one line.
   */
  label?: string;
  title: ReactNode;
  /** A small marker beside the title — "30 days free", "Most popular". */
  badge?: ReactNode;
  sub?: ReactNode;
  /** Right-aligned value. The price, the size, the count. */
  meta?: ReactNode;
  metaSub?: ReactNode;
  /** Supporting detail chips, shown under the row when selected AND when not —
   *  hiding them until selection makes the options impossible to compare. */
  tags?: string[];
  disabled?: boolean;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("<Choice> must be inside a <ChoiceGroup>");
  const on = ctx.value === value;

  return (
    <motion.button
      ref={(el) => ctx.register(el, value)}
      type="button"
      role="radio"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      // Roving tabindex: the group is one tab stop. When nothing is selected the
      // first option is reachable, or the group would be skipped entirely.
      tabIndex={on || (ctx.value === null && !disabled) ? 0 : -1}
      onClick={() => !disabled && ctx.onChange(value)}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); ctx.move(value, 1); }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); ctx.move(value, -1); }
      }}
      variants={rowIn}
      {...pressPropsSubtle}
      className={cn(
        "relative flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors",
        "last:after:hidden after:absolute after:bottom-0 after:left-4 after:right-0 after:h-px after:bg-border after:content-['']",
        on ? "bg-primary/10" : "hover:bg-surface-2",
        disabled && "pointer-events-none opacity-40",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body-lg">{title}</span>
          {badge}
        </span>
        {sub && <span className="mt-0.5 block text-caption text-muted-foreground">{sub}</span>}
        {tags && tags.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-caption text-muted-foreground">{t}</span>
            ))}
          </span>
        )}
      </span>

      {(meta || metaSub) && (
        <span className="shrink-0 pt-0.5 text-right">
          {meta && <span className="numeral block text-body-lg">{meta}</span>}
          {metaSub && <span className="mt-0.5 block text-caption text-muted-foreground">{metaSub}</span>}
        </span>
      )}

      {/* The tick is redundant with the fill and the `aria-checked` state, and
          that redundancy is the point (§4): selection must never be carried by a
          background tint alone. */}
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full transition-colors [&_svg]:size-3.5",
          on ? "bg-primary text-primary-foreground" : "bg-surface-2 text-transparent",
        )}
      >
        <Check />
      </span>
    </motion.button>
  );
}
