/**
 * A SCREEN NAMES A SHAPE, AND EVERYTHING ELSE FOLLOWS FROM IT.
 *
 * ⚠️ THE FAULT THIS GUARDS AGAINST IS THE ONE THE PRESET SYSTEM EXISTS FOR, AND
 * IT COMES BACK BY ADDITION RATHER THAN BY EDIT. Nobody rewrites a screen to
 * hand-build its layout again; somebody writes the TWENTY-FIRST screen, does not
 * know `Screen` is there, assembles a crown and a stack the way the twenty
 * before it looked, and gets four of the five decisions right. The product
 * drifts one screen at a time and no diff is wrong.
 *
 * ⚠️ SO WHAT IS CHECKED IS STRUCTURAL, NOT AESTHETIC. Whether a screen is
 * beautiful is not a question a script can ask. Whether it draws its own crown,
 * pins its own action, or claims two primaries at once are all the same question
 * with an answer — and each is the exact shape of a real regression:
 *
 *   OWN CROWN     a screen rendering `PageCrown` itself has taken over the one
 *                 decision the router makes, so its title and its way back are
 *                 its own to get wrong.
 *   OWN DOCK      a `sticky bottom-` control in a screen is a second answer to
 *                 where the primary action goes, beside the shape's.
 *   TWO PRIMARIES a screen with two `does` is two screens (DESIGN.md §1).
 *   SETTINGS ACT  a `settings` screen with an action is one where half the
 *                 controls save themselves and half do not.
 *
 * ⚠️ AND THE VOCABULARY ITSELF IS EXEMPT BY NAME, not by pattern. `screen.tsx`
 * and `layout.tsx` are where the crown and the dock are DEFINED; an exemption
 * matched by a wildcard is one a new file can wander into.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const filesIn = (dir, re = /\.tsx$/) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (re.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/** ⚠️ Comments describe the rules, so matching them reports the rule as a breach. */
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * ⚠️ THE TWO FILES THAT DEFINE THE CHROME, BY NAME. `screen.tsx` places the
 * crown and the dock; `layout.tsx` draws them. Everything else is a caller.
 */
const DEFINES_CHROME = new Set(["design/src/frame/screen.tsx", "design/src/frame/layout.tsx"]);

/**
 * ⚠️ THE SURFACES THAT ARE NOT SCREENS, AND EACH IS EXEMPT FOR A STATED REASON.
 * A door is its own page with no router above it and no way back; the gallery
 * is a specimen board that draws chrome on purpose to show it. Neither is a
 * screen inside a routed surface, which is what the rules below are about.
 */
const NOT_A_SCREEN = new Set([
  "one-hub/src/screens/SignIn.tsx",
  "one-hub/src/screens/Signpost.tsx",
  "one-hub/src/screens/NewWorkspace.tsx",
  "one-hub/src/screens/Elsewhere.tsx",
  "one-hub/src/screens/Gallery.tsx",
  "one-hub/src/screens/Specimens.tsx",
  "one-hub/src/App.tsx",
  "one-hub/src/hub/Hub.tsx",
  "one-hub/src/centre/AppSurface.tsx",
  "one-hub/src/centre/Product.tsx",
  "one-hub/src/centre/Choose.tsx",
]);

