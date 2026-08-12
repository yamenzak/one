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
  --quick: 150ms;   /* a press, a tick, a colour */
  --swift: 300ms;   /* one control changing state */
  --settle: 500ms;  /* a surface arriving */
  --arrive: 760ms;  /* a whole screen */
  /* ⚠️ THE GAP BETWEEN STAGGERED THINGS. Under about 40ms a stagger reads as one
     block with soft edges rather than as a sequence; past about 90ms the last row
     is visibly waiting its turn. */
  --step: 66ms;
}

/* ---------------------------------------------------------------- arriving */

/* ⚠️ WEIGHT COMES FROM TRAVEL AND TIME TOGETHER, NOT FROM EITHER ALONE. The
   first version moved 14 pixels in 320ms and read as brisk rather than
   substantial: too little distance to see the deceleration, too little time for
   the eye to follow it. 26 pixels over half a second, arriving from very slightly
   under full size, is the same movement with mass. */
/* ⚠️ ONE ENTRANCE, AND IT IS ONLY DECLARED BECAUSE SOMETHING USES IT. There were
   three — rise, appear and swell — and the stagger used one; the other two were a
   guess about what a later screen would want, which is the exact thing this whole
   approach exists to avoid. The next screen that needs a different entrance adds
   it, with a use. */
@keyframes rise { from { opacity: 0; translate: 0 26px; scale: 0.975; } }

/* ⚠️ THE STAGGER IS THE POLISH. Six things arriving together is one event; six
   things arriving 38ms apart is a sequence, and a sequence is what makes a screen
   feel composed rather than switched on. It is done with nth-child rather than an
   index prop because a delay is a fact about POSITION, and threading a number
   through every list that ever needs one is how half of them end up without it. */
/* ⚠️ BACKWARDS, NOT BOTH, AND THE DIFFERENCE IS INVISIBLE UNTIL IT IS NOT. A
   fill mode of BOTH keeps the animation's final values applied FOREVER, and those
   silently win over the element's own declarations — so a screen's collapsing
   header, whose opacity and scale are computed from how far it has scrolled, was
   pinned at whatever a finished entrance left behind and did nothing at all.
   BACKWARDS holds the from-state before the animation and then gets out of the
   way. The entrance looks identical either way; only the element's future
   differs. */
.stagger > * { animation: rise var(--settle) var(--enter) backwards; }
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

/* -------------------------------------------------------------- travelling */

/* ⚠️ A LEVEL IS ONE PLACE AND ITS SCREENS OVERLAP IN IT. Both are in the same
   grid cell for the length of a movement, so the one arriving can travel over the
   one leaving without either being taken out of flow and measured by hand. The
   clip is what stops a screen mid-travel from widening the surface it is
   travelling across, which on a phone is a horizontal scrollbar appearing for
   half a second on every navigation. */
.stack { display: grid; grid-template: 1fr / 1fr; block-size: 100%; overflow: hidden;
  /* ⚠️ ONWARD IS A DIRECTION, NOT A SIGN. In Arabic, going deeper into something
     travels the other way — and a translate has no logical form, so the sign is
     the one thing a stack has to be told. Everything below multiplies by it. */
  --onward: 1; }
.stack:dir(rtl) { --onward: -1; }
/* ⚠️ EACH SCREEN IS ITS OWN SCROLLER, which is what makes a half-read list still
   half-read when you come back to it. Marked rather than assumed: the frame finds
   the nearest thing carrying this, so the same screen works presented over an app
   and mounted as a route. */
.stack-leaf { grid-area: 1 / 1; overflow-y: auto; min-block-size: 0; }

/* ⚠️ THE SCREEN UNDERNEATH MOVES A QUARTER AS FAR, and that ratio is the whole
   effect. Held still, it reads as a card being dealt over a picture; moved the
   same distance, the two are one filmstrip in motion and neither has depth. A
   quarter with a little of the light taken out of it reads as something being
   covered up. */
