/**
 * The lints' own tests.
 *
 * Two things to prove, and the second one exists because of the first.
 *
 *  1. Every rule still sees its own samples. A lint that silently stops matching
 *     passes everything, and a vacuous pass is indistinguishable from a clean
 *     codebase. This is the property that made Kova's seven hand-written lints
 *     trustworthy, and it survives the move because the samples are data.
 *
 *  2. Nothing but `conformance.ts` reaches for Node. `@types/node` had to be
 *     added to this package so that file could read the filesystem, and a design
 *     system whose browser bundle can `import { readFileSync }` is one bad
 *     autocomplete away from a runtime crash nobody sees until production. The
 *     types are here for exactly one file; this keeps them there.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { UI_RULES, ruleSelfTest, uiConformance } from "../src/conformance.js";

const SRC = new URL("../src", import.meta.url).pathname.replace(/\/$/, "");

describe("the UI lints", () => {
  it("every rule fires on its own bad samples and on none of its good ones", () => {
    const problems = ruleSelfTest();
    expect(problems, `\n${problems.join("\n")}\n`).toEqual([]);
  });

  it("covers every rule with at least one sample of each kind", () => {
    // A rule with no samples is a rule with no self-test, which is the state
    // this whole mechanism exists to prevent.
    for (const r of UI_RULES) {
      expect(r.samples.bad.length, `${r.id} has no bad sample`).toBeGreaterThan(0);
      expect(r.samples.good.length, `${r.id} has no good sample`).toBeGreaterThan(0);
    }
  });

  it("the design system obeys its own rules", () => {
    // The components are scanned by both apps anyway; asserting it here means a
    // violation introduced in `@4dl/ui` fails in `@4dl/ui` rather than surfacing
    // as a mysterious failure in whichever app happens to run its suite first.
    const v = uiConformance({
      roots: [SRC],
      repoRoot: SRC,
      // The rules already know their own definition files (`definedIn`) and
      // which of them do not apply to the system at all (`consumersOnly`), so
      // the only exemption left here is this module itself.
      exemptFiles: [
        // Carries every banned spelling as sample data, so it matches itself.
        "conformance.ts",
      ],
      waive: {
        // Chrome drawn over photographs and live camera video — see the rule.
        "design-tokens": ["media.tsx"],
      },
    });
    expect(v, `\n${v.map((x) => `  ${x.file}:${x.line} [${x.rule}] ${x.text}`).join("\n")}\n`).toEqual([]);
  });
});

describe("the browser bundle stays free of Node", () => {
  it("only conformance.ts imports node:*", () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const n of readdirSync(dir)) {
        if (n === "node_modules" || n.startsWith(".")) continue;
        const full = join(dir, n);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.tsx?$/.test(n)) out.push(full);
      }
      return out;
    };
    const offenders = walk(SRC)
      .filter((f) => relative(SRC, f) !== "conformance.ts")
      .filter((f) => /from "node:/.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f));
    expect(offenders, `\nNode import in the browser bundle: ${offenders.join(", ")}\n`).toEqual([]);
  });
});
