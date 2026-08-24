/**
 * A MARK THAT HAS A CHARACTER IS NEVER DRAWN WITHOUT IT.
 *
 * @design every mark in the registry is animated or deliberately still, and no screen draws a registered mark itself.
 *
 * ⚠️ AN ANIMATED BELL AND A STILL ONE ARE THE SAME PICTURE UNTIL SOMEBODY
 * TOUCHES THEM, which is what makes this worth a guard rather than a review
 * note. Two screens imported `BellRing` straight from lucide and drew a mark
 * that did nothing; every other bell in the product rang. Nothing was broken,
 * nothing looked wrong, and the inconsistency was only reachable by pressing.
 *
 * ⚠️ SO THE REGISTRY IS THE ONLY DOOR. `glyphOf` wraps every mark in `Glyph`,
 * which is what carries the character and the reduced-motion opt-outs — a
 * component importing an icon directly gets none of that, and gets it silently.
 *
 * ⚠️ AND EVERY MARK IN THE REGISTRY IS ACCOUNTED FOR. A name with no entry in
 * `LIVELY` is indistinguishable from one somebody forgot, so a mark that is
 * deliberately still has to say so in `STILL`. The count can only be argued
 * with in review, which is the point.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { appDirs, appManifests, appTrees } from "./lib/trees.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENGINE = join(HERE, "..");

let bad = 0;
const fail = (m) => { console.error(`BAD  ${m}`); bad++; };
const ok = (m) => console.log(`ok   ${m}`);
const rel = (p) => p.slice(ENGINE.length + 1);

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/^(\s*)\/\/.*$/gm, "$1");

const filesIn = (dir) => {
  const at = join(ENGINE, dir);
  if (!existsSync(at)) return [];
  const out = [];
  const walk = (path) => {
    for (const e of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, e.name);
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) out.push(full);
    }
  };
  walk(at);
  return out;
};

/** ⚠️ The one file that may name an icon — it is the registry. */
const HOME = "design/src/frame/shell.tsx";
const SHELL = strip(readFileSync(join(ENGINE, HOME), "utf8"));

/* ------------------------------------------------------------------ named --- */

const between = (src, open, close) => {
  const at = src.indexOf(open);
  if (at < 0) return "";
  return src.slice(at, src.indexOf(close, at));
};

