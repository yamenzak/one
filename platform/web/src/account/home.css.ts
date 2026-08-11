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
  --ok: #0e7a4d;
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
    --ok: #2fcf7c;
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
  --ok: #2fcf7c;
  --p-kova: #4d8bff;
  --p-scena: #14a598;
  --p-tessa: #f0518a;
}

*, *::before, *::after { box-sizing: border-box; }
/* ⚠️ THE TEXT FACE'S WORD SPACE IS TOO NARROW, AND THIS IS THE CORRECTION. Plus
   Jakarta Sans sets wide letters against a narrow space, so at row sizes "Your
   name, photo and address" closes up into "Yourname,photoandaddress" — legible,
   and wrong in a way that reads as bad rendering rather than as a choice. It is
   set once here rather than per element, and the brand face, whose spacing is
   correct, takes it back below. */
body { margin: 0; background: var(--page); color: var(--ink);
  font: 400 16px/1.45 var(--font-text); word-spacing: 0.08em;
  -webkit-font-smoothing: antialiased; }
h1, h2, p { margin: 0; padding: 0; }
h2 { word-spacing: normal; }

/* ------------------------------------------------------------ the overlay */

/* ⚠️ THE PRESENTATION, NOT THE SCREEN. Everything here is about a surface laid
   OVER an app; the screen inside it does not know it is in one. */
/* ⚠️ IT CARRIES THE GROUND, WHICH IS WHY THERE IS NO OVERLAY UNDER IT. The sky
   bleeds past the capped column on purpose, so on a wide window a dimmed layer
   underneath showed either side of the column and the two greys did not meet.
   Opaque, full viewport, one ground. */
/* ⚠️ IT RISES; IT DOES NOT APPEAR. A surface that arrives at full size is a
   screen replacing a screen, which is what a navigation looks like. Coming up
   from below is what says this was laid over something still there. */
.over-content { position: fixed; inset: 0; z-index: 40; overflow-y: auto;
  background: var(--page);
  animation: over-up var(--arrive) var(--enter); }
/* ⚠️ FOCUS LANDS HERE ON OPEN AND MUST NOT DRAW A RING. It is the surface, not a
   control — a ring round the whole screen is the browser announcing that
   something went wrong. Every control inside it keeps its own. */
.over-content:focus, .over-content:focus-visible { outline: none; }
@keyframes over-up { from { opacity: 0; translate: 0 40px; scale: 0.985; } }

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
.page-title { align-self: center; font-size: 25px; line-height: 1;
  margin-block: 12px 6px; word-spacing: normal; }

/* ⚠️ ONE OBJECT, NOT A MARK WITH A CAPTION BESIDE IT. Everything below is in
   service of that: the same face as the mark's construction, the same weight as
   its strokes, a gap measured against its own stem rather than against a word
   space, and no second colour or opacity to tell the two halves apart. */
/* ⚠️ THE GAP IS A STEM, NOT A SPACE. At a word space the pair reads as two
   things that happen to be adjacent; at roughly the width of the mark's own
   stroke it reads as the spacing INSIDE a piece of lettering, which is what a
   lockup is. */
.lockup { display: inline-flex; align-items: center; gap: 0.26em; }
/* ⚠️ ALIGNED ON THE FOUR'S BASELINE, NOT ON THE BOX. The star hangs below the
   figure and the degree sits above it, so the mark's box is taller than the mark
   READS — centred by boxes, the four floats above the word it is set with. The
   nudge is the overhang, and it is what makes the two share a footing. */
.brand-mark { display: block; translate: 0 0.02em; }
/* ⚠️ THE SAME WEIGHT AS THE MARK'S STROKES, AND THE SAME INK. A lighter or
   greyed word is a caption; the mark and the name of the surface are one object
   here, so neither is allowed to be the quiet one. */
