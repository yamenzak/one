/**
 * A LANE AN APP MAY DECLARE IS A LANE SOMETHING CAN ACTUALLY CALL.
 *
 * @design every lane either has a runner or carries a marker naming the stage that will give it one.
 *
 * ⚠️ THE GAP THIS CLOSES WAS INVISIBLE TO EVERY OTHER CHECK, because every other
 * check is about the CATALOGUE. Models answer the lane, `refuseCatalogue` finds
 * them, an operator switches one on, the console reports the lane healthy,
 * composition passes and the meter prices it — and the request then reaches an
 * endpoint that cannot do the job. Four of six lanes were in that state, and no
 * suite could see it because no app declared one.
 *
 * ⚠️ SO THE QUESTION IS ASKED OF THE UNION ITSELF, WHICH IS THE ONLY PLACE IT
 * STAYS COMPLETE. A check over the apps would pass on a deployment whose apps
 * happen to use two lanes, and start failing years later when somebody declares
 * a third — reported as their mistake rather than as the platform's absence.
 *
 * ⚠️ AND A LANE MAY BE ABSENT ON PURPOSE. `listen` was correctly deferred long
 * before this guard existed: metered by the second, and a caller holds bytes. A
 * marker naming a stage is the way to say so, so this refuses SILENCE rather
 * than absence — the same bargain `capability.test.mjs` already strikes.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (where) => {
  const at = join(ENGINE, where);
  if (!existsSync(at)) {
    fail(`lanes: ${where} does not exist — this guard names it.`);
    return "";
  }
  return readFileSync(at, "utf8");
};

const ai = read("kernel/src/ai.ts");

/* ------------------------------------------------------- the two lists --- */

const listIn = (name) => {
  const m = ai.match(new RegExp(`export const ${name}: readonly Lane\\[\\] = \\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/"([a-z]+)"/g)].map((x) => x[1]) : null;
};

const lanes = listIn("LANES");
const runnable = listIn("RUNNABLE");

if (!lanes) {
  fail("lanes: `LANES` is not a readable list in kernel/src/ai.ts — this guard reads it as text.");
}
if (!runnable) {
  fail("lanes: `RUNNABLE` is missing from kernel/src/ai.ts.\n"
    + "       Without it a lane with a catalogue and no runner composes, prices and\n"
    + "       fails at the first call, and nothing anywhere goes red.");
}

if (lanes && runnable) {
  ok(`shape: ${lanes.length} lane(s) declared, ${runnable.length} with a runner`);

  /* ⚠️ A NAME IN `RUNNABLE` THAT IS NOT A LANE is a lane somebody renamed and
     half-updated: the union moved, this list kept the old spelling, and the
     refusal below then rejects the real lane while admitting nothing. */
  for (const name of runnable) {
    if (!lanes.includes(name)) {
      fail(`lanes: RUNNABLE names "${name}", which is not a lane.\n`
        + "       A stale name here refuses the lane that replaced it.");
    }
  }

  /*
    ⚠️ THE ONE THAT MATTERS. A lane in neither list-with-a-runner nor a marker is
    a promise the type makes and nothing keeps.
  */
  /*
    ⚠️ AN EXPLICIT TAG, NOT PROXIMITY. The first version of this matched a marker
    within 600 characters of the lane's name and passed `image` and `speech` on
    the strength of sitting near `listen`'s — two unrunnable lanes reported as
    deliberate because a third one nearby was. A deferral has to NAME what it
    defers, or it is a marker that covers whatever happens to be beside it.
  */
  for (const lane of lanes) {
    if (runnable.includes(lane)) continue;
    const marked = new RegExp(`DEFER\\(engine-\\d+\\)[^\\n]*\\blane:${lane}\\b`).test(ai);
    if (!marked) {
      fail(`lanes: "${lane}" is a lane an app may declare, has no runner, and says nothing.\n`
        + "       Either give it a runner and add it to RUNNABLE, or mark it with a\n"
        + "       DEFER(engine-N) naming the stage that will — a lane that is silently\n"
        + "       absent composes, prices, and fails at the first call.");
    }
  }
  if (!bad) ok("runner: every lane either runs or names the stage that will make it run");
}

/* --------------------------------------------------- refused, not hoped --- */

/*
  ⚠️ THE LIST IS ONLY A LIST UNTIL SOMETHING READS IT, AND THIS CHECK IS
  DELIBERATELY NOT THE ONE THAT PROVES SO. A text match for
  `RUNNABLE.includes(ai.lane)` passed a mutation that put `false &&` in front of
  it — the identifier survives every way of disabling the branch it is in, which
  is BUILDING.md §5.6's rule about anchoring to an identifier rather than to
  something as it executes.

  ⚠️ SO THE BEHAVIOUR IS ASSERTED WHERE BEHAVIOUR BELONGS — `kernel/test/ai.test.ts`
  calls `refuseApp` with an unrunnable lane and requires a refusal, which no edit
  to the branch can satisfy without actually refusing. What is left here is the
  SHAPE question a unit test cannot ask: that the caller exists at all, so its
  deletion is caught by this guard rather than by the absence of a test nobody
  notices is gone.
*/
{
  const manifest = read("kernel/src/manifest.ts");
  if (/\bRUNNABLE\b/.test(manifest)) {
    ok("refused: composition still reads RUNNABLE (behaviour proved in kernel/test/ai.test.ts)");
  } else {
    fail("lanes: `kernel/src/manifest.ts` no longer mentions RUNNABLE at all.\n"
      + "       The list is then a comment: an app declares an unrunnable lane, every\n"
      + "       suite is green, and the failure arrives at a customer's first call.");
  }
}

console.log("\nlanes: a lane an app may declare is a lane something can call.");
process.exit(bad ? 1 : 0);
