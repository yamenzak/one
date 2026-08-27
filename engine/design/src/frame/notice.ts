/**
 * WHERE A CONFIRMATION'S ONE CONTROL SITS — see `notice` in `overlay.tsx`.
 *
 * ⚠️ IT IS CSS RATHER THAN A PROP BECAUSE THE TOAST'S MARKUP IS NOT OURS. A
 * notice is put on a queue and the host draws it through a portal, so there is
 * no element here to hand a class to except the button itself — and the button
 * is not what needs moving. Measured: `.toast__content` is a flex COLUMN with
 * `align-items: flex-start`, which is why `self-end` on the action did nothing
 * and why the way back landed under the sentence with the whole trailing half of
 * the row empty and the toast half again as tall as it needed to be.
 *
 * ⚠️ A ROW ONLY WHEN THERE IS A CONTROL, AND ONLY WITH NOTHING ELSE IN IT. An
 * ordinary confirmation is one sentence and wants the library's own column; a
 * toast carrying a title AND a description AND a control has three things, and a
 * row would set the description beside the title rather than under it. Both are
 * expressible, so both are said, and anything this does not describe falls back
 * to what the library does — which is the right answer for a shape nobody here
 * has designed.
 *
 * ⚠️ AND THE SIZING IS THE LIBRARY'S, WHICH IS WHY THERE IS NONE HERE. The
 * obvious companions — the sentence growing, `min-width: 0` so it wraps rather
 * than pushing the control out, the control refusing to shrink — were written,
 * and then every one of them was deleted in turn against a sentence longer than
 * the row with no test noticing. HeroUI's own title and action already resolve
 * that way, so what would have shipped is three declarations nothing relies on,
 * which is a rule somebody eventually relies on wrongly. Turning the box is the
 * whole of the change.
 */
export const NOTICE_CSS = `
.toast__content:has(.toast__action):not(:has(.toast__description)) {
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}
`;