.lockup-word { font-family: var(--font-brand); font-weight: 600; letter-spacing: -0.035em; }
/* ⚠️ A ROUND CONTROL ON ITS OWN LINE, above the title rather than beside it. It
   is a way OUT of a presentation, not a thing in the heading — putting it in the
   heading row makes the title jump left and right as the control changes. */
.round-button { inline-size: 44px; block-size: 44px; border-radius: var(--radius-well);
  display: grid; place-items: center; align-self: flex-start;
  border: 0; background: var(--card); color: var(--ink); cursor: pointer; }
.round-button:hover { background: var(--well); }
.round-button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.lede { color: var(--ink-quiet); font-size: 15px; line-height: 1.45; }

/* ⚠️ A SCREEN INSIDE THE PRESENTATION IS NAMED AT THE START OF THE LINE. The home
   is named by the brand — a lockup, on the axis of the page, recognised rather
   than read. Everything under it is named by what it is, and a heading that is
   read belongs where reading starts. */
.title-row { display: flex; align-items: center; justify-content: space-between; gap: 16px;
  margin-block-start: 8px; }
.page-name { font-family: var(--font-brand); font-size: 32px; font-weight: 600;
  letter-spacing: -0.03em; line-height: 1.05; word-spacing: normal; }

/* ⚠️ THE FACE IS SHOWN, NOT DESCRIBED, and pressing it changes it. A row saying
   "Profile photo ›" is the only thing on this screen that could have been read
   off the screen it came from — the point of arriving here is seeing it. */
.portrait { position: relative; flex: none; border: 0; padding: 0; background: none;
  cursor: pointer; border-radius: var(--radius-well); }
.portrait:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.portrait-face { inline-size: 62px; block-size: 62px; background: var(--well);
  font-size: 24px; color: var(--ink-quiet); }
/* ⚠️ A SHADOW, NOT A RING. It had a ring in the page's own colour, which is only
   the right colour where the page is flat — over the light at the top of a screen
   the ring was a black circle cut out of a blue field. A shadow separates it from
   whatever is actually behind it, including a photograph. */
.portrait-badge { position: absolute; inset-block-end: -1px; inset-inline-end: -1px;
  inline-size: 26px; block-size: 26px; border-radius: var(--radius-well);
  display: grid; place-items: center;
  background: var(--ink); color: var(--page);
  box-shadow: 0 1px 5px rgb(0 0 0 / 0.4); }

/* ------------------------------------------------------------------ fields */

/* ⚠️ A FIELD IS A LABEL WITH A VALUE UNDER IT, not a row with the value on the
   right. A value is the content — an address, a full name, a list — and the
   right-hand column that fits a chevron does not fit any of them. */
.entries { padding-block: 6px; }
.entry { display: flex; flex-direction: column; align-items: stretch; gap: 5px;
  inline-size: 100%; padding: 13px var(--pad); border: 0; background: none;
  color: inherit; font: inherit; text-align: start; cursor: pointer; }
.entry:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
.entry:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
/* ⚠️ NOT A BUTTON, SO IT MUST NOT BEHAVE LIKE ONE. A read-only fact that lights
   up under the finger is a control that does nothing. */
.entry[data-fixed] { cursor: default; }
.entry[data-fixed]:hover { background: none; }
.entry-label { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  color: var(--ink-quiet); font-size: 15px; }
/* ⚠️ THE PENCIL IS THE ONLY ACCENT ON THE SCREEN, which is what makes it read as
   the thing to press. Put it on the value as well and there is no longer an
   answer to "what can I change here". */
