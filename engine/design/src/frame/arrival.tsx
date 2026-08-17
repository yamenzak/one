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
 * THE MARK IS THE WORD, DRAWN.
 *
 * ⚠️ IT IS A WORDMARK RATHER THAN A SYMBOL, AND THAT SETTLES WHAT GOES BESIDE
 * IT. A symbol needs the name written next to it to be worth anything on a
 * product nobody has heard of yet; a wordmark IS the name, so the heading beside
 * it is free to say what the SCREEN is — "Sign in", "Check your email" — instead
 * of repeating the product for the second time on the same page.
 *
 * ⚠️ ONE GEOMETRY, ONE WEIGHT, RECTANGULAR COUNTERS. Heavy lowercase on a square
 * grid: the outer corners carry a large radius and every counter is a sharp
 * rectangle, which is the whole character of it — soft outside, hard inside. The
 * `o` is cut at the top-left, and that chamfer is the one asymmetry in the word;
 * without it three round letters in a row read as a font rather than as a mark.
 *
 * ⚠️ FILLED, IN `currentColor`, WITH `evenodd` DOING THE COUNTERS. The interface
 * is values and the data is hues (`ground.ts`), so it inherits ink and never
 * takes the accent — a mark tinted with the brand is the one piece of chrome
 * that stops working the moment a workspace picks a colour near its ground.
 * Cutting the counters with a fill rule rather than a second shape means the
 * whole word is one path per letter and cannot come apart at small sizes.
 *
 * ⚠️ AND IT IS DRAWN, NOT SET. `◇` stood in for this, and text set in a font
 * would be no better: weight, width and baseline would be whatever the reader's
 * machine decides, which is how a mark comes to look bold on one screen and thin
 * on the next.
 */
export type MarkSize = "nav" | "row" | "crown" | "door";

/* ⚠️ HEIGHT, AND THE BOX IS SQUARE. The mark is a numeral on a 100-unit square,
   so height and width are the same number — what used to be here was 2.68 wide
   per 1 tall, because it drew a word. */
const MARK_H: Readonly<Record<MarkSize, number>> = {
  nav: 14, row: 16, crown: 18, door: 44,
};

/*
  ⚠️ THE MARK IS THE STENCIL NUMERAL, AND IT REPLACED A DRAWING OF THE WORD.
  What used to be here spelled O-N-E out of three constructed letterforms — a
  wordmark pretending to be a mark, which meant the brand had no shape that
  survived being sixteen pixels wide or square. A numeral with a beak and two
  cut counters does, and a product's mark is the same stem with something added
  to it (see `MarkOf`), so the family reads as a family at any size.
*/
export type MarkOf = "one" | "space";

export function Mark({ size = "crown", of = "one", label }: {
  readonly size?: MarkSize;
  readonly of?: MarkOf;
  /** An accessible name. Absent means decorative, beside text that already says it. */
  readonly label?: string;
}) {
  const h = MARK_H[size];
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
      height={h}
      width={h}
      viewBox="0 0 100 100"
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
          <rect width="100%" height="100%" fill="#fff" />
          {of === "one"
            ? (
              <>
                <line x1="53" y1="18" x2="53" y2="82" stroke="#000" strokeWidth="3" />
                <line x1="60" y1="18" x2="60" y2="82" stroke="#000" strokeWidth="2.5" />
              </>
            )
            : (
              <>
                <line x1="52" y1="18" x2="52" y2="82" stroke="#000" strokeWidth="2" />
                <line x1="60" y1="18" x2="60" y2="82" stroke="#000" strokeWidth="2" />
                {/* ⚠️ Two rings on the stem, offset up and down — a body on an
                    orbit rather than a pair of dots, which is what keeps the
                    counters from reading as a barcode. */}
                <circle cx="52" cy="36" r="4.5" fill="#000" />
                <circle cx="52" cy="36" r="2" fill="#fff" />
                <circle cx="60" cy="62" r="4.5" fill="#000" />
                <circle cx="60" cy="62" r="2" fill="#fff" />
              </>
            )}
        </mask>
      </defs>

      {/* ⚠️ THE BEAK IS DIMMED, NOT COLOURED. The product drawing tinted it slate
          blue, which is a hue in a system that decided to be monochrome — the
          same ink at lower opacity says the same thing on any ground and needs
          no second token. */}
      <path d="M 28 36 L 46 18 L 46 36 Z" opacity={of === "space" ? 0.55 : 1} />
      <path d="M 46 18 L 66 18 L 66 82 L 46 82 Z" mask={`url(#${mask})`} />
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
