/**
 * THE CAPABILITY INVENTORY, READ.
 *
 * ⚠️ THE INVENTORY IS THE ACCEPTANCE CONTRACT, so it is a registry rather than
 * prose — the same argument as `guards.json`. A list of capabilities in a
 * document is a list somebody has to remember to update; a registry with a
 * status per entry is one a script can ask "what is left" and "what was dropped,
 * and why".
 *
 * The generated table in KOVA-INVENTORY.md comes from here, so the document
 * cannot disagree with the registry it describes.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PERSONAS = ["everyone", "owner", "trainer", "assistant", "client", "operator"];
export const STATUSES = ["old", "built", "dropped"];

export const load = (root) => JSON.parse(readFileSync(join(root, "docs/kova-capabilities.json"), "utf8")).capabilities;

/** The generated table: one row per capability, grouped by area. */
export function table(caps) {
  const lines = ["| | capability | persona | outcome |", "|---|---|---|---|"];
  const mark = { old: " ", built: "x", dropped: "–" };
  let area = null;
  for (const c of [...caps].sort((a, b) => (a.area === b.area ? a.id.localeCompare(b.id) : a.area.localeCompare(b.area)))) {
    if (c.area !== area) {
      area = c.area;
      lines.push(`| | **${area}** | | |`);
    }
    lines.push(`| \`[${mark[c.status] ?? "?"}]\` | \`${c.id}\` | ${c.persona} | ${c.outcome}${c.why ? ` — **dropped:** ${c.why}` : ""} |`);
  }
  return lines.join("\n");
}

export const counts = (caps) => {
  const by = {};
  for (const c of caps) by[c.status] = (by[c.status] ?? 0) + 1;
  return by;
};

if (process.argv[2] === "table") process.stdout.write(`${table(load(join(import.meta.dirname, "..")))}\n`);
