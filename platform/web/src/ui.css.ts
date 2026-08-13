/**
 * THE VOCABULARY — every shape the platform's screens are made of.
 *
 * ⚠️ IT WAS EXTRACTED, NOT DESIGNED. Every rule here was written for a screen
 * first and moved when a second screen needed it. That order is the whole method:
 * a component library written in advance can only contain what its author already
 * thought of, and the last attempt at this had four laws, five archetypes and
 * ninety-one guards, and shipped a card with no padding, a menu with no trigger
 * and a form with no button row.
 *
 * ⚠️ WHAT IS NOT HERE IS AS DELIBERATE AS WHAT IS. A shape with one use stays in
 * the screen that uses it — see `account/account.css.ts`, which is four rules
 * long. The moment a second screen wants one, it moves here, and the move is the
 * evidence.
 *
 * ⚠️ NOTHING IN HERE NAMES A COLOUR, A DURATION OR A CURVE. They are declared once
 * — the palette below, the motion in `motion.css.ts` — and everything else refers
 * to them. `test/vocabulary.test.ts` fails on a literal, because a one-off
 * `220ms` is how an interface comes to move at eleven different speeds without
 * anybody deciding that.
 */

export const UI_CSS = `

/* ⚠️ KEYWORD SIZES BECOME ANIMATABLE, AND THAT IS ONE DECLARATION FOR THE WHOLE
   DOCUMENT. A height transition to the auto keyword is the one animation every
   interface wants and none can have; without this the disclosure below has to be
   given a pixel height by a script, which is a measurement that is wrong the
   moment the text reflows. Ignored where it is not supported, and everything it
   enables degrades to an instant change.

   ⚠️ ON THE ROOT ELEMENT RATHER THAN ON THE ROOT PSEUDO-CLASS, AND THAT IS NOT
   COSMETIC. It is inherited either way — but the theme check reads the token
   block by splitting the sheet on the first root-pseudo rule, so a second one
   above it silently hands that check an empty block and every colour in the
   platform reads as undeclared. */
html { interpolate-size: allow-keywords; }

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
  /* ⚠️ THE ACCENT HAS A GROUND OF ITS OWN, because a mark toned by it needs one
     and mixing it at the point of use is how two surfaces come to use two
     strengths of the same idea. */
  --accent-well: #e5edff;
  --ok: #0b6f45;
  /* ⚠️ WHAT SITS ON A SATURATED GROUND — a product's colour, the accent, the
     alarm, the confirmed green. Every one of them is dark enough to carry white in
     both themes; stating it ONCE is what stops a letter being white here and
     inherited-ink two components away, which is what five hand-written whites
     spread over a button, a tick, a checkbox and a switch already were. */
  --on-solid: #ffffff;
  /* ⚠️ WHAT DIMS THE SCREEN BEHIND A PANEL, and it is a colour like any other:
     written at the point of use it is one theme's guess at how dark is dark. */
  --scrim: rgb(0 0 0 / 0.62);
  /* ⚠️ THE ONE DROP SHADOW. Depth in this interface is a card's edge and a well's
     ground; the single exception is a thumb that has to read as sitting ON its
     track rather than in it. Stated per theme because a black shadow on a black
     page is not a softer shadow, it is no shadow. */
  --lift: 0 1px 3px rgb(0 0 0 / 0.3);
  --p-kova: #2f6bff;
  --p-scena: #00867a;
  --p-tessa: #c2185b;
  /* ⚠️ ONE FOCUS RING, DECLARED ONCE. It was written out fourteen times — two
     pixels of accent, every time, by hand — which is the same failure as fourteen
     durations: not a ring anybody chose, just the absence of a decision. What
     stays per control is the OFFSET, because a ring inside a row and a ring
     around a pill are different shapes, not different rings. */
  --ring: 2px solid var(--accent);
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
    --accent-well: #14224a;
    --ok: #12a065;
    --on-solid: #ffffff;
    --scrim: rgb(0 0 0 / 0.72);
    --lift: 0 1px 3px rgb(0 0 0 / 0.5);
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
  --accent-well: #14224a;
  --ok: #12a065;
  --on-solid: #ffffff;
  --scrim: rgb(0 0 0 / 0.72);
  --lift: 0 1px 3px rgb(0 0 0 / 0.5);
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
/* ⚠️ SELECTED TEXT IS OURS TOO, AND IT WAS THE BROWSER'S. Every value editor
   opens with its content selected — so the first thing on that sheet was a solid
   block of somebody else's blue behind our own accent ring, which is most of what
   made the editor read as a browser dialog rather than as this product. The ink
   is kept, because a selection that also repaints the text is a second decision
   about legibility on a colour we did not choose. */
::selection { background: color-mix(in oklab, var(--accent) 26%, transparent); }
/* ⚠️ AND EVERY CONTROL HAS TO SAY IT AGAIN, WHICH IS WHY IT APPEARS NINE TIMES
   BELOW. The font shorthand resets word spacing to its initial value, so every
   font shorthand on a control — which is every row, every field and every button
   in this product — silently undid the line above. Measured: 1.28px on a
   paragraph and 0 on every row title and every row detail, which is most of the
   words in the account centre; it read as bad rendering rather than as a choice,
   which is exactly what the rule above says about it. A rule of its own cannot fix
   it: this is a shorthand inside a more specific block, so the block has to be the
   place. The interface conformance suite fails on a font shorthand that does not
   restate it, because the next control will be written by somebody who has not
   read this paragraph. */

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
   than as a z-index on each thing that turned out to need one.

   ⚠️ AND IT SETS NO POSITION, WHICH IS THE WHOLE POINT OF THE RULE BEING THIS
   NARROW. It used to declare position relative as well, and at two classes to the
   bar's one it won — so the sticky bar was quietly a relative one and scrolled
   away with the page, on every screen, while the rule that broke it read as
   harmless boilerplate. A flex item takes a z-index without being positioned. */
.page > *:not(.sky) { z-index: 1; }
/* ⚠️ AND THE BAR HAS TO OUT-RANK IT, WHICH TAKES THE SAME SPECIFICITY. The rule
   above is two classes to a bare .topbar's one, so it won: the sticky bar was
   quietly on the same layer as every section, and at equal z-index the later
   element in the document paints over the earlier one — so a card scrolled UNDER
   the bar and straight over the top of it, taking the way out with it. Stated as
   a child of the page it ties on specificity and wins on order, which is the
   only way a blanket rule and an exception to it can both be readable. */
.page > .topbar { z-index: 3; }

/* ------------------------------------------------------------------ the top */

/* ⚠️ THE LOCKUP IS CENTRED AND THE WAY OUT IS NOT. The mark is what the screen
   is called, so it sits on the axis of the page; the close is a control on the
   edge, and centring the two together would push the mark off centre by exactly
   the width of a button. */
/* ⚠️ THE BAR IS STICKY FROM THE FIRST PIXEL AND ONLY ITS GROUND ARRIVES. The way
   out and the way on are in it at every scroll position, so nothing moves into it
   and nothing has to be found again after scrolling. Everything below interpolates
   on --scrolled, which is written by the frame at 0 through 1 over the height of
   the title it is replacing. */
.topbar { position: sticky; inset-block-start: 0; z-index: 3;
  display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px;
  margin-inline: -16px; padding: 10px 16px;
  background: color-mix(in oklab, var(--page) calc(var(--scrolled, 0) * 94%), transparent);
  backdrop-filter: blur(calc(var(--scrolled, 0) * 20px)); }
/* ⚠️ A HAIRLINE ONLY ONCE THERE IS SOMETHING UNDER IT. Drawn at rest it is a rule
   across the top of every screen; drawn as the ground arrives it is the edge of a
   surface that now has content behind it. */
.topbar::after { content: ""; position: absolute; inset-block-end: 0; inset-inline: 0;
  block-size: 1px; background: color-mix(in oklab, var(--ink) 12%, transparent);
  opacity: var(--scrolled, 0); }
/* ⚠️ IT RISES INTO PLACE RATHER THAN FADING. A name that appears at its final
   position is a label being switched on; coming up as the large one goes up is
   one movement handing over to another. */
.topbar-name { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-family: var(--font-brand); font-size: 17px; font-weight: 600;
  letter-spacing: -0.02em; word-spacing: normal;
  opacity: calc((var(--scrolled, 0) - 0.55) * 2.2);
  translate: 0 calc((1 - var(--scrolled, 0)) * 8px); }
/* ⚠️ THE ACTION LOSES ITS WORDS, NOT ITS PLACE. Collapsing to the symbol is what
   makes room for the name; moving or removing it would be a control that is
   somewhere else depending on how far somebody has scrolled. */
/* ⚠️ IT CLIPS, IT DOES NOT WRAP. Narrowing the label made "Add passkey" break
   across two lines inside a pill, which is a button coming apart rather than a
   label giving way. */
.topbar .button-label { display: inline-block; overflow: hidden; white-space: nowrap;
  max-inline-size: calc((1 - var(--scrolled, 0)) * 9em);
  opacity: calc(1 - var(--scrolled, 0) * 1.6); }
.topbar .button { padding-inline: calc(12px + (1 - var(--scrolled, 0)) * 4px); gap: calc((1 - var(--scrolled, 0)) * 7px); }

/* ⚠️ THE LARGE TITLE LEAVES UPWARDS AND SHRINKS INTO THE ONE IN THE BAR. It is
   still in flow, so the content under it does not jump — what changes is only
   what it looks like on the way past. */
.page-head { display: flex; flex-direction: column; gap: 10px;
  padding-block: 10px 12px;
  opacity: calc(1 - var(--scrolled, 0) * 1.5);
  translate: 0 calc(var(--scrolled, 0) * -10px);
  scale: calc(1 - var(--scrolled, 0) * 0.06);
  transform-origin: 0 50%; }

/* ⚠️ A ROUND CONTROL ON ITS OWN LINE, above the title rather than beside it. It
   is a way OUT of a presentation, not a thing in the heading — putting it in the
   heading row makes the title jump left and right as the control changes. */
.round-button { inline-size: 44px; block-size: 44px; border-radius: var(--radius-well);
  display: grid; place-items: center; align-self: flex-start;
  border: 0; background: var(--card); color: var(--ink); cursor: pointer; }
.round-button:hover { background: var(--well); }
.round-button:focus-visible { outline: var(--ring); outline-offset: 2px; }

.lede { color: var(--ink-quiet); font-size: 15px; line-height: 1.45; }

/* ------------------------------------------------------------------ fields */

/* ⚠️ A FIELD IS A LABEL WITH A VALUE UNDER IT, not a row with the value on the
   right. A value is the content — an address, a full name, a list — and the
   right-hand column that fits a chevron does not fit any of them. */
.entries { padding-block: 6px; }
.entry { display: flex; flex-direction: column; align-items: stretch; gap: 5px;
  inline-size: 100%; padding: 13px var(--pad); border: 0; background: none;
  color: inherit; font: inherit; word-spacing: inherit; text-align: start; cursor: pointer; }
.entry:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
.entry:focus-visible { outline: var(--ring); outline-offset: -3px; }
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
  display: grid; place-items: center; background: var(--accent); color: var(--on-solid);
  animation: stamp var(--swift) var(--enter) backwards; }

/* ⚠️ "Not set" IS QUIET AND IT IS NOT AN ERROR. Nothing is wrong with an account
   that has no name on it yet. */
.entry-unset { color: var(--ink-faint); }

/* ------------------------------------------------------------- the editor */

/* ⚠️ THE SCREEN BEHIND STAYS VISIBLE, which is the whole difference between this
   and the presentation above. Editing one value is not leaving the screen the
   value is on, and dimming rather than covering is what says so. */
.scrim { position: fixed; inset: 0; z-index: 50; background: var(--scrim);
  animation: scrim-in var(--swift) var(--enter); }
/* ⚠️ IT COMES FROM THE BOTTOM EDGE AND STAYS ATTACHED TO IT. A panel floating in
   the middle of a phone is a desktop dialog that was never re-thought; the thumb
   is at the bottom and so is the action. */
/* ⚠️ THE KEYBOARD CUSTOM PROPERTY IS WHAT KEEPS IT ABOVE THE KEYBOARD, and it is
   measured rather than assumed — useKeyboardInset, in editor.tsx, says why. Where
   the browser resizes the layout for a keyboard it comes out as zero, which is
   correct: there the sheet was already clear of it. */
/* ⚠️ THE INLINE PADDING IS A VARIABLE because a full-bleed child has to negate
   it exactly, and a second hardcoded 20 is a number that drifts silently — the
   rows would simply stop lining up with the title. */
.sheet { --sheet-pad: 20px;
  position: fixed; z-index: 51; inset-inline: 0; inset-block-end: 0;
  translate: 0 calc(var(--drag, 0px) - var(--keyboard, 0px));
  max-block-size: calc(100dvh - var(--keyboard, 0px) - 20px); overflow-y: auto;
  background: var(--card); color: var(--ink);
  border-start-start-radius: 26px; border-start-end-radius: 26px;
  padding: 10px var(--sheet-pad) calc(22px + env(safe-area-inset-bottom, 0px));
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
.sheet-close { position: absolute; inset-block-start: 14px; inset-inline-end: 14px; }
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
/* ⚠️ A CARD INSIDE A SHEET BLEEDS TO THE SHEET'S EDGES, because the sheet IS the
   card — same fill — so the element contributes no ground at all and the only
   thing it was doing was insetting every row by its own padding while the title
   stayed at the sheet's edge. Two left edges eighteen pixels apart, for a reason
   no reader could name. Full-bleed also gives each row's press its whole
   width, which on a phone is the difference between a target and a guess. */
.sheet .card { background: none; border-radius: 0;
  margin-inline: calc(var(--sheet-pad) * -1); }
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
  outline: var(--ring); outline-color: transparent; outline-offset: -2px; }
/*
  ⚠️ THE FOCUSED RING IS QUIETER THAN THE KEYBOARD ONE, AND THAT IS THE POINT. An
  editor opens with its field focused, so a full-strength accent ring is not an
  answer to anything somebody did — it is permanent furniture, a band of colour
  across a sheet whose entire content is one value, and it is most of what made
  this read as a browser dialog rather than as this product.

  ⚠️ AND WRONG STAYS LOUD, which is the hierarchy this buys. Three states on one
  shape: nothing at rest, the accent at half voice while it is being typed in, and
  the alarm at full strength when what is in it cannot be saved.
*/
.field-box:focus-within { outline-color: color-mix(in oklab, var(--accent) 55%, transparent); }
.field-box[data-wrong] { outline-color: var(--alarm); }
.field-input { flex: 1; min-inline-size: 0; border: 0; background: none; color: inherit;
  font: inherit; word-spacing: inherit; font-size: 17px; padding: 0;
  /* ⚠️ THE CARET IS AN ACCENT, because it is the one part of a field that moves
     and the only thing on the sheet saying where typing will land. */
  caret-color: var(--accent); }
.field-input:focus { outline: none; }
.field-input::placeholder { color: var(--ink-faint); }
/* ⚠️ ONLY WHEN THERE IS SOMETHING TO CLEAR. A control that is always there and
   does nothing half the time is one people learn to distrust. */
.field-clear { flex: none; inline-size: 30px; block-size: 30px; border: 0; cursor: pointer;
  border-radius: var(--radius-well); display: grid; place-items: center;
  background: color-mix(in oklab, var(--ink) 14%, transparent); color: var(--ink-quiet); }
.field-clear:focus-visible { outline: var(--ring); outline-offset: 2px; }

.note { color: var(--ink-quiet); font-size: 14px; line-height: 1.45; }
.wrong { color: var(--alarm); }
/* ⚠️ THE REFERENCE IS QUIET AND IT IS ALWAYS THERE. It is what somebody quotes to
   support, and a failure that withholds the provider's words without offering it
   is simply an unhelpful message. */
.note-ref { display: block; margin-block-start: 4px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px;
  color: var(--ink-faint); word-spacing: normal; }

/* ⚠️ A FORM IS A COLUMN, AND IT HAS TO SAY SO. A form is a block element with no
   spacing of its own, so a field and the action under it sat edge to edge — the
   one place in the product where two controls touch, on the screen somebody meets
   first. The sheet's body already carried this rule under its own name; the door
   is the second form, which is when a shape moves. */
.form { display: flex; flex-direction: column; gap: var(--pad); }

/* ⚠️ A COLUMN OF FULL-WIDTH ACTIONS, AND IT IS NOT THE SHEET'S ANY MORE. It was
   the sheet's own while a sheet was the only surface that ended in one; the door
   is the second, and a screen that copied the sheet's class would be a screen
   inheriting a rule named for somewhere it is not. Moved at its second use, which
   is the only moment this vocabulary allows. */
.actions { display: flex; flex-direction: column; gap: 10px; }
/* ⚠️ ONE BUTTON, AND THE TONE SAYS WHAT IT IS RATHER THAN HOW IT LOOKS. LOUD
   leads — one per surface, the thing the person came to do. QUIET sits on a row
   beside something more important than itself, which is why removing a passkey is
   not red: a red button per row makes a list of ordinary facts look like a list
   of problems, and the one that really is dangerous stops standing out. */
.button { display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-block-size: 40px; padding-inline: 16px; border: 0; border-radius: var(--radius-well);
  cursor: pointer; font: inherit; font-size: 15px; font-weight: 600; word-spacing: normal;
  transition: background-color var(--swift) var(--move), color var(--swift) var(--move); }
.button[data-tone='loud'] { background: var(--ink); color: var(--card); }
/* ⚠️ QUIET IS ALSO SMALLER, because where it appears there is something more
   important on the line and the row's height is set by whichever is taller. At
   the loud size it made every row in a list deeper for the sake of a word nobody
   came to read. */
.button[data-tone='quiet'] { background: var(--well); color: var(--ink);
  min-block-size: 36px; padding-inline: 14px; font-size: 14.5px; }
/* ⚠️ FULL WIDTH IS A PLACE, NOT A SIZE: it means the button owns the row, which
   is what the action at the foot of a sheet does. */
.button[data-wide] { inline-size: 100%; min-block-size: 54px; font-size: 17px; }
.button:focus-visible { outline: var(--ring); outline-offset: 3px; }
/* ⚠️ OFF IS A DIFFERENT GROUND, NOT A FADED ONE. A translucent control on a card
   inherits whatever is behind it, and at 40% opacity the label falls under every
   contrast floor there is — so it looks broken to everyone and is unreadable to
   some. */
/* ⚠️ AND OFF IS STILL READ. The faint ink is for a value nobody has given yet,
   on a card; on the well's ground it is 1.6 to 1, which is a label people report
   as blurry rather than as disabled. Quiet ink is the same statement and legible. */
.button:disabled { background: var(--well); color: var(--ink-quiet); cursor: default; }
/* ⚠️ WORKING IS NOT OFF, and sharing one disabled look made it read as one. The
   button is refusing a second press for the length of a round trip — which is the
   same attribute and the opposite meaning — so it keeps its own ground and the
   pointer says wait rather than no. */
.button[data-state='working']:disabled { background: var(--ink); color: var(--card); cursor: progress; }
/* ⚠️ DONE IS THE ONE STATE THAT GETS A COLOUR, and it keeps the disabled ground's
   job of refusing a second press. Green for a moment is the clearest possible
   answer to "did that work"; green forever is decoration.

   ⚠️ WHITE INK ON A DEEP GREEN, NOT DARK INK ON A BRIGHT ONE. The bright green a
   success colour wants to be cannot carry white text, so the button was
   near-black lettering on neon — legible, and it reads as a browser alert from
   fifteen years ago rather than as this product answering. Deepening the green
   until white sits on it is the whole fix, and the tick then belongs to the same
   object as the word.

   ⚠️ AND IT ARRIVES WITH A PUSH. A ground that simply changes colour is a state
   being switched; a small overshoot on the same spring every control uses is the
   button answering. */
.button[data-state='done']:disabled { background: var(--ok); color: var(--on-solid);
  animation: answered var(--settle) var(--spring); }
@keyframes answered { from { scale: 0.965; } 45% { scale: 1.018; } }
/* ⚠️ THE ALARM IS ON THE ACTION AND NOWHERE ELSE. A confirm sheet is already the
   product asking whether somebody means it; painting the whole surface red says
   the same thing again, louder, to somebody who has already understood. */
.button[data-tone-alarm] { background: var(--alarm); color: var(--on-solid); }
.button[data-tone-alarm]:disabled { background: var(--well); color: var(--ink-faint); }

/* ⚠️ THE LABEL IS THE TARGET, not a caption beside one. A 20-pixel box next to
   words that are not part of the control is the smallest hit area in the product,
   placed on the one question that most deserves a large one. */
.check { display: flex; align-items: center; gap: 12px; cursor: pointer;
  font-size: 15.5px; line-height: 1.4; }
.check input { position: absolute; opacity: 0; inline-size: 0; block-size: 0; }
.check-box { flex: none; inline-size: 24px; block-size: 24px; border-radius: 8px;
  display: grid; place-items: center; color: transparent;
  background: var(--well);
  transition: background-color var(--swift) var(--move), color var(--swift) var(--move); }
.check input:checked + .check-box { background: var(--accent); color: var(--on-solid); }
.check input:focus-visible + .check-box { outline: var(--ring); outline-offset: 2px; }
.button-label { line-height: 1; }
.button-sign { flex: none; }



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

/* ------------------------------------------------------------- the crown --- */

/* ⚠️ ONE CARD ON A SCREEN MAY BE A PLACE RATHER THAN A LIST, and exactly one.
   The rows above it are things to go and do; this is somewhere to go and BE, so
   it is named by a lockup instead of by a row title and it carries its own
   light. A second card like it on the same screen makes both of them ordinary.

   ⚠️ IT ISOLATES, WHICH IS NOT OPTIONAL. Without a stacking context of its own
   the light inside it is compared against everything on the page, and a sticky
   bar somewhere else ends up behind it. */
.crown { position: relative; isolation: isolate; overflow: hidden;
  display: block; inline-size: 100%; text-align: start;
  border: 0; border-radius: var(--radius-card); background: var(--card);
  color: inherit; font: inherit; word-spacing: inherit; cursor: pointer;
  padding: 22px var(--pad) 18px; }
/* ⚠️ EVERYTHING READ SITS ABOVE THE LIGHT. Stated once here rather than as a
   z-index on each thing that turned out to need one — the same rule the page
   states about its own sky. */
.crown > *:not(.sky) { position: relative; z-index: 1; }
.crown:focus-visible { outline: var(--ring); outline-offset: -3px; }
/* ⚠️ THE LOCKUP IS THE HEADING, so it is set at heading size and full ink. A
   card that carried both a lockup and a title would be naming itself twice. */
.crown-name { display: block; font-size: 23px; margin-block-end: 8px; }
.crown-said { color: var(--ink-quiet); font-size: 14.5px; line-height: 1.45; }
/* ⚠️ THE FOOT IS A FACT AND A WAY ON, not a button. The whole card is the
   target; a button inside it would be a second target on one surface. */
.crown-foot { display: flex; align-items: center; gap: 8px; margin-block-start: 16px;
  color: var(--ink); font-size: 14.5px; font-weight: 500; }
.crown-foot .chevron { margin-inline-start: auto; }

/* ⚠️ INHERITED INK AND NO UNDERLINE, BECAUSE A ROW MAY BE AN ANCHOR. An element
   takes a browser's link styling by BEING one, so the moment a row pointed at
   somebody else's page its title arrived blue and underlined — a link inside a
   card where nothing else is one. */
.item { display: flex; align-items: center; gap: 14px; inline-size: 100%;
  color: inherit; text-decoration: none;
  min-block-size: 64px; padding: 12px var(--pad); border: 0; background: none;
  color: inherit; font: inherit; word-spacing: inherit; text-align: start; cursor: pointer; }
.item:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
.item:active { background: color-mix(in oklab, var(--ink) 8%, transparent); }
.item:focus-visible { outline: var(--ring); outline-offset: -3px; }

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
/*
  ⚠️ A NUMBER ON THE RIGHT OF A ROW, AND IT IS TABULAR ON PURPOSE. Proportional
  digits make a column of figures ragged — 41,200 above 1,113 above 900, each
  ending somewhere different — which is exactly the column a reader is scanning
  down. It is the one place in this interface where the type is not the reading
  face's default, and the reason is that a balance is read as a quantity rather
  than as words.

  ⚠️ AND IT IS NOT A PILL. A pill says what STATE a row is in and takes its colour
  from the tone scale; a value says how much, and colouring one would be inventing
  a meaning for a number that already means itself.
*/
.value { color: var(--ink); font-size: 15px; font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1; white-space: nowrap; }
/*
  ⚠️ ONE LINE WHERE SOMETHING SHARES THE ROW, AND THIS IS THE RULE THAT WAS
  WRITTEN AND NEVER ENFORCED. A destination row's second line may be as long as it
  needs — there is nothing beside it to push off a scan line. A row with a mark, a
  capsule or a control has a squeezed middle column, and a sentence in it wraps to
  five lines while the TITLE clips to make room: the identity truncated so the
  metadata can run on, which is the wrong way round in every case.

  ⚠️ IT IS ON THE ROW RATHER THAN ON THE LINE, so a caller cannot opt out of it by
  passing longer words. What a screen chooses is what it puts on the row; how a
  row holds it is this file's.
*/
.item:has(> .pill, > .chevron ~ *, > button, > a) .item-detail { flex-wrap: nowrap; }
/* ⚠️ AND ONLY WHERE THE ROW IS ONE OF A LIST TO BE SCANNED. A row that goes
   somewhere or does something is read as part of a column, and a sentence in it
   pushes the next row down while the title clips to make room. A row that is a
   mark and words — this address, and the sentence saying what it is for — is not
   in a hurry: nothing shares its line, so clipping it mid-sentence withholds the
   only content it has. That was the state of "A code is sent here when you sign
   in without", which is a sentence cut before the word that mattered. */
.item:has(> .mark):has(> .chevron, > .pill, > button, > a) .item-detail {
  flex-wrap: nowrap; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ⚠️ DIMMED, NOT COLOURED. It says there is more here; it is not a thing to aim
   at, and at full ink it competes with the row's own words. */
.chevron { flex: none; color: var(--ink-faint);
  transition: translate var(--swift) var(--spring); }

/* ------------------------------------------------------------------- marks */

/*
  ⚠️ ONE TILE, AND EVERYTHING ABOUT IT IS DERIVED FROM ITS SIZE. There were five
  of these — an icon well, two faces at two sizes, a company tile and a portrait —
  and between them four radii, three badge offsets and no shared scale. Every one
  was defensible alone; together they were what makes an interface look assembled
  rather than designed.

  ⚠️ THE SHAPE IS THE KIND AND THERE ARE TWO. Round is a person or a symbol —
  something standing for a class of thing. A rounded square is something with an
  identity of its own, and a logo in a circle is a logo with its corners cut off.
*/
.mark { position: relative; flex: none; display: grid; place-items: center;
  inline-size: var(--mark); block-size: var(--mark);
  /* ⚠️ HOW FAR THE BADGE BREAKS THE TILE'S EDGE, DECLARED ONCE. It is used twice —
     to place the badge, and to inset a badged mark that sits at the edge of a
     column — and two copies of the same fraction is how a nudge becomes a drift. */
  --mark-out: calc(var(--mark) * 0.09);
  background: var(--well); color: var(--ink);
  font-family: var(--font-brand); font-weight: 600;
  font-size: calc(var(--mark) * 0.38); }
/* ⚠️ A THIRD OF THE BOX, NOT A PIXEL VALUE. Written in pixels it drifted the
   moment a second size existed — 11 on one 44-pixel tile and 14 on another. */
.mark[data-kind='workspace'], .mark[data-kind='product'],
.mark[data-kind='company'], .mark[data-kind='place'] { border-radius: calc(var(--mark) * 0.32); }
.mark[data-kind='person'], .mark[data-kind='symbol'] { border-radius: var(--radius-well); }

/* ⚠️ THE PICTURE FILLS THE TILE AND THE TILE DOES THE CLIPPING, so the shape is
   stated once rather than on the image, the letter and the logo separately. */
.mark-body { display: block; inline-size: 100%; block-size: 100%;
  border-radius: inherit; overflow: hidden; }
.mark-image { inline-size: 100%; block-size: 100%; object-fit: cover; display: block; }
.mark-letter { display: grid; place-items: center; inline-size: 100%; block-size: 100%;
  color: var(--ink-quiet); }
.mark-glyph { display: grid; place-items: center; }
/* ⚠️ THE LOGO IS INSET, NOT FLUSH. A brand path is drawn to the edge of its own
   viewbox, so at the tile's full width it touches the corners while an icon in the
   same column does not — and a column of tiles whose contents are different sizes
   is the raggedness this whole file exists to remove. */
.mark-logo { inline-size: 58%; block-size: 58%; display: block; }

/* ⚠️ A GROUND MIXED FROM THE BRAND COLOUR, NEVER THE COLOUR ITSELF. Four
   saturated logo tiles in a column is a sponsor wall; the same four as tints are a
   list with identities in it, and the mix survives both themes without a second
   set of values. */
.mark[data-kind='company'] { background: color-mix(in oklab, var(--brand, var(--ink)) 15%, var(--card)); }
.mark[data-kind='company'] .mark-letter { color: var(--ink-quiet); }

/* ⚠️ THE COLOUR IS THE PRODUCT AND THE LETTER IS THE WORKSPACE. The letter alone
   repeated the row's title two centimetres away, and two workspaces starting with
   the same letter were indistinguishable — while the one thing a cross-product
   list has to make scannable was readable only as text. */
.mark[data-product='kova'] { background: var(--p-kova); }
.mark[data-product='scena'] { background: var(--p-scena); }
.mark[data-product='tessa'] { background: var(--p-tessa); }
.mark[data-product] .mark-letter { color: var(--on-solid); }

/* ⚠️ THE TONE SCALE, AND NOTHING ELSE MAY GROUND A MARK. Amber is "there is
   something to do"; red is "something is wrong or gone". A document waiting to be
   read is neither, and toning it like the row that closes an account says the two
   are the same kind of thing. */
.mark[data-tone='warn'] { background: var(--warn-well); color: var(--warn); }
.mark[data-tone='alarm'] { background: var(--alarm-well); color: var(--alarm); }
.mark[data-tone='accent'] { background: var(--accent-well); color: var(--accent); }

/*
  ⚠️ THE BADGE SITS ON THE SHAPE'S EDGE, WHICH IS ARITHMETIC RATHER THAN A NUDGE.
  At the bounding box's corner it lands ON a rounded square and in EMPTY SPACE
  beside a circle — which is exactly why a camera on somebody's photograph looked
  detached while a device on a workspace did not. Nine per cent of the box, outward,
  is the point on the arc at four o'clock and just past the square's corner: one
  number, both shapes.

  ⚠️ AND THE RING IS THE SURFACE BEHIND IT, so the badge reads as cut out of the
  mark rather than laid on top of it.
*/
.mark-badge { position: absolute;
  inset-block-end: calc(var(--mark-out) * -1); inset-inline-end: calc(var(--mark-out) * -1);
  inline-size: calc(var(--mark) * 0.5); block-size: calc(var(--mark) * 0.5);
  border-radius: var(--radius-well); display: grid; place-items: center;
  background: var(--card); color: var(--ink);
  box-shadow: 0 0 0 calc(var(--mark) * 0.045) var(--card); }
/* ⚠️ A BADGED MARK STANDS DOWN FOR ITS BADGE. A planet at full strength is the
   most colourful thing on the row and a symbol laid over it disappears; at
   two-thirds it is still unmistakably which workspace. */
.mark:has(> .mark-badge) .mark-body { opacity: 0.66; }
/* ⚠️ AND A BADGED MARK AT THE EDGE OF A COLUMN IS INSET BY ITS OWN OVERHANG.
   Otherwise the tile lines up with the cards below it and the badge does not —
   six pixels into the page's margin, which reads as a photograph pushed against
   the edge of the screen rather than as a considered placement. */
.title-row .mark:has(> .mark-badge) { margin-inline-end: var(--mark-out); }

/* ⚠️ THE WHOLE ROW IS THE TARGET. A 50-pixel control at the end of a full-width
   row is the smallest thing on the screen, and the row is a label, so pressing
   anywhere on it flips the switch. */
.switch-row { cursor: pointer; }
/* ⚠️ THE WHOLE ROW STANDS DOWN, not just the control. A full-strength title over
   a dead switch reads as a switch that is broken rather than as a setting this
   device cannot have. */
/* ⚠️ A ROW THAT STANDS DOWN IS ANY ROW, NOT A SWITCH'S. It was written for the
   one control that can be off; the door's resend is the second — a row that says
   what it will do and cannot do it yet, which at full ink is indistinguishable
   from the pressable row beneath it. */
.item[data-off] { cursor: default; color: var(--ink-quiet); }
.item[data-off]:hover, .item[data-off]:active { background: none; }
/* ⚠️ THE TILE STANDS DOWN WITH THE WORDS. A mark sets its own ink so it is legible
   on its own ground, which means a quiet row kept a full-strength glyph — and a
   symbol at full ink beside grey words reads as a row that is half-alive. */
.item[data-off] .mark { color: var(--ink-quiet); }
.switch-row:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
/* ⚠️ THE TRACK CARRIES THE STATE AND THE THUMB CARRIES THE MOVEMENT. Off is the
   same well every other control sits in, so a column of them reads as a column of
   the same thing rather than as a row of grey pills. */
.switch { flex: none; inline-size: 50px; block-size: 30px; padding: 3px; border: 0;
  border-radius: var(--radius-well); cursor: pointer; background: var(--well);
  transition: background-color var(--swift) var(--move); }
.switch[data-state='checked'] { background: var(--accent); }
.switch:focus-visible { outline: var(--ring); outline-offset: 3px; }
.switch:disabled { cursor: progress; }
.switch-thumb { display: block; inline-size: 24px; block-size: 24px; border-radius: var(--radius-well);
  background: var(--on-solid); box-shadow: var(--lift);
  transition: translate var(--swift) var(--spring); }
.switch-thumb[data-state='checked'] { translate: 20px 0; }

/* ⚠️ A TICK, NOT A HIGHLIGHTED ROW. A different ground reads as focus or as
   hover; a tick says "this is what it is now" without implying that something is
   about to happen to it. */
.chosen { flex: none; color: var(--accent); }

/* --------------------------------------------------------------- capsules */

/*
  ⚠️ TWO ROUNDED THINGS, AND THE RULE THAT STOPS THERE BEING A THIRD. A chip
  answers WHICH — it carries a face into a sentence so the thing being talked about
  appears as itself. A pill answers WHAT STATE — it takes its colour from the tone
  scale and a row has at most one. They were joined by a tag, which was a data
  category as a lozenge, and the three were visually identical: one row carried all
  three and none of them told a reader anything the others did not.
*/
/* ⚠️ NEVER COLOURED. The face is the identification; a hue on top would be a
   second one, and a chip that changes colour reads as a state. */
.chip { display: inline-flex; align-items: center; gap: 6px; vertical-align: -0.28em;
  max-inline-size: 100%; padding: 3px 10px 3px 4px; border-radius: var(--radius-well);
  background: color-mix(in oklab, var(--ink) 9%, transparent); color: var(--ink);
  word-spacing: normal; }
.chip .mark { --mark: 22px; }
.chip-name { min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 14.5px; font-weight: 500; }

/* ⚠️ ONLY WHERE THE STATE IS WORTH SAYING. A standing on every row is a column
   nobody reads, and the one that needs attention stops standing out. */
.pill { flex: none; padding: 2px 9px; border-radius: var(--radius-well);
  font-size: 13px; font-weight: 500; white-space: nowrap; word-spacing: normal;
  background: var(--well); color: var(--ink-quiet); }
/* ⚠️ THE TONE SCALE AND NOTHING ELSE. A pill that reached for a hue directly is
   how a column of capsules comes to look arbitrary — which is indistinguishable,
   to a reader, from meaning nothing. */
.pill[data-tone='warn'] { background: var(--warn-well); color: var(--warn); }
.pill[data-tone='alarm'] { background: var(--alarm-well); color: var(--alarm); }
.pill[data-tone='ok'] { background: color-mix(in oklab, var(--ok) 16%, transparent); color: var(--ok); }

/* ------------------------------------------------------------------ links */

/*
  ⚠️ IT IS THE ONE PLACE THE INTERFACE STOPPED BEING DESIGNED, and it happened
  because an anchor is the only element that looks finished with no styling at all:
  browser blue, browser underline, no press, no motion, on a surface where every
  other control has a tone and a spring.

  ⚠️ THE UNDERLINE IS DRAWN RATHER THAN INHERITED, SO IT CAN MOVE. A text-decoration
  sits at a fixed offset, cannot change weight without changing the text metrics and
  cannot animate; a gradient on the text box does all three — and what it does here
  is grow from the start of the word, which is the smallest possible way of saying a
  link is a thing you act on.
*/
.away { display: inline-flex; align-items: baseline; gap: 4px;
  color: var(--accent); text-decoration: none; }
.away-word { background-image: linear-gradient(var(--accent), var(--accent));
  background-repeat: no-repeat; background-position: 0 100%;
  background-size: 100% 1px;
  transition: background-size var(--swift) var(--move); }
.away:hover .away-word { background-size: 100% 2px; }
/* ⚠️ THE MARK LIFTS ALONG ITS OWN AXIS, which is the direction it points. A link
   out is the one control whose movement can say where it goes. */
.away-mark { flex: none; translate: 0 1px;
  transition: translate var(--swift) var(--spring); }
.away:hover .away-mark { translate: 1.5px -0.5px; }
.away:focus-visible { outline: var(--ring); outline-offset: 3px;
  border-radius: 3px; }

/* ------------------------------------------------------------------- asks */

/* ⚠️ A CONSENT DECISION IS A PARAGRAPH WITH A CONTROL, NOT A ROW WITH A VALUE.
   Built on the ROW shape it had a title, a reason, a sentence about what is hidden and
   a rung, all competing for one line — the rung took a third of a phone and the
   words wrapped into a four-word column. A row is for scanning a list; this is
   for reading one thing and deciding about it, so the control goes underneath at
   full width where it is also a better target. */
.ask { display: flex; flex-direction: column; gap: 10px; padding: 16px var(--pad); }
.ask + .ask { border-block-start: 1px solid color-mix(in oklab, var(--ink) 9%, transparent); }
/* ⚠️ A READING IS INSET UNDER THE FACT IT COMES FROM, because it is a second
   decision ABOUT that fact rather than a peer of it. */
.ask[data-under] { padding-inline-start: calc(var(--pad) + 14px); }
.ask[data-under]::before { content: ""; position: absolute; }
/* ⚠️ THE TITLE WRAPS HERE, unlike a row's. There is nothing to its right to push
   off a line, and clipping "What you are working towards" to "What you are
   worki…" withholds the whole question. */
.ask-title { font-size: 16.5px; font-weight: 600; letter-spacing: -0.01em; }
.ask-why { color: var(--ink-quiet); font-size: 14.5px; line-height: 1.4; }
/* ⚠️ WHAT IT CANNOT REVEAL, SET APART. It is the sentence that earns the
   decision, and in the same voice as the reason it reads as more of the pitch. */
/* ⚠️ IT IS THE SENTENCE THAT EARNS THE DECISION, SO IT IS NOT FINE PRINT. Faint
   and italic is the typography of a disclaimer — the one register a consent sheet
   must never use, because it is what a sheet nobody is meant to read looks like.
   The same voice as the reason above it, one step quieter. */
.ask-hides { color: var(--ink-quiet); font-size: 14px; line-height: 1.45; }
.ask-note { color: var(--warn); font-size: 13.5px; }
/* ⚠️ FULL WIDTH, so the answer is a control rather than a value at the end of a
   sentence — and so a thumb can reach it without aiming. */
.ask-answer { display: flex; align-items: center; gap: 8px; inline-size: 100%;
  min-block-size: 44px; padding: 0 14px; border: 0; border-radius: var(--radius-well);
  background: var(--well); color: var(--ink); font: inherit; word-spacing: inherit; text-align: start; cursor: pointer; }
.ask-answer[data-open] { color: var(--accent); }
/* ⚠️ IT HAD NO RING, WHICH IS THE ONE CONTROL ON THE CONSENT SHEET. Found by the
   conformance check rather than by anybody looking: a keyboard reached it, and
   nothing on the screen said where it was. */
.ask-answer:focus-visible { outline: var(--ring); outline-offset: 2px; }
.ask-answer .chevron { margin-inline-start: auto; }

/* ⚠️ THE CURRENT ANSWER, IN WORDS, AND IT IS NOT A PILL. A pill is a standing —
   something the thing IS — while this is what somebody CHOSE, which is editable
   and points onward. Drawn as a pill, every answered decision looked like a
   badge nobody could change. */
.rung-name { white-space: nowrap; font-size: 15px; }

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

/* ------------------------------------------------------------- disclosure */

/* ⚠️ THE SUMMARY IS THE CARD'S OWN ROW, so a closed list of disclosures is
   indistinguishable from a list of rows — which is the point: it is one until
   somebody wants more. Both the flex and the marker reset are load-bearing: a
   summary is display:list-item by default, so without them the face, the name and
   the count stack vertically with a native triangle over them. */
.disclose { display: block; }
.disclose + .disclose { border-block-start: 1px solid var(--edge); }
.disclose-head { display: flex; align-items: center; gap: 14px; inline-size: 100%;
  min-block-size: 64px; padding: 12px var(--pad); cursor: pointer;
  list-style: none; }
.disclose-head::marker { content: none; }
.disclose-head::-webkit-details-marker { display: none; }
.disclose-head:hover { background: color-mix(in oklab, var(--ink) 5%, transparent); }
.disclose-head:focus-visible { outline: var(--ring); outline-offset: -3px; }
.disclose-mark { flex: none; display: flex; }
.disclose-said { flex: 1; min-inline-size: 0; display: flex; flex-direction: column; gap: 2px; }
.disclose-name { font-weight: 500; }
.disclose-state { flex: none; }
/* ⚠️ TABULAR, because these are read down a column and proportional digits make
   a stack of counts look bent. */
.disclose-count { color: var(--ink-quiet); font-size: 14.5px;
  font-variant-numeric: tabular-nums; }
/* ⚠️ THE CHEVRON TURNS DOWN RATHER THAN BEING SWAPPED. Same glyph, same meaning,
   one rotation — two icons for open and closed is two things to recognise. */
.disclose-turn { flex: none; color: var(--ink-faint);
  transition: rotate var(--swift) var(--move); }
.disclose[open] > .disclose-head .disclose-turn { rotate: 90deg; }
/* ⚠️ INSET BY A HAIR, NOT BY THE WIDTH OF THE FACE. Lined up under the workspace
   NAME it read as correct in a mockup and starved every sentence in practice —
   seventy-four pixels off a phone, on the one screen whose whole content is
   sentences. A rule down the inside says "these belong to the row above" in two
   pixels rather than in seventy-four. */
/* ⚠️ IT OPENS AND CLOSES RATHER THAN APPEARING AND VANISHING. A disclosure that
   snaps is the one place in this interface where a state change happens with no
   movement at all, and it is the worst place for it: the content arrives below
   the row that was pressed, so everything under it jumps and the eye has nothing
   to follow to where it went.

   ⚠️ IT IS THE DETAILS-CONTENT PSEUDO, NOT A GRID TRICK OR A SCRIPT. The element hides
   its own children when closed, so the familiar 0fr-to-1fr transition never runs
   — the closed state does not render at all. This is the part the browser owns,
   and animating the browser's own box is what keeps the element a DETAILS:
   keyboard, the open state, and a control a reader is told is expandable.

   ⚠️ AND THE FALLBACK IS THE OLD BEHAVIOUR, WHICH IS FINE. Where the pseudo is
   not supported the property is dropped and the disclosure opens instantly, as
   it did before — nothing here is load-bearing for reading the content. */
.disclose::details-content { block-size: 0; overflow: clip;
  transition: block-size var(--swift) var(--move), content-visibility var(--swift) allow-discrete; }
.disclose[open]::details-content { block-size: auto; }
.disclose-body { padding: 0 var(--pad) 6px calc(var(--pad) + 10px); }
.disclose-body > * { border-inline-start: 2px solid var(--edge); padding-inline-start: 14px; }
.disclose-body > * + * { border-block-start: 1px solid var(--edge); }

/* ------------------------------------------------- one thing being shared */

/* ⚠️ NOT THE ASK CLASS, WHICH THE CONSENT SHEET ALREADY OWNS. Two unrelated things under
   one class name is how a loading placeholder came to inherit a button's border;
   these two are neighbours in meaning and would have merged in silence.

   ⚠️ A GRID, BECAUSE THE NAME AND THE SENTENCE HAVE DIFFERENT WIDTHS. The name and
   the controls share the top line — both short, both fixed — and the sentence
   takes the whole width underneath, because it is the only part whose length is
   not knowable in advance. Laid out as a row instead, the sentence gets half a
   phone: "Your goal" wrapped to five lines and then truncated to an ellipsis while
   the switch sat in white space. */
/* ⚠️ THREE COLUMNS AND THE NAME TAKES THE SLACK. With the app's own note on the
   top line too, a four-rung control left "Your goal" about ten characters and it
   wrapped — so the note went below, where it belongs anyway: it is a fact about
   the app rather than about this line's control. */
.share { display: grid; grid-template-columns: 1fr auto auto;
  align-items: center; column-gap: 6px; row-gap: 3px; padding-block: 13px; }
/* ⚠️ EVERY PART NAMES ITS OWN COLUMN, because three of the four are optional and
   flow order is not placement: with no "needed here" to fill the third column the
   switch fell into it and sat halfway across the row, left-aligned against
   nothing. */
/* ⚠️ THE TOP LINE IS PINNED, THE REST FLOWS. The note spans every column, so
   with the control left to auto-placement it landed on the row AFTER the note —
   three rows for one item, the control adrift under a chip. */
.share-name { grid-row: 1; grid-column: 1; min-inline-size: 0; font-weight: 500; }
/* ⚠️ A READING SITS UNDER THE FACT IT COMES FROM, indented and quieter, because
   what it can disclose is bounded by what the fact allows — a row at the same
   weight beside it would read as a second, unrelated thing to decide. The rule
   down the inside is the same one the disclosure body uses, one level in. */
.reads { padding-inline-start: 30px; margin-block-start: -6px; }
.reads .share-name { font-weight: 400; color: var(--ink-quiet); }
/* ⚠️ NO SECOND RULE DOWN THE INSIDE. The disclosure body already draws one on
   every child, so a reading with its own would be two lines a millimetre apart —
   the indent alone is what says this belongs to the row above it. */
.reads .share-said { color: var(--ink-faint); }
.share > .switch { grid-row: 1; grid-column: 3; justify-self: end; }
/* ⚠️ IT NAMES THE RUNG IT IS AT, so a control with four settings is readable
   without being opened. It sits where the switch sits, because on any one row it
   is the switch — a want with more than two rungs simply has more than two
   states, and moving the control would make the column ragged. */
.share-rung { grid-row: 1; grid-column: 3; justify-self: end; display: flex; align-items: center;
  gap: 2px; max-inline-size: 46vw; padding: 5px 6px 5px 10px;
  border: 0; border-radius: var(--radius-well); background: var(--well);
  color: var(--ink); font: inherit; word-spacing: inherit; font-size: 14.5px; text-align: end;
  cursor: pointer; }
.share-rung > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share-rung .chevron { flex: none; color: var(--ink-faint); }
.share-rung:hover { background: color-mix(in oklab, var(--ink) 12%, transparent); }
.share-rung:focus-visible { outline: var(--ring); outline-offset: 2px; }
.share-said { grid-column: 1 / -1; color: var(--ink-quiet); font-size: 14px;
  line-height: 1.45; padding-inline-end: 8px; }
/* ⚠️ THE APP'S OWN CLAIM, AND IT IS QUIET. It is the one thing on this screen a
   product asserts about itself, so it is marked as a note rather than as a
   warning — a coloured pill here would read as something being wrong. */
.share-needed { grid-column: 1 / -1; justify-self: start; color: var(--ink-faint); font-size: 12.5px;
  padding-inline: 7px; padding-block: 2px; border-radius: var(--radius-well);
  background: var(--well); white-space: nowrap; }
/* ⚠️ THIRTY-EIGHT SQUARE AND BESIDE THE NAME. An info mark drawn at its own size
   is a nineteen-pixel target, which is a decoration with an onClick; and next to
   the switch it would read as part of the switch, so a thumb reaching for one
   lands on the other and the two do opposite things. */
.share-about { grid-row: 1; grid-column: 2; display: grid; place-items: center;
  inline-size: 38px; block-size: 38px; margin-inline-start: -4px;
  border: 0; border-radius: 50%; background: none; color: var(--ink-faint);
  cursor: pointer; }
.share-about:hover { color: var(--ink); background: var(--well); }
.share-about:focus-visible { outline: var(--ring); outline-offset: -2px; }

/* ------------------------------------------------------------------ about */

/* ⚠️ THE APP'S OWN SENTENCE FIRST AND AT FULL INK, because it is the answer to
   the question the mark was pressed to ask. Everything under it is the platform's
   qualification of that answer, and reads as such. */
.about { display: flex; flex-direction: column; gap: 14px; }
.about-why { font-size: 16.5px; line-height: 1.45; }
.about-line { color: var(--ink-quiet); font-size: 14.5px; line-height: 1.5; }
/* ⚠️ THE KEY IS A LEAD-IN, NOT A COLUMN. Two columns at phone width give the
   value about eighteen characters, and every line wraps to three. */
/* ⚠️ AND IT IS SET LIKE EVERY OTHER LABEL HERE. Small tracked capitals was a
   second label style in a product that already has one — the entry's — and it is
   the device an interface reaches for when a label has to look like something.
   Quiet ink at a smaller size says the same thing in the same voice. */
.about-key { display: block; color: var(--ink-faint); font-size: 13px;
  margin-block-end: 2px; }
.about-reading { padding-inline-start: 12px; border-inline-start: 2px solid var(--edge); }
/* ⚠️ WHAT IT CANNOT REVEAL IS THE HALF WORTH READING, so it is not the smaller of
   the two. It is the sentence somebody checks the arithmetic against. */
.about-hides { color: var(--ink-quiet); font-size: 14.5px; line-height: 1.5;
  margin-block-start: 4px; }

/* ------------------------------------------------------ a field is a fact */

/* ⚠️ IT REPORTS, IT DOES NOT DECIDE, so it is a note rather than a control. A
   switch under an input reads as part of the input, and deciding a disclosure
   while filling a form is the moment somebody is least equipped to think about
   it — the rung is changed in the vault, where that control is defined once. */
.note.kept { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  color: var(--ink-quiet); }
/* ⚠️ THE LOCKUP IS THE SIGN, AND IT IS SMALL. It is the same mark the card and
   the screen carry, so the person recognises where this went rather than reading
   that it went somewhere; at note size it is a signature, not a heading. */
.note.kept .lockup { font-size: 15px; color: var(--ink); }
.kept-said { font-size: 13.5px; line-height: 1.45; }

/* ⚠️ A SIGN UNDER A GROUP IS A CAPTION, NOT A ROW. Given the card's ground it
   reads as one more thing on the form — a peer of the fields, inviting the guess
   that it is another one — when what it does is explain the ones above it. So it
   carries no ground of its own and sits in the margin the card already has. */
.kept-sign { display: grid; grid-template-columns: 1fr auto; align-items: center;
  gap: 3px 10px; inline-size: 100%; padding: 4px 14px 0; text-align: start;
  border: 0; background: none; color: inherit; font: inherit; word-spacing: inherit; cursor: pointer; }
.kept-sign .lockup { grid-column: 1; font-size: 14px; color: var(--ink-quiet); }
.kept-sign .kept-said { grid-column: 1 / -1; color: var(--ink-faint); }
.kept-sign .chevron { grid-column: 2; grid-row: 1; color: var(--ink-faint); }
/* ⚠️ THE MARK BRIGHTENS RATHER THAN THE GROUND. A hover ground would put the card
   back, one state later. */
.kept-sign:hover .lockup { color: var(--ink); }
.kept-sign:focus-visible { outline: var(--ring); outline-offset: 2px; }
/* -------------------------------------------------------------------- prose */

/*
  ⚠️ THE RHYTHM IS THE WHOLE COMPONENT. A legal document is one nobody finishes
  unless the lines are short and the paragraphs have room; the page is already
  capped at 560px, so what is left to fix is the leading and the gap.

  ⚠️ NO CARD AROUND IT. A card says "one item among several"; a document IS the
  screen, and a ground behind it makes the text an inset panel somebody scrolls
  inside another thing they are scrolling.
*/
.prose { display: grid; gap: 15px; font-size: 16px; line-height: 1.62; color: var(--ink); }
.prose p { text-wrap: pretty; }
/* ⚠️ A PARAGRAPH ON A SETTINGS SCREEN IS NOT A DOCUMENT. The document sheet is
   set for reading a contract — sixteen pixels at a generous measure — and the same size
   for a sentence explaining who is responsible made six lines of full-ink body
   copy the first thing on a screen somebody opened to see a list. Quiet, at the
   size the rest of the interface reads at. */
.prose-quiet { font-size: 15px; line-height: 1.5; color: var(--ink-quiet); gap: 12px; }

/* ⚠️ AWAY FROM HERE, AND IT LOOKS IT. An address rendered as more of the page is
   how somebody agrees to a summary believing they read the contract. */
.prose-away { margin-block-start: 18px; font-size: 15px; }
.prose-away a { color: var(--accent); text-underline-offset: 3px; }

/* What was agreed, where the button would have been. Same place, same question. */
.prose-said { color: var(--ink-quiet); font-size: 15px; }
`.trim();
