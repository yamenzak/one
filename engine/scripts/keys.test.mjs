/**
 * A KEY IS NOT A NAME, AND A SCREEN THAT PRINTS ONE IS SHOWING SOMEBODY THE CODE.
 *
 * ⚠️ THIS IS THE MOST-REPEATED FAULT IN THIS PRODUCT AND IT PASSES EVERY OTHER
 * CHECK. A shard described as "eu", a store as "d1", a payment parked because
 * "no_tenant", a colleague listed as "owner", a plan step as "bind" — every one
 * of them is a value the code branches on, rendered in the place a place, a
 * thing, a reason, a role or an act was meant. Nothing fails: the value is a
 * perfectly good string, the type is right, and the screen looks finished.
 *
 * ⚠️ THE FIELDS ARE DERIVED, NEVER LISTED. A hand-kept list of "key-ish" names
 * is a list that stops covering the codebase the day somebody adds a type — the
 * same way the date guard's hand-kept field list had already stopped covering
 * `version`. What makes a value a key is that its TYPE is a closed set of string
 * literals, which the kernel declares and this reads.
 *
 * ⚠️ AND ONLY IN A RENDER POSITION. `if (s.where === "eu")` is the code doing
 * its job; `{s.where}` and `` `${s.where}` `` are the two places a value becomes
 * words. A check that flagged the comparison would be one people learn to
 * ignore, which is worse than no check at all.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir, re = /\.tsx?$/) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (re.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ------------------------------------------------------------- the closed sets --- */

/**
 * ⚠️ EVERY MEMBER A LOWERCASE LITERAL, WHICH IS WHAT MAKES IT A KEY RATHER THAN
 * A LIST OF WORDS. `"Mon" | "Tue"` is already language; `"eu" | "global"` and
 * `"past_due" | "active"` are identifiers, and an identifier on a screen is the
 * fault. Two members at least: a one-member union is a constant, not a set.
 */
const DECLARES = [...filesIn("kernel/src"), ...filesIn("runtime/src")];
const UNION = /export type (\w+)\s*=\s*([^;]+);/g;
const KEYISH = /^"[a-z][a-z0-9_.-]*"$/;

const SETS = new Set();
for (const file of DECLARES) {
  const src = strip(readFileSync(file, "utf8"));
  for (const [, name, body] of src.matchAll(UNION)) {
    const parts = body.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => KEYISH.test(p))) SETS.add(name);
  }
}

/**
 * ⚠️ AND THE FIELD NAMES COME FROM THE DECLARATIONS THAT USE THEM. A screen
 * reads `s.where`, not `s.Residency` — so the guard needs the property whose
 * declared type is one of the sets above, wherever that is declared.
 *
 * ⚠️ ONE DECLARATION IS ENOUGH, AND THE EXCEPTIONS ARE WRITTEN DOWN. Requiring
 * that EVERY declaration of a name binds a closed set sounds stricter and is
 * strictly weaker: `where` is a `Residency` on a placement and a hostname on an
 * audit row, so the careful version dropped the field this guard exists for and
 * still reported green. The burden goes the other way — a name is a key until
 * `ALSO_PROSE` says otherwise, with a reason, and that list can only shrink.
 */