const GLYPHS = new Set(
  [...between(SHELL, "const GLYPHS:", "\n};").matchAll(/(?:^|[\s,{])"?([\w-]+)"?:\s*</g)]
    .map((m) => m[1]));
const LIVELY = new Set(
  [...between(SHELL, "export const LIVELY:", "\n};").matchAll(/"?([\w-]+)"?:\s*"/g)]
    .map((m) => m[1]));
/* ⚠️ It closes on its own line, so the terminator is `];` rather than `\n];` —
   the first version read to the next line-initial `];` in the file and reported
   nineteen still marks, which would have excused fourteen real omissions. */
const STILL = new Set(
  [...between(SHELL, "export const STILL:", "];").matchAll(/"([\w-]+)"/g)].map((m) => m[1]));

if (GLYPHS.size < 10) fail(`${HOME}: read ${GLYPHS.size} glyph(s) — this guard is parsing the wrong thing.`);

/* ----------------------------------------------------------- accounted for --- */

const orphans = [...GLYPHS].filter((n) => !LIVELY.has(n) && !STILL.has(n));
if (orphans.length) {
  fail(`${HOME}: ${orphans.length} mark(s) with no character and no exemption: ${orphans.join(", ")}.\n`
    + `       Give each one an entry in \`LIVELY\`, or name it in \`STILL\` on purpose.\n`
    + `       A mark that is merely missing from both reads exactly like one forgotten.`);
} else {
  ok(`every mark is animated or deliberately still (${LIVELY.size} lively, ${STILL.size} still)`);
}

/* ------------------------------------------------------- one door for icons --- */

/**
 * ⚠️ ONLY THE MARKS THAT HAVE A CHARACTER, and the narrowing is the rule rather
 * than a concession. A still mark drawn directly is the same picture as one
 * drawn through the registry — there is nothing to lose — so refusing it would
 * be a rule about imports rather than about what somebody sees. `Circle` is the
 * neutral fallback and `state.tsx` draws it itself, which is correct.
 *
 * ⚠️ AND IT IS DERIVED FROM THE MAP, not listed here. A list would stop covering
 * the icon added next week, which is the one somebody is in a hurry about — the
 * same failure this guard is about, one level up.
 */
const KNOWN = new Set();
for (const m of between(SHELL, "const GLYPHS:", "\n};").matchAll(/"?([\w-]+)"?:\s*<(\w+)\s?\/>/g)) {
  if (LIVELY.has(m[1])) KNOWN.add(m[2]);
}

let looked = 0;
let stolen = 0;
for (const file of [...filesIn("design/src"), ...filesIn("one-space/src"), ...filesIn("apps")]) {
  if (rel(file) === HOME || /\.test\.tsx?$/.test(file)) continue;
  looked++;
  const src = strip(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"lucide-react"/g)) {
    for (const one of m[1].split(",")) {
      const name = one.trim().split(/\s+as\s+/)[0];
      if (!KNOWN.has(name)) continue;
      stolen++;
      const line = src.slice(0, m.index).split("\n").length;
      fail(`${rel(file)}:${line} imports \`${name}\` straight from lucide.\n`
        + `       The registry already draws it, so this is the same picture without\n`
        + `       the character or the reduced-motion opt-outs — and the difference\n`
        + `       is only visible to somebody who presses it. Use \`glyphOf\`.`);
    }
  }
}
if (!stolen) ok(`no screen draws a registered mark itself (${looked} files, ${KNOWN.size} registered icons)`);

/* ------------------------------------------------- and it comes back to rest --- */

/**
 * ⚠️ A PRESS IS A MOMENT, NOT A STATE CHANGE, AND THIS IS THE GUARD FOR THE ONE
 * FAULT THAT MADE THE WHOLE VOCABULARY READ AS BROKEN. Every whole-mark character
 * was `animation: … both`, and `both` HOLDS the last keyframe after the animation
 * ends — so `glyph-turn`, which went `to { rotate(60deg) }`, left a cog sitting
 * permanently sixty degrees off-axis. A coin was left mirrored (`rotateY(180deg)`),
 * a star upside down. Beside three identical marks nobody had touched.
 *
 * ⚠️ AND THE SECOND PRESS LOOKED LIKE NOTHING HAPPENED, which is what was
 * actually reported. The mark is already at the end state, so it re-runs an
 * animation from 0 to a value it is showing.
 *
 * ⚠️ SO: THE LAST KEYFRAME OF EVERY GLYPH ANIMATION RESTORES THE RESTING STATE.
 * Checked as `100%`/`to` matching the `0%`/`from`, because that is what "returns"
 * means and it is the only part of it a reader can verify without a browser.
 */
{
  const motion = readFileSync(join(ENGINE, "design/src/tokens/motion.ts"), "utf8");

  /* ⚠️ `both` and `forwards` are the fill modes that HOLD. `backwards` only
     affects the delay before it starts, which is what these want. */
  const holds = [...motion.matchAll(/animation: (glyph-[\w-]+)[^`]*?\b(both|forwards)\b/g)];
  if (holds.length) {
    for (const [, name, mode] of holds) {
      fail(`design/src/tokens/motion.ts: \`${name}\` is \`${mode}\`, so it HOLDS its last\n`
        + `       frame. A mark left rotated, mirrored or scaled after one press is a mark\n`
        + `       that now looks different from every other copy of itself on the screen —\n`
        + `       and the next press animates to a value it is already showing.`);
    }
  } else {
    ok(`resting: no glyph animation holds its last frame`);
  }

  /*
    ⚠️ AND THE LAST KEYFRAME LEAVES NO TRANSFORM ON THE MARK. With the fill mode
    fixed the element reverts to its base style when the animation ends, so a
    final frame holding `rotate(60deg)` is a visible SNAP back to zero — the same
    fault one property over, and the one a reader is most likely to reintroduce
    by writing `to { transform: rotate(90deg) }` because it reads as "turn it".

    ⚠️ A FULL TURN IS THE IDENTITY AND IS ALLOWED, which is exactly why `turn` and
    `flip` are 360 rather than the 60 and 180 that shipped: they land where they
    started, so there is nothing to snap back from.

    ⚠️ WHAT IS *NOT* CHECKED IS THE FIRST FRAME AGAINST THE LAST, and the two
    marks that proved it matter: `glyph-arrive` begins above and invisible and
    ends in place and invisible, and `glyph-draw` begins undrawn and ends drawn
    because DRAWN is the tick's resting state. A check comparing the two ends
    would refuse both and be wrong about both.
  */
  const IDENTITY =
    /^(none|translate[XY]?\(0(px)?(,\s*0(px)?)?\)|rotate[XYZ]?\(0(deg)?\)|rotate[XYZ]?\(360deg\)|scale[XY]?\(1\)|skew[XY]?\(0(deg)?\)|\s)+$/;

  /*
    ⚠️ EACH BLOCK IS CUT AT THE NEXT `@keyframes`, NOT MATCHED WITH A LAZY
    `[\s\S]*?`. The first version of this walk did the latter and attributed one
    animation's last frame to the animation before it — so it reported two
    failures that were the same correct keyframe read under two names, which is a
    guard finding a bug in itself before it finds one in the code.
  */
  const blocks = motion.split("@keyframes ").slice(1);
  let stuck = 0;
  let landed = 0;

  for (const raw of blocks) {
    const name = /^(glyph-[\w-]+)/.exec(raw)?.[1];
    if (!name) continue;
    landed++;
    /* Everything up to the rules — the last `100%` or `to` stop in this block. */
    const body = raw.split("\n[data-glyph")[0];
    const last = [...body.matchAll(/(?:100%|to)[^{]*\{([^}]*)\}/g)].at(-1)?.[1];
    if (last === undefined) continue;
    const move = /transform:\s*([^;}]*)/.exec(last)?.[1]?.trim();
    if (move === undefined || IDENTITY.test(move)) continue;
    /* ⚠️ AN INVISIBLE ELEMENT CANNOT SNAP, which is the one honest exemption and
       it is about the RULE rather than about a mark. `glyph-page-in` ends where
       it began — below and at zero opacity, mirroring the page going the other
       way — and the resting style is that same zero. Nothing is on screen to
       jump. Refusing it would be the check enforcing its own wording. */
    if (/opacity:\s*0\b/.test(last)) continue;
    stuck++;
    fail(`design/src/tokens/motion.ts: \`${name}\` ends on \`${move}\`.\n`
      + `       The animation does not hold its last frame, so when it finishes the mark\n`
      + `       SNAPS back to zero. Land on the identity — a whole turn is 360, not 60.`);
  }
  if (!stuck) ok(`landing: all ${landed} glyph animation(s) end on the identity`);
}

/* ------------------------------------------------------ one mark, one meaning --- */

/**
 * ⚠️ A SPARKLE MEANS "A MODEL MADE THIS", AND FOR A WHILE IT MEANT FIVE THINGS.
 * It was on a sync button, on a model FAULT, on a refusal to index, on a list of
 * feature flags and on a screen about wording — so the rows that had nothing to
 * do with generation claimed they did, and the ones that did say so said nothing,
 * because the mark had stopped carrying a meaning.
 *
 * ⚠️ RESERVED RATHER THAN COUNTED, because "how many meanings does this mark
 * serve" is not a question source can answer. The list can only SHRINK: a fifth
 * caller is a deliberate edit here, in review, where somebody has to say what
 * about it is generated.
 */
{
  const RESERVED = "model";
  const MAY = new Set([
    /* The AI area of the operator console, and the two screens inside it. */
    "one-space/src/space/Console.tsx",
    "one-space/src/console/Ai.tsx",
    /* ⚠️ THE REGISTRY ITSELF, which names every mark including this one. */
    "design/src/frame/shell.tsx",
    "one-space/src/console/Actions.tsx",
    /* A note about what a DRAFT cost — the credits a model spent. */
    "ground/src/screens/Note.tsx",
    /*
      ⚠️ ONEINVENTORY'S THREE, AND ALL THREE MEAN EXACTLY WHAT THE MARK MEANS.
      `Ask` is a screen whose entire content a model wrote, so its nav entry
      carries it; `Scan` heads the suggestion card with it, because a filled-in
      product one press from being recorded has to say where the filling came
      from. The manifest names it for the nav.
    */
    "apps/inventory/src/index.ts",
    "apps/inventory/src/screens/Ask.tsx",
    "apps/inventory/src/screens/Scan.tsx",
    /* And `Receive`, over the lines a model read off a photographed page. */
    "apps/inventory/src/screens/Receive.tsx",
    /*
      ⚠️ AND `Register`, ONCE, OVER A FORM A MODEL FILLED IN FROM PHOTOGRAPHS.
      It is the same claim `Scan` makes and it is made in the same place — one
      line above the fields, rather than a badge per row, because a mark on
      everything a model touched is texture and this one has to be read.
    */
    "apps/inventory/src/screens/Register.tsx",
  ]);

  let uses = 0;
  let claimed = 0;
  for (const file of [...filesIn("design/src"), ...filesIn("one-space/src"), ...filesIn("apps")]) {
    if (/\.test\.tsx?$/.test(file)) continue;
    const src = readFileSync(file, "utf8");
    if (!new RegExp(`["'\`]${RESERVED}["'\`]`).test(src)) continue;
    /* The scene family of the same name is a star in a sky, not a mark. */
    if (/scene\//.test(rel(file))) continue;
    uses++;
    if (!MAY.has(rel(file))) {
      claimed++;
      fail(`${rel(file)}: names the reserved mark \`${RESERVED}\`.\n`
        + `       It means "a model made this" and nothing else. A sync, a fault, a flag and\n`
        + `       a screen about wording each have their own mark — give this one the mark\n`
        + `       for what it actually is, or add the file here and say why.`);
    }
  }
  if (!claimed) ok(`reserved: \`${RESERVED}\` is used in ${uses} place(s), all about generation`);
}

/* --------------------------------------------------------------- distinct --- */

/** Every app's manifest, which is where a screen declares its mark. */
const apps = appManifests();

/**
 * ⚠️ NO TWO NAV-VISIBLE SCREENS OF ONE APP WEAR THE SAME MARK. The bar's whole
 * job is answering "where am I" and "where can I go" without words — two
 * identical glyphs in it defeat both, and the person pressing one of them cannot
 * know which they got. OneInventory shipped two: `Receive` and `Import` were
 * both `add`, so the phone bar drew a plus at slot three and another at slot
 * five; `Stock` and `Suppliers` were both `box`.
 *
 * ⚠️ IT IS ONLY THE NAV-VISIBLE ONES, and that is the whole subtlety. A detail
 * screen never appears beside anything — a product's own page may wear `box`
 * while Stock does, because the two are never in one row of marks. Refusing
 * every reuse would push apps toward marks that fit worse for no gain.
 *
 * ⚠️ AND IT IS DERIVED FROM THE MANIFEST, so app number three is asked the same
 * question on the day it is registered rather than the day somebody photographs
 * its nav.
 */
{
  const screens = /\{\s*id:\s*["'`]([\w-]+)["'`][^}]*?\}/g;
  let clashed = 0;
  let checked = 0;
  for (const [name, file] of apps) {
    let src = "";
    try { src = strip(readFileSync(file, "utf8")); } catch { continue; }
    const seen = new Map();
    for (const [whole, id] of src.matchAll(screens)) {
      const nav = /nav:\s*["'`](\w+)["'`]/.exec(whole);
      if (!nav || nav[1] === "none") continue;
      const route = /route:\s*["'`][^"'`]*["'`]/.test(whole);
      if (!route) continue;
      const icon = /icon:\s*["'`]([\w-]+)["'`]/.exec(whole);
      const mark = icon ? icon[1] : id;
      checked++;
      const already = seen.get(mark);
      if (already) {
        clashed++;
        fail(`apps/${name}: \`${already}\` and \`${id}\` are both in the nav and both wear \`${mark}\`.\n`
          + `       Two identical marks in one bar cannot say which is which. Give one of them\n`
          + `       its own — \`GLYPH_NAMES\` in ${HOME} is the list.`);
      } else seen.set(mark, id);
    }
  }
  if (!clashed) ok(`distinct: ${checked} nav destination(s) across ${apps.length} app(s), no mark used twice in one bar`);
}

/**
 * BANNED MARKS, AND THE LIST CAN ONLY GROW.
 *
 * ⚠️ A GLYPH GETS BANNED WHEN IT STOPS SAYING ANYTHING. `sparkle` was the one
 * mark meaning "a model made this" and it spread to four screens, two console
 * sections and a nav destination in a fortnight — at which point it was not
 * carrying a meaning, it was carrying enthusiasm. It is also the most worn-out
 * mark in software: it reads as "AI" to whoever drew it and as nothing at all to
 * somebody counting boxes in a cold room. Replaced by `model`, which is literal.
 *
 * ⚠️ THE BAN IS ON THE WHOLE TREE, NOT ON THE REGISTRY. Deleting the entry stops
 * `glyphOf("sparkle")` resolving and does NOT stop anybody importing `Sparkles`
 * from lucide and drawing it directly — which is exactly what the guard above
 * exists to catch for a different reason, and exactly what somebody in a hurry
 * would do. Both doors are checked here.
 *
 * ⚠️ AND IT IS CHECKED IN COMMENTS TOO — ONE FILE EXCEPTED. A banned name left
 * in prose is the next person's permission slip. `shell.tsx` is where the ban is
 * written down and has to be able to name what it banned.
 */
{
  const BANNED = [
    { name: "sparkle", icon: "Sparkles", instead: "`model`, or the noun the row is actually about" },
  ];
  const EXCUSED = ["design/src/frame/shell.tsx", "engine/scripts/glyphs.test.mjs"];
  let found = 0;
  const tree = [
    ...filesIn("design/src"),
    ...filesIn("one-space/src"),
    /* ⚠️ THE PROVING GROUND TOO. It is not a product, and it is where most of
       the design system is actually drawn — a banned mark surviving there is a
       banned mark the next screen copies. It held one. */
    ...filesIn("ground/src"),
    ...appDirs().flatMap((d) => filesIn(d)),
  ];
  for (const file of tree) {
    const where = rel(file);
    if (EXCUSED.some((e) => where.endsWith(e) || where === e)) continue;
    let src = "";
    try { src = readFileSync(file, "utf8"); } catch { continue; }
    for (const { name, icon, instead } of BANNED) {
      const asName = new RegExp(`\\b${name}\\b`, "i").test(src);
      const asIcon = new RegExp(`\\b${icon}\\b`).test(src);
      if (!asName && !asIcon) continue;
      found++;
      fail(`${where}: draws or names the banned mark \`${name}\`.\n`
        + `       It stopped meaning anything — use ${instead}.`);
    }
  }
  if (!found) ok(`banned: ${BANNED.length} retired mark(s), none drawn or named across ${tree.length} file(s)`);
}

process.exit(bad ? 1 : 0);
