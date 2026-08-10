/**
 * ⚠️ THE LOCK IS THE LAST SURFACE THAT SHIPPED. Additions are free — nobody
 * holds what did not exist. A REMOVAL fails until it is named as retired, with a
 * reason, because a deletion, a rename and a typo look identical in a diff and
 * need opposite fixes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMPTY_SURFACE, removals, surfaceOf, type Surface } from "@one/kernel";
import { collectionOperations } from "@one/runtime";
import { kova } from "../src/manifest.js";

const LOCK = join(import.meta.dirname, "..", "manifest.lock.json");

const current: Surface = surfaceOf({
  ...kova,
  operations: [...kova.operations, ...kova.collections.flatMap((c) => collectionOperations(c))],
});

const stored = (): Surface => {
  try {
    return { ...EMPTY_SURFACE, ...(JSON.parse(readFileSync(LOCK, "utf8")) as Surface) };
  } catch {
    return EMPTY_SURFACE;
  }
};

describe("the surface this app has already shipped", () => {
  it("has not removed anything without saying so", () => {
    expect(
      removals(stored(), current, kova.retired).map((r) => `${r.kind}: ${r.name}`),
      "these disappeared from the manifest. Add each to `retired` with a reason, or restore it.",
    ).toEqual([]);
  });

  it("records what shipped, so the next diff has something to compare against", () => {
    if (removals(stored(), current, kova.retired).length === 0) {
      writeFileSync(LOCK, `${JSON.stringify(current, null, 2)}\n`);
    }
    expect(stored()).toEqual(current);
  });
});