const ANY_FIELD = /readonly\s+(\w+)\??\s*:\s*(?:readonly\s+)?([\w"|\s]+?)(?:\[\])?\s*;/g;

/**
 * ⚠️ NAMES THAT ARE ALSO SOMETHING SOMEBODY READS. Each is a word in one
 * declaration and a key in another, and a screen printing the word is right.
 */
const ALSO_PROSE = new Map([
  /* `NeedDef.why`, `JobDef.why`, `FlagDef.why` are all "what this is for, in a
     sentence" — the copy a console shows under a name. `AiProblem.why` is a
     refusal code, and it is the odd one out. */
  ["why", "a declaration's own sentence, everywhere but `AiProblem`"],
  /* `Passage.says`, `Nothing.says` — the words themselves. */
  ["says", "the sentence a block says"],
  /* `label` and `title` are names by definition. */
  ["label", "a declared name"],
  ["title", "a declared name"],
]);

const KEYS = new Set();
for (const file of DECLARES) {
  const src = strip(readFileSync(file, "utf8"));
  for (const [, field, type] of src.matchAll(ANY_FIELD)) {
    if (ALSO_PROSE.has(field)) continue;
    if (type.split("|").map((t) => t.trim()).some((t) => SETS.has(t))) KEYS.add(field);
  }
}

/*
  ⚠️ THE GUARD REFUSES TO PASS ON AN EMPTY DERIVATION. A regex that stops
  matching — a formatting change, a rename — would leave this reporting "ok" over
  a codebase it is no longer reading, which is the failure every check in here
  exists to prevent one level down.
*/
if (SETS.size < 5 || KEYS.size < 5) {
  fail(`keys: derived ${SETS.size} closed set(s) and ${KEYS.size} field name(s) — too few to be real.\n` +
       `       The declarations moved or the shapes changed; fix the derivation rather\n` +
       `       than the threshold.`);
}

/* -------------------------------------------------------------------- surfaces --- */

const SCREENS = [
  ...filesIn("design/src", /\.tsx$/),
  ...filesIn("one-space/src", /\.tsx$/),
  ...filesIn("apps", /\.tsx$/),
].filter((f) => !/\.test\.tsx$/.test(f));

/**
 * ⚠️ EXEMPT WITH A REASON, AND THE LIST CAN ONLY SHRINK. Each of these renders a
 * key ON PURPOSE, to a reader who wrote it.
 */
const SAID_ON_PURPOSE = new Map([
  /* ⚠️ The operator's own screens print two identifiers deliberately: a
     resource's lifecycle state and a move's, which are the words the reconciler
     itself uses and the words an operator quotes back. Both are in a chip beside
     a named thing rather than standing in for one. */
  /* ⚠️ NOT COPY: a template literal is also how a cache key is built, and
     `${of.kind}|${of.seed}` is the key a generated face is memoised under. This
     is the one shape the guard cannot tell apart from a sentence, so it is named
     here rather than guessed at by looking for a separator inside the template. */
  ["design/src/parts/face.tsx", "a cache key, not a sentence"],
]);

/* A member path — `s.where`, `item.kind`, `t?.status` — and nothing else. */
const PATH = "[A-Za-z_$][\\w$]*(?:\\??\\.[\\w$]+)+";
/*
  ⚠️ A JSX CHILD, NOT A PROP. `kind={t.kind}` passes a value along and is the
  whole point of having one; `>{t.kind}<` prints it. The character before the
  brace is what tells them apart — the same test the date guard makes.
*/
const CHILD = new RegExp(`([^=$\\s])\\s*\\{\\s*(${PATH})\\s*\\}`, "g");
const TPL = new RegExp(`\\$\\{\\s*(${PATH})\\s*\\}`, "g");

const lastOf = (path) => path.split(/\??\./).pop();

/*
  ⚠️ A REACT `key` IS NOT COPY EITHER, and it is the one attribute whose value is
  routinely built out of exactly the fields this guard is looking for — a row's
  identity is its key and its reason. Nobody reads it; React does. The date guard
  makes the same exemption for the same reason.
*/
/*
  ⚠️ AND THE BRACES HAVE TO BE BALANCED, which the obvious `[^}]*` is not: a key
  is nearly always a template with `${…}` in it, so a lazy match ended at the
  first inner brace and left the rest of the key as ordinary text. That is the
  worst kind of near-miss — the guard reported a finding on a React key, the
  finding was waived with a file exemption, and the exemption then hid the real
  renders in that file.
*/
const withoutKeys = (src) => {
  let out = "";
  for (let i = 0; i < src.length;) {
    const at = src.indexOf("key={", i);
    if (at < 0) { out += src.slice(i); break; }
    out += src.slice(i, at);
    let depth = 0;
    let j = at + "key=".length;
    for (; j < src.length; j++) {
      if (src[j] === "{") depth++;
      else if (src[j] === "}" && --depth === 0) { j++; break; }
    }
    i = j;
  }
  return out;
};

let said = 0;
let looked = 0;
for (const file of SCREENS) {
  const name = rel(file);
  if (SAID_ON_PURPOSE.has(name)) continue;
  const src = withoutKeys(strip(readFileSync(file, "utf8")));
  looked++;
  const hits = [
    ...[...src.matchAll(CHILD)].map((m) => m[2]),
    ...[...src.matchAll(TPL)].map((m) => m[1]),
  ];
  for (const path of hits) {
    if (!KEYS.has(lastOf(path))) continue;
    said++;
    fail(`${name}: prints \`${path}\` — a value from a closed set, where a name was meant.\n` +
         `       "eu", "d1", "no_tenant", "owner" are what the code branches on. Say it in\n` +
         `       words beside the set that declares it (\`sayWhere\`, \`sayKind\`), or through\n` +
         `       \`sentence()\` where the key genuinely is the word.`);
  }
}
if (process.env.SHOW) console.log("fields:", [...KEYS].sort().join(", "));
if (!said) {
  ok(`keys: ${looked} surface file(s), no closed-set value drawn as words`
     + ` (${KEYS.size} field name(s) from ${SETS.size} set(s))`);
}

console.log(bad
  ? `\nkeys: ${bad} finding(s) — a screen is showing somebody the code.`
  : `\nkeys: what the code branches on never stands in for what a person reads.`);
process.exit(bad ? 1 : 0);