@keyframes onward-in { from { translate: calc(100% * var(--onward)) 0; } }
@keyframes onward-out { to { translate: calc(-25% * var(--onward)) 0; opacity: 0.55; } }
@keyframes back-in { from { translate: calc(-25% * var(--onward)) 0; opacity: 0.55; } }
@keyframes back-out { to { translate: calc(100% * var(--onward)) 0; } }

/* ⚠️ THE MOVE CURVE, WHICH IS WHAT THIS IS FOR. A screen travelling is not
   arriving from nowhere and not being dismissed — it is being moved, and the move
   curve is the one in the set with a flat middle, so most of the distance is
   covered at an even speed and the ends are where it eases. */
.stack-leaf[data-move='onward'] { animation: onward-in var(--settle) var(--move) backwards; }
.stack-leaf[data-move='back'] { animation: back-in var(--settle) var(--move) backwards; }
/* ⚠️ FORWARDS, AND ONLY HERE. Everything that arrives fills BACKWARDS so it
   leaves the element's future alone; a screen on its way OUT has no future — it
   is removed the instant this ends — and without the fill it snaps back to where
   it started for the frames in between. */
.stack-leaf[data-going][data-move='onward'] { animation: onward-out var(--settle) var(--move) forwards; }
.stack-leaf[data-going][data-move='back'] { animation: back-out var(--settle) var(--move) forwards; }
/* ⚠️ COMING BACK, THE SCREEN LEAVING IS THE ONE ON TOP. It is being taken off to
   reveal what was underneath; painted below, it would leave from behind its own
   parent, which is the same movement read as the wrong one. */
.stack-leaf[data-going][data-move='back'] { z-index: 1; }

/* ⚠️ A SCREEN THAT TRAVELLED DOES NOT ALSO ASSEMBLE ITSELF. Sliding in while its
   sections rise one after another is two entrances for one arrival, and the
   sections finish long after the screen has stopped. It stays suppressed for the
   life of that screen rather than for the life of the movement — released at the
   end, every section would play its entrance half a second late. */
.stack-leaf[data-move] .stagger > * { animation: none; }

/* --------------------------------------------------------------- reacting */

/* ⚠️ A PRESS ANSWERS IMMEDIATELY AND RELEASES SLOWLY. The whole feeling of a
   physical control is that asymmetry: down fast enough to be under the finger
   before the finger notices, and a long spring back that overshoots. Making the
   release LONGER is most of what separates a control that feels sprung from one
   that feels like a state change. */
.press { transition: scale var(--settle) var(--spring); }
.press:active { scale: 0.965; transition-duration: var(--quick); transition-timing-function: var(--exit); }

/* ⚠️ AND A ROW PRESSES BY ITS GROUND, NOT BY ITS SIZE. Scaling a full-width row
   makes its text shear against the row above; the ground is what the finger is
   on, so the ground is what responds. */
.press-flat { transition: background-color var(--swift) var(--move); }

/* ⚠️ EACH ICON MOVES THE WAY ITS OWN PARTS WOULD, and the shared thing is the
   TIMING rather than the movement. Four generic verbs across a set makes every
   icon move like every other one — tidy, and dead. A key turns about its hole; a
   download's arrow falls into a base that stays; a lens closes. That is where an
   icon says what it is.

   ⚠️ THEY PLAY ON THE ROW'S PRESS, not the icon's. The row is the target, and an
   icon that reacts only to being hit exactly is an icon that never reacts.

   ⚠️ AND THEY ADDRESS CHILDREN BY POSITION, which is the fragile part and is
   guarded: test/icon.test.tsx pins every icon's shape, because Lucide redraws
   icons between versions and a redrawn one does not fail — it animates the wrong
   part, quietly, forever. */
[data-icon] { transition: rotate var(--swift) var(--spring), scale var(--swift) var(--spring), translate var(--swift) var(--spring); }
[data-icon] > * { transition: inherit; transform-box: fill-box; transform-origin: center; }

