/**
 * THE SCREEN INDEX IS TRUE, AND IT IS COMPLETE.
 *
 * ⚠️ A MAP THAT HAS ROTTED IS WORSE THAN NO MAP. "Looking for the file that
 * draws a screen? Part III" is an instruction, and the moment one line of it is
 * stale it sends somebody to the wrong file with confidence — which costs more
 * than grepping would have. Every other product document in this repository asks
 * to be updated in the same commit and relies on somebody remembering.
 *
 * ⚠️ SO IT IS CHECKED RATHER THAN REQUESTED. Every route the manifest declares
 * appears in the index; every route the index names is declared; and every
 * `file:line` in it points at the line where that component is actually
 * declared. A screen added without its row is a failure, and so is a screen
 * whose component moved by three lines.
 *
 * ⚠️ AND IT IS THE MANIFEST THAT IS ASKED, not a list here. A guard with its own
 * list of screens is a third place the answer lives.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * ⚠️ `--write` REWRITES THE LINE NUMBERS, AND NOTHING ELSE. A guard that only
 * refuses makes the index a thing somebody hand-counts after every edit, which
 * is the same instruction that let every other product document rot — so the
 * repair is one command, exactly as the generated documents are. What it does
 * NOT touch is which screens are listed or what they are called: a row is a
 * decision, and a script inventing one would be the map writing itself.
 */
const WRITING = process.argv.includes("--write");

/**
 * ⚠️ ONE ENTRY PER PRODUCT, AND A NEW APP MEANS A NEW ENTRY. Deriving the
 * document's name from the app's id would be cleverer and wrong: a product's
 * document is a thing somebody chose to write, and one that does not exist
 * should say so here rather than be silently skipped.
 */
const INDEXED = [
  {
    app: "inventory",
    manifest: "apps/inventory/src/index.ts",
    /* ⚠️ BESIDE THE CODE IT DESCRIBES, and rooted in `engine/` like the manifest
       above it. This was `INVENTORY.md` at the repository root, resolved against
       a different base from the field next to it — the asymmetry existed only
       because the document was outside the engine, and it moved in. */
    doc: "apps/inventory/INVENTORY.md",
    /* Where a `screens/Thing.tsx:123` reference is rooted. */
    under: "apps/inventory/src",
  },
];

/** What a screen or a container declaration looks like at the start of a line. */
const declares = (line) =>
  /^export (function|const) [A-Z]/.test(line) || /^const [A-Z_]+ = \(api: /.test(line);

/**
 * ⚠️ THE NEAREST DECLARATION TO WHERE THE INDEX POINTED, which is what "it
 * moved" means: an edit above a component shifts it by a few lines, and the one
 * it shifted to is the closest one either side. Guessing the FIRST declaration
 * in the file instead would silently repoint every stale row at the same
 * function.
 */
const nearest = (lines, at) => {
  const from = Number(at) - 1;
  for (let step = 0; step < lines.length; step++) {
    for (const i of [from - step, from + step]) {
      if (i >= 0 && i < lines.length && declares(lines[i])) return i;
    }
  }
  return -1;
};

/* ⚠️ Comments quote routes, so they are blanked before anything is matched. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

for (const one of INDEXED) {
  const manifest = join(ENGINE, one.manifest);
  const doc = join(ENGINE, one.doc);
  if (!existsSync(manifest) || !existsSync(doc)) {
    fail(`screen-index: ${one.app} — ${existsSync(manifest) ? one.doc : one.manifest} is missing.`);
    continue;
  }

  const src = strip(readFileSync(manifest, "utf8"));
  const block = /\n  screens: \[([\s\S]*?)\n  \],/.exec(src);
  if (!block) {
    fail(`screen-index: ${one.app} declares no screens block — this guard names it.`);
    continue;
  }
  const declared = [...block[1].matchAll(/route: "([^"]+)"/g)].map((m) => m[1]);
  if (!declared.length) {
    fail(`screen-index: ${one.app} declares no screens at all.`);
    continue;
  }

  let text = readFileSync(doc, "utf8");
  /** Every `file:line` this pass wants moved, applied together at the end. */
  const moved = [];
  /* ⚠️ THE TABLE ROWS ONLY. Prose elsewhere in the document naturally mentions
     `/labels` and `/import`; a match on the whole file would pass a document
     whose table had been deleted. */
  const rows = [...text.matchAll(
    /^\|\s*`(\/[^`]*)`\s*\|[^|]*\|[^|]*\|[^|]*\|\s*`([^`:]+):(\d+)`\s*\|\s*`([^`:]+):(\d+)`\s*\|/gm,
  )];
  const listed = rows.map((r) => r[1]);

  for (const route of declared) {
    if (!listed.includes(route)) {
      fail(`screen-index: ${one.doc} has no row for \`${route}\`.\n`
        + `       The index is what this repository tells people to read instead of\n`
        + `       grepping — a screen missing from it is a screen nobody can find.`);
    }
  }
  for (const route of listed) {
    if (!declared.includes(route)) {
      fail(`screen-index: ${one.doc} lists \`${route}\`, which the manifest does not declare.\n`
        + `       A row for a screen that no longer exists sends somebody to a file that\n`
        + `       draws nothing.`);
    }
  }

  /* ⚠️ AND EVERY LINE IS A DECLARATION. A component that moved by three lines is
     a reference that still resolves and points at the middle of something else,
     which is the failure a checker exists for and a reader cannot see. */
  let checked = 0;
  for (const row of rows) {
    for (const [ref, at] of [[row[2], row[3]], [row[4], row[5]]]) {
      const path = join(ENGINE, one.under, ref);
      if (!existsSync(path)) {
        fail(`screen-index: ${one.doc} names ${ref}, which does not exist.`);
        continue;
      }
      const lines = readFileSync(path, "utf8").split("\n");
      const line = lines[Number(at) - 1] ?? "";
      /* Either an exported screen, or one of the containers that mount them. */
      if (!declares(line)) {
        /*
          ⚠️ MOVED IS REPAIRED; GONE IS REFUSED. A declaration that shifted by
          three lines is arithmetic and `--write` does it. One that no longer
          exists under any name is a screen somebody deleted, and inventing a
          line for it would be the index agreeing with itself about a file that
          draws nothing.
        */
        const found = lines.findIndex(declares) >= 0
          ? nearest(lines, at)
          : -1;
        if (WRITING && found >= 0) {
          moved.push([`${ref}:${at}`, `${ref}:${found + 1}`]);
        } else {
          fail(`screen-index: ${one.doc} points at ${ref}:${at}, which is not a declaration.\n`
            + `       Found: ${line.trim().slice(0, 60) || "(blank)"}\n`
            + `       The component moved and the index did not.`
            + `${found >= 0 ? " Run with --write." : ""}`);
        }
      }
      checked++;
    }
  }

  if (moved.length) {
    for (const [was, now] of moved) text = text.split(`\`${was}\``).join(`\`${now}\``);
    writeFileSync(doc, text);
    ok(`screen-index: ${one.doc} — moved ${moved.length} reference(s)`);
  }
  if (!bad) {
    ok(`screen-index: ${one.doc} — ${declared.length} screen(s), `
      + `${checked} file:line reference(s), every one of them true`);
  }
}

console.log(bad
  ? `\nscreen-index: ${bad} finding(s) — a map that has rotted.`
  : "\nscreen-index: the index names every screen, and every line it gives is real.");
process.exit(bad ? 1 : 0);
