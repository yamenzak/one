/**
 * THE `identity` HERO — a record's face, name, standing and actions.
 *
 * §7 closes the hero set at four: `anchor` (the one number, `Anchor`), `title`
 * (a list or settings surface, `PageHeader`), `none` (a task surface), and this
 * one — the screen that is about a PERSON or a THING. Three of the four already
 * existed; `identity` was the gap, and the gap is why "screens have no single
 * largest thing; hero treatments vary" sat on this product's own defect list.
 *
 * Every record screen had been hand-rolling it: an avatar, a name, some status
 * text, a couple of buttons, arranged slightly differently each time. That is
 * the same failure as the eighteen private primitives — a component that exists
 * in every screen and nowhere in the system.
 *
 * ── Why the status is a NODE and not a string ───────────────────────────────
 *
 * A record's standing is rarely one sentence. A client is "Online · playing
 * Lobby wall", a device is a `StatusDot` plus words plus a channel name, a
 * member is a role Badge. Taking `ReactNode` is what stops the next caller
 * hand-rolling the whole hero again because their status did not fit a string.
 *
 * ── Two-pane, and why `back` is optional ────────────────────────────────────
 *
 * On a phone a record is a pushed page and needs a way back. In a `Shape`
 * two-pane at ≥1100 the list is ON SCREEN to its left, so a back button points
 * at something already visible. Pass `back` and it renders below `lg` only —
 * the caller does not branch, and the same tree serves both (§11.4 rule 3).
 */

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "./lib/icons.js";
import { anchorIn } from "./lib/animation.js";
import { cn } from "./lib/utils.js";

export interface HeroProps {
  /** The face: an `Avatar`, a thumbnail, an `IconBadge`. */
  leading?: ReactNode;
  /** The record's name. The screen's T1. */
  children: ReactNode;
  /** Its standing right now — a dot and words, a badge, a live line. */
  status?: ReactNode;
  /** This record's actions. Not the page's — those are the shell's. */
  actions?: ReactNode;
  /**
   * Rendered BELOW `lg` only: in a two-pane the list it would return to is
   * already beside it.
   */
  back?: { label?: string; onClick: () => void };
  /** Sections, tags, a segmented control — anything that belongs to the record. */
  footer?: ReactNode;
  className?: string;
}

export function Hero({ leading, children, status, actions, back, footer, className }: HeroProps) {
  return (
    <motion.header variants={anchorIn} className={cn("mb-6", className)}>
      {back && (
        <button
          onClick={back.onClick}
          className="mb-3 inline-flex items-center gap-1.5 rounded-sm text-caption font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 lg:hidden"
        >
          <ArrowLeft className="size-4" /> {back.label ?? "Back"}
        </button>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          {leading && <span className="shrink-0">{leading}</span>}
          <div className="min-w-0">
            <h1 className="truncate text-title-2">{children}</h1>
            {status ? <div className="mt-1 flex items-center gap-1.5 text-caption text-muted-foreground">{status}</div> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {footer ? <div className="mt-4">{footer}</div> : null}
    </motion.header>
  );
}

/**
 * The skeleton, exported beside the component as §7 requires — same avatar
 * size, same two lines, same margin, so arrival is a fill rather than a jump.
 */
Hero.Skeleton = function HeroSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("mb-6 flex items-center gap-3", className)}>
      <div className="size-11 shrink-0 animate-pulse rounded-full bg-surface-2" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-5 w-48 max-w-[60%] animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-32 max-w-[40%] animate-pulse rounded bg-surface-2" />
      </div>
    </div>
  );
};
