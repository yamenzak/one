/**
 * THE THREE SHAPES OF §11 — one component, because they are one idea.
 *
 * §11.2 names Focus, Two-pane and Board. They are not three layouts; they are
 * the same layout with zero, one or two side columns, and building three
 * components would be three places for the column widths to drift.
 *
 *     <Shape>                       content                → Focus
 *     <Shape list={…}>              list + content         → Two-pane
 *     <Shape list={…} aside={…}>    list + content + aside → Board
 *     <Shape aside={…}>             content + aside        → Board, no list
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * §11 has described these since it was written and nothing implemented them, so
 * every app rendered Focus at every width. Measured on Kova's coach roster at
 * 1440×900: a 96 rail, a 686 column, and 658px — 46% of the viewport — empty,
 * with ten clients in a phone-width strip down the middle. Opening one REPLACED
 * the list it came from, so working through ten clients meant going back nine
 * times. The list is not decoration; it is the job.
 *
 * ── The phone is the default, and that is load-bearing ──────────────────────
 *
 * Below `lg` this renders `content` alone — `list` and `aside` are simply not
 * mounted. So an app wires a collection destination ONCE and its phone
 * behaviour is byte-identical to what it was: a list route and a record route,
 * each a full page. Nothing about the narrow layout is re-expressed here, which
 * is why adopting it cannot regress it.
 *
 * ── No router, deliberately ─────────────────────────────────────────────────
 *
 * `@4dl/ui` imports no router (README: "a design system that imports one cannot
 * be consumed by an app using another"), so this is CONTROLLED: the app decides
 * what `content` is from its own route and passes it. At `lg` a collection
 * renders `list` beside the record; on a phone the same route renders the
 * record alone. One tree, two arrangements, no duplicated routing.
 */

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "./lib/utils.js";
import { ScrollArea } from "./shell.js";

/**
 * A live media query.
 *
 * `Shape` needs JS rather than `hidden lg:block`, and the reason is not styling:
 * a CSS-hidden pane still MOUNTS. The list would run its effects and issue its
 * fetches on every phone, so adopting a two-pane would silently add a request
 * per screen to the narrow layout it is supposed to leave alone.
 *
 * `useSyncExternalStore` rather than `useState` + an effect, so the first paint
 * is already correct — an effect-based version renders the phone layout for one
 * frame on a desktop, which is a visible flash of the wrong shape.
 *
 * SSR/no-`matchMedia` answers `false`: the narrow layout is the one that works
 * everywhere, so it is the safe default to be wrong about.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** The §11.2 widths, as one place. */
export const WIDTH = {
  tablet: "(min-width: 768px)",
  desktop: "(min-width: 1100px)",
  wide: "(min-width: 1400px)",
} as const;

export interface ShapeProps {
  /**
   * The list pane, ≥1100 only. Present ⇒ this destination is a COLLECTION
   * (§11.3) and its list stays on screen beside whatever is open.
   */
  list?: ReactNode;
  /** The column. On a phone this is the whole screen. */
  children: ReactNode;
  /**
   * Secondary cards, ≥1400 only. Never the primary content and never the only
   * home of an action — a viewport that does not reach 1400 must lose nothing.
   */
  aside?: ReactNode;
  /**
   * What the column shows at ≥1100 when nothing is selected. Without it a
   * two-pane opens as a list beside a void, which reads as a failed load.
   */
  placeholder?: ReactNode;
  /** True when `children` is a record rather than the list itself. */
  selected?: boolean;
  className?: string;
}

export function Shape({ list, children, aside, placeholder, selected, className }: ShapeProps) {
  /*
    MOUNTED, not merely visible — see `useMediaQuery`. Below these widths the
    side panes do not exist, so the narrow layout is byte-identical to before.

    Both queries run UNCONDITIONALLY. `list !== undefined && useMediaQuery(…)`
    reads better and is a hooks-order bug: `&&` short-circuits, so the hook is
    skipped whenever `list` is absent, and a component that renders with a list
    on one route and without one on the next changes its hook count between
    renders.
  */
  const atDesktop = useMediaQuery(WIDTH.desktop);
  const atWide = useMediaQuery(WIDTH.wide);
  const twoPane = list !== undefined && atDesktop;
  const board = aside !== undefined && atWide;

  /*
    Each pane scrolls independently (§11.4 rule 2) and carries its own top, so
    the list does not travel when the record does. `min-h-0` is what makes that
    work inside a flex column — without it the pane grows to its content and the
    page scrolls as one, which looks identical until a long record drags a
    forty-row list up with it.
  */
  return (
    <div className={cn("flex w-full items-stretch", className)}>
      {twoPane && (
        <ScrollArea mask className="min-h-0 w-[21.25rem] shrink-0 border-r border-border/40 px-4" aria-label="List">
          {list}
        </ScrollArea>
      )}

      {/*
        `column` when there is no list — the centred single column of Focus.
        In a two-pane the column is already bounded by the panes beside it, so
        centring it again would push it off the axis its own list sits on.
      */}
      <ScrollArea mask className={cn("min-h-0 flex-1 px-4 md:px-6", !twoPane && "column")}>
        {twoPane && !selected ? placeholder : children}
      </ScrollArea>

      {board && (
        <ScrollArea mask className="min-h-0 w-80 shrink-0 border-l border-border/40 px-4" aria-label="More">
          {aside}
        </ScrollArea>
      )}
    </div>
  );
}
