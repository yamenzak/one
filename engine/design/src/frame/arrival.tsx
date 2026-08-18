/**
 * WHAT A PERSON MEETS BEFORE THEY ARE ANYBODY — the mark, and the frame it
 * stands in.
 *
 * ⚠️ AN ENTRY SCREEN IS THE PAGE, NOT A CARD ON ONE. Every door here used to be
 * a `Card` floating dead-centre in a gradient, under a crown carrying the
 * product's name a second time and the raw hostname under it — so the first
 * screen anybody sees said the name twice, showed them a debug string, and
 * anchored nothing. A door has one job and the whole viewport to do it in.
 *
 * ⚠️ AND IT IS TOP-WEIGHTED, NOT CENTRED. Vertical centring is what makes a form
 * look like it is waiting for the rest of the page to load: nothing is above it,
 * nothing below, and the eye has no edge to start from. The column starts high,
 * the mark is the first thing in it, and the ambience is the page's own.
 */

import * as React from "react";
import { Link } from "@heroui/react";
import {
  LEGAL_INDEX, MARK_BEAK, MARK_STEM, beakOpacity, inkOf, partsOf, type MarkOf,
} from "@engine/kernel";
import { ARRIVE_MARK, ARRIVE_RISE, doorAt } from "../tokens/motion.js";
import {
  DOOR_PAD, GUTTER, SPACE, WIDTH,
} from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { Page } from "./page.js";
import { Spacer, Stack } from "../parts/arrange.js";
import type { Sky } from "../tokens/ambience.js";
import { ONE_FACE, worldFor } from "../parts/face.js";
import { Lockup } from "../parts/logo.js";

/* ------------------------------------------------------------------- mark --- */

/**
 * THE MARK IS A NUMERAL, AND THE NAME IS SET BESIDE IT.
 *
 * ⚠️ A SYMBOL, NOT A WORDMARK, WHICH IS WHAT LETS IT BE SQUARE AND SMALL. What
 * was here spelled O-N-E out of three constructed letterforms — a wordmark
 * pretending to be a mark — so the brand had no shape that survived being
 * sixteen pixels wide, and every avatar, tab icon and crown fell back to
 * something else. A stencil numeral does survive it, and `Lockup` is where the
 * name is written when the name is wanted.
 *
 * ⚠️ THE COUNTERS ARE CUT WITH A MASK, WHICH IS WHY THE STENCIL LINES ARE
 * STROKES. They are the character of it — a solid stem with the light let
 * through in two straight slots — and a product's mark is that same stem with
 * something added (see `MarkOf`), so the family reads as a family.
 *
 * ⚠️ FILLED IN `currentColor`. The interface is values and the data is hues
 * (`ground.ts`), so it inherits ink and never takes the accent — a mark tinted
 * with the brand is the one piece of chrome that stops working the moment a
 * workspace picks a colour near its ground.
 *
 * ⚠️ AND IT IS DRAWN, NOT SET. `◇` stood in for this, and text set in a font
 * would be no better: weight, width and baseline would be whatever the reader's
 * machine decides, which is how a mark comes to look bold on one screen and thin
 * on the next.
 */
export type MarkSize = "inline" | "nav" | "row" | "crown" | "door";

/**
 * ⚠️ HEIGHT OF THE INK, NOT OF A BOX AROUND IT — see `INK`. Every number here is
 * what the numeral actually measures on the screen, so a mark set to sit beside
 * 18px text can be written as 18.
 *
 * ⚠️ `door` IS TWO LINES OF `text-4xl` AT `leading-[0.9]`, which is what the
 * stacked lockup puts beside it (36 × 0.9 × 2 ≈ 65). The mark spanning both
 * lines is the whole reason the stacked arrangement reads as a numeral and a
 * name rather than as a bracket beside the first line.
 */
const MARK_H: Readonly<Record<MarkSize, number>> = {
  /* ⚠️ `inline` IS THE ONE MEASURED IN `em`, and it has to be. A currency mark
     beside a number has to grow and shrink with the number — pinned to a pixel
     height it is the right size in exactly one of the six places a credit
     figure appears, and visibly wrong in the other five. */
  inline: 1, nav: 14, row: 16, crown: 20, door: 65,
};

