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

.page-title { align-self: center; font-size: 25px; line-height: 1;
  margin-block: 10px 4px; word-spacing: normal; }

/* ----------------------------------------------------------------- tags */

/*
  ⚠️ A CLOSED SET, READ AT A GLANCE. A data category is one of seventeen and a
  recipient receives three or four; as a comma list they are prose to be parsed,
  and the question somebody actually has — is my health data in there — is
  answered by scanning rather than by reading to the end.

  ⚠️ NOT THE CHIP, WHICH IS FOR PROSE. Its own header says so: it carries a FACE
  into a sentence, and these have no face and are not in a sentence. Not the pill
  either — that is a status on a row, and a category is not a state.

  ⚠️ AND IT LIVES HERE UNTIL A SECOND SCREEN WANTS IT, which is the rule the
  shared sheet states at the top of itself. One use is not a vocabulary.
*/
.tags { display: flex; flex-wrap: wrap; gap: 5px; margin-block-start: 3px; }
.tag { padding: 2px 9px; border-radius: var(--radius-well); white-space: nowrap;
  background: color-mix(in oklab, var(--ink) 9%, transparent);
  color: var(--ink-quiet); font-size: 13.5px; word-spacing: normal; }
/* ⚠️ ARTICLE 9 IS MARKED ON THE CATEGORY ITSELF, not only on the row's total. A
   reader looking for one word finds it here rather than inferring it from a
   badge at the end of the line. */
.tag[data-special] { background: var(--warn-well); color: var(--warn); }

/*
  ⚠️ FOUR LINES, IN THE ORDER SOMEBODY ASKS THEM: who this is, what they do, what
  they get, and where they go with it. The first two are what a person wants; the
  last is what a questionnaire wants, so it is quiet and at the bottom.

  ⚠️ IT IS A RECORD, NOT A FIELD, WHICH IS WHY IT IS NOT AN ENTRY. Written as
  one, the company NAME was the label — quiet, small, above — and its job
  description was the value, at full ink. That inverts the one thing somebody
  scanning "who has my data" is scanning FOR: they were reading a column of grey
  company names under a column of white sentences about hosting and payment.
*/
.party { display: grid; gap: 6px; padding: 15px var(--pad); }
/* ⚠️ THE MARK AND THE NAME ARE ONE OBJECT, and the mark is the row's icon well
   rather than a logo at its own size — a company drawn larger than the platform
   icons beside it is the one row in a column that does not line up. */
.party-head { display: flex; align-items: center; gap: 14px; }
.party-said { min-inline-size: 0; display: grid; gap: 2px; }
.party-name { font-size: 17px; line-height: 1.35; }
.party-role { color: var(--ink-quiet); font-size: 15px; line-height: 1.35; }
.party-where { color: var(--ink-faint); font-size: 13.5px; }
/* ⚠️ THE LINKS ARE AT THE END AND THEY ARE QUIET. Their processing terms and
   their own trust page are what a person checks rather than what they read, so
   they sit under the record as two small doors instead of competing with the
   name for the top of it. */
.party-links { display: flex; flex-wrap: wrap; gap: 14px; margin-block-start: 2px; }
.party-links a { color: var(--accent); font-size: 13.5px; text-underline-offset: 3px; }

/* ------------------------------------------------------------- somebody else */

/*
  ⚠️ THE VENDOR'S COLOUR AS A GROUND, NOT AS A FILL. Four saturated logo tiles in
  a column is a sponsor wall; the same four mixed into the card's own surface are
  a list with identities in it — and the mix survives both themes without a
  second set of values, which a painted brand colour does not.

  ⚠️ THE SAME WELL AS EVERY OTHER ROW'S ICON. A logo at its own size beside a
  column of platform icons is the one row that does not line up, and it is the row
  a reader is most likely to be scanning.
*/
/* ⚠️ A ROUNDED SQUARE, NEVER A DISC. Round is a symbol or a person; a company is
   a thing with an identity of its own, and its mark in a circle is its mark with
   the corners cut off — the same rule the workspace mark is set by. */
/* ⚠️ AND A HAIRLINE IN THE SAME HUE, WHICH IS WHAT MAKES A ONE-COLOUR MARK READ.
   A logo drawn in the colour of the ground it sits on is legible in one theme and
   a smudge in the other; the ring gives the tile an edge regardless, so the mark
   inside it is being framed rather than doing that work itself. */
.vendor { flex: none; display: grid; place-items: center;
  inline-size: 44px; block-size: 44px; border-radius: 14px;
  background: color-mix(in oklab, var(--vendor, var(--ink)) 16%, var(--card));
  box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--vendor, var(--ink)) 26%, transparent); }
.vendor svg { inline-size: 30px; block-size: 30px; }
/* ⚠️ A LETTER, NEVER A DRAWN OFFICE BLOCK. A generic building beside three real
   marks reads as a company nobody could identify; an initial in the same well
   reads as one whose mark we simply do not draw. */
.vendor-letter { font-family: var(--font-brand); font-size: 19px; font-weight: 600;
  color: var(--ink-quiet); }

/* ------------------------------------------------------------- where it lives */

/*
  ⚠️ AN IDENTITY, SO IT IS A CHIP WITH A FACE. Global and pinned-to-the-union are
  two commitments rather than two values, and the pair have to be told apart at a
  glance in a list — which is the job the interface already gives a face beside a
  name everywhere else something HAS an identity.
*/
.jurisdiction { display: inline-flex; align-items: center; gap: 10px; }
.jurisdiction-face { flex: none; display: flex; inline-size: 24px; block-size: 24px; }
.jurisdiction-said { min-inline-size: 0; display: grid; gap: 2px; }
.jurisdiction-name { font-size: 15px; }
/* ⚠️ THE SENTENCE ONLY WHERE THE SURFACE IS ABOUT RESIDENCY. In a list it is a
   paragraph beside every row; on the screen that answers where things are kept it
   is the reason somebody is reading. */
.jurisdiction[data-explain] { align-items: flex-start; }
.jurisdiction-means { color: var(--ink-quiet); font-size: 13.5px; line-height: 1.4; }
/* ⚠️ A REGION NOBODY HAS NAMED IS PRINTED AS ITSELF. The id is open by design, so
   a deployment may add a third; a prettified guess would be a screen inventing
   where somebody's data is, on the screen that exists to answer exactly that. */
.chip[data-plain] { padding-inline: 10px; font-size: 14.5px; }

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
.changed-what { color: var(--warn); font-size: 13px; font-weight: 600;
  letter-spacing: 0.02em; text-transform: uppercase; }
`.trim();
