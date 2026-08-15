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
import type * as React from "react";

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
  /**
   * ⚠️ A FIFTH, FOR THE ONE MOMENT A PERSON SEES ONCE. Everything else here is
   * paced for something done repeatedly, where anything slower than a fifth of
   * a second is a tax paid on every repetition. A door is entered before
   * anybody is signed in, at most a few times ever, with nothing else on the
   * screen competing for the eye — the only place in the product where a longer
   * curve is an impression rather than a delay.
   */
  stately: "560ms",
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

/* ---------------------------------------------------------------- arrival --- */

/**
 * THE THREE KINDS OF MOTION THERE ARE, AND THERE IS NO FOURTH.
 *
 * ⚠️ A PRODUCT WITH A DOZEN ANIMATION TECHNIQUES HAS NO MOTION DESIGN, IT HAS A
 * JUNGLE. Every moving thing in this system is one of exactly three, and which
 * one it is falls out of what is happening rather than out of taste:
 *
 *   IT ARRIVED ... `ARRIVE` — something that was not in the tree now is. A
 *                  transition cannot express this: there is no prior state to
 *                  transition FROM, so it needs a keyframe.
 *   IT CHANGED ... a transition on a `MOTION` token. The element was already
 *                  there and one of its properties moved.
 *   IT IS WAITING  `Skeleton`, `Spinner`, `ProgressBar` — the library's own,
 *                  which animate themselves and stand down by themselves.
 *
 * ⚠️ AND THE ARRIVAL KEYFRAME IS THE LIBRARY'S, NOT OURS. HeroUI defines
 * `@keyframes enter` globally and drives it entirely through `--tw-enter-*`
 * custom properties — it is what every popover, dropdown and modal it ships
 * animates on. Naming it here means our own content arrives the same way the
 * library's does, rather than one step out of phase with it, which is the exact
 * fault this file's header is about. The only thing declared below is WHICH
 * properties move.
 *
 * ⚠️ THE OPT-OUTS ARE BOTH PRESENT AND BOTH REQUIRED. HeroUI switches its own
 * components off for `prefers-reduced-motion` and for a `data-reduce-motion`
 * ancestor; a rule of ours that answered only the first would keep moving for
 * somebody who turned it off inside the app, which is the half that is actually
 * reachable from a settings screen.
 */
export const ARRIVE = { "data-arrive": "true" } as const;

/**
 * ⚠️ A STAGGER, AND IT IS CAPPED. A list where every row arrives at once reads
 * as a flash; one where the delay grows without limit makes the twentieth row
 * take a second and a half, which reads as a slow page rather than as a
 * considered one. Six steps is where the eye stops counting.
 */
export const arriveAt = (index: number): React.CSSProperties =>
  ({ ["--tw-animation-delay" as string]: `${Math.min(index, 5) * 40}ms` });

/**
 * ⚠️ INJECTED BESIDE THE REST OF THE SHARED CHROME, and it has to BE injected —
 * `CHART_MOTION` was imported by the Hub's entry point and left out of the join,
 * so the chart reveal never ran once, in any build, with everything green.
 */
export const ARRIVE_MOTION = [
  `[data-arrive="true"] {`,
  `  animation: enter var(--default-transition-duration) var(--ease-out-quart)`,
  `    var(--tw-animation-delay, 0s) both;`,
  `  --tw-enter-opacity: 0;`,
  `  --tw-enter-translate-y: 0.5rem;`,
  `}`,
  `@media (prefers-reduced-motion: reduce) { [data-arrive="true"] { animation: none; } }`,
  `[data-reduce-motion="true"] [data-arrive="true"] { animation: none; }`,
].join("\n");

/**
 * THE DOOR'S ENTRANCE — the one sequence in the product that is allowed to be
 * an impression.
 *
 * ⚠️ IT IS STILL THE LIBRARY'S OWN `enter` KEYFRAME, WITH DIFFERENT VARIABLES.
 * HeroUI ships `--tw-enter-opacity`, `-scale`, `-rotate`, `-blur` and
 * `-translate-*` against one animation, so a mark that turns into place and a
 * heading that rises are the SAME animation given different numbers — not two
 * hand-rolled keyframes with their own curves, which is the version that keeps
 * moving for somebody who asked motion to stop.
 *
 * ⚠️ THE MARK TURNS AND THE REST RISES, WHICH IS THE WHOLE CHOREOGRAPHY. Every
 * block moving the same way is a page sliding; one element behaving differently
 * is the thing the eye lands on first, and on a door that element should be the
 * mark. Kept to two behaviours because a third is a screen with an opinion
 * about itself.
 */
export const DOOR_MOTION = [
  `[data-arrive="mark"] {`,
  `  animation: enter ${DURATION.stately} ${EASE.travel} var(--tw-animation-delay, 0s) both;`,
  `  --tw-enter-opacity: 0;`,
  `  --tw-enter-scale: 0.6;`,
  `  --tw-enter-rotate: -35deg;`,
  `  --tw-enter-blur: 6px;`,
  `}`,
  `[data-arrive="rise"] {`,
  `  animation: enter ${DURATION.moderate} ${EASE.enter} var(--tw-animation-delay, 0s) both;`,
  `  --tw-enter-opacity: 0;`,
  `  --tw-enter-translate-y: 0.75rem;`,
  `  --tw-enter-blur: 3px;`,
  `}`,
  `@media (prefers-reduced-motion: reduce) {`,
  `  [data-arrive="mark"], [data-arrive="rise"] { animation: none; }`,
  `}`,
  `[data-reduce-motion="true"] [data-arrive="mark"],`,
  `[data-reduce-motion="true"] [data-arrive="rise"] { animation: none; }`,
].join("\n");

export const ARRIVE_MARK = { "data-arrive": "mark" } as const;
export const ARRIVE_RISE = { "data-arrive": "rise" } as const;

/**
 * ⚠️ A DOOR'S STAGGER IS SLOWER THAN A LIST'S, AND UNCAPPED BECAUSE IT IS FOUR
 * BLOCKS. `arriveAt` caps at six steps of 40ms so a long list does not take a
 * second and a half to appear; a door has a mark, a name, a form and a line
 * under it, and at 40ms apart they arrive as one flash rather than as a
 * sequence somebody notices.
 */
export const doorAt = (index: number): React.CSSProperties =>
  ({ ["--tw-animation-delay" as string]: `${index * 110}ms` });