/**
 * ⚠️ THE VIEWBOX IS THE DRAWING, NOT THE CANVAS IT WAS DRAWN ON. The numeral
 * fills neither dimension of the 100-unit square it came from, so a square
 * `0 0 100 100` box renders it 36% shorter than its declared height and floats
 * it in a gutter more than half as wide as the box. Both were invisible as
 * numbers and obvious the moment the stacked lockup was photographed: a mark
 * asked to span two lines came out one line tall, sitting away from a left edge
 * every other element in the column shared.
 *
 * ⚠️ SO THE SIZES ABOVE MEAN WHAT THEY SAY, and the mark's own left edge is the
 * column's. Cropping to the ink is what makes both true at once — a scale
 * correction alone would have fixed the height and left the gutter.
 *
 * ⚠️ AND THE BOX IS THE KERNEL'S, LIKE EVERY OTHER NUMBER IN THIS DRAWING. The
 * Worker rasterises the same mark to a PNG for tabs and home screens; two copies
 * of the geometry is two logos with one name, and the one nobody looks at is the
 * one sitting on somebody's home screen for a year (`kernel/src/mark.ts`).
 */
/* ⚠️ ASKED PER MARK, because the wallet's bars leave the numeral — see
   `inkOf`. A single box was correct while every mark had one silhouette, and
   clipped the wallet silently the moment one did not. */

/**
 * ⚠️ WHOSE MARK — the deployment's, or a product's — and it is the KERNEL'S type
 * re-exported rather than a second one spelled the same. Two unions with one
 * name compile happily right up until a third member is added to one of them.
 */
export type { MarkOf };

export function Mark({ size = "crown", of = "one", label }: {
  readonly size?: MarkSize;
  readonly of?: MarkOf;
  /** An accessible name. Absent means decorative, beside text that already says it. */
  readonly label?: string;
}) {
  const h = MARK_H[size];
  /* ⚠️ `em` FOR THE INLINE SIZE, pixels for the rest — see `MARK_H`. */
  const unit = size === "inline" ? "em" : "";
  const INK = inkOf(of);
  const parts = partsOf(of);
  const beak = MARK_BEAK;
  /*
    ⚠️ ONE MASK ID PER INSTANCE. An SVG `id` is DOCUMENT-global, so two marks on
    one page — the crown and a sign-in card, which is the ordinary case —
    resolve the same `url(#…)` to whichever rendered last. The drawings this came
    from both hardcoded the same id, so the platform mark would have taken the
    product's counters, or the reverse, depending on order.
  */
  const mask = React.useId();

  return (
    <svg
      height={`${h}${unit}`}
      /* ⚠️ DERIVED FROM THE DRAWING'S OWN PROPORTION, AND NOT ROUNDED. Written
         out, the two drift the first time the numeral is redrawn; rounded, the
         drift is the same and arrives immediately — at 14px a whole-pixel width
         is 5% off the drawing's ratio, which is a mark subtly stretched in the
         one place it is smallest and least forgiving. SVG takes a fraction. */
      width={`${(h * INK.w) / INK.h}${unit}`}
      viewBox={`${INK.x} ${INK.y} ${INK.w} ${INK.h}`}
      /* ⚠️ `currentColor`, because the source drawings filled #ffffff — a logo
         that is invisible on every light surface, and one that fails as an empty
         space where the brand was rather than as an error. */
      fill="currentColor"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    >
      <defs>
        {/* White keeps, black cuts — the stencil lines ARE the counters. */}
        <mask id={mask}>
          {/* ⚠️ THE DRAWING'S OWN COORDINATES, NEVER `100%`. A percentage in a
              mask resolves against the VIEWPORT while the shapes under it are in
              user space, so cropping the viewBox moved the keep-rect off the
              artwork and cut most of the stem away — a mark that renders as a
              beak and two dots, with nothing failing. */}
          <rect x="0" y="0" width="100" height="100" fill="#fff" />
          {/* ⚠️ CUT, THEN KEEP — the ring is a disc taken out of the stem with a
              dot put back inside it, so the fills alternate and the order is
              load-bearing. Same order as `inkAt`, which is what the rasteriser
              samples. */}
          {parts.slots.map((slot, i) => (
            <line key={`slot${i}`} x1={slot.x} y1={slot.y1} x2={slot.x} y2={slot.y2}
              stroke="#000" strokeWidth={slot.width} />
          ))}
          {parts.rings.map((ring, i) => (
            <React.Fragment key={`ring${i}`}>
              <circle cx={ring.x} cy={ring.y} r={ring.cut} fill="#000" />
              <circle cx={ring.x} cy={ring.y} r={ring.keep} fill="#fff" />
            </React.Fragment>
          ))}
        </mask>
      </defs>

      {/* ⚠️ THE BEAK IS DIMMED, NOT COLOURED. The product drawing tinted it slate
          blue, which is a hue in a system that decided to be monochrome — the
          same ink at lower opacity says the same thing on any ground and needs
          no second token. */}
      <path d={`M ${beak[0].x} ${beak[0].y} L ${beak[1].x} ${beak[1].y} L ${beak[2].x} ${beak[2].y} Z`}
        opacity={beakOpacity(of)} />
      <path d={`M ${MARK_STEM.x} ${MARK_STEM.y} H ${MARK_STEM.x + MARK_STEM.w}`
        + ` V ${MARK_STEM.y + MARK_STEM.h} H ${MARK_STEM.x} Z`}
        mask={`url(#${mask})`} />
      {/* ⚠️ THE BARS ARE DRAWN AFTER THE STEM AND OUTSIDE THE MASK, because they
          are ADDED rather than cut — same order as `inkAt`, which is what the
          rasteriser samples. Inside the mask they would be counters; over the
          stem they are cards crossing it. */}
      {parts.bars.map((bar, i) => (
        <path key={`bar${i}`}
          d={`M ${bar.x1} ${bar.y1} L ${bar.x2} ${bar.y2}`
            + ` L ${bar.x2} ${bar.y2 + bar.thickness} L ${bar.x1} ${bar.y1 + bar.thickness} Z`} />
      ))}
    </svg>
  );
}

