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
 */

import { tokensFor, type Brand } from "./brand.js";
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

/* ⚠️ The hit-area floor, applied to the ROW rather than the glyph inside it. */
[data-one='row'] { display: flex; align-items: center; gap: calc(0.75rem * var(--density)); min-block-size: 3rem; inline-size: 100%; text-align: start; }
[data-one='button'] { min-block-size: 3rem; min-inline-size: 3rem; border-radius: 999px; border: var(--edge) solid currentColor; }
[data-one='button'][data-kind='primary'] { background: var(--surface-1-accent); color: var(--surface-1-accent-ink); }

/* ⚠️ Hover is an enhancement. A touch device must never inherit one that sticks. */
@media (pointer: fine) {
  [data-one='row'][data-interactive]:hover { background: var(--surface-2); }
}
/* ⚠️ And a coarse pointer gets the roomy scale at ANY width: a tablet is not a small desktop. */
@media (pointer: coarse) { :root { --density: 1; } }

/* A pane-capable surface asks its container, never the window. */
@container pane (min-width: 40rem) { [data-one='row'] { gap: calc(1rem * var(--density)); } }
@container pane (min-width: 56rem) { [data-one='collection'] { column-count: 2; } }

/* The shell's own shape is the one genuine question about the device. */
@media (min-width: 48rem) { [data-one='shell'] { grid-template-columns: 6rem 1fr; } }
@media (min-width: 68.75rem) { [data-one='shell'][data-shape='two-pane'] { grid-template-columns: 6rem 21rem 1fr; } }
@media (min-width: 87.5rem) { [data-one='shell'][data-shape='board'] { grid-template-columns: 6rem 1fr 20rem; } }

/* ⚠️ Removed, not reduced. Layout may never depend on an animation having run. */
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`.trim();

export const sheetFor = (brand: Brand): string => `${themeSheet(brand)}\n\n${STRUCTURE}`;
