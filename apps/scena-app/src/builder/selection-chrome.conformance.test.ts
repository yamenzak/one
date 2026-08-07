/**
 * ONE SELECTION COLOUR IN THE BUILDER, AND IT IS NOT A TOKEN.
 *
 * Two rules, and they pull in opposite directions, which is why both need a
 * test rather than a convention:
 *
 *  1. **The builder's selection chrome must NOT follow the theme.** It is drawn
 *     on top of the tenant's design — arbitrary content in arbitrary colours —
 *     so a `var(--primary)` that is a dark green in the light theme is a
 *     selection outline that vanishes the moment somebody selects a dark
 *     widget. Every editor that got this right pins a fixed high-chroma hue.
 *
 *  2. **There must be exactly ONE of it.** Before Stage 7g the transform box
 *     used a hardcoded violet at six call sites while the marquee rectangle
 *     used `border-primary bg-primary/10` — so marquee-selecting three widgets
 *     drew a green rectangle that then sprouted violet handles, and neither
 *     value had a name saying it was a decision.
 *
 * Rule 1 is why a future sweep will be tempted to "fix" this file's literal,
 * and rule 2 is what that sweep would break. So: the hue lives in exactly one
 * place, and nothing else in the builder may spell it out.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { SELECT, SELECT_WASH } from "./TransformBox.js";

const BUILDER = fileURLToPath(new URL(".", import.meta.url));
const HOME = join(BUILDER, "TransformBox.tsx");
/** The builder's page lives outside `builder/` but draws the marquee. */
const PAGE = join(BUILDER, "..", "pages", "WidgetBuilder.tsx");

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The hue, without the alpha or the wrapper — what a copy of it would contain. */
const HUE = "0.72 0.19 300";

describe("the builder's selection chrome", () => {
  it("exports one hue and one wash, and they are the same hue", () => {
    expect(SELECT).toContain(HUE);
    expect(SELECT_WASH).toContain(HUE);
    // The wash is the outline at low alpha, not a second colour.
    expect(SELECT_WASH).toMatch(/\/\s*0?\.0[0-9]/);
  });

  it("is not a token, deliberately — see the header", () => {
    expect(SELECT).not.toContain("var(--");
    expect(SELECT_WASH).not.toContain("var(--");
  });

  /*
    ⚠️ THE SAME HUE APPEARS IN `panel/` AND IT IS NOT A COPY OF THIS ONE.

    The first version of this check scanned the whole builder and failed on
    three lines in `panel/Panel.tsx` — and they were right and the check was
    wrong. Those are the DEFAULT ACCENT a metric / pulse / score widget is
    created with: they land in `style.accent` on a node, get compiled into the
    manifest, and are drawn by a TV that is not running this stylesheet. They
    happen to be the same violet because both came from Scena's old brand, and
    replacing them with `SELECT` would couple a widget's shipped appearance to
    the colour of a selection outline.

    So the scan is scoped to the builder's own CHROME, and the exemption is a
    list rather than a rule — adding a file to it is a deliberate act, in
    review, with this comment in front of you.
  */
  const CONTENT = ["panel/", "WidgetView.tsx", "templates.ts", "widget-icons.tsx"];

  it("is spelled out in TransformBox.tsx and nowhere else in the builder's CHROME", () => {
    const chrome = sources(BUILDER)
      .filter((f) => f !== HOME)
      .filter((f) => !CONTENT.some((c) => f.slice(BUILDER.length).startsWith(c) || f.endsWith(c)));
    const offenders = chrome.filter((f) => readFileSync(f, "utf8").includes(HUE));
    expect(offenders.map((f) => f.slice(BUILDER.length))).toEqual([]);
  });

  it("still scans something after the content exemptions", () => {
    // A `CONTENT` entry that grew to match everything would make the check
    // above pass by scanning nothing at all.
    const chrome = sources(BUILDER)
      .filter((f) => f !== HOME)
      .filter((f) => !CONTENT.some((c) => f.slice(BUILDER.length).startsWith(c) || f.endsWith(c)));
    expect(chrome.length).toBeGreaterThanOrEqual(4);
  });

  it("is what the marquee uses, rather than a theme token", () => {
    const page = readFileSync(PAGE, "utf8");
    /*
      ⚠️ TOLERANT OF LAYOUT, STRICT ABOUT SUBSTANCE. This was
      `/marquee && <div[\s\S]{0,400}?\/>/`, which asserted a FORMATTING choice:
      the moment the element wrapped onto its own line as `{marquee && (`, the
      regex matched nothing, `marquee` fell back to `""`, and the three checks
      below all passed vacuously against an empty string. The `not.toBe("")`
      line is what turned that into a failure instead of a silent green — keep
      it, and keep the pattern indifferent to where the newlines land.
    */
    const marquee = /marquee\s*&&\s*\(?\s*<div[\s\S]{0,400}?\/>/.exec(page)?.[0] ?? "";
    expect(marquee, "the marquee element was not found — has it been renamed?").not.toBe("");
    // The marquee imports the constant; it must not carry the hue itself, and
    // must not fall back to `border-primary` / `bg-primary/…`.
    expect(marquee).toContain("SELECT");
    expect(marquee).not.toContain(HUE);
    expect(marquee).not.toMatch(/\bborder-primary\b|\bbg-primary\//);
  });
});
