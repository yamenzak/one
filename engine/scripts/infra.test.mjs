/**
 * THE ACCOUNT TOKEN, AND WHAT IT CAN REACH.
 *
 * ⚠️ THIS GUARD EXISTS BECAUSE A DECISION WAS REVERSED. `engine.yml` says, of
 * the deploy workflow's Cloudflare token: "the worker gets neither… putting one
 * in `env` would be handing every request handler the account." Provisioning
 * from the running deployment reverses that, deliberately and with an argument
 * (`cloudflare.ts`), and a reversal like this is only safe for as long as the
 * four things bounding it stay true. Written down, they last until somebody is
 * in a hurry. Checked, they last.
 *
 * ⚠️ THE THIRD CHECK IS THE ONE THAT MATTERS. Without the add-only merge, a
 * leaked token is not "somebody can make an empty bucket" — it is one PATCH away
 * from `DIRECTORY` pointing at a database somebody else chose, taking every
 * account, session and workspace record with it, and nothing anywhere would look
 * wrong. With it, the worst case is spurious resources and a bill.
 *
 * ⚠️ AND THE RESIDENCY TABLE IS CHECKED AGAINST ITSELF. `KEEPS_RESIDENCY` is a
 * claim about what Cloudflare offers, and a `true` added to it by somebody
 * guessing is a residency promise the storage underneath will not keep — found
 * by a regulator, or by nobody. Every entry has to carry the sentence saying
 * which it is.
 */

