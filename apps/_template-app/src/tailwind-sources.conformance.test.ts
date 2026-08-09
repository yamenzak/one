/**
 * EVERY WORKSPACE PACKAGE THAT RENDERS IS `@source`'d.
 *
 * Tailwind v4 auto-detects source under the app tree, and a package resolved
 * through node_modules is NOT under it. Miss one and its components still mount,
 * still typecheck, and still pass every other test — they just render with a
 * SUBSET of their classes, whichever ones some file in this app happened to use
 * too. There is no error, no warning, and no failing assertion anywhere.
 *
 * Kova lost half a day to exactly this: `@4dl/app-kit` was missing, so an update
 * card rendered flush against the browser chrome with its buttons clipped, and
 * the first two diagnoses blamed the CSS instead. This test is that half-day,
 * spent once.
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
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    const declared = new Set([...css.matchAll(/@source\s+"([^"]+)"/g)].map((m) => m[1]!.split("/").at(-2)!));

    const app = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    // Only what this app actually depends on. A package it does not import
    // contributes no classes and does not belong in the scan.
    const depended = Object.keys(app.dependencies ?? {})
      .filter((d) => d.startsWith("@4dl/"))
      .map((d) => d.split("/")[1]!);

    const missing = depended.filter((n) => rendersJsx(n) && !declared.has(n));
    expect(missing, `styles.css is missing @source for: ${missing.join(", ")}`).toEqual([]);
  });
});
