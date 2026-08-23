/**
 * A REMOTE ANSWER IS ASKED FOR ONCE, KEYED, AND KEPT.
 *
 * @design every read goes through the door, which holds one answer per question.
 *
 * ⚠️ THIS EXISTS BECAUSE THE PLATFORM SOLVED IT AND THE PRODUCT DID NOT GET THE
 * FIX. `useLoad` has held answers and shown them while it revalidates since the
 * OneSpace was written — its own header says a screen without that "blanks on
 * every navigation, including going back", which is "most of what 'every
 * navigation takes time' is". An app is handed the DOOR and the registrar and
 * nothing else, so OneInventory wrote its own hook: forty-five reads, no cache,
 * no coalescing, and `useState(waiting())` on every mount. Measured on a phone
 * that is several seconds of blank screen per tap, and it is the same rows
 * fetched from the same tables again.
 *
 * ⚠️ SO THE RULE IS ABOUT THE KEY, NOT ABOUT CACHING. A read named by an
 * OPERATION and its INPUT can be held, shared between two blocks that want it
 * and seeded synchronously on the next visit. A read hidden inside a THUNK can
 * be none of those, however careful the caller is — nothing outside the closure
 * can say what was asked. That is why what this refuses is the SHAPE.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs } from "./lib/trees.mjs";

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
      else if (re.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};


/**
 * ⚠️ THE INITIALISER, RESOLVED THROUGH ONE NAME. What has to draw on the store
 * is the FIRST render — an effect that seeds afterwards has already painted a
 * skeleton over the answer. Both checks below asked whether the hook mentioned
 * `known` anywhere, which the body does in three places, so a hook whose
 * initialiser had been changed back to `waiting()` passed: the guard agreed with
 * the defect it exists to catch. This reads the argument to `useState<Loaded<T>>`
 * and, where that argument is a name, the declaration it stands for.
 */
const seedsFromStore = (src) => {
  /* ⚠️ THE SINGLE-LINE FORM FIRST. Tried the other way round, the multi-line
     alternative runs `[\s\S]*?` on to the next `\n  );` ANYWHERE below — which,
     handed a slice that ran to the end of the file, swallowed the whole hook and
     found `known` in the effect. The guard then agreed with the mutation it was
     written to catch, which is the one outcome a guard must not have. */
  const call = /useState<Loaded<T>>\(([^;\n]*?)\);/.exec(src)
    ?? /useState<Loaded<T>>\(([\s\S]*?)\n\s*\}?\);/.exec(src);
  const arg = (call?.[1] ?? "").trim();
  if (!arg) return false;
  if (/\bknown</.test(arg)) return true;
  const name = /^([A-Za-z_$][\w$]*)$/.exec(arg)?.[1];
  if (!name) return false;
  const decl = new RegExp(`const ${name}\\b[\\s\\S]*?\\n  \\};`).exec(src)?.[0] ?? "";
  return /\bknown</.test(decl);
};

/* ------------------------------------ the door holds one answer per key --- */

{
  const door = join(ENGINE, "one-space/src/api.ts");
  const src = readFileSync(door, "utf8");
  /* ⚠️ Named separately so a missing half is reported as the half it is. */
  const holds = /const answers = new Map</.test(src);
  const shares = /const flight = new Map</.test(src);
  const seeds = /export const known = /.test(src);
  const drops = /export const forget = /.test(src);
  const missing = [
    !holds && "an answer store (`answers`)",
    !shares && "in-flight coalescing (`flight`)",
    !seeds && "a synchronous read (`known`)",
    !drops && "an invalidation (`forget`)",
  ].filter(Boolean);

  if (missing.length) {
    fail(`one-space/src/api.ts is missing ${missing.join(", ")}.\n` +
         "       The key for an answer is the operation and its input, and this is the one\n" +
         "       place both are in hand. Without the store every navigation re-asks; without\n" +
         "       the coalescing three blocks wanting one list are three queries in one frame.");
  } else {
    ok("door: one answer store, keyed by operation and input, shared while in flight");
  }
}

/* --------------------------------- nobody keeps a second store above it --- */

