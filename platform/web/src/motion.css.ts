/**
 * MOTION — every moving thing in the platform, from one small set of decisions.
 *
 * ⚠️ IT IS A VOCABULARY, NOT A LIBRARY. Six durations, four curves and a handful
 * of named movements. A screen picks from them; it does not invent a duration.
 * That is the whole difference between an interface that feels made by one person
 * and one where every surface arrives at a slightly different speed — which is
 * what "polished" actually means and what no amount of individually nice
 * animation produces.
 *
 * ⚠️ ENTERING AND LEAVING ARE NOT THE SAME CURVE, and this is the single largest
 * tell. A thing arriving should be fastest at the start and settle — it is coming
 * to rest somewhere and the eye wants to see where. A thing leaving should start
 * slowly and accelerate away — it is already irrelevant, and dwelling on it makes
 * the next thing feel late. Symmetric easing on both is what makes motion read as
 * "animated" rather than as physical.
 *
 * ⚠️ TRANSFORM AND OPACITY, NEVER LAYOUT. Both are composited; height, top and
 * margin are not, and animating them repaints on every frame of every element
 * underneath. This is not a performance nicety on a phone — it is the difference
 * between motion and stutter, and stutter reads as cheapness more than any
 * design decision.
 *
 * ⚠️ AND IT IS REMOVED, NOT SHORTENED, FOR SOMEBODY WHO ASKED. A person who has
 * turned motion down is not asking for the same motion faster.
 */

