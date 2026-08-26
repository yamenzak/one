/**
 * A PRODUCT'S SCREEN IS A DECLARATION, OR IT SAYS WHY IT IS NOT.
 *
 * @design every screen a customer opens is drawn from the manifest, and the ones that are not are named with what the grammar cannot express.
 *
 * ⚠️ THIS IS THE DOOR CLOSING, AND IT CLOSES ONE NAME AT A TIME. The arc's whole
 * claim is that a product contributes declarations rather than React: the
 * kernel refuses a body that does not compose, the runtime answers the rows, the
 * renderer draws them, and the app's browser half becomes a chunk nothing asks
 * for. What stood between that and reality was nothing at all — a product could
 * add a hand-written screen on any afternoon and every check in this directory
 * would report `ok`, because a `.tsx` is exactly what they are built to read.
 *
 * ⚠️ THE LIST IS THE FEATURE, AND IT MAY ONLY SHRINK. Some screens genuinely
 * cannot be declared today: a camera, a scanning session, a report whose numbers
 * are arithmetic over a period. Refusing those outright would mean either
 * blocking the stage on a query language nobody has designed, or pretending a
 * declaration exists that does not. Naming them, with what is missing, makes the
 * gap a thing somebody reads rather than a silence — and an entry that becomes
 * declarable fails HERE until it is deleted, so the list cannot rot into a
 * permanent exemption. That shape is `KNOWN_UNENFORCED`'s, one repository over,
 * and it is the only kind of allow-list this codebase keeps.
 *
 * ⚠️ AND THE PROVING GROUND IS OUTSIDE THIS, DELIBERATELY. `engine/ground` is
 * the fixture that proves the COMPONENTS a declaration is composed out of — most
 * of the design system is drawn in its screens, and a corpus that only ever
 * exercised the renderer could not tell a broken block from a renderer that
 * never asked for it. It is not served (`fixture.test.mjs`), so its screens are
 * not screens a customer opens; this guard reads `products()` for that reason
 * and not because the ground is behind.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { declaredScreens } from "./lib/declared.mjs";
import { products } from "./lib/trees.mjs";

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/**
 * WHAT A SCREEN STILL WRITTEN BY HAND IS WAITING FOR — keyed `<app>:<screen>`.
 *
 * ⚠️ EACH REASON NAMES WHAT THE GRAMMAR HAS NO ROOM FOR, not what the screen
 * does. "It is complicated" is not a reason; "a view cannot compute a value
 * against a setting" is, because it is a sentence somebody can act on and a
 * claim that stops being true the day the vocabulary grows.
 *
 * ⚠️ AND WHAT IS LEFT IS ONE FAMILY, WHICH IS THE LIST DOING ITS JOB. It held
 * three: a device the browser drives, a SESSION somebody is inside, and
 * ARITHMETIC the rows do not carry. The first two were not waiting on anything —
 * they were waiting on somebody noticing that a place where work HAPPENS is a
 * third kind of screen, beside a page that is read and a flow that is walked, and
 * `SessionSpec` is that. What remains is arithmetic: a total over a period a
 * person picks, a figure over a whole workspace, prose about the product, and an
 * answer that arrives in pieces.
 */
const NOT_YET = new Map([
  ["inventory:home", "figures over the whole workspace beside three counts, which is the reports gap on a smaller screen"],
  ["inventory:start", "the ladder explained and the questions asked in the first week, which are prose about the product rather than its rows"],
]);

const screens = declaredScreens().filter((s) => products().includes(s.app));
if (!screens.length) {
  fail("private-ui: no product declares a screen, which no product in this repository does.\n"
    + "       The reader has probably stopped matching rather than the screens having gone.");
}

/* ------------------------------------------------------- what is written --- */

