/**
 * A FIELD SET ONCE IS REFUSED BY THE WRITE, NOT MERELY LEFT OFF A FORM.
 *
 * @design a settled field cannot be changed by the generated update.
 *
 * ⚠️ THE HOLE THIS CLOSES WAS A GENERATED VERB NOBODY HAD TRIED. `product.update`
 * is not called by any screen in this repository — and it answers on the API, to
 * an agent through MCP, and to a queued write replaying after a day offline. It
 * would change a product's UNIT, which is the thing every other number is counted
 * in: twenty boxes on a shelf become twenty sheets, every balance and every
 * report reinterpreted, with no write anywhere near a quantity.
 *
 * ⚠️ AND THE ENFORCEMENT IS IN `patch`, WHICH IS NOT THE OBVIOUS PLACE. The
 * door's own input check skips generated operations by design (`input-checked`),
 * so dropping the field from the generated update's declared input hides it
 * without refusing it. `records.ts` is the chokepoint every generated write goes
 * through, and it is the only place the rule can actually hold.
 *
 * ⚠️ SO THREE THINGS ARE CHECKED, AND THE FIRST IS THE ONE THAT MATTERS: that
 * `patch` still reads the flag; that the generated update still stops
 * ADVERTISING it, because an agent offered a key that is always refused will keep
 * sending it; and that the refusal is its own kind rather than folded into
 * "invalid", so the sentence can name the field.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (where) => {
  const at = join(ENGINE, where);
  if (!existsSync(at)) {
    fail(`settled: ${where} does not exist — this guard names it.`);
    return "";
  }
  return readFileSync(at, "utf8");
};

/* ⚠️ Comments are prose, and every paragraph above describes what is refused. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/* ------------------------------------------------------------- the contract --- */

{
  const kernel = strip(read("kernel/src/field.ts"));
  if (/readonly settled\?: boolean;/.test(kernel)) {
    ok("declared: `FieldSpec.settled` is part of the field contract");
  } else {
    fail("settled: `kernel/src/field.ts` no longer declares `settled`.\n"
      + "       Every app marking a field set-once points at this; without it the\n"
      + "       declarations still typecheck as extra properties and enforce nothing.");
  }
}

/* -------------------------------------------------------------- the refusal --- */

{
  const records = strip(read("runtime/src/records.ts"));
  /* ⚠️ IN `patch` AND NOT IN `create` — a settled field is set exactly once, and
     that once is the create. */
  if (/\.settled\b/.test(records) && /why: "settled"/.test(records)) {
    ok("refused: `patch` reads the flag and refuses in its own words");
  } else {
    fail("settled: `runtime/src/records.ts` no longer refuses a settled field.\n"
      + "       This is the ONLY place the rule holds — the door's input check skips\n"
      + "       generated operations, so a declaration alone enforces nothing and a\n"
      + "       unit is editable through `<collection>.update` again.");
  }

  /* ⚠️ REFUSED RATHER THAN DROPPED. Ignoring the key answers 200 over a change
     that did not happen, which is the swallow this repository is a catalogue of —
     and it would pass a check that only looked for the flag being read. */
  if (/why: "settled"[\s\S]{0,400}?names:/.test(records)) {
    ok("named: the refusal carries the fields, so the sentence lands under one");
  } else {
    fail("settled: the refusal no longer carries the field names.\n"
      + "       A refusal that cannot say WHICH field is a form somebody re-reads\n"
      + "       looking for a mistake that is not on it.");
  }
}

/* ------------------------------------------------------- and not advertised --- */

{
  const compose = strip(read("runtime/src/compose.ts"));
  if (/verb === "update"[\s\S]{0,300}?!one\.settled/.test(compose)) {
    ok("quiet: the generated update does not offer a field it will refuse");
  } else {
    fail("settled: `runtime/src/compose.ts` advertises settled fields on update.\n"
      + "       The tool catalogue, the OpenAPI and the MCP surface are built from\n"
      + "       that input — an agent offered a key that is always refused will keep\n"
      + "       sending it, and the refusal reads as a broken tool rather than a rule.");
  }

  /* ⚠️ AND THE CREATE STILL TAKES IT, which is the half a guard reading only the
     word `settled` would let somebody remove. A field nothing can ever set is not
     set-once, it is absent. */
  if (/verb === "create"\s*\n?\s*\?\s*spec\.fields/.test(compose)) {
    ok("once: the create still takes every field, settled ones included");
  } else {
    fail("settled: the generated create no longer takes the whole field set.\n"
      + "       A settled field is set exactly ONCE and the create is that once —\n"
      + "       filtered there too, it could never be given a value at all.");
  }
}

console.log("\nsettled: a field set once is refused by the write, not hidden by a form.");
process.exit(bad ? 1 : 0);