/* ⚠️ ABOUT THE HOLE, WHICH IS THE ONE POINT A KEY DOES NOT MOVE THROUGH. The
   origin is that circle's centre in the 24-unit box — turning about the middle of
   the icon is a key being waved rather than turned.

   ⚠️ AND IT DOES NOT SPRING. This was 28 degrees on the shared spring and it was
   the one movement that read as clunky: the blade is long and its far end is the
   whole length of the icon from the hole, so a big angle throws it across the
   well, and an overshoot on a rotation is a wobble rather than a bounce. A key
   turning in a lock stops where it stops. Small angle, no overshoot — the only
   movement here that opts out of the spring, and this is why. */
.item:active [data-icon='key'] { rotate: -15deg; transform-origin: 68.75% 31.25%; }
[data-icon='key'] { transition: rotate var(--swift) var(--move); }

/* The three uprights are the knobs; the rails they sit on do not move. */
.item:active [data-icon='adjust'] > :nth-child(3) { translate: -3px 0; }
.item:active [data-icon='adjust'] > :nth-child(4) { translate: 3px 0; }
.item:active [data-icon='adjust'] > :nth-child(8) { translate: 3.5px 0; }

/* A shield seals: it settles onto its own point rather than growing. */
.item:active [data-icon='guard'] { scale: 0.94 1.08; transform-origin: 50% 100%; }

/* ⚠️ THE BASE STAYS. That is the whole gesture — something arriving INTO
   something. Moving both is a picture drifting. */
.item:active [data-icon='save'] > :nth-child(1) { translate: 0 2.5px; }
.item:active [data-icon='save'] > :nth-child(3) { translate: 0 2.5px; }

/* The two halves part along the crack. */
.item:active [data-icon='heartbreak'] > :nth-child(1) { translate: 1.4px 0; rotate: 4deg; }
.item:active [data-icon='heartbreak'] > :nth-child(2) { translate: -1px 0; rotate: -3deg; }

/* It lifts off the page, along its own axis. */
.entry:active [data-icon='edit'] { translate: 1.6px -1.6px; }

/* The shutter closes. */
.portrait:active [data-icon='lens'] > :nth-child(2) { scale: 0.45; }

/* ⚠️ THE FLAP LIFTS AND THE ENVELOPE STAYS. The code arrives IN it, which is the
   same gesture as the download's base one card up — and it is the shape of the
   thing, not a verb borrowed from a list of four. */
.item:active [data-icon='letter'] > :nth-child(1) { translate: 0 -1.6px; }

/* ⚠️ THE PHONE WAKES. It is the small screen beside the big one, and the small
   one is the device somebody is signed in on. */
.item:active [data-icon='device'] > :nth-child(4) { scale: 1.14; }

/* ⚠️ THE CORNER LIFTS, AND THE LINES OF TEXT DO NOT. A page opening is the fold
   coming away from the sheet; moving the whole glyph is a document sliding, which
   is filing rather than reading. */
.item:active [data-icon='paper'] > :nth-child(2) { translate: 1.1px -1.1px; }

/* ⚠️ THE HUB STAYS AND THE TWO IT REACHES SWELL. The same gesture as the
   download and the envelope, read the other way round: something arriving AT
   something that does not move. Translating the outer nodes would pull them off
   the ends of their own links, which at this size is two circles and two lines
   coming apart. */
.item:active [data-icon='others'] > :nth-child(1),
.item:active [data-icon='others'] > :nth-child(3) { scale: 1.18; }

/* A plus turns towards being a cross, which is what adding then cancelling is. */
.button:active [data-icon='add'] { rotate: 90deg; }

/* ⚠️ THE MOON CROSSES THE SUN, which is the one gesture that means "the other
   one". Rotating the whole glyph would spin a sun, and a spinning sun is a
   loading indicator. */
.item:active [data-icon='light'] > :nth-child(1) { translate: 2px -1px; }

/* The second alphabet steps forward. */
.item:active [data-icon='tongue'] > :nth-child(6) { translate: 1.5px 1.5px; }

