/**
 * A COMPONENT DRAWS ITS OWN PLACEHOLDER — one geometry, not two files that agree.
 *
 * ⚠️ A SKELETON WRITTEN BESIDE A COMPONENT IS A COPY OF ITS MEASUREMENTS, AND
 * COPIES DRIFT. Both of the ones this replaced had, silently, and one of them
 * badly: `TilesWaiting` laid its grid out at `minmax(min(8rem, 100%), 1fr)`
 * while `TileGrid` uses `minmax(min(6rem, 45%), 1fr)`. Measured at 390 with six
 * tiles, the real thing is 236px in three columns and the placeholder was 360px
 * in two — half a screen taller, in the wrong shape, so the page jumped 124px
 * when the content landed. That is the entire fault a skeleton exists to
 * prevent, wearing the fix's clothes. `RowsWaiting` was 24px short over three
 * rows for the same reason.
 *
 * ⚠️ SO THE PLACEHOLDER IS THE COMPONENT, IN ANOTHER MODE. Under `Waiting` a
 * component returns its own bones — drawn from the same container, the same
 * classes and the same tokens, in the same file — and there is no second
 * definition to keep in step. A grid it changes is a grid its placeholder
 * changed.
 *
 * ⚠️ AND A SCREEN'S PLACEHOLDER IS THEN COMPOSITION RATHER THAN A DRAWING.
 * Wrapping a real tree in `Waiting` gives back that tree's layout with every
 * leaf as bones, so the spacing, the widths and the wrapping are the screen's
 * own — which is what nobody can copy correctly by hand.
 *
 * ⚠️ WHAT THIS IS NOT: a way to draw a screen with no data. Half a screen's
 * structure is a function of what it fetched — rows come from a `map`, blocks
 * from a condition — so a tree rendered with nothing is a shorter, emptier page
 * than the real one, which is the jump again. What stands in for a screen is
 * `recall.tsx`: the geometry the screen actually drew, measured. This is for the
 * pieces, and `recall` is for the page.
 */

import * as React from "react";

const Bones = React.createContext(false);

/**
 * ⚠️ READ BY THE COMPONENT, NOT BY ITS CALLER. A prop would mean every list, row
 * and grid on a waiting screen has to be handed the same flag by whoever
 * composed it — which is twenty places to forget, and forgetting draws the real
 * thing with no data rather than a placeholder.
 */
export const useBones = (): boolean => React.useContext(Bones);

/** Everything inside draws its own placeholder instead of itself. */
export function Waiting({ children }: { readonly children?: React.ReactNode }) {
  return (
    <Bones.Provider value>
      {/* ⚠️ ONE ANNOUNCEMENT FOR THE WHOLE THING. Every bar inside is decorative;
          what a reader needs to know is that the region is loading, once. */}
      <div role="status" aria-label="Loading">{children}</div>
    </Bones.Provider>
  );
}

/**
 * ⚠️ THE COUNT IS THE ONE THING BONES CANNOT KNOW, so it is passed as data. A
 * component under `Waiting` ignores what is IN each item and draws a bar; how
 * MANY there are is the caller's, because it is the only part of the shape that
 * did not come from the component.
 */
export const blanks = (many: number): readonly { readonly id: string }[] =>
  Array.from({ length: Math.max(0, many) }, (_, i) => ({ id: `bone-${i}` }));
