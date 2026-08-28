/**
 * AN APP MAY READ A BORROWED RECORD'S NAME, AND A HANDWRITTEN STATEMENT IS WHERE
 * THAT PROMISE GOES UNGUARDED.
 *
 * ⚠️ THE KERNEL ENFORCES IT FOR A DECLARED PATH AND CANNOT ENFORCE IT HERE
 * (D122). `reachFor` refuses `supplier.taxId` at composition — but a `SELECT *
 * FROM party` inside a handler never goes near the kernel, never appears in a
 * manifest, and would put another product's tax numbers, payment terms and
 * contact rows in this one's memory with nothing anywhere saying a word. Every
 * other rule in this round is about DECLARATIONS; this is the one place the
 * boundary is a string somebody typed.
 *
 * ⚠️ SO THE CHECK IS ONE STATEMENT, NOT A PARSED SELECT LIST. Reading the
 * columns out of arbitrary SQL is a parser, and a parser is a thing that quietly
 * fails to understand an alias — `SELECT p.taxId FROM party p` is two characters
 * away from the shape a naive matcher waves through. Instead every borrowed
 * table may be named EXACTLY ONCE in an app's source, in EXACTLY the canonical
 * form, and everything else in the app reads that one answer. The rule is then
 * about a shape rather than about intent, and it cannot be talked past.
 *
 * ⚠️ AND IT IS THE MIRROR OF `storage-chokepoint.test.mjs`, one boundary over.
 * That one refuses a bare `MEDIA.put` outside the module that keeps the ledger,
 * for the same reason: an object written behind the ledger is invisible to the
 * quota and to erasure for ever, and nothing else would notice.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { appTrees } from "./lib/trees.mjs";

const HERE = join(import.meta.dirname, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ COMMENTS OUT FIRST, KEEPING THE LINE COUNT. This file's own prose names
   `SELECT * FROM party` as the thing it refuses, and an app's headers explain
   the seam at length — a guard that read its own warning as a violation would
   be unfixable except by not writing the warning down. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const filesIn = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return filesIn(path);
  return path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
});

/**
 * ⚠️ WHAT AN APP BORROWS, READ OFF THE DECLARATION RATHER THAN A LIST HERE. A
 * second copy of "which collections are borrowed" is a list that goes stale the
 * day an app borrows its second one — silently, because a shorter list reports
 * fewer violations and a guard reporting nothing looks exactly like a guard
 * passing.
 */
const borrowsIn = (source) => {
  const said = /\bborrows:\s*\[([^\]]*)\]/.exec(strip(source));
  if (!said) return [];
  return [...said[1].matchAll(/["']([a-z][a-z0-9-]*)["']/g)].map((m) => m[1]);
};

/**
 * ⚠️ THE ONE STATEMENT AN APP MAY WRITE AGAINST A TABLE IT BORROWS. Two columns,
 * scoped by the workspace it is already in — the same statement `joinRows` builds
 * for a declared path, so both halves of the seam read the same shape.
 */
const canonical = (table) =>
  `SELECT id, name FROM ${table} WHERE tenant_id = ?`;

/* ⚠️ A MENTION IN SQL, WHICH IS NARROWER THAN A MENTION. `party` is also a
   collection id, a field name, a route and a word in a sentence; what this is
   about is a table in a statement, which is `FROM`, `JOIN`, `INTO` or `UPDATE`. */
const SQL = (table) =>
  new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE)\\s+\`?${table}\`?\\b`, "gi");

let asked = 0;
let mentions = 0;

for (const [id, dir] of appTrees()) {
  const root = join(HERE, dir);
  const files = filesIn(root);
  const manifest = files.find((path) => path.endsWith("index.ts"));
  if (!manifest) continue;

  const borrows = borrowsIn(readFileSync(manifest, "utf8"));
  if (!borrows.length) continue;
  asked++;

  for (const table of borrows) {
    const found = [];
    for (const file of files) {
      const source = strip(readFileSync(file, "utf8"));
      for (const hit of source.matchAll(SQL(table))) {
        found.push({ file: file.slice(HERE.length + 1), at: hit.index, source });
      }
    }
    mentions += found.length;

    if (!found.length) {
      fail(`borrowed: ${id} borrows "${table}" and no statement reads it — every `
        + `picker and label pointing at it draws an identifier, and nothing else `
        + `would say so`);
      continue;
    }
    if (found.length > 1) {
      fail(`borrowed: ${id} names "${table}" in ${found.length} statements — a `
        + `borrowed record gives its name and nothing else (D122), and one place `
        + `to read it is what makes that checkable. Read the one that exists.\n`
        + found.map((one) => `       ${one.file}`).join("\n"));
      continue;
    }

    /* ⚠️ AND THE ONE STATEMENT IS THE CANONICAL ONE, CHARACTER FOR CHARACTER.
       Anything else — a `*`, an alias, a third column, a missing scope clause —
       is the shape this file exists to refuse, and a check on the count alone
       would pass every one of them. */
    const one = found[0];
    const want = canonical(table);
    const near = one.source.slice(Math.max(0, one.at - 200), one.at + 200)
      .replace(/\s+/g, " ");
    if (!near.includes(want)) {
      fail(`borrowed: ${id}'s one statement against "${table}" is not the one it `
        + `may write.\n       want: ${want}\n       ${one.file}`);
      continue;
    }
    /* ⚠️ THE FILE COUNT IS ON THE `ok` LINE ON PURPOSE — see `gate.mjs`'s corpus
       check. A guard that walks a tree and reports no number is one that cannot
       be told apart from a guard whose walk found nothing, which is the exact
       failure `apps.test.mjs`'s `reach` sat in for its whole life. */
    ok(`borrowed: ${id} reads "${table}" once across ${files.length} source file(s), `
      + "by name, scoped to the workspace");
  }
}

if (!asked) {
  fail("borrowed: no app declares `borrows`, so this guard asked nothing — which "
    + "prints identically to a guard that passed. Either the seam is gone or this "
    + "stopped finding it.");
}

if (bad) {
  console.error(`\nborrowed: ${bad} problem(s).`);
  process.exit(1);
}
console.log(`\nborrowed: ${mentions} statement(s) against a table another product owns, `
  + `each the one shape a borrower may write.`);
