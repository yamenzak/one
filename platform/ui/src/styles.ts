/**
 * THE STYLESHEET — emitted, never hand-written.
 *
 * ⚠️ INSIDE A PANE, A VIEWPORT BREAKPOINT IS A LIE. A record built for a
 * full-width panel and dropped into a narrow pane keeps every breakpoint
 * answering yes: nothing on it is wrong, it is answering a question about the
 * wrong box. Labels wrap, a one-line description runs to four, and a select is
 * wider than the column it is in.
 *
 * So every surface that can appear in a pane sizes itself against its CONTAINER.
 * Viewport queries survive for exactly one thing — the shell's own shape, and
 * whether a pane exists at all — because that IS a question about the device.
 *
 * ⚠️ AND THIS IS THE HALF A COMPONENT LIBRARY CANNOT HAVE AN OPINION ABOUT.
 * daisyUI draws what a thing IS — the pill, the card, the track. It does not know
 * what screen the thing is on, so where it sits, how far apart, in what rhythm
 * and in what order it arrives are all here, keyed off `data-one`.
 */

import { tokensFor, type Brand } from "./brand.js";
import { SKY, skySheet } from "./sky.js";
import { CLOCK, CHOREOGRAPHY } from "./motion.js";
import { daisySheet } from "./daisy.js";
import type { Theme } from "./ground.js";

/*
  ⚠️ THE SHELL IS THE ONLY PLACE A VIEWPORT QUERY IS LEGITIMATE, and the check is
  structural rather than a constant to compare against: every `@media
  (min-width)` block in the sheet must mention the shell. A named selector would
  be one more thing to keep in step with the CSS it describes.
*/

const declarations = (brand: Brand, theme: Theme): string =>
  Object.entries(tokensFor(brand, theme)).map(([name, value]) => `  ${name}: ${value};`).join("\n");

/**
 * A brand becomes two themes of tokens.
 *
 * ⚠️ BOTH THEMES ARE ALWAYS EMITTED, and the dark one is scoped so an explicit
 * choice wins in either direction. A palette defined only inside a media query
 * has no value at all when the root carries an explicit attribute, and the
 * symptom is a page with no background at all on one setting.
 */
export function themeSheet(brand: Brand): string {
  return [
    `:root {\n${declarations(brand, "light")}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${declarations(brand, "dark")}\n  }\n}`,
    `:root[data-theme='dark'] {\n${declarations(brand, "dark")}\n}`,
  ].join("\n\n");
}

/**
 * THE SCALE — the numbers a tenant does not move.
 *
 * ⚠️ FIVE TYPE SIZES AND NO MORE. The calm is not the typeface; it is that a
 * screen contains four sizes and one big number. A sixth is a decision somebody
 * made on one screen and nobody made anywhere else. The ladder was VERIFIED by
 * ratio against a reference at a 390pt frame rather than chosen by eye — §5.
 *
 * ⚠️ AND THE CLOCK IS NOT HERE. Timing lives in `motion.ts`, which is the whole
 * of the choreographer — this file held a copy for one increment and that copy
 * was already a second definition of durations that file defines.
 */
export const SCALE = `
:root {
  /* Five sizes, verified by ratio at a 390pt frame. */
  --t-hero: 34px; --t-page: 26px; --t-body: 14px; --t-sub: 12px; --t-meta: 10px;
  --w-bold: 700; --w-semi: 600; --w-med: 500;
  /* Three spaces: the page inset, the gap between sections, the row inset. */
  --pad: calc(14px * var(--density)); --gap: calc(22px * var(--density)); --row-pad: calc(14px * var(--density));
}
`.trim();

/**
 * The structural sheet: everything that is not a colour.
 *
 * ⚠️ CONTAINER QUERIES THROUGHOUT. `@container` asks the box; `@media` asks the
 * window, and the window is not the box the content is in.
 */
