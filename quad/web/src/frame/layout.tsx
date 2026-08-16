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
 * by one stylesheet rule built from theme tokens, so a workspace's brand
 * reaches the background of every screen without any screen knowing branding
 * exists. An inline style would beat every token and freeze one page on ours.
 */

import * as React from "react";
import type { Tone } from "@quad/kernel";
import { PRIMARY_MAX } from "@quad/kernel";
import { Button, Card, Separator } from "@heroui/react";
import type { Sky, World } from "../tokens/ambience.js";
import { ON_SCENE, skyWorld, worldCss } from "../tokens/ambience.js";
import { TYPE } from "../tokens/type.js";
import {
  BAND_PAD, CODE_SLOT, CROWN, CROWN_CHIP, CROWN_SIZE, GUTTER, HEAD_GAP, HERO_PAD, ICON,
  ISLAND_HERE,
  ISLAND_ITEM,
  ISLAND_PAD,
  SAFE_TOP, NAV_SPACE, PAD, ROW, SAFE_BOTTOM, SPACE, TITLE_PAD, WIDTH,
  type Space, type Width,
} from "../tokens/metrics.js";
import { MOTION, useStill } from "../tokens/motion.js";
import type { Density } from "../scene/index.js";
import { Face, type FaceOf } from "../parts/face.js";

export type { Space, Width };
/* ⚠️ The metrics a SCREEN legitimately needs, re-exported here so nothing
   reaches into `metrics.ts` past the vocabulary. */
export { CODE_SLOT, CROWN, SPACE, WIDTH };

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
  /**
   * ⚠️ A FAMILY, NEVER A COLOUR AND NO LONGER ONE OF TWENTY-FOUR DRAWN WORLDS.
   * `glow`, `cloth`, `etch`, `loops`, `blobs` — each is every ground in its own
   * space, seeded by `seedling`, so two screens naming the same one are two
   * worlds of one material rather than the same picture twice.
   */
  readonly sky?: Sky;
  /**
   * ⚠️ WHICH ONE OF THE FAMILY, AND IT WANTS THE SCREEN'S OWN IDENTITY. A route
   * is ideal: every screen in a product then has a ground of its own inside the
   * product's material, for free, with nobody choosing anything. Absent, every
   * page naming that family is the same page — a legitimate answer, and why
   * there is a default.
   */
  readonly seedling?: string;
  /**
   * ⚠️ A GROUND BUILT FROM A SUBJECT RATHER THAN CHOSEN FROM THE TABLE, and the
   * ONLY thing that may be handed one. A workspace's face is a planet seen from
   * outside; its own screen is that planet's sky, from the same two colours
   * (`worldCss`). Supplied, it wins over `sky` — a page has one ground.
   *
   * ⚠️ AND IT IS STILL NOT AN INLINE BACKGROUND. What goes on the element is two
   * custom PROPERTIES the `world` rules read, so the fade, the grain, the
   * vignette, the drift and both reduced-motion opt-outs all still apply. An
   * inline `background-image` would beat every token and freeze one page on ours.
   */
  readonly world?: World;
  /**
   * ⚠️ HOW MUCH OF ITSELF THE GROUND SHOWS, AS AN INTENT RATHER THAN A NUMBER. A
   * screen knows how much of it is content; what that means in stars is the
   * engine's. A page of rows takes `quiet`, an arrival takes `rich`.
   */
  readonly density?: Density;
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
export function Page(
  { sky = "plain", seedling, world, density = "even", tone = "neutral", nav, children }: PageProps,
) {
  /*
    ⚠️ THE THEME PICKS A SKY, AND THIS REPLACES A RULE THAT SHOULD NEVER HAVE
    BEEN ONE. For one build a world was a dark room in both themes, because every
    attempt at a pale night sky came out grey and "space is dark, so commit"
    looked like a decision. It was three failed attempts wearing one: the family
    declares a `day` as well as a `night` — different ground, different specks,
    light from above rather than from underfoot — so light mode gets a real
    daytime sky and nobody has to be told to accept a black page.

    ⚠️ READ SYNCHRONOUSLY AND FROM THE DOCUMENT, because a stamp is what the
    theme actually is here (`ThemeProvider` writes `data-theme` on the root) and
    a first render that guessed wrong would swap the sky one frame later.
  */
  const night = useNight();
  /* ⚠️ THE PAGE OWNS IT BECAUSE THE PAGE OWNS THE CROWN'S ROOM — see
     `useHemOnScroll`. Every address goes through here, so one listener covers
     every crown in the product and no crown has to remember. */
  useHemOnScroll();
  /* ⚠️ ONE PATH FOR BOTH. A subject's world and a named sky differ only in where
     the family and the two colours came from — everything after that is the same
     engine, which is what "one engine powers every scene" has to mean. */
  const scene = world ?? (sky === "plain" ? null : skyWorld(sky as Exclude<Sky, "plain">, seedling ?? sky));
  const own = scene ? worldCss(scene, { night, density }) : null;
  return (
    <div
      className="min-h-dvh flex flex-col"
      data-sky={own ? "world" : "plain"}
      data-tone={tone}
      style={own?.css as React.CSSProperties | undefined}
    >
      {/*
        ⚠️ THE FIELD IS AN ELEMENT, AND IT HAS TO BE. It was a `background-image`
        carrying its own `<style>`, which is the better design and does not work:
        Chromium renders an SVG used as a background STATICALLY, so every star in
        the product was frozen from the day the field was written. Measured — the
        same file animates as an `<img>` and as inline SVG, and does not animate
        as a background. See `render`.

        ⚠️ INNER HTML, AND IT IS ENGINE-GENERATED — a `<pattern>` and a `<rect>`
        composed by `render` from a family's own declarations. Nothing a person
        typed reaches this string, and there is no other way to hand a browser a
        subtree of SVG built as text.
      */}
      {own?.field
        ? (
          <svg
            aria-hidden="true"
            data-field="true"
            dangerouslySetInnerHTML={{ __html: own.field }}
          />
        )
        : null}
      <div className={`flex grow flex-col ${nav ? NAV_SPACE : ""}`}>{children}</div>
      {nav}
    </div>
  );
}

