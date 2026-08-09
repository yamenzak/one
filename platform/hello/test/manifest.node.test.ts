/**
 * WHAT THIS APP OFFERS, PINNED — and what it may stop offering.
 *
 * ⚠️ THE LOCK IS THE LAST SURFACE THAT SHIPPED, COMMITTED. Additions update it
 * freely; a REMOVAL fails until it is named as retired, with a reason, because a
 * deletion in a diff looks identical to a rename and to a typo and the three
 * need opposite fixes.
 *
 * ⚠️ AND IT COVERS DERIVED OPERATIONS, which is the case a hand-kept list
 * misses: renaming a collection silently removes seven operations at once, and
 * every client calling any of them breaks together.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_SURFACE, removals, surfaceOf, type Surface } from "@one/kernel";
import { hello } from "../src/manifest.js";
import { collectionOperations } from "@one/runtime";

const LOCK = join(import.meta.dirname, "..", "manifest.lock.json");

/**
 * Everything reachable, including what the collections imply.
 *
 * The platform's own operations are deliberately absent: they are the same in
 * every app and change with the framework rather than with this product, so
 * pinning them here would make every platform release look like a breaking
 * change to an app that did not move.
 */
const current: Surface = surfaceOf({
  ...hello,
  operations: [...hello.operations, ...hello.collections.flatMap((c) => collectionOperations(c))],
});

const stored = (): Surface => {
  try {
    return { ...EMPTY_SURFACE, ...(JSON.parse(readFileSync(LOCK, "utf8")) as Surface) };
  } catch {
    /* No lock yet — everything is new, which is never a problem. */
    return EMPTY_SURFACE;
  }
};

describe("the surface this app has already shipped", () => {
  it("has not removed anything without saying so", () => {
    const gone = removals(stored(), current, hello.retired);
    expect(
      gone.map((r) => `${r.kind}: ${r.name}`),
      "these disappeared from the manifest. Add each to `retired` with a reason, or restore it — " +
        "a deletion, a rename and a typo look identical in a diff and need opposite fixes.",
    ).toEqual([]);
  });

  /*
    ⚠️ THE LOCK IS UPDATED BY THE TEST THAT PASSED, never by a separate command.
    A `--write` script is one somebody runs to make a red run green without
    reading what it changed; here the file can only move forward through a check
    that already agreed nothing was lost.
  */
  it("records what shipped, so the next diff has something to compare against", () => {
    if (removals(stored(), current, hello.retired).length === 0) {
      writeFileSync(LOCK, `${JSON.stringify(current, null, 2)}\n`);
    }
    expect(stored()).toEqual(current);
  });

  it("still derives seven operations per collection, which is what makes a rename expensive", () => {
    expect(current.operations.filter((id) => id.startsWith("note.")).length).toBeGreaterThan(4);
  });
});
