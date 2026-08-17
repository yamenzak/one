/**
 * A RUNTIME CAPABILITY THAT NOTHING MOUNTS.
 *
 * ⚠️ THIS IS `rules` ONE LAYER DOWN, AND IT IS THE MORE EXPENSIVE HALF. A kernel
 * rule nobody calls refuses nothing. A runtime capability nobody mounts is a
 * table created on every deploy, a store with tests over it, a document
 * describing the feature — and no address anybody could reach it at. Every
 * signal a reader has says it is there.
 *
 * ⚠️ AND IT IS NOT A HYPOTHETICAL. The whole vault — `keep`, `look`, `shred`,
 * consent, grants and the record of who looked — had `VAULT_SCHEMA` in the
 * deployment's shard modules and no route at all. `generate` is the one call
 * that reaches a provider, so nothing metered ever ran. `fileNote` is the write
 * that puts a notification in somebody's inbox; the inbox could be read, marked
 * seen and configured, and nothing ever filed one.
 *
 * ⚠️ THE EVIDENCE IS AN IMPORT, NEVER A MENTION. Half the runtime's verbs are
 * ordinary English — `keep`, `look`, `grant`, `credit`, `forget` — and a
 * name-anywhere search finds them in the SPA's own prose and reports the vault
 * as mounted from eleven screens that have never heard of it. An import list is
 * exact, and it is also the actual wiring.
 *
 * ⚠️ THE ONLY EXCUSE IS A `DEFER(engine-N)` MARKER, which is the same mechanism
 * `docs.test.mjs` already enumerates — so an unmounted capability is in the
 * deferral list, its stage cannot be marked shipped over it, and the excuse is
 * findable rather than remembered. A list inside this file would be a waiver.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ENGINE = join(dirname(fileURLToPath(import.meta.url)), "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const files = (dir, match = /\.(ts|tsx)$/) => {
  const out = [];
  const walk = (at) => {
    let entries;
    try { entries = readdirSync(join(ENGINE, at), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = `${at}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (match.test(e.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
};
const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* ------------------------------------------------------------------ what --- */

const RUNTIME = files("runtime/src").filter((f) => !f.endsWith("/index.ts"));
const src = new Map(RUNTIME.map((f) => [f.replace("runtime/src/", "").replace(".ts", ""), read(f)]));

/**
 * ⚠️ VALUES ONLY. A type has no lane to be mounted in — it either compiles or it
 * does not, and asking this question of one produces noise nobody can act on.
 */
const VALUE = /^export (?:async )?(?:function|const|class) (\w+)/gm;

const declared = new Map();
for (const [mod, text] of src) {
  for (const m of text.matchAll(VALUE)) declared.set(m[1], mod);
}

/* --------------------------------------------------------------- reached --- */

/** The names one file takes from one source, as the import statement lists them. */
const namesFrom = (text, from) => {
  const out = new Set();
  const at = new RegExp(`import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s*from\\s*"${from}"`, "g");
  for (const m of text.matchAll(at)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim();
      if (name) out.add(name);
    }
  }
  return out;
};

/*
  ⚠️ THE DEPLOYMENT, THE HUB AND THE REFERENCE APP ARE THE OUTSIDE. Everything
  above the runtime reaches it through the one barrel, so what those three
  import from `@engine/runtime` is the whole of what the platform above actually
  uses.
*/
const consumers = [...files("one/src"), ...files("one-hub/src"), ...files("apps/hello/src")]
  .map(read).join("\n");
const outside = namesFrom(consumers, "@engine/runtime");

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const reaches = (name, own) => {
  if (outside.has(name)) return true;
  for (const [mod, text] of src) {
    if (mod !== own && namesFrom(text, `\\./${own}\\.js`).has(name)) return true;
  }
  /* Its own module may use it — a store's read behind its own operation. */
  const body = strip(src.get(own)).replace(
    new RegExp(`^export (?:async )?(?:function|const|class) ${name}\\b`, "gm"), "");
  return new RegExp(`\\b${name}\\b`).test(body);
};

