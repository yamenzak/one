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

  it("keeps `useForcedDark` as the way a surface pins itself dark", () => {
    // If this disappears, the two customer-facing surfaces have gone back to
    // inheriting the operator's theme — which is what the class used to hide.
    const theme = readFileSync(join(SRC, "theme.tsx"), "utf8");
    expect(theme).toContain("export function useForcedDark");
    expect(theme).toContain('removeAttribute("data-theme")');

    const callers = files.filter((f) => /useForcedDark\(\)/.test(readFileSync(f, "utf8")) && !f.endsWith("theme.tsx"));
    expect(callers.map((f) => f.slice(SRC.length)).sort()).toEqual([
      "pages/BoardControlApp.tsx",
      "pages/Kiosk.tsx",
    ]);
  });
});