const written = screens.filter((s) => s.kind === "written");
for (const s of written) {
  const key = `${s.app}:${s.id}`;
  const why = NOT_YET.get(key);
  if (!why) {
    fail(`private-ui: ${key} is written by hand and says nothing about why.\n`
      + `       Declare it as a body, a story or a session, or add it to NOT_YET with\n`
      + `       grammar cannot express — a screen nobody wrote a reason for is the\n`
      + `       port losing ground on an afternoon nobody reviewed.`);
    continue;
  }
  /* ⚠️ A REASON THAT IS A LABEL IS NOT A REASON — the same rule an operation's
     stated silence follows. "Complicated" would satisfy a presence check and
     tell the next reader nothing about what is missing. */
  if (why.trim().length < 40) {
    fail(`private-ui: ${key} is exempt for "${why}", which is a label rather than a reason.\n`
      + `       Say what the grammar has no room for. This entry is the only place\n`
      + `       anybody will read it.`);
  }
}

/* ------------------------------------------- and the list may only shrink --- */

const declared = new Map(screens.map((s) => [`${s.app}:${s.id}`, s.kind]));
for (const [key] of NOT_YET) {
  const kind = declared.get(key);
  if (kind === undefined) {
    fail(`private-ui: NOT_YET names ${key}, which no product declares.\n`
      + `       A reason for a screen that does not exist is an exemption covering\n`
      + `       nothing, and it hides the day the real one is added back.`);
  } else if (kind !== "written") {
    fail(`private-ui: ${key} is drawn from a ${kind} now, and NOT_YET still excuses it.\n`
      + `       Delete the entry. A list that keeps its entries after they stop being\n`
      + `       true is how an exemption becomes permanent.`);
  }
}

/* ---------------------------------------- and a declared screen has no mount --- */

/**
 * ⚠️ A DECLARED SCREEN'S CONTAINER IS DEAD CODE THAT LOOKS ALIVE, and it is the
 * exact residue a port leaves. `AppSurface` draws a body ahead of any mount — the
 * order is what makes porting a deletion — so a registration for a screen the
 * manifest declares is a fetcher, a shaper and a component nothing ever reaches.
 * It typechecks, it is imported, and every reader takes it for the live one.
 *
 * ⚠️ AND THE ORDER IS WHY THIS HAS TO BE CHECKED RATHER THAN NOTICED. The
 * alternative order — a mount winning over the declaration it replaced — is the
 * failure `AppSurface`'s own header rejects: the screen would go on looking
 * correct while the manifest said something else. Having chosen the safe order,
 * nothing anywhere reports that the loser is still there.
 */
const MOUNTS = /\[\s*"(\/[^"]*)"\s*,/g;
for (const app of products()) {
  let src;
  try { src = readFileSync(`${dirname(fileURLToPath(import.meta.url))}/../apps/${app}/src/screens/live.tsx`, "utf8"); }
  catch { continue; }
  const bodied = new Map(screens
    .filter((s) => s.app === app && s.kind === "body" && s.route)
    .map((s) => [s.route, s.id]));
  for (const m of src.matchAll(MOUNTS)) {
    const id = bodied.get(m[1]);
    if (!id) continue;
    fail(`private-ui: ${app} mounts a component at "${m[1]}", and the manifest draws\n`
      + `       ${app}:${id} from its own body. A declared body outranks a mount, so that\n`
      + `       container is a fetcher and a component nothing ever reaches — delete it.\n`
      + `       Porting a screen IS the deletion; leaving the loser behind is the residue.`);
  }
}

/* --------------------------------------------------------------- the count --- */

const by = { body: 0, story: 0, session: 0, written: 0 };
for (const s of screens) by[s.kind]++;

if (!bad) {
  ok(`declared: ${by.body} product screen(s) drawn from a body, ${by.story} from a story, `
    + `${by.session} from a session`);
  ok(`waiting: ${by.written} still written, every one of them saying what it waits for`);
}

/*
  ⚠️ AND THE STAGE THAT CLOSES THIS IS NAMED HERE. `NOT_YET` empty is the whole
  of stage 98: no product screen is a file, the browser half of every app is a
  chunk nothing requests, and this guard becomes a check that a list is empty.
  Saying so in the passing output is what stops the list looking like furniture.
*/
console.log(bad
  ? `\nprivate-ui: ${bad} finding(s) — a hand-written screen is a declaration nobody had to make.`
  : `\nprivate-ui: every product screen is declared or says what it waits for`
    + ` — ${NOT_YET.size} waiting, and the door closes when that is nought.`);
process.exit(bad ? 1 : 0);
