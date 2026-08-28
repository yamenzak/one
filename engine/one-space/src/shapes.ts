/**
 * WHAT EACH SCREEN MEASURED, SO THE FIRST VISIT IS NOT A GUESS.
 *
 * ⚠️ GENERATED — `node engine/scripts/shots.mjs`. Every number here was read
 * off a real screen, in a real browser, holding real data: the harness that
 * photographs the product also reads back what `useRecalledShape` measured,
 * so this file and the runtime cannot disagree about what a shape is.
 *
 * ⚠️ AND IT IS ONLY THE FIRST PAINT. `recall` replaces every one of these with
 * what the screen actually drew, on the first render after it arrives — so a
 * screen that has changed since this was generated costs one frame of
 * slightly-wrong bars rather than the generic preset's very-wrong ones.
 */

import type { Block } from "@engine/design";

export const SHAPES: Readonly<Record<string, readonly Block[]>> = {
  "/space/console/telling": [{"head":0,"rows":3,"height":281},{"head":53,"rows":1,"height":217}],
  "/space/told": [{"head":28,"rows":1,"height":133},{"head":28,"rows":2,"height":205},{"head":28,"rows":0,"height":60}],
  "/space/w/*/brand": [{"head":53,"rows":5,"height":962}],
  "/space/workspaces": [{"head":0,"rows":1,"height":96}],
};
