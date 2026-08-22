/**
 * THE GROUND IS A FIXTURE, AND THE DEPLOYMENT NEVER SERVES IT.
 *
 * @design the test ground is never mounted, never sold and never loaded by a browser.
 *
 * ⚠️ IT WAS ALL THREE, AND NOBODY DECIDED IT. `engine/ground` is the smallest
 * complete app — a notebook with sample content, declaring every cross-cutting
 * concern so the framework's claims are asserted against something real. It sat
 * in the deployment's `APPS`, in its `SELLS`, and in the browser's product
 * loader, so a person who came for one product founded a workspace holding a
 * demo they never asked for, with somebody else's notes in it, and only an
 * operator could take it away.
 *
 * ⚠️ THE STRUCTURAL RULE IS THE DIRECTORY, WHICH IS WHY THIS CAN BE CHECKED AT
 * ALL. `engine/apps/*` is the product catalogue; `engine/ground` is not among
 * them. So the question is not "is this one app special" — which is an excuse
 * list — but "does anything the deployment serves come from outside the
 * catalogue", which is a fact about a path.
 *
 * ⚠️ AND THE DEV GROUND PAGE IS NOT AN EXCEPTION TO IT. `one-space` may import
 * the ground, because `Ground.tsx` is behind `import.meta.env.DEV` and is folded
 * away in production — `bundle.test.mjs` is what holds that. What it may not do
 * is name the ground in the product loader, which is what makes a product
 * reachable by a customer.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* ------------------------------------------------------- where it lives --- */

const CATALOGUE = existsSync(join(ENGINE, "apps"))
  ? readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name)
  : [];

if (!existsSync(join(ENGINE, "ground/src/index.ts"))) {
  fail("engine/ground is not there — the proving ground every framework claim is\n"
    + "       asserted against. If it moved, this guard is pointing at nothing and\n"
    + "       reports green over a tree it no longer reads.");
} else if (CATALOGUE.includes("ground")) {
  fail("engine/apps/ground exists — the catalogue is what the deployment serves, so a\n"
    + "       fixture inside it is a product by position whatever the comments say.");
} else {
  ok(`ground: outside the catalogue, beside ${CATALOGUE.length} product(s)`);
}

/* --------------------------------------------------- what is served, sold --- */

const worker = read("one/src/index.ts");

/**
 * ⚠️ THE LITERALS ARE READ, NOT THE MODULE. Importing the worker would need a
 * Cloudflare runtime; the two lists are declarations in one file and the whole
 * question is which ids they name.
 */
const block = (name) => {
  const at = worker.indexOf(name);
  if (at < 0) return null;
  const open = worker.indexOf("{", at) < 0 ? -1 : worker.indexOf("{", at);
  const bracket = worker.indexOf("[", at);
  const from = open >= 0 && (bracket < 0 || open < bracket) ? open : bracket;
  if (from < 0) return null;
  const close = worker.indexOf(from === open ? "};" : "];", from);
  return close < 0 ? null : worker.slice(from, close);
};

/* ⚠️ THE LABELS ARE LITERALS, because `guards.test.mjs` looks for the `proves`
   string in this file — a template built from a loop variable is a check the
   registry cannot find, and it reports the guard as gone. */
for (const [what, name] of [["serves:", "const APPS"], ["sells:", "const SELLS"]]) {
  const text = block(name);
  if (text === null) {
    fail(`one/src/index.ts: \`${name}\` is not there — the list this guard reads to\n`
      + `       decide what the deployment does. Renamed, it checks nothing.`);
    continue;
  }
  if (/\bground\b/.test(text)) {
    fail(`one/src/index.ts: \`${name}\` names the ground.\n`
      + `       It is a fixture with sample content and a demo notebook. Mounted, an\n`
      + `       operator can put it in somebody's workspace; sold, anybody can.`);
  } else {
    ok(`${what} the ground is absent from ${name.replace("const ", "")}`);
  }
}

/* ⚠️ AND NOTHING IMPORTS IT INTO THE WORKER, which is the other half — a list
   that does not name it is not a deployment that cannot reach it. */
if (/from "@engine\/ground/.test(worker)) {
  fail("one/src/index.ts imports @engine/ground — the deployment composes no fixture.");
} else {
  ok("worker: does not import the ground at all");
}

/* --------------------------------------------------------- the browser --- */

const registry = read("one-space/src/apps.ts");
if (/["']?ground["']?\s*:\s*\(\)\s*=>\s*import\(/.test(registry)) {
  fail("one-space/src/apps.ts: the product loader names the ground.\n"
    + "       That entry is what draws a product's own screens over a workspace's own\n"
    + "       records — a fixture with a live browser half is a product nobody sold.");
} else {
  ok("browser: the product loader does not name the ground");
}

/**
 * ⚠️ AND IT HAS NO `live` ENTRY POINT TO LOAD, which is what makes the line
 * above hard to undo by accident. A `./live` export is the half that turns
 * sample screens into a product's real ones.
 */
const manifest = JSON.parse(read("ground/package.json"));
if (manifest.exports?.["./live"]) {
  fail("ground/package.json exports `./live` — the entry a product's browser half is\n"
    + "       loaded through. The ground has screens over a SAMPLE world on purpose.");
} else {
  ok("ground: no live entry point for a workspace to load");
}

console.log(bad
  ? `\nground: ${bad} finding(s) — a fixture the deployment serves is a product nobody decided to sell.`
  : `\nground: the proving ground is a fixture, and no door reaches it.`);
process.exit(bad ? 1 : 0);
