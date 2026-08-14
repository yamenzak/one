/**
 * THE PIECES A SCREEN IS ASSEMBLED FROM, SO ASSEMBLING ONE IS A DECISION RATHER
 * THAN A LAYOUT.
 *
 * ⚠️ THE POINT IS THAT A SCREEN CONTAINS NO MEASUREMENTS. Every `max-w`, every
 * gap, every gutter and every decision about what bleeds to the edge lives here
 * — because thirty screens each picking a defensible width is a product with no
 * width at all, and nobody can point at the file that is wrong.
 *
 * ⚠️ NOTHING HERE DRAWS A CONTROL. These are frames: they place HeroUI's
 * components and our own type roles, and they set no colour, no radius and no
 * border of their own. The moment one of them does, it is a screen a workspace's
 * branding does not reach (D7).
 *
 * ⚠️ AND THE AMBIENCE IS AN ATTRIBUTE, NOT AN INLINE STYLE. `data-sky` is read
 * by one stylesheet rule built from theme tokens, so a workspace's accent
 * reaches the background of every screen without any screen knowing branding
 * exists. An inline style would beat every token and freeze one page on ours.
 */

import * as React from "react";
import type { Tone } from "@quad/kernel";
import { PRIMARY_MAX } from "@quad/kernel";
import { Avatar, Button, Card, Separator } from "@heroui/react";
/* ⚠️ `Ambience`, not `theme.ts`'s older four-value `Sky`. The two drifted the
   moment patterns were added, and a `Page` that could not be given `dots` was a
   vocabulary with a piece nothing could reach. */
import type { Ambience } from "./ambience.js";
import { TYPE } from "./type.js";
import {
  BAND_PAD, CROWN, CROWN_SIZE, FACE, GUTTER, HEAD_GAP, HERO_PAD, ICON, ISLAND_ITEM, ISLAND_PAD,
  SAFE_TOP, NAV_SPACE, PAD, ROW, SAFE_BOTTOM, SPACE, WIDTH,
  type Space, type Width,
} from "./metrics.js";
import { MOTION } from "./motion.js";

export type { Space, Width };
export { SPACE, WIDTH };

/* ------------------------------------------------------------------ bleed --- */

/**
 * How far a band reaches.
 *
 * ⚠️ THREE, AND THE MIDDLE ONE IS THE INTERESTING ONE. `hold` is a reading
 * column on a painted background — the shape almost every real screen wants and
 * the one people hand-build over and over, usually inconsistently. `edge` is for
 * something that IS the width: a hero, a chart, a table that must not be
 * squeezed. `flush` removes the gutter as well, and is for a band that carries
 * its own padding — a full-width image, a map.
 */
export type Bleed = "hold" | "edge" | "flush";

/** ⚠️ Two widths, not five. A scale nobody can hold in their head is a scale
    people opt out of. `read` is prose and forms; `work` is anything with
    columns in it. */


/* ------------------------------------------------------------------- page --- */

export interface PageProps {
  /** ⚠️ Named, never a colour — see the header. */
  readonly sky?: Ambience;
  readonly tone?: Tone;
  /**
   * ⚠️ THE NAV IS THE PAGE'S, NOT THE CONTENT'S, AND THIS IS WHY. A sticky island
   * floats over whatever precedes it, so the last card on a screen is cropped
   * under it — which is what both specimens did the first time anybody looked.
   * The island cannot fix that itself: by the time it lays out, the content above
   * has already been sized. Handing it to the page is what lets the page reserve
   * the room.
   */
  readonly nav?: React.ReactNode;
  readonly children?: React.ReactNode;
}

/**
 * The frame every screen sits in.
 *
 * ⚠️ `min-h-dvh` RATHER THAN `min-h-screen`. On a phone, `100vh` is the height
 * the viewport would be with the browser chrome hidden — so a page sized to it
 * is a page whose last control sits under the address bar until you scroll,
 * which reads as a broken layout rather than as a unit bug.
 */
