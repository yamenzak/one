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
 * ⚠️ A MENTION IS NOT A USE, AND THIS GUARD WAS MAKING THAT MISTAKE ABOUT ITS
 * OWN SUBJECT. `unread` is a kernel rule — which settings nobody has read — and
 * it is also the name of the notification count on the shell's crown. The walk
 * matched the prop and reported the rule as in force through a surface, which is
 * the precise failure the whole check exists to catch, one level up.
 *
 * ⚠️ SO A LANE MUST IMPORT IT. That is the actual wiring, and it cannot collide
 * with an ordinary English word the way a bare identifier can.
 *
 * ⚠️ AND A GUARD IS NOT AN EXCEPTION, WHICH WAS THE SECOND MISTAKE. Allowing an
 * `.mjs` script to name a rule as text moved `unread`'s false credit from a
 * surface to a guard rather than removing it — `ground.test.mjs` has a local
 * variable called `unread`. The one guard that genuinely applies a kernel rule,
 * `tone.test.mjs`, imports `refuseCopy` from `kernel/src/tone.ts` and calls it,
 * because that is what applying a rule means. There is nothing to exempt.
 */
const IMPORTS = (src, name) => {
  const at = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*"[^"]*"/g;
  for (const m of src.matchAll(at)) {
    for (const part of m[1].split(",")) {
      if (part.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim() === name) return true;
    }
  }
  return false;
};

export const reaches = (_file, src, name) => IMPORTS(src, name);

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
 * WHAT COUNTS AS A RULE, AND WHY IT IS NOT JUST A NAME.
 *
 * ⚠️ `refuse[A-Z]` WAS THE WHOLE PATTERN AND IT HID SIX RULES. The kernel states
 * rules under two names: `refuseX` returns a list of problems, and the `unX`
 * family — `unrecordedWrites`, `unenforced`, `unraisable`, `strayFacts` — returns
 * the ids of the things that are wrong. Both are "here is what this declaration
 * gets wrong"; only one was being enumerated, so the other six were outside a
 * check whose entire subject is rules that nothing runs.
 *
 * ⚠️ SO THE SIGNAL IS THE RETURN, NOT THE PREFIX. A rule answers with a list of
 * what is wrong — `readonly XProblem[]`, `readonly XRefusal[]`, or a list of ids.
 * `refusedOn` reads one field of a refusal and returns a string; matching the
 * name alone put it in the inventory as a rule.
 *
 * ⚠️ AND THE COUNT IS PRINTED WHEREVER THIS IS USED, so a rule that slips out of
 * the pattern shows up as the number going down rather than as silence.
 */
/*
  ⚠️ AND A RULE MAY ANSWER WITH ONE REFUSAL RATHER THAN A LIST. Matching only
  `readonly X[]` widened the net in one direction and closed it in another:
  `refuseRole` and `refuseCommercial` return `XRefusal | null` and vanished from
  a check whose whole subject is rules nothing runs. Both shapes, or the guard
  moves its own blind spot around.
*/
/*
  ⚠️ AND ONE DECLARATION'S WINDOW MUST NOT CROSS THE NEXT ONE. This ran as a
  single `matchAll` over the whole file, so a 400-character look-ahead could
  swallow the declaration after it and `matchAll` would resume PAST it —
  `verbOf` is not a rule, its window reached into `unrecordedWrites`, and a rule
  about every write saying what to record was invisible to a check whose subject
  is rules nothing runs. Each declaration is now read on its own.
*/
const SIGNATURE = new RegExp(
  "^export (?:function|const) (\\w+)[\\s\\S]{0,400}?\\)\\s*:\\s*"
  + "(?:readonly ([\\w]*(?:Problem|Refusal|string)\\[\\])|([\\w]*(?:Problem|Refusal)) \\| null)",
);

/** Every top-level export in a file, as its own slice. */
const declarations = (src) => {
  const at = [...src.matchAll(/^export (?:function|const) \w+/gm)];
  return at.map((m, i) => src.slice(m.index, at[i + 1]?.index ?? src.length));
};

/* ⚠️ A LIST OF STRINGS IS AMBIGUOUS — `settingsOn` returns one and decides
   nothing. What separates a rule is that its answer is a complaint, and in this
   kernel those are named for the fault: what is unenforced, unread, stray,
   dangling, orphaned, missing, stalled, overdue, unbounded. */
const FAULT = /^(refuse[A-Z]|un[a-z]|stray|dangling|orphan|missing|stalled|overdue|claims|would)/;

