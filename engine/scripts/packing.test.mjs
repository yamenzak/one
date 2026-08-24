/**
 * A MULTIPLIER IS RESOLVED IN ONE PLACE, OR IT IS RESOLVED TWICE.
 *
 * @design a quantity is multiplied by exactly one packing factor, on the server.
 *
 * ⚠️ THIS IS THE FAULT THAT PUT NINE HUNDRED TABLETS ON A SHELF, and it is worth
 * describing precisely because neither half was wrong. `stock.arrive` multiplies
 * the quantity it is sent by the scanned code's `pack` — correct, and its own
 * comment says a caller sending the multiplied number would double it. The
 * Receive screen then opened its quantity field at the pack. Scanning a carton of
 * thirty and pressing the only button on the screen recorded 30 × 30, with the
 * number the person expected showing the whole time.
 *
 * ⚠️ SO THE RULE IS ABOUT WHERE, NOT ABOUT WHETHER. Every path that turns "how
 * many of these" into base units goes through `perOf` — via `perFor` at a
 * handler that already has the product's row, or `inBase` where it has only an
 * id. A second `input.quantity * pack` anywhere is a second answer to the same
 * question, and the two drift the first time a ladder is involved.
 *
 * ⚠️ AND A CLIENT SENDS A NAME, NEVER A NUMBER. A screen that computed the
 * factor and sent it would be deciding how much stock exists — and a phone
 * holding last week's ladder would decide differently from the record. The
 * declared input of every operation that takes a rung is therefore text.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

/* ⚠️ Comments are prose, and a guard that reads prose fires on documentation —
   every paragraph above describes the very shape being refused. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const FILES = appDirs().flatMap((d) => filesIn(d));

/*
  ⚠️ THE APPS THAT HAVE NO PACKAGING AT ALL ARE THE POINT OF DERIVING THIS. A
  guard hard-coded to OneInventory would report green over app #5 the day it
  grows a ladder — which is the shape this repository is a catalogue of. Where no
  app declares `levels`, there is nothing to check and the guard says so rather
  than passing silently.
*/
const LADDERED = FILES.filter((f) => /\blevels\s*:\s*field\.json\b/.test(strip(readFileSync(f, "utf8"))));

/* ------------------------------------------------------- one multiplication --- */

/**
 * ⚠️ A QUANTITY MULTIPLIED BY A MULTIPLIER NOTHING RESOLVED.
 *
 * ⚠️ AND IT IS THE BINDING THAT IS CHECKED, NOT THE MULTIPLICATION. Applying an
 * already-resolved factor is the correct final step and appears in every handler
 * that takes a quantity — refusing it outright would be a guard people route
 * around. What the original bug looked like was
 * `const pack = Math.max(1, known?.pack ?? 1)` followed by `quantity * pack`: a
 * multiplier assembled at the call site, with a SECOND one waiting on the screen.
 *
 * ⚠️ SO A NAME MAY BE MULTIPLIED BY ONLY IF `perOf`/`perFor` PRODUCED IT. That
 * is the whole rule, it is mechanical, and it is exactly the edit that caused the
 * fault.
 */
const RAW = /\b(?:input\.)?quantity\b[^;\n]{0,40}?\*\s*(?:Math\.\w+\([^)]*\)|\b(\w+)\b)/g;
/** ⚠️ The other way round — the multiplier first. */
const RAW_BACK = /\b(\w+)\s*\*\s*(?:Math\.abs\()?\s*(?:input\.)?quantity\b/g;

/** ⚠️ Where the arithmetic itself lives, and may be written out freely. */
const RESOLVERS = new Set([
  "apps/inventory/src/packing.ts",
]);

/** ⚠️ Names this file binds from the resolver — those are resolved factors. */
const resolvedIn = (src) => {
  const out = new Set();
  for (const hit of src.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:perOf|perFor|inBase)\s*\(/g)) {
    out.add(hit[1]);
  }
  return out;
};

