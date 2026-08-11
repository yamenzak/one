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
[data-one='shell'] { display: grid; min-block-size: 100dvh; background: var(--canvas); color: var(--canvas-ink); }
[data-one='pane'] { container-type: inline-size; container-name: pane; overflow-y: auto; }
[data-one='surface'] { border-radius: var(--radius-lg); background: var(--surface-1); }
[data-one='surface'][data-depth='0'] { background: var(--canvas); border-radius: 0; }

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
[data-one='row'] + [data-one='row'] { box-shadow: inset 0 var(--edge) 0 var(--surface-2); }
[data-one='button'] { min-block-size: 3rem; min-inline-size: 3rem; border-radius: 999px; }
/* ⚠️ THE EDGE BELONGS TO THE ONE KIND THAT HAS NO FILL. Drawn on all four, a
   ghost button is an outlined button and the hierarchy between them is gone. */
[data-one='button'][data-kind='tonal'] { border: var(--edge) solid currentColor; }
[data-one='button'][data-kind='primary'] { background: var(--surface-1-accent); color: var(--surface-1-accent-ink); }

/* ── THE PAGE. One stated order: sky 0 · content 1 · floating chrome 3. */
[data-one='page'] { position: relative; isolation: isolate; min-block-size: 100%; }
[data-one='hero'], [data-one='body'] { position: relative; z-index: 1; }
[data-one='hero'] { padding: 0 var(--pad) calc(1.75 * var(--gap)); }
[data-one='body'] { padding: 0 var(--pad) calc(3 * var(--gap)); display: flex; flex-direction: column; gap: var(--gap); }
/* ⚠️ A SCREEN WITH NO HERO STILL NEEDS A TOP. The sky sits immediately before
   the body only when there is no hero, so this is the one selector that can tell
   — and without it a feed's first card is welded to the status bar. */
[data-one='sky'] + [data-one='body'] { padding-block-start: var(--gap); }

