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
  "/space/console/telling": [{"head":0,"rows":2,"height":256},{"head":52,"rows":1,"height":208}],
  "/space/told": [{"head":0,"rows":2,"height":168}],
  "/space/w/*/brand": [{"head":52,"rows":6,"height":1016}],
  "/space/workspaces": [{"head":0,"rows":1,"height":96}],
};
