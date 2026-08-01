/**
 * TAILWIND ONLY SEES WHAT IT IS POINTED AT.
 *
 * Tailwind v4 scans the app's own tree automatically, but a workspace package
 * resolved through `node_modules` is not scanned — it has to be named with an
 * explicit `@source` in `styles.css`. Miss one and the failure is silent in
 * every channel we normally trust: the components still mount, still typecheck,
 * still pass every unit test, and still render — just with whichever subset of
 * their classes some *other* file happened to use too. Nothing is thrown, and
 * the build is green.
 *
 * That is not hypothetical. `@4dl/app-kit` was missing from the list, so
 * `PwaUpdatePrompt` shipped without `pb-[calc(6rem+env(safe-area-inset-bottom))]`
 * or `z-[70]`: the "A new version is ready" card sat flush against the mobile
 * browser chrome with its buttons clipped, on production, at the operator door.
 * It took a screenshot from a human to find, because there is no other detector.
 *
 * So this test is the detector. It asserts the invariant directly — every
 * workspace package that contains JSX is scanned — rather than checking any one
 * class, because the next package added will have different classes and the same
 * failure mode.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const PACKAGES = join(ROOT, "packages");
const STYLES = join(ROOT, "apps/app/src/styles.css");

/** Every `packages/<name>` whose `src` tree contains at least one `.tsx` file —
 *  i.e. every shared package that renders, and therefore carries class names. */
function renderingPackages(): string[] {
  const out: string[] = [];
  for (const name of readdirSync(PACKAGES)) {
    const src = join(PACKAGES, name, "src");
    if (!existsSync(src)) continue;
    if (hasTsx(src)) out.push(name);
  }
  return out.sort();
}

function hasTsx(dir: string): boolean {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (hasTsx(full)) return true;
    } else if (entry.name.endsWith(".tsx")) return true;
  }
  return false;
}

/** The package names named by an `@source` line, however the path is written. */
function scannedPackages(): Set<string> {
  const css = readFileSync(STYLES, "utf8");
  const found = new Set<string>();
  for (const m of css.matchAll(/@source\s+"([^"]+)"/g)) {
    const pkg = /packages\/([^/"]+)/.exec(m[1] ?? "");
    if (pkg?.[1]) found.add(pkg[1]);
  }
  return found;
}

describe("every rendering workspace package is scanned for class names", () => {
  it("finds the packages that render at all — the guard's own precondition", () => {
    // If this ever comes back empty the test below passes vacuously and stops
    // guarding anything, so assert the discovery works before trusting it.
    const pkgs = renderingPackages();
    expect(pkgs.length).toBeGreaterThan(0);
    expect(pkgs).toContain("ui");
  });

  it("names each of them in an @source directive", () => {
    const scanned = scannedPackages();
    const missing = renderingPackages().filter((p) => !scanned.has(p));
    expect(
      missing,
      missing.length
        ? `packages/${missing.join(", packages/")} contain JSX but are not @source'd in apps/app/src/styles.css. ` +
            `Their components will render with missing Tailwind classes and nothing else will report it. ` +
            `Add \`@source "../../../packages/<name>/src";\` for each.`
        : "",
    ).toEqual([]);
  });
});
