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

/* ⚠️ THREE LINES, IN THE ORDER SOMEBODY ASKS THEM: what this company does, what
   it gets, and where it goes with it. The first two are what a person wants; the
   third is what a questionnaire wants, so it is last and quiet. */
.party { display: grid; gap: 4px; }
.party-role { font-size: 15px; }
.party-where { color: var(--ink-quiet); font-size: 13.5px; }
`.trim();