{
  /*
    ⚠️ TWO CACHES FOR ONE QUESTION IS TWO ANSWERS THAT CAN DISAGREE, and it is
    the state this repo was in: `useLoad` held a `Map` keyed `id:input` while the
    door keyed the same question its own way. Whichever a screen happened to
    reach decided what it drew.
  */
  const OUTSIDE = [
    ...filesIn("one-space/src").filter((f) => !f.endsWith("api.ts")),
    ...filesIn("design/src"),
    ...appDirs().flatMap((d) => filesIn(d)),
  ];
  let kept = 0;
  for (const file of OUTSIDE) {
    const src = readFileSync(file, "utf8");
    /* A module-scope Map whose keys are built from an operation id. */
    if (/^const \w+ = new Map<string, unknown>\(\)/m.test(src)) {
      kept++;
      fail(`${rel(file)}: keeps a store of remote answers of its own.\n` +
           "       The door already holds one per operation-and-input. A second is a second\n" +
           "       key for one question, and the two disagree the first time a write lands.");
    }
  }
  if (!kept) ok(`store: ${OUTSIDE.length} file(s), none holding remote answers beside the door`);
}

/* ------------------------------------- an app's reads name what they ask --- */

{
  /*
    ⚠️ A THUNK CANNOT BE KEYED, WHICH IS THE WHOLE FINDING. `useAsked(() =>
    api.get("stock.list", { limit }))` reads correctly and is unimprovable: the
    hook cannot hold the answer, cannot share it with the block beside it and
    cannot seed the next visit, because what was asked is inside a closure.
  */
  const dirs = [...appDirs(), "one-space/src"];
  let thunks = 0;
  let files = 0;
  for (const dir of dirs) {
    for (const file of filesIn(dir)) {
      const src = readFileSync(file, "utf8");
      if (!/\buse[A-Z]\w*\(/.test(src)) continue;
      files++;
      /* A hook call whose first argument is an arrow that reaches the door. */
      for (const [whole] of src.matchAll(
        /\buse[A-Z]\w*(?:<[^>()]*>)?\(\s*(?:async\s*)?\(\s*\)\s*=>\s*[\w.]*\bapi\.(get|post)\b/g)) {
        thunks++;
        fail(`${rel(file)}: reads through a thunk — \`${whole.trim().slice(0, 60)}…\`.\n` +
             "       Name the operation and its input instead. A read nothing can name is a\n" +
             "       read nothing can hold, share, or draw from on the way back to it.");
      }
    }
  }
  if (!files) {
    fail("no files with hooks found — this guard would pass over an empty list.");
  } else if (!thunks) {
    ok(`named: ${files} file(s) drawing from the API, every read naming its operation`);
  }
}

/* ------------------------------------------ and a read seeds what it has --- */

{
  /*
    ⚠️ THE STORE IS USELESS TO A HOOK THAT BLANKS ANYWAY. `useState(waiting())`
    on mount throws away an answer the tab is holding and paints a skeleton over
    it — which is the symptom, whatever the door does underneath. Every read hook
    has to seed from `known` in its INITIALISER, synchronously.
  */
  const hooks = [
    ["one-space/src/centre/data.tsx", "useLoad"],
    ["apps/inventory/src/screens/live.tsx", "useAsked"],
  ];
  let blind = 0;
  for (const [where, name] of hooks) {
    const at = join(ENGINE, where);
    if (!existsSync(at)) {
      fail(`${where}: gone, so this guard no longer covers \`${name}\`.`);
      blind++;
      continue;
    }
    const src = readFileSync(at, "utf8");
    /* ⚠️ TO THE NEXT TOP-LEVEL DECLARATION, not to the end of the file, and cut
       with `indexOf` rather than a regex built from a string. A slice that runs
       on hands every pattern below the whole module to match in — which is how
       the seed check came to find `known` in a different hook and report the
       mutation it exists to catch as green. */
    const from = src.indexOf(`function ${name}`);
    const rest = src.slice(from + 1);
    const ends = [rest.indexOf("\n/**"), rest.indexOf("\nexport "), rest.indexOf("\nfunction ")]
      .filter((i) => i >= 0);
    const bounded = rest.slice(0, ends.length ? Math.min(...ends) : rest.length);

    const seeds = seedsFromStore(bounded);
    if (!seeds) {
      blind++;
      fail(`${where}: \`${name}\` does not seed its first render from what is known.\n` +
           "       A hook that starts at `waiting()` paints a skeleton over an answer already\n" +
           "       in hand, which is the blank navigation the store exists to end.");
    }
  }
  if (!blind) ok(`seeded: all ${hooks.length} read hook(s) start from what the tab already holds`);
}

console.log(bad
  ? `\nasking: ${bad} finding(s) — a read nobody can name is a read paid for twice.`
  : `\nasking: every read names its question, and the answer is asked for once.`);
process.exit(bad ? 1 : 0);
