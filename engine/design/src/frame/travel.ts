/**
 * GOING FROM ONE SCREEN TO THE NEXT — one mechanism, and no screen declares
 * anything.
 *
 * ⚠️ TWO QUESTIONS DECIDE EVERY TRANSITION IN THE PRODUCT, AND BOTH ARE ANSWERED
 * FROM FACTS THAT ALREADY EXIST. Which WAY somebody is going is a fact about the
 * two addresses, so the router answers it; whether they are still in the same
 * WORLD is a fact about the ground the page mounted, so this file reads it off
 * the DOM. Neither is a prop, neither is a decision a screen's author makes, and
 * there is therefore no screen that can be missing one — which is the whole
 * reason this is a mechanism rather than a convention.
 *
 *   ROUTE      → forward slides the screen away to the left and brings the next
 *                one in from the right. Backward is the mirror of it, so the
 *                crown's arrow, the phone's gesture and the browser's button all
 *                say the same thing about where you just were.
 *   AMBIENCE   → within one family the world CROSS-FADES: two seeds of one
 *                material dissolving into each other while the page slides over
 *                them, which reads as moving within a place. A different family
 *                is a different place, so it does not slide at all — it opens,
 *                on a scale, and takes longer.
 *
 * ⚠️ IT IS THE BROWSER'S OWN VIEW TRANSITION, WHICH IS WHY THE OUTGOING SCREEN
 * EXISTS AT ALL. Nothing else can show the page somebody is LEAVING: React has
 * already replaced it by the time any animation could run, so a hand-rolled
 * version has to keep the old tree mounted — a second copy of a screen, its
 * scene, its requests and its effects, for a quarter of a second, on the device
 * least able to afford it. `startViewTransition` takes one picture instead.
 *
 * ⚠️ AND IT DEGRADES TO NOTHING, IN BOTH DIRECTIONS. A browser without the API
 * runs the change and draws the next screen, which is precisely what the product
 * did before this file existed; somebody who has asked for less motion gets the
 * same. A transition is the one feature where the fallback being "no feature" is
 * completely acceptable, and that is why it can be unconditional.
 *
 * ⚠️ `flushSync` IS LOAD-BEARING AND NOT AN OPTIMISATION. The browser captures
 * the "after" picture the moment the callback returns, so a React update that is
 * still queued is a picture of the screen somebody was leaving — the transition
 * runs, correctly, between two identical frames, and the whole thing looks
 * broken in a way that is very hard to attribute.
 */

import { flushSync } from "react-dom";
import { DURATION, EASE } from "../tokens/motion.js";

/**
 * ⚠️ TWO WAYS, NOT THREE. A sibling move — one console screen to the next — is
 * still somebody choosing to go somewhere, so it travels forward; the only thing
 * that travels back is going UP, and that is what the crown's arrow, the phone's
 * gesture and the browser's button all do.
 */
export type Way = "forward" | "back";

/**
 * ⚠️ WHICH FAMILY THE PAGE IS STANDING ON, READ OFF THE DOM RATHER THAN PASSED
 * IN. `useScenery` stamps it (`data-sky="cloth"`), so the answer is whatever was
 * actually mounted — which means a router cannot get it wrong, a new family
 * needs no entry anywhere, and a product with its own grounds is covered on the
 * day it is written rather than on the day somebody remembers.
 *
 * ⚠️ THE LAST ONE IN THE DOCUMENT, BECAUSE THE OVERLAY IS LAST. OneSpace is a
 * modal in a portal at the end of `<body>`, over a product that has a ground of
 * its own — so the FIRST match is the page nobody is looking at.
 */
const worldNow = (): string => {
  const all = document.querySelectorAll<HTMLElement>("[data-sky]");
  return all.length ? all[all.length - 1]!.getAttribute("data-sky") ?? "" : "";
};

/** ⚠️ Both opt-outs — see `useStill`. For some people this is not a preference. */
const still = (): boolean =>
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches)
  || document.documentElement.getAttribute("data-reduce-motion") === "true"
  || document.querySelector('[data-reduce-motion="true"]') !== null;

interface WithTransition {
  startViewTransition?: (change: () => void) => { readonly finished: Promise<void> };
}

/**
 * MOVE TO THE NEXT SCREEN.
 *
 * ⚠️ THE CALLER HANDS OVER THE CHANGE ITSELF RATHER THAN CALLING IT FIRST. The
 * "before" picture has to be taken while the old screen is still on the page,
 * which is only possible if the swap happens inside.
 */
