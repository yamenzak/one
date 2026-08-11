/**
 * THE ACCOUNT CENTRE'S STYLESHEET.
 *
 * ⚠️ IT FOLLOWS A REFERENCE, AND NOTHING IN IT IS A PLATFORM DECISION YET. The
 * values are written for these screens; tokens, rules and guards come out of
 * them once the screens are agreed, not before. What is here is a stylesheet for
 * one surface, and it is meant to be read as one.
 *
 * ⚠️ BOTH THEMES FROM THE FIRST LINE. The viewer has three states, not two: an
 * explicit choice stamps `data-theme`, and the default setting stamps nothing —
 * so the bare block is light, the media query handles the un-stamped default,
 * and the attribute wins in both directions.
 */

export const ACCOUNT_CSS = `
:root {
  --page: #f2f2f6;
  --card: #ffffff;
  --well: #ececed;
  --ink: #0b0b0c;
  --ink-quiet: #7a7a80;
  --ink-faint: #b6b6bc;
  --accent: #2f6bff;
  --alarm: #e0362a;
  --alarm-well: #fbe6e4;
  --warn: #8a5a00;
  --warn-well: #fdf0d5;
  --p-kova: #2f6bff;
  --p-scena: #00867a;
  --p-tessa: #c2185b;
  --radius-card: 22px;
  --radius-well: 999px;
  --pad: 18px;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --page: #000000;
    --card: #17181a;
    --well: #2a2b2e;
    --ink: #ffffff;
    --ink-quiet: #8d8f96;
    --ink-faint: #55575d;
    --accent: #4d8bff;
    --alarm: #ff5247;
    --alarm-well: #3a1512;
    --warn: #f2c25c;
    --warn-well: #3a2c0f;
    --p-kova: #4d8bff;
    --p-scena: #14a598;
    --p-tessa: #f0518a;
  }
}
:root[data-theme='dark'] {
  --page: #000000;
  --card: #17181a;
  --well: #2a2b2e;
  --ink: #ffffff;
  --ink-quiet: #8d8f96;
  --ink-faint: #55575d;
  --accent: #4d8bff;
  --alarm: #ff5247;
  --alarm-well: #3a1512;
  --warn: #f2c25c;
  --warn-well: #3a2c0f;
  --p-kova: #4d8bff;
  --p-scena: #14a598;
  --p-tessa: #f0518a;
}

*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink);
  font: 400 16px/1.45 ui-sans-serif, -apple-system, "SF Pro Text", Inter, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased; }
h1, h2, p { margin: 0; padding: 0; }

/* ⚠️ THE PAGE IS THE WHOLE SURFACE, and it is presented over the app rather than
   inside it — no navigation, no tabs, no product chrome. One column, capped: an
   account is read, not worked in. */
/* ⚠️ AN ISOLATED STACK, SO THE LIGHT CANNOT ESCAPE IT. Without it the sky's
   z-index is compared against everything on the document, and a fixed control
   somewhere else in the page ends up behind it. */
.page { position: relative; isolation: isolate; min-block-size: 100dvh; background: var(--page);
  max-inline-size: 560px; margin: 0 auto; padding: 14px 16px 72px;
  display: flex; flex-direction: column; gap: 26px; }
/* ⚠️ EVERYTHING THE PERSON READS SITS ABOVE THE LIGHT. Stated once, here, rather
   than as a z-index on each thing that turned out to need one. */
.page > *:not(.sky) { position: relative; z-index: 1; }

/* ------------------------------------------------------------------ the top */

/* ⚠️ THE LOCKUP IS CENTRED AND THE WAY OUT IS NOT. The mark is what the screen
   is called, so it sits on the axis of the page; the close is a control on the
   edge, and centring the two together would push the mark off centre by exactly
   the width of a button. */
.page-top { display: flex; flex-direction: column; gap: 26px; padding-block-end: 10px; }
.page-top h1 { align-self: center; font-size: 26px; line-height: 1;
  margin-block: 12px 6px; }

/* ⚠️ ONE OBJECT, NOT A BADGE WITH A CAPTION. The word is quieter than the mark:
   the mark is whose this is, the word is which surface — a lockup where both
   shout is two logos beside each other. */
/* ⚠️ THE MARK SITS ON THE BASELINE OF THE WORD, not on the middle of the line
   box. It is taller than the letters and centring the two by their boxes lifts
   the word off the mark's own footing, which reads as a misalignment nobody can
   name. */
.brand-mark { display: block; }
.lockup { display: inline-flex; align-items: center; gap: 0.34em; }
.lockup-word { font-weight: 400; letter-spacing: 0.01em; opacity: 0.72; }
/* ⚠️ A ROUND CONTROL ON ITS OWN LINE, above the title rather than beside it. It
   is a way OUT of a presentation, not a thing in the heading — putting it in the
   heading row makes the title jump left and right as the control changes. */
.round-button { inline-size: 44px; block-size: 44px; border-radius: var(--radius-well);
  display: grid; place-items: center; align-self: flex-start;
  border: 0; background: var(--card); color: var(--ink); cursor: pointer; }
.round-button:hover { background: var(--well); }
.round-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.lede { color: var(--ink-quiet); font-size: 15px; line-height: 1.45; }

/* ---------------------------------------------------------------- sections */

section { display: flex; flex-direction: column; gap: 10px; }
/* ⚠️ A SECTION HEADING IS A HEADING. Small grey uppercase is a label on a form;
   the sections here are places, and a place is named at full ink. */
h2 { font-size: 20px; font-weight: 700; letter-spacing: -0.018em; padding-inline-start: 4px; }

/* ------------------------------------------------------------------- cards */

/* ⚠️ A FILL, NOT A BORDER, AND NO RULES BETWEEN THE ROWS. The card is told from
   the page by its own surface; a hairline round it and hairlines through it are
   three lines doing one job, and they make a group of related things read as a
   table. */
.card { background: var(--card); border-radius: var(--radius-card); overflow: hidden;
  display: flex; flex-direction: column; }

.item { display: flex; align-items: center; gap: 14px; inline-size: 100%;
  min-block-size: 64px; padding: 12px var(--pad); border: 0; background: none;
  color: inherit; font: inherit; text-align: start; cursor: pointer; }
.item:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
.item:active { background: color-mix(in oklab, var(--ink) 8%, transparent); }
.item:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }

.item-body { flex: 1; min-inline-size: 0; display: flex; flex-direction: column; gap: 2px; }
/* ⚠️ A LONG NAME TRUNCATES: the title is an identity, and a row that grows to two
   lines pushes everything to its right off the line it shares with every other
   row. The DETAIL wraps, because on a row with nothing to its right the second
   line is the whole content and clipping it mid-sentence withholds it. */
.item-title { font-size: 17px; font-weight: 500; letter-spacing: -0.01em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* ⚠️ THE DETAIL LINE CARRIES THE METADATA AND ANYTHING SAID ABOUT IT. Inline,
   because a pill beside the title fights the one thing that identifies the row —
   a workspace called "Corniche Screens" was clipped to "Corniche Scre…" to make
   room for one. */
.item-detail { display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
  color: var(--ink-quiet); font-size: 14.5px; line-height: 1.35; }

/* ⚠️ DIMMED, NOT COLOURED. It says there is more here; it is not a thing to aim
   at, and at full ink it competes with the row's own words. */
.chevron { flex: none; color: var(--ink-faint); }

/* ⚠️ THE WELL IS THE ICON'S GROUND, and it is what makes a column of glyphs read
   as a list rather than as loose marks at different optical weights. */
.well { flex: none; inline-size: 44px; block-size: 44px; border-radius: var(--radius-well);
  display: grid; place-items: center; background: var(--well); color: var(--ink); }
.well[data-tone='alarm'] { background: var(--alarm-well); color: var(--alarm); }

/* ⚠️ THE COLOUR IS THE PRODUCT AND THE LETTER IS THE WORKSPACE. The letter alone
   repeated what the row title already says, and two workspaces starting with the
   same letter were indistinguishable — while the one thing a cross-product list
   has to make scannable was readable only as text. */
.mark { border-radius: 14px; color: #fff; font-size: 17px; font-weight: 600; }
.mark[data-product='kova'] { background: var(--p-kova); }
.mark[data-product='scena'] { background: var(--p-scena); }
.mark[data-product='tessa'] { background: var(--p-tessa); }

/* ⚠️ ONLY ON A ROW THAT HAS ONE. A standing on every row is a column of green
   nobody reads, and the one that needs attention stops standing out. */
.pill { flex: none; padding: 2px 9px; border-radius: var(--radius-well);
  font-size: 13px; font-weight: 500; background: var(--well); color: var(--ink-quiet); }
.pill[data-urgent] { background: var(--warn-well); color: var(--warn); }

/* ------------------------------------------------------- waiting and blank */

/* ⚠️ DRAWN FROM THE PAGE'S INK, NEVER FROM currentColor. A placeholder stands in
   for content on an element that may have set its own colour — the product mark
   sets white text for its letter, so a currentColor-derived grey came out white
   on a white card and the square was simply not there. */
.waiting { background: color-mix(in oklab, var(--ink) 9%, transparent);
  border-radius: 7px; color: transparent; }
.waiting.line { block-size: 12px; inline-size: 58%; }
.waiting.line.short { inline-size: 32%; block-size: 10px; margin-block-start: 7px; }

.blank { padding: 30px var(--pad) 34px; gap: 6px; text-align: center; }
.blank-title { font-size: 17px; font-weight: 500; }
`.trim();