import { readFileSync, readdirSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const RUNTIME = "engine/runtime/src";
const files = readdirSync(RUNTIME).filter((f) => f.endsWith(".ts"));

/* ------------------------------------------------------- one door out --- */

/*
  ⚠️ A SECOND CALLER IS A SECOND SET OF RULES. Every bound placed on this token
  lives in `cloudflare.ts`; a `fetch` to the API from anywhere else inherits
  none of them — not the add-only merge, not the refusal to repoint, not the
  audit. The name-anywhere search is exact here because the host is a literal.
*/
const HOST = "api.cloudflare.com";
const doors = files.filter((f) => readFileSync(`${RUNTIME}/${f}`, "utf8").includes(HOST));
if (doors.length !== 1 || doors[0] !== "cloudflare.ts") {
  fail(`infra: ${HOST} is reached from ${doors.join(", ") || "nowhere"} — `
    + `it must be cloudflare.ts and nothing else, because every bound on the account `
    + `token is written there and a second caller inherits none of them`);
} else {
  ok("infra: one door out to the account, and it is cloudflare.ts");
}

const door = readFileSync(`${RUNTIME}/cloudflare.ts`, "utf8");

/* ------------------------------------------------- the add-only merge --- */

if (!/NEVER_REPOINTED/.test(door) || !/DIRECTORY/.test(door)) {
  fail("infra: cloudflare.ts does not name DIRECTORY as never-repointed — "
    + "the token is then one PATCH from the directory addressing somebody else's database");
} else if (!/repointed\.length/.test(door)) {
  fail("infra: nothing refuses a patch that would repoint an existing binding — "
    + "the merge is add-only or the token is catastrophic rather than merely powerful");
} else {
  ok("infra: bindings are added and never repointed, and the directory is named");
}

/*
  ⚠️ READ BEFORE WRITE, because this endpoint REPLACES the binding array. A
  computed set sent without reading the current one does not add a binding — it
  removes every binding the computation did not know about.
*/
if (!/const current = await bindings\(at\)/.test(door)) {
  fail("infra: patchBindings does not read the current bindings first — "
    + "the endpoint replaces the array, so writing a computed set deletes everything else");
} else {
  ok("infra: the current bindings are read before any are written");
}

/* --------------------------------------------------- never in a column --- */

/*
  ⚠️ THE TOKEN IS A WORKER SECRET. A row holding it is readable by anything that
  can read the database — and this credential can rewrite what the database IS,
  so storing it there inverts the whole containment.
*/
for (const f of files) {
  const text = readFileSync(`${RUNTIME}/${f}`, "utf8");
  if (/(INSERT|UPDATE)[^;]*CF_API_TOKEN/i.test(text)) {
    fail(`infra: ${f} writes CF_API_TOKEN to the database — it is a worker secret, `
      + `because a row holding it is readable by anything that can read the database `
      + `and this credential can rewrite what the database is`);
  }
}

/* ------------------------------------------------------- the residency --- */

const infra = readFileSync("engine/kernel/src/infra.ts", "utf8");
const table = infra.slice(infra.indexOf("KEEPS_RESIDENCY"), infra.indexOf("IS_CREATED"));
const kinds = [...infra.matchAll(/export type ResourceKind =([^;]+);/g)]
  .flatMap((m) => [...m[1].matchAll(/"(\w+)"/g)].map((x) => x[1]));

if (kinds.length < 4) fail("infra: ResourceKind did not parse — a check that cannot fail");
for (const kind of kinds) {
  if (!new RegExp(`\\b${kind}:\\s*(true|false)`).test(table)) {
    fail(`infra: "${kind}" has no entry in KEEPS_RESIDENCY — `
      + `an unanswered kind is one a residency promise is made over by default`);
  }
}

/*
  ⚠️ THE PROSE AND THE TABLE HAVE TO AGREE, AND CHECKING THAT THE PROSE MERELY
  MENTIONS THE KIND IS NOT ENOUGH — that was the first draft, and flipping
  `kv: false` to `true` sailed through it, because the header still had a line
  about kv. It said "no". The table then said yes.

  The header names each kind and ends its line with the verdict; a mismatch is
  somebody changing one of the two, which is precisely the edit that turns a
  documented limitation into a residency promise nothing can keep.
*/
const SAID = /^\s*\*\s+(d1|kv|r2|queue|ai|do)\s+(.+)$/gm;
const prose = new Map([...infra.matchAll(SAID)]
  .map(([, kind, line]) => [kind, !/\bso:\s*no\b/.test(line)]));

for (const kind of kinds) {
  const inTable = new RegExp(`\\b${kind}:\\s*true`).test(table);
  if (!prose.has(kind)) {
    fail(`infra: the header does not state whether "${kind}" can be held to a `
      + `jurisdiction — every entry is a claim about Cloudflare's documentation `
      + `and has to name the mechanism or say there is none`);
    continue;
  }
  if (prose.get(kind) !== inTable) {
    fail(`infra: KEEPS_RESIDENCY says ${kind} = ${inTable} and the header says `
      + `${prose.get(kind)} — one of the two was edited alone, and the direction that `
      + `matters turns a documented limitation into a promise nothing keeps`);
  }
}
if (!bad) ok(`infra: ${kinds.length} resource kinds, each with a residency verdict and a reason`);

/* ------------------------------------------------ the ladder is honest --- */

const res = readFileSync(`${RUNTIME}/resources.ts`, "utf8");

/*
  ⚠️ `live` IS ONLY EVER WRITTEN BY AN ISOLATE THAT CAN SEE THE BINDING. A patch
  produces a new version the caller is not running, so marking a resource usable
  on a successful patch reports a binding that reads `undefined` — which is not
  an error, it is an empty answer.
*/
if (!/function observe\(/.test(res) || !/env\[row\.binding\]/.test(res)) {
  fail("infra: nothing confirms a binding by actually looking at `env` — "
    + "a patch reporting success is a claim, not a usable binding");
} else {
  ok("infra: `live` is written only where the binding can be seen");
}

/*
  ⚠️ NOTHING IS DELETED ON THE PASS THAT NOTICES. An app removed by a typo would
  otherwise take its database with it, in the same minute, behind a green log.
*/
/*
  ⚠️ THE WINDOW HAS TO BE COMPUTED FROM `DRAIN_DAYS`, not merely mentioned. The
  first draft matched the name anywhere in the file — so replacing the
  arithmetic with a zero left the import in place and the guard green, which is
  a drain window of no days wearing the word.
*/
const window = /drain_after:[\s\S]{0,200}?toISOString|DRAIN_DAYS \* 24 \* 60 \* 60 \* 1000/;
const floor = Number((infra.match(/DRAIN_DAYS = (\d+)/) ?? [])[1] ?? 0);
if (!/DRAIN_DAYS \* 24 \* 60 \* 60 \* 1000/.test(res) || !window.test(res)) {
  fail("infra: the drain window is not computed from DRAIN_DAYS — "
    + "a bad edit is then data loss rather than a month to notice it");
} else if (floor < 7) {
  fail(`infra: DRAIN_DAYS is ${floor} — the cost of holding an empty database `
    + `longer is pennies and the cost of the other mistake is somebody's records`);
} else {
  ok(`infra: unwanted resources drain for ${floor} days before anything destroys them`);
}

/* ⚠️ AND THE REAPER READS OUR OWN ROWS, never the account's list. A list
   includes what people made by hand, and destroying one of those is the sweep
   deleting somebody's unrelated bucket at three in the morning. */
if (/destroy\([^)]*listRemote/.test(res) || !/for \(const row of await resources\(|step\.row\.remoteId/.test(res)) {
  fail("infra: the reaper does not clearly destroy only what this deployment recorded making");
} else {
  ok("infra: only what the deployment recorded making is ever destroyed");
}

/*
  ⚠️ THE RESIDENCY IS PART OF A BINDING'S KEY, AND IT WAS NOT. A `perResidency`
  need is one row per jurisdiction and every one carries the SAME need id — so
  keyed on `app:need` alone, two rows collapse onto one entry and whichever is
  read last wins for everybody. An EU workspace then resolves the global bucket:
  both work, both uploads succeed, and one workspace's files are in the wrong
  regime, found by a regulator or by nobody.

  ⚠️ IT WAS INVISIBLE WITH ONE JURISDICTION, which is why it is checked
  structurally rather than left to the day a second one is added.
*/
if (!/bindingKey = \(\s*appId: string, needId: string, residency/.test(res)) {
  fail("infra: bindingKey does not take a residency — two `perResidency` rows "
    + "then collapse onto one entry and a workspace resolves another "
    + "jurisdiction's store, with both working and nothing reporting it");
} else if (!/out\.set\(bindingKey\(row\.appId, row\.needId, row\.residency\)/.test(res)) {
  fail("infra: liveBindings does not key by residency — the map is built without "
    + "the one field that tells two jurisdictions' resources apart");
} else {
  ok("infra: a binding is keyed by its jurisdiction, so two cannot collapse into one");
}

console.log(bad
  ? `\ninfra: ${bad} bound on the account token is missing.`
  : "\ninfra: the deployment provisions itself, and the token cannot repoint what exists.");
process.exit(bad ? 1 : 0);
