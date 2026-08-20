/**
 * THE OPENING — one curtain, every wait that is the whole screen.
 *
 * ⚠️ THERE WERE FOUR OF THESE AND THEY WERE FOUR DIFFERENT SCREENS. Deciding
 * which door this is, taking somebody to the sign-in, and opening a workspace
 * are the same moment to whoever is watching — the product is not there yet —
 * and each was drawn separately: two hand-rolled `min-h-dvh grid
 * place-items-center` wrappers around an inline spinner, and one that mounted
 * the entire chrome (a crown naming the deployment, a reading band, a generated
 * sky) around eleven words. So the first thing anybody saw of One was a page
 * that had begun to build itself and then stopped, three different ways.
 *
 * ⚠️ THE LETTER IS THE SPINNER, WHICH IS THE ONE IDEA HERE. `One` opens on a
 * closed round counter — already the shape every loading indicator in software
 * is drawn as. Putting a spinner BESIDE the name says the same thing twice; the
 * arc rides the O's own stroke instead, so what turns is the mark, and the name
 * is doing the work rather than being decorated.
 *
 * ⚠️ AND IT SAYS SOMETHING DIFFERENT EVERY TIME. A wait is the one screen where
 * a person has nothing to do, which is exactly where a product either has a
 * personality or is furniture. The lines are the DEPLOYMENT's, handed in — this
 * package draws for every app and has no voice of its own — and one is chosen
 * per mount rather than cycled: a line that changes while you are reading it is
 * the screen telling you how long you have been here.
 */

import * as React from "react";
import { GRAIN, GRAIN_OPACITY } from "../tokens/ambience.js";
import { CURTAIN } from "../tokens/ground.js";
import { WIDTH } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { Center } from "./arrange.js";

/* ------------------------------------------------------------------ the O --- */

/**
 * ⚠️ EVERY NUMBER HERE WAS MEASURED OFF THE TYPEFACE, NOT CHOSEN. The ring is
 * standing in for a letter, and a letter that is nearly right is the one thing
 * on this screen anybody will notice — so the O was rasterised at 200px and its
 * ink read back: how tall, how wide, how thick at the side, how thick over the
 * top, how far below the baseline it sits, and what it leaves on each side. The
 * first version was drawn from taste and had four of the six wrong.
 *
 * ⚠️ AND IT IS AN ELLIPSE, WHICH IS THE ONE THAT LOOKS LIKE A MISTAKE UNTIL YOU
 * MEASURE. Geist sets its O narrower than it is tall — 0.680 against 0.755 — so
 * a true circle in that slot is a letter from another font: wider than the word
 * it sits in and rounder than every other bowl in it.
 *
 * ⚠️ THE STROKE IS BETWEEN THE TWO THE FONT USES. A real bowl is modulated —
 * thick at the sides (0.105) and thin over the top (0.080), because that is what
 * a broad nib does. An SVG stroke is one width everywhere, so it goes between
 * them: at the side value the top is visibly heavy, at the top value the sides
 * are visibly light, and the middle reads as the weight of `n` and `e`.
 *
 * ⚠️ ALL IN `em`, so the ring is part of the word rather than a picture beside
 * it. Written in pixels it is the right size at one breakpoint and visibly a
 * component at the other, which is how a wordmark comes to look assembled.
 */
const O = {
  /** The ink, measured. Not a square. */
  width: 0.68,
  height: 0.755,
  /** How far the round drops below the baseline — the overshoot. */
  drop: 0.01,
  /** What the letter leaves on each side, so `O` and `n` are spaced as letters. */
  before: 0.055,
  after: 0.052,
  /** Between the bowl's 0.105 side and its 0.080 top. */
  stroke: 0.092,
} as const;

/** ⚠️ Thousandths of an em, so every number below is the measurement above. */
const EM = 1000;
const W = O.width * EM;
const H = O.height * EM;
const S = O.stroke * EM;

/**
 * ⚠️ THE ARC TRAVELS ALONG THE OUTLINE; THE LETTER DOES NOT MOVE. Rotating the
 * element is what a round spinner does and it cannot be done here — an ellipse
 * turned through 360 degrees is a bowl TUMBLING, which is a letter falling over
 * rather than a letter with a highlight going round it. Offsetting the dash
 * moves the visible run along a shape that stays exactly where it was.
 *
 * ⚠️ AND IT IS BETTER MOTION, NOT A CONSOLATION. A dash following an ellipse
 * covers the flat top faster than it covers the tight sides, so the arc gathers
 * and eases on its own — the pace comes from the letterform rather than from a
 * curve somebody picked.
 *
 * ⚠️ `pathLength` IS WHY THE ARC IS A QUARTER OF ANYTHING. It re-declares the
 * outline as 100 units long, so the dash is a percentage instead of a number
 * derived from Ramanujan's approximation of an ellipse's perimeter — which would
 * have to be worked out again by hand the day a measurement changes.
 */
const RUN = 100;
/**
 * ⚠️ A QUARTER IS THE SHORTEST ARC THAT STILL READS AS PART OF A LETTER. Below
 * about a fifth it is a travelling dot and the O stops being an O; above a third
 * the ring looks merely uneven rather than deliberately open.
 */
const SWEEP = 25;

/**
 * ⚠️ THE FAINT RING IS NOT DECORATION — IT IS THE LETTER. Without it the word is
 * `?ne` with something orbiting where the O should be, which is what every
 * "logo with a spinner in it" gets wrong. The arc is a highlight travelling
 * around a letter that is always fully drawn.
 */
