/**
 * ANIMATION — the one place motion is defined. UI-LANGUAGE §8.
 *
 * Every duration, curve, spring and variant in the product comes from here. A
 * screen that writes its own `transition={{ duration: 0.3 }}` is a bug: the
 * whole point is that things animating at the same moment share a cadence, and
 * that can only be true if they share a source.
 *
 * ── The two rules worth stating up front ────────────────────────────────────
 *
 * 1. **Enter by scaling DOWN, never up.** Content arrives slightly too large
 *    (1.04–1.06) and comes to rest at 1. Scaling up from 0.96 reads as a thing
 *    growing into existence; scaling down reads as a thing settling into place,
 *    which is the difference between "an app opened" and "an app was assembled
 *    in front of me". This is the single most identifiable gesture in the
 *    language and it is easy to get backwards.
 *
 * 2. **No visible overshoot.** Springs are near-critically damped. Bounce reads
 *    as toy. The only thing permitted to overshoot is a drag returning to rest,
 *    because that is physics the user initiated.
 *
 * Mirrored in tokens.css for CSS-driven motion (`--dur-*`, `--ease-*`). If the
 * two disagree, THIS file is the source.
 */

import type { Transition, Variants } from "motion/react";

// ── Durations (seconds — motion's unit) ──────────────────────────────────────

export const DUR = {
  /** Colour and state. Below this a change reads as a jump. */
  instant: 0.1,
  /** Press, hover, toggle. Anything the finger is still touching. */
  fast: 0.16,
  /** An element entering or leaving. */
  base: 0.24,
  /** A screen or sheet. The longest thing in the product. */
  slow: 0.36,
} as const;

/**
 * Exits are 60% of entrances, always. Leaving should feel decisive — a slow
 * exit reads as the app being reluctant, and it delays whatever comes next.
 */
export const exitOf = (d: number) => d * 0.6;

// ── Curves ──────────────────────────────────────────────────────────────────

/** The house curve. Fast departure, long settle. Almost everything uses this. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
/** Only for motion that returns to where it came from. */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

/**
 * Layout and shared-element motion. Damping is set for ~0.99 damping ratio:
 * fast, and it stops. Raising stiffness without raising damping is how a
 * design system accidentally gets bouncy.
 */
export const SPRING: Transition = { type: "spring", stiffness: 380, damping: 34, mass: 0.9 };
/** For something being dragged back to rest — the one place a little give is right. */
export const SPRING_DRAG: Transition = { type: "spring", stiffness: 300, damping: 30, mass: 0.8 };

const out = (duration: number, delay = 0): Transition => ({ duration, ease: EASE_OUT, delay });

// ── The entrance choreography (§8) ──────────────────────────────────────────
//
// Four tiers, always in this order. The offsets are what make a screen feel
// composed rather than dumped: the atmosphere establishes the space, the anchor
// settles into it, content follows it in, and the chrome arrives last so the eye
// has already landed on the data before the furniture shows up.
//
//   t=0     atmosphere   fade                       240ms
//   t=60    anchor       scale 1.06 → 1, fade       360ms
//   t=140   content      y 12 → 0, fade, stagger    280ms
//   t=260   chrome       fade                       200ms

export const TIER_DELAY = { atmosphere: 0, anchor: 0.06, content: 0.14, chrome: 0.26 } as const;

/** T0 — the brand wash. Establishes the space before anything sits in it. */
export const atmosphereIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: out(DUR.base, TIER_DELAY.atmosphere) },
};

/**
 * T1 — the anchor. **Settles down from 1.06.**
 *
 * The anchor is also the transform origin the rest of the content settles
 * toward, which is why it is the only element that scales on entrance.
 */
export const anchorIn: Variants = {
  hidden: { opacity: 0, scale: 1.06 },
  show: { opacity: 1, scale: 1, transition: out(DUR.slow, TIER_DELAY.anchor) },
};

/** T3 — a content block. Rises a short distance; 12px, never more. */
export const contentIn: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: out(0.28) },
};

/** T4 — chrome. Fades only: furniture should not move. */
export const chromeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: out(0.2, TIER_DELAY.chrome) },
};