/* -------------------------------------------------------------- deferred --- */

/**
 * ⚠️ A MARKER ON THE MODULE COVERS THE MODULE. The vault is not mounted as a
 * feature, not as ten separate oversights, and ten copies of one sentence is
 * nine that go stale. The per-module count is printed instead, so a capability
 * quietly added to a waiting module shows up as the number going up.
 */
const MARKER = /DEFER\(engine-(\d+)\)/;

/*
  ⚠️ AND THE WINDOW IS THE PREVIOUS EXPORT, NOT A CHARACTER COUNT. A 900-character
  look-back excused whatever happened to sit near a marker: `forget` and
  `surfaceOfComposed` are adjacent in `compose.ts`, so un-mounting the second one
  was absorbed by the first one's deferral and the mutation test passed. The
  comment block between one export and the next belongs to exactly one of them.
*/
const deferralFor = (name, mod) => {
  const text = src.get(mod);
  const at = Math.max(
    text.indexOf(`export function ${name}`),
    text.indexOf(`export const ${name}`),
    text.indexOf(`export async function ${name}`),
    text.indexOf(`export class ${name}`),
  );
  const before = text.slice(0, at);
  const previous = [...before.matchAll(/^export /gm)].pop();
  const own = before.slice(previous ? previous.index : 0).match(MARKER)?.[1];
  if (own) return own;
  /* The file header — everything above the first import. */
  const head = text.slice(0, text.search(/^import /m) < 0 ? 0 : text.search(/^import /m));
  return head.match(MARKER)?.[1] ?? null;
};

/* ----------------------------------------------------------------- check --- */

const waiting = new Map();
let mounted = 0;
for (const [name, mod] of declared) {
  if (reaches(name, mod)) { mounted++; continue; }
  const stage = deferralFor(name, mod);
  if (!stage) {
    fail(`capability: runtime/src/${mod}.ts exports ${name} and nothing imports it — `
      + `a capability with tables, tests and no address anybody could reach it at.\n`
      + `       Mount it, or put a DEFER(engine-N) stage:N marker on it so the gap is in the deferral list rather than in the silence.`);
    continue;
  }
  waiting.set(stage, [...(waiting.get(stage) ?? []), `${mod}.${name}`]);
}

if (!declared.size) {
  fail("capability: no runtime exports matched at all — a check that cannot fail");
} else {
  const held = [...waiting.entries()].sort()
    .map(([stage, names]) => `${names.length} on stage ${stage}`).join(", ");
  ok(`capability: ${declared.size} runtime capabilit(ies), ${mounted} mounted`
    + (held ? `, ${held}` : ""));
}

/*
  ⚠️ AND A DEFERRED MODULE'S SCHEMA IS STILL APPLIED, WHICH IS THE PART THAT
  MISLEADS. `docs.test.mjs` refuses a marker naming a shipped stage; this refuses
  the other direction — a stage nobody has written down at all, so the marker
  looks like a plan and points at nothing.
*/
const staged = new Set(
  [...read("docs/PROGRESS.md").matchAll(/^\|\s*(\d+)\s*\|/gm)].map((m) => m[1]),
);
const unstaged = [...waiting.keys()].filter((s) => !staged.has(s));
if (unstaged.length) {
  fail(`capability: stage(s) ${unstaged.join(", ")} are deferred to and PROGRESS.md has no row for them — a marker pointing at nothing reads as a plan`);
} else if (waiting.size) {
  ok(`capability: every waiting capability names a stage PROGRESS.md carries`);
}

console.log(bad
  ? `\ncapability: ${bad} finding(s) — built, applied, and reachable from nowhere.`
  : `\ncapability: everything the runtime can do is mounted, or is waiting on a named stage.`);
process.exit(bad ? 1 : 0);