export function travel(way: Way, change: () => void): void {
  const root = typeof document === "undefined" ? null : document.documentElement;
  const start = (document as unknown as WithTransition | undefined)?.startViewTransition;
  if (!root || typeof start !== "function" || still()) { change(); return; }

  const from = worldNow();
  root.setAttribute("data-travel", way);

  const run = start.call(document, () => {
    /* ⚠️ Committed here, synchronously — see the header. */
    flushSync(change);
    /*
      ⚠️ AND THE WORLD IS COMPARED AFTER THE COMMIT, WHICH IS THE ONLY MOMENT
      BOTH ANSWERS EXIST. Written as a prop the router would have to know every
      family every product declares; read here it is one string against another.
    */
    root.setAttribute("data-world", worldNow() === from ? "same" : "new");
  });

  /* ⚠️ CLEARED WHATEVER HAPPENS. A transition that is interrupted — somebody
     navigating again mid-flight — rejects rather than resolves, and an
     attribute left behind would put the last direction's animation on the next
     screen that mounted. */
  void run.finished.catch(() => undefined).then(() => {
    root.removeAttribute("data-travel");
    root.removeAttribute("data-world");
  });
}

/* ------------------------------------------------------------------- css --- */

/**
 * ⚠️ THE DISTANCE IS FIXED RATHER THAN A PERCENTAGE OF THE SCREEN, AND THAT IS
 * THE ONE NUMBER HERE WORTH ARGUING ABOUT. A page sliding by a share of its own
 * width is a gentle nudge on a phone and a lurch on a desktop, from the same
 * declaration — and the thing being communicated ("this came from over there")
 * does not get bigger with the monitor. Every motion spec worth copying uses an
 * absolute distance for exactly this reason.
 *
 * ⚠️ AND IT IS SMALL ON PURPOSE. The outgoing picture is opaque for the first
 * half of its fade, so anything it uncovers at the edge is a strip of the screen
 * underneath — at 28px, under an opacity ramp, that strip is never seen. A
 * full-width push would show it plainly, and the fix for THAT is an opaque
 * screen, which this product does not have: every page is transparent over its
 * own world.
 */
const SHIFT = "1.75rem";

/**
 * THE FOUR ANIMATIONS, AND THE PAIRING IS THE DESIGN.
 *
 * ⚠️ THE SCREEN BEING LEFT GOES FASTER THAN THE ONE ARRIVING. Somebody who has
 * pressed something has already decided; making them watch the old screen leave
 * at the speed the new one arrives is the single most reliable way to make an
 * interface feel slow, and it is the rule `DURATION` is built around.
 *
 * ⚠️ AND THE ARRIVING SCREEN CARRIES THE DIRECTION, NOT THE LEAVING ONE. Both
 * move, but the eye follows what is becoming solid — so the incoming curve is
 * the slow one and the outgoing is nearly gone before it has travelled far.
 */