/**
 * THE TOP HEM ARRIVES WITH THE FIRST SCROLL, AND THAT IS THE DIFFERENCE BETWEEN
 * A VIGNETTE AND A BAR.
 *
 * ⚠️ THE HEM IS OPAQUE AGAINST THE WORLD, NOT ONLY AGAINST CONTENT. It has to be
 * — four weaker strengths were shot and every one let a card's text read through
 * a crown title — and opaque means the field's marks stop where it starts. On a
 * page nobody has scrolled that is a flat strip of one colour across the top
 * with a pattern under it, which is a bar whatever the softness of its edge.
 *
 * ⚠️ SO THE FIX IS NOT HOW STRONG IT IS, IT IS WHEN IT IS THERE. The hem exists
 * for content passing UNDER the chrome; at scroll zero there is none, so there
 * is nothing to dissolve and the crown sits on the world.
 *
 * ⚠️ IT WRITES A PROPERTY RATHER THAN SETTING STATE, so a scroll costs a style
 * write instead of a React render of every screen in the tree — and it writes
 * only when the answer CHANGES, so resting at the top costs nothing at all.
 *
 * ⚠️ AND THE THRESHOLD IS NOT ZERO. A rubber band, a focus scroll, an image
 * settling — anything that moves the page by a pixel would otherwise flicker the
 * hem on and off under somebody's hands.
 */
function useHemOnScroll(at = 8): void {
  React.useEffect(() => {
    const root = document.documentElement;
    let on: boolean | null = null;
    const read = () => {
      const now = scrollY > at;
      if (now === on) return;
      on = now;
      root.style.setProperty("--hem-top", now ? "1" : "0");
    };
    read();
    addEventListener("scroll", read, { passive: true });
    return () => {
      removeEventListener("scroll", read);
      /* ⚠️ Cleared rather than left at whatever it was, because the property is
         on the ROOT and outlives this page — a screen that unmounted while
         scrolled would hand the next one a hem it never asked for. */
      root.style.removeProperty("--hem-top");
    };
  }, [at]);
}

/**
 * ⚠️ WHICH THEME IS IN FORCE, READ RATHER THAN GUESSED. `ThemeProvider` stamps
 * `data-theme` on the document element and the system preference decides when it
 * has not; a component that assumed either would pick the wrong sky on the first
 * paint and swap it on the second, which reads as a flash rather than as a
 * theme. Both sources, in the order the stylesheet resolves them.
 */
