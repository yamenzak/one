/**
 * ONE PAGE, ONE THING (D12, DESIGN.md §3).
 *
 * ⚠️ THE RULE HAD BEEN WRITTEN DOWN FOR MONTHS AND WAS BROKEN BY THE SURFACE
 * THAT MOST NEEDED IT. §3 asks what a control CHANGES and answers that a screen
 * where one changes a price, one changes a person's access and one changes a
 * colour is three screens — and the generated settings screen put a switch, a
 * colour and an email address in one scroll under three headings somebody had
 * typed into a free-text `group`. A prose rule cannot fail; this can.
 *
 * ⚠️ THE FIX IS IN THE DECLARATION, WHICH IS WHY THIS CHECKS DECLARATIONS. An
 * area is a destination: it has an id, a mark, a line saying what is behind it
 * and an explicit order. A `group` string could not be navigated to, could not
 * be marked, and reordered itself when a setting was added.
 *
 * ⚠️ AND A LEVEL IS AN AUTHORITY, SO IT IS A SCREEN. What a workspace is set to
 * and what one person prefers are two operations done by different people with
 * different consequences — §3's first question. Rendered as two tabs, the
 * screen's permission had to cover both, so a member with no workspace
 * authority could not reach their own preferences.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);

const read = (p) => readFileSync(join(ENGINE, p), "utf8");

/* ------------------------------------------------------------- declared --- */

const kernel = read("kernel/src/setting.ts");

/*
  ⚠️ ALL FOUR, OR IT IS A HEADING AGAIN. Drop the icon and the list is a menu of
  words; drop `said` and somebody has to open a page to find out what is on it;
  drop `order` and adding a setting moves a page; drop the id and it cannot be an
  address.
*/
const NEEDED = ["id", "label", "icon", "said", "order"];
const areaDef = kernel.match(/export interface AreaDef \{([\s\S]*?)\n\}/)?.[1] ?? "";
const missing = NEEDED.filter((f) => !new RegExp(`\\breadonly ${f}[?]?:`).test(areaDef));

if (missing.length) {
  fail(`declared: AreaDef has no ${missing.join(", ")} — a settings page you cannot navigate to, mark, or explain is a heading with extra steps`);
} else if (/readonly order\?:/.test(areaDef)) {
  fail("declared: AreaDef.order is optional, so page order falls back to declaration order and adding a setting moves a page somebody had learnt the position of");
} else {
  ok("declared: an area is a destination — id, label, mark, what is behind it, and an order");
}

/*
  ⚠️ AND BOTH WAYS OF GETTING IT WRONG ARE SILENT. A setting naming an area
  nothing declares would render under a heading created by a typo; a declared
  area nothing uses is a row that opens onto an empty page, and the first person
  to find out is whoever taps it.
*/
if (/"unknown_area"/.test(kernel) && /"area_without_settings"/.test(kernel)) {
  ok("declared: a page that does not exist and a page with nothing on it are both refused");
} else {
  fail("declared: an area can be named without existing, or declared without being used — a heading made by a typo, and a nav row onto an empty page");
}

/* --------------------------------------------------------------- descend --- */

const surface = read("design/src/rendered/settings.tsx");

/*
  ⚠️ IT DESCENDS THROUGH `Whichever`, WHICH IS ALSO WHERE THE STAND-DOWN LIVES:
  one area IS the screen, because nobody pays a tap for a menu with one item on
  it. Writing the branch here by hand is how three screens came to implement the
  same four cases and get two of them wrong.
*/
if (/<Whichever/.test(surface) && /areasOn\(book, areas, level\)/.test(surface)) {
  ok("descend: a level lists its pages and opens one, and a single page is the screen");
} else {
  fail("descend: the settings surface renders every area at once again — a filing cabinet of every row an app declares, which is what DESIGN.md §3 refuses");
}

/*
  ⚠️ ONE LEVEL PER SCREEN. Two levels in one render is the cram this replaced,
  and a control bar over it does not make it two places.
*/
const settingsSurfaces = [
  "design/src/rendered/settings.tsx",
  "one-hub/src/centre/SettingsArea.tsx",
  "apps/hello/src/screens/Settings.tsx",
];
const crammed = settingsSurfaces.filter((f) => {
  const src = read(f);
  return /level="tenant"/.test(src) && /level="person"/.test(src);
});

if (crammed.length) {
  fail(`levels: ${crammed.join(", ")} render both authorities on one screen — a preference inside an administration surface, which also puts it behind whatever permission guards the screen`);
} else {
  ok("levels: a workspace's settings and a person's preferences are two destinations");
}

/*
  ⚠️ AND THE PERSONAL ONE IS REACHABLE. Splitting them and then linking only the
  workspace's leaves the preferences at an address nobody can find — which is the
  same failure as not splitting them, with more code.
*/
const hubScreens = readdirSync(join(ENGINE, "one-hub/src/hub")).filter((f) => f.endsWith(".tsx"));
const reachable = hubScreens.some((f) => /at: "prefs"/.test(read(`one-hub/src/hub/${f}`)));

if (reachable) {
  /* ⚠️ THE COUNT IS PART OF THE CLAIM — a walk that found nothing and a walk
     that looked at nothing print the same sentence without it. */
  ok(`levels: your own preferences are offered in one of ${hubScreens.length} hub screen(s)`);
} else {
  fail("levels: nothing links to your own preferences, so splitting them off left them at an address only somebody who knew it could reach");
}

console.log(bad ? `\ndescend: ${bad} problem(s).` : "\ndescend: green.");
process.exit(bad ? 1 : 0);
