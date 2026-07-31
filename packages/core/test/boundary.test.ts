import { describe, expect, it } from "vitest";
import { findBoundaryViolations, formatViolations, violationKeys } from "../src/boundary.js";

/**
 * `boundary.ts` is the file that DEFINES the banned vocabulary, so it necessarily
 * contains every banned word. Exempting it is not debt — there is nothing to fix.
 * Everything else in `@4dl/core` is clean and must stay that way: this is the
 * package every other one depends on, so a leak here reaches all of them.
 */
const ALLOW = [
  "src/boundary.ts:@bocca/",
  "src/boundary.ts:@kova/",
  "src/boundary.ts:@scena/",
  "src/boundary.ts:checkin",
  "src/boundary.ts:inventory",
  "src/boundary.ts:kova",
  "src/boundary.ts:meal",
  "src/boundary.ts:studio",
];

const dir = new URL("..", import.meta.url).pathname;

describe("package boundary", () => {
  it("imports nothing from an app", () => {
    const v = findBoundaryViolations({ dir, allow: ALLOW }).filter((x) => x.kind === "app-import");
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("carries no product vocabulary outside the list that defines it", () => {
    const v = findBoundaryViolations({ dir, allow: ALLOW });
    expect(v, `\n${formatViolations(v)}`).toHaveLength(0);
  });

  it("keeps the frozen list honest", () => {
    const all = violationKeys(findBoundaryViolations({ dir }));
    expect(ALLOW.filter((a) => !all.includes(a))).toEqual([]);
  });

  it("reads code, not prose", () => {
    // Every header in this repo explains a boundary by naming what is on the
    // other side of it. If the checker read comments, no file could document
    // itself — and the first response would be to delete the checker.
    const v = findBoundaryViolations({ dir: new URL("./fixtures/prose", import.meta.url).pathname, scan: "." });
    expect(formatViolations(v)).toBe("");
  });

  it("catches a leak in code", () => {
    const v = findBoundaryViolations({ dir: new URL("./fixtures/leaky", import.meta.url).pathname, scan: "." });
    expect(v.map((x) => x.token)).toEqual(["client"]);
  });
});
