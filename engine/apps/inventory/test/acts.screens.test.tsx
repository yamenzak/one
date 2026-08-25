/**
 * EVERY PRIMARY ACTION NAMES WHAT IT CALLS.
 *
 * ⚠️ THE ONE THING A SCREEN IS FOR IS ALSO THE WORST CONTROL TO OFFER AND
 * REFUSE. A primary drawn, pressed and answered 402 puts the refusal in a toast
 * over whatever the person just filled in — so `Screen` asks the gate before it
 * draws (`useGate`), and it can only do that for an act that says which
 * operation it calls.
 *
 * ⚠️ A MISSING `op` IS SILENT, WHICH IS WHY IT IS CHECKED. The screen renders,
 * the button works on every tier that happens to be allowed, and the one tier
 * that is not gets the old behaviour with nothing anywhere saying so. That is
 * the shape this repository is a catalogue of: a mechanism that exists,
 * reached by all but one of its call sites.
 *
 * ⚠️ AND THE NAME HAS TO BE REAL. A typo is the same silence one step further
 * on: `useGate` finds nothing, reads it as allowed, and the control is drawn
 * exactly as it was before the field was added.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { operationsFor } from "@engine/kernel";
import { inventory } from "../src/index.js";

/** ⚠️ Built once here — the manifest is a thunk so that a cold isolate is not. */
const INVENTORY = inventory();

const HERE = dirname(fileURLToPath(import.meta.url));
const SCREENS = join(HERE, "..", "src", "screens");

/** Every operation this product answers on, declared and generated alike. */
const REAL = new Set<string>([
  ...INVENTORY.operations.map((o) => o.id),
  ...INVENTORY.collections.flatMap(operationsFor),
]);

/**
 * ⚠️ BRACE-BALANCED RATHER THAN LINE-MATCHED. A `does=` is often a conditional
 * across six lines with two object literals in it, and a regex that stopped at
 * the first `}` would check the first branch and quietly skip the second — which
 * is the branch a screen reaches only in the state that matters.
 */
const actsIn = (source: string): readonly string[] => {
  const out: string[] = [];
  for (let at = source.indexOf("does={"); at >= 0; at = source.indexOf("does={", at + 1)) {
    let depth = 0;
    let end = at + "does=".length;
    for (; end < source.length; end++) {
      if (source[end] === "{") depth++;
      else if (source[end] === "}") { depth--; if (!depth) break; }
    }
    out.push(source.slice(at, end + 1));
  }
  return out;
};

/** One object literal inside a `does=`, which is one act. */
const literals = (act: string): readonly string[] =>
  act.split(/\{\s*(?=op:|label:|icon:)/).filter((part) => /(^|\s)label:/.test(part));

const FILES = readdirSync(SCREENS)
  .filter((f) => f.endsWith(".tsx") && f !== "index.tsx" && f !== "live.tsx");

describe("what a primary action calls", () => {
  for (const file of FILES) {
    const source = readFileSync(join(SCREENS, file), "utf8");
    const acts = actsIn(source);
    if (!acts.length) continue;

    it(`is named on every act: ${file}`, () => {
      for (const act of acts) {
        for (const one of literals(act)) {
          expect(one, `${file}: an act with no \`op\` — ${one.slice(0, 60)}`)
            .toMatch(/(^|\s)op:\s*"/);
        }
      }
    });

    it(`is an operation this product has: ${file}`, () => {
      for (const found of source.matchAll(/\bop:\s*"([^"]+)"/g)) {
        const id = found[1] ?? "";
        expect(REAL.has(id), `${file}: \`${id}\` is not an operation this app answers on`)
          .toBe(true);
      }
    });
  }

  /* ⚠️ AND THE SWEEP FOUND SOMETHING TO SWEEP. A file list that silently came
     back empty would make every assertion above vacuous. */
  it("looked at the screens", () => {
    expect(FILES.length).toBeGreaterThan(10);
    expect(FILES.flatMap((f) => actsIn(readFileSync(join(SCREENS, f), "utf8"))).length)
      .toBeGreaterThan(10);
  });
});
