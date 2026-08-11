/**
 * WHAT IS ONLY THE ACCOUNT CENTRE'S — and it is four rules.
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
`.trim();
