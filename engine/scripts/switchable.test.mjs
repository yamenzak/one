/**
 * A SWITCH A WORKSPACE PRESSES CHANGES WHAT AN OPERATION DOES.
 *
 * @design the AI switch is asked at the seam every generation goes through, on both paths.
 *
 * ⚠️ THE FAILURE THIS REFUSES IS A CONTROL THAT ONLY HIDES A BUTTON. A screen
 * that draws no button leaves the operation answering on the HTTP door, through
 * MCP, and to a queued write replaying after a day offline — so the workspace's
 * decision holds in the one place nobody was trying to get around, and nowhere
 * else. BUILDING.md §2 calls this the surfaced-but-not-enforced half, and it is
 * worse than an absent feature because people stop looking for the thing it
 * promised.
 *
 * ⚠️ AND THERE ARE TWO GENERATION PATHS, WHICH IS THE WHOLE REASON THIS IS A
 * GUARD. `generatorFor` and `streamerFor` are the same run in two shapes, and a
 * rule applied to one of them is a rule a caller escapes by asking for a stream.
 * `metering.test.mjs` already asks both functions the same questions about the
 * money for exactly this reason; this asks them about the switch.
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
    fail(`switchable: ${where} does not exist — this guard names it.`);
    return "";
  }
  return readFileSync(at, "utf8");
};

/* ------------------------------------------------------------ both paths --- */

/**
 * ⚠️ THE BODY OF EACH FUNCTION, NOT THE FILE. A file-wide match passes on a
 * check that exists in one path and not the other, which is exactly the failure
 * — so each function is cut out and asked separately.
 */
const bodyOf = (src, name) => {
  const at = src.indexOf(`export function ${name}(`);
  if (at < 0) return null;
  const next = src.indexOf("\nexport ", at + 1);
  return src.slice(at, next < 0 ? src.length : next);
};

{
  const run = read("runtime/src/ai-run.ts");
  let found = 0;
  for (const name of ["generatorFor", "streamerFor"]) {
    const body = bodyOf(run, name);
    if (!body) {
      fail(`switchable: \`${name}\` is not in runtime/src/ai-run.ts — this guard names it.`);
      continue;
    }
    /* ⚠️ THE CALL WITH ITS ARGUMENTS, not the identifier (§5.6). A bare
       `switchedOff` appears in the import line and in every comment about it. */
    if (/switchedOff\(\s*at\.db\s*,\s*at\.tenantId\s*,\s*at\.app\.id\s*\)/.test(body)) {
      found++;
    } else {
      fail(`switchable: \`${name}\` does not ask whether the action is switched off.\n`
        + "       A workspace turning a feature off would still have it run on this path —\n"
        + "       and a caller escapes the rule by asking for the other shape of the same run.");
    }
  }
  if (found === 2) ok("asked: both generation paths consult the switch");
}

/* ------------------------------------------------- the declaration decides --- */

/*
  ⚠️ THE TABLE IS NOT THE AUTHORITY, THE DECLARATION IS. A row written before an
  app changed its mind must not still be in force, so the check is guarded on
  `optional` — and without that guard an app removing `optional` would leave
  every existing row silently switching off an action that is now essential.
*/
{
  const run = read("runtime/src/ai-run.ts");
  const guarded = (run.match(/action\.ai\.optional\s*\n?\s*&&\s*\(await switchedOff/g) ?? []).length;
  if (guarded === 2) {
    ok("declared: the switch only applies where the app said it may");
  } else {
    fail("switchable: a generation path consults the switch without asking whether the\n"
      + "       action is `optional`. The declaration decides, not the table — otherwise a\n"
      + "       row written before an app changed its mind still switches off an action\n"
      + "       that is now what the feature does.");
  }
}

/* ------------------------------------------------------- refused at the write --- */

/*
  ⚠️ AND THE WRITE REFUSES TOO, because a request naming a non-optional action is
  somebody reaching past a control that was never drawn — through the API,
  through MCP, or through a form left open while the product changed its mind.
*/
{
  const ops = read("runtime/src/ai-ops.ts");
  if (/action\.ai\.optional\s*!==\s*true/.test(ops)) {
    ok("refused: the switch write turns down an action that is not optional");
  } else {
    fail("switchable: `ai.switch` no longer refuses an action the app did not mark\n"
      + "       `optional`. The only thing then standing between a caller and switching off\n"
      + "       a product's core action is a control the screen chose not to draw.");
  }
}

/* -------------------------------------------------------- one of each here --- */

/*
  ⚠️ THE REFERENCE APP HOLDS AN INSTANCE OF BOTH, and BUILDING.md §6 step 3 is
  why: a branch with no instance in the ground is a branch no test can reach, and
  every app copied out of it inherits the same silence. `refusePolicy`'s sharpest
  branch was unexercised for exactly this reason.
*/
{
  const ground = read("ground/src/index.ts");
  const actions = (ground.match(/\n\s*ai:\s*\{/g) ?? []).length;
  const optional = (ground.match(/\n\s*optional:\s*true\s*,/g) ?? []).length;
  if (actions >= 2 && optional >= 1 && optional < actions) {
    ok(`instanced: the ground declares ${actions} actions, ${optional} switchable`);
  } else {
    fail("switchable: the ground must declare at least one AI action a workspace may\n"
      + "       switch off and at least one it may not.\n"
      + `       It has ${actions} action(s), ${optional} of them optional — so one of the two\n`
      + "       branches has no instance, and no test anywhere can reach it.");
  }
}

console.log("\nswitchable: a switch a workspace presses changes what an operation does.");
process.exit(bad ? 1 : 0);
