/**
 * THE BOUNDARY BETWEEN WHAT IS BORROWED AND WHAT IS OURS.
 *
 * ⚠️ THE FAILURE IS GRADUAL AND EVERY STEP OF IT IS REASONABLE. One component
 * spells `btn-primary` inline because it is right there; the next one needs a
 * variant the mapping does not have, so it spells that too; and six months later
 * the library's names are load-bearing in forty files and swapping it is a
 * rewrite. `packages/ui` in the legacy tree is what that looks like finished:
 * 3,275 class literals in one app, 942 of them written once.
 *
 * So the boundary is a check rather than a habit. Every borrowed name lives in
 * `borrowed.ts`; nothing else may write one.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BORROWED, OURS, SIZE, TONE, borrow } from "../src/borrowed.js";

const SRC = new URL("../src/", import.meta.url).pathname;

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.match(/\.tsx?$/) ? [join(dir, e.name)] : []);

/* Comments describe the boundary; only code may be judged for crossing it. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("only one file knows the library's names", () => {
  /*
    ⚠️ CHECKED AT THE DOOR, NOT BY SEARCHING FOR WORDS. Searching the package for
    the class names themselves was the first attempt and it is wrong twice over:
    it flags `borrow("card")`, where the string is a KEY into the map rather than
    a class, and it flags our own registry — which legitimately has components
    called `tabs`, `skeleton` and `input`, because those are the names of the
    things, and a library choosing the same words does not make them the
    library's.

    The invariant that actually matters is narrower and exact: A CLASS REACHES
    THE DOM ONLY THROUGH `borrow`. That is the one door, so it is the one place
    to stand.
  */
  it("lets a class reach the DOM only through borrow", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const src = code(readFileSync(file, "utf8"));
      for (const at of [...src.matchAll(/className\s*=\s*/g)]) {
        const expr = src.slice(at.index!, at.index! + 220);
        if (!expr.includes("borrow(")) {
          offenders.push(`${file.replace(SRC, "")}: ${expr.split("\n")[0]!.slice(0, 70)}`);
        }
      }
    }
    expect(offenders, "a class assigned without going through the one door").toEqual([]);
  });

  /*
    ⚠️ AND THE MAP IS NOT A WISHLIST. A name declared "for later" is one nobody
    has checked against a render, and it reads as coverage the package does not
    have — so the map grows with a component and never before one. Zero slack, on
    purpose: the slack is what let six speculative entries sit here claiming the
    library's tabs, dock and stat were in use when every one of them had been
    replaced by something of ours.
  */
  it("borrows nothing it does not use", () => {
    const used = files(SRC).filter((f) => !f.endsWith("borrowed.ts"))
      .map((f) => code(readFileSync(f, "utf8"))).join("");
    const unused = Object.keys(BORROWED).filter((k) => !used.includes(`borrow("${k}"`));
    expect(unused, "declared and never borrowed").toEqual([]);
  });

  /*
    ⚠️ AND WHAT IS *NOT* BORROWED SAYS WHY. "We wrote our own" is a decision that
    decays into "somebody did not know the library had one" — so every object we
    ship in place of theirs carries its reason, and the two lists cannot overlap.
  */
  it("gives every object we kept a reason, and never borrows one of them", () => {
    expect(Object.keys(OURS).length).toBeGreaterThan(0);
    for (const [name, why] of Object.entries(OURS)) {
      expect(BORROWED, `${name} is on both lists`).not.toHaveProperty(name);
      expect(why.length, `${name} has no reason`).toBeGreaterThan(20);
    }
  });

  /*
    ⚠️ AND NO COMPONENT TAKES A LOOK. A `className` or `style` prop is the escape
    hatch that turns the exhaustive tenant sweep into a sample — §0a. `Surface`
    sets `style` itself for its own tokens, which is the one permitted use and is
    why this looks for the PROP rather than the attribute.
  */
  it("accepts no className or style from a caller", () => {
    const offenders: string[] = [];
    for (const file of files(SRC)) {
      const src = code(readFileSync(file, "utf8"));
      if (/readonly\s+(className|style)\??\s*:/.test(src)) offenders.push(`${file.replace(SRC, "")}: declares one`);
      if (/\{\s*\.\.\.(props|rest)\s*\}/.test(src)) offenders.push(`${file.replace(SRC, "")}: spreads unknown props`);
    }
    expect(offenders, "a passthrough is an arbitrary look with a friendly name").toEqual([]);
  });
});

describe("our vocabulary, in their names", () => {
  /*
    ⚠️ EVERY TONE THE LANGUAGE HAS IS MAPPED. A tone we declare and never map is
    a callout that renders in the library's default — which is grey, and which
    reads as "nothing is wrong" on the one component whose job is the opposite.
  */
  it("maps all five tones", () => {
    expect(Object.keys(TONE).sort()).toEqual(["accent", "danger", "info", "success", "warning"]);
    /* `danger` is ours and `error` is theirs, and that is the whole reason the
       mapping exists rather than the words being shared. */
    expect(TONE.danger).toBe("error");
  });

  it("leaves the middle size unnamed, so the common case is the shortest to write", () => {
    expect(SIZE.md).toBe("");
    expect(SIZE.sm).toBe("-sm");
  });

  it("assembles a class rather than having one typed out", () => {
    expect(borrow("button")).toBe("btn");
    expect(borrow("button", ["-primary", SIZE.sm])).toBe("btn btn-primary btn-sm");
    /* A falsy modifier is the default, and contributes nothing. */
    expect(borrow("button", ["-primary", SIZE.md])).toBe("btn btn-primary");
  });
});