/* ── THE TOPS. Each archetype's, and nothing shared but the inset. */
[data-one='app-bar'] { display: flex; align-items: center; justify-content: space-between; gap: calc(0.5rem * var(--density)); padding-block-start: calc(0.5rem * var(--density)); }
[data-one='app-bar-leading'] { inline-size: 2.5rem; block-size: 2.5rem; border-radius: 999px; background: var(--surface-2); color: var(--surface-2-ink); border: 0; }
[data-one='crown'] { display: flex; flex-direction: column; align-items: center; gap: calc(0.375rem * var(--density)); margin-block-start: calc(2.125rem * var(--density)); text-align: center; }
[data-one='amount'] { font-size: var(--t-hero); font-weight: var(--w-bold); line-height: 1; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
/* ⚠️ The cents are smaller. A balance is read as a magnitude, and full-size
   cents make the eye read two numbers where the person wanted one. */
[data-one='amount-fraction'] { font-size: 0.62em; }
[data-one='crown-under'] { display: flex; align-items: center; gap: calc(0.5rem * var(--density)); opacity: 0.62; font-size: var(--t-sub); }
[data-one='topic'] { display: flex; align-items: center; justify-content: center; gap: calc(0.5rem * var(--density)); margin-block-start: calc(2.75rem * var(--density)); }
[data-one='topic-title'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; }
[data-one='page-title'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; padding: calc(1.5rem * var(--density)) 0 calc(1rem * var(--density)); }
[data-one='search'] { display: flex; align-items: center; gap: calc(0.75rem * var(--density)); block-size: 3.25rem; padding: 0 var(--row-pad); border-radius: 999px; background: var(--surface-1); }
[data-one='identity'] { display: flex; flex-direction: column; align-items: center; gap: calc(0.5rem * var(--density)); margin-block-start: calc(1.5rem * var(--density)); text-align: center; }
[data-one='face'] { display: grid; place-items: center; inline-size: 6rem; block-size: 6rem; border-radius: 999px; background: var(--surface-2-accent); color: var(--surface-2-accent-ink); font-size: var(--t-hero); font-weight: var(--w-bold); }
[data-one='identity-name'] { font-size: var(--t-page); font-weight: var(--w-bold); line-height: 1.1; letter-spacing: -0.02em; }

/* ── QUICK ACTIONS. A circle in a well, and the label is never optional. */
[data-one='quick-actions'] { display: flex; justify-content: center; gap: calc(1.125rem * var(--density)); margin-block-start: calc(1.625rem * var(--density)); }
[data-one='quick-action'] { flex: 1; display: flex; flex-direction: column; align-items: center; gap: calc(0.625rem * var(--density)); background: none; border: 0; color: inherit; }
[data-one='quick-action-well'] { display: grid; place-items: center; inline-size: 3rem; block-size: 3rem; border-radius: 999px; background: var(--surface-2); color: var(--surface-2-ink); }

/* ── SECTIONS. ⚠️ The header sits OUTSIDE the card unless the page is a feed. */
[data-one='section'] { display: flex; flex-direction: column; }
[data-one='section-header'] { display: flex; align-items: baseline; justify-content: space-between; gap: calc(0.5rem * var(--density)); padding: 0 calc(0.25rem * var(--density)) calc(0.5rem * var(--density)); }
[data-one='section-header'][data-placement='inside'] { padding: var(--row-pad) var(--row-pad) calc(0.5rem * var(--density)); }
[data-one='section-total'] { opacity: 0.62; font-size: var(--t-sub); font-variant-numeric: tabular-nums; }
[data-one='section-card'] { border-radius: var(--radius-lg); background: var(--surface-1); color: var(--surface-1-ink); overflow: hidden; box-shadow: var(--elevation); }
[data-one='section-more'] { inline-size: 100%; padding: calc(0.625rem * var(--density)) 0; background: none; border: 0; color: inherit; text-align: center; }
/* ⚠️ A SCROLLER IS THE ONE THING THAT LEAVES THE PAGE INSET, so its first item
   lines up with everything above it and its last is cut — which is what says
   there is more. One that fits inside looks like a row that failed to fill. */
[data-one='section'][data-bleed] { margin-inline: calc(-1 * var(--pad)); }
[data-one='section'][data-bleed] > [data-one='section-header'] { padding-inline-start: calc(var(--pad) + 0.25rem); }
[data-one='section'][data-bleed] > [data-one='section-card'] { background: none; border-radius: 0; box-shadow: none; }
[data-one='scroller'] { display: flex; gap: calc(0.875rem * var(--density)); overflow-x: auto; padding: 0 var(--pad) calc(0.875rem * var(--density)); scrollbar-width: none; }
[data-one='scroller'] > * { flex: none; }

/* ── LEADS. The row's JOB decides which, and a list never mixes the two. */
[data-one='glyph'] { display: grid; place-items: center; inline-size: 1.5rem; block-size: 1.5rem; color: inherit; }
[data-one='medallion'] { display: grid; place-items: center; inline-size: 2.25rem; block-size: 2.25rem; border-radius: 999px; background: var(--surface-2-accent); color: var(--surface-2-accent-ink); font-size: var(--t-sub); font-weight: var(--w-semi); }

/* ── TILES. A small fixed set of destinations, label BELOW the tile. */
[data-one='tile-grid'] { display: grid; grid-template-columns: repeat(var(--across, 4), 1fr); gap: calc(0.75rem * var(--density)) calc(0.625rem * var(--density)); }
[data-one='tile'] { display: flex; flex-direction: column; align-items: center; gap: calc(0.5rem * var(--density)); background: none; border: 0; color: inherit; }
[data-one='tile-face'] { inline-size: 100%; aspect-ratio: 1; border-radius: var(--radius); background: var(--surface-2); color: var(--surface-2-ink); }

/* ── SEGMENTED. ⚠️ One indicator that travels, drawn behind the row. */
[data-one='segmented'] { position: relative; isolation: isolate; display: flex; gap: calc(0.25rem * var(--density)); margin: 0 var(--row-pad) calc(0.75rem * var(--density)); padding: calc(0.1875rem * var(--density)); border-radius: 999px; background: var(--surface-2); }
[data-one='segmented']::before { content: ""; position: absolute; z-index: -1; inset-block: calc(0.1875rem * var(--density)); inset-inline-start: calc(0.1875rem * var(--density)); inline-size: calc((100% - 0.375rem * var(--density)) / var(--of, 2)); border-radius: 999px; background: var(--surface-3); transform: translateX(calc(var(--at, 0) * 100%)); }
[data-one='segment'] { flex: 1; padding: calc(0.4375rem * var(--density)) 0; background: none; border: 0; color: inherit; opacity: 0.62; font-size: var(--t-sub); font-weight: var(--w-med); border-radius: 999px; }
[data-one='segment'][aria-selected='true'] { opacity: 1; }

/* ── PROMO. A lit card, and the only one on a screen. */
[data-one='promo'] { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: var(--row-pad); min-block-size: 6rem; padding: 0 calc(1.125rem * var(--density)); border-radius: var(--radius-lg); background: var(--surface-2); color: var(--surface-2-ink); }

/* ⚠️ Hover is an enhancement. A touch device must never inherit one that sticks. */
@media (pointer: fine) {
  [data-one='row'][data-interactive]:hover { background: var(--surface-2); }
  [data-one='tile']:hover [data-one='tile-face'] { background: var(--surface-3); }
  [data-one='quick-action']:hover [data-one='quick-action-well'] { background: var(--surface-3); }
}
/* ⚠️ And a coarse pointer gets the roomy scale at ANY width: a tablet is not a small desktop. */
@media (pointer: coarse) { :root { --density: 1; } }

/* A pane-capable surface asks its container, never the window. */
@container pane (min-width: 40rem) { [data-one='row'] { gap: calc(1rem * var(--density)); } }
@container pane (min-width: 56rem) { [data-one='collection'] { column-count: 2; } }
/* ⚠️ The page inset widens with the PANE, not the window: the same page in a
   detail pane and at full width is the same page, and it must not be told
   otherwise by a query about the monitor. */
@container pane (min-width: 48rem) { [data-one='body'], [data-one='hero'] { padding-inline: calc(2 * var(--pad)); } }

/* The shell's own shape is the one genuine question about the device. */
@media (min-width: 48rem) { [data-one='shell'] { grid-template-columns: 6rem 1fr; } }
@media (min-width: 68.75rem) { [data-one='shell'][data-shape='two-pane'] { grid-template-columns: 6rem 21rem 1fr; } }
@media (min-width: 87.5rem) { [data-one='shell'][data-shape='board'] { grid-template-columns: 6rem 1fr 20rem; } }

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