export const STRUCTURE = `
/* The content area is a container, so anything inside it can ask about IT. */
[data-one='shell'] { position: relative; display: grid; min-block-size: 100dvh; background: var(--canvas); color: var(--canvas-ink); }
[data-one='pane'] { container-type: inline-size; container-name: pane; overflow-y: auto; }
/* ⚠️ THE SHADOW IS THE DEPTH IN LIGHT AND NOTHING AT ALL IN DARK — one token
   per depth, so a surface never has to know which theme it is in. */
[data-one='surface'] { border-radius: var(--radius-lg); background: var(--surface-1); box-shadow: var(--elevation-1); }
[data-one='surface'][data-depth='2'] { background: var(--surface-2); color: var(--surface-2-ink); box-shadow: var(--elevation-2); }
[data-one='surface'][data-depth='3'] { background: var(--surface-3); color: var(--surface-3-ink); box-shadow: var(--elevation-3); }
[data-one='surface'][data-depth='0'] { background: var(--canvas); border-radius: 0; box-shadow: none; }

/* ── TEXT. A role, never a size — and the ladder is the one in UI.md §5.1. */
[data-one='text'] { display: block; }
[data-one='text'][data-role='display'] { font-size: var(--t-hero); font-weight: var(--w-bold); line-height: 1; letter-spacing: -0.03em; }
[data-one='text'][data-role='title'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; }
[data-one='text'][data-role='subtitle'] { font-size: var(--t-body); font-weight: var(--w-semi); line-height: 1.25; }
[data-one='text'][data-role='body'] { font-size: var(--t-body); font-weight: var(--w-med); line-height: 1.3; }
[data-one='text'][data-role='caption'] { font-size: var(--t-sub); font-weight: 400; line-height: 1.3; }
[data-one='text'][data-role='micro'] { font-size: var(--t-meta); font-weight: var(--w-med); line-height: 1.2; }
/* ⚠️ Muted is an OPACITY of the measured ink, never a second grey: a grey is a
   colour that stops clearing the floor the moment the surface under it moves. */
[data-one='text'][data-muted] { opacity: 0.62; }
[data-one='text'][data-numeric], [data-numeric] { font-variant-numeric: tabular-nums; }

/* ⚠️ The hit-area floor, applied to the ROW rather than the glyph inside it. */
[data-one='row'] { display: flex; align-items: center; gap: calc(0.75rem * var(--density)); min-block-size: 3.25rem; inline-size: 100%; padding: calc(0.6875rem * var(--density)) var(--row-pad); background: none; border: 0; color: inherit; text-align: start; }
/* ⚠️ THE BODY TAKES THE SLACK AND THE VALUE IS PUSHED TO THE EDGE. Without
   this the value sits against the title and a column of them does not line up —
   which is what makes a list read as a paragraph with numbers in it. */
[data-one='row-body'] { flex: 1; min-inline-size: 0; }
[data-one='row-value'] { margin-inline-start: auto; text-align: end; font-variant-numeric: tabular-nums; }
/* ⚠️ A SEPARATOR INSIDE THE CARD IS NOT AN OUTLINE AROUND IT. §5.1 forbids the
   second and needs the first: without it two rows of two lines each read as one
   row of four. It is drawn from the ladder, so it moves with the surface. */
/* ⚠️ A LEAD NEVER SHRINKS. It is an avatar or an icon — a fixed object — and in
   a flex row without this a long title squashes it into an ellipse. */
[data-one='row-lead'] { display: inline-flex; flex: none; align-items: center; }
[data-one='row'] + [data-one='row'] { box-shadow: inset 0 var(--edge) 0 var(--surface-2); }
/* ⚠️ THE REASON IS A CAPTION UNDER THE CONTROL. Inside the pill it concatenates
   with the label — "PublishNot in your plan" — because a pill is a one-line
   inline box and nothing in the markup said otherwise. */
[data-one='control'] { display: inline-flex; flex-direction: column; align-items: stretch; gap: calc(0.375rem * var(--density)); }
[data-one='reason'] { font-size: var(--t-sub); line-height: 1.3; opacity: 0.62; text-align: center; }
[data-one='control'][data-state='locked'] [data-one='reason'] { opacity: 1; }

/* ⚠️ BUSY IS A STATE THE LANGUAGE DECLARES, AND IT DREW NOTHING. The markup set
   the native disabled flag and stamped the state, so a button mid-request was
   identical to one that is simply unavailable — the press appeared to do nothing
   at all, which is the exact moment somebody presses again. The label STAYS:
   replacing it with a spinner loses what is being waited for. */
[data-one='button'][data-state='busy'] { position: relative; }
[data-one='button'][data-state='busy'] [data-one='button-label'] { opacity: 0.35; }
[data-one='button'][data-state='busy']::after {
  content: ""; position: absolute; inset-block-start: 50%; inset-inline-start: 50%;
  inline-size: 1.05em; block-size: 1.05em; margin: -0.525em 0 0 -0.525em;
  border-radius: 999px; border: var(--edge) solid currentColor; border-block-start-color: transparent;
}
[data-one='button'] { display: inline-flex; align-items: center; justify-content: center; min-block-size: 3rem; min-inline-size: 3rem; border-radius: 999px; }
/* ⚠️ THE EDGE BELONGS TO THE ONE KIND THAT HAS NO FILL, and it is a HAIRLINE OF
   THE INK rather than full-strength currentColor — which draws a black outline
   on a white pill and reads as a different component rather than as a quieter
   one. Every other kind is explicitly edgeless, because the library draws its
   own border and a button that inherits one at random looks like a mistake. */
[data-one='button'] { border: 0; }
[data-one='button'][data-kind='tonal'] { border: var(--edge) solid color-mix(in oklab, currentColor 24%, transparent); }
[data-one='button'][data-kind='primary'] { background: var(--surface-1-accent); color: var(--surface-1-accent-ink); }

/* ── THE NAVIGATION SURFACE. ⚠️ IT HAD NO RULES AT ALL, so the one thing the
      boundary most insists an app must not build rendered as three bare browser
      buttons. An island at a phone width and a rail above it — the same list,
      never both, because a rail AND a bar is two answers to "where am I". */
[data-one='nav'] { display: flex; gap: calc(0.25rem * var(--density)); }
[data-one='nav-item'] { display: flex; flex-direction: column; align-items: center; gap: calc(0.1875rem * var(--density));
  flex: 1; min-block-size: 3.25rem; padding: calc(0.375rem * var(--density)) calc(0.5rem * var(--density));
  border: 0; border-radius: var(--radius); background: none; color: inherit; opacity: 0.55; }
[data-one='nav-item'][data-active] { opacity: 1; background: var(--surface-2); color: var(--surface-2-ink); }
/* ⚠️ ON AN ISLAND THE ACTIVE ITEM IS A STEP ABOVE THE ISLAND, NOT THE SAME STEP.
   The island is already surface-2, so the pill was the ground it sat on and the
   current destination was marked by opacity alone — which is exactly as visible
   as not being marked. */
[data-one='nav'][data-placement='island'] [data-one='nav-item'][data-active] { background: var(--surface-3); color: var(--surface-3-ink); box-shadow: var(--elevation-1); }
[data-one='nav-icon'] { display: grid; place-items: center; }
/* ⚠️ The label travels with the icon — an icon-only rail item is unnamed to
   voice control and ambiguous to everybody else. */
[data-one='nav-label'] { font-size: var(--t-meta); font-weight: var(--w-med); line-height: 1; }
/* ⚠️ THE ISLAND FLOATS OVER THE PAGE, AND IT IS POSITIONED AGAINST THE SHELL.
   It was sticky to the block END while being the FIRST child of the grid — and
   sticky resolves against an element's own flow position, so it pinned to the
   top of the screen and sat across the hero. The shell is the containing block;
   the pane below reserves room so the last row of a list is not under it. */
[data-one='nav'][data-placement='island'] { position: absolute; inset-block-end: calc(0.75rem * var(--density)); inset-inline: var(--pad); z-index: 3;
  padding: calc(0.25rem * var(--density)); border-radius: 999px;
  background: var(--surface-2); color: var(--surface-2-ink); box-shadow: var(--elevation-3); }
[data-one='shell'][data-width='phone'] [data-one='pane'] { padding-block-end: calc(5.5rem * var(--density)); }
[data-one='nav'][data-placement='island'] [data-one='nav-item'] { border-radius: 999px; }
[data-one='nav'][data-placement='rail'] { flex-direction: column; gap: calc(0.5rem * var(--density));
  padding: var(--pad) calc(0.5rem * var(--density)); }
[data-one='nav'][data-placement='rail'] [data-one='nav-item'] { flex: none; }

/* ── THE PAGE. One stated order: sky 0 · content 1 · floating chrome 3. */
[data-one='page'] { position: relative; isolation: isolate; min-block-size: 100%; }
[data-one='hero'], [data-one='body'] { position: relative; z-index: 1; }

/* ⚠️ THE LIVE SURFACE IS THE FOURTH LAW MADE VISIBLE — position decides, not the
   caller — AND ITS FOUR PRESENTATIONS HAD NO RULES AT ALL. One element is
   rendered once and never remounted, so what a presentation means is entirely
   this block: without it full, dock, pane and detached were four names
   for the same box in normal flow, and the whole mechanism was a data attribute
   nobody could see. */
[data-one='live'] { position: relative; z-index: 4; }
[data-one='live'][data-presentation='full'] {
  position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column;
  background: var(--canvas); color: var(--canvas-ink);
}
/* ⚠️ THE DOCK CLEARS THE NAVIGATION rather than sitting under it. A bar that a
   nav island covers is a control somebody can see and cannot press. */
[data-one='live'][data-presentation='dock'] {
  position: fixed; inset-inline: calc(0.75rem * var(--density)); inset-block-end: calc(5rem * var(--density)); z-index: 5;
  display: flex; align-items: center; gap: var(--row-pad); min-block-size: 3.5rem;
  padding: 0 calc(1rem * var(--density)); border-radius: var(--radius-lg);
  background: var(--surface-2); color: var(--surface-2-ink); box-shadow: var(--elevation-3);
}
/* ⚠️ IN A PANE IT IS ORDINARY CONTENT. This is the presentation with no chrome
   of its own, and that is the point: at a width with room for it, a live surface
   is not an overlay. */
[data-one='live'][data-presentation='pane'] { display: block; inline-size: 100%; border-radius: var(--radius-lg); overflow: hidden; }
/* ⚠️ DETACHED IS SMALL, CORNERED AND ON TOP — the picture-in-picture. It is the
   only presentation that may cover content, so it is also the only one bounded
   to a size somebody can work around. */
[data-one='live'][data-presentation='detached'] {
  position: fixed; inset-inline-end: calc(0.75rem * var(--density)); inset-block-end: calc(5rem * var(--density)); z-index: 6;
  inline-size: min(16rem, 42vw); border-radius: var(--radius-lg); overflow: hidden;
  background: var(--surface-2); color: var(--surface-2-ink); box-shadow: var(--elevation-3);
}
[data-one='live'][data-presentation='none'] { display: contents; }
[data-one='hero'] { padding: 0 var(--pad) calc(1.75 * var(--gap)); }
[data-one='body'] { padding: 0 var(--pad) calc(3 * var(--gap)); display: flex; flex-direction: column; gap: var(--gap); }
/* ⚠️ A SCREEN WITH NO HERO STILL NEEDS A TOP. The sky sits immediately before
   the body only when there is no hero, so this is the one selector that can tell
   — and without it a feed's first card is welded to the status bar. */
[data-one='sky'] + [data-one='body'] { padding-block-start: var(--gap); }

/* ── THE TOPS. Each archetype's, and nothing shared but the inset. */
/* ⚠️ THREE COLUMNS, NOT SPACE-BETWEEN. With a leading circle, a title and an
   action, space-between puts the title wherever the other two leave it — which
   reads as a padding bug rather than as a centring one. The outer columns are
   equal so the middle is centred against the BAR, not against its neighbours. */
/* ⚠️ NO BLOCK PADDING. The bar's height IS the target it holds, so padding on
   top of a min-height is a gap under the row that nothing accounts for — which
   reads as a spacing bug rather than as breathing room. */
[data-one='app-bar'] { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: calc(0.5rem * var(--density)); min-block-size: 3.25rem; }
[data-one='app-bar'] > :last-child { justify-self: end; }
[data-one='app-bar'] > :first-child { justify-self: start; }
[data-one='app-bar-spacer'] { display: block; }
[data-one='app-bar-leading'] { inline-size: 2.5rem; block-size: 2.5rem; border-radius: 999px; background: var(--surface-2); color: var(--surface-2-ink); border: 0; }
[data-one='crown'] { display: flex; flex-direction: column; align-items: center; gap: calc(0.375rem * var(--density)); margin-block-start: calc(2.125rem * var(--density)); text-align: center; }
/* ⚠️ A CURRENCY MARK IS NOT PART OF THE NUMBER. Inheriting the hero size makes
   the symbol as loud as the figure, which is the one thing the crown exists to
   make loud. */
[data-one='amount-prefix'] { font-size: 0.55em; font-weight: var(--w-med); vertical-align: 0.42em; margin-inline-end: 0.08em; opacity: 0.72; }
[data-one='amount'] { font-size: var(--t-hero); font-weight: var(--w-bold); line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
/* ⚠️ The cents are smaller. A balance is read as a magnitude, and full-size
   cents make the eye read two numbers where the person wanted one. */
[data-one='amount-fraction'] { font-size: 0.62em; }
[data-one='crown-under'] { display: flex; align-items: center; gap: calc(0.5rem * var(--density)); opacity: 0.62; font-size: var(--t-sub); }
[data-one='topic'] { display: flex; align-items: center; justify-content: center; gap: calc(0.5rem * var(--density)); margin-block-start: calc(2.75rem * var(--density)); }
[data-one='topic-title'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; }
[data-one='page-title'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; padding: calc(1.5rem * var(--density)) 0 calc(1rem * var(--density)); }
/* ⚠️ THE WIDTH COMES FROM THE CONTAINER AND THERE IS NO EDGE. Both were the
   library's opinion — its input clamps itself at 20rem and draws a border — and
   both are decisions this language already makes. */
[data-one='page-title-search'] { display: flex; align-items: center; gap: calc(0.75rem * var(--density)); inline-size: 100%; block-size: 3.25rem; padding: 0 var(--row-pad); border-radius: 999px; background: var(--surface-1); color: var(--surface-1-ink); }
[data-one='identity-action'] { margin-block-start: calc(0.5rem * var(--density)); }
[data-one='app-bar-action'] { display: inline-flex; align-items: center; gap: calc(0.25rem * var(--density)); }
[data-one='identity'] { display: flex; flex-direction: column; align-items: center; gap: calc(0.5rem * var(--density)); margin-block-start: calc(1.5rem * var(--density)); text-align: center; }
[data-one='face'] { display: grid; place-items: center; inline-size: 6rem; block-size: 6rem; border-radius: 999px; background: var(--surface-2-accent); color: var(--surface-2-accent-ink); font-size: var(--t-hero); font-weight: var(--w-bold); }
[data-one='identity-name'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; }

/* ── QUICK ACTIONS. A circle in a well, and the label is never optional. */
[data-one='quick-action-list'] { display: flex; justify-content: center; gap: calc(1.125rem * var(--density)); margin-block-start: calc(1.625rem * var(--density)); }
[data-one='quick-action'] { flex: 1; display: flex; flex-direction: column; align-items: center; gap: calc(0.625rem * var(--density)); background: none; border: 0; color: inherit; }
[data-one='quick-action-well'] { display: grid; place-items: center; inline-size: 3rem; block-size: 3rem; border-radius: 999px; background: var(--surface-2); color: var(--surface-2-ink); }

/* ── SECTIONS. ⚠️ The header sits OUTSIDE the card unless the page is a feed. */
[data-one='section'] { display: flex; flex-direction: column; }
[data-one='section-header'] { display: flex; align-items: baseline; justify-content: space-between; gap: calc(0.5rem * var(--density)); padding: 0 calc(0.25rem * var(--density)) calc(0.5rem * var(--density)); }
[data-one='section-header'][data-placement='inside'] { padding: var(--row-pad) var(--row-pad) calc(0.5rem * var(--density)); }
[data-one='section-total'] { opacity: 0.62; font-size: var(--t-sub); font-variant-numeric: tabular-nums; }
[data-one='section-card'] { border-radius: var(--radius-lg); background: var(--surface-1); color: var(--surface-1-ink); overflow: hidden; box-shadow: var(--elevation-1); }
[data-one='section-more'] { inline-size: 100%; padding: calc(0.625rem * var(--density)) 0; background: none; border: 0; color: inherit; text-align: center; }
/* ⚠️ A SCROLLER IS THE ONE THING THAT LEAVES THE PAGE INSET, so its first item
   lines up with everything above it and its last is cut — which is what says
   there is more. One that fits inside looks like a row that failed to fill. */
[data-one='section'][data-bleed] { margin-inline: calc(-1 * var(--pad)); }
[data-one='section'][data-bleed] > [data-one='section-header'] { padding-inline-start: calc(var(--pad) + 0.25rem); }
[data-one='section'][data-bleed] > [data-one='section-card'] { background: none; border-radius: 0; box-shadow: none; }
[data-one='scroller'] { display: flex; gap: calc(0.875rem * var(--density)); overflow-x: auto; padding: 0 var(--pad) calc(0.875rem * var(--density)); scrollbar-width: none; }
[data-one='scroller'] > * { flex: none; }

/* ── THE ICON. ⚠️ Five sizes, and every one comes from the POSITION — §5.2.
      An icon that carried its own size would be the same glyph at two sizes on
      two screens, which is what makes a set look assembled rather than drawn. */
[data-one='icon'] { inline-size: 1.25rem; block-size: 1.25rem; display: block; flex: none; }
[data-one='quick-action-well'] [data-one='icon'] { inline-size: 1.3125rem; block-size: 1.3125rem; }
[data-one='tile-face'] [data-one='icon'] { inline-size: 1.5rem; block-size: 1.5rem; }
[data-one='topic-icon'] [data-one='icon'] { inline-size: 1.75rem; block-size: 1.75rem; }
/* ⚠️ THE DISCLOSURE AFFORDANCE, AND IT IS DIMMED RATHER THAN COLOURED. It says
   "there is more here"; it is not a thing to aim at, and at full ink it competes
   with the row's own value for the eye. */
[data-one='row-chevron'] { display: inline-flex; flex: none; margin-inline-start: calc(-0.25rem * var(--density)); opacity: 0.42; }
[data-one='row-chevron'] [data-one='icon'] { inline-size: 1rem; block-size: 1rem; }

/* ⚠️ AN EMPTY STATE IS A COMPOSED BLOCK, NOT THREE STACKED LINES. It had no rule
   at all: the title, the explanation and the way out rendered flush left against
   the surface edge, which reads as content that failed to load rather than as a
   place with nothing in it yet. */
[data-one='empty-state'] {
  display: flex; flex-direction: column; align-items: center; gap: calc(0.5rem * var(--density));
  padding: calc(2.5rem * var(--density)) calc(1.5rem * var(--density)); text-align: center;
}
[data-one='empty-state'] > *:last-child:not(:first-child) { margin-block-start: calc(0.75rem * var(--density)); }
/* ⚠️ A MISSING VALUE OCCUPIES THE SLOT IT IS MISSING FROM. Left to shrink, a row
   whose value is absent closes up and the column of values stops being a column. */
[data-one='no-data'] { display: inline-flex; align-items: center; min-inline-size: 2ch; }
[data-one='medallion'] [data-one='icon'] { inline-size: 1.125rem; block-size: 1.125rem; }
[data-one='page-title-search-icon'] { display: flex; opacity: 0.62; }
[data-one='topic-icon'], [data-one='quick-action-well'], [data-one='tile-face'], [data-one='glyph'] { display: grid; place-items: center; }

/* ── LEADS. The row's JOB decides which, and a list never mixes the two. */
[data-one='glyph'] { display: grid; place-items: center; inline-size: 1.5rem; block-size: 1.5rem; color: inherit; }
[data-one='medallion'] { display: grid; place-items: center; inline-size: 2.25rem; block-size: 2.25rem; border-radius: 999px; background: var(--surface-2-accent); color: var(--surface-2-accent-ink); font-size: var(--t-sub); font-weight: var(--w-semi); }

/* ── TILES. A small fixed set of destinations, label BELOW the tile. */
[data-one='tile-grid'] { display: grid; grid-template-columns: repeat(var(--across, 4), 1fr); gap: calc(0.75rem * var(--density)) calc(0.625rem * var(--density)); }
[data-one='tile'] { display: flex; flex-direction: column; align-items: center; gap: calc(0.5rem * var(--density)); background: none; border: 0; color: inherit; }
[data-one='tile-face'] { inline-size: 100%; aspect-ratio: 1; border-radius: var(--radius); background: var(--surface-2); color: var(--surface-2-ink); }

/* ── SEGMENTED. ⚠️ One indicator that travels, drawn behind the row. */
[data-one='segmented'] { position: relative; isolation: isolate; display: flex; gap: calc(0.25rem * var(--density)); margin: 0 var(--row-pad) calc(0.75rem * var(--density)); padding: calc(0.1875rem * var(--density)); border-radius: 999px; background: var(--surface-2); }
/* ⚠️ THE INDICATOR CARRIES AN ELEVATION, AND IN LIGHT THAT IS THE WHOLE
   SEPARATION. The pale ladder saturates: from a canvas at l 0.93 the third
   surface is a rounding error away from the second, so an indicator that told
   itself apart by a surface step was invisible on every light tenant and the
   control read as one solid bar. That is not a bug in the ladder — light tells
   things apart by what they CAST, which is the stated design — it is a
   component that forgot to cast anything. */
[data-one='segmented']::before { content: ""; position: absolute; z-index: -1; inset-block: calc(0.1875rem * var(--density)); inset-inline-start: calc(0.1875rem * var(--density)); inline-size: calc((100% - 0.375rem * var(--density)) / var(--of, 2)); border-radius: 999px; background: var(--surface-3); box-shadow: var(--elevation-1); transform: translateX(calc(var(--at, 0) * 100%)); }
[data-one='segment'] { flex: 1; padding: calc(0.4375rem * var(--density)) 0; background: none; border: 0; color: inherit; opacity: 0.62; font-size: var(--t-sub); font-weight: var(--w-med); border-radius: 999px; }
[data-one='segment'][aria-selected='true'] { opacity: 1; }

/* ── PROMO. A lit card, and the only one on a screen. */
[data-one='promo-body'] { display: flex; flex-direction: column; gap: calc(0.25rem * var(--density)); min-inline-size: 0; }
[data-one='promo'] { box-shadow: var(--elevation-2); display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: var(--row-pad); min-block-size: 6rem; padding: 0 calc(1.125rem * var(--density)); border-radius: var(--radius-lg); background: var(--surface-2); color: var(--surface-2-ink); }

/* ── THE FORM. ⚠️ Label above, control, hint, then fault — always that order,
      because it is the order somebody reads when the control has just failed. */
[data-one='form'] { display: flex; flex-direction: column; gap: var(--gap); }
[data-one='field'] { display: flex; flex-direction: column; gap: calc(0.375rem * var(--density)); }
[data-one='field-label'] { display: flex; align-items: baseline; justify-content: space-between; gap: calc(0.5rem * var(--density)); }
[data-one='field-fault'] { display: flex; align-items: center; gap: calc(0.375rem * var(--density)); color: var(--tone-danger); }
/* ⚠️ EVERY CONTROL CARRIES THE SAME EDGE, INCLUDING WHEN IT REFUSES. The library
   drops the border on a disabled control, so a form came out with three bordered
   boxes and one without — which reads as a rendering fault rather than as a
   state. A refusing control keeps its shape and loses its CONTRAST, because the
   thing that changed is whether it can be used, not what it is. */
[data-one='input'], [data-one='textarea'], [data-one='select'] {
  inline-size: 100%; min-block-size: 3rem;
  background: var(--surface-1); color: var(--surface-1-ink);
  border: var(--edge) solid color-mix(in oklab, currentColor 20%, transparent);
}
[data-one='input']:disabled, [data-one='textarea']:disabled, [data-one='select']:disabled {
  background: var(--surface-1); color: var(--surface-1-ink); opacity: 0.5;
  border-color: color-mix(in oklab, currentColor 20%, transparent);
}
[data-one='textarea'] { min-block-size: 6rem; }
/* ⚠️ THE INVALID EDGE IS NOT THE MESSAGE. It draws the eye; the words under it
   are what say what to do, which is why a field renders both or neither. */
[data-one='field'][data-invalid] [data-one='input'], [data-one='field'][data-invalid] [data-one='textarea'], [data-one='field'][data-invalid] [data-one='select'] { border-color: var(--tone-danger); }
[data-one='switch'] { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: calc(0.75rem * var(--density)); min-block-size: 3rem; }
[data-one='switch-reason'] { grid-column: 1 / -1; }
[data-one='checkbox'], [data-one='radio-option'] { display: flex; align-items: center; gap: calc(0.625rem * var(--density)); min-block-size: 3rem; }
[data-one='radio'] { display: flex; flex-direction: column; }
[data-one='dial'] { display: flex; align-items: center; gap: calc(0.75rem * var(--density)); }
[data-one='dial-control'] { flex: 1; }
[data-one='dial-value'] { min-inline-size: 3rem; text-align: end; }

/* ── PINNED BARS. ⚠️ They appear only when there is something to say, and they
      sit ABOVE the content rather than in it — a bar in the flow moves the page
      as it appears, under whoever was already reading. */
[data-one='save-bar'], [data-one='bulk-actions'] {
  position: sticky; inset-block-end: 0; z-index: 2;
  display: flex; align-items: center; justify-content: space-between; gap: var(--row-pad);
  padding: calc(0.75rem * var(--density)) var(--row-pad);
  border-radius: var(--radius-lg); background: var(--surface-2); color: var(--surface-2-ink);
  box-shadow: var(--elevation-3);
}
[data-one='save-bar-actions'], [data-one='bulk-actions-list'] { display: flex; align-items: center; gap: calc(0.5rem * var(--density)); }
[data-one='save-bar-save'], [data-one='save-bar-discard'], [data-one='bulk-actions-item'], [data-one='bulk-actions-clear'] {
  min-block-size: 2.5rem; padding: 0 calc(0.875rem * var(--density)); border: 0; border-radius: 999px; background: none; color: inherit;
}
[data-one='save-bar-save'] { background: var(--surface-2-accent); color: var(--surface-2-accent-ink); }
[data-one='bulk-actions-item'][data-tone='error'], [data-one='save-bar-discard'] { color: var(--tone-danger); }

/* ── OVERLAYS. ⚠️ The action is PINNED and only the body scrolls, so it never
      falls below the fold — and the parts had no rules at all until a photograph
      showed a dialog as three unstyled words and two grey boxes. */
/* ⚠️ AN OVERLAY HAS A PLACEMENT, AND WITHOUT ONE IT IS A CARD. A sheet is
   attached to the edge it came from and carries the handle that says it can be
   dragged away; a dialog is centred and demands an answer. Rendered with neither,
   both read as an ordinary panel that happens to contain a question. */
[data-one='overlay'] { display: flex; flex-direction: column; gap: calc(0.75rem * var(--density));
  max-block-size: 100%; padding: var(--row-pad);
  background: var(--surface-2); color: var(--surface-2-ink); box-shadow: var(--elevation-3); }
[data-one='overlay'][data-kind='sheet'], [data-one='overlay'][data-kind='drawer'] {
  border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding-block-start: calc(0.5rem * var(--density));
}
/* ⚠️ THE GRAB HANDLE IS INK, NOT A SURFACE — and that is the same defect the
   segmented indicator had. It is what says a sheet can be pushed away, and it
   was drawn as the deepest surface on a sheet that is already one step below
   it: in dark that is a faint bar, and in light it is nothing at all, because
   the pale ladder has no headroom left at the top. A mark this small can only
   be seen by CONTRASTING with its ground, so it is a fraction of the ink. */
[data-one='overlay'][data-kind='sheet']::before, [data-one='overlay'][data-kind='drawer']::before {
  content: ""; inline-size: 2.25rem; block-size: 0.25rem; border-radius: 999px;
  background: color-mix(in oklab, currentColor 26%, transparent); align-self: center; margin-block-end: calc(0.25rem * var(--density));
}
[data-one='overlay'][data-kind='dialog'] { border-radius: var(--radius-lg); text-align: center; }
[data-one='overlay'][data-kind='dialog'] [data-one='overlay-footer'] { margin-block-start: calc(0.25rem * var(--density)); }
[data-one='overlay'][data-kind='menu'], [data-one='overlay'][data-kind='popover'] { border-radius: var(--radius-lg); }
/* ⚠️ A ROW, so the header can carry a trailing control without the title moving. */
[data-one='overlay-header'] { display: flex; align-items: center; justify-content: space-between; gap: var(--row-pad); }
[data-one='overlay-title'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.15; letter-spacing: -0.02em; }
[data-one='overlay-body'] { flex: 1; min-block-size: 0; overflow-y: auto; }
[data-one='overlay-footer'] { display: flex; gap: calc(0.5rem * var(--density)); }
[data-one='overlay-footer'] > * { flex: 1; }
/* ⚠️ AN OVERLAY'S OWN BUTTONS SIT ON THE OVERLAY, so they take the step above it
   AND the elevation that step needs in light — the fourth place in this sheet
   that separated itself by reaching the top of a ladder with no headroom left.
   A confirm whose two buttons are the same colour as the card behind them is a
   question with no visible answers. */
[data-one='overlay-dismiss'], [data-one='confirm-cancel'], [data-one='confirm-go'] {
  min-block-size: 3rem; padding: 0 calc(1.125rem * var(--density)); border: 0; border-radius: 999px;
  background: var(--surface-3); color: var(--surface-3-ink); box-shadow: var(--elevation-1); font: inherit; font-weight: var(--w-semi);
}
/* ⚠️ THE DESTRUCTIVE HALF IS THE ONE THAT LOOKS DESTRUCTIVE, and it is not the
   default focus: a confirmation whose dangerous answer is the easy one is a
   confirmation that has stopped confirming anything. */
[data-one='confirm-go'] { background: var(--tone-danger); color: var(--tone-danger-ink); }
[data-one='overlay-dismiss'] { align-self: flex-start; }

/* ── READING SURFACES. */
[data-one='page-header'] { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--row-pad); }
/* ⚠️ A HEADER'S ACTION SITS BESIDE ITS TITLE, NOT UNDER IT. The header was a
   column and the action was a child, so every page-level action stacked below
   the description — which reads as a stray button rather than as this page's
   one thing to do. */
[data-one='page-header-text'] { display: flex; flex-direction: column; gap: calc(0.375rem * var(--density)); min-inline-size: 0; }
[data-one='page-header-action'] { flex: none; }
[data-one='page-header-row'] { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--row-pad); }
[data-one='breadcrumb'] ol { display: flex; align-items: center; gap: calc(0.375rem * var(--density)); list-style: none; padding: 0; margin: 0; }
[data-one='breadcrumb-link'] { background: none; border: 0; color: inherit; opacity: 0.62; padding: 0; }
[data-one='steps'] { display: flex; gap: calc(0.5rem * var(--density)); list-style: none; padding: 0; margin: 0; }
[data-one='step'] { flex: 1; padding-block-start: calc(0.5rem * var(--density)); border-block-start: calc(2 * var(--edge)) solid var(--surface-2); opacity: 0.5; }
[data-one='step'][data-state='done'], [data-one='step'][data-state='current'] { border-block-start-color: var(--surface-1-accent); opacity: 1; }
[data-one='pagination'] { display: flex; align-items: center; justify-content: center; gap: var(--row-pad); }
[data-one='pagination-prev'], [data-one='pagination-next'] { min-block-size: 2.75rem; min-inline-size: 2.75rem; display: grid; place-items: center; border: 0; border-radius: 999px; background: var(--surface-2); color: var(--surface-2-ink); }
[data-one='pagination-prev']:disabled, [data-one='pagination-next']:disabled { opacity: 0.38; }
/* ⚠️ A table scrolls in its OWN box, so the page body never scrolls sideways. */
[data-one='table-scroll'] { overflow-x: auto; border-radius: var(--radius-lg); background: var(--surface-1); box-shadow: var(--elevation-1); }
[data-one='table'] { inline-size: 100%; border-collapse: collapse; }
[data-one='table-caption'] { text-align: start; padding: var(--row-pad) var(--row-pad) 0; font-size: var(--t-sub); opacity: 0.62; }
[data-one='table'] th, [data-one='table'] td { padding: calc(0.625rem * var(--density)) var(--row-pad); text-align: start; }
[data-one='table'] th[data-numeric], [data-one='table'] td[data-numeric] { text-align: end; font-variant-numeric: tabular-nums; }
[data-one='table'] tbody tr + tr td { box-shadow: inset 0 var(--edge) 0 var(--surface-2); }
[data-one='stat'] { display: flex; flex-direction: column; gap: calc(0.25rem * var(--density)); }
[data-one='stat-value'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; }
[data-one='stat-trend'][data-tone='success'] { color: var(--tone-success); }
[data-one='stat-trend'][data-tone='error'] { color: var(--tone-danger); }
[data-one='progress'] { display: flex; align-items: center; gap: calc(0.625rem * var(--density)); }
[data-one='progress'] progress { flex: 1; }
[data-one='disclosure-summary'] { display: flex; align-items: center; justify-content: space-between; gap: var(--row-pad); min-block-size: 3rem; cursor: pointer; list-style: none; }
[data-one='disclosure-summary']::-webkit-details-marker { display: none; }
/* ⚠️ THE OPEN PANEL IS INSET FROM ITS SUMMARY. Flush, the two read as one block
   and nothing says which part was revealed. */
[data-one='disclosure-body'] { padding-block: calc(0.25rem * var(--density)) calc(0.875rem * var(--density)); }
[data-one='menu'] { list-style: none; padding: calc(0.375rem * var(--density)); margin: 0; border-radius: var(--radius-lg); background: var(--surface-2); color: var(--surface-2-ink); box-shadow: var(--elevation-3); }
[data-one='menu-item'] { display: flex; align-items: center; gap: calc(0.625rem * var(--density)); inline-size: 100%; min-block-size: 2.75rem; padding: 0 calc(0.625rem * var(--density)); border: 0; border-radius: var(--radius); background: none; color: inherit; text-align: start; }
[data-one='menu-item'][data-tone='error'] { color: var(--tone-danger); }
/* ── FEEDBACK. ⚠️ ONE GRID: mark, message, then whatever can be done about it.
      A margin of auto on each action put the undo and the dismiss
      wherever the text left them, so two toasts of different lengths had their
      buttons in different places. A column that is always there does not move. */
[data-one='callout'], [data-one='toast'] {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center; gap: calc(0.75rem * var(--density));
  padding: calc(0.75rem * var(--density)) var(--row-pad); border-radius: var(--radius-lg);
}
[data-one='callout-body'] { grid-column: 2; display: flex; flex-direction: column; gap: calc(0.125rem * var(--density)); }
[data-one='callout-icon'], [data-one='toast-icon'] { display: grid; place-items: center; }
[data-one='toast'] { box-shadow: var(--elevation-3); }
[data-one='toast-actions'] { display: flex; align-items: center; gap: calc(0.25rem * var(--density)); }
[data-one='toast-undo'], [data-one='toast-dismiss'] {
  min-block-size: 2.5rem; padding: 0 calc(0.625rem * var(--density));
  border: 0; background: none; color: inherit; display: grid; place-items: center;
}
[data-one='toast-dismiss'] { min-inline-size: 2.5rem; padding: 0; }

/* ⚠️ THE QUIET FORM IS THE DEFAULT FOR A MESSAGE INSIDE CONTENT. A saturated
   fill is for something that interrupts; a callout in the middle of a page is
   not interrupting anything, and one volume for both is a product where
   everything shouts and therefore nothing does. */
[data-one='callout'][data-tone='success'] { background: var(--tone-success-soft); color: var(--tone-success-soft-ink); }
[data-one='callout'][data-tone='warning'] { background: var(--tone-warning-soft); color: var(--tone-warning-soft-ink); }
[data-one='callout'][data-tone='danger'] { background: var(--tone-danger-soft); color: var(--tone-danger-soft-ink); }
[data-one='callout'][data-tone='info'] { background: var(--tone-info-soft); color: var(--tone-info-soft-ink); }
/* ⚠️ The CONTAINED form is what a tone takes when it would collide with its ground: the
   colour demotes to an edge and an icon, and the word and the shape carry it. */
[data-one='callout'][data-form='contained'] { background: var(--surface-1); color: var(--surface-1-ink); box-shadow: inset calc(3 * var(--edge)) 0 0 currentColor; }
/* ⚠️ A TOOLTIP IS DECORATION. It is unreachable by touch, so it never carries
   the only copy of anything — and it appears on FOCUS as well, or a keyboard
   never sees it at all. The pointer half sits with the other hover rules. */
[data-one='tooltip'] { position: relative; display: inline-flex; }
[data-one='tooltip-text'] { position: absolute; inset-block-end: 100%; inset-inline-start: 50%; translate: -50% -0.5rem;
  padding: calc(0.375rem * var(--density)) calc(0.625rem * var(--density)); border-radius: var(--radius-sm);
  /* ⚠️ A TOOLTIP FLOATS OVER WHATEVER IT LANDS ON, so it is the one surface here
     that cannot know its ground — which makes the elevation load-bearing rather
     than decorative. Without it a tooltip over a card in light is an unbounded
     block of text. */
  background: var(--surface-3); color: var(--surface-3-ink); box-shadow: var(--elevation-2); font-size: var(--t-sub); white-space: nowrap;
  opacity: 0; pointer-events: none; }
[data-one='tooltip']:focus-within [data-one='tooltip-text'] { opacity: 1; }
[data-one='divider'] { display: flex; align-items: center; gap: var(--row-pad); }

/* ⚠️ A SKELETON WITH NO GEOMETRY IS AN EMPTY BOX, which is worse than a spinner:
   it promises a shape and shows nothing at all. The rows are the row height, and
   the last one is short, because a paragraph does not end flush. */
[data-one='skeleton'] { display: flex; flex-direction: column; gap: calc(0.5rem * var(--density)); }
[data-one='skeleton-row'] { display: block; block-size: 1.25rem; border-radius: var(--radius-sm); }
[data-one='skeleton-row']:last-child { inline-size: 62%; }
/* ⚠️ And a spinner needs a size, or the library draws a 1rem arc nobody sees. */
[data-one='spinner'] { inline-size: 1.75rem; block-size: 1.75rem; }

/* ⚠️ Hover is an enhancement. A touch device must never inherit one that sticks. */
@media (pointer: fine) {
  [data-one='row'][data-interactive]:hover { background: var(--surface-2); }
  /* ⚠️ HOVER FEEDBACK THAT IS INVISIBLE IS NOT FEEDBACK. Both of these lifted to
     the top of the ladder, which in light is where the ladder has stopped — so
     on every pale tenant, pointing at a tile did nothing at all. It LIFTS now,
     which is the same statement in the language a bright room actually reads. */
  [data-one='tile']:hover [data-one='tile-face'] { background: var(--surface-3); box-shadow: var(--elevation-1); }
  [data-one='quick-action']:hover [data-one='quick-action-well'] { background: var(--surface-3); box-shadow: var(--elevation-1); }
  [data-one='tooltip']:hover [data-one='tooltip-text'] { opacity: 1; }
}
/* ⚠️ And a coarse pointer gets the roomy scale at ANY width: a tablet is not a small desktop. */
@media (pointer: coarse) { :root { --density: 1; } }

/* A pane-capable surface asks its container, never the window. */
@container pane (min-width: 40rem) { [data-one='row'] { gap: calc(1rem * var(--density)); } }
/* ⚠️ ONLY THE READY STATE IS A LIST. A collection also renders a skeleton, an
   empty state and a callout, and multi-column flows FRAGMENT them: the empty
   state's way out landed in the second column beside its own title, and the
   danger callout was cut in half with its explanation across the gutter. A row
   is never split either — a name in one column and its time in the next is a
   list that has stopped being a list. */
@container pane (min-width: 56rem) {
  [data-one='collection'][data-state='ready'] { column-count: 2; column-gap: var(--gap); }
  [data-one='collection'][data-state='ready'] > * { break-inside: avoid; }
}
/* ⚠️ The page inset widens with the PANE, not the window: the same page in a
   detail pane and at full width is the same page, and it must not be told
   otherwise by a query about the monitor. */
@container pane (min-width: 48rem) { [data-one='body'], [data-one='hero'] { padding-inline: calc(2 * var(--pad)); } }

/* ⚠️ THE SHELL'S COLUMNS COME FROM ITS OWN ATTRIBUTES, NEVER FROM A MEDIA QUERY.
   This was three viewport queries, and it is the defect the registry itself
   warns about one level up, in its note on what a pane may hold: a shell KNOWS its width — it is a
   prop, and shapeFor has already turned it into a shape — so asking the
   monitor instead means the two can disagree, and they do. A phone-width shell
   inside a narrow container on a wide screen was given a rail column and a
   bottom island in the top row: the navigation surface the boundary most insists
   an app must not build, laid out as neither of the two things it can be.
   The shape already encodes the width, because shapeFor only ever returns
   two-pane at desktop and board at wide. */
[data-one='shell']:not([data-width='phone']) { grid-template-columns: 6rem 1fr; }
[data-one='shell'][data-shape='two-pane'] { grid-template-columns: 6rem 21rem 1fr; }
[data-one='shell'][data-shape='board'] { grid-template-columns: 6rem 1fr 20rem; }

`.trim();

/**
 * The whole sheet for one brand.
 *
 * ⚠️ THE SKY AND THE BRIDGE ARE PART OF IT, NOT EXTRAS AN APP REMEMBERS TO
 * INCLUDE. A screen whose backdrop is opt-in is a screen that ships without one
 * on the app that forgot; and the bridge left out is worse, because nothing
 * breaks — daisyUI simply falls back to its own stock theme and every borrowed
 * object on the page renders in somebody else's brand, beside components of ours
 * that are correct. The first photograph of these five screens showed exactly
 * that: a violet badge on an orange tenant, and nothing anywhere reported it.
 */
export const sheetFor = (brand: Brand): string =>
  [themeSheet(brand), daisySheet(brand), skySheet(brand), CLOCK, SCALE, STRUCTURE, SKY, CHOREOGRAPHY].join("\n\n");
