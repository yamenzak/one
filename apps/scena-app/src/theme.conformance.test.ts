/**
 * THE `.dark` CLASS IS INERT, AND THE ONLY WAY TO NOTICE IS A TEST.
 *
 * `@4dl/ui`'s tokens are dark-first: `:root` holds the dark palette and the
 * light one lives under `:root[data-theme="light"]`. Nothing in this app has
 * carried a `.dark` CLASS since Stage 7a, so writing one is a no-op that reads
 * exactly like an intention — `className="dark min-h-screen …"` on the kiosk
 * and the board-control tablet said "this surface is always dark" and did
 * nothing at all, for as long as it took somebody to look at a lobby tablet in
 * a light theme.
 *
 * The fix is `useForcedDark()`. This is what stops the class coming back.
 *
 * Plain source reading, deliberately: the alternative is mounting each screen
 * in jsdom, which tests the render and not the thing that was wrong.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(fileURLToPath(new URL(".", import.meta.url)));

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * `className="dark …"` / `className={"… dark …"}` — the class-TOKEN form only,
 * so `dark:bg-…` variants and words like `darken` are left alone.
 *
 * ⚠️ The left boundary has to include the OPENING QUOTE, not just whitespace.
 * The first version used `(?:^|\s)dark`, and `^` under the `m` flag is the start
 * of a LINE — so `className="dark min-h-screen …"`, which is exactly the string
 * this test exists to catch, sailed straight through it. Caught by breaking the
 * fix and watching this assertion still pass.
 */
/** Block and line comments out, so prose about the rule is not a violation. */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const DARK_CLASS = /className\s*=\s*(?:"|'|\{\s*[`"'])(?:[^"'`]*\s)?dark(?:\s|"|'|`)/;

describe("the theme is an attribute, not a class", () => {
  const files = sources(SRC);

  it("finds the app's sources at all (a silent zero would pass everything)", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it("has no `dark` class token in any className", () => {
    // Comments FIRST. `theme.tsx`'s own header quotes `className="dark"` while
    // explaining why it is wrong, and a guard that fails on the documentation
    // of the rule it enforces is a guard somebody deletes.
    const offenders = files.filter((f) => DARK_CLASS.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders.map((f) => f.slice(SRC.length))).toEqual([]);
  });

  /*
    ⚠️ `useForcedDark` LIVES IN `@4dl/app-kit` NOW, not in this app.

    It is a DOM hook with no product vocabulary — "pin this surface dark while it
    is mounted" is true of any customer-facing screen — and it moved with the
    three-state mode model. This test therefore checks the two things that are
    still Scena's: that the hook is REACHED from the platform, and that exactly
    the two surfaces which need it call it.

    Asserting on the implementation here would have been the wrong guard anyway:
    it would pass while both call sites had been deleted, which is the failure
    that actually happened (a `className="dark"` that did nothing).
  */
  it("pins the two customer-facing surfaces dark, through the platform's hook", () => {
    const callers = files.filter((f) => /useForcedDark\(\)/.test(readFileSync(f, "utf8")));
    expect(callers.map((f) => f.slice(SRC.length)).sort()).toEqual([
      "pages/BoardControlApp.tsx",
      "pages/Kiosk.tsx",
    ]);
    // …and from the package, not a local re-implementation. A second copy is how
    // the two drift apart, and this one is four lines — exactly the size that
    // gets re-typed rather than imported.
    for (const f of callers) {
      expect(readFileSync(f, "utf8"), `${f} must import useForcedDark, not define it`).not.toContain("function useForcedDark");
    }
    expect(readFileSync(join(SRC, "theme.tsx"), "utf8")).toContain('from "@4dl/app-kit"');
  });

  /*
    THE THIRD MODE STATE IS THE PLATFORM'S, and this app must not grow its own
    again.

    Scena carried ~110 lines of theme module for one feature `@4dl/ui` lacked
    ("follow the system"), and the cost was not the duplication: it meant Scena
    could not mount `ThemeProvider` at all, so it silently went without the
    browser-chrome white-labelling and the theme-color meta the other two apps
    have. `@4dl/ui` has `ThemeChoice` now. A re-grown local `matchMedia` listener
    or `localStorage` mode read is the beginning of the same divergence.
  */
  it("reads the mode from the platform, not from the browser directly", () => {
    const offenders = files
      .map((f) => [f, stripComments(readFileSync(f, "utf8"))] as const)
      .filter(([, src]) => /prefers-color-scheme/.test(src) || /localStorage\.(get|set)Item\(\s*THEME_STORAGE_KEY/.test(src))
      .map(([f]) => f.slice(SRC.length));
    expect(offenders).toEqual([]);
  });
});