export function Page({ sky = "plain", tone = "neutral", nav, children }: PageProps) {
  return (
    <div className="min-h-dvh flex flex-col" data-sky={sky} data-tone={tone}>
      <div className={`flex grow flex-col ${nav ? NAV_SPACE : ""}`}>{children}</div>
      {nav}
    </div>
  );
}

/* ------------------------------------------------------------------- band --- */

export interface BandProps {
  readonly bleed?: Bleed;
  readonly width?: Width;
  /** ⚠️ Its own ambience, so one section can lift while the page stays calm. */
  readonly sky?: Ambience;
  readonly tone?: Tone;
  readonly children?: React.ReactNode;
}

/**
 * A horizontal slice of a page.
 *
 * ⚠️ THE OUTER ELEMENT IS FULL WIDTH AND THE INNER ONE IS THE COLUMN, ALWAYS.
 * That split is what makes a painted background reach the edge while the text
 * stays readable — and doing it per screen is how you get a product where some
 * sections are inset and some are not, for no reason anybody remembers.
 */
export function Band({ bleed = "hold", width = "read", sky, tone, children }: BandProps) {
  const inner = bleed === "flush"
    ? "w-full"
    : bleed === "edge"
      ? `w-full ${GUTTER}`
      : `w-full ${WIDTH[width]} mx-auto ${GUTTER}`;

  return (
    <section
      className="w-full"
      {...(sky ? { "data-sky": sky } : {})}
      {...(tone ? { "data-tone": tone } : {})}
    >
      <div className={inner}>{children}</div>
    </section>
  );
}

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

/* ------------------------------------------------------------------ crown --- */

export interface CrownProps {
  /** What is over the door. A mark, a name, or both. */
  readonly mark?: React.ReactNode;
  readonly name: string;
  /** ⚠️ One line, and only where it says something the name does not. */
  readonly under?: string;
  /** Pushed to the far end: a bell, an avatar, a switcher. */
  readonly aside?: React.ReactNode;
  readonly bleed?: Bleed;
  readonly width?: Width;
  /**
   * ⚠️ GONE, AND KEPT AS A NO-OP SO THE CALLERS THAT PASS IT STILL COMPILE.
   * With borders and shadows banned everywhere else, this hairline became the
   * ONE edge left in the product — which is the inconsistency the ban exists to
   * remove, arriving from the last place anybody would look. A crown separates
   * because it is at the top and because the ground under it is designed; a line
   * under it is the old way of saying so.
   */
  readonly ruled?: boolean;
}

/**
 * THE CHROME ABOVE EVERY SCREEN.
 *
 * ⚠️ THE CROWN IS NOT A DESTINATION (D10). The switcher, the bell and the
 * account sit here precisely because they are about *where you are* rather than
 * *what you are doing* — putting any of them in the five primary destinations
 * spends a scarce slot on something every screen already has.
 */
export function Crown(
  { mark, name, under, aside, bleed = "hold", width = "read" }: CrownProps,
) {
  return (
    <header className={`sticky top-0 z-10 w-full ${SAFE_TOP}`} data-glass="true">
      <Band bleed={bleed} width={width}>
        <div className={`flex items-center ${SPACE.snug} ${CROWN}`}>
          {mark ? <span aria-hidden="true" className="flex items-center">{mark}</span> : null}
          <div className="flex min-w-0 grow flex-col">
            <strong className={TYPE.label}>{name}</strong>
            {under ? <span className={TYPE.note}>{under}</span> : null}
          </div>
          {aside ? <div className={`flex shrink-0 items-center ${SPACE.tight}`}>{aside}</div> : null}
        </div>
      </Band>
    </header>
  );
}

/* ------------------------------------------------------------------ heads --- */

/**
 * ⚠️ ONE `Title` PER SCREEN, AND IT IS AN `h1`. Not decoration: it is what a
 * screen reader announces on arrival and what every "where am I" affordance
 * reads. A screen with three of them has none.
 */
