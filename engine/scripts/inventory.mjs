/**
 * WHAT EXISTS, DERIVED.
 *
 * ⚠️ EVERY NUMBER IN THE DOCUMENTS COMES FROM HERE, because a count typed by
 * hand is a count that is wrong within a week — and a document wrong in a
 * checkable way stops being read for the parts that are right.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const guards = JSON.parse(readFileSync(join(ENGINE, "docs/guards.json"), "utf8")).guards;
const what = process.argv[2];

if (what === "guards") {
  const live = guards.filter((g) => g.status === "live");
  const owed = guards.filter((g) => g.status === "owed");
  console.log("| Guard | Protects | What breaks without it |");
  console.log("|---|---|---|");
  for (const g of [...live, ...owed]) {
    const mark = g.status === "live" ? "" : " *(owed)*";
    console.log(`| \`${g.id}\`${mark} | ${g.protects} | ${g.fails} |`);
  }
} else if (what === "decisions") {
  const src = readFileSync(join(ENGINE, "docs/DECISIONS.md"), "utf8");
  const rows = [...src.matchAll(/^## (D\d+) — (.+)$/gm)];
  const counts = {};
  for (const g of guards) counts[g.protects] = (counts[g.protects] ?? 0) + 1;
  console.log("| # | Decision | Guarded by |");
  console.log("|---|---|---|");
  for (const [, id, title] of rows) console.log(`| ${id} | ${title} | ${counts[id] ?? 0} |`);
} else if (what === "vocabulary") {
  /**
   * ⚠️ WHAT THE PACKAGE SHIPS, DERIVED FROM WHAT IT EXPORTS. A person about to
   * build a screen needs one question answered before anything else — does this
   * already exist — and the answer was "read six directories". A hand-typed list
   * would answer it wrongly within a week, which is worse, because a list that
   * is mostly right is one somebody trusts about the part that is not.
   *
   * ⚠️ THE FILE IS THE POINT, NOT A DESCRIPTION. Every component here carries
   * its reasoning in a header comment; a one-line gloss regenerated beside it
   * would be a second, worse copy of that. This says what exists and where to
   * read it, and the file says why.
   */
  const HOMES = [
    ["tokens", "colour, type, spacing, motion, the chrome and hem rules"],
    ["scene", "the ambience engine — families, marks, the world behind a screen"],
    ["frame", "page, shape, crown, nav, dock, overlays — what wraps a screen"],
    ["parts", "rows, cards, lists, controls, the four outcomes"],
    ["rendered", "whole surfaces drawn from a kernel declaration"],
    ["chart", "the data vocabulary — a number as a shape"],
  ];
  const DECL = /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const at = join(dir, e.name);
      if (e.isDirectory()) walk(at, out);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(at);
    }
    return out;
  };
  console.log("| Home | What it is for | Ships |");
  console.log("|---|---|---|");
  let all = 0;
  const detail = [];
  for (const [home, what_] of HOMES) {
    const found = [];
    for (const file of walk(join(ENGINE, "design/src", home))) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(DECL)) found.push([m[1], file]);
    }
    found.sort((a, b) => a[0].localeCompare(b[0]));
    all += found.length;
    console.log(`| \`${home}/\` | ${what_} | ${found.length} |`);
    detail.push([home, found]);
  }
  console.log("");
  console.log(`**${all} exports.** Every one is reachable as \`import { … } from "@engine/design"\`;`);
  console.log("there is no deep import, and a guard says so.");
  for (const [home, found] of detail) {
    console.log("");
    console.log(`### \`${home}/\``);
    console.log("");
    const byFile = {};
    for (const [name, file] of found) {
      const rel = file.slice(join(ENGINE, "design/src").length + 1);
      (byFile[rel] ??= []).push(name);
    }
    for (const rel of Object.keys(byFile).sort()) {
      console.log(`- \`${rel}\` — ${byFile[rel].map((n) => `\`${n}\``).join(", ")}`);
    }
  }
} else {
  console.error("usage: inventory.mjs guards|decisions|vocabulary");
  process.exit(2);
}
