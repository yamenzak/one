/**
 * WHAT EXISTS, DERIVED.
 *
 * ⚠️ EVERY NUMBER IN THE DOCUMENTS COMES FROM HERE, because a count typed by
 * hand is a count that is wrong within a week — and a document wrong in a
 * checkable way stops being read for the parts that are right.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const QUAD = join(dirname(fileURLToPath(import.meta.url)), "..");
const guards = JSON.parse(readFileSync(join(QUAD, "docs/guards.json"), "utf8")).guards;
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
  const src = readFileSync(join(QUAD, "docs/DECISIONS.md"), "utf8");
  const rows = [...src.matchAll(/^## (D\d+) — (.+)$/gm)];
  const counts = {};
  for (const g of guards) counts[g.protects] = (counts[g.protects] ?? 0) + 1;
  console.log("| # | Decision | Guarded by |");
  console.log("|---|---|---|");
  for (const [, id, title] of rows) console.log(`| ${id} | ${title} | ${counts[id] ?? 0} |`);
} else {
  console.error("usage: inventory.mjs guards|decisions");
  process.exit(2);
}
