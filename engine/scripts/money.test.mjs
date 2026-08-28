/**
 * A NUMBER IS SAID IN THE SCALE IT IS HELD IN, AND AT THE VOLUME ITS PLACE
 * DESERVES.
 *
 * @design a value is drawn at the volume its place deserves, and a sub-unit scale converts only where it is declared.
 *
 * ⚠️ BOTH FAULTS ARE A FIGURE THAT IS RIGHT TO THE DIGIT AND WRONG ANYWAY, which
 * is the one class of defect a valuation cannot survive: nobody re-derives a
 * money figure, so being believed on sight is the whole of its behaviour.
 *
 * ⚠️ THE FIRST WAS FOUND BY A PHOTOGRAPH. `Money` defaults to the HERO size —
 * correctly, for the call sites written by hand, and the type token's own note
 * says that size is "the one thing a screen exists to show, never twice on a
 * screen". The declared renderer became a call site that draws in a table cell
 * and in a folded row, passed no size, and an order's two line totals came out
 * at forty pixels each: twice the size of the screen's own hero, twice over, and
 * the first thing the eye landed on. The compiler was happy (the prop is
 * optional), every test passed, and the only way to see it was to look.
 *
 * ⚠️ SO THE CHECK IS THAT THE DECISION IS MADE, NOT THAT IT IS MADE ONE WAY. A
 * fifth call site added tomorrow is where this recurs, and its author has no
 * reason to know a default is waiting — being forced to pass a scale is what
 * makes them ask which one.
 *
 * ⚠️ THE SECOND IS THE SCALE ITSELF. OneInventory holds a stock rate in MILLI
 * because a whole minor unit cannot carry £0.023 and a thousand screws would
 * value 13% low. A scale converts in one place or it converts several ways —
 * rounding before the divide instead of after, dividing by what somebody typed
 * instead of by what the packing ladder resolved — and every one of those is a
 * rate that is plausible and wrong and throws nothing. Running this guard the
 * first time found exactly one: the chokepoint's own call site doing the
 * conversion inline, which is now `rateOf`.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ Comments are prose, and every paragraph here names the shape being
   refused — including the `DRAWN[` and the `* MILLI` this guard searches for. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/** ⚠️ Every source file under a tree, so an app added tomorrow is walked. */
const walk = (at) => {
  if (!existsSync(at)) return [];
  const out = [];
  for (const e of readdirSync(at, { withFileTypes: true })) {
    const full = join(at, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

const rel = (f) => f.slice(ENGINE.length + 1);
const lineAt = (src, index) => src.slice(0, index).split("\n").length;

/* ------------------------------------------- a value is told how loud to be --- */

/**
 * ⚠️ THE RENDERER'S FORMAT TABLE, FOUND BY ITS OWN NAME. `DRAWN` is where a
 * declared `Format` becomes a component, and every call of it draws a value
 * somewhere with a size. A call that passes only the value and the workspace's
 * facts has taken whatever default the component carries — which is the bug.
 */
const BODY = "design/src/rendered/body.tsx";

{
  const at = join(ENGINE, BODY);
  if (!existsSync(at)) {
    fail(`${BODY}: not here — this guard is reading a renderer that has moved.`);
  } else {
    const src = strip(readFileSync(at, "utf8"));

    /* ⚠️ THE TABLE ITSELF HAS TO TAKE A SCALE, or there is no decision to make
       and every call below is passing an argument nothing reads. */
    const table = src.match(/const DRAWN:[^=]*=/);
    if (!table || !/\bat\?:\s*Scale\b/.test(table[0])) {
      fail(`${BODY}: \`DRAWN\` does not take a scale.\n`
        + `       Without it every format draws at whatever size its component defaults\n`
        + `       to — and \`Money\` defaults to the hero size, which is documented as the\n`
        + `       one thing a screen exists to show and never twice on a screen.`);
    }

    /* ⚠️ A CALL, WHICH IS `DRAWN[...](...)` AND ONLY THAT. The lookup and the
       call are one expression, so the arguments are readable without a parser:
       what is counted is the commas at depth zero inside the call. */
    const calls = [...src.matchAll(/DRAWN\[[^\]]*\]\(/g)];
    if (!calls.length) {
      fail(`${BODY}: nothing calls \`DRAWN\`. Either the renderer draws its values some`
        + ` other way now — point this guard there — or the table is dead.`);
    }
    for (const hit of calls) {
      let depth = 1;
      let commas = 0;
      let i = (hit.index ?? 0) + hit[0].length;
      for (; i < src.length && depth > 0; i++) {
        const c = src[i];
        if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") depth--;
        else if (c === "," && depth === 1) commas++;
      }
      if (commas >= 2) continue;
      fail(`${BODY}:${lineAt(src, hit.index ?? 0)}: \`DRAWN\` called without a scale.\n`
        + `       A column is a row and a binding is a figure, and the call site is the\n`
        + `       only thing that knows which. Left out, the value takes its component's\n`
        + `       own default — a money amount in a table cell drawn at the size the\n`
        + `       screen's hero is drawn at, which no test and no type can see.`);
    }
    if (!bad) {
      ok(`said: ${calls.length} value(s) drawn, every one told how loudly to say it`);
    }
  }
}

/* ------------------------------------------------ a scale has one door --- */

/**
 * ⚠️ THE MODULE THAT DECLARES THE CONSTANT OWNS THE ARITHMETIC. Elsewhere the
 * name may be passed, compared or re-exported; multiplying or dividing by it is
 * doing the conversion a second time, in a file whose header does not say which
 * way the rounding goes.
 *
 * ⚠️ FOUND BY WHERE IT IS DECLARED RATHER THAN BY A PATH, so moving the module
 * moves the exemption with it, and a second scale added tomorrow is asked the
 * same question with no edit here.
 */
{
  const files = [...walk(join(ENGINE, "apps")), ...walk(join(ENGINE, "ground/src"))];
  if (!files.length) {
    fail("no app source found — this guard is reading a tree that has moved.");
  }

  const scales = new Map();
  for (const file of files) {
    for (const hit of strip(readFileSync(file, "utf8"))
      .matchAll(/export const (MILLI|MINOR|CENTI)\s*=/g)) {
      scales.set(hit[1], file);
    }
  }
  if (!scales.size) {
    fail("no scale constant declared anywhere. Either no product holds a value in a"
      + " sub-unit — in which case delete this check deliberately — or the constant"
      + " was renamed and this stopped looking at anything.");
  }

  for (const [name, home] of scales) {
    const doing = new RegExp(`[*/]\\s*${name}\\b|\\b${name}\\s*[*/]`);
    for (const file of files) {
      if (file === home) continue;
      const src = strip(readFileSync(file, "utf8"));
      const found = src.search(doing);
      if (found < 0) continue;
      fail(`${rel(file)}:${lineAt(src, found)}: arithmetic on \`${name}\`,`
        + ` which \`${rel(home)}\` owns.\n`
        + `       A scale converts in one place or it converts several ways — rounding\n`
        + `       before the divide instead of after, dividing by what somebody typed\n`
        + `       instead of by what the ladder resolved. Each is a rate that is plausible\n`
        + `       and wrong, and none of them throws. Call the conversion the owning\n`
        + `       module exports.`);
    }
  }
  if (!bad) {
    ok(`scale: ${scales.size} sub-unit constant(s), converted only where declared`);
  }
}

console.log("\nmoney: a number is said in the scale it is held in, and at the volume its place deserves.");
process.exit(bad ? 1 : 0);
