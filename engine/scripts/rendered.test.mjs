/**
 * A FILE IN A PRODUCT THAT DRAWS IS RENDERED BY SOMETHING.
 *
 * @design a product's browser half holds only files something renders; a component nothing imports is deleted, not kept.
 *
 * ⚠️ `private-ui.test.mjs` CLOSES THE DOOR AND THIS SWEEPS UP BEHIND IT. That
 * guard asks whether every screen a customer OPENS is a declaration, which is
 * the claim the whole arc rests on. It has nothing to say about a `.tsx` that
 * draws and is mounted by nothing at all: no route names it, no session map
 * holds it, no harness photographs it — so it is invisible to every check here,
 * including that one.
 *
 * ⚠️ AND AN UNMOUNTED COMPONENT IS NOT HARMLESS, WHICH IS THE WHOLE ARGUMENT.
 * It is a hand-written screen with the wiring already done, sitting inside the
 * product, one import away from being live again — and re-mounting it is a
 * one-line diff that reads as plumbing. That is precisely the shape somebody
 * reaches for when a declaration will not express what they want, which is the
 * afternoon this repository has spent a stage's worth of guards preventing.
 * Found this way: `Ladder.tsx`, two hundred and ten lines of packing ladder,
 * left behind when the surface was emptied and imported by nothing since.
 *
 * ⚠️ IT ASKS ABOUT REACHABILITY, NOT ABOUT WHAT THE FILE IS FOR. "Is this still
 * needed" is a judgement; "does any file in this repository import it" is a
 * string a script can find, and the answer is the same one a bundler gives. A
 * component kept alive only by its own test is dead too — a test is not a
 * mount, and nothing else in this directory treats it as one.
 *
 * ⚠️ THE PROVING GROUND IS OUTSIDE THIS, for the reason `private-ui` states: its
 * screens exist to exercise the components a declaration is composed out of, so
 * a corpus of hand-written files is what it IS rather than what it leaked.
 * `products()` is the walk, so the question is asked of app #3 the day it is
 * registered.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { ENGINE, products } from "./lib/trees.mjs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * WHAT A DRAWING FILE IS STILL WAITING FOR — keyed `<app>:<file>`.
 *
 * ⚠️ EMPTY, AND IT MAY ONLY SHRINK. A reason has to name what would mount the
 * file and when, because "it will be used later" is a sentence that stays true
 * for ever. An entry whose file becomes mounted fails HERE until it is deleted,
 * which is the only kind of allow-list this directory keeps.
 */
const WAITING = new Map([]);

/* ------------------------------------------------------------- the corpus --- */

const walk = (at, take = /\.(ts|tsx)$/) => {
  if (!existsSync(at)) return [];
  const out = [];
  for (const e of readdirSync(at, { withFileTypes: true })) {
    const full = join(at, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") out.push(...walk(full, take)); }
    else if (take.test(e.name)) out.push(full);
  }
  return out;
};

/*
  ⚠️ EVERY SOURCE FILE IN THE ENGINE IS A POSSIBLE IMPORTER, not only the app's
  own. A product's browser half is loaded by the space through a package export
  (`@engine/inventory/live`), and its board is mounted by a harness two
  directories away — so asking only inside the package would report both as
  orphans and the guard would be waived on its first run.
*/
const EVERYWHERE = [
  ...walk(join(ENGINE, "kernel", "src")), ...walk(join(ENGINE, "runtime", "src")),
  ...walk(join(ENGINE, "design", "src")), ...walk(join(ENGINE, "one-space", "src")),
  ...walk(join(ENGINE, "one", "src")), ...walk(join(ENGINE, "ground")),
  ...products().flatMap((name) => walk(join(ENGINE, "apps", name))),
];

/* ⚠️ THE LAST SEGMENT ONLY, WHICH IS ENOUGH AND IS WHY THIS NEEDS NO RESOLVER.
   A TypeScript import is written `./Ladder.js` for `Ladder.tsx`, `../screens/`
   for an index, or `@engine/inventory/live` for an export — three spellings of
   one file, and a real module resolver here would be a bundler nobody asked
   for. What every spelling shares is the basename, so a file is "imported" if
   any other file names it. It over-forgives (two files of one name rescue each
   other) and never over-accuses, which is the correct direction for a guard
   whose finding is "delete this". */
const named = new Map();
for (const file of EVERYWHERE) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/from\s+"([^"]+)"|import\("([^"]+)"\)/g)) {
    const path = m[1] ?? m[2] ?? "";
    const base = path.split("/").pop()?.replace(/\.(js|jsx|ts|tsx)$/, "") ?? "";
    if (!base) continue;
    (named.get(base) ?? named.set(base, new Set()).get(base)).add(file);
  }
}

/* ------------------------------------------------------------ the finding --- */

/* ⚠️ A FILE THAT DRAWS, WHICH IS NARROWER THAN A FILE THAT EXISTS. A helper, a
   type module and a fixture are not screens and are somebody else's question;
   what this is about is a component — JSX, or the design package imported. */
const draws = (src) => /<[A-Z]/.test(src) || /@engine\/design/.test(src);

let looked = 0;
let held = 0;
for (const app of products()) {
  const dir = join(ENGINE, "apps", app);
  const roots = new Set(
    Object.values(JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).exports ?? {})
      .map((one) => join(dir, String(one))));

  for (const file of walk(join(dir, "src"), /\.tsx$/)) {
    const src = readFileSync(file, "utf8");
    if (!draws(src)) continue;
    looked++;
    /* ⚠️ AN EXPORT IS A MOUNT SOMEBODY ELSE MAKES. The space imports the
       product half by package specifier and nothing in this repository names
       the file — which is the one case where "nobody imports it" is wrong. */
    if (roots.has(file)) { held++; continue; }

    const base = file.split("/").pop().replace(/\.tsx$/, "");
    const by = [...(named.get(base) ?? [])].filter((one) => one !== file);
    const key = `${app}:${relative(dir, file)}`;
    const why = WAITING.get(key);

    if (by.length) {
      if (why) {
        fail(`rendered: ${key} is imported by ${by.length} file(s) AND is excused in WAITING.\n`
          + "       Delete the entry — the list can only shrink, and one that keeps its\n"
          + "       entries after they stop being true is how an exemption becomes permanent.");
      }
      held++;
      continue;
    }
    if (why) {
      if (why.trim().length < 40) {
        fail(`rendered: ${key} is excused for "${why}", which is a label rather than a reason.\n`
          + "       Say what would mount it, and when.");
      }
      continue;
    }
    fail(`rendered: ${key} draws and no file in this repository imports it.\n`
      + "       An unmounted component is a hand-written screen with its wiring already\n"
      + "       done, one import away from being live — which is the shape somebody\n"
      + "       reaches for when a declaration will not say what they want. Delete it,\n"
      + "       or name it in WAITING with what would mount it.");
  }
}

/* ⚠️ ON `bad`, NOT BESIDE IT. A summary printed under a finding is a
   contradiction a reader resolves in favour of the green line. */
if (!bad) {
  ok(`rendered: ${looked} drawing file(s) across ${products().length} product(s), `
    + `${held} imported or exported, ${WAITING.size} named with what they wait for`);
}

console.log(bad
  ? `\nrendered: ${bad} finding(s) — a component nothing renders.`
  : "\nrendered: everything a product draws is rendered by something.");
process.exit(bad ? 1 : 0);
