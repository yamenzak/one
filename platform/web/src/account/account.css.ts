/**
 * WHAT IS ONLY THE ACCOUNT CENTRE'S — and it is a handful of rules.
 *
 * ⚠️ THIS FILE BEING SHORT IS THE POINT. Everything a second screen turned out to
 * need has moved to `ui.css.ts`; what is left is the way THIS product's screens
 * announce themselves — a centred lockup at the root, a large left-aligned name
 * with a face beside it one level in. The next screen that wants a face beside
 * its title is what moves those.
 */

export const ACCOUNT_CSS = `
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
   off the screen it came from — the point of arriving here is seeing it.

   ⚠️ THE TILE AND ITS BADGE ARE THE MARK'S, NOT THIS FILE'S. They were a 62-pixel
   circle and a disc at −1px, which is a bounding-box corner and therefore empty
   space beside an arc: the camera looked stuck to the outside of somebody's
   photograph. What is left here is the press, which is all a button contributes. */
.portrait { position: relative; flex: none; border: 0; padding: 0; background: none;
  cursor: pointer; border-radius: var(--radius-well); }
.portrait:focus-visible { outline: var(--ring); outline-offset: 3px; }

.page-title { align-self: center; font-size: 25px; line-height: 1;
  margin-block: 10px 4px; word-spacing: normal; }

/* -------------------------------------------------------------- the products */

/*
  ⚠️ A PRODUCT'S NAME IS SET AS A NAME, WHICH IS THE FACE THE ACCOUNT CENTRE
  ALREADY NAMES ITSELF IN. In the text face a row for Kova is a row about a word;
  in the brand face at the row's own size it is the product, recognised before it
  is read — the same argument the lockup makes one level up, minus the mark,
  which is ours and not theirs.
*/
.wordmark { font-family: var(--font-brand); font-size: 18px; font-weight: 600;
  letter-spacing: -0.03em; word-spacing: normal; }
/* ⚠️ AT TITLE SIZE IT IS THE SAME DECISION, ONE STEP UP. The page name is already
   the brand face; what this adds is the tighter tracking a name is set with, which
   at 32px is the difference between a product and a heading about one. */
.wordmark-title { letter-spacing: -0.04em; }

/* --------------------------------------------------------------- what moved */

/*
  ⚠️ IT SITS ABOVE THE TEXT AND IS NOT PART OF IT. A summary of changes inside the
  document is a paragraph somebody has to find; above it, in its own ground, it is
  the first thing read — which on the one day it exists is the whole point of the
  screen being opened again.
*/
.changed { display: grid; gap: 4px; padding: 14px 16px; border-radius: var(--radius-card);
  background: var(--warn-well); color: var(--ink); font-size: 15px; line-height: 1.5; }
/* ⚠️ SENTENCE CASE, LIKE EVERY OTHER SIGN IN THE PRODUCT. Small tracked capitals
   is the one typographic device this interface does not use anywhere else — it is
   a label on a form — and it was here, in amber, on the one screen somebody is
   asked to read carefully. The tone and the weight already say it is a sign. */
.changed-what { color: var(--warn); font-size: 13.5px; font-weight: 600; }
`.trim();