/**
 * ⚠️ A SIBLING'S LANE IS ITS OWN, AND A FILE IS NOT A CALLER. Reading the whole
 * of `notify.ts` to ask whether `refusePolicy` calls `unknownVariables` answers
 * yes for every rule that file happens to contain — so `unknownVariables`, which
 * is reachable only through the deferred `refuseLetter`, was reported as in force
 * through the runtime. That is the chain-ending-nowhere failure this walk already
 * refuses, wearing co-location instead of a chain.
 *
 * The bodies here are top-level exports separated by top-level exports, so the
 * next `^export ` is the end of this one. A parser would be more correct and
 * would also be a dependency in a tree that has none.
 */
const bodyOf = (src, name) => {
  const at = Math.max(
    src.indexOf(`export function ${name}`),
    src.indexOf(`export const ${name}`),
  );
  if (at < 0) return "";
  const rest = src.slice(at + 1);
  const end = rest.search(/^export /m);
  return end < 0 ? rest : rest.slice(0, end);
};

/** Every rule the kernel states, with the lane that runs it (or `null`). */
export function resolveRules() {
  const LANES = lanes();
  const bodies = new Map();
  for (const lane of Object.values(LANES)) for (const f of lane) bodies.set(f, read(f));

  const rules = [];
  for (const f of files("kernel/src")) {
    for (const chunk of declarations(read(f))) {
      const m = SIGNATURE.exec(chunk);
      if (!m) continue;
      const name = m[1];
      /* A problem list — or one refusal — is a rule whatever it is called; a
         plain list of strings is one only where the name reports a fault. */
      const problems = m[3] !== undefined || !(m[2] ?? "").startsWith("string");
      if (problems || FAULT.test(name)) rules.push({ name, file: f });
    }
  }

  const found = new Map();
  let moved = true;
  while (moved) {
    moved = false;
    for (const rule of rules) {
      if (found.has(rule.name)) continue;
      const lane = Object.keys(LANES)
        /* ⚠️ THE COMPOSITION LANE IS `manifest.ts`, WHICH ALSO DECLARES A RULE.
           `refuseApp` is called by `defineApp` beside it, so there is no import
           to find — a same-file caller is the one place a bare identifier is
           unambiguous, because the declaration is right there. */
        .find((l) => LANES[l].some((f) => (f === rule.file
          ? uses(bodies.get(f) ?? "", rule.name)
          : reaches(f, bodies.get(f) ?? "", rule.name))));
      if (lane) { found.set(rule.name, lane); moved = true; continue; }
      /* ⚠️ A kernel sibling counts only if the sibling itself runs — otherwise a
         chain of rules ending nowhere passes, which is the same failure with an
         extra step in it. */
      const caller = rules.find((other) =>
        other.name !== rule.name && found.has(other.name)
        && uses(bodyOf(read(other.file), other.name), rule.name));
      if (caller) { found.set(rule.name, found.get(caller.name)); moved = true; }
    }
  }

  const markerOn = (rule) => {
    const src = read(rule.file);
    const at = Math.max(
      src.indexOf(`export function ${rule.name}`),
      src.indexOf(`export const ${rule.name}`),
    );
    return src.slice(Math.max(0, at - 900), at).match(/DEFER\(engine-(\d+)\)/)?.[1] ?? null;
  };

  /*
    ⚠️ A DEFERRAL TRAVELS TO WHAT THE DEFERRED RULE CALLS. `unknownVariables` is
    only reachable through `refuseLetter`, which waits on a lane that sends mail
    — so it is deferred too, and reporting it as a rule nobody runs would push
    somebody to wire it into a lane that does not exist. Marking each one by hand
    would be the same fact written twice, and the second copy is the one that
    rots.
  */
  const deferred = new Map();
  for (const rule of rules) {
    const own = markerOn(rule);
    if (own) deferred.set(rule.name, own);
  }
  let spread = true;
  while (spread) {
    spread = false;
    for (const rule of rules) {
      if (found.has(rule.name) || deferred.has(rule.name)) continue;
      const caller = rules.find((other) =>
        other.name !== rule.name && deferred.has(other.name)
        && uses(bodyOf(read(other.file), other.name), rule.name));
      if (caller) { deferred.set(rule.name, deferred.get(caller.name)); spread = true; }
    }
  }

  return rules.map((rule) => ({
    ...rule,
    where: rule.file.replace("kernel/src/", "").replace(".ts", ""),
    lane: found.get(rule.name) ?? null,
    deferredTo: deferred.get(rule.name) ?? null,
  }));
}