export const MOTION_CSS = `
:root {
  /* ⚠️ THE CURVES. Four, named for what they are FOR rather than for their
     numbers, because a screen choosing "cubic-bezier(0.16, 1, 0.3, 1)" is a
     screen that will eventually choose a slightly different one. */
  --enter: cubic-bezier(0.16, 1, 0.3, 1);
  --exit: cubic-bezier(0.4, 0, 1, 1);
  --move: cubic-bezier(0.32, 0.72, 0, 1);
  /* ⚠️ A REAL SPRING, sampled into linear(). Overshoot is what makes a control
     feel sprung rather than eased, and a cubic-bezier cannot express it at all —
     it is bounded by its endpoints. Reserved for things a finger acted on. */
  --spring: linear(0, 0.006, 0.025 2.8%, 0.101 6.1%, 0.539 18.9%, 0.721 25.3%,
    0.849 31.5%, 0.937 38.1%, 0.968 41.8%, 0.991 45.7%, 1.006 50.1%, 1.015 55%,
    1.017 63.9%, 1.001 100%);

  /* ⚠️ THE DURATIONS, and there are no others. Each is named for the SIZE of the
     thing that moves: a bigger object needs longer to be believed. */
  --quick: 120ms;   /* a press, a tick, a colour */
  --swift: 200ms;   /* one control changing state */
  --settle: 320ms;  /* a surface arriving */
  --arrive: 460ms;  /* a whole screen */
  /* ⚠️ THE GAP BETWEEN STAGGERED THINGS. Under about 25ms a stagger reads as one
     block with soft edges; over about 60ms it reads as a queue and the last row
     is late. */
  --step: 38ms;
}

/* ---------------------------------------------------------------- arriving */

/* ⚠️ ONE MOVEMENT, USED EVERYWHERE, RATHER THAN A DIFFERENT IDEA PER SURFACE.
   Up and in. It is small — 14 pixels — because a large travel is a thing being
   thrown onto the screen, and the eye reads distance as force. */
/* ⚠️ ONE ENTRANCE, AND IT IS ONLY DECLARED BECAUSE SOMETHING USES IT. There were
   three — rise, appear and swell — and the stagger used one; the other two were a
   guess about what a later screen would want, which is the exact thing this whole
   approach exists to avoid. The next screen that needs a different entrance adds
   it, with a use. */
@keyframes rise { from { opacity: 0; translate: 0 14px; } }

/* ⚠️ THE STAGGER IS THE POLISH. Six things arriving together is one event; six
   things arriving 38ms apart is a sequence, and a sequence is what makes a screen
   feel composed rather than switched on. It is done with nth-child rather than an
   index prop because a delay is a fact about POSITION, and threading a number
   through every list that ever needs one is how half of them end up without it. */
.stagger > * { animation: rise var(--settle) var(--enter) both; }
.stagger > *:nth-child(1) { animation-delay: 0ms; }
.stagger > *:nth-child(2) { animation-delay: var(--step); }
.stagger > *:nth-child(3) { animation-delay: calc(var(--step) * 2); }
.stagger > *:nth-child(4) { animation-delay: calc(var(--step) * 3); }
.stagger > *:nth-child(5) { animation-delay: calc(var(--step) * 4); }
.stagger > *:nth-child(6) { animation-delay: calc(var(--step) * 5); }
.stagger > *:nth-child(7) { animation-delay: calc(var(--step) * 6); }
/* ⚠️ IT STOPS. Past the seventh row the delay would keep growing and the bottom
   of a long list would arrive after the person had already started reading the
   top. Everything from here on shares the last step. */
.stagger > *:nth-child(n + 8) { animation-delay: calc(var(--step) * 7); }

/* --------------------------------------------------------------- reacting */

/* ⚠️ A PRESS ANSWERS IMMEDIATELY AND RELEASES SLOWLY. The whole feeling of a
   physical control is that asymmetry: 120ms down on a linear-ish curve so it is
   under the finger before the finger notices, and a spring back so it overshoots
   a little on the way out. */
.press { transition: scale var(--swift) var(--spring); }
.press:active { scale: 0.972; transition-duration: var(--quick); transition-timing-function: var(--exit); }

/* ⚠️ AND A ROW PRESSES BY ITS GROUND, NOT BY ITS SIZE. Scaling a full-width row
   makes its text shear against the row above; the ground is what the finger is
   on, so the ground is what responds. */
.press-flat { transition: background-color var(--swift) var(--move); }

/* ⚠️ THE ICON MOVES, AND IT MOVES THE WAY THE WORD BESIDE IT MEANS. Four named
   movements, assigned per icon, rather than a bespoke animation each: a set of
   four is a language, and a set of twenty is decoration nobody can keep in step.
   They play on the ROW's press, not on the icon's, because the row is the target
   and an icon that only reacts to being hit exactly is an icon that never
   reacts. */
[data-move] { transition: translate var(--swift) var(--spring), rotate var(--swift) var(--spring), scale var(--swift) var(--spring); }
.item:active [data-move='down'], .entry:active [data-move='down'] { translate: 0 3px; }
.item:active [data-move='right'], .entry:active [data-move='right'] { translate: 3px 0; }
.item:active [data-move='tilt'], .entry:active [data-move='tilt'] { rotate: -12deg; }
.item:active [data-move='swell'], .entry:active [data-move='swell'] { scale: 1.16; }

/* ⚠️ THE CHEVRON LEANS INTO THE PRESS. It is the one piece of furniture on a row
   that points at what happens next, so it is the one that should move first. Its
   base rule lives with its colour, in the screen's own sheet — a class may be
   declared once, and refined anywhere. */
.item:active .chevron { translate: 3px 0; }

/* ------------------------------------------------------------------ alive */

/* ⚠️ SLOW ENOUGH TO BE BREATHING RATHER THAN BLINKING. An avatar that moves is
   the difference between a page and a place, but anything under about six
   seconds reads as a thing demanding attention — and a face that demands
   attention on a settings screen is a bug. */
@keyframes breathe {
  0%, 100% { scale: 1; rotate: 0deg; }
  50% { scale: 1.035; rotate: 0.8deg; }
}
.alive { animation: breathe 7s ease-in-out infinite; }
/* ⚠️ OUT OF STEP WITH EACH OTHER. A column of avatars breathing in unison is a
   heartbeat, which is alarming; the same movement at different offsets is a room
   with people in it. */
.alive:nth-child(2n) { animation-delay: -2.3s; animation-duration: 8s; }
.alive:nth-child(3n) { animation-delay: -4.1s; animation-duration: 6.4s; }

/* ⚠️ EVERY ANIMATION IN THE PLATFORM STOPS HERE, INCLUDING ONES ADDED LATER.
   The universal selector is deliberate: a rule that lists the classes it knows
   about is a rule that silently stops covering the next one somebody writes. The
   1ms is not zero because an animation with no duration never fires its END
   event, and code that waits for one — a presence-aware unmount, for instance —
   would hang instead of finishing instantly. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
`.trim();
