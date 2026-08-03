/**
 * EVERY MARK ON THE GLASS GOES THROUGH `brandMark`.
 *
 * A studio's logo is usually one colour. The one it uploaded against the
 * shipped dark theme is pale, and it fades or disappears outright the moment a
 * member switches to light — or opens the studio on a phone that is already set
 * to light, which is most of them. `logoUrlLight`/`iconUrlLight` exist for that,
 * and `brandMark(branding, mode, kind)` is the one resolver that reads them.
 *
 * Reading `branding.logoUrl` directly compiles, renders, and looks perfect in
 * whichever mode the person who wrote it had open. That is the whole problem:
 * the failure is invisible to the author and permanent for half the audience.
 *
 * It has already happened once, after the light variants shipped. Five surfaces
 * were converted — boot splash, sign-in, the doors list, the studio switcher,
 * the favicon — and the two most-seen were missed: the APP BAR and the NAV
 * RAIL, i.e. every screen of the product, all day. Nothing failed; the marks
 * were simply the dark ones forever. A test is the only thing that catches a
 * bug whose symptom is "looks fine to me".
 *
 * ── The exemption ───────────────────────────────────────────────────────────
 *
 * The branding EDITOR owns the raw fields — it is the screen that uploads,
 * clears and previews each variant individually, so it must address them by
 * name. It is the only file that may.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = new URL(".", import.meta.url).pathname;

/** The editor, which legitimately reads and writes each variant by name. */
const ALLOWED = new Set(["screens/Settings.tsx"]);

/** `branding.logoUrl`, `branding?.iconUrl`, `ctx!.branding.logoUrl` — a read of
 *  the dark variant that ignores the light one. `logoUrlLight` does NOT match:
 *  the `\b` after the name is not a boundary in front of `Light`. */
const DIRECT = /branding\??\.(logoUrl|iconUrl)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("brand marks", () => {
  it("are resolved through brandMark, so the light variants are never skipped", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const rel = relative(SRC, file);
      if (ALLOWED.has(rel)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        // A comment describing the field is not a read of it.
        if (/^\s*(\*|\/\/)/.test(line)) return;
        if (DIRECT.test(line)) offenders.push(`${rel}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `Use brandMark(branding, mode, "logo" | "icon") — a direct read serves the dark mark in light mode:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  /** A rule that stopped matching would pass everything, and a vacuous pass is
   *  indistinguishable from a clean codebase. */
  it("still recognises the shape it bans", () => {
    expect(DIRECT.test('<img src={ctx!.branding.logoUrl} />')).toBe(true);
    expect(DIRECT.test("const u = tenant?.branding?.iconUrl ?? null;")).toBe(true);
    expect(DIRECT.test("brandMark(ctx.branding, mode, 'logo')")).toBe(false);
    expect(DIRECT.test("branding.logoUrlLight")).toBe(false);
  });
});