/**
 * The spine container. Stagger is 45ms and never deeper than three tiers —
 * beyond that it stops reading as choreography and starts reading as a slow
 * network.
 *
 * **No `delayChildren`, deliberately.** The tier offsets live in the variants
 * above, where they are readable; `delayChildren` would stack on top of them and
 * push the atmosphere — which must be first — behind the content. Ordering
 * instead falls out of position: the atmosphere and anchor are children 0 and 1
 * with their own explicit delays, and the content blocks that follow land at
 * index × 45ms, which is ~90–180ms — exactly the window `TIER_DELAY.content`
 * describes. One mechanism, no interaction between two.
 */
export const contentStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045 } },
};

// ── Element variants ────────────────────────────────────────────────────────

/**
 * The general-purpose entrance for anything that is not on the four-tier
 * spine — a card appearing in place, a section revealed by a toggle.
 *
 * Replaces the old `popIn`, which scaled UP from 0.96 and therefore did the
 * opposite of rule 1. `popIn` is kept as an alias so nothing breaks mid-rewrite,
 * but it now settles down like everything else.
 */
export const settle: Variants = {
  hidden: { opacity: 0, scale: 1.04 },
  show: { opacity: 1, scale: 1, transition: SPRING },
};

/** Fade + rise. The workhorse for list items and sections. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: out(0.4) },
};

/** A generic stagger container for lists outside the spine. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.02 } },
};

/** List rows: a shorter rise and a tighter stagger, so long lists stay snappy. */
export const rowIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: out(0.22) },
};
export const rowStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.03 } },
};

/**
 * A wizard/flow step panel.
 *
 * Written as LABELLED variants rather than an object `animate` for a reason that
 * costs an afternoon to rediscover: a motion component whose `animate` is an
 * object stops propagating the variant label to its descendants. Anything below
 * it that uses `variants` then inherits `initial="hidden"` and never receives
 * `"show"` — it mounts invisible and stays invisible, while the wrapper itself
 * animates perfectly. Keep this a label-driven variant, and `StepPanel` in
 * layout.tsx is the component that guarantees it.
 */
export const stepPanelVariants: Variants = {
  hidden: { opacity: 0, scale: 1.02 },
  show: { opacity: 1, scale: 1, transition: { ...out(DUR.base), staggerChildren: 0.045 } },
};

/** @deprecated Use `settle`. Kept so in-flight screens keep compiling. */
export const popIn = settle;

// ── Interaction ─────────────────────────────────────────────────────────────

/**
 * Press feedback. Spread onto any `motion` element that is pressable.
 *
 * 0.97 is deliberate: enough to feel under the thumb, small enough that a
 * full-width row does not visibly detach from its neighbours.
 */
export const pressProps = {
  whileTap: { scale: 0.97 },
  transition: SPRING,
} as const;

/** A gentler press for large surfaces, where 0.97 would look like a collapse. */
export const pressPropsSubtle = {
  whileTap: { scale: 0.985 },
  transition: SPRING,
} as const;

// ── Overlays ────────────────────────────────────────────────────────────────

/** Bottom sheet. Travel is the sheet's own height, handled by the component. */
export const sheetTransition: Transition = { duration: DUR.slow, ease: EASE_OUT };
/** A centred dialog settles down, like everything else. */
export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 1.03, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: out(DUR.base) },
  exit: { opacity: 0, scale: 1.01, y: 4, transition: out(exitOf(DUR.base)) },
};
/** The dim behind any overlay. Fades with the layer, never after it. */
export const scrimVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DUR.base } },
  exit: { opacity: 0, transition: { duration: exitOf(DUR.base) } },
};

// ── Reduced motion ──────────────────────────────────────────────────────────

/**
 * `prefers-reduced-motion` REMOVES transforms rather than shortening them, and
 * layout must never depend on an animation having run. `MotionConfig
 * reducedMotion="user"` handles the transform stripping for us app-wide; this
 * helper is for the hand-rolled cases (count-ups, canvas, anything driven by
 * rAF) that motion cannot see.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}
