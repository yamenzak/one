/**
 * THE ACCOUNT HOME'S OWN STYLESHEET.
 *
 * ⚠️ WRITTEN FOR ONE SCREEN, WITH LITERAL VALUES, ON PURPOSE. There is no token
 * system under this yet and there should not be one until a second screen wants
 * the same value — a scale invented before anything uses it is a set of numbers
 * chosen to look complete. What repeats HERE is already a variable, because that
 * is one screen's evidence; what repeats ACROSS screens becomes the platform's,
 * later, with a rule beside it.
 *
 * ⚠️ BOTH THEMES FROM THE FIRST LINE. The viewer has three states, not two: an
 * explicit choice stamps `data-theme`, and the default setting stamps nothing —
 * so the bare block is light, the media query handles the un-stamped default,
 * and the attribute wins in both directions. Retrofitting this is the classic
 * unreadable-page bug and it is cheaper to never have it.
 */

export const ACCOUNT_CSS = `
:root {
  --ink: #16181d;
  --ink-quiet: #61656e;
  --page: #f4f5f7;
  --card: #ffffff;
  --line: #e6e8ec;
  --edge: #d7dae1;
  --accent: #3d5afe;
  --accent-ink: #ffffff;
  --alarm: #c62828;
  --warn-bg: #fdf1dc;
  --warn-ink: #7a5300;
  /* ⚠️ PLACEHOLDERS UNTIL THE PRODUCTS HAVE BRANDS. They exist so a
     cross-product list is scannable at all; the values are chosen only to be
     told apart, and the moment a product has a real mark this becomes a lookup
     rather than three hexes in a stylesheet. */
  --p-kova: #3d5afe;
  --p-scena: #00897b;
  --p-tessa: #c2185b;
  --radius: 14px;
  --gap: 20px;
  --pad: 16px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --ink: #e9ebef;
    --ink-quiet: #969ba6;
    --page: #101216;
    --card: #191c22;
    --line: #23262d;
    --edge: #2c3038;
    --accent: #7c8cff;
    --accent-ink: #10131c;
    --alarm: #ff6b6b;
    --warn-bg: #3a2c10;
    --warn-ink: #f0c064;
    --p-kova: #7c8cff;
    --p-scena: #26a69a;
    --p-tessa: #f06292;
  }
}
:root[data-theme='dark'] {
  --p-kova: #7c8cff;
  --p-scena: #26a69a;
  --p-tessa: #f06292;
  --ink: #e9ebef;
  --ink-quiet: #969ba6;
  --page: #101216;
  --card: #191c22;
  --line: #23262d;
  --edge: #2c3038;
  --accent: #7c8cff;
  --accent-ink: #10131c;
  --alarm: #ff6b6b;
  --warn-bg: #3a2c10;
  --warn-ink: #f0c064;
}

*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 400 16px/1.5 ui-sans-serif, -apple-system, "SF Pro Text", Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
h1, h2, p, ul { margin: 0; padding: 0; }
ul { list-style: none; }

/* ⚠️ ONE COLUMN, CAPPED. An account screen is read, not worked in, and a list of
   workspaces at monitor width is a row of names with a mile of nothing after
   each one. */
.account { max-inline-size: 640px; margin: 0 auto; padding: 32px 20px 64px;
  display: flex; flex-direction: column; gap: var(--gap); }

/* --------------------------------------------------------------- who you are */

.you { display: flex; align-items: center; gap: var(--pad); padding-block-end: 4px; }
.you-text { flex: 1; min-inline-size: 0; }
/* ⚠️ AN ADDRESS IS NOT SET LIKE A NAME. At heading size an email has no spaces
   to break at, so it wrapped mid-word. With no name the heading IS the address,
   and it is set as one: smaller, regular, allowed to break where it must. */
.you h1 { font-size: 24px; font-weight: 620; letter-spacing: -0.02em; line-height: 1.2; }
.you[data-unnamed] h1 { font-size: 17px; font-weight: 500; letter-spacing: 0;
  overflow-wrap: anywhere; }
.face { flex: none; inline-size: 56px; block-size: 56px; border-radius: 999px;
  display: grid; place-items: center; background: var(--accent); color: var(--accent-ink);
  font-size: 19px; font-weight: 600; letter-spacing: 0.02em; }

/* ------------------------------------------------------------------ sections */

section { display: flex; flex-direction: column; gap: 8px; }
h2 { font-size: 13px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
  color: var(--ink-quiet); padding-inline-start: 2px; }

.quiet { color: var(--ink-quiet); font-size: 14px; }

/* ---------------------------------------------------------------------- rows */

/* ⚠️ THE CARD IS THE LIST, NOT THE ROW. Separate cards per row is a stack of
   floating tiles with no relationship; one card with hairlines between reads as
   a list of things that belong together, which is what it is. */
.rows { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  overflow: hidden; }
.rows > li + li { border-block-start: 1px solid var(--line); }

.row { inline-size: 100%; display: flex; align-items: center; gap: 12px;
  min-block-size: 60px; padding: 10px var(--pad); border: 0; background: none;
  color: inherit; font: inherit; text-align: start; cursor: pointer; }
.row:hover { background: color-mix(in oklab, currentColor 4%, transparent); }
.row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.row:active { background: color-mix(in oklab, currentColor 7%, transparent); }
.row-text { flex: 1; min-inline-size: 0; display: flex; flex-direction: column; gap: 1px; }
/* ⚠️ TRUNCATION BELONGS TO A ROW THAT HAS SOMETHING TO ITS RIGHT, and to no
   other kind. In a list of THINGS the title is an identity and the line under it
   is metadata, so a name that wrapped would push the standing pill off the scan
   line it shares with every other row. A DESTINATION row has no pill and no scan
   line: its second line is the whole content, and clipping it mid-sentence —
   "everything in …" — withholds the only thing the row had to say. */
.row-title { font-size: 16px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row:not([data-destination]) .row-text .quiet { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ⚠️ DIMMED, NOT COLOURED. It says "there is more here"; it is not a thing to
   aim at, and at full ink it competes with the row's own value. */
.chevron { flex: none; color: var(--ink-quiet); }

/* ⚠️ DESTRUCTIVE IS THE WORDS, NOT THE WHOLE ROW. A red bar in a list of
   settings reads as an error somebody has to fix; red text on the one row that
   cannot be undone reads as a warning about that row. */
.row[data-danger] .row-title { color: var(--alarm); }

/* ⚠️ THE COLOUR IS THE PRODUCT, THE LETTER IS THE WORKSPACE. One grey square
   per row repeated the title's own first letter and told two workspaces starting
   with the same letter apart not at all — while the product, the one thing a
   cross-product list has to make scannable, was text only. */
.mark { flex: none; inline-size: 36px; block-size: 36px; border-radius: 10px;
  display: grid; place-items: center; font-size: 15px; font-weight: 600;
  background: var(--mark, color-mix(in oklab, currentColor 10%, transparent));
  color: #fff; }
.mark[data-product='kova'] { --mark: var(--p-kova); }
.mark[data-product='scena'] { --mark: var(--p-scena); }
.mark[data-product='tessa'] { --mark: var(--p-tessa); }

/* ⚠️ A STANDING PILL IS ONLY EVER ON A ROW THAT HAS ONE. Rendering "Active" on
   every row is a column of green nobody reads, and the one that needs attention
   stops being the thing that stands out. */
.pill { flex: none; padding: 3px 9px; border-radius: 999px; font-size: 13px; font-weight: 500;
  background: color-mix(in oklab, currentColor 9%, transparent); color: var(--ink-quiet); }
.pill[data-urgent] { background: var(--warn-bg); color: var(--warn-ink); }

/* ⚠️ A PLACEHOLDER HOLDS THE GEOMETRY OF WHAT IS COMING, or the page jumps under
   whoever had started reading it. It carries no text: a sentence is a thing to
   read, and there is nothing here to read yet.

   ⚠️ AND IT IS NOT CALLED GHOST. It was, and that was already the quiet button's
   own name — so every placeholder bar silently inherited a 40px minimum height, a
   border and a pill radius, and the loading state rendered as a stack of empty
   outlined capsules. Nothing failed; the two rules simply merged. The name says what this is, and
   a test now refuses any class declared twice. */
/* ⚠️ DRAWN FROM THE PAGE'S INK, NEVER FROM currentColor. A placeholder stands
   in for content on an element that may have set its own colour — the product
   mark sets white text for its letter, so a currentColor-derived grey came out
   white on a white card and the square was simply not there. The ink token flips
   with the theme, which is the whole reason it can be named here. */
.waiting { background: color-mix(in oklab, var(--ink) 9%, transparent); border-radius: 6px;
  color: transparent; }
.mark.waiting { border-radius: 10px; }
.row-waiting { cursor: default; }
.waiting.line { block-size: 11px; inline-size: 62%; }
.waiting.line.short { inline-size: 34%; block-size: 9px; margin-block-start: 6px; }

/* --------------------------------------------------------------------- empty */

.empty { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius);
  padding: 32px var(--pad); text-align: center; display: flex; flex-direction: column; gap: 6px; }

/* ------------------------------------------------------------------- buttons */

.quiet-button { flex: none; min-block-size: 40px; padding: 0 16px; border-radius: 999px;
  border: 1px solid var(--edge); background: none; color: inherit;
  font: inherit; font-size: 15px; font-weight: 500; cursor: pointer; white-space: nowrap; }
.quiet-button:hover { background: color-mix(in oklab, currentColor 6%, transparent); }
.quiet-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`.trim();