function TurningO() {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={`${O.width}em`}
      height={`${O.height}em`}
      fill="none"
      stroke="currentColor"
      strokeWidth={S}
      aria-hidden="true"
      style={{
        /*
          ⚠️ `inline`, AND WITHOUT IT THE LETTER IS ON ITS OWN LINE. Tailwind's
          preflight sets every `svg` to `display: block` — sensible for an icon
          in a button, and here it breaks the word in half: the ring rendered
          centred ABOVE `ne`, which is a wordmark that has come apart rather than
          a logo. Nothing failed; it simply read as broken.
        */
        display: "inline",
        /* ⚠️ THE BOTTOM EDGE OF AN INLINE SVG IS THE BASELINE, so the overshoot
           is a nudge down from there rather than a guess at the line box. */
        verticalAlign: "baseline",
        transform: `translateY(${O.drop}em)`,
        marginInlineStart: `${O.before}em`,
        marginInlineEnd: `${O.after}em`,
      }}
    >
      <ellipse
        data-opening="ring"
        cx={W / 2}
        cy={H / 2}
        rx={(W - S) / 2}
        ry={(H - S) / 2}
        opacity={0.26}
      />
      <ellipse
        data-opening="arc"
        cx={W / 2}
        cy={H / 2}
        rx={(W - S) / 2}
        ry={(H - S) / 2}
        pathLength={RUN}
        strokeLinecap="round"
        strokeDasharray={`${SWEEP} ${RUN - SWEEP}`}
      />
    </svg>
  );
}

/* -------------------------------------------------------------- the curtain --- */

const shade = (l: number) => `oklch(${l} 0 0)`;

export interface OpeningProps {
  /**
   * ⚠️ THE LINES ARE THE APP'S, AND THERE IS NO DEFAULT. A voice baked in here
   * would be one deployment's jokes shipped to every product that draws with
   * this package — and the second app would inherit them silently, which is
   * worse than having none.
   */
  readonly says?: readonly string[];
  /** The name on the curtain. Its first letter is the one that turns. */
  readonly name?: string;
}

/**
 * ⚠️ FIXED AND FULL-BLEED, NOT A TALL DIV. A `min-h-dvh` block is the height of
 * the viewport and scrolls with the page under it, so on a slow boot a stray
 * touch drags the curtain and reveals the empty document behind it. Nothing is
 * behind this: it covers, and it takes the safe areas with it.
 */
export function Opening({ says, name = "One" }: OpeningProps) {
  /*
    ⚠️ CHOSEN ONCE PER MOUNT, IN THE INITIALISER. Picking during render gives a
    different line on every re-render — and this screen re-renders whenever the
    session resolves a step, so the line would flicker through three of them on
    the way to the app. An effect would be worse again: the first paint would
    have no line at all, and the space it will occupy would then open under the
    name.
  */
  const [line] = React.useState(() =>
    says && says.length ? says[Math.floor(Math.random() * says.length)] : undefined);

  const [first, ...rest] = [...name];

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-hidden"
      style={{
        /* ⚠️ 120% wide and centred a third of the way down, which is where the
           name sits — a lift centred on the viewport puts its brightest point
           below the subject, and reads as a glow coming from the line. */
        background:
          `radial-gradient(120% 90% at 50% 38%, ${shade(CURTAIN.centre)}, ${shade(CURTAIN.edge)})`,
        color: shade(CURTAIN.ink),
      }}
      /* ⚠️ ONE ANNOUNCEMENT, AND IT IS THE LINE. A screen reader hearing the
         name of the product every time a wait begins learns nothing; what it
         needs is that something is happening, which `status` says. */
      role="status"
    >
      {/*
        ⚠️ THE DITHER, AND IT IS THE AMBIENCE'S OWN. A gradient this large and
        this smooth BANDS on an 8-bit panel — measured here as visible rings
        around the name — and the fix already exists, tuned, in the file that
        owns what a ground is made of. Noise at three percent under `overlay` is
        a rounding error in the gradient underneath, which is all dither has to
        be; a second one invented here would be a different grain from the one
        every screen after this wears.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: GRAIN,
          backgroundRepeat: "repeat",
          opacity: GRAIN_OPACITY,
          mixBlendMode: "overlay",
        }}
      />
      {/* ⚠️ `Center` RATHER THAN A HAND-ROLLED COLUMN, so the space between the
          name and the line is the scale's and not this file's opinion. */}
      <Center space="roomy">
        <p className={TYPE.opening} aria-label={name}>
          <TurningO />
          {/* ⚠️ THE FIRST LETTER IS DROPPED, NOT HIDDEN. Left in place under the
              ring it is a second O showing through the counter at every weight
              the font falls back to. */}
          <span aria-hidden="true">{first === "O" ? rest.join("") : name}</span>
        </p>
        {line
          ? (
            <p
              className={`${TYPE.note} ${WIDTH.door} text-center text-balance`}
              /* ⚠️ THE COLOUR IS WRITTEN OUT BECAUSE THE CURTAIN IS NOT THEMED.
                 `TYPE.note` carries `text-muted`, which on a light-theme device
                 resolves to a dark grey — correct on a page, invisible here. */
              style={{ color: shade(CURTAIN.said) }}
            >
              {line}
            </p>
          )
          : null}
      </Center>
    </div>
  );
}
