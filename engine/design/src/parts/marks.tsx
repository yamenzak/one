/**
 * THE MARKS WE DRAW OURSELVES, BECAUSE THEIR MOTION IS INSIDE THEM.
 *
 * ⚠️ A TRANSFORM ON THE WHOLE GLYPH IS THE CHEAP VERSION AND IT SHOWS. Rotating
 * a bell is not a bell ringing — the clapper is what moves, and the body barely
 * does. Sliding a whole logout mark sideways is not somebody leaving; the ARROW
 * leaves and the door stays. Every one of those is a motion the icon's own parts
 * make, and no amount of easing on the outside produces it.
 *
 * ⚠️ SO THESE ARE OURS, WITH THE PARTS NAMED. Lucide draws each mark as several
 * paths whose order is the library's business — `svg > path:nth-child(2)`
 * animates whatever lucide happens to put second, and silently animates the
 * wrong thing the day it redraws the icon. A `data-part` we wrote cannot move
 * under us.
 *
 * ⚠️ AND THEY MATCH LUCIDE'S HAND, DELIBERATELY. 24×24, `currentColor`, stroke
 * width 2, round caps and joins — the same skeleton every other mark in the
 * registry has, so a list mixing ours and the library's has one weight. A
 * bespoke icon that is visibly bespoke is worse than a still one.
 *
 * ⚠️ NOTHING HERE ANIMATES ITSELF. The parts are named and the motion is in
 * `GLYPH_MOTION`, so the reduced-motion opt-outs are declared once and cover
 * every mark rather than once per file, which is the shape that eventually
 * misses one.
 */

import * as React from "react";

/**
 * ⚠️ ONE SKELETON, SO EVERY MARK IS THE SAME OBJECT. Size comes from the class
 * its host sets (`[&>svg]:size-*`) and a class beats a presentational attribute,
 * so the numbers below are a FLOOR rather than a scale of our own.
 *
 * ⚠️ AND WITHOUT THEM A MARK IS 0×0 WHEREVER NOTHING SETS A SIZE. Measured: the
 * search glyph in a text field's prefix laid out at zero by zero and simply was
 * not there — no error, no gap, an input that looked like it had no icon because
 * it had none. An SVG carrying only a `viewBox` has no intrinsic size; lucide
 * ships `width` and `height` on every icon and ours did not, so every mark we
 * draw ourselves worked inside a row and vanished everywhere else.
 */
