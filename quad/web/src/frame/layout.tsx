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
/* ⚠️ `Ambience`, not `theme.ts`'s older four-value `Sky`. The two drifted the
   moment patterns were added, and a `Page` that could not be given `dots` was a
   vocabulary with a piece nothing could reach. */
import type { Ambience, World } from "../tokens/ambience.js";
import { worldCss } from "../tokens/ambience.js";
import { TYPE } from "../tokens/type.js";
import {
  BAND_PAD, CODE_SLOT, CROWN, CROWN_CHIP, CROWN_SIZE, GUTTER, HEAD_GAP, HERO_PAD, ICON,
  ISLAND_ITEM,
  ISLAND_PAD,
  SAFE_TOP, NAV_SPACE, PAD, ROW, SAFE_BOTTOM, SPACE, TITLE_PAD, WIDTH,
  type Space, type Width,
} from "../tokens/metrics.js";
import { MOTION } from "../tokens/motion.js";
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
  /** ⚠️ Named, never a colour — see the header. */
  readonly sky?: Ambience;
  /**
   * ⚠️ A GROUND BUILT FROM A SUBJECT RATHER THAN CHOSEN FROM THE TABLE, and the
   * ONLY thing that may be handed one. A workspace's face is a planet seen from
   * outside; its own screen is that planet's sky, from the same two colours
   * (`worldCss`). Supplied, it wins over `sky` — a page has one ground.
   *
   * ⚠️ AND IT IS STILL NOT AN INLINE BACKGROUND. What goes on the element is
   * three custom PROPERTIES the `world` rules read, so the fade, the grain, the
   * vignette, the drift, both reduced-motion opt-outs and the per-theme choice
   * of which colour leads all still apply. An inline `background-image` would
   * beat every token and freeze one page on ours.
   */
  readonly world?: World;
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
export function Page({ sky = "plain", world, tone = "neutral", nav, children }: PageProps) {
  const own = world ? worldCss(world) : null;
  return (
    <div
      className="min-h-dvh flex flex-col"
      data-sky={own ? "world" : sky}
      data-tone={tone}
      style={own as React.CSSProperties | undefined}
    >
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
    /* ⚠️ THE BAR ITSELF IS NOT GLASS — see `AppCrown` for the whole argument. */
    <header className={`sticky top-0 z-10 w-full ${SAFE_TOP}`}>
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

/* ------------------------------------------------------------- page crown --- */

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
    <Button
      isIconOnly
      size={CROWN_SIZE}
      variant="ghost"
      data-glass="true"
      aria-label={label ?? (leave === "dismiss" ? "Close" : "Back")}
      onPress={onDo}
    >
      {leave === "dismiss" ? <X /> : <Back />}
    </Button>
  );
}

/**
 * THE HEADER AN INNER PAGE HAS: a way back, the page's name, and the name
 * COLLAPSES.
 *
 * ⚠️ A PAGE'S NAME IS BOTH THE BIGGEST THING ON IT AND SOMETHING YOU STILL NEED
 * FOUR SCREENS DOWN, and one element cannot be both. At rest the title is a
 * display-weight heading under the back control, where it is the first thing
 * read; once it has scrolled away it comes back small, beside the back control,
 * where it costs one line and answers "what am I in" without anybody scrolling
 * up to ask. A header that pins the LARGE title instead spends a fifth of a
 * phone on a word; one that pins nothing leaves somebody four cards deep with a
 * back arrow to nowhere named.
 *
 * ⚠️ THE HANDOVER IS SEQUENCED, NOT A CROSS-FADE. `MOTION.exit` is shorter than
 * `MOTION.enter` by design, so the large title is gone before the compact one
 * arrives and the two are never both legible in the same frame — which is what
 * reading two sizes of the same word at once looks like, and it is the tell that
 * separates this from a naive opacity swap.
 *
 * ⚠️ AND THERE IS NO BAR. No plate, no hairline, no frosted strip: the back
 * control and the actions are glass CHIPS on the page's own ground, and the
 * ground under a crown is already a step lighter than the page because the
 * ambience is built that way. That is the whole separation, and it is why
 * `edges:` can stay green.
 */
