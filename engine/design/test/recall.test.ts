/**
 * WHICH SEED A SCREEN GETS — the one decision in `recall` that is pure.
 *
 * ⚠️ AND IT IS THE ONE THAT DECIDES WHETHER THE SEED EXISTS AT ALL. Half the
 * addresses in this product carry a NAME — `/space/w/<workspace>/brand` — and a
 * generated seed keyed on the harness's own throwaway workspace is a key nobody
 * will ever have: the file looks like coverage, every lookup misses, and the
 * screens fall back to the preset exactly as they did before the work. It was
 * generated that way first.
 */

import { describe, expect, it } from "vitest";
import { shapeFor, type Block } from "../src/parts/recall.js";

const one: readonly Block[] = [{ head: 0, rows: 2, height: 168 }];
const two: readonly Block[] = [{ head: 52, rows: 6, height: 1016 }];

const SEEDS = {
  "/space/told": one,
  "/space/w/*/brand": two,
};

describe("finding a screen's seed", () => {
  it("takes the exact address where there is one", () => {
    expect(shapeFor(SEEDS, "/space/told")).toBe(one);
  });

  /* ⚠️ THE WHOLE POINT: a workspace nobody has ever opened, on a screen that was
     measured under a different workspace's name. */
  it("matches a starred segment against any one name", () => {
    expect(shapeFor(SEEDS, "/space/w/northwind/brand")).toBe(two);
    expect(shapeFor(SEEDS, "/space/w/anything-at-all/brand")).toBe(two);
  });

  /* ⚠️ ONE SEGMENT, NOT A PREFIX. A star that swallowed the rest of the path
     would hand the brand screen's shape to every screen under a workspace —
     which is the wrong drawing at the right size, and worse than none. */
  it("does not let a star run past its own segment", () => {
    expect(shapeFor(SEEDS, "/space/w/northwind/brand/extra")).toBeUndefined();
    expect(shapeFor(SEEDS, "/space/w/northwind")).toBeUndefined();
  });

  it("has nothing to say about a screen it has never seen", () => {
    expect(shapeFor(SEEDS, "/space/console/keys")).toBeUndefined();
    expect(shapeFor({}, "/space/told")).toBeUndefined();
  });

  /*
    ⚠️ AND AN EXACT KEY BEATS A PATTERN, whichever order they happen to be in.
    A screen that measured itself under its own full address knows more than a
    generalisation does.
  */
  it("prefers what it knows exactly", () => {
    const exact: readonly Block[] = [{ head: 1, rows: 1, height: 1 }];
    expect(shapeFor({ ...SEEDS, "/space/w/one/brand": exact }, "/space/w/one/brand"))
      .toBe(exact);
  });
});
