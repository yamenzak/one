/**
 * NOBODY INVENTS A DURATION.
 *
 * ⚠️ THIS GUARD EXISTS BECAUSE THE CONVERSION WAS DONE BY HAND ONCE. Before the
 * motion module there were eight ad-hoc `cubic-bezier`s and eight ad-hoc
 * millisecond values scattered across one screen's stylesheet — every one of them
 * written by somebody reaching for a number that felt right at that moment, and
 * every one of them slightly different from the others. That is what an interface
 * moving at eleven speeds is: not a decision anybody made, just the absence of
 * one.
 *
 * ⚠️ IT CHECKS THE THING THAT ROTS, WHICH IS THE NEXT RULE SOMEBODY ADDS. The
 * eight got fixed; nothing stopped the ninth. A vocabulary that is not enforced is
 * a suggestion, and a suggestion loses to whoever is in a hurry — including,
 * especially, whoever wrote the vocabulary.
 *
 * ⚠️ AND IT CHECKS ONLY WHAT WENT WRONG. Colours were tokenised from the first
 * line and have never drifted, so there is no colour rule here. A guard with no
 * defect behind it is a guess about what will go wrong, and the last attempt at
 * this had ninety of those.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { MOTION_CSS } from "../src/motion.css.js";

/** Every stylesheet in the platform except the one that declares the timing. */
const sheets = readdirSync("src", { recursive: true, encoding: "utf8" })
  .filter((f) => f.endsWith(".css.ts") && !f.endsWith("motion.css.ts"))
  .map((f) => [f, readFileSync(`src/${f}`, "utf8").replace(/\/\*[\s\S]*?\*\//g, "")] as const);

describe("the motion vocabulary is the only source of timing", () => {
  it("has sheets to check", () => {
    expect(sheets.length).toBeGreaterThan(2);
  });

  /*
    ⚠️ A CURVE IS A DECISION ABOUT HOW THE WHOLE PRODUCT FEELS. Four exist, named
    for what they are for. A fifth written inline is a fifth nobody chose, in a
    place nobody will look for it.
  */
  it("declares no curve outside the motion module", () => {
    for (const [file, css] of sheets) {
      expect(css, `${file} names a curve of its own — use --enter, --exit, --move or --spring`)
        .not.toMatch(/cubic-bezier\(|\blinear\(/);
    }
  });

  /*
    ⚠️ AND NO INTERFACE DURATION EITHER. `animation` and `transition` are where
    they hide: both take a bare time, so `320ms` is valid CSS in exactly the place
    a token belongs.

    ⚠️ THE LINE IS DRAWN AT TWO SECONDS, and it is a real distinction rather than
    a convenience. Under a second, something is RESPONDING — to a press, a save, a
    screen arriving — and how fast it responds is a decision about the whole
    product, so it comes from the shared set. Measured in tens of seconds, nothing
    is responding to anybody: a sky drifting over fifty-four seconds and a face
    breathing over nine are weather, and their rate IS the effect. Forcing those
    onto a scale built for a press would make both of them wrong.
  */
  const AMBIENT_MS = 2000;
  const msOf = (t: string) => (t.endsWith("ms") ? Number(t.slice(0, -2)) : Number(t.slice(0, -1)) * 1000);

  it("declares no interface duration outside the motion module", () => {
    for (const [file, css] of sheets) {
      for (const [decl] of css.matchAll(/\b(?:animation|transition)(?:-duration|-delay)?\s*:[^;]+;/g)) {
        for (const [time] of decl.matchAll(/\b\d+(?:\.\d+)?m?s\b/g)) {
          expect(msOf(time), `${file} names ${time} of its own — use --quick, --swift, --settle, --arrive or --step`)
            .toBeGreaterThanOrEqual(AMBIENT_MS);
        }
      }
    }
  });

  /*
    ⚠️ AND THE MOTION MODULE IS NOT HELD TO IT, WHICH WAS A DELETED CHECK RATHER
    THAN AN OVERSIGHT. Policing the module against its own rule read as pleasingly
    symmetric and needed two exemptions within a minute of being written — zero,
    which is the absence of a duration rather than one, and the 1ms floor the
    reduced-motion block uses so that code waiting for an animation to END still
    gets told. A guard that needs an exemption list before its first green run is
    a guard with no defect behind it. The module is 200 lines whose entire subject
    is timing; every other file in the platform is covered above.
  */

  /*
    ⚠️ AND NO ANIMATION FILLS `both`. A fill of `both` keeps the animation's final
    values applied FOREVER, and those silently beat the element's own
    declarations — which is invisible until something else needs to compute one of
    those properties. It cost a whole collapsing header: the scroll-driven opacity
    and scale were pinned at whatever a finished entrance had left behind, and
    nothing anywhere failed.

    ⚠️ `backwards` IS WHAT EVERY ENTRANCE HERE ACTUALLY WANTS. Their `to` is
    implicit — the element's own styles — so holding the from-state before the
    animation and then getting out of the way is identical to watch and leaves the
    element's future to the element.
  */
  it("lets no animation fill both", () => {
    for (const [file, css] of [["motion.css.ts", MOTION_CSS] as const, ...sheets]) {
      for (const [decl] of css.matchAll(/\banimation(?:-fill-mode)?\s*:[^;]+;/g)) {
        expect(decl, `${file} fills both — use backwards, and see this test for why`)
          .not.toMatch(/\bboth\b/);
      }
    }
  });

  /*
    ⚠️ EVERY DURATION THE VOCABULARY DECLARES IS USED. One that nothing names is
    a value somebody reserved for a case that never came — and the next person
    reads five as evidence that five are needed.
  */
  it("uses every duration it declares", () => {
    const all = [MOTION_CSS, ...sheets.map(([, css]) => css)].join("\n");
    for (const name of ["--quick", "--swift", "--settle", "--arrive", "--step"]) {
      expect(all.split(`var(${name}`).length - 1, `${name} is declared and never used`).toBeGreaterThan(0);
    }
  });
});
