/**
 * WHERE SIBLINGS SIT — a column, a row, a grid, a split.
 *
 * ⚠️ THESE ARE THE FILES ALLOWED TO WRITE A GAP, AND THAT IS THE WHOLE JOB.
 * `states.test.mjs`'s `frames:` fails on any other file writing `flex … gap-N`,
 * so a screen that wants a column asks for one rather than inventing a rhythm.
 * Every one of them takes a `Space` from the scale; none takes a number.
 *
 * ⚠️ SPACING IS A `gap` ON THE PARENT, NEVER A MARGIN ON A CHILD. Margins
 * collapse, they double when two spaced things meet, and the last child leaves a
 * gap at the bottom of its container that nobody asked for.
 */

import * as React from "react";
import { BAND_PAD, SPACE } from "../tokens/metrics.js";
import type { Space } from "../tokens/metrics.js";
import { WIDTH } from "../tokens/metrics.js";
import type { Width } from "../tokens/metrics.js";

/* ⚠️ THE MEASUREMENTS A SCREEN LEGITIMATELY NEEDS, RE-EXPORTED BESIDE THE
   COMPONENTS THAT SPEND THEM, so nothing reaches into `metrics.ts` past the
   vocabulary. They were one block in `frame/layout.tsx`; splitting that file put
   each one where the thing that uses it lives. */
export { SPACE, WIDTH };
export type { Space, Width };

/* ------------------------------------------------------------------ stack --- */

/**
 * ⚠️ SPACING IS A `gap` ON THE PARENT, NEVER A MARGIN ON A CHILD. Margins
 * collapse, they double when two spaced things meet, and the last child leaves a
 * gap at the bottom of its container that nobody asked for. A gap does none of
 * those, and it is why every layout here is flex or grid.
 */
export function Stack(
  { space = "snug", children }: { readonly space?: Space; readonly children?: React.ReactNode },
) {
  return <div className={`flex flex-col ${SPACE[space]}`}>{children}</div>;
}

/** ⚠️ Wraps by default. A row that cannot wrap is a row that overflows a phone. */
export function Row(
  { space = "snug", children }: { readonly space?: Space; readonly children?: React.ReactNode },
) {
  return <div className={`flex flex-wrap items-center ${SPACE[space]}`}>{children}</div>;
}

/**
 * ⚠️ `auto-fit` WITH A MINIMUM, NOT A COLUMN COUNT. A grid declared as "three
 * columns" needs a breakpoint for every size it does not fit; this one has none
 * and cannot be wrong on a device nobody tested.
 */
export function Grid(
  { min = "16rem", space = "snug", children }: {
    readonly min?: string; readonly space?: Space; readonly children?: React.ReactNode;
  },
) {
  return (
    <div
      className={`grid ${SPACE[space]}`}
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(${min}, 100%), 1fr))` }}
    >
      {children}
    </div>
  );
}

/**
 * TWO COLUMNS THAT BECOME ONE, AND THE ORDER IS THE DESIGN.
 *
 * ⚠️ AN ASIDE THAT WRAPS BELOW IS NOT A DECISION ANYBODY MAKES DELIBERATELY. A
 * `flex-wrap` two-up drops its second column when it runs out of room, at a
 * width that depends on the content, so the same screen is two columns on one
 * phone and one on another. Naming the breakpoint once means every split page
 * in every app turns at the same place.
 *
 * ⚠️ AND THE ASIDE COMES SECOND IN THE DOM WHATEVER SIDE IT IS DRAWN ON. On one
 * column it stacks under the main content, which is the reading order somebody
 * with a screen reader gets — putting a filter panel before the results because
 * it is drawn on the left is how a page becomes unusable without being wrong.
 */
export function Columns({ aside, side = "end", space = "roomy", children }: {
  readonly aside: React.ReactNode;
  /** Which side it is DRAWN on. The reading order does not change. */
  readonly side?: "start" | "end";
  readonly space?: Space;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={`flex flex-col md:flex-row ${SPACE[space]}`}>
      <div className="min-w-0 grow">{children}</div>
      <aside className={`w-full shrink-0 md:w-72 ${side === "start" ? "md:order-first" : ""}`}>
        {aside}
      </aside>
    </div>
  );
}

/**
 * A ROW THAT SCROLLS SIDEWAYS AND SNAPS — the carousel, and it is a layout
 * rather than a component because what goes in it is anything.
 *
 * ⚠️ A HORIZONTAL LIST WITHOUT SNAP IS A LIST THAT STOPS HALFWAY THROUGH A CARD,
 * every time, and nothing tells a person whether that is the edge of the content
 * or the edge of the screen. Snap is what makes the gesture land somewhere.
 *
 * ⚠️ IT BLEEDS PAST THE GUTTER AND PADS ITSELF BACK. A rail inset to the reading
 * column has a hard stop at both edges, which reads as a cropped screenshot; one
 * that reaches the edge and carries its own padding shows the next card peeking,
 * which is the only affordance saying there is more.
 *
 * ⚠️ AND THE SCROLLBAR IS THE LIBRARY'S `scrollbar-none`, not a hand-rolled
 * `::-webkit-scrollbar` — HeroUI ships the utility and it covers Firefox too.
 */
export function Rail({ space = "snug", children }: {
  readonly space?: Space;
  readonly children: React.ReactNode;
}) {
  return (
    <div className={`-mx-4 flex snap-x snap-mandatory overflow-x-auto scrollbar-none px-4 md:-mx-6 md:px-6 ${SPACE[space]}`}>
      {React.Children.map(children, (child) => (
        <div className="w-[85%] shrink-0 snap-start sm:w-72">{child}</div>
      ))}
    </div>
  );
}

/**
 * ⚠️ A WRAPPING ROW OF SMALL THINGS, WHICH IS NOT THE SAME AS `Row`. `Row` puts
 * a few peers on one line and expects them to fit; a cluster is filter chips, or
 * tags, or a legend — an unknown number of unequal items that will wrap, and
 * whose gap has to be the same in both directions or the wrapped lines sit
 * closer together than the items in them.
 */
export function Cluster({ space = "tight", children }: {
  readonly space?: Space;
  readonly children?: React.ReactNode;
}) {
  return <div className={`flex flex-wrap items-center ${SPACE[space]}`}>{children}</div>;
}

/**
 * ⚠️ CENTRED IN BOTH DIRECTIONS, FOR THE SCREENS THAT ARE ONE THING. A sign-in,
 * a confirmation, a blocked notice: a column that is vertically centred in what
 * is left of the page. Hand-built, this is where `h-screen` gets used and the
 * last control ends up under a phone's address bar — `min-h-0 grow` on a flex
 * child does it without naming a viewport at all.
 */
export function Center({ space = "roomy", children }: {
  readonly space?: Space;
  readonly children?: React.ReactNode;
}) {
  return (
    <div className={`flex min-h-0 grow flex-col items-center justify-center ${SPACE[space]} ${BAND_PAD}`}>
      {children}
    </div>
  );
}

/**
 * THE WAY OUT, AS A CHIP.
 *
 * ⚠️ EXTRACTED BECAUSE A SURFACE CAN NEED THE CONTROL WITHOUT THE HEADING. The
 * hub's root is an identity block — a face, an address, a list — and a display
 * heading over it would be a second name for a screen the face already names.
 * It still needs the same × in the same place at the same size, and a second
 * copy of it drifts the day one of them gets a new size.

/** Pushes what follows it to the bottom of a flex column. */
export const Spacer = () => <div className="flex-1" />;
