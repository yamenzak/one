/**
 * MOTION, AND EVERY CURVE IN IT IS THE LIBRARY'S (D7).
 *
 * ⚠️ NOT ONE `cubic-bezier` IS WRITTEN HERE. HeroUI ships six easings and a
 * default duration, and every component it draws already moves on them — so a
 * screen that hand-rolls a curve is a screen whose motion is subtly out of step
 * with every control on it. That is the same failure as a hand-picked colour,
 * and it is harder to see: nobody can name what is wrong, the page just feels
 * cheap.
 *
 * ⚠️ AND THE LIBRARY ALREADY HANDLES REDUCED MOTION, IN BOTH DIRECTIONS —
 * `prefers-reduced-motion` and a `data-reduce-motion="true"` ancestor. Writing
 * our own `@keyframes` outside that machinery produces motion that keeps moving
 * for somebody who asked it to stop, which for some people is not a preference
 * but a symptom. Everything below is expressed as tokens the library's own rules
 * already cover, and `REDUCED` is the escape hatch for a page that wants to
 * switch its own ambience off explicitly.
 *
 * ⚠️ WHAT THIS IS NOT: an animation library. There are no springs, no
 * orchestration and no timeline. A product that needs those has a specific
 * reason and can reach for one; what every product needs is that a drawer, a
 * toast and a page all decelerate the same way.
 */

/**
 * The six curves HeroUI defines, by what they are FOR rather than by their
 * shape. A screen naming `--ease-out-quart` directly has to be revisited the day
 * the library renames one, and there are a lot of screens.
 */
export const EASE = {
  /** Anything arriving. The library's own default for entering content. */
  enter: "var(--ease-out-quart)",
  /** Anything leaving. Faster off the screen than onto it — see `DURATION`. */
  exit: "var(--ease-out-quad)",
  /** A control settling under a finger: press, hover, focus. */
  settle: "var(--ease-out)",
  /** Something large moving a long way — a drawer, a sheet, a page. */
  travel: "var(--ease-out-fluid)",
  /** A value changing in place, where a curve would read as a glitch. */
  steady: "var(--ease-linear)",
  /** The library's unopinionated default, for when none of the above is it. */
  plain: "var(--ease-smooth)",
} as const;

export type Ease = keyof typeof EASE;

/**
 * ⚠️ FOUR DURATIONS, AND THE SHORTEST IS THE LIBRARY'S OWN DEFAULT. A scale with
 * twelve entries is a scale nobody stays on. `instant` is what every HeroUI
 * control already uses, so a control we animate ourselves matches the ones
 * beside it.
 *
 * ⚠️ EXIT IS SHORTER THAN ENTER, ALWAYS. Somebody dismissing a thing has already
 * decided; making them watch it leave at the speed it arrived is the single most
 * common way an interface comes to feel slow.
 */
export const DURATION = {
  instant: "var(--default-transition-duration)",
  quick: "180ms",
  moderate: "260ms",
  ambient: "24s",
} as const;

export type Duration = keyof typeof DURATION;

/** One transition, as a CSS value. */
export const transition = (
  properties: string, duration: Duration = "quick", ease: Ease = "settle",
): string => `${properties} ${DURATION[duration]} ${EASE[ease]}`;

/**
 * ⚠️ THE ONE PLACE MOTION IS SWITCHED OFF, and it is an attribute rather than a
 * class so it cascades to everything inside — including HeroUI's own components,
 * which read exactly this. A page that turned motion off with a class would turn
 * off its own and leave the library's running.
 */
export const REDUCED = { "data-reduce-motion": "true" } as const;

/**
 * ⚠️ A NAMED INTENT, NOT A DURATION AND A CURVE AT EVERY CALL SITE. `enter`,
 * `exit`, `press`, `travel` and `drift` are the whole vocabulary; a screen that
 * needs a sixth is a screen that should say why.
 */
export const MOTION = {
  enter: transition("opacity, transform", "quick", "enter"),
  exit: transition("opacity, transform", "instant", "exit"),
  press: transition("transform, background-color, border-color", "instant", "settle"),
  travel: transition("transform", "moderate", "travel"),
  drift: transition("background-position", "ambient", "steady"),
  /**
   * ⚠️ A SIXTH, AND THE REASON IS THAT NOTHING ELSE ANIMATES A THING'S SIZE.
   * Every intent above moves or fades something whose box does not change; a
   * label folding out of a nav changes the height of the bar it is in, and the
   * things around it have to move with it rather than jump when it lands.
   */
  reveal: transition("max-height, opacity, transform", "moderate", "travel"),
} as const;

export type Intent = keyof typeof MOTION;