.pencil { flex: none; color: var(--accent); }
.entry-value { font-size: 17px; line-height: 1.4;
  display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
/* ⚠️ THE BADGE IS THE STATEMENT AND THE TICK IS DRAWN ON IT. Blue rather than
   green: green is an outcome somebody caused, and a verified address is a fact
   about the account rather than something that just went well. */
.verified { flex: none; inline-size: 19px; block-size: 19px; border-radius: var(--radius-well);
  display: grid; place-items: center; background: var(--accent); color: #fff;
  animation: stamp var(--swift) var(--enter) both; }

/* ⚠️ "Not set" IS QUIET AND IT IS NOT AN ERROR. Nothing is wrong with an account
   that has no name on it yet. */
.entry-unset { color: var(--ink-faint); }

/* ------------------------------------------------------------- the editor */

/* ⚠️ THE SCREEN BEHIND STAYS VISIBLE, which is the whole difference between this
   and the presentation above. Editing one value is not leaving the screen the
   value is on, and dimming rather than covering is what says so. */
.scrim { position: fixed; inset: 0; z-index: 50; background: rgb(0 0 0 / 0.62);
  animation: scrim-in var(--swift) var(--enter); }
/* ⚠️ IT COMES FROM THE BOTTOM EDGE AND STAYS ATTACHED TO IT. A panel floating in
   the middle of a phone is a desktop dialog that was never re-thought; the thumb
   is at the bottom and so is the action. */
/* ⚠️ THE KEYBOARD CUSTOM PROPERTY IS WHAT KEEPS IT ABOVE THE KEYBOARD, and it is
   measured rather than assumed — useKeyboardInset, in editor.tsx, says why. Where
   the browser resizes the layout for a keyboard it comes out as zero, which is
   correct: there the sheet was already clear of it. */
.sheet { position: fixed; z-index: 51; inset-inline: 0; inset-block-end: 0;
  translate: 0 calc(var(--drag, 0px) - var(--keyboard, 0px));
  max-block-size: calc(100dvh - var(--keyboard, 0px) - 20px); overflow-y: auto;
  background: var(--card); color: var(--ink);
  border-start-start-radius: 26px; border-start-end-radius: 26px;
  padding: 10px 20px calc(22px + env(safe-area-inset-bottom, 0px));
  animation: sheet-up var(--settle) var(--enter);
  transition: translate var(--settle) var(--move); }
.sheet:focus, .sheet:focus-visible { outline: none; }
/* WHILE A THUMB IS ON IT, IT IS THE THUMB'S. A transition during a drag is the
   sheet arriving where the finger was a quarter of a second ago. */
.sheet[data-dragging] { transition: none; }
/* THE FALLBACK, when no keyboard could be measured and a field has the focus —
   see useKeyboardInset. Out of reach beats a guess at how far. */
.sheet[data-lift='top'] { inset-block: 12px auto; border-radius: 26px;
  max-block-size: calc(100dvh - 24px); }
/* IT LEAVES THE WAY IT ARRIVED. Radix keeps the node until the animation ends,
   so a surface that rose does not have to vanish. */
.sheet[data-state='closed'] { animation: sheet-down var(--swift) var(--exit); }
.scrim[data-state='closed'] { animation: scrim-out var(--swift) var(--exit); }
.over-content[data-state='closed'] { animation: over-down var(--settle) var(--exit); }

/* THE GRABBER IS A CLAIM: it appears only on a sheet that can actually be pulled
   away. Its hit area is the full width and far taller than the bar, because a
   4-pixel target is a decoration with a gesture attached. */
.grabber { display: block; inline-size: 100%; padding-block: 8px 14px;
  cursor: grab; touch-action: none; }
.grabber:active { cursor: grabbing; }
.grabber-bar { display: block; inline-size: 42px; block-size: 4px; margin-inline: auto;
  border-radius: var(--radius-well);
  background: color-mix(in oklab, var(--ink) 22%, transparent); }
/* AND WHERE THERE IS NO GRABBER THERE IS AN X, because a sheet that cannot be
   dismissed by gesture still has to be leavable by control. */
.sheet-close { position: absolute; inset-block-start: 14px; inset-inline-end: 14px;
  inline-size: 34px; block-size: 34px; border: 0; border-radius: var(--radius-well);
  display: grid; place-items: center; cursor: pointer;
  background: var(--well); color: var(--ink); }
.sheet-close:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
/* ⚠️ ON A WIDE WINDOW IT IS CENTRED, because a strip across the foot of a
   1400-pixel screen is a notification bar, and nobody reads a form in one. A
   tablet is wide AND has a keyboard, so the inset still applies — halved, because
   a centred thing moves half as far to clear the same edge. */
@media (min-width: 640px) {
  .sheet { inset: 50% auto auto 50%;
    translate: -50% calc(-50% - var(--keyboard, 0px) / 2);
    padding-block-start: 26px;
    inline-size: min(440px, calc(100vw - 40px)); border-radius: 26px;
    animation-name: sheet-in; }
}
@keyframes scrim-in { from { opacity: 0; } }
@keyframes scrim-out { to { opacity: 0; } }
@keyframes sheet-up { from { translate: 0 100%; } }
@keyframes sheet-down { to { translate: 0 100%; } }
@keyframes sheet-in { from { opacity: 0; scale: 0.97; } }
@keyframes over-down { to { opacity: 0; translate: 0 30px; scale: 0.99; } }

.sheet-body { display: flex; flex-direction: column; gap: 22px; }
.sheet-top { display: flex; flex-direction: column; gap: 8px; }
.sheet-title { font-family: var(--font-brand); font-size: 25px; font-weight: 600;
  letter-spacing: -0.03em; line-height: 1.15; margin: 0; word-spacing: normal; }

.field { display: flex; flex-direction: column; gap: 8px; }
.field-label { color: var(--ink-quiet); font-size: 14px; }
/* ⚠️ A FILL, AND THE ONLY BORDER IT EVER HAS IS THE ONE THAT MEANS SOMETHING. A
   field outlined at rest has nowhere left to go when it is wrong, which is how a
   form ends up saying "wrong" in red text under a field that looks unchanged. */
.field-box { display: flex; align-items: center; gap: 6px; min-block-size: 56px;
  padding-inline: 18px 8px; border-radius: var(--radius-well); background: var(--well);
  outline: 2px solid transparent; outline-offset: -2px; }
.field-box:focus-within { outline-color: var(--accent); }
.field-box[data-wrong] { outline-color: var(--alarm); }
.field-input { flex: 1; min-inline-size: 0; border: 0; background: none; color: inherit;
  font: inherit; font-size: 17px; padding: 0; }
.field-input:focus { outline: none; }
.field-input::placeholder { color: var(--ink-faint); }
/* ⚠️ ONLY WHEN THERE IS SOMETHING TO CLEAR. A control that is always there and
   does nothing half the time is one people learn to distrust. */
.field-clear { flex: none; inline-size: 30px; block-size: 30px; border: 0; cursor: pointer;
  border-radius: var(--radius-well); display: grid; place-items: center;
  background: color-mix(in oklab, var(--ink) 14%, transparent); color: var(--ink-quiet); }
.field-clear:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.note { color: var(--ink-quiet); font-size: 14px; line-height: 1.45; }
.wrong { color: var(--alarm); }
/* ⚠️ THE REFERENCE IS QUIET AND IT IS ALWAYS THERE. It is what somebody quotes to
   support, and a failure that withholds the provider's words without offering it
   is simply an unhelpful message. */
.note-ref { display: block; margin-block-start: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  color: var(--ink-faint); word-spacing: normal; }

.sheet-actions { display: flex; flex-direction: column; gap: 10px; }
/* ⚠️ THE ACTION IS THE FULL WIDTH OF THE SHEET AND IT IS THE ONLY ONE. A cancel
   beside it competes with the thing the person came here to do — the sheet is
   dismissed by the scrim, by Escape and by the back gesture, all of which are
   already there. */
.primary { inline-size: 100%; min-block-size: 54px; border: 0; border-radius: var(--radius-well);
  display: flex; align-items: center; justify-content: center; gap: 9px;
  background: var(--ink); color: var(--card); cursor: pointer;
  font: inherit; font-size: 17px; font-weight: 600; word-spacing: normal;
  transition: background-color var(--swift) var(--move), color var(--swift) var(--move); }
.primary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
/* ⚠️ OFF IS A DIFFERENT GROUND, NOT A FADED ONE. A translucent control on a card
   inherits whatever is behind it, and at 40% opacity the label falls under every
   contrast floor there is — so it looks broken to everyone and is unreadable to
   some. */
.primary:disabled { background: var(--well); color: var(--ink-faint); cursor: default; }
/* ⚠️ WORKING IS NOT OFF, and sharing one disabled look made it read as one. The
   button is refusing a second press for the length of a round trip — which is the
   same attribute and the opposite meaning — so it keeps its own ground and the
   pointer says wait rather than no. */
.primary[data-state='saving']:disabled { background: var(--ink); color: var(--card); cursor: progress; }
/* ⚠️ SAVED IS THE ONE STATE THAT GETS A COLOUR, and it keeps the disabled ground's
   job of refusing a second press. Green for a moment is the clearest possible
   answer to "did that work"; green forever is decoration. */
.primary[data-state='saved']:disabled { background: var(--ok); color: var(--card); }
.primary-label { line-height: 1; }
.primary-sign { flex: none; }
.spin { animation: spin 800ms linear infinite; }
@keyframes spin { to { rotate: 360deg; } }



/* ---------------------------------------------------------------- sections */

section { display: flex; flex-direction: column; gap: 10px; }
/* ⚠️ A SECTION HEADING IS A HEADING. Small grey uppercase is a label on a form;
   the sections here are places, and a place is named at full ink. */
/* ⚠️ AND IT IS SET IN THE BRAND FACE, which is what makes a heading read as a
   sign over a place rather than as the first row of the card under it. The rows
   themselves stay in the reading face — the difference between the two is the
   hierarchy, and it survives at a glance in a way a weight alone does not. */
h2 { font-family: var(--font-brand); font-size: 20px; font-weight: 600;
  letter-spacing: -0.025em; padding-inline-start: 4px; }

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
.chevron { flex: none; color: var(--ink-faint);
  transition: translate var(--swift) var(--spring); }

/* ⚠️ THE WELL IS THE ICON'S GROUND, and it is what makes a column of glyphs read
   as a list rather than as loose marks at different optical weights. */
.well { flex: none; inline-size: 44px; block-size: 44px; border-radius: var(--radius-well);
  display: grid; place-items: center; background: var(--well); color: var(--ink); }
.well[data-tone='alarm'] { background: var(--alarm-well); color: var(--alarm); }

/* ⚠️ THE COLOUR IS THE PRODUCT AND THE LETTER IS THE WORKSPACE. The letter alone
   repeated what the row title already says, and two workspaces starting with the
   same letter were indistinguishable — while the one thing a cross-product list
   has to make scannable was readable only as text. */
/* ⚠️ A ROUNDED SQUARE AMONG CIRCLES, ON PURPOSE. Round is a symbol or a person;
   a rounded square is a thing with an identity of its own. It also has to hold an
   uploaded logo, and a logo in a circle is a logo with its corners cut off. The
   radius is a quarter of the box — far enough from the circles that it reads as a
   decision rather than as a value somebody nearly got right. */
.face { display: block; overflow: hidden; color: #fff;
  font-family: var(--font-brand); font-size: 17px; font-weight: 600; }
.face[data-kind='workspace'] { border-radius: 11px; }
.face[data-kind='person'] { border-radius: var(--radius-well); }
.face-image { inline-size: 100%; block-size: 100%; object-fit: cover; display: block; }
.face-letter { display: grid; place-items: center; inline-size: 100%; block-size: 100%; }
.face[data-tone='kova'] { background: var(--p-kova); }
.face[data-tone='scena'] { background: var(--p-scena); }
.face[data-tone='tessa'] { background: var(--p-tessa); }

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
