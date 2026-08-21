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
 * ⚠️ AND IT TALKS WHILE YOU WAIT. A wait is the one screen where a person has
 * nothing to do, which is exactly where a product either has a personality or is
 * furniture. The lines are the DEPLOYMENT's, handed in — this package draws for
 * every app and has no voice of its own — shuffled once and then read in order,
 * so a long boot is a sequence rather than one sentence going stale and a short
 * one still opens somewhere different.
 *
 * ⚠️ EACH GOES ALL THE WAY OUT BEFORE THE NEXT COMES IN, which is the difference
 * between a title card and a caption changing. See `SAID` for the two beats and
 * `OPENING_MOTION` for the fade; the swap happens while the line is at zero, so
 * two sentences are never on the screen together.
 */

import * as React from "react";
import { Button } from "@heroui/react";
import { GRAIN, GRAIN_OPACITY } from "../tokens/ambience.js";
import { CURTAIN } from "../tokens/ground.js";
import { SAID, useStillness } from "../tokens/motion.js";
import { WIDTH } from "../tokens/metrics.js";
import { TYPE } from "../tokens/type.js";
import { Center, Stack } from "./arrange.js";

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
function TurningO({ done = false }: { readonly done?: boolean }) {
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
      {/* ⚠️ AT REST THE RING IS THE WHOLE LETTER, at full strength and with no
          arc over it. The dimmed ring exists to be the TRACK an arc runs on;
          left dim under a stopped screen it reads as a letter that failed to
          draw, and left there WITH the arc it reads as a page that has hung. */}
      <ellipse
        data-opening="ring"
        cx={W / 2}
        cy={H / 2}
        rx={(W - S) / 2}
        ry={(H - S) / 2}
        opacity={done ? 1 : 0.26}
      />
      {done ? null : (
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
      )}
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
  /**
   * THE CURTAIN THAT DOES NOT LIFT — a fault, a door that is not this one, an
   * address nothing is served at.
   *
   * ⚠️ IT IS THIS COMPONENT RATHER THAN A SECOND ONE, AND THAT IS THE WHOLE
   * POINT. These are the same moment as a wait: the product is not there. Drawn
   * separately they were a card on a half-built page — a crown naming the
   * deployment, a generated sky, and a notice in the middle of it — which is a
   * page that started building itself and stopped, which is exactly what the
   * paragraphs at the top of this file describe removing from the wait. The two
   * cannot drift while they are one curtain.
   *
   * ⚠️ AND THE LETTER FINISHES. While something is happening the arc travels
   * round the O; when it stops, the ring is simply an O — complete, still, and
   * the sentence beneath it says why. A spinner frozen mid-turn is the picture
   * of a page that has hung, which is the one thing a stated failure must not
   * look like.
   */
  readonly stopped?: {
    readonly says: string;
    /** One line under it — what this is, or what to do about it. */
    readonly under?: string;
    /** ⚠️ The way on, where there is one. A curtain with no way out is a trap. */
    readonly offer?: { readonly label: string; readonly onDo: () => void };
  };
}

/**
 * ⚠️ FIXED AND FULL-BLEED, NOT A TALL DIV. A `min-h-dvh` block is the height of
 * the viewport and scrolls with the page under it, so on a slow boot a stray
 * touch drags the curtain and reveals the empty document behind it. Nothing is
 * behind this: it covers, and it takes the safe areas with it.
 */
/**
 * ⚠️ SHUFFLED ONCE, THEN READ IN ORDER — not a fresh random pick per turn. Two
 * draws from sixty repeat about one time in eight, and a wait that shows the
 * same sentence twice in ten seconds looks broken rather than random. Walking a
 * shuffled deck cannot repeat until it has been all the way round.
 *
 * ⚠️ AND THE SHUFFLE IS WHY IT IS STILL DIFFERENT EVERY VISIT. A fixed order
 * would make the first three lines the only three most people ever read.
 */
const shuffled = (lines: readonly string[]): readonly string[] => {
  const deck = [...lines];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
};

