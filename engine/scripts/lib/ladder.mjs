/**
 * WHAT SIZE A ROLE IS, READ OUT OF `type.ts` AND RESOLVED THROUGH ITS OWN LADDER.
 *
 * ⚠️ THREE GUARDS ASK THIS QUESTION AND ALL THREE USED TO ANSWER IT THEMSELVES.
 * `metrics.test.mjs` kept a five-entry map of Tailwind's named sizes,
 * `motion.test.mjs` kept a nine-entry one, and both parsed `text-[Nrem]` by hand
 * — so the day the roles stopped holding literals and started asking for a rank,
 * two guards went blind at once and said so in three different sentences. A
 * question asked in three places is answered differently in three places.
 *
 * ⚠️ AND IT RESOLVES RATHER THAN RECOGNISES. `BASE` and `RATIO` are read from
 * the file, not restated here, so a guard cannot pass a `type.ts` that changed
 * the ratio out from under it — which is the failure a hardcoded table has by
 * construction.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TYPE_FILE = join(HERE, "..", "..", "design/src/tokens/type.ts");

const src = readFileSync(TYPE_FILE, "utf8");

const number = (name) => {
  const m = src.match(new RegExp(`const ${name} = ([\\d.]+);`));
  if (!m) throw new Error(`design/src/tokens/type.ts no longer declares \`${name}\``);
  return Number(m[1]);
};

export const BASE = number("BASE");
export const RATIO = number("RATIO");
export const ROOT = number("ROOT");

/** ⚠️ The rank names and their indices, as the file declares them. */
export const RANKS = (() => {
  const from = src.indexOf("export const RANK = {");
  const to = src.indexOf("\n} as const;", from);
  const out = new Map();
  for (const [, name, n] of src.slice(from, to).matchAll(/^ {2}(\w+): (-?\d+),$/gm)) {
    out.set(name, Number(n));
  }
  if (!out.size) throw new Error("design/src/tokens/type.ts declares no ranks");
  return out;
})();

/** ⚠️ A rank in pixels at the default root, which is how a guard compares two. */
export const pixelsAt = (rank) => {
  const n = RANKS.get(rank);
  return n === undefined ? null : ROOT * RATIO ** n;
};

/**
 * WHAT A ROLE RESOLVES TO, IN PIXELS — `null` where it names no size at all.
 *
 * ⚠️ THE PHONE'S, NOT THE BREAKPOINT'S. Two roles grow on a desk (`atWide`), and
 * every question a guard asks about the ladder — does it descend, are two ranks
 * distinct — is a question about the size somebody on a phone is served.
 */
export const sizeOf = (role) => {
  const decl = new RegExp(`^ {2}${role}: ([\`"][^\\n]*[\`"]),$`, "m").exec(src);
  if (!decl) return undefined;
  const asked = /\bat\("(\w+)"\)/.exec(decl[1]);
  return asked ? pixelsAt(asked[1]) : null;
};