const SCREENS = [
  ...filesIn("one-hub/src"),
  ...readdirSync(join(ENGINE, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .flatMap((e) => filesIn(`apps/${e.name}/src`)),
].filter((f) => !NOT_A_SCREEN.has(rel(f)));

/* ------------------------------------------------------- nobody crowns itself --- */

let crowns = 0;
for (const file of SCREENS) {
  const src = strip(readFileSync(file, "utf8"));
  if (!/<PageCrown\b/.test(src)) continue;
  crowns++;
  fail(`${rel(file)}: draws its own <PageCrown>.\n`
    + `       The title and the way back are properties of the ADDRESS, not of the\n`
    + `       screen — a router already knows both. Name a \`shape\` on \`Screen\`\n`
    + `       and let \`Framed\` supply them (@engine/design's screen.tsx).`);
}
if (!crowns) ok(`crown: no screen draws its own`);

/* ------------------------------------------------------------- nobody docks --- */

let docks = 0;
for (const file of SCREENS) {
  const src = strip(readFileSync(file, "utf8"));
  for (const [, cls] of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    if (!/\bsticky\b/.test(cls ?? "") || !/\bbottom-0\b/.test(cls ?? "")) continue;
    docks++;
    fail(`${rel(file)}: pins its own control to the bottom.\n`
      + `       Where the primary action goes is the SHAPE's decision and it differs\n`
      + `       by breakpoint — docked on a phone, in the crown on a desktop. Two\n`
      + `       answers is how a screen comes to show the same button twice.`);
  }
}
if (!docks) ok(`dock: no screen pins its own action`);

/**
 * ⚠️ FINDING WHERE AN OPENING TAG ENDS NEEDS A SCANNER, NOT `indexOf(">")`, and
 * the naive version passed its own mutation test while missing the case it was
 * written for. `does={{ label: "A", onDo: () => undefined }}` contains a `>` —
 * inside an arrow, inside a brace, inside the attribute — so the "head" the
 * check read was eleven characters long and every attribute after it invisible.
 * A guard that cannot see the thing it forbids is worse than no guard, because
 * the green run is taken as evidence.
 */
const openingTag = (src, from) => {
  let depth = 0, quote = "";
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (quote) { if (c === quote && src[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'" || c === "`") { quote = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
};

/* ------------------------------------------------------------ one primary --- */

let doubles = 0;
for (const file of SCREENS) {
  const src = strip(readFileSync(file, "utf8"));
  /* ⚠️ Per `<Screen` element, not per file: a file may legitimately hold two
     screens (a picker and the thing it picks), and each gets one action. */
  for (const at of [...src.matchAll(/<Screen\b/g)].map((m) => m.index)) {
    const head = openingTag(src, at);
    const count = (head.match(/\bdoes=/g) ?? []).length;
    if (count <= 1) continue;
    doubles++;
    fail(`${rel(file)}: a <Screen> with ${count} primary actions.\n`
      + `       A page with two things it is for is two pages (DESIGN.md §1). The\n`
      + `       edit is a second screen or a sheet, never a second \`does\`.`);
  }
}
if (!doubles) ok(`primary: every screen has at most one`);

/* ------------------------------------------------- a settings screen saves --- */

let saves = 0;
for (const file of SCREENS) {
  const src = strip(readFileSync(file, "utf8"));
  for (const at of [...src.matchAll(/<Screen\b/g)].map((m) => m.index)) {
    const head = openingTag(src, at);
    if (!/shape="settings"/.test(head) || !/\bdoes=/.test(head)) continue;
    saves++;
    fail(`${rel(file)}: a "settings" screen with a primary action.\n`
      + `       Every control on a settings screen saves itself the moment it\n`
      + `       changes. A Save button beside them makes it a screen where half do\n`
      + `       and half do not, and nobody can tell which by looking.`);
  }
}
if (!saves) ok(`settings: none carries a save`);

/* ----------------------------------------------------------- no hairlines --- */

/**
 * ⚠️ A BREAK BETWEEN TWO RUNS IS A SECOND CARD, NEVER A LINE. Rows in a card are
 * separated by rhythm — 24px between two rows against 4px inside one — and the
 * hairline that used to sit between them was the last edge in a product that
 * banned borders and shadows everywhere else. It was also asymmetric: inset past
 * the glyph on the left, flush to the card on the right, which is what made
 * every list look hand-assembled.
 *
 * ⚠️ THE WAY IT COMES BACK IS A SCREEN THAT WANTS TO SEPARATE TWO THINGS and
 * reaches for the library's `Separator`, which is right there and looks like the
 * answer. The answer is a second `Group`. `@engine/design` still uses it where a
 * divider is genuinely structural — a menu's sections, the shell's rails — and
 * those are not screens.
 */
let hairlines = 0;
for (const file of SCREENS) {
  const src = strip(readFileSync(file, "utf8"));
  if (!/<Separator\b/.test(src)) continue;
  hairlines++;
  fail(`${rel(file)}: draws a hairline between rows.\n`
    + `       Two runs in one card is two cards. The gap says it at every size and\n`
    + `       has nothing to align to (DESIGN.md §5).`);
}
if (!hairlines) ok(`hairlines: no screen draws one`);

/* ------------------------------------------------- a comment that renders --- */

/**
 * ⚠️ A BLOCK COMMENT IN A JSX CHILDREN POSITION IS TEXT ON THE PAGE. `{/* … *\/}`
 * is a comment; `/* … *\/` between two tags is a paragraph, and it renders —
 * warning triangle, backticks, the word "⚠️" at body size — right under the
 * screen's own heading. It compiles, it typechecks, every test passes, and it is
 * only visible to somebody who LOOKS at the page. The operator's Ground screen
 * shipped four lines of design rationale to production this way.
 *
 * ⚠️ THE TELL IS WHAT PRECEDES IT. In a statement position a comment follows
 * `;`, `{`, `}`, `)` or `,`; in a children position it follows the `>` that
 * closed a tag. `=>` is the one `>` that is not a tag, and it is excluded by
 * name rather than by luck.
 */
let leaked = 0;
for (const file of [...SCREENS, ...filesIn("design/src")]) {
  const src = readFileSync(file, "utf8");
  for (const at of [...src.matchAll(/\/\*/g)].map((m) => m.index)) {
    let i = at - 1;
    while (i >= 0 && /\s/.test(src[i])) i--;
    if (src[i] !== ">" || src[i - 1] === "=") continue;
    leaked++;
    const line = src.slice(0, at).split("\n").length;
    fail(`${rel(file)}:${line}: a block comment in a JSX children position.\n`
      + `       It is not a comment there — it is TEXT, and it renders on the page\n`
      + `       under the heading. Wrap it: \`{/* … */}\`.`);
  }
}
if (!leaked) ok(`comments: none renders as text`);

/* --------------------------------------------------- nothing sits loose --- */

/**
 * ⚠️ A FILE THAT LANDS AT THE ROOT OF `design/src` IS A FILE NOBODY CLASSIFIED, and
 * that is how a flat package comes back one file at a time. The five directories
 * each answer a question (see `design/README.md`) — is it a value, does it wrap a
 * screen, could any app use it, does it take a declaration, is it data — and a
 * file with no answer is one whose author did not ask.
 *
 * ⚠️ THE BARREL IS THE ONE EXCEPTION, because it is the package's public surface
 * and belongs to none of the five.
 */
const HOMES = ["tokens", "frame", "parts", "rendered", "chart"];
const loose = readdirSync(join(ENGINE, "design/src"), { withFileTypes: true })
  .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && e.name !== "index.ts")
  .map((e) => e.name);
if (loose.length) {
  for (const name of loose) {
    fail(`design/src/${name}: sits outside every directory.\n`
      + `       Put it in one of ${HOMES.join(", ")} — each answers a question about\n`
      + `       what the file IS (design/README.md). A file at the root is one nobody\n`
      + `       classified, and that is how a flat package comes back.`);
  }
} else {
  ok(`homes: every file is in one of ${HOMES.length}`);
}

/* ------------------------------------------- the shape table is the system --- */

/**
 * ⚠️ THE PRESETS ARE CHECKED AS A SET, because the value of a preset system is
 * that a screen's author has somewhere to LAND. Below about six kinds of page
 * the honest answer to "which shape is this" is "none of them", and the next
 * screen is hand-built with the whole argument re-run.
 */
const screenSrc = readFileSync(join(ENGINE, "design/src/frame/screen.tsx"), "utf8");
const shapes = [...screenSrc.matchAll(/^  (\w+): \{ width:/gm)].map((m) => m[1]);
if (shapes.length < 6) {
  fail(`design/src/frame/screen.tsx: only ${shapes.length} shapes.\n`
    + `       A preset system somebody cannot find their page in is one they opt\n`
    + `       out of, and the screen after that is hand-built again.`);
} else {
  ok(`shapes: ${shapes.join(", ")}`);
}

/* ⚠️ Every shape a screen names must be one the table defines — a typo'd shape
   is a TypeScript error today and a runtime lookup tomorrow if the type ever
   widens, and this costs nothing. */
let unknown = 0;
for (const file of SCREENS) {
  const src = strip(readFileSync(file, "utf8"));
  for (const [, named] of src.matchAll(/shape="(\w+)"/g)) {
    if (shapes.includes(named)) continue;
    unknown++;
    fail(`${rel(file)}: names shape "${named}", which the table does not define.`);
  }
}
if (!unknown) ok(`named: every shape a screen asks for exists`);

console.log(bad
  ? `\nshape: ${bad} screen(s) laying themselves out.`
  : `\nshape: every screen declares one, and the shape places the action.`);
process.exit(bad ? 1 : 0);
