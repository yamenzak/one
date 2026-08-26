/**
 * A SCREEN THAT IS NOT A DESTINATION IS REACHED FROM WHAT IT IS ABOUT.
 *
 * ⚠️ THE NAVIGATION IS FIVE, AND EVERYTHING ELSE HAS TO BE REACHED FROM
 * SOMEWHERE. A screen declaring `nav: "none"` is saying it belongs to a subject
 * — Receive to the shelf, Labels to the thing being labelled, Suppliers to the
 * product they supply. That is a claim about the app's own screens, and nothing
 * checks a claim.
 *
 * ⚠️ SO THE FAILURE IT CATCHES IS AN ORPHAN, WHICH IS SILENT IN EVERY OTHER
 * LANE. The route is declared, the container is mounted, the screen renders
 * perfectly at its address, every test is green — and no control in the product
 * leads to it. It is reachable by typing, which nobody does. Taking six screens
 * out of a bar in one commit is exactly when it happens, and it did.
 *
 * ⚠️ THE QUESTION IS ASKED OF EVERY APP, INCLUDING THE ONE ADDED TOMORROW.
 * `lib/trees.mjs` is the one walk, so app #3 is asked the day it is registered
 * rather than the day somebody remembers this file exists.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { appManifests } from "./lib/trees.mjs";

/** Every `.ts`/`.tsx` under a directory. */
const walk = (at) => {
  const out = [];
  for (const e of readdirSync(at, { withFileTypes: true })) {
    const full = join(at, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
};

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

/* ⚠️ Comments quote routes, so they are blanked before anything is matched —
   otherwise a paragraph explaining where a screen is reached from counts as
   reaching it, which is the exact prose this guard exists to stop trusting. */
const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

/**
 * ⚠️ A SCREEN THE CHROME ITSELF OFFERS IS ALREADY REACHED, AND NOT BY THE APP.
 * `chrome: "search"` is the crown's middle and `chrome: "assistant"` is a button
 * beside the notifications — the SHELL draws both from the declaration, so the
 * app naming its own route would be the second answer to where they live.
 */
const CHROMED = /chrome:\s*"(?:search|assistant)"/;

/**
 * WHAT ACTUALLY TAKES SOMEBODY THERE — a travel call, not a mention.
 *
 * ⚠️ NAMING A ROUTE IS NOT REACHING IT, AND THE FIRST VERSION OF THIS GUARD
 * COULD NOT TELL THE DIFFERENCE. Every container file carries the MOUNT TABLE
 * (`["/receive", RECEIVE(api)]`) and a title lookup, so every route in the
 * product appears in it as a string — and the check passed over an app whose
 * every control had been unwired. What reaches a screen is the router handoff
 * the shell hands down (`go`/`onGo`), so that is what is matched.
 *
 * ⚠️ EXACT, OR AS THE STEM OF A RECORD'S ADDRESS. A detail screen is travelled
 * to as `/thing/${id}` and never as the bare `/thing`, so an exact-only match
 * would report every one of them.
 */
const TRAVELS = (route) => new RegExp(
  `\\b(?:go|onGo|onOpen|onDo)\\(\\s*["'\`]${route.replace(/[/\\^$*+?.()|[\]{}]/g, "\\$&")}(?:["'\`/])`,
);

for (const [app, manifest] of appManifests()) {
  if (!existsSync(manifest)) continue;
  const src = strip(readFileSync(manifest, "utf8"));
  const block = /\n  screens: \[([\s\S]*?)\n  \],/.exec(src);
  if (!block) {
    fail(`reached: ${app} declares no screens block — this guard names its shape, `
      + `so a manifest that moved it would pass by finding nothing to check.`);
    continue;
  }

  /*
    ⚠️ ONE ENTRY AT A TIME, because `nav` and `route` are fields of the SAME
    object and a file-wide match would pair either with the other's neighbour.

    ⚠️ AND THE SPLIT IS BY BRACE BALANCE, NOT BY A REGEX, which is the second
    time that lesson has been paid for in this directory. `\{[^{}]*route:…\}`
    matches only an entry with nothing nested inside it — so the day a screen
    gained a `body`, it stopped being a screen as far as this guard was
    concerned, silently, one screen at a time. When the last one was ported the
    corpus went to nought and `guards.test.mjs` is what said so; before that it
    was a check quietly shrinking under a green tick.
  */
  const entries = [];
  for (let i = 0; i < block[1].length; i++) {
    if (block[1][i] !== "{") continue;
    let depth = 0;
    let end = i;
    for (let j = i; j < block[1].length; j++) {
      if (block[1][j] === "{") depth++;
      else if (block[1][j] === "}") { depth--; if (!depth) { end = j; break; } }
    }
    const whole = block[1].slice(i, end + 1);
    const route = /^\s*\{[^{}]*route:\s*"([^"]+)"/.exec(whole);
    if (route) entries.push([whole, route[1]]);
    i = end;
  }
  const folded = entries
    .filter(([whole]) => /nav:\s*"none"/.test(whole) && !CHROMED.test(whole))
    .map(([, route]) => route);

  if (!entries.length) {
    fail(`reached: ${app} declares no screens at all.`);
    continue;
  }

  /*
    ⚠️ THE APP'S OWN SOURCE, MINUS THE MANIFEST AND MINUS THE SPECIMEN BOARD. A
    route named only where it is DECLARED is named nowhere, which is the whole
    shape of the fault — and a route reached only from `./screens` is the same
    fault wearing a demo: that entry is a sample world for photographing screens
    and no customer loads it (`bundle.test.mjs`), so a row there leads nobody
    anywhere.

    ⚠️ THE EXPORT MAP IS WHAT SAYS WHICH FILE THAT IS, rather than a filename
    here. A guard holding its own idea of where a package's demo lives is a
    second answer to a question `package.json` already answers, and the day the
    file moves this check silently widens back.
  */
  const root = join(manifest, "..", "..");
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  /*
    ⚠️ AN APP WITH NO `./live` ENTRY HAS NO PRODUCT HALF, AND THE QUESTION IS
    NOT ASKED OF IT. That is the proving ground: its browser surface IS the
    board, so excluding the board would leave nothing to be reached FROM and
    every screen would report as an orphan — a check that cannot pass, which is
    the same uselessness as one that cannot fail. Said out loud rather than
    skipped in silence, because a corpus quietly one app smaller is the failure
    `lib/trees.mjs` exists to refuse.
  */
  if (!pkg.exports?.["./live"]) {
    ok(`${app}: a fixture with no product half — its board is its whole surface`);
    continue;
  }
  const board = pkg.exports?.["./screens"];
  const spare = new Set([manifest, ...(board ? [join(root, board)] : [])]);
  const from = walk(manifest.replace(/\/index\.ts$/, ""))
    .filter((f) => !spare.has(f))
    .map((f) => strip(readFileSync(f, "utf8")))
    .join("\n");

  /*
    ⚠️ AND A DECLARED BODY LEADS SOMEWHERE TOO, which this could not see. A
    ported screen's links are `goes: "<screen id>"` in the MANIFEST — the one
    file this walk deliberately excludes — so every route reached only from a
    declaration read as an orphan the moment its neighbour was ported. Measured,
    by porting one: deleting the product container took `/move`'s only link with
    it, and putting the link back as a `NavRow` did not satisfy this.

    ⚠️ IT IS THE SCREEN'S ID, NOT ITS ROUTE. `goes` names a screen and the shell
    turns it into an address (`Declared`), which is why a route typed in a
    manifest would be a second spelling of one it already holds.
  */
  /* ⚠️ BOTH FORMS OF `goes` — see `GoSpec`. The long one names the field that
     carries the id (`goes: { to: "kit", by: "kit" }`) and reading only the short
     one reported every row that used it as leading nowhere. */
  const led = new Set([
    ...[...block[1].matchAll(/goes:\s*"([^"]+)"/g)].map((m) => m[1]),
    ...[...block[1].matchAll(/goes:\s*\{[^{}]*to:\s*"([^"]+)"/g)].map((m) => m[1]),
    /* ⚠️ AND A ROW OF SHORTCUTS LEADS TOO — see `BlockSpec.leads`. Four
       destinations at once is still four things reached from a screen, and
       reading only `goes` reported every one of them as an orphan. */
    ...[...block[1].matchAll(/leads:\s*\[([^\]]*)\]/g)]
      .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])),
  ]);
  const idOf = new Map(entries
    .map(([whole, route]) => [route, /^\s*\{[^{}]*id:\s*"([^"]+)"/.exec(whole)?.[1] ?? ""]));

  const orphans = folded.filter((route) =>
    !TRAVELS(route).test(from) && !led.has(idOf.get(route) ?? ""));

  if (orphans.length) {
    fail(`reached: ${app} declares ${orphans.join(", ")} outside the navigation and `
      + `reaches ${orphans.length === 1 ? "it" : "them"} from nowhere.\n`
      + `       The screen renders at its address and no control in the product leads there, `
      + `which every other lane reports as green.`);
  } else {
    ok(`${app}: ${folded.length} screen(s) off the bar, every one of them reached from its subject`);
  }
}

console.log(bad
  ? `\nreached: ${bad} finding(s) — a screen only a typed address can open.`
  : `\nreached: everything off the bar is reached from what it is about.`);

process.exit(bad ? 1 : 0);
