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
import { Button } from "@heroui/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Hint } from "./beside.js";
import {
  BAND_PAD, BLEED_PULL, GUTTER, SCROLL_GUTTER, SPACE,
} from "../tokens/metrics.js";
import type { Space } from "../tokens/metrics.js";
import { BOX, ROOM, WIDTH } from "../tokens/metrics.js";
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
  { space = "snug", blocks, children }: {
    readonly space?: Space;
    /**
     * ⚠️ A SCREEN'S TOP-LEVEL BLOCKS, WHICH ARRIVE IN ORDER. Only `Screen` passes
     * it: the stagger is positional CSS (`BLOCK_MOTION`), so what it counts is
     * DOM siblings rather than React children — which is the whole reason a
     * screen's rhythm survives being composed out of components. See `Arriving`.
     */
    readonly blocks?: boolean;
    readonly children?: React.ReactNode;
  },
) {
  return (
    <div className={`flex flex-col ${SPACE[space]}`} {...(blocks ? { "data-blocks": "true" } : {})}>
      {children}
    </div>
  );
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
    /* ⚠️ ITS OWN BOX, NOT THE SCREEN'S — see `BOX`. Two columns are right where
       there is room for two columns, and a `Columns` nested inside a narrow
       region on a wide monitor has none. */
    <div className={`${BOX} flex ${ROOM.beside} ${SPACE[space]}`}>
      <div className="min-w-0 grow">{children}</div>
      <aside className={`${ROOM.side} ${side === "start" ? ROOM.first : ""}`}>
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
/**
 * ⚠️ HOW WIDE ONE ITEM IS, NAMED RATHER THAN PASSED AS A CLASS. Two screens in
 * this repository re-implemented this whole component to get a narrower card —
 * bleed, snap, gutter and gap copied out by hand — and both wrote `-mx-4 … px-4`,
 * which is right on a phone and eight pixels short from `md` up, where the page
 * gutter is 24. A rail with one fixed width is a rail people rebuild.
 *
 * ⚠️ AND IT IS A CLOSED SET, because the point of the component is that the sizes
 * agree across the product. A free class here would make it a `div` with extra
 * steps, which is what it already lost to twice.
 */
const WIDE = {
  /** A card meant to be read — the next one peeks. */
  card: "w-[85%] sm:w-72",
  /** A panel of fields or a barcode: enough for a line of text. */
  panel: "w-60",
  /** A photograph or a swatch — several visible at once. */
  tile: "w-28",
} as const;

export type Wide = keyof typeof WIDE;

/**
 * ⚠️ A RAIL IS A CAROUSEL ON A PHONE AND WAS NOTHING ON A DESK. Swiping is the
 * whole interaction, and a desk has no swipe: a trackpad user can scroll a rail
 * sideways and a mouse user cannot reach the second card at all. Nothing
 * reported it, because the rail is correct — it is the input that is missing.
 *
 * ⚠️ SO THE STEPPERS ARE `md:` AND UP, AND THE DOTS ARE EVERYWHERE. On a phone a
 * chevron is a 44px target stealing width from the cards it pages; what a thumb
 * needs is not a button, it is to know there is more and how much — which is
 * what the dots say and the peeking card only hints at.
 *
 * ⚠️ AND THE POSITION IS READ FROM THE SCROLLER, NEVER HELD BESIDE IT. A rail
 * with its own `at` state is a rail whose dots disagree with it the moment
 * somebody swipes, which is every time. `scrollLeft` is the truth; the state
 * here is a cache of it, updated by the event that changes it.
 */
export function Rail({ space = "snug", wide = "card", label, children }: {
  readonly space?: Space;
  readonly wide?: Wide;
  /**
   * ⚠️ WHAT THE RAIL IS, AND WITHOUT IT THERE ARE NO CONTROLS. A stepper named
   * "Next" on a page with three rails is three identical buttons; named "Next
   * pinned note" it is one control somebody can find. Absent is the old
   * behaviour exactly — a bare scroller — which is right where a rail holds
   * three swatches nobody pages through.
   */
  readonly label?: string;
  readonly children: React.ReactNode;
}) {
  const at = React.useRef<HTMLDivElement>(null);
  const [seen, setSeen] = React.useState({ left: 0, width: 1, all: 1 });
  const read = React.useCallback(() => {
    const el = at.current;
    if (el) setSeen({ left: el.scrollLeft, width: el.clientWidth, all: el.scrollWidth });
  }, []);
  /* ⚠️ ONCE ON MOUNT, because the first paint is the one state nothing has
     scrolled — and a rail whose dots appear only after the first swipe is a rail
     that looks broken until somebody uses it. */
  React.useEffect(read, [read]);

  /*
    ⚠️ `ceil`, NOT `round`, AND THE DIFFERENCE IS A RAIL THAT LOOKS BROKEN.
    Rounded, a rail whose content overruns by less than half a viewport reports
    ONE page — so it returns the bare scroller, draws no dots and no steppers,
    and the last card sits clipped at the edge with nothing on the screen saying
    it can be reached. Measured at 1280 with four cards: 1.3 pages, no controls,
    a card cut in half. What is being asked is "is anything off-screen", and one
    pixel off-screen is a yes.

    ⚠️ THE PIXEL OF SLACK IS FOR SUB-PIXEL WIDTHS. `scrollWidth` and
    `clientWidth` are rounded independently, so a rail that fits exactly can
    report one more than it has — and a second dot under a rail with nothing to
    scroll to is the opposite mistake.
  */
  const pages = Math.max(1, Math.ceil((seen.all - 1) / Math.max(1, seen.width)));
  const page = Math.min(pages - 1, Math.round(seen.left / Math.max(1, seen.width)));
  const step = (by: number) => {
    at.current?.scrollBy({ left: by * seen.width, behavior: "smooth" });
  };

  const scroller = (
    <div
      ref={at}
      onScroll={read}
      className={`${BLEED_PULL} flex snap-x snap-mandatory overflow-x-auto scrollbar-none
        ${GUTTER} ${SCROLL_GUTTER} ${SPACE[space]}`}
    >
      {React.Children.map(children, (child) => (
        <div className={`${WIDE[wide]} shrink-0 snap-start`}>{child}</div>
      ))}
    </div>
  );

  if (!label || pages < 2) return scroller;

  return (
    <div className={`flex flex-col ${SPACE.tight}`}>
      {scroller}
      {/* ⚠️ UNDER THE RAIL RATHER THAN OVER IT. Controls laid on top of the cards
          cover the picture on the one card somebody is looking at, and on a
          phone they land where a thumb swipes. */}
      <div className={`flex items-center justify-between ${SPACE.tight}`}>
        <span role="img" aria-label={`${label}: ${page + 1} of ${pages}`} className="flex items-center gap-1.5">
          {Array.from({ length: pages }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              data-here={i === page ? "true" : undefined}
              className="block size-1.5 rounded-full bg-current opacity-30 data-[here=true]:opacity-100"
            />
          ))}
        </span>
        <span className="hidden items-center gap-1 md:flex">
          <Hint says={`Previous ${label}`}>
            <Button
              variant="tertiary"
              size="sm"
              isIconOnly
              aria-label={`Previous ${label}`}
              isDisabled={page === 0}
              onPress={() => { step(-1); }}
            >
              <ChevronLeft />
            </Button>
          </Hint>
          <Hint says={`Next ${label}`}>
            <Button
              variant="tertiary"
              size="sm"
              isIconOnly
              aria-label={`Next ${label}`}
              isDisabled={page >= pages - 1}
              onPress={() => { step(1); }}
            >
              <ChevronRight />
            </Button>
          </Hint>
        </span>
      </div>
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
 * OneSpace's root is an identity block — a face, an address, a list — and a display
 * heading over it would be a second name for a screen the face already names.
 * It still needs the same × in the same place at the same size, and a second
 * copy of it drifts the day one of them gets a new size.

/** Pushes what follows it to the bottom of a flex column. */
export const Spacer = () => <div className="flex-1" />;