export function useNight(): boolean {
  const read = () => {
    if (typeof document === "undefined") return true;
    const stamped = document.documentElement.getAttribute("data-theme");
    if (stamped) return stamped === "dark";
    return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const [night, setNight] = React.useState(read);
  React.useEffect(() => {
    const on = new MutationObserver(() => setNight(read()));
    on.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => on.disconnect();
  }, []);
  return night;
}

/* ------------------------------------------------------------------- band --- */

export interface BandProps {
  readonly bleed?: Bleed;
  readonly width?: Width;
  /** ⚠️ Its own ground, so one section can lift while the page stays calm. */
  readonly sky?: Sky;
  /** ⚠️ Which one of the family — see `PageProps.seedling`. */
  readonly seedling?: string;
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
export function Band({ bleed = "hold", width = "read", sky, seedling, tone, children }: BandProps) {
  const night = useNight();
  /* ⚠️ THE SAME ENGINE A PAGE USES, because a section that lifts is a scene at a
     smaller reach and not a second mechanism. */
  const own = sky && sky !== "plain"
    ? worldCss(skyWorld(sky as Exclude<Sky, "plain">, seedling ?? sky), { night, density: "even" })
    : null;

  const inner = bleed === "flush"
    ? "w-full"
    : bleed === "edge"
      ? `w-full ${GUTTER}`
      : `w-full ${WIDTH[width]} mx-auto ${GUTTER}`;

  return (
    <section
      className="w-full"
      {...(own ? { "data-sky": "world", "data-reach": "card" } : {})}
      {...(tone ? { "data-tone": tone } : {})}
      style={own?.css as React.CSSProperties | undefined}
    >
      {own?.field
        ? <svg aria-hidden="true" data-field="true" data-reach="card"
            dangerouslySetInnerHTML={{ __html: own.field }} />
        : null}
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
 */
export function LeaveChip({ leave = "back", label, onDo }: {
  readonly leave?: "back" | "dismiss";
  readonly label?: string;
  readonly onDo: () => void;
}) {
  return (
    /* ⚠️ NO CHIP — the hem behind the crown is what holds it now. It carried
       `data-chrome` so it stayed findable over whatever scrolled past; a fill
       on the one control every screen has, purely for contrast, is the shape
       the hem removes everywhere else too. */
    <Button
      isIconOnly
      size={CROWN_SIZE}
      variant="ghost"
      aria-label={label ?? (leave === "dismiss" ? "Close" : "Back")}
      onPress={onDo}
    >
      {leave === "dismiss" ? <X /> : <Back />}
    </Button>
  );
}

/**
 * ⚠️ ONE THRESHOLD, NOT A SCROLL-LINKED FRACTION. Driving the swap off a
 * continuous offset means a state update per frame and a title that is half
 * faded for as long as somebody's finger is still — which reads as a rendering
 * fault rather than as a transition. A boolean crossed once, animated by CSS, is
 * the same effect with none of that.
 *
 * ⚠️ THE HYSTERESIS IS THE POINT. Coming back UP has a lower threshold than
 * going down, so a page resting exactly on the boundary cannot oscillate — which
 * a single value does, visibly, on any list whose last item is near the fold.
 */
function useScrolledPast(down = 56, up = 32): boolean {
  const [past, setPast] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setPast((was) => (was ? scrollY > up : scrollY > down));
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => removeEventListener("scroll", onScroll);
  }, [down, up]);

  return past;
}


/** ⚠️ Drawn here for the same reason `Lens` is — no icon library in this layer. */
const X = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
  </svg>
);

const Back = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M19 12H5" strokeLinecap="round" />
    <path d="m12 19-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);


/* ------------------------------------------------------------------ crown --- */

/**
 * ONE ROW OVER EVERY SCREEN IN THE PRODUCT.
 *
 *     ( lead )( middle                        )( also )( does )
 *
 * ⚠️ THERE WERE FOUR OF THESE AND THEY WERE ONE SHAPE. `Crown` (a mark, a name,
 * an `aside`), `AppCrown` (a face, a search, two actions), `PageCrown`'s row (a
 * back control, a collapsing title, two actions) and — the one nobody could
 * find — a hand-rolled `<header>` inside the Shell. Every one of them was
 * something on the left, something in the middle and controls on the right, at
 * four slightly different heights, with four spacings and four answers to what
 * a secondary action looks like. That is not four components; it is one
 * component written four times, which is why the Shell's copy was the only one
 * that scrolled away and the only one with a rule under it.
 *
 * ⚠️ SO THE SHAPE IS THE SLOTS, AND THERE IS NO `kind` PROP. What a crown IS
 * falls out of what it was handed: a face leads where you are somewhere, a way
 * out leads where you can leave, the middle is a name or a search. A variant
 * enum would be a fifth way to say the same thing and the first place the four
 * would start drifting apart again.
 *
 * ⚠️ THE ROW IS ONE HEIGHT, ALWAYS, AND THAT IS THE POINT OF UNIFYING IT.
 * `CROWN` is the row and `CROWN_SIZE` is every control in it, so a crown with a
 * face, a search and two actions is four things of exactly one size on one
 * baseline. The old set drew a 32px avatar beside a 44px field beside a 36px
 * chip, which is the single clearest tell that a header was assembled rather
 * than designed.
 *
 * ⚠️ AND NOTHING HERE IS A SURFACE EXCEPT `find` AND `does`. The hem behind the
 * crown is the background (`data-hem`), so a control needs a fill only when the
 * fill MEANS something: a field has to look like somewhere to type, and the one
 * act a screen is for has to look like the answer. Everything else is ink.
 */
export interface CrownProps {
  /* ------------------------------------------------------------- the lead --- */
  /**
   * WHOSE SCREEN THIS IS — the account, and it opens the hub.
   *
   * ⚠️ IDENTITY OR A WAY OUT, NEVER BOTH, and the refusal is loud. A crown with
   * a face AND a back arrow has two leading controls of equal weight and no
   * answer to which one leaves — which is a decision the caller has to make,
   * not one this can average.
   */
  readonly who?: {
    readonly name: string;
    readonly face?: FaceOf;
    readonly onOpen?: () => void;
    /** ⚠️ A dot, never a count — see `Island`. */
    readonly unread?: boolean;
  };
  /** ⚠️ Absent means there is nowhere to go, which is a real state — a surface
      opened as the page itself has nothing underneath it. */
  readonly back?: () => void;
  /**
   * ⚠️ THE WAY OUT IS A PROPERTY OF WHERE THIS SCREEN SITS, NOT A CHOICE. The
   * root of a presented surface is DISMISSED and gets an ×; a screen one level
   * inside is left UPWARDS and gets an arrow. Two screens get that right by
   * hand and the third gets it wrong.
   */
  readonly leave?: "back" | "dismiss";
  readonly backLabel?: string;

  /* ----------------------------------------------------------- the middle --- */
  /**
   * WHERE YOU ARE. A name, optionally with a mark and a second line.
   *
   * ⚠️ A NAME OR A `find`, NEVER BOTH. They are the same slot — the widest one,
   * the one somebody's eye lands in — and a header carrying a title AND a search
   * field has neither of them wide enough to be either.
   */
  readonly name?: string;
  /** ⚠️ One line, and only where it says something the name does not. */
  readonly under?: string;
  /** ⚠️ The product's own mark beside its name, at the row's own size. */
  readonly mark?: FaceOf;
  /**
   * ⚠️ THE NAME ARRIVES ON SCROLL RATHER THAN BEING THERE. A page's name is both
   * the biggest thing on it and something you still need four screens down, and
   * one element cannot be both — so the display heading lives in the content and
   * this is the compact copy that replaces it once it has gone. `false` on a
   * destination, where the name is simply where you are.
   */
  readonly collapses?: boolean;
  /**
   * THE WIDE SLOT — what somebody is looking for on this destination.
   *
   * ⚠️ A DECLARATION, NOT A NODE, for the reason `who` is one. Handing the
   * widest, most-seen element in the product arbitrary children is how it
   * becomes whatever the third caller needed that afternoon.
   */
  readonly find?: { readonly label: string; readonly onOpen: () => void };

  /* ------------------------------------------------------------ the trail --- */
  /**
   * ⚠️ QUIET, AND AT MOST TWO. A third fits on a wide phone and falls off a
   * narrow one, which is a layout that is correct on the device it was built on.
   * The ceiling is the TYPE rather than a slice, so a third is a compile error
   * and the conversation about which two matter happens where it should.
   */
  readonly also?: readonly [] | readonly [Slot] | readonly [Slot, Slot];
  /**
   * ⚠️ THE ONE THING THIS SCREEN IS FOR, and the only filled control up here.
   * Icon-only, because it sits in a row of icons; the label is its accessible
   * name rather than text beside the glyph.
   */
  readonly does?: {
    readonly label: string;
    readonly icon?: React.ReactNode;
    readonly onDo: () => void;
    readonly tone?: "danger";
    readonly disabled?: boolean;
    /**
     * ⚠️ WIDE SCREENS ONLY, FOR THE ACT THAT IS DOCKED BELOW `md`. A `Screen`
     * hands the same act to this crown and to a bar above the thumb and shows
     * exactly one of them; without this the phone gets both, six inches apart,
     * saying the same thing. A destination's own act leaves it unset — there is
     * no dock under it to defer to.
     */
    readonly wide?: boolean;
  };

  readonly bleed?: Bleed;
  readonly width?: Width;
  /** ⚠️ Gone, kept as a no-op so callers still compile — see the hem. */
  readonly ruled?: boolean;
}

export interface Slot {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly onDo: () => void;
  /**
   * ⚠️ A DOT, NEVER A COUNT, AND IT GOES ON THE CONTROL IT COUNTS. The inbox
   * used to draw a numbered chip in the crown while the nav drew a dot — two
   * answers to "something happened" in one product, and the numbered one was
   * a differently-shaped control in a row of identical ones. What the chrome
   * owes is that something is waiting, not how much; the number is on the
   * screen the control opens.
   */
  readonly dot?: boolean;
  /** ⚠️ Reserved for a primary that destroys. Rare, and never a default. */
  readonly tone?: "danger";
  readonly disabled?: boolean;
}

export function Crown({
  who, back, leave = "back", backLabel,
  name, under, mark, collapses = false, find,
  also = [], does, bleed = "hold", width = "read",
}: CrownProps) {
  const past = useScrolledPast();
  /* ⚠️ A collapsing name is HIDDEN until it is needed, and it is `aria-hidden`
     because the display heading in the content is the page's real name. Two
     elements carrying the same words is a duplicate to anybody navigating by
     headings. */
  const showName = !collapses || past;

  if (who && back) {
    throw new Error("A crown leads with a face or with a way out, never both.");
  }
  if (name && find) {
    throw new Error("A crown's middle is a name or a search, never both.");
  }

  return (
    <header data-hem="top" className={`sticky top-0 z-10 w-full ${SAFE_TOP}`}>
      <Band bleed={bleed} width={width}>
        <div className={`flex items-center ${SPACE.snug} ${CROWN}`}>
          {/* ------------------------------------------------------- lead --- */}
          {who ? (
            /* ⚠️ NO `data-chrome` — a face carries its own ground, so a chip
               behind it is a plate behind a plate. */
            <Button
              isIconOnly
              size={CROWN_SIZE}
              variant="ghost"
              aria-label={who.onOpen ? "Your account" : who.name}
              isDisabled={!who.onOpen}
              onPress={who.onOpen ?? (() => undefined)}
            >
              <span className="relative flex size-full items-center justify-center">
                <Face of={who.face} name={who.name} size="chip" />
                {who.unread
                  ? <span aria-hidden="true" className="absolute -top-0.5 -right-0.5"><Dot /></span>
                  : null}
              </span>
            </Button>
          ) : null}
          {back ? <LeaveChip leave={leave} label={backLabel} onDo={back} /> : null}

          {/* ----------------------------------------------------- middle --- */}
          {find ? (
            /* ⚠️ THE ONE CHIP THAT KEEPS ITS SURFACE, and it is not an exception
               to the hem — the rule is about the CAUSE. A field with no
               affordance in it is a label; the fill and the lens together are
               what make a row of words read as somewhere to type, and neither
               is doing contrast work. */
            <Button
              size={CROWN_SIZE}
              variant="tertiary"
              data-chrome="true"
              className={`grow justify-start ${SPACE.tight}`}
              onPress={find.onOpen}
            >
              <Lens />
              {/* ⚠️ `text-muted` at the CONTROL's size, not `TYPE.note` — a
                  placeholder is secondary in colour, and the note role is 14px,
                  so the words inside a 44px field came out a step smaller than
                  the field. */}
              <span className="text-muted">{find.label}</span>
            </Button>
          ) : null}

          {name ? (
            <div
              {...(collapses ? { "aria-hidden": "true" as const } : {})}
              className={`flex min-w-0 grow items-center ${SPACE.tight}`}
              style={{
                opacity: showName ? 1 : 0,
                transform: showName ? "none" : "translateY(0.375rem)",
                transition: showName ? MOTION.enter : MOTION.exit,
              }}
            >
              {mark ? <Face of={mark} name={name} size="chip" /> : null}
              <span className="flex min-w-0 flex-col">
                <strong className={`truncate ${TYPE.label}`}>{name}</strong>
                {under ? <span className={`truncate ${TYPE.note}`}>{under}</span> : null}
              </span>
            </div>
          ) : null}

          {/* ⚠️ Pushes the trail right on a crown whose middle is empty — a
              collapsed page name leaves the row with nothing to stretch. */}
          {!find && !name ? <Spacer /> : null}

          {/* ------------------------------------------------------ trail --- */}
          {also.map((a) => (
            <Button
              key={a.id}
              isIconOnly
              size={CROWN_SIZE}
              variant="ghost"
              aria-label={a.label}
              onPress={a.onDo}
            >
              <span className="relative flex items-center">
                {a.icon}
                {a.dot
                  ? <span aria-hidden="true" className="absolute -top-1 -right-1.5"><Dot /></span>
                  : null}
              </span>
            </Button>
          ))}
          {does ? (
            /* ⚠️ ICON-ONLY WHERE THERE IS A GLYPH, LABELLED WHERE THERE IS
               NOT. An `isIconOnly` button handed no icon is a 44px empty
               lozenge — which typechecks, renders, and is unpressable-looking.
               The label is the accessible name either way. */
            <Button
              className={does.wide ? "hidden md:flex" : undefined}
              isIconOnly={Boolean(does.icon)}
              size={CROWN_SIZE}
              variant={does.tone === "danger" ? "danger" : "primary"}
              isDisabled={does.disabled}
              /* ⚠️ ONLY WHERE THE GLYPH IS THE WHOLE CONTROL. A button whose
                 visible text IS its name does not take an `aria-label` — that
                 is the name said twice, once to a screen reader and once to
                 anybody counting the words in the markup. */
              aria-label={does.icon ? does.label : undefined}
              onPress={does.onDo}
            >
              {does.icon ?? does.label}
            </Button>
          ) : null}
        </div>
      </Band>
    </header>
  );
}

/* -------------------------------------------------------------- page head --- */

/**
 * A PAGE'S CROWN AND ITS NAME — the row, plus the display heading under it.
 *
 * ⚠️ THIS IS `Crown` PLUS A BLOCK, NOT A SECOND CROWN. The row here is the same
 * component every other surface uses; what this adds is the part that is not
 * chrome at all — the big name, the subject's title card, and whatever scope row
 * sits under them. Keeping those in the crown is what made a "crown" mean two
 * different heights depending on which one you rendered.
 *
 * ⚠️ AND THE NAME IS IN TWO PLACES ON PURPOSE, SHOWN ONE AT A TIME. At rest it
 * is a display heading in the content, where it is the first thing read; once it
 * has scrolled away it comes back small in the crown, where it costs one line
 * and answers "what am I in" without anybody scrolling up to ask. A header that
 * pins the LARGE title spends a fifth of a phone on a word; one that pins
 * nothing leaves somebody four cards deep with a back arrow to nowhere named.
 *
 * ⚠️ THE HANDOVER IS SEQUENCED, NOT A CROSS-FADE. `MOTION.exit` is shorter than
 * `MOTION.enter`, so the large title is gone before the compact one arrives and
 * the two are never both legible in one frame — which is what reading two sizes
 * of the same word at once looks like, and it is the tell that separates this
 * from a naive opacity swap.
 */
export function PageCrown({
  title, face, back, backLabel, leave = "back", also = [], does, under,
  bleed = "edge", width = "work",
}: {
  readonly title: string;
  /**
   * ⚠️ THE SUBJECT THIS PAGE IS ABOUT, AND `Layout` IS WHAT SUPPLIES IT. Not a
   * decoration and not a thumbnail: the picture at the size of the screen with
   * the name across it is a TITLE CARD, and it is the one composition that says
   * "here" rather than "about here". The ground under it is the same subject's
   * own world, from the same declaration — see `Layout`.
   */
  readonly face?: FaceOf;
  /**
   * ⚠️ A CROWN TAKES THE SHAPE OF WHAT IT CROWNS, AND THE DEFAULT IS ONLY A
   * DEFAULT. Edge-bled, the heading sits against the page's own gutter, which is
   * right over content that is also edge-bled. Over a HELD column it is wrong by
   * however wide the screen is: the hub's crown put "Money" 240px to the left of
   * the bill it names, which reads as two pages sharing one scroll.
   */
  readonly bleed?: Bleed;
  readonly width?: Width;
  readonly back?: () => void;
  readonly backLabel?: string;
  readonly leave?: "back" | "dismiss";
  readonly also?: readonly [] | readonly [Slot] | readonly [Slot, Slot];
  /**
   * ⚠️ THE PRIMARY ACTION, ALREADY DECIDED. A `Screen` hands the SAME act to
   * this and to its docked bar and shows exactly one of them by breakpoint
   * (`screen.tsx`); declaring it twice is how the crown comes to say "Invite"
   * while the bar says "Add somebody".
   */
  readonly does?: CrownProps["does"];
  /**
   * ⚠️ THE ROW THAT SCROLLS AWAY WITH THE TITLE — a scope picker, a date range.
   * It belongs to the heading rather than to the content, and pinning it would
   * put two rows of chrome over every page.
   */
  readonly under?: React.ReactNode;
}) {
  const past = useScrolledPast();

  return (
    <>
      <Crown
        bleed={bleed}
        width={width}
        back={back}
        backLabel={backLabel}
        leave={leave}
        name={title}
        collapses
        also={also}
        does={does}
      />

      {/* ⚠️ THE PADDING IS BELOW THE HEADING, NOT AROUND IT. The crown above
          already sets the top; `BAND_PAD` here would double it and push the
          title down the screen. What was missing is air UNDER the block. */}
      <Band bleed={bleed} width={width}>
        {face
          ? (
            /*
              ⚠️ THE SUBJECT IS THE SCREEN, AND THE NAME SITS ON IT. A page about
              one named thing that has a picture of itself does not need a
              heading ABOVE a thumbnail — that is a caption over an icon. The
              picture at the size of the screen with the name across it is a
              title card, and it is the one composition that says "here".

              ⚠️ THE NAME IS ON A GRID CELL, NOT ABSOLUTELY POSITIONED. Both
              share one cell, so the block is as tall as the orb and the content
              under it never has to know a hero happened.
            */
            <div
              className={`grid ${TITLE_PAD}`}
              style={{ opacity: past ? 0 : 1, transition: past ? MOTION.exit : MOTION.enter }}
            >
              <span
                className="col-start-1 row-start-1 justify-self-center"
                style={{ gridArea: "1 / 1" }}
              >
                <Face of={face} hero />
              </span>
              {/* ⚠️ NO SCRIM, AND THAT WAS TRIED FIRST. A wash under the name to
                  hold its contrast over a lit sphere is the obvious move and it
                  is visible: the plate is wider than the planet, so its edges sit
                  on plain sky as two dark patches either side of the world. What
                  holds the type is WEIGHT, the mask, and `ON_SCENE` — a halo in
                  the ground's OWN colour, which has no shape and dims nothing. */}
              <span
                /* ⚠️ `relative` IS NOT COSMETIC HERE. The orb carries a
                   `mask-image`, and a mask CREATES A STACKING CONTEXT — so the
                   picture paints after in-flow content and the name vanished
                   behind a planet with nothing in the DOM to show for it. */
                className={`relative col-start-1 row-start-1 self-center justify-self-center w-full
                  flex flex-col items-center text-center ${SPACE.tight} px-4 py-6`}
                /* ⚠️ ON THE WRAPPER, BECAUSE `text-shadow` INHERITS. */
                style={{ gridArea: "1 / 1", textShadow: ON_SCENE }}
              >
                <h1 className={TYPE.wordmark}>{title}</h1>
                {under}
              </span>
            </div>
          )
          : (
            <div className={`flex flex-col ${HEAD_GAP} ${TITLE_PAD}`}>
              <h1
                className={TYPE.display}
                style={{ opacity: past ? 0 : 1, transition: past ? MOTION.exit : MOTION.enter }}
              >
                {title}
              </h1>
              {under}
            </div>
          )}
      </Band>
    </>
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
    <div className={`flex flex-col ${SPACE.hair}`}>
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
 *
 * ⚠️ AND IT IS A STEP ABOVE `Group`, BECAUSE IT CONTAINS ONE. Both drew their
 * label at `TYPE.section`, so a section holding three groups came out as four
 * headings of identical weight and the nesting was invisible — "Kova", then
 * "Studio", then "Appearance", each reading as a peer of the last. A heading
 * that does not outrank what it heads is a heading doing no work.
 */
export function Section(
  { label, under, children }: {
    /**
     * ⚠️ ABSENT IS A REAL ANSWER — see `distinguishing`. A section whose heading
     * separates it from nothing is a line of chrome, and they stack: a phone
     * showed "Settings", the workspace's name, "Kova", "Studio" and "Everyone
     * in this workspace" before the first control it could change.
     */
    readonly label?: string;
    readonly under?: string;
    readonly children?: React.ReactNode;
  },
) {
  return (
    <section className={`flex flex-col ${HEAD_GAP}`}>
      {label || under ? (
        <div className={`flex flex-col ${SPACE.hair}`}>
          {label ? <h2 className={TYPE.title}>{label}</h2> : null}
          {under ? <p className={TYPE.note}>{under}</p> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * THE NAME OF ONE OF SEVERAL — or nothing, when it is the only one.
 *
 * ⚠️ A HEADING EXISTS TO SEPARATE, SO ONE THING NEEDS NONE. Every screen in the
 * hub loops the workspace's products and heads each block with the product's
 * name; on a workspace with ONE product that name distinguishes it from nothing
 * and is read before every screen, under two headings that already scoped it.
 * The same block with two products needs it badly, which is why this is a
 * question about the list rather than a decision per screen.
 *
 * ⚠️ AND IT IS HERE RATHER THAN IN EACH SCREEN so the rule cannot be applied to
 * four of the five. The list is the argument; the name is what to say about it.
 */
export const distinguishing = <T,>(among: readonly T[], name: string): string | undefined =>
  among.length > 1 ? name : undefined;

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
    <div className={`flex flex-col ${SPACE.hair}`}>
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
    /* ⚠️ THE SAME HEM THE NAV WEARS, because it is the same fault: content
       arriving at a docked control's edge and being sliced by it. A docked bar
       is not a special case of a nav — they are two things at one address. */
    <div
      data-hem="bottom"
      className={`sticky bottom-0 z-10 flex w-full justify-center ${PAD} ${SAFE_BOTTOM}`}
    >
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

/**
 * THE NAV — five destinations maximum (D10), and only where you are says its
 * name.
 *
 * ⚠️ FIVE ICON-AND-LABEL COLUMNS DO NOT FIT A PHONE, AND THAT WAS THE OLD BAR.
 * Equal columns mean every label is squeezed to a fifth of the screen, so a
 * two-word destination truncates and a five-item nav is five abbreviations. The
 * bar that works is COMPACT: every destination is its icon, and the ONE somebody
 * is on expands to say so. Four glyphs and one named item fit at any width, and
 * the label that is showing is the only one anybody needs — a person does not
 * read the nav to find out where they are not.
 *
 * ⚠️ NOTHING HERE IS A SURFACE. No bar, no pill: the hem under the nav is the
 * background (`data-hem`), and where you are is INK — full foreground against a
 * distinctly recessive muted, plus the one word. Every surface this used to have
 * was solving a problem the hem solves better: the bar was holding contrast
 * against a moving field, and the pill was clearing the bar.
 *
 * ⚠️ THE EXPANSION IS THE TRAVEL, WHICH REPLACES A PILL THAT SLID. There was one
 * absolutely-positioned pill stepping by `index × 100%` of an equal column, and
 * the argument for it was that a single element MOVING says two destinations are
 * on one shelf while four backgrounds switching on and off do not. That argument
 * still holds and this is a better answer to it: nothing jumps, because the word
 * grows out of one item while the one before it closes — the motion is
 * continuous and it IS the label. It also needs no measuring, no ref and no
 * resize observer, which the equal-column pill only avoided by forcing every
 * item to the same width in the first place.
 *
 * ⚠️ IT LEAVES DOWNWARDS AND COMES BACK UP. Reading and navigating are different
 * moments: during the first the nav is in the way, during the second it is the
 * point. The whole bar translates out rather than shedding its labels, because a
 * bar that changes SHAPE while you scroll is a thing moving in the corner of the
 * eye — and a translate is the compositor's work while a height is the layout
 * engine's, on every frame of a scroll.
 *
 * ⚠️ AND THE LABEL GOES TO ZERO WIDTH, NEVER TO `display: none`. A nav that
 * removed its labels from the accessibility tree would be five unnamed buttons
 * to anybody using a screen reader — the one group for whom the icon carries
 * nothing at all.
 *
 * ⚠️ THE KERNEL REFUSES A SIXTH ITEM, and this slices too: a deployment
 * rendering a manifest it did not compose must not draw one either.
 */
export function Island({ items, here, onGo, only }: {
  readonly items: readonly {
    readonly id: string; readonly label: string;
    readonly icon: React.ReactNode; readonly route: string;
    /** ⚠️ A dot, never a count. At this size a number is unreadable, and what
        the nav owes is "something happened here", not how much. */
    readonly unread?: boolean;
  }[];
  readonly here: string;
  readonly onGo: (route: string) => void;
  /**
   * ⚠️ THE BREAKPOINT IS A PROP BECAUSE A WRAPPER BREAKS `sticky`, AND THAT IS
   * NOT A STYLE OPINION — it is the bug this parameter exists to remove. A
   * sticky element can never leave its own PARENT's box, and the `md:hidden`
   * div the shell used to wrap this in is exactly the nav's own height. Eighty
   * eight pixels of travel is none: the bar sat at the end of the document and
   * scrolled away with the content, on every product screen, for as long as
   * there had been one.
   *
   * ⚠️ AND IT LOOKED CORRECT THE WHOLE TIME. Every screen was shorter than a
   * viewport, so the bar's natural position WAS the bottom of the screen —
   * there was nothing to pin it against and nothing to give it away. The first
   * long page is where it would have been reported, by somebody, as the nav
   * disappearing.
   */
  readonly only?: "phone";
}) {
  const away = useScrollingDown();
  const shown = items.slice(0, PRIMARY_MAX);

  return (
    <nav
      aria-label="Sections"
      /* ⚠️ THE HEM IS THE NAV'S BACKGROUND — see `ambienceStylesheet`. It is on
         the NAV rather than on the bar inside it, because what has to dissolve
         is the page's own content on its way past, and the bar is only 370px of
         a 402px screen. */
      data-hem="bottom"
      className={`sticky bottom-0 z-10 flex justify-center ${GUTTER} ${PAD} ${SAFE_BOTTOM}`
        + (only === "phone" ? " md:hidden" : "")}
      style={{
        /* ⚠️ PAST ITS OWN HEIGHT PLUS THE SAFE AREA, or it rests half off the
           bottom edge on a phone with a home indicator — which reads as a bar
           that failed to finish rather than as one that left. */
        transform: away ? "translateY(calc(100% + env(safe-area-inset-bottom)))" : "none",
        opacity: away ? 0 : 1,
        transition: away ? MOTION.exit : MOTION.enter,
      }}
    >
      {/*
        ⚠️ IT SPANS THE COLUMN AND THE CLOSED ITEMS SHARE WHAT IS LEFT. A bar
        sized to its own content came out 234px of 430 with a visible gap either
        side, which reads as a control that did not finish loading rather than as
        something floating over the page — and it packs four tap targets into the
        middle third of the screen, which is the half of the argument that is
        about thumbs rather than taste. The open pill takes the room its word
        needs and the four glyphs divide the rest, so the bar is the same width
        on every screen and the spacing falls out of the arithmetic.

        ⚠️ AND IT CARRIES NO FILL AT ALL. It was `data-chrome` — the ground's own
        colour, a capsule — and that is a plate with rounded ends, so the page's
        next row arrived at those ends and was sliced by them: a face cut in half
        down the gutter, a heading reappearing in the gaps either side. The hem
        on the nav around it dissolves the content instead, which fixes the
        collision rather than out-contrasting it, and leaves the five items
        standing on the page.
      */}
      {/* ⚠️ AND NO `data-capsule` EITHER — there is no surface left to round.
          The attribute would still match its rule and change nothing, which is
          the state it was in before anybody noticed the nav was a rectangle. */}
      <div
        data-island="true"
        className={`flex w-full ${WIDTH.read} flex-row items-center ${SPACE.hair} ${ISLAND_PAD}`}
      >
        {shown.map((item) => {
          const isHere = item.route === here;
          return (
            <Button
              key={item.id}
              /* ⚠️ ALWAYS `ghost`. Where you are is ink now — `data-here` sets
                 the colour and nothing else — so a variant that painted its own
                 surface would put back the pill this design removed. */
              variant="ghost"
              aria-current={isHere ? "page" : undefined}
              data-here={isHere ? "true" : undefined}
              /* ⚠️ THE OPEN ONE IS CONTENT-SIZED AND THE CLOSED ONES DIVIDE THE
                 REST. `grow basis-0` on the four is what makes them EQUAL rather
                 than merely fair — with the default `basis-auto` flex hands out
                 the leftover after each item's own content, so widths converge
                 without matching, which is worse than obviously wrong because it
                 looks nearly right. */
              className={`flex-row items-center justify-center ${SPACE.tight} ${ROW.free} `
                + (isHere ? `shrink-0 ${ISLAND_HERE}` : `grow basis-0 min-w-0 ${ISLAND_ITEM}`)}
              onPress={() => onGo(item.route)}
            >
              <span
                aria-hidden="true"
                className="relative flex shrink-0 items-center"
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
                ⚠️ WIDTH, NOT DISPLAY — see the header. `max-width` from zero is
                what makes the pill GROW rather than appear, and it keeps the
                word in the accessibility tree while it is closed.

                ⚠️ `10rem` IS A CEILING, NOT A WIDTH. A max-width transition needs
                a number to travel to and `auto` is not one; the span is still
                sized by its text, so the ceiling only has to clear the longest
                destination anybody would write.
              */}
              {/*
                ⚠️ THE OPEN LABEL IS NOT `note`, AND THAT IS THE ONE COLOUR BUG
                THIS SHAPE INVITES. `note` is `text-muted` — correct for a
                caption and wrong for the only word in the nav, because a class
                on the span beats the `color` the `data-here` fill sets on the
                button, so the destination somebody IS on read dimmer than the
                icons around it. The word that is showing is the whole point of
                the bar; it takes full ink.
              */}
              <span
                className={`${TYPE.note} ${isHere ? "text-foreground" : ""}`
                  + " overflow-hidden whitespace-nowrap leading-none"}
                style={{
                  maxWidth: isHere ? "10rem" : 0,
                  opacity: isHere ? 1 : 0,
                  transition: MOTION.reveal,
                }}
              >
                {item.label}
              </span>
            </Button>
          );
        })}
      </div>
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

const Lens = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </svg>
);