/* ---------------------------------------------------------------- arrival --- */

/**
 * THE FRAME EVERY DOOR SHARES.
 *
 * ⚠️ THE THREE ENTRY SCREENS ARE ONE COMPOSITION, AND THAT IS WHAT MAKES THEM
 * FEEL LIKE ONE PRODUCT. The signpost, the sign-in and the wizard are the same
 * column — mark, name, one claim, the action — with only the action differing.
 * Written separately they drifted within a week: three headings at three
 * weights, two of them wrapped in a card and one not.
 *
 * ⚠️ `aside` IS THE QUIET WAY OUT AND IT IS NEVER A SECOND PRIMARY. A door has
 * one thing to do; the other route belongs under it, in a voice that says so.
 */
/**
 * ⚠️ `spotlight`, AND IT IS THE DARKEST THING IN THE VOCABULARY FOR A REASON.
 * `FIELD_WEIGHT` in `ambience.ts` runs it at half — "staging IS darkness" — so
 * it is one hard pool of light with a long falloff and a weighted corner,
 * against a ground that stays near black. That is the whole range a door has to
 * work with: nothing else is on the screen, so the contrast between the lit part
 * and the dark part IS the composition.
 *
 * ⚠️ NOT `aurora`, WHICH MIXES A SECOND HUE — `--success` — BY DESIGN. It stays
 * green however neutral the brand goes, so a monochrome product using it looks
 * like a monochrome product with a bug.
 */
/**
 * ⚠️ AND BY DEFAULT IT IS THE DEPLOYMENT'S OWN WORLD RATHER THAN A NAMED
 * MATERIAL, WHICH IS THE ONE PLACE THAT MATTERS MOST. This is ONE's front door —
 * the sign-in, the start of a workspace — so it is the first thing anybody ever
 * sees of the product, and it was standing on `spotlight` like any other screen.
 * Every other identity here has a ground of its own: a workspace is a planet on
 * its own sky, a person is their own aura. The deployment had a face and no
 * world.
 *
 * ⚠️ IT IS `blobs`: shapes with no grid at all, because ONE is the thing every
 * workspace and every product is INSIDE. A horizon would make it a place you
 * visit and a lattice would make it a system you use; a field of soft
 * silhouettes is neither, which is the only honest answer for the container.
 *
 * ⚠️ `sky` STILL OVERRIDES, and a caller that names one gets it. A door in a
 * particular mood is a real thing to want; what is wrong is that mood being the
 * only option.
 */