const Mark = ({ children }: { readonly children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width={24}
    height={24}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/**
 * A BELL RINGS BY ITS CLAPPER.
 *
 * ⚠️ THE BODY BARELY MOVES AND THE CLAPPER SWINGS, which is the whole difference
 * between a bell and a rotated picture of one. Rocking the body alone is what a
 * hand does to a bell; the sound is the clapper, and the eye reads it as sound.
 */
export const BellMark = () => (
  <Mark>
    <g data-part="body">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
    </g>
    <g data-part="clapper">
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </g>
  </Mark>
);

/**
 * A CALENDAR TURNS ITS DAYS OVER.
 *
 * ⚠️ THE FRAME IS THE THING AND THE DAYS ARE WHAT CHANGES — a page turning,
 * which is what a calendar is FOR. The old days rise out and the new ones rise
 * in behind them, so the mark reads as time passing rather than as a box being
 * nudged. Two rows exist in the drawing; only one is ever visible.
 */
export const CalendarMark = () => (
  <Mark>
    <g data-part="frame">
      <path d="M8 2v4M16 2v4" />
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18" />
    </g>
    {/* ⚠️ Drawn as short strokes rather than dots: a 1px dot at 20px is a
        smudge, and `currentColor` on a round cap is the same mark the rest of
        the set is made of. */}
    <g data-part="days">
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </g>
    <g data-part="days-next">
      <path d="M8 14h.01M12 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </g>
  </Mark>
);

/**
 * LEAVING IS THE ARROW LEAVING.
 *
 * ⚠️ THE DOOR STAYS PUT. Sliding the whole mark is a picture of a door moving,
 * which is not what happens when somebody signs out — the arrow goes through the
 * opening and the frame is what it went through. It returns rather than
 * vanishing, because the row is still there afterwards.
 */
export const LeaveMark = () => (
  <Mark>
    <g data-part="frame">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    </g>
    <g data-part="arrow">
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </g>
  </Mark>
);

/**
 * SHARING IS THE LINE REACHING THE OTHER TWO.
 *
 * ⚠️ THE NODES STAY PUT AND THE CONNECTION IS WHAT HAPPENS. Moving the dots
 * would be a picture of things being handed over, which is not what sharing is
 * — the thing stays where it is and becomes reachable from elsewhere. The two
 * far nodes light as the line arrives at them.
 */
export const ShareMark = () => (
  <Mark>
    <g data-part="here">
      <circle cx="6" cy="12" r="3" />
    </g>
    <g data-part="link">
      <path d="m8.6 10.5 6.8-3.4" />
      <path d="m8.6 13.5 6.8 3.4" />
    </g>
    <g data-part="them">
      <circle cx="18" cy="5" r="3" />
      <circle cx="18" cy="19" r="3" />
    </g>
  </Mark>
);

/**
 * AN INBOX TAKES SOMETHING IN.
 *
 * ⚠️ SOMETHING ARRIVES; THE TRAY DOES NOT JUMP. The tray was translating down as
 * a whole, which reads as the furniture being knocked rather than as post
 * landing in it. A note drops through the opening and the tray takes the weight.
 */
export const InboxMark = () => (
  <Mark>
    <g data-part="post">
      <path d="M12 3v6" />
      <path d="m9.5 6.5 2.5 2.5 2.5-2.5" />
    </g>
    <g data-part="tray">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4h-2.26" />
    </g>
  </Mark>
);

/**
 * A SHIELD IS SATISFIED BY WHAT IS INSIDE IT.
 *
 * ⚠️ THE TICK DRAWS; THE SHIELD DOES NOT PULSE. A pulse says "look at me", which
 * is what a notification does. A shield's job is to have CHECKED something, and
 * a stroke drawing itself is the only motion that means a check being made.
 */
export const ShieldMark = () => (
  <Mark>
    <g data-part="shell">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    </g>
    <g data-part="tick">
      <path d="m9 12 2 2 4-4" pathLength={1} />
    </g>
  </Mark>
);

/**
 * A TICK IS A STROKE BEING MADE.
 *
 * ⚠️ IT DRAWS, IT DOES NOT POP. Scaling a finished tick is a picture of a tick
 * being emphasised; drawing it is the act it stands for, and it is the one
 * motion nobody has to be taught to read.
 *
 * ⚠️ `pathLength={1}` IS WHAT MAKES THE KEYFRAME PORTABLE. Without it the dash
 * offset has to be the path's real length in user units, which is a number
 * somebody measures once and gets wrong the next time the path is edited.
 */
export const CheckMark = () => (
  <Mark>
    <g data-part="tick">
      <path d="M18 6 7 17l-5-5" pathLength={1} />
    </g>
    <g data-part="tick-two">
      <path d="m22 10-7.5 7.5L13 16" pathLength={1} />
    </g>
  </Mark>
);

/**
 * SOMETHING THAT LOOKS, LOOKS AROUND.
 *
 * ⚠️ THE LENS SWEEPS AND THE HANDLE FOLLOWS IT, which is a hand moving a glass
 * over a page. Rotating the whole mark about its centre swings the handle
 * through the lens, which is a thing no magnifier does.
 */
export const SearchMark = () => (
  <Mark>
    <g data-part="lens">
      <circle cx="11" cy="11" r="8" />
    </g>
    <g data-part="handle">
      <path d="m21 21-4.3-4.3" />
    </g>
  </Mark>
);

/**
 * A KEY TURNS.
 *
 * ⚠️ AND IT TURNS ABOUT ITS OWN BOW, WHICH IS THE WHOLE DIFFERENCE. A key
 * rotated about the middle of its box swings the blade through an arc no lock
 * has; a key rotated about the ring is a hand turning it. The blade is what
 * moves and the ring is where it moves from.
 */
export const KeyMark = () => (
  <Mark>
    <g data-part="key">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 8.3-8.3" />
      <path d="m17 6 2.5 2.5" />
      <path d="m14 9 2.5 2.5" />
    </g>
  </Mark>
);

/**
 * A STACK SETTLES.
 *
 * ⚠️ THE TOP PLATE LANDS AND THE ONES UNDER IT TAKE IT, which is what a stack
 * DOES — the mark for the deployment's own layers is the only one here whose
 * subject is a pile of things sitting on each other. Sliding the whole stack
 * would be a picture of the pile being moved.
 */
export const LayersMark = () => (
  <Mark>
    <g data-part="plate">
      <path d="M12 2 2.5 6.5 12 11l9.5-4.5z" />
    </g>
    <g data-part="under">
      <path d="m2.5 12 9.5 4.5 9.5-4.5" />
      <path d="m2.5 17.5 9.5 4.5 9.5-4.5" />
    </g>
  </Mark>
);

/**
 * AGREED — a seal, not a tick in a line of text.
 *
 * ⚠️ IT IS FILLED, WHICH IS THE WHOLE POINT. Every other mark in the set is a
 * stroke, so this one reads as a STAMP against them rather than as one more
 * outline — which is what "verified" means everywhere anybody has seen it.
 *
 * ⚠️ AND IT CARRIES ITS OWN BLUE, WHICH IS THE ONE HUE IN THE PRODUCT THAT IS A
 * CONVENTION RATHER THAN A CHOICE. This theme is MONOCHROME — the kernel's
 * `info` resolves to the library's `accent`, which here is a grey — so a seal
 * drawn in the theme's own colours is the same value as the words beside it and
 * reads as a decoration. Verified is blue everywhere anybody has seen it, and
 * borrowing that is what makes this legible without a legend.
 *
 * ⚠️ ONE PLACE, NOT A TOKEN, DELIBERATELY. A blue in the theme would be a second
 * brand colour every surface could reach for; a blue in the one mark that means
 * "we hold a record of this" is a fact about that mark. If a second thing ever
 * needs it, that is the moment it becomes a token — not before.
 */
const VERIFIED = "oklch(0.62 0.16 250)";

export const AgreedMark = () => (
  <svg viewBox="0 0 24 24" width={24} height={24} fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill={VERIFIED} />
    {/* ⚠️ KNOCKED OUT IN WHITE RATHER THAN THE SURFACE'S COLOUR. The seal is a
        solid at a fixed value, so the tick has to contrast with the SEAL — a
        surface variable would make it invisible on a light theme's card. */}
    <path
      d="m8 12.5 2.5 2.5 5.5-5.5"
      stroke="#fff"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * A CATALOGUE IS REFRESHED — the arrows go round, once.
 *
 * ⚠️ NOT A SPINNER, AND THE DIFFERENCE MATTERS ON THIS ROW. A mark that keeps
 * turning is a claim that something is still happening, and the thing this row
 * starts takes minutes on a server nobody is watching. One turn says the work was
 * asked for; the row's own label says whether it is running.
 *
 * ⚠️ AND IT IS DRAWN HERE RATHER THAN TAKEN FROM THE LIBRARY because it turns as
 * a WHOLE — which means the mark itself is the moving part, and a mark whose
 * motion is its own needs a `data-part` nothing downstream can renumber.
 */
export const RefreshMark = () => (
  <Mark>
    <g data-part="round">
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </g>
  </Mark>
);

/**
 * A FLAG, AND IT LIFTS.
 *
 * ⚠️ THE CLOTH MOVES AND THE POLE DOES NOT, which is the same rule as the bell
 * and the door: a flag drawn as one shape and nudged is a picture of a flag being
 * carried. What a flag DOES is catch the air.
 */
export const FlagMark = () => (
  <Mark>
    <g data-part="pole">
      <path d="M4 22V4" />
    </g>
    <g data-part="cloth">
      <path d="M4 4h11.5a1 1 0 0 1 .8 1.6L14 9l2.3 3.4a1 1 0 0 1-.8 1.6H4" />
    </g>
  </Mark>
);
