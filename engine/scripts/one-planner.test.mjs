/**
 * THE PREVIEW AND THE COMMIT ARE THE SAME FUNCTION.
 *
 * ⚠️ TWO IMPLEMENTATIONS OF "WHAT WILL HAPPEN" IS HOW A SCREEN COMES TO PROMISE
 * WHAT A DOOR REFUSES. A bulk operation that shows somebody "412 new, 3 updated,
 * 1 refused" and then performs a second, separately-written walk of the same
 * input is a product where those two numbers agree until the day they do not —
 * and the day they do not, nothing throws. The catalogue is simply wrong, and
 * the only witness is a screenshot nobody took.
 *
 * ⚠️ IT IS STRUCTURAL RATHER THAN BEHAVIOURAL, DELIBERATELY. Unit tests on the
 * two halves separately pass a mutation that restores the original defect —
 * which is what the defect WAS. What makes it impossible is that the preview
 * operation and the write operation call ONE named planner and neither one
 * reaches past it to the parts.
 *
 * ⚠️ AND THE PARTS ARE NAMED HERE, so a handler that re-derives the plan out of
 * `readSheet` + `columnsFor` + `planIn` is a failure even when the answer would
 * have been identical. Identical today is the whole shape of this bug.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ Comments quote the calls they are about — this file's own header names all
   four — so they are blanked before anything is matched. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ ONE ENTRY PER PAIR, AND ADDING A BULK OPERATION MEANS ADDING ONE. The pair
 * is what is checked; a second product's import, a bulk edit, a batch move all
 * have exactly this shape and none of them is covered by naming files.
 */
const PAIRS = [
  {
    app: "inventory",
    file: "src/index.ts",
    planner: "planImport",
    /* The pieces the planner is made of. A handler naming one has re-derived. */
    parts: ["readSheet", "columnsFor", "planIn"],
    /* ⚠️ The two operation ids, matched by their `id:` line rather than by the
       constant's name — a rename of the constant must not silence this. */
    reads: "product.preview",
    writes: "product.import",
  },
];

/*
  ⚠️ AN OPERATION'S BODY IS FOUND BY ITS `id:` AND CUT AT THE NEXT ONE. A
  brace-matching parse would be more precise and is not worth it: what this needs
  to know is which calls appear between one operation's id and the next, and an
  operation that declared its id last would be a shape nothing in this repo has.
*/
const bodyOf = (code, id) => {
  const at = code.indexOf(`id: "${id}"`);
  if (at === -1) return null;
  const next = code.slice(at + 1).search(/\n\s*id: "/);
  return next === -1 ? code.slice(at) : code.slice(at, at + 1 + next);
};

for (const pair of PAIRS) {
  const path = join(ENGINE, "apps", pair.app, pair.file);
  if (!existsSync(path)) {
    fail(`one-planner: ${pair.app}/${pair.file} does not exist.\n`
      + `       The pair is declared in this guard, so a moved file is a check that\n`
      + `       silently stopped asking.`);
    continue;
  }
  const code = strip(readFileSync(path, "utf8"));

  /* ⚠️ THE PLANNER ITSELF EXISTS AND IS DECLARED ONCE. Two declarations is the
     defect wearing the right name. */
  const declared = [...code.matchAll(
    new RegExp(`(async\\s+)?function\\s+${pair.planner}\\b|const\\s+${pair.planner}\\s*=`, "g"),
  )];
  if (declared.length !== 1) {
    fail(`one-planner: ${pair.app} declares \`${pair.planner}\` ${declared.length} times.\n`
      + `       One planner, or the preview and the commit are two answers to what an\n`
      + `       import would do.`);
    continue;
  }

  for (const [role, id] of [["preview", pair.reads], ["commit", pair.writes]]) {
    const body = bodyOf(code, id);
    if (!body) {
      fail(`one-planner: ${pair.app} has no operation \`${id}\`.\n`
        + `       This guard names the pair; a renamed operation is a check about\n`
        + `       nothing.`);
      continue;
    }
    if (!body.includes(`${pair.planner}(`)) {
      fail(`one-planner: \`${id}\` (the ${role}) does not call \`${pair.planner}\`.\n`
        + `       The preview and the commit have to be the same function. Two walks of\n`
        + `       one spreadsheet agree until the day they do not, and on that day\n`
        + `       nothing throws — the screen says "412 new" and the catalogue is\n`
        + `       something else.`);
    }
    for (const part of pair.parts) {
      if (new RegExp(`\\b${part}\\s*\\(`).test(body)) {
        fail(`one-planner: \`${id}\` (the ${role}) calls \`${part}\` itself.\n`
          + `       That is the plan re-derived out of its parts, which is the same defect\n`
          + `       with the planner still in the file. Everything goes through\n`
          + `       \`${pair.planner}\`.`);
      }
    }
  }
}

/*
  ⚠️ A FLOOR, BECAUSE A GUARD OVER AN EMPTY LIST PRINTS A GREEN LINE. "Every
  bulk pair shares its planner" and "there are no bulk pairs" are the same
  sentence without a number.
*/
const apps = appTrees().map(([id]) => id);

if (!PAIRS.length) {
  fail("one-planner: no preview/commit pair is declared at all.");
} else if (!bad) {
  ok(`one-planner: ${PAIRS.length} preview/commit pair(s) across ${apps.length} app(s), `
    + "each on one planner");
}

console.log(bad
  ? `\none-planner: ${bad} finding(s) — a preview that is not the commit.`
  : "\none-planner: what the screen promises is the function the button runs.");
process.exit(bad ? 1 : 0);
