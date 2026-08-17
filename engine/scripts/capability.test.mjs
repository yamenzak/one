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

import { read } from "./lib/rules.mjs";
import { PACKAGES, load, deferralFor } from "./lib/capabilities.mjs";
import { knownStages } from "./lib/stages.mjs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ----------------------------------------------------------------- check --- */

const waiting = new Map();
for (const of_ of PACKAGES) {
  const { src, declared, reaches } = load(of_);
  let mounted = 0;
  for (const [name, mod] of declared) {
    if (reaches(name, mod)) { mounted++; continue; }
    const stage = deferralFor(src, name, mod);
    if (!stage) {
      fail(`capability: ${of_.pkg}/src/${mod}.ts exports ${name} and nothing imports it — `
        + `a capability with tables, tests and no address anybody could reach it at.\n`
        + `       Mount it, delete it, or put a DEFER(engine-N) stage:N marker on it so the gap is in the deferral list rather than in the silence.`);
      continue;
    }
    waiting.set(stage, [...(waiting.get(stage) ?? []), `${of_.pkg}/${mod}.${name}`]);
  }

  if (!declared.size) {
    fail(`capability: no ${of_.pkg} exports matched at all — a check that cannot fail`);
  } else {
    const held = declared.size - mounted;
    ok(`capability: ${of_.pkg} declares ${declared.size}, ${mounted} mounted`
      + (held ? `, ${held} waiting on a stage` : ""));
  }
}

/*
  ⚠️ AND A DEFERRED MODULE'S SCHEMA IS STILL APPLIED, WHICH IS THE PART THAT
  MISLEADS. `docs.test.mjs` refuses a marker naming a shipped stage; this refuses
  the other direction — a stage nobody has written down at all, so the marker
  looks like a plan and points at nothing.
*/
const staged = knownStages();
const unstaged = [...waiting.keys()].filter((s) => !staged.has(s));
if (unstaged.length) {
  fail(`capability: stage(s) ${unstaged.join(", ")} are deferred to and the stage registry has no row for them — a marker pointing at nothing reads as a plan`);
} else if (waiting.size) {
  ok(`capability: every waiting capability names a stage the registry carries`);
}

console.log(bad
  ? `\ncapability: ${bad} finding(s) — built, applied, and reachable from nowhere.`
  : `\ncapability: everything these packages can do is mounted, or is waiting on a named stage.`);
process.exit(bad ? 1 : 0);
