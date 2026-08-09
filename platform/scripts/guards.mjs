#!/usr/bin/env node
/**
 * THE GUARD REGISTRY — reader and table emitter.
 *
 * `docs/guards.json` is the data; `guards.test.mjs` is what makes it true. This
 * file is the thing both of them, and the generated blocks in PLAN.md and UI.md,
 * read through.
 *
 * ⚠️ THE TABLES IN THE DOCUMENTS ARE GENERATED FROM HERE, and that is the whole
 * mechanism. A document cannot promise enforcement that has no registry entry,
 * because the document does not write its own table. Prose claiming a guard
 * nobody built is worse than no prose: it is authoritative-sounding, and it is
 * expensive to disprove.
 *
 * Dependency-free Node, like every guard in `pnpm gate` — they run before
 * `pnpm install` in CI.
 *
 *   node platform/scripts/guards.mjs table <group>   markdown, for a generated block
 *   node platform/scripts/guards.mjs list            every guard, one per line
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export const readGuards = () => JSON.parse(readFileSync(join(ROOT, "docs/guards.json"), "utf8")).guards ?? [];
export const readStages = () => JSON.parse(readFileSync(join(ROOT, "docs/stages.json"), "utf8")).stages ?? [];

/**
 * ⚠️ `live` is not a claim about quality, it is a claim about EXISTENCE — the
 * check runs today. `owed` names the stage that will build it. Rendering the
 * difference is the point of the table: a reader must be able to tell what is
 * enforced now from what is intended, and prose that blurs the two is how a
 * platform comes to believe it is safer than it is.
 */
export function table(...groups) {
  const rows = readGuards().filter((g) => groups.includes(g.group));
  if (!rows.length) throw new Error(`no guards in group(s) "${groups.join(", ")}"`);
  const live = rows.filter((g) => g.status === "live");
  const owed = rows.filter((g) => g.status !== "live");
  const order = [...live, ...owed];
  return [
    "| guard | fails on | |",
    "|---|---|---|",
    ...order.map((g) => `| \`${g.id}\` | ${g.fails} | ${g.status === "live" ? "**live**" : `stage ${g.stage}`} |`),
  ].join("\n");
}

if (process.argv[2] === "table") console.log(table(...process.argv.slice(3)));
else if (process.argv[2] === "list") {
  for (const g of readGuards()) console.log(`${g.status === "live" ? "live" : `s${g.stage} `}  ${g.group.padEnd(9)} ${g.id}`);
}
