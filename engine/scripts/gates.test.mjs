/**
 * EVERY GATE THE KERNEL CAN APPLY HAS ITS INPUT SUPPLIED BY THE REQUEST PATH.
 *
 * @design a gate the kernel can apply is never handed a constant — every input the check reads is resolved per request.
 *
 * ⚠️ THIS IS THE GUARD FOR A DEFECT THAT PASSED EVERYTHING. `check` refuses on
 * eight things; one of them is a flag, and the value it read was
 * `located.flags ?? {}` where NOTHING in the deployment ever set `located.flags`.
 * Every request carried an empty map. The kernel's algebra was unit-tested, the
 * console wrote rows and read them back, the manifest refused a flag nothing was
 * behind — and pressing the switch changed nothing anywhere, in any product,
 * with every suite green.
 *
 * ⚠️ THE SHAPE IS "A GATE WHOSE INPUT IS A CONSTANT", and it is invisible by
 * construction. The gate runs, reads its default, and answers — so there is no
 * error, no log line and no failing test. A capability check cannot see it
 * (`flags` had callers), a route check cannot see it (the routes exist), and a
 * unit test on the gate cannot see it (the gate is correct; it is being lied
 * to).
 *
 * ⚠️ SO IT IS CHECKED AT THE ONE CALL SITE. `check` is called in exactly one
 * place — that is `serve.ts`'s whole job — and every field it is handed must
 * come from somewhere that RESOLVED it: a local the function computed, or a
 * `located` field the runtime actually writes. A bare `{}`, `[]` or `() => 0` is
 * a gate switched off in a way that reads as configuration.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* ------------------------------------------------------ what a gate reads --- */

/**
 * ⚠️ THE FIELD LIST IS THE KERNEL'S, READ FROM IT. Written out here it would be
 * a second copy that silently stops covering the ninth gate somebody adds —
 * which is this guard's own failure mode, one level up.
 */
const GATE = read("kernel/src/gate.ts");
const asked = GATE.match(/export interface Ask\s*\{([\s\S]*?)\n\}/)?.[1];
if (!asked) {
  fail("kernel/src/gate.ts: no `Ask` to read — this guard checks what a gate is handed, "
    + "and cannot find out what that is.");
}

const FIELDS = [...(asked ?? "").matchAll(/^\s*readonly\s+(\w+)\??\s*:/gm)].map((m) => m[1]);

/**
 * ⚠️ THREE FIELDS ARE NOT GATES AND SAYING SO IS THE POINT. `now` is the clock,
 * `catalog` is where refusals come from, and `workspace` is the NAME the refusal
 * is written with — none of them can withhold anything, so a constant in any of
 * them is not a gate switched off.
 */
const NOT_A_GATE = new Set(["now", "catalog", "workspace"]);

/* ------------------------------------------------- what the path hands it --- */

const SERVE = read("runtime/src/serve.ts");
/* ⚠️ THE ASK IS BUILT ONCE AND ASKED TWICE — for this request's own gate, and
   for what ELSE the caller could do (`mayCall`, which a screen reads before it
   draws a control). So the subject here is the BUILDER rather than the call: a
   guard pinned to `check({ … })` reported green about a literal that had moved
   into a closure a few lines up. */
const call = SERVE.match(/const askFor = \(spec: AnyOperation\): Ask => \(\{([\s\S]*?)\n\s*\}\);/)?.[1];
if (!call) {
  fail("runtime/src/serve.ts: no `askFor` to read.\n"
    + "       Every request ends in one gate call. If it has moved, move this with it — "
    + "a guard that cannot find its subject reports green about anything.");
}

/** ⚠️ Empty by construction — a gate handed one of these can only ever pass. */
const EMPTY = /^(\{\s*\}|\[\s*\]|\(\s*\)\s*=>\s*(0|false|\[\s*\]|\{\s*\}))$/;

/**
 * WHERE A `Located` IS BUILT, WHICH IS THE ONLY PLACE A FIELD CAN BE FILLED.
 *
 * ⚠️ SCOPED TO THE PRODUCER, NOT TO THE PACKAGE. Searching the whole runtime for
 * the field's name was this guard's first form and it did not fire on the defect
 * it was written for: `flags` appears in a manifest type, in the console and in
 * the gate call itself, so "is it written anywhere" answered yes about a field
 * nothing produced. The question is whether the LOCATOR fills it.
 *
 * ⚠️ AND A DEPLOYMENT WIRING ITS OWN `locate` DOES NOT COUNT. `locator` is the
 * platform's, used by every deployment and every test; a field only somebody
 * else could fill is a field that is empty until they remember, which is the
 * hole rather than the fix.
 */
const LOCATE = read("runtime/src/locate.ts");
const BUILT = LOCATE.slice(LOCATE.indexOf("return {"));

let inert = 0;
if (asked && call) {
  /* One `key: value` per line, which is how this call site is written. */
  const given = new Map();
  for (const [, key, value] of call.matchAll(/^\s*(\w+)\s*:\s*(.+?),?\s*$/gm)) {
    given.set(key, value.trim().replace(/,$/, ""));
  }

  for (const field of FIELDS) {
    if (NOT_A_GATE.has(field)) continue;
    const value = given.get(field);
    /* ⚠️ A SPREAD IS A CONDITIONAL FIELD and carries its own value with it. */
    if (value === undefined) {
      if (new RegExp(`\\b${field}\\b`).test(call)) continue;
      inert++;
      fail(`runtime/src/serve.ts: the gate reads \`${field}\` and the call site does not pass it.\n`
        + `       An absent field takes the kernel's default, which is the gate standing down —\n`
        + `       silently, on every request, with nothing anywhere to see.`);
      continue;
    }

    if (EMPTY.test(value)) {
      inert++;
      fail(`runtime/src/serve.ts: \`${field}\` is handed \`${value}\` — the gate cannot refuse.\n`
        + `       A constant here is a check that runs, reads a default and answers. There is no\n`
        + `       error and no failing test; the gate is correct and is being lied to.`);
      continue;
    }

    /*
      ⚠️ AND A `located.x ?? {}` IS ONLY HONEST IF SOMETHING WRITES `x`. This is
      the exact defect: `flags: located.flags ?? {}` where no deployment, and
      nothing in the runtime, ever set it. The fallback read as care for a
      deployment that had not configured one; it was the only value there had
      ever been.
    */
    const fallback = value.match(/^located\.(\w+)\s*\?\?\s*(.+)$/);
    if (fallback && EMPTY.test(fallback[2].trim())) {
      const writes = new RegExp(`^\\s*${fallback[1]}\\s*[,:]`, "m").test(BUILT);
      if (!writes) {
        inert++;
        fail(`runtime/src/serve.ts: \`${field}\` falls back to \`${fallback[2]}\`, and `
          + `\`locate.ts\` never fills \`${fallback[1]}\`.\n`
          + `       That is not a fallback — it is the only value the gate has ever had, on every\n`
          + `       request, in every product. The type checks and nothing fails.`);
      }
    }
  }
}

if (!inert) {
  ok(`gates: ${FIELDS.filter((f) => !NOT_A_GATE.has(f)).length} gate input(s), `
    + `every one of them resolved per request`);
}

console.log(bad
  ? `\ngates: ${bad} finding(s) — a check that runs, reads a default, and answers.`
  : `\ngates: nothing the kernel can refuse on is handed a constant.`);
process.exit(bad ? 1 : 0);