export function Opening({ says, name = "One", stopped }: OpeningProps) {
  const still = useStillness();
  /*
    ⚠️ THE DECK IS BUILT IN THE INITIALISER, ONCE. Shuffling during render gives
    a different order on every re-render — and this screen re-renders whenever
    the session resolves a step, so the line would jump through three of them on
    the way to the app.
  */
  const [deck] = React.useState(() => (stopped ? [] : shuffled(says ?? [])));
  const [at, setAt] = React.useState(0);
  const [gone, setGone] = React.useState(false);

  /*
    ⚠️ OUT, SWAP, IN — three beats from two timers, and the swap happens while
    the line is at zero. A cross-dissolve would put two sentences on the screen
    together for a third of a second, which on a dark ground reads as a smear and
    is long enough to start reading the wrong one.

    ⚠️ AND IT DOES NOT RUN AT ALL FOR SOMEBODY WHO ASKED FOR LESS MOTION. Taking
    the transition away and leaving the cycle is worse than either: a sentence
    REPLACED with no fade is a harder cut than the fade it was meant to spare
    them. One line, held, is the honest answer.

    ⚠️ NOR WITH ONE LINE TO SAY. A fade out and back to the same words is a
    screen blinking at you.
  */
  React.useEffect(() => {
    if (still || deck.length < 2) return undefined;
    const leave = setTimeout(() => setGone(true), SAID.hold);
    return () => clearTimeout(leave);
  }, [still, deck.length, at]);

  React.useEffect(() => {
    if (!gone) return undefined;
    const arrive = setTimeout(() => {
      setAt((was) => (was + 1) % deck.length);
      setGone(false);
    }, SAID.fade);
    return () => clearTimeout(arrive);
  }, [gone, deck.length]);

  const line = deck[at];

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
      role={stopped ? "alert" : "status"}
      /*
        ⚠️ THE CURTAIN IS A DARK ISLAND AND IT SAYS SO. It does not follow the
        theme (`CURTAIN`) — a held moment before the product exists is one moment
        or it is two — so anything themed inside it has to be told, or a control
        resolves against a light page's tokens and comes out as a pale button on
        near-black. Stamping the ground is the whole fix, and it is what the
        two hand-written colours above are working around.
      */
      data-theme="dark"
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
          <TurningO done={Boolean(stopped)} />
          {/* ⚠️ THE FIRST LETTER IS DROPPED, NOT HIDDEN. Left in place under the
              ring it is a second O showing through the counter at every weight
              the font falls back to. */}
          <span aria-hidden="true">{first === "O" ? rest.join("") : name}</span>
        </p>
        {line
          ? (
            <p
              data-said={gone ? "gone" : "here"}
              className={`${TYPE.note} ${WIDTH.door} grid place-items-center text-center text-balance`}
              style={{
                /* ⚠️ THE COLOUR IS WRITTEN OUT BECAUSE THE CURTAIN IS NOT THEMED.
                   `TYPE.note` carries `text-muted`, which on a light-theme device
                   resolves to a dark grey — correct on a page, invisible here. */
                color: shade(CURTAIN.said),
                /*
                  ⚠️ TWO LINES OF ROOM, ALWAYS, AND IT IS WHAT KEEPS THE NAME
                  STILL. A box sized to its contents changes height when a line
                  that wraps follows one that does not — and `Center` centres the
                  column, so half of that change moves the LOGO, which is the one
                  thing on this screen the eye is resting on.

                  ⚠️ NOTHING WRAPS TODAY, AND THAT IS EXACTLY WHY THIS IS HERE.
                  Measured: all sixty of One's lines are one line at 320. So the
                  screen works without this, and "every line must be short enough
                  to fit a phone" becomes a requirement nobody wrote down — held
                  up only by the next person's luck. Two lines of room costs a
                  fixed twenty pixels and makes the sixty-first line free.

                  ⚠️ `lh` RATHER THAN A GUESS AT THE LINE HEIGHT. It is this
                  element's own computed line box, so the reservation stays right
                  if the note's size or leading ever changes; a hardcoded rem is
                  correct once.
                */
                minHeight: "2lh",
              }}
            >
              {line}
            </p>
          )
          : null}
        {/*
          ⚠️ THE STOPPED CURTAIN'S OWN WORDS, IN THE SLOT THE ROTATING LINE USES.
          Same place, same width, same measure — so a wait that ends in a fault
          replaces one sentence with another rather than rebuilding the screen
          under somebody's eyes.

          ⚠️ THE FIRST LINE TAKES THE CURTAIN'S INK, NOT ITS GREY. A wait's
          caption is the second thing on the screen and is drawn as one; a
          statement of what went wrong is the reason the screen exists.
        */}
        {/* ⚠️ A `Stack`, NOT A SECOND `Center`. `Center` carries `grow`, so one
            nested inside another takes every spare pixel of the curtain and
            pushes the name to the top with the sentence stranded halfway down —
            which is the layout, not the copy, and it photographs as a screen
            that has come apart. */}
        {stopped ? (
          <Stack space="snug">
            {/* ⚠️ Centred here rather than by the Stack, which is a column of
                blocks and does not align them. */}
            <p
              className={`${TYPE.label} ${WIDTH.door} self-center text-center text-balance`}
              style={{ color: shade(CURTAIN.ink) }}
            >
              {stopped.says}
            </p>
            {stopped.under ? (
              <p
                className={`${TYPE.note} ${WIDTH.door} self-center text-center text-balance`}
                style={{ color: shade(CURTAIN.said) }}
              >
                {stopped.under}
              </p>
            ) : null}
            {/*
              ⚠️ THE CONTROL IS DRAWN HERE RATHER THAN TAKEN FROM THE LIBRARY,
              and it is the same reason the line's colour is written out: the
              curtain is not themed, so a `primary` resolves against tokens that
              belong to a page this screen is not on — measured, it comes out as
              a light button on a light theme's palette over a near-black ground.
              A hairline in the curtain's own ink is the whole design.
            */}
            {/* ⚠️ THE LIBRARY'S CONTROL, ON A GROUND THAT DECLARES ITS THEME
                (D7). Hand-drawn here it was a raw element with its own border
                and its own padding — three rules broken to work around a ground
                that had simply never been stamped. */}
            {stopped.offer ? (
              <span className="self-center">
                <Button variant="secondary" onPress={stopped.offer.onDo}>
                  {stopped.offer.label}
                </Button>
              </span>
            ) : null}
          </Stack>
        ) : null}
      </Center>
    </div>
  );
}