{
  let loose = 0;
  let applied = 0;
  for (const file of FILES) {
    const where = rel(file);
    if (RESOLVERS.has(where)) continue;
    const src = strip(readFileSync(file, "utf8"));
    const resolved = resolvedIn(src);
    for (const re of [RAW, RAW_BACK]) {
      for (const hit of src.matchAll(re)) {
        const name = hit[1];
        /* ⚠️ A literal or an inline `Math.…` is not a packing factor at all. */
        if (!name || /^\d/.test(name)) continue;
        applied++;
        if (resolved.has(name)) continue;
        loose++;
        const at = src.slice(0, hit.index ?? 0).split("\n").length;
        fail(`${where}:${at}: \`quantity\` multiplied by \`${name}\`, which nothing resolved.\n`
          + `       A packing factor comes from \`perOf\`/\`perFor\` and nowhere else — a\n`
          + `       multiplier assembled at the call site is a second answer to how many\n`
          + `       base units this is, and the two drift the first time a ladder exists.`);
      }
    }
  }
  if (!loose) {
    ok(`one-multiplier: ${applied} application(s), every factor from \`perOf\``);
  }
}

/* ------------------------------------------------------- a name, not a number --- */

/**
 * ⚠️ A RUNG ARRIVES AS TEXT, AND THE DECLARATION IS WHERE THAT IS TRUE OR NOT.
 * `rung: field.number(...)` would let a client name its own multiplier — and
 * every request would look exactly like a good one.
 */
{
  let wrong = 0;
  let rungs = 0;
  for (const file of FILES) {
    const src = strip(readFileSync(file, "utf8"));
    for (const hit of src.matchAll(/\brung\s*:\s*field\.(\w+)\(/g)) {
      rungs++;
      if (hit[1] === "text") continue;
      wrong++;
      const at = src.slice(0, hit.index ?? 0).split("\n").length;
      fail(`${rel(file)}:${at}: \`rung\` is declared as \`field.${hit[1]}\`, not text.\n`
        + `       A client sends a NAME the server resolves against the ladder the\n`
        + `       product declares now; a number would let the caller decide how much\n`
        + `       stock moves, and a stale screen would decide differently.`);
    }
  }
  if (!wrong) ok(`named: ${rungs} rung field(s), every one a name rather than a multiplier`);
}

/* ------------------------------------------------- the refusal is not a fallback --- */

/**
 * ⚠️ AN UNKNOWN RUNG IS REFUSED, AND `?? 1` IS HOW THAT STOPS BEING TRUE. The
 * whole reason `factorOf` answers `null` is that a rung the product does not
 * declare must not receive a carton as one tablet — a wrong number nothing
 * downstream can detect, because one is what a real entry produces.
 */
{
  let soft = 0;
  for (const file of FILES) {
    const src = strip(readFileSync(file, "utf8"));
    for (const hit of src.matchAll(/\b(?:factorOf|perOf)\([^)]*\)\s*\?\?\s*1\b/g)) {
      soft++;
      const at = src.slice(0, hit.index ?? 0).split("\n").length;
      fail(`${rel(file)}:${at}: an unresolved rung falling back to 1.\n`
        + `       \`null\` is the refusal — receiving a carton as a single tablet is a\n`
        + `       wrong number nothing downstream can detect. Fail, do not default.`);
    }
  }
  if (!soft) ok("refused: no unresolved rung is read as a single");
}

/* ⚠️ AND THE DERIVATION IS REPORTED, because a guard that stops matching reads
   as green over a codebase it is no longer looking at. */
if (!LADDERED.length) {
  ok("packing: no app declares a packaging ladder — nothing to check yet");
} else {
  ok(`packing: ${LADDERED.length} app file(s) declare a ladder`);
}

console.log("\npacking: a quantity is multiplied by exactly one factor, on the server.");
process.exit(bad ? 1 : 0);
