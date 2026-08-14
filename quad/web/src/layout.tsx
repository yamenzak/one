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
import { Button, Card, Separator } from "@heroui/react";
/* ⚠️ `Ambience`, not `theme.ts`'s older four-value `Sky`. The two drifted the
   moment patterns were added, and a `Page` that could not be given `dots` was a
   vocabulary with a piece nothing could reach. */
import type { Ambience } from "./ambience.js";
import { TYPE } from "./type.js";
import {
  BAND_PAD, CROWN, FACE, GUTTER, HERO_PAD, ICON, NAV_SPACE, PAD, ROW, SAFE_BOTTOM, SPACE, WIDTH,
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
  /** ⚠️ A rule under the crown is right on a working screen and wrong on a
      landing one, where it cuts the page in half for no reason. */
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
  { mark, name, under, aside, bleed = "hold", width = "read", ruled = true }: CrownProps,
) {
  return (
    <header className="w-full">
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
      {ruled ? <Separator /> : null}
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
  const dense = useScrolling();

  return (
    <nav
      aria-label="Sections"
      className={`sticky bottom-0 z-10 flex justify-center ${PAD} ${SAFE_BOTTOM}`}
    >
      {/* ⚠️ AN ISLAND NEEDS ITS OWN GROUND, AND IT DID NOT HAVE ONE. Four ghost
          buttons over a transparent box are four buttons with the page showing
          BETWEEN them — the specimen rendered "Booking" from the card underneath
          straight through the nav's own "Booking" label, which reads as a
          rendering fault rather than as a layout choice. `Card` is the library's
          answer to "a raised surface with a ground and a radius", so this stays
          themed rather than painted. */}
      {/* ⚠️ THE TRANSITION IS AN ATTRIBUTE, NOT A `style`. An inline style beats
          every token, so a component carrying one stops answering to branding —
          the restyle guard refuses it, correctly, and the stylesheet is where
          this rule belongs anyway. */}
      {/* ⚠️ `flex-row` EXPLICITLY. `Card` stacks its children by default — as
          `Switch` does — so `flex items-center` alone left four destinations in a
          vertical column down the middle of the screen. A library component's
          own direction is not the one you assume. */}
      <Card variant="tertiary" data-island="true" className="flex flex-row items-center gap-1">
        {items.slice(0, PRIMARY_MAX).map((item) => {
          const at = item.route === here;
          return (
            <Button
              key={item.id}
              /* ⚠️ THE ACTIVE ONE IS A FILLED PILL, not a coloured icon. Colour
                 alone fails for the eight percent of men who cannot reliably
                 tell two of ours apart; a shape does not. */
              variant={at ? "secondary" : "ghost"}
              aria-current={at ? "page" : undefined}
              className="flex-col gap-1"
              onPress={() => onGo(item.route)}
            >
              <span aria-hidden="true" className="relative flex items-center">
                {item.icon}
                {item.unread
                  ? <span aria-hidden="true" className="absolute -top-1 -right-2"><Dot /></span>
                  : null}
              </span>
              <span className={dense ? "sr-only" : TYPE.note}>{item.label}</span>
            </Button>
          );
        })}
      </Card>
    </nav>
  );
}

/**
 * ⚠️ "IS SOMEBODY SCROLLING RIGHT NOW", not "how far down are they". A threshold
 * on scroll position makes the nav collapse at an arbitrary place and stay
 * collapsed while somebody reads, which is exactly backwards.
 *
 * ⚠️ AND IT STANDS DOWN ENTIRELY FOR REDUCED MOTION. A control that changes size
 * under the thumb is motion, whatever it is called.
 */
function useScrolling(quietMs = 220): boolean {
  const [moving, setMoving] = React.useState(false);

  React.useEffect(() => {
    if (typeof matchMedia === "function"
      && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      setMoving(true);
      clearTimeout(timer);
      timer = setTimeout(() => setMoving(false), quietMs);
    };
    addEventListener("scroll", onScroll, { passive: true });
    return () => { removeEventListener("scroll", onScroll); clearTimeout(timer); };
  }, [quietMs]);

  return moving;
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
  readonly face: React.ReactNode;
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
  { face, onOpenAccount, onSearch, searchLabel = "Search", actions = [], unread }: AppCrownProps,
) {
  return (
    <header className="w-full">
      <Band bleed="edge" width="work">
        <div className={`flex items-center ${SPACE.snug} ${CROWN}`}>
          <Button variant="ghost" aria-label="Your account" onPress={onOpenAccount}>
            {/* ⚠️ A REAL 40px FACE — see `FACE`. A 24px glyph in a 64px bar is
                what made every crown look top-light and unfinished. */}
            <span
              className={`relative flex ${FACE} items-center justify-center`}
              /* ⚠️ THE FACE SETS ITS OWN GLYPH SIZE, because `.button` sizes every
                 svg inside it to `size-5 sm:size-4` — so the 40px slot held a
                 16px mark and the crown still read as top-light after the slot
                 was fixed. */
              style={{ ["--icon" as string]: `${ICON.face}px` }}
            >
              {face}
              {unread
                ? <span aria-hidden="true" className="absolute -top-1 -right-1"><Dot /></span>
                : null}
            </span>
          </Button>

          {/* ⚠️ SEARCH IS A BUTTON HERE, NOT A FIELD. A live input in the crown
              is a keyboard on every screen the moment a thumb brushes it; the
              real search is a surface of its own. */}
          <Button variant="secondary" className="grow justify-start" onPress={onSearch}>
            {searchLabel}
          </Button>

          {actions.map((a) => (
            <Button key={a.id} variant="secondary" aria-label={a.label} onPress={a.onDo}>
              {a.icon}
            </Button>
          ))}
        </div>
      </Band>
    </header>
  );
}