/* ⚠️ A LOCK OPENS BY LIFTING ITS SHACKLE, and the body stays. The same gesture
   as the download and the envelope: something moving relative to something that
   does not. */
.item:active [data-icon='locked'] > :nth-child(2) { translate: 0 -1.5px; }

/* A rule measures: its ticks travel along it. */
.item:active [data-icon='measure'] > :nth-child(3) { translate: 0 1.6px; }
.item:active [data-icon='measure'] > :nth-child(4) { translate: 0 -1.6px; }

/* ⚠️ THESE TWO ARE THE ONLY ICONS THAT MOVE ON A SWITCH ROW, because a switch row
   has no press of its own to speak of — the whole row is the control. The wave
   and the buzz are what the setting IS. */
.switch-row:active [data-icon='buzz'] > :nth-child(1) { translate: -2px 0; }
.switch-row:active [data-icon='buzz'] > :nth-child(2) { translate: 2px 0; }
.switch-row:active [data-icon='sound'] > :nth-child(3) { scale: 1.2; }

/* ⚠️ THE DOT OF AN i IS A SEPARATE THING, and this is the one icon whose parts
   already say so. The ring holds still and the dot lifts off its stem — which is
   both what the shape would do and, on a mark whose whole job is "there is more
   to say here", the smallest possible way of saying it. Its own press, because
   this one sits beside a switch rather than on a row. */
.share-about:active [data-icon='about'] > :nth-child(3) { translate: 0 -2px; }

/* Furniture: it points where the press goes. */
.item:active [data-icon='onward'], .item:active .chevron { translate: 3.5px 0; }
/* ⚠️ AND THE ONE THAT LEAVES POINTS OUT OF THE PAGE, along its own axis. A row
   that opens somebody else's site and a row that opens the next screen must not
   move the same way, or the mark distinguishing them is decoration. */
.item:active [data-icon='outward'] { translate: 2.5px -2.5px; }

/* ------------------------------------------------------------------ alive */

/* ⚠️ SLOW ENOUGH TO BE BREATHING RATHER THAN BLINKING. An avatar that moves is
   the difference between a page and a place, but anything under about six
   seconds reads as a thing demanding attention — and a face that demands
   attention on a settings screen is a bug. */
@keyframes breathe {
  0%, 100% { scale: 1; rotate: 0deg; }
  50% { scale: 1.035; rotate: 0.8deg; }
}
/* ⚠️ A WAIT HAS NO DURATION, WHICH IS WHY ITS RATE IS AMBIENT. Nothing is
   responding — the ring turns for as long as the answer takes — so its period is
   the effect rather than a response time, and it belongs here beside the
   breathing rather than in the sheet of whichever screen happened to need it. */
@keyframes spin { to { rotate: 360deg; } }
.spin { animation: spin 2s linear infinite; }

.alive { animation: breathe 9s ease-in-out infinite; }
/* ⚠️ THE TICK DRAWS ITSELF, because a tick that fades in is a tick that was
   always there. The dash length is the path's own, so the stroke travels from the
   short arm to the long one exactly as a hand would. */
@keyframes strike { from { stroke-dashoffset: 26; } }
[data-icon='tick'] > * { stroke-dasharray: 26; animation: strike var(--settle) var(--enter) backwards; }
/* ⚠️ AND THE BADGE ARRIVES UNDER IT rather than with it, so the disc is there to
   be drawn on. Both together is a sticker being placed; this is a mark being
   made. The badge's own rule lives with its colour, in the screen's sheet — a
   class may be declared once, and refined anywhere. */
@keyframes stamp { from { opacity: 0; scale: 0.4; } }
.verified [data-icon='tick'] > * { animation-delay: var(--swift); }
/* ⚠️ OUT OF STEP WITH EACH OTHER. A column of avatars breathing in unison is a
   heartbeat, which is alarming; the same movement at different offsets is a room
   with people in it. */
.alive:nth-child(2n) { animation-delay: -2.9s; animation-duration: 10.5s; }
.alive:nth-child(3n) { animation-delay: -5.2s; animation-duration: 8.2s; }


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
