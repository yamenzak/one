/**
 * WHAT EACH GUARD'S QUESTION BECOMES WHEN THE SCREEN IS A DECLARATION.
 *
 * @design every guard that sweeps a product says what happens to its question once the screen is declared, and only one of the five answers is "nothing".
 *
 * ⚠️ A PORTED SCREEN DOES NOT FAIL A GUARD. IT STOPS BEING ASKED. Forty-five
 * guards in this directory sweep product source, and almost every one of them
 * matches on something a `.tsx` contains — a `className`, a `<Card`, a bare
 * `fetch`, a `catch(() => [])`. A `body:` in a manifest contains none of those,
 * so the moment a screen becomes a declaration every one of those questions goes
 * unanswered for it. Nothing turns red. The corpus just gets smaller, one screen
 * at a time, and a guard printing `ok` over forty files looks exactly like a
 * guard printing `ok` over sixty.
 *
 * ⚠️ AND THAT IS THE FAILURE SHAPE THIS WHOLE REPOSITORY IS BUILT AGAINST — a
 * check that reports something narrower than the truth. `lib/trees.mjs` exists
 * because one directory move quietly took the proving ground out of twenty
 * sweeps at once. This is the same fault with a schedule attached: the port is
 * going to narrow every one of them, deliberately, over several stages.
 *
 * ⚠️ SO THE ANSWER IS WRITTEN DOWN PER GUARD, BEFORE THE PORT, and there are
 * five of them:
 *
 *   `refused: <code>`   the kernel refuses it — a declaration CAN express the
 *                       fault and `refuseSurface` says no. Checked: the code is
 *                       in the refusal union and a kernel test asserts it.
 *   `unrepresentable`   the grammar has no place for the fault at all. The
 *                       weakest of the five, because it rests on the grammar not
 *                       growing a hole later, so it must say what is missing.
 *   `reads`             the guard reads declarations itself. Checked: it imports
 *                       `lib/declared.mjs`.
 *   `elsewhere`         the question never depended on a screen being a FILE —
 *                       it is about the manifest, the runtime or the design
 *                       package, and a body lands inside what it already reads.
 *   `story`             about a story's CONTROLS, which stay in the app on
 *                       purpose (SURFACE.md S10).
 *
 * ⚠️ THE TWO THAT CANNOT BE CHECKED MECHANICALLY ARE `elsewhere` AND
 * `unrepresentable`, so both must say WHY in the same string. Each is a claim
 * that losing the app source costs this guard nothing, which only reading the
 * guard can settle — the clause is there so that saying it is a deliberate act
 * in a diff rather than a silence. `unrepresentable` is the weaker of the two,
 * because it also rests on the grammar not growing the hole later, and the
 * fifteen of them are the list stage 96 has to not violate.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { declaredScreens } from "./lib/declared.mjs";
import { appManifests } from "./lib/trees.mjs";
import { shippedStages } from "./lib/stages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (p) => readFileSync(join(ENGINE, p), "utf8");
const guards = JSON.parse(read("docs/guards.json")).guards;

/* ------------------------------------------------------- who sweeps an app --- */

/**
 * ⚠️ DETECTED RATHER THAN DECLARED, because a list of "guards that sweep a
 * product" maintained by hand is a list that goes stale the first time somebody
 * adds a sweep — and the guard that was just widened is exactly the one that
 * would be missing from it.
 */
