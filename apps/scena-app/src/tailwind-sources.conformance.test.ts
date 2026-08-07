/**
 * EVERY WORKSPACE PACKAGE THAT RENDERS IS `@source`'d.
 *
 * Tailwind v4 auto-detects source under the app tree, and a package resolved
 * through node_modules is NOT under it. Miss one and its components still mount,
 * still typecheck, and still pass every other test — they just render with a
 * SUBSET of their classes, whichever ones some file in this app happened to use
 * too. There is no error, no warning, and no failing assertion anywhere.
 *
 * Scena is the app that proves the point twice over. Kova and Tessa both carry
 * this test; Scena did not, and its `index.css` was missing `@4dl/admin` — so
 * the operator console rendered here with whatever classes the dashboard
 * happened to share, and nothing said so. The sibling of
 * `apps/tessa-app/src/tailwind-sources.conformance.test.ts`, for the same
 * reason and with the same shape.
 *
 * It is deliberately a DIRECTORY SCAN rather than a hard-coded list: adding a
 * package with JSX in it should make this fail, which is the whole point.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../../", import.meta.url).pathname;
const PACKAGES = join(ROOT, "packages");

/** Does this package ship any component that Tailwind would need to scan? */
function rendersJsx(dir: string): boolean {
  const src = join(PACKAGES, dir, "src");
  if (!existsSync(src)) return false;
  const walk = (d: string): boolean =>
    readdirSync(d, { withFileTypes: true }).some((e) => {
      const p = join(d, e.name);
      if (e.isDirectory()) return walk(p);
      return e.name.endsWith(".tsx") && !e.name.includes(".test.");
    });
  return walk(src);
}

describe("tailwind sources", () => {
  it("names every workspace package that renders", () => {
    const css = readFileSync(new URL("./index.css", import.meta.url), "utf8");
    const declared = new Set([...css.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]!.split("/").at(-2)!));

    const app = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    // Only what this app actually depends on. A package it does not import
    // contributes no classes and does not belong in the scan.
    const depended = Object.keys(app.dependencies ?? {})
      .filter((d) => d.startsWith("@4dl/") || d.startsWith("@scena/"))
      .map((d) => d.split("/")[1]!)
      // The workspace directory for `@scena/widgets` is `scena-widgets`.
      .map((n) => (existsSync(join(PACKAGES, n)) ? n : `scena-${n}`));

    const missing = depended.filter((n) => rendersJsx(n) && !declared.has(n));
    expect(missing, `index.css is missing @source for: ${missing.join(", ")}`).toEqual([]);
  });

  it("still scans the packages it is meant to", () => {
    // A guard on the guard: if `rendersJsx` or the dependency mapping silently
    // stopped resolving, the test above would pass by finding nothing to check.
    expect(rendersJsx("ui"), "@4dl/ui renders — the scanner should say so").toBe(true);
    expect(rendersJsx("admin"), "@4dl/admin renders — the scanner should say so").toBe(true);
  });
});