export function Title(
  { children, under }: { readonly children: React.ReactNode; readonly under?: string },
) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className={TYPE.title}>{children}</h1>
      {under ? <p className={TYPE.note}>{under}</p> : null}
    </div>
  );
}

/**
 * A HEADING AND THE THING IT HEADS, WHICH IS ONE BLOCK RATHER THAN TWO.
 *
 * ⚠️ A HEADING BELONGS TO WHAT IS UNDER IT, AND A BARE `SectionTitle` CANNOT
 * KNOW THAT. Dropped into a stack beside its content it is just the previous
 * sibling, so it takes the stack's gap — 24px on a `roomy` one — and a heading
 * floating 24px above its own tiles reads as an orphan, equidistant from the
 * block it names and the block before it. `Group` has always paired a label with
 * its card at `HEAD_GAP`; everything that is not a card had no way to say the
 * same thing, which is why the specimens did it wrong every time.
 */
export function Section(
  { label, under, children }: {
    readonly label: string;
    readonly under?: string;
    readonly children?: React.ReactNode;
  },
) {
  return (
    <section className={`flex flex-col ${HEAD_GAP}`}>
      <div className="flex flex-col gap-1">
        <h2 className={TYPE.section}>{label}</h2>
        {under ? <p className={TYPE.note}>{under}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** ⚠️ For a heading with nothing structurally under it. Prefer `Section`. */
export function SectionTitle({ children }: { readonly children: React.ReactNode }) {
  return <h2 className={TYPE.section}>{children}</h2>;
}

/** ⚠️ Prose gets a width whatever its container is — see `Width.read`. */
export function Prose({ children }: { readonly children: React.ReactNode }) {
  return <p className={`${TYPE.body} max-w-2xl`}>{children}</p>;
}

/**
 * ⚠️ A NUMBER AND WHAT IT IS, TOGETHER. A figure with its label somewhere else
 * on the page is a figure people misread, and `tabular-nums` is what stops a
 * column of them rippling — see `TYPE.figure`.
 */
export function Figure(
  { value, of }: { readonly value: React.ReactNode; readonly of: string },
) {
  return (
    <div className="flex flex-col gap-1">
      <span className={TYPE.figure}>{value}</span>
      <span className={TYPE.note}>{of}</span>
    </div>
  );
}

/** Pushes what follows it to the bottom of a flex column. */
export const Spacer = () => <div className="flex-1" />;

/* ---------------------------------------------------------------- balance --- */

/**
 * THE ONE NUMBER A SCREEN IS ABOUT.
 *
 * ⚠️ EYEBROW, FIGURE, IDENTIFIER — in that order, and the order is the reading.
 * The eyebrow says which of several this is ("Personal · EUR"), the figure is
 * what somebody came for, and the identifier is the thing they would copy or
 * quote. A layout that leads with the identifier makes them hunt for the number.
 *
 * ⚠️ AND IT IS CENTRED, WHICH IS THE ONE PLACE IN THIS SYSTEM THAT IS. Centred
 * text is hard to scan, which is exactly right for a block nobody scans — they
 * look at it. Everything else stays left-aligned.
 */
export function Balance({ eyebrow, figure, identifier, under }: {
  readonly eyebrow?: string;
  readonly figure: React.ReactNode;
  readonly identifier?: React.ReactNode;
  readonly under?: React.ReactNode;
}) {
  return (
    /* ⚠️ TWO GROUPS, NOT ONE RUN. The eyebrow, the figure and the identifier are
       ONE thing and belong tight together; whatever is under them is a separate
       thing and needs air. Spacing them all identically is what made the
       quick-actions read as a fourth line of the caption. */
    <div className={`flex flex-col items-center ${SPACE.roomy} ${HERO_PAD} text-center`}>
      <div className={`flex flex-col items-center ${SPACE.tight}`}>
        {eyebrow ? <span className={TYPE.note}>{eyebrow}</span> : null}
        <div className="flex items-baseline justify-center">{figure}</div>
        {identifier ? (
          <span className={`${TYPE.note} flex items-center ${SPACE.tight}`}>{identifier}</span>
        ) : null}
      </div>
      {under}
    </div>
  );
}

/**
 * THE ACTION A WHOLE SCREEN EXISTS FOR, PINNED WHERE A THUMB IS.
 *
 * ⚠️ A LONG SCREEN WITH ITS ONLY CONTROL AT THE BOTTOM IS A SCREEN PEOPLE DO NOT
 * FINISH. Pinning it means the decision is always one reach away, and the
 * content scrolls behind it rather than under it.
 *
 * ⚠️ `pb-[env(safe-area-inset-bottom)]` IS NOT OPTIONAL. Without it the control
 * sits under the home indicator on every modern phone — reachable, but with the
 * gesture bar over it, which reads as a layout somebody did not test.
 *
 * ⚠️ A SCREEN HAS THIS OR AN `Island`, NEVER BOTH. They pin to the same place and
 * overlap — which the catalogue page demonstrated the first time it rendered
 * them together, with the button sitting across the nav. It is also the right
 * rule for a different reason: a screen with one unmistakable action is not a
 * screen somebody should be navigating away from mid-decision.
 */
export function StickyAction({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className={`sticky bottom-0 z-10 flex w-full justify-center ${PAD} ${SAFE_BOTTOM}`}>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

/**
 * THE FLOATING NAV — five destinations maximum (D10), and it collapses.
 *
 * ⚠️ AN ISLAND RATHER THAN A BAR, and it is not decoration: a bar welded to the
 * bottom edge cuts the page in two, while an island floats over content that
 * visibly continues beneath it, so the page reads as longer than the screen.
 *
 * ⚠️ IT SHEDS ITS LABELS WHILE SOMEBODY IS SCROLLING, and gets them back when
 * they stop. Reading and navigating are different moments: during the first the
 * nav is in the way, during the second it is the point. Shrinking rather than
 * hiding is what keeps it from feeling like the product took something away.
 *
 * ⚠️ AND THE LABEL GOES TO `sr-only`, NEVER TO `hidden`. A collapsed nav that
 * removed its labels from the accessibility tree would be four unnamed buttons
 * to anybody using a screen reader — the one group for whom the icon carries
 * nothing at all.
 *
 * ⚠️ THE KERNEL REFUSES A SIXTH ITEM, and this slices too: a deployment
 * rendering a manifest it did not compose must not draw one either.
 */
export function Island({ items, here, onGo }: {
  readonly items: readonly {
    readonly id: string; readonly label: string;
    readonly icon: React.ReactNode; readonly route: string;
    /** ⚠️ A dot, never a count. At this size a number is unreadable, and what
        the nav owes is "something happened here", not how much. */
    readonly unread?: boolean;
  }[];
  readonly here: string;
  readonly onGo: (route: string) => void;
}) {
  const folded = useScrollingDown();
  const shown = items.slice(0, PRIMARY_MAX);
  const at = shown.findIndex((i) => i.route === here);

  return (
    <nav
      aria-label="Sections"
      /* ⚠️ THE ISLAND SPANS THE COLUMN, IT DOES NOT SHRINK TO ITS WORDS. At
         `w-fit` it came out 76% of the screen against a reference at 89%, with
         a card visible either side of it — which reads as a bar that did not
         finish loading rather than as a thing floating over the page. */
      className={`sticky bottom-0 z-10 flex justify-center ${GUTTER} ${PAD} ${SAFE_BOTTOM}`}
    >
      {/* ⚠️ GLASS, AND THE COST IS ACCEPTABLE HERE FOR A REASON THAT IS ABOUT
          THIS ELEMENT RATHER THAN ABOUT THE TECHNIQUE. `backdrop-filter` reads
          back everything behind the element and blurs it, per frame — ruinous
          across a scrolling list of cards, unremarkable for ONE fixed bar and
          four crown chips. The rule is not "no blur"; it is "blur what does not
          scroll".

          ⚠️ AN EARLIER NOTE HERE CLAIMED THE BLUR COULD NOT WORK THROUGH
          `[data-sky]`'s `isolation: isolate`. That was wrong — measured, the
          backdrop samples through it fine. What was wrong was the fill. */}
      <Card
        variant="transparent"
        data-island="true"
        data-glass="true"
        className={`w-full ${WIDTH.read} flex-row items-center ${ISLAND_PAD}`}
      >
        {/*
          ⚠️ A TRACK INSIDE THE BAR'S PADDING, AND IT IS NOT A WRAPPER FOR ITS
          OWN SAKE. The pill is absolutely positioned, and a percentage width on
          an absolute box resolves against its containing block's PADDING box —
          so with the pill parented to the bar, insetting the bar moved its edge
          and not the pill's. A track is the box the pill's percentages are
          honestly about, and the bar's four pixels then surround it.

          ⚠️ AND `gap-0` IS LOAD-BEARING. `.card` ships `gap-3`, which nothing
          here had overridden — so four items shared the width MINUS 36px of
          gaps while the pill stepped by a clean quarter of the whole. The two
          agree at the first destination and drift right by four pixels at every
          one after it, which is exactly what it looked like. Arithmetic that
          assumes a partition has to be given a partition.
        */}
        <div className="relative flex w-full flex-row items-center gap-0">
        {/*
          ⚠️ ONE PILL THAT TRAVELS, NOT FOUR BACKGROUNDS SWITCHING ON AND OFF.
          A per-item fill can only appear and disappear; a single element can
          MOVE, and moving is what tells somebody the two destinations are on
          one shelf rather than two unrelated screens. It is also why the items
          had to be equal width first — with equal columns the pill's place is
          arithmetic (`index × 100%` of one column) and needs no measuring, no
          ref, and no resize observer that can be one frame behind.
        */}
        {at >= 0 ? (
          <span
            aria-hidden="true"
            data-pill="true"
            className="absolute inset-y-0 left-0"
            style={{
              width: `${100 / shown.length}%`,
              transform: `translateX(${at * 100}%)`,
              transition: MOTION.travel,
            }}
          />
        ) : null}

        {shown.map((item) => {
          const isHere = item.route === here;
          return (
            <Button
              key={item.id}
              /* ⚠️ ALWAYS `ghost`. The filled state is the pill behind it now,
                 so a variant that paints its own would be a second marker
                 appearing where the first one is trying to arrive. */
              variant="ghost"
              aria-current={isHere ? "page" : undefined}
              /* ⚠️ `relative` PUTS THE ITEM ABOVE THE PILL. A positioned element
                 paints over a static one whatever the DOM order, so without it
                 the sliding pill covers the four labels it is meant to sit
                 under. */
              className={`relative grow basis-0 flex-col justify-center gap-1 ${ROW.free} ${ISLAND_ITEM}`}
              onPress={() => onGo(item.route)}
            >
              <span
                aria-hidden="true"
                className="relative flex items-center"
                /* ⚠️ `.button` SIZES ITS OWN SVGS to `size-5 sm:size-4`, so every
                   nav glyph drew at 16–20px under a 14px label — the one place
                   in the product where the word outweighed the mark. */
                style={{ ["--icon" as string]: `${ICON.nav}px` }}
              >
                {item.icon}
                {item.unread
                  ? <span aria-hidden="true" className="absolute -top-1 -right-2"><Dot /></span>
                  : null}
              </span>
              {/*
                ⚠️ THE LABEL FOLDS, IT IS NOT REMOVED. `sr-only` is a switch: the
                bar jumps from one height to another and the content under it
                jumps with it. Animating the label's own box means the BAR's
                height is the animation, which is the whole effect asked for.

                ⚠️ AND IT STAYS IN THE ACCESSIBILITY TREE while folded, which
                `sr-only` also managed and `display: none` would not. A collapsed
                nav that dropped its labels would be four unnamed buttons to
                anybody using a screen reader — the one group for whom the icon
                carries nothing at all.
              */}
              <span
                className="flex overflow-hidden"
                style={{
                  maxHeight: folded ? 0 : "1rem",
                  opacity: folded ? 0 : 1,
                  transform: folded ? "translateY(-0.25rem)" : "none",
                  transition: MOTION.reveal,
                }}
              >
                <span
                  data-here={isHere ? "true" : undefined}
                  className={`${TYPE.note} leading-none`}
                >
                  {item.label}
                </span>
              </span>
            </Button>
          );
        })}
        </div>
      </Card>
    </nav>
  );
}

/**
 * ⚠️ WHICH WAY SOMEBODY IS GOING, NOT WHETHER THEY ARE MOVING. The first version
 * of this collapsed the nav while ANY scrolling was happening and restored it
 * when it stopped — so the labels flickered back on every pause, and reading
 * halfway down a page meant watching the bar breathe. Direction is the signal
 * people actually give: going DOWN is reading, and the nav is in the way; coming
 * back UP is looking for it.
 *
 * ⚠️ AND IT UNFOLDS AT THE TOP WHATEVER THE DIRECTION. Arriving at the head of a
 * page with the labels still folded from the last scroll is a nav that remembers
 * something the person does not.
 *
 * ⚠️ THE THRESHOLD IS NOT DECORATION. Without it a one-pixel jitter — a rubber
 * band, a focus scroll, a fixed element resizing — flips the direction, and the
 * bar folds and unfolds on its own while nobody touches anything.
 */
function useScrollingDown(threshold = 6, top = 24): boolean {
  const [down, setDown] = React.useState(false);

  React.useEffect(() => {
    if (typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y <= top) { setDown(false); last = y; return; }
      if (Math.abs(y - last) < threshold) return;
      setDown(y > last);
      last = y;
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [threshold, top]);

  return down;
}

/** ⚠️ Its own element so the tone token colours it — see `Tone`. */
const Dot = () => <span className="flex size-2" data-tone="danger" data-dot="true" />;

/* ------------------------------------------------------------- app crown --- */

/**
 * THE CROWN EVERY DESTINATION SHARES, WITH TWO SLOTS THAT ARE THE DESTINATION'S.
 *
 * ⚠️ THE FRAME IS FIXED AND ONLY THE LAST TWO CHANGE. Somebody's face on the
 * left and search in the middle are in the same place on every screen, so
 * neither is ever re-learned; the two trailing slots carry what THIS
 * destination's two most common actions are. A crown that changed wholesale per
 * screen would make the top of the app a thing you read rather than a thing you
 * use — and one that was identical everywhere would put the same two actions in
 * front of somebody four times, three of them wrong.
 *
 * ⚠️ EXACTLY TWO, AND THE TYPE SAYS SO. A third fits on a wide phone and falls
 * off a narrow one, which is a layout that is correct on the device it was built
 * on. A destination with three candidates has to choose, which is the useful
 * conversation.
 */
export interface AppCrownProps {
  /**
   * ⚠️ A PERSON, NOT A NODE. This took `React.ReactNode` and every caller in the
   * tree passed a LINE GLYPH — so the account slot, the one place a product puts
   * somebody's face, rendered an outline of a generic head. An arbitrary node is
   * more generality than the slot has any use for, and it is exactly the freedom
   * that let a placeholder become the design.
   */
  readonly who: { readonly name: string; readonly src?: string };
  readonly onOpenAccount: () => void;
  readonly onSearch: () => void;
  readonly searchLabel?: string;
  /** ⚠️ A tuple, not an array — the ceiling is the type rather than a slice. */
  readonly actions?: readonly [] | readonly [Slot] | readonly [Slot, Slot];
  readonly unread?: boolean;
}

export interface Slot {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly onDo: () => void;
}

export function AppCrown(
  { who, onOpenAccount, onSearch, searchLabel = "Search", actions = [], unread }: AppCrownProps,
) {
  return (
    /*
      ⚠️ PINNED AND GLASS, LIKE THE NAV AND FOR THE SAME REASON. A crown that
      scrolls away takes the account, the search and the screen's two actions
      with it, and every one of them is something somebody reaches for in the
      middle of reading. Content passing UNDER a plate is also what tells them
      the page continues above — a crown that simply leaves says nothing.

      ⚠️ AND IT IS THE OTHER HALF OF "BLUR WHAT DOES NOT SCROLL". Two fixed
      plates per screen is the whole budget; it buys the two pieces of chrome
      that are always there.
    */
    <header
      className={`sticky top-0 z-10 w-full ${SAFE_TOP}`}
      data-glass="true"
    >
      <Band bleed="edge" width="work">
        <div className={`flex items-center ${SPACE.snug} ${CROWN}`}>
          {/* ⚠️ `isIconOnly`, AND IT IS THE WHOLE REASON THIS ROW READS AS A ROW.
              Without it every control here is `w-fit px-4` — a 20px glyph in a
              52×44 lozenge — so a crown built from an avatar, a field and two
              actions came out as four different shapes at three different
              widths. The library ships the modifier; we were not asking for it,
              and the result was the single clearest tell that this was a copy of
              a design rather than one. */}
          <Button
            isIconOnly
            size={CROWN_SIZE}
            variant="ghost"
            data-glass="true"
            aria-label="Your account"
            onPress={onOpenAccount}
          >
            <span className="relative flex size-full items-center justify-center">
              {/* ⚠️ THE LIBRARY'S `Avatar`, WHICH ALREADY KNOWS WHAT A MISSING
                  FACE LOOKS LIKE: an initial on the theme's own tint, not an
                  outline of a stranger. */}
              <Avatar className="size-full">
                {who.src ? <Avatar.Image src={who.src} alt="" /> : null}
                <Avatar.Fallback>{who.name.slice(0, 1).toUpperCase()}</Avatar.Fallback>
              </Avatar>
              {unread
                ? <span aria-hidden="true" className="absolute -top-0.5 -right-0.5"><Dot /></span>
                : null}
            </span>
          </Button>

          {/* ⚠️ SEARCH IS A BUTTON HERE, NOT A FIELD. A live input in the crown
              is a keyboard on every screen the moment a thumb brushes it; the
              real search is a surface of its own.

              ⚠️ AND IT CARRIES THE GLASS, WHICH IT DID NOT. A field with no
              affordance in it is a label — every product that puts search in the
              crown draws the lens, because that is what makes a row of words
              read as somewhere to type. Ours said "Search jobs" and looked like
              a heading. */}
          <Button
            size={CROWN_SIZE}
            variant="tertiary"
            data-glass="true"
            className={`grow justify-start ${SPACE.tight}`}
            onPress={onSearch}
          >
            <Lens />
            {/* ⚠️ `text-muted` AND NOT `TYPE.note`, WHICH IS THE SIZE TOO. A
                placeholder is secondary in COLOUR at the control's own size; the
                note role is 14px, so the words inside a 44px field came out a
                step smaller than the field, which is the compressed look this
                whole pass is about. Muted is a token; the size stays the
                button's. */}
            <span className="text-muted">{searchLabel}</span>
          </Button>

          {actions.map((a) => (
            <Button
              key={a.id}
              isIconOnly
              size={CROWN_SIZE}
              variant="tertiary"
              data-glass="true"
              aria-label={a.label}
              onPress={a.onDo}
            >
              {a.icon}
            </Button>
          ))}
        </div>
      </Band>
    </header>
  );
}

/**
 * ⚠️ THE ONE GLYPH THE SHARED LAYER DRAWS ITSELF, and it is drawn rather than
 * imported for a reason that is not taste: `@quad/web` takes no icon library as
 * a dependency, because the app choosing one is the app\'s decision and a shared
 * package that picks for it is a shared package every app has to fight. A lens
 * is eleven characters of path data and it is the only mark this layer needs.
 */
const Lens = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);