const SWEEPS = /\bappDirs\b|\bappTrees\b|\bappManifests\b|["'`]ground\/src|["'`]one-space\/src/;

/*
  ⚠️ BY FILE, NOT BY ENTRY. A guard script holds several checks and the registry
  carries a row for each, so asking every ROW what its question becomes asks the
  same question of `metrics.test.mjs` twice and takes two answers. The sweep is a
  property of the file.
*/
const byImpl = new Map();
for (const g of guards) {
  if (!g.impl?.startsWith("scripts/") || !g.impl.endsWith(".mjs")) continue;
  if (g.status !== "live") continue;
  let src;
  try { src = read(g.impl); } catch { continue; }
  if (!SWEEPS.test(src)) continue;
  const held = byImpl.get(g.impl);
  if (!held) byImpl.set(g.impl, { impl: g.impl, becomes: g.becomes });
  else if (!held.becomes) held.becomes = g.becomes;
  else if (g.becomes && g.becomes !== held.becomes) {
    fail(`${g.impl}: two rows give it two different answers —\n`
      + `       "${held.becomes}"\n       and "${g.becomes}".\n`
      + `       A file has one question and one answer; put it on one row.`);
  }
}
const sweeping = [...byImpl.values()];

if (sweeping.length < 30) {
  fail(`only ${sweeping.length} guard(s) look like they sweep a product, which is fewer than\n`
    + `       this repository has ever had. The detector has probably stopped matching\n`
    + `       rather than the sweeps having stopped happening.`);
}

/* ----------------------------------------------------- the five answers --- */

const REFUSALS = new Set(
  [...read("kernel/src/surface.ts").matchAll(/"([a-z_]+)"(?=\s*(?:\||;|$))/gm)].map((m) => m[1]),
);
const ASSERTED = read("kernel/test/surface.test.ts");
const PLAIN = new Set(["unrepresentable", "reads", "elsewhere", "story"]);

let unclassified = 0;
const tally = {};
for (const g of sweeping) {
  const becomes = g.becomes;
  if (!becomes) {
    unclassified++;
    fail(`${g.impl}: sweeps a product and does not say what its question becomes.\n`
      + `       Add \`becomes\` to its entry in docs/guards.json — one of ${[...PLAIN].join(", ")}\n`
      + `       or "refused: <code>". A guard with no answer is one that will narrow in\n`
      + `       silence when the screens it reads become declarations.`);
    continue;
  }
  const head = becomes.split(":")[0].trim();
  tally[head] = (tally[head] ?? 0) + 1;

  if (head === "refused") {
    const code = becomes.slice(becomes.indexOf(":") + 1).trim();
    if (!REFUSALS.has(code)) {
      fail(`${g.impl}: claims the kernel refuses this as \`${code}\`, and \`refuseSurface\`\n`
        + `       emits no such code. A refusal that is not in the union is a promise the\n`
        + `       manifest never keeps.`);
      /* ⚠️ A WORD, NOT A SUBSTRING. `includes` reports a code as asserted when
         the only thing left in the file is a LONGER name containing it, which is
         exactly what a rename leaves behind — measured, by renaming one. */
    } else if (!new RegExp(`\\b${code}\\b`).test(ASSERTED)) {
      fail(`${g.impl}: claims \`${code}\`, which exists and which no kernel test asserts.\n`
        + `       An unasserted refusal is one that can be deleted by an edit nobody\n`
        + `       reviews — and this guard is standing down in favour of it.`);
    }
    continue;
  }
  if (head === "reads") {
    if (!read(g.impl).includes("lib/declared.mjs")) {
      fail(`${g.impl}: says it reads declarations and imports no reader.\n`
        + `       Import \`./lib/declared.mjs\`, or say what its question really becomes.`);
    }
    continue;
  }
  if (head === "unrepresentable" || head === "elsewhere") {
    if (becomes.length < head.length + 14) {
      fail(`${g.impl}: answers "${head}" and does not say why.\n`
        + `       Neither of these two can be checked mechanically, so each has to carry\n`
        + `       the clause: what the grammar has no room for, or where the question\n`
        + `       actually lives. The bare word is the answer that ages worst.`);
    }
    continue;
  }
  if (!PLAIN.has(head)) {
    fail(`${g.impl}: \`becomes\` is "${becomes}", which is not one of the five answers.`);
  }
}

if (!unclassified) {
  ok(`answered: every guard that sweeps a product says what its question becomes`
    + ` — ${sweeping.length} of them, `
    + `${Object.entries(tally).map(([k, n]) => `${n} ${k}`).join(", ")}`);
}

/* ------------------------------------------------------------ the census --- */

const screens = declaredScreens();
const kinds = { body: 0, story: 0, session: 0, written: 0 };
for (const s of screens) kinds[s.kind]++;

/*
  ⚠️ AND THE READER IS ASKED WHETHER IT CAN STILL SEE. Everything below rests on
  a text read of `screens: [` in each manifest, and a text read is the one kind
  of check that answers "none" rather than throwing when the shape it knows moves
  under it. An app contributing nothing is either an app with no screens — which
  no app in this repository is — or a reader that has gone blind, and the second
  is invisible from the number alone.
*/
let blind = 0;
for (const [app] of appManifests()) {
  if (!screens.some((s) => s.app === app)) {
    blind++;
    fail(`${app} declares a manifest and the reader found no screen in it.\n`
      + `       Either the app genuinely has none, or \`lib/declared.mjs\` has stopped\n`
      + `       matching how a screen is written — and the census cannot tell which.`);
  }
}
if (!blind) {
  ok(`seen: the reader finds a screen in every manifest — ${screens.length} across `
    + `${new Set(screens.map((s) => s.app)).size} app(s)`);
}

/**
 * ⚠️ THE COUNT IS THE PROGRESS BAR, AND IT IS ALSO THE ARMING PIN. While every
 * screen is still written, a guard marked `reads` is reading an empty list and
 * proving nothing — which is fine and temporary, and stops being fine the moment
 * the renderer ships. Stage 96 is what flips it: after that, a repository with
 * no declared body at all means the port stalled, and the guards that stood down
 * in favour of it are covering nothing on either side.
 */
const RENDERER = 96;
if (shippedStages().has(String(RENDERER)) && !kinds.body) {
  fail(`stage ${RENDERER} is shipped and not one screen is drawn from a declaration.\n`
    + `       ${tally.refused ?? 0} guard(s) have stood down in favour of a kernel refusal and\n`
    + `       ${tally.reads ?? 0} in favour of reading declarations. Both are reading nothing.`);
} else {
  ok(`census: ${kinds.body} screen(s) drawn from a body, ${kinds.story} from a story, `
    + `${kinds.session} from a session, `
    + `${kinds.written} still written`);
}

/**
 * HOW MANY SCREENS ARE STILL HAND-WRITTEN, AND IT MAY ONLY GO DOWN.
 *
 * ⚠️ A PORT WITH NO RATCHET IS A PORT THAT STALLS AT WHATEVER IS COMFORTABLE.
 * Stage 96 proved a screen can be declared; stage 98 is where a written one
 * becomes a failure. Between those two the count is the only thing standing
 * between "the arc is proceeding" and "one screen was declared and everybody
 * moved on", and a number nobody is asked to edit reports both identically.
 *
 * ⚠️ IT FAILS IN BOTH DIRECTIONS, WHICH IS WHAT MAKES IT A RATCHET RATHER THAN A
 * REMINDER. Over the ceiling means a screen was written by hand that should have
 * been declared — including a genuinely new one, which is the case worth
 * catching, since a product mid-port growing hand-written screens is the port
 * losing. Under it means somebody ported one and did not tighten the number, so
 * the next regression is absorbed in silence instead of being reported.
 */
const WRITTEN_MOST = 9;
if (kinds.written > WRITTEN_MOST) {
  fail(`${kinds.written} screen(s) are still written by hand, over the ${WRITTEN_MOST} ceiling.\n`
    + `       A new hand-written screen during the port is the port losing ground. Declare\n`
    + `       it as a body, a story or a session, or raise this deliberately with the reason.`);
} else if (kinds.written < WRITTEN_MOST) {
  fail(`${kinds.written} screen(s) are still written by hand, under the ${WRITTEN_MOST} ceiling.\n`
    + `       Tighten it to ${kinds.written} in the commit that ported one — a ceiling left\n`
    + `       above the count absorbs the next regression instead of reporting it.`);
} else {
  ok(`ratchet: ${kinds.written} screen(s) still written, at the ceiling and falling`);
}

console.log(bad
  ? `\ncensus: ${bad} finding(s) — a question that stops being asked is not a question answered.`
  : `\ncensus: every guard that sweeps a product says what happens to it when the screen is declared.`);
process.exit(bad ? 1 : 0);
