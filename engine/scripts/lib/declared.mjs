/**
 * WHICH SCREENS ARE DECLARED RATHER THAN WRITTEN — read ONCE, for every guard
 * that has to ask its question of both populations.
 *
 * ⚠️ A SCREEN THAT MOVES FROM A FILE TO A DECLARATION DOES NOT FAIL ANYTHING —
 * it stops being asked. That is the whole reason this module exists. Forty-five
 * guards sweep product source today; every one of them answers a question about
 * a `.tsx` that a `body:` in a manifest simply does not contain, so the port
 * that makes the product better is also the port that empties the net. Nothing
 * turns red. The counts just get smaller, one screen at a time, and a guard
 * reporting `ok` over forty files instead of sixty looks exactly like a guard
 * reporting `ok`.
 *
 * ⚠️ SO WHAT IS COUNTED HERE IS THE MIGRATION ITSELF, and `census.test.mjs` is
 * what reads it: every guard that sweeps a product says, in the registry, what
 * happens to its question when the screen is a declaration. There are five
 * answers and only one of them is "nothing" — see there.
 *
 * ⚠️ AND IT IS A TEXT READ, NOT AN IMPORT. A manifest is TypeScript that pulls
 * in half a package to evaluate; every other guard in this directory reads
 * source as text for the same reason, and a reader that needs a build step is a
 * reader that stops running when the build breaks — which is precisely when a
 * guard is worth most.
 */

import { readFileSync } from "node:fs";
import { appManifests } from "./trees.mjs";

/**
 * ⚠️ THE LITERAL STARTING AT `from`, BRACKETS BALANCED, STRINGS AND COMMENTS
 * SKIPPED. A lazy `\{[^}]*\}` stops at the first brace inside a nested object,
 * and every screen worth reading has one — so the cheap version reports a
 * shorter list than the truth, which is the failure this whole module is about.
 */
const balanced = (src, from, open = "{", shut = "}") => {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < src.length && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      continue;
    }
    if (c === open) depth++;
    else if (c === shut) { depth--; if (!depth) return src.slice(from, i + 1); }
  }
  return "";
};

/** ⚠️ The top-level `{…}` members of an array literal, in order. */
const membersOf = (array) => {
  const out = [];
  let depth = 0;
  for (let i = 0; i < array.length; i++) {
    const c = array[i];
    if (c === "/" && array[i + 1] === "*") { i = array.indexOf("*/", i) + 1; continue; }
    if (c === "/" && array[i + 1] === "/") { i = array.indexOf("\n", i); continue; }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      while (i < array.length && array[i] !== quote) i += array[i] === "\\" ? 2 : 1;
      continue;
    }
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === "{" && depth === 1) {
      const member = balanced(array, i);
      out.push(member);
      i += member.length - 1;
    }
  }
  return out;
};

/**
 * EVERY SCREEN EVERY APP DECLARES, split by how it is expressed.
 *
 * ⚠️ `kind` IS THE ONE FIELD THAT MATTERS: `body` is drawn from a declaration,
 * `story` asks questions and keeps its controls in the app (which is why it is
 * counted separately rather than lumped in as declared), and `written` is a
 * screen that still names a component. The third is the population that shrinks.
 */
export const declaredScreens = () => {
  const out = [];
  for (const [app, path] of appManifests()) {
    const src = readFileSync(path, "utf8");
    const at = src.search(/\bscreens:\s*\[/);
    if (at < 0) continue;
    const array = balanced(src, src.indexOf("[", at), "[", "]");
    if (!array) throw new Error(`${path}: \`screens:\` opens and never closes`);
    for (const member of membersOf(array)) {
      const id = member.match(/\bid:\s*"([^"]+)"/);
      if (!id) continue;
      const kind = /\bbody:\s*\{/.test(member) ? "body"
        : /\bstory:\s*\{/.test(member) ? "story"
        : "written";
      /* ⚠️ THE ROUTE COMES OUT OF THE SAME MEMBER AS THE KIND, because a reader
         that took one from here and the other from a second pass over the block
         would be two readings of one declaration — and they disagree the first
         time a member is written in an order nothing anticipated. The screen
         index is keyed by route and this file is keyed by id; they meet here. */
      const route = member.match(/\broute:\s*"([^"]+)"/);
      out.push({ app, id: id[1], kind, ...(route ? { route: route[1] } : {}) });
    }
  }
  return out;
};

/** How many screens are drawn from a declaration rather than from a component. */
export const declaredCount = () => declaredScreens().filter((s) => s.kind === "body").length;
