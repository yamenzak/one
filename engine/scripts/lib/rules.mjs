/**
 * WHICH KERNEL RULES ARE IN FORCE, AND THROUGH WHAT — resolved ONCE.
 *
 * ⚠️ THIS EXISTS BECAUSE THE GUARD AND THE INVENTORY DISAGREED. `rules.test.mjs`
 * reported every rule in force while `inventory.mjs enforcement` printed four
 * with no lane at all, because each had walked the tree its own way and one of
 * them followed a rule's kernel-side caller while the other did not. A guard and
 * the document describing it giving different answers is the failure the guard
 * itself refuses, one level up — so the walk is here, and both read it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const files = (dir, match = /\.(ts|tsx)$/) => {
  const out = [];
  const walk = (at) => {
    let entries;
    try { entries = readdirSync(join(ENGINE, at), { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const p = `${at}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (match.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
};

export const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/**
 * ⚠️ COMMENTS, IMPORTS AND THE DECLARATION ITSELF ARE NOT USES — and all three
 * are exactly what a rule nobody calls still has. The comment case is the one
 * that bites: a file that argues for a rule at length is the file most likely to
 * have stopped calling it, and two mutations that deleted the only caller went
 * undetected until this stripped comments.
 */
export const uses = (src, name) => {
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(new RegExp(`^export (?:function|const) ${name}\\b.*$`, "gm"), "")
    .replace(/^import[\s\S]*?from ".*?";$/gm, "");
  return new RegExp(`\\b${name}\\b`).test(stripped);
};

/**
 * ⚠️ FOUR LANES, AND A TEST IS NOT ONE OF THEM. A test proves a rule is correct;
 * it does not put it in force. Every lane below is something a request passes
 * through, or a check the build runs.
 */
export const lanes = () => ({
  composition: ["kernel/src/manifest.ts"],
  runtime: files("runtime/src"),
  surface: [...files("design/src"), ...files("one-hub/src"), ...files("one/src")],
  app: files("apps/hello/src"),
  guard: files("scripts", /\.test\.mjs$/),
});

/**
 * ⚠️ `refuse` FOLLOWED BY A CAPITAL. `refusedOn` reads a refusal's field map and
 * is not a rule; matching the prefix alone put it in the inventory as one.
 */
const DECLARES = /^export (?:function|const) (refuse[A-Z]\w*)/gm;

/** Every rule the kernel states, with the lane that runs it (or `null`). */
export function resolveRules() {
  const LANES = lanes();
  const bodies = new Map();
  for (const lane of Object.values(LANES)) for (const f of lane) bodies.set(f, read(f));

  const rules = [];
  for (const f of files("kernel/src")) {
    for (const m of read(f).matchAll(DECLARES)) rules.push({ name: m[1], file: f });
  }

  const found = new Map();
  let moved = true;
  while (moved) {
    moved = false;
    for (const rule of rules) {
      if (found.has(rule.name)) continue;
      const lane = Object.keys(LANES)
        .find((l) => LANES[l].some((f) => uses(bodies.get(f) ?? "", rule.name)));
      if (lane) { found.set(rule.name, lane); moved = true; continue; }
      /* ⚠️ A kernel sibling counts only if the sibling itself runs — otherwise a
         chain of rules ending nowhere passes, which is the same failure with an
         extra step in it. */
      const caller = rules.find((other) =>
        other.name !== rule.name && found.has(other.name)
        && uses(read(other.file), rule.name));
      if (caller) { found.set(rule.name, found.get(caller.name)); moved = true; }
    }
  }

  return rules.map((rule) => {
    const src = read(rule.file);
    const at = Math.max(
      src.indexOf(`export function ${rule.name}`),
      src.indexOf(`export const ${rule.name}`),
    );
    const defer = src.slice(Math.max(0, at - 900), at).match(/DEFER\(engine-(\d+)\)/);
    return {
      ...rule,
      where: rule.file.replace("kernel/src/", "").replace(".ts", ""),
      lane: found.get(rule.name) ?? null,
      deferredTo: defer ? defer[1] : null,
    };
  });
}