export function Arrival({ name, claim, children, aside, sky, brand }: {
  readonly name: string;
  /** One line. What this is, or what is about to happen. */
  readonly claim?: string;
  readonly children: React.ReactNode;
  readonly aside?: React.ReactNode;
  /** ⚠️ Absent is the deployment's own world — see above. */
  readonly sky?: Sky;
  /**
   * ⚠️ WHOSE DOOR THIS IS. Absent draws the bare mark, which is the platform's
   * own and what every product's door wore before there was a wordmark. Given a
   * name it draws the full lockup, STACKED — a door is the one surface with room
   * for the mark to be the subject rather than the furniture.
   */
  readonly brand?: { readonly of?: MarkOf; readonly name?: readonly [string, string] };
}) {
  return (
    <Page
      sky={sky}
      world={sky ? undefined : worldFor(ONE_FACE) ?? undefined}
      density="rich"
    >
      {/* ⚠️ `door` RATHER THAN `read`, AND THE REASON IS IN `metrics.ts`: a
          sign-in form at prose width is a field the width of a paragraph. */}
      <div className={`w-full ${WIDTH.door} mx-auto ${GUTTER}`}>
        {/* ⚠️ ONE THIRD DOWN, NOT HALF. Optically centred rather than
            arithmetically: a short block placed at exactly 50% reads as low,
            because the eye takes the middle of a page to be above its middle. */}
        <div className={`min-h-dvh flex flex-col justify-center md:justify-start ${DOOR_PAD}`}>
          {/* ⚠️ FOUR BLOCKS, ARRIVING IN THE ORDER SOMEBODY READS THEM. The mark
              turns in first and everything else rises under it — see
              `DOOR_MOTION`. Staggering the name and the form separately from the
              mark is what makes it a sequence rather than a page fading in. */}
          <Stack space="roomy">
            {/* ⚠️ THE WORDMARK IS THE PRODUCT'S NAME AND THE HEADING IS THE
                SCREEN'S, so the two never say the same thing — see `Mark`. They
                are a `roomy` apart rather than `tight`: set close together they
                read as one lockup, and "one Check your email" is not a lockup. */}
            <div {...ARRIVE_MARK} style={doorAt(0)}>
              {brand?.name
                ? <Lockup of={brand.of} name={brand.name} stack size="door" />
                : <Mark size="door" of={brand?.of} label="One" />}
            </div>
            <div {...ARRIVE_RISE} style={doorAt(1)}>
              {/*
                ⚠️ `title`, NOT `display`, AND THE WORDMARK IS WHY. `display` is
                the one thing a screen exists to show, and on a door that is the
                mark — a heading at the same weight beside it makes two things
                competing to be the first thing read, which is the state where a
                page has no hierarchy rather than two.
              */}
              <h1 className={TYPE.title}>{name}</h1>
              {claim ? <p className={`${TYPE.body} text-muted`}>{claim}</p> : null}
            </div>

            <div {...ARRIVE_RISE} style={doorAt(2)}>
              <div className={`flex flex-col ${SPACE.snug}`}>{children}</div>
            </div>

            {aside
              ? <div {...ARRIVE_RISE} style={doorAt(3)}>{aside}</div>
              : null}

            {/*
              ⚠️ ON EVERY DOOR, WITHOUT THE CALLER HAVING TO REMEMBER. The terms,
              the privacy notice and the rest were served at their own addresses
              and linked from nowhere at all — so somebody deciding whether to
              sign up could not read them first, which is the one moment they are
              actually for. A prop the caller passes is a prop three of four doors
              would eventually be missing.

              ⚠️ A REAL ANCHOR, FOR THE SAME REASON `AsideRoute` USES ONE: these
              pages are served by the worker rather than drawn by the app, so it
              is a page load either way and this buys middle-click and a status
              bar for free.
            */}
            <div {...ARRIVE_RISE} style={doorAt(4)}>
              <a className={`${TYPE.note} underline underline-offset-4`} href={LEGAL_INDEX}>
                Terms, privacy and the rest
              </a>
            </div>
          </Stack>
        </div>
      </div>
      <Spacer />
    </Page>
  );
}

/**
 * A DOOR'S SECOND ROUTE — A SENTENCE WITH A LINK IN IT, NEVER A SECOND BUTTON.
 *
 * ⚠️ TWO BUTTONS OF ONE WEIGHT IS THE DOOR ASKING SOMEBODY TO CHOOSE BEFORE IT
 * HAS TOLD THEM ANYTHING. "Sign in" is what almost everybody arriving came to
 * do; starting a business is a decision made once. A ghost button beside the
 * primary still reads as a peer — and it carries the library's `px-4`, so the
 * words sat a thumb away from the sentence introducing them.
 *
 * ⚠️ AND WHERE IT LEAVES THE ORIGIN IT IS A REAL ANCHOR. Every one of these
 * crosses a door, which is a full page load either way — so `href` costs
 * nothing and buys middle-click, "open in new tab", and a status bar that shows
 * a person where they are about to go. A `Button` calling `location.assign`
 * silently takes all three away.
 */
export function AsideRoute({ says, label, href, onDo, isDisabled }: {
  readonly says: string;
  readonly label: string;
  /** Absent means this route stays on the page — a step back, not a door. */
  readonly href?: string;
  readonly onDo?: () => void;
  readonly isDisabled?: boolean;
}) {
  return (
    <p className={TYPE.note}>
      {says}{" "}
      <Link href={href} isDisabled={isDisabled} onPress={onDo ? () => onDo() : undefined}>
        {label}
        {/* ⚠️ THE ARROW MEANS "THIS LEAVES", SO IT IS ONLY DRAWN WHEN IT DOES.
            On "use a different address" — a step back within the same screen —
            it promises a page load that never comes, which is the small kind of
            lie that makes somebody stop trusting the other arrows. */}
        {href ? <Link.Icon /> : null}
      </Link>
    </p>
  );
}