export function PageCrown({
  title, face, back, backLabel, leave = "back", actions = [], does, under,
  bleed = "edge", width = "work",
}: {
  readonly title: string;
  /** ⚠️ The subject this page is about, above its name — see `Frame.face`. */
  readonly face?: FaceOf;
  /**
   * ⚠️ A CROWN TAKES THE SHAPE OF WHAT IT CROWNS, AND THE DEFAULT IS ONLY A
   * DEFAULT. Edge-bled, the heading sits against the page's own gutter, which is
   * right over content that is also edge-bled. Over a HELD column it is wrong by
   * however wide the screen is: the hub's crown put "Money" 240px to the left of
   * the bill it names, which reads as two pages sharing one scroll. Name the
   * same `bleed`/`width` here that the content under it uses. Both bands take
   * them, so the back control, the title and the first card share one left edge.
   */
  readonly bleed?: Bleed;
  readonly width?: Width;
  /**
   * ⚠️ ABSENT MEANS THERE IS NOWHERE TO GO, AND THAT IS A REAL STATE. A surface
   * opened as the page itself has nothing underneath it — a control that closes
   * onto a backdrop appears to do nothing, which is worse than not being there.
   * The page still has a NAME, so the heading stays either way.
   */
  readonly back?: () => void;
  readonly backLabel?: string;
  /**
   * ⚠️ THE WAY OUT IS A PROPERTY OF WHERE THIS SCREEN SITS, NOT A CHOICE. The
   * root of a presented surface is DISMISSED and gets an ×; a screen one level
   * inside is left UPWARDS and gets an arrow. Two screens get that right by
   * hand and the third gets it wrong — which is the class of thing a frame
   * exists to decide once.
   */
  readonly leave?: "back" | "dismiss";
  readonly actions?: readonly Slot[];
  /**
   * ⚠️ THE PRIMARY ACTION, ON A WIDE SCREEN ONLY — and it arrives already
   * decided. A `Screen` hands the SAME act to this and to its docked bar and
   * shows exactly one of them by breakpoint (`screen.tsx`); declaring it twice
   * is how the crown comes to say "Invite" while the bar says "Add somebody".
   *
   * ⚠️ AND IT IS LABELLED HERE RATHER THAN ICON-ONLY. There is room at this
   * size, and an unlabelled primary is a guess — the icon-only treatment is for
   * `actions`, which are secondary and recoverable.
   */
  readonly does?: {
    readonly label: string;
    readonly icon?: React.ReactNode;
    readonly onDo: () => void;
    readonly tone?: "danger";
    readonly disabled?: boolean;
  };
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
      <header className={`sticky top-0 z-10 w-full ${SAFE_TOP}`}>
        <Band bleed={bleed} width={width}>
          <div className={`flex items-center ${SPACE.snug} ${CROWN}`}>
            {back ? <LeaveChip leave={leave} label={backLabel} onDo={back} /> : null}

            {/*
              ⚠️ `aria-hidden`, BECAUSE THE `h1` BELOW IS THE PAGE'S NAME. Two
              elements carrying the same words is two headings to a screen
              reader and a duplicate to anybody navigating by them — the compact
              copy is a visual reminder, and it says so.

              ⚠️ AND IT CARRIES ITS OWN GROUND, WHICH IS THE PRICE OF HAVING NO
              BAR. With the header transparent, a card scrolling past arrives
              directly behind these words — the first build drew "Analytics"
              across a chart's own grid lines and its subject series, two sets of
              ink in the same place. A plate behind the whole row would fix it
              and is the thing being removed; a chip behind the TITLE fixes it
              and is the same element the back control and the actions already
              are. Chrome that needs a background is a chip, not a bar.
            */}
            <span
              aria-hidden="true"
              data-glass="true"
              data-capsule="true"
              className={`min-w-0 truncate ${TYPE.label} ${CROWN_CHIP}`}
              style={{
                opacity: past ? 1 : 0,
                transform: past ? "none" : "translateY(0.375rem)",
                transition: past ? MOTION.enter : MOTION.exit,
              }}
            >
              {title}
            </span>

            <Spacer />

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

            {/* ⚠️ `hidden md:flex`, because below it the same act is a docked
                bar where a thumb already is — see `screen.tsx`. */}
            {does ? (
              <Button
                className="hidden md:flex"
                size={CROWN_SIZE}
                variant={does.tone === "danger" ? "danger" : "primary"}
                isDisabled={does.disabled}
                onPress={does.onDo}
              >
                {does.icon}
                {does.label}
              </Button>
            ) : null}
          </div>
        </Band>
      </header>

      {/* ⚠️ THE PADDING IS BELOW THE HEADING, NOT AROUND IT. The crown above
          already sets the top; `BAND_PAD` here would double it and push the
          title down the screen. What was missing is air UNDER the block — the
          first build ran the scope row straight into the first section heading,
          two rows of words at the same left edge with nothing saying which
          belongs to which. */}
      <Band bleed={bleed} width={width}>
        <div className={`flex flex-col ${HEAD_GAP} ${TITLE_PAD}`}>
          {/* ⚠️ ABOVE THE NAME AND LEFT-ALIGNED WITH IT, so the face and the
              heading are one block that fades together when the crown collapses.
              Beside the name it would push a long one onto two lines at exactly
              the width where it already wraps. */}
          {face
            ? (
              <span
                style={{
                  opacity: past ? 0 : 1,
                  transition: past ? MOTION.exit : MOTION.enter,
                }}
              >
                <Face of={face} size="panel" />
              </span>
            )
            : null}
          <h1
            className={TYPE.display}
            style={{
              opacity: past ? 0 : 1,
              transition: past ? MOTION.exit : MOTION.enter,
            }}
          >
            {title}
          </h1>
          {under}
        </div>
      </Band>
    </>
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
              /* ⚠️ `min-w-0` IS WHAT MAKES THE COLUMNS EQUAL RATHER THAN FAIR.
                 A flex item's floor is its CONTENT, so five words wider than a
                 fifth of a phone each take what they need and the bar overflows
                 its own card — the fifth destination sat half off the screen,
                 on the reference product, at the reference width. The pill's
                 arithmetic assumes a partition; this is what gives it one. */
              className={`relative min-w-0 grow basis-0 flex-col justify-center gap-1 ${ROW.free} ${ISLAND_ITEM}`}
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
                className="flex w-full justify-center overflow-hidden"
                style={{
                  maxHeight: folded ? 0 : "1rem",
                  opacity: folded ? 0 : 1,
                  transform: folded ? "translateY(-0.25rem)" : "none",
                  transition: MOTION.reveal,
                }}
              >
                <span
                  data-here={isHere ? "true" : undefined}
                  className={`${TYPE.note} truncate leading-none`}
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
  readonly who: { readonly name: string; readonly face?: FaceOf };
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
      ⚠️ PINNED, AND THE BAR ITSELF IS NOT A SURFACE. A crown that scrolls away
      takes the account, the search and the screen's two actions with it, and
      every one of them is something somebody reaches for in the middle of
      reading — so it stays. What it must not do is become a PLATE.

      ⚠️ THE GLASS IS ON THE CONTROLS, NEVER ON THE BAR, and this shipped the
      wrong way round once. A full-width frosted strip is the thing the whole
      no-edges pass exists to remove: it draws a horizontal band across the top
      of every screen, with a visible boundary where the blur stops, which is a
      border by another name. Blurring each chip instead gives the same
      legibility over moving content and leaves the page one surface — the
      reference product does exactly this, and it is why its header reads as
      controls floating on the page rather than as a toolbar bolted to it.
    */
    <header className={`sticky top-0 z-10 w-full ${SAFE_TOP}`}>
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
              {/* ⚠️ ONE RESOLVER DRAWS EVERY FACE (`face.tsx`), AND IT IS STILL
                  AT THIS SIZE. A crown avatar is 32px, where a breathing one is
                  a twitch in the corner of the eye rather than a sign of life —
                  the size decides that, not this caller. */}
              <Face of={who.face} name={who.name} size="chip" />
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