export const TRAVEL_MOTION = [
  /*
    ⚠️ THE FIRST RULE GIVES THE ROOT ITS NAME BACK, WITHOUT WHICH NONE OF THE
    REST EXISTS. `@heroui/styles` ships `:root { view-transition-name: none }` —
    correct for the library, whose own toast queue runs a view transition and
    does not want the whole page captured every time something is announced. The
    consequence for us is total and silent: with no name on the root there is no
    `root` GROUP in the transition tree, so `startViewTransition` runs, captures
    nothing, and the swap is a hard cut. Every rule below matches an element that
    was never created.

    ⚠️ ONLY WHILE TRAVELLING, WHICH IS WHAT MAKES BOTH THINGS TRUE AT ONCE.
    `travel()` stamps `data-travel` before it starts, so the root is nameable for
    the length of a page change and nameless for everything else — a toast still
    animates its own element against a page the transition never captured.
  */
  `:root[data-travel] { view-transition-name: root; }`,

  /*
    ⚠️ AND WHILE A PAGE IS TRAVELLING, NOTHING INSIDE IT ARRIVES SEPARATELY. This
    is the whole of "one engine". A screen's blocks stagger in on mount
    (`BLOCK_MOTION`), a chart draws itself, a mark plays its character — all
    correct in isolation, and all of them firing at once ON TOP of a page
    transition is four overlapping entrances for one press. Reported as "so much
    going on", which is exactly what it is.

    ⚠️ THE TRANSITION IS THE ARRIVAL. What moves during a travel is the content
    column, once, as one thing; what the blocks do is nothing, and they are
    already in place when it lands.
  */
  `:root[data-travel] [data-blocks] > *,`,
  `:root[data-travel] [data-arrive],`,
  `:root[data-travel] [data-draw="true"] { animation: none !important; }`,

  `@media (prefers-reduced-motion: no-preference) {`,

  /* ---------------------------------------------- the world, and the page --- */
  /*
    ⚠️ THE WORLD CROSS-FADES IN PLACE AND ONLY THE CONTENT SLIDES, WHICH IS THE
    SCENE CONTINUING. Two screens of one family are two SEEDS of one material —
    the same lines, the same light, a different arrangement — so dissolving one
    into the other while the column moves over it reads as the same place from a
    different position rather than as a scene change. Translating the root moved
    the ground with the page, which is the same picture sliding: correct, and not
    continuous.

    ⚠️ AND IT IS THE ROOT THAT FADES RATHER THAN A GROUP OF ITS OWN. Naming the
    field lifts it into a separate group, and a named group paints ABOVE the
    root's picture — measured: the sky covers the whole screen for the length of
    the transition. `z-index` on the group puts it back, and then the root's own
    snapshot hides it wherever the page has a background. Two stacking models to
    keep in step, for a parallax nobody asked for.
  */
  `  @keyframes travel-out {`,
  `    from { opacity: 1; }`,
  `    to { opacity: 0; }`,
  `  }`,
  `  @keyframes travel-in {`,
  `    from { opacity: 0; }`,
  `    to { opacity: 1; }`,
  `  }`,
  `  :root[data-travel]::view-transition-old(root) {`,
  `    animation: travel-out ${DURATION.moderate} ${EASE.exit} both;`,
  `  }`,
  `  :root[data-travel]::view-transition-new(root) {`,
  `    animation: travel-in ${DURATION.page} ${EASE.travel} both;`,
  `  }`,

  /* ------------------------------------------------------- and the column --- */
  /*
    ⚠️ THE DIRECTION IS CARRIED BY THE CONTENT, ON THE REAL DOM. The outgoing
    page is a flat picture and cannot be taken apart, so what slides is the
    arriving column — which is also the half the eye follows, because it is the
    half becoming solid.

    ⚠️ THE DISTANCE IS FIXED RATHER THAN A SHARE OF THE SCREEN. A page sliding by
    a percentage of its own width is a nudge on a phone and a lurch on a desktop
    from one declaration, and "this came from over there" does not get bigger
    with the monitor. Every motion spec worth copying uses an absolute distance.
  */
  `  @keyframes travel-column-forward {`,
  `    from { opacity: 0; transform: translate3d(${SHIFT}, 0, 0); }`,
  `    to { opacity: 1; transform: translate3d(0, 0, 0); }`,
  `  }`,
  `  @keyframes travel-column-back {`,
  `    from { opacity: 0; transform: translate3d(-${SHIFT}, 0, 0); }`,
  `    to { opacity: 1; transform: translate3d(0, 0, 0); }`,
  `  }`,
  `  :root[data-travel] [data-blocks] {`,
  `    animation: travel-column-forward ${DURATION.page} ${EASE.travel} both;`,
  `    will-change: transform;`,
  `  }`,
  `  :root[data-travel="back"] [data-blocks] {`,
  `    animation: travel-column-back ${DURATION.page} ${EASE.travel} both;`,
  `    will-change: transform;`,
  `  }`,

  /* ------------------------------------------------ into another world --- */
  /*
    ⚠️ A NEW FAMILY DOES NOT SLIDE, AND THAT IS THE WHOLE OF THE SECOND
    MECHANISM. Sliding says "the next one along"; going from the woven ground of
    a workspace to the ruled ground of the console is not the next one along, it
    is somewhere else. So the old picture recedes and the new one OPENS — a
    scale, a longer curve, and no direction at all, because a place has none.
  */
  `  @keyframes travel-away {`,
  `    from { opacity: 1; transform: scale(1); }`,
  `    to { opacity: 0; transform: scale(1.03); }`,
  `  }`,
  `  @keyframes travel-near {`,
  `    from { opacity: 0; transform: scale(0.98); }`,
  `    60% { opacity: 1; }`,
  `    to { opacity: 1; transform: scale(1); }`,
  `  }`,
  /*
    ⚠️ THE WORLD WINS OVER THE DIRECTION, IN BOTH DIRECTIONS OF TRAVEL. Going
    back OUT of an area is as much a change of place as going into one, so
    `data-world="new"` overrides the slide whichever way somebody is heading —
    which is why these rules come last, and why the column stands down with them.
  */
  `  :root[data-world="new"]::view-transition-old(root) {`,
  `    animation: travel-away ${DURATION.moderate} ${EASE.exit} both;`,
  `  }`,
  `  :root[data-world="new"]::view-transition-new(root) {`,
  `    animation: travel-near ${DURATION.stately} ${EASE.enter} both;`,
  `  }`,
  `  :root[data-world="new"] [data-blocks] { animation: none; }`,
  `}`,
  /*
    ⚠️ THE IN-APP SWITCH, AND IT HAS TO BE HERE AS WELL AS IN `travel()`. The
    function checks it before starting, which covers every navigation the router
    makes; this covers a transition already in flight when somebody flips it,
    and it costs three rules.
  */
  `[data-reduce-motion="true"]::view-transition-old(root),`,
  `[data-reduce-motion="true"]::view-transition-new(root) { animation: none; }`,
  `[data-reduce-motion="true"] [data-blocks] { animation: none; }`,
].join("\n");
